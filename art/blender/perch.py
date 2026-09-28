import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import kit

OUT = os.environ.get("OUT", os.path.join(HERE, "..", "raster", "perch-render.png"))
WIDTH, HEIGHT = 700, 620
GRASS = int(os.environ.get("GRASS", "90000"))

random.seed(2718)
scene = kit.setup(WIDTH, HEIGHT)
kit.sky(scene)
cam, half_v, pitch = kit.camera((0.0, -13.0, 2.4), 35.0, WIDTH, HEIGHT, 0.70)


def terrain_height(x, y):
    h = 1.9 * math.exp(-(x * x) / 70.0 - (y * y) / 45.0)
    h += 0.6 * math.sin(x * 0.12 + 0.4) * math.cos(y * 0.09)
    h += 3.4 * math.exp(-((x + 22.0) ** 2) / 260.0 - ((y - 40.0) ** 2) / 500.0)
    h += 2.8 * math.exp(-((x - 30.0) ** 2) / 420.0 - ((y - 60.0) ** 2) / 700.0)
    coast = 1.0 / (1.0 + math.exp(-(y - 160.0) / 10.0))
    return h * (1.0 - coast) + 0.4 * (1.0 - coast) - coast * 3.0


bm = bmesh.new()
nx, ny = 280, 260
rows = []
for j in range(ny + 1):
    row = []
    for i in range(nx + 1):
        x = (i / nx - 0.5) * 420.0
        y = -16.0 + (j / ny) ** 1.8 * 260.0
        row.append(bm.verts.new((x, y, terrain_height(x, y))))
    rows.append(row)
for j in range(ny):
    for i in range(nx):
        bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
bm.normal_update()
terrain = kit.mesh_object("terrain", bm)
kit.smooth(terrain)
ground = kit.gradient_material("ground", (0.12, 0.36, 0.05), (0.30, 0.56, 0.10), -0.5, 3.0, 0.92, "Z", "Object")
terrain.data.materials.append(ground)

sea = kit.material("sea", (0.10, 0.36, 0.60), 0.18)
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
water = kit.mesh_object("sea", bm)
water.scale = (4000.0, 2500.0, 1.0)
water.location = (0.0, 2600.0, -0.4)
water.data.materials.append(sea)

haze = kit.material("haze_island", (0.55, 0.70, 0.82), 1.0)
for cx, cy, width, tall in ((-500.0, 1400.0, 500.0, 90.0), (420.0, 1700.0, 700.0, 120.0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=16, radius=1.0)
    island = kit.mesh_object("island", bm)
    island.scale = (width, width * 0.35, tall)
    island.location = (cx, cy, -tall * 0.35)
    island.data.materials.append(haze)
    kit.smooth(island)

PERCH = Vector((0.0, -2.2, 0.0))
base_z = terrain_height(PERCH.x, PERCH.y)
post_wood = kit.plank_material("post", (0.34, 0.20, 0.10), (0.50, 0.31, 0.16), 5.0, "X")
bar_wood = kit.plank_material("bar", (0.40, 0.24, 0.12), (0.58, 0.37, 0.19), 3.0, "Y")
kit.box("post", (PERCH.x, PERCH.y, base_z + 1.55), (0.26, 0.26, 3.3), post_wood)
kit.box("bar", (PERCH.x, PERCH.y, base_z + 3.14), (2.3, 0.24, 0.18), bar_wood)
for side in (-1.0, 1.0):
    brace = kit.box("brace", (PERCH.x + side * 0.42, PERCH.y, base_z + 2.78), (0.95, 0.12, 0.12), post_wood)
    brace.rotation_euler = (0.0, side * math.radians(38.0), 0.0)
kit.box("cap", (PERCH.x, PERCH.y, base_z + 3.27), (0.34, 0.34, 0.08), post_wood)

feather = kit.gradient_material("feather", (0.80, 0.78, 0.72), (1.0, 0.99, 0.95), -0.2, 0.2, 0.6, "Y", "Object")
feather.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (1.0, 0.98, 0.94, 1.0)
feather.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 0.45
for k, (x, z, tilt, turn) in enumerate(((-1.25, 2.45, 34.0, 20.0), (1.45, 2.9, -28.0, -35.0), (2.05, 1.95, 52.0, 60.0))):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.0)
    for vert in bm.verts:
        vert.co.y += 0.35 * vert.co.x * vert.co.x
    plume = kit.mesh_object(f"feather_{k}", bm)
    plume.scale = (0.1, 0.52, 0.026)
    plume.location = (PERCH.x + x, PERCH.y - 0.4, base_z + z)
    plume.rotation_euler = (math.radians(tilt), math.radians(12.0), math.radians(turn))
    plume.data.materials.append(feather)
    kit.smooth(plume)

tree_protos = kit.tree_prototypes()
for proto, x, y, scale in ((tree_protos[1], -21.0, 38.0, 0.9), (tree_protos[0], 28.0, 58.0, 0.7), (tree_protos[2], -40.0, 70.0, 0.6)):
    kit.instance(proto, (x, y, terrain_height(x, y) - 0.3), scale, random.uniform(0, math.tau))
for k, (x, y, r) in enumerate(((-4.8, 3.0, 0.9), (5.2, 5.5, 0.7), (-9.0, 12.0, 1.1))):
    kit.bush(f"bush_{k}", r, 50 + k).location = (x, y, terrain_height(x, y) - 0.1)

kit.key_light(55.0, -28.0, 3.6)
kit.sun_disc(cam, 0.79, 0.18, 900.0, 95.0)
for k, (u, v, width, dist) in enumerate(((0.21, 0.23, 1.0, 700.0), (0.62, 0.37, 0.75, 820.0), (0.93, 0.47, 0.5, 880.0))):
    kit.cloud(f"cloud_{k}", kit.point_at(cam, u, v, dist), width * dist / 13.0, 700 + k)

bm = bmesh.new()
grid = []
for r in range(61):
    v = 0.715 + (1.06 - 0.715) * (r / 60) ** 0.8
    grid.append([])
    for c in range(81):
        hit = kit.ground_hit(cam, terrain_height, -0.06 + 1.12 * c / 80, v)
        grid[-1].append(bm.verts.new((hit.x, hit.y, terrain_height(hit.x, hit.y) + 0.02)))
for r in range(60):
    for c in range(80):
        quad = (grid[r][c], grid[r + 1][c], grid[r + 1][c + 1], grid[r][c + 1])
        if max((vert.co - cam.location).length for vert in quad) > 60.0:
            continue
        if min(math.hypot(vert.co.x - PERCH.x, vert.co.y - PERCH.y) for vert in quad) < 1.3:
            continue
        bm.faces.new(quad)
field = kit.mesh_object("meadow", bm)
kit.meadow(field, GRASS, 0.5, None, 0.01)

kit.render(scene, OUT)

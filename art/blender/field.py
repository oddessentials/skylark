import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import kit

OUT = os.environ.get("OUT", os.path.join(HERE, "..", "raster", "field-render.png"))
WIDTH, HEIGHT = 1600, 900
GRASS = int(os.environ.get("GRASS", "220000"))

ANCHORS = {
    "sun": (0.749, 0.167),
    "pond": (0.8125, 0.858),
    "fall": (0.917, 0.794),
    "lantern": (0.042, 0.736),
    "window": (0.120, 0.719),
    "horizon": (0.5, 0.63),
}

random.seed(1729)
scene = kit.setup(WIDTH, HEIGHT)
kit.sky(scene)
cam, half_v, pitch = kit.camera((0.0, -40.0, float(os.environ.get("CAMERA_Z", "12.0"))), 32.0, WIDTH, HEIGHT, ANCHORS["horizon"][1])


def hills(x, y):
    h = 1.6 * math.sin(x * 0.045 + 0.6) * math.cos(y * 0.038 - 0.4)
    h += 1.1 * math.sin(x * 0.11 + y * 0.07 + 1.3)
    h += 0.5 * math.sin(x * 0.23 - y * 0.19 + 2.1)
    h += 2.4 * math.exp(-((x + 28.0) ** 2) / 420.0 - ((y - 6.0) ** 2) / 900.0)
    h += 3.2 * math.exp(-((x - 44.0) ** 2) / 300.0 - ((y - 40.0) ** 2) / 500.0)
    h += 5.2 * math.exp(-((x + 110.0) ** 2) / 9000.0 - ((y - 230.0) ** 2) / 3000.0)
    h += 4.0 * math.exp(-((x - 60.0) ** 2) / 6000.0 - ((y - 250.0) ** 2) / 2500.0)
    h += 3.6 * math.exp(-((x - 190.0) ** 2) / 8000.0 - ((y - 215.0) ** 2) / 2500.0)
    return h


POND_CENTER = Vector((0.0, 0.0))
POND_RADII = (1.0, 1.0)
POND_LEVEL = 0.0
CABIN_PAD = None


def terrain_height(x, y):
    h = hills(x, y)
    coast = 1.0 / (1.0 + math.exp(-(y - 330.0) / 16.0))
    h = h * (1.0 - coast) - coast * 4.0 + 1.2 * (1.0 - coast)
    dx = (x - POND_CENTER.x) / POND_RADII[0]
    dy = (y - POND_CENTER.y) / POND_RADII[1]
    d = math.sqrt(dx * dx + dy * dy)
    if d < 2.2:
        inside = 1.0 / (1.0 + math.exp((d - 1.0) * 14.0))
        bank = max(0.0, min(1.0, (d - 1.0) / 0.9))
        shore = POND_LEVEL + 0.12 + bank * 0.35
        h = h * bank + shore * (1.0 - bank)
        h = h * (1.0 - inside) + (POND_LEVEL - 0.6 - 0.6 * max(0.0, 1.0 - d)) * inside
    if CABIN_PAD is not None:
        px, py, top, radius = CABIN_PAD
        reach = math.hypot(x - px, y - py) / radius
        if reach < 3.2:
            w = max(0.0, min(1.0, (3.2 - reach) / 2.2))
            w = w * w * (3.0 - 2.0 * w)
            h = h * (1.0 - w) + top * w
    return h


def ground_hit(u, v, height=None):
    level = terrain_height if height is None else (lambda x, y: height)
    return kit.ground_hit(cam, level, u, v)


guess = ground_hit(*ANCHORS["pond"], height=0.0)
POND_CENTER = Vector((guess.x, guess.y))
POND_RADII = (9.6, 9.4)
POND_LEVEL = hills(guess.x, guess.y) - 0.35
pond_hit = ground_hit(*ANCHORS["pond"], height=POND_LEVEL)
POND_CENTER = Vector((pond_hit.x, pond_hit.y))
print("POND", tuple(round(c, 2) for c in POND_CENTER), round(POND_LEVEL, 2))

cabin_distance = float(os.environ.get("CABIN_DISTANCE", "40.0"))
spin = math.radians(-16.0)
win_origin, win_dir = kit.ray(cam, *ANCHORS["window"])
window_point = win_origin + win_dir * cabin_distance
cabin_size = Vector((4.8, 4.4, 3.4))
cabin_center = window_point + kit.rotate(Vector((0.7, cabin_size.y / 2.0, 0.35)), spin)
deck_center = cabin_center + kit.rotate(Vector((-1.2, -0.9, -cabin_size.z / 2.0 - 0.2)), spin)
deck_size = Vector((8.4, 7.2, 0.4))
CABIN_PAD = (deck_center.x, deck_center.y, deck_center.z - 2.4, 6.5)
print("CABIN", tuple(round(c, 2) for c in cabin_center))

bm = bmesh.new()
size_x, size_y = 900.0, 520.0
nx, ny = 640, 460
rows = []
for j in range(ny + 1):
    row = []
    for i in range(nx + 1):
        x = (i / nx - 0.5) * size_x
        y = -30.0 + (j / ny) ** 1.7 * size_y
        row.append(bm.verts.new((x, y, terrain_height(x, y))))
    rows.append(row)
for j in range(ny):
    for i in range(nx):
        bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
bm.normal_update()
terrain = kit.mesh_object("terrain", bm)
kit.smooth(terrain)

ground = bpy.data.materials.new("ground")
ground.use_nodes = True
gn = ground.node_tree.nodes
gl = ground.node_tree.links
gb = gn["Principled BSDF"]
gb.inputs["Roughness"].default_value = 0.92
g_coords = gn.new("ShaderNodeTexCoord")
g_noise = gn.new("ShaderNodeTexNoise")
g_noise.inputs["Scale"].default_value = 0.035
g_noise.inputs["Detail"].default_value = 4.0
gl.new(g_coords.outputs["Object"], g_noise.inputs["Vector"])
g_streak = gn.new("ShaderNodeTexWave")
g_streak.wave_type = "BANDS"
g_streak.bands_direction = "X"
g_streak.inputs["Scale"].default_value = 3.0
g_streak.inputs["Distortion"].default_value = 14.0
g_streak.inputs["Detail"].default_value = 4.0
g_streak_map = gn.new("ShaderNodeMapping")
g_streak_map.inputs["Scale"].default_value = (1.0, 0.18, 1.0)
gl.new(g_coords.outputs["Object"], g_streak_map.inputs["Vector"])
gl.new(g_streak_map.outputs["Vector"], g_streak.inputs["Vector"])
g_blend = gn.new("ShaderNodeMath")
g_blend.operation = "MULTIPLY_ADD"
g_blend.inputs[1].default_value = 0.22
gl.new(g_streak.outputs["Fac"], g_blend.inputs[0])
gl.new(g_noise.outputs["Fac"], g_blend.inputs[2])
g_ramp = gn.new("ShaderNodeValToRGB")
g_ramp.color_ramp.elements[0].position = 0.35
g_ramp.color_ramp.elements[0].color = (0.11, 0.34, 0.05, 1.0)
g_ramp.color_ramp.elements[1].position = 0.7
g_ramp.color_ramp.elements[1].color = (0.30, 0.56, 0.10, 1.0)
gl.new(g_blend.outputs["Value"], g_ramp.inputs["Fac"])
g_geo = gn.new("ShaderNodeNewGeometry")
g_offset = gn.new("ShaderNodeVectorMath")
g_offset.operation = "SUBTRACT"
g_offset.inputs[1].default_value = (POND_CENTER.x, POND_CENTER.y, 0.0)
gl.new(g_geo.outputs["Position"], g_offset.inputs[0])
g_stretch = gn.new("ShaderNodeVectorMath")
g_stretch.operation = "MULTIPLY"
g_stretch.inputs[1].default_value = (1.0 / POND_RADII[0], 1.0 / POND_RADII[1], 0.0)
gl.new(g_offset.outputs["Vector"], g_stretch.inputs[0])
g_reach = gn.new("ShaderNodeVectorMath")
g_reach.operation = "LENGTH"
gl.new(g_stretch.outputs["Vector"], g_reach.inputs[0])
g_shore = gn.new("ShaderNodeMapRange")
g_shore.inputs["From Min"].default_value = 1.0
g_shore.inputs["From Max"].default_value = 1.32
gl.new(g_reach.outputs["Value"], g_shore.inputs["Value"])
g_invert = gn.new("ShaderNodeMath")
g_invert.operation = "SUBTRACT"
g_invert.inputs[0].default_value = 1.0
gl.new(g_shore.outputs["Result"], g_invert.inputs[1])
g_mix = gn.new("ShaderNodeMix")
g_mix.data_type = "RGBA"
g_mix.inputs["B"].default_value = (0.42, 0.34, 0.20, 1.0)
gl.new(g_invert.outputs["Value"], g_mix.inputs["Factor"])
gl.new(g_ramp.outputs["Color"], g_mix.inputs["A"])
gl.new(g_mix.outputs["Result"], gb.inputs["Base Color"])
terrain.data.materials.append(ground)

water = bpy.data.materials.new("water")
water.use_nodes = True
wnodes = water.node_tree.nodes
wlinks = water.node_tree.links
wb = wnodes["Principled BSDF"]
wb.inputs["Base Color"].default_value = (0.05, 0.28, 0.52, 1.0)
wb.inputs["Roughness"].default_value = 0.06
wb.inputs["IOR"].default_value = 1.33
w_noise = wnodes.new("ShaderNodeTexNoise")
w_noise.inputs["Scale"].default_value = 3.0
w_noise.inputs["Detail"].default_value = 2.0
w_coords = wnodes.new("ShaderNodeTexCoord")
w_mapping = wnodes.new("ShaderNodeMapping")
w_mapping.inputs["Scale"].default_value = (1.0, 5.0, 1.0)
wlinks.new(w_coords.outputs["Object"], w_mapping.inputs["Vector"])
wlinks.new(w_mapping.outputs["Vector"], w_noise.inputs["Vector"])
w_bump = wnodes.new("ShaderNodeBump")
w_bump.inputs["Strength"].default_value = 0.06
wlinks.new(w_noise.outputs["Fac"], w_bump.inputs["Height"])
wlinks.new(w_bump.outputs["Normal"], wb.inputs["Normal"])

bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, radius=1.0, segments=96)
pond = kit.mesh_object("pond", bm)
pond.scale = (POND_RADII[0] * 1.16, POND_RADII[1] * 1.16, 1.0)
pond.location = (POND_CENTER.x, POND_CENTER.y, POND_LEVEL)
pond.data.materials.append(water)

sea_mat = kit.material("sea", (0.10, 0.36, 0.60), 0.18)
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
sea = kit.mesh_object("sea", bm)
sea.scale = (5000.0, 2900.0, 1.0)
sea.location = (0.0, 3200.0, -0.4)
sea.data.materials.append(sea_mat)

haze = kit.material("haze_island", (0.55, 0.70, 0.82), 1.0)
for cx, cy, width, tall in ((-1100.0, 2300.0, 800.0, 150.0), (350.0, 2700.0, 1000.0, 210.0), (1500.0, 2250.0, 600.0, 130.0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=16, radius=1.0)
    island = kit.mesh_object("island", bm)
    island.scale = (width, width * 0.35, tall)
    island.location = (cx, cy, -tall * 0.35)
    island.data.materials.append(haze)
    kit.smooth(island)

tree_protos = kit.tree_prototypes()


def distance_scale(hit, target_px, proto_height):
    distance = (hit - cam.location).length
    angle = target_px / HEIGHT * 2.0 * math.tan(half_v)
    return angle * distance / proto_height


for u, v, px in ((0.265, 0.655, 58), (0.30, 0.665, 70), (0.36, 0.66, 52), (0.415, 0.668, 64), (0.47, 0.662, 50), (0.53, 0.672, 60), (0.585, 0.664, 48), (0.64, 0.67, 62), (0.20, 0.672, 80), (0.705, 0.668, 56)):
    hit = ground_hit(u, v)
    proto = random.choice(tree_protos)
    scale = distance_scale(hit, px, proto.dimensions.z) * random.uniform(0.9, 1.1)
    kit.instance(proto, (hit.x, hit.y, terrain_height(hit.x, hit.y) - 0.3), scale, random.uniform(0, math.tau))

for k, (side, lean, tall) in enumerate(((-1.0, -0.16, 6.2), (1.0, 0.13, 7.4))):
    x = POND_CENTER.x + side * POND_RADII[0] * (0.92 if side < 0 else 1.25)
    y = POND_CENTER.y + (-4.5 if side > 0 else -0.6)
    tree = kit.palm(f"palm_{k}", tall, lean, 9, 40 + k)
    tree.location = (x, y, terrain_height(x, y) - 0.2)
    tree.rotation_euler = (0.0, 0.0, random.uniform(-0.4, 0.4))

for k, (u, v, r) in enumerate(((0.625, 0.905, 0.6), (0.645, 0.92, 0.38), (0.975, 0.935, 0.8), (0.235, 0.96, 0.45))):
    hit = ground_hit(u, v)
    stone = kit.rock(f"rock_{k}", r, k)
    stone.location = (hit.x, hit.y, hit.z - r * 0.15)
    stone.rotation_euler = (0.0, 0.0, random.uniform(0, math.tau))

fall_origin, fall_dir = kit.ray(cam, *ANCHORS["fall"])
back_y = POND_CENTER.y + POND_RADII[1] * 0.85
fall_center = fall_origin + fall_dir * ((back_y - fall_origin.y) / fall_dir.y)
fall_height = max(2.2, min(5.0, 2.0 * (fall_center.z - POND_LEVEL) + 0.4))
fall_top = fall_center.z + fall_height / 2.0
cliff_height = fall_top - POND_LEVEL + 1.4

cliff_mat = kit.gradient_material("cliff", (0.40, 0.33, 0.26), (0.72, 0.64, 0.50), -0.5, 0.5, 0.9, "Z", "Object")
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=1.0, radius2=0.78, depth=1.0)
cliff = kit.mesh_object("cliff", bm)
cliff.scale = (8.0, 5.0, cliff_height * 1.25)
cliff.location = (fall_center.x + 4.2, back_y + 5.3, POND_LEVEL - 1.0 + cliff_height * 1.25 / 2.0)
cliff_sub = cliff.modifiers.new("subdivide", "SUBSURF")
cliff_sub.levels = 3
cliff_sub.render_levels = 3
cliff_sub.subdivision_type = "SIMPLE"
cliff_displace = cliff.modifiers.new("rocky", "DISPLACE")
cliff_displace.texture = kit.noise_texture("cliff_noise", 0.45)
cliff_displace.strength = 0.7
cliff.data.materials.append(cliff_mat)
cliff_top = POND_LEVEL - 1.0 + cliff_height * 1.25 - 0.25
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=12, radius=1.0)
cap = kit.mesh_object("cliff_cap", bm)
cap.scale = (6.9, 4.2, 0.75)
cap.location = (cliff.location.x, cliff.location.y, cliff_top - 0.1)
cap.data.materials.append(kit.material("cliff_grass", (0.20, 0.48, 0.08), 0.9))
kit.smooth(cap)

fall_mat = bpy.data.materials.new("waterfall")
fall_mat.use_nodes = True
fn = fall_mat.node_tree.nodes
fl = fall_mat.node_tree.links
fb = fn["Principled BSDF"]
fb.inputs["Roughness"].default_value = 0.25
f_coords = fn.new("ShaderNodeTexCoord")
f_noise = fn.new("ShaderNodeTexNoise")
f_map = fn.new("ShaderNodeMapping")
f_map.inputs["Scale"].default_value = (18.0, 1.2, 1.0)
fl.new(f_coords.outputs["UV"], f_map.inputs["Vector"])
fl.new(f_map.outputs["Vector"], f_noise.inputs["Vector"])
f_ramp = fn.new("ShaderNodeValToRGB")
f_ramp.color_ramp.elements[0].color = (0.62, 0.84, 0.97, 1.0)
f_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
fl.new(f_noise.outputs["Fac"], f_ramp.inputs["Fac"])
fl.new(f_ramp.outputs["Color"], fb.inputs["Base Color"])
fb.inputs["Emission Strength"].default_value = 0.12
fl.new(f_ramp.outputs["Color"], fb.inputs["Emission Color"])
fall_drop = cliff_top - POND_LEVEL
bm = bmesh.new()
previous = None
for step in range(13):
    t = step / 12
    lip = max(0.0, 1.0 - t * 5.0)
    width = 0.55 + 0.45 * t
    left = bm.verts.new((-width, 0.9 * lip * lip, fall_drop * (1.0 - t)))
    right = bm.verts.new((width, 0.9 * lip * lip, fall_drop * (1.0 - t)))
    if previous:
        bm.faces.new((previous[0], previous[1], right, left))
    previous = (left, right)
bm.normal_update()
waterfall = kit.mesh_object("waterfall", bm)
waterfall.location = (fall_center.x, fall_center.y, POND_LEVEL)
waterfall.data.materials.append(fall_mat)
uv_layer = waterfall.data.uv_layers.new(name="UVMap")
for poly in waterfall.data.polygons:
    for loop_index in poly.loop_indices:
        co = waterfall.data.vertices[waterfall.data.loops[loop_index].vertex_index].co
        uv_layer.data[loop_index].uv = (co.x * 0.5 + 0.5, co.z / fall_drop)
foam_mat = kit.material("foam", (0.95, 0.98, 1.0), 0.5)
for k in range(7):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=random.uniform(0.18, 0.32))
    foam = kit.mesh_object(f"foam_{k}", bm)
    foam.location = (fall_center.x + random.uniform(-0.7, 0.7), fall_center.y - random.uniform(0.0, 0.6), POND_LEVEL + 0.05)
    foam.scale = (1.0, 1.0, 0.45)
    foam.data.materials.append(foam_mat)
    kit.smooth(foam)

wood = kit.plank_material("wood", (0.38, 0.22, 0.11), (0.52, 0.32, 0.16))
wood_dark = kit.material("wood_dark", (0.27, 0.15, 0.07), 0.88)
roof_mat = kit.gradient_material("roof", (0.62, 0.22, 0.10), (0.86, 0.42, 0.22), -1.5, 1.5, 0.7, "Z", "Object")
flag_mat = kit.material("flag", (0.06, 0.55, 0.60), 0.6)
window_mat = kit.emission_material("window", (1.0, 0.78, 0.42), 1.05)
lantern_mat = kit.emission_material("lantern", (1.0, 0.70, 0.30), 1.4)

kit.box("cabin", cabin_center, cabin_size, wood, spin)
kit.box("window", window_point + kit.rotate(Vector((0.0, -0.05, 0.0)), spin), (1.05, 0.1, 1.0), window_mat, spin)
kit.box("window_frame", window_point + kit.rotate(Vector((0.0, 0.02, 0.0)), spin), (1.35, 0.1, 1.3), wood_dark, spin)
kit.box("door", cabin_center + kit.rotate(Vector((-1.5, -cabin_size.y / 2.0 - 0.04, -0.45)), spin), (0.95, 0.1, 2.2), wood_dark, spin)
kit.box("deck", deck_center, deck_size, wood, spin)
for px, py in ((-1, -1), (1, -1), (-1, 1), (1, 1), (0, -1)):
    corner = deck_center + kit.rotate(Vector((px * (deck_size.x / 2.0 - 0.4), py * (deck_size.y / 2.0 - 0.4), 0.0)), spin)
    ground_z = terrain_height(corner.x, corner.y) - 0.4
    top_z = deck_center.z - deck_size.z / 2.0
    kit.box("stilt", (corner.x, corner.y, (top_z + ground_z) / 2.0), (0.42, 0.42, max(0.3, top_z - ground_z)), wood_dark, spin)
kit.box("rail", deck_center + kit.rotate(Vector((0.0, -deck_size.y / 2.0 + 0.15, 0.75)), spin), (deck_size.x - 0.4, 0.14, 0.12), wood_dark, spin)
for k in range(7):
    post = deck_center + kit.rotate(Vector((-deck_size.x / 2.0 + 0.4 + k * (deck_size.x - 0.8) / 6.0, -deck_size.y / 2.0 + 0.15, 0.4)), spin)
    kit.box("rail_post", post, (0.12, 0.12, 0.8), wood_dark, spin)
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=4.4, radius2=0.0, depth=2.6)
roof = kit.mesh_object("roof", bm)
roof.location = (cabin_center.x, cabin_center.y, cabin_center.z + cabin_size.z / 2.0 + 1.25)
roof.rotation_euler = (0.0, 0.0, spin + math.pi / 4.0)
roof.data.materials.append(roof_mat)
apex = Vector((cabin_center.x, cabin_center.y, cabin_center.z + cabin_size.z / 2.0 + 2.55))
kit.box("flagpole", apex + Vector((0.0, 0.0, 0.9)), (0.12, 0.12, 1.9), wood_dark)
bm = bmesh.new()
bm.faces.new((bm.verts.new((0.0, 0.0, 0.0)), bm.verts.new((1.9, 0.0, -0.32)), bm.verts.new((0.0, 0.0, -0.7))))
pennant = kit.mesh_object("pennant", bm)
pennant.location = apex + Vector((0.06, 0.0, 1.8))
pennant.rotation_euler = (0.0, 0.0, math.radians(-8.0))
pennant.data.materials.append(flag_mat)

lan_origin, lan_dir = kit.ray(cam, *ANCHORS["lantern"])
lantern_point = lan_origin + lan_dir * (cabin_distance - 1.6)
post_base = min(terrain_height(lantern_point.x, lantern_point.y), deck_center.z + 0.2)
kit.box("lantern_post", (lantern_point.x, lantern_point.y, (lantern_point.z + post_base) / 2.0 - 0.2), (0.16, 0.16, max(0.4, lantern_point.z - post_base)), wood_dark)
kit.box("lantern_arm", lantern_point + Vector((0.18, 0.0, 0.42)), (0.5, 0.1, 0.1), wood_dark)
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.34)
lantern = kit.mesh_object("lantern", bm)
lantern.location = lantern_point
lantern.scale = (1.0, 1.0, 1.25)
lantern.data.materials.append(lantern_mat)
kit.box("lantern_cap", lantern_point + Vector((0.0, 0.0, 0.5)), (0.62, 0.62, 0.14), wood_dark)
kit.box("lantern_base", lantern_point + Vector((0.0, 0.0, -0.46)), (0.52, 0.52, 0.1), wood_dark)
for fx, fy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
    kit.box("lantern_bar", lantern_point + Vector((fx * 0.26, fy * 0.26, 0.02)), (0.05, 0.05, 0.92), wood_dark)
lamp = bpy.data.lights.new("lantern_light", "POINT")
lamp.energy = 700.0
lamp.color = (1.0, 0.68, 0.32)
lamp.shadow_soft_size = 0.4
kit.link(bpy.data.objects.new("lantern_light", lamp)).location = lantern_point + Vector((0.0, -0.5, 0.0))

kit.key_light()
sun_point = kit.sun_disc(cam, *ANCHORS["sun"])
for k, (u, v, width, dist) in enumerate(((0.11, 0.20, 1.0, 700.0), (0.35, 0.15, 0.8, 800.0), (0.59, 0.23, 0.95, 760.0), (0.47, 0.33, 0.55, 900.0), (0.90, 0.14, 0.85, 820.0), (0.84, 0.36, 0.6, 880.0), (0.06, 0.38, 0.55, 850.0))):
    kit.cloud(f"cloud_{k}", kit.point_at(cam, u, v, dist), width * dist / 17.0, 300 + k)

bm = bmesh.new()
grid = []
for r in range(71):
    v = 0.80 + (1.07 - 0.80) * (r / 70) ** 0.8
    grid.append([])
    for c in range(111):
        hit = ground_hit(-0.07 + 1.14 * c / 110, v)
        grid[-1].append(bm.verts.new((hit.x, hit.y, terrain_height(hit.x, hit.y) + 0.02)))
deck_corners = [deck_center + kit.rotate(Vector((px * deck_size.x / 2.0, py * deck_size.y / 2.0, 0.0)), spin) for px, py in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
deck_min = Vector((min(p.x for p in deck_corners), min(p.y for p in deck_corners), 0.0))
deck_max = Vector((max(p.x for p in deck_corners), max(p.y for p in deck_corners), 0.0))
for r in range(70):
    for c in range(110):
        quad = (grid[r][c], grid[r + 1][c], grid[r + 1][c + 1], grid[r][c + 1])
        cx = sum(vert.co.x for vert in quad) / 4.0
        cy = sum(vert.co.y for vert in quad) / 4.0
        if math.hypot((cx - POND_CENTER.x) / POND_RADII[0], (cy - POND_CENTER.y) / POND_RADII[1]) < 1.12:
            continue
        if deck_min.x < cx < deck_max.x and deck_min.y < cy < deck_max.y:
            continue
        bm.faces.new(quad)
field = kit.mesh_object("meadow", bm)
density = field.vertex_groups.new(name="density")
for vert in field.data.vertices:
    near_pond = math.hypot((vert.co.x - POND_CENTER.x) / POND_RADII[0], (vert.co.y - POND_CENTER.y) / POND_RADII[1])
    weight = max(0.0, min(1.0, (near_pond - 1.15) / 0.9))
    density.add([vert.index], 0.15 + 0.85 * weight * weight, "REPLACE")
kit.meadow(field, GRASS, 1.15, "density")

for k, (u, v, r) in enumerate(((0.235, 0.80, 1.4), (0.195, 0.79, 1.0), (0.66, 0.845, 1.2), (0.955, 0.86, 1.3), (0.30, 0.765, 1.6), (0.73, 0.775, 1.5))):
    hit = ground_hit(u, v)
    kit.bush(f"bush_{k}", r, 90 + k).location = (hit.x, hit.y, hit.z - 0.15)

for k, (u, v, span) in enumerate(((0.355, 0.235, 1.0), (0.385, 0.255, 0.8), (0.415, 0.228, 0.9))):
    kit.bird(f"bird_{k}", kit.point_at(cam, u, v, 300.0), span, pitch)

bpy.context.view_layer.update()
for name, target in (("sun", sun_point), ("pond", Vector((POND_CENTER.x, POND_CENTER.y, POND_LEVEL))), ("fall", fall_center), ("lantern", lantern_point), ("window", window_point)):
    projected = world_to_camera_view(scene, cam, target)
    print("ANCHOR", name, round(projected.x, 3), round(1.0 - projected.y, 3), "want", ANCHORS[name])

kit.render(scene, OUT)

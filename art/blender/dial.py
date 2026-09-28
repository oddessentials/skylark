import math
import os
import sys

import bpy

UNIT = 512.0
R_OUT = 508.0 / UNIT
R_IN = 353.0 / UNIT
R_INLAY = 470.0 / UNIT
CREST_IN = 408.0 / UNIT
CREST_OUT = 503.0 / UNIT
CREST_SPAN = 44.0
RIVET_INNER = 393.0 / UNIT
RIVET_OUTER = 466.0 / UNIT
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "raster", "dial-plate-render.png")


def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, base, metallic, roughness, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def radial(mat, stops):
    tree = mat.node_tree
    coord = tree.nodes.new("ShaderNodeTexCoord")
    length = tree.nodes.new("ShaderNodeVectorMath")
    length.operation = "LENGTH"
    remap = tree.nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = 0.0
    remap.inputs["From Max"].default_value = 1.0
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = stops[0][0]
    ramp.color_ramp.elements[0].color = (*stops[0][1], 1.0)
    ramp.color_ramp.elements[1].position = stops[-1][0]
    ramp.color_ramp.elements[1].color = (*stops[-1][1], 1.0)
    for pos, col in stops[1:-1]:
        el = ramp.color_ramp.elements.new(pos)
        el.color = (*col, 1.0)
    tree.links.new(coord.outputs["Object"], length.inputs[0])
    tree.links.new(length.outputs["Value"], remap.inputs["Value"])
    tree.links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], tree.nodes["Principled BSDF"].inputs["Base Color"])


def brushed(mat, scale=340.0, strength=0.12):
    tree = mat.node_tree
    coord = tree.nodes.new("ShaderNodeTexCoord")
    grad = tree.nodes.new("ShaderNodeTexNoise")
    grad.inputs["Scale"].default_value = scale
    grad.inputs["Detail"].default_value = 6.0
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    tree.links.new(coord.outputs["Object"], grad.inputs["Vector"])
    tree.links.new(grad.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], tree.nodes["Principled BSDF"].inputs["Normal"])


def sector(name, r_in, r_out, a0, a1, segments, z, thickness, mat, bevel=0.006, closed=False):
    verts, faces = [], []
    steps = segments if closed else segments + 1
    for i in range(steps):
        t = math.radians(a0 + (a1 - a0) * i / segments)
        verts.append((r_in * math.sin(t), r_in * math.cos(t), z))
        verts.append((r_out * math.sin(t), r_out * math.cos(t), z))
    for i in range(segments):
        a, b = 2 * i, 2 * i + 1
        c, d = (2 * ((i + 1) % steps), 2 * ((i + 1) % steps) + 1) if closed else (2 * i + 2, 2 * i + 3)
        faces.append((a, c, d, b))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    solid = obj.modifiers.new("solid", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = -1.0
    bev = obj.modifiers.new("bevel", "BEVEL")
    bev.width = bevel
    bev.segments = 4
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(35)
    obj.data.materials.append(mat)
    obj.data.shade_smooth()
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def disc(name, radius, z, mat, segments=256):
    bpy.ops.mesh.primitive_circle_add(vertices=segments, radius=radius, fill_type="NGON", location=(0, 0, z))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


wipe()
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "GPU"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for device in prefs.devices:
    device.use = True
scene.cycles.samples = int(os.environ.get("SAMPLES", "256"))
scene.cycles.use_denoising = True
scene.render.resolution_x = 1024
scene.render.resolution_y = 1024
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
tree = world.node_tree
bg = tree.nodes["Background"]
coord = tree.nodes.new("ShaderNodeTexCoord")
split = tree.nodes.new("ShaderNodeSeparateXYZ")
remap = tree.nodes.new("ShaderNodeMapRange")
remap.inputs["From Min"].default_value = -1.0
remap.inputs["From Max"].default_value = 1.0
ramp = tree.nodes.new("ShaderNodeValToRGB")
stops = [
    (0.0, (0.020, 0.035, 0.055)),
    (0.42, (0.140, 0.210, 0.290)),
    (0.500, (0.760, 0.840, 0.900)),
    (0.560, (0.300, 0.450, 0.640)),
    (0.800, (0.620, 0.760, 0.920)),
    (1.0, (0.900, 0.945, 1.000)),
]
ramp.color_ramp.elements[0].position = stops[0][0]
ramp.color_ramp.elements[0].color = (*stops[0][1], 1.0)
ramp.color_ramp.elements[1].position = stops[-1][0]
ramp.color_ramp.elements[1].color = (*stops[-1][1], 1.0)
for pos, col in stops[1:-1]:
    el = ramp.color_ramp.elements.new(pos)
    el.color = (*col, 1.0)
tree.links.new(coord.outputs["Generated"], split.inputs["Vector"])
tree.links.new(split.outputs["Z"], remap.inputs["Value"])
tree.links.new(remap.outputs["Result"], ramp.inputs["Fac"])
tree.links.new(ramp.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 0.62

steel = material("steel", (0.115, 0.170, 0.215), 1.0, 0.30)
brushed(steel, 260.0, 0.10)
plate_mat = material("plate", (0.160, 0.235, 0.290), 1.0, 0.26)
brushed(plate_mat, 340.0, 0.08)
teal = material("teal", (0.030, 0.330, 0.390), 1.0, 0.22)
brushed(teal, 420.0, 0.06)
rivet_mat = material("rivet", (0.520, 0.585, 0.630), 1.0, 0.12)
face_mat = material("face", (0.955, 0.920, 0.830), 0.0, 0.55)
lark_mat = material("lark", (0.930, 0.975, 0.990), 0.0, 0.34, (0.88, 0.96, 1.0), 0.22)

sector("hull", R_IN - 0.02, R_OUT, 0, 360, 256, 0.030, 0.060, steel, 0.005, closed=True)
for i in range(8):
    mid = -180 + i * 45.0
    sector(f"plate{i}", R_IN + 8 / UNIT, R_OUT - 10 / UNIT, mid - 22.5 + 1.9, mid + 22.5 - 1.9, 26, 0.074, 0.044, plate_mat, 0.013)
sector("inlay", R_INLAY - 7 / UNIT, R_INLAY + 7 / UNIT, 0, 360, 256, 0.082, 0.018, teal, 0.004, closed=True)
sector("crest", CREST_IN, CREST_OUT, -CREST_SPAN, CREST_SPAN, 64, 0.094, 0.050, teal, 0.012)
sector("crestlip", CREST_IN + 13 / UNIT, CREST_OUT - 13 / UNIT, -CREST_SPAN + 2.5, CREST_SPAN - 2.5, 60, 0.102, 0.012, teal, 0.005)

for i in range(8):
    mid = math.radians(-180 + i * 45.0)
    for r in (RIVET_INNER, RIVET_OUTER):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=15.0 / UNIT, location=(r * math.sin(mid), r * math.cos(mid), 0.080))
        rivet = bpy.context.object
        rivet.scale = (1.0, 1.0, 0.62)
        rivet.data.materials.append(rivet_mat)
        rivet.data.shade_smooth()

radial(face_mat, [
    (0.00, (1.000, 0.955, 0.855)),
    (0.30, (0.985, 0.925, 0.795)),
    (0.52, (0.930, 0.855, 0.700)),
    (0.72, (0.845, 0.755, 0.585)),
])
face = disc("face", R_IN + 0.004, 0.018, face_mat)

before = set(bpy.data.objects)
bpy.ops.import_curve.svg(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mark.svg"))
lark_objs = [o for o in bpy.data.objects if o not in before and o.type == "CURVE"]
scene_col = scene.collection
for o in lark_objs:
    for col in list(o.users_collection):
        col.objects.unlink(o)
    scene_col.objects.link(o)
if not lark_objs:
    print("LARK IMPORT FAILED", file=sys.stderr)
else:
    bpy.ops.object.select_all(action="DESELECT")
    for o in lark_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = lark_objs[0]
    bpy.ops.object.join()
    lark = bpy.context.object
    lark.data.dimensions = "2D"
    lark.data.extrude = 0.006
    lark.data.materials.clear()
    lark.data.materials.append(lark_mat)
    bpy.context.view_layer.update()
    bb = [lark.matrix_world @ __import__("mathutils").Vector(c) for c in lark.bound_box]
    xs = [v.x for v in bb]
    ys = [v.y for v in bb]
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    target = 84.0 / UNIT
    k = target / span
    lark.scale = (k, k, k)
    bpy.context.view_layer.update()
    bb = [lark.matrix_world @ __import__("mathutils").Vector(c) for c in lark.bound_box]
    cx = (max(v.x for v in bb) + min(v.x for v in bb)) / 2
    cy = (max(v.y for v in bb) + min(v.y for v in bb)) / 2
    lark.location = (lark.location.x - cx, lark.location.y - cy + 455.0 / UNIT, 0.110)

def softbox(name, loc, rot, size, energy, colour):
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.size = size[0]
    light.size_y = size[1]
    light.shape = "RECTANGLE"
    light.color = colour
    obj = bpy.data.objects.new(name, light)
    obj.location = loc
    obj.rotation_euler = rot
    bpy.context.collection.objects.link(obj)
    obj.visible_camera = False
    return obj


softbox("strip_a", (-1.5, 1.9, 1.5), (math.radians(42), math.radians(-20), math.radians(24)), (3.4, 0.30), 190, (1.0, 0.96, 0.90))
softbox("strip_b", (1.8, 1.2, 1.4), (math.radians(46), math.radians(26), math.radians(-30)), (2.6, 0.22), 120, (0.88, 0.95, 1.0))
softbox("strip_c", (0.2, -2.1, 1.3), (math.radians(-52), 0.0, 0.0), (3.0, 0.40), 90, (1.0, 0.93, 0.82))

face_fill = bpy.data.lights.new("face_fill", "AREA")
face_fill.energy = 52
face_fill.size = 1.6
face_fill.color = (1.0, 0.90, 0.74)
face_fill_obj = bpy.data.objects.new("face_fill", face_fill)
face_fill_obj.location = (-0.35, 0.55, 2.4)
face_fill_obj.rotation_euler = (math.radians(13), math.radians(-8), 0.0)
bpy.context.collection.objects.link(face_fill_obj)
face_fill_obj.visible_camera = False

key = bpy.data.lights.new("key", "AREA")
key.energy = 95
key.size = 2.6
key.color = (1.0, 0.95, 0.88)
key_obj = bpy.data.objects.new("key", key)
key_obj.location = (-1.6, 2.2, 3.0)
key_obj.rotation_euler = (math.radians(38), math.radians(-14), math.radians(20))
bpy.context.collection.objects.link(key_obj)

rim = bpy.data.lights.new("rim", "AREA")
rim.energy = 22
rim.size = 4.0
rim_obj = bpy.data.objects.new("rim", rim)
rim_obj.location = (2.0, -2.4, 2.2)
rim_obj.rotation_euler = (math.radians(-40), math.radians(16), math.radians(-24))
bpy.context.collection.objects.link(rim_obj)

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.0
cam = bpy.data.objects.new("cam", cam_data)
cam.location = (0, 0, 6)
bpy.context.collection.objects.link(cam)
scene.camera = cam


scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("RENDERED", OUT)

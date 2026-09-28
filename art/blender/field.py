import json
import math
import os

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
META = json.load(open(os.path.join(HERE, "terrain.json")))
EXTENT = META["extent"]
AMPLITUDE = META["amplitude"]
WATER = META["water_level"]
OUT = os.path.join(HERE, "..", "raster", "field-render.png")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "GPU"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for d in prefs.devices:
    d.use = True
scene.cycles.samples = int(os.environ.get("SAMPLES", "96"))
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 4
scene.cycles.transmission_bounces = 4
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"


def mat(name, base, roughness=0.8, metallic=0.0, specular=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1.0)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    return m


world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
wt = world.node_tree
sky = wt.nodes.new("ShaderNodeTexSky")
sky.sky_type = "MULTIPLE_SCATTERING"
sky.sun_elevation = math.radians(21)
sky.sun_rotation = math.radians(58)
sky.sun_intensity = 0.5
sky.altitude = 120
wt.links.new(sky.outputs["Color"], wt.nodes["Background"].inputs["Color"])
wt.nodes["Background"].inputs["Strength"].default_value = 0.26

sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.energy = 4.4
sun_data.angle = math.radians(1.6)
sun_data.color = (1.0, 0.955, 0.885)
sun = bpy.data.objects.new("sun", sun_data)
sun.rotation_euler = (math.radians(64), 0.0, math.radians(-122))
bpy.context.collection.objects.link(sun)

bpy.ops.mesh.primitive_grid_add(x_subdivisions=480, y_subdivisions=480, size=EXTENT)
terrain = bpy.context.object
terrain.name = "terrain"
img = bpy.data.images.load(os.path.join(HERE, "heightmap.png"))
tex = bpy.data.textures.new("height", "IMAGE")
tex.image = img
tex.extension = "EXTEND"
disp = terrain.modifiers.new("disp", "DISPLACE")
disp.texture = tex
disp.texture_coords = "UV"
disp.strength = AMPLITUDE
disp.mid_level = 0.0
terrain.data.shade_smooth()

ground = bpy.data.materials.new("ground")
ground.use_nodes = True
gt = ground.node_tree
gb = gt.nodes["Principled BSDF"]
gb.inputs["Roughness"].default_value = 0.94
geo = gt.nodes.new("ShaderNodeNewGeometry")
pos = gt.nodes.new("ShaderNodeSeparateXYZ")
nrm = gt.nodes.new("ShaderNodeSeparateXYZ")
gt.links.new(geo.outputs["Position"], pos.inputs["Vector"])
gt.links.new(geo.outputs["Normal"], nrm.inputs["Vector"])

zr = gt.nodes.new("ShaderNodeMapRange")
zr.inputs["From Min"].default_value = WATER - 0.6
zr.inputs["From Max"].default_value = WATER + 1.1
zr.clamp = True
gt.links.new(pos.outputs["Z"], zr.inputs["Value"])

ramp = gt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = (0.345, 0.268, 0.150, 1.0)
ramp.color_ramp.elements[1].position = 1.0
ramp.color_ramp.elements[1].color = (0.175, 0.470, 0.062, 1.0)
for p, c in ((0.13, (0.320, 0.250, 0.140)), (0.28, (0.070, 0.215, 0.035)), (0.60, (0.108, 0.330, 0.045))):
    el = ramp.color_ramp.elements.new(p)
    el.color = (*c, 1.0)
gt.links.new(zr.outputs["Fac"] if "Fac" in [o.name for o in zr.outputs] else zr.outputs["Result"], ramp.inputs["Fac"])

rock = gt.nodes.new("ShaderNodeValToRGB")
rock.color_ramp.elements[0].position = 0.55
rock.color_ramp.elements[0].color = (0.088, 0.070, 0.048, 1.0)
rock.color_ramp.elements[1].position = 0.80
rock.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
gt.links.new(nrm.outputs["Z"], rock.inputs["Fac"])

steep = gt.nodes.new("ShaderNodeMixRGB")
steep.blend_type = "MULTIPLY"
steep.inputs["Factor"].default_value = 1.0
gt.links.new(ramp.outputs["Color"], steep.inputs["Color1"])
gt.links.new(rock.outputs["Color"], steep.inputs["Color2"])

grain = gt.nodes.new("ShaderNodeTexNoise")
grain.inputs["Scale"].default_value = 5.5
grain.inputs["Detail"].default_value = 8.0
speck = gt.nodes.new("ShaderNodeMixRGB")
speck.blend_type = "MULTIPLY"
speck.inputs["Factor"].default_value = 0.20
gt.links.new(steep.outputs["Color"], speck.inputs["Color1"])
gt.links.new(grain.outputs["Fac"], speck.inputs["Color2"])
gt.links.new(speck.outputs["Color"], gb.inputs["Base Color"])
if os.environ.get("EMIT"):
    which = os.environ["EMIT"]
    src = {"zr": zr.outputs["Result"], "posz": pos.outputs["Z"], "ramp": ramp.outputs["Color"], "rock": rock.outputs["Color"]}[which]
    emit = gt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    out = gt.nodes["Material Output"]
    gt.links.new(src, emit.inputs["Color"])
    gt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    print("EMIT_PROBE", which)
if os.environ.get("MAGENTA"):
    gb.inputs["Base Color"].default_value = (1.0, 0.0, 0.6, 1.0)
    for lk in list(gt.links):
        if lk.to_node == gb and lk.to_socket.name == "Base Color":
            gt.links.remove(lk)
for link in gt.links:
    print("GLINK", link.from_node.bl_idname.replace("ShaderNode", ""), link.from_socket.name, "->", link.to_node.bl_idname.replace("ShaderNode", ""), link.to_socket.name)
terrain.data.materials.append(ground)
print("TERRAIN_MATS", [m.name for m in terrain.data.materials], "slots", len(terrain.material_slots))

water = bpy.data.materials.new("water")
water.use_nodes = True
wb = water.node_tree.nodes["Principled BSDF"]
wb.inputs["Base Color"].default_value = (0.022, 0.135, 0.245, 1.0)
wb.inputs["Roughness"].default_value = 0.13
wb.inputs["Metallic"].default_value = 0.0
wtree = water.node_tree
wnoise = wtree.nodes.new("ShaderNodeTexNoise")
wnoise.inputs["Scale"].default_value = 46.0
wnoise.inputs["Detail"].default_value = 3.0
wbump = wtree.nodes.new("ShaderNodeBump")
wbump.inputs["Strength"].default_value = 0.10
wtree.links.new(wnoise.outputs["Fac"], wbump.inputs["Height"])
wtree.links.new(wbump.outputs["Normal"], wb.inputs["Normal"])

bpy.ops.mesh.primitive_circle_add(vertices=96, radius=30.0, fill_type="NGON", location=(30.0, 16.0, WATER))
pond = bpy.context.object
pond.name = "pond"
pond.data.materials.append(water)

bpy.ops.mesh.primitive_plane_add(size=900.0, location=(0.0, 190.0, 2.4))
sea = bpy.context.object
sea.name = "sea"
sea.data.materials.append(water)

trunk_mat = mat("trunk", (0.130, 0.072, 0.036), 0.9)
leaf_mat = mat("leaf", (0.062, 0.235, 0.038), 0.85)
leaf_light = mat("leaf_light", (0.150, 0.430, 0.062), 0.8)
rock_mat = mat("rock", (0.150, 0.145, 0.130), 0.88)
tuft_mat = mat("tuft", (0.120, 0.330, 0.045), 0.9)


def prototype(name):
    col = bpy.data.collections.new(name)
    return col


leaf_deep = mat("leaf_deep", (0.032, 0.140, 0.022), 0.86)
leaf_warm = mat("leaf_warm", (0.250, 0.450, 0.050), 0.82)


def make_tree(name, height, canopy, lobes, low, high):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.40, depth=height, location=(0, 0, height / 2))
    stem = bpy.context.object
    stem.data.materials.append(trunk_mat)
    parts = [stem]
    for dx, dy, dz, r, m in lobes:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r * canopy, location=(dx, dy, height + dz))
        blob = bpy.context.object
        blob.scale = (1.0, 1.0, 0.88)
        blob.data.materials.append(high if m else low)
        parts.append(blob)
    for o in parts:
        o.data.shade_smooth()
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = stem
    bpy.ops.object.join()
    proto = bpy.context.object
    proto.name = name
    return proto


tree_a = make_tree("tree_a", 4.4, 1.0, [(0, 0, 1.4, 2.9, 0), (1.5, 0.6, 2.9, 2.1, 1), (-1.6, -0.5, 2.4, 1.8, 0)], leaf_mat, leaf_light)
tree_b = make_tree("tree_b", 6.2, 0.86, [(0, 0, 0.8, 2.6, 0), (0.9, -1.1, 2.6, 2.0, 1), (-1.3, 0.9, 2.2, 1.7, 0), (0.2, 0.3, 4.0, 1.4, 1)], leaf_deep, leaf_mat)
tree_c = make_tree("tree_c", 3.4, 1.18, [(0, 0, 1.1, 3.1, 1), (1.9, 0.2, 2.0, 2.0, 0), (-1.7, 0.8, 1.7, 1.9, 1)], leaf_mat, leaf_warm)
tree_variants = [tree_a, tree_b, tree_c]
tree_proto = tree_a

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.6, location=(0, 0, 0.5))
rock_proto = bpy.context.object
rock_proto.name = "rock_proto"
rock_proto.scale = (1.5, 1.2, 0.8)
rock_proto.data.materials.append(rock_mat)

bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.16, depth=1.5, location=(0, 0, 0.75))
tuft_proto = bpy.context.object
tuft_proto.name = "tuft_proto"
tuft_proto.data.materials.append(tuft_mat)

coll = bpy.context.collection
for proto, rows, zoff in ((tree_proto, META["trees"], -0.4), (rock_proto, META["rocks"], -0.3), (tuft_proto, META["tufts"], -0.1)):
    for idx, (x, y, z, s, rot) in enumerate(rows):
        if proto is tree_proto:
            proto = tree_variants[idx % 3]
        dup = bpy.data.objects.new(proto.name + "_i", proto.data)
        dup.location = (x, y, z + zoff)
        dup.scale = (proto.scale[0] * s, proto.scale[1] * s, proto.scale[2] * s)
        dup.rotation_euler = (0.0, 0.0, rot)
        coll.objects.link(dup)
    for v in (tree_variants if proto in tree_variants else [proto]):
        v.hide_render = True

wood = mat("wood", (0.180, 0.090, 0.040), 0.85)
wood_light = mat("wood_light", (0.300, 0.165, 0.075), 0.8)
roof = mat("roof", (0.330, 0.100, 0.048), 0.8)
lamp_mat = bpy.data.materials.new("lamp")
lamp_mat.use_nodes = True
lb = lamp_mat.node_tree.nodes["Principled BSDF"]
lb.inputs["Emission Color"].default_value = (1.0, 0.72, 0.30, 1.0)
lb.inputs["Emission Strength"].default_value = 26.0

tx, ty, tz = META["tower"]


def box(name, loc, scale, material, rot=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.rotation_euler = (0, 0, rot)
    o.data.materials.append(material)
    return o


box("deck", (tx, ty, tz + 3.4), (13.0, 10.0, 0.5), wood_light, 0.18)
for dx, dy in ((-5.4, -4.2), (5.4, -4.2), (-5.4, 4.2), (5.4, 4.2)):
    box("post", (tx + dx, ty + dy, tz + 1.6), (0.7, 0.7, 4.0), wood)
box("cabin", (tx - 0.6, ty + 0.8, tz + 6.2), (7.4, 6.2, 5.2), wood_light, 0.18)
box("beam", (tx - 0.6, ty + 0.8, tz + 8.9), (8.2, 7.0, 0.5), wood, 0.18)
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=6.6, depth=4.2, location=(tx - 0.6, ty + 0.8, tz + 10.9), rotation=(0, 0, 0.18 + math.pi / 4))
roof_obj = bpy.context.object
roof_obj.data.materials.append(roof)
box("rail", (tx, ty - 5.0, tz + 4.6), (12.0, 0.4, 1.1), wood, 0.18)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.62, location=(tx + 6.4, ty - 4.6, tz + 5.4))
lamp_ball = bpy.context.object
lamp_ball.data.materials.append(lamp_mat)
lamp_ball.data.shade_smooth()

lamp_light = bpy.data.lights.new("lamp_light", "POINT")
lamp_light.energy = 900
lamp_light.color = (1.0, 0.70, 0.32)
lamp_light.shadow_soft_size = 1.2
lamp_obj = bpy.data.objects.new("lamp_light", lamp_light)
lamp_obj.location = (tx + 6.4, ty - 4.6, tz + 5.4)
coll.objects.link(lamp_obj)

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 30.0
cam = bpy.data.objects.new("cam", cam_data)
cam.location = (2.0, -92.0, 44.0)
coll.objects.link(cam)
target = bpy.data.objects.new("target", None)
target.location = (6.0, 26.0, 10.0)
coll.objects.link(target)
con = cam.constraints.new("TRACK_TO")
con.target = target
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"
scene.camera = cam

scene.use_nodes = False
scene.view_settings.exposure = float(os.environ.get("EXPOSURE", "0.0"))

dg = bpy.context.evaluated_depsgraph_get()
ev = terrain.evaluated_get(dg).to_mesh()
zs = [v.co.z for v in ev.vertices]
print("TERRAIN_Z", round(min(zs), 2), round(max(zs), 2), "water", WATER)

scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("RENDERED", OUT)

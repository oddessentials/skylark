import math
import os
import random

import bmesh
import bpy
from mathutils import Vector


def use_gpu(scene):
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.get_devices()
        if any(d.type == backend for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == backend
            scene.cycles.device = "GPU"
            return backend
    scene.cycles.device = "CPU"
    return "CPU"


def setup(width, height):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    print("DEVICE", use_gpu(scene))
    scale = float(os.environ.get("SCALE", "1.0"))
    scene.cycles.samples = int(os.environ.get("SAMPLES", "256"))
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.transparent_max_bounces = 16
    scene.render.resolution_x = int(width * scale)
    scene.render.resolution_y = int(height * scale)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = float(os.environ.get("EXPOSURE", "0.0"))
    return scene


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, bm):
    data = bpy.data.meshes.new(name)
    bm.to_mesh(data)
    bm.free()
    return link(bpy.data.objects.new(name, data))


def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True


def join(parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    return result


def rotate(vector, angle):
    c, s = math.cos(angle), math.sin(angle)
    return Vector((vector.x * c - vector.y * s, vector.x * s + vector.y * c, vector.z))


def material(name, color, roughness=0.8, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m


def gradient_material(name, bottom, top, low, high, roughness=0.85, axis="Z", space="Object", translucency=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    coords = nodes.new("ShaderNodeTexCoord")
    split = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs[space], split.inputs["Vector"])
    span = nodes.new("ShaderNodeMapRange")
    span.inputs["From Min"].default_value = low
    span.inputs["From Max"].default_value = high
    links.new(split.outputs[axis], span.inputs["Value"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*bottom, 1.0)
    ramp.color_ramp.elements[1].color = (*top, 1.0)
    links.new(span.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    if translucency > 0.0:
        bsdf.inputs["Subsurface Weight"].default_value = translucency
    return m


def emission_material(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    for node in list(nodes):
        if node.type != "OUTPUT_MATERIAL":
            nodes.remove(node)
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*color, 1.0)
    emit.inputs["Strength"].default_value = strength
    m.node_tree.links.new(emit.outputs["Emission"], nodes["Material Output"].inputs["Surface"])
    return m


def plank_material(name, dark, light, scale=1.6, direction="Z"):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.85
    coords = nodes.new("ShaderNodeTexCoord")
    planks = nodes.new("ShaderNodeTexWave")
    planks.wave_type = "BANDS"
    planks.bands_direction = direction
    planks.wave_profile = "SAW"
    planks.inputs["Scale"].default_value = scale
    planks.inputs["Distortion"].default_value = 0.4
    links.new(coords.outputs["Object"], planks.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].color = (*light, 1.0)
    links.new(planks.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def noise_texture(name, size):
    tex = bpy.data.textures.new(name, "CLOUDS")
    tex.noise_scale = size
    tex.noise_depth = 2
    return tex


def sky(scene):
    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    background = nodes["Background"]
    coords = nodes.new("ShaderNodeTexCoord")
    split = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Generated"], split.inputs["Vector"])
    span = nodes.new("ShaderNodeMapRange")
    span.inputs["From Min"].default_value = -0.02
    span.inputs["From Max"].default_value = 0.62
    links.new(split.outputs["Z"], span.inputs["Value"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.62, 0.80, 0.90, 1.0)
    ramp.color_ramp.elements[1].color = (0.075, 0.30, 0.66, 1.0)
    ramp.color_ramp.elements.new(0.32).color = (0.26, 0.56, 0.84, 1.0)
    links.new(span.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], background.inputs["Color"])
    background.inputs["Strength"].default_value = 1.0
    return world


def key_light(elevation=52.0, heading=-32.0, energy=3.6):
    data = bpy.data.lights.new("key", "SUN")
    data.energy = energy
    data.angle = math.radians(6.0)
    data.color = (1.0, 0.95, 0.86)
    key = link(bpy.data.objects.new("key", data))
    key.rotation_euler = (math.radians(elevation), 0.0, math.radians(heading))
    return key


def camera(location, lens, width, height, pitch_to_horizon):
    data = bpy.data.cameras.new("camera")
    data.lens = lens
    data.sensor_fit = "HORIZONTAL"
    data.sensor_width = 36.0
    data.clip_end = 6000.0
    cam = link(bpy.data.objects.new("camera", data))
    cam.location = location
    half_v = math.atan((36.0 * height / width / 2.0) / lens)
    pitch = math.atan((pitch_to_horizon - 0.5) * 2.0 * math.tan(half_v))
    cam.rotation_euler = (math.radians(90.0) + pitch, 0.0, 0.0)
    bpy.context.scene.camera = cam
    bpy.context.view_layer.update()
    return cam, half_v, pitch


def ray(cam, u, v):
    frame = cam.data.view_frame(scene=bpy.context.scene)
    top_left, top_right, bottom_right = frame[3], frame[0], frame[1]
    local = top_left + (top_right - top_left) * u + (bottom_right - top_right) * v
    direction = cam.matrix_world.to_3x3() @ local
    return cam.matrix_world.translation.copy(), direction.normalized()


def point_at(cam, u, v, distance):
    origin, direction = ray(cam, u, v)
    return origin + direction * distance


def ground_hit(cam, height_at, u, v):
    origin, direction = ray(cam, u, v)
    t = 1.0
    previous = origin
    for _ in range(6000):
        point = origin + direction * t
        if point.z <= height_at(point.x, point.y):
            lo, hi = t * 0.97, t
            for _ in range(40):
                mid = (lo + hi) / 2.0
                p = origin + direction * mid
                if p.z <= height_at(p.x, p.y):
                    hi = mid
                else:
                    lo = mid
            return origin + direction * hi
        previous = point
        t *= 1.003
        t += 0.02
    return previous


def sun_disc(cam, u, v, distance=900.0, radius=80.0):
    point = point_at(cam, u, v, distance)
    m = bpy.data.materials.new("sun_disc")
    m.use_nodes = True
    nodes = m.node_tree.nodes
    links = m.node_tree.links
    for node in list(nodes):
        if node.type != "OUTPUT_MATERIAL":
            nodes.remove(node)
    coords = nodes.new("ShaderNodeTexCoord")
    gradient = nodes.new("ShaderNodeTexGradient")
    gradient.gradient_type = "SPHERICAL"
    links.new(coords.outputs["Object"], gradient.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (0.22, 0.20, 0.14, 1.0)
    ramp.color_ramp.elements.new(0.78).color = (1.0, 0.96, 0.82, 1.0)
    ramp.color_ramp.elements.new(1.0).color = (1.0, 0.98, 0.9, 1.0)
    links.new(gradient.outputs["Fac"], ramp.inputs["Fac"])
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 3.0
    links.new(ramp.outputs["Color"], emit.inputs["Color"])
    add = nodes.new("ShaderNodeAddShader")
    clear = nodes.new("ShaderNodeBsdfTransparent")
    links.new(emit.outputs["Emission"], add.inputs[0])
    links.new(clear.outputs["BSDF"], add.inputs[1])
    links.new(add.outputs["Shader"], nodes["Material Output"].inputs["Surface"])
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, radius=1.0, segments=64)
    disc = mesh_object("sun_disc", bm)
    disc.location = point
    disc.scale = (radius, radius, radius)
    disc.rotation_euler = (cam.location - point).normalized().to_track_quat("Z", "Y").to_euler()
    disc.data.materials.append(m)
    disc.visible_shadow = False
    return point


_cloud_material = None


def cloud(name, center, size, seed):
    global _cloud_material
    if _cloud_material is None:
        _cloud_material = gradient_material("cloud", (0.70, 0.78, 0.88), (1.0, 1.0, 1.0), -0.6, 0.7, 0.9, "Z", "Object", 0.25)
    rnd = random.Random(seed)
    meta = bpy.data.metaballs.new(name)
    meta.resolution = 2.0
    meta.render_resolution = 1.2
    meta.threshold = 0.6
    obj = link(bpy.data.objects.new(name, meta))
    obj.location = center
    for _ in range(14):
        el = meta.elements.new()
        spread = rnd.uniform(-1.0, 1.0)
        el.co = (spread * size * 0.9, rnd.uniform(-0.2, 0.2) * size * 0.4, (0.25 + (1.0 - abs(spread)) * 0.35) * size * rnd.uniform(0.6, 1.0))
        el.radius = size * rnd.uniform(0.34, 0.52) * (1.0 - abs(spread) * 0.35)
    obj.data.materials.append(_cloud_material)
    obj.visible_shadow = False
    return obj


_leaf_materials = []
_trunk_material = None


def puffy_tree(name, height, radius, variant):
    global _trunk_material
    if not _leaf_materials:
        for i, (low, high) in enumerate((((0.035, 0.16, 0.03), (0.20, 0.46, 0.07)), ((0.05, 0.20, 0.035), (0.28, 0.52, 0.09)), ((0.03, 0.14, 0.04), (0.16, 0.40, 0.08)))):
            _leaf_materials.append(gradient_material(f"leaf_{i}", low, high, -0.2, 1.1, 0.8, "Z", "Object", 0.08))
        _trunk_material = material("trunk", (0.20, 0.11, 0.05), 0.9)
    parts = []
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=radius * 0.16, radius2=radius * 0.09, depth=height)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0.0, 0.0, height / 2.0))
    trunk = mesh_object(name + "_trunk", bm)
    trunk.data.materials.append(_trunk_material)
    parts.append(trunk)
    lobes = [(0.0, 0.0, 0.0, 1.0)]
    for _ in range(4 + variant):
        a = random.uniform(0, math.tau)
        lobes.append((math.cos(a) * radius * 0.55, math.sin(a) * radius * 0.45, random.uniform(-0.25, 0.45) * radius, random.uniform(0.55, 0.78)))
    for dx, dy, dz, r in lobes:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=4, radius=radius * r)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(dx, dy, height + radius * 0.55 + dz))
        lobe = mesh_object(name + "_lobe", bm)
        displace = lobe.modifiers.new("lumps", "DISPLACE")
        displace.texture = noise_texture(name + "_noise", radius * 0.35)
        displace.strength = radius * 0.16
        lobe.data.materials.append(_leaf_materials[variant % len(_leaf_materials)])
        smooth(lobe)
        parts.append(lobe)
    for part in parts[1:]:
        bpy.context.view_layer.objects.active = part
        bpy.ops.object.modifier_apply(modifier="lumps")
    return join(parts, name)


def tree_prototypes(count=3):
    protos = [puffy_tree(f"tree_proto_{i}", 3.4 + i * 0.8, 2.4 + i * 0.3, i) for i in range(count)]
    for proto in protos:
        proto.hide_render = True
        proto.location = (0.0, -500.0, -50.0)
    return protos


def instance(proto, location, scale, spin):
    obj = link(bpy.data.objects.new(proto.name.replace("_proto", ""), proto.data))
    obj.location = location
    obj.scale = (scale, scale, scale)
    obj.rotation_euler = (0.0, 0.0, spin)
    return obj


_bush_material = None


def bush(name, radius, seed):
    global _bush_material
    if _bush_material is None:
        _bush_material = gradient_material("bush", (0.04, 0.18, 0.03), (0.22, 0.48, 0.08), -0.2, 1.2, 0.8, "Z", "Object", 0.08)
    rnd = random.Random(seed)
    parts = []
    for _ in range(4):
        bm = bmesh.new()
        r = radius * rnd.uniform(0.55, 0.8)
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(rnd.uniform(-0.6, 0.6) * radius, rnd.uniform(-0.4, 0.4) * radius, r * 0.6))
        for vert in bm.verts:
            vert.co.z = max(vert.co.z, 0.0)
        part = mesh_object(name + "_part", bm)
        part.data.materials.append(_bush_material)
        smooth(part)
        parts.append(part)
    return join(parts, name)


_rock_material = None


def rock(name, radius, seed):
    global _rock_material
    if _rock_material is None:
        _rock_material = gradient_material("rock", (0.30, 0.31, 0.33), (0.62, 0.63, 0.62), -0.5, 1.2, 0.75)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=radius)
    rnd = random.Random(seed)
    for vert in bm.verts:
        vert.co *= 0.8 + rnd.random() * 0.35
        vert.co.z *= 0.62
    bm.normal_update()
    obj = mesh_object(name, bm)
    bevel = obj.modifiers.new("bevel", "BEVEL")
    bevel.width = radius * 0.06
    bevel.segments = 2
    obj.data.materials.append(_rock_material)
    return obj


_palm_materials = None


def palm(name, height, lean, fronds, seed):
    global _palm_materials
    if _palm_materials is None:
        _palm_materials = (
            gradient_material("palm_trunk", (0.30, 0.19, 0.10), (0.55, 0.40, 0.24), 0.0, 7.0, 0.85, "Z", "Object"),
            gradient_material("frond", (0.06, 0.26, 0.05), (0.28, 0.56, 0.10), 0.0, 1.0, 0.7, "Z", "Object", 0.1),
        )
    rnd = random.Random(seed)
    bm = bmesh.new()
    rings = 12
    ring_verts = []
    for r in range(rings + 1):
        t = r / rings
        cx = lean * t * t * height
        cz = t * height
        radius = 0.24 * (1.0 - t * 0.45)
        ring_verts.append([bm.verts.new((cx + math.cos(k / 8 * math.tau) * radius, math.sin(k / 8 * math.tau) * radius, cz)) for k in range(8)])
    for r in range(rings):
        for k in range(8):
            bm.faces.new((ring_verts[r][k], ring_verts[r][(k + 1) % 8], ring_verts[r + 1][(k + 1) % 8], ring_verts[r + 1][k]))
    trunk_faces = len(bm.faces)
    top = Vector((lean * height, 0.0, height))
    for f in range(fronds):
        a = f / fronds * math.tau + rnd.uniform(-0.25, 0.25)
        length = height * rnd.uniform(0.40, 0.52)
        previous = None
        for s in range(9):
            t = s / 8
            reach = t * length
            droop = 0.30 * t * length - 0.75 * t * t * length
            width = 0.62 * math.sin(math.pi * min(1.0, t * 1.08)) + 0.03
            center = top + Vector((math.cos(a) * reach, math.sin(a) * reach, droop))
            side = Vector((-math.sin(a), math.cos(a), 0.12)) * width
            left = bm.verts.new(center + side)
            right = bm.verts.new(center - side)
            if previous:
                bm.faces.new((previous[0], previous[1], right, left))
            previous = (left, right)
    obj = mesh_object(name, bm)
    smooth(obj)
    obj.data.materials.append(_palm_materials[0])
    obj.data.materials.append(_palm_materials[1])
    for i, poly in enumerate(obj.data.polygons):
        poly.material_index = 0 if i < trunk_faces else 1
    return obj


def box(name, center, size, mat, spin=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    obj = mesh_object(name, bm)
    obj.scale = size
    obj.location = center
    obj.rotation_euler = (0.0, 0.0, spin)
    obj.data.materials.append(mat)
    return obj


def bird(name, center, span, pitch):
    bm = bmesh.new()
    size = span * 4.2
    tip_l = bm.verts.new((-size, 0.0, size * 0.35))
    mid_l = bm.verts.new((-size * 0.45, 0.0, size * 0.05))
    body = bm.verts.new((0.0, 0.0, -size * 0.06))
    mid_r = bm.verts.new((size * 0.45, 0.0, size * 0.05))
    tip_r = bm.verts.new((size, 0.0, size * 0.35))
    body_top = bm.verts.new((0.0, 0.0, size * 0.1))
    bm.faces.new((tip_l, mid_l, body_top))
    bm.faces.new((mid_l, body, body_top))
    bm.faces.new((body, mid_r, body_top))
    bm.faces.new((mid_r, tip_r, body_top))
    obj = mesh_object(name, bm)
    obj.location = center
    obj.rotation_euler = (math.radians(90.0) - pitch, 0.0, 0.0)
    obj.data.materials.append(material(name + "_ink", (0.16, 0.20, 0.26), 0.9))
    return obj


def meadow(emitter, count, blade_size, density=None, flowers=0.006):
    blade_mat = gradient_material("blade", (0.07, 0.24, 0.03), (0.50, 0.72, 0.16), 0.0, 1.0, 0.7, "Y", "Object", 0.15)
    bm = bmesh.new()
    previous = None
    for s in range(6):
        t = s / 5
        w = 0.03 * (1.0 - t) + 0.003
        bend = 0.22 * t * t
        left = bm.verts.new((-w, t, bend))
        right = bm.verts.new((w, t, bend))
        if previous:
            bm.faces.new((previous[0], previous[1], right, left))
        previous = (left, right)
    blade = mesh_object("blade", bm)
    blade.data.materials.append(blade_mat)
    smooth(blade)
    bpy.context.scene.collection.objects.unlink(blade)
    bpy.data.collections.new("blades").objects.link(blade)

    flower_collection = bpy.data.collections.new("flowers")
    for k, color in enumerate(((1.0, 0.84, 0.22), (1.0, 0.58, 0.70), (0.98, 0.97, 0.92))):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.055)
        bmesh.ops.scale(bm, vec=(1.0, 0.55, 1.0), verts=bm.verts)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0.0, 0.32, 0.0))
        head = mesh_object(f"flower_{k}", bm)
        head.data.materials.append(material(f"petal_{k}", color, 0.6))
        smooth(head)
        bpy.context.scene.collection.objects.unlink(head)
        flower_collection.objects.link(head)

    emitter.show_instancer_for_render = False
    emitter.show_instancer_for_viewport = False
    grass = emitter.modifiers.new("grass", "PARTICLE_SYSTEM")
    settings = grass.particle_system.settings
    settings.type = "HAIR"
    settings.count = count
    settings.hair_length = 1.0
    settings.render_type = "OBJECT"
    settings.instance_object = blade
    settings.particle_size = blade_size
    settings.size_random = 0.5
    settings.use_rotations = True
    settings.rotation_mode = "NOR"
    settings.phase_factor_random = 2.0
    settings.rotation_factor_random = 0.12
    settings.use_emit_random = True
    settings.distribution = "RAND"
    grass.particle_system.seed = 7
    if density:
        grass.particle_system.vertex_group_density = density

    bloom = emitter.modifiers.new("flowers", "PARTICLE_SYSTEM")
    petals = bloom.particle_system.settings
    petals.type = "HAIR"
    petals.count = int(count * flowers)
    petals.render_type = "COLLECTION"
    petals.instance_collection = flower_collection
    petals.use_collection_pick_random = True
    petals.particle_size = 0.16
    petals.size_random = 0.35
    petals.use_rotations = True
    petals.rotation_mode = "NOR"
    petals.phase_factor_random = 2.0
    bloom.particle_system.seed = 11
    if density:
        bloom.particle_system.vertex_group_density = density
    return emitter


def render(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)

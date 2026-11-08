"""A fluffy white kitten with real hair strands, rendered once to a transparent image.

Real-time fur on this hardware cannot look like this, but a still can: hair is rendered in Cycles
ahead of time, and the overlay only shows the resulting picture. Run with:

    blender --background --factory-startup --python blender_pipeline/build_cat.py -- <out folder> [preview|final]
"""
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geometry import capsule, ellipsoid, smin, smoothstep, surface_mesh  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1 :]
OUT = os.path.abspath(ARGS[0])
QUALITY = ARGS[1] if len(ARGS) > 1 else "preview"
SETTINGS = {
    "preview": {"strands": 150000, "size": 720, "samples": 48, "cell": 0.03},
    "final": {"strands": 300000, "size": 900, "samples": 96, "cell": 0.02},
}[QUALITY]
rng = np.random.default_rng(11)
started = time.time()


def log(message):
    print(f"[cat] {message} ({time.time() - started:.1f}s)", flush=True)


def to_blender(p):
    """Design (x, up, forward) to Blender (x, -forward, up), so the cat looks along -Y at the camera."""
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


# ---------- The body under the fur ----------
HEAD = (0, 1.78, 0.02)
NOSE = (0, 1.56, 0.92)
EYE_Y, EYE_X = 1.8, 0.41


def distance(x, y, z):
    ax = np.abs(x)
    # A big round head with soft cheeks, as kittens have.
    head = ellipsoid(ax, y, z, HEAD, (0.98, 0.84, 0.84))
    head = smin(head, ellipsoid(ax, y, z, (0.5, 1.52, 0.3), (0.5, 0.42, 0.5)), 0.28)
    head = smin(head, ellipsoid(ax, y, z, (0, 1.5, 0.66), (0.3, 0.2, 0.24)), 0.2)
    # Small upright ears.
    ear = capsule(ax, y, z, (0.58, 2.28, -0.06), (0.78, 3.0, -0.14), 0.28, 0.02)
    # Sitting body, front legs together, haunches at the sides, tail curled around to the front.
    body = ellipsoid(ax, y, z, (0, 0.66, -0.12), (0.7, 0.78, 0.64))
    body = smin(body, capsule(ax, y, z, (0.23, 0.82, 0.38), (0.25, 0.14, 0.48), 0.17, 0.15), 0.12)
    body = smin(body, ellipsoid(ax, y, z, (0.26, 0.09, 0.58), (0.19, 0.11, 0.24)), 0.07)
    body = smin(body, ellipsoid(ax, y, z, (0.56, 0.34, -0.1), (0.36, 0.34, 0.44)), 0.16)
    body = smin(body, ellipsoid(ax, y, z, (0.6, 0.09, 0.22), (0.2, 0.1, 0.26)), 0.07)
    tail = capsule(x, y, z, (0.35, 0.22, -0.66), (0.92, 0.17, -0.3), 0.14, 0.13)
    tail = smin(tail, capsule(x, y, z, (0.92, 0.17, -0.3), (0.96, 0.16, 0.34), 0.13, 0.1), 0.06)
    d = smin(head, ear, 0.1)
    d = smin(d, body, 0.14)
    return smin(d, tail, 0.08)


def surface_z(x, y):
    z = 1.7
    for _ in range(120):
        d = float(distance(np.array([x], dtype=float), np.array([y], dtype=float), np.array([z], dtype=float))[0])
        if d < 0.001:
            break
        z -= max(d, 0.002)
    return z


def fur_length(p):
    """Fur is short on the face and ears, full on the cheeks and chest."""
    x, y, z = np.abs(p[:, 0]), p[:, 1], p[:, 2]
    length = np.full(len(p), 0.2)
    on_head = y > 1.1
    length[on_head] = 0.17
    cheeks = np.sqrt(((x - 0.72) / 0.42) ** 2 + ((y - 1.48) / 0.42) ** 2) < 1
    length[cheeks] = 0.3
    chest = (y > 0.5) & (y < 1.22) & (z > 0.05)
    length[chest] = 0.3
    length[y < 0.42] = 0.085
    tail = (p[:, 0] > 0.3) & (z < 0.5) & (y < 0.4) & (x > 0.75)
    length[tail] = 0.2
    # Short velvet towards the middle of the face.
    from_nose = np.sqrt((x / 0.62) ** 2 + ((y - 1.62) / 0.5) ** 2)
    front = z > 0.2
    length[front & (y > 1.2)] *= (0.28 + 0.72 * smoothstep(0.6, 1.25, from_nose[front & (y > 1.2)]))
    ears = (y > 2.3) & (x > 0.42)
    length[ears] = 0.06
    return length


def growth(p, n):
    """Direction of the coat: away from the nose on the head, downwards on the body."""
    flow = np.zeros_like(p)
    flow[:, 1] = -1
    flow[:, 2] = 0.18
    head = p[:, 1] > 1.15
    from_nose = p[head] - np.array(NOSE)
    from_nose[:, 1] *= 0.8
    flow[head] = from_nose / np.linalg.norm(from_nose, axis=1, keepdims=True)
    below = (p[:, 1] > 1.15) & (p[:, 1] < 1.55) & (np.abs(p[:, 0]) > 0.45)
    flow[below] = flow[below] * 0.6 + np.array([0, -0.6, 0])
    ears = (p[:, 1] > 2.3) & (np.abs(p[:, 0]) > 0.42)
    flow[ears] = (0, 1, 0)
    tail = (p[:, 0] > 0.6) & (p[:, 1] < 0.4)
    flow[tail] = (0, 0.1, 1)
    flow -= n * np.einsum("ij,ij->i", flow, n)[:, None]
    return flow


# ---------- Fur strands ----------
def make_fur(verts, tris, normals, eye_points, material):
    a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
    count = SETTINGS["strands"]
    chosen = rng.choice(len(tris), size=int(count * 1.25), p=area / area.sum())
    u, v = rng.random(len(chosen)), rng.random(len(chosen))
    flip = u + v > 1
    u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
    roots = a[chosen] + (b[chosen] - a[chosen]) * u[:, None] + (c[chosen] - a[chosen]) * v[:, None]
    n = normals[tris[chosen]].mean(axis=1)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    # No hair over the eyes, nose, mouth or the pink of the ears.
    keep = np.ones(len(roots), dtype=bool)
    for point, radius in eye_points:
        keep &= np.linalg.norm((roots - np.array(point)) / np.array(radius), axis=1) > 1
    roots, n = roots[keep][:count], n[keep][:count]
    m = len(roots)
    length = fur_length(roots) * rng.uniform(0.72, 1.25, m)
    flow = growth(roots, n)
    flow /= np.maximum(np.linalg.norm(flow, axis=1, keepdims=True), 1e-6)
    direction = flow * 0.74 + n * 0.67 + rng.normal(0, 0.16, (m, 3))
    direction /= np.linalg.norm(direction, axis=1, keepdims=True)
    tips = roots + direction * length[:, None]

    # Strands lean into shared tufts, which gives the coat its soft, fluffy clumps.
    centres = rng.choice(m, size=max(1500, m // 45), replace=False)
    tree = KDTree(len(centres))
    for i, c_i in enumerate(centres):
        tree.insert(roots[c_i].tolist(), i)
    tree.balance()
    nearest = np.fromiter((centres[tree.find(r)[1]] for r in roots.tolist()), dtype=np.int64, count=m)
    pull = rng.uniform(0.35, 0.8, m)[:, None]

    steps = np.linspace(0, 1, 5)[:, None, None]
    # Shape (points per strand, strands, 3).
    positions = roots[None] + (tips - roots)[None] * steps
    positions = positions + (tips[nearest] - tips)[None] * pull[None] * steps**2
    positions[..., 1] -= (length[None, :, None] * 0.16 * steps**2)[..., 0]
    wiggle = rng.normal(0, 1, (m, 3)) * length[:, None] * 0.06
    positions = positions + wiggle[None] * np.sin(steps * math.pi * 1.5)
    positions = positions.transpose(1, 0, 2)  # strands, points, 3

    curves = bpy.data.hair_curves.new("Fur")
    curves.add_curves([5] * m)
    curves.position_data.foreach_set("vector", to_blender(positions).ravel())
    radius = curves.attributes.get("radius") or curves.attributes.new("radius", "FLOAT", "POINT")
    r = np.tile(np.array([0.0062, 0.0052, 0.004, 0.0026, 0.001], dtype=np.float32), m)
    radius.data.foreach_set("value", r)
    shade = curves.attributes.new("tint", "FLOAT", "CURVE")
    shade.data.foreach_set("value", rng.uniform(0, 1, m).astype(np.float32))
    curves.materials.append(material)
    obj = bpy.data.objects.new("Fur", curves)
    bpy.context.scene.collection.objects.link(obj)
    log(f"fur strands {m}")
    return obj


# ---------- Materials and small parts ----------
def principled(name, colour, roughness=0.6, specular=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes["Principled BSDF"]
    node.inputs["Base Color"].default_value = (*colour, 1)
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Specular IOR Level"].default_value = specular
    return mat


def fur_material():
    mat = bpy.data.materials.new("WhiteFur")
    mat.use_nodes = True
    tree = mat.node_tree
    out = tree.nodes["Material Output"]
    for node in list(tree.nodes):
        if node.type == "BSDF_PRINCIPLED":
            tree.nodes.remove(node)
    hair = tree.nodes.new("ShaderNodeBsdfHairPrincipled")
    hair.parametrization = "COLOR"
    hair.inputs["Color"].default_value = (0.97, 0.93, 0.9, 1)
    hair.inputs["Roughness"].default_value = 0.42
    hair.inputs["Radial Roughness"].default_value = 0.55
    hair.inputs["Random Roughness"].default_value = 0.2
    tree.links.new(hair.outputs[0], out.inputs["Surface"])
    return mat


def part(name, material, at, scale, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=1)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0], scale[2], scale[1])
    obj.rotation_euler = rotation
    obj.location = Vector(to_blender(at).tolist())
    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return obj


def line(name, points, radius, material):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for point, target in zip(spline.points, to_blender(points).tolist()):
        point.co = (*target, 1)
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(points))
    data.materials.append(material)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_face():
    """Big glossy eyes, a small pink nose and a soft mouth. Returns the bare patches of skin."""
    # The eye shader: black pupil, warm brown iris, dark rim.
    eye = bpy.data.materials.new("Eye")
    eye.use_nodes = True
    tree = eye.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    # Rough enough that the square lights do not show as sharp shapes in the eyes.
    bsdf.inputs["Roughness"].default_value = 0.2
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    coords = tree.nodes.new("ShaderNodeTexCoord")
    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    length = tree.nodes.new("ShaderNodeMath")
    length.operation = "SQRT"
    add = tree.nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    square_x = tree.nodes.new("ShaderNodeMath")
    square_x.operation = "POWER"
    square_x.inputs[1].default_value = 2
    square_z = tree.nodes.new("ShaderNodeMath")
    square_z.operation = "POWER"
    square_z.inputs[1].default_value = 2
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    stops = ramp.color_ramp
    stops.elements[0].position = 0.5
    stops.elements[0].color = (0.006, 0.004, 0.004, 1)
    stops.elements[1].position = 0.86
    stops.elements[1].color = (0.012, 0.007, 0.006, 1)
    middle = stops.elements.new(0.66)
    middle.color = (0.1, 0.045, 0.024, 1)
    tree.links.new(coords.outputs["Object"], separate.inputs[0])
    tree.links.new(separate.outputs["X"], square_x.inputs[0])
    tree.links.new(separate.outputs["Z"], square_z.inputs[0])
    tree.links.new(square_x.outputs[0], add.inputs[0])
    tree.links.new(square_z.outputs[0], add.inputs[1])
    tree.links.new(add.outputs[0], length.inputs[0])
    tree.links.new(length.outputs[0], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    shine = principled("Shine", (1, 1, 1), 0.2)
    node = shine.node_tree.nodes["Principled BSDF"]
    node.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    node.inputs["Emission Strength"].default_value = 3
    pink = principled("Nose", (0.85, 0.32, 0.36), 0.42)
    ear_pink = principled("EarPink", (0.95, 0.55, 0.58), 0.8)
    dark = principled("Mouth", (0.2, 0.08, 0.08), 0.7)
    rim = principled("EyeRim", (0.03, 0.02, 0.02), 0.5)

    bare = []
    for side in (-1, 1):
        x = side * EYE_X
        z = surface_z(x, EYE_Y) - 0.07
        part(f"Eye{side}", eye, (x, EYE_Y, z), (0.205, 0.22, 0.2), (0, side * -0.3, 0))
        part(f"Rim{side}", rim, (x, EYE_Y, z - 0.015), (0.218, 0.234, 0.2), (0, side * -0.3, 0))
        part(f"Shine{side}", shine, (x - 0.06, EYE_Y + 0.08, z + 0.17), (0.05, 0.058, 0.02))
        part(f"ShineSmall{side}", shine, (x + 0.065, EYE_Y - 0.09, z + 0.17), (0.018, 0.02, 0.01))
        bare.append(((x, EYE_Y, z + 0.1), (0.2, 0.215, 0.3)))
        # The pink inside of the ear.
        part(f"EarInner{side}", ear_pink, (side * 0.665, 2.55, 0.16), (0.14, 0.27, 0.05), (0.1, side * 0.12, side * -0.28))
        bare.append(((side * 0.665, 2.55, 0.2), (0.15, 0.28, 0.16)))
    nose_z = surface_z(0, 1.58)
    part("Nose", pink, (0, 1.585, nose_z + 0.005), (0.075, 0.052, 0.035))
    bare.append(((0, 1.57, nose_z), (0.11, 0.1, 0.12)))
    mouth_y = 1.47
    mouth_z = surface_z(0, mouth_y) + 0.008
    for side in (-1, 1):
        points = [(0, 1.535, mouth_z + 0.01), (0, mouth_y + 0.005, mouth_z), (side * 0.06, mouth_y - 0.03, mouth_z - 0.005), (side * 0.12, mouth_y - 0.005, mouth_z - 0.03)]
        line(f"Mouth{side}", points, 0.0075, dark)
    bare.append(((0, 1.49, mouth_z), (0.17, 0.08, 0.1)))
    # A few long fine whiskers.
    whisker = principled("Whisker", (0.95, 0.93, 0.9), 0.4)
    for side in (-1, 1):
        for k, droop in enumerate((-0.05, 0.03, 0.11)):
            start = (side * 0.27, 1.53 - k * 0.04, surface_z(0.27, 1.53) - 0.02)
            line(f"Whisker{side}{k}", [start, (side * 0.62, 1.52 - droop * 0.6, start[2] - 0.03), (side * 1.02, 1.5 - droop * 1.8, start[2] - 0.2)], 0.0035, whisker)
    return bare


def lights_and_camera():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Soft")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 0.96, 0.93, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.05

    def area(name, energy, location, size, colour=(1, 1, 1)):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.size = size
        data.color = colour
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0, 0, 1.5)) - Vector(location)).to_track_quat("-Z", "Y").to_euler()

    area("Key", 190, (-3.5, -5, 5), 5, (1, 0.97, 0.93))
    area("Fill", 120, (5, -4, 2), 6, (1, 0.97, 0.95))
    area("Under", 70, (0, -5, 0.2), 5, (1, 0.93, 0.9))
    area("Rim", 150, (0, 5, 4), 5, (1, 0.9, 0.94))

    data = bpy.data.cameras.new("Camera")
    data.lens = 85
    camera = bpy.data.objects.new("Camera", data)
    scene.collection.objects.link(camera)
    camera.location = (0.0, -9.6, 2.0)
    camera.rotation_euler = (Vector((0, 0, 1.56)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SETTINGS["samples"]
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = SETTINGS["size"]
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = -0.42  # keeps detail in the white fur instead of burning it out

    verts, quads, normals = surface_mesh(distance, 1.5, (-0.1, 3.3), (-1.2, 1.3), SETTINGS["cell"])
    log(f"skin {len(verts)} vertices")
    mesh = bpy.data.meshes.new("Skin")
    mesh.from_pydata(to_blender(verts).tolist(), [], quads.tolist())
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.materials.append(principled("Skin", (0.86, 0.8, 0.76), 0.8, 0.2))
    bpy.context.scene.collection.objects.link(bpy.data.objects.new("Skin", mesh))

    bare = build_face()
    tris = np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]])
    make_fur(verts, tris, normals, bare, fur_material())
    lights_and_camera()

    os.makedirs(os.path.join(OUT, "source"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "export"), exist_ok=True)
    if QUALITY == "final":
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "source", "cat_working.blend"))
    scene.render.filepath = os.path.join(OUT, "export", f"cat_{QUALITY}.png")
    bpy.ops.render.render(write_still=True)
    log(f"rendered {scene.render.filepath}")


main()

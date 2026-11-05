"""Renders the poodle's clips with real hair into transparent image sheets for the overlay.

Real-time fur cannot look like this on the streaming PC, but a pre-rendered animation can. The result
works like a GIF, with smooth see-through edges that a real GIF cannot have. Run with:

    blender --background poodle/source/poodle_working.blend --python blender_pipeline/render_clips.py -- poodle test
    blender --background poodle/source/poodle_working.blend --python blender_pipeline/render_clips.py -- poodle all

`test` renders two frames at a larger size and reports how much of the picture each clip uses.
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import poodle  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1 :]
OUT = os.path.abspath(ARGS[0])
MODE = ARGS[1] if len(ARGS) > 1 else "test"
started = time.time()
rng = np.random.default_rng(23)

FRAME_SIZE = 320
STRANDS = 90000
SAMPLES = 24
AZIMUTH = 40  # the dog is seen from the side and a little from the front, facing left
CAMERA_DISTANCE = 16
CAMERA_HEIGHT = 0.6
CAMERA_LENS = 125


def bump(p):
    """0 at the start and end of a clip, 1 in the middle."""
    return math.sin(math.pi * p)


def wobble(p, times=2):
    """A loop's gentle in and out, like panting."""
    return 0.5 + 0.5 * math.sin(2 * math.pi * times * p)


def clip(action, frames, fps, loops, face=None):
    return {"action": action, "frames": list(frames), "fps": fps, "loops": loops, "face": face or (lambda p: {})}


# Each clip is a stretch of a baked animation, and `face` gives the expression at each point from 0 to 1.
CLIPS = {
    "Walk": clip("Walk", range(1, 35, 2), 15, True),
    "Run": clip("Run", range(1, 17, 2), 15, True, lambda p: {"mouth": 0.75 + 0.2 * wobble(p, 1)}),
    "Idle": clip("Idle", range(1, 91, 6), 5, True),
    "TailWag": clip("TailWag", range(1, 46, 3), 10, True),
    "HeadTilt": clip("HeadTilt", range(1, 46, 3), 10, False, lambda p: {"wide": 0.5 * bump(p), "mouth": 0.2 * bump(p)}),
    "Jump": clip("Jump", range(1, 23, 2), 15, False, lambda p: {"mouth": 0.8 * bump(p), "wide": 0.5 * bump(p)}),
    "Joy": clip("TailWag", range(1, 46, 3), 10, True, lambda p: {"happy": True, "mouth": 0.7 + 0.25 * wobble(p, 3)}),
    "Pant": clip("Idle", range(1, 91, 12), 8, True, lambda p: {"mouth": 0.62 + 0.3 * wobble(p, 3)}),
    "Surprised": clip("Idle", [1] * 4, 16, False, lambda p: {"wide": min(1, p * 1.4), "mouth": 0.3 * p}),
    "Yawn": clip("Idle", range(1, 61, 6), 7, False, lambda p: {"eye": 1 - 0.88 * bump(p), "mouth": 1.25 * bump(p) ** 1.5}),
}
COAT = np.array((0.44, 0.2, 0.08))     # hair colour at the tip; the root is darker
EARS = COAT * 0.74
FACE = np.array((0.62, 0.34, 0.16))    # the short fuzz on the face
MUZZLE = np.array((0.86, 0.6, 0.38))


def log(message):
    print(f"[clips] {message} ({time.time() - started:.1f}s)", flush=True)


def to_design(p):
    """Blender (x, -forward, up) back to the character sheet's (x, up, forward)."""
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1)


def to_blender(p):
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


body = bpy.data.objects["PoodleBody"]
rig = bpy.data.objects["PoodleRig"]
scene = bpy.context.scene

# ---------- Where the hair grows, measured on the body at rest ----------
mesh = body.data
mesh.calc_loop_triangles()
tris = np.zeros(len(mesh.loop_triangles) * 3, dtype=np.int64)
mesh.loop_triangles.foreach_get("vertices", tris)
tris = tris.reshape(-1, 3)
rest = np.zeros(len(mesh.vertices) * 3)
mesh.vertices.foreach_get("co", rest)
rest = rest.reshape(-1, 3)


def tri_frames(points):
    """An orthogonal frame on each triangle, which carries the hair along as the skin moves."""
    a, b, c = points[tris[:, 0]], points[tris[:, 1]], points[tris[:, 2]]
    first = unit(b - a)
    normal = unit(np.cross(b - a, c - a))
    second = np.cross(normal, first)
    return np.stack([first, second, normal], axis=-1)


def vertex_normals(points):
    a, b, c = points[tris[:, 0]], points[tris[:, 1]], points[tris[:, 2]]
    face = np.cross(b - a, c - a)
    out = np.zeros_like(points)
    for k in range(3):
        np.add.at(out, tris[:, k], face)
    return unit(out)


a, b, c = rest[tris[:, 0]], rest[tris[:, 1]], rest[tris[:, 2]]
area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
chosen = rng.choice(len(tris), size=int(STRANDS * 1.5), p=area / area.sum())
u, v = rng.random(len(chosen)), rng.random(len(chosen))
flip = u + v > 1
u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
roots = rest[tris[chosen, 0]] * (1 - u - v)[:, None] + rest[tris[chosen, 1]] * u[:, None] + rest[tris[chosen, 2]] * v[:, None]
normals = vertex_normals(rest)
n = unit(normals[tris[chosen, 0]] * (1 - u - v)[:, None] + normals[tris[chosen, 1]] * u[:, None] + normals[tris[chosen, 2]] * v[:, None])
design = to_design(roots)


def rest_position(name):
    return to_design(np.array(bpy.data.objects[name].matrix_world.translation))


def close_to(points, centre, radius):
    return np.linalg.norm((points - centre) / radius, axis=-1) < 1


# Measured with the dog in its rest pose; the bow is enlarged and lifted clear of the coat.
rig.data.pose_position = "REST"
bpy.context.view_layer.update()
eye_left, eye_right = rest_position("Eye_L"), rest_position("Eye_R")
nose, mouth = rest_position("Nose"), rest_position("Mouth")
knot = rest_position("Bow_Knot")
outward = unit(knot - np.array((0, 2.4, 1.05)))
for name in ("Bow_A", "Bow_B", "Bow_Knot"):
    part = bpy.data.objects[name]
    place = knot + (rest_position(name) - knot) * 1.25 + outward * 0.1
    _, turn, size = part.matrix_world.decompose()
    part.matrix_world = Matrix.LocRotScale(Vector(to_blender(place).tolist()), turn, size * 1.25)
bpy.context.view_layer.update()

FACE_PARTS = {n: bpy.data.objects[n] for n in ("Eye_L", "Eye_R", "EyeShine_L", "EyeShine_R", "Mouth", "Tongue")}
FACE_REST = {n: o.matrix_world.copy() for n, o in FACE_PARTS.items()}


def happy_eye(name, centre):
    """A smiling closed eye: a soft dark arch over where the eye was."""
    out = unit(centre - np.array((0, 2.35, 1.05)))
    across = unit(np.cross(np.array((0.0, 1.0, 0.0)), out))
    points = []
    for t in np.linspace(-1, 1, 15):
        p = centre + out * (0.045 - 0.012 * t * t) + across * t * 0.09 + np.array((0, 1, 0)) * (0.05 * (1 - t * t) - 0.015)
        points.append(to_blender(p))
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.017
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, p in zip(spline.points, points):
        point.co = (*p, 1)
    curve.materials.append(FACE_PARTS["Eye_L"].data.materials[0])
    obj = bpy.data.objects.new(name, curve)
    scene.collection.objects.link(obj)
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = "Head"
    bpy.context.view_layer.update()
    obj.matrix_world = Matrix.Identity(4)
    obj.hide_render = True
    return obj


HAPPY_EYES = [happy_eye("Happy_L", eye_left), happy_eye("Happy_R", eye_right)]
bpy.context.view_layer.update()
rig.data.pose_position = "POSE"
bpy.context.view_layer.update()

ax, ay, az = np.abs(design[:, 0]), design[:, 1], design[:, 2]
coat = poodle.face_open(ax, ay, az)
ears = (ax > 0.34) & (ay > 1.6) & (az > 0.6)
snout_area = poodle.snout(ax, ay, az) < 0.09
# Short on the head so the face stays easy to see, shorter still on the paws and around the collar.
scale = coat * (1 - 0.38 * poodle.smoothstep(1.95, 2.25, ay) * (az > 0.55))
scale[ears] = np.maximum(scale[ears], 0.92)
scale[ay < 0.3] *= 0.7
collar = (np.abs((ay - 1.8) * 0.75 - (az - 0.9) * 0.66) < 0.09) & (az > 0.6) & (ay > 1.4) & (ay < 2.1)
scale[collar] *= 0.35
scale[close_to(design, knot, 0.2)] *= 0.55
# A short fuzz on the face, which hides the smooth skin, but none on the eyes, nose or mouth.
scale = np.maximum(scale, 0.17)
clear = np.zeros(len(design), dtype=bool)
for centre, radius in (
    (eye_left, (0.135, 0.145, 0.16)),
    (eye_right, (0.135, 0.145, 0.16)),
    (nose, (0.11, 0.095, 0.15)),
    (mouth - np.array((0, 0.05, 0)), (0.15, 0.15, 0.16)),  # room for the mouth when it opens
):
    clear |= close_to(design, centre, np.array(radius))
scale[clear] = 0
keep = np.flatnonzero(scale > 0.12)[:STRANDS]
chosen, u, v, roots, n, design, scale = chosen[keep], u[keep], v[keep], roots[keep], n[keep], design[keep], scale[keep]
coat, ears, snout_area = coat[keep], ears[keep], snout_area[keep]
m = len(roots)

flow = to_blender(poodle.growth_direction(design, to_design(n)))
flow = unit(flow - n * np.einsum("ij,ij->i", flow, n)[:, None])
direction = unit(flow * 0.7 + n * 0.7 + rng.normal(0, 0.2, (m, 3)))
length = 0.165 * scale * rng.uniform(0.7, 1.25, m)
tips = roots + direction * length[:, None]

# Strands gather into small tufts and twist around them, which reads as a soft curly coat.
centres = rng.choice(m, size=max(1200, m // 40), replace=False)
tree = KDTree(len(centres))
for i, centre in enumerate(centres):
    tree.insert(roots[centre].tolist(), i)
tree.balance()
nearest = np.fromiter((centres[tree.find(r)[1]] for r in roots.tolist()), dtype=np.int64, count=m)
_, tuft = np.unique(nearest, return_inverse=True)
shade = rng.uniform(0.8, 1.2, tuft.max() + 1)[tuft] * rng.uniform(0.94, 1.06, m)
tint = np.tile(COAT, (m, 1))
tint[ears] = EARS
tint[coat < 0.5] = FACE
tint[snout_area & (coat < 0.5)] = MUZZLE
tint = np.minimum(tint * shade[:, None], 1)
pull = rng.uniform(0.45, 0.85, m)[:, None]
steps = np.linspace(0, 1, 5)
strand = roots[:, None, :] + (tips - roots)[:, None, :] * steps[None, :, None]
strand += (tips[nearest] - tips)[:, None, :] * pull[:, None, :] * (steps**2)[None, :, None]
side = unit(np.cross(direction[nearest], rng.normal(size=(m, 3))))
strand += np.sin(steps * math.pi * 2.2)[None, :, None] * side[:, None, :] * (length * 0.2)[:, None, None]
strand[..., 2] -= (length[:, None] * 0.12) * steps[None, :] ** 2

# Each strand is stored relative to its triangle, so it can follow the skin in any pose.
rest_frames = tri_frames(rest)[chosen]
local = np.einsum("nji,nkj->nki", rest_frames, strand - roots[:, None, :])


def posed_points():
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(graph)
    temp = evaluated.to_mesh()
    points = np.zeros(len(temp.vertices) * 3)
    temp.vertices.foreach_get("co", points)
    evaluated.to_mesh_clear()
    matrix = np.array(body.matrix_world)
    points = points.reshape(-1, 3)
    return points @ matrix[:3, :3].T + matrix[:3, 3]


# ---------- Hair object and material ----------
hair_mat = bpy.data.materials.new("PoodleHair")
hair_mat.use_nodes = True
tree_nodes = hair_mat.node_tree
for node in list(tree_nodes.nodes):
    if node.type == "BSDF_PRINCIPLED":
        tree_nodes.nodes.remove(node)
hair = tree_nodes.nodes.new("ShaderNodeBsdfHairPrincipled")
hair.parametrization = "COLOR"
hair.inputs["Roughness"].default_value = 0.46
hair.inputs["Radial Roughness"].default_value = 0.6
info = tree_nodes.nodes.new("ShaderNodeHairInfo")
ramp = tree_nodes.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = (0.3, 0.3, 0.3, 1)
ramp.color_ramp.elements[1].position = 1.0
ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
ramp.color_ramp.elements.new(0.4).color = (0.6, 0.6, 0.6, 1)
strand_tint = tree_nodes.nodes.new("ShaderNodeAttribute")
strand_tint.attribute_type = "GEOMETRY"
strand_tint.attribute_name = "tint"
multiply = tree_nodes.nodes.new("ShaderNodeVectorMath")
multiply.operation = "MULTIPLY"
tree_nodes.links.new(info.outputs["Intercept"], ramp.inputs["Fac"])
tree_nodes.links.new(ramp.outputs["Color"], multiply.inputs[0])
tree_nodes.links.new(strand_tint.outputs["Color"], multiply.inputs[1])
tree_nodes.links.new(multiply.outputs["Vector"], hair.inputs["Color"])
tree_nodes.links.new(hair.outputs[0], tree_nodes.nodes["Material Output"].inputs["Surface"])

curves = bpy.data.hair_curves.new("PoodleFur")
curves.add_curves([5] * m)
radius = curves.attributes.get("radius") or curves.attributes.new("radius", "FLOAT", "POINT")
radius.data.foreach_set("value", np.tile(np.array([0.0105, 0.009, 0.007, 0.0045, 0.0014], dtype=np.float32), m))
colour = curves.attributes.new("tint", "FLOAT_COLOR", "CURVE")
colour.data.foreach_set("color", np.column_stack([tint, np.ones(m)]).astype(np.float32).ravel())
curves.materials.append(hair_mat)
fur_object = bpy.data.objects.new("PoodleFur", curves)
scene.collection.objects.link(fur_object)
log(f"{m} strands")


def grow_hair():
    points = posed_points()
    p0, p1, p2 = points[tris[chosen, 0]], points[tris[chosen, 1]], points[tris[chosen, 2]]
    root = p0 * (1 - u - v)[:, None] + p1 * u[:, None] + p2 * v[:, None]
    frames = tri_frames(points)[chosen]
    position = root[:, None, :] + np.einsum("nij,nkj->nki", frames, local)
    curves.position_data.foreach_set("vector", position.ravel())
    curves.update_tag()


# ---------- Lights, camera and render settings ----------
world = bpy.data.worlds.new("Soft")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 0.97, 0.94, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8


def area_light(name, energy, location, size, colour=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    data.color = colour
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 1.5)) - Vector(location)).to_track_quat("-Z", "Y").to_euler()


area_light("Key", 260, (3.5, -6, 6), 5, (1, 0.97, 0.92))
area_light("Fill", 110, (7, 2, 2), 6, (1, 0.97, 0.95))
area_light("Rim", 220, (-4, 5, 5), 5, (1, 0.9, 0.92))

camera_data = bpy.data.cameras.new("Camera")
# A long lens looking straight ahead from low down: the paws line up and upright lines stay upright,
# so the dog does not seem to stand on a slope. Shifting the view frames it without tilting anything.
camera_data.lens = CAMERA_LENS
camera_data.shift_x = -0.04
camera_data.shift_y = 0.236
camera = bpy.data.objects.new("Camera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
angle = math.radians(AZIMUTH)
camera.location = (math.sin(angle) * CAMERA_DISTANCE, -math.cos(angle) * CAMERA_DISTANCE, CAMERA_HEIGHT)
camera.rotation_euler = (Vector((0, 0, CAMERA_HEIGHT)) - camera.location).to_track_quat("-Z", "Y").to_euler()

scene.render.engine = "CYCLES"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"
scene.view_settings.exposure = -0.1


def picture_bounds():
    """The part of the picture the skin covers now, as (left, bottom) and (right, top) from 0 to 1."""
    view = np.array(camera.matrix_world.inverted())
    inside = posed_points() @ view[:3, :3].T + view[:3, 3]
    focal = camera_data.lens / camera_data.sensor_width
    spot = inside[:, :2] / -inside[:, 2:3] * focal + 0.5 - np.array((camera_data.shift_x, camera_data.shift_y))
    return spot.min(0), spot.max(0)


def set_clip(name):
    rig.animation_data.action = bpy.data.actions[name]
    if rig.animation_data.action_slot is None and rig.animation_data.action.slots:
        rig.animation_data.action_slot = rig.animation_data.action.slots[0]


def set_face(eye=1.0, wide=0.0, happy=False, mouth=0.0):
    """eye: how open the eyes are. wide: how big. happy: smiling closed eyes. mouth: 0 shut to about 1 open."""

    def place(name, grow=(1, 1, 1), move=(0, 0, 0)):
        at, turn, size = FACE_REST[name].decompose()
        size = Vector(s * g for s, g in zip(size, grow))
        FACE_PARTS[name].matrix_world = Matrix.LocRotScale(at + Vector(move), turn, size)

    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    big = 1 + 0.26 * wide
    for side in "LR":
        place(f"Eye_{side}", (big, big, big * eye))
        place(f"EyeShine_{side}", (big, big, big * (eye if eye > 0.5 else 0.001)))
        FACE_PARTS[f"Eye_{side}"].hide_render = happy
        FACE_PARTS[f"EyeShine_{side}"].hide_render = happy
    for arc in HAPPY_EYES:
        arc.hide_render = not happy
    # Blender's -Y is forward and +Z is up: the lower jaw drops and the tongue slides out over it.
    place("Mouth", (1 + 0.2 * mouth, 1, 1 + 2.7 * mouth), (0, 0.006 * mouth, -0.034 * mouth))
    place("Tongue", (1 + 0.1 * mouth, 1, 1 + 0.35 * mouth), (0, -0.012 * mouth, -0.052 * mouth))
    bpy.context.view_layer.update()
    rig.data.pose_position = "POSE"
    bpy.context.view_layer.update()


def render_frame(frame, path):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    grow_hair()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def sheet(paths, out_path):
    """Packs a clip's frames into one image, row by row from the top."""
    columns = math.ceil(math.sqrt(len(paths)))
    rows = math.ceil(len(paths) / columns)
    size = FRAME_SIZE
    canvas = np.zeros((rows * size, columns * size, 4), dtype=np.float32)
    for i, path in enumerate(paths):
        image = bpy.data.images.load(path)
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(size, size, 4)
        bpy.data.images.remove(image)
        y = (rows - 1 - i // columns) * size  # image data starts from the bottom row
        x = (i % columns) * size
        canvas[y : y + size, x : x + size] = pixels
    result = bpy.data.images.new(os.path.basename(out_path), columns * size, rows * size, alpha=True, float_buffer=False)
    result.colorspace_settings.name = "sRGB"
    result.pixels.foreach_set(canvas.ravel())
    result.filepath_raw = out_path
    result.file_format = "PNG"
    result.save()
    bpy.data.images.remove(result)
    return columns, rows


frames_dir = os.path.join(OUT, "frames")
os.makedirs(frames_dir, exist_ok=True)

if MODE == "test":
    scene.render.resolution_x = scene.render.resolution_y = 640
    # One picture of each expression at its strongest.
    set_clip("Idle")
    for name, face in (
        ("joy", {"happy": True, "mouth": 0.95}),
        ("pant", {"mouth": 0.9}),
        ("yawn", {"eye": 0.12, "mouth": 1.25}),
        ("surprised", {"wide": 1, "mouth": 0.3}),
    ):
        set_face(**face)
        render_frame(1, os.path.join(frames_dir, f"test_{name}.png"))
    log("test frames done")
else:
    scene.render.resolution_x = scene.render.resolution_y = FRAME_SIZE
    out_dir = os.path.join(OUT, "export", "sprites")
    os.makedirs(out_dir, exist_ok=True)
    manifest = {"frameSize": FRAME_SIZE, "clips": {}}
    # Where the paws touch the ground in the picture, so the overlay can stand the dog on the floor.
    set_clip("Idle")
    scene.frame_set(1)
    bpy.context.view_layer.update()
    near, far = picture_bounds()
    manifest["groundX"] = round(float(near[0] + far[0]) / 2, 4)
    manifest["groundY"] = round(1 - float(near[1]), 4)
    manifest["bodyWidth"] = round(float(far[0] - near[0]), 4)
    # How far across the picture one unit of walking moves, so the overlay can match the paws.
    manifest["walkUnit"] = round(CAMERA_LENS / camera_data.sensor_width / CAMERA_DISTANCE * math.sin(angle), 4)
    for name, info in CLIPS.items():
        set_clip(info["action"])
        paths = []
        count = len(info["frames"])
        for i, frame in enumerate(info["frames"]):
            # A loop never reaches 1, so its last picture leads back into its first.
            progress = i / count if info["loops"] else i / max(1, count - 1)
            set_face(**info["face"](progress))
            path = os.path.join(frames_dir, f"{name}_{i:03d}.png")
            render_frame(frame, path)
            paths.append(path)
        log(f"{name}: {len(paths)} frames")
        columns, rows = sheet(paths, os.path.join(out_dir, f"{name}.png"))
        manifest["clips"][name] = {"frames": len(paths), "columns": columns, "rows": rows, "fps": info["fps"], "loops": info["loops"]}
    # A blink over the standing pose. The eye flattens to a line and its shine disappears.
    set_clip("Idle")
    paths = []
    for i, amount in enumerate((0.55, 0.1, 0.55)):
        set_face(eye=amount)
        path = os.path.join(frames_dir, f"Blink_{i:03d}.png")
        render_frame(1, path)
        paths.append(path)
    set_face()
    columns, rows = sheet(paths, os.path.join(out_dir, "Blink.png"))
    manifest["clips"]["Blink"] = {"frames": len(paths), "columns": columns, "rows": rows, "fps": 24, "loops": False}
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
    log("all clips done")

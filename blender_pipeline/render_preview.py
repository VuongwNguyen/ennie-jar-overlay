"""Renders QA images from the working file. Run with:

    blender --background <poodle_working.blend> --python blender_pipeline/render_preview.py -- <output folder>
"""
import math
import os
import sys

import bpy
from mathutils import Vector

OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
QA =os.path.join(OUT, "qa")
os.makedirs(QA, exist_ok=True)
scene = bpy.context.scene
arm = bpy.data.objects["PoodleRig"]

for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
    try:
        scene.render.engine = engine
        break
    except TypeError:
        continue
print("[poodle] render engine", scene.render.engine, flush=True)
scene.render.resolution_x = 820
scene.render.resolution_y = 820
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False

world = bpy.data.worlds.new("Studio")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.36, 0.44, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55


def light(name, kind, energy, location, size=3.0, colour=(1, 1, 1)):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = colour
    if kind == "AREA":
        data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    direction = Vector((0, 0, 1.3)) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


light("Key", "AREA", 260, (-3.5, -4.5, 5), 4, (1, 0.96, 0.9))
light("Fill", "AREA", 90, (4.5, -3, 2.5), 5, (0.92, 0.95, 1))
light("Rim", "AREA", 160, (0, 5, 4), 4, (1, 0.9, 0.95))

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
ground = bpy.context.object
ground_mat = bpy.data.materials.new("Ground")
ground_mat.use_nodes = True
ground_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.3, 0.33, 0.4, 1)
ground_mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
ground.data.materials.append(ground_mat)

camera_data = bpy.data.cameras.new("Camera")
camera_data.lens = 85
camera = bpy.data.objects.new("Camera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera


def shoot(name, action, frame, azimuth, distance=10.5, height=1.5, target=(0, 0, 1.35), lens=85):
    arm.animation_data.action = bpy.data.actions[action]
    if arm.animation_data.action_slot is None and arm.animation_data.action.slots:
        arm.animation_data.action_slot = arm.animation_data.action.slots[0]
    scene.frame_set(frame)
    camera_data.lens = lens
    a = math.radians(azimuth)
    # The dog faces -Y, so an azimuth of 0 looks at its face.
    camera.location = (target[0] + math.sin(a) * distance, target[1] - math.cos(a) * distance, height + target[2] - 1.35 + 1.0)
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(QA, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("[poodle] rendered", name, flush=True)


wanted = sys.argv[sys.argv.index("--") + 2:] or ["stand", "motion"]
if "stand" in wanted:
    shoot("stand_front", "Idle", 1, 0)
    shoot("stand_three_quarter", "Idle", 1, 40)
    shoot("stand_side", "Idle", 1, 90)
    shoot("stand_back", "Idle", 1, 180)
    shoot("face_close", "Idle", 1, 20, distance=4.2, target=(0, -1.2, 2.25))
if "motion" in wanted:
    for frame in (1, 9, 18, 26):
        shoot(f"walk_{frame:02d}", "Walk", frame, 90)
    for frame in (1, 5, 9, 13):
        shoot(f"run_{frame:02d}", "Run", frame, 90)
    shoot("sit_front", "Sit", 1, 20)
    shoot("sit_side", "Sit", 1, 90)
    shoot("jump_crouch", "Jump", 6, 90)
    shoot("jump_rise", "Jump", 9, 90)
    shoot("jump_fall", "Jump", 14, 90)


def montage(names, columns, out_name):
    """Puts several renders on one sheet, for reviewing a clip at a glance."""
    import numpy as np

    sheets = []
    for name in names:
        image = bpy.data.images.load(os.path.join(QA, name + ".png"))
        width, height = image.size
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
        sheets.append(pixels[::2, ::2])
        bpy.data.images.remove(image)
    h, w = sheets[0].shape[:2]
    rows = (len(sheets) + columns - 1) // columns
    canvas = np.ones((h * rows, w * columns, 4), dtype=np.float32)
    for i, sheet in enumerate(sheets):
        # Stored bottom row first, so the first row of images goes at the end of the array.
        y = (rows - 1 - i // columns) * h
        x = (i % columns) * w
        canvas[y : y + h, x : x + w] = sheet
    result = bpy.data.images.new(out_name, w * columns, h * rows, alpha=True)
    result.pixels[:] = canvas.ravel().tolist()
    result.filepath_raw = os.path.join(QA, out_name + ".png")
    result.file_format = "PNG"
    result.save()


if "motion" in wanted:
    montage(["walk_01", "walk_09", "walk_18", "walk_26", "run_01", "run_05", "run_09", "run_13", "sit_front", "sit_side", "jump_crouch", "jump_rise"], 4, "motion_sheet")

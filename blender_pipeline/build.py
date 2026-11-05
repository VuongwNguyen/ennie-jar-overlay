"""Builds the poodle end to end. Run with:

    blender --background --python blender_pipeline/build.py -- <output folder>

Writes source/poodle_working.blend, export/poodle.glb and a build report. Check the report rather
than assuming a run succeeded.
"""
import json
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import animation  # noqa: E402
import fur  # noqa: E402
import geometry  # noqa: E402
import poodle  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1 :]
OUT = os.path.abspath(ARGS[0])
DETAIL = ARGS[1] if len(ARGS) > 1 else "high"   # "high" for the master asset, "web" for real-time use
SKIN_CELL = {"high": 0.019, "web": 0.027}[DETAIL]
started = time.time()
report = {"steps": []}


def log(step, **info):
    print(f"[poodle] {step} {info} ({time.time() - started:.1f}s)", flush=True)
    report["steps"].append({"step": step, **info})


def to_blender(p):
    """Design (x, up, forward) to Blender (x, -forward, up): glTF export then faces the dog along +z."""
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


def vec(p):
    return Vector(to_blender(p).tolist())


def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------- Materials ----------
def principled(name, colour=None, roughness=0.8, metallic=0.0, vertex_colours=False, sheen=0.0, specular=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in node.inputs:
        node.inputs["Specular IOR Level"].default_value = specular
    if sheen and "Sheen Weight" in node.inputs:
        node.inputs["Sheen Weight"].default_value = sheen
    if vertex_colours:
        attr = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        mat.node_tree.links.new(attr.outputs["Color"], node.inputs["Base Color"])
    elif colour:
        node.inputs["Base Color"].default_value = (*colour, 1)
    return mat


# ---------- Skin and coat ----------
def build_body():
    verts, quads, normals = geometry.surface_mesh(poodle.body_distance, 0.92, (-0.12, 3.08), (-1.72, 1.92), SKIN_CELL)
    log("skin mesh", vertices=len(verts), quads=len(quads))
    tris = np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]])
    curl_pos, curl_quads, curl_col, curl_root = np.empty((0, 3)), np.empty((0, 4), dtype=np.int64), np.empty((0, 3)), np.empty((0, 3))
    if poodle.LOOSE_CURLS:
        curl_pos, curl_quads, curl_col, curl_root, stats = fur.build_curls(
            verts, tris, normals, poodle.fur_zone, poodle.growth_direction, (poodle.FUR, poodle.FUR_DARK, poodle.FUR_LIGHT), detail=DETAIL
        )
        log("curls", **stats, vertices=len(curl_pos))

    # Colours are linear values chosen to look apricot in the final render.
    skin_col = poodle.skin_colour(verts[:, 0], verts[:, 1], verts[:, 2])
    all_pos = np.concatenate([verts, curl_pos])
    all_col = np.concatenate([skin_col, curl_col])
    all_quads = np.concatenate([quads, curl_quads + len(verts)])

    mesh = bpy.data.meshes.new("PoodleBody")
    mesh.from_pydata(to_blender(all_pos).tolist(), [], all_quads.tolist())
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    colour = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    rgba = np.concatenate([all_col, np.ones((len(all_col), 1))], axis=1).astype(np.float32)
    colour.data.foreach_set("color", rgba.ravel())
    obj = bpy.data.objects.new("PoodleBody", mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(principled("Fur", roughness=0.86, vertex_colours=True, sheen=0.6, specular=0.3))
    return obj, verts, curl_root


# ---------- Skeleton ----------
def build_armature():
    data = bpy.data.armatures.new("PoodleRig")
    arm = bpy.data.objects.new("PoodleRig", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    root = data.edit_bones.new("Root")
    root.head = vec((0, 0, 0))
    root.tail = vec(poodle.TAIL_POINT["Root"])
    bones = {"Root": root}
    for name, at in poodle.JOINT.items():
        if name == "TailEnd":
            continue
        bone = data.edit_bones.new(name)
        bone.head = vec(at)
        end = poodle.JOINT[poodle.TAIL_OF[name]] if name in poodle.TAIL_OF else poodle.TAIL_POINT[name]
        bone.tail = vec(end)
        bones[name] = bone
    for name, parent in poodle.PARENT.items():
        bones[name].parent = bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def skin_weights(body, arm, skin_verts, curl_root):
    names = [b.name for b in arm.data.bones]
    index = {n: i for i, n in enumerate(names)}
    segments = poodle.SKIN
    distance = np.empty((len(skin_verts), len(segments)), dtype=np.float32)
    for s, (_, a, b, thick) in enumerate(segments):
        a, b = np.array(a), np.array(b)
        ab = b - a
        t = np.clip(((skin_verts - a) @ ab) / (ab @ ab), 0, 1)
        d = np.linalg.norm(skin_verts - (a + t[:, None] * ab), axis=1)
        distance[:, s] = d / thick
    weight = 1.0 / (distance + 0.05) ** 5
    bone_of = np.array([index[seg[0]] for seg in segments])
    per_bone = np.zeros((len(skin_verts), len(names)), dtype=np.float32)
    for s in range(len(segments)):
        per_bone[:, bone_of[s]] = np.maximum(per_bone[:, bone_of[s]], weight[:, s])
    top = np.argsort(-per_bone, axis=1)[:, :4]
    top_w = np.take_along_axis(per_bone, top, axis=1)
    top_w /= top_w.sum(axis=1, keepdims=True)

    # A curl moves with the patch of skin it grows from.
    tree = KDTree(len(skin_verts))
    for i, p in enumerate(skin_verts):
        tree.insert(p.tolist(), i)
    tree.balance()
    from_skin = np.empty(len(curl_root), dtype=np.int64)
    last_root, last_hit = None, 0
    for i, p in enumerate(curl_root):
        if last_root is None or not np.array_equal(p, last_root):
            last_root, last_hit = p, tree.find(p.tolist())[1]
        from_skin[i] = last_hit
    all_bones = np.concatenate([top, top[from_skin]])
    all_w = np.concatenate([top_w, top_w[from_skin]])
    groups = [body.vertex_groups.new(name=n) for n in names]
    for v in range(len(all_bones)):
        for k in range(4):
            w = float(all_w[v, k])
            if w > 0.004:
                groups[all_bones[v, k]].add([v], w, "REPLACE")
    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    body.parent = arm


# ---------- Face and accessories: separate materials, carried by bones ----------
def surface_z(x, y):
    z = 2.4
    for _ in range(120):
        d = float(poodle.body_distance(np.array([abs(x)]), np.array([y]), np.array([z]))[0])
        if d < 0.001:
            break
        z -= max(d, 0.002)
    return z


def add_part(name, parent_bone, arm, material, at, scale, rotation=(0, 0, 0), kind="sphere"):
    if kind == "torus":
        bpy.ops.mesh.primitive_torus_add(major_radius=scale[0], minor_radius=scale[1], major_segments=40, minor_segments=10)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18, radius=1)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    if kind != "torus":
        obj.scale = to_scale(scale)
    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    obj.rotation_euler = rotation
    obj.location = vec(at)
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = "BONE"
    obj.parent_bone = parent_bone
    bpy.context.view_layer.update()
    obj.matrix_world = world
    return obj


def to_scale(s):
    # Design (x, up, forward) sizes to Blender axes.
    return (s[0], s[2], s[1])


def build_face(arm):
    eye = principled("Eye", (0.012, 0.005, 0.003), roughness=0.07, specular=0.8)
    shine = principled("EyeShine", (1, 1, 1), roughness=0.2)
    shine.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 1
    shine.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (1, 1, 1, 1)
    nose = principled("Nose", (0.015, 0.008, 0.006), roughness=0.34, specular=0.5)
    tongue = principled("Tongue", (0.9, 0.28, 0.36), roughness=0.5)
    mouth = principled("Mouth", (0.12, 0.018, 0.03), roughness=0.75)
    lip = principled("Lip", (0.1, 0.05, 0.035), roughness=0.75)
    pink = principled("Ribbon", (1.0, 0.3, 0.56), roughness=0.55)
    pink_dark = principled("RibbonDark", (0.8, 0.12, 0.36), roughness=0.6)
    gold = principled("Bell", (0.92, 0.6, 0.12), roughness=0.3, metallic=0.75)

    made = []
    for side, x in (("L", 0.2), ("R", -0.2)):
        y = 2.33
        z = surface_z(x, y) - 0.035
        made.append(add_part(f"Eye_{side}", "Head", arm, eye, (x, y, z), (0.085, 0.092, 0.06)))
        made.append(add_part(f"EyeShine_{side}", "Head", arm, shine, (x - 0.026, y + 0.036, z + 0.055), (0.02, 0.023, 0.008)))
    tip_y, tip_z = 2.2, surface_z(0, 2.2)
    made.append(add_part("Nose", "Head", arm, nose, (0, tip_y, tip_z - 0.015), (0.066, 0.05, 0.05)))
    # Small smile on the muzzle.
    mouth_y = 2.09
    mouth_z = surface_z(0, mouth_y)
    made.append(add_part("Mouth", "Head", arm, mouth, (0, mouth_y, mouth_z - 0.018), (0.075, 0.018, 0.04)))
    made.append(add_part("Tongue", "Head", arm, tongue, (0, mouth_y - 0.022, mouth_z - 0.012), (0.045, 0.045, 0.02)))
    made.append(add_part("Philtrum", "Head", arm, lip, (0, 2.145, surface_z(0, 2.145) - 0.002), (0.006, 0.03, 0.006)))
    # Bow on the right of the crown, and a collar with a small bell.
    bx, by = 0.3, 2.62
    bz = surface_z(bx, by) + 0.08
    made.append(add_part("Bow_A", "Head", arm, pink, (bx + 0.13, by, bz), (0.13, 0.095, 0.055), (0, 0.25, 0)))
    made.append(add_part("Bow_B", "Head", arm, pink, (bx - 0.13, by, bz), (0.13, 0.095, 0.055), (0, -0.25, 0)))
    made.append(add_part("Bow_Knot", "Head", arm, pink_dark, (bx, by, bz + 0.02), (0.04, 0.04, 0.035)))
    made.append(add_part("Collar", "Neck", arm, pink_dark, (0, 1.78, 0.9), (0.38, 0.04), (0.72, 0, 0), kind="torus"))
    made.append(add_part("Bell", "Neck", arm, gold, (0, 1.56, 1.17), (0.06, 0.06, 0.06)))
    return made


def save_report():
    os.makedirs(os.path.join(OUT, "qa"), exist_ok=True)
    with open(os.path.join(OUT, "qa", f"build_report_{DETAIL}.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1)


def main():
    wipe()
    body, skin_verts, curl_root = build_body()
    arm = build_armature()
    skin_weights(body, arm, skin_verts, curl_root)
    log("skinned", bones=len(arm.data.bones))
    bpy.context.view_layer.objects.active = arm
    parts = build_face(arm)
    log("face and accessories", parts=len(parts))
    actions, speeds = animation.bake_all(arm)
    log("clips", clips=sorted(actions), **speeds)
    report["speeds"] = speeds

    # Show the standing pose in the working file.
    arm.animation_data.action = actions["Idle"]
    bpy.context.scene.frame_set(1)
    bpy.context.scene.render.fps = animation.FPS

    os.makedirs(os.path.join(OUT, "source"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "export"), exist_ok=True)
    if DETAIL == "high":
        blend = os.path.join(OUT, "source", "poodle_working.blend")
        bpy.ops.wm.save_as_mainfile(filepath=blend)
        log("saved blend", path=blend)

    glb = os.path.join(OUT, "export", "poodle.glb" if DETAIL == "high" else f"poodle_{DETAIL}.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format="GLB", use_selection=False, export_animations=True,
        export_animation_mode="ACTIONS", export_skins=True, export_force_sampling=True,
        export_frame_step=1, export_yup=True, export_apply=False, export_materials="EXPORT",
    )
    log("exported glb", path=glb, megabytes=round(os.path.getsize(glb) / 1048576, 2))
    report["triangles"] = sum(len(o.data.polygons) * 2 for o in bpy.data.objects if o.type == "MESH" and o.name == "PoodleBody")
    report["seconds"] = round(time.time() - started, 1)
    save_report()


try:
    main()
except Exception as error:
    report["error"] = repr(error)
    save_report()
    raise

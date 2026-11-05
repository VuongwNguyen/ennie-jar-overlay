"""Bakes the clips. Poses are solved in the side view (up, forward), then written as bone rotations.

Angle convention: rotating about x by +a moves a point hanging straight down backwards.
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

from poodle import JOINT

FPS = 30
LEGS = {"FL": "Front%s_L", "FR": "Front%s_R", "BL": "Hind%s_L", "BR": "Hind%s_R"}
ANKLE_Y = 0.14
STRIDE, STANCE, LIFT = 0.62, 0.62, 0.17


def turn(v, a):
    return (v[0] * math.cos(a) - v[1] * math.sin(a), v[0] * math.sin(a) + v[1] * math.cos(a))


def offset(a, b):
    return (JOINT[a][1] - JOINT[b][1], JOINT[a][2] - JOINT[b][2])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def solve_leg(hip, target, upper, lower):
    """Two-bone leg with the knee forward; returns world angles of the upper and lower bones."""
    dy, dz = target[0] - hip[0], target[1] - hip[1]
    reach = max(0.05, min(math.hypot(dy, dz), (upper + lower) * 0.995))
    aim = math.atan2(-dz, -dy)
    a = math.acos(min(1, (upper * upper + reach * reach - lower * lower) / (2 * upper * reach)))
    b = math.acos(min(1, (lower * lower + reach * reach - upper * upper) / (2 * lower * reach)))
    return aim - a, aim + b


def rx(a):
    return Quaternion((1, 0, 0), a)


def ry(a):
    # Armature y points backwards from the dog.
    return Quaternion((0, 1, 0), a)


def rz(a):
    return Quaternion((0, 0, 1), a)


class Rig:
    def __init__(self, armature):
        self.arm = armature
        self.rest = {b.name: b.matrix_local.to_quaternion() for b in armature.data.bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in armature.data.bones}
        for pb in armature.pose.bones:
            pb.rotation_mode = "QUATERNION"

    def key(self, world, pelvis_delta, frame):
        """`world`: rotation of each bone relative to its rest pose, in armature space."""
        identity = Quaternion()
        for pb in self.arm.pose.bones:
            name = pb.name
            d = world.get(name, identity)
            parent = world.get(self.parent[name], identity) if self.parent[name] else identity
            r = self.rest[name]
            pb.rotation_quaternion = r.inverted() @ (parent.inverted() @ d) @ r
            pb.keyframe_insert("rotation_quaternion", frame=frame)
        pelvis = self.arm.pose.bones["Pelvis"]
        pelvis.location = self.rest["Pelvis"].inverted() @ Vector((0, -pelvis_delta[1], pelvis_delta[0]))
        pelvis.keyframe_insert("location", frame=frame)


def pose(p):
    """p: pelvis (up, forward), pelvis/spine/chest angles, neck and head angles, tail, ears and ankle targets."""
    a0 = p["pelvis_angle"]
    a1 = a0 + p.get("spine", 0)
    a2 = a1 + p.get("chest", 0)
    pelvis_at = p["pelvis"]
    spine_at = add(pelvis_at, turn(offset("Spine", "Pelvis"), a0))
    chest_at = add(spine_at, turn(offset("Chest", "Spine"), a1))
    roll = p.get("roll", 0)
    world = {
        "Pelvis": ry(roll) @ rx(a0),
        "Spine": ry(roll * 0.4) @ rx(a1),
        "Chest": ry(-roll) @ rx(a2),
        "Neck": rx(p.get("neck", 0)),
        "Head": rz(p.get("head_yaw", 0)) @ ry(p.get("head_tilt", 0)) @ rx(p.get("head", 0)),
        "Tail1": rx(a0) @ rz(p.get("tail_wag", 0)) @ rx(p.get("tail_lift", 0)),
        "Tail2": rx(a0) @ rz(p.get("tail_wag", 0) * 1.6) @ rx(p.get("tail_lift", 0) * 1.3),
        "Ear_L": rx(p.get("ear", 0)) @ ry(-p.get("ear_out", 0)),
        "Ear_R": rx(p.get("ear", 0)) @ ry(p.get("ear_out", 0)),
    }
    for key, pattern in LEGS.items():
        up, low, paw = pattern % "Upper", pattern % "Lower", pattern % "Paw"
        front = key[0] == "F"
        hip_at = add(chest_at, turn(offset(up, "Chest"), a2)) if front else add(pelvis_at, turn(offset(up, "Pelvis"), a0))
        upper = JOINT[up][1] - JOINT[low][1]
        lower = JOINT[low][1] - JOINT[paw][1]
        target = p["ankles"][key]
        ua, la = solve_leg(hip_at, (target[0], target[1]), upper, lower)
        splay = p.get("splay", 0) * (1 if key[1] == "L" else -1) * (0 if front else 1)
        world[up] = ry(splay) @ rx(ua)
        world[low] = ry(splay) @ rx(la)
        world[paw] = rx(target[2] if len(target) > 2 else 0)
    delta = (pelvis_at[0] - JOINT["Pelvis"][1], pelvis_at[1] - JOINT["Pelvis"][2])
    return world, delta


def stand(bob=0.0, pitch=0.0, crouch=0.0):
    ankles = {k: (ANKLE_Y, JOINT[LEGS[k] % "Paw"][2], 0) for k in LEGS}
    return {
        "pelvis": (JOINT["Pelvis"][1] + bob - crouch * 0.24, JOINT["Pelvis"][2]),
        "pelvis_angle": pitch,
        "ankles": ankles,
        "neck": 0.0, "head": 0.03, "tail_lift": 0.1,
    }


SIT = {
    "pelvis": (0.56, -0.42), "pelvis_angle": -0.72, "chest": 0.12, "splay": 0.2,
    "ankles": {
        "FL": (ANKLE_Y, 0.56, 0), "FR": (ANKLE_Y, 0.56, 0),
        "BL": (ANKLE_Y, -0.1, 0), "BR": (ANKLE_Y, -0.1, 0),
    },
    "neck": 0.0, "head": 0.03, "tail_lift": 0.9,
}


def mix(a, b, t):
    out = dict(a)
    for key, value in b.items():
        base = a.get(key, 0)
        if key == "ankles":
            out[key] = {k: tuple(u + (v - u) * t for u, v in zip(base[k], value[k])) for k in value}
        elif isinstance(value, tuple):
            out[key] = tuple(u + (v - u) * t for u, v in zip(base, value))
        else:
            out[key] = base + (value - base) * t
    return out


def eased(t):
    return t * t * (3 - 2 * t)


def step_at(t, stride=STRIDE, stance=STANCE, lift=LIFT):
    """A paw stays planted while the body passes over it, then swings forward in an arc."""
    if t < stance:
        return stride / 2 + (-stride) * (t / stance), 0.0, 0.0
    s = (t - stance) / (1 - stance)
    swing = math.sin(math.pi * s)
    return -stride / 2 + stride * eased(s), lift * swing, swing


def walk(t):
    """Four beats: back left, front left, back right, front right."""
    beat = {"BL": 0.0, "FL": 0.25, "BR": 0.5, "FR": 0.75}
    w = 2 * math.pi * t
    p = stand(bob=math.sin(w * 2) * 0.018, pitch=math.sin(w * 2 + 0.6) * 0.012)
    for key, offs in beat.items():
        z, lift, swing = step_at((t + offs) % 1)
        rest = JOINT[LEGS[key] % "Paw"][2]
        p["ankles"][key] = (ANKLE_Y + lift, rest + z, swing * 0.55)
    p["roll"] = math.sin(w) * 0.03
    p["head"] = 0.03 + math.sin(w * 2 - 0.9) * 0.02
    p["tail_wag"] = math.sin(w) * 0.32
    p["ear"] = math.sin(w * 2 - 1.5) * 0.08
    return p


def run(t):
    """A bounding run: hind legs push together, front legs reach together, with a moment in the air."""
    w = 2 * math.pi * t
    beat = {"BL": 0.0, "BR": 0.07, "FL": 0.42, "FR": 0.5}
    p = stand(bob=math.sin(w * 2 + 0.5) * 0.05 + 0.03, pitch=math.sin(w) * 0.13)
    for key, offs in beat.items():
        z, lift, swing = step_at((t + offs) % 1, stride=0.92, stance=0.42, lift=0.26)
        rest = JOINT[LEGS[key] % "Paw"][2]
        p["ankles"][key] = (ANKLE_Y + lift, rest + z, swing * 0.8)
    p["head"] = 0.03 - math.sin(w) * 0.06
    p["neck"] = -0.06
    p["tail_wag"] = math.sin(w) * 0.22
    p["tail_lift"] = 0.3
    p["ear"] = 0.25 + math.sin(w * 2 - 1.2) * 0.2
    return p


def jump(t):
    """Crouch, push off with the chest rising and legs stretched, land nose first, absorb the landing."""
    p = stand()
    keys = [
        (0.0, dict(crouch=0.0, pitch=0.0, air=0.0)), (0.22, dict(crouch=1.0, pitch=0.14, air=0.0)),
        (0.38, dict(crouch=0.0, pitch=-0.42, air=1.0)), (0.62, dict(crouch=0.0, pitch=0.3, air=0.6)),
        (0.72, dict(crouch=0.9, pitch=0.0, air=0.0)), (1.0, dict(crouch=0.0, pitch=0.0, air=0.0)),
    ]
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = eased((t - t0) / (t1 - t0))
            v = {k: a[k] + (b[k] - a[k]) * u for k in a}
            break
    p = stand(pitch=v["pitch"], crouch=v["crouch"])
    # In the air the ankles stay at a fixed distance from the hips, not on the ground.
    p["air"] = v["air"]
    p["ear"] = v["air"] * 0.5
    p["tail_lift"] = 0.1 + v["air"] * 0.5
    return p


def bake(rig, name, frames, fn, loop=True):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.arm.animation_data_create()
    rig.arm.animation_data.action = action
    for f in range(frames + 1):
        t = f / frames
        params = fn(t % 1 if loop else t)
        air = params.pop("air", 0)
        if air:
            a0 = params["pelvis_angle"]
            pelvis_at = params["pelvis"]
            spine_at = add(pelvis_at, turn(offset("Spine", "Pelvis"), a0))
            chest_at = add(spine_at, turn(offset("Chest", "Spine"), a0))
            for key, pattern in LEGS.items():
                up = pattern % "Upper"
                front = key[0] == "F"
                hip = add(chest_at, turn(offset(up, "Chest"), a0)) if front else add(pelvis_at, turn(offset(up, "Pelvis"), a0))
                ground = params["ankles"][key]
                reach = (hip[0] - 0.74, hip[1] + 0.32) if front else (hip[0] - 0.82, hip[1] - 0.38)
                params["ankles"][key] = (
                    ground[0] + (reach[0] - ground[0]) * air,
                    ground[1] + (reach[1] - ground[1]) * air,
                    air * 0.7,
                )
        world, delta = pose(params)
        rig.key(world, delta, f + 1)
    return action


def bake_all(armature):
    rig = Rig(armature)
    breathe = lambda t: math.sin(2 * math.pi * t)
    wag = lambda t, n=1: math.sin(2 * math.pi * t * n)

    def idle(t):
        p = stand(bob=breathe(t) * 0.006)
        p["tail_wag"] = wag(t, 2) * 0.16
        return p

    def sit(t):
        p = dict(SIT)
        p["pelvis"] = (SIT["pelvis"][0] + breathe(t) * 0.004, SIT["pelvis"][1])
        p["tail_wag"] = wag(t, 2) * 0.2
        return p

    def tail_wag(t):
        p = stand()
        p["tail_wag"] = wag(t, 3) * 0.55
        p["tail_lift"] = 0.35
        return p

    def head_tilt(t):
        p = stand()
        k = math.sin(math.pi * t)
        p["head_tilt"] = k * 0.36
        p["ear_out"] = k * 0.28
        return p

    made = {
        "Idle": bake(rig, "Idle", 90, idle),
        "Walk": bake(rig, "Walk", 34, walk),
        "Run": bake(rig, "Run", 16, run),
        "Sit": bake(rig, "Sit", 90, sit),
        "SitDown": bake(rig, "SitDown", 16, lambda t: mix(stand(), SIT, eased(t)), loop=False),
        "StandUp": bake(rig, "StandUp", 14, lambda t: mix(SIT, stand(), eased(t)), loop=False),
        "TailWag": bake(rig, "TailWag", 45, tail_wag),
        "HeadTilt": bake(rig, "HeadTilt", 45, head_tilt, loop=False),
        "Jump": bake(rig, "Jump", 22, jump, loop=False),
    }
    return made, {
        "walkSpeed": round((STRIDE / STANCE) / (34 / FPS), 3),
        "runSpeed": round((0.92 / 0.42) / (16 / FPS), 3),
    }

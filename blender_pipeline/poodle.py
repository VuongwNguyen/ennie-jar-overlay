"""The poodle's character sheet: body shape, skeleton, colours and fur zones.

Everything specific to this breed lives here, so another animal only needs its own sheet.
Design coordinates: x is sideways, y is up with the ground at 0, z points where the dog faces.
"""
import numpy as np

from geometry import capsule, curly_wool, ellipsoid, smin, smoothstep

FUR = (0.62, 0.30, 0.12)        # apricot (linear colour values)
FUR_DARK = (0.3, 0.125, 0.045)  # hollows between tufts
FUR_LIGHT = (0.76, 0.42, 0.18)  # tops of tufts
MUZZLE = (0.74, 0.46, 0.25)
SKIN_UNDER_FUR = (0.33, 0.14, 0.05)

# The coat is sculpted into the skin as tufts. Separate tube curls (fur.py) looked like crumbs, so they stay off.
LOOSE_CURLS = False

# Rest pose: standing, with every leg bone hanging straight down, so an angle of 0 means "at rest".
JOINT = {
    "Pelvis": (0, 1.34, -0.55), "Spine": (0, 1.36, -0.05), "Chest": (0, 1.36, 0.45),
    "Neck": (0, 1.62, 0.78), "Head": (0, 2.08, 1.08),
    "Tail1": (0, 1.62, -0.98), "Tail2": (0, 1.86, -1.14), "TailEnd": (0, 2.12, -1.28),
    "FrontUpper_L": (0.26, 1.02, 0.66), "FrontLower_L": (0.26, 0.56, 0.66), "FrontPaw_L": (0.26, 0.14, 0.66),
    "FrontUpper_R": (-0.26, 1.02, 0.66), "FrontLower_R": (-0.26, 0.56, 0.66), "FrontPaw_R": (-0.26, 0.14, 0.66),
    "HindUpper_L": (0.28, 1.16, -0.72), "HindLower_L": (0.28, 0.62, -0.72), "HindPaw_L": (0.28, 0.14, -0.72),
    "HindUpper_R": (-0.28, 1.16, -0.72), "HindLower_R": (-0.28, 0.62, -0.72), "HindPaw_R": (-0.28, 0.14, -0.72),
    "Ear_L": (0.40, 2.44, 1.06), "Ear_R": (-0.40, 2.44, 1.06),
}
PARENT = {
    "Pelvis": "Root", "Spine": "Pelvis", "Chest": "Spine", "Neck": "Chest", "Head": "Neck",
    "Tail1": "Pelvis", "Tail2": "Tail1",
    "FrontUpper_L": "Chest", "FrontLower_L": "FrontUpper_L", "FrontPaw_L": "FrontLower_L",
    "FrontUpper_R": "Chest", "FrontLower_R": "FrontUpper_R", "FrontPaw_R": "FrontLower_R",
    "HindUpper_L": "Pelvis", "HindLower_L": "HindUpper_L", "HindPaw_L": "HindLower_L",
    "HindUpper_R": "Pelvis", "HindLower_R": "HindUpper_R", "HindPaw_R": "HindLower_R",
    "Ear_L": "Head", "Ear_R": "Head",
}
# Where each bone ends, for the bones that have no child to point at.
TAIL_OF = {
    "Pelvis": "Spine", "Spine": "Chest", "Chest": "Neck", "Neck": "Head", "Tail1": "Tail2", "Tail2": "TailEnd",
    "FrontUpper_L": "FrontLower_L", "FrontLower_L": "FrontPaw_L", "FrontUpper_R": "FrontLower_R", "FrontLower_R": "FrontPaw_R",
    "HindUpper_L": "HindLower_L", "HindLower_L": "HindPaw_L", "HindUpper_R": "HindLower_R", "HindLower_R": "HindPaw_R",
}
TAIL_POINT = {
    "Root": (0, 0.3, 0), "Head": (0, 2.5, 1.12),
    "FrontPaw_L": (0.26, 0.06, 0.92), "FrontPaw_R": (-0.26, 0.06, 0.92),
    "HindPaw_L": (0.28, 0.06, -0.48), "HindPaw_R": (-0.28, 0.06, -0.48),
    "Ear_L": (0.52, 1.8, 1.06), "Ear_R": (-0.52, 1.8, 1.06),
}

# The stretch of skin each bone carries: (bone, from, to, thickness). A point follows the bones it
# is deep inside, relative to how thick they are, so a thin leg does not drag the ribcage with it.
SKIN = [
    ("Pelvis", (0, 1.34, -1.2), (0, 1.36, -0.25), 0.5), ("Spine", (0, 1.36, -0.25), (0, 1.36, 0.25), 0.5),
    ("Chest", (0, 1.34, 0.25), (0, 1.3, 0.95), 0.55), ("Neck", (0, 1.62, 0.78), (0, 2.08, 1.08), 0.34),
    ("Head", (0, 2.2, 1.12), (0, 2.6, 1.1), 0.5), ("Head", (0, 2.2, 1.2), (0, 2.14, 1.68), 0.28),
    ("Tail1", (0, 1.62, -0.98), (0, 1.86, -1.14), 0.11), ("Tail2", (0, 1.86, -1.14), (0, 2.3, -1.34), 0.2),
    ("Ear_L", (0.42, 2.42, 1.06), (0.52, 1.72, 1.06), 0.27), ("Ear_R", (-0.42, 2.42, 1.06), (-0.52, 1.72, 1.06), 0.27),
]
for side, sign in (("L", 1), ("R", -1)):
    for limb, x, hip_y, knee_y, ankle_y, z, toe, thick in (
        ("Front", 0.26, 1.02, 0.56, 0.14, 0.66, 0.92, (0.2, 0.15)),
        ("Hind", 0.28, 1.16, 0.62, 0.14, -0.72, -0.48, (0.3, 0.16)),
    ):
        x_side = x * sign
        SKIN += [
            (f"{limb}Upper_{side}", (x_side, hip_y, z), (x_side, knee_y, z), thick[0]),
            (f"{limb}Lower_{side}", (x_side, knee_y, z), (x_side, ankle_y, z), thick[1]),
            (f"{limb}Paw_{side}", (x_side, ankle_y, z), (x_side, 0.06, toe), 0.17),
        ]


def snout(x, y, z):
    return capsule(x, y, z, (0, 2.24, 1.36), (0, 2.17, 1.66), 0.19, 0.145)


def face_open(x, y, z):
    """0 on the clipped face and muzzle, 1 where the coat is full."""
    eyes_and_brow = np.sqrt((x / 0.44) ** 2 + ((y - 2.26) / 0.25) ** 2 + (np.maximum(1.42 - z, 0) / 0.24) ** 2)
    return np.minimum(smoothstep(0.82, 1.2, eyes_and_brow), smoothstep(0.02, 0.1, snout(x, y, z)))


def wool_amount(ax, y, z):
    """How deep the curls are here: none on the clipped face, shallow on the paws, fullest on the crown."""
    amount = 0.078 * face_open(ax, y, z)
    amount = amount * (0.5 + 0.5 * smoothstep(0.12, 0.42, y))
    return amount * (1 + 0.3 * smoothstep(2.3, 2.7, y))


def shape_distance(x, y, z):
    """The body before the coat. x is |x|: the left and right sides are mirrored."""
    # Deep chest, slimmer loin and a rounded rump.
    d = capsule(x, y, z, (0, 1.36, -0.5), (0, 1.3, 0.4), 0.38, 0.42)
    d = smin(d, ellipsoid(x, y, z, (0, 1.22, 0.48), (0.4, 0.5, 0.48)), 0.22)
    d = smin(d, ellipsoid(x, y, z, (0, 1.36, -0.62), (0.39, 0.42, 0.44)), 0.22)
    d = smin(d, capsule(x, y, z, (0, 1.5, 0.68), (0, 2.08, 1.08), 0.32, 0.25), 0.2)
    # Legs taper all the way to a round paw.
    leg = capsule(x, y, z, (0.26, 1.02, 0.66), (0.26, 0.56, 0.66), 0.2, 0.145)
    leg = smin(leg, capsule(x, y, z, (0.26, 0.56, 0.66), (0.26, 0.14, 0.66), 0.14, 0.115), 0.05)
    leg = smin(leg, ellipsoid(x, y, z, (0.26, 0.085, 0.76), (0.15, 0.085, 0.2)), 0.08)
    d = smin(d, leg, 0.16)
    leg = capsule(x, y, z, (0.28, 1.16, -0.72), (0.28, 0.62, -0.72), 0.31, 0.16)
    leg = smin(leg, capsule(x, y, z, (0.28, 0.62, -0.72), (0.28, 0.14, -0.72), 0.15, 0.115), 0.05)
    leg = smin(leg, ellipsoid(x, y, z, (0.28, 0.085, -0.62), (0.15, 0.085, 0.2)), 0.08)
    d = smin(d, leg, 0.16)
    # Round skull flowing into a woolly crown, with no lump between them.
    head = ellipsoid(x, y, z, (0, 2.3, 1.1), (0.44, 0.42, 0.42))
    head = smin(head, ellipsoid(x, y, z, (0, 2.42, 1.05), (0.47, 0.42, 0.44)), 0.45)
    head = smin(head, ellipsoid(x, y, z, (0.2, 2.2, 1.28), (0.2, 0.17, 0.18)), 0.14)
    head = smin(head, snout(x, y, z), 0.1)
    d = smin(d, head, 0.1)
    # A slim tail, and the poodle's round pompom at its tip.
    tail = capsule(x, y, z, (0, 1.6, -0.96), (0, 2.02, -1.24), 0.08, 0.055)
    tail = smin(tail, ellipsoid(x, y, z, (0, 2.14, -1.3), (0.19, 0.19, 0.19)), 0.05)
    d = smin(d, tail, 0.08)
    # Long hanging ears are kept separate from the head, so they can swing.
    ear = capsule(x, y, z, (0.42, 2.42, 1.06), (0.5, 1.96, 1.06), 0.13, 0.2)
    ear = smin(ear, ellipsoid(x, y, z, (0.52, 1.84, 1.06), (0.2, 0.2, 0.2)), 0.1)
    return np.minimum(d, ear)


def body_distance(x, y, z):
    """The full body with its coat. The tufts use the real x, so the two sides are not mirror images."""
    ax = np.abs(x)
    d = shape_distance(ax, y, z)
    # Tufts are only worked out close to the surface, which keeps the build fast.
    near = np.abs(d) < 0.22
    if not near.any():
        return d
    height = curly_wool(x[near], y[near], z[near])[0]
    out = d.copy()
    out[near] = d[near] - wool_amount(ax[near], y[near], z[near]) * height
    return out


def skin_colour(x, y, z):
    """Colour of the mesh below the curls: dark under the coat, lighter on the clipped face."""
    ax = np.abs(x)
    open_coat = face_open(ax, y, z)[:, None]
    near_snout = 1 - smoothstep(-0.02, 0.09, snout(ax, y, z))[:, None]
    height, shade = curly_wool(x, y, z)
    height = height[:, None] ** 0.8
    # Hollows between tufts are darker, tops lighter, and each tuft has its own slight shade.
    coat = np.array(FUR_DARK) * (1 - height) + np.array(FUR_LIGHT) * height
    coat = coat * (0.9 + 0.2 * shade[:, None])
    colours = coat * open_coat + np.array(FUR) * (1 - open_coat)
    return colours * (1 - near_snout) + np.array(MUZZLE) * near_snout


def fur_zone(p):
    """Length factor of the curls at this point; 0 leaves it bare (face, muzzle, inside the mouth)."""
    x, y, z = np.abs(p[:, 0]), p[:, 1], p[:, 2]
    scale = face_open(x, y, z).copy()
    scale[y < 0.1] *= 0.55                                # short on the paws
    scale *= 1 + 0.35 * smoothstep(2.35, 2.75, y)         # fullest on the crown
    pom = np.sqrt(x * x + (y - 2.14) ** 2 + (z + 1.3) ** 2) < 0.3
    scale[pom] *= 1.2
    # Keep the bow and the collar visible.
    scale[np.sqrt((x - 0.3 * (p[:, 0] > 0)) ** 2 + (y - 2.62) ** 2 + (z - 1.2) ** 2) < 0.3 * (p[:, 0] > 0)] = 0
    collar = np.abs((y - 1.8) * 0.75 - (z - 0.9) * 0.66) < 0.06
    scale[collar & (z > 0.6) & (y > 1.4) & (y < 2.1)] *= 0.25
    return scale


def growth_direction(p, n):
    """Which way the coat grows, by region, as in the production brief."""
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    side = np.sign(x) + (x == 0)
    flow = np.zeros_like(p)
    flow[:, 0] = side * 0.55
    flow[:, 1] = -0.8
    flow[:, 2] = -0.25                                    # back: out from the spine and down
    legs = y < 1.0
    flow[legs] = (0, -1, 0)                               # legs: along the limb
    chest = (z > 0.55) & (y < 1.7) & (y >= 1.0)
    flow[chest] = (0, -1, 0.2)                            # chest: down
    head = (z > 0.6) & (y > 2.0)
    flow[head] = np.stack([side[head] * 0.6, np.full(head.sum(), 0.15), np.full(head.sum(), 0.15)], axis=1)  # forehead: outwards, clear of the eyes
    ears = (np.abs(x) > 0.34) & (y > 1.6) & (z > 0.6)
    flow[ears] = (0, -1, 0)                               # ears: down from the root
    tail = (z < -0.9) & (y > 1.55)
    flow[tail] = n[tail]                                  # pompom: outwards
    return flow

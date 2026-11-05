"""Curly coat as real geometry: three sizes of curl, growing in the direction set by the character sheet.

A curl is a smooth tube wound into a ringlet lying close to the skin, thin enough for its spiral to
show. Curls vary in size, turn, thickness and colour, and are spread evenly, so the coat has no bald
patches or visible repeats. `detail` trades smoothness for weight, which gives the levels of detail.
"""
import numpy as np

# name, spacing between curls, length, winding radius, tube radius, turns
LAYERS = [
    ("large", 0.27, 0.2, 0.058, 0.03, 1.8),
    ("medium", 0.2, 0.15, 0.042, 0.022, 1.9),
    ("fine", 0.2, 0.1, 0.028, 0.015, 2.0),
]
DETAIL = {
    "high": {"large": (12, 5), "medium": (10, 5), "fine": (8, 3)},   # rings along a curl, corners around it
    "web": {"large": (8, 4), "medium": (7, 3), "fine": (5, 3)},
}


def sample_surface(verts, tris, count, rng):
    a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
    chosen = rng.choice(len(tris), size=count, p=area / area.sum())
    u, v = rng.random(count), rng.random(count)
    flip = u + v > 1
    u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
    points = a[chosen] + (b[chosen] - a[chosen]) * u[:, None] + (c[chosen] - a[chosen]) * v[:, None]
    return points, chosen


def spread_evenly(points, spacing, rng):
    """Keeps at most one point in each cell of a jittered grid, which avoids clusters and gaps."""
    shift = rng.random(3) * spacing
    cells = np.floor((points + shift) / spacing).astype(np.int64)
    _, keep = np.unique(cells, axis=0, return_index=True)
    return np.sort(keep)


def build_curls(verts, tris, vertex_normals, zone, growth, colours, detail="high", seed=7):
    """Returns positions, quads, colours and the surface point each vertex's curl grows from."""
    rng = np.random.default_rng(seed)
    out_pos, out_quads, out_col, out_root = [], [], [], []
    base, dark, light = colours
    offset = 0
    stats = {}
    for name, spacing, length, winding, tube, turns in LAYERS:
        rings, sides = DETAIL[detail][name]
        s = np.linspace(0, 1, rings)
        ring_a = 2 * np.pi * np.arange(sides) / sides
        roots, chosen = sample_surface(verts, tris, 60000, rng)
        n = vertex_normals[tris[chosen]].mean(axis=1)
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        scale = zone(roots)
        keep = scale > 0.15
        roots, n, scale = roots[keep], n[keep], scale[keep]
        keep = spread_evenly(roots, spacing, rng)
        roots, n, scale = roots[keep], n[keep], scale[keep]
        flow = growth(roots, n)
        flow -= n * np.einsum("ij,ij->i", flow, n)[:, None]
        # Ringlets lie along the growth direction, lifted just enough to stand out from the skin.
        axis = flow / np.maximum(np.linalg.norm(flow, axis=1, keepdims=True), 1e-6) * 0.85 + n * 0.45
        axis += rng.normal(0, 0.3, axis.shape)
        axis /= np.linalg.norm(axis, axis=1, keepdims=True)
        side = np.cross(axis, rng.normal(size=axis.shape))
        side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-6)
        other = np.cross(axis, side)

        m = len(roots)
        size = scale * rng.uniform(0.8, 1.25, m)
        length_i = length * size
        winding_i = winding * size * rng.uniform(0.85, 1.2, m)
        tube_i = tube * size * rng.uniform(0.85, 1.15, m)
        turn_i = turns * rng.uniform(0.8, 1.25, m) * rng.choice((-1, 1), m)
        phase = rng.uniform(0, 2 * np.pi, m)
        angle = phase[:, None] + 2 * np.pi * turn_i[:, None] * s[None, :]
        # The root starts below the skin, so a curl emerges from the coat rather than sitting on it.
        start = roots - n * tube_i[:, None]
        wind = np.minimum(s * 3, 1)[None, :]
        line = (
            start[:, None, :]
            + axis[:, None, :] * (length_i[:, None] * s[None, :])[..., None]
            + side[:, None, :] * (np.cos(angle) * winding_i[:, None] * wind)[..., None]
            + other[:, None, :] * (np.sin(angle) * winding_i[:, None] * wind)[..., None]
        )
        # Full along its length and rounded off at the tip.
        radius = tube_i[:, None] * np.minimum(1.0, (1 - s[None, :]) * 4 + 0.2)
        # The rings stay square to the path, so the tube keeps a round section along the spiral.
        tangent = np.gradient(line, axis=1)
        tangent /= np.maximum(np.linalg.norm(tangent, axis=2, keepdims=True), 1e-9)
        normal = np.cross(tangent, axis[:, None, :])
        normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-9)
        binormal = np.cross(tangent, normal)
        pos = (
            line[:, :, None, :]
            + normal[:, :, None, :] * (np.cos(ring_a)[None, None, :] * radius[:, :, None])[..., None]
            + binormal[:, :, None, :] * (np.sin(ring_a)[None, None, :] * radius[:, :, None])[..., None]
        )
        # Each curl has its own shade; colour runs from dark in the root to lighter on the tip.
        tint = rng.uniform(-0.13, 0.13, m)[:, None, None]
        along = (s ** 0.75)[None, :, None]
        col = np.array(dark)[None, None, :] * (1 - along) + np.array(light)[None, None, :] * along
        col = (col * 0.62 + np.array(base)[None, None, :] * 0.38) * (1 + tint)
        col = np.repeat(col[:, :, None, :], sides, axis=2)

        ring = np.arange(rings - 1)[None, :, None]
        corner = np.arange(sides)[None, None, :]
        first = np.arange(m)[:, None, None] * rings * sides + ring * sides
        a = first + corner
        b = first + (corner + 1) % sides
        quads = np.stack([a, b, b + sides, a + sides], axis=-1).reshape(-1, 4)
        # Faces must point away from the centre line of their curl.
        flat = pos.reshape(-1, 3)
        centres = np.repeat(line, sides, axis=1).reshape(-1, 3)
        p0, p1, p2 = flat[quads[:, 0]], flat[quads[:, 1]], flat[quads[:, 2]]
        outward = np.einsum("ij,ij->i", np.cross(p1 - p0, p2 - p0), p0 - centres[quads[:, 0]])
        quads[outward < 0] = quads[outward < 0][:, ::-1]

        out_pos.append(flat)
        out_col.append(np.clip(col.reshape(-1, 3), 0, 1))
        out_root.append(np.repeat(roots, rings * sides, axis=0))
        out_quads.append(quads + offset)
        offset += m * rings * sides
        stats[name] = int(m)
    return np.concatenate(out_pos), np.concatenate(out_quads), np.concatenate(out_col), np.concatenate(out_root), stats

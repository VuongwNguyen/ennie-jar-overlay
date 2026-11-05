"""Shapes as distance functions, and the mesher that turns them into one closed, smooth skin.

Design coordinates: x is sideways, y is up with the ground at 0, z points where the dog faces.
Blending shapes with a smooth minimum is what removes every seam between the parts of the body.
"""
import numpy as np


def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def capsule(x, y, z, a, b, ra, rb):
    ax, ay, az = a
    bx, by, bz = b[0] - ax, b[1] - ay, b[2] - az
    px, py, pz = x - ax, y - ay, z - az
    t = np.clip((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0.0, 1.0)
    return np.sqrt((px - bx * t) ** 2 + (py - by * t) ** 2 + (pz - bz * t) ** 2) - (ra + (rb - ra) * t)


def ellipsoid(x, y, z, c, r):
    px, py, pz = (x - c[0]) / r[0], (y - c[1]) / r[1], (z - c[2]) / r[2]
    k0 = np.sqrt(px * px + py * py + pz * pz)
    k1 = np.sqrt((px / r[0]) ** 2 + (py / r[1]) ** 2 + (pz / r[2]) ** 2)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def wool(x, y, z):
    """Soft uneven tufts, 0 in a hollow and 1 on top. Even in x, so the centre line has no crease."""
    wy = y + 0.07 * np.cos(x * 8 + 0.6) + 0.05 * np.sin(z * 6 + 1.7)
    wz = z + 0.07 * np.sin(y * 7 + 2.3) + 0.05 * np.cos(x * 9)
    large = np.cos(13 * x) * np.sin(13 * wy + 0.8) * np.sin(13 * wz + 1.9)
    small = np.cos(25 * x) * np.sin(25 * wz + 0.3) * np.sin(25 * wy + 2.4)
    return np.clip(0.5 + 0.62 * large + 0.26 * small, 0.0, 1.0)


def _hash3(cells, seed):
    """Stable random numbers in 0..1 for integer grid cells, shape (n, 3)."""
    c = cells.astype(np.float64)
    v = np.sin(c[:, 0] * 127.1 + c[:, 1] * 311.7 + c[:, 2] * 74.7 + seed * 53.3) * 43758.5453
    return v - np.floor(v)


def curly_wool(x, y, z, spacing=0.108):
    """Packed tufts of curly wool. Returns height (0 in the hollows, 1 on top) and a per-tuft shade.

    Each tuft is a soft rounded mound around a random point, with a shallow spiral groove, so the
    surface has real curls without any loose pieces, gaps or sharp tips.
    """
    shape = np.shape(x)
    p = np.stack([np.ravel(x), np.ravel(y), np.ravel(z)], axis=1) / spacing
    base = np.floor(p)
    best = np.full(len(p), 1e9)
    second = np.full(len(p), 1e9)
    best_vec = np.zeros_like(p)
    best_cell = np.zeros_like(p)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cell = base + (dx, dy, dz)
                seed = cell + np.stack([_hash3(cell, 1), _hash3(cell, 2), _hash3(cell, 3)], axis=1)
                offset = p - seed
                dist = np.einsum("ij,ij->i", offset, offset)
                closer = dist < best
                second[closer] = best[closer]
                second[~closer] = np.minimum(second[~closer], dist[~closer])
                best[closer] = dist[closer]
                best_vec[closer] = offset[closer]
                best_cell[closer] = cell[closer]
    r = np.sqrt(best)
    dome = np.clip(1.0 - (r / 0.95) ** 2, 0.0, 1.0)
    # The spiral is measured around a direction that differs from tuft to tuft.
    a = _hash3(best_cell, 4) * 2 * np.pi
    b = _hash3(best_cell, 5) * 2 * np.pi
    u = best_vec[:, 0] * np.cos(a) + best_vec[:, 1] * np.sin(a)
    v = -best_vec[:, 0] * np.sin(a) * np.cos(b) + best_vec[:, 1] * np.cos(a) * np.cos(b) + best_vec[:, 2] * np.sin(b)
    spiral = np.cos(2 * np.arctan2(v, u) + r * 11.0 + a)
    # The groove fades out at a tuft's centre and edges, where it would otherwise leave small jagged bits.
    fade = np.clip(r * 3.0, 0.0, 1.0) * np.clip((np.sqrt(second) - r) * 3.0, 0.0, 1.0)
    height = np.clip(dome * (1.0 - 0.14 * fade + 0.14 * fade * spiral), 0.0, 1.0)
    shade = _hash3(best_cell, 6)
    return height.reshape(shape), shade.reshape(shape)


EDGES = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]


def surface_mesh(sdf, half_x, y_range, z_range, cell):
    """Surface nets over a grid. `sdf` takes arrays of x, y and z."""
    xs = np.arange(-half_x, half_x + cell, cell)
    ys = np.arange(y_range[0], y_range[1] + cell, cell)
    zs = np.arange(z_range[0], z_range[1] + cell, cell)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
    f = sdf(X, Y, Z).astype(np.float32)
    del X, Y, Z

    c = [None] * 8
    for n in range(8):
        i0, j0, k0 = n & 1, (n >> 1) & 1, (n >> 2) & 1
        c[n] = f[i0 : f.shape[0] - 1 + i0, j0 : f.shape[1] - 1 + j0, k0 : f.shape[2] - 1 + k0]
    inside = sum((corner < 0).astype(np.int8) for corner in c)
    mask = (inside > 0) & (inside < 8)
    cells = np.argwhere(mask)
    values = np.stack([corner[mask] for corner in c])

    total = np.zeros((len(cells), 3), dtype=np.float64)
    count = np.zeros(len(cells), dtype=np.float64)
    offsets = np.array([[n & 1, (n >> 1) & 1, (n >> 2) & 1] for n in range(8)], dtype=np.float64)
    for a, b in EDGES:
        crossing = (values[a] < 0) != (values[b] < 0)
        t = values[a][crossing] / (values[a][crossing] - values[b][crossing])
        total[crossing] += offsets[a] + (offsets[b] - offsets[a]) * t[:, None]
        count[crossing] += 1
    origin = np.array([xs[0], ys[0], zs[0]])
    verts = origin + (cells + total / count[:, None]) * cell

    lookup = np.full(mask.shape, -1, dtype=np.int64)
    lookup[mask] = np.arange(len(cells))
    quads = []
    neg = f < 0
    for i, j, k in np.argwhere(neg[:-1, :, :] != neg[1:, :, :]):
        if 0 < j < mask.shape[1] and 0 < k < mask.shape[2]:
            quads.append((lookup[i, j - 1, k - 1], lookup[i, j, k - 1], lookup[i, j, k], lookup[i, j - 1, k]))
    for i, j, k in np.argwhere(neg[:, :-1, :] != neg[:, 1:, :]):
        if 0 < i < mask.shape[0] and 0 < k < mask.shape[2]:
            quads.append((lookup[i - 1, j, k - 1], lookup[i, j, k - 1], lookup[i, j, k], lookup[i - 1, j, k]))
    for i, j, k in np.argwhere(neg[:, :, :-1] != neg[:, :, 1:]):
        if 0 < i < mask.shape[0] and 0 < j < mask.shape[1]:
            quads.append((lookup[i - 1, j - 1, k], lookup[i, j - 1, k], lookup[i, j, k], lookup[i - 1, j, k]))
    quads = np.array(quads, dtype=np.int64)
    quads = quads[(quads >= 0).all(axis=1)]

    def gradient(points):
        e = cell * 0.5
        field = lambda p: sdf(p[:, 0], p[:, 1], p[:, 2])
        out = np.zeros_like(points)
        for axis in range(3):
            step = np.zeros(3)
            step[axis] = e
            out[:, axis] = field(points + step) - field(points - step)
        return out / np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)

    # Pull each vertex onto the true surface, which smooths out the staircase left by the grid.
    normals = gradient(verts)
    verts -= normals * sdf(verts[:, 0], verts[:, 1], verts[:, 2])[:, None]
    normals = gradient(verts)

    # All faces must point outwards.
    a, b, c2 = verts[quads[:, 0]], verts[quads[:, 1]], verts[quads[:, 2]]
    facing = np.einsum("ij,ij->i", np.cross(b - a, c2 - a), normals[quads[:, 0]])
    quads[facing < 0] = quads[facing < 0][:, ::-1]
    return verts, quads, normals

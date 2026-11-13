import numpy as np, cv2

def to_gray(im): return cv2.cvtColor(im[..., :3], cv2.COLOR_BGR2GRAY)

def find_shift(base, donor, template_box, search=90):
    """How far the head has moved between two frames, from the curly hair above the eye."""
    x0, y0, x1, y1 = template_box
    tpl = to_gray(base)[y0:y1, x0:x1]
    g = to_gray(donor)
    sx0, sy0 = max(0, x0 - search), max(0, y0 - search)
    win = g[sy0:y1 + search, sx0:x1 + search]
    res = cv2.matchTemplate(win, tpl, cv2.TM_CCOEFF_NORMED)
    _, score, _, loc = cv2.minMaxLoc(res)
    return (sx0 + loc[0] - x0, sy0 + loc[1] - y0), score

def lab(img): return cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)

def graft_eye(base, donor, eye_box, template_box, feather=7):
    """Puts the closed eye of `donor` on the open eye of `base`. Both are BGRA cut-outs of the same size."""
    (dx, dy), score = find_shift(base, donor, template_box)
    x0, y0, x1, y1 = eye_box
    patch = donor[y0 + dy:y1 + dy, x0 + dx:x1 + dx, :3].copy()
    ref = base[y0:y1, x0:x1, :3]
    # match the skin colour of the patch to what surrounds the eye in the base picture
    ring = np.ones(patch.shape[:2], bool); ring[8:-8, 8:-8] = False
    pl, bl = lab(patch), lab(ref)
    for c in range(3):
        m_p, s_p = pl[..., c][ring].mean(), pl[..., c][ring].std() + 1e-3
        m_b, s_b = bl[..., c][ring].mean(), bl[..., c][ring].std() + 1e-3
        pl[..., c] = (pl[..., c] - m_p) * min(1.5, s_b / s_p) + m_b
    patch = cv2.cvtColor(np.clip(pl, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    h, w = patch.shape[:2]
    mask = np.zeros((h, w), np.float32)
    cv2.ellipse(mask, (w // 2, h // 2), (w // 2 - feather - 2, h // 2 - feather - 2), 0, 0, 360, 1, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), feather / 2)[..., None]
    out = base.copy()
    out[y0:y1, x0:x1, :3] = (patch * mask + ref * (1 - mask)).astype(np.uint8)
    return out, (dx, dy, score)

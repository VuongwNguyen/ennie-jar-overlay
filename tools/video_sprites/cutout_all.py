"""Cuts Ennie out of the frames of the heart video: python cutout_all.py <work folder> <first frame> <last frame>"""
import numpy as np, cv2, sys, os, time, json
S = sys.argv[1]
first, last = int(sys.argv[2]), int(sys.argv[3])
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import isnet
model = os.environ.get("ISNET_MODEL", f"{S}/isnet-general-use.onnx")
BOX = (0, 100, 700, 900)          # the part of the picture where the dog lives
os.makedirs(f"{S}/cut", exist_ok=True)
stats = {}

def clean(frame, a):
    h, w = a.shape
    a = a.copy()
    a[:, 590:] = 0                                   # the heart starts here
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    red = ((hsv[..., 0] <= 4) | (hsv[..., 0] >= 172)) & (hsv[..., 1] > 150) & (hsv[..., 2] > 90)
    red = cv2.dilate(red.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    a[red] = 0
    # only the biggest piece: no petals, no bits of the heart
    m = (a > 0.5).astype(np.uint8)
    n, lbl, st, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        keep = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
        near = cv2.dilate((lbl == keep).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
        a[~near] = 0
    # a slightly tighter, smoother edge
    a = np.clip((a - 0.22) / 0.6, 0, 1)
    a = cv2.GaussianBlur(a, (0, 0), 0.7)
    return a

def decontaminate(frame, a):
    """Replaces the colour near the edge with colour from inside the dog, so no pink or green fringe is left."""
    f = frame.astype(np.float32)
    inner = (cv2.erode((a > 0.97).astype(np.uint8), np.ones((3, 3), np.uint8))).astype(np.float32)
    def estimate(sigma):
        num = cv2.GaussianBlur(f * inner[..., None], (0, 0), sigma)
        den = cv2.GaussianBlur(inner, (0, 0), sigma)[..., None]
        return num / np.maximum(den, 1e-4), den
    near, den_near = estimate(2.5)       # keeps the fur's detail close to the edge
    far, _ = estimate(9)                 # reaches the pixels that are far from the inside
    est = np.where(den_near > 0.08, near, far)
    edge = np.clip((0.985 - a) / 0.25, 0, 1)[..., None]    # 0 inside, 1 where the dog is even slightly see-through
    out = f * (1 - edge) + est * edge
    return np.clip(out, 0, 255).astype(np.uint8)

t0 = time.time()
for i in range(first, last + 1):
    frame = cv2.imread(f"{S}/vid/f_{i:03d}.png")
    a = isnet.alpha(frame, model, BOX)
    a = clean(frame, a)
    colour = decontaminate(frame, a)
    rgba = np.dstack([colour, (a * 255).astype(np.uint8)])
    cv2.imwrite(f"{S}/cut/c_{i:03d}.png", rgba)
    ys, xs = np.nonzero(a > 0.5)
    if len(xs):
        stats[i] = dict(x0=int(xs.min()), x1=int(xs.max()), y0=int(ys.min()), y1=int(ys.max()), area=int(len(xs)))
    if i % 20 == 0:
        print(i, "%.0fs" % (time.time() - t0), flush=True)
json.dump(stats, open(f"{S}/cut/stats_{first}_{last}.json", "w"))
print("done", len(stats))

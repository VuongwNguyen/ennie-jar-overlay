"""Cuts the dog out of frames shot on a flat green screen (AI-made clips):
   python cutout_green.py <work folder> <first frame> <last frame>
Reads <work>/vid/f_NNN.png and writes <work>/cut/c_NNN.png (BGRA). Needs ISNET_MODEL like cutout_all.py."""
import numpy as np, cv2, sys, os, time
S = sys.argv[1]; first, last = int(sys.argv[2]), int(sys.argv[3])
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import isnet
model = os.environ.get("ISNET_MODEL", f"{S}/isnet-general-use.onnx")
os.makedirs(f"{S}/cut", exist_ok=True)

def cut(frame):
    h, w = frame.shape[:2]
    box = (0, 0, w, int(h * 0.93))                       # keeps the watermark in the corner out of it
    a = isnet.alpha(frame, model, box)
    b, g, r = [frame[..., k].astype(int) for k in range(3)]
    a[(g - np.maximum(r, b)) > 45] = 0                   # the green screen itself
    m = (a > 0.5).astype(np.uint8)
    n, lbl, st, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        keep = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
        a[cv2.dilate((lbl == keep).astype(np.uint8), np.ones((15, 15), np.uint8)) == 0] = 0
    a = cv2.GaussianBlur(np.clip((a - 0.22) / 0.6, 0, 1), (0, 0), 0.7)
    f = frame.astype(np.float32)
    inner = cv2.erode((a > 0.97).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
    def est(sig):
        num = cv2.GaussianBlur(f * inner[..., None], (0, 0), sig); den = cv2.GaussianBlur(inner, (0, 0), sig)[..., None]
        return num / np.maximum(den, 1e-4), den
    near, dn = est(2.5); far, _ = est(9)
    e = np.where(dn > 0.08, near, far)
    edge = np.clip((0.985 - a) / 0.25, 0, 1)[..., None]  # green spill lives on the edge: take the colour from inside
    colour = np.clip(f * (1 - edge) + e * edge, 0, 255)
    # despill: fur, bow and charm are never greener than a mix of their red and blue, so cap green there
    colour[..., 1] = np.minimum(colour[..., 1], 0.82 * colour[..., 2] + 0.18 * colour[..., 0])
    colour = colour.astype(np.uint8)
    return np.dstack([colour, (a * 255).astype(np.uint8)])

t0 = time.time()
for i in range(first, last + 1):
    cv2.imwrite(f"{S}/cut/c_{i:03d}.png", cut(cv2.imread(f"{S}/vid/f_{i:03d}.png")))
    if i % 40 == 0: print(i, "%.0fs" % (time.time() - t0), flush=True)
print("done")

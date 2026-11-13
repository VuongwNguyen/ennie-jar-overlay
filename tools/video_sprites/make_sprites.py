"""Builds the overlay's sprite sheets from the cut-outs of Ennie in ennie_heart.webm (the real dog, not a model)."""
import numpy as np, cv2, json, math, os, sys
S, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graft
FRAME = 320                 # a picture in a sheet is FRAME x FRAME
SCALE = 0.5                 # the cut-outs are about 490px tall; the dog is about 245px tall in a picture
CROP = (0, 200, 620, 830)   # x0, y0, x1, y1 of the cut-out that holds the dog
GROUND_VIDEO = 792          # where the paws stand in the video
GROUND = 0.9                # and where they stand in a picture (as a fraction of its height)
os.makedirs(OUT, exist_ok=True)

def ping_pong(frames):
    return list(frames) + list(frames[-2:0:-1])

CLIPS = {
    # name: (source frames, fps, loops, alias)
    "Idle":      (ping_pong(range(112, 143, 3)), 8, True),
    "HeadTilt":  (list(range(73, 96, 2)), 12, False),
    "Joy":       (ping_pong([44, 46, 48, 50, 52, 58]), 12, True),     # the ears fly and the eyes smile shut (54-57: motion blur)
    "Jump":      (list(range(46, 53)) + [58], 12, False),
    "Pant":      (ping_pong(range(58, 69, 2)), 11, True),     # above 10 fps the overlay does not blend pictures
    "Surprised": (list(range(58, 65)), 14, False),
}

def fill_head(alpha):
    """The pale bow sometimes comes out see-through: close small holes in the upper half of the dog."""
    a = (alpha > 128).astype(np.uint8)
    top = a.copy(); top[640:] = 0; top[:, :230] = 0     # head, bow, ears, collar; not the tail or the legs
    closed = cv2.morphologyEx(top, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    cnts, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(a); cv2.drawContours(filled, cnts, -1, 1, -1)
    add = (filled > 0) & (a == 0)
    out = alpha.copy(); out[add] = 255
    return out

def cutout(i):
    return cv2.imread(f"{S}/cut/c_{i:03d}.png", cv2.IMREAD_UNCHANGED)

def picture(i, anchor_dx):
    im = i.copy() if isinstance(i, np.ndarray) else cutout(i)
    im[..., 3] = fill_head(im[..., 3])
    x0, y0, x1, y1 = CROP
    im = im[y0:y1, x0:x1][:, ::-1]                     # the dog faces left in the sheets
    a = im[..., 3:4].astype(np.float32) / 255
    pre = np.concatenate([im[..., :3].astype(np.float32) * a, a * 255], axis=-1)
    w, h = int(round(im.shape[1] * SCALE)), int(round(im.shape[0] * SCALE))
    small = cv2.resize(pre, (w, h), interpolation=cv2.INTER_AREA)
    alpha = small[..., 3:4] / 255
    rgb = small[..., :3] / np.maximum(alpha, 1e-4)
    canvas = np.zeros((FRAME, FRAME, 4), np.float32)
    ground_in_crop = (GROUND_VIDEO - y0) * SCALE
    oy = int(round(GROUND * FRAME - ground_in_crop))
    ox = int(round(anchor_dx))
    ys, xs = max(0, oy), max(0, ox)
    ye, xe = min(FRAME, oy + h), min(FRAME, ox + w)
    src = np.concatenate([rgb, alpha * 255], axis=-1)[ys - oy:ye - oy, xs - ox:xe - ox]
    canvas[ys:ye, xs:xe] = src
    return np.clip(canvas, 0, 255).astype(np.uint8)

def torso_centre(i):
    im = cv2.imread(f"{S}/cut/c_{i:03d}.png", cv2.IMREAD_UNCHANGED)
    band = im[540:650, :, 3]
    _, xs = np.nonzero(band > 128)
    return float(xs.mean())

# line every picture up so the standing dog's torso is in the middle of a picture
ref = np.mean([torso_centre(i) for i in range(118, 140, 3)])
x0, _, x1, _ = CROP
flipped_ref = (x1 - x0) - (ref - x0)                   # torso x after flipping the crop
anchor_dx = FRAME / 2 - flipped_ref * SCALE

manifest = {"frameSize": FRAME, "clips": {}}
frames_by_clip = {}
for name, (sources, fps, loops) in CLIPS.items():
    pics = [picture(i, anchor_dx) for i in sources]
    frames_by_clip[name] = pics
    cols = math.ceil(math.sqrt(len(pics))); rows = math.ceil(len(pics) / cols)
    sheet = np.zeros((rows * FRAME, cols * FRAME, 4), np.uint8)
    for k, p in enumerate(pics):
        r, c = divmod(k, cols)
        sheet[r * FRAME:(r + 1) * FRAME, c * FRAME:(c + 1) * FRAME] = p
    cv2.imwrite(f"{OUT}/{name}.png", sheet, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    manifest["clips"][name] = {"frames": len(pics), "columns": cols, "rows": rows, "fps": fps, "loops": loops}
    print(name, len(pics), "pictures", sheet.shape[1], "x", sheet.shape[0])

# Blink: the closed eye from the nuzzling frames, fitted on the first standing picture, dissolving in and out
EYE = (356, 424, 446, 516)       # around the open eye of the standing dog
TPL = (330, 330, 500, 410)       # curly hair above it, which keeps its shape when the eye closes
base = cutout(112)
closed, info = graft.graft_eye(base, cutout(164), EYE, TPL, feather=9)
print("blink graft", info)
open_pic, shut_pic = picture(base, anchor_dx), picture(closed, anchor_dx)
steps = [0.0, 0.5, 1.0, 0.5, 0.0]
blink = [np.clip(open_pic.astype(np.float32) * (1 - t) + shut_pic.astype(np.float32) * t, 0, 255).astype(np.uint8) for t in steps]
cv2.imwrite(f"{OUT}/Blink.png", np.concatenate(blink, axis=1), [cv2.IMWRITE_PNG_COMPRESSION, 9])
manifest["clips"]["Blink"] = {"frames": len(blink), "columns": len(blink), "rows": 1, "fps": 24, "loops": False}
idle0 = frames_by_clip["Idle"][0]
assert np.abs(idle0.astype(int) - open_pic.astype(int)).max() == 0, "the blink must start from the first standing picture"
# clips the video has no footage for share a sheet with a similar one
manifest["clips"]["TailWag"] = dict(manifest["clips"]["Idle"], file="Idle")

# where the paws stand, and how wide the dog is
a = idle0[..., 3] > 128
ys, xs = np.nonzero(a)
manifest["groundX"] = 0.5
manifest["groundY"] = GROUND
manifest["bodyWidth"] = round(float((xs.max() - xs.min()) / FRAME), 4)
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=1)
print({k: v for k, v in manifest.items() if k != "clips"}, "dog top", ys.min(), "bottom", ys.max())

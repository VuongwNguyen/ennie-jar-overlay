"""Builds the front-view sprites (Ennie sitting and facing the camera, showing how she feels) from a green-screen
video of her, cut with cutout_green.py:
   python make_front.py <work folder with cut/> <overlay/models/dog-front>
Same sheet format and size as make_sprites.py. The dog sits still in the video, so every picture is lined up on
the same spot. The pictures are not flipped."""
import numpy as np, cv2, json, math, os, sys
S, OUT = sys.argv[1], sys.argv[2]
FRAME, DOG_HEIGHT, GROUND = 320, 242, 0.9
os.makedirs(OUT, exist_ok=True)

def ping_pong(frames):
    return list(frames) + list(frames[-2:0:-1])

# name: (frames of the video, fps, loops). Every frame of an expression is used, so it moves smoothly, and they play
# well below the video's 24 fps: she moves slowly and calmly. Each starts and ends near the calm pose (frame 43).
CLIPS = {
    "Idle":      (list(range(43, 21, -2)) + list(range(24, 43, 2)), 10, True),    # calm, breathing; starts on 43
    "Blink":     (list(range(43, 59)), 20, False),                                 # a slow blink
    "HeadTilt":  (list(range(55, 96)), 18, False),                                 # a curious tilt, then calm again
    "Joy":       (list(range(100, 143)), 18, False),                               # a laugh that comes and goes
    "Pant":      (list(range(199, 247)), 18, False),                               # excited, a paw up, then a tilt and a wink
    "Surprised": (list(range(136, 161)), 18, False),                               # wide, shiny eyes
    "Yawn":      (list(range(175, 201)), 16, False),                               # (not a real yawn) eyes close in a soft smile
    "Jump":      (list(range(202, 247)), 18, False),                               # excited, a paw up, ears flapping, then calm
}
ALIASES = {"TailWag": "Idle"}

def fill_head(alpha):
    """Closes small holes (the pale bow, the collar's studs) in the head, ears and collar."""
    a = (alpha > 128).astype(np.uint8)
    top = a.copy(); top[480:] = 0
    closed = cv2.morphologyEx(top, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    cnts, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(a); cv2.drawContours(filled, cnts, -1, 1, -1)
    out = alpha.copy(); out[(filled > 0) & (a == 0)] = 255
    return out

def cutout(i): return cv2.imread(f"{S}/cut/c_{i:03d}.png", cv2.IMREAD_UNCHANGED)


ref = cutout(43); ys, xs = np.nonzero(ref[..., 3] > 128)
SCALE = DOG_HEIGHT / float(ys.max() - ys.min())
CROP_X0, CROP_X1 = int((xs.min() + xs.max()) / 2) - 380, int((xs.min() + xs.max()) / 2) + 380   # room for flapping ears
dx = FRAME / 2 - ((xs.min() + xs.max()) / 2 - CROP_X0) * SCALE
dy = GROUND * FRAME - ys.max() * SCALE
print("scale %.3f" % SCALE)

def picture(i):
    im = cutout(i); im[..., 3] = fill_head(im[..., 3])
    im = im[:, max(0, CROP_X0):CROP_X1]
    a = im[..., 3:4].astype(np.float32) / 255
    pre = np.concatenate([im[..., :3].astype(np.float32) * a, a * 255], axis=-1)
    w, h = int(round(im.shape[1] * SCALE)), int(round(im.shape[0] * SCALE))
    small = cv2.resize(pre, (w, h), interpolation=cv2.INTER_AREA); al = small[..., 3:4] / 255
    rgba = np.concatenate([small[..., :3] / np.maximum(al, 1e-4), al * 255], axis=-1)
    canvas = np.zeros((FRAME, FRAME, 4), np.float32)
    oy, ox = int(round(dy)), int(round(dx + max(0, CROP_X0) * 0 ))
    ys_, xs_ = max(0, oy), max(0, ox); ye, xe = min(FRAME, oy + h), min(FRAME, ox + w)
    canvas[ys_:ye, xs_:xe] = rgba[ys_ - oy:ye - oy, xs_ - ox:xe - ox]
    return np.clip(canvas, 0, 255).astype(np.uint8)

manifest = {"frameSize": FRAME, "clips": {}}
first = None
for name, (sources, fps, loops) in CLIPS.items():
    pics = [picture(i) for i in sources]
    if first is None: first = pics[0]
    for k, p in enumerate(pics):          # nothing of her may touch the edge of a picture
        a = p[..., 3] > 128
        if a[0].any() or a[-1].any() or a[:, 0].any() or a[:, -1].any(): print("  !! touches the edge:", name, sources[k])
    cols = math.ceil(math.sqrt(len(pics))); rows = math.ceil(len(pics) / cols)
    sheet = np.zeros((rows * FRAME, cols * FRAME, 4), np.uint8)
    for k, p in enumerate(pics):
        r, c = divmod(k, cols); sheet[r * FRAME:(r + 1) * FRAME, c * FRAME:(c + 1) * FRAME] = p
    cv2.imwrite(f"{OUT}/{name}.png", sheet, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    manifest["clips"][name] = {"frames": len(pics), "columns": cols, "rows": rows, "fps": fps, "loops": loops}
    print(name, len(pics), "pictures")
for name, target in ALIASES.items():
    manifest["clips"][name] = dict(manifest["clips"][target], file=target)
ys, xs = np.nonzero(first[..., 3] > 128)
manifest.update(groundX=0.5, groundY=GROUND, bodyWidth=round(float((xs.max() - xs.min()) / FRAME), 4))
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=1)
print({k: v for k, v in manifest.items() if k != "clips"}, "dog top", ys.min(), "bottom", ys.max())

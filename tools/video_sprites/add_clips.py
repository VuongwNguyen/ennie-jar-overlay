"""Adds clips cut from an AI-made green-screen video to the sprites already in the overlay:
   python add_clips.py <work folder with cut/> <overlay/models/dog>
The dog is scaled to the height of the dog already in the sheets, flipped to face left and lined up on her
paws and torso. Frames are chosen in the CLIPS table (found by comparing frames: these loop cleanly)."""
import numpy as np, cv2, json, math, sys
K, OUT = sys.argv[1], sys.argv[2]
FRAME, DOG_HEIGHT, GROUND = 320, 244, 0.9      # the same as make_sprites.py: dog is 244px tall, paws at 90%

CLIPS = {
    # name: (source frames, fps, loops)
    "Walk":    (list(range(35, 64)), 24, True),            # 29 frames = two strides, the end meets the start
    "Yawn":    (list(range(79, 134, 2)), 12, False),       # eyes close, a big yawn, eyes open
    "TailWag": (list(range(162, 188)), 24, True),          # 26 frames = two wags
}

def load(i): return cv2.imread(f"{K}/cut/c_{i:03d}.png", cv2.IMREAD_UNCHANGED)

standing = [load(i) for i in (162, 170, 178, 186)]
boxes = [np.nonzero(p[..., 3] > 128) for p in standing]
heights = [ys.max() - ys.min() for ys, xs in boxes]
scale = DOG_HEIGHT / float(np.median(heights))
ground_src = float(np.median([ys.max() for ys, xs in boxes]))
def torso(p):
    band = p[430:680, :, 3]; _, xs = np.nonzero(band > 128); return xs.mean()
walk = [load(i) for i in CLIPS["Walk"][0]]
width = walk[0].shape[1]
torso_x = width - float(np.mean([torso(p) for p in walk]))          # after the flip
dx = FRAME / 2 - torso_x * scale
dy = GROUND * FRAME - ground_src * scale
print("scale %.3f, offset %.1f, %.1f" % (scale, dx, dy))

def picture(p):
    p = p[:, ::-1]
    a = p[..., 3:4].astype(np.float32) / 255
    pre = np.concatenate([p[..., :3].astype(np.float32) * a, a * 255], axis=-1)
    w, h = int(round(p.shape[1] * scale)), int(round(p.shape[0] * scale))
    small = cv2.resize(pre, (w, h), interpolation=cv2.INTER_AREA)
    al = small[..., 3:4] / 255
    rgba = np.concatenate([small[..., :3] / np.maximum(al, 1e-4), al * 255], axis=-1)
    canvas = np.zeros((FRAME, FRAME, 4), np.float32)
    ox, oy = int(round(dx)), int(round(dy))
    ys, xs = max(0, oy), max(0, ox); ye, xe = min(FRAME, oy + h), min(FRAME, ox + w)
    canvas[ys:ye, xs:xe] = rgba[ys - oy:ye - oy, xs - ox:xe - ox]
    return np.clip(canvas, 0, 255).astype(np.uint8)

manifest = json.load(open(f"{OUT}/manifest.json"))
for name, (sources, fps, loops) in CLIPS.items():
    pics = [picture(load(i)) for i in sources]
    cols = math.ceil(math.sqrt(len(pics))); rows = math.ceil(len(pics) / cols)
    sheet = np.zeros((rows * FRAME, cols * FRAME, 4), np.uint8)
    for k, pic in enumerate(pics):
        r, c = divmod(k, cols); sheet[r * FRAME:(r + 1) * FRAME, c * FRAME:(c + 1) * FRAME] = pic
    cv2.imwrite(f"{OUT}/{name}.png", sheet, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    manifest["clips"][name] = {"frames": len(pics), "columns": cols, "rows": rows, "fps": fps, "loops": loops}
    print(name, len(pics), "pictures")
# how fast the walk carries her, as a fraction of a picture per second at normal speed: one stride of about 0.45
# of her height every 14.5 frames (a gait cycle is half the 29-frame loop)
manifest["walkSpeed"] = round(0.45 * DOG_HEIGHT / FRAME / (14.5 / 24), 3)
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=1)
print("walkSpeed", manifest["walkSpeed"])

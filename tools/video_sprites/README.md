# Ennie sprites from the heart video

The dog on the jar's floor is **Ennie herself**: the frames of `overlay/media/ennie_heart.webm` with the
background cut away. There is no 3D model in the loop, so she looks exactly as she does in the video.

## How it works

1. `ffmpeg` writes the video's frames (the camera never moves).
2. `cutout_all.py` cuts the dog out of every frame with ISNet (a background-removal network, run with
   `onnxruntime`), drops the heart and stray petals, tightens the edge and replaces the colour near the edge
   with colour from inside the dog, so no pink or green fringe is left.
3. `make_sprites.py` flips the dog to face left, shrinks her, lines every picture up on the same spot, packs
   each clip into a sheet and writes `manifest.json`. The blink is made by `graft.py`: the closed eye from
   the frames where she nuzzles the heart is fitted on the standing picture.

Which frames make which clip is the `CLIPS` table at the top of `make_sprites.py`:

| Clip | Frames of the video | What it shows |
| --- | --- | --- |
| Idle (and TailWag) | 112-142 | standing, looking at the heart, played forwards and back |
| HeadTilt | 73-95 | a smile with closed eyes, then she looks up |
| Joy | 44-52, 58 | ears flying, eyes smiling shut |
| Jump | 46-52, 58 | the same bound, played once; the overlay lifts her off the floor |
| Pant | 58-68 | standing with an open smile |
| Surprised | 58-64 | the same smile, wide eyed |
| Blink | 112 + 164 | the standing picture with the nuzzling dog's closed eye |

The heart video has no walking cycle (she only takes a few steps) and no yawn, so these come from a second,
AI-made video of the same dog on a flat green screen (camera fixed, she stays in one place). It is cut with
`cutout_green.py` and added by `add_clips.py`, which scales her to the height of the dog already in the sheets:

| Clip | Frames of the green-screen video | What it shows |
| --- | --- | --- |
| Walk | 35-63 | a walking loop of two strides (the end meets the start) |
| Yawn | 79-133 | eyes close, a big yawn, eyes open |
| TailWag | 162-187 | standing, tail wagging, two wags in a loop |

The loops were found by comparing frames (the closest match of the dog's body and legs), so they repeat
cleanly. `manifest.json` also gets `walkSpeed`, so her paws match the floor while she crosses the jar.
The overlay leaves clips that are missing from `manifest.json` out of its random choices. To add something
else (running, sitting), cut it the same way and add a row to `CLIPS` in `add_clips.py`.

## Front view (the default)

`make_front.py` builds `overlay/models/dog-front/` from a second AI-made green-screen video: Ennie sits and faces
the camera, showing ten seconds of expressions. Cut it with `cutout_green.py` (frames 1-265) and run
`python tools/video_sprites/make_front.py .cache/ennie-front overlay/models/dog-front`.

| Clip | Frames | What it shows |
| --- | --- | --- |
| Idle (and TailWag) | 22-43 | calm, breathing; starts on frame 43 |
| Blink | 43-55 | a slow blink |
| HeadTilt | 55-91 | a curious tilt, then calm again |
| Joy | 109-130 | laughing with her eyes shut, played forwards and back |
| Pant | 205-214 | an open happy mouth, one paw up |
| Surprised | 139-154 | wide, shiny eyes |
| Yawn | 178-199 | not a real yawn: her eyes close in a soft smile |
| Jump | 202-235 | excited, a paw up, ears flapping; the overlay lifts her off the floor |

## Run it

```bash
python3 -m venv .cache/ennie-venv && .cache/ennie-venv/bin/pip install numpy opencv-python-headless onnxruntime
mkdir -p .cache/ennie/vid
curl -L -o .cache/ennie/isnet-general-use.onnx \
  https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
ffmpeg -i overlay/media/ennie_heart.webm -vf "crop=1080:900:0:1020" .cache/ennie/vid/f_%03d.png
.cache/ennie-venv/bin/python tools/video_sprites/cutout_all.py .cache/ennie 25 240
.cache/ennie-venv/bin/python tools/video_sprites/make_sprites.py .cache/ennie overlay/models/dog
```

`cutout_all.py` takes about two minutes. Set `ISNET_MODEL` to use a model kept somewhere else.
`.cache/` is ignored by git.

For the green-screen video (frames written to `.cache/ennie-ai/vid/f_%03d.png` with `ffmpeg -i video.mp4`):

```bash
ISNET_MODEL=.cache/ennie/isnet-general-use.onnx .cache/ennie-venv/bin/python tools/video_sprites/cutout_green.py .cache/ennie-ai 1 265
.cache/ennie-venv/bin/python tools/video_sprites/add_clips.py .cache/ennie-ai overlay/models/dog
```

Run `make_sprites.py` first: `add_clips.py` adds to the `manifest.json` it writes.

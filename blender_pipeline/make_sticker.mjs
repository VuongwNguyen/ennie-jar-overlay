// Turns the Ennie GIF into the overlay's sticker: the pink name, hearts and paw under the dog are removed
// from every frame and a bone takes their place. Saved as an animated PNG, which keeps every colour and
// gives the bone smooth see-through edges. Needs ffmpeg on the PATH. Run from the project folder:
//
//     node blender_pipeline/make_sticker.mjs poodle/reference/ennie_reference.gif overlay/models/ennie.png [preview.png]
import { execFileSync } from "node:child_process";

const [input, output, preview] = process.argv.slice(2);
const W = 384, H = 256, FRAME = W * H * 4;
const LOGO_TOP = 165;    // the name and its hearts are all below this line
const STILL = 44;        // how much a logo pixel's colour may change between frames (GIF colour noise)

const raw = execFileSync("ffmpeg", ["-v", "error", "-i", input, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 28 });
const count = raw.length / FRAME;
const frames = Array.from({ length: count }, (_, i) => raw.subarray(i * FRAME, (i + 1) * FRAME));

// ---------- Find the logo: pink or dark red pixels that stay the same in every frame ----------
let logo = new Uint8Array(W * H);
for (let y = LOGO_TOP; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const at = (y * W + x) * 4;
    let still = true, low = [255, 255, 255], high = [0, 0, 0];
    for (const f of frames) {
      if (f[at + 3] < 128) { still = false; break; }
      for (let c = 0; c < 3; c++) {
        low[c] = Math.min(low[c], f[at + c]);
        high[c] = Math.max(high[c], f[at + c]);
      }
    }
    if (!still || high.some((v, c) => v - low[c] > STILL)) continue;
    const [r, g, b] = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
    if (r > g && b >= g - 10) logo[y * W + x] = 1; // fur is brown, so its blue stays well below its green
  }
}
// Grow the area a little to take the logo's soft edge with it.
for (let round = 0; round < 3; round++) {
  const grown = logo.slice();
  for (let y = LOGO_TOP; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (logo[y * W + x]) grown[y * W + x + 1] = grown[y * W + x - 1] = grown[(y + 1) * W + x] = grown[(y - 1) * W + x] = 1;
    }
  }
  logo = grown;
}

// ---------- Draw the bone ----------
const BONE = { x: 190, y: 220, half: 78, shaft: 19, knob: 18, spread: 13, tilt: -0.035 };
const mix = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
function boneDistance(px, py) {
  const cos = Math.cos(BONE.tilt), sin = Math.sin(BONE.tilt);
  const dx = px - BONE.x, dy = py - BONE.y;
  const x = dx * cos + dy * sin, y = -dx * sin + dy * cos;
  const along = Math.max(-BONE.half, Math.min(BONE.half, x));
  let d = Math.hypot(x - along, y) - BONE.shaft;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const knob = Math.hypot(x - sx * BONE.half, y - sy * BONE.spread) - BONE.knob;
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (d - knob)) / 7));
    d = mix(d, knob, h) - 7 * h * (1 - h); // a smooth join, like a soft toy
  }
  return { d, x, y };
}
function heartInside(x, y) {
  const u = x / 11, v = -(y - 1.5) / 11;
  return (u * u + v * v - 0.6) ** 3 - u * u * v * v * v < 0;
}
const SS = 4, bone = new Float32Array(W * H * 4); // premultiplied colour and coverage
for (let y = 180; y < H; y++) {
  for (let x = 80; x < 300; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const { d, x: lx, y: ly } = boneDistance(x + (i + 0.5) / SS, y + (j + 0.5) / SS);
      if (d > 0) continue;
      // Rounded shading: light from above, darker near the rim, with a soft highlight on top.
      const depth = Math.min(1, -d / 11);
      let shade = 0.74 + 0.26 * Math.sqrt(depth) - 0.1 * Math.max(0, ly / 26);
      shade += 0.16 * Math.max(0, 1 - Math.hypot((ly + 8.5) / 4.2, (Math.abs(lx) - 40) / 34));
      let col = [255 * Math.min(1, shade), 238 * Math.min(1.04, shade), 208 * Math.min(1.08, shade)];
      if (d > -2) col = [150, 96, 62]; // a warm outline, in the sticker's style
      if (heartInside(lx, ly)) col = [244, 121, 169];
      r += col[0]; g += col[1]; b += col[2]; a += 1;
    }
    const k = y * W + x;
    const n = SS * SS;
    bone[k * 4] = r / n; bone[k * 4 + 1] = g / n; bone[k * 4 + 2] = b / n; bone[k * 4 + 3] = a / n;
  }
}

// ---------- Apply to every frame ----------
const out = Buffer.alloc(raw.length);
frames.forEach((frame, index) => {
  const target = out.subarray(index * FRAME, (index + 1) * FRAME);
  frame.copy(target);
  for (let i = 0; i < W * H; i++) {
    const at = i * 4, y = Math.floor(i / W);
    // Everything under the middle of the bone would stick out below it, so it goes as well.
    if (logo[i] || y >= BONE.y + 6) target[at + 3] = 0;
    // The logo shifts slightly between frames, so any pink beside or just above the bone goes too.
    const x = i % W;
    const pink = target[at] > target[at + 1] && target[at + 2] >= target[at + 1] - 10;
    if (pink && y >= 178 && (x < 120 || x > 262 || y >= 190)) target[at + 3] = 0;
  }
  // Fill small gaps left in the fur just above the bone from the fur directly above them.
  for (let x = 120; x <= 262; x++) {
    for (let y = 186; y < BONE.y; y++) {
      const at = (y * W + x) * 4, above = ((y - 1) * W + x) * 4;
      if (target[at + 3] < 128 && target[above + 3] >= 128 && !bone[at + 3]) target.copy(target, at, above, above + 4);
    }
  }
  // Clear leftover specks: small islands under the dog that are not attached to anything.
  const seen = new Uint8Array(W * H);
  for (let start = LOGO_TOP * W; start < W * H; start++) {
    if (seen[start] || target[start * 4 + 3] < 128) continue;
    const island = [start];
    seen[start] = 1;
    let free = true;
    for (let n = 0; n < island.length; n++) {
      const i = island[n], x = i % W;
      if (i < LOGO_TOP * W) { free = false; continue; }
      for (const next of [i - W, i + W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1]) {
        if (next >= 0 && next < W * H && !seen[next] && target[next * 4 + 3] >= 128) {
          seen[next] = 1;
          island.push(next);
        }
      }
    }
    if (free && island.length < 150) for (const i of island) target[i * 4 + 3] = 0;
  }
  for (let i = 0; i < W * H; i++) {
    const at = i * 4;
    const cover = bone[at + 3];
    if (!cover) continue;
    const under = target[at + 3] / 255;
    const alpha = cover + under * (1 - cover);
    for (let c = 0; c < 3; c++) target[at + c] = Math.round((bone[at + c] + target[at + c] * under * (1 - cover)) / alpha);
    target[at + 3] = Math.round(alpha * 255);
  }
});

const encodeArgs = ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-framerate", "50/11", "-i", "-"];
execFileSync("ffmpeg", [...encodeArgs, "-plays", "0", "-pred", "mixed", "-f", "apng", output], { input: out, maxBuffer: 1 << 28 });
if (preview) {
  execFileSync("ffmpeg", [...encodeArgs, "-filter_complex",
    `color=c=0x3d4a5c:s=${W}x${H}:r=50/11[bg];[bg][0]overlay=shortest=1,tile=4x${Math.ceil(count / 4)}`, "-frames:v", "1", preview], { input: out, maxBuffer: 1 << 28 });
}
console.log(`${count} frames, logo pixels ${logo.reduce((s, v) => s + v, 0)}`);

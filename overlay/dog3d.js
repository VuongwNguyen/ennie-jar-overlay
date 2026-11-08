// A real 3D toy poodle in an animated-film style, drawn with three.js and animated with GSAP. Its body
// and legs are one continuous skin moved by a skeleton, like a character in a film. It walks back and
// forth along the floor of the frame, and jumps for joy when a gift lands.
// If WebGL is missing, or only a slow software version is available, the page keeps the SVG dog.
// Add ?dog=svg to the URL to force the SVG dog, or ?dog=3d to force this one.
import * as THREE from "three";
import { RoomEnvironment } from "/addons/RoomEnvironment.js";

const FUR = 0x9a6a4c, FUR_TOP = 0x8a5c41, FUR_DARK = 0x74492f, FUR_LIGHT = 0xb98a6b, CREAM = 0xf8e2cc, PINK = 0xff8fc6, PINK_DARK = 0xe35fa4, GOLD = 0xf6c64f;
const FPS = 30;
const HEAD_SIZE = 0.78;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mode = new URLSearchParams(location.search).get("dog");

const clamp01 = t => Math.min(1, Math.max(0, t));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Shapes as distance functions ----------
// Blending these with a smooth minimum is what removes every seam between the parts of the body.
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function capsule(x, y, z, a, b, ra, rb) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const px = x - a[0], py = y - a[1], pz = z - a[2];
  const t = clamp01((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz));
  return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - lerp(ra, rb, t);
}
function ellipsoid(x, y, z, c, r) {
  const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
  const k0 = Math.hypot(px, py, pz);
  const k1 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
  return k1 < 1e-6 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
}

// Poodle wool: soft, uneven tufts from 0 (a hollow) to 1 (the top of a tuft). The shape is the same
// on both sides of x = 0, so no crease forms along the dog's centre line.
function wool(x, y, z) {
  const wy = y + 0.07 * Math.cos(x * 8 + 0.6) + 0.05 * Math.sin(z * 6 + 1.7);
  const wz = z + 0.07 * Math.sin(y * 7 + 2.3) + 0.05 * Math.cos(x * 9);
  const large = Math.cos(12 * x) * Math.sin(12 * wy + 0.8) * Math.sin(12 * wz + 1.9);
  const small = Math.cos(23 * x) * Math.sin(23 * wz + 0.3) * Math.sin(23 * wy + 2.4);
  return clamp01(0.5 + 0.62 * large + 0.26 * small);
}

// Turns a distance function into one closed, smooth mesh (surface nets). The field is mirrored
// across x = 0, so the function only needs to be right for one side of the dog.
function surfaceMesh(sdf, [minY, maxY], [minZ, maxZ], halfX, cell) {
  const nx = Math.ceil((2 * halfX) / cell) + 1, ny = Math.ceil((maxY - minY) / cell) + 1, nz = Math.ceil((maxZ - minZ) / cell) + 1;
  const at = (i, j, k) => i + nx * (j + ny * k);
  const field = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    const z = minZ + k * cell;
    for (let j = 0; j < ny; j++) {
      const y = minY + j * cell;
      for (let i = 0; i < (nx + 1) >> 1; i++) {
        const d = sdf(Math.abs(-halfX + i * cell), y, z);
        field[at(i, j, k)] = d;
        field[at(nx - 1 - i, j, k)] = d;
      }
    }
  }
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cellIndex = new Int32Array(nx * ny * nz).fill(-1);
  const position = [], normal = [], index = [];
  const corner = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) {
      corner[c] = field[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
      if (corner[c] < 0) inside++;
    }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, count = 0;
    for (const [a, b] of EDGES) {
      if (corner[a] < 0 === corner[b] < 0) continue;
      const t = corner[a] / (corner[a] - corner[b]);
      sx += lerp(a & 1, b & 1, t); sy += lerp((a >> 1) & 1, (b >> 1) & 1, t); sz += lerp((a >> 2) & 1, (b >> 2) & 1, t);
      count++;
    }
    let x = -halfX + (i + sx / count) * cell, y = minY + (j + sy / count) * cell, z = minZ + (k + sz / count) * cell;
    // Normals come from the field itself, so the skin shades smoothly with no facets.
    const e = cell * 0.5;
    const value = (px, py, pz) => sdf(Math.abs(px), py, pz);
    let nX = value(x + e, y, z) - value(x - e, y, z), nY = value(x, y + e, z) - value(x, y - e, z), nZ = value(x, y, z + e) - value(x, y, z - e);
    const length = Math.hypot(nX, nY, nZ) || 1;
    nX /= length; nY /= length; nZ /= length;
    const d = value(x, y, z);
    x -= nX * d; y -= nY * d; z -= nZ * d;
    cellIndex[at(i, j, k)] = position.length / 3;
    position.push(x, y, z);
    normal.push(nX, nY, nZ);
  }
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const ax = position[a * 3], ay = position[a * 3 + 1], az = position[a * 3 + 2];
    const ux = position[b * 3] - ax, uy = position[b * 3 + 1] - ay, uz = position[b * 3 + 2] - az;
    const vx = position[c * 3] - ax, vy = position[c * 3 + 1] - ay, vz = position[c * 3 + 2] - az;
    const facing = (uy * vz - uz * vy) * normal[a * 3] + (uz * vx - ux * vz) * normal[a * 3 + 1] + (ux * vy - uy * vx) * normal[a * 3 + 2];
    if (facing > 0) index.push(a, b, c, a, c, d);
    else index.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const here = field[at(i, j, k)] < 0;
    if (here !== field[at(i + 1, j, k)] < 0) quad(cellIndex[at(i, j - 1, k - 1)], cellIndex[at(i, j, k - 1)], cellIndex[at(i, j, k)], cellIndex[at(i, j - 1, k)]);
    if (here !== field[at(i, j + 1, k)] < 0) quad(cellIndex[at(i - 1, j, k - 1)], cellIndex[at(i, j, k - 1)], cellIndex[at(i, j, k)], cellIndex[at(i - 1, j, k)]);
    if (here !== field[at(i, j, k + 1)] < 0) quad(cellIndex[at(i - 1, j - 1, k)], cellIndex[at(i, j - 1, k)], cellIndex[at(i, j, k)], cellIndex[at(i - 1, j, k)]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setIndex(index);
  return geometry;
}

// ---------- Materials ----------
const smooth = new THREE.SphereGeometry(1, 32, 24);
const mat = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
// Soft short fur: sheen lights the edges, and fine noise in the shading gives the coat a plush grain
// without adding any geometry. The noise follows the skin, because it uses the unposed position.
function plush(color, vertexColors = false) {
  const material = new THREE.MeshPhysicalMaterial({ color: vertexColors ? 0xffffff : color, vertexColors, roughness: 0.88, sheen: 0.9, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffdcc4) });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFurPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFurPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vFurPos;
float furHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float furNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(furHash(i), furHash(i + vec3(1, 0, 0)), f.x), mix(furHash(i + vec3(0, 1, 0)), furHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(furHash(i + vec3(0, 0, 1)), furHash(i + vec3(1, 0, 1)), f.x), mix(furHash(i + vec3(0, 1, 1)), furHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float furHeight(vec3 p) { return furNoise(p * 7.0) * 0.6 + furNoise(p * 19.0) * 0.4; }`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= 0.93 + 0.14 * furHeight(vFurPos);")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
{
  float furH = furHeight(vFurPos) * 0.035;
  vec3 furSx = dFdx(-vViewPosition), furSy = dFdy(-vViewPosition);
  vec3 furR1 = cross(furSy, normal), furR2 = cross(normal, furSx);
  float furDet = dot(furSx, furR1);
  vec3 furGrad = sign(furDet) * (dFdx(furH) * furR1 + dFdy(furH) * furR2);
  normal = normalize(abs(furDet) * normal - furGrad);
}`);
  };
  return material;
}

function ball(parent, material, [x, y, z], [sx, sy = sx, sz = sx]) {
  const mesh = new THREE.Mesh(smooth, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

// ---------- The head: a skull, woolly crown and snout blended into one round shape ----------
const SNOUT = { c: [0, -0.27, 0.82], r: [0.4, 0.29, 0.31] };
// 0 on the clipped face, 1 where the head has full wool.
const woolOnHead = (x, y, z) => (z < 0 ? 1 : smoothstep(0.86, 1.12, Math.hypot(x / 0.82, (y + 0.02) / 0.72)));
function headDistance(x, y, z) {
  let d = ellipsoid(x, y, z, [0, 0, 0], [1, 0.96, 0.94]);
  d = smin(d, ellipsoid(x, y, z, [0, 0.36, -0.03], [0.98, 0.86, 0.9]), 0.5);
  d = smin(d, ellipsoid(x, y, z, [0.5, -0.3, 0.52], [0.34, 0.3, 0.32]), 0.25);
  d = smin(d, ellipsoid(x, y, z, SNOUT.c, SNOUT.r), 0.09);
  return d - 0.055 * woolOnHead(x, y, z) * wool(x, y, z);
}
// How far forward the head's surface is at this point on the face.
function faceZ(x, y) {
  let z = 1.5;
  for (let i = 0; i < 80; i++) {
    const d = headDistance(Math.abs(x), y, z);
    if (d < 0.001) break;
    z -= Math.max(d, 0.004);
  }
  return z;
}
let headShape;
function headGeometry() {
  if (headShape) return headShape;
  const geometry = surfaceMesh(headDistance, [-1.15, 1.7], [-1.1, 1.25], 1.15, 0.032);
  const position = geometry.attributes.position, colors = new Float32Array(position.count * 3);
  const fur = new THREE.Color(FUR), top = new THREE.Color(FUR_LIGHT), cream = new THREE.Color(CREAM), color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    color.copy(fur).lerp(top, smoothstep(0.4, 1.2, y) * 0.6);
    // Hollows between the tufts are darker, which makes the wool read as soft curls.
    color.multiplyScalar(lerp(1, 0.78 + 0.3 * wool(x, y, z), woolOnHead(x, y, z)));
    const snout = ellipsoid(x, y, z, SNOUT.c, [SNOUT.r[0] * 1.03, SNOUT.r[1] * 1.03, SNOUT.r[2] * 1.03]);
    color.lerp(cream, 1 - smoothstep(-0.015, 0.06, snout));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return (headShape = geometry);
}

// A long woolly ear, widening towards the tip and hung from its top, so it can flap.
function earDistance(x, y, z) {
  let d = capsule(x, y, z, [0, 0, 0], [0, -0.72, 0], 0.24, 0.36);
  d = smin(d, ellipsoid(x, y, z, [0, -0.86, 0], [0.36, 0.3, 0.36]), 0.12);
  return d - 0.06 * wool(x * 1.1, y, z + 1);
}
let earShape;
function earGeometry() {
  if (earShape) return earShape;
  const geometry = surfaceMesh(earDistance, [-1.3, 0.4], [-0.55, 0.55], 0.55, 0.03);
  const position = geometry.attributes.position, colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    color.setHex(FUR_DARK).multiplyScalar(0.8 + 0.3 * wool(position.getX(i) * 1.1, position.getY(i), position.getZ(i) + 1));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return (earShape = geometry);
}

function buildHead() {
  const head = new THREE.Group(), ears = [];
  head.add(new THREE.Mesh(headGeometry(), plush(FUR, true)));
  const earMaterial = plush(FUR_DARK, true);
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.92, 0.4, 0.05);
    ear.rotation.z = side * 0.14;
    ear.add(new THREE.Mesh(earGeometry(), earMaterial));
    head.add(ear);
    ears.push(ear);
  }
  const onFace = (x, y, lift = 0) => [x, y, faceZ(x, y) + lift];
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  // Glossy nose, a short line down to a small smile, the mouth behind it and the tip of a tongue.
  const noseAt = onFace(0, -0.12, -0.01);
  const nose = ball(head, mat(0x1c0d09, 0.14), noseAt, [0.15, 0.115, 0.09]);
  ball(head, shine, [noseAt[0] - 0.05, noseAt[1] + 0.045, noseAt[2] + 0.075], [0.036, 0.02, 0.012]);
  const lip = mat(0x4a2a1f, 0.8);
  ball(head, lip, onFace(0, -0.25), [0.013, 0.06, 0.013]);
  for (const side of [-1, 1]) {
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 8, 24, Math.PI), lip);
    smile.position.set(...onFace(side * 0.085, -0.3, 0.004));
    smile.rotation.set(0, side * 0.2, Math.PI);
    head.add(smile);
  }
  const mouthAt = onFace(0, -0.41, -0.012);
  const mouth = ball(head, mat(0x6b1f2d, 0.7), mouthAt, [0.1, 0.01, 0.05]);
  const tongueAt = onFace(0, -0.395, -0.006);
  const tongue = ball(head, mat(0xff7f9f, 0.45), tongueAt, [0.07, 0.085, 0.03]);
  // Soft rosy cheeks and small raised brows.
  const blush = new THREE.MeshBasicMaterial({ color: 0xff7fa6, transparent: true, opacity: 0.42, depthWrite: false });
  const brows = [];
  for (const side of [-1, 1]) {
    const cheek = ball(head, blush, onFace(side * 0.6, -0.12, 0.006), [0.15, 0.09, 0.025]);
    cheek.rotation.y = side * 0.62;
    const brow = ball(head, mat(0x4f2e1f, 0.8), onFace(side * 0.38, 0.53, 0.008), [0.11, 0.024, 0.02]);
    brows.push({ mesh: brow, side, y: brow.position.y });
  }
  // Big glossy puppy eyes: a dark rim, a warm glow low in the eye, a large highlight and a small
  // sparkle. The highlights are on the same side in both eyes, as if lit by one lamp. The glow and
  // highlights move together to show where the dog is looking; happy eyes close into small arcs.
  const eyes = [];
  const rim = mat(0x2a150d, 0.6), eyeBall = mat(0x160906, 0.08), iris = new THREE.MeshBasicMaterial({ color: 0x5f2e1a });
  for (const side of [-1, 1]) {
    const eye = new THREE.Group(), open = new THREE.Group(), pupil = new THREE.Group();
    eye.position.set(...onFace(side * 0.38, 0.16, -0.075));
    eye.rotation.y = side * 0.3;
    ball(open, rim, [0, 0, 0], [0.245, 0.28, 0.1]);
    ball(open, eyeBall, [0, 0, 0.015], [0.22, 0.255, 0.125]);
    ball(pupil, iris, [0, -0.1, 0.105], [0.14, 0.1, 0.025]);
    ball(pupil, shine, [-0.075 - side * 0.03, 0.1, 0.115], [0.075, 0.085, 0.02]);
    ball(pupil, shine, [0.085 - side * 0.03, -0.1, 0.112], [0.032, 0.032, 0.012]);
    open.add(pupil);
    eye.add(open);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.036, 10, 28, Math.PI), rim);
    arc.position.set(0, -0.06, 0.09);
    arc.visible = false;
    eye.add(arc);
    head.add(eye);
    eyes.push({ open, pupil, arc });
  }
  // Bow, tilted on the right of the head.
  const bow = new THREE.Group();
  bow.position.set(0.62, 0.62, 0.72);
  bow.rotation.z = -0.35;
  bow.scale.setScalar(1.25);
  const pink = mat(PINK, 0.38), pinkDark = mat(PINK_DARK, 0.45);
  for (const side of [-1, 1]) {
    ball(bow, pink, [side * 0.28, 0.02, 0], [0.28, 0.2, 0.13]);
    const tail = ball(bow, pinkDark, [side * 0.12, -0.2, 0], [0.07, 0.19, 0.05]);
    tail.rotation.z = side * 0.5;
  }
  ball(bow, pinkDark, [0, 0, 0.04], [0.1]);
  head.add(bow);
  return { head, parts: { eyes, brows, ears, nose, mouth, mouthY: mouthAt[1], tongue, tongueY: tongueAt[1], blush } };
}

// ---------- Expressions ----------
// Every expression is a mix of these values, so GSAP can blend smoothly from one to another.
const neutralFace = () => ({
  blink: 1, lid: 1, joy: 0, wide: 0, lookX: 0, lookY: 0, browUp: 0, browOne: 0, open: 0, tongue: 0, pant: 0, sniff: 0, perk: 0, earFlick: 0,
  headYaw: 0, headPitch: 0, headTilt: 0
});
function poseFace(parts, f, time, air = 0) {
  const wide = Math.max(f.wide, air * 0.7), perk = Math.max(f.perk, air * 0.6);
  for (const { open, pupil, arc } of parts.eyes) {
    open.visible = f.joy < 0.9;
    open.scale.set(1 + wide * 0.06, Math.max(0.06, f.blink * f.lid * (1 - f.joy)) * (1 + wide * 0.12), 1);
    pupil.position.set(f.lookX * 0.05, f.lookY * 0.045, 0);
    arc.visible = f.joy > 0.55;
  }
  for (const { mesh, side, y } of parts.brows) {
    mesh.position.y = y + f.browUp * 0.05 + (side > 0 ? f.browOne * 0.075 : 0) + f.joy * 0.03;
    mesh.rotation.z = side * (-0.25 + f.joy * 0.2);
  }
  parts.ears.forEach((ear, i) => {
    const side = i ? 1 : -1;
    ear.rotation.z = side * (0.14 + perk * 0.3 + (i ? f.earFlick * 0.3 : 0));
  });
  // A panting mouth opens and closes quickly; the tongue hangs further out the wider it opens.
  const panting = f.pant * (0.55 + Math.sin(time * 14) * 0.13);
  const open = Math.max(f.open, panting, air * 0.85), tongue = Math.max(f.tongue, f.pant * 0.85, air * 0.5);
  parts.mouth.visible = open > 0.02;
  parts.mouth.scale.set(0.1 + open * 0.035, Math.max(0.01, open * 0.13), 0.05);
  parts.mouth.position.y = parts.mouthY - open * 0.05;
  parts.tongue.position.y = parts.tongueY - tongue * 0.11 - open * 0.03;
  parts.tongue.scale.y = 0.085 + tongue * 0.06;
  parts.nose.scale.set(0.15 * (1 + f.sniff * 0.1), 0.115 * (1 + f.sniff * 0.22), 0.09);
  parts.blush.opacity = 0.42 + f.joy * 0.28;
}

// ---------- The body: one skin in a standing pose, with a skeleton inside ----------
// Rest positions of the joints. Every leg bone hangs straight down, so an angle of 0 means "at rest".
const JOINT = {
  pelvis: [0, 0.24, -0.55], spine: [0, 0.25, -0.05], chest: [0, 0.26, 0.45], neck: [0, 0.72, 0.86], head: [0, 1.12, 1.22], tail: [0, 0.75, -1],
  flHip: [-0.3, 0, 0.72], flKnee: [-0.3, -0.5, 0.72], flAnkle: [-0.3, -0.97, 0.72],
  frHip: [0.3, 0, 0.72], frKnee: [0.3, -0.5, 0.72], frAnkle: [0.3, -0.97, 0.72],
  blHip: [-0.34, 0.02, -0.72], blKnee: [-0.34, -0.5, -0.72], blAnkle: [-0.34, -0.97, -0.72],
  brHip: [0.34, 0.02, -0.72], brKnee: [0.34, -0.5, -0.72], brAnkle: [0.34, -0.97, -0.72]
};
const PARENT = {
  pelvis: null, spine: "pelvis", chest: "spine", neck: "chest", head: "neck", tail: "pelvis",
  flHip: "chest", flKnee: "flHip", flAnkle: "flKnee", frHip: "chest", frKnee: "frHip", frAnkle: "frKnee",
  blHip: "pelvis", blKnee: "blHip", blAnkle: "blKnee", brHip: "pelvis", brKnee: "brHip", brAnkle: "brKnee"
};

function bodyDistance(x, y, z) {
  // Torso: chest and rump joined by a slimmer waist.
  let d = capsule(x, y, z, [0, 0.26, -0.5], [0, 0.27, 0.5], 0.52, 0.52);
  d = smin(d, ellipsoid(x, y, z, [0, 0.2, 0.62], [0.58, 0.62, 0.56]), 0.25);
  d = smin(d, ellipsoid(x, y, z, [0, 0.26, -0.62], [0.58, 0.6, 0.56]), 0.25);
  d = smin(d, capsule(x, y, z, [0, 0.6, 0.8], [0, 1.02, 1.18], 0.35, 0.3), 0.2);
  // Woolly front leg, ending in a round pompom paw.
  let leg = capsule(x, y, z, [0.3, 0, 0.72], [0.3, -0.5, 0.72], 0.24, 0.19);
  leg = smin(leg, capsule(x, y, z, [0.3, -0.5, 0.72], [0.3, -0.97, 0.72], 0.19, 0.165), 0.05);
  leg = smin(leg, ellipsoid(x, y, z, [0.3, -1.06, 0.8], [0.21, 0.125, 0.26]), 0.1);
  d = smin(d, leg, 0.2);
  // Hind leg, with a full thigh.
  leg = capsule(x, y, z, [0.34, 0.02, -0.72], [0.34, -0.5, -0.72], 0.35, 0.2);
  leg = smin(leg, capsule(x, y, z, [0.34, -0.5, -0.72], [0.34, -0.97, -0.72], 0.195, 0.165), 0.05);
  leg = smin(leg, ellipsoid(x, y, z, [0.34, -1.06, -0.62], [0.21, 0.125, 0.26]), 0.1);
  d = smin(d, leg, 0.2);
  d -= 0.04 * lerp(0.45, 1, smoothstep(-1.15, -0.75, y)) * wool(x, y, z);
  // A slim tail with the poodle's big round pompom at the tip.
  const tail = smin(
    capsule(x, y, z, [0, 0.72, -1], [0, 1.12, -1.22], 0.085, 0.07),
    ellipsoid(x, y, z, [0, 1.27, -1.3], [0.27, 0.27, 0.27]) - 0.065 * wool(x, y + 3, z),
    0.06
  );
  return smin(d, tail, 0.08);
}

// The stretch of skin each bone carries: [bone, from, to].
const SEGMENTS = [
  ["pelvis", [0, 0.24, -1.2], [0, 0.24, -0.1]], ["spine", [0, 0.25, -0.1], [0, 0.26, 0.35]], ["chest", [0, 0.26, 0.35], [0, 0.4, 0.95]],
  ["neck", [0, 0.72, 0.9], [0, 1.12, 1.25]], ["head", [0, 1.12, 1.25], [0, 1.3, 1.4]], ["tail", [0, 0.75, -1], [0, 1.3, -1.3]]
];
for (const key of ["fl", "fr", "bl", "br"]) {
  const hip = JOINT[`${key}Hip`], knee = JOINT[`${key}Knee`], ankle = JOINT[`${key}Ankle`];
  SEGMENTS.push([`${key}Hip`, hip, knee], [`${key}Knee`, knee, ankle], [`${key}Ankle`, ankle, [ankle[0], -1.1, ankle[2] + 0.25]]);
}
function distanceToSegment(x, y, z, a, b) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const px = x - a[0], py = y - a[1], pz = z - a[2];
  const t = clamp01((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz));
  return Math.hypot(px - bx * t, py - by * t, pz - bz * t);
}

let bodyShape;
function bodyGeometry(boneIndex) {
  if (bodyShape) return bodyShape;
  const geometry = surfaceMesh(bodyDistance, [-1.32, 1.7], [-1.72, 1.6], 0.92, 0.033);
  const position = geometry.attributes.position, count = position.count;
  const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4), colors = new Float32Array(count * 3);
  const fur = new THREE.Color(FUR), top = new THREE.Color(FUR_TOP), sock = new THREE.Color(FUR_LIGHT), dark = new THREE.Color(FUR_DARK), color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    // Each point follows its nearest bones, mostly the closest, which keeps the joints bending softly.
    const weights = SEGMENTS.map(([bone, a, b]) => [boneIndex[bone], 1 / (distanceToSegment(x, y, z, a, b) + 0.03) ** 6]).sort((p, q) => q[1] - p[1]).slice(0, 4);
    const total = weights.reduce((sum, w) => sum + w[1], 0);
    weights.forEach(([bone, w], n) => { skinIndex[i * 4 + n] = bone; skinWeight[i * 4 + n] = w / total; });
    // Colour blends too: a slightly darker back, lighter socks, and a darker tail.
    color.copy(fur).lerp(top, smoothstep(0.4, 0.85, y) * 0.8).lerp(sock, smoothstep(-0.72, -1.02, y));
    if (z < -1) color.lerp(dark, smoothstep(0.65, 0.95, y));
    // Hollows between the tufts are darker, which makes the wool read as soft curls.
    color.multiplyScalar(0.78 + 0.3 * wool(x, y, z));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return (bodyShape = geometry);
}

// The shadow is part of the model, so it travels with the dog.
function groundShadow() {
  const paint = document.createElement("canvas");
  paint.width = paint.height = 128;
  const ctx = paint.getContext("2d");
  const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  fade.addColorStop(0, "rgba(27,13,18,.5)");
  fade.addColorStop(1, "rgba(27,13,18,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(paint), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -1.2;
  return mesh;
}

function buildPuppy() {
  const root = new THREE.Group();
  const shadow = groundShadow();
  root.add(shadow);
  const bones = {}, list = [], boneIndex = {};
  for (const name of Object.keys(JOINT)) {
    const bone = new THREE.Bone(), parent = PARENT[name], at = JOINT[name], from = parent ? JOINT[parent] : [0, 0, 0];
    bone.position.set(at[0] - from[0], at[1] - from[1], at[2] - from[2]);
    (parent ? bones[parent] : root).add(bone);
    bones[name] = bone;
    boneIndex[name] = list.length;
    list.push(bone);
  }
  root.updateMatrixWorld(true);
  const skin = new THREE.SkinnedMesh(bodyGeometry(boneIndex), plush(FUR, true));
  skin.frustumCulled = false;
  root.add(skin);
  skin.bind(new THREE.Skeleton(list));

  // Collar around the neck, with the bell at the front.
  const neckRing = new THREE.Group();
  neckRing.position.set(0, -0.02, 0.05);
  neckRing.rotation.x = -Math.PI / 4;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 14, 48), mat(PINK, 0.35));
  neckRing.add(collar);
  ball(neckRing, mat(GOLD, 0.25), [0, -0.47, 0.04], [0.11]);
  bones.neck.add(neckRing);

  const { head, parts } = buildHead();
  head.scale.setScalar(HEAD_SIZE);
  head.position.set(0, 0.05, 0.08);
  bones.head.add(head);
  return { root, bones, head, parts, shadow };
}

function lights(scene, renderer) {
  // A soft studio reflection gives the fur gentle ambient light and real reflections in the eyes.
  const studio = new THREE.PMREMGenerator(renderer);
  scene.environment = studio.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  studio.dispose();
  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x9a6f5c, 0.9));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.9);
  key.position.set(-2.5, 3.5, 5);
  scene.add(key);
  // A soft pink light from behind separates the dog from the background, as in animated films.
  const rim = new THREE.DirectionalLight(0xffc6e6, 1.8);
  rim.position.set(3, 2, -4);
  scene.add(rim);
}

// One transparent canvas that keeps its buffer in step with its real size on screen.
function view(canvas, content, { unitPx, centerY }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  lights(scene, renderer);
  scene.add(content);
  const fov = 24;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  const render = () => renderer.render(scene, camera);
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    const pixelRatio = Math.max(1, (box.width / w) * devicePixelRatio);
    renderer.setPixelRatio(Math.min(pixelRatio, 3));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, centerY, h / unitPx / 2 / Math.tan((fov / 2) * (Math.PI / 180)));
    camera.updateProjectionMatrix();
    render();
  };
  return { renderer, render, resize };
}

function softwareOnly() {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return true;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "";
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

function start() {
  if (mode !== "3d" && softwareOnly()) {
    console.info("dog3d: no fast WebGL, keeping the SVG dog");
    return;
  }
  const seatedCanvas = document.getElementById("dogCanvas");
  const dog = buildPuppy();
  const seatedView = view(seatedCanvas, dog.root, { unitPx: 35, centerY: 1.26 });

  document.body.classList.add("dog-3d");
  const fallBack = () => document.body.classList.remove("dog-3d");
  seatedCanvas.addEventListener("webglcontextlost", fallBack);

  const resize = () => seatedView.resize();
  // The scene's scale is set by overlay.js; waiting a tick lets it apply on a window resize.
  addEventListener("resize", () => setTimeout(resize, 0));

  let last = 0;
  gsap.ticker.add(time => {
    if (time - last < 1 / FPS) return;
    last = time;
    seatedView.render();
  });

  // ---------- Pose: blends sitting (run = 0) into walking on all fours (run = 1) ----------
  const REST_FACING = 0.3;
  // run: sitting to standing. stride: standing still to stepping. air, crouch and pitch shape a jump.
  const face = neutralFace();
  let faceTime = 0;
  const pose = { run: 0, stride: 0, facing: REST_FACING, turn: -REST_FACING, phase: 0, speed: 0, shake: 0, breathe: 0, air: 0, crouch: 0, pitch: 0, happy: 0, tailPhase: 0 };
  const STRIDE = 0.6, STANCE = 0.62; // length of a step; share of the cycle a paw spends on the ground
  const LIFT = 0.2, ANKLE_Y = -0.97; // how high a paw lifts; ankle height with the paw on the ground
  // A real walk has four beats: back left, front left, back right, front right.
  const BEAT = { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 };
  const SIT = { pelvisY: -0.66, pelvisZ: -0.38, pelvisAngle: -0.72, frontZ: 0.6, backZ: 0.02 };

  const offset = (a, b) => [JOINT[a][1] - JOINT[b][1], JOINT[a][2] - JOINT[b][2]];
  // Rotation about the x axis, on [y, z].
  const turnAbout = ([y, z], angle) => [y * Math.cos(angle) - z * Math.sin(angle), y * Math.sin(angle) + z * Math.cos(angle)];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const LENGTH = key => ({ upper: JOINT[`${key}Hip`][1] - JOINT[`${key}Knee`][1], lower: JOINT[`${key}Knee`][1] - JOINT[`${key}Ankle`][1] });

  // Two-bone leg: the hip and knee angles that put the ankle on the target, with the knee forward.
  function solveLeg(hipAt, target, { upper, lower }) {
    const dy = target[0] - hipAt[0], dz = target[1] - hipAt[1];
    const reach = Math.max(0.05, Math.min(Math.hypot(dy, dz), (upper + lower) * 0.995));
    const aim = Math.atan2(-dz, -dy);
    const hipBend = Math.acos(Math.min(1, (upper * upper + reach * reach - lower * lower) / (2 * upper * reach)));
    const kneeBend = Math.acos(Math.min(1, (lower * lower + reach * reach - upper * upper) / (2 * lower * reach)));
    return { hip: aim - hipBend, knee: hipBend + kneeBend };
  }

  // On the ground a paw moves backwards at walking speed, so it stays planted; then it swings forward.
  function stepAt(t) {
    if (t < STANCE) return { z: lerp(STRIDE / 2, -STRIDE / 2, t / STANCE), y: 0, swing: 0 };
    const s = (t - STANCE) / (1 - STANCE), eased = s * s * (3 - 2 * s), swing = Math.sin(Math.PI * s);
    return { z: lerp(-STRIDE / 2, STRIDE / 2, eased), y: LIFT * swing, swing };
  }

  function applyPose(deltaMs) {
    const { run, stride, air } = pose, { bones } = dog;
    pose.phase = (pose.phase + (deltaMs / 1000) * pose.speed) % 1;
    pose.tailPhase += (deltaMs / 1000) * lerp(6, 9, run) * (1 + pose.happy * 1.6);
    faceTime += deltaMs / 1000;
    const wave = pose.phase * Math.PI * 2;
    const bob = Math.sin(wave * 2) * 0.02 * run * stride, rock = Math.sin(wave) * run * stride;
    dog.root.rotation.y = pose.facing;

    const pelvisAt = [lerp(SIT.pelvisY, JOINT.pelvis[1] + bob - 0.24 * pose.crouch, run), lerp(SIT.pelvisZ, JOINT.pelvis[2], run)];
    const pelvisAngle = lerp(SIT.pelvisAngle, Math.sin(wave * 2 + 0.6) * 0.015 * stride + pose.pitch, run);
    const spineAngle = pose.breathe * 0.006, chestAngle = pose.breathe * 0.012 + 0.1 * (1 - run) + Math.sin(faceTime * 14) * 0.007 * face.pant;
    bones.pelvis.position.set(0, pelvisAt[0], pelvisAt[1]);
    bones.pelvis.rotation.set(pelvisAngle, 0, rock * 0.03);
    bones.spine.rotation.x = spineAngle;
    bones.chest.rotation.set(chestAngle, 0, -rock * 0.03);
    const spineAt = add(pelvisAt, turnAbout(offset("spine", "pelvis"), pelvisAngle));
    const chestWorld = pelvisAngle + spineAngle + chestAngle;
    const chestAt = add(spineAt, turnAbout(offset("chest", "spine"), pelvisAngle + spineAngle));

    for (const key of ["fl", "fr", "bl", "br"]) {
      const front = key[0] === "f", hipBone = bones[`${key}Hip`], knee = bones[`${key}Knee`], ankle = bones[`${key}Ankle`];
      const parentWorld = front ? chestWorld : pelvisAngle;
      const hipAt = front
        ? add(chestAt, turnAbout(offset(`${key}Hip`, "chest"), chestWorld))
        : add(pelvisAt, turnAbout(offset(`${key}Hip`, "pelvis"), pelvisAngle));
      const step = stepAt((pose.phase + BEAT[key]) % 1);
      const restZ = JOINT[`${key}Ankle`][2];
      const onGround = [ANKLE_Y + step.y * stride * run, lerp(front ? SIT.frontZ : SIT.backZ, restZ + step.z * stride, run)];
      // In the air the front legs reach forward and the hind legs stretch out behind.
      const inAir = front ? [hipAt[0] - 0.74, hipAt[1] + 0.3] : [hipAt[0] - 0.82, hipAt[1] - 0.34];
      const solved = solveLeg(hipAt, [lerp(onGround[0], inAir[0], air), lerp(onGround[1], inAir[1], air)], LENGTH(key));
      hipBone.rotation.x = solved.hip - parentWorld;
      // Hind legs open outwards while sitting, so the haunches show on both sides.
      hipBone.rotation.z = front ? 0 : (key === "bl" ? -0.22 : 0.22) * (1 - run);
      knee.rotation.x = solved.knee;
      // The paw lies flat on the ground and droops a little while it is in the air.
      ankle.rotation.x = -(solved.hip + solved.knee) + step.swing * 0.55 * run * stride + air * 0.7;
    }

    // The neck and head stay level whatever the body is doing, with a soft nod while walking.
    const nod = Math.sin(wave * 2 - 0.9) * run * stride;
    bones.neck.rotation.x = -chestWorld;
    bones.head.rotation.set(0.04 + nod * 0.03 + face.headPitch, -0.06 + pose.turn + pose.shake + rock * 0.03 + face.headYaw, -0.13 * (1 - run) + rock * 0.03 + face.headTilt);
    bones.head.position.y = JOINT.head[1] - JOINT.neck[1] + pose.breathe * 0.015 + nod * 0.01;
    bones.tail.rotation.set(lerp(0.75, 0.1, run) + air * 0.4, 0, Math.sin(pose.tailPhase) * (0.3 + 0.12 * pose.happy));
    // The ears trail behind in the air.
    for (const [i, ear] of dog.parts.ears.entries()) ear.rotation.x = -0.1 * run + Math.sin(wave * 2 - 1.5 + i) * 0.1 * run * stride + air * 0.45;
    dog.shadow.material.opacity = 1 - 0.7 * air;
    poseFace(dog.parts, face, faceTime, air);
  }
  applyPose(0);
  dog.root.updateMatrixWorld(true);
  resize();

  if (reduceMotion) {
    window.dogReact = () => {};
    return;
  }

  gsap.to(pose, { breathe: 1, duration: 1.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
  gsap.ticker.add((_time, deltaMs) => applyPose(deltaMs));

  const blink = () => {
    const twice = Math.random() < 0.25;
    const tl = gsap.timeline({ onComplete: () => gsap.delayedCall(gsap.utils.random(2.6, 5.5), blink) });
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      tl.to(face, { blink: 0.08, duration: 0.07, ease: "power1.in" });
      tl.to(face, { blink: 1, duration: 0.09, ease: "power1.out" });
    }
  };
  gsap.delayedCall(2, blink);

  // ---------- Moving around the frame ----------
  // The canvas moves in the scene's own pixels: x and y are offsets from its place by the jar.
  const stage = { x: 0, y: 0 };
  const HOME_X = 240; // centre of the dog, in .jar-wrap coordinates
  const place = () => gsap.set(seatedCanvas, { x: stage.x, y: stage.y });
  const wrap = document.getElementById("jarWrap");
  const sceneScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
  const bounds = () => {
    const box = wrap.getBoundingClientRect(), s = sceneScale();
    return { min: -box.left / s + 110 - HOME_X, max: (innerWidth - box.left) / s - 110 - HOME_X };
  };
  const play = (target, vars) => new Promise(done => gsap.to(target, { ...vars, onUpdate: place, onComplete: done }));
  const rest = seconds => new Promise(done => gsap.delayedCall(seconds, done));
  const random = gsap.utils.random;

  let lastDir = 1;
  const FACE_SIDE = dir => ({ facing: dir * 1.32, turn: dir * -0.6 });

  async function runTo(x) {
    const distance = Math.abs(x - stage.x);
    if (distance < 20) return;
    const dir = (lastDir = Math.sign(x - stage.x)), speedPx = random(65, 100);
    pose.speed = (speedPx / 35) * (STANCE / STRIDE);
    gsap.to(face, { pant: Math.random() < 0.7 ? 0.9 : 0, duration: 0.4, overwrite: "auto" });
    await Promise.all([
      play(pose, { run: 1, stride: 1, ...FACE_SIDE(dir), duration: 0.42, ease: "power2.out" }),
      play(stage, { x, duration: distance / speedPx, ease: "none" })
    ]);
    await play(pose, { stride: 0, speed: 0, duration: 0.24, ease: "power2.out" });
    gsap.to(face, { pant: 0, duration: 0.7, overwrite: "auto" });
  }

  const sitDown = () => play(pose, { run: 0, facing: REST_FACING, turn: -REST_FACING, duration: 0.45, ease: "power2.inOut" });

  // A proper jump: stand up if needed, crouch, push off with the body rising and the legs stretched,
  // come down nose first with the legs reaching for the ground, then absorb the landing.
  async function leap({ x = stage.x, y = stage.y, height = 60, dir = lastDir }) {
    if (pose.run < 0.98 || Math.abs(pose.facing - dir * 1.32) > 0.05) {
      await play(pose, { run: 1, ...FACE_SIDE(dir), duration: 0.36, ease: "power2.inOut" });
    }
    await play(pose, { crouch: 1, pitch: 0.14, duration: 0.14, ease: "power2.out" });
    const peak = Math.min(y, stage.y) - height, up = 0.3, down = 0.26;
    gsap.to(stage, { x, duration: up + down, ease: "none", onUpdate: place });
    gsap.to(pose, { crouch: 0, air: 1, pitch: -0.42, duration: 0.15, ease: "power2.out" });
    await play(stage, { y: peak, duration: up, ease: "power2.out" });
    gsap.to(pose, { pitch: 0.32, air: 0.55, duration: down, ease: "sine.inOut" });
    await play(stage, { y, duration: down, ease: "power2.in" });
    await play(pose, { air: 0, pitch: 0, crouch: 0.9, duration: 0.08, ease: "power2.out" });
    await play(pose, { crouch: 0, duration: 0.34, ease: "back.out(2)" });
  }

  const withinFrame = x => { const { min, max } = bounds(); return Math.min(max, Math.max(min, x)); };

  // ---------- Things the dog does on its own while it rests ----------
  const side = () => (Math.random() < 0.5 ? -1 : 1);
  const soft = { ease: "sine.inOut" };
  const ACTS = {
    lookAround: f => {
      const s = side();
      return gsap.timeline()
        .to(f, { headYaw: s * 0.42, lookX: s, duration: 0.35, ...soft })
        .to(f, { lookY: 0.5, headPitch: -0.08, duration: 0.25, ...soft }, "+=0.5")
        .to(f, { headYaw: -s * 0.35, lookX: -s, lookY: 0, headPitch: 0, duration: 0.5, ...soft }, "+=0.35")
        .to(f, { headYaw: 0, lookX: 0, duration: 0.35, ...soft }, "+=0.5");
    },
    // The head-tilt of a puzzled puppy, one brow up and the ears lifted.
    curious: f => gsap.timeline()
      .to(f, { headTilt: side() * 0.34, browOne: 1, perk: 0.8, lookY: 0.25, wide: 0.5, duration: 0.3, ease: "back.out(2)" })
      .to(f, { headTilt: 0, browOne: 0, perk: 0, lookY: 0, wide: 0, duration: 0.35, ...soft }, "+=1.1"),
    lookUp: f => gsap.timeline()
      .to(f, { headPitch: -0.32, lookY: 1, browUp: 1, wide: 0.6, open: 0.25, duration: 0.35, ...soft })
      .to(f, { headPitch: 0, lookY: 0, browUp: 0, wide: 0, open: 0, duration: 0.4, ...soft }, "+=1"),
    pant: f => gsap.timeline()
      .to(f, { pant: 1, duration: 0.3, ...soft })
      .to(f, { pant: 0, duration: 0.4, ...soft }, `+=${gsap.utils.random(2, 4)}`),
    yawn: f => gsap.timeline()
      .to(f, { lid: 0.12, headPitch: -0.24, open: 1.5, tongue: 0.8, browUp: 0.6, perk: 0.3, duration: 0.7, ease: "power2.inOut" })
      .to(f, { lid: 1, headPitch: 0, open: 0, tongue: 0, browUp: 0, perk: 0, duration: 0.5, ...soft }, "+=0.6"),
    sniff: f => gsap.timeline()
      .to(f, { headPitch: 0.24, headYaw: side() * 0.16, lookY: -0.7, duration: 0.35, ...soft })
      .to(f, { sniff: 1, duration: 0.09, repeat: 7, yoyo: true, ease: "sine.inOut" })
      .to(f, { headPitch: 0, headYaw: 0, lookY: 0, sniff: 0, duration: 0.35, ...soft }),
    earFlick: f => gsap.timeline().to(f, { earFlick: 1, duration: 0.08, repeat: 3, yoyo: true, ease: "sine.inOut" }).set(f, { earFlick: 0 }),
    smile: f => gsap.timeline()
      .to(f, { joy: 1, open: 0.6, tongue: 0.6, perk: 0.6, duration: 0.2, ...soft })
      .to(f, { joy: 0, open: 0, tongue: 0, perk: 0, duration: 0.3, ...soft }, "+=1")
  };
  const MOODS = ["lookAround", "lookAround", "curious", "curious", "lookUp", "pant", "pant", "yawn", "sniff", "earFlick", "smile"];
  let mood = null, moodWait = null;
  function startMoods() {
    const next = () => {
      mood = ACTS[gsap.utils.random(MOODS)](face);
      mood.eventCallback("onComplete", () => { moodWait = gsap.delayedCall(random(0.4, 1.6), next); });
    };
    moodWait = gsap.delayedCall(random(0.2, 0.8), next);
  }
  function stopMoods() {
    moodWait?.kill();
    mood?.kill();
    mood = moodWait = null;
    gsap.to(face, {
      lid: 1, joy: 0, wide: 0, lookX: 0, lookY: 0, browUp: 0, browOne: 0, open: 0, tongue: 0, pant: 0, sniff: 0, perk: 0, earFlick: 0, headYaw: 0, headPitch: 0, headTilt: 0,
      duration: 0.25, ...soft, overwrite: "auto"
    });
  }

  // Gifts make the dog jump for joy at the next calm moment, never while it is in the middle of a jump.
  let cheerTier = null, lastCheer = 0, wake = null;
  function calm(seconds) {
    startMoods();
    return new Promise(done => {
      const finish = () => { timer.kill(); wake = null; stopMoods(); done(); };
      const timer = gsap.delayedCall(seconds, finish);
      wake = finish;
    });
  }
  async function cheer() {
    if (cheerTier == null) return;
    const tier = cheerTier;
    cheerTier = null;
    lastCheer = performance.now();
    for (let i = 0; i <= tier; i++) await leap({ height: 40 + tier * 22 });
  }

  async function life() {
    for (;;) {
      const { min, max } = bounds();
      await runTo(random(min, max));
      if (Math.random() < 0.6) await leap({ x: withinFrame(stage.x + lastDir * random(30, 60)), height: random(40, 70) });
      await cheer();
      if (Math.random() < 0.6) await sitDown();
      await calm(random(2, 7));
      await cheer();
    }
  }
  gsap.delayedCall(1.5, life);

  // Every gift gets an instant reaction: eyes closing happily, mouth open, ears up, tail wagging, and
  // a look up at the jar. Big gifts add a head shake. The jump for joy follows at the next calm moment.
  let joyTimer = null;
  const delight = (f, hold) => gsap.timeline()
    .to(f, { joy: 1, open: 0.9, tongue: 0.8, perk: 1, duration: 0.14, ease: "power2.out", overwrite: "auto" })
    .to(f, { joy: 0, open: 0, tongue: 0, perk: 0, duration: 0.35, ...soft }, `+=${hold}`);
  window.dogReact = (tier = 0) => {
    const towardJar = Math.sign(155 - (HOME_X + stage.x));
    joyTimer?.kill();
    wake?.();
    joyTimer = delight(face, 0.9 + tier * 0.4);
    gsap.to(face, { headYaw: towardJar * 0.35, headPitch: -0.18, lookX: towardJar, lookY: 0.7, duration: 0.25, overwrite: "auto" });
    gsap.to(face, { headYaw: 0, headPitch: 0, lookX: 0, lookY: 0, duration: 0.4, delay: 1.1 + tier * 0.4, ...soft });
    gsap.fromTo(pose, { happy: 1 }, { happy: 0, duration: 2.2, ease: "power1.in" });
    if (tier) gsap.fromTo(pose, { shake: -0.28 }, { shake: 0, duration: 0.9, ease: "elastic.out(1, .35)" });
    if (performance.now() - lastCheer < 2500) return;
    cheerTier = Math.max(cheerTier ?? 0, tier);
  };
}

if (mode === "glb") {
  // The poodle built in Blender; if it cannot load, fall back to the dog drawn in this file.
  import("/dogglb.js")
    .then(glb => glb.startGlbDog())
    .then(info => console.info("dog3d: GLB dog ready", info))
    .catch(error => {
      console.warn("dog3d: GLB dog failed, using the built-in dog", error);
      start();
    });
} else if (mode !== "svg") {
  try {
    const started = performance.now();
    start();
    console.info(`dog3d: ready in ${Math.round(performance.now() - started)} ms`);
  } catch (error) {
    document.body.classList.remove("dog-3d");
    console.warn("dog3d: keeping the SVG dog", error);
  }
}

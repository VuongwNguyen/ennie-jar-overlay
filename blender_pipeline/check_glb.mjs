// Reads a GLB directly and reports what it really contains, so QA does not rely on the export log.
// Usage: node blender_pipeline/check_glb.mjs poodle/export/poodle_web.glb poodle/qa/glb_report_web.json
import { readFileSync, writeFileSync } from "node:fs";

const [file, out] = process.argv.slice(2);
const buffer = readFileSync(file);
if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error("Not a GLB file");
const json = JSON.parse(buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)));
const accessor = i => json.accessors[i];
let triangles = 0, vertices = 0;
const mesh = (json.meshes ?? []).map(m => {
  const t = m.primitives.reduce((sum, p) => sum + (p.indices !== undefined ? accessor(p.indices).count / 3 : accessor(p.attributes.POSITION).count / 3), 0);
  const v = m.primitives.reduce((sum, p) => sum + accessor(p.attributes.POSITION).count, 0);
  triangles += t;
  vertices += v;
  return { name: m.name, triangles: t, vertices: v, attributes: Object.keys(m.primitives[0].attributes) };
});
const report = {
  file, megabytes: +(buffer.length / 1048576).toFixed(2), triangles, vertices,
  meshes: mesh.length, bodyMesh: mesh.find(m => m.name === "PoodleBody"),
  materials: (json.materials ?? []).map(m => ({ name: m.name, roughness: m.pbrMetallicRoughness?.roughnessFactor ?? 1, metallic: m.pbrMetallicRoughness?.metallicFactor ?? 1, extensions: Object.keys(m.extensions ?? {}) })),
  skins: (json.skins ?? []).map(s => ({ joints: s.joints.length })),
  animations: (json.animations ?? []).map(a => ({ name: a.name, channels: a.channels.length, seconds: +Math.max(...a.samplers.map(s => accessor(s.input).max?.[0] ?? 0)).toFixed(2) })),
  extensionsUsed: json.extensionsUsed ?? [],
  faceParts: (json.nodes ?? []).map(n => n.name).filter(n => /Eye|Nose|Mouth|Tongue|Bow|Collar|Bell/.test(n ?? "")),
};
const wanted = ["Idle", "Walk", "Run", "Sit", "SitDown", "StandUp", "TailWag", "HeadTilt", "Jump"];
report.checks = {
  isSkinned: report.skins.length === 1 && !!report.bodyMesh?.attributes.includes("JOINTS_0"),
  hasAllClips: wanted.every(name => report.animations.some(a => a.name === name)),
  furIsMatte: (report.materials.find(m => m.name === "Fur")?.roughness ?? 0) >= 0.72 && (report.materials.find(m => m.name === "Fur")?.metallic ?? 1) === 0,
  hasVertexColours: !!report.bodyMesh?.attributes.includes("COLOR_0"),
};
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ megabytes: report.megabytes, triangles, joints: report.skins[0]?.joints, clips: report.animations.map(a => `${a.name}:${a.seconds}s`), materials: report.materials.map(m => m.name), checks: report.checks, extensionsUsed: report.extensionsUsed }));

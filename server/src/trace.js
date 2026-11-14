// Only for development: the server sets it up only when run from the source, never in the packaged app (see
// index.js, TRACE_ON).
// Records what TikTok sends about one person, to find out what (if anything) arrives when they come into
// the live. Turned on from the control page with their @name; kept in data/trace.json so it survives a
// restart. Every message that mentions them is written to data/trace/<name>-<time>.jsonl, one JSON line
// each: decoded messages in full, and messages the TikTok library cannot decode (it drops those) as raw
// bytes in base64, when their @name appears in them. Once a minute it also writes how many messages of
// each kind came in, for everyone, so a minute with no joins at all can be told from one without theirs.
import path from "node:path";
import { appendFile, mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";

const MAX_BYTES = 20 * 1024 * 1024; // a long live stays well under this; past it, writing stops
const cleanName = name => String(name ?? "").trim().replace(/^@/, "").toLowerCase();

// JSON that copes with what decoded messages hold: big numbers, and byte arrays (shown by length).
const toJson = value => JSON.stringify(value, (_key, v) =>
  typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? `<${v.length} bytes>` : v);

export function createTrace(dataDir) {
  const settingsFile = path.join(dataDir, "trace.json");
  const folder = path.join(dataDir, "trace");
  let target = "", needle = null, file = "", lines = 0, bytes = 0, full = false;
  // Their numeric ids, learnt from any message that names them, since some messages carry only the id.
  const ids = new Set();
  let counts = {}, countsSince = Date.now();
  // Writes go one after another, so lines never interleave.
  let writing = Promise.resolve();

  function write(record) {
    if (!file || full) return;
    const line = `${toJson({ at: new Date().toISOString(), ...record })}\n`;
    bytes += Buffer.byteLength(line);
    if (bytes > MAX_BYTES) { full = true; return; }
    lines++;
    writing = writing.then(() => appendFile(file, line, "utf8")).catch(err => console.error("Trace write failed:", err.message));
  }

  async function start(name) {
    target = cleanName(name);
    needle = target ? Buffer.from(target, "utf8") : null;
    ids.clear();
    counts = {};
    countsSince = Date.now();
    lines = bytes = 0;
    full = false;
    file = "";
    if (target) {
      await mkdir(folder, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
      file = path.join(folder, `${target.replace(/[^a-z0-9._]/g, "_")}-${stamp}.jsonl`);
      write({ note: `Bắt đầu soi @${target}` });
    }
    await mkdir(dataDir, { recursive: true });
    await writeFile(`${settingsFile}.tmp`, JSON.stringify({ username: target }), "utf8");
    await rename(`${settingsFile}.tmp`, settingsFile);
  }

  async function load() {
    try {
      const { username } = JSON.parse(await readFile(settingsFile, "utf8"));
      if (cleanName(username)) await start(username);
    } catch { /* not tracing */ }
  }

  // Finds the person's ids in a decoded message: any object whose @name is theirs.
  function learnIds(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 8) return;
    const handle = cleanName(value.uniqueId ?? value.displayId ?? "");
    if (handle === target) for (const id of [value.userId, value.id]) if (id != null && String(id) !== "0") ids.add(String(id));
    for (const child of Object.values(value)) if (child && typeof child === "object" && !(child instanceof Uint8Array)) learnIds(child, depth + 1);
  }

  // Every message from TikTok passes through here: its kind (method), what the library decoded (or null
  // when it could not) and the raw bytes.
  function message(method, decoded, payload) {
    if (!target) return;
    counts[method] = (counts[method] ?? 0) + 1;
    if (Date.now() - countsSince >= 60_000) {
      write({ summary: counts, seconds: Math.round((Date.now() - countsSince) / 1000) });
      counts = {};
      countsSince = Date.now();
    }
    if (decoded) {
      const json = toJson(decoded).toLowerCase();
      const named = json.includes(`"${target}"`);
      const byId = !named && [...ids].some(id => json.includes(`"${id}"`));
      if (!named && !byId) return;
      if (named) learnIds(decoded);
      write({ type: method, matched: named ? "name" : "id", data: decoded });
    } else if (payload && needle) {
      const raw = Buffer.from(payload);
      if (raw.toString("latin1").toLowerCase().includes(needle.toString("latin1"))) {
        write({ type: method, matched: "name", undecoded: true, base64: raw.toString("base64") });
      }
    }
  }

  async function status() {
    let size = 0;
    if (file) size = await stat(file).then(s => s.size, () => 0);
    return { username: target, file: file ? path.basename(file) : "", lines, size, full };
  }

  return { start, load, message, status, filePath: () => file };
}

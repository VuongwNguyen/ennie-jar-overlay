// Started by start.bat in the packaged app. Before the server starts, it looks for a newer build on
// GitHub Releases and installs it, keeping the previous files so a build that fails to start is undone.
// It then starts the server and opens the dashboard once the server answers.
// Uses only Node's built-in modules, because node_modules itself may be replaced by an update.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RELEASES = process.env.GIFTJAR_UPDATE_URL || "https://api.github.com/repos/VuongwNguyen/ennie-jar-overlay/releases/latest";
const ASSET = "GiftJar-update.zip";
// What an update replaces. node/ and data/ (the gifts and donors) are never touched.
const PARTS = ["overlay", "server", "node_modules", "package.json", "package-lock.json", "launcher.mjs", "HUONG-DAN.txt", "version.json"];
const WORK = path.join(ROOT, "update");
const PORT = Number(process.env.PORT || 8787);
const DASHBOARD = `http://127.0.0.1:${PORT}/`;
// A server that stops within this long after an update counts as a failed update.
const TRIAL_MS = 30_000;

const say = text => console.log(`[Cap nhat] ${text}`);
const readJson = async file => JSON.parse(await readFile(file, "utf8"));
const buildOf = async dir => (await readJson(path.join(dir, "version.json")).catch(() => ({}))).build ?? 0;

async function download(url, timeoutMs) {
  const response = await fetch(url, { headers: { "User-Agent": "GiftJar-updater" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} (${url})`);
  return response;
}

async function isRunning() {
  try {
    await fetch(DASHBOARD, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

// Moves each part from `from` into `to`, and puts them all back if any move fails.
async function swap(from, to, backup) {
  await rm(backup, { recursive: true, force: true });
  await mkdir(backup, { recursive: true });
  const done = [];
  try {
    for (const part of PARTS) {
      const current = path.join(to, part), incoming = path.join(from, part), saved = path.join(backup, part);
      if (existsSync(current)) await rename(current, saved);
      done.push(part);
      if (existsSync(incoming)) await rename(incoming, current);
    }
  } catch (error) {
    for (const part of done.reverse()) {
      const current = path.join(to, part), saved = path.join(backup, part);
      if (existsSync(saved)) {
        await rm(current, { recursive: true, force: true });
        await rename(saved, current);
      }
    }
    throw error;
  }
}

// Returns the build number that was installed, or null when nothing changed.
async function update() {
  if (process.env.GIFTJAR_NO_UPDATE) return null;
  const current = await buildOf(ROOT);
  say("Dang kiem tra ban moi...");
  let release;
  try {
    release = await (await download(RELEASES, 8000)).json();
  } catch (error) {
    say(`Khong kiem tra duoc (${error.message}). Chay ban hien tai.`);
    return null;
  }
  const latest = Number(/^build-(\d+)$/.exec(release.tag_name ?? "")?.[1] ?? 0);
  const skipped = await readJson(path.join(WORK, "skip.json")).catch(() => ({}));
  if (latest <= current) {
    say(`Dang dung ban moi nhat (build ${current}).`);
    return null;
  }
  if (latest === skipped.build) {
    say(`Bo qua build ${latest} vi lan truoc no khong chay duoc. Chay build ${current}.`);
    return null;
  }
  const zipAsset = release.assets?.find(asset => asset.name === ASSET);
  const sumAsset = release.assets?.find(asset => asset.name === `${ASSET}.sha256`);
  if (!zipAsset || !sumAsset) {
    say(`Build ${latest} chua co file cap nhat. Chay build ${current}.`);
    return null;
  }

  const zipFile = path.join(WORK, ASSET), unpacked = path.join(WORK, "new");
  try {
    await mkdir(WORK, { recursive: true });
    say(`Dang tai build ${latest} (${(zipAsset.size / 1048576).toFixed(1)} MB)...`);
    const expected = (await (await download(sumAsset.browser_download_url, 15000)).text()).trim().split(/\s+/)[0].toLowerCase();
    const bytes = Buffer.from(await (await download(zipAsset.browser_download_url, 10 * 60_000)).arrayBuffer());
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== expected) throw new Error("file tai ve bi hong (sai ma kiem tra)");
    await writeFile(zipFile, bytes);

    await rm(unpacked, { recursive: true, force: true });
    await mkdir(unpacked, { recursive: true });
    const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
    const result = spawnSync(tar, ["-xf", zipFile, "-C", unpacked], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("khong giai nen duoc");
    if (!existsSync(path.join(unpacked, "server", "src", "index.js")) || (await buildOf(unpacked)) !== latest) {
      throw new Error("file cap nhat thieu noi dung");
    }
    const needs = (await readJson(path.join(unpacked, "version.json"))).node;
    if (needs && needs !== process.version) {
      say(`Build ${latest} can Node ${needs}, may nay dang co ${process.version}. Hay tai lai ban day du tren GitHub.`);
      return null;
    }

    await swap(unpacked, ROOT, path.join(WORK, "backup"));
    await writeFile(path.join(WORK, "previous.json"), JSON.stringify({ build: current }));
    say(`Da cap nhat tu build ${current} len build ${latest}.`);
    return latest;
  } catch (error) {
    say(`Cap nhat that bai (${error.message}). Chay build ${current}.`);
    return null;
  } finally {
    await rm(zipFile, { force: true });
    await rm(unpacked, { recursive: true, force: true });
  }
}

// Puts back the files from before the update, and remembers not to install that build again.
async function rollBack(failed) {
  const backup = path.join(WORK, "backup");
  const broken = path.join(WORK, "failed");
  await swap(backup, ROOT, broken);
  await rm(broken, { recursive: true, force: true });
  await writeFile(path.join(WORK, "skip.json"), JSON.stringify({ build: failed }));
}

function openDashboard() {
  if (process.env.GIFTJAR_NO_BROWSER) return;
  const command = process.platform === "win32" ? ["cmd", ["/c", "start", "", DASHBOARD]]
    : process.platform === "darwin" ? ["open", [DASHBOARD]] : ["xdg-open", [DASHBOARD]];
  spawn(...command, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
}

function startServer() {
  const child = spawn(process.execPath, [path.join(ROOT, "server", "src", "index.js")], { cwd: ROOT, stdio: "inherit" });
  const startedAt = Date.now();
  let ready = false;
  const exited = new Promise(done => child.on("exit", code => done(code ?? 1)));
  (async () => {
    for (let i = 0; i < 60 && child.exitCode === null; i++) {
      if (await isRunning()) {
        ready = true;
        openDashboard();
        return;
      }
      await new Promise(done => setTimeout(done, 500));
    }
  })();
  return exited.then(code => ({ code, early: !ready || Date.now() - startedAt < TRIAL_MS }));
}

if (await isRunning()) {
  console.log(`Gift Jar dang chay roi o ${DASHBOARD}. Khong mo them ban thu hai.`);
  openDashboard();
  process.exit(0);
}
const installed = await update();
let { code, early } = await startServer();
if (installed && code !== 0 && early) {
  const previous = (await readJson(path.join(WORK, "previous.json")).catch(() => ({}))).build ?? 0;
  say(`Build ${installed} khong chay duoc. Dang quay lai build ${previous}...`);
  try {
    await rollBack(installed);
    ({ code } = await startServer());
  } catch (error) {
    say(`Khong quay lai duoc (${error.message}). Hay tai lai ban day du tren GitHub.`);
  }
}
process.exit(code);

import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createTikTokAdapter } from "./tiktok.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../");
const dataDir = path.join(projectRoot, "data");
const dataFile = path.join(dataDir, "session.json");
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(projectRoot, "overlay")));
app.get("/vendor/matter.min.js", (_req, res) => {
  res.sendFile(path.join(projectRoot, "node_modules/matter-js/build/matter.min.js"));
});
app.get("/vendor/gsap.min.js", (_req, res) => {
  res.sendFile(path.join(projectRoot, "node_modules/gsap/dist/gsap.min.js"));
});
// Three's module build imports a second file next to it, so the whole folder is served.
app.use("/vendor/three", express.static(path.join(projectRoot, "node_modules/three/build")));
app.get("/vendor/pacifico.woff2", (_req, res) => {
  res.sendFile(path.join(projectRoot, "node_modules/@fontsource/pacifico/files/pacifico-latin-400-normal.woff2"));
});

const freshState = () => ({ sessionId: randomUUID(), startedAt: Date.now(), totalCoins: 0, gifts: 0, donors: {}, jar: [] });
let state;

// Writes are serialized so concurrent gifts never race on the same .tmp file.
let persistQueue = Promise.resolve();
function persist() {
  const run = async () => {
    await mkdir(dataDir, { recursive: true });
    const tmp = `${dataFile}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await rename(tmp, dataFile);
  };
  persistQueue = persistQueue.then(run, run);
  return persistQueue;
}

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(dataFile, "utf8"));
    if (!parsed || typeof parsed.totalCoins !== "number" || !parsed.donors) throw new Error("Invalid state");
    // Sessions saved by older versions have no jar.
    if (!Array.isArray(parsed.jar)) parsed.jar = [];
    return parsed;
  } catch {
    return freshState();
  }
}

function publicState() {
  const donors = Object.values(state.donors).sort((a, b) => b.coins - a.coins);
  return {
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    totalCoins: state.totalCoins,
    gifts: state.gifts,
    donorCount: donors.length,
    topDonors: donors.slice(0, 5)
  };
}

// Connector contract: every provider must emit this normalized shape.
function normalizeGift(input = {}) {
  const user = input.user || {};
  const gift = input.gift || {};
  const repeatCount = Math.max(1, Number(gift.repeatCount) || 1);
  const diamondCount = Math.max(0, Number(gift.diamondCount) || 0);
  return {
    type: "gift",
    eventId: String(input.eventId || randomUUID()),
    user: {
      id: String(user.id || "anonymous"),
      nickname: String(user.nickname || "Người xem"),
      avatar: typeof user.avatar === "string" ? user.avatar : ""
    },
    gift: {
      id: String(gift.id || "gift"),
      name: String(gift.name || "Quà tặng"),
      image: typeof gift.image === "string" && /^https?:\/\//i.test(gift.image) ? gift.image : "",
      diamondCount,
      repeatCount,
      repeatEnd: gift.repeatEnd !== false
    },
    timestamp: Number(input.timestamp) || Date.now()
  };
}

const seenEvents = new Set();
async function handleGift(raw) {
  const event = normalizeGift(raw);
  // A streak still in progress is credited once, when its final event arrives.
  if (!event.gift.repeatEnd) return { ignored: true, reason: "streak-in-progress" };
  if (seenEvents.has(event.eventId)) return { ignored: true };
  seenEvents.add(event.eventId);
  if (seenEvents.size > 5000) seenEvents.clear();

  const coins = event.gift.diamondCount * event.gift.repeatCount;
  const donor = state.donors[event.user.id] || {
    id: event.user.id, nickname: event.user.nickname, avatar: event.user.avatar, coins: 0, gifts: 0
  };
  donor.nickname = event.user.nickname;
  donor.avatar = event.user.avatar || donor.avatar;
  donor.coins += coins;
  donor.gifts += event.gift.repeatCount;
  state.donors[event.user.id] = donor;
  state.totalCoins += coins;
  state.gifts += event.gift.repeatCount;
  const { name, image, diamondCount, repeatCount } = event.gift;
  state.jar.push({ eventId: event.eventId, calculatedCoins: coins, gift: { name, image, diamondCount, repeatCount } });
  await persist();

  io.emit("gift", { ...event, calculatedCoins: coins });
  io.emit("state", publicState());
  return { ok: true, coins };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "tiktok-jar-overlay", version: "0.1.0" }));
app.get("/api/state", (_req, res) => res.json(publicState()));
// The build number written by scripts/build-windows.sh, shown on the control page. A copy run from the source has none.
app.get("/api/version", async (_req, res) => {
  try {
    res.json(JSON.parse(await readFile(path.join(projectRoot, "version.json"), "utf8")));
  } catch {
    res.json({ build: null });
  }
});

app.post("/api/simulate/gift", async (req, res) => {
  try {
    const result = await handleGift(req.body);
    res.status(result.ignored ? 200 : 201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Could not process gift" });
  }
});

app.post("/api/simulate/member", (req, res) => {
  const nickname = String(req.body?.nickname ?? "").trim().slice(0, 40) || "Người xem";
  handleMember({ type: "member", user: { id: `test-${nickname}`, nickname } });
  res.status(201).json({ ok: true });
});

app.post("/api/session/reset", async (_req, res) => {
  try {
    state = freshState();
    seenEvents.clear();
    await persist();
    io.emit("state", publicState());
    io.emit("session-reset");
    res.json(publicState());
  } catch (error) {
    res.status(500).json({ error: "Could not reset session" });
  }
});

const AUTO_USERNAME = process.env.TIKTOK_USERNAME ?? "ennieiuoiw";
const RETRY_MS = 30_000;
let autoUsername = AUTO_USERNAME;
let retryTimer = null;

// A viewer joined: passed straight to the overlay, where the dog greets them. Nothing is stored.
const handleMember = event => io.emit("member", event);

const tiktok = createTikTokAdapter({
  onGift: handleGift,
  onMember: handleMember,
  onStatus: status => {
    io.emit("tiktok-status", status);
    if (status.state === "disconnected" && autoUsername) scheduleReconnect();
  }
});

function scheduleReconnect() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (autoUsername) tiktok.connect(autoUsername).catch(() => {});
  }, RETRY_MS);
}
function stopAuto() {
  autoUsername = "";
  clearTimeout(retryTimer);
  retryTimer = null;
}

app.get("/api/tiktok/status", (_req, res) => res.json(tiktok.getStatus()));

app.post("/api/tiktok/connect", async (req, res) => {
  try {
    stopAuto();
    const result = await tiktok.connect(req.body?.username);
    autoUsername = result.username;
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error?.message || "Could not connect to TikTok LIVE" });
  }
});

app.post("/api/tiktok/disconnect", async (_req, res) => {
  stopAuto();
  await tiktok.disconnect();
  res.json(tiktok.getStatus());
});

io.on("connection", socket => {
  socket.emit("state", publicState());
  socket.emit("jar", { sessionId: state.sessionId, gifts: state.jar });
  socket.emit("tiktok-status", tiktok.getStatus());
});

state = await loadState();
await persist();
httpServer.listen(PORT, HOST, () => {
  console.log(`Jar Overlay running: http://${HOST}:${PORT}`);
  console.log(`Dashboard: http://${HOST}:${PORT}/`);
  console.log(`OBS overlay: http://${HOST}:${PORT}/overlay.html`);
  if (AUTO_USERNAME) {
    console.log(`Auto-connecting to TikTok @${AUTO_USERNAME} (retry every ${RETRY_MS / 1000}s while offline)`);
    tiktok.connect(AUTO_USERNAME).catch(err => console.log(`TikTok: ${err?.message || err}`));
  }
  console.log("Local-only server; change HOST only if you understand the network exposure.");
});

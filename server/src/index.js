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
  const uniqueId = String(req.body?.uniqueId ?? "").trim().replace(/^@/, "").slice(0, 40);
  const level = value => Math.max(0, Math.min(100, Math.round(Number(value)) || 0));
  handleMember({ type: "member", user: { id: `test-${uniqueId || nickname}`, uniqueId, nickname, fanLevel: level(req.body?.fanLevel), gifterLevel: level(req.body?.gifterLevel) } });
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

// A viewer joined: passed straight to the overlay, where the dog greets them.
// The last viewers who joined, shown on the control page so it is easy to see the @name TikTok sends
// and whether it matched the welcome list. Kept in memory only, and emptied each time a connection to
// a live starts (see onStatus), so it shows the people of the current connection.
const recentMembers = [];
const handleMember = event => {
  const user = withRememberedLevels(event.user);
  const match = welcomeFor(user);
  const seen = { ...event, user, listed: Boolean(match), reason: match?.reason ?? "", at: Date.now() };
  recentMembers.unshift(seen);
  recentMembers.length = Math.min(recentMembers.length, 100);
  io.emit("member", seen);
  if (match) welcome(user, match);
};
app.get("/api/members/recent", (_req, res) => res.json(recentMembers));

// ---------- Remembered levels ----------
// TikTok sends the team heart level with gifts and chat, but not when someone joins. So both levels are
// remembered whenever they are seen, in data/levels.json, and used when that person joins later.
const levelsFile = path.join(dataDir, "levels.json");
let levelCache = {};
let levelsSaveTimer = null;
async function loadLevels() {
  try {
    const parsed = JSON.parse(await readFile(levelsFile, "utf8"));
    levelCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    levelCache = {};
  }
}
// The team heart level belongs to one streamer's fan club, so it is kept per channel; the gifter level
// is the viewer's own and kept once.
const currentChannel = () => String(tiktok.getStatus().username || "").toLowerCase();
function rememberLevels(user) {
  if (!user?.id || String(user.id).startsWith("test-") || !(user.fanLevel || user.gifterLevel)) return;
  const known = levelCache[user.id] ?? {};
  const fan = { ...(known.fan ?? {}) };
  if (user.fanLevel && currentChannel()) fan[currentChannel()] = user.fanLevel;
  levelCache[user.id] = { gifterLevel: user.gifterLevel || known.gifterLevel || 0, fan, at: Date.now() };
  // Written a little later, so a burst of likes or chat makes one write.
  clearTimeout(levelsSaveTimer);
  levelsSaveTimer = setTimeout(async () => {
    try {
      // Keeps the people seen most recently if the file grows large.
      const entries = Object.entries(levelCache);
      if (entries.length > 20_000) levelCache = Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, 15_000));
      await mkdir(dataDir, { recursive: true });
      await writeFile(`${levelsFile}.tmp`, JSON.stringify(levelCache), "utf8");
      await rename(`${levelsFile}.tmp`, levelsFile);
    } catch (error) {
      console.error("Could not save levels:", error.message);
    }
  }, 10_000);
}
// The levels on this message, filled in from what was remembered where TikTok left them out.
function withRememberedLevels(user) {
  rememberLevels(user);
  const known = levelCache[user?.id];
  if (!known) return user;
  return { ...user, fanLevel: user.fanLevel || known.fan?.[currentChannel()] || 0, gifterLevel: user.gifterLevel || known.gifterLevel || 0 };
}

// ---------- Viewers who get the welcome frame (welcome.html) ----------
// Picked by their TikTok @name or numeric id, and kept in data/ so updates never touch the list.
const welcomeFile = path.join(dataDir, "welcome.json");
let welcomeList = [];
// When each person was welcomed: at least 15 seconds apart, and at most 3 times in any 10 minutes.
const welcomedAt = new Map();
const WELCOME_AGAIN_MS = 15_000, WELCOME_WINDOW_MS = 10 * 60_000, WELCOME_MAX_IN_WINDOW = 3;
const cleanId = id => String(id ?? "").trim().replace(/^@/, "").toLowerCase();

async function loadWelcomeList() {
  try {
    const parsed = JSON.parse(await readFile(welcomeFile, "utf8"));
    welcomeList = Array.isArray(parsed) ? parsed.filter(entry => cleanId(entry?.id)) : [];
  } catch {
    welcomeList = [];
  }
}
async function saveWelcomeList() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(`${welcomeFile}.tmp`, JSON.stringify(welcomeList, null, 2), "utf8");
  await rename(`${welcomeFile}.tmp`, welcomeFile);
}
// Who else is welcomed, by level, with one title for each group; kept in data/welcome-rules.json.
// A level must be above the number set: fan "above 10" means team heart level 11 and up.
const rulesFile = path.join(dataDir, "welcome-rules.json");
const DEFAULT_RULES = {
  fan: { on: true, above: 10, badge: "FAN CỨNG" },
  gifter: { on: true, above: 15, badge: "NHÀ TÀI TRỢ" }
};
let welcomeRules = structuredClone(DEFAULT_RULES);
function cleanRules(input) {
  const rule = (value, fallback) => ({
    on: typeof value?.on === "boolean" ? value.on : fallback.on,
    above: Math.max(0, Math.min(100, Math.round(Number(value?.above ?? fallback.above)) || 0)),
    badge: String(value?.badge ?? fallback.badge).trim().slice(0, 16) || fallback.badge
  });
  return { fan: rule(input?.fan, DEFAULT_RULES.fan), gifter: rule(input?.gifter, DEFAULT_RULES.gifter) };
}
async function loadWelcomeRules() {
  try {
    welcomeRules = cleanRules(JSON.parse(await readFile(rulesFile, "utf8")));
  } catch {
    welcomeRules = structuredClone(DEFAULT_RULES);
  }
}

// In order: picked by name, then team heart level, then gifter level. The first that matches gives the
// title on the frame, and its place in the queue (rank 1 is shown first).
function welcomeFor(user) {
  const ids = [user?.uniqueId, user?.id].map(cleanId).filter(Boolean);
  const listed = welcomeList.find(entry => ids.includes(cleanId(entry.id)));
  if (listed) return { id: listed.id, badge: listed.badge, reason: "list", rank: 1 };
  const id = user?.uniqueId || user?.id;
  const { fan, gifter } = welcomeRules;
  if (fan.on && (user?.fanLevel ?? 0) > fan.above) return { id, badge: fan.badge, reason: "fan", rank: 2 };
  if (gifter.on && (user?.gifterLevel ?? 0) > gifter.above) return { id, badge: gifter.badge, reason: "gifter", rank: 3 };
  return null;
}
// Someone who leaves and comes back within 15 seconds is not welcomed twice, and nobody more than
// 3 times in 10 minutes. The test button (force) is not counted against either.
function welcome(user, match, { force = false } = {}) {
  const key = cleanId(match.id), now = Date.now();
  if (!force) {
    const recent = (welcomedAt.get(key) ?? []).filter(at => now - at < WELCOME_WINDOW_MS);
    if (recent.length >= WELCOME_MAX_IN_WINDOW || (recent.length && now - recent.at(-1) < WELCOME_AGAIN_MS)) return;
    welcomedAt.set(key, [...recent, now]);
  }
  io.emit("welcome", {
    name: user?.nickname || match.id, avatar: user?.avatar || "", badge: match.badge || "KHÁCH QUÝ",
    rank: match.rank ?? 1, reason: match.reason ?? "list"
  });
}

app.get("/api/welcome/rules", (_req, res) => res.json(welcomeRules));
app.post("/api/welcome/rules", async (req, res) => {
  welcomeRules = cleanRules(req.body);
  await mkdir(dataDir, { recursive: true });
  await writeFile(`${rulesFile}.tmp`, JSON.stringify(welcomeRules, null, 2), "utf8");
  await rename(`${rulesFile}.tmp`, rulesFile);
  res.json(welcomeRules);
});

app.get("/api/welcome", (_req, res) => res.json(welcomeList));
app.post("/api/welcome", async (req, res) => {
  const id = String(req.body?.id ?? "").trim().replace(/^@/, "").slice(0, 40);
  const badge = String(req.body?.badge ?? "").trim().slice(0, 16) || "KHÁCH QUÝ";
  if (!cleanId(id)) return res.status(400).json({ error: "Nhập @tên hoặc id TikTok" });
  welcomeList = welcomeList.filter(entry => cleanId(entry.id) !== cleanId(id));
  welcomeList.push({ id, badge });
  await saveWelcomeList();
  res.status(201).json(welcomeList);
});
app.delete("/api/welcome/:id", async (req, res) => {
  welcomeList = welcomeList.filter(entry => cleanId(entry.id) !== cleanId(req.params.id));
  await saveWelcomeList();
  res.json(welcomeList);
});
// Shows the frame for someone on the list straight away, to check how it looks.
app.post("/api/welcome/test", (req, res) => {
  const entry = welcomeList.find(item => cleanId(item.id) === cleanId(req.body?.id));
  if (!entry) return res.status(404).json({ error: "Không có trong danh sách" });
  welcome({ nickname: entry.id }, { id: entry.id, badge: entry.badge, reason: "list", rank: 1 }, { force: true });
  res.status(201).json({ ok: true });
});

const tiktok = createTikTokAdapter({
  onGift: event => {
    rememberLevels(event.user);
    return handleGift(event);
  },
  onMember: handleMember,
  onUser: rememberLevels,
  onStatus: status => {
    // A new connection (Kết nối, or reconnecting on its own) starts with an empty list of joins.
    if (status.state === "connecting") {
      recentMembers.length = 0;
      io.emit("members-cleared");
    }
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
await loadWelcomeList();
await loadWelcomeRules();
await loadLevels();
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

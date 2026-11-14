import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createTikTokAdapter } from "./tiktok.js";
import { createGiftLog } from "./gift-log.js";
import { vietnameseGiftName } from "./gift-names.js";
import { createJarGame } from "./jar-game.js";
import { createGiftCatalog } from "./gift-catalog.js";

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

const freshState = () => ({ sessionId: randomUUID(), startedAt: Date.now(), totalCoins: 0, gifts: 0, donors: {}, jar: [], stolen: 0 });
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
    // How many pieces Ennie has taken out of the jar in the jar game (jar-game.js); none before it existed.
    if (!Number.isFinite(parsed.stolen) || parsed.stolen < 0) parsed.stolen = 0;
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
      name: String(vietnameseGiftName(gift.id, gift.name) || "Quà tặng"),
      image: typeof gift.image === "string" && /^https?:\/\//i.test(gift.image) ? gift.image : "",
      diamondCount,
      repeatCount,
      repeatEnd: gift.repeatEnd !== false
    },
    timestamp: Number(input.timestamp) || Date.now()
  };
}

const giftLog = createGiftLog(dataDir);
// What each gift costs and looks like (gift-catalog.js), for choosing the jar game's gifts by price.
const giftCatalog = createGiftCatalog(dataDir);
const jarGame = createJarGame({ app, io, dataDir, getState: () => state, persist, catalog: giftCatalog });
const seenEvents = new Set();
// source: "tiktok" for a real gift, "test" for one sent from the control page.
async function handleGift(raw, source = "tiktok") {
  const event = normalizeGift(raw);
  // A real gift tells its price and picture; test gifts are made up, so they are left out.
  if (source === "tiktok") giftCatalog.fromGift(event.gift, raw?.gift?.name);
  const logged = { ...event, user: { ...event.user, uniqueId: String(raw?.user?.uniqueId || "") } };
  // A streak still in progress is credited once, when its final event arrives.
  if (!event.gift.repeatEnd) {
    giftLog.gift(logged, "streak-in-progress", source);
    return { ignored: true, reason: "streak-in-progress" };
  }
  if (seenEvents.has(event.eventId)) {
    giftLog.gift(logged, "duplicate", source);
    return { ignored: true };
  }
  seenEvents.add(event.eventId);
  giftLog.gift(logged, "credited", source);
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
  const { id, name, image, diamondCount, repeatCount } = event.gift;
  state.jar.push({ eventId: event.eventId, calculatedCoins: coins, gift: { id, name, image, diamondCount, repeatCount } });
  // A gift of Phe Phá or Phe Giữ also plays a turn of the jar game, once it has fallen in.
  const turn = jarGame.onGift(event, coins);
  await persist();

  io.emit("gift", { ...event, calculatedCoins: coins });
  io.emit("state", publicState());
  if (turn) io.emit("jar-game", turn);
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
    const result = await handleGift(req.body, "test");
    res.status(result.ignored ? 200 : 201).json(result);
  } catch (error) {
    res.status(500).json({ error: "Could not process gift" });
  }
});

app.post("/api/simulate/member", (req, res) => {
  const nickname = String(req.body?.nickname ?? "").trim().slice(0, 40) || "Người xem";
  const uniqueId = String(req.body?.uniqueId ?? "").trim().replace(/^@/, "").slice(0, 40);
  const level = value => Math.max(0, Math.min(100, Math.round(Number(value)) || 0));
  // source "chat", "like", "social" or "gift" pretends they were first seen that way rather than joining.
  const source = ["chat", "like", "social", "gift"].includes(req.body?.source) ? req.body.source : "join";
  considerWelcome({ id: `test-${uniqueId || nickname}`, uniqueId, nickname, fanLevel: level(req.body?.fanLevel), gifterLevel: level(req.body?.gifterLevel) }, source);
  res.status(201).json({ ok: true });
});

app.post("/api/session/reset", async (_req, res) => {
  try {
    giftLog.note(`session reset (was ${state.sessionId}, ${state.totalCoins} coins, ${state.gifts} gifts)`);
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
// Waits between tries while the live cannot be reached: a dropped connection usually comes back within
// seconds, so the first tries are quick, then they settle at 30s while the streamer is offline. The
// count starts over once a connection succeeds.
const RETRY_STEPS_MS = [3_000, 6_000, 12_000, 30_000];
let retryCount = 0;
let autoUsername = AUTO_USERNAME;
let retryTimer = null;

// ---------- People seen in the live ----------
// TikTok does not report every join: on a real live it sometimes sends none for minutes while people
// chat. So someone is considered for the welcome frame when they join, and also the first time they
// are seen in this connection through chat, likes, a gift, a follow or a share.
// The control page lists them (newest first) with why they were or were not welcomed. Kept in memory
// only, and emptied each time a connection to a live starts (see onStatus).
const recentMembers = [];
// For each person seen in this connection: whether their welcome is taken care of (queued or shown),
// and when they were last looked at.
const seenThisConnection = new Map();
// Someone who qualifies but was not welcomed (no overlay open, not shown in time, queue full) is looked
// at again on later activity, at most this often, so a chatty viewer does not fill the list.
const RETRY_WELCOME_MS = 30_000;
const HANDLED = new Set(["queued", "welcomed"]);
function considerWelcome(rawUser, source) {
  const user = withRememberedLevels(rawUser);
  // Nobody is left out for an unusual name: the id TikTok gives everyone comes first.
  const key = String(user?.id || user?.uniqueId || user?.nickname || "");
  if (!key) return;
  const match = welcomeFor(user);
  const before = seenThisConnection.get(key);
  // Joins are always listed and considered. Other activity when it is the first sighting; when this
  // person did not qualify before but does now (a like often comes without badges, and their levels only
  // show with a later chat or gift); or when they qualified but their welcome never made it on screen.
  if (source !== "join" && before) {
    if (before.handled || !match) return;
    if (before.qualified && Date.now() - before.at < RETRY_WELCOME_MS) return;
  }
  const status = match ? welcome(user, match) : (user.fanLevel || user.gifterLevel ? "below" : "no-level");
  seenThisConnection.set(key, { qualified: Boolean(match), handled: HANDLED.has(status), at: Date.now() });
  const seen = { type: "member", user, source, key, listed: Boolean(match), reason: match?.reason ?? "", status, at: Date.now() };
  recentMembers.unshift(seen);
  recentMembers.length = Math.min(recentMembers.length, 100);
  io.emit("member", seen);
}
// A viewer joined: the dog greets them (overlay), and they may get the welcome frame.
const handleMember = event => considerWelcome(event.user, "join");
// Updates the status shown for someone in the list (queued -> welcomed, or dropped).
function updateStatus(key, status) {
  const entry = recentMembers.find(item => item.key === key);
  if (entry) entry.status = status;
  // A welcome that did not make it on screen lets the next sighting of this person try again.
  const seen = seenThisConnection.get(key);
  if (seen) seen.handled = HANDLED.has(status);
  io.emit("member-status", { key, status });
}
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
// When each person's frame was shown: at least 15 seconds apart, and at most 3 times in any 10 minutes.
// Only shown frames count; ones still waiting in the overlay's queue are in pendingWelcomes, so the same
// person is not queued twice. A pending one that the overlay never shows (closed, disconnected) is let go
// after a few minutes.
const welcomedAt = new Map();
const pendingWelcomes = new Map();
// Jar overlays that are open and can show the frame (they say hello when they connect).
const overlaySockets = new Set();
const WELCOME_AGAIN_MS = 15_000, WELCOME_WINDOW_MS = 10 * 60_000, WELCOME_MAX_IN_WINDOW = 3, PENDING_MS = 3 * 60_000;
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
  // The @name or id first; the display name only as a fallback, since several people can share one.
  const listed = welcomeList.find(entry => ids.includes(cleanId(entry.id)))
    ?? welcomeList.find(entry => cleanId(entry.id) === cleanId(user?.nickname));
  if (listed) return { id: user?.uniqueId || user?.id || listed.id, badge: listed.badge, reason: "list", rank: 1 };
  const id = user?.uniqueId || user?.id;
  const { fan, gifter } = welcomeRules;
  if (fan.on && (user?.fanLevel ?? 0) > fan.above) return { id, badge: fan.badge, reason: "fan", rank: 2 };
  if (gifter.on && (user?.gifterLevel ?? 0) > gifter.above) return { id, badge: gifter.badge, reason: "gifter", rank: 3 };
  return null;
}
// Sends someone to the overlay's queue, unless they are already waiting there, were shown less than
// 15 seconds ago, or have been shown 3 times in the last 10 minutes. Returns what happened, for the
// control page. The test button (force) skips the checks and is never counted.
function welcome(user, match, { force = false } = {}) {
  const key = cleanId(match.id), now = Date.now();
  if (!force) {
    const recent = (welcomedAt.get(key) ?? []).filter(at => now - at < WELCOME_WINDOW_MS);
    welcomedAt.set(key, recent);
    // Spam limits, switched off for now: uncomment to allow at most 3 welcomes in 10 minutes per person,
    // at least 15 seconds apart.
    // if (recent.length >= WELCOME_MAX_IN_WINDOW) return "limit";
    // if (recent.length && now - recent.at(-1) < WELCOME_AGAIN_MS) return "soon";
    // Still on: someone already waiting in the overlay's queue is not queued a second time.
    if (now - (pendingWelcomes.get(key) ?? 0) < PENDING_MS) return "queued";
    // With no jar overlay open, nothing could show the frame: say so rather than wait forever.
    if (!overlaySockets.size) return "no-overlay";
    pendingWelcomes.set(key, now);
    // If the overlay never shows it (closed, reloaded, hidden), the line stops saying "waiting".
    setTimeout(() => {
      if (pendingWelcomes.get(key) !== now) return;
      pendingWelcomes.delete(key);
      updateStatusFor(key, "missed");
    }, PENDING_MS);
  }
  io.emit("welcome", {
    key: force ? "" : key, name: user?.nickname || match.id, avatar: user?.avatar || "", badge: match.badge || "KHÁCH QUÝ",
    rank: match.rank ?? 1, reason: match.reason ?? "list"
  });
  return "queued";
}
// The overlay says a frame is on screen. Several overlays may be open; the first report counts. A frame
// shown after its line said "queue full" or "not shown in time" (another overlay was slower) still
// counts, and the line is corrected.
function welcomeShown(key) {
  if (!key) return;
  const entry = recentMembers.find(item => cleanId(item.user?.uniqueId) === key || cleanId(item.user?.id) === key);
  if (!pendingWelcomes.has(key) && !["dropped", "missed"].includes(entry?.status)) return;
  pendingWelcomes.delete(key);
  welcomedAt.set(key, [...(welcomedAt.get(key) ?? []), Date.now()]);
  updateStatusFor(key, "welcomed");
}
// An overlay's queue was full and let someone go. With other overlays open one of them may still show
// it, so only the last overlay standing gets to call it dropped.
function welcomeDropped(key) {
  if (!key || !pendingWelcomes.has(key) || overlaySockets.size > 1) return;
  pendingWelcomes.delete(key);
  updateStatusFor(key, "dropped");
}
// Statuses in the list are keyed by the person's id; the welcome key is their @name or id.
function updateStatusFor(welcomeKey, status) {
  const entry = recentMembers.find(item => cleanId(item.user?.uniqueId) === welcomeKey || cleanId(item.user?.id) === welcomeKey);
  if (entry) updateStatus(entry.key, status);
}

app.get("/api/welcome/rules", (_req, res) => res.json(welcomeRules));
app.post("/api/welcome/rules", async (req, res) => {
  welcomeRules = cleanRules(req.body);
  await mkdir(dataDir, { recursive: true });
  await writeFile(`${rulesFile}.tmp`, JSON.stringify(welcomeRules, null, 2), "utf8");
  await rename(`${rulesFile}.tmp`, rulesFile);
  res.json(welcomeRules);
});

// Where each part sits on the single Studio source (live.html), set on the layout page (layout.html) and
// kept in data/layout.json. Positions are in pixels of a 1080x1920 stage; the list runs from the bottom
// layer to the top one.
const layoutFile = path.join(dataDir, "layout.json");
const STAGE = { w: 1080, h: 1920 };
const LAYERS = {
  // The jar sits at the bottom right of its box and gifts fall in from the top of the box, so the box
  // runs from the top of the screen: a taller box drops them from higher up without making the jar larger
  // (its size follows the width). Width and height change separately for this one.
  // drop: the ceiling the gifts fall from, as a height on the stage (0 is the top of the screen). It may be
  // above the box: the jar's page then reaches up to it, so gifts fall from there without the jar moving.
  jar: { name: "Hũ quà", x: 320, y: 0, w: 760, h: 793, ratio: false, drop: 0 },
  welcome: { name: "Khung chào mừng", x: 140, y: 880, w: 800, h: 346 },
  heart: { name: "Video tim đội", x: 0, y: 0, w: 1080, h: 1920 },
  // The panel of the jar game (pk.html): the guide between rounds, then the PK bars, the clock, the dare and
  // the honours.
  // veil: how solid its background is, 0-100 (see pk.html).
  pk: { name: "Trò chơi trên hũ", x: 140, y: 330, w: 800, h: 300, veil: 55 }
};
const DEFAULT_LAYOUT = Object.entries(LAYERS).map(([id, box]) => ({ id, ratio: true, ...box, visible: true, locked: false }));
let layout = structuredClone(DEFAULT_LAYOUT);
function cleanLayout(input) {
  const list = Array.isArray(input) ? input : [];
  const num = (value, fallback, min, max) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const seen = new Set(), out = [];
  for (const item of list) {
    const base = LAYERS[item?.id];
    if (!base || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({
      id: item.id,
      name: String(item.name ?? base.name).trim().slice(0, 40) || base.name,
      x: num(item.x, base.x, -STAGE.w, 2 * STAGE.w),
      y: num(item.y, base.y, -STAGE.h, 2 * STAGE.h),
      w: num(item.w, base.w, 20, 3 * STAGE.w),
      h: num(item.h, base.h, 20, 3 * STAGE.h),
      visible: item.visible !== false,
      locked: item.locked === true,
      // Keep the width and height in step when resizing (on by default).
      ratio: item.ratio !== false,
      ...("drop" in base ? { drop: num(item.drop, base.drop, -STAGE.h, 2 * STAGE.h) } : {}),
      ...("veil" in base ? { veil: num(item.veil, base.veil, 0, 100) } : {})
    });
  }
  // A part missing from the saved file (one added in a later build) goes on top, where it can be seen.
  for (const item of DEFAULT_LAYOUT) if (!seen.has(item.id)) out.push(structuredClone(item));
  return out;
}
async function loadLayout() {
  try {
    layout = cleanLayout(JSON.parse(await readFile(layoutFile, "utf8")));
  } catch {
    layout = structuredClone(DEFAULT_LAYOUT);
  }
}
let layoutWrite = Promise.resolve();
// Effect settings, set on the control page and kept in data/effects.json: burstFrom is the price of one
// gift, in coins, from which it sets off the heart burst on the jar (bigburst.js); 0 turns the burst off.
const effectsFile = path.join(dataDir, "effects.json");
const DEFAULT_EFFECTS = { burstFrom: 1000 };
let effects = { ...DEFAULT_EFFECTS };
const cleanEffects = input => {
  const n = Math.round(Number(input?.burstFrom));
  return { burstFrom: Number.isFinite(n) ? Math.max(0, Math.min(1_000_000, n)) : DEFAULT_EFFECTS.burstFrom };
};
async function loadEffects() {
  try {
    effects = cleanEffects(JSON.parse(await readFile(effectsFile, "utf8")));
  } catch {
    effects = { ...DEFAULT_EFFECTS };
  }
}
app.get("/api/effects", (_req, res) => res.json(effects));
app.post("/api/effects", async (req, res) => {
  effects = cleanEffects(req.body);
  io.emit("effects", effects);
  await mkdir(dataDir, { recursive: true });
  await writeFile(`${effectsFile}.tmp`, JSON.stringify(effects, null, 2), "utf8");
  await rename(`${effectsFile}.tmp`, effectsFile);
  res.json(effects);
});

// Reloads every open overlay page (live.html and the single ones), for when one looks stuck or should pick
// up a change; nothing else is touched.
app.post("/api/overlay/reload", (_req, res) => {
  io.emit("overlay-reload");
  res.json({ ok: true, overlays: overlaySockets.size });
});

app.get("/api/layout", (_req, res) => res.json({ stage: STAGE, layers: layout, defaults: DEFAULT_LAYOUT }));
app.post("/api/layout", async (req, res) => {
  layout = cleanLayout(req.body?.layers);
  io.emit("layout", layout);
  const snapshot = JSON.stringify(layout, null, 2);
  layoutWrite = layoutWrite.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(`${layoutFile}.tmp`, snapshot, "utf8");
    await rename(`${layoutFile}.tmp`, layoutFile);
  }).catch(err => console.error("Could not save the layout:", err));
  await layoutWrite;
  res.json(layout);
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
  // TikTok's full gift list, with prices and pictures, at most once a day.
  wantsGiftList: () => giftCatalog.wantsTikTokList(),
  onGiftList: list => giftCatalog.fromTikTok(list),
  onGift: event => {
    considerWelcome(event.user, "gift");
    return handleGift(event);
  },
  onMember: handleMember,
  // Chat, likes, follows and shares: their levels are remembered, and someone seen this way for the
  // first time (TikTok may not have reported their join) is considered for the welcome frame.
  onUser: (user, source) => considerWelcome(user, source),
  onStatus: status => {
    // A new connection (Kết nối, or reconnecting on its own) starts with an empty list of people.
    if (status.state === "connecting") {
      recentMembers.length = 0;
      seenThisConnection.clear();
      io.emit("members-cleared");
    }
    io.emit("tiktok-status", status);
    giftLog.status(status);
    if (status.state === "connected") retryCount = 0;
    if (status.state === "disconnected" && autoUsername) scheduleReconnect();
  }
});

function scheduleReconnect() {
  if (retryTimer) return;
  const wait = RETRY_STEPS_MS[Math.min(retryCount, RETRY_STEPS_MS.length - 1)];
  retryCount++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (autoUsername) tiktok.connect(autoUsername).catch(() => {});
  }, wait);
}
function stopAuto() {
  autoUsername = "";
  retryCount = 0;
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
  socket.emit("jar", { sessionId: state.sessionId, gifts: state.jar, stolen: state.stolen });
  socket.emit("tiktok-status", tiktok.getStatus());
  socket.emit("effects", effects);
  jarGame.greet(socket);
  // The overlay reports welcome frames as they appear, or when its queue was full and let one go.
  socket.on("welcome-shown", key => welcomeShown(cleanId(key)));
  socket.on("welcome-dropped", key => welcomeDropped(cleanId(key)));
  socket.on("overlay-hello", () => overlaySockets.add(socket.id));
  socket.on("overlay-bye", () => overlaySockets.delete(socket.id));
  socket.on("disconnect", () => overlaySockets.delete(socket.id));
});

state = await loadState();
await persist();
await loadWelcomeList();
await loadWelcomeRules();
await loadLayout();
await loadEffects();
await loadLevels();
await giftCatalog.load();
await jarGame.load();
httpServer.listen(PORT, HOST, () => {
  console.log(`Jar Overlay running: http://${HOST}:${PORT}`);
  console.log(`Dashboard: http://${HOST}:${PORT}/`);
  console.log(`OBS overlay: http://${HOST}:${PORT}/overlay.html`);
  if (AUTO_USERNAME) {
    console.log(`Auto-connecting to TikTok @${AUTO_USERNAME} (retrying after ${RETRY_STEPS_MS.map(ms => ms / 1000).join("s, ")}s while offline)`);
    tiktok.connect(AUTO_USERNAME).catch(err => console.log(`TikTok: ${err?.message || err}`));
  }
  console.log("Local-only server; change HOST only if you understand the network exposure.");
});

// The jar game: viewers send one gift to send Ennie raiding the jar (Phe Phá) and another to rain it full again
// (Phe Giữ). The streamer picks the two gifts on the control page; they are kept in data/jar-game.json. How
// strong a turn is goes by the coins it was worth, in four steps (TIERS, the sample set). The gifts are real
// gifts all the same: they count towards the total and the top donors like any other, and what is taken is only
// taken from the picture. How many pieces are out of the jar is kept with the session (state.stolen), so a
// reloaded overlay does not fill up again; the overlay (jargame.js) plays each turn.
// On top of that, a round like a PK: the streamer starts it, a clock counts down, each side's gifts add up in
// coins, and when time is up the side with more wins. If Phe Phá wins, Ennie does a dare drawn at random from
// her list at the start of the round. The top three of the winning side are honoured (pk.html shows it all).
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { giftList, vietnameseGiftName } from "./gift-names.js";

// From how many coins a step starts, how many pieces Ennie takes (a pack of three dogs on the last step) and
// how many come back for Phe Giữ (all of them on the last step), and how many hearts rain down.
export const TIERS = [
  { name: "Nhỏ", from: 1, take: 1, dogs: 1, give: 1, hearts: 10 },
  { name: "Vừa", from: 10, take: 3, dogs: 1, give: 3, hearts: 24 },
  { name: "To", from: 100, take: 5, dogs: 1, give: 8, hearts: 45 },
  { name: "Rất to", from: 1000, take: 12, dogs: 3, give: "all", hearts: 110 }
];
export const tierFor = coins => Math.max(0, TIERS.findLastIndex(tier => coins >= tier.from));

// Sample dares, for Ennie to change on the control page.
const SAMPLE_DARES = [
  "Hát một đoạn bài do top 1 chọn",
  "Nhảy 30 giây theo nhạc trend",
  "Nói giọng miền khác trong 1 phút",
  "Làm 3 biểu cảm xấu nhất có thể",
  "Đọc một bài thơ tặng top 1",
  "Đeo tai thỏ đến hết buổi live",
  "Kể một chuyện xấu hổ hồi nhỏ",
  "Gọi tên cảm ơn top 5 thật dễ thương"
];
// Each side has one gift for each level (raid[0] is the gift for "Nhỏ", raid[3] for "Rất to"), so viewers know
// which gift does what. A level may be left empty. The coin ranges of the levels stay as they are: the streamer
// picks a gift whose price fits the level.
const emptyLevels = () => TIERS.map(() => null);
// The gifts Ennie chose, one per level from "Nhỏ" to "Rất to", for a new install to start from.
const DEFAULT_RAID = [
  { id: "5655", name: "Hoa hồng" },      // 1 coin
  { id: "8913", name: "Rosa" },          // 10 coins
  { id: "6766", name: "Bó hoa" },        // 100 coins
  { id: "11862", name: "Sứa phát sáng" } // 1,000 coins
];
const DEFAULT_GUARD = [
  { id: "5269", name: "TikTok" },        // 1 coin
  { id: "9875", name: "Cỏ bốn lá" },     // 10 coins
  { id: "5585", name: "Pháo hoa giấy" }, // 100 coins
  { id: "11046", name: "Thiên hà" }      // 1,000 coins
];
const DEFAULTS = { on: false, raid: DEFAULT_RAID, guard: DEFAULT_GUARD, minutes: 3, dares: SAMPLE_DARES };
// The name is TikTok's Vietnamese one where gift-names.js knows the gift, so a name saved before it changed is
// brought up to date.
const cleanGift = gift => {
  const id = String(gift?.id ?? "").trim().slice(0, 32);
  const name = String(vietnameseGiftName(id, "") || gift?.name || "").trim().slice(0, 40);
  return id && name ? { id, name } : null;
};
// A list of one gift per level. Settings saved before there were levels had one gift per side: it becomes the
// gift for the first level.
const cleanLevels = value => {
  if (Array.isArray(value)) return TIERS.map((_, i) => cleanGift(value[i]));
  const levels = emptyLevels();
  levels[0] = cleanGift(value);
  return levels;
};
const clean = input => {
  const minutes = Number(input?.minutes);
  const dares = Array.isArray(input?.dares)
    ? input.dares.map(dare => String(dare ?? "").trim().slice(0, 80)).filter(Boolean).slice(0, 50)
    : SAMPLE_DARES;
  const raid = cleanLevels(input?.raid), guard = cleanLevels(input?.guard);
  // A gift can only be in one place: a second use of it is left empty.
  const seen = new Set();
  for (const levels of [raid, guard]) {
    levels.forEach((gift, i) => {
      if (!gift) return;
      if (seen.has(gift.id)) levels[i] = null;
      else seen.add(gift.id);
    });
  }
  return {
    on: input?.on === true,
    raid,
    guard,
    minutes: Number.isFinite(minutes) ? Math.max(0.5, Math.min(30, Math.round(minutes * 2) / 2)) : DEFAULTS.minutes,
    dares
  };
};
const sameName = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const TEAMS = ["raid", "guard"];

export function createJarGame({ app, io, dataDir, getState, persist, catalog }) {
  const file = path.join(dataDir, "jar-game.json");
  let settings = clean(DEFAULTS);

  async function load() {
    try {
      settings = clean(JSON.parse(await readFile(file, "utf8")));
    } catch {
      settings = clean(DEFAULTS);
    }
  }
  async function save() {
    await mkdir(dataDir, { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(settings, null, 2), "utf8");
    await rename(`${file}.tmp`, file);
  }

  // Which side and level a gift is: a real gift by its id, a test gift from the control page (no id) by its name.
  function placeOf(gift) {
    for (const team of TEAMS) {
      const level = settings[team].findIndex(picked =>
        picked && (/^\d+$/.test(gift.id ?? "") ? gift.id === picked.id : sameName(gift.name, picked.name)));
      if (level >= 0) return { team, level };
    }
    return null;
  }
  // Both sides have at least one gift.
  const ready = () => TEAMS.every(team => settings[team].some(Boolean));

  const piecesInJar = state => state.jar.reduce((sum, entry) => sum + Math.max(1, Number(entry.gift?.repeatCount) || 1), 0);

  // Works out one turn and counts what leaves or comes back; the caller saves the session and sends it.
  // A gift plays its own level; a long streak of it may be worth a higher one.
  // eventId: the gift that set off the turn, which Ennie leaves in the jar (jargame.js).
  // kept: how many pieces that gift put in the jar, which are not there to be taken.
  function turn(team, coins, nickname, giftName, level = 0, eventId = "", kept = 0) {
    const state = getState();
    const tier = Math.max(level, tierFor(coins)), step = TIERS[tier];
    const stolen = Math.max(0, Number(state.stolen) || 0);
    let count;
    if (team === "raid") count = Math.max(0, Math.min(step.take, piecesInJar(state) - stolen - kept));
    else count = step.give === "all" ? stolen : Math.min(step.give, stolen);
    state.stolen = team === "raid" ? stolen + count : stolen - count;
    return { team, tier, count, dogs: step.dogs, hearts: step.hearts, nickname: String(nickname || "Người xem").slice(0, 40), gift: String(giftName || "").slice(0, 40), eventId };
  }

  // ---------- The round ----------
  // Only in memory: a round lasts minutes, and a restart of the server ends it.
  // A new round first shows its dare for PREVIEW_MS (pk.html counts down), then the clock starts. The last result
  // stays on the panel until the next round starts.
  const PREVIEW_MS = 5000;
  let round = null, timer = null, previewTimer = null, lastResult = null;
  // Gifts count only between the end of the preview and the end of the clock.
  const live = () => !!round && Date.now() >= round.startsAt && Date.now() < round.endsAt;
  const people = side => [...side.values()].sort((a, b) => b.coins - a.coins);
  function publicRound() {
    if (!round) return { running: false, now: Date.now(), result: lastResult };
    return {
      running: true, id: round.id, now: Date.now(), startsAt: round.startsAt, startedAt: round.startsAt, endsAt: round.endsAt, dare: round.dare,
      score: { ...round.score },
      mvp: { raid: people(round.donors.raid)[0] ?? null, guard: people(round.donors.guard)[0] ?? null },
      gifts: { raid: names("raid"), guard: names("guard") }
    };
  }
  const sendRound = () => io.emit("jar-game-round", publicRound());
  // Each level's gift name, "" for a level without one.
  function names(team) { return settings[team].map(gift => gift?.name ?? ""); }

  function addToRound(team, coins, user) {
    if (!live()) return;
    round.score[team] += coins;
    const key = String(user?.id || user?.nickname || "?");
    const donor = round.donors[team].get(key) ?? { nickname: String(user?.nickname || "Người xem").slice(0, 40), avatar: "", coins: 0 };
    if (/^https?:\/\//i.test(user?.avatar ?? "")) donor.avatar = user.avatar;
    donor.coins += coins;
    round.donors[team].set(key, donor);
    sendRound();
  }

  function startRound() {
    clearTimeout(timer);
    clearTimeout(previewTimer);
    const dares = settings.dares.length ? settings.dares : SAMPLE_DARES;
    const startsAt = Date.now() + PREVIEW_MS;
    lastResult = null;
    round = {
      id: randomUUID(), startsAt, endsAt: startsAt + settings.minutes * 60_000,
      dare: dares[Math.floor(Math.random() * dares.length)],
      score: { raid: 0, guard: 0 }, donors: { raid: new Map(), guard: new Map() }
    };
    timer = setTimeout(endRound, round.endsAt - Date.now());
    previewTimer = setTimeout(sendRound, PREVIEW_MS);
    sendRound();
  }

  // Time is up: the side with more coins wins, and its top three are honoured. A draw honours both sides' best.
  function endRound() {
    if (!round) return;
    clearTimeout(timer);
    const { raid, guard } = round.score;
    const winner = raid > guard ? "raid" : guard > raid ? "guard" : "draw";
    const top = winner === "draw"
      ? [...people(round.donors.raid), ...people(round.donors.guard)].sort((a, b) => b.coins - a.coins).slice(0, 3)
      : people(round.donors[winner]).slice(0, 3);
    // Everyone who gave on either side, for the thank-you list after the honours and the control page's list.
    const everyone = { raid: people(round.donors.raid).slice(0, 500), guard: people(round.donors.guard).slice(0, 500) };
    const result = { id: round.id, winner, score: { raid, guard }, dare: winner === "raid" ? round.dare : "", top, everyone };
    round = null;
    lastResult = result;
    sendRound();
    returnAll();
  }

  // Outside a round the jar is an ordinary jar again: whatever Ennie took goes back in (jargame.js rains it in).
  async function returnAll() {
    const state = getState();
    const count = Math.max(0, Number(state.stolen) || 0);
    if (!count) return;
    state.stolen = 0;
    io.emit("jar-game-return", { count });
    await persist();
  }

  // Stopped from the control page: the round is called off, nobody wins.
  function stopRound() {
    clearTimeout(timer);
    clearTimeout(previewTimer);
    if (!round) return;
    round = null;
    sendRound();
    returnAll();
  }

  // The gifts' pictures, for the guide on the PK panel: TikTok sends a gift's picture with the gift, so they are
  // known once each has come in (in this session's jar, or since the server started).
  const images = new Map();
  function imageOf(gift) {
    if (!gift) return "";
    if (images.has(gift.id)) return images.get(gift.id);
    const seen = getState().jar.find(entry => entry.gift?.id === gift.id && entry.gift.image);
    return seen?.gift.image ?? catalog?.list().find(known => known.id === gift.id)?.image ?? "";
  }
  const publicSettings = () => ({ ...settings, tiers: TIERS, images: { raid: settings.raid.map(imageOf), guard: settings.guard.map(imageOf) } });
  const isPicked = id => TEAMS.some(team => settings[team].some(gift => gift?.id === id));

  // Called for every credited gift, after it has been added to the jar.
  function onGift(event, coins) {
    if (/^\d+$/.test(event.gift.id ?? "") && event.gift.image && !images.has(event.gift.id)) {
      images.set(event.gift.id, event.gift.image);
      if (isPicked(event.gift.id)) io.emit("jar-game-settings", publicSettings());
    }
    // Only during a round: before it starts and after it ends, gifts fall into the jar as usual.
    if (!settings.on || !live()) return null;
    const place = placeOf(event.gift);
    if (!place) return null;
    addToRound(place.team, coins, event.user);
    return turn(place.team, coins, event.user.nickname, event.gift.name, place.level, event.eventId, Math.max(1, event.gift.repeatCount || 1));
  }

  const reply = () => ({ ...settings, tiers: TIERS, round: publicRound() });
  app.get("/api/jar-game", (_req, res) => res.json(reply()));
  // The gifts to choose from, with price and picture where known (gift-catalog.js), and any other gift that came
  // in this session.
  app.get("/api/jar-game/gifts", (_req, res) => {
    const list = catalog ? catalog.list() : giftList();
    const known = new Set(list.map(gift => gift.id));
    for (const entry of getState().jar) {
      const { id, name, image, diamondCount } = entry.gift ?? {};
      if (/^\d+$/.test(id ?? "") && !known.has(id)) { known.add(id); list.push({ id, name, coins: diamondCount || 0, image: image || "" }); }
    }
    res.json(list.sort((a, b) => a.name.localeCompare(b.name, "vi")));
  });
  app.post("/api/jar-game", async (req, res) => {
    const wasOn = settings.on;
    settings = clean({ ...settings, ...req.body });
    // Turned off, any round under way stops with it, and every gift Ennie took goes back into the jar.
    if (!settings.on) stopRound();
    if (wasOn && !settings.on) {
      lastResult = null;
      await returnAll();
    }
    io.emit("jar-game-settings", publicSettings());
    if (round) sendRound(); // the gift names on the panel may have changed
    await save();
    res.json(reply());
  });
  // Everyone who has given in the round under way, or in the last one, on both sides (the control page's list).
  app.get("/api/jar-game/contributors", (_req, res) => {
    if (round) {
      return res.json({
        state: live() ? "live" : Date.now() < round.startsAt ? "preview" : "ending",
        dare: round.dare, score: { ...round.score },
        everyone: { raid: people(round.donors.raid), guard: people(round.donors.guard) }
      });
    }
    if (lastResult) return res.json({ state: "done", dare: lastResult.dare, winner: lastResult.winner, score: lastResult.score, everyone: lastResult.everyone });
    res.json({ state: "none" });
  });
  app.post("/api/jar-game/round/start", async (_req, res) => {
    if (!ready()) return res.status(400).json({ error: "Chọn quà cho cả hai phe trước." });
    if (!settings.on) {
      settings.on = true;
      io.emit("jar-game-settings", publicSettings());
      await save();
    }
    startRound();
    res.json(reply());
  });
  app.post("/api/jar-game/round/stop", (_req, res) => {
    stopRound();
    res.json(reply());
  });
  // A turn without a gift, from the test buttons; it plays even while the game is off, and counts towards a
  // round under way, under the name typed on the test tab.
  app.post("/api/jar-game/test", async (req, res) => {
    const team = req.body?.team === "guard" ? "guard" : "raid";
    const tier = Math.max(0, Math.min(TIERS.length - 1, Math.round(Number(req.body?.tier)) || 0));
    const nickname = String(req.body?.nickname ?? "").trim() || "Người thử";
    addToRound(team, TIERS[tier].from, { id: `test-${nickname}`, nickname });
    const play = turn(team, TIERS[tier].from, nickname, "", tier);
    await persist();
    io.emit("jar-game", play);
    res.json(play);
  });

  // What a page that has just connected needs.
  function greet(socket) {
    socket.emit("jar-game-settings", publicSettings());
    socket.emit("jar-game-round", publicRound());
  }

  return { load, onGift, greet, settings: () => settings };
}

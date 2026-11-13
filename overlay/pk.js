// The PK panel of the jar game (pk.html). The server (server/src/jar-game.js) sends the round as it changes:
// the scores, each side's best giver, the dare and when time is up. The clock counts down here, set by the
// server's own time so a computer whose clock is off still shows the right time. While Phe Phá leads the panel
// cries for help, harder in the last 30 seconds. When time is up it shows who won, the dare Ennie owes if Phe
// Phá won, and the winning side's top three, then hides until the next round.
(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  // The honours stay this long; then the thank-you list of both sides, for as long as it needs to scroll through;
  // then the honours again, until the next round.
  const HONOUR_SECONDS = 9, HURRY_SECONDS = 30;
  const panel = $("pk");

  // Drawn at 800 x 300 and scaled to whatever box the layout gives it.
  const fit = () => panel.style.setProperty("--fit", Math.min(innerWidth / 800, innerHeight / 300));
  fit();
  addEventListener("resize", fit);

  let round = null, offset = 0, resultTimer = 0;
  const fmt = n => Number(n || 0).toLocaleString("vi-VN");
  const short = (text, max) => {
    const letters = [...String(text ?? "")];
    return letters.length > max ? `${letters.slice(0, max - 1).join("")}…` : letters.join("");
  };

  // A round picture, or the first letter when there is none or it does not load (TikTok's links expire).
  function avatar(person, fallback) {
    const box = document.createElement("span");
    box.className = "avatar";
    const letter = () => { box.replaceChildren(); box.textContent = [...String(person?.nickname ?? "")][0]?.toUpperCase() || fallback; };
    if (/^https?:\/\//i.test(person?.avatar ?? "")) {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.alt = "";
      img.onerror = letter;
      img.src = person.avatar;
      box.append(img);
    } else {
      letter();
    }
    return box;
  }

  function showMvp(el, person, team) {
    el.replaceChildren();
    if (!person) {
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = team === "raid" ? "Chưa ai phá…" : "Chưa ai giữ…";
      el.append(who);
      return;
    }
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `👑 ${short(person.nickname, 18)}`;
    const coins = document.createElement("em");
    coins.textContent = `${fmt(person.coins)} xu`;
    who.append(coins);
    el.append(avatar(person, team === "raid" ? "😈" : "💗"), who);
  }

  // A side's gifts, one per level ("" where a level has none); older servers sent a single name.
  const giftNames = value => (Array.isArray(value) ? value : [value]).filter(Boolean);
  const firstGift = value => giftNames(value)[0] ?? "";

  // ---------- The side's gifts on the board, one at a time ----------
  // Each side shows one of its gifts, with its picture and what it does, then flips to the next, so viewers see
  // every gift there is to send. Both sides flip at the same moment.
  const FLIP_SECONDS = 2.6;
  let roundGifts = null, flipTimer = 0, flipStep = 0;
  function sideGifts(team) {
    const list = levels(team);
    const names = giftNames(roundGifts?.[team]);
    const out = [];
    list.forEach((gift, i) => {
      if (!gift) return;
      out.push({ name: gift.name, image: settings?.images?.[team]?.[i], does: effect(team, settings?.tiers?.[i], true) });
    });
    // Without the settings yet, the names the round came with.
    return out.length ? out : names.map(name => ({ name, image: "", does: "" }));
  }
  function showGift(box, team, gift) {
    const old = box.querySelector(".card:not(.out)");
    const card = document.createElement("span");
    card.className = "card in";
    card.addEventListener("animationend", () => card.classList.remove("in"), { once: true });
    const pic = document.createElement("span");
    pic.className = "pic";
    picture(pic, gift.image, team === "raid" ? "😈" : "💗");
    const name = document.createElement("b");
    name.textContent = short(gift.name, 14);
    card.append(pic, name);
    if (gift.does) {
      const does = document.createElement("em");
      does.textContent = gift.does;
      card.append(does);
    }
    if (old) {
      old.classList.replace("in", "out");
      old.addEventListener("animationend", () => { old.remove(); box.append(card); }, { once: true });
      setTimeout(() => { if (old.isConnected) { old.remove(); box.append(card); } }, 260);
    } else {
      box.append(card);
    }
  }
  function flipGifts() {
    if (!round) { clearInterval(flipTimer); flipTimer = 0; return; }
    const step = flipStep++;
    // Both sides flip together.
    for (const [team, id] of [["raid", "raidGift"], ["guard", "guardGift"]]) {
      const gifts = sideGifts(team);
      if (!gifts.length) { $(id).replaceChildren(); continue; }
      showGift($(id), team, gifts[step % gifts.length]);
    }
  }

  // Still showing the new round's dare, before its clock starts.
  const inPreview = data => Number.isFinite(data?.startsAt) && Date.now() + offset < data.startsAt;
  let previewing = false;
  function showPreview(data) {
    previewing = true;
    const box = $("result");
    box.className = "result preview";
    box.replaceChildren();
    const title = document.createElement("h1");
    title.textContent = "⚔️ Ván mới sắp bắt đầu!";
    const label = document.createElement("p");
    label.className = "label";
    label.textContent = "🎯 Kèo ván này, Phe Phá thắng là Ennie trả:";
    const dare = document.createElement("p");
    dare.className = "dare-big";
    dare.textContent = data.dare;
    const count = document.createElement("p");
    count.className = "count";
    count.innerHTML = 'Bắt đầu sau <b id="previewCount"></b> giây';
    box.append(title, label, dare, count);
    panel.classList.remove("guiding");
    panel.classList.add("on", "done");
    tick();
  }

  function showRound(data) {
    // A new round takes the place of the last result.
    if (resultShowing) { clearTimeout(resultTimer); stopScroll(); resultShowing = false; }
    round = data;
    if (inPreview(data)) return showPreview(data);
    previewing = false;
    const { raid, guard } = data.score;
    roundGifts = data.gifts;
    if (!flipTimer) { flipGifts(); flipTimer = setInterval(flipGifts, FLIP_SECONDS * 1000); }
    $("scoreRaid").textContent = fmt(raid);
    $("scoreGuard").textContent = fmt(guard);
    // Even at 0 - 0 the bar is split in the middle; a side never shrinks out of sight.
    const share = raid + guard ? Math.min(85, Math.max(15, (raid / (raid + guard)) * 100)) : 50;
    $("fillRaid").style.width = `${share}%`;
    $("spark").style.left = `${share}%`;
    showMvp($("mvpRaid"), data.mvp.raid, "raid");
    showMvp($("mvpGuard"), data.mvp.guard, "guard");
    $("dare").textContent = `Kèo: ${data.dare} · Phe Phá thắng là Ennie trả!`;
    $("help").textContent = `🆘 Cứu Ennie với! Tặng ${firstGift(data.gifts.guard) || "quà Phe Giữ"} 💗`;
    panel.classList.remove("done", "guiding");
    panel.classList.add("on");
    tick();
  }

  // ---------- The guide, while the game is on and no round is under way ----------
  let settings = null, resultShowing = false;
  function picture(box, src, fallback) {
    box.replaceChildren();
    if (!/^https?:\/\//i.test(src ?? "")) { box.textContent = fallback; return; }
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.alt = "";
    img.onerror = () => { box.replaceChildren(); box.textContent = fallback; };
    img.src = src;
    box.append(img);
  }
  const levels = team => (Array.isArray(settings?.[team]) ? settings[team] : [settings?.[team]]);
  const ready = () => ["raid", "guard"].every(team => levels(team).some(Boolean));
  // What a level does, as the guide says it.
  function effect(team, tier, brief = false) {
    if (!tier) return "";
    if (brief) return team === "raid" ? (tier.dogs > 1 ? `${tier.dogs} Ennie tha ${tier.take}` : `tha ${tier.take} món`) : (tier.give === "all" ? "trả hết" : `trả ${tier.give} món`);
    if (team === "raid") return tier.dogs > 1 ? `${tier.dogs} Ennie tha ${tier.take} món` : `Ennie tha ${tier.take} món`;
    return tier.give === "all" ? "Mưa tim, trả lại hết" : `Mưa tim, trả ${tier.give} món`;
  }
  function fillGuide() {
    if (!ready()) return;
    for (const team of ["raid", "guard"]) {
      const list = $(team === "raid" ? "guideRaid" : "guideGuard");
      list.replaceChildren();
      levels(team).forEach((gift, i) => {
        if (!gift) return;
        const row = document.createElement("li");
        const pic = document.createElement("span");
        pic.className = "pic";
        picture(pic, settings.images?.[team]?.[i], team === "raid" ? "😈" : "💗");
        const name = document.createElement("b");
        name.textContent = short(gift.name, 16);
        const does = document.createElement("span");
        does.className = "does";
        does.textContent = effect(team, settings.tiers?.[i]);
        row.append(pic, name, does);
        list.append(row);
      });
    }
  }
  // Between rounds: the guide if the game is on and both gifts are picked, otherwise nothing.
  function idle() {
    if (round || resultShowing) return;
    if (settings?.on && ready()) {
      fillGuide();
      panel.classList.remove("done");
      panel.classList.add("on", "guiding");
    } else {
      panel.classList.remove("on");
    }
  }

  // Stays until the next round: the honours, then everyone who gave, then the honours again, and so on.
  function showResult(result) {
    stopScroll();
    const box = $("result");
    box.className = `result ${result.winner}`;
    box.replaceChildren();
    const title = document.createElement("h1");
    const line = document.createElement("p");
    const { raid, guard } = result.score;
    if (result.winner === "raid") {
      title.textContent = "😈 Phe Phá thắng!";
      line.textContent = `Ennie trả kèo: ${result.dare}`;
    } else if (result.winner === "guard") {
      title.textContent = "💗 Phe Giữ thắng!";
      line.textContent = "Hũ của Ennie được cứu rồi, cảm ơn cả nhà!";
    } else {
      title.textContent = "Hòa nhau rồi!";
      line.textContent = "Không ai thắng, Ennie thoát kèo lần này 😆";
    }
    const score = document.createElement("p");
    score.textContent = `${fmt(raid)} xu — ${fmt(guard)} xu`;
    score.style.fontSize = "16px";
    score.style.opacity = ".75";
    box.append(title, line, score);
    if (result.top?.length) {
      const honours = document.createElement("div");
      honours.className = "honours";
      // The first in the middle, second on the left, third on the right, like a podium.
      const order = [1, 0, 2].filter(i => result.top[i]);
      for (const i of order) {
        const person = result.top[i];
        const item = document.createElement("div");
        item.className = `honour${i === 0 ? " first" : ""}`;
        const rank = document.createElement("span");
        rank.className = "rank";
        rank.textContent = ["👑", "🥈", "🥉"][i];
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = person.nickname;
        const coins = document.createElement("em");
        coins.textContent = `${fmt(person.coins)} xu`;
        item.append(rank, avatar(person, "♡"), name, coins);
        honours.append(item);
      }
      box.append(honours);
    }
    round = null;
    previewing = false;
    resultShowing = true;
    panel.classList.remove("guiding");
    panel.classList.add("on", "done");
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => {
      const seconds = showThanks(result);
      resultTimer = setTimeout(() => showResult(result), seconds * 1000);
    }, HONOUR_SECONDS * 1000);
  }
  function clearResult() {
    clearTimeout(resultTimer);
    stopScroll();
    resultShowing = false;
  }

  // ---------- Everyone who gave, on both sides ----------
  let scrollTimer = 0;
  const stopScroll = () => { clearInterval(scrollTimer); scrollTimer = 0; };
  // Fills the result box with the two lists and returns how many seconds to show them. A list too long for its
  // box scrolls slowly (by scrolling, not moving the text, so it stays sharp), waiting a moment at each end.
  function showThanks(result) {
    const box = $("result");
    box.className = "result thanks";
    box.replaceChildren();
    const title = document.createElement("h1");
    title.textContent = "Cảm ơn mọi người đã chơi! 💖";
    const cols = document.createElement("div");
    cols.className = "thank-cols";
    const lists = [];
    for (const team of ["raid", "guard"]) {
      const people = result.everyone?.[team] ?? [];
      const col = document.createElement("div");
      col.className = `thank-col ${team}`;
      const head = document.createElement("h2");
      head.textContent = `${team === "raid" ? "😈 Phe Phá" : "💗 Phe Giữ"} · ${people.length} người`;
      const list = document.createElement("ol");
      if (!people.length) {
        const li = document.createElement("li");
        li.className = "none";
        li.textContent = "Chưa có ai";
        list.append(li);
      }
      for (const person of people) {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = person.nickname;
        const coins = document.createElement("em");
        coins.textContent = `${fmt(person.coins)} xu`;
        li.append(name, coins);
        list.append(li);
      }
      col.append(head, list);
      cols.append(col);
      lists.push(list);
    }
    box.append(title, cols);
    // How far the longer list has to scroll, at about 22 px a second, with 2 seconds still at either end.
    const SPEED = 22, PAUSE = 2;
    const reach = Math.max(0, ...lists.map(list => list.scrollHeight - list.clientHeight));
    const seconds = Math.min(60, Math.max(8, PAUSE * 2 + reach / SPEED));
    stopScroll();
    if (reach > 0) {
      const start = Date.now() + PAUSE * 1000;
      scrollTimer = setInterval(() => {
        const moved = Math.max(0, (Date.now() - start) / 1000) * SPEED;
        for (const list of lists) list.scrollTop = Math.min(moved, list.scrollHeight - list.clientHeight);
      }, 50);
    }
    return seconds;
  }

  // The clock, and the cry for help while Phe Phá leads.
  function tick() {
    if (!round) return;
    if (previewing) {
      const left = Math.max(0, Math.ceil((round.startsAt - (Date.now() + offset)) / 1000));
      const count = document.getElementById("previewCount");
      if (count) count.textContent = left;
      if (!inPreview(round)) showRound(round);
      return;
    }
    const left = Number.isFinite(round.endsAt) ? Math.max(0, Math.ceil((round.endsAt - (Date.now() + offset)) / 1000)) : 154;
    $("clock").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    const hurry = left <= HURRY_SECONDS;
    $("clock").classList.toggle("hurry", hurry);
    const losing = round.score.raid > round.score.guard;
    $("help").classList.toggle("on", losing);
    $("help").classList.toggle("hurry", losing && hurry);
  }
  setInterval(tick, 250);

  function receive(data) {
    if (!data) return;
    if (Number.isFinite(data.now)) offset = data.now - Date.now();
    if (data.running) return showRound(data);
    if (data.result) return settings && !settings.on ? undefined : showResult(data.result);
    // Stopped, or nothing under way: the guide.
    round = null;
    previewing = false;
    clearResult();
    idle();
  }

  // The layout page shows a made-up round, to see where the panel sits (?preview=guide: the guide instead).
  if (params.get("preview") === "guide") {
    settings = {
      on: true, images: {},
      raid: [{ name: "Hoa hồng" }, { name: "Bánh vòng" }, { name: "Nước hoa" }, { name: "Sư tử" }],
      guard: [{ name: "TikTok" }, { name: "Bắn tim" }, { name: "Thả tim" }, { name: "Thiên hà" }],
      tiers: [{ take: 1, dogs: 1, give: 1 }, { take: 3, dogs: 1, give: 3 }, { take: 5, dogs: 1, give: 8 }, { take: 12, dogs: 3, give: "all" }]
    };
    idle();
    return;
  }
  if (params.has("preview")) {
    const now = Date.now();
    receive({
      running: true, now, endsAt: now + 154_000, dare: "Hát một đoạn bài do top 1 chọn",
      score: { raid: 1240, guard: 860 },
      mvp: { raid: { nickname: "Bé Na", coins: 620 }, guard: { nickname: "Mèo Mun", coins: 410 } },
      gifts: { raid: ["Hoa hồng", "Bánh vòng", "Nước hoa", "Sư tử"], guard: ["TikTok", "Bắn tim", "Thả tim", "Thiên hà"] }
    });
    round.endsAt = Infinity; // the clock stays at 2:34
    tick();
    return;
  }

  const socket = io();
  socket.on("jar-game-round", receive);
  socket.on("jar-game-settings", data => {
    settings = data;
    // Turned off: the panel goes, result and all.
    if (!data?.on) { clearResult(); round = null; previewing = false; }
    if (!round && !resultShowing) idle();
  });
  // "Tải lại overlay" on the control page, when this page is a source of its own (live.html reloads itself).
  socket.on("overlay-reload", () => { if (window.top === window) location.reload(); });
})();

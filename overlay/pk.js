// The PK panel of the jar game (pk.html). The server (server/src/jar-game.js) sends the round as it changes:
// the scores, each side's best giver, the dare and when time is up. The clock counts down here, set by the
// server's own time so a computer whose clock is off still shows the right time, in red for the last 30 seconds
// (the cry for help is Ennie's, in the corner of the jar: jargame.js). When time is up it shows who won, the dare
// Ennie owes if Phe Phá won, the winning side's top three and everyone who gave, until the next round.
(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  // The honours stay this long; then the thank-you list of both sides, for as long as it needs to scroll through;
  // then the honours again, until the next round.
  const HONOUR_SECONDS = 9, HURRY_SECONDS = 30;
  const panel = $("pk");

  // How solid the backgrounds are (0-100, "Độ đậm nền" on the layout page): from the address at first, then by
  // message from live.html whenever it is changed.
  const setVeil = value => {
    const n = Number(value);
    if (Number.isFinite(n)) document.documentElement.style.setProperty("--veil", Math.max(0, Math.min(100, n)) / 100);
  };
  if (params.has("veil")) setVeil(params.get("veil"));
  addEventListener("message", event => {
    if (event.origin === location.origin && event.data?.type === "veil") setVeil(event.data.veil);
  });

  // Drawn at 800 x 300 and scaled to whatever box the layout gives it.
  const fit = () => panel.style.setProperty("--fit", Math.min(innerWidth / 800, innerHeight / 300));
  fit();
  addEventListener("resize", fit);

  let round = null, offset = 0, resultTimer = 0;
  const fmt = n => Number(n || 0).toLocaleString("vi-VN");
  // The game's sounds (pksfx.js), always at full volume.
  window.sfxKit?.setVolume(1);
  const sound = (name, ...args) => {
    try { window.pkSfx?.[name]?.(...args); } catch { /* a sound never stops the panel */ }
  };
  // Phe Giữ's coins count this many times in the round (drawn by jar-game.js), written "×1,5"; 1 means no boost.
  const boostOf = value => (Number(value) > 1 ? Number(value) : 0);
  const boostText = value => `×${boostOf(value).toLocaleString("vi-VN")}`;
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

  // A side's top givers in the round: top 1's picture in front, top 2 and 3 tucked behind it, smaller; no names
  // and no coins (the dare sits between the two sides). people: the top three (an older server sends only top 1, as one person).
  function showMvp(el, people, team) {
    el.replaceChildren();
    const list = (Array.isArray(people) ? people : [people]).filter(Boolean).slice(0, 3);
    const person = list[0];
    if (!person) {
      const who = document.createElement("span");
      who.className = "who";
      who.textContent = team === "raid" ? "Chưa ai phá…" : "Chưa ai giữ…";
      el.append(who);
      return;
    }
    const stack = document.createElement("span");
    stack.className = "stack";
    list.forEach((p, i) => {
      const pic = avatar(p, team === "raid" ? "😈" : "💗");
      pic.classList.add(`rank${i + 1}`);
      stack.append(pic);
    });
    el.append(stack);
  }

  // A side's gifts, one per level ("" where a level has none); older servers sent a single name.
  const giftNames = value => (Array.isArray(value) ? value : [value]).filter(Boolean);

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
  let previewing = false, previewId = null, rollTimer = 0;
  // Every boost a round can draw (BOOSTS in jar-game.js), for the reel to run through.
  const BOOSTS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  // What the panel says about the boost the reel lands on.
  const boostCheer = boost => boost >= 4 ? "🔥 Siêu mạnh!" : boost >= 3 ? "✨ Mạnh ghê!" : boost > 1 ? "💪 Có lợi thế!" : "😅 Xui rồi, không nhân!";
  // The reel: the boosts run past fast, slow down and stop on the round's own one over about ms, then it pops
  // and throws hearts, more the bigger the boost. Too little time left (the page opened late) shows it at once.
  function rollBoost(reel, boost, ms) {
    clearTimeout(rollTimer);
    const value = reel.querySelector(".value"), cheer = reel.parentElement.querySelector(".cheer");
    // rolled: the reel turned on screen, so it lands with its sound (shown at once, it lands quietly).
    const land = rolled => {
      value.textContent = `×${boost.toLocaleString("vi-VN")}`;
      reel.classList.remove("rolling");
      reel.classList.add("landed");
      cheer.textContent = boostCheer(boost);
      cheer.classList.add("on");
      burstHearts(reel, Math.round(6 + boost * 4));
      if (rolled) sound("reelLand", boost);
    };
    if (ms < 400) return land(false);
    reel.classList.add("rolling");
    const started = performance.now();
    let delay = 45, at = Math.floor(Math.random() * BOOSTS.length), ticks = 0;
    const step = () => {
      if (performance.now() - started + delay >= ms) return land(true);
      at = (at + 1 + Math.floor(Math.random() * 3)) % BOOSTS.length;
      value.textContent = `×${BOOSTS[at].toLocaleString("vi-VN")}`;
      sound("reelTick", ticks++);
      // Each number slides in from above.
      value.classList.remove("spin");
      void value.offsetWidth;
      value.classList.add("spin");
      delay *= 1.13;
      rollTimer = setTimeout(step, delay);
    };
    step();
  }
  // Hearts flying out of the reel in every direction.
  function burstHearts(from, count) {
    for (let i = 0; i < count; i++) {
      const heart = document.createElement("span");
      heart.className = "boost-heart";
      heart.textContent = ["💗", "💖", "✨", "💕"][i % 4];
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4, reach = 50 + Math.random() * 70;
      heart.style.setProperty("--dx", `${Math.cos(angle) * reach * 1.6}px`);
      heart.style.setProperty("--dy", `${Math.sin(angle) * reach}px`);
      heart.style.animationDelay = `${Math.random() * 120}ms`;
      heart.addEventListener("animationend", () => heart.remove());
      from.append(heart);
    }
  }
  function showPreview(data) {
    // The same round sent again (a settings change, say) leaves the reel to finish where it is.
    if (previewing && previewId === data.id && $("previewCount")) return tick();
    previewing = true;
    previewId = data.id;
    const box = $("result");
    box.className = "result preview";
    box.replaceChildren();
    // The title with a ring counting down the seconds at its side; under it two cards: the dare Phe Phá plays for,
    // and the round's boost for Phe Giữ, drawn by the server, rolled out on a reel before the clock starts.
    box.innerHTML = `
      <div class="pv-top">
        <h1>⚔️ Ván mới sắp bắt đầu!</h1>
        <div class="pv-ring"><svg viewBox="0 0 60 60"><circle class="track" cx="30" cy="30" r="25"/><circle class="left" cx="30" cy="30" r="25"/></svg><b id="previewCount"></b></div>
      </div>
      <div class="pv-cards">
        <div class="pv-card pv-raid"><span class="pv-tag">😈 Phe Phá thắng thì Ennie phải</span><p class="pv-dare"></p><p class="pv-rule"></p></div>
        <div class="pv-card pv-guard"><span class="pv-tag">💗 Xu Phe Giữ nhân</span><span class="reel"><b class="value">×?</b></span><span class="cheer"></span></div>
      </div>`;
    box.querySelector(".pv-dare").textContent = data.dare;
    box.querySelector(".pv-rule").textContent = `Phe Phá phải hơn Phe Giữ ${Math.round(raidMargin() * 100)}% điểm mới thắng`;
    panel.classList.remove("guiding");
    panel.classList.add("on", "done");
    const left = data.startsAt - (Date.now() + offset);
    // A drum hit for the new round, unless the page has opened near the end of the preview.
    if (left > 2000 && !curtain) sound("preview");
    // The ring empties as the seconds run out.
    const ring = box.querySelector(".pv-ring .left");
    ring.style.animationDuration = `${Math.max(0, left)}ms`;
    // The reel lands a second and a half before the clock starts, so the result can be read.
    rollBoost(box.querySelector(".reel"), Number(data.boost) || 1, Math.min(2600, left - 1500));
    tick();
  }

  // ---------- Moving from one screen to the next ----------
  // A curtain over the whole panel: it closes, the next screen is put in behind it (apply) and it opens again.
  // vs: the two sides' halves clash in from left and right with "VS" between them (a new round).
  // timeup: a sheet comes over the board with "HẾT GIỜ!" stamped on it (the round's end).
  const CURTAINS = {
    vs: { cover: 420, length: 1150, html: '<div class="half raid"><span>😈</span></div><div class="half guard"><span>💗</span></div><b class="vs-badge">VS</b>' },
    timeup: { cover: 700, length: 1350, html: '<div class="sheet"></div><b class="timeup-word">⏰ HẾT GIỜ!</b>' }
  };
  let curtain = null;
  function transition(kind, apply) {
    const { cover, length, html } = CURTAINS[kind];
    curtain = document.createElement("div");
    curtain.className = `curtain ${kind}`;
    curtain.innerHTML = html;
    panel.append(curtain);
    const mine = curtain;
    setTimeout(apply, cover);
    setTimeout(() => { mine.remove(); if (curtain === mine) curtain = null; }, length);
  }

  // ---------- The scores, counting up as gifts come in ----------
  // shown: the number on the bar now; target: where it is counting to (the server's score).
  const scored = { id: null, shown: { raid: 0, guard: 0 }, target: { raid: 0, guard: 0 }, frame: {}, wait: {} };
  const numberBox = team => { const span = document.createElement("span"); span.id = `num-${team}`; return span; };
  function drawScores() {
    const { raid, guard } = scored.shown;
    const raidBox = $("num-raid"), guardBox = $("num-guard");
    if (raidBox) raidBox.textContent = fmt(Math.round(raid));
    if (guardBox) guardBox.textContent = fmt(Math.round(guard));
    // Even at 0 - 0 the bar is split in the middle; a side never shrinks out of sight.
    const share = raid + guard ? Math.min(85, Math.max(15, (raid / (raid + guard)) * 100)) : 50;
    $("fillRaid").style.width = `${share}%`;
    $("spark").style.left = `${share}%`;
    // The line Phe Phá's purple has to pass to win: Phe Phá with m% more than Phe Giữ is a share of
    // (100 + m) / (200 + m) of the bar, whatever the scores are.
    const m = Math.round(raidMargin() * 100);
    $("winLine").style.left = `${((100 + m) / (200 + m)) * 100}%`;
    $("winLineLabel").textContent = `😈 +${m}%`;
    // What Phe Phá needs, by the scores counted so far: the first number more than Phe Giữ's and m% on top.
    const need = $("raidNeed");
    if (need) {
      const { raid: toRaid, guard: toGuard } = scored.target;
      const ahead = toRaid * 100 > toGuard * (100 + m) && toRaid > 0;
      need.classList.toggle("ok", ahead);
      need.textContent = ahead ? `✓ đủ ${m}%` : toGuard ? `cần ${fmt(Math.floor((toGuard * (100 + m)) / 100) + 1)}` : `cần hơn ${m}%`;
    }
  }
  // Counts a side's score up to value over about 0.7 seconds, after delay ms; a newer count takes over from where
  // the number has got to.
  function countTo(team, value, delay = 0) {
    scored.target[team] = value;
    clearTimeout(scored.wait[team]);
    scored.wait[team] = setTimeout(() => {
      cancelAnimationFrame(scored.frame[team]);
      const from = scored.shown[team], to = scored.target[team], started = performance.now();
      if (from === to) return drawScores();
      const step = now => {
        const t = Math.min(1, (now - started) / 700);
        scored.shown[team] = from + (to - from) * (1 - (1 - t) ** 3);
        drawScores();
        if (t < 1) scored.frame[team] = requestAnimationFrame(step);
      };
      scored.frame[team] = requestAnimationFrame(step);
    }, delay);
  }
  // Where an element is inside the gains layer, in the panel's own 800 x 300 pixels (the panel is scaled).
  function placeIn(layer, element) {
    const scale = Number(getComputedStyle(panel).getPropertyValue("--fit")) || 1;
    const a = layer.getBoundingClientRect(), b = element.getBoundingClientRect();
    return { x: (b.left - a.left) / scale, y: (b.top - a.top) / scale, w: b.width / scale, h: b.height / scale };
  }
  // ---------- Effects during a round, on the board ----------
  const TEAM_NAME = { raid: "😈 Phe Phá", guard: "💗 Phe Giữ" };
  // Who is ahead, as the round would end now (jar-game.js): Phe Phá only with 15% more points than Phe Giữ,
  // otherwise Phe Giữ; nobody before anyone has played.
  const raidMargin = () => Number(settings?.rules?.raidMargin ?? 0.15);
  // In whole hundredths, as the server counts it (100 × 1.15 is 114.999... in floating point).
  const leaderOf = score => (score.raid * 100 > score.guard * Math.round(100 + raidMargin() * 100) ? "raid"
    : score.raid + score.guard > 0 ? "guard" : null);
  // Puts an element on the board's effects layer for ms, then takes it away.
  function boardFx(element, ms) {
    $("boardFx").append(element);
    setTimeout(() => element.remove(), ms);
    return element;
  }
  // A class taken off and put back, so its animation plays again.
  function replay(element, name) {
    element.classList.remove(name);
    void element.offsetWidth;
    element.classList.add(name);
  }
  // When the lead changes hands: a banner sweeps across the bar from the new leader's side, the spark where the
  // sides meet bursts and the bar shakes. delay: after the boost has been put on a Phe Giữ gift.
  function watchLead(score, delay) {
    const leader = leaderOf(score);
    if (!leader || leader === scored.leader) return;
    const first = !scored.leader;
    scored.leader = leader;
    setTimeout(() => {
      if (!round || scored.leader !== leader) return;
      const banner = document.createElement("div");
      banner.className = `lead-banner ${leader}`;
      banner.textContent = first ? `${TEAM_NAME[leader]} mở điểm!` : `${TEAM_NAME[leader]} vượt lên!`;
      boardFx(banner, 2000);
      replay($("spark"), "boom");
      sound("lead", leader);
      replay(document.querySelector(".bar-wrap"), "shake");
    }, delay);
  }
  // A big gift in a round: the giver's picture and name sweep across the top of the board in their side's colour,
  // and their side lights up for a moment.
  const BIG_GIFT = 1000;
  function showBigGift(gain) {
    const ribbon = document.createElement("div");
    ribbon.className = `big-gift ${gain.team}`;
    const text = document.createElement("span");
    text.innerHTML = "<b></b> tặng <em></em> cho <i></i>!";
    text.querySelector("b").textContent = short(gain.nickname || "Người xem", 18);
    text.querySelector("em").textContent = `${fmt(gain.coins)} xu`;
    text.querySelector("i").textContent = TEAM_NAME[gain.team];
    ribbon.append(avatar(gain, "♡"), text);
    boardFx(ribbon, 3000);
    sound("bigGift", gain.team);
    replay(panel, `glow-${gain.team}`);
    setTimeout(() => panel.classList.remove(`glow-${gain.team}`), 1600);
  }

  // A like or a comment: its point rises off Phe Giữ's side of the bar, a heart or a speech bubble with it, and
  // the score counts up. Many at once: only a few are shown, the rest only count.
  let cheersShown = 0;
  function showCheer(gain, score) {
    watchLead(score, 0);
    countTo("guard", score.guard);
    const layer = $("gains");
    if (cheersShown >= 4) return;
    cheersShown++;
    const pill = document.createElement("div");
    pill.className = "gain guard cheer";
    pill.style.right = `${110 + Math.random() * 90}px`;
    pill.innerHTML = `<b>+${fmt(gain.points)}</b><small>${gain.cheer === "chat" ? "💬" : "❤️"}</small>`;
    layer.append(pill);
    sound("cheer", gain.cheer);
    setTimeout(() => { pill.remove(); cheersShown--; }, 1500);
  }
  // A gift's coins rise off its side of the bar. On Phe Giữ's side with a boost, the boost on the bar flies into
  // them and they turn into the points they are worth, with a sparkle, and only then does the score count up.
  function showGain(gain, boost, score) {
    if (gain.cheer) return showCheer(gain, score);
    if (gain.coins >= BIG_GIFT) showBigGift(gain);
    watchLead(score, gain.team === "guard" && boostOf(boost) && gain.points !== gain.coins ? 750 : 0);
    const layer = $("gains");
    // Only a few at once when gifts pour in: the oldest go.
    while (layer.querySelectorAll(".gain").length >= 5) layer.querySelector(".gain").remove();
    const pill = document.createElement("div");
    const boosted = gain.team === "guard" && boostOf(boost) && gain.points !== gain.coins;
    pill.className = `gain ${gain.team}${boosted ? " boosted" : ""}`;
    // Side by side when several are up at once.
    const nudge = layer.querySelectorAll(`.gain.${gain.team}`).length * 34;
    pill.style[gain.team === "raid" ? "left" : "right"] = `${18 + nudge}px`;
    pill.innerHTML = `<b>+${fmt(gain.coins)}</b><small>xu</small>`;
    layer.append(pill);
    sound("coin", gain.team);
    if (!boosted) {
      countTo(gain.team, score[gain.team]);
      setTimeout(() => pill.remove(), 1600);
      return;
    }
    // The boost flies from the bar into the coins...
    const tag = $("scoreGuard").querySelector(".boost");
    setTimeout(() => {
      if (!pill.isConnected) return;
      if (tag) {
        tag.classList.remove("flash");
        void tag.offsetWidth;
        tag.classList.add("flash");
        const from = placeIn(layer, tag), to = placeIn(layer, pill);
        const fly = document.createElement("span");
        fly.className = "boost-fly";
        sound("boostFly");
        fly.textContent = boostText(boost);
        fly.style.left = `${from.x}px`;
        fly.style.top = `${from.y}px`;
        layer.append(fly);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          fly.style.transform = `translate(${to.x + to.w / 2 - from.x - from.w / 2}px, ${to.y - from.y}px) scale(.8)`;
          fly.style.opacity = "0";
        }));
        setTimeout(() => fly.remove(), 700);
      }
    }, 300);
    // ...and the coins become points.
    setTimeout(() => {
      if (!pill.isConnected) return;
      pill.classList.add("multiplied");
      sound("multiply", Number(boost) || 2);
      pill.innerHTML = `<b>+${fmt(gain.points)}</b><small>điểm</small>`;
      const at = placeIn(layer, pill);
      for (let i = 0; i < 8; i++) {
        const spark = document.createElement("span");
        spark.className = "gain-spark";
        spark.textContent = i % 2 ? "✨" : "💖";
        const angle = (i / 8) * Math.PI * 2;
        spark.style.left = `${at.x + at.w / 2}px`;
        spark.style.top = `${at.y + at.h / 2}px`;
        spark.style.setProperty("--dx", `${Math.cos(angle) * 46}px`);
        spark.style.setProperty("--dy", `${Math.sin(angle) * 30}px`);
        spark.addEventListener("animationend", () => spark.remove());
        layer.append(spark);
      }
    }, 700);
    countTo("guard", score.guard, 750);
    setTimeout(() => pill.remove(), 2200);
  }

  function showRound(data) {
    // A new round takes the place of the last result.
    if (resultShowing) { clearTimeout(resultTimer); stopScroll(); resultShowing = false; }
    round = data;
    if (inPreview(data)) {
      // A new round coming on over what was there: the two sides clash in, "VS", and part to show it.
      if (!previewing && !curtain && panel.classList.contains("on")) {
        sound("preview"); // its drum hit lands as the halves meet
        return transition("vs", () => showPreview(data));
      }
      return showPreview(data);
    }
    const fromPreview = previewing;
    previewing = false;
    previewId = null;
    clearTimeout(rollTimer);
    roundGifts = data.gifts;
    if (!flipTimer) { flipGifts(); flipTimer = setInterval(flipGifts, FLIP_SECONDS * 1000); }
    const id = data.id ?? "made-up";
    if (scored.id !== id) {
      // A round this page has not shown yet: its scores as they stand, no counting up.
      scored.id = id;
      scored.leader = leaderOf(data.score);
      $("boardFx").replaceChildren();
      for (const team of ["raid", "guard"]) {
        clearTimeout(scored.wait[team]);
        cancelAnimationFrame(scored.frame[team]);
        scored.shown[team] = scored.target[team] = data.score[team];
      }
      $("gains").replaceChildren();
      // Phe Phá's score, and next to it what it needs to win (drawScores).
      const need = document.createElement("span");
      need.className = "need";
      need.id = "raidNeed";
      $("scoreRaid").replaceChildren(numberBox("raid"), need);
      $("scoreGuard").replaceChildren(numberBox("guard"));
      if (boostOf(data.boost)) {
        const tag = document.createElement("span");
        // Pops in as the clock starts, straight from the reel.
        tag.className = fromPreview ? "boost pop" : "boost";
        tag.textContent = boostText(data.boost);
        $("scoreGuard").prepend(tag);
      }
      // The clock starting: a whistle, when this page saw the preview through.
      if (fromPreview) {
        sound("start");
        // "BẮT ĐẦU!" over the board as its parts come in (pk.html).
        const go = document.createElement("div");
        go.className = "go-burst";
        go.textContent = "BẮT ĐẦU!";
        panel.append(go);
        setTimeout(() => go.remove(), 1100);
      }
      drawScores();
    } else if (data.gain) {
      showGain(data.gain, data.boost, data.score);
    } else {
      for (const team of ["raid", "guard"]) countTo(team, data.score[team]);
    }
    showMvp($("mvpRaid"), data.top?.raid ?? data.mvp.raid, "raid");
    showMvp($("mvpGuard"), data.top?.guard ?? data.mvp.guard, "guard");
    $("dare").textContent = `Phe Phá thắng thì Ennie phải: ${data.dare}`;
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
    const margin = Math.round(raidMargin() * 100), cap = settings?.rules?.cheerCap ?? 5;
    $("guideRule").textContent = `Xu Phe Giữ nhân ngẫu nhiên ×1–×5, thả tim/bình luận +1 điểm Phe Giữ (tối đa ${cap}/người). Phe Phá phải hơn ${margin}% mới thắng, Ennie trả kèo! 🎯`;
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

  // ---------- The win, played once when a round has just ended ----------
  let celebrated = null;
  const fresh = result => Number.isFinite(result.endedAt) && Date.now() + offset - result.endedAt < 15000;
  function celebrate(box, result) {
    const layer = document.createElement("div");
    layer.className = "win-fx";
    box.append(layer);
    const add = (className, text, style) => {
      const item = document.createElement("span");
      item.className = className;
      if (text) item.textContent = text;
      for (const [key, value] of Object.entries(style ?? {})) {
        if (key.startsWith("--")) item.style.setProperty(key, value);
        else item.style[key] = value;
      }
      layer.append(item);
      return item;
    };
    const rand = (a, b) => a + Math.random() * (b - a);
    // The winners' sound (the stamp's thud in Phe Phá's lands with the stamp); the horn was the "HẾT GIỜ!".
    sound({ guard: "winGuard", raid: "winRaid" }[result.winner] ?? "draw");
    if (result.winner === "guard") {
      // Phe Giữ: hearts, petals and pink paper raining down.
      for (let i = 0; i < 46; i++) {
        const paper = i % 2 === 0;
        add(paper ? "fall paper" : "fall", paper ? "" : ["💗", "💖", "🌸", "🎀", "✨"][i % 5], {
          left: `${rand(2, 98)}%`, animationDuration: `${rand(2.2, 3.8)}s`, animationDelay: `${rand(0, 1.6)}s`,
          "--spin": `${rand(-540, 540)}deg`, "--sway": `${rand(-40, 40)}px`,
          background: paper ? ["#ff6fb1", "#ffc0de", "#ffd86f", "#fff", "#d63f87"][i % 5] : ""
        });
      }
    } else if (result.winner === "raid") {
      // Phe Phá: two purple lightning flashes, bolts striking, the title shaking, and "TRẢ KÈO!" stamped down.
      add("flash");
      for (let i = 0; i < 5; i++) {
        add("bolt", "⚡", { left: `${rand(4, 92)}%`, top: `${rand(4, 60)}%`, animationDelay: `${rand(0, .7)}s`, fontSize: `${rand(34, 58)}px` });
      }
      replay(box.querySelector("h1"), "shake");
      add("stamp", "TRẢ KÈO!");
    } else {
      // A draw: a few sparkles.
      for (let i = 0; i < 14; i++) add("fall", "✨", { left: `${rand(5, 95)}%`, animationDuration: `${rand(2.4, 3.4)}s`, animationDelay: `${rand(0, 1)}s` });
    }
    setTimeout(() => layer.remove(), 6000);
  }

  // Stays until the next round: the honours, then everyone who gave, then the honours again, and so on.
  function showResult(result) {
    stopScroll();
    endFinal();
    $("boardFx").replaceChildren();
    const box = $("result");
    box.className = `result ${result.winner}`;
    box.replaceChildren();
    const { raid, guard } = result.score;
    const winner = result.winner;
    // A ribbon in the winners' colour; under it, the result on a card (the dare Ennie owes, or why she is let
    // off, and the two sides' points face to face), and the winners' top three on a podium beside it.
    const words = {
      raid: { title: "😈 Phe Phá thắng!", tag: "🎯 Ennie phải trả kèo", message: result.dare },
      // Phe Phá ahead on points but not by the margin still loses: the card says why.
      guard: { title: "💗 Phe Giữ thắng!", tag: "💗 Hũ được cứu rồi", message: raid > guard
        ? `Phe Phá chưa hơn đủ ${Math.round(raidMargin() * 100)}% điểm, Ennie thoát kèo!`
        : "Ennie thoát kèo, cảm ơn cả nhà đã giữ hũ!" },
      draw: { title: "🤝 Hòa nhau rồi!", tag: "😆 Không ai thắng", message: "Ennie thoát kèo lần này!" }
    }[winner] ?? { title: "", tag: "", message: "" };
    box.innerHTML = `
      <div class="rs-ribbon"><h1></h1></div>
      <div class="rs-body">
        <div class="rs-card"><span class="pv-tag"></span><p class="rs-message"></p>
          <div class="rs-score">
            <span class="rs-side raid${winner === "raid" ? " win" : ""}"><i>😈</i><b></b></span>
            <span class="rs-vs">VS</span>
            <span class="rs-side guard${winner === "guard" ? " win" : ""}"><b></b><i>💗</i></span>
          </div>
        </div>
        <div class="rs-podium"></div>
      </div>`;
    box.querySelector("h1").textContent = words.title;
    box.querySelector(".pv-tag").textContent = words.tag;
    box.querySelector(".rs-message").textContent = words.message;
    const [raidPoints, guardPoints] = box.querySelectorAll(".rs-side b");
    raidPoints.textContent = fmt(raid);
    guardPoints.textContent = fmt(guard);
    if (boostOf(result.boost)) {
      const tag = document.createElement("small");
      tag.textContent = boostText(result.boost);
      guardPoints.after(tag);
    }
    // The podium: second on the left, first in the middle and highest, third on the right.
    const podium = box.querySelector(".rs-podium");
    if (result.top?.length) {
      for (const i of [1, 0, 2]) {
        const person = result.top[i];
        const place = document.createElement("div");
        place.className = `rs-place p${i + 1}${person ? "" : " empty"}`;
        if (person) {
          const medal = document.createElement("span");
          medal.className = "medal";
          medal.textContent = ["👑", "🥈", "🥉"][i];
          const name = document.createElement("span");
          name.className = "name";
          name.textContent = person.nickname;
          const coins = document.createElement("em");
          coins.textContent = `${fmt(person.coins)} xu`;
          place.append(medal, avatar(person, "♡"), name, coins);
        }
        const step = document.createElement("span");
        step.className = "step";
        step.textContent = i + 1;
        place.append(step);
        podium.append(place);
      }
    } else {
      podium.innerHTML = '<p class="rs-empty">Ván này chưa ai góp quà 🍯</p>';
    }
    // Once per result, and only one that has just come (not an old one a page opens on).
    if (celebrated !== result.id && fresh(result)) {
      celebrated = result.id;
      celebrate(box, result);
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

  // The last FINAL_SECONDS of a round: each second a big number pops in the middle of the board, and the board's
  // edge flashes red.
  const FINAL_SECONDS = 10;
  let finalShown = 0;
  function showFinal(left) {
    const on = left >= 1 && left <= FINAL_SECONDS;
    panel.classList.toggle("final", on);
    if (!on) { endFinal(); return; }
    if (finalShown === left) return;
    finalShown = left;
    const count = $("finalCount");
    count.textContent = left;
    count.classList.toggle("last", left <= 3);
    sound("finalTick", left);
    replay(count, "beat");
  }
  function endFinal() {
    finalShown = 0;
    panel.classList.remove("final");
    $("finalCount").classList.remove("beat");
  }

  // The clock, red for the last 30 seconds.
  function tick() {
    if (!round) return endFinal();
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
    if (Number.isFinite(round.endsAt)) showFinal(left);
  }
  setInterval(tick, 250);

  function receive(data) {
    if (!data) return;
    if (Number.isFinite(data.now)) offset = data.now - Date.now();
    if (data.running) return showRound(data);
    if (data.result) {
      if (settings && !settings.on) return;
      // Straight from a round on the board: "HẾT GIỜ!" comes down over it, with a horn, before the result.
      const playing = round && !previewing && !panel.classList.contains("done");
      if (playing && !curtain) {
        sound("horn");
        return transition("timeup", () => showResult(data.result));
      }
      return showResult(data.result);
    }
    // Stopped, or nothing under way: the guide.
    round = null;
    previewing = false;
    previewId = null;
    clearTimeout(rollTimer);
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
      score: { raid: 1240, guard: 860 }, boost: 1.5,
      mvp: { raid: { nickname: "Bé Na", coins: 620 }, guard: { nickname: "Mèo Mun", coins: 410 } },
      top: { raid: [{ nickname: "Bé Na", coins: 620 }, { nickname: "Tí", coins: 300 }, { nickname: "Lu", coins: 120 }], guard: [{ nickname: "Mèo Mun", coins: 410 }, { nickname: "Kem", coins: 200 }] },
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

// The jar game on screen (server/src/jar-game.js decides each turn and how many pieces it moves).
// Phe Phá: a second Ennie, the side view pictures (/models/dog/), runs in from the left edge of the frame, jumps
// onto the rim, picks the top gifts out of the jar into her mouth, jumps down and runs off with them. A big turn
// sends a pack of three. The Ennie sitting in the corner (dogsprite.js) stays where she is and only reacts.
// Phe Giữ: hearts rain down and the gifts she took fall back in, as many as the turn brings back.
// Turns play as soon as they come, side by side: several Ennies can be on the rim at once, each in a spot of her
// own; past RAIDERS_MAX at once, the next raid waits for a spot. This runs inside overlay.js's page and uses its
// jar: particles, removeParticle, dropLater, stolenPieces, scale and socket.
(() => {
  const BASE = "/models/dog/";
  const SIZE = 150, PACK_SIZE = 118; // how wide a whole picture is drawn, in .jar-wrap coordinates
  const FLOOR = 416;                 // where paws touch the ground, as for the dog in the corner
  const RIM = 30;                    // the top of the jar's rim
  const JAR_LEFT = 19, MOUTH_X = 155; // the glass's left side, and the middle of the jar's opening
  // Where a raider's mouth reaches into the jar: the spots on the left of the rim (the middle of the lid has the
  // little dog of the decorations), the first one first. A pack takes three next to each other.
  const SPOTS = [75, 40, 110, 10, 140, 58, 92];
  const RAIDERS_MAX = SPOTS.length;
  const GIFTS_AT = { x: 19, y: 36 };  // where the gift layer (the physics' 0, 0) sits in .jar-wrap
  const RUN = 480;                   // how fast she runs, in px per second
  const QUEUE_MAX = 30;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wrap = document.getElementById("jarWrap");
  if (!wrap || !window.gsap) return;
  const random = gsap.utils.random;
  const sleep = seconds => new Promise(done => gsap.delayedCall(seconds, done));

  // ---------- The pictures, loaded the first time Ennie is needed ----------
  let sprites = null;
  function loadSprites() {
    sprites ??= (async () => {
      const response = await fetch(`${BASE}manifest.json`);
      if (!response.ok) throw new Error(`manifest: ${response.status}`);
      const manifest = await response.json();
      const sheets = {};
      const wanted = ["Idle", "Walk", "Jump", "HeadTilt", "Surprised"].filter(name => manifest.clips[name]);
      await Promise.all(wanted.map(name => new Promise((done, fail) => {
        const image = new Image();
        image.onload = () => { sheets[name] = image; done(); };
        image.onerror = () => fail(new Error(`could not load ${name}`));
        image.src = `${BASE}${manifest.clips[name].file ?? name}.png`;
      })));
      // Her mouth, where the gifts go: the front of the head in the first standing picture. The pictures face
      // left, so that is the leftmost part of her in the upper part of the picture.
      const size = manifest.frameSize, probe = document.createElement("canvas");
      probe.width = probe.height = size;
      const pctx = probe.getContext("2d", { willReadFrequently: true });
      pctx.drawImage(sheets.Idle, 0, 0, size, size, 0, 0, size, size);
      const { data } = pctx.getImageData(0, 0, size, size);
      let mouth = { x: 0.25, y: 0.45 };
      const rows = Math.floor(size * manifest.groundY * 0.6);
      find: for (let x = 0; x < size; x++) {
        for (let y = 0; y < rows; y++) {
          if (data[(y * size + x) * 4 + 3] > 128) { mouth = { x: x / size + 0.04, y: y / size + 0.04 }; break find; }
        }
      }
      return { ...manifest, sheets, mouth };
    })();
    sprites.catch(() => { sprites = null; });
    return sprites;
  }

  // ---------- One Ennie on screen ----------
  const actors = new Set();
  function makeActor(sp, size) {
    const frame = sp.frameSize;
    const canvas = document.createElement("canvas");
    canvas.className = "jg-dog";
    canvas.width = canvas.height = frame;
    canvas.style.width = canvas.style.height = `${size}px`;
    canvas.style.transformOrigin = `${sp.groundX * 100}% ${sp.groundY * 100}%`;
    const shadow = document.createElement("div");
    shadow.className = "jg-shadow";
    const shadowWidth = sp.bodyWidth * size * 1.1;
    shadow.style.width = `${shadowWidth}px`;
    // What she carries, held at her mouth.
    const carry = document.createElement("div");
    carry.className = "jg-carry";
    wrap.append(shadow, canvas, carry);
    const ctx = canvas.getContext("2d");
    // The pictures face left: facing 1 is left, -1 is right.
    const a = { x: 0, y: FLOOR, facing: -1, clip: "Idle", clock: 0, rate: 1, shown: "", size, sp, carry };
    a.play = (name, rate = 1) => {
      if (!sp.sheets[name]) name = "Idle";
      if (a.clip !== name) { a.clip = name; a.clock = 0; }
      a.rate = rate;
    };
    a.mouth = () => ({ x: a.x + (sp.mouth.x - sp.groundX) * size * a.facing, y: a.y - (sp.groundY - sp.mouth.y) * size });
    a.place = () => {
      canvas.style.transform = `translate(${(a.x - sp.groundX * size).toFixed(1)}px, ${(a.y - sp.groundY * size).toFixed(1)}px) scaleX(${a.facing})`;
      const lift = Math.min(1, Math.max(0, (FLOOR - a.y) / 90));
      shadow.style.transform = `translate(${(a.x - shadowWidth / 2).toFixed(1)}px, ${FLOOR - 9}px) scale(${(1 - lift * 0.4).toFixed(3)})`;
      shadow.style.opacity = (1 - lift).toFixed(2);
      const m = a.mouth();
      carry.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
    };
    a.tick = seconds => {
      const clip = sp.clips[a.clip];
      a.clock += seconds * clip.fps * a.rate;
      a.clock = clip.loops ? a.clock % clip.frames : Math.min(a.clock, clip.frames - 1);
      const index = Math.floor(a.clock), key = `${a.clip}:${index}`;
      if (key === a.shown) return;
      a.shown = key;
      ctx.clearRect(0, 0, frame, frame);
      ctx.drawImage(sp.sheets[a.clip], (index % clip.columns) * frame, Math.floor(index / clip.columns) * frame, frame, frame, 0, 0, frame, frame);
    };
    a.remove = () => {
      gsap.killTweensOf(a);
      canvas.remove(); shadow.remove(); carry.remove();
      actors.delete(a);
    };
    actors.add(a);
    a.place();
    a.tick(0);
    return a;
  }
  gsap.ticker.add((_time, deltaMs) => {
    const seconds = Math.min(deltaMs / 1000, 0.1);
    for (const a of actors) a.tick(seconds);
  });

  // The visible frame (overlay.js's jarFrame) in .jar-wrap coordinates, to start and finish off screen.
  function frameInWrap() {
    const box = wrap.getBoundingClientRect(), s = (typeof scale === "number" && scale) || 1;
    const f = window.jarFrame?.() ?? { left: 0, right: innerWidth, top: 0 };
    return { left: (f.left - box.left) / s, right: (f.right - box.left) / s, top: (f.top - box.top) / s };
  }

  // Runs along the floor to x, legs going at the pace of the run.
  function run(a, toX) {
    a.facing = toX > a.x ? -1 : 1;
    a.play("Walk", RUN / ((a.sp.walkSpeed ?? 0.5) * a.size));
    return new Promise(done => gsap.to(a, { x: toX, duration: Math.abs(toX - a.x) / RUN, ease: "none", onUpdate: a.place, onComplete: done }));
  }

  // Jumps in an arc to x, y, rising `up` above the higher of the two ends.
  function leap(a, toX, toY, up, seconds) {
    const jump = a.sp.clips.Jump;
    a.play("Jump", jump ? jump.frames / jump.fps / seconds : 1);
    const peak = Math.min(a.y, toY) - up;
    return new Promise(done => gsap.timeline({ onUpdate: a.place, onComplete: done })
      .to(a, { x: toX, duration: seconds, ease: "none" }, 0)
      .to(a, { y: peak, duration: seconds * 0.55, ease: "power2.out" }, 0)
      .to(a, { y: toY, duration: seconds * 0.45, ease: "power2.in" }, seconds * 0.55));
  }

  // The `n` highest gifts in the jar fly up into her mouth and stay there. Returns how many she got.
  // The gift that sent her (skip, its eventId) stays: the giver sees their gift land and stay in the jar.
  async function grab(a, n, skip = "") {
    const top = [...particles]
      .filter(([body, el]) => body.position.y > 0 && body.position.y < JAR.h && !(skip && el._event?.eventId === skip))
      .sort(([one], [two]) => one.position.y - two.position.y)
      .slice(0, n);
    const m = a.mouth();
    top.forEach(([body, el], k) => {
      const x = body.position.x + GIFTS_AT.x, y = body.position.y + GIFTS_AT.y;
      if (el._event) stolenPieces.push({ event: el._event, i: el._i });
      const piece = el.cloneNode(true);
      piece.classList.add("jg-piece");
      removeParticle(body, el);
      wrap.append(piece);
      gsap.set(piece, { clearProps: "transform" });
      gsap.fromTo(piece, { x, y }, {
        x: m.x, y: m.y, scale: 0.7, duration: 0.3, delay: k * 0.05, ease: "power2.inOut",
        onComplete: () => {
          // Held in a little bundle at her mouth from now on.
          a.carry.append(piece);
          gsap.set(piece, { x: random(-7, 7) + (k % 3) * 4, y: -Math.floor(k / 3) * 9 + random(-3, 3), rotation: random(-25, 25) });
        }
      });
    });
    await sleep(0.3 + top.length * 0.05);
    return top.length;
  }

  // ---------- Words on screen ----------
  // One at a time: a new one replaces the one showing, so a burst of gifts does not stack them up.
  function banner(team, text) {
    for (const old of wrap.querySelectorAll(".jg-banner")) { gsap.killTweensOf(old); old.remove(); }
    const el = document.createElement("div");
    el.className = `jg-banner ${team}`;
    el.textContent = text;
    wrap.append(el);
    gsap.timeline({ onComplete: () => el.remove() })
      .fromTo(el, { xPercent: -50, yPercent: -50, scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" })
      .to(el, { scale: 0.85, opacity: 0, duration: 0.3, ease: "power1.in" }, "+=2");
  }
  function pop(text, x, y, team) {
    const el = document.createElement("div");
    el.className = `jg-count ${team}`;
    el.textContent = text;
    wrap.append(el);
    gsap.timeline({ onComplete: () => el.remove() })
      .fromTo(el, { x, y, xPercent: -50, scale: 0.5, opacity: 0 }, { y: y - 26, scale: 1.1, opacity: 1, duration: 0.35, ease: "back.out(2)" })
      .to(el, { y: y - 70, opacity: 0, duration: 0.9, ease: "power1.in" }, "+=0.5");
  }
  const short = (text, max) => {
    const letters = [...String(text)];
    return letters.length > max ? `${letters.slice(0, max - 1).join("")}…` : String(text);
  };

  // ---------- Phe Phá ----------
  // Spots on the rim taken by raiders now on screen.
  const taken = new Set();
  const takeSpot = () => { const spot = SPOTS.find(s => !taken.has(s)); if (spot != null) taken.add(spot); return spot; };
  async function raid(turn, spots) {
    const sp = await loadSprites();
    banner("raid", `😈 Phe Phá · ${short(turn.nickname, 16)}`);
    const f = frameInWrap();
    const dogs = Math.max(1, turn.dogs || 1), size = dogs > 1 ? PACK_SIZE : SIZE;
    // The pieces shared out between the dogs, the first ones taking any left over.
    const shares = Array.from({ length: dogs }, (_, k) => Math.floor(turn.count / dogs) + (k < turn.count % dogs ? 1 : 0));
    let startled = false, total = 0;
    await Promise.all(shares.map(async (share, k) => {
      await sleep(k * 0.2);
      const a = makeActor(sp, size);
      a.x = f.left - size * 0.6;
      a.place();
      await run(a, JAR_LEFT - 34 - k * 10);
      // On the rim with her mouth over the opening, on its left side: the middle of the lid has the little dog and
      // bone of the decorations (jardecor.js). A pack spreads out along the rim from there.
      const mouthAhead = (sp.groundX - sp.mouth.x) * size;
      const spot = spots[k] + random(-5, 5);
      await leap(a, spot - mouthAhead, RIM, 70, 0.45);
      if (!startled) { startled = true; window.dogReact?.(0); }
      a.play(share ? "HeadTilt" : "Surprised");
      const got = share ? await grab(a, share, turn.eventId) : 0;
      total += got;
      if (got) pop(`−${got} món`, a.mouth().x, a.mouth().y - 20, "raid");
      else if (k === 0) pop("Hũ trống trơn rồi! 😳", MOUTH_X, RIM, "raid");
      await sleep(got ? 0.15 : 0.6);
      a.facing = 1;
      await leap(a, JAR_LEFT - 70 - k * 12, FLOOR, 40, 0.42);
      // Off the rim, her spot is free for the next one.
      taken.delete(spots[k]);
      startWaiting();
      await run(a, f.left - size);
      a.remove();
    }));
    return total;
  }

  // ---------- Phe Giữ ----------
  const HEARTS = ["♥", "💗", "♥", "💖", "♡"];
  const HEART_COLOURS = ["#ff7fb8", "#ff9ccf", "#ff5fa8", "#ffc6e6"];
  // A few clouds between left and right, their tops at `top`: they slide in from the sides and puff up. Each has
  // x and w (where hearts fall from) and leave(), which drifts it away and removes it.
  function gatherClouds(left, right, top, count) {
    const span = right - left;
    return Array.from({ length: count }, (_, k) => {
      const w = random(95, 140);
      const x = left + (span - w) * (count > 1 ? k / (count - 1) : 0.5) + random(-12, 12);
      const y = top + random(0, 22);
      const el = document.createElement("div");
      el.className = "jg-cloud";
      el.style.setProperty("--w", `${w}px`);
      wrap.append(el);
      const fromSide = x + w / 2 < left + span / 2 ? -1 : 1;
      gsap.fromTo(el, { x: x + fromSide * 70, y, opacity: 0, scale: 0.6 }, { x, opacity: 1, scale: 1, duration: 0.5, delay: k * 0.06, ease: "back.out(1.6)" });
      return {
        x, w,
        leave: () => {
          gsap.killTweensOf(el);
          gsap.to(el, { x: x + fromSide * 90, opacity: 0, duration: 0.6, ease: "power1.in", onComplete: () => el.remove() });
          // Gone in any case, even if the page was too busy (or hidden) to finish the drift.
          setTimeout(() => el.remove(), 1500);
        }
      };
    });
  }

  // `returning`: the pieces to put back when the game is turned off, instead of the turn's count.
  async function guard(turn, returning = null) {
    banner("guard", returning ? "💗 Trả quà về hũ cho Ennie" : `💗 Phe Giữ · ${short(turn.nickname, 16)}`);
    const f = frameInWrap();
    const wide = turn.tier >= 3; // the biggest turn covers the whole frame, the others the jar
    const left = wide ? f.left : 10, right = wide ? f.right : 300;
    // First the clouds drift in where gifts come into the frame (the top of the visible frame, above the jar's
    // mouth; over the whole width for the biggest turn), then it rains from them: hearts, and the gifts put back,
    // which fall in from up there and so come out from under the clouds.
    const sky = f.top + 4; // the clouds' top: the top edge of the visible frame
    const clouds = gatherClouds(left, right, sky, wide ? Math.max(4, Math.round((right - left) / 150)) : 3);
    await sleep(0.55);
    const from = sky + 30;
    for (let i = 0; i < turn.hearts; i++) {
      const el = document.createElement("span");
      el.className = "jg-heart";
      el.textContent = HEARTS[i % HEARTS.length];
      el.style.color = HEART_COLOURS[i % HEART_COLOURS.length];
      el.style.fontSize = `${random(14, wide ? 34 : 26)}px`;
      wrap.append(el);
      const duration = random(1.1, 1.8);
      // Each heart falls from under one of the clouds.
      const cloud = clouds[i % clouds.length];
      gsap.timeline({ delay: random(0, wide ? 1.6 : 0.9), onComplete: () => el.remove() })
        .fromTo(el, { x: cloud.x + random(0.1, 0.9) * cloud.w, y: from + random(-6, 10), rotation: random(-30, 30), opacity: 0, scale: 0.4 },
          { y: random(wide ? 200 : 120, 400), rotation: random(-60, 60), opacity: 1, scale: 1, duration, ease: "power1.in" })
        .to(el, { opacity: 0, scale: 0.6, duration: 0.3 }, duration - 0.3);
    }
    // The clouds drift off once the rain is over.
    gsap.delayedCall((wide ? 1.6 : 0.9) + 1.5, () => clouds.forEach(cloud => cloud.leave()));
    await sleep(0.25);
    // What she took falls back in, latest first.
    const back = returning ?? stolenPieces.splice(Math.max(0, stolenPieces.length - turn.count));
    back.forEach(({ event, i }, k) => dropLater(event, i, k * (back.length > 20 ? 40 : 80)));
    pop(back.length ? `+${back.length} món` : "Hũ vẫn đầy! 💗", MOUTH_X, 130, "guard");
    window.dogReact?.(Math.min(2, turn.tier));
  }

  // ---------- Turns play at once ----------
  // A raid needs a free spot on the rim for each of its dogs; one that finds none waits, in order, and starts as soon
  // as spots free up. Rain for Phe Giữ never waits.
  const waiting = [];
  function startRaid(turn) {
    const dogs = Math.max(1, turn.dogs || 1);
    if (RAIDERS_MAX - taken.size < dogs) return false;
    const spots = Array.from({ length: dogs }, takeSpot);
    raid(turn, spots).catch(error => {
      console.error("Jar game:", error);
      for (const spot of spots) taken.delete(spot);
      startWaiting();
    });
    return true;
  }
  function startWaiting() {
    while (waiting.length && startRaid(waiting[0])) waiting.shift();
  }
  socket.on("jar-game", turn => {
    if (reduceMotion || !turn) return;
    if (turn.team === "guard") return guard(turn).catch(error => console.error("Jar game:", error));
    if (waiting.length || !startRaid(turn)) {
      waiting.push(turn);
      if (waiting.length > QUEUE_MAX) waiting.shift();
    }
  });
  // The cry for help during a round (server/src/jar-game.js, shown on pk.html): when Phe Phá takes the lead, the
  // Ennie in the corner asks to be saved, and again when 30 seconds are left and Phe Phá is still ahead.
  let behind = false, lastCall = "";
  socket.on("jar-game-round", data => {
    if (!data?.running) { behind = false; lastCall = ""; return; }
    const losing = data.score.raid > data.score.guard;
    const left = (data.endsAt - data.now) / 1000;
    const guard = [data.gifts?.guard].flat().find(Boolean);
    const help = guard ? `Cứu Ennie với! Tặng ${guard} 😭` : "Cứu Ennie với! 😭";
    if (losing && !behind) { window.dogSay?.(help); lastCall = "lead"; }
    else if (losing && left <= 30 && lastCall !== "hurry") { window.dogSay?.(help); lastCall = "hurry"; }
    behind = losing;
  });
  // A round may go quiet in its last 30 seconds: the clock is checked here too.
  let roundEnds = 0, roundBehind = false;
  socket.on("jar-game-round", data => { roundEnds = data?.running ? Date.now() + (data.endsAt - data.now) : 0; roundBehind = !!data?.running && data.score.raid > data.score.guard; });
  setInterval(() => {
    if (!roundEnds || !roundBehind || lastCall === "hurry") return;
    if (roundEnds - Date.now() <= 30_000) { lastCall = "hurry"; window.dogSay?.("Sắp hết giờ rồi, cứu Ennie với! 😭"); }
  }, 1000);

  // While the game is on, the pictures (a few MB) are loaded ahead, so the first turn starts at once.
  socket.on("jar-game-settings", settings => { if (settings?.on && !reduceMotion) loadSprites().catch(() => {}); });
  // The game was turned off: any Ennie still on screen goes, raids not started are dropped, and everything taken
  // falls back into the jar with a little rain of hearts.
  socket.on("jar-game-return", () => {
    waiting.length = 0;
    taken.clear();
    for (const a of [...actors]) a.remove();
    for (const piece of wrap.querySelectorAll(".jg-piece")) piece.remove();
    for (const cloud of wrap.querySelectorAll(".jg-cloud")) cloud.remove();
    const back = stolenPieces.splice(0);
    if (!back.length || reduceMotion) { back.forEach(({ event, i }, k) => dropLater(event, i, k * 40)); return; }
    guard({ team: "guard", tier: back.length >= 12 ? 3 : 1, count: 0, hearts: Math.min(60, 12 + back.length * 2), nickname: "" }, back);
  });
  socket.on("session-reset", () => {
    waiting.length = 0;
    taken.clear();
    for (const a of [...actors]) a.remove();
  });
})();

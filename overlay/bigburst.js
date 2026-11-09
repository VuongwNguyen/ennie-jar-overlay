// The big gift effect, about 11 seconds. When someone sends a gift of 1,000 coins or more each (overlay.js
// decides), the big gift falls in from the top like a comet, swerves off to the middle of the screen and
// opens turning rays of light. Every gift on screen hops up out of the jar and swirls in
// to it, forming a heart around it; light ripples across the heart and the sender's name appears under it.
// The heart beats three times, trembles, and bursts in a flash with rings of light and sparkles, flinging
// the gifts out; then they arc back into the jar, the new gift's with them, spilling over when it is full.
// Runs in the jar's page (overlay.html), which covers the whole screen on live.html; it uses the jar's
// physics and gift pictures from overlay.js. Big gifts that arrive while it plays wait their turn.
(() => {
  const layer = document.getElementById("burstLayer");
  if (!layer || !window.gsap) return;
  const random = gsap.utils.random;
  // Sounds for each moment (sfx.js); silent when they are not there.
  const sfx = new Proxy({}, { get: (_, name) => (...args) => { try { window.burstSfx?.[name]?.(...args); } catch { /* no sound */ } } });
  // With only a few gifts in the jar, copies of the big gift fill the heart out to this many pieces;
  // the copies fade away in the burst, so only real gifts go back into the jar.
  const FILL_TO = 40;
  // At most this many gifts fly up out of the jar, the ones on top of the pile; the rest stay where they
  // are. A full jar holds hundreds, and moving them all at once is more than a streaming machine can draw.
  const MAX_FLY = 60;
  const SPARKS = ["✦", "✧", "♥", "✿", "★"];
  const SPARK_COLOURS = ["#fff4c2", "#ffc6e6", "#ffd76a", "#ffffff", "#ff8fc7"];

  const queue = [];
  let busy = false, current = null;

  window.bigBurst = (event, landed) => {
    queue.push({ event, landed });
    if (!busy) next();
  };
  // A session reset empties the jar: whatever is on its way back is dropped too.
  window.bigBurstReset = () => {
    queue.length = 0;
    if (current) { current.timeline.kill(); current.group.remove(); current = null; sfx.stop(); }
    busy = false;
  };

  function next() {
    const item = queue.shift();
    if (!item) { busy = false; return; }
    busy = true;
    play(item, () => { current = null; next(); });
  }

  // n points spread evenly over a heart of half-width `size` around cx, cy, on a grid of triangles, so the
  // gifts sit side by side without piling on each other; none within `hole` of the middle, where the big
  // gift is. Also gives the distance between neighbours, which sets how big each gift is drawn.
  function heartPoints(n, cx, cy, size, hole) {
    const outline = [];
    for (let i = 0; i < 120; i++) {
      const t = (i / 120) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      // The curve runs from y = 12 (the top of the lobes) down to -17 (the tip); -2.5 is its middle.
      outline.push([cx + (x / 16) * size, cy - ((y + 2.5) / 16) * size]);
    }
    const inside = (px, py) => {
      let hit = false;
      for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const [xi, yi] = outline[i], [xj, yj] = outline[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    const grid = d => {
      const points = [];
      const top = cy - size, bottom = cy + size;
      for (let row = 0, y = top + d / 2; y < bottom; row++, y += d * 0.866) {
        for (let x = cx - size + (row % 2 ? d : d / 2); x < cx + size; x += d) {
          if (inside(x, y) && Math.hypot(x - cx, y - cy) > hole) points.push({ x, y });
        }
      }
      return points;
    };
    // The widest spacing that still has room for all n.
    let low = 3, high = size;
    for (let k = 0; k < 14; k++) {
      const mid = (low + high) / 2;
      if (grid(mid).length >= n) low = mid; else high = mid;
    }
    const all = grid(low);
    const points = all.length <= n ? all : Array.from({ length: n }, (_, i) => all[Math.floor((i * all.length) / n)]);
    while (points.length < n) points.push({ x: cx, y: cy });
    return { points, spacing: low };
  }

  function element(className, parent) {
    const el = document.createElement("div");
    el.className = className;
    parent.append(el);
    return el;
  }

  // Where the gifts go back in: the jar's mouth on screen.
  function mouthOnScreen() {
    const wrap = document.getElementById("jarWrap").getBoundingClientRect();
    return { x: wrap.left + MOUTH.x * scale, y: wrap.top + MOUTH.y * scale };
  }

  // A ring of light that flares out from x, y. It is drawn once at its biggest and shrunk to start, so
  // the graphics card only has to scale it, not draw its blurred glow again on every frame.
  function ring(group, x, y, d, colour, to, duration, delay = 0) {
    const el = element("burst-ring", group);
    const D = d * to;
    el.style.borderColor = colour;
    el.style.borderWidth = `${10 * to}px`;
    gsap.fromTo(el, { width: D, height: D, x: x - D / 2, y: y - D / 2, scale: 0.15 / to, opacity: 1 },
      { scale: 1, opacity: 0, duration, delay, ease: "power2.out", onComplete: () => el.remove() });
  }
  // A small sparkle, heart or star that flies from one point towards another and fades.
  function spark(group, from, to, { size = random(16, 34), duration = random(0.7, 1.1), delay = 0, ease = "power3.out" } = {}) {
    const el = element("burst-spark", group);
    el.textContent = random(SPARKS);
    el.style.color = random(SPARK_COLOURS);
    el.style.fontSize = `${size}px`;
    gsap.fromTo(el, { x: from.x, y: from.y, scale: 0.3, opacity: 1, rotation: 0 },
      { x: to.x, y: to.y, scale: random(0.8, 1.2), rotation: random(-200, 200), opacity: 0, duration, delay, ease, onComplete: () => el.remove() });
  }

  function play({ event, landed }, finished) {
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2;
    const centre = { x: cx, y: cy };
    const size = Math.min(W * 0.31, H * 0.2); // half the heart's width
    const group = element("burst-group", layer);
    // Stage and timing, slow enough to follow: about 11 seconds from the fall to the last gift back in.
    const FALL = 0.9, SWERVE = 1.4, GATHER = 2.2;

    // Behind the heart: turning rays of light, which appear when the big gift arrives.
    const rays = element("burst-rays", group);
    const raysSize = size * 3.6;
    gsap.set(rays, { width: raysSize, height: raysSize, x: cx - raysSize / 2, y: cy - raysSize / 2, scale: 0, opacity: 0 });
    // The glow that gathers behind the heart.
    const glow = element("burst-glow", group);
    const glowSize = size * 3.2;
    gsap.set(glow, { width: glowSize, height: glowSize, x: cx - glowSize / 2, y: cy - glowSize / 2, scale: 0, opacity: 0 });

    // 0. The big gift falls in from the top, above the jar, as gifts do, trailing sparkles like a comet.
    // It only falls a short way, then swerves off to the middle of the screen, growing as it goes.
    const core = makeGiftEl(event, 0);
    group.append(core);
    core.style.willChange = "transform";
    const coreScale = (size * 0.55) / core._size;
    const mouth = mouthOnScreen();
    const top = jarFrame().top;
    const stopY = top + Math.max(80, Math.min(240, (cy - top) * 0.3));
    gsap.set(core, { x: mouth.x, y: top - 80, scale: scale * 1.6, opacity: 1, zIndex: 3 });
    const intro = gsap.timeline({ onComplete: gather });
    current = { timeline: intro, group };
    intro
      .to(core, { y: stopY, rotation: random(-40, 40), duration: FALL, ease: "power2.in" })
      .to(core, { keyframes: [{ x: mouth.x + (cx - mouth.x) * 0.15, y: stopY + size * 0.18, duration: SWERVE * 0.3, ease: "sine.out" }, { x: cx, y: cy, duration: SWERVE * 0.7, ease: "power2.inOut" }] })
      .to(core, { scale: coreScale, rotation: 360, duration: SWERVE, ease: "power2.inOut" }, "<");
    // Sounds come from where things are on screen, left or right.
    const panOf = x => (x / W) * 2 - 1;
    const jarPan = panOf(mouth.x);
    intro.add(() => sfx.fall(FALL, jarPan), 0);
    intro.add(() => sfx.whoosh(SWERVE, jarPan), FALL);
    intro.add(() => sfx.chime(), FALL + SWERVE - 0.2);
    // The comet's tail: sparkles left behind along the way.
    for (let t = 0.1; t < FALL + SWERVE; t += 0.12) {
      intro.add(() => {
        const at = { x: gsap.getProperty(core, "x"), y: gsap.getProperty(core, "y") };
        spark(group, at, { x: at.x + random(-40, 40), y: at.y + random(-60, 10) }, { size: random(10, 22), duration: random(0.5, 0.8), ease: "power1.out" });
      }, t);
    }
    // Arriving: a soft ring, and the rays open behind it.
    intro.add(() => ring(group, cx, cy, size * 0.6, "#ffe08a", 2.2, 0.8), FALL + SWERVE - 0.1);
    intro.to(rays, { scale: 1, opacity: 0.55, duration: 0.8, ease: "power2.out" }, FALL + SWERVE - 0.2);

    function gather() {
      const timeline = gsap.timeline();
      current = { timeline, group };
      // The rays keep turning, slowly, while the heart forms.
      timeline.to(rays, { rotation: "-=120", duration: 8, ease: "none" }, 0);

      // The gifts in the jar leave its physics and take off from where they are.
      const pieces = [];
      const leaving = [...particles]
        .sort(([a], [b]) => a.position.y - b.position.y)
        .slice(0, MAX_FLY)
        .map(([body, el]) => [body, el, el.getBoundingClientRect()]);
      for (const [body, el, r] of leaving) {
        Matter.Composite.remove(engine.world, body);
        particles.delete(body);
        el.style.transform = "";
        group.append(el);
        gsap.set(el, { x: r.left + r.width / 2, y: r.top + r.height / 2, scale, rotation: (body.angle * 180) / Math.PI });
        pieces.push({ el, back: true });
      }
      // The rest of the new gift's pieces appear in the middle, where the heart forms (the first is the big
      // gift itself, in the middle of it).
      for (let i = 1; i < particleCount(event); i++) {
        const el = makeGiftEl(event, i);
        group.append(el);
        gsap.set(el, { x: cx + random(-30, 30), y: cy + random(-30, 30), scale: 0, opacity: 0 });
        pieces.push({ el, back: true, fresh: true });
      }
      // Copies of the big gift sweep in from the edges when the heart would look thin.
      for (let i = pieces.length; i < FILL_TO; i++) {
        const el = makeGiftEl(event, i);
        group.append(el);
        const side = Math.random() * 4 | 0;
        gsap.set(el, {
          x: side === 1 ? W + 40 : side === 3 ? -40 : random(0, W),
          y: side === 0 ? -40 : side === 2 ? H + 40 : random(0, H),
          scale, opacity: 0
        });
        pieces.push({ el, back: false });
      }
      for (const { el } of pieces) el.style.willChange = "transform";
      gsap.utils.shuffle(pieces);
      const { points, spacing } = heartPoints(pieces.length, cx, cy, size, size * 0.34);
      // Each piece is drawn as big as the space it has, so neighbours just touch.
      const onHeart = el => Math.min(64, Math.max(12, spacing * 1.05)) / el._size;

      // 1. Gathering: the gifts hop up out of the jar, then swing around the middle on their way in, so they
      // swirl; a stream of sparkles is drawn from the jar's mouth to the big gift.
      timeline.to(glow, { scale: 1, opacity: 0.9, duration: GATHER + 0.4, ease: "power2.in" }, 0);
      timeline.add(() => sfx.swirl(GATHER, jarPan), 0);
      for (let t = 0; t < GATHER; t += 0.15) {
        timeline.add(() => spark(group, { x: mouth.x + random(-30, 30) * scale, y: mouth.y }, centre, { size: random(10, 20), duration: random(0.6, 0.9), ease: "power2.in" }), t);
      }
      pieces.forEach(({ el, fresh }, i) => {
        const from = { x: gsap.getProperty(el, "x"), y: gsap.getProperty(el, "y") };
        const target = points[i];
        const turn = random(1.2, 2.1) * (Math.random() < 0.5 ? -1 : 1);
        const dx = from.x - cx, dy = from.y - cy;
        const mid = { x: cx + (dx * Math.cos(turn) - dy * Math.sin(turn)) * 0.55, y: cy + (dx * Math.sin(turn) + dy * Math.cos(turn)) * 0.55 };
        const start = random(0, 0.7);
        // Each gift is heard where it is: a bloop as it leaves the jar, a swish as it flies round (one in
        // three), and a tink as it settles on the heart, higher towards the top of the heart.
        const height = Math.max(0, Math.min(1, (cy + size - target.y) / (2 * size)));
        if (fresh) {
          timeline.to(el, { scale: onHeart(el), opacity: 1, x: target.x, y: target.y, rotation: random(-30, 30), duration: GATHER * 0.6, ease: "back.out(1.6)" }, start + 0.6);
          timeline.add(() => sfx.settle(panOf(target.x), height), start + 0.6 + GATHER * 0.3);
          return;
        }
        const swirl = GATHER - 0.7 - 0.25;
        timeline.add(() => sfx.pop(panOf(from.x), el._size), start);
        if (i % 3 === 0) timeline.add(() => sfx.flit(panOf(mid.x)), start + 0.25 + swirl * 0.35);
        timeline.add(() => sfx.settle(panOf(target.x), height), start + 0.25 + swirl * 0.85);
        timeline
          .to(el, { y: from.y - random(20, 50) * scale, scale: scale * 1.15, opacity: 1, duration: 0.25, ease: "power2.out" }, start)
          .to(el, { x: mid.x, y: mid.y, rotation: `+=${random(180, 360) * Math.sign(turn)}`, duration: swirl * 0.5, ease: "power1.in" }, start + 0.25)
          .to(el, { x: target.x, y: target.y, scale: onHeart(el), rotation: random(-20, 20), duration: swirl * 0.5, ease: "power2.out" }, start + 0.25 + swirl * 0.5);
      });
      timeline.to(core, { rotation: "+=360", duration: GATHER, ease: "sine.inOut" }, 0);
      timeline.add(() => sfx.formed(), GATHER);

      // 2. The heart shimmers: two waves of light run out from the middle across the gifts. The sender's
      // name and the gift appear under it.
      const SHINE = GATHER + 0.1;
      pieces.forEach(({ el }, i) => {
        const away = Math.hypot(points[i].x - cx, points[i].y - cy) / size;
        const s = onHeart(el);
        for (let wave = 0; wave < 2; wave++) {
          timeline.to(el, { scale: s * 1.35, duration: 0.16, yoyo: true, repeat: 1, ease: "sine.inOut" }, SHINE + wave * 0.65 + away * 0.35);
        }
      });
      timeline.add(() => sfx.sparkle(), SHINE);
      timeline.add(() => sfx.sparkle(), SHINE + 0.65);
      const banner = element("burst-banner", group);
      const who = document.createElement("b");
      who.textContent = event.user?.nickname || "Người xem";
      const what = document.createElement("span");
      const count = Math.max(1, event.gift?.repeatCount || 1);
      what.textContent = `tặng ${event.gift?.name || "quà"}${count > 1 ? ` ×${count}` : ""}`;
      banner.append(who, what);
      const bannerY = cy + size * 1.08;
      gsap.set(banner, { x: cx, y: bannerY, xPercent: -50, yPercent: -50, scale: 0, opacity: 0 });
      timeline.to(banner, { scale: Math.max(0.6, size / 330), opacity: 1, duration: 0.6, ease: "back.out(2)" }, SHINE);
      timeline.add(() => sfx.fanfare(), SHINE + 0.05);

      // 3. Three heartbeats, each harder than the last, the glow and rays pulsing with them.
      const BEAT = SHINE + 1.5;
      gsap.set(group, { transformOrigin: `${cx}px ${cy}px` });
      [1.08, 1.13, 1.2].forEach((swell, i) => {
        const at = BEAT + i * 0.62;
        timeline
          .to(group, { scale: swell, duration: 0.14, ease: "power2.out" }, at)
          .to(group, { scale: 1, duration: 0.3, ease: "power1.in" }, at + 0.14)
          .to(glow, { opacity: 1, scale: 1.05 + i * 0.06, duration: 0.14, ease: "power2.out" }, at)
          .to(glow, { opacity: 0.85, scale: 1, duration: 0.3, ease: "power1.in" }, at + 0.14);
        timeline.add(() => { ring(group, cx, cy, size * 0.9, "#ffc6e6", 1.6 + i * 0.25, 0.6); sfx.beat(i); }, at);
      });

      // 4. Gathering strength: the heart trembles, the rays spin up and the big gift swells.
      const CHARGE = BEAT + 3 * 0.62;
      timeline.to(group, { keyframes: Array.from({ length: 8 }, (_, i) => ({ x: random(-5, 5) * (1 + i * 0.3), y: random(-5, 5) * (1 + i * 0.3), duration: 0.06 })) }, CHARGE);
      timeline.to(rays, { opacity: 0.95, scale: 1.15, rotation: "+=180", duration: 0.5, ease: "power2.in" }, CHARGE);
      timeline.add(() => sfx.charge(0.5), CHARGE);
      timeline.to(core, { scale: coreScale * 1.3, duration: 0.5, ease: "power2.in" }, CHARGE);
      timeline.to(banner, { opacity: 0, scale: 0.6, duration: 0.3, ease: "power1.in" }, CHARGE + 0.2);

      // 5. The burst: a white flash, three rings of light, a spray of sparkles, and every gift flung out,
      // turning, slowing as it goes; the copies of the big gift fade away.
      const BURST = CHARGE + 0.5;
      timeline.set(group, { scale: 1, x: 0, y: 0 }, BURST);
      timeline.add(() => {
        sfx.boom();
        const flash = element("burst-flash", group);
        flash.style.setProperty("--cx", `${cx}px`);
        flash.style.setProperty("--cy", `${cy}px`);
        gsap.fromTo(flash, { opacity: 0 }, { opacity: 1, duration: 0.08, yoyo: true, repeat: 1, repeatDelay: 0.1, onComplete: () => flash.remove() });
        ring(group, cx, cy, size * 0.8, "#ffe08a", 5, 1.0);
        ring(group, cx, cy, size * 0.8, "#ff8fc7", 4, 1.1, 0.08);
        ring(group, cx, cy, size * 0.8, "#ffffff", 3, 0.9, 0.16);
        for (let i = 0; i < 20; i++) {
          const angle = (i / 20) * Math.PI * 2 + random(-0.1, 0.1), dist = random(0.3, 0.6) * H;
          spark(group, centre, { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist }, { size: random(20, 48), duration: random(0.9, 1.4) });
        }
      }, BURST);
      timeline.to(glow, { scale: 1.8, opacity: 0, duration: 0.7, ease: "power2.out" }, BURST);
      timeline.to(rays, { scale: 2, opacity: 0, duration: 0.8, ease: "power2.out" }, BURST);
      // The big gift shrinks back to a gift's size and goes back into the jar with the others.
      timeline.to(core, { scale: scale * 1.4, rotation: "+=180", duration: 0.6, ease: "back.in(1.4)" }, BURST);
      pieces.forEach(({ el, back }, i) => {
        // Outward from where the piece sits on the heart.
        let dx = points[i].x - cx + random(-20, 20), dy = points[i].y - cy + random(-20, 20);
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const dist = random(0.22, 0.5) * H;
        timeline.to(el, { x: `+=${dx * dist}`, y: `+=${dy * dist}`, rotation: `+=${random(-500, 500)}`, duration: random(0.8, 1.1), ease: "power3.out" }, BURST);
        // Then they hang there a moment, drifting down, before they are called back.
        if (back) timeline.to(el, { y: `+=${random(20, 60)}`, duration: 0.6, ease: "sine.inOut" }, BURST + 1.0);
        else timeline.to(el, { opacity: 0, scale: 0, duration: 0.5, ease: "power1.in" }, BURST + random(0.5, 0.9));
      });

      // 6. Back into the jar, a stream of them over a second and a half, each arcing up and over into the
      // mouth, piling up (and over the sides) as gifts do.
      const RETURN = BURST + 1.3;
      timeline.add(() => sfx.hang(RETURN - BURST - 0.9), BURST + 0.9);
      timeline.add(() => sfx.rush(1.0, jarPan), RETURN);
      const going = [{ el: core }, ...pieces.filter(p => p.back)];
      let into, gift;
      const stagger = Math.min(0.04, 1.5 / Math.max(1, going.length));
      let first = true, arrived = 0;
      const settle = () => {
        if (++arrived < going.length) return;
        sfx.done(jarPan);
        group.remove();
        finished();
      };
      going.forEach(({ el }, i) => {
        timeline.add(() => {
          if (!into) { into = mouthOnScreen(); gift = document.getElementById("giftLayer").getBoundingClientRect(); }
          const duration = random(0.8, 1.1);
          const land = () => {
            if (current?.group !== group) return; // reset while it was on its way
            if (first) { first = false; landed?.(); }
            const x = (gsap.getProperty(el, "x") - gift.left) / scale, y = (gsap.getProperty(el, "y") - gift.top) / scale;
            gsap.set(el, { clearProps: "transform,opacity,zIndex,willChange" });
            addGiftBody(el, x, y, { x: random(-1.2, 1.2), y: 3 }, random(-0.6, 0.6));
            // A little sparkle and a plink where it drops in (not for every one, or it would be a roar).
            if (i % 3 === 0 && i < 90) sfx.plink(jarPan);
            if (i % 4 === 0) spark(group, into, { x: into.x + random(-40, 40), y: into.y - random(20, 60) }, { size: random(12, 22), duration: 0.6 });
            settle();
          };
          gsap.to(el, { x: into.x + random(-25, 25) * scale, scale, rotation: `+=${random(-240, 240)}`, duration, ease: "power1.inOut" });
          gsap.to(el, { y: into.y - 10 * scale, duration, ease: "back.in(1.8)", onComplete: land });
        }, RETURN + i * stagger);
      });
    }
  }
})();

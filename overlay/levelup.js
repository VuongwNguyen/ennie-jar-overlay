// Someone going up a level in the live, about 4.5 seconds in the middle of its own page (levelup.html).
// The two kinds look and move differently, so they are told apart at a glance:
// - team heart level (fan club): a pink heart pops up softly, fills up from the bottom like a glass of
//   strawberry milk while showing the old level, beats as the number turns to the new one, hearts burst out
//   and float up, and it beats twice more under the "CHÚC MỪNG LÊN CẤP" ribbon;
// - gifter level: a gold gem drops in from above and lands with a thud, flips over to show the new level,
//   gold rays spin up behind it and coins rain down past the notched "CHÚC MỪNG LÊN CẤP" banner.
// Level ups that arrive while one plays wait their turn. Everything is sized to the page, so the box on the
// layout page sets how big it is.
(() => {
  const layer = document.getElementById("levelupLayer");
  if (!layer || !window.gsap) return;
  const params = new URLSearchParams(location.search);
  const random = gsap.utils.random;
  // Sounds from sfx.js; silent when they are not there.
  const sfx = new Proxy({}, { get: (_, name) => (...args) => { try { window.burstSfx?.[name]?.(...args); } catch { /* no sound */ } } });
  // The drawing is made for a 560 x 560 box; it is scaled to fit the page.
  const DESIGN = 560;
  // More than this many waiting are dropped, oldest first, so a flood of level ups does not run for minutes.
  const MAX_WAITING = 6;
  const SAMPLES = {
    fan: { kind: "fan", level: 15, user: { nickname: "Bé Na" } },
    gifter: { kind: "gifter", level: 31, user: { nickname: "Bé Na" } }
  };
  const queue = [];
  let busy = false, drawn = 0;

  window.levelUp = event => {
    if (!event?.user || !PLAYS[event.kind] || !(event.level > 0)) return;
    queue.push(event);
    if (queue.length > MAX_WAITING) queue.shift();
    if (!busy) next();
  };

  function next() {
    const event = queue.shift();
    if (!event) { busy = false; return; }
    busy = true;
    PLAYS[event.kind](event, next);
  }

  const element = (className, parent, text, tag = "div") => {
    const el = document.createElement(tag);
    el.className = className;
    if (text != null) el.textContent = text;
    parent.append(el);
    return el;
  };
  const svg = markup => {
    const holder = document.createElement("div");
    holder.innerHTML = markup;
    return holder.firstElementChild;
  };

  // The parts both kinds share: the drawing scaled to the page, a glow behind, the badge with its number,
  // the ribbon and the name, centred across.
  function scene(event, kind, ribbonText) {
    const group = element(`lv lv-${kind}`, layer);
    gsap.set(group, { scale: Math.max(0.2, Math.min(innerWidth, innerHeight) / DESIGN) });
    const glow = element("lv-glow", group);
    const badge = element("lv-badge", group);
    const ribbon = element("lv-ribbon", group, ribbonText);
    const name = element("lv-name", group, event.user.nickname || "Người xem");
    gsap.set([ribbon, name], { xPercent: -50 });
    return { group, glow, badge, ribbon, name };
  }

  const PLAYS = {
    // ---------- Team heart level: a heart that fills up and beats ----------
    fan(event, done, { hold = false } = {}) {
      const { group, glow, badge, ribbon, name } = scene(event, "fan", "♥ CHÚC MỪNG LÊN CẤP ♥");
      const id = `lvfill${++drawn}`;
      const HEART = "M50 88 C20 66 2 50 2 28 C2 12 14 2 28 2 C38 2 46 8 50 16 C54 8 62 2 72 2 C86 2 98 12 98 28 C98 50 80 66 50 88 Z";
      badge.append(svg(`<svg viewBox="0 0 100 90" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="${id}"><rect class="fill" x="0" y="90" width="100" height="90"/></clipPath>
          <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9fcd"/><stop offset="1" stop-color="#e2448f"/></linearGradient>
        </defs>
        <path d="${HEART}" fill="#ffe3f1cc"/>
        <path d="${HEART}" fill="url(#${id}g)" clip-path="url(#${id})"/>
        <path d="M18 24 C20 14 28 10 34 11" fill="none" stroke="#fffc" stroke-width="4" stroke-linecap="round"/>
        <path d="${HEART}" fill="none" stroke="#fff" stroke-width="4.5" stroke-linejoin="round"/>
      </svg>`));
      const fill = badge.querySelector(".fill");
      const number = element("lv-number", badge, String(Math.max(1, event.level - 1)));
      gsap.set(badge, { transformOrigin: "50% 60%" });

      if (hold) {
        number.textContent = String(event.level);
        gsap.set(fill, { attr: { y: 0 } });
        return;
      }
      const timeline = gsap.timeline({ onComplete: () => { group.remove(); done(); } });
      // 1. The heart pops up softly, a third full, with the old level.
      timeline.fromTo(glow, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "power2.out" }, 0);
      timeline.fromTo(badge, { scale: 0, rotation: -12 }, { scale: 1, rotation: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" }, 0);
      timeline.fromTo(fill, { attr: { y: 90 } }, { attr: { y: 60 }, duration: 0.5, ease: "power1.out" }, 0.1);
      timeline.add(() => sfx.chime(), 0.05);
      // 2. It fills to the top, swaying a little like liquid poured in.
      timeline.to(fill, { attr: { y: 0 }, duration: 0.8, ease: "power1.inOut" }, 0.65);
      timeline.to(badge, { keyframes: [{ rotation: -4, duration: 0.2 }, { rotation: 4, duration: 0.3 }, { rotation: 0, duration: 0.3 }] }, 0.65);
      // 3. Full: it beats, the number turns to the new level and hearts burst out.
      const FULL = 1.5;
      timeline.add(() => {
        number.textContent = String(event.level);
        burstHearts(group);
        sfx.beat(1);
        sfx.sparkle();
      }, FULL);
      timeline.to(badge, { scale: 1.28, duration: 0.14, ease: "power2.out" }, FULL);
      timeline.to(badge, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.4)" }, FULL + 0.14);
      timeline.to(glow, { scale: 1.2, duration: 0.14, yoyo: true, repeat: 1 }, FULL);
      // 4. The ribbon and the name, hearts drifting up, and two more beats.
      timeline.fromTo(ribbon, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" }, FULL + 0.15);
      timeline.fromTo(name, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, FULL + 0.3);
      timeline.add(() => floatHearts(group), FULL + 0.3);
      for (const at of [FULL + 1.0, FULL + 1.6]) {
        timeline.to(badge, { scale: 1.12, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" }, at);
        timeline.add(() => sfx.beat(0), at);
      }
      // 5. It all floats up and fades, like a balloon let go.
      timeline.to(group, { y: "-=80", opacity: 0, duration: 0.7, ease: "power1.in" }, FULL + 2.5);
    },

    // ---------- Gifter level: a gold gem that drops in and flips, with a shower of coins ----------
    gifter(event, done, { hold = false } = {}) {
      const { group, glow, badge, ribbon, name } = scene(event, "gifter", "CHÚC MỪNG LÊN CẤP");
      const id = `lvgem${++drawn}`;
      badge.append(svg(`<svg viewBox="0 0 100 110" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset=".45" stop-color="#ffc93c"/><stop offset="1" stop-color="#c96f00"/></linearGradient>
          <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0a21a"/><stop offset="1" stop-color="#9c5200"/></linearGradient>
        </defs>
        <polygon points="50,2 97,28 97,82 50,108 3,82 3,28" fill="url(#${id}a)" stroke="#7a3d00" stroke-width="2.5"/>
        <polygon points="50,14 86,34 86,76 50,96 14,76 14,34" fill="url(#${id}b)"/>
        <polygon points="50,14 86,34 50,30 14,34" fill="#fff5" />
        <path d="M50 26 L56 42 L73 42 L59 52 L64 68 L50 58 L36 68 L41 52 L27 42 L44 42 Z" fill="#ffffff22"/>
      </svg>`));
      const number = element("lv-number", badge, String(Math.max(1, event.level - 1)));
      gsap.set(badge, { transformPerspective: 700 });

      if (hold) {
        number.textContent = String(event.level);
        gsap.set(glow, { opacity: 1 });
        return;
      }
      gsap.set([glow, ribbon, name], { opacity: 0 });
      const timeline = gsap.timeline({ onComplete: () => { group.remove(); done(); } });
      // 1. The gem drops in from above and lands with a thud and a puff of sparkles.
      timeline.fromTo(badge, { y: -520, rotation: 8 }, { y: 0, rotation: 0, duration: 0.55, ease: "power3.in" }, 0);
      const LAND = 0.55;
      timeline.add(() => { sfx.pop(0, 60); landingStars(group); }, LAND);
      timeline.to(badge, { keyframes: [{ scaleY: 0.82, scaleX: 1.15, duration: 0.08 }, { scaleY: 1.06, scaleX: 0.96, duration: 0.12 }, { scaleY: 1, scaleX: 1, duration: 0.15 }] }, LAND);
      timeline.to(group, { keyframes: [{ y: 6, duration: 0.05 }, { y: -4, duration: 0.05 }, { y: 0, duration: 0.06 }] }, LAND);
      // 2. It flips over to the new level, and gold rays spin up behind it.
      const FLIP = LAND + 0.55;
      timeline.to(badge, { rotationY: 90, duration: 0.16, ease: "power2.in" }, FLIP);
      timeline.add(() => { number.textContent = String(event.level); sfx.fanfare(); }, FLIP + 0.16);
      timeline.fromTo(badge, { rotationY: -90 }, { rotationY: 0, duration: 0.4, ease: "back.out(2.5)", immediateRender: false }, FLIP + 0.16);
      timeline.fromTo(glow, { scale: 0.3, opacity: 0, rotation: 0 }, { scale: 1, opacity: 1, rotation: 60, duration: 0.5, ease: "power2.out" }, FLIP + 0.16);
      timeline.to(glow, { rotation: "+=140", duration: 2.6, ease: "none" }, FLIP + 0.66);
      // 3. The notched banner unrolls, the name slides in, and coins rain down.
      timeline.fromTo(ribbon, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.35, ease: "power3.out" }, FLIP + 0.3);
      timeline.fromTo(name, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" }, FLIP + 0.45);
      timeline.add(() => coinShower(group), FLIP + 0.2);
      // A glint across the gem.
      timeline.to(badge, { filter: "brightness(1.5)", duration: 0.15, yoyo: true, repeat: 1 }, FLIP + 1.4);
      // 4. It all sinks a little and fades, heavy to the end.
      timeline.to(group, { y: "+=30", opacity: 0, duration: 0.5, ease: "power1.in" }, FLIP + 2.9);
    }
  };

  // Hearts flung out all round when the heart is full.
  function burstHearts(group) {
    for (let i = 0; i < 16; i++) {
      const heart = element("lv-bit", group, i % 3 ? "♥" : "♡");
      const angle = (i / 16) * Math.PI * 2 + random(-0.2, 0.2);
      const distance = random(130, 230);
      gsap.fromTo(heart, { x: 0, y: 0, scale: random(0.5, 1.1), opacity: 1 }, {
        x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.8, rotation: random(-40, 40),
        opacity: 0, duration: random(0.9, 1.3), ease: "power3.out", onComplete: () => heart.remove()
      });
    }
  }
  // Little hearts rising from behind the badge, swaying as they go, like bubbles.
  function floatHearts(group) {
    for (let i = 0; i < 12; i++) {
      const heart = element("lv-bit", group, "♥");
      const sway = random(30, 70) * (i % 2 ? 1 : -1);
      gsap.set(heart, { x: random(-110, 110), y: random(20, 80), scale: random(0.4, 0.9), opacity: 0 });
      gsap.timeline({ delay: i * 0.12, onComplete: () => heart.remove() })
        .to(heart, { opacity: 0.95, duration: 0.25 }, 0)
        .to(heart, { y: `-=${random(220, 320)}`, duration: 2, ease: "sine.out" }, 0)
        .to(heart, { x: `+=${sway}`, duration: 1, yoyo: true, repeat: 1, ease: "sine.inOut" }, 0)
        .to(heart, { opacity: 0, duration: 0.6 }, 1.4);
    }
  }
  // Gold stars kicked up where the gem lands.
  function landingStars(group) {
    for (let i = 0; i < 10; i++) {
      const star = element("lv-bit lv-star", group, "✦");
      const side = i % 2 ? 1 : -1;
      gsap.fromTo(star, { x: side * random(30, 90), y: 100, scale: random(0.5, 1), opacity: 1 }, {
        x: `+=${side * random(60, 140)}`, y: random(0, 80), opacity: 0, duration: random(0.5, 0.8), ease: "power2.out",
        onComplete: () => star.remove()
      });
    }
  }
  // Coins falling past the gem from the top of the box, each spinning as it falls.
  function coinShower(group) {
    for (let i = 0; i < 26; i++) {
      const coin = element("lv-bit lv-coin", group, "$");
      const delay = i * 0.07 + random(0, 0.08);
      gsap.set(coin, { x: random(-250, 250), y: -260, rotation: random(-30, 30), opacity: 0 });
      gsap.timeline({ delay, onComplete: () => coin.remove() })
        .to(coin, { opacity: 1, duration: 0.1 }, 0)
        .to(coin, { y: random(300, 360), duration: random(1.1, 1.5), ease: "power1.in" }, 0)
        .to(coin, { scaleX: 0.15, duration: 0.18, yoyo: true, repeat: 7, ease: "sine.inOut" }, 0)
        .to(coin, { opacity: 0, duration: 0.3 }, 0.95);
      if (i % 5 === 0) setTimeout(() => sfx.plink(random(-0.5, 0.5)), (delay + 0.5) * 1000);
    }
  }

  // The layout page's preview: a sample standing still, fully shown, so the part can be placed.
  if (params.has("hold")) {
    const kind = params.get("hold") === "gifter" ? "gifter" : "fan";
    PLAYS[kind](SAMPLES[kind], () => {}, { hold: true });
    return;
  }
  if (typeof io !== "undefined") {
    const socket = io();
    socket.on("levelup", event => {
      // A hidden page does not animate, so a queue there would only pile up.
      if (!document.hidden) window.levelUp(event);
    });
    socket.on("session-reset", () => { queue.length = 0; });
  }
  if (params.has("test")) {
    const only = params.get("test");
    setTimeout(() => {
      for (const kind of ["fan", "gifter"]) if (!only || only === kind) window.levelUp(SAMPLES[kind]);
    }, 800);
  }
})();

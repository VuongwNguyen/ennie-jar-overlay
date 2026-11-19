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
  // Dressed for the sea when the fish tank is chosen on the control page (set at the start, below): the
  // heart fills with sea water and gives off bubbles, and the gifter level is a treasure chest.
  let SEA = false;
  if (!layer || !window.gsap) return;
  const params = new URLSearchParams(location.search);
  const random = gsap.utils.random;
  // No sounds: the streamer asked for the level up to be silent.
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
  // Their TikTok picture in the round frame, or the first letter of their name when there is none or it fails
  // to load (TikTok's picture links expire).
  const avatar = (frame, url, nickname) => {
    const initial = () => { frame.replaceChildren(); frame.textContent = [...nickname][0]?.toUpperCase() ?? "♡"; };
    if (!/^https?:\/\//i.test(url ?? "")) return initial();
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.alt = "";
    img.onerror = initial;
    img.src = url;
    frame.append(img);
  };
  const svg = markup => {
    const holder = document.createElement("div");
    holder.innerHTML = markup;
    return holder.firstElementChild;
  };

  // The parts both kinds share: the drawing scaled to the page, a glow behind, the badge with its number,
  // the ribbon, and the person's picture with their name beside it, centred across.
  function scene(event, kind, ribbonText) {
    const group = element(`lv lv-${kind}`, layer);
    gsap.set(group, { scale: Math.max(0.2, Math.min(innerWidth, innerHeight) / DESIGN) });
    const glow = element("lv-glow", group);
    const badge = element("lv-badge", group);
    const ribbon = element("lv-ribbon", group, ribbonText);
    const nickname = event.user.nickname || "Người xem";
    const name = element("lv-name", group);
    avatar(element("lv-avatar", name), event.user.avatar, nickname);
    element("lv-name-text", name, nickname, "span");
    gsap.set([ribbon, name], { xPercent: -50 });
    return { group, glow, badge, ribbon, name };
  }

  const PLAYS = {
    // ---------- Team heart level: a heart that fills up and beats ----------
    fan(event, done, { hold = false } = {}) {
      if (SEA) return seaFan(event, done, { hold });
      const { group, glow, badge, ribbon, name } = scene(event, "fan", "♥ CHÚC MỪNG LÊN CẤP ♥");
      const id = `lvfill${++drawn}`;
      const HEART = "M50 88 C20 66 2 50 2 28 C2 12 14 2 28 2 C38 2 46 8 50 16 C54 8 62 2 72 2 C86 2 98 12 98 28 C98 50 80 66 50 88 Z";
      badge.append(svg(`<svg viewBox="0 0 100 90" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="${id}"><rect class="fill" x="0" y="90" width="100" height="90"/></clipPath>
          <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SEA ? "#9fe3ff" : "#ff9fcd"}"/><stop offset="1" stop-color="${SEA ? "#1f8fc4" : "#e2448f"}"/></linearGradient>
        </defs>
        <path d="${HEART}" fill="${SEA ? "#e9fbffcc" : "#ffe3f1cc"}"/>
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
      // 2. It fills to the top, swaying a little like liquid poured in.
      timeline.to(fill, { attr: { y: 0 }, duration: 0.8, ease: "power1.inOut" }, 0.65);
      timeline.to(badge, { keyframes: [{ rotation: -4, duration: 0.2 }, { rotation: 4, duration: 0.3 }, { rotation: 0, duration: 0.3 }] }, 0.65);
      // 3. Full: it beats, the number turns to the new level and hearts burst out.
      const FULL = 1.5;
      timeline.add(() => {
        number.textContent = String(event.level);
        burstHearts(group);
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
      }
      // 5. It all floats up and fades, like a balloon let go.
      timeline.to(group, { y: "-=80", opacity: 0, duration: 0.7, ease: "power1.in" }, FULL + 2.5);
    },

    // ---------- Gifter level: a gold gem that drops in and flips, with a shower of coins ----------
    gifter(event, done, { hold = false } = {}) {
      if (SEA) return seaGifter(event, done, { hold });
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
      timeline.add(() => landingStars(group), LAND);
      timeline.to(badge, { keyframes: [{ scaleY: 0.82, scaleX: 1.15, duration: 0.08 }, { scaleY: 1.06, scaleX: 0.96, duration: 0.12 }, { scaleY: 1, scaleX: 1, duration: 0.15 }] }, LAND);
      timeline.to(group, { keyframes: [{ y: 6, duration: 0.05 }, { y: -4, duration: 0.05 }, { y: 0, duration: 0.06 }] }, LAND);
      // 2. It flips over to the new level, and gold rays spin up behind it.
      const FLIP = LAND + 0.55;
      timeline.to(badge, { rotationY: 90, duration: 0.16, ease: "power2.in" }, FLIP);
      timeline.add(() => { number.textContent = String(event.level); }, FLIP + 0.16);
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


  // ---------- Team heart level in the sea: a heart of sea water ----------
  // With the fish tank: the heart rises out of the water with a ripple and a trail of bubbles; sea water
  // sloshes up inside it, bubbles rising through it; when it is full the number turns, water bursts out
  // all round and two little clownfish swim round it; then it sinks back, leaving bubbles. No glow.
  const HEART_PATH = "M50 88 C20 66 2 50 2 28 C2 12 14 2 28 2 C38 2 46 8 50 16 C54 8 62 2 72 2 C86 2 98 12 98 28 C98 50 80 66 50 88 Z";
  // A wavy surface 200 wide (twice the heart), so sliding it sideways by 50 looks like water sloshing.
  const SURFACE = "M-60 0 q12.5 -7 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 V120 H-60 Z";
  function seaFan(event, done, { hold = false } = {}) {
    const { group, glow, badge, ribbon, name } = scene(event, "fan", "♥ CHÚC MỪNG LÊN CẤP ♥");
    gsap.set(glow, { opacity: 0 });
    const id = `lvsea${++drawn}`;
    badge.append(svg(`<svg viewBox="0 0 100 90" preserveAspectRatio="xMidYMid meet">
      <defs>
        <clipPath id="${id}"><path d="${HEART_PATH}"/></clipPath>
        <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fe3ff"/><stop offset="1" stop-color="#1f8fc4"/></linearGradient>
      </defs>
      <path d="${HEART_PATH}" fill="#e9fbffcc"/>
      <g clip-path="url(#${id})">
        <g class="water"><path d="${SURFACE}" fill="url(#${id}g)"/><path d="${SURFACE.replace(/ V120 H-60 Z$/, "")}" fill="none" stroke="#fff" stroke-width="1.6" opacity=".8"/></g>
        <g class="inner-bubbles"></g>
      </g>
      <path d="M18 24 C20 14 28 10 34 11" fill="none" stroke="#fffc" stroke-width="4" stroke-linecap="round"/>
      <path d="${HEART_PATH}" fill="none" stroke="#fff" stroke-width="4.5" stroke-linejoin="round"/>
    </svg>`));
    const water = badge.querySelector(".water"), inner = badge.querySelector(".inner-bubbles");
    const number = element("lv-number", badge, String(Math.max(1, event.level - 1)));
    gsap.set(badge, { transformOrigin: "50% 60%" });
    if (hold) {
      number.textContent = String(event.level);
      gsap.set(water, { y: -2 });
      return;
    }
    // Bubbles rising through the water inside the heart, all the while.
    const motion = [];
    for (let i = 0; i < 7; i++) {
      const b = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      b.setAttribute("r", random(1.4, 3).toFixed(1));
      b.setAttribute("fill", "#ffffff");
      b.setAttribute("fill-opacity", ".55");
      inner.append(b);
      motion.push(gsap.fromTo(b, { x: random(25, 75), y: 92 }, { y: 10, x: `+=${random(-8, 8)}`, duration: random(1.4, 2.4), ease: "sine.in", repeat: -1, delay: random(0, 1.5) }));
    }
    motion.push(gsap.fromTo(water, { x: 0 }, { x: -50, duration: 1.2, ease: "none", repeat: -1 }));
    const timeline = gsap.timeline({ onComplete: () => { motion.forEach(m => m.kill()); group.remove(); done(); } });
    // 1. Up out of the water: a ripple spreads where it comes up, bubbles trail behind it.
    timeline.add(() => ripple(group, 0, 120), 0);
    timeline.fromTo(badge, { y: 140, scale: 0.6, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.7, ease: "back.out(1.6)" }, 0);
    timeline.add(() => trail(group, 140), 0.05);
    // 2. Sea water sloshes up inside it, to the old level and then to the top, swaying as it goes.
    timeline.fromTo(water, { y: 95 }, { y: 58, duration: 0.5, ease: "power1.out" }, 0.15);
    timeline.to(water, { y: -4, duration: 0.85, ease: "power1.inOut" }, 0.65);
    timeline.to(badge, { keyframes: [{ rotation: -5, duration: 0.25 }, { rotation: 5, duration: 0.3 }, { rotation: 0, duration: 0.3 }] }, 0.65);
    // 3. Full: the number turns, water bursts out all round, and two little fish swim round the heart.
    const FULL = 1.5;
    timeline.add(() => { number.textContent = String(event.level); spray(group, 22); orbitFish(group); }, FULL);
    timeline.to(badge, { scale: 1.28, duration: 0.14, ease: "power2.out" }, FULL);
    timeline.to(badge, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.4)" }, FULL + 0.14);
    // 4. The ribbon and the name, and two more beats, each throwing a few drops.
    timeline.fromTo(ribbon, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" }, FULL + 0.15);
    timeline.fromTo(name, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, FULL + 0.3);
    for (const at of [FULL + 1.0, FULL + 1.6]) {
      timeline.to(badge, { scale: 1.12, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" }, at);
      timeline.add(() => spray(group, 8), at);
    }
    // 5. It sinks back into the water, leaving a stream of bubbles.
    timeline.add(() => trail(group, 40), FULL + 2.45);
    timeline.to(group, { y: "+=110", opacity: 0, duration: 0.8, ease: "power2.in" }, FULL + 2.5);
  }
  // A ring spreading on the water at y (in the drawing, from the middle of the badge).
  function ripple(group, x, y) {
    for (let i = 0; i < 2; i++) {
      const ring = element("lv-bit lv-ripple", group);
      gsap.fromTo(ring, { x, y, scale: 0.3, opacity: 0.9 }, { scale: 1.8 + i * 0.6, opacity: 0, duration: 1.1, delay: i * 0.18, ease: "power2.out", onComplete: () => ring.remove() });
    }
  }
  // Bubbles left behind by the heart, rising from y.
  function trail(group, y) {
    for (let i = 0; i < 12; i++) {
      const b = element("lv-bit lv-bubble", group, "○");
      gsap.set(b, { x: random(-70, 70), y: y + random(-10, 30), scale: random(0.5, 1.1), opacity: 0 });
      gsap.timeline({ delay: i * 0.05, onComplete: () => b.remove() })
        .to(b, { opacity: 0.95, duration: 0.2 }, 0)
        .to(b, { y: `-=${random(140, 240)}`, x: `+=${random(-30, 30)}`, duration: random(1.3, 1.9), ease: "sine.out" }, 0)
        .to(b, { opacity: 0, scale: 1.5, duration: 0.3 }, 1.2);
    }
  }
  // Drops of water flung out all round from the heart.
  function spray(group, count) {
    for (let i = 0; i < count; i++) {
      const drop = element("lv-bit lv-drop", group);
      const angle = (i / count) * Math.PI * 2 + random(-0.2, 0.2), distance = random(110, 210);
      gsap.fromTo(drop, { x: 0, y: -10, scale: random(0.6, 1.2), opacity: 1, rotation: (angle * 180) / Math.PI + 90 }, {
        x: Math.cos(angle) * distance, y: Math.sin(angle) * distance * 0.8 + 40, opacity: 0, duration: random(0.8, 1.2), ease: "power2.out",
        onComplete: () => drop.remove()
      });
    }
  }
  // Two little clownfish swimming once round the heart, on opposite sides, turning to face the way they go.
  function orbitFish(group) {
    for (let k = 0; k < 2; k++) {
      const fish = element("lv-bit lv-fish", group);
      fish.innerHTML = `<svg viewBox="-22 -10 44 20" width="70" height="32"><path d="M-10 0 L-20 -8 Q-16 0 -20 8 Z" fill="#ff8a1f" stroke="#1d1d1f" stroke-width=".9"/>
        <ellipse rx="12" ry="7.5" fill="#ff8a1f" stroke="#1d1d1f" stroke-width=".9"/><path d="M4 -7 Q1 0 4 7 M-5 -7.3 Q-8 0 -5 7.3" stroke="#fff" stroke-width="3" fill="none"/>
        <circle cx="7.5" cy="-1.8" r="2" fill="#fff"/><circle cx="8" cy="-1.7" r="1.1" fill="#1d1d1f"/></svg>`;
      const turn = { a: k * Math.PI };
      gsap.timeline({ onComplete: () => fish.remove() })
        .fromTo(fish, { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0)
        .to(turn, {
          a: turn.a + Math.PI * 2, duration: 2.6, ease: "sine.inOut",
          onUpdate() {
            // Round an oval about the heart; it faces right going one way and left coming back.
            const x = Math.cos(turn.a) * 150, y = Math.sin(turn.a) * 70 - 10, facing = -Math.sin(turn.a) >= 0 ? 1 : -1;
            gsap.set(fish, { x, y, scaleX: facing, zIndex: Math.sin(turn.a) > 0 ? 2 : 0 });
          }
        }, 0)
        .to(fish, { opacity: 0, duration: 0.3 }, 2.4);
    }
  }

  // ---------- Gifter level in the sea: a treasure chest that drops in and bursts open ----------
  // With the fish tank: the chest drops in and lands with a thud, its lid flies open, light pours out and the
  // new level rises out of it, while gold coins rain down; then it all sinks away.
  function seaGifter(event, done, { hold = false } = {}) {
    const { group, glow, badge, ribbon, name } = scene(event, "gifter", "CHÚC MỪNG LÊN CẤP");
    group.classList.add("lv-chest");
    const id = `lvchest${++drawn}`;
    badge.append(svg(`<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c0803f"/><stop offset="1" stop-color="#6d3d17"/></linearGradient>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c98f12"/><stop offset=".45" stop-color="#ffe27a"/><stop offset="1" stop-color="#c98f12"/></linearGradient>
        <radialGradient id="${id}l"><stop offset="0" stop-color="#fffbe0"/><stop offset=".5" stop-color="#ffd54a" stop-opacity=".85"/><stop offset="1" stop-color="#ffb300" stop-opacity="0"/></radialGradient>
      </defs>
      <ellipse class="chest-light" cx="50" cy="58" rx="40" ry="12" fill="url(#${id}l)" opacity="0"/>
      <rect x="10" y="58" width="80" height="38" rx="4" fill="url(#${id}w)" stroke="#4a2810" stroke-width="2"/>
      <path d="M12 77 H88" stroke="#4a2810" stroke-width="1.2" opacity=".6"/>
      <rect x="20" y="58" width="8" height="38" fill="url(#${id}g)" stroke="#a87412" stroke-width="1"/>
      <rect x="72" y="58" width="8" height="38" fill="url(#${id}g)" stroke="#a87412" stroke-width="1"/>
      <rect x="42" y="60" width="16" height="18" rx="2.5" fill="url(#${id}g)" stroke="#a87412" stroke-width="1.2"/>
      <path d="M50 65 a2.6 2.6 0 1 1 .01 0 M50 67 V72" stroke="#5a3a08" stroke-width="2" fill="#5a3a08" stroke-linecap="round"/>
      <g class="chest-lid">
        <path d="M8 58 V46 Q8 30 26 28 H74 Q92 30 92 46 V58 Z" fill="url(#${id}w)" stroke="#4a2810" stroke-width="2"/>
        <path d="M20 58 V29 H28 V58 Z M72 58 V29 H80 V58 Z" fill="url(#${id}g)" stroke="#a87412" stroke-width="1"/>
        <path d="M14 40 Q50 31 86 40" stroke="#fff" stroke-width="1.6" stroke-opacity=".35" fill="none"/>
      </g>
    </svg>`));
    const lid = badge.querySelector(".chest-lid"), light = badge.querySelector(".chest-light");
    const number = element("lv-number", badge, String(event.level));
    if (hold) {
      gsap.set(lid, { y: -16, rotation: -14, scaleY: 0.6, transformOrigin: "50% 100%" });
      gsap.set(light, { opacity: 1 });
      gsap.set(glow, { opacity: 1 });
      return;
    }
    gsap.set([glow, ribbon, name, number], { opacity: 0 });
    const timeline = gsap.timeline({ onComplete: () => { group.remove(); done(); } });
    // 1. The chest drops in and lands with a thud and a puff of sparkles.
    timeline.fromTo(badge, { y: -520, rotation: -6 }, { y: 0, rotation: 0, duration: 0.55, ease: "power3.in" }, 0);
    const LAND = 0.55;
    // It lands on a mound of sand, which bursts up round it.
    const mound = element("lv-bit lv-sand", group);
    timeline.fromTo(mound, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(2)" }, LAND - 0.05);
    timeline.add(() => { landingStars(group); sandPuff(group, 16); }, LAND);
    timeline.to(badge, { keyframes: [{ scaleY: 0.84, scaleX: 1.12, duration: 0.08 }, { scaleY: 1.05, scaleX: 0.97, duration: 0.12 }, { scaleY: 1, scaleX: 1, duration: 0.15 }] }, LAND);
    timeline.to(group, { keyframes: [{ y: 6, duration: 0.05 }, { y: -4, duration: 0.05 }, { y: 0, duration: 0.06 }] }, LAND);
    // 2. It rattles, then the lid flies open and light pours out.
    const OPEN = LAND + 0.5;
    timeline.to(badge, { keyframes: { rotation: [0, -3, 3, -2, 0] }, duration: 0.3, ease: "none" }, OPEN - 0.32);
    timeline.to(lid, { y: -16, rotation: -14, scaleY: 0.6, transformOrigin: "50% 100%", duration: 0.3, ease: "back.out(2.5)" }, OPEN);
    timeline.to(light, { opacity: 1, duration: 0.25 }, OPEN + 0.05);
    timeline.fromTo(glow, { scale: 0.3, opacity: 0, rotation: 0 }, { scale: 1, opacity: 1, rotation: 60, duration: 0.5, ease: "power2.out" }, OPEN + 0.05);
    timeline.to(glow, { rotation: "+=140", duration: 2.6, ease: "none" }, OPEN + 0.55);
    // 3. The new level rises out of the chest, the banner unrolls, the name slides in, coins rain down.
    timeline.fromTo(number, { y: 30, scale: 0.4, opacity: 0 }, { y: -104, scale: 1, opacity: 1, duration: 0.55, ease: "back.out(1.8)" }, OPEN + 0.1);
    timeline.fromTo(ribbon, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.35, ease: "power3.out" }, OPEN + 0.3);
    timeline.fromTo(name, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" }, OPEN + 0.45);
    // Gold coins and pearls spout up out of the chest like a fountain, with a burst of bubbles.
    timeline.add(() => { coinFountain(group, 26); pearls(group); }, OPEN + 0.1);
    timeline.add(() => coinFountain(group, 14), OPEN + 0.6);
    // 4. It all sinks a little and fades, heavy to the end.
    // 4. It sinks into the sand, which puffs up once more, and everything fades.
    timeline.add(() => sandPuff(group, 10), OPEN + 2.8);
    timeline.to(badge, { y: 60, scaleY: 0.9, duration: 0.6, ease: "power2.in" }, OPEN + 2.8);
    timeline.to(group, { opacity: 0, duration: 0.5, ease: "power1.in" }, OPEN + 2.95);
  }

  // Sand kicked up from under the chest.
  function sandPuff(group, count) {
    for (let i = 0; i < count; i++) {
      const grain = element("lv-bit lv-grain", group);
      const side = i % 2 ? 1 : -1;
      gsap.fromTo(grain, { x: side * random(20, 80), y: 112, scale: random(0.6, 1.3), opacity: 1 }, {
        x: `+=${side * random(40, 120)}`, y: random(60, 100), opacity: 0, duration: random(0.5, 0.9), ease: "power2.out", onComplete: () => grain.remove()
      });
    }
  }
  // Coins shot up out of the open chest, arcing out to either side and falling away, spinning.
  function coinFountain(group, count) {
    for (let i = 0; i < count; i++) {
      const coin = element("lv-bit lv-coin", group, "$");
      // Kept within the part's box (the badge's middle is 210 from its top): up to 185 at most.
      const delay = i * 0.03, dx = random(-200, 200), up = random(110, 185), fall = random(1.1, 1.5);
      gsap.set(coin, { x: random(-20, 20), y: 10, opacity: 0, scale: random(0.7, 1.1) });
      gsap.timeline({ delay, onComplete: () => coin.remove() })
        .to(coin, { opacity: 1, duration: 0.05 }, 0)
        .to(coin, { x: `+=${dx}`, duration: fall, ease: "none" }, 0)
        .to(coin, { y: 10 - up, duration: fall * 0.42, ease: "power2.out" }, 0)
        .to(coin, { y: 340, duration: fall * 0.58, ease: "power2.in" }, fall * 0.42)
        .to(coin, { scaleX: 0.15, duration: 0.16, yoyo: true, repeat: 7, ease: "sine.inOut" }, 0)
        .to(coin, { opacity: 0, duration: 0.25 }, fall - 0.25);
    }
  }
  // A few pearls tossed up with the coins, and bubbles rising out of the chest.
  function pearls(group) {
    for (let i = 0; i < 6; i++) {
      const pearl = element("lv-bit lv-pearl", group);
      const dx = random(-120, 120), up = random(100, 170);
      gsap.set(pearl, { x: random(-15, 15), y: 10, opacity: 0 });
      gsap.timeline({ delay: i * 0.06, onComplete: () => pearl.remove() })
        .to(pearl, { opacity: 1, duration: 0.05 }, 0)
        .to(pearl, { x: `+=${dx}`, duration: 1.3, ease: "none" }, 0)
        .to(pearl, { y: 10 - up, duration: 0.55, ease: "power2.out" }, 0)
        .to(pearl, { y: 330, duration: 0.75, ease: "power2.in" }, 0.55)
        .to(pearl, { opacity: 0, duration: 0.2 }, 1.1);
    }
    trail(group, 40);
  }
  // Hearts (bubbles in the sea) flung out all round when the heart is full.
  function burstHearts(group) {
    for (let i = 0; i < 16; i++) {
      const heart = element("lv-bit", group, SEA ? (i % 3 ? "○" : "✦") : i % 3 ? "♥" : "♡");
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
      const heart = element("lv-bit", group, SEA ? "○" : "♥");
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
    }
  }

  start();
  async function start() {
    // The jar style chosen on the control page decides the look.
    try { SEA = (await (await fetch("/api/effects")).json())?.jarStyle === "tank"; } catch { /* the pink look */ }
    layer.classList.toggle("sea", SEA);
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
      socket.on("effects", settings => { if (settings && (settings.jarStyle === "tank") !== SEA) location.reload(); });
    }
    if (params.has("test")) {
      const only = params.get("test");
      setTimeout(() => {
        for (const kind of ["fan", "gifter"]) if (!only || only === kind) window.levelUp(SAMPLES[kind]);
      }, 800);
    }
  }
})();

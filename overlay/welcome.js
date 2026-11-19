// The welcome frame: a rose gold medallion with the viewer's picture, a banner with their name and
// Ennie's poodle, which bursts in and fades away after a few seconds. It is shown for the viewers picked
// on the control page, when they join the live (the server sends "welcome").
// On the jar overlay (overlay.html) it takes its drawing from welcome.html and sits above the jar, so no
// extra source is needed; overlay.html?welcome shows samples, ?welcome=hold keeps one on screen.
// welcome.html on its own shows the frame in the middle; there the options are ?test and ?test=hold.
(async () => {
  const NS = "http://www.w3.org/2000/svg";
  const $ = id => document.getElementById(id);
  const onJar = Boolean($("jarWrap"));
  const params = new URLSearchParams(location.search);
  // On the single Studio source (live.html) the frame has a part of its own, so the jar leaves it out.
  if (onJar && params.has("nowelcome")) return;
  // ?layer: the frame fills the middle of its page, which is its box on live.html plus a margin around it
  // for the bursts of light (BLEED in live.js). ?preview: a still sample on the layout page, which takes
  // no part in real welcomes.
  const LAYER_BLEED = 0.3;
  const layer = !onJar && params.has("layer");
  const PREVIEW = params.has("preview");
  if (!$("welcome")) {
    try {
      const page = new DOMParser().parseFromString(await (await fetch("/welcome.html")).text(), "text/html");
      document.body.append(document.adoptNode(page.getElementById("welcome")));
    } catch {
      return; // no frame, but the rest of the overlay carries on
    }
  }
  const frame = $("welcome"), art = $("welcomeArt");
  // With the fish tank chosen on the control page (jarStyle in data/effects.json), the frame is dressed for the
  // sea: sea blues instead of rose gold, shells for the roses, pearls for the heart jewels, little fish for the
  // butterflies, a starfish for the crown, coral for the wings, and bubbles for the hearts and petals that
  // drift about. On the jar page the jar already knows (THEME in overlay.js); on its own the page asks.
  let SEA = window.JAR_THEME === "tank";
  if (!onJar) {
    try { SEA = (await (await fetch("/api/effects")).json())?.jarStyle === "tank"; } catch { /* the rose frame */ }
  }
  // The ship's wheel that takes the medallion's place in the sea (made by dressForTheSea), and its entrance.
  let wheel = null, wheelIntro = null, wheelTurn = null;
  if (SEA) dressForTheSea();
  function dressForTheSea() {
    frame.classList.add("sea");
    const svgRoot = art.querySelector("svg");
    const stops = (id, colours) => [...(svgRoot.querySelector(`#${id}`)?.querySelectorAll("stop") ?? [])]
      .forEach((stop, i) => colours[i] && stop.setAttribute("stop-color", colours[i]));
    stops("wRoseGold", ["#e9fbff", "#7fd3ff", "#ffe27a", "#3fb6e0", "#1675a8"]);
    stops("wPlaque", ["#d4f6ff", "#6fd0ea", "#2f97c4"]);
    stops("wRibbon", ["#3fb6e0", "#0b5f8a"]);
    stops("wChiffon", ["#7fd3ff", "#7fd3ff", "#bff3ff", "#bff3ff"]);
    stops("wGlow", ["#5fd0f0", "#9fe3ff", "#cdf4ff"]);
    stops("wRay", ["#fff7c4", "#7fd3ff", "#bff3ff"]);
    stops("wPlaqueEdge", ["#7fd3ea", "#ffe3a3", "#9fe3ff", "#d4f6ff", "#3fb6e0"]);
    // Shells where the roses were.
    svgRoot.querySelector("#wRoseShape").innerHTML = `
      <path d="M0 12 C-11 10 -15 -1 -12 -8 C-7 -15 7 -15 12 -8 C15 -1 11 10 0 12 Z" fill="#ffc7d9" stroke="#e2709f" stroke-width="1.2"/>
      <path d="M0 11 L-8 -9 M0 11 L-3 -12 M0 11 L3 -12 M0 11 L8 -9" stroke="#e98ab4" stroke-width="1" fill="none"/>
      <path d="M-5 12 L-7 15 L7 15 L5 12 Z" fill="#f29fbe" stroke="#e2709f" stroke-width=".8"/>
      <path d="M-8 -9 C-3 -13 3 -13 8 -9" stroke="#fff" stroke-width="1.2" fill="none" opacity=".75"/>`;
    // Pearls where the heart jewels were.
    svgRoot.querySelector("#wHeartGem").innerHTML = `
      <circle r="8" fill="url(#wPearl)" stroke="#d8c6d0" stroke-width=".8"/>
      <circle cx="-2.6" cy="-2.8" r="2.4" fill="#fff" opacity=".95"/>`;
    // Kelp leaves.
    svgRoot.querySelector("#wLeaf").innerHTML = `<path d="M0 0 C6 -6 18 -9 26 -3 C18 3 6 6 0 0Z" fill="#7fcf73" stroke="#2f7f47" stroke-width="1.1"/>`;
    // Little clownfish where the butterflies were (they swim about; they do not flap).
    svgRoot.querySelector("#wButterfly").innerHTML = `
      <path d="M-10 0 L-19 -7 Q-16 0 -19 7 Z" fill="#ff8a1f" stroke="#1d1d1f" stroke-width=".8"/>
      <ellipse rx="12" ry="7.5" fill="#ff8a1f" stroke="#1d1d1f" stroke-width=".9"/>
      <path d="M4 -7 Q1 0 4 7" stroke="#fff" stroke-width="3.2" fill="none"/>
      <path d="M-5 -7.3 Q-8 0 -5 7.3" stroke="#fff" stroke-width="3.2" fill="none"/>
      <circle cx="7.5" cy="-1.8" r="2" fill="#fff"/><circle cx="8" cy="-1.7" r="1.1" fill="#1d1d1f"/>`;
    // A starfish on top of the medallion instead of the crown.
    const crown = svgRoot.querySelector('g[transform="translate(0 -108)"]');
    if (crown) crown.innerHTML = `
      <path d="M0 -24 C2 -14 5 -12 15 -11 C8 -5 7 -2 10 9 C3 4 -3 4 -10 9 C-7 -2 -8 -5 -15 -11 C-5 -12 -2 -14 0 -24 Z" fill="#ff9f6b" stroke="#d0582a" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cy="-12" r="1.4" fill="#ffe1c4"/><circle cx="6" cy="-6" r="1.3" fill="#ffe1c4"/><circle cx="-6" cy="-6" r="1.3" fill="#ffe1c4"/>
      <circle cx="4" cy="2" r="1.2" fill="#ffe1c4"/><circle cx="-4" cy="2" r="1.2" fill="#ffe1c4"/>
      <circle cx="-22" cy="-2" r="3.5" fill="url(#wPearl)"/><circle cx="22" cy="-2" r="3.5" fill="url(#wPearl)"/>`;
    // Branches of coral fanning out behind the medallion instead of the gold wings.
    const wings = svgRoot.querySelector("#wWings");
    if (wings) wings.innerHTML = `
      <path d="M-70 40 C-90 20 -100 -10 -120 -30 M-96 6 C-112 0 -126 4 -140 -6 M-104 -16 C-110 -34 -122 -44 -132 -58 M-84 26 C-100 30 -118 36 -134 30 M-112 -24 C-126 -26 -140 -20 -150 -28"
            fill="none" stroke="#ff8fb8" stroke-width="7" stroke-linecap="round"/>
      <path d="M-70 40 C-90 20 -100 -10 -120 -30 M-96 6 C-112 0 -126 4 -140 -6 M-104 -16 C-110 -34 -122 -44 -132 -58 M-84 26 C-100 30 -118 36 -134 30 M-112 -24 C-126 -26 -140 -20 -150 -28"
            fill="none" stroke="#ffd0e0" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
      <circle cx="-120" cy="-30" r="4.5" fill="#ff8fb8"/><circle cx="-140" cy="-6" r="4" fill="#ff8fb8"/><circle cx="-132" cy="-58" r="4" fill="#ff8fb8"/>
      <circle cx="-134" cy="30" r="4" fill="#ff8fb8"/><circle cx="-150" cy="-28" r="3.6" fill="#ff8fb8"/>`;
    const sub = frame.querySelector(".welcome-sub");
    if (sub) sub.textContent = "đã đến với live của Ennie 🐠";
    // A little driftwood, like the tank's name tag: the banner sits in a frame of it, and the title is
    // painted on a plank nailed under the picture.
    svgRoot.querySelector("defs").insertAdjacentHTML("beforeend", `
      <linearGradient id="wWood" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d9ad74"/><stop offset=".55" stop-color="#a8743f"/><stop offset="1" stop-color="#7d4f27"/></linearGradient>`);
    stops("wPlaqueEdge", ["#8a5a2e", "#d2a46c", "#a8743f", "#c99a62", "#7d4f27"]);
    const plaque = svgRoot.querySelector('path[stroke="url(#wPlaqueEdge)"]');
    if (plaque) plaque.setAttribute("stroke-width", 10);
    const badgeGroup = svgRoot.querySelector("#wBadge");
    if (badgeGroup) badgeGroup.innerHTML = `
      <path d="M-80 -15 C-60 -18 -20 -14 0 -16 C24 -18 60 -14 80 -16 C83 -6 82 8 79 19 C56 21 20 17 0 19 C-24 21 -58 17 -79 19 C-83 8 -82 -6 -80 -15 Z"
            fill="url(#wWood)" stroke="#5a3519" stroke-width="2" stroke-linejoin="round"/>
      <path d="M-72 -6 C-40 -9 -10 -4 20 -7 S60 -5 72 -8 M-70 9 C-44 6 -14 11 14 8 S54 10 70 7" fill="none" stroke="#6b4220" stroke-width="1" opacity=".45"/>
      <path d="M-74 -12 C-30 -15 30 -12 74 -13" fill="none" stroke="#f2cf9a" stroke-width="1.4" opacity=".6"/>
      <circle cx="-70" cy="2" r="2.4" fill="#cfd6dc" stroke="#6f7a84" stroke-width=".8"/>
      <circle cx="70" cy="2" r="2.4" fill="#cfd6dc" stroke="#6f7a84" stroke-width=".8"/>`;

    // A ship's wheel in wood around the picture, instead of the round medallion and its glow: a rim and a hub
    // ring round the picture, and eight turned handles through the rim with brass pins. When the frame
    // appears the handles shoot out from the middle, past the rim, and slam back into place (wheelIntro);
    // then the wheel keeps turning slowly (startLoops), the picture staying upright in the middle.
    // The chiffon ribbons behind the banner go too: in sea blue they read as a glow.
    for (const id of ["wMedallion", "wAura", "wRays", "wChiffons"]) svgRoot.querySelector(`#${id}`)?.style.setProperty("display", "none");
    crown?.parentNode?.style.setProperty("display", "none"); // the scrolls and the starfish that sat on the medallion
    svgRoot.querySelector("defs").insertAdjacentHTML("beforeend", `
      <linearGradient id="wWheelWood" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#e0b37a"/><stop offset=".5" stop-color="#a8743f"/><stop offset="1" stop-color="#6d4220"/></linearGradient>
      <linearGradient id="wSpoke" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#7d4f27"/><stop offset=".45" stop-color="#e6bf88"/><stop offset="1" stop-color="#7d4f27"/></linearGradient>
      <radialGradient id="wBrass" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff3c2"/><stop offset=".55" stop-color="#e2b53c"/><stop offset="1" stop-color="#8a6410"/></radialGradient>`);
    wheel = document.createElementNS(NS, "g");
    wheel.setAttribute("id", "wWheel");
    svgRoot.querySelector("#wMedallion").before(wheel);
    const ring = (r, width) => `
      <circle cx="136" cy="144" r="${r}" fill="none" stroke="#5a3519" stroke-width="${width + 3}"/>
      <circle cx="136" cy="144" r="${r}" fill="none" stroke="url(#wWheelWood)" stroke-width="${width}"/>
      <circle cx="136" cy="144" r="${r - width / 2 + 2}" fill="none" stroke="#f2cf9a" stroke-width="1" opacity=".55"/>`;
    // The handles first, so the rim lies over their shafts; each turns to its own angle round the middle.
    const HANDLE = "M-4 -84 L-4 -114 L-5 -122 C-8.5 -126 -8.5 -131 -5 -134 L-6 -141 C-10 -149 10 -149 6 -141 L5 -134 C8.5 -131 8.5 -126 5 -122 L4 -114 L4 -84 Z";
    const spokes = [];
    for (let i = 0; i < 8; i++) {
      const turn = document.createElementNS(NS, "g");
      turn.setAttribute("transform", `translate(136 144) rotate(${i * 45})`);
      const move = document.createElementNS(NS, "g");
      move.innerHTML = `<path d="${HANDLE}" fill="url(#wSpoke)" stroke="#4a2a10" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M-1.5 -118 V-139" stroke="#fff3d6" stroke-width="1.2" opacity=".5"/>`;
      turn.append(move);
      wheel.append(turn);
      spokes.push(move);
    }
    const rings = document.createElementNS(NS, "g");
    rings.innerHTML = ring(104, 13) + ring(79, 9);
    wheel.append(rings);
    // Brass pins where the handles pass through the rim.
    const pins = document.createElementNS(NS, "g");
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 * Math.PI) / 180;
      pins.insertAdjacentHTML("beforeend", `<circle cx="${(136 + Math.sin(a) * 104).toFixed(1)}" cy="${(144 - Math.cos(a) * 104).toFixed(1)}" r="3.6" fill="url(#wBrass)" stroke="#6b4a08" stroke-width=".8"/>`);
    }
    rings.append(pins);
    wheelIntro = () => gsap.timeline()
      // The rim and the hub turn up first, spinning into place.
      .fromTo(rings, { scale: 0.4, rotation: -90, opacity: 0, svgOrigin: "136 144" }, { scale: 1, rotation: 0, opacity: 1, svgOrigin: "136 144", duration: 0.55, ease: "back.out(1.5)" }, 0)
      // The handles burst out from the middle, overshooting past the rim...
      .fromTo(spokes, { y: 80, opacity: 0 }, { y: -48, opacity: 1, duration: 0.32, ease: "power2.out", stagger: 0.045 }, 0.3)
      // ...and slam back into the rim, one after another, with a little knock to the wheel each time.
      .to(spokes, { y: 0, duration: 0.3, ease: "back.out(3)", stagger: 0.045 }, 0.66)
      .fromTo(rings, { scale: 1.06, svgOrigin: "136 144" }, { scale: 1, svgOrigin: "136 144", duration: 0.35, ease: "elastic.out(1, 0.5)" }, 0.95);
  }
  const random = gsap.utils.random;

  // ---------- The sea's own motion (only with the fish tank) ----------
  // A bubble rising from below, swaying as it goes, and bursting near the top.
  function rise(x, y) {
    const node = document.createElement("span");
    node.className = "welcome-bit welcome-bubble";
    node.textContent = "○";
    node.style.fontSize = `${random(9, 20)}px`;
    art.append(node);
    const up = random(160, 280), duration = random(2.6, 3.8), sway = random(10, 22) * (Math.random() < 0.5 ? -1 : 1);
    gsap.set(node, { x, y, opacity: 0, scale: 0.5 });
    gsap.timeline({ onComplete: () => node.remove() })
      .to(node, { opacity: 0.9, scale: 1, duration: 0.4, ease: "sine.out" }, 0)
      .to(node, { y: y - up, duration, ease: "sine.out" }, 0)
      .to(node, { keyframes: { x: [x, x + sway, x - sway * 0.7, x + sway * 0.4] }, duration, ease: "sine.inOut" }, 0)
      .to(node, { scale: 1.6, opacity: 0, duration: 0.25, ease: "power1.out" }, duration - 0.25);
  }
  // Drops of water thrown up from x, y, falling back.
  function splash(x, y, count = 7) {
    const svgRoot = art.querySelector("svg");
    for (let i = 0; i < count; i++) {
      const drop = document.createElementNS(NS, "circle");
      drop.setAttribute("r", random(1.8, 3.6).toFixed(1));
      drop.setAttribute("fill", random(["#e9fbff", "#bff3ff", "#ffffff"]));
      svgRoot.append(drop);
      const dx = random(-26, 26), up = random(18, 46);
      gsap.set(drop, { x, y });
      gsap.timeline({ onComplete: () => drop.remove() })
        .to(drop, { x: x + dx, duration: 0.7, ease: "none" }, 0)
        .to(drop, { y: y - up, duration: 0.3, ease: "power2.out" }, 0)
        .to(drop, { y: y + 10, opacity: 0, duration: 0.4, ease: "power2.in" }, 0.3);
    }
  }
  // A little clownfish leaps out from one end of the banner, arcs over it and dives back in at the other,
  // splashing where it leaves the water and where it comes back.
  function leapOver() {
    const svgRoot = art.querySelector("svg");
    const fish = document.createElementNS(NS, "use");
    fish.setAttribute("href", "#wButterfly");
    svgRoot.append(fish);
    const right = Math.random() < 0.5, dir = right ? 1 : -1;
    const from = right ? 250 : 620, to = right ? 620 : 250, low = 206, peak = random(36, 70), air = 1.5;
    gsap.set(fish, { x: from, y: low, scaleX: 1.15 * dir, scaleY: 1.15, rotation: -dir * 50, transformOrigin: "50% 50%", opacity: 0 });
    splash(from, low - 2);
    gsap.timeline({ onComplete: () => fish.remove() })
      .to(fish, { opacity: 1, duration: 0.12 }, 0)
      .to(fish, { x: to, duration: air, ease: "none" }, 0)
      .to(fish, { y: peak, duration: air / 2, ease: "power2.out" }, 0)
      .to(fish, { y: low + 8, duration: air / 2, ease: "power2.in" }, air / 2)
      .to(fish, { rotation: dir * 55, duration: air, ease: "sine.inOut" }, 0)
      .add(() => splash(to, low - 2), air - 0.08)
      .to(fish, { opacity: 0, duration: 0.15 }, air - 0.1);
  }
  const svgEl2 = (name, attrs, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.append(node);
    return node;
  };
  // As the frame appears, a big wave rolls in from the left under it, its white crest curling over and
  // throwing spray, and rolls away off the other side.
  function waveSweep() {
    const svgRoot = art.querySelector("svg");
    if (!svgRoot.querySelector("#wWaveBody")) {
      svgRoot.querySelector("defs").insertAdjacentHTML("beforeend", `
        <linearGradient id="wWaveBody" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#1f8fc4" stop-opacity="0"/><stop offset=".55" stop-color="#2a9fd0" stop-opacity=".75"/><stop offset="1" stop-color="#3fb6e0" stop-opacity=".95"/></linearGradient>`);
    }
    const wave = svgEl2("g", { opacity: 0.95 }, svgRoot);
    // The body of the wave, its face rising to a crest that curls forward (to the right), and foam on top.
    svgEl2("path", { d: "M-520 120 L-520 52 C-250 30 -170 20 -110 -4 C-70 -22 -30 -30 -2 -14 C14 -4 16 12 4 18 C-8 22 -14 12 -6 8 C-20 30 0 70 40 120 Z", fill: "url(#wWaveBody)" }, wave);
    svgEl2("path", { d: "M-330 42 C-250 30 -170 20 -110 -4 C-70 -22 -30 -30 -2 -14 C14 -4 16 12 4 18 C-8 22 -14 12 -6 8", fill: "none", stroke: "#ffffff", "stroke-width": 7, "stroke-linecap": "round", opacity: 0.95 }, wave);
    svgEl2("path", { d: "M-300 52 C-240 44 -170 36 -120 14 C-90 2 -60 -6 -40 -4", fill: "none", stroke: "#e9fbff", "stroke-width": 3, "stroke-linecap": "round", opacity: 0.7 }, wave);
    for (const [x, y, r] of [[-24, -12, 6], [-44, -18, 5], [-70, -16, 4], [-8, -18, 4], [8, 2, 3.5]]) svgEl2("circle", { cx: x, cy: y, r, fill: "#ffffff" }, wave);
    const y = 228;
    gsap.set(wave, { x: -60, y, scaleY: 0.5, transformOrigin: "0% 100%" });
    let lastSpray = 0;
    gsap.timeline({ onComplete: () => wave.remove() })
      .to(wave, { x: 1060, duration: 1.5, ease: "power1.inOut",
        onUpdate() {
          const now = this.progress();
          if (now - lastSpray > 0.06) { lastSpray = now; splash(gsap.getProperty(wave, "x"), y - 12, 3); }
        } }, 0)
      .to(wave, { scaleY: 1, duration: 0.5, ease: "power2.out" }, 0)
      .to(wave, { scaleY: 0.4, opacity: 0, duration: 0.5, ease: "power2.in" }, 1.0);
  }
  // When the handles are all in, the wheel spins hard, then slows down to its steady turn, flinging water
  // off its rim as it goes; a ring of bubbles bursts out from its middle.
  function wheelSpin() {
    if (!wheelTurn) return;
    wheelTurn.timeScale(11);
    gsap.to(wheelTurn, { timeScale: 1, duration: 2.6, ease: "power2.out" });
    for (let i = 0; i < 16; i++) {
      gsap.delayedCall(i * 0.05, () => {
        const a = random(0, Math.PI * 2), x = 136 + Math.sin(a) * 110, y = 144 - Math.cos(a) * 110;
        const drop = svgEl2("circle", { r: random(2, 3.6).toFixed(1), fill: random(["#e9fbff", "#bff3ff", "#ffffff"]) }, art.querySelector("svg"));
        // Off the rim along the way it turns (clockwise), falling as it goes.
        const dx = Math.cos(a) * random(50, 90), dy = Math.sin(a) * random(50, 90);
        gsap.set(drop, { x, y });
        gsap.timeline({ onComplete: () => drop.remove() })
          .to(drop, { x: x + dx, duration: 0.7, ease: "power1.out" }, 0)
          .to(drop, { y: y + dy + 40, duration: 0.7, ease: "power1.in" }, 0)
          .to(drop, { opacity: 0, duration: 0.3 }, 0.4);
      });
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const node = document.createElement("span");
      node.className = "welcome-bit welcome-bubble";
      node.textContent = "○";
      node.style.fontSize = `${random(10, 18)}px`;
      art.append(node);
      gsap.set(node, { x: 136, y: 144, scale: 0.3, opacity: 0 });
      gsap.timeline({ onComplete: () => node.remove() })
        .to(node, { opacity: 1, duration: 0.15 }, 0)
        .to(node, { x: 136 + Math.sin(a) * random(80, 130), y: 144 - Math.cos(a) * random(80, 130) - 20, scale: 1, duration: 0.9, ease: "power3.out" }, 0)
        .to(node, { y: "-=50", duration: 1, ease: "sine.in" }, 0.9)
        .to(node, { scale: 1.6, opacity: 0, duration: 0.25 }, 1.65);
    }
  }
  // A dolphin leaps right over the whole frame, from the left to the right, nose up, then diving, with a
  // big splash where it comes out of the water and where it goes back in.
  function dolphinLeap() {
    const svgRoot = art.querySelector("svg");
    if (!svgRoot.querySelector("#wDolphin")) {
      svgRoot.querySelector("defs").insertAdjacentHTML("beforeend", `
        <linearGradient id="wDolphin" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4f7f9e"/><stop offset=".6" stop-color="#8fb6cc"/><stop offset="1" stop-color="#cfe3ec"/></linearGradient>`);
    }
    const dolphin = svgEl2("g", {}, svgRoot);
    svgEl2("path", { d: "M-2 -20 C2 -34 12 -42 18 -42 C14 -33 14 -26 16 -19 Z", fill: "#4f7f9e", stroke: "#2f5670", "stroke-width": 1.2, "stroke-linejoin": "round" }, dolphin);
    svgEl2("path", { d: "M62 0 C54 -14 32 -22 6 -22 C-18 -22 -40 -14 -56 -4 L-72 -18 C-74 -10 -70 -4 -66 0 C-70 4 -74 10 -72 18 L-56 4 C-40 12 -18 18 6 18 C28 18 46 12 56 6 L70 6 C72 3 68 1 62 0 Z", fill: "url(#wDolphin)", stroke: "#2f5670", "stroke-width": 1.4, "stroke-linejoin": "round" }, dolphin);
    svgEl2("path", { d: "M56 6 C42 13 22 17 6 17 C-14 17 -34 12 -50 5 C-30 9 -10 11 6 11 C26 11 42 9 56 6 Z", fill: "#eef6f9", opacity: 0.9 }, dolphin);
    svgEl2("path", { d: "M14 9 C10 19 4 25 -1 28 C6 20 6 14 8 9 Z", fill: "#4f7f9e", stroke: "#2f5670", "stroke-width": 1 }, dolphin);
    svgEl2("path", { d: "M48 -9 C40 -14 26 -17 12 -17", fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round", opacity: 0.5 }, dolphin);
    svgEl2("circle", { cx: 40, cy: -5, r: 2.4, fill: "#1b2a33" }, dolphin);
    svgEl2("circle", { cx: 39.3, cy: -5.8, r: 0.8, fill: "#fff" }, dolphin);
    svgEl2("path", { d: "M58 3 Q52 6 46 4", fill: "none", stroke: "#2f5670", "stroke-width": 1.2, "stroke-linecap": "round" }, dolphin);
    const from = -40, to = 720, low = 280, peak = -70, air = 1.7;
    gsap.set(dolphin, { x: from, y: low, scale: 1.25, rotation: -38, transformOrigin: "50% 50%" });
    splash(from + 30, low - 20, 14);
    gsap.timeline({ onComplete: () => dolphin.remove() })
      .to(dolphin, { x: to, duration: air, ease: "none" }, 0)
      .to(dolphin, { y: peak, duration: air / 2, ease: "power2.out" }, 0)
      .to(dolphin, { y: low, duration: air / 2, ease: "power2.in" }, air / 2)
      .to(dolphin, { rotation: 40, duration: air, ease: "sine.inOut" }, 0)
      .add(() => splash(to - 30, low - 20, 14), air - 0.1)
      .to(dolphin, { opacity: 0, duration: 0.2 }, air - 0.15);
  }
  const SHOW_SECONDS = 4.8;
  const EXIT_SECONDS = 0.8; // the fade at the end, after SHOW_SECONDS
  const BANNER_AT = 0.85; // when the banner starts to slide out from behind the medallion
  // The drawing, from the wings to the bow and from the dog's head to the ribbon (see welcome.css).
  const DRAWING = { width: 702, height: 304 };

  // How wide the frame is on the jar overlay, as a share of the source's width: 0.6 leaves the streamer's
  // face clear on a 1080x1920 source. overlay.html?welcomesize=0.5 makes it smaller, 0.8 larger.
  const SHARE = Math.min(1, Math.max(0.3, Number(params.get("welcomesize")) || 0.6));

  // On its own the frame takes most of the width of the source. On the jar it sits just above the jar
  // and the sticker on its rim, centred over the jar but kept on screen.
  function place() {
    const style = document.documentElement.style;
    if (layer) {
      const inner = 1 + 2 * LAYER_BLEED;
      style.setProperty("--fit", Math.min(innerWidth / inner / DRAWING.width, innerHeight / inner / DRAWING.height));
      return;
    }
    if (!onJar) {
      style.setProperty("--fit", Math.min((innerWidth * 0.92) / 680, (innerHeight * 0.4) / 300));
      return;
    }
    const jar = $("jarWrap").getBoundingClientRect();
    const sticker = document.querySelector(".ennie-sticker")?.getBoundingClientRect();
    const top = Math.min(jar.top, sticker?.height ? sticker.top : jar.top);
    const margin = 12;
    const fit = Math.max(0.2, Math.min((innerWidth * SHARE) / DRAWING.width, (top - 2 * margin) / DRAWING.height));
    const half = (DRAWING.width * fit) / 2;
    const x = Math.min(Math.max(jar.left + jar.width / 2, margin + half), innerWidth - margin - half);
    style.setProperty("--fit", fit);
    style.setProperty("--x", `${x.toFixed(1)}px`);
    style.setProperty("--y", `${(top - margin - (DRAWING.height * fit) / 2).toFixed(1)}px`);
  }
  place();
  addEventListener("resize", place);

  // Pearls around the medallion.
  const pearls = $("wPearls");
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2;
    const pearl = document.createElementNS(NS, "circle");
    pearl.setAttribute("cx", (Math.cos(angle) * 100).toFixed(1));
    pearl.setAttribute("cy", (Math.sin(angle) * 100).toFixed(1));
    pearl.setAttribute("r", i % 3 ? 4.2 : 5.6);
    pearl.setAttribute("fill", "url(#wPearl)");
    pearls.append(pearl);
  }

  const svgEl = (name, attrs, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.append(node);
    return node;
  };
  // Rays of light behind the medallion, alternating long and short.
  const rays = $("wRays");
  for (let i = 0; i < 18; i++) {
    const long = i % 2 === 0, length = long ? 175 : 125, half = long ? 11 : 7;
    svgEl("path", { d: `M${-half} 0 L0 ${-length} L${half} 0Z`, fill: "url(#wRay)", transform: `rotate(${i * 20})` }, rays);
  }
  // Lace scallops along the bottom of the banner.
  const lace = $("wLace");
  for (let x = 228; x <= 620; x += 14) {
    svgEl("path", { d: `M${x - 7} 199 A7 7 0 0 0 ${x + 7} 199`, fill: "#ffffff", stroke: SEA ? "#3fb6e0" : "#ff5fa8", "stroke-width": 1.6 }, lace);
    svgEl("circle", { cx: x, cy: 203, r: 1.6, fill: SEA ? "#1f8fc4" : "#ff3d8a" }, lace);
  }
  // Small diamonds studded along the top edge of the banner, and glitter across it.
  const banner = $("wBanner");
  for (let x = 250; x <= 610; x += 24) {
    if (Math.abs(x - 430) < 20) continue; // the heart jewel sits there
    svgEl("path", { d: `M${x} 102 L${x + 5} 108 L${x} 114 L${x - 5} 108Z`, fill: "#ffffff", stroke: "url(#wGold)", "stroke-width": 1.3 }, banner);
  }
  const glitter = svgEl("g", { id: "wGlitter" }, banner);
  for (let i = 0; i < 46; i++) {
    svgEl("circle", { cx: random(232, 632).toFixed(1), cy: random(118, 192).toFixed(1), r: random(0.8, 2.2).toFixed(1), fill: random(SEA ? ["#ffffff", "#e9fbff", "#bff3ff"] : ["#ffffff", "#fff3b0", "#ffe0ef"]), opacity: random(0.35, 0.9).toFixed(2) }, glitter);
  }
  // A bow tied at the right end of the banner.
  const bow = svgEl("g", { transform: "translate(648 106) rotate(12)" }, banner);
  svgEl("path", { d: "M-2 2 C-6 14 -10 22 -16 30 L-8 28 L-4 36 C0 24 2 14 2 4Z M2 2 C6 14 10 22 16 30 L8 28 L4 36 C0 24 -2 14 -2 4Z", fill: SEA ? "#1675a8" : "#d62f7c", stroke: "url(#wGold)", "stroke-width": 1 }, bow);
  svgEl("path", { d: "M0 0 C-14 -16 -28 -10 -24 0 C-28 10 -14 14 0 0Z M0 0 C14 -16 28 -10 24 0 C28 10 14 14 0 0Z", fill: "url(#wRibbon)", stroke: "url(#wGold)", "stroke-width": 1.4 }, bow);
  svgEl("circle", { r: 5, fill: "url(#wGold)" }, bow);
  // A strand of pearls hanging under the banner.
  const strand = $("wStrand"), strandLength = strand.getTotalLength(), strandPearls = $("wStrandPearls");
  for (let i = 0; i <= 26; i++) {
    const point = strand.getPointAtLength((i / 26) * strandLength);
    svgEl("circle", { cx: point.x.toFixed(1), cy: point.y.toFixed(1), r: i % 5 === 0 ? 4.6 : 3.4, fill: "url(#wPearl)" }, strandPearls);
  }
  for (const i of [6, 13, 20]) {
    const point = strand.getPointAtLength((i / 26) * strandLength);
    svgEl("use", { href: "#wHeartGem", transform: `translate(${point.x.toFixed(1)} ${(point.y + 9).toFixed(1)}) scale(.55)` }, strandPearls);
  }

  // The poodle waving and winking (media/welcome_dog.webm, keyed out of an AI-made green screen clip): it plays only while
  // the frame is shown, from the start each time, so every welcome opens with the wave.
  const dog = $("welcomeDog");
  dog.addEventListener("error", () => dog.remove());
  function dogPlay() {
    if (dog.readyState < 2) {
      // Still loading (the first welcome after the page opens): start as soon as it can.
      dog.addEventListener("canplay", () => { if (frame.classList.contains("show")) dog.play().catch(() => {}); }, { once: true });
      return;
    }
    dog.currentTime = 0;
    dog.play().catch(() => {});
  }

  // Little four-pointed stars that twinkle around the frame while it is shown.
  const STAR = "M7 0 C7.6 5 9 6.4 14 7 C9 7.6 7.6 9 7 14 C6.4 9 5 7.6 0 7 C5 6.4 6.4 5 7 0Z";
  function sparkle(x, y, size, delay) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 14 14");
    svg.classList.add("welcome-spark");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", STAR);
    path.setAttribute("fill", random(SEA ? ["#ffffff", "#e9fbff", "#bff3ff"] : ["#fff8d6", "#ffffff", "#ffd1e6"]));
    svg.append(path);
    art.append(svg);
    gsap.set(svg, { x, y, scale: 0, rotation: random(-30, 30) });
    gsap.timeline({ delay, onComplete: () => svg.remove() })
      // Swells in and out softly, like a twinkle, rather than popping.
      .to(svg, { scale: size, duration: 0.6, ease: "sine.out" })
      .to(svg, { rotation: "+=70", duration: 1.6, ease: "sine.inOut" }, 0)
      .to(svg, { scale: 0, opacity: 0, duration: 0.7, ease: "sine.in" }, 0.9);
  }
  // Big stars that grow and spin slowly behind the frame, then fade, one after another.
  function flare(x, y, delay) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 14 14");
    svg.classList.add("welcome-flare");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", STAR);
    path.setAttribute("fill", random(SEA ? ["#9fe3ff", "#cdf4ff", "#fff3c4", "#ffffff"] : ["#ffc1dd", "#ffd6ea", "#fff3c4", "#ffffff"]));
    svg.append(path);
    art.prepend(svg); // behind the frame, so the name stays easy to read
    gsap.set(svg, { x, y, scale: 0.1, opacity: 0, rotation: random(-45, 45) });
    gsap.timeline({ delay, onComplete: () => svg.remove() })
      // Kept fainter and smaller than the frame: on stream they sit over the streamer's face.
      .to(svg, { scale: random(0.8, 1.25), opacity: random(0.35, 0.55), duration: 0.9, ease: "power2.out" })
      .to(svg, { rotation: "+=60", duration: 2.2, ease: "none" }, 0)
      .to(svg, { scale: "+=0.3", opacity: 0, duration: 1.1, ease: "power1.in" }, 1.1);
  }
  function flares() {
    // Around the edges of the frame, where they show past it.
    const spots = [[136, 144], [20, 40], [660, 70], [560, 270], [60, 285], [360, 20], [470, 250]];
    spots.forEach(([x, y], i) => flare(x + random(-30, 30), y + random(-30, 30), i * 0.35));
  }

  function sparkles(count, spread) {
    for (let i = 0; i < count; i++) {
      const nearMedallion = Math.random() < 0.45;
      const x = nearMedallion ? 136 + random(-110, 110) : random(220, 660);
      const y = nearMedallion ? 144 + random(-110, 110) : random(90, 220);
      sparkle(x, y, random(0.7, 1.6), random(0, spread));
    }
  }

  // Hearts and petals that burst out when the frame appears, then keep drifting while it is shown.
  // In the sea: bubbles, with a few stars.
  const BITS = SEA ? ["○", "○", "◦", "○", "✦", "★"] : ["♥", "♥", "❀", "✿", "♡", "✦"];
  const BIT_COLOURS = SEA ? ["#ffffff", "#e9fbff", "#9fe3ff", "#bff3ff", "#ffe27a", "#ff9f6b"] : ["#ff5fa8", "#ff8fc4", "#ffc1dd", "#ffd76a", "#ffffff", "#e8549a"];
  function bit(fromX, fromY, burst) {
    const node = document.createElement("span");
    node.className = "welcome-bit";
    node.textContent = random(BITS);
    node.style.color = random(BIT_COLOURS);
    node.style.fontSize = `${random(burst ? 14 : 12, burst ? 30 : 22)}px`;
    art.append(node);
    // A burst floats out and drifts down slowly, like petals on the air; the rest sway as they fall.
    const angle = random(0, Math.PI * 2), distance = burst ? random(60, 170) : 0;
    const duration = burst ? random(1.8, 2.6) : random(3, 4.4);
    gsap.set(node, { x: fromX, y: fromY, scale: 0.4, opacity: 0, rotation: random(-30, 30) });
    const sway = random(18, 34) * (Math.random() < 0.5 ? -1 : 1);
    gsap.timeline({ onComplete: () => node.remove() })
      .to(node, { scale: 1, opacity: 1, duration: 0.5, ease: "sine.out" }, 0)
      .to(node, burst
        ? { x: fromX + Math.cos(angle) * distance, y: fromY + Math.sin(angle) * distance * 0.5 + 50, rotation: random(-90, 90), duration, ease: "power3.out" }
        : { x: fromX + random(-30, 30), y: fromY + random(70, 130), rotation: random(-70, 70), duration, ease: "sine.inOut" }, 0)
      .to(node, { keyframes: { xPercent: [0, sway, -sway * 0.6, 0] }, duration, ease: "sine.inOut" }, 0)
      .to(node, { opacity: 0, duration: duration * 0.45, ease: "sine.in" }, duration * 0.55);
  }

  // The burst when the frame lands: a flash, rings of light rushing out, and confetti thrown up.
  const CONFETTI = SEA ? ["#3fb6e0", "#9fe3ff", "#ffd056", "#ffffff", "#ff9f6b", "#ffe08a", "#ff8fb8"] : ["#ff3d8a", "#ff8fc4", "#ffd056", "#ffffff", "#ff6fae", "#ffe08a", "#c084fc"];
  // Confetti, hearts and petals thrown out along the banner as it opens.
  function bannerBurst() {
    for (let i = 0; i < 18; i++) confetti(random(260, 640), 155);
    for (let i = 0; i < 16; i++) bit(random(250, 640), 150, true);
  }
  function confetti(fromX, fromY) {
    const piece = document.createElement("div");
    piece.className = "welcome-confetti";
    piece.style.background = random(CONFETTI);
    art.append(piece);
    // Tossed up gently, then it flutters down, swaying, the way paper does.
    const angle = random(-Math.PI, 0), power = random(110, 280);
    gsap.set(piece, { x: fromX, y: fromY, rotation: random(0, 360), scale: random(0.6, 1.2), opacity: 0 });
    const fall = random(2, 2.8);
    gsap.timeline({ onComplete: () => piece.remove() })
      .to(piece, { opacity: 1, duration: 0.2, ease: "sine.out" }, 0)
      .to(piece, { x: fromX + Math.cos(angle) * power, y: fromY + Math.sin(angle) * power * 0.6, duration: 0.9, ease: "power3.out" }, 0)
      .to(piece, { y: `+=${random(160, 280)}`, rotation: `+=${random(180, 420)}`, rotationX: random(180, 540), duration: fall, ease: "sine.in" }, 0.9)
      .to(piece, { keyframes: { xPercent: [0, 260, -200, 160, 0] }, duration: fall, ease: "sine.inOut" }, 0.9)
      .to(piece, { opacity: 0, duration: 0.8, ease: "sine.in" }, 0.9 + fall - 0.8);
  }
  function boom() {
    const flash = document.createElement("div");
    flash.className = "welcome-flash";
    art.append(flash);
    // A soft bloom of light rather than a flash: it swells and fades out slowly.
    gsap.timeline({ onComplete: () => flash.remove() })
      .fromTo(flash, { scale: 0.4, opacity: 0 }, { scale: 1.4, opacity: 0.6, duration: 0.4, ease: "sine.out" })
      .to(flash, { scale: 2.3, opacity: 0, duration: 0.75, ease: "sine.out" });
    // Two thin ripples of light spreading out like rings on water.
    for (let i = 0; i < 2; i++) {
      const ring = document.createElement("div");
      ring.className = "welcome-ring";
      art.append(ring);
      gsap.fromTo(ring, { scale: 0.5, opacity: 0, borderWidth: 4 }, {
        keyframes: { opacity: [0, 0.8, 0] }, scale: 3 + i * 0.5, borderWidth: 1, duration: 1.5 + i * 0.3, delay: i * 0.25, ease: "power2.out",
        onComplete: () => ring.remove()
      });
    }
    for (let i = 0; i < 16; i++) confetti(136, 144);
    for (let i = 0; i < 26; i++) bit(136, 144, true);
  }

  // Motion that runs only while the frame is shown.
  let loops = [];
  function startLoops() {
    // The sticker on the jar's rim can appear after the frame (just after the page opens): keep clear of it.
    if (onJar) loops.push(gsap.to({}, { duration: 0.5, repeat: -1, onRepeat: place }));
    // The ship's wheel turns slowly all the while.
    // It turns slowly until its handles are in, then spins hard and slows to this (wheelSpin).
    if (wheel) {
      wheelTurn = gsap.fromTo(wheel, { rotation: 0 }, { rotation: 360, svgOrigin: "136 144", duration: 14, ease: "none", repeat: -1 });
      wheelTurn.timeScale(0.3);
      loops.push(wheelTurn);
    }
    loops.push(gsap.to("#wRays", { rotation: 360, svgOrigin: "136 144", duration: 18, ease: "none", repeat: -1 }));
    loops.push(gsap.to("#wDotRing", { rotation: -360, svgOrigin: "0 0", duration: 12, ease: "none", repeat: -1 }));
    // Glitter on the banner twinkles.
    loops.push(gsap.to("#wGlitter circle", { opacity: () => random(0.1, 1), duration: 0.5, ease: "sine.inOut", stagger: { each: 0.03, repeat: -1, yoyo: true } }));
    loops.push(gsap.fromTo("#wAura", { opacity: 0.6, scale: 0.95, svgOrigin: "136 144" }, { opacity: 1, scale: 1.05, svgOrigin: "136 144", duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    // The whole frame floats gently up and down while it is shown, as if hanging in the air. yPercent, so it
    // does not fight the entrance and exit, which move y.
    loops.push(gsap.fromTo(art, { yPercent: 0 }, { yPercent: -1.6, duration: 1.8, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.9 }));
    // The medallion sways a touch, around its middle.
    loops.push(gsap.to(".welcome-avatar", { keyframes: { rotation: [0, 2, -2, 0] }, duration: 4.4, ease: "none", repeat: -1, delay: 1.2 }));
    // Butterflies circle the frame, flapping.
    [["#wFly1", 40, 40, 0.9], ["#wFly2", 600, 60, 0.75], ["#wFly3", 330, 250, 0.65]].forEach(([id, x, y, size], i) => {
      gsap.set(id, { x, y, scale: size, transformOrigin: "50% 50%" });
      loops.push(gsap.to(id, { x: `+=${random(60, 120) * (i % 2 ? -1 : 1)}`, y: `+=${random(-40, 30)}`, duration: random(1.6, 2.4), ease: "sine.inOut", yoyo: true, repeat: -1 }));
      if (!SEA) loops.push(gsap.fromTo(`${id}`, { scaleX: size }, { scaleX: size * 0.25, duration: 0.14, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    });
    // A steady drift of hearts and petals from above: one timer, reused, so a frame held on screen (the
    // layout page) does not pile up a list of finished timers.
    // In the sea, bubbles rising from below instead.
    const fall = SEA ? () => rise(random(20, 660), random(230, 300)) : () => bit(random(0, 660), random(-30, 60), false);
    fall();
    const drift = gsap.delayedCall(0.12, () => { fall(); drift.restart(true); });
    loops.push(drift);
  }
  function stopLoops() {
    for (const loop of loops) loop.kill();
    loops = [];
  }

  // The jar overlay already has a connection (overlay.js); welcome.html on its own opens one.
  const link = typeof socket !== "undefined" ? socket : io();
  // With this many waiting, each frame plays faster (about 3 seconds instead of 5) so the line moves.
  const CROWD = 3, CROWD_SECONDS = 3;

  let playing = null;
  function show({ key, name, avatar, badge = "KHÁCH QUÝ" }) {
    // Tells the server this person's frame is on screen; only shown frames count towards their limit.
    if (key) link.emit("welcome-shown", key);
    $("welcomeName").textContent = name;
    // A long title ("NHÀ TÀI TRỢ") gets smaller letters, so it stays on the ribbon.
    const ribbon = $("welcomeBadge");
    ribbon.textContent = badge;
    ribbon.style.fontSize = ribbon.style.letterSpacing = "";
    for (let size = 14; ribbon.scrollWidth > ribbon.clientWidth && size > 8; size -= 0.5) {
      ribbon.style.fontSize = `${size}px`;
      ribbon.style.letterSpacing = `${Math.max(0, (size - 10) / 2)}px`;
    }
    const picture = $("welcomeAvatar");
    picture.replaceChildren();
    if (avatar) {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = avatar;
      img.onerror = () => { picture.textContent = [...name][0]?.toUpperCase() ?? "♡"; img.remove(); };
      picture.append(img);
    } else {
      picture.textContent = [...name][0]?.toUpperCase() ?? "♡";
    }

    place(); // the jar may have moved or been resized since the page opened
    frame.classList.add("show");
    playing?.kill();
    stopLoops();
    startLoops();
    dogPlay();
    playing = gsap.timeline({ onComplete: () => { stopLoops(); dog.pause?.(); frame.classList.remove("show"); next(); } })
      // Drifts up into place and settles, growing a little as it comes, with a soft overshoot.
      .fromTo(art, { scale: 0.82, rotation: -3, x: 0, y: 34 }, { scale: 1, rotation: 0, y: 0, duration: 1, ease: "back.out(1.3)", transformOrigin: "20% 50%" })
      .fromTo(art, { opacity: 0 }, { opacity: 1, duration: 0.55, ease: "sine.out" }, 0)
      .add(boom, 0.25)
      .add(wheelIntro ? wheelIntro() : () => {}, 0.1)
      // In the sea: a big wave rolls in under the frame as it appears; the wheel spins once its handles
      // are in; a dolphin leaps over the whole frame near the end.
      .add(() => SEA && waveSweep(), 0)
      .add(() => SEA && wheelSpin(), 1.4)
      .add(() => SEA && dolphinLeap(), 2.9)
      .fromTo(".welcome-avatar", { scale: 0.55, rotation: -40, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 1, ease: "back.out(1.5)" }, 0.12)
      // The medallion settles first; then the banner unfurls from behind it.
      .set(["#wChiffons", ".welcome-dog", ".welcome-text > *"], { opacity: 0 }, 0)
      .fromTo("#wBannerRect", { attr: { width: 0 } }, { attr: { width: 520 }, duration: 0.95, ease: "power2.inOut" }, BANNER_AT - 0.15)
      .add(bannerBurst, BANNER_AT + 0.3)
      .to("#wChiffons", { opacity: 0.9, duration: 1, ease: "sine.inOut" }, BANNER_AT)
      // The words rise softly into place, one after another.
      .fromTo(".welcome-text > *", { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.14, ease: "power2.out" }, BANNER_AT + 0.25)
      // The poodle pops up from behind the banner, as if standing up on it.
      .fromTo(".welcome-dog", { y: 40, opacity: 0, scale: 0.9, transformOrigin: "50% 100%" }, { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.6)" }, BANNER_AT + 0.45)
      .fromTo("#wShineBar", { attr: { x: -120 } }, { attr: { x: 760 }, duration: 1.3, ease: "sine.inOut" }, BANNER_AT + 0.6)
      .fromTo("#wRays", { opacity: 0, scale: 0.4, svgOrigin: "136 144" }, { opacity: 0.85, scale: 1, svgOrigin: "136 144", duration: 1.3, ease: "power2.out" }, 0.25)
      .add(() => sparkles(16, 0.9), 0.3)
      // No big glowing stars in the sea: the wheel stands out on its own.
      .add(() => SEA || flares(), 0.2)
      .add(() => SEA || flares(), 2.2)
      .add(() => sparkles(12, 1.6), 1.6)
      // In the sea, a little fish leaps over the banner once it is open.
      .add(() => SEA && leapOver(), BANNER_AT + 1.1)
      .add(() => sparkles(10, 1.2), 3)
      .fromTo("#wShineBar", { attr: { x: -120 } }, { attr: { x: 760 }, duration: 1.4, ease: "sine.inOut" }, 2.6)
      // Leaves softly: the words fade first, then the frame drifts up and dissolves.
      .to(".welcome-text > *, .welcome-dog", { opacity: 0, y: -8, duration: 0.5, stagger: 0.06, ease: "sine.in" }, SHOW_SECONDS - 0.25)
      .to(art, { opacity: 0, y: -26, scale: 0.94, duration: EXIT_SECONDS, ease: "power2.inOut" }, SHOW_SECONDS);
    if (waiting.length >= CROWD) playing.timeScale((SHOW_SECONDS + EXIT_SECONDS) / CROWD_SECONDS);
  }

  // One welcome at a time. The others wait in a queue ordered by rank (1 picked by name, 2 guardian or
  // Super Fan, 3 team heart, 4 gifter level) and, within a rank, by arrival. A full queue lets go of its lowest place, and tells
  // the server, so that person is not counted as welcomed.
  const QUEUE_MAX = 30;
  const waiting = [];
  // True from the moment a welcome is picked until it has faded out, including the short pause before
  // it starts, so several arriving together queue up instead of each starting one of their own.
  let busy = false;
  function next() {
    playing = null;
    const viewer = waiting.shift();
    busy = Boolean(viewer);
    if (viewer) gsap.delayedCall(0.3, () => show(viewer));
  }
  window.welcomeViewer = viewer => {
    if (!viewer?.name) return;
    // A page in the background (a hidden browser tab) cannot play the frame: it would only pile up.
    if (document.hidden) return;
    const rank = viewer.rank ?? 1;
    const at = waiting.findIndex(other => (other.rank ?? 1) > rank);
    waiting.splice(at < 0 ? waiting.length : at, 0, viewer);
    if (waiting.length > QUEUE_MAX) {
      const dropped = waiting.pop();
      if (dropped.key) link.emit("welcome-dropped", dropped.key);
    }
    if (!busy) next();
  };

  if (!PREVIEW) link.on("welcome", viewer => window.welcomeViewer(viewer));
  // "Tải lại overlay" on the control page, for welcome.html as a source of its own (the jar page and
  // live.html reload themselves).
  if (!onJar) link.on("overlay-reload", () => { if (window.top === window) location.reload(); });
  // The jar style changed on the control page: dressed for the sea or not, so start over.
  if (!onJar) link.on("effects", settings => { if (settings && (settings.jarStyle === "tank") !== SEA) location.reload(); });
  // Lets the server know a page that can show the frame is open (again after any reconnect), but only
  // while it is visible. Hidden, the browser stops its animation, so a frame would never finish and the
  // queue would only grow: the page says goodbye, empties its queue and stops, until it is shown again.
  const hello = () => { if (!document.hidden && !PREVIEW) link.emit("overlay-hello"); };
  link.on("connect", hello);
  if (link.connected) hello();
  document.addEventListener("visibilitychange", () => {
    if (PREVIEW) return;
    if (!document.hidden) return hello();
    link.emit("overlay-bye");
    waiting.length = 0;
    playing?.kill();
    playing = null;
    stopLoops();
    dog.pause?.();
    frame.classList.remove("show");
    busy = false;
  });

  const test = params.get(onJar ? "welcome" : "test");
  // ?welcome=hold (?test=hold on its own) keeps one sample on screen, to see where it sits.
  if (test === "hold") {
    busy = true; // the sample stays; real welcomes wait behind it
    show({ name: "Tên người xem", badge: "KHÁCH QUÝ" });
    playing.seek(2.4).pause();
  } else if (test !== null) {
    const samples = [
      { name: "🌙 𝑳𝑰𝑳𝒀𝑨 🌙" },
      { name: "Nik2026", badge: "TOP 1" },
      { name: "Trần Chí Hữu" },
      { name: "Khô Bòoo", badge: "HỘ VỆ" }
    ];
    let i = 0;
    const loop = () => { window.welcomeViewer(samples[i++ % samples.length]); gsap.delayedCall(SHOW_SECONDS + 1.2, loop); };
    gsap.delayedCall(0.6, loop);
  }
})();

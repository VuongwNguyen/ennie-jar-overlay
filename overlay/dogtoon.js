// A flat, chibi cartoon puppy drawn as SVG and animated with GSAP. It needs no WebGL, so it runs on
// any machine and stays sharp at any size. It waddles along the floor, jumps with its paws up,
// and has small expressions of its own.
const NS = "http://www.w3.org/2000/svg";
const FUR = "#6f4c3a", FUR_SOFT = "#7d5845", LINE = "#3b241b", MUZZLE = "#8b6650", INK = "#231410";
const PINK = "#f59ac8", PINK_DARK = "#e56fab", PAD = "#2c1a15";
const HOME_X = 240; // centre of the dog, in .jar-wrap coordinates
const GROUND = 94; // where the feet touch, in the drawing's own coordinates
const random = gsap.utils.random;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent?.append(node);
  return node;
}

// An ellipse with a soft scalloped edge, which is what makes the shapes look fluffy.
function fluffy(cx, cy, rx, ry, bumps = 16) {
  const points = Array.from({ length: bumps }, (_, i) => {
    const t = (i / bumps) * Math.PI * 2;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  });
  const chord = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
  const r = (chord * 0.62).toFixed(2);
  const path = points.map(([x, y], i) => (i ? `A${r} ${r} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}` : `M${x.toFixed(2)} ${y.toFixed(2)}`));
  return `${path.join("")}A${r} ${r} 0 0 1 ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}Z`;
}

// Shapes drawn twice, thick dark ones first, so only the outer edge of the whole group gets a line.
function shape(parent, lobes, { fill = FUR, line = LINE, width = 5 } = {}) {
  const group = el("g", {}, parent);
  const d = lobes.map(([cx, cy, rx, ry, bumps]) => fluffy(cx, cy, rx, ry, bumps)).join("");
  el("path", { d, fill: line, stroke: line, "stroke-width": width, "stroke-linejoin": "round" }, group);
  el("path", { d, fill }, group);
  return group;
}

function draw(svg) {
  const parts = {};
  parts.shadow = el("ellipse", { cx: 0, cy: GROUND + 3, rx: 40, ry: 6, fill: "#1b0d12", opacity: 0.26 }, svg);
  const rig = (parts.rig = el("g", {}, svg));

  parts.tail = shape(el("g", {}, rig), [[0, 0, 11, 11, 11]]);
  parts.feet = [-1, 1].map(side => {
    const foot = el("g", {}, rig);
    shape(foot, [[0, 0, 14, 10, 13]]);
    el("path", { d: "M-4 3V8M4 3V8", stroke: LINE, "stroke-width": 1.8, "stroke-linecap": "round", fill: "none" }, foot);
    return { foot, side };
  });
  parts.body = shape(rig, [[0, 54, 28, 31, 22], [0, 66, 30, 22, 22]]);
  el("path", { d: "M-10 68Q0 76 10 68", stroke: FUR_SOFT, "stroke-width": 3, "stroke-linecap": "round", fill: "none", opacity: 0.8 }, parts.body);

  // Arms hang from the shoulders; raised, they show their paw pads.
  parts.arms = [-1, 1].map(side => {
    const arm = el("g", {}, rig);
    shape(arm, [[0, 18, 11, 19, 15]]);
    const pads = el("g", { fill: PAD, opacity: 0 }, arm);
    el("ellipse", { cx: 0, cy: 25, rx: 5.5, ry: 4.8 }, pads);
    for (const [x, y] of [[-6, 17], [0, 15], [6, 17]]) el("circle", { cx: x, cy: y, r: 2 }, pads);
    return { arm, side, pads };
  });

  // Scarf, with its end hanging on one side.
  const scarf = (parts.scarf = el("g", {}, rig));
  el("path", { d: "M-18 34C-20 42-20 52-17 60L-5 58C-6 50-6 42-5 36Z", fill: PINK_DARK, stroke: LINE, "stroke-width": 2.6, "stroke-linejoin": "round" }, scarf);
  el("path", { d: "M-18 53L-6 51", stroke: "#fff", "stroke-width": 2, opacity: 0.55 }, scarf);
  el("path", { d: "M-32 28C-24 37 24 37 32 28C35 33 34 40 30 42C18 49-18 49-30 42C-34 40-35 33-32 28Z", fill: PINK, stroke: LINE, "stroke-width": 2.6, "stroke-linejoin": "round" }, scarf);
  el("path", { d: "M-13 37V45M13 37V45", stroke: PINK_DARK, "stroke-width": 2.4, "stroke-linecap": "round", opacity: 0.8 }, scarf);

  const head = (parts.head = el("g", {}, rig));
  parts.ears = [-1, 1].map(side => {
    const ear = el("g", {}, head);
    shape(ear, [[side * 8, 26, 19, 30, 22]], { width: 5 });
    return { ear, side };
  });
  shape(head, [[0, 0, 47, 42, 30], [0, -18, 37, 27, 22]]);
  // The ears' inner edge and top tuft are drawn over the head, so the ears read as part of it.
  parts.earLines = [-1, 1].map(side => {
    const line = el("path", { d: `M${side * 28} -8Q${side * 22} 6 ${side * 27} 20Q${side * 31} 28 ${side * 40} 30`, stroke: LINE, "stroke-width": 2.4, "stroke-linecap": "round", fill: "none", opacity: 0.55 }, head);
    return line;
  });
  el("path", { d: "M-6 -46Q-6 -53 -10 -56M0 -46Q0 -54 0 -58M6 -46Q6 -53 10 -56", stroke: LINE, "stroke-width": 2.6, "stroke-linecap": "round", fill: "none" }, head);

  const face = (parts.face = el("g", {}, head));
  el("ellipse", { cx: 0, cy: 14, rx: 21, ry: 15, fill: MUZZLE }, face);
  for (const side of [-1, 1]) el("ellipse", { cx: side * 29, cy: 13, rx: 7, ry: 4, fill: "#ff8fb4", opacity: 0.32 }, face);
  parts.eyes = [-1, 1].map(side => {
    const open = el("g", {}, face);
    el("circle", { cx: 0, cy: 0, r: 5, fill: INK }, open);
    el("circle", { cx: -1.6, cy: -1.8, r: 1.5, fill: "#fff" }, open);
    const happy = el("path", { d: `M${side * 18 - 6} 3Q${side * 18} -5 ${side * 18 + 6} 3`, stroke: INK, "stroke-width": 3, "stroke-linecap": "round", fill: "none", visibility: "hidden" }, face);
    return { open, happy, side };
  });
  parts.nose = el("path", { d: "M-5 6.5Q0 4 5 6.5Q5 11 0 13Q-5 11 -5 6.5Z", fill: INK }, face);
  parts.mouthOpen = el("ellipse", { cx: 0, cy: 21, rx: 7, ry: 7, fill: "#7a2438", visibility: "hidden" }, face);
  parts.tongue = el("ellipse", { cx: 0, cy: 25, rx: 5, ry: 5, fill: "#ff8aa8", visibility: "hidden" }, face);
  el("path", { d: "M0 13V16.5M-6 16Q-3 20 0 16.5Q3 20 6 16", stroke: INK, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" }, face);
  return parts;
}

export function startToonDog() {
  const wrap = document.getElementById("jarWrap");
  const svg = el("svg", { id: "dogToon", class: "dog-toon", viewBox: "-110 -80 220 200", width: 220, height: 200, "aria-hidden": "true" });
  wrap.append(svg);
  const parts = draw(svg);
  document.body.classList.add("dog-toon-on");

  // Everything the dog does is a mix of these values, so GSAP can blend one action into another.
  const pose = {
    walk: 0, dir: 0, phase: 0, speed: 0, squashX: 1, squashY: 1, armUp: 0, lean: 0,
    headTilt: 0, headNod: 0, headTurn: 0, lookX: 0, lookY: 0, blink: 1, lid: 1, joy: 0, wide: 0,
    open: 0, tongue: 0, pant: 0, sniff: 0, ear: 0, earFlick: 0, wag: 0.35, breathe: 0
  };
  const stage = { x: 0, y: 0 };
  let tailPhase = 0, time = 0, armsInFront = false;

  function apply(dt) {
    time += dt;
    pose.phase += dt * pose.speed;
    tailPhase += dt * (5 + pose.wag * 16);
    const p = pose, swing = Math.sin(p.phase), walking = p.walk;
    const rock = swing * 5 * walking + p.lean, bob = Math.abs(Math.cos(p.phase)) * 3.2 * walking;
    const breath = p.breathe * 0.9;

    parts.rig.setAttribute("transform", `translate(0 ${GROUND}) rotate(${rock.toFixed(2)}) scale(${p.squashX.toFixed(3)} ${p.squashY.toFixed(3)}) translate(0 ${(-GROUND - bob).toFixed(2)})`);
    parts.shadow.setAttribute("transform", `translate(0 ${(-stage.y).toFixed(1)}) scale(${(1 + stage.y * 0.004).toFixed(3)} 1)`);
    parts.shadow.setAttribute("opacity", (0.26 * Math.max(0.35, 1 + stage.y * 0.008)).toFixed(3));

    parts.body.setAttribute("transform", `scale(1 ${(1 + breath * 0.012).toFixed(3)})`);
    parts.scarf.setAttribute("transform", "translate(0 11)");
    for (const { foot, side } of parts.feet) {
      // Feet step in turn.
      const lift = Math.max(0, swing * side) * 7 * walking;
      const x = side * 15 + p.dir * 3 * walking;
      foot.setAttribute("transform", `translate(${x.toFixed(2)} ${(GROUND - 8 - lift).toFixed(2)})`);
    }
    // Hanging arms sit behind the scarf; raised, they come in front of the ears to show the paw pads.
    const raised = p.armUp > 0.25;
    if (raised !== armsInFront) {
      armsInFront = raised;
      for (const { arm } of parts.arms) {
        if (raised) parts.rig.append(arm);
        else parts.rig.insertBefore(arm, parts.scarf);
      }
    }
    for (const { arm, side, pads } of parts.arms) {
      const hang = 9 - swing * side * 14 * walking;
      // Raised arms open out to the sides, below the head, so the paw pads face the viewer.
      const angle = side === 1 ? -hang - p.armUp * 108 : hang + p.armUp * 108;
      arm.setAttribute("transform", `translate(${side * 25} 38) rotate(${angle.toFixed(1)})`);
      pads.setAttribute("opacity", Math.max(0, (p.armUp - 0.4) * 2.2).toFixed(2));
    }
    const tailSide = p.dir ? -Math.sign(p.dir) : 1;
    const tailX = tailSide * (26 + 5 * Math.abs(p.dir));
    parts.tail.parentNode.setAttribute("transform", `translate(${tailX.toFixed(1)} 72) rotate(${(Math.sin(tailPhase) * (10 + p.wag * 28)).toFixed(1)} 0 8)`);

    const headY = breath * 0.8 + Math.sin(p.phase * 2) * 0.8 * walking;
    parts.head.setAttribute("transform", `translate(${(p.dir * 3).toFixed(2)} ${headY.toFixed(2)}) rotate(${(p.headTilt - rock * 0.5).toFixed(2)} 0 34)`);
    parts.face.setAttribute("transform", `translate(${(p.headTurn * 15).toFixed(2)} ${(p.headNod * 7).toFixed(2)})`);
    for (const { ear, side } of parts.ears) {
      const flap = p.ear + (side === 1 ? p.earFlick : 0) + Math.abs(Math.cos(p.phase)) * 5 * walking;
      ear.setAttribute("transform", `translate(${side * 34} -14) rotate(${(side * -flap).toFixed(2)})`);
    }
    for (const { open, happy, side } of parts.eyes) {
      const eyeY = Math.max(0.08, p.blink * p.lid) * (1 + p.wide * 0.2);
      open.setAttribute("transform", `translate(${(side * 18 + p.lookX * 2.4).toFixed(2)} ${(1 + p.lookY * 2).toFixed(2)}) scale(${(1 + p.wide * 0.14).toFixed(3)} ${eyeY.toFixed(3)})`);
      open.setAttribute("visibility", p.joy > 0.5 ? "hidden" : "visible");
      happy.setAttribute("visibility", p.joy > 0.5 ? "visible" : "hidden");
    }
    parts.nose.setAttribute("transform", `translate(0 ${(p.sniff * -1).toFixed(2)}) scale(${(1 + p.sniff * 0.12).toFixed(3)})`);
    const panting = p.pant * (0.5 + Math.sin(time * 14) * 0.16);
    const open = Math.max(p.open, panting), tongue = Math.max(p.tongue, p.pant * 0.8);
    parts.mouthOpen.setAttribute("visibility", open > 0.03 ? "visible" : "hidden");
    parts.mouthOpen.setAttribute("transform", `translate(0 ${(21 * (1 - open)).toFixed(2)}) scale(1 ${open.toFixed(3)})`);
    parts.tongue.setAttribute("visibility", tongue > 0.05 ? "visible" : "hidden");
    parts.tongue.setAttribute("transform", `translate(0 ${(25 * (1 - tongue) + open * 2).toFixed(2)}) scale(1 ${tongue.toFixed(3)})`);
  }
  apply(0);
  if (reduceMotion) {
    window.dogReact = () => {};
    return;
  }
  gsap.ticker.add((_t, deltaMs) => apply(Math.min(deltaMs / 1000, 0.1)));
  gsap.to(pose, { breathe: 1, duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1 });

  const blink = () => {
    gsap.timeline({ onComplete: () => gsap.delayedCall(random(2.2, 5), blink) })
      .to(pose, { blink: 0.08, duration: 0.06, ease: "power1.in" })
      .to(pose, { blink: 1, duration: 0.09, ease: "power1.out" });
  };
  gsap.delayedCall(1.5, blink);

  // ---------- Moving around the floor ----------
  const place = () => gsap.set(svg, { x: stage.x, y: stage.y });
  const sceneScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
  const bounds = () => {
    const box = wrap.getBoundingClientRect(), s = sceneScale();
    return { min: -box.left / s + 62 - HOME_X, max: (innerWidth - box.left) / s - 62 - HOME_X };
  };
  const within = x => { const { min, max } = bounds(); return Math.min(max, Math.max(min, x)); };
  const tween = (target, vars) => new Promise(done => gsap.to(target, { ...vars, onComplete: done }));
  const rest = seconds => new Promise(done => gsap.delayedCall(seconds, done));
  const soft = { ease: "sine.inOut" };
  let lastDir = 1;

  async function go(x, fast) {
    const distance = Math.abs(x - stage.x);
    if (distance < 20) return;
    const dir = (lastDir = Math.sign(x - stage.x));
    const px = fast ? random(150, 200) : random(70, 105);
    pose.speed = fast ? 17 : 10;
    gsap.to(pose, { walk: 1, dir, headTurn: dir, lookX: dir * 0.6, lean: dir * (fast ? 7 : 2.5), pant: fast || Math.random() < 0.6 ? 1 : 0, duration: 0.2, ...soft, overwrite: "auto" });
    await tween(stage, { x, duration: distance / px, ease: "none", onUpdate: place });
    await tween(pose, { walk: 0, lean: 0, pant: 0, speed: 0, duration: 0.2, ...soft, overwrite: "auto" });
    gsap.to(pose, { dir: 0, headTurn: 0, lookX: 0, duration: 0.3, ...soft });
  }

  // A proper cartoon jump: crouch, stretch into the air with the paws up, squash on landing.
  async function leap(height = 55, joyful = false) {
    const landing = within(stage.x + lastDir * random(20, 45));
    await tween(pose, { squashY: 0.8, squashX: 1.14, duration: 0.11, ease: "power2.out" });
    gsap.to(pose, { squashY: 1.1, squashX: 0.93, armUp: 1, open: 0.8, tongue: 0.6, joy: joyful ? 1 : 0, ear: 26, duration: 0.14, ease: "power2.out" });
    gsap.to(stage, { x: landing, duration: 0.46, ease: "none", onUpdate: place });
    await tween(stage, { y: -height, duration: 0.24, ease: "power2.out", onUpdate: place });
    gsap.to(pose, { ear: -8, duration: 0.2 });
    await tween(stage, { y: 0, duration: 0.22, ease: "power2.in", onUpdate: place });
    gsap.to(pose, { armUp: 0, ear: 0, open: 0, tongue: 0, duration: 0.28, ...soft });
    await tween(pose, { squashY: 0.76, squashX: 1.18, duration: 0.07, ease: "power2.out" });
    await tween(pose, { squashY: 1, squashX: 1, duration: 0.32, ease: "back.out(3.2)" });
    if (joyful) gsap.to(pose, { joy: 0, duration: 0.2, delay: 0.3 });
  }

  // ---------- Little things it does on its own while resting ----------
  const side = () => (Math.random() < 0.5 ? -1 : 1);
  const ACTS = {
    lookAround: () => {
      const s = side();
      return gsap.timeline()
        .to(pose, { headTurn: s * 0.9, lookX: s, duration: 0.3, ...soft })
        .to(pose, { headTurn: -s * 0.8, lookX: -s, duration: 0.45, ...soft }, "+=0.7")
        .to(pose, { headTurn: 0, lookX: 0, duration: 0.3, ...soft }, "+=0.6");
    },
    tilt: () => gsap.timeline()
      .to(pose, { headTilt: side() * 15, ear: 14, wide: 0.7, lookY: -0.5, duration: 0.25, ease: "back.out(2)" })
      .to(pose, { headTilt: 0, ear: 0, wide: 0, lookY: 0, duration: 0.3, ...soft }, "+=1"),
    lookUp: () => gsap.timeline()
      .to(pose, { headNod: -1, lookY: -1, wide: 0.6, open: 0.3, duration: 0.3, ...soft })
      .to(pose, { headNod: 0, lookY: 0, wide: 0, open: 0, duration: 0.3, ...soft }, "+=0.9"),
    pant: () => gsap.timeline()
      .to(pose, { pant: 1, duration: 0.25, ...soft })
      .to(pose, { pant: 0, duration: 0.35, ...soft }, `+=${random(1.8, 3.5)}`),
    yawn: () => gsap.timeline()
      .to(pose, { lid: 0.12, headNod: -0.8, open: 1.25, tongue: 0.7, duration: 0.6, ease: "power2.inOut" })
      .to(pose, { lid: 1, headNod: 0, open: 0, tongue: 0, duration: 0.4, ...soft }, "+=0.5"),
    sniff: () => gsap.timeline()
      .to(pose, { headNod: 1, lookY: 1, duration: 0.3, ...soft })
      .to(pose, { sniff: 1, duration: 0.09, repeat: 7, yoyo: true, ...soft })
      .to(pose, { headNod: 0, lookY: 0, sniff: 0, duration: 0.3, ...soft }),
    earFlick: () => gsap.timeline().to(pose, { earFlick: 22, duration: 0.08, repeat: 3, yoyo: true, ...soft }).set(pose, { earFlick: 0 }),
    smile: () => gsap.timeline()
      .to(pose, { joy: 1, open: 0.55, tongue: 0.5, wag: 1, duration: 0.18, ...soft })
      .to(pose, { joy: 0, open: 0, tongue: 0, wag: 0.35, duration: 0.25, ...soft }, "+=1")
  };
  const MOODS = ["lookAround", "lookAround", "tilt", "tilt", "lookUp", "pant", "yawn", "sniff", "earFlick", "smile", "smile"];
  let mood = null, moodWait = null;
  const startMoods = () => {
    const next = () => {
      mood = ACTS[gsap.utils.random(MOODS)]();
      mood.eventCallback("onComplete", () => { moodWait = gsap.delayedCall(random(0.4, 1.5), next); });
    };
    moodWait = gsap.delayedCall(random(0.2, 0.8), next);
  };
  const stopMoods = () => {
    moodWait?.kill();
    mood?.kill();
    mood = moodWait = null;
    gsap.to(pose, { headTilt: 0, headNod: 0, headTurn: 0, lookX: 0, lookY: 0, lid: 1, wide: 0, open: 0, tongue: 0, pant: 0, sniff: 0, ear: 0, earFlick: 0, joy: 0, wag: 0.35, duration: 0.2, ...soft, overwrite: "auto" });
  };

  let cheerTier = null, lastCheer = 0, wake = null;
  function calm(seconds) {
    startMoods();
    return new Promise(done => {
      const finish = () => { timer.kill(); wake = null; stopMoods(); done(); };
      const timer = gsap.delayedCall(seconds, finish);
      wake = finish;
    });
  }
  async function cheer() {
    if (cheerTier == null) return;
    const tier = cheerTier;
    cheerTier = null;
    lastCheer = performance.now();
    for (let i = 0; i <= tier; i++) await leap(46 + tier * 18, true);
  }
  async function life() {
    for (;;) {
      const { min, max } = bounds();
      await go(random(min, max), Math.random() < 0.25);
      if (Math.random() < 0.5) await leap(random(36, 60));
      await cheer();
      await calm(random(2, 6));
      await cheer();
    }
  }
  gsap.delayedCall(1.2, life);

  // Every gift gets an instant happy face and a wagging tail; the jump follows at the next calm moment.
  window.dogReact = (tier = 0) => {
    wake?.();
    gsap.timeline()
      .to(pose, { joy: 1, open: 0.8, tongue: 0.7, wag: 1, ear: 14, duration: 0.14, ease: "power2.out", overwrite: "auto" })
      .to(pose, { joy: 0, open: 0, tongue: 0, wag: 0.35, ear: 0, duration: 0.3, ...soft }, `+=${0.9 + tier * 0.4}`);
    if (performance.now() - lastCheer < 2500) return;
    cheerTier = Math.max(cheerTier ?? 0, tier);
  };
}

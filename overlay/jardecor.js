// Decorations around the jar: a wooden stand with flowers, a string of twinkling lights, and small
// hearts and stars drifting past. Drawn over the same coordinates as the jar in overlay.html.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const wrap = document.getElementById("jarWrap");
  const el = (name, attrs = {}, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent?.append(node);
    return node;
  };
  const svg = el("svg", { class: "jar-svg front jar-decor", viewBox: "-14 -14 300 390", width: 300, height: 390, "aria-hidden": "true" });
  wrap.append(svg);

  // ---------- Wooden stand ----------
  const stand = el("g", {}, svg);
  el("ellipse", { cx: 136, cy: 381, rx: 150, ry: 7, fill: "#1b0d12", opacity: 0.25 }, stand);
  el("rect", { x: -10, y: 362, width: 292, height: 15, rx: 7, fill: "#a97544", stroke: "#7d4f2c", "stroke-width": 2 }, stand);
  el("rect", { x: -10, y: 352, width: 292, height: 18, rx: 8, fill: "#d3a271", stroke: "#7d4f2c", "stroke-width": 2 }, stand);
  el("rect", { x: -5, y: 354, width: 282, height: 4, rx: 2, fill: "#f0cfa4", opacity: 0.75 }, stand);
  el("path", { d: "M16 363Q70 360 120 364T226 362M58 367Q120 365 170 368", stroke: "#8a5a35", "stroke-width": 1.2, "stroke-linecap": "round", fill: "none", opacity: 0.6 }, stand);

  // ---------- Flowers and leaves at the foot of the jar ----------
  const garden = el("g", {}, svg);
  const leaf = (x, y, angle, size = 1, colour = "#7fbf7a") =>
    el("ellipse", { cx: x, cy: y, rx: 5 * size, ry: 11 * size, fill: colour, stroke: "#4f8a53", "stroke-width": 1, transform: `rotate(${angle} ${x} ${y})` }, garden);
  const flower = (x, y, size, petal, heart = "#ffd76a") => {
    const group = el("g", { transform: `translate(${x} ${y}) scale(${size})` }, garden);
    for (let i = 0; i < 5; i++) {
      el("ellipse", { cx: 0, cy: -6.5, rx: 4.4, ry: 6.4, fill: petal, stroke: "#c9659d", "stroke-width": 0.8, transform: `rotate(${i * 72})` }, group);
    }
    el("circle", { r: 3.4, fill: heart, stroke: "#d59a3a", "stroke-width": 0.8 }, group);
  };
  for (const [x, angle, size] of [[-6, -38, 1], [8, -14, 1.05], [28, 26, 0.9], [60, 34, 0.75], [212, -34, 0.75], [240, -22, 0.95], [258, 12, 1.05], [278, 36, 1]]) {
    leaf(x, 350, angle, size);
  }
  for (const [x, y, size, petal] of [
    [-4, 345, 1.15, "#ffb6d9"], [17, 351, 0.9, "#fff4fa"], [36, 345, 0.85, "#ff9ccf"], [56, 353, 0.7, "#fff4fa"],
    [216, 352, 0.72, "#ffb6d9"], [236, 345, 0.92, "#fff4fa"], [256, 350, 1.05, "#ff9ccf"], [277, 344, 1.15, "#ffb6d9"],
  ]) {
    flower(x, y, size, petal);
  }

  // ---------- Flowering vines climbing both walls of the jar ----------
  const heart = (x, y, size, colour) =>
    el("path", { d: "M0 3.2C-1.6 0.4-5 0.8-5-2C-5-4.4-1.6-5.2 0-2.6C1.6-5.2 5-4.4 5-2C5 0.8 1.6 0.4 0 3.2Z", fill: colour, stroke: "#fff", "stroke-width": 0.9, transform: `translate(${x} ${y}) scale(${size})` }, garden);
  function vine(wall, inward, fromY, toY) {
    const widthOf = y => wall + inward * (7 + Math.sin(y * 0.052) * 6.5);
    const points = [];
    for (let y = fromY; y >= toY; y -= 7) points.push([widthOf(y), y]);
    const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y}`).join("");
    el("path", { d, fill: "none", stroke: "#5f9e62", "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round" }, garden);
    // Leaves on alternating sides, with a flower or a small heart every so often.
    let turn = 0;
    const petals = ["#ffb6d9", "#fff4fa", "#ff9ccf"];
    for (let y = fromY - 12; y > toY + 6; y -= 21, turn++) {
      const x = widthOf(y), out = turn % 2 ? 1 : -1;
      leaf(x + out * 6, y - 3, out * 55, 0.62);
      if (turn % 4 === 1) flower(x, y - 11, 0.68 + (turn % 3) * 0.08, petals[turn % 3]);
      if (turn % 4 === 3) heart(x, y - 11, 0.95, "#ff8fc7");
    }
    flower(widthOf(toY), toY - 3, 0.62, "#ffb6d9");
  }
  // The left vine starts above the pearls and little bow in the lower corner.
  vine(6, 1, 296, 84);
  vine(266, -1, 346, 84);

  // ---------- String of lights, in two swags across the front of the glass ----------
  const COLOURS = ["#ffd76a", "#ff8fc7", "#9fe6ff", "#fff1a8"];
  const glow = el("radialGradient", { id: "bulbGlow" }, el("defs", {}, svg));
  el("stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 0.85 }, glow);
  el("stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0 }, glow);
  const lights = el("g", { class: "jar-lights" }, svg);
  let bulbIndex = 0;
  for (const [left, dip, right] of [[[3, 136], [136, 206], [269, 136]], [[3, 246], [136, 316], [269, 246]]]) {
    el("path", { d: `M${left}Q${dip} ${right}`, fill: "none", stroke: "#4f8a53", "stroke-width": 1.8, "stroke-linecap": "round" }, lights);
    for (let i = 1; i < 10; i++) {
      const t = i / 10, u = 1 - t;
      const x = u * u * left[0] + 2 * u * t * dip[0] + t * t * right[0];
      const y = u * u * left[1] + 2 * u * t * dip[1] + t * t * right[1];
      const colour = COLOURS[bulbIndex % COLOURS.length];
      const bulb = el("g", { class: `bulb ${bulbIndex % 2 ? "bulb-b" : "bulb-a"}`, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, lights);
      el("circle", { class: "bulb-glow", cy: 6, r: 12, fill: "url(#bulbGlow)" }, bulb);
      el("rect", { x: -2, y: -2, width: 4, height: 4, rx: 1, fill: "#4f8a53" }, bulb);
      el("ellipse", { cy: 6, rx: 4.2, ry: 5.6, fill: colour, stroke: "#fff", "stroke-width": 0.7 }, bulb);
      bulbIndex++;
    }
  }
  // Every gift lights the whole string for a moment.
  let litTimer = 0;
  const lightUp = () => {
    lights.classList.add("lit");
    clearTimeout(litTimer);
    litTimer = setTimeout(() => lights.classList.remove("lit"), 1100);
  };

  // ---------- Hearts and stars drifting around the jar ----------
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FLOATERS = ["♥", "♡", "✦", "♥", "✧"];
  const TINTS = ["#ff9ccf", "#ffc6e6", "#fff4c2", "#ffffff", "#f4d38d"];
  const random = gsap.utils.random;
  function drift(fromX, fromY, big = false) {
    const item = document.createElement("span");
    item.className = "fx jar-float";
    item.textContent = gsap.utils.random(FLOATERS);
    item.style.color = gsap.utils.random(TINTS);
    item.style.fontSize = `${random(big ? 18 : 12, big ? 28 : 21)}px`;
    document.getElementById("fxLayer").append(item);
    const rise = random(90, 170), sway = random(-26, 26), duration = random(2.2, 3.6);
    gsap.set(item, { x: fromX, y: fromY, opacity: 0, scale: 0.6 });
    gsap.timeline({ onComplete: () => item.remove() })
      .to(item, { opacity: 0.95, scale: 1, duration: duration * 0.25, ease: "power1.out" }, 0)
      .to(item, { y: fromY - rise, duration, ease: "sine.out" }, 0)
      .to(item, { x: fromX + sway, rotation: random(-30, 30), duration, ease: "sine.inOut" }, 0)
      .to(item, { opacity: 0, duration: duration * 0.35, ease: "power1.in" }, duration * 0.65);
  }
  // Mostly along the sides of the jar, so the gifts inside stay easy to see.
  function nextPlace() {
    const where = Math.random();
    if (where < 0.4) return [random(-22, 14), random(140, 350)];
    if (where < 0.8) return [random(288, 318), random(140, 350)];
    return [random(40, 250), random(10, 40)];
  }
  if (!reduceMotion) {
    const loop = () => {
      drift(...nextPlace());
      gsap.delayedCall(random(0.7, 1.4), loop);
    };
    gsap.delayedCall(0.5, loop);
  }

  // ---------- Fireflies wandering around the jar, each glowing and fading at its own pace ----------
  const FIREFLIES = 16;
  function fireflyArea() {
    // In .jar-wrap coordinates, kept inside the frame whatever its size.
    const box = wrap.getBoundingClientRect();
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
    const frame = window.jarFrame?.() ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    return {
      left: Math.max((frame.left - box.left) / s + 10, -250),
      right: Math.min((frame.right - box.left) / s - 10, 335),
      top: Math.max((frame.top - box.top) / s + 10, -90),
      bottom: Math.min((frame.bottom - box.top) / s - 20, 405)
    };
  }
  function wander(fly) {
    const { left, right, top, bottom } = fireflyArea();
    gsap.to(fly, {
      x: random(left, right), y: random(top, bottom), duration: random(4, 9), ease: "sine.inOut",
      onComplete: () => wander(fly)
    });
  }
  function flicker(fly) {
    gsap.timeline({ onComplete: () => flicker(fly) })
      .to(fly, { opacity: random(0.75, 1), scale: random(0.9, 1.15), duration: random(0.5, 1.2), ease: "sine.inOut" })
      .to(fly, { opacity: random(0, 0.15), scale: 0.6, duration: random(0.6, 1.6), ease: "sine.inOut" }, `+=${random(0.1, 0.8)}`)
      .to({}, { duration: random(0.1, 1.2) });
  }
  if (!reduceMotion) {
    const { left, right, top, bottom } = fireflyArea();
    for (let i = 0; i < FIREFLIES; i++) {
      const fly = document.createElement("span");
      fly.className = "firefly";
      wrap.append(fly); // not in the effects layer, which a session reset empties
      gsap.set(fly, { x: random(left, right), y: random(top, bottom), opacity: 0, scale: 0.6 });
      wander(fly);
      gsap.delayedCall(random(0, 2.5), flicker, [fly]);
    }
  }

  window.jarDecorGift = (tier = 0) => {
    lightUp();
    if (reduceMotion) return;
    for (let i = 0; i < 4 + tier * 3; i++) gsap.delayedCall(i * 0.06, () => drift(random(20, 270), random(0, 60), true));
  };
})();

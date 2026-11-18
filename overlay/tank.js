// The fish tank: the other thing that can hold the gifts instead of the glass jar (chosen on the control page,
// see THEME in overlay.js). Same size and place as the jar, so the layout, the dog and the donor tags stay put.
// Behind the gifts: the water, light rays from above, sand with pebbles, a rock, a starfish, seaweed and a few
// fish swimming by. In front of them: the glass, the water's surface rippling, seaweed in the front corner,
// bubbles rising from an air stone, and the lid. overlay.js makes the gifts sink in the water and calls
// tankSplash when one falls in.
(() => {
  if (window.JAR_THEME !== "tank") return;
  const NS = "http://www.w3.org/2000/svg";
  const W = 272, H = 356, WATER = 46, CORNER = 18, SAND = 34;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const random = (a, b) => a + Math.random() * (b - a);
  const el = (name, attrs = {}, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent?.append(node);
    return node;
  };
  const [back, front] = [...document.querySelectorAll("#jarWrap > .jar-svg:not(.jar-decor)")];
  if (!back || !front) return;

  // The inside of the tank: straight sides, rounded at the bottom (the physics outline in overlay.js).
  const inside = `M0 0 V${H - CORNER} Q0 ${H} ${CORNER} ${H} H${W - CORNER} Q${W} ${H} ${W} ${H - CORNER} V0 Z`;
  const defs = el("defs", {}, back);
  defs.innerHTML = `
    <clipPath id="tankClip"><path d="${inside}"/></clipPath>
    <linearGradient id="tankWater" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#c8f4ff" stop-opacity=".55"/><stop offset=".45" stop-color="#6fd0ea" stop-opacity=".55"/>
      <stop offset="1" stop-color="#2f97c4" stop-opacity=".7"/>
    </linearGradient>
    <linearGradient id="tankRay" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="tankSand" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fbe7bd"/><stop offset="1" stop-color="#e2b979"/>
    </linearGradient>
    <linearGradient id="tankWeed" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#9be38f"/><stop offset="1" stop-color="#3f9f5c"/>
    </linearGradient>
    <linearGradient id="tankGlass" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#bff0ff" stop-opacity=".5"/><stop offset=".12" stop-color="#bff0ff" stop-opacity="0"/>
      <stop offset=".88" stop-color="#bff0ff" stop-opacity="0"/><stop offset="1" stop-color="#bff0ff" stop-opacity=".5"/>
    </linearGradient>
    <linearGradient id="tankLid" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff1f8"/><stop offset="1" stop-color="#ffb6d9"/>
    </linearGradient>
    <radialGradient id="tankStone" cx=".4" cy=".35" r=".7">
      <stop offset="0" stop-color="#d9e2ea"/><stop offset="1" stop-color="#8496a8"/>
    </radialGradient>`;

  // ---------- Behind the gifts ----------
  const deep = el("g", { class: "tank-part", "clip-path": "url(#tankClip)" }, back);
  el("rect", { x: 0, y: WATER, width: W, height: H - WATER, fill: "url(#tankWater)" }, deep);
  // Light coming down through the surface, slowly brightening and fading.
  const rays = el("g", {}, deep);
  for (const [x, spread, width] of [[40, 30, 26], [110, 10, 18], [170, -12, 30], [236, -30, 20]]) {
    el("path", { d: `M${x} ${WATER} L${x + width} ${WATER} L${x + width + spread + 30} ${H - SAND} L${x + spread - 10} ${H - SAND} Z`, fill: "url(#tankRay)", opacity: 0.35 }, rays);
  }
  // Seaweed at the back, swaying from its root.
  const weed = (parent, x, height, lean, width = 9) => {
    const top = H - SAND + 6 - height;
    const path = el("path", {
      d: `M${x - width / 2} ${H - SAND + 8} C${x - width} ${top + height * 0.6} ${x + lean} ${top + height * 0.35} ${x + lean * 0.6} ${top}
          C${x + lean + width} ${top + height * 0.35} ${x + width} ${top + height * 0.6} ${x + width / 2} ${H - SAND + 8} Z`,
      fill: "url(#tankWeed)", stroke: "#2f7f47", "stroke-width": 1
    }, parent);
    return path;
  };
  const backWeeds = [weed(deep, 30, 130, -14), weed(deep, 46, 92, 12, 7), weed(deep, 228, 150, 16, 10), weed(deep, 246, 104, -10, 7), weed(deep, 140, 70, 8, 6)];
  // A rock and a starfish on the sand.
  el("path", { d: `M168 ${H - SAND + 8} C166 ${H - SAND - 18} 186 ${H - SAND - 30} 204 ${H - SAND - 20} C216 ${H - SAND - 14} 220 ${H - SAND} 218 ${H - SAND + 8} Z`, fill: "url(#tankStone)", stroke: "#6f8193", "stroke-width": 1.2 }, deep);
  const star = el("g", { transform: `translate(120 ${H - SAND + 4}) rotate(-12)` }, deep);
  el("path", { d: "M0 -11 L3 -3.5 L11 -3.5 L4.5 1.8 L7 10 L0 5 L-7 10 L-4.5 1.8 L-11 -3.5 L-3 -3.5 Z", fill: "#ff9ccf", stroke: "#e2569b", "stroke-width": 1, "stroke-linejoin": "round" }, star);
  for (const [cx, cy] of [[0, -4], [3, 1], [-3, 1], [0, 3]]) el("circle", { cx, cy, r: 0.9, fill: "#fff3fa" }, star);
  // The sand, with a wavy top, and pebbles in it.
  const SAND_PATH = `M0 ${H - SAND + 6} C40 ${H - SAND - 4} 80 ${H - SAND + 10} 130 ${H - SAND + 2} S220 ${H - SAND - 6} ${W} ${H - SAND + 4} V${H} H0 Z`;
  el("path", { d: SAND_PATH, fill: "url(#tankSand)" }, deep);
  for (let i = 0; i < 26; i++) {
    el("ellipse", { cx: random(6, W - 6), cy: random(H - SAND + 12, H - 4), rx: random(2.5, 5.5), ry: random(2, 3.6), fill: ["#f7c9de", "#fff4e0", "#c9e7f2", "#e9d2b0", "#ffd9a8"][i % 5], opacity: 0.9 }, deep);
  }
  // Sunlight rippling on the sand: two nets of bright wavy lines drifting different ways over each other, so
  // the light keeps changing shape, as it does under moving water.
  defs.insertAdjacentHTML("beforeend", `
    <pattern id="tankCaustic" width="60" height="40" patternUnits="userSpaceOnUse">
      <path d="M0 12 C10 4 22 18 34 8 S52 2 60 12 M0 30 C12 22 24 38 38 28 S54 24 60 30 M14 0 C8 10 20 22 12 40 M44 0 C52 12 38 24 46 40"
            fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>
    </pattern>
    <clipPath id="tankSandClip"><path d="${SAND_PATH}"/></clipPath>`);
  const caustics = el("g", { "clip-path": "url(#tankSandClip)", opacity: 0.55 }, deep);
  const nets = [0, 1].map(k => {
    const net = el("g", {}, caustics);
    el("rect", { x: -120, y: H - SAND - 60, width: W + 240, height: SAND + 120, fill: "url(#tankCaustic)", transform: k ? `rotate(14 ${W / 2} ${H}) scale(1.3)` : "" }, net);
    return net;
  });

  // Fish swimming back and forth, each turning round at the end of its swim: a clownfish, a goldfish and a
  // neon tetra. Each is drawn facing right, nose at x 18 and the root of its tail at x -19: a body that
  // tapers to the tail, darker along the back and pale underneath, see-through fins with rays, a gill line
  // and an eye with an iris and a glint. The tail and the side fin move on their own (see below).
  const FISH = [
    { kind: "clown", size: 1, y: 120, back: "#e2580b", base: "#ff8a1f", belly: "#ffc27a", fin: "#ff8a1f", edge: "#1d1d1f" },
    { kind: "gold", size: 0.95, y: 205, back: "#e98a00", base: "#ffb020", belly: "#ffe7a3", fin: "#ffc04d", edge: "#d47700" },
    { kind: "neon", size: 0.75, y: 262, back: "#5d6f7a", base: "#9fb4bf", belly: "#eef4f6", fin: "#cfe3ea", edge: "#5d6f7a" }
  ];
  const BODY = "M18 0 C17 -5.5 10 -9.5 0 -10 C-9 -10 -15 -6 -19 -2.4 L-19 2.4 C-15 6 -9 9.5 0 9.5 C10 9.2 17 5.5 18 0 Z";
  const fishes = FISH.map((fish, n) => {
    const id = `fish${n}`;
    defs.insertAdjacentHTML("beforeend", `
      <linearGradient id="${id}Body" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="${fish.back}"/><stop offset=".45" stop-color="${fish.base}"/><stop offset="1" stop-color="${fish.belly}"/>
      </linearGradient>
      <linearGradient id="${id}Fin" x1="1" x2="0" y1="0" y2="0">
        <stop offset="0" stop-color="${fish.fin}" stop-opacity=".9"/><stop offset="1" stop-color="${fish.fin}" stop-opacity=".35"/>
      </linearGradient>
      <clipPath id="${id}Clip"><path d="${BODY}"/></clipPath>
      <radialGradient id="${id}Eye" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#4a3a20"/><stop offset=".55" stop-color="#1a1410"/><stop offset="1" stop-color="#000"/></radialGradient>`);
    // outer moves it about the tank; bob, inside it, bobs and tilts; turn is the fish seen from the side.
    const outer = el("g", {}, deep);
    const bob = el("g", {}, outer);
    const turn = el("g", {}, bob);
    const shape = el("g", { transform: `scale(${fish.size})` }, turn);
    const finStyle = { fill: `url(#${id}Fin)`, stroke: fish.edge, "stroke-width": 0.6, "stroke-opacity": 0.5, "stroke-linejoin": "round" };
    const rays = (parent, from, tips) => tips.forEach(([x, y]) => el("path", { d: `M${from[0]} ${from[1]} L${x} ${y}`, stroke: fish.edge, "stroke-width": 0.45, "stroke-opacity": 0.45 }, parent));
    // The tail: long and flowing on the goldfish, short and forked on the others.
    const tail = el("g", {}, shape);
    if (fish.kind === "gold") {
      el("path", { d: "M-18 0 C-24 -6 -34 -16 -42 -15 C-37 -8 -36 -3 -38 0 C-36 3 -37 8 -42 15 C-34 16 -24 6 -18 0 Z", ...finStyle }, tail);
      rays(tail, [-18, 0], [[-40, -13], [-36, -7], [-35, 0], [-36, 7], [-40, 13]]);
    } else {
      el("path", { d: "M-18 0 C-22 -3 -27 -10 -31 -11 C-29 -5 -28 -2 -27 0 C-28 2 -29 5 -31 11 C-27 10 -22 3 -18 0 Z", ...finStyle }, tail);
      rays(tail, [-18, 0], [[-30, -9], [-27, -4], [-27, 4], [-30, 9]]);
    }
    // Fins on the back and underneath.
    el("path", { d: fish.kind === "gold" ? "M-9 -9 C-6 -18 4 -17 8 -9 Z" : "M-11 -8.6 C-8 -14 2 -14 6 -9.4 Z", ...finStyle }, shape);
    el("path", { d: "M-12 7.5 C-11 12 -5 12.5 -3 9 Z", ...finStyle }, shape);
    // The body, and what is drawn on it, kept inside its outline.
    el("path", { d: BODY, fill: `url(#${id}Body)` }, shape);
    const skin = el("g", { "clip-path": `url(#${id}Clip)` }, shape);
    if (fish.kind === "clown") {
      // White bands edged in black, behind the head, across the middle and at the tail.
      for (const [x, w] of [[8, 4.5], [-4, 5], [-17, 3.5]]) {
        el("path", { d: `M${x} -12 Q${x - 3} 0 ${x} 12`, fill: "none", stroke: fish.edge, "stroke-width": w + 2.6 }, skin);
        el("path", { d: `M${x} -12 Q${x - 3} 0 ${x} 12`, fill: "none", stroke: "#fff", "stroke-width": w }, skin);
      }
    } else if (fish.kind === "neon") {
      // The bright blue stripe along its side, and red at the back of its belly.
      el("path", { d: "M-19 3 C-10 2 0 6 12 4 L12 9 C0 11 -10 8 -19 6 Z", fill: "#e8323c", opacity: 0.9 }, skin);
      el("path", { d: "M-19 -1 C-8 -3 4 -2 14 -1 L14 2.2 C4 1.6 -8 0.8 -19 2.2 Z", fill: "#27c3ff" }, skin);
      el("path", { d: "M-19 -0.6 C-8 -2.4 4 -1.6 14 -0.6", fill: "none", stroke: "#bff0ff", "stroke-width": 0.8 }, skin);
    } else {
      // Scales: rows of faint arcs.
      for (let row = -1; row <= 1; row++) for (let x = -14; x < 8; x += 4.5) {
        el("path", { d: `M${x + (row & 1 ? 2.2 : 0)} ${row * 4.5 - 2} q2 2.4 0 4.6`, fill: "none", stroke: "#fff3c8", "stroke-width": 0.7, "stroke-opacity": 0.55 }, skin);
      }
    }
    // Light along the back, the outline and the gill line.
    el("path", { d: "M13 -5 C6 -9 -6 -9 -14 -4", fill: "none", stroke: "#fff", "stroke-width": 1.4, "stroke-opacity": 0.35, "stroke-linecap": "round" }, skin);
    el("path", { d: BODY, fill: "none", stroke: fish.edge, "stroke-width": 0.7, "stroke-opacity": 0.55 }, shape);
    el("path", { d: "M10 -6 Q7 0 10 6.5", fill: "none", stroke: fish.edge, "stroke-width": 0.8, "stroke-opacity": 0.5, "stroke-linecap": "round" }, shape);
    // The side fin, behind the gill.
    const side = el("path", { d: "M7 2 C3 4 1 8 3 9.5 C6 8.6 8 5.6 7 2 Z", ...finStyle, opacity: 0.85 }, shape);
    // The eye (iris, pupil and a glint) and the mouth.
    el("circle", { cx: 12.5, cy: -2.6, r: 3.1, fill: fish.kind === "neon" ? "#cfd8dc" : "#f3e3b5", stroke: fish.edge, "stroke-width": 0.5, "stroke-opacity": 0.6 }, shape);
    el("circle", { cx: 12.9, cy: -2.5, r: 2.1, fill: `url(#${id}Eye)` }, shape);
    el("circle", { cx: 12.1, cy: -3.3, r: 0.8, fill: "#fff" }, shape);
    el("path", { d: "M17.4 1 Q16 2.2 14.4 1.8", fill: "none", stroke: fish.edge, "stroke-width": 0.6, "stroke-opacity": 0.6, "stroke-linecap": "round" }, shape);
    // The same fish seen head-on, shown for a moment in the middle of a turn so it never shrinks to a line:
    // a round body, an eye on each side, its side fins spread, the fin on its back above and its mouth.
    const front = el("g", { opacity: 0 }, bob);
    const face = el("g", { transform: `scale(${fish.size})` }, front);
    el("path", { d: "M0 -16 C-2 -12 -2 -10 0 -9 C2 -10 2 -12 0 -16 Z", ...finStyle }, face);
    for (const sx of [-1, 1]) el("path", { d: `M${sx * 6} 2 C${sx * 13} 0 ${sx * 15} 5 ${sx * 13} 8 C${sx * 10} 7 ${sx * 7} 5 ${sx * 6} 2 Z`, ...finStyle }, face);
    el("path", { d: "M-2 8 C-3 13 3 13 2 8 Z", ...finStyle }, face);
    el("ellipse", { cx: 0, cy: 0, rx: fish.kind === "neon" ? 5.5 : 7.5, ry: 10, fill: `url(#${id}Body)`, stroke: fish.edge, "stroke-width": 0.7, "stroke-opacity": 0.55 }, face);
    if (fish.kind === "clown") el("ellipse", { cx: 0, cy: 0, rx: 7.5, ry: 10, fill: "none", stroke: "#fff", "stroke-width": 2.2, "stroke-dasharray": "6 25", "stroke-dashoffset": 2 }, face);
    if (fish.kind === "neon") for (const sx of [-1, 1]) el("path", { d: `M${sx * 5.3} -2 L${sx * 5.3} 2`, stroke: "#27c3ff", "stroke-width": 1.6 }, face);
    el("ellipse", { cx: -2, cy: -5, rx: 2.5, ry: 3.5, fill: "#fff", opacity: 0.3 }, face);
    for (const sx of [-1, 1]) {
      el("circle", { cx: sx * 5.2, cy: -2.6, r: 2.6, fill: fish.kind === "neon" ? "#cfd8dc" : "#f3e3b5", stroke: fish.edge, "stroke-width": 0.5, "stroke-opacity": 0.6 }, face);
      el("circle", { cx: sx * 5.6, cy: -2.5, r: 1.7, fill: `url(#${id}Eye)` }, face);
      el("circle", { cx: sx * 5.0, cy: -3.2, r: 0.6, fill: "#fff" }, face);
    }
    el("ellipse", { cx: 0, cy: 3.4, rx: 1.4, ry: 1, fill: "none", stroke: fish.edge, "stroke-width": 0.7, "stroke-opacity": 0.7 }, face);
    return { outer, bob, turn, front, tail, side, y: fish.y, size: fish.size };
  });

  // ---------- In front of the gifts ----------
  const near = el("g", { class: "tank-part" });
  front.querySelector("defs").after(near);

  // The stand: an open scallop shell, a dish seen a little from above, with the tank standing in it. So that
  // it is plain which way up it is: its pale inside shows on either side of the tank (drawn behind the tank,
  // below); its outside is lit from above, light at the scalloped rim and darker toward the hinge at the
  // bottom; its ribs curve down to that hinge, which has the two small "ears".
  // (The jar's wooden stand and its flowers are hidden; see jardecor.js.)
  const shellDefs = el("defs", {}, near);
  shellDefs.innerHTML = `
    <linearGradient id="shellOutside" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#ffe3ee"/><stop offset=".45" stop-color="#ffb3d1"/><stop offset="1" stop-color="#e06a9c"/>
    </linearGradient>
    <linearGradient id="shellInside" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#ffd9e8"/><stop offset="1" stop-color="#fff6fa"/>
    </linearGradient>
    <linearGradient id="shellEar" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#ffc2da"/><stop offset="1" stop-color="#d95f93"/>
    </linearGradient>`;
  const DISH = { cx: W / 2, cy: H - 8, rx: 162, ry: 10, bottom: H + 24 };
  const L = DISH.cx - DISH.rx, R = DISH.cx + DISH.rx;
  // The inside of the dish, behind the tank: only its ends show, either side of the glass.
  const inner = el("g", {}, back);
  back.insertBefore(inner, deep);
  el("ellipse", { cx: DISH.cx, cy: DISH.cy, rx: DISH.rx - 2, ry: DISH.ry, fill: "url(#shellInside)", stroke: "#f2a7c7", "stroke-width": 1 }, inner);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = DISH.cx + side * (DISH.rx - 10 - k * 7);
      el("path", { d: `M${x} ${DISH.cy - DISH.ry + 3} Q${x - side * 4} ${DISH.cy} ${x} ${DISH.cy + DISH.ry - 3}`, fill: "none", stroke: "#f6bfd6", "stroke-width": 1 }, inner);
    }
  }
  const shell = el("g", {}, near);
  el("ellipse", { cx: DISH.cx, cy: DISH.bottom + 3, rx: 140, ry: 5, fill: "#1b0d12", opacity: 0.25 }, shell);
  // The front rim, the near half of the dish's opening, with a round scallop for each rib.
  const SCALLOPS = 13;
  const rimPoint = t => { const a = Math.PI * (1 - t); return [DISH.cx + DISH.rx * Math.cos(a), DISH.cy + DISH.ry * Math.sin(a)]; };
  let face = `M${L} ${DISH.cy}`;
  for (let i = 0; i < SCALLOPS; i++) {
    const [x1, y1] = rimPoint(i / SCALLOPS), [x2, y2] = rimPoint((i + 1) / SCALLOPS);
    face += ` Q${(x1 + x2) / 2} ${Math.min(y1, y2) - 9} ${x2} ${y2}`;
  }
  // Down the far side to the hinge and back up: a bowl, round underneath.
  face += ` C${R - 6} ${DISH.cy + 18} ${DISH.cx + 70} ${DISH.bottom} ${DISH.cx} ${DISH.bottom}`;
  face += ` C${DISH.cx - 70} ${DISH.bottom} ${L + 6} ${DISH.cy + 18} ${L} ${DISH.cy} Z`;
  el("path", { d: face, fill: "url(#shellOutside)", stroke: "#d95f93", "stroke-width": 1.4, "stroke-linejoin": "round" }, shell);
  // The ribs: from the dip between two scallops, curving down to the hinge.
  for (let i = 1; i < SCALLOPS; i++) {
    const [x, y] = rimPoint(i / SCALLOPS);
    const bend = (x - DISH.cx) * 0.35;
    el("path", { d: `M${x} ${y} Q${DISH.cx + bend} ${DISH.bottom - 6} ${DISH.cx + (x - DISH.cx) * 0.08} ${DISH.bottom - 2}`, fill: "none", stroke: "#d9649a", "stroke-width": 1.3, "stroke-opacity": 0.7, "stroke-linecap": "round" }, shell);
    el("path", { d: `M${x + 2.5} ${y + 1} Q${DISH.cx + bend + 2.5} ${DISH.bottom - 7} ${DISH.cx + (x - DISH.cx) * 0.08 + 1.5} ${DISH.bottom - 3}`, fill: "none", stroke: "#fff", "stroke-width": 1, "stroke-opacity": 0.55, "stroke-linecap": "round" }, shell);
  }
  // Light catching the top of each scallop.
  for (let i = 0; i < SCALLOPS; i++) {
    const [x1, y1] = rimPoint(i / SCALLOPS), [x2, y2] = rimPoint((i + 1) / SCALLOPS);
    el("path", { d: `M${x1 + 3} ${y1 - 2} Q${(x1 + x2) / 2} ${Math.min(y1, y2) - 7} ${x2 - 3} ${y2 - 2}`, fill: "none", stroke: "#fff", "stroke-width": 1.6, "stroke-opacity": 0.85, "stroke-linecap": "round" }, shell);
  }
  // The hinge's ears, at the bottom.
  el("path", { d: `M${DISH.cx - 30} ${DISH.bottom + 3} L${DISH.cx - 22} ${DISH.bottom - 8} Q${DISH.cx} ${DISH.bottom - 3} ${DISH.cx + 22} ${DISH.bottom - 8} L${DISH.cx + 30} ${DISH.bottom + 3} Q${DISH.cx} ${DISH.bottom + 7} ${DISH.cx - 30} ${DISH.bottom + 3} Z`, fill: "url(#shellEar)", stroke: "#c94f86", "stroke-width": 1.1, "stroke-linejoin": "round" }, shell);
  const glass = el("g", { "clip-path": "url(#tankClip)" }, near);
  el("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#tankGlass)" }, glass);
  // The water's surface: a light band whose waves roll along.
  const surface = el("g", {}, glass);
  const waveLine = (offset, amp) => {
    let d = `M${-120 + offset} ${WATER}`;
    for (let x = -120; x < W + 120; x += 30) d += ` q7.5 ${-amp} 15 0 t15 0`;
    return d;
  };
  el("rect", { x: 0, y: WATER - 2, width: W, height: 10, fill: "#e9fbff", opacity: 0.45 }, surface);
  const waves = [
    el("path", { d: waveLine(0, 4), fill: "none", stroke: "#fff", "stroke-width": 2.4, "stroke-opacity": 0.9, "stroke-linecap": "round" }, surface),
    el("path", { d: waveLine(15, 3), fill: "none", stroke: "#bdf1ff", "stroke-width": 1.6, "stroke-opacity": 0.8, transform: "translate(0 5)" }, surface)
  ];
  // Seaweed in the front corner, over the gifts, so the tank has some depth.
  const frontWeeds = [weed(glass, 10, 116, 18, 11), weed(glass, 262, 84, -14, 9)];
  // The air stone in the corner, and the bubbles' layer.
  el("ellipse", { cx: 26, cy: H - 8, rx: 11, ry: 5, fill: "url(#tankStone)", stroke: "#6f8193", "stroke-width": 1 }, glass);
  const bubbles = el("g", {}, glass);
  // A treasure chest half sunk in the sand at the front, wood with gold bands and a lock. A big gift opens it
  // (tankTreasure, below): light pours out, gold coins and bubbles burst up, and it shuts again.
  const CHEST = { x: 64, y: H - SAND + 8 }; // the middle of its bottom edge
  shellDefs.insertAdjacentHTML("beforeend", `
    <linearGradient id="chestWood" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#b8763a"/><stop offset="1" stop-color="#6d3d17"/>
    </linearGradient>
    <linearGradient id="chestGold" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#c98f12"/><stop offset=".45" stop-color="#ffe27a"/><stop offset="1" stop-color="#c98f12"/>
    </linearGradient>
    <radialGradient id="chestGlow"><stop offset="0" stop-color="#fff6c4"/><stop offset=".5" stop-color="#ffd54a" stop-opacity=".8"/><stop offset="1" stop-color="#ffb300" stop-opacity="0"/></radialGradient>`);
  const chest = el("g", { transform: `translate(${CHEST.x} ${CHEST.y})` });
  glass.insertBefore(chest, bubbles);
  // Light from inside, and its rays, shown while it is open.
  const chestRays = el("path", { d: "M-16 -20 L-34 -70 L-14 -72 L-4 -22 Z M-2 -22 L0 -78 L14 -76 L6 -22 Z M8 -21 L30 -68 L40 -60 L16 -19 Z", fill: "url(#chestGlow)", opacity: 0 }, chest);
  const chestGlow = el("ellipse", { cx: 0, cy: -20, rx: 18, ry: 6, fill: "url(#chestGlow)", opacity: 0 }, chest);
  // The box.
  el("rect", { x: -20, y: -20, width: 40, height: 20, rx: 2, fill: "url(#chestWood)", stroke: "#4a2810", "stroke-width": 1.2 }, chest);
  el("path", { d: "M-19 -10 H19", stroke: "#4a2810", "stroke-width": 0.8, opacity: 0.6 }, chest);
  for (const x of [-15, 11]) el("rect", { x, y: -20, width: 4, height: 20, fill: "url(#chestGold)", stroke: "#a87412", "stroke-width": 0.6 }, chest);
  el("rect", { x: -4.5, y: -19, width: 9, height: 10, rx: 1.5, fill: "url(#chestGold)", stroke: "#a87412", "stroke-width": 0.7 }, chest);
  el("path", { d: "M0 -16.5 a1.6 1.6 0 1 1 0.01 0 M0 -15 V-12", stroke: "#5a3a08", "stroke-width": 1.1, fill: "#5a3a08", "stroke-linecap": "round" }, chest);
  // The lid, a rounded top, hinged at its bottom edge.
  const lid = el("g", {}, chest);
  el("path", { d: "M-21 -20 V-26 Q-21 -34 -12 -35 H12 Q21 -34 21 -26 V-20 Z", fill: "url(#chestWood)", stroke: "#4a2810", "stroke-width": 1.2 }, lid);
  for (const x of [-15, 11]) el("path", { d: `M${x} -20 V-34.6 H${x + 4} V-20 Z`, fill: "url(#chestGold)", stroke: "#a87412", "stroke-width": 0.6 }, lid);
  el("path", { d: "M-18 -30 Q0 -34.5 18 -30", stroke: "#fff", "stroke-width": 1, "stroke-opacity": 0.35, fill: "none" }, lid);
  // Sand heaped against its foot, so it sits in the sand rather than on it.
  el("path", { d: "M-26 1 Q-20 -5 -8 -2 Q4 -5 14 -2 Q22 -5 28 1 Z", fill: "url(#tankSand)" }, chest);
  // The glass: a soft aqua edge with a bright line, and a reflection on each side.
  near.append(el("path", { d: inside.replace(/ Z$/, ""), fill: "none", stroke: "#fff", "stroke-opacity": 0.5, "stroke-width": 10, "stroke-linejoin": "round" }));
  near.append(el("path", { id: "tankEdge", d: inside.replace(/ Z$/, ""), fill: "none", stroke: "#7fd3ea", "stroke-width": 3, "stroke-linejoin": "round" }));
  near.append(el("path", { d: inside.replace(/ Z$/, ""), fill: "none", stroke: "#fff", "stroke-opacity": 0.95, "stroke-width": 1, "stroke-linejoin": "round" }));
  el("path", { d: `M14 ${WATER + 40} V${H - 70}`, stroke: "#fff", "stroke-opacity": 0.55, "stroke-width": 7, "stroke-linecap": "round" }, near);
  el("path", { d: `M24 ${WATER + 60} V${WATER + 130}`, stroke: "#fff", "stroke-opacity": 0.45, "stroke-width": 2.5, "stroke-linecap": "round" }, near);
  el("path", { d: `M${W - 12} ${WATER + 70} V${H - 110}`, stroke: "#fff", "stroke-opacity": 0.35, "stroke-width": 4, "stroke-linecap": "round" }, near);
  // The lid, with a lamp shining down.
  el("rect", { x: -8, y: -14, width: W + 16, height: 13, rx: 5, fill: "url(#tankLid)", stroke: "#d9689f", "stroke-width": 1.6 }, near);
  el("rect", { x: 4, y: -11.5, width: 150, height: 3, rx: 1.5, fill: "#fff", "fill-opacity": 0.85 }, near);
  el("rect", { x: 96, y: -2, width: 80, height: 4, rx: 2, fill: "#fff8d6", stroke: "#f4d38d", "stroke-width": 1 }, near);
  // The jar's ribbon is kept and tied round the tank, under the lid; it is made as wide as the tank.
  const ribbon = document.getElementById("jarRibbon");
  if (ribbon) { ribbon.setAttribute("x", -4); ribbon.setAttribute("width", W + 8); }
  // The shell goes over the foot of the glass and the seaweed in front.
  near.append(shell);

  // ---------- Bubbles and splashes ----------
  // How the fish answer gifts (set below, with their behaviour): splash(x) and landed(x, y, r).
  const fishReact = {};
  window.tankGiftLanded = (x, y, r) => fishReact.landed?.(x, y, r);
  function bubble(x, y, size = random(2, 5), delay = 0) {
    const b = el("circle", { cx: 0, cy: 0, r: size, fill: "#fff", "fill-opacity": 0.2, stroke: "#fff", "stroke-opacity": 0.85, "stroke-width": 1 }, bubbles);
    const rise = (y - WATER) / random(55, 80); // seconds: small bubbles go up slower
    gsap.set(b, { x, y, opacity: 0 });
    gsap.timeline({ delay, onComplete: () => b.remove() })
      .to(b, { opacity: 1, duration: 0.2 })
      .to(b, { y: WATER + 2, duration: rise, ease: "sine.in" }, 0)
      .to(b, { keyframes: { x: [x, x + random(-6, 6), x + random(-6, 6), x] }, duration: rise, ease: "sine.inOut" }, 0)
      .to(b, { scale: 1.4, opacity: 0, duration: 0.25 }, rise - 0.1);
  }
  // A gift falling in: a ring spreading on the surface, a few drops thrown up, and bubbles where it went in.
  window.tankSplash = (x, radius = 14) => {
    if (still || document.hidden) return;
    const ring = el("ellipse", { cx: x, cy: WATER, rx: radius * 0.6, ry: 2.5, fill: "none", stroke: "#fff", "stroke-width": 2 }, surface);
    gsap.to(ring, { attr: { rx: radius * 2.6, ry: 6 }, opacity: 0, duration: 0.9, ease: "power2.out", onComplete: () => ring.remove() });
    for (let i = 0; i < 5; i++) {
      const drop = el("circle", { cx: 0, cy: 0, r: random(1.5, 3), fill: "#e9fbff" }, near);
      const dx = random(-1, 1) * radius * 1.4;
      gsap.set(drop, { x, y: WATER });
      gsap.timeline({ onComplete: () => drop.remove() })
        .to(drop, { x: x + dx, duration: 0.6, ease: "none" })
        .to(drop, { y: WATER - random(14, 30), duration: 0.28, ease: "power2.out" }, 0)
        .to(drop, { y: WATER + 4, opacity: 0, duration: 0.32, ease: "power2.in" }, 0.28);
    }
    for (let i = 0; i < 6; i++) bubble(x + random(-radius, radius), WATER + random(16, 40), random(1.5, 4), i * 0.05);
    fishReact.splash?.(x);
  };

  if (still) return;
  // ---------- Motion that keeps going ----------
  gsap.to(waves[0], { x: 30, duration: 2.4, ease: "none", repeat: -1 });
  gsap.to(waves[1], { x: -30, duration: 3.2, ease: "none", repeat: -1 });
  gsap.to(rays.children, { opacity: () => random(0.15, 0.5), duration: () => random(2, 3.5), ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.6 });
  // The two nets of light on the sand drift slowly, one each way.
  gsap.to(nets[0], { x: 60, duration: 9, ease: "none", repeat: -1 });
  gsap.to(nets[1], { x: -24, y: 10, duration: 5.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
  gsap.to(caustics, { opacity: 0.35, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
  [...backWeeds, ...frontWeeds].forEach((path, i) => {
    const box = path.getBBox();
    gsap.fromTo(path, { rotation: -4 }, { rotation: 4, svgOrigin: `${box.x + box.width / 2} ${box.y + box.height}`, duration: random(2.2, 3.4), ease: "sine.inOut", yoyo: true, repeat: -1, delay: -i * 0.7 });
  });
  // ---------- The fish's behaviour ----------
  // Left alone, each fish cruises from one half of the tank to the other at its own pace and depth, slows,
  // turns round and goes back. A gift splashing in close by startles it: it turns away quickly and darts off.
  // A gift coming to rest on the sand may bring one over to look: it swims up to it, nibbles at it a few
  // times and goes back to cruising. Whatever it is doing can be cut short by the next thing (stop()).
  // It turns the way a fish does: head first, the body and tail following round behind it (it turns about a
  // point near its head), gliding on a little and curving back; in the middle of the turn it is seen
  // head-on for a moment, so it never narrows to a line. Its tail beats faster the faster it goes, its side
  // fin paddles, and it tilts a little as it bobs.
  // It stays clear of the glass, nose and tail: FISH_TAIL is how far its tail reaches from its middle (the
  // goldfish's is the longest), and turning about its head swings the tail out a further 20; plus GLASS_GAP.
  const FISH_TAIL = 42, GLASS_GAP = 16;
  const SAND_TOP = H - SAND + 6;
  const swimmers = fishes.map(({ outer, bob, turn, front, tail, side, y, size }, i) => {
    const reach = (FISH_TAIL + 20) * size + GLASS_GAP;
    const f = { outer, turn, front, size, home: y, low: reach, high: W - reach, x: random(reach, W - reach), y, facing: Math.random() < 0.5 ? 1 : -1, busy: false, step: null, startled: 0 };
    gsap.set(outer, { x: f.x, y: f.y });
    gsap.set(turn, { scaleX: f.facing, transformOrigin: "85% 50%" });
    f.beat = gsap.fromTo(tail, { rotation: -14 }, { rotation: 14, transformOrigin: "100% 50%", duration: 0.22, ease: "sine.inOut", yoyo: true, repeat: -1 });
    gsap.fromTo(side, { rotation: -25 }, { rotation: 20, transformOrigin: "60% 0%", duration: 0.4, ease: "sine.inOut", yoyo: true, repeat: -1, delay: i * 0.13 });
    gsap.to(bob, { y: 5 + i * 2, rotation: () => random(-4, 4), duration: random(1.6, 2.4), ease: "sine.inOut", yoyo: true, repeat: -1 });
    return f;
  });
  const clampX = (f, x) => Math.min(f.high, Math.max(f.low, x));
  const clampY = (f, y) => Math.min(SAND_TOP - 12 * f.size, Math.max(WATER + 18, y));
  const beatAt = (f, speed) => gsap.to(f.beat, { timeScale: speed, duration: 0.3, overwrite: true });
  // Stops whatever the fish is doing, leaving it whole and facing the way it was.
  function stop(f) {
    f.step?.kill();
    f.step = null;
    gsap.killTweensOf([f.outer, f.turn, f.front]);
    f.x = gsap.getProperty(f.outer, "x");
    f.y = gsap.getProperty(f.outer, "y");
    gsap.set(f.turn, { scaleX: f.facing, opacity: 1 });
    gsap.set(f.front, { opacity: 0 });
  }
  // Turns round to face dir (1 right, -1 left), then calls done. A startled fish turns twice as fast.
  function turnTo(f, dir, done, quick = false) {
    if (dir === f.facing) return done();
    const ahead = f.facing, t = quick ? 0.5 : 1;
    // The point it turns about, near its head, is 10 in front of its middle whichever way it faces.
    gsap.set(f.front, { x: 10 * f.size, scale: 0.85 });
    f.step = gsap.timeline({ onComplete: () => { f.facing = dir; f.x = gsap.getProperty(f.outer, "x"); f.step = null; done(); } })
      .to(f.outer, { x: clampX(f, f.x + ahead * 6 * f.size), duration: 0.4 * t, ease: "sine.out" }, 0)
      .to(f.turn, { scaleX: ahead * 0.45, duration: 0.32 * t, ease: "sine.in" }, 0)
      .to(f.turn, { opacity: 0, duration: 0.14 * t, ease: "none" }, 0.2 * t)
      .to(f.front, { opacity: 1, scale: 1, duration: 0.16 * t, ease: "sine.out" }, 0.18 * t)
      .set(f.turn, { scaleX: dir * 0.45 }, 0.34 * t)
      .to(f.front, { opacity: 0, scale: 0.85, duration: 0.16 * t, ease: "sine.in" }, 0.5 * t)
      .to(f.turn, { opacity: 1, duration: 0.14 * t, ease: "none" }, 0.5 * t)
      .to(f.turn, { scaleX: dir, duration: 0.4 * t, ease: "sine.out" }, 0.52 * t)
      .to(f.outer, { x: clampX(f, f.x - ahead * 4 * f.size), duration: 0.5 * t, ease: "sine.inOut" }, 0.4 * t);
  }
  function moveTo(f, x, y, speed, ease, done) {
    x = clampX(f, x);
    y = clampY(f, y);
    const duration = Math.max(0.35, Math.hypot(x - f.x, y - f.y) / speed);
    f.step = gsap.to(f.outer, { x, y, duration, ease, onComplete: () => { f.x = x; f.y = y; f.step = null; done?.(); } });
  }
  function cruise(f) {
    f.busy = false;
    const dir = f.x > W / 2 ? -1 : 1;
    const target = dir > 0 ? random(W * 0.55, f.high) : random(f.low, W * 0.45);
    beatAt(f, 0.6);
    turnTo(f, dir, () => {
      beatAt(f, 1);
      moveTo(f, target, f.home + random(-14, 14), random(20, 34), "power1.inOut", () => {
        beatAt(f, 0.6);
        f.step = gsap.delayedCall(random(0.3, 1.2), () => cruise(f));
      });
    });
  }
  // A gift splashed in at x: fish near it in the tank dart away from where it will sink.
  fishReact.splash = x => {
    const now = performance.now();
    for (const f of swimmers) {
      if (Math.abs(f.x - x) > 95 || now - f.startled < 1500) continue;
      f.startled = now;
      stop(f);
      f.busy = true;
      const away = f.x < x ? -1 : 1;
      beatAt(f, 2.6);
      turnTo(f, away, () => moveTo(f, f.x + away * random(55, 85), f.y + random(-12, 16), 150, "power3.out", () => {
        beatAt(f, 0.8);
        f.step = gsap.delayedCall(random(0.6, 1.4), () => cruise(f));
      }), true);
    }
  };
  // A gift of radius r has come to rest at x, y: the nearest fish not busy comes to look at it, now and then.
  let lastVisit = 0;
  fishReact.landed = (x, y, r) => {
    const now = performance.now();
    const free = swimmers.filter(f => !f.busy);
    if (now - lastVisit < 4000 || !free.length) return;
    lastVisit = now;
    const f = free.reduce((a, b) => (Math.abs(a.x - x) <= Math.abs(b.x - x) ? a : b));
    stop(f);
    f.busy = true;
    const dir = x >= f.x ? 1 : -1;
    // Its nose is 18 in front of its middle facing right, and 2 facing left (it turns about its head).
    const at = dir > 0 ? x - r - 18 * f.size - 1 : x + r - 2 * f.size + 1;
    turnTo(f, dir, () => {
      beatAt(f, 0.9);
      moveTo(f, at, y - 2, 38, "sine.inOut", () => {
        beatAt(f, 0.45);
        // Three little pecks at the gift, a pause, and off it goes.
        f.step = gsap.timeline({ onComplete: () => { f.step = null; f.x = gsap.getProperty(f.outer, "x"); cruise(f); } })
          .to(f.outer, { x: `+=${dir * 4}`, duration: 0.13, ease: "power2.out", repeat: 5, yoyo: true, repeatDelay: 0.14 })
          .to({}, { duration: random(0.4, 0.9) });
      });
    });
  };
  swimmers.forEach(cruise);

  // A big gift: the chest's lid lifts, light pours out, gold coins and bubbles burst up and drift down, and
  // it shuts again. A bigger gift (tier 2) throws out more and stays open longer.
  let chestOpen = null;
  window.tankTreasure = tier => {
    if (document.hidden) return;
    chestOpen?.progress(1);
    const coins = tier > 1 ? 14 : 8, open = tier > 1 ? 2.2 : 1.4;
    chestOpen = gsap.timeline({ onComplete: () => { chestOpen = null; } })
      .to(lid, { y: -9, rotation: -10, scaleY: 0.55, transformOrigin: "50% 100%", duration: 0.35, ease: "back.out(2)" })
      .to(chestGlow, { opacity: 1, duration: 0.25 }, 0.1)
      .to(chestRays, { opacity: 0.85, duration: 0.3 }, 0.15)
      .add(() => {
        for (let i = 0; i < coins; i++) {
          const coin = el("ellipse", { cx: 0, cy: 0, rx: 3.6, ry: 3.6, fill: "url(#chestGold)", stroke: "#a87412", "stroke-width": 0.6 }, glass);
          const x = CHEST.x + random(-8, 8), up = random(40, 90), drift = random(-30, 30);
          gsap.set(coin, { x, y: CHEST.y - 22 });
          gsap.timeline({ onComplete: () => coin.remove() })
            .to(coin, { y: CHEST.y - 22 - up, x: x + drift * 0.6, duration: 0.6, ease: "power2.out" })
            .to(coin, { y: SAND_TOP - 2, x: x + drift, duration: random(1.6, 2.4), ease: "sine.in" })
            .to(coin, { attr: { rx: 0.6 }, duration: 0.18, ease: "sine.inOut", yoyo: true, repeat: 9 }, 0)
            .to(coin, { opacity: 0, duration: 0.4 }, "-=0.4");
        }
        for (let i = 0; i < 10; i++) bubble(CHEST.x + random(-12, 12), CHEST.y - 22, random(1.5, 4), i * 0.06);
      }, 0.2)
      .to([chestGlow, chestRays], { opacity: 0, duration: 0.5 }, open)
      .to(lid, { y: 0, rotation: 0, scaleY: 1, duration: 0.3, ease: "power2.in" }, open + 0.1)
      .add(() => bubble(CHEST.x + random(-6, 6), CHEST.y - 22, 3));
  };
  // A steady stream from the air stone, and now and then a bubble from the sand.
  const stream = gsap.delayedCall(0.3, function loop() {
    bubble(26 + random(-3, 3), H - 12, random(1.8, 4.2));
    if (Math.random() < 0.12) bubble(random(60, W - 40), H - SAND + 4, random(1.5, 3));
    stream.restart(true);
  });
})();

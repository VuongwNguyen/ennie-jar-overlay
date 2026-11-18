// The outside of the fish tank (tank.js draws the tank itself), over the same coordinates as the jar in
// overlay.html: seaweed draped over the lid and hanging down the glass, a string of pearls swagged across the
// front with a little scallop shell in the middle, and a conch, shells, starfish and pearls on the ends of its
// seashell stand. Light: sparkles along the glass's edge and a soft sea-blue glow behind the tank. Its name
// tag is a piece of driftwood (overlay.css, .jar-wrap.tank .heading).
(() => {
  if (window.JAR_THEME !== "tank") return;
  const NS = "http://www.w3.org/2000/svg";
  const wrap = document.getElementById("jarWrap");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const random = (a, b) => a + Math.random() * (b - a);
  const el = (name, attrs = {}, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent?.append(node);
    return node;
  };
  // Behind the tank (the glow) and in front of everything else, both over the jar's own coordinates.
  const behind = el("svg", { class: "jar-svg tank-decor-back", viewBox: "-14 -14 300 390", width: 300, height: 390, "aria-hidden": "true" });
  behind.style.zIndex = 0;
  wrap.prepend(behind);
  el("defs", {}, behind).innerHTML = `<radialGradient id="seaGlowBack"><stop offset="0" stop-color="#8fe3ff" stop-opacity=".5"/><stop offset=".6" stop-color="#7fd3f0" stop-opacity=".18"/><stop offset="1" stop-color="#7fd3f0" stop-opacity="0"/></radialGradient>`;
  const svg = el("svg", { class: "jar-svg front tank-decor", viewBox: "-14 -14 300 390", width: 300, height: 390, "aria-hidden": "true" });
  wrap.append(svg);
  el("defs", {}, svg).innerHTML = `
    <linearGradient id="seaKelp" x1="0" x2="1"><stop offset="0" stop-color="#3f9f5c"/><stop offset=".5" stop-color="#8fd67f"/><stop offset="1" stop-color="#3f9f5c"/></linearGradient>
    <radialGradient id="seaPearl" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#f6ecf2"/><stop offset="1" stop-color="#c9b3c0"/></radialGradient>
    <linearGradient id="seaConch" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff2e2"/><stop offset=".5" stop-color="#f8c9a8"/><stop offset="1" stop-color="#e0957a"/></linearGradient>
    <linearGradient id="seaScallop" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe6ee"/><stop offset="1" stop-color="#f29fbe"/></linearGradient>
    <linearGradient id="seaStar" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ffb36b"/><stop offset="1" stop-color="#f0743a"/></linearGradient>`;

  // ---------- A sea-blue glow behind the tank ----------
  const glow = el("ellipse", { cx: 136, cy: 180, rx: 195, ry: 225, fill: "url(#seaGlowBack)" }, behind);

  // ---------- Seaweed draped over the lid ----------
  // A strand of kelp: a ribbon that wavers as it hangs from (x, top), with leaves along it.
  const kelps = [];
  function kelp(x, top, length, lean, width = 6) {
    const group = el("g", {}, svg);
    const pts = [];
    for (let y = 0; y <= length; y += 6) pts.push([x + Math.sin(y * 0.09) * 4 + lean * (y / length), top + y]);
    const edge = side => pts.map(([px, py], i) => [px + side * width * (1 - (i / pts.length) * 0.6) * 0.5, py]);
    const outline = [...edge(-1), ...edge(1).reverse()];
    el("path", { d: `M${outline.map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(" L")} Z`, fill: "url(#seaKelp)", stroke: "#2f7f47", "stroke-width": 0.9, "stroke-linejoin": "round" }, group);
    for (let i = 3; i < pts.length - 1; i += 3) {
      const [px, py] = pts[i], side = i % 2 ? 1 : -1;
      el("ellipse", { cx: px + side * 6, cy: py + 2, rx: 3.2, ry: 8, fill: "#7fcf73", stroke: "#2f7f47", "stroke-width": 0.7, transform: `rotate(${side * 40} ${px + side * 6} ${py + 2})` }, group);
    }
    kelps.push({ group, x, top });
  }
  // Over the lid at the left, two strands down the glass by its edge; one at the right.
  kelp(-2, -14, 170, -10, 10);
  kelp(16, -12, 108, -12, 8);
  kelp(274, -12, 132, 8, 9);
  // A twist of kelp lying on the lid where the strands hang from.
  el("path", { d: "M-10 -14 C2 -20 18 -10 32 -16", fill: "none", stroke: "url(#seaKelp)", "stroke-width": 5, "stroke-linecap": "round" }, svg);
  el("path", { d: "M256 -15 C264 -19 276 -11 284 -15", fill: "none", stroke: "url(#seaKelp)", "stroke-width": 5, "stroke-linecap": "round" }, svg);

  // ---------- Shells ----------
  // A scallop shell standing on its hinge, ribs fanning up, at (x, y) its bottom.
  function scallop(parent, x, y, size) {
    const g = el("g", { transform: `translate(${x} ${y}) scale(${size})` }, parent);
    el("path", { d: "M-6 0 L-9 -5 L-3 -4 L0 -6 L3 -4 L9 -5 L6 0 Z", fill: "#f29fbe", stroke: "#d9648f", "stroke-width": 0.8, "stroke-linejoin": "round" }, g);
    el("path", { d: "M0 -3 C-14 -6 -20 -18 -16 -26 C-10 -32 10 -32 16 -26 C20 -18 14 -6 0 -3 Z", fill: "url(#seaScallop)", stroke: "#d9648f", "stroke-width": 1, "stroke-linejoin": "round" }, g);
    for (const a of [-52, -32, -12, 8, 28, 48]) {
      const r = (a * Math.PI) / 180;
      el("path", { d: `M0 -4 L${(Math.sin(r) * 18).toFixed(1)} ${(-4 - Math.cos(r) * 24).toFixed(1)}`, stroke: "#e7799f", "stroke-width": 1, "stroke-opacity": 0.7 }, g);
    }
    el("path", { d: "M-12 -24 C-6 -29 6 -29 12 -24", fill: "none", stroke: "#fff", "stroke-width": 1.2, "stroke-opacity": 0.7 }, g);
    return g;
  }
  // A conch lying on its side, spire to the left, at (x, y) its bottom.
  function conch(parent, x, y, size) {
    const g = el("g", { transform: `translate(${x} ${y}) scale(${size})` }, parent);
    el("path", { d: "M-20 -8 L-10 -14 C0 -20 14 -20 20 -12 C24 -6 20 0 10 0 L-8 0 C-14 -2 -18 -4 -20 -8 Z", fill: "url(#seaConch)", stroke: "#c97a5f", "stroke-width": 1, "stroke-linejoin": "round" }, g);
    for (const [cx, w] of [[-14, 5], [-8, 6], [-1, 7]]) el("path", { d: `M${cx} -13 q${w / 2} 5 0 11`, fill: "none", stroke: "#c97a5f", "stroke-width": 0.9, "stroke-opacity": 0.7 }, g);
    el("path", { d: "M6 -3 C10 -12 18 -13 20 -8 C18 -3 12 -1 6 -3 Z", fill: "#ffb3c7", stroke: "#e07a97", "stroke-width": 0.8 }, g);
    for (const cx of [-6, 2, 10]) el("path", { d: `M${cx} -17 l2 -4 l2 4`, fill: "#f8d7bd", stroke: "#c97a5f", "stroke-width": 0.7 }, g);
    el("path", { d: "M-12 -11 C-4 -16 6 -17 14 -14", fill: "none", stroke: "#fff", "stroke-width": 1.1, "stroke-opacity": 0.6 }, g);
    return g;
  }
  function starfish(parent, x, y, size, angle) {
    const g = el("g", { transform: `translate(${x} ${y}) rotate(${angle}) scale(${size})` }, parent);
    el("path", { d: "M0 -13 C2 -6 4 -5 12 -4 C6 1 5 3 8 11 C2 7 -2 7 -8 11 C-5 3 -6 1 -12 -4 C-4 -5 -2 -6 0 -13 Z", fill: "url(#seaStar)", stroke: "#d0582a", "stroke-width": 1, "stroke-linejoin": "round" }, g);
    for (const [cx, cy] of [[0, -6], [5, -2], [-5, -2], [3, 4], [-3, 4], [0, 0]]) el("circle", { cx, cy, r: 0.9, fill: "#ffe1c4" }, g);
    return g;
  }
  const pearl = (parent, x, y, r = 4) => el("circle", { cx: x, cy: y - r, r, fill: "url(#seaPearl)", stroke: "#d8c6d0", "stroke-width": 0.5 }, parent);

  // ---------- A string of pearls across the front ----------
  const strand = el("g", {}, svg);
  const swag = el("path", { d: "M8 2 Q136 58 264 2", fill: "none" }, strand);
  const length = swag.getTotalLength();
  for (let at = 0; at <= length; at += 8.5) {
    const { x, y } = swag.getPointAtLength(at);
    el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.4, fill: "url(#seaPearl)", stroke: "#d8c6d0", "stroke-width": 0.4 }, strand);
  }
  // A little scallop shell hanging from its middle.
  const charm = el("g", { transform: "translate(136 31)" }, strand);
  el("path", { d: "M0 0 V5", stroke: "#d8c6d0", "stroke-width": 1 }, charm);
  scallop(charm, 0, 18, 0.62);

  // ---------- On the ends of the seashell stand, either side of the glass ----------
  const foot = el("g", {}, svg);
  starfish(foot, -26, 358, 1, -24);
  conch(foot, -12, 352, 1.35);
  scallop(foot, 8, 350, 0.95);
  pearl(foot, 24, 351, 4.4);
  pearl(foot, 33, 352, 3.4);
  pearl(foot, 270, 352, 4);
  starfish(foot, 286, 352, 1.1, 20);
  scallop(foot, 298, 358, 0.7);

  // ---------- Motion ----------
  if (still) return;
  gsap.to(glow, { opacity: 0.6, duration: 3, ease: "sine.inOut", yoyo: true, repeat: -1 });
  // The kelp sways from where it hangs on the lid; the pearls swing a little.
  kelps.forEach(({ group, x, top }, i) => {
    gsap.fromTo(group, { rotation: -3 }, { rotation: 3, svgOrigin: `${x} ${top}`, duration: random(2.4, 3.4), ease: "sine.inOut", yoyo: true, repeat: -1, delay: -i * 0.9 });
  });
  gsap.fromTo(strand, { rotation: -1.2 }, { rotation: 1.2, svgOrigin: "136 2", duration: 2.8, ease: "sine.inOut", yoyo: true, repeat: -1 });
  gsap.fromTo(charm, { rotation: -10 }, { rotation: 10, svgOrigin: "136 31", duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
  // Sparkles twinkling at random points along the glass's edge.
  const edge = document.getElementById("tankEdge");
  const STAR = "M0 -6 C0.6 -1.5 1.5 -0.6 6 0 C1.5 0.6 0.6 1.5 0 6 C-0.6 1.5 -1.5 0.6 -6 0 C-1.5 -0.6 -0.6 -1.5 0 -6 Z";
  const sparkleLoop = gsap.delayedCall(0.4, () => {
    if (edge && !document.hidden) {
      const { x, y } = edge.getPointAtLength(random(0, edge.getTotalLength()));
      const star = el("path", { d: STAR, fill: Math.random() < 0.5 ? "#fff" : "#dff7ff" }, svg);
      gsap.set(star, { x, y, scale: 0, rotation: random(0, 45) });
      gsap.timeline({ onComplete: () => star.remove() })
        .to(star, { scale: random(0.7, 1.3), duration: 0.35, ease: "sine.out" })
        .to(star, { rotation: "+=45", duration: 0.9, ease: "none" }, 0)
        .to(star, { scale: 0, duration: 0.5, ease: "sine.in" }, 0.45);
    }
    sparkleLoop.restart(true);
  });
})();

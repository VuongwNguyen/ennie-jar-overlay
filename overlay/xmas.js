// Christmas on the jar page (overlay.html), only when the season is on (season.js). It adds to the usual
// drawing rather than changing it, so turning the season off brings the usual look back untouched:
// - the glass jar becomes a snow globe: snow lying at the bottom inside and snow drifting down in it, which
//   swirls up when a gift lands, as when a snow globe is shaken;
// - its wooden stand gets a cap of snow and a gold "Merry Christmas" plaque; little pine trees, presents and
//   candy canes stand on it, and pine garlands with baubles climb the walls in place of the flowering vines;
// - the bow gets a jingle bell, the name tag a sprig of holly, Ennie's sticker on the rim a Santa hat;
// - the fish tank gets a snowy red lid, a string of Christmas lights, a pine tree and presents on its stand;
// - snow falls all round, within the jar's frame.
// The colours of the ribbon, bow, lights, sparkles and the rest are in xmas.css, overlay.js and jardecor.js.
(() => {
  if (!window.XMAS) return;
  const NS = "http://www.w3.org/2000/svg";
  const wrap = document.getElementById("jarWrap");
  const TANK = window.JAR_THEME === "tank";
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const random = (a, b) => a + Math.random() * (b - a);
  const el = (name, attrs = {}, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent?.append(node);
    return node;
  };
  const W = 272, H = 356;
  const [back, front] = [...wrap.querySelectorAll(":scope > .jar-svg:not(.jar-decor):not(.tank-decor):not(.tank-decor-back)")];

  // Shared paints, in their own little svg so every layer can use them.
  const paints = el("svg", { width: 0, height: 0, "aria-hidden": "true", style: "position:absolute" });
  wrap.prepend(paints);
  el("defs", {}, paints).innerHTML = `
    <linearGradient id="xGold" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#f2c94c"/><stop offset="1" stop-color="#b8860b"/></linearGradient>
    <linearGradient id="xPine" x1="0" x2="1"><stop offset="0" stop-color="#1f6b3e"/><stop offset=".5" stop-color="#3a9a5c"/><stop offset="1" stop-color="#1f6b3e"/></linearGradient>
    <linearGradient id="xSnow" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9ecfa"/></linearGradient>
    <linearGradient id="xRed" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff5a64"/><stop offset=".6" stop-color="#d21f2e"/><stop offset="1" stop-color="#9c0f1b"/></linearGradient>
    <radialGradient id="xBauble" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="#fff" stop-opacity="0"/></radialGradient>`;

  // ---------- Small Christmas things, each standing on (x, y) ----------
  function pineTree(parent, x, y, size = 1) {
    const g = el("g", { transform: `translate(${x} ${y}) scale(${size})` }, parent);
    el("rect", { x: -3, y: -7, width: 6, height: 7, fill: "#7a4a22" }, g);
    for (const [top, half, low] of [[-46, 9, -30], [-36, 13, -18], [-25, 17, -6]]) {
      el("path", { d: `M0 ${top} L${half} ${low} Q0 ${low + 3} ${-half} ${low} Z`, fill: "url(#xPine)", stroke: "#164d2c", "stroke-width": 1, "stroke-linejoin": "round" }, g);
      // Snow along each tier's edge.
      el("path", { d: `M${-half + 2} ${low - 1} Q0 ${low + 2} ${half - 2} ${low - 1}`, fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round", opacity: 0.9 }, g);
    }
    for (const [cx, cy, c] of [[-5, -22, "#d8323f"], [6, -14, "#f2c94c"], [-9, -10, "#f2c94c"], [3, -31, "#d8323f"], [10, -9, "#d8323f"]]) {
      el("circle", { cx, cy, r: 2, fill: c, stroke: "#fff", "stroke-width": 0.5 }, g);
    }
    el("path", { d: "M0 -54 L1.8 -49.5 L6.5 -49.5 L2.7 -46.6 L4.1 -42 L0 -44.8 L-4.1 -42 L-2.7 -46.6 L-6.5 -49.5 L-1.8 -49.5 Z", fill: "url(#xGold)", stroke: "#8a5a12", "stroke-width": 0.6 }, g);
    return g;
  }
  function present(parent, x, y, w, h, box, ribbon, angle = 0) {
    const g = el("g", { transform: `translate(${x} ${y}) rotate(${angle})` }, parent);
    el("rect", { x: -w / 2, y: -h, width: w, height: h, rx: 1.5, fill: box, stroke: "#00000033", "stroke-width": 0.8 }, g);
    el("rect", { x: -w / 2 - 1, y: -h - 3, width: w + 2, height: 5, rx: 1.5, fill: box, stroke: "#00000033", "stroke-width": 0.8 }, g);
    el("rect", { x: -2, y: -h - 3, width: 4, height: h + 3, fill: ribbon }, g);
    el("path", { d: `M0 ${-h - 3} C-8 ${-h - 12} -11 ${-h - 4} 0 ${-h - 3} C11 ${-h - 4} 8 ${-h - 12} 0 ${-h - 3}Z`, fill: ribbon, stroke: "#00000033", "stroke-width": 0.6 }, g);
    return g;
  }
  function candyCane(parent, x, y, size = 1, angle = 0) {
    const g = el("g", { transform: `translate(${x} ${y}) rotate(${angle}) scale(${size})` }, parent);
    const d = "M0 0 V-26 C0 -34 10 -34 10 -26 V-23";
    el("path", { d, fill: "none", stroke: "#fff", "stroke-width": 5, "stroke-linecap": "round" }, g);
    el("path", { d, fill: "none", stroke: "#d8323f", "stroke-width": 5, "stroke-linecap": "butt", "stroke-dasharray": "3.5 3.5" }, g);
    return g;
  }
  function jingleBell(parent, x, y, size = 1) {
    const g = el("g", { transform: `translate(${x} ${y}) scale(${size})` }, parent);
    el("path", { d: "M-5.5 9 C-5.5 2 -3.5 -0.5 0 -0.5 C3.5 -0.5 5.5 2 5.5 9 Z", fill: "url(#xGold)", stroke: "#8a5a12", "stroke-width": 0.8 }, g);
    el("rect", { x: -6.5, y: 8, width: 13, height: 2.2, rx: 1, fill: "#d9a92a", stroke: "#8a5a12", "stroke-width": 0.5 }, g);
    el("circle", { cy: 11.5, r: 1.7, fill: "#8a5a12" }, g);
    el("circle", { cx: -1.8, cy: 3, r: 1.2, fill: "#fff", opacity: 0.8 }, g);
    return g;
  }

  // ---------- The snow globe (the glass jar only) ----------
  let globeSnow = [];
  if (!TANK && back && front) {
    // Snow lying at the bottom, inside the glass, behind the gifts.
    const lying = el("g", { "clip-path": "url(#jarClip)" }, back);
    el("path", { d: `M-4 ${H + 4} V${H - 22} C30 ${H - 34} 70 ${H - 18} 110 ${H - 26} C150 ${H - 34} 196 ${H - 16} 236 ${H - 28} C252 ${H - 32} 266 ${H - 26} ${W + 4} ${H - 24} V${H + 4} Z`, fill: "url(#xSnow)" }, lying);
    el("path", { d: `M10 ${H - 26} C40 ${H - 34} 70 ${H - 22} 104 ${H - 28}`, fill: "none", stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round", opacity: 0.9 }, lying);
    // Snow drifting down inside the glass, in front of the gifts but faint, so they stay easy to see.
    const falling = el("g", { "clip-path": "url(#jarClip)", opacity: 0.85 }, front);
    front.querySelector("#bodyEdgeHalo")?.before(falling);
    for (let i = 0; i < (still ? 18 : 34); i++) {
      const r = random(1.2, 2.8);
      const flake = el("circle", { r, fill: "#fff", opacity: random(0.55, 0.95) }, falling);
      globeSnow.push(flake);
      gsap.set(flake, { x: random(4, W - 4), y: random(0, H) });
    }
  }
  function settleFlake(flake, from) {
    if (still) return;
    const y0 = from ?? -10;
    const duration = random(7, 13) * ((H - y0) / H);
    gsap.set(flake, { y: y0 });
    gsap.to(flake, { y: H - random(14, 28), duration, ease: "none", onComplete: () => { gsap.set(flake, { x: random(4, W - 4) }); settleFlake(flake); } });
    gsap.to(flake, { x: `+=${random(-14, 14)}`, duration: random(2, 3.5), ease: "sine.inOut", yoyo: true, repeat: Math.ceil(duration / 2) });
  }
  globeSnow.forEach(flake => settleFlake(flake, gsap.getProperty(flake, "y")));
  // A gift landing shakes the globe: the snow whirls up from the bottom and drifts down again.
  function swirlGlobe(tier) {
    if (still || !globeSnow.length) return;
    for (const flake of globeSnow) {
      gsap.killTweensOf(flake);
      const up = random(60, 160 + tier * 60);
      gsap.to(flake, {
        x: Math.max(4, Math.min(W - 4, gsap.getProperty(flake, "x") + random(-60, 60))),
        y: Math.max(4, gsap.getProperty(flake, "y") - up), duration: random(0.5, 0.9), ease: "power2.out",
        onComplete: () => settleFlake(flake, gsap.getProperty(flake, "y"))
      });
    }
  }

  // ---------- Outside the glass, in front: the stand, greenery, a bell on the bow ----------
  const decor = el("svg", { class: "jar-svg front xmas-decor", viewBox: "-14 -14 300 390", width: 300, height: 390, "aria-hidden": "true" });
  decor.style.zIndex = 9;
  wrap.append(decor);

  if (!TANK) {
    // Snow on the wooden stand, dripping over its edge, and a gold plaque on its front.
    el("path", {
      d: "M-12 357 C-13 347 2 347 14 349 C40 343 66 350 96 346 C126 342 156 350 186 346 C216 342 246 350 268 346 C280 345 285 350 284 357 C280 360 276 359 274 364 C272 368 268 368 266 362 C250 360 200 362 160 360 C140 359 132 366 128 366 C124 366 122 360 116 360 C80 361 40 359 20 361 C14 362 12 368 8 368 C4 368 4 362 0 361 C-6 360 -11 361 -12 357Z",
      fill: "url(#xSnow)", stroke: "#cfe3f3", "stroke-width": 0.8
    }, decor);
    const plaque = el("g", { transform: "translate(136 369)" }, decor);
    el("rect", { x: -46, y: -6.5, width: 92, height: 13, rx: 6.5, fill: "url(#xRed)", stroke: "url(#xGold)", "stroke-width": 1.6 }, plaque);
    const words = el("text", { y: 3.2, "text-anchor": "middle", fill: "#ffe9a8", "font-size": 9, "font-family": "Pacifico, 'Segoe Script', cursive" }, plaque);
    words.textContent = "Merry Christmas";

    // Pine garlands up both walls, where the vines were (jardecor.js), with baubles and little stars.
    const garland = (wall, inward, fromY, toY) => {
      const widthOf = y => wall + inward * (6 + Math.sin(y * 0.052) * 5);
      const g = el("g", {}, decor);
      let turn = 0;
      for (let y = fromY; y >= toY; y -= 5, turn++) {
        const x = widthOf(y);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + turn * 0.6, len = random(6, 9);
          el("path", { d: `M${x.toFixed(1)} ${y} l${(Math.cos(a) * len).toFixed(1)} ${(Math.sin(a) * len * 0.8).toFixed(1)}`, stroke: k % 2 ? "#2f8a50" : "#1d6a3a", "stroke-width": 2.2, "stroke-linecap": "round" }, g);
        }
      }
      const COLOURS = ["#d8323f", "url(#xGold)", "#d8323f", "#3a7bd5"];
      for (let y = fromY - 12, i = 0; y > toY + 4; y -= 26, i++) {
        const x = widthOf(y) + (i % 2 ? 4 : -4) * inward;
        el("circle", { cx: x, cy: y, r: 4.6, fill: COLOURS[i % COLOURS.length], stroke: "#fff", "stroke-width": 0.8 }, g);
        el("circle", { cx: x, cy: y, r: 4.6, fill: "url(#xBauble)" }, g);
      }
      return g;
    };
    garland(6, 1, 296, 84);
    garland(266, -1, 346, 84);

    // On the stand, at either end: pine trees, presents and candy canes.
    pineTree(decor, -2, 352, 0.95);
    present(decor, 22, 352, 18, 14, "#2f8a50", "#f2c94c", -6);
    candyCane(decor, 40, 352, 0.9, 8);
    present(decor, 222, 352, 16, 12, "#d8323f", "#f2c94c", 5);
    candyCane(decor, 236, 352, 0.85, -10);
    present(decor, 252, 352, 20, 16, "#f2c94c", "#d8323f", -4);
    pineTree(decor, 276, 352, 1.05);
  }

  // A jingle bell hanging from the big bow's knot (overlay.html: the bow at translate(212 22)).
  const bow = [...(front?.children ?? [])].find(node => node.getAttribute?.("transform")?.startsWith("translate(212 22)"));
  let bowBell = null;
  if (bow) {
    el("path", { d: "M136 34 V43", stroke: "#f2c94c", "stroke-width": 1 }, bow);
    bowBell = jingleBell(bow, 136, 43, 1);
  }

  // A sprig of holly on the name tag's corner.
  const heading = wrap.querySelector(".heading");
  if (heading) {
    heading.insertAdjacentHTML("afterbegin", `<svg class="heading-holly" viewBox="-17 -14 34 28" aria-hidden="true">
      <path d="M-1 2 C-6 -3 -9 -1 -15 -6 C-12 -6 -12 -9 -14 -11 C-9 -9 -6 -11 -4 -8 C-4 -5 -2 -3 -1 2Z" fill="#2f7d4f" stroke="#1d5a36" stroke-width="1"/>
      <path d="M1 2 C6 -2 10 1 16 -3 C13 -4 14 -7 12 -9 C7 -7 5 -9 3 -6 C3 -3 1 -2 1 2Z" fill="#3c9a62" stroke="#1d5a36" stroke-width="1"/>
      <circle cx="-3" cy="4" r="3.6" fill="#d8323f" stroke="#7e0d16" stroke-width=".8"/><circle cx="3.5" cy="4.5" r="3.6" fill="#e8424e" stroke="#7e0d16" stroke-width=".8"/>
      <circle cx="0" cy="-.5" r="3.6" fill="#c4202e" stroke="#7e0d16" stroke-width=".8"/><circle cx="-1" cy="-1.6" r="1" fill="#fff" opacity=".8"/></svg>`);
  }

  // ---------- The fish tank at Christmas ----------
  const tankBulbs = [];
  if (TANK) {
    // The lid in red with snow on it (tank.js paints it from #tankLid).
    const lid = document.getElementById("tankLid");
    if (lid) lid.innerHTML = `<stop offset="0" stop-color="#ff6a72"/><stop offset="1" stop-color="#b5141f"/>`;
    el("path", { d: "M-10 -12 C-10 -20 4 -19 14 -18 C40 -22 70 -16 100 -19 C130 -22 160 -16 190 -19 C220 -22 250 -16 270 -19 C280 -20 284 -16 282 -12 C276 -9 272 -12 268 -8 C266 -4 262 -5 262 -9 C230 -11 170 -9 136 -10 C130 -10 128 -4 124 -4 C120 -4 120 -10 114 -10 C70 -11 30 -10 12 -10 C8 -10 6 -5 2 -5 C-2 -5 -2 -10 -10 -12Z", fill: "url(#xSnow)", stroke: "#cfe3f3", "stroke-width": 0.8 }, decor);
    // A string of Christmas lights across the front, in place of the pearls (tankdecor.js).
    const wire = el("path", { d: "M8 2 Q136 58 264 2", fill: "none", stroke: "#1d5a36", "stroke-width": 1.6 }, decor);
    const length = wire.getTotalLength();
    const BULBS = ["#ff3b47", "#ffd76a", "#3fd17a", "#6fc3ff"];
    for (let at = 10, i = 0; at < length - 6; at += 19, i++) {
      const { x, y } = wire.getPointAtLength(at);
      const bulb = el("g", { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, decor);
      el("rect", { x: -2, y: -2, width: 4, height: 4, rx: 1, fill: "#1d5a36" }, bulb);
      el("ellipse", { cy: 6, rx: 3.8, ry: 5.4, fill: BULBS[i % BULBS.length], stroke: "#fff", "stroke-width": 0.6 }, bulb);
      tankBulbs.push(bulb);
    }
    jingleBell(decor, 136, 30, 1.2);
    // On the seashell stand: a pine tree and presents on each end.
    pineTree(decor, -18, 356, 0.9);
    present(decor, 4, 354, 15, 12, "#d8323f", "#f2c94c", -6);
    present(decor, 268, 354, 16, 13, "#2f8a50", "#f2c94c", 6);
    pineTree(decor, 292, 358, 0.8);
  }
  if (!still) {
    tankBulbs.forEach((bulb, i) => gsap.to(bulb, { opacity: 0.45, duration: 0.75, ease: "steps(1)", yoyo: true, repeat: -1, delay: (i % 2) * 0.75 }));
  }

  // ---------- Santa's hat on Ennie's sticker on the rim (dogmain.js places the sticker) ----------
  // Measured on models/ennie.png (384 x 256): the top of her head is about here.
  const HAT = { x: 0.305, y: -0.13, w: 0.43 };
  const hat = document.createElementNS(NS, "svg");
  hat.setAttribute("class", "santa-hat");
  hat.setAttribute("viewBox", "0 0 120 96");
  hat.setAttribute("aria-hidden", "true");
  hat.innerHTML = `
    <defs><linearGradient id="hatRed" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff5a64"/><stop offset=".6" stop-color="#d21f2e"/><stop offset="1" stop-color="#8e0e18"/></linearGradient></defs>
    <path d="M14 74 C18 40 40 14 70 10 C88 8 104 18 112 36 C104 30 94 30 88 34 C96 46 98 60 100 74 Z" fill="url(#hatRed)"/>
    <path d="M40 30 C52 20 64 16 76 16" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-linecap="round"/>
    <rect x="6" y="66" width="104" height="22" rx="11" fill="#fff"/>
    <path d="M12 72 Q58 66 104 72" fill="none" stroke="#e6eef5" stroke-width="3"/>
    <circle cx="110" cy="42" r="11" fill="#fff"/><circle cx="107" cy="39" r="4" fill="#fff" stroke="#e6eef5" stroke-width="1.5"/>`;
  window.placeStickerHat = sticker => {
    if (!sticker.isConnected || !sticker.style.width) return;
    if (!hat.isConnected) document.body.append(hat);
    const w = parseFloat(sticker.style.width), h = parseFloat(sticker.style.height);
    hat.style.width = `${w * HAT.w}px`;
    hat.style.height = `${w * HAT.w * 0.8}px`;
    hat.style.left = `${parseFloat(sticker.style.left) + w * HAT.x}px`;
    hat.style.top = `${parseFloat(sticker.style.top) + h * HAT.y}px`;
  };
  const sticker = document.querySelector(".ennie-sticker");
  if (sticker) window.placeStickerHat(sticker);

  // ---------- Snow falling all round, within the jar's frame ----------
  function snowArea() {
    const box = wrap.getBoundingClientRect();
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
    const frame = window.jarFrame?.() ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    return {
      left: Math.max((frame.left - box.left) / s, -250),
      right: Math.min((frame.right - box.left) / s, 335),
      top: Math.max((frame.top - box.top) / s, -120),
      bottom: Math.min((frame.bottom - box.top) / s, 420)
    };
  }
  function fall(flake, fromTop) {
    const { left, right, top, bottom } = snowArea();
    const x = random(left, right), y = fromTop ? top - 10 : random(top, bottom);
    const duration = random(6, 11) * ((bottom - y) / Math.max(1, bottom - top));
    gsap.set(flake, { x, y, opacity: random(0.6, 1), scale: random(0.5, 1.1) });
    gsap.to(flake, { y: bottom + 10, duration, ease: "none", onComplete: () => fall(flake, true) });
    gsap.to(flake, { x: x + random(-30, 30), rotation: random(-90, 90), duration: random(2.5, 4), ease: "sine.inOut", yoyo: true, repeat: Math.ceil(duration / 2.5) });
  }
  if (!still) {
    for (let i = 0; i < 28; i++) {
      const flake = document.createElement("span");
      flake.className = i % 5 === 0 ? "snowflake star" : "snowflake";
      if (i % 5 === 0) flake.textContent = "❄";
      wrap.append(flake);
      fall(flake, false);
    }
  }

  // ---------- When a gift lands ----------
  const usual = window.jarDecorGift;
  window.jarDecorGift = (tier = 0) => {
    usual?.(tier);
    swirlGlobe(tier);
    if (bowBell && !still) gsap.fromTo(bowBell, { rotation: -28 }, { rotation: 0, svgOrigin: "136 43", duration: 1.2, ease: "elastic.out(1.2, .25)" });
  };
})();

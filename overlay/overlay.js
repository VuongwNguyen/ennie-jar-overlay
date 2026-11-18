const socket = io();
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Inner size of the glass body (px). The outline below drives both the drawing and the physics.
const JAR = { w: 272, h: 356, corner: 80, neck: 112, belly: 134 };
const CX = JAR.w / 2;
// What holds the gifts: "jar", the glass jar, or "tank", a fish tank of the same size (tank.js draws it, and
// tankdecor.js dresses its outside).
// Chosen on the control page (data/effects.json, jarStyle), or ?theme=tank / ?theme=jar in the address.
// It is read before anything is drawn, since the outline drives both the drawing and the physics: one quick
// request to this same server, waited for, so the page never starts with the wrong shape.
const THEME = (() => {
  const asked = new URLSearchParams(location.search).get("theme");
  const STYLES = ["jar", "tank"];
  if (asked) return STYLES.includes(asked) ? asked : "jar";
  try {
    const request = new XMLHttpRequest();
    request.open("GET", "/api/effects", false);
    request.send();
    const style = JSON.parse(request.responseText)?.jarStyle;
    return STYLES.includes(style) ? style : "jar";
  } catch {
    return "jar";
  }
})();
const TANK = THEME === "tank";
window.JAR_THEME = THEME;
// The tank: straight glass walls, rounded at the bottom only, and water up to WATER_Y (in the jar's units).
const TANK_CORNER = 18;
const WATER_Y = 46;
// The top of the tank's sand (tank.js draws it from here down): gifts come to rest on it, not inside it.
const SAND_TOP = JAR.h - 28;
// The floor for gifts that spill out of the jar ("Sàn" on the layout page) is switched off for now: they land
// level with the jar's base, as before. Set to true to use the floor set on the layout page again.
const FLOOR_ON = false;
const MOUTH = { x: 155, y: 40 }; // where gifts enter, in .jar-wrap coordinates
const BIG_GIFT = 100;
const MEGA_GIFT = 1000;

let engine, runner;
// How thick the glass is to the gifts, as the radius of the circles it is made of (see startPhysics): thin, so
// gifts outside the jar lie close against it.
const GLASS = 3;
let frameBodies = [];
const particles = new Map();

// The scene is scaled to fit the source, whatever its size. On a 1080x1920 source the jar takes
// about 45% of the width; add ?size=1.2 to the URL to make it larger or smaller.
const DESIGN = { w: 675, h: 660 };
const SIZE = Number(new URLSearchParams(location.search).get("size")) || 1;
let scale = 1;
// On live.html this page covers the whole screen, so the big gift effect (bigburst.js) can use all of it,
// and the jar is drawn in its box there (x, y, w, h), with the gifts' ceiling above it (top). The visible
// frame is that box reaching up to the ceiling: anything outside it is cut off, as if the page were only
// that big. On its own (overlay.html) the box and the frame are the whole page.
let jarBox = null;
{
  // live.html gives the box in the address at first (?box=x,y,w,h,top,floor), then by message when it changes.
  // floor: where gifts that spill out of the jar land (the layout page's "Sàn"); without it, the jar's base.
  // wallLeft, wallRight: how far to either side they can roll ("Vách"); without them, the box's sides.
  const [x, y, w, h, top, floor, wallLeft, wallRight] = (new URLSearchParams(location.search).get("box") ?? "").split(",").map(Number);
  if ([x, y, w, h, top].every(Number.isFinite) && w > 0 && h > 0) {
    jarBox = { x, y, w, h, top, floor: FLOOR_ON && Number.isFinite(floor) ? floor : null, walls: [wallLeft, wallRight].every(Number.isFinite) ? [wallLeft, wallRight] : null };
  }
}
// The walls spilled gifts stop at, in page pixels: the layout's, or the sides of the box (or of the page).
// A wall is never closer to the jar than CLEAR (in the jar's own units) outside its glass: a wall set across the
// jar, or just beside it, would leave falling gifts nowhere to go but onto its shoulder, where they stack up into
// a column as if the jar were bigger than it looks.
const CLEAR = 34;
function jarWalls() {
  let [left, right] = Array.isArray(jarBox?.walls) && jarBox.walls.every(Number.isFinite)
    ? jarBox.walls
    : jarBox ? [jarBox.x, jarBox.x + jarBox.w] : [0, innerWidth];
  const layer = document.getElementById("giftLayer")?.getBoundingClientRect();
  if (layer && layer.width) {
    const glass = 2 * GLASS;
    left = Math.min(left, layer.left + (-glass - CLEAR) * scale);
    right = Math.max(right, layer.left + (JAR.w + glass + CLEAR) * scale);
  }
  return [left, right];
}
// The frame reaches down to the floor when it is below the box, so gifts lying there are not cut off.
function jarFrame() {
  if (!jarBox) return { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const bottom = Math.max(jarBox.y + jarBox.h, Number.isFinite(jarBox.floor) ? jarBox.floor + 4 : -Infinity);
  // Walls outside the box widen the frame to them, so gifts rolling that far stay in sight.
  const [wallLeft, wallRight] = jarWalls();
  return { left: Math.min(jarBox.x, wallLeft), top: Math.min(jarBox.top, jarBox.y), right: Math.max(jarBox.x + jarBox.w, wallRight), bottom };
}
window.jarFrame = jarFrame;
function fitScene() {
  const box = jarBox ?? { x: 0, y: 0, w: innerWidth, h: innerHeight };
  scale = Math.min(box.w / DESIGN.w, Math.max(1, box.h) / DESIGN.h) * SIZE;
  const root = document.documentElement.style, frame = jarFrame();
  root.setProperty("--scale", scale);
  root.setProperty("--box-x", `${box.x}px`);
  root.setProperty("--box-y", `${box.y}px`);
  root.setProperty("--box-w", `${box.w}px`);
  root.setProperty("--box-h", `${box.h}px`);
  root.setProperty("--clip", `${frame.top}px ${innerWidth - frame.right}px ${innerHeight - frame.bottom}px ${frame.left}px`);
}
addEventListener("message", event => {
  if (event.origin !== location.origin || event.data?.type !== "box") return;
  const { x, y, w, h, top, floor, walls } = event.data;
  if (![x, y, w, h, top].every(Number.isFinite)) return;
  jarBox = { x, y, w: Math.max(1, w), h: Math.max(1, h), top, floor: FLOOR_ON && Number.isFinite(floor) ? floor : null, walls: Array.isArray(walls) && walls.every(Number.isFinite) ? walls : null };
  dispatchEvent(new Event("resize")); // refits the scene, the physics frame, the sticker and the rest
});

// The floor that gifts spilling out of the jar land on, and a wall on either side, so they stay on screen and pile
// up beside the jar. The floor is the layout page's "Sàn" (live.html), or the jar's base; the walls its "Vách",
// or the sides of the jar's box.
// It is only outside the jar: inside, the jar's own base holds the gifts. A floor below the jar's base gets a
// block under the jar too, so nothing slips beneath it.
let groundLevel = JAR.h; // the floor, in physics units (the jar's base is JAR.h)
function buildFrame() {
  if (!engine) return;
  const { Bodies, Composite } = Matter;
  Composite.remove(engine.world, frameBodies);
  const r = $("giftLayer").getBoundingClientRect();
  // Screen pixels to physics units, which are the scene's unscaled pixels.
  const [wallLeft, wallRight] = jarWalls();
  const left = (wallLeft - r.left) / scale, right = (wallRight - r.left) / scale;
  groundLevel = Number.isFinite(jarBox?.floor) ? (jarBox.floor - r.top) / scale : JAR.h;
  const t = 60, tall = 4000, g = groundLevel, edge = 2 * GLASS; // edge: room for the glass outside the jar's outline
  const floorPiece = (from, to) => Bodies.rectangle((from + to) / 2, g + t / 2, Math.max(1, to - from), t, { isStatic: true });
  frameBodies = [
    floorPiece(left - t, -edge),
    floorPiece(JAR.w + edge, right + t),
    Bodies.rectangle(left - t / 2, g - tall / 2, t, tall + t, { isStatic: true }),
    Bodies.rectangle(right + t / 2, g - tall / 2, t, tall + t, { isStatic: true })
  ];
  if (g > JAR.h) frameBodies.push(Bodies.rectangle(JAR.w / 2, (JAR.h + g) / 2 + 4, JAR.w + 2 * edge, g - JAR.h + 8, { isStatic: true }));
  Composite.add(engine.world, frameBodies);
}

const smooth = t => t * t * (3 - 2 * t);
// Half the inner width of the jar at depth y (wide neck, short shoulders, straight sides).
function halfWidth(y) {
  const { neck, belly } = JAR;
  if (TANK) return belly;
  const t = Math.min(1, Math.max(0, (y - 26) / 44));
  return neck + (belly - neck) * smooth(t);
}
// Left side of the outline from the rim down to the middle of the base.
function leftOutline() {
  const { h, belly } = JAR;
  const r = TANK ? TANK_CORNER : JAR.corner;
  const pts = [];
  for (let y = 0; y < h - r; y += 4) pts.push([CX - halfWidth(y), y]);
  const steps = 16;
  for (let k = 0; k <= steps; k++) {
    const th = (k / steps) * (Math.PI / 2);
    pts.push([CX - ((belly - r) + r * Math.cos(th)), h - r + r * Math.sin(th)]);
  }
  return pts;
}
const mirror = pts => pts.map(([x, y]) => [2 * CX - x, y]);
const toPath = pts => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");

function drawJar() {
  const left = leftOutline();
  const right = mirror(left).reverse();
  const closed = `${toPath([...left, ...right])}Z`;
  for (const id of ["bodyBack", "bodyFill", "bodyTint", "bodyInner", "bodyInnerLight", "clipBody"]) $(id).setAttribute("d", closed);
  for (const id of ["bodyEdgeHalo", "bodyEdgeOuter", "bodyEdge", "bodyEdgeShine"]) $(id).setAttribute("d", toPath([...left, ...right]));
  // ?jar=blue, lavender or mint picks another pastel for the glass (see overlay.css).
  const colour = new URLSearchParams(location.search).get("jar");
  if (colour) $("jarWrap").dataset.jar = colour;
  if (THEME !== "jar") $("jarWrap").classList.add(THEME);
  const inset = (pts, d, from, to) => pts.filter(([, y]) => y >= from && y <= to).map(([x, y]) => [x + d, y]);
  $("hlLeft").setAttribute("d", toPath(inset(left, 20, 80, 290)));
  $("hlLeftThin").setAttribute("d", toPath(inset(left, 34, 96, 170)));
  $("hlRight").setAttribute("d", toPath(inset(mirror(left), -16, 110, 260)));
}

function startPhysics() {
  if (!window.Matter) return;
  const { Engine, Runner, Bodies, Composite, Events } = Matter;
  engine = Engine.create({ gravity: { x: 0, y: 1.15 }, enableSleeping: true });
  // The glass is a ring of small static circles placed along the outline, just outside it: inside, gifts touch
  // the outline; outside, they stop 2 * GLASS away from it.
  const pegR = GLASS, statics = [];
  const left = leftOutline();
  for (let i = 0; i < left.length; i++) {
    const [x, y] = left[i];
    const [px, py] = left[Math.max(0, i - 1)], [nx, ny] = left[Math.min(left.length - 1, i + 1)];
    const len = Math.hypot(nx - px, ny - py) || 1;
    const ox = -(ny - py) / len, oy = (nx - px) / len; // outward normal
    const cx = x + ox * pegR, cy = y + oy * pegR;
    for (const sx of [cx, 2 * CX - cx]) statics.push(Bodies.circle(sx, cy, pegR, { isStatic: true, friction: 0 }));
  }
  // The base: the outline stops where the bottom corners end, so the flat middle of the base needs a body of
  // its own. Without it gifts fell through whenever the floor outside was not also under the jar.
  // In the tank the base is the top of the sand, across the whole width.
  if (TANK) statics.push(Bodies.rectangle(CX, SAND_TOP + 30, JAR.w - 2, 60, { isStatic: true, friction: 0.5 }));
  else statics.push(Bodies.rectangle(CX, JAR.h + 30, JAR.w - 2 * JAR.corner + 40, 60, { isStatic: true, friction: 0.4 }));
  Composite.add(engine.world, statics);
  if (TANK) Events.on(engine, "beforeUpdate", water);
  buildFrame();
  addEventListener("resize", buildFrame);
  runner = Runner.create();
  Runner.run(runner, engine);
  Events.on(engine, "afterUpdate", () => {
    for (const [body, el] of particles) {
      if (!el.isConnected) { removeParticle(body, el); continue; }
      const { x, y } = body.position, a = body.angle;
      // Resting gifts do not move, so skip the style write.
      if (Math.abs(x - el._x) > 0.05 || Math.abs(y - el._y) > 0.05 || Math.abs(a - el._a) > 0.002) {
        el._x = x; el._y = y; el._a = a;
        el.style.transform = `translate(${x}px, ${y}px) rotate(${a}rad)`;
      }
      if (body.position.y > Math.max(JAR.h, groundLevel) + 90) removeParticle(body, el);
    }
  });
}

// In the tank, gifts that fall into the water slow down and sink gently, swaying a little: the water holds up
// part of their weight and drags on them. A gift that hits the water from above makes a splash (tank.js).
const WATER_LIFT = 0.5, WATER_DRAG = 0.07, AIR_DRAG = 0.01;
function water() {
  const g = engine.gravity.y * engine.gravity.scale, now = engine.timing.timestamp;
  for (const body of particles.keys()) {
    const { x, y } = body.position;
    const wet = x > 0 && x < JAR.w && y > WATER_Y && y < JAR.h + 20;
    if (wet !== body._wet) {
      body.frictionAir = wet ? WATER_DRAG : AIR_DRAG;
      if (wet && body._wet === false && body.velocity.y > 1) {
        window.tankSplash?.(x, body.circleRadius ?? 14);
        body._sank = now || 1; // when it went in (never 0, which would read as "did not")
      }
      body._wet = wet;
    }
    // A gift that fell in has come to rest: a fish may come and look at it (tank.js). Gifts put back in place
    // when the page opens did not fall in, so they do not count.
    // At rest means in the water for 2.5 seconds and hardly sinking any more: the water keeps a pile stirring
    // a little, so it never stops quite dead.
    if (wet && body._sank && !body._landed && now - body._sank > 2500 && Math.abs(body.velocity.y) < 0.6) {
      body._landed = true;
      window.tankGiftLanded?.(x, y, body.circleRadius ?? 14);
    }
    if (!wet || body.isSleeping) continue;
    // A slow sideways drift while it is still sinking, different for each gift.
    const moving = Math.abs(body.velocity.y) > 0.3;
    const sway = moving ? Math.sin(now / 420 + body.id * 1.7) * body.mass * g * 0.08 : 0;
    Matter.Body.applyForce(body, body.position, { x: sway, y: -body.mass * g * WATER_LIFT });
  }
}

function removeParticle(body, el) {
  if (engine) Matter.Composite.remove(engine.world, body);
  el.remove();
  particles.delete(body);
}

// Gifts enter from above the visible frame and fall into the jar.
const FALL_G = 1.15 * 0.001; // px/ms², matches the engine gravity
const spawnY = () => Math.min(-40, (jarFrame().top - $("giftLayer").getBoundingClientRect().top) / scale - 60);
const fallDelay = () => Math.sqrt((2 * -spawnY()) / FALL_G);

const tierOf = coins => (coins >= MEGA_GIFT ? 2 : coins >= BIG_GIFT ? 1 : 0);

// Gifts priced at 90 coins or more are drawn larger, going by the price of one gift so a long streak of cheap
// gifts stays small. Below that all are the standard 28px; 90 coins is 75px, 150 coins 80px. From 199 coins the
// size is also multiplied (GIFT_BIG_FACTOR): 199 coins is 108px, 1000 coins 129px, 5000 coins 155px, up to a
// limit of 180px.
const GIFT_SIZE = 28, GIFT_SIZE_MAX = 180, GIFT_GROWS_FROM = 90;
const GIFT_BIG_FROM = 199, GIFT_BIG_FACTOR = 1.3;
function giftSize(event) {
  const repeat = Math.max(1, event.gift.repeatCount || 1);
  const price = event.gift.diamondCount || (event.calculatedCoins ?? 1) / repeat;
  if (price < GIFT_GROWS_FROM) return GIFT_SIZE;
  const size = GIFT_SIZE * (1 + 0.85 * Math.log10(price)) * (price >= GIFT_BIG_FROM ? GIFT_BIG_FACTOR : 1);
  return Math.min(GIFT_SIZE_MAX, size);
}

// One gift's picture (or an emoji when it has none), sized for its price; el._size is that size.
// TikTok's Rose is gift 5655 whatever language the live page is in ("Rose", "Hoa hồng"…). Gifts saved
// in the jar before the id was kept, and test gifts from the control page ("demo"), have no real id,
// so those still go by the name.
const ROSE_ID = "5655";
const isRose = gift => (/^\d+$/.test(gift.id ?? "") ? gift.id === ROSE_ID : /rose|hoa hồng/i.test(gift.name || ""));
function makeGiftEl(event, i) {
  const emojis = isRose(event.gift) ? ["🌹", "🌹", "💗"] : ["💝", "✨", "🌸"];
  const size = giftSize(event);
  const el = document.createElement("span");
  el.className = "gift-particle";
  el.style.setProperty("--size", `${size}px`);
  const fallback = () => { el.replaceChildren(); el.textContent = emojis[i % emojis.length]; };
  if (event.gift.image) {
    const img = document.createElement("img");
    img.className = "gift-img";
    img.referrerPolicy = "no-referrer";
    img.alt = "";
    img.onerror = fallback;
    img.src = event.gift.image;
    el.append(img);
  } else {
    fallback();
  }
  el._size = size;
  return el;
}

// Puts a gift's picture into the jar's physics at x, y (in the jar's own units), moving at velocity v.
function addGiftBody(el, x, y, v = { x: 0, y: 1 }, angle = 0) {
  $("giftLayer").append(el);
  const body = Matter.Bodies.circle(x, y, el._size * 0.46, { restitution: 0.42, friction: 0.035, density: 0.001 });
  Matter.Body.setVelocity(body, v);
  Matter.Body.setAngle(body, angle);
  Matter.Composite.add(engine.world, body);
  particles.set(body, el);
  // The update loop compares against these, so they must be numbers from the start.
  el._x = x; el._y = y; el._a = angle;
  el.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
}

// `at` places the gift directly in the jar (restoring a session) instead of dropping it from above.
function dropGift(event, i, at) {
  const el = makeGiftEl(event, i);
  if (engine) {
    const x = at?.x ?? CX + (Math.random() - 0.5) * 80;
    const y = at?.y ?? spawnY();
    // A restored pile is turned a little, so it does not look like a grid.
    addGiftBody(el, x, y, at ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * 2, y: 1 }, at ? rand(-0.7, 0.7) : 0);
  } else {
    $("giftLayer").append(el);
    el.style.left = `${15 + Math.random() * 70}%`;
    el.style.top = `${10 + i * 9}%`;
  }
}

// ---------- Effects ----------
function fx(text, className = "") {
  const el = document.createElement("span");
  el.className = `fx ${className}`;
  el.textContent = text;
  $("fxLayer").append(el);
  return el;
}
const rand = (a, b) => a + Math.random() * (b - a);
const SPARKS = ["✦", "✧", "✿", "♡"];
const SPARK_COLORS = ["#fff4c2", "#ffc6e6", "#e2c6ff", "#ffffff"];

function sparkleBurst(n) {
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
    const dist = rand(40, 95);
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
    const el = fx(SPARKS[i % SPARKS.length]);
    el.style.color = SPARK_COLORS[i % SPARK_COLORS.length];
    el.style.fontSize = `${rand(14, 26)}px`;
    gsap.fromTo(el,
      { x: MOUTH.x, y: MOUTH.y, scale: 0.2, rotation: 0, opacity: 1 },
      { x: MOUTH.x + dx, y: MOUTH.y + dy, scale: 1, rotation: rand(-120, 120), opacity: 0, duration: rand(0.7, 1.1), ease: "power3.out", onComplete: () => el.remove() });
  }
}

function floatText(coins) {
  const el = fx(`+${coins.toLocaleString()}`, "fx-plus");
  gsap.set(el, { x: MOUTH.x - 30 + rand(-30, 30), y: MOUTH.y + 10, scale: 0.6, opacity: 0 });
  gsap.timeline({ onComplete: () => el.remove() })
    .to(el, { y: MOUTH.y - 24, scale: 1.1, opacity: 1, duration: 0.38, ease: "back.out(2)" })
    .to(el, { y: MOUTH.y - 80, scale: 1, opacity: 0, duration: 1.12, ease: "power1.in" });
}

const CONFETTI = ["♥", "♡", "✦", "✿", "★"];
const CONFETTI_COLORS = ["#ff9ccf", "#f4d38d", "#d3a8ff", "#ffffff", "#9fe6d0"];
function confetti(n) {
  for (let i = 0; i < n; i++) {
    const dx = rand(-150, 150), up = rand(90, 190), fall = rand(40, 160), duration = rand(1.4, 2.1);
    const el = fx(CONFETTI[i % CONFETTI.length]);
    el.style.color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    el.style.fontSize = `${rand(14, 24)}px`;
    gsap.set(el, { x: MOUTH.x, y: MOUTH.y, scale: 0.4, opacity: 0 });
    // Sideways drift is steady; the vertical path shoots up, slows, then falls and fades.
    gsap.timeline({ delay: rand(0, 0.22), onStart: () => gsap.set(el, { opacity: 1 }), onComplete: () => el.remove() })
      .to(el, { x: MOUTH.x + dx, rotation: rand(-360, 360), duration, ease: "none" })
      .to(el, { y: MOUTH.y - up, scale: 1, duration: duration * 0.45, ease: "power2.out" }, 0)
      .to(el, { y: MOUTH.y - up + fall + up * 0.6, scale: 0.8, opacity: 0, duration: duration * 0.55, ease: "power2.in" }, duration * 0.45);
  }
}

function retrigger(el, className) {
  el.classList.remove("pulse", "wobble", "pop", "bump");
  void el.offsetWidth;
  el.classList.add(className);
  el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
}

// The jar swells when a gift lands; bigger gifts make it wobble and swing the donor tags.
function shakeJar(tier) {
  const wrap = $("jarWrap");
  gsap.killTweensOf(wrap);
  const tl = gsap.timeline({ onComplete: () => gsap.set(wrap, { clearProps: "transform" }) });
  if (tier) {
    tl.to(wrap, { scale: 1.05, rotation: -3, duration: 0.18, ease: "power2.out" })
      .to(wrap, { scale: 1.04, rotation: 2.5, duration: 0.24, ease: "sine.inOut" })
      .to(wrap, { scale: 1.03, rotation: -1.5, duration: 0.24, ease: "sine.inOut" })
      .to(wrap, { scale: 1.01, rotation: 0.8, duration: 0.24, ease: "sine.inOut" })
      .to(wrap, { scale: 1, rotation: 0, duration: 0.3, ease: "sine.out" });
  } else {
    tl.to(wrap, { scale: 1.03, duration: 0.22, ease: "power2.out" })
      .to(wrap, { scale: 1, duration: 0.68, ease: "elastic.out(1, .5)" });
  }
  gsap.killTweensOf(".jar-aura");
  gsap.timeline()
    .to(".jar-aura", { opacity: 1, duration: 0.25, ease: "power1.out" })
    .to(".jar-aura", { opacity: 0, duration: tier ? 0.95 : 0.65, ease: "power1.in" });
  for (const tag of document.querySelectorAll(".donor-tag")) {
    gsap.killTweensOf(tag);
    tag.classList.add("kick");
    gsap.timeline({ onComplete: () => { gsap.set(tag, { clearProps: "transform" }); tag.classList.remove("kick"); } })
      .to(tag, { rotation: -24, duration: 0.2, ease: "power2.out" })
      .to(tag, { rotation: 16, duration: 0.25, ease: "sine.inOut" })
      .to(tag, { rotation: -8, duration: 0.25, ease: "sine.inOut" })
      .to(tag, { rotation: 0, duration: 0.3, ease: "sine.out" });
  }
}

function celebrate(coins, tier) {
  retrigger($("donorCard"), "pop");
  retrigger($("coinPill"), "bump");
  // Jar effects wait until the gifts reach the mouth.
  setTimeout(() => celebrateJar(coins, tier), fallDelay() + 100);
}

function celebrateJar(coins, tier) {
  const wrap = $("jarWrap");
  wrap.style.setProperty("--glow", tier === 2 ? "255 214 120" : tier === 1 ? "221 160 255" : "246 169 216");
  if (reduceMotion) return;
  shakeJar(tier);
  window.dogReact?.(tier);
  window.jarDecorGift?.(tier);
  sparkleBurst(6 + tier * 5);
  floatText(coins);
  if (tier) confetti(10 + tier * 8);
  // In the fish tank, a big gift opens the treasure chest on the sand (tank.js).
  if (tier) window.tankTreasure?.(tier);
}

const coinsOf = event => event.calculatedCoins ?? event.gift.diamondCount * event.gift.repeatCount;
const particleCount = event => Math.max(1, event.gift.repeatCount);

// Gifts still waiting to fall. A big streak takes a while, so a session reset has to cancel them.
const pendingDrops = new Set();
function dropLater(event, i, delay) {
  const timer = setTimeout(() => { pendingDrops.delete(timer); dropGift(event, i); }, delay);
  pendingDrops.add(timer);
}

// Drops one event's gifts from above.
function pour(event) {
  const count = particleCount(event);
  for (let i = 0; i < count; i++) dropLater(event, i, i * 70);
}

// A gift of this many coins or more each (set on the control page, 1,000 by default; 0 for never) gathers
// every gift on screen into a heart in the middle, which bursts and pours back into the jar (bigburst.js).
let burstFrom = 1000;
socket.on("effects", settings => {
  if (Number.isFinite(settings?.burstFrom)) burstFrom = settings.burstFrom;
  // Switched between the jar and the fish tank on the control page: this page starts over in the new one.
  // The gifts come back from the server, as after any reload. A ?theme in the address stays as it is.
  const style = settings?.jarStyle;
  if (["jar", "tank"].includes(style) && style !== THEME && !new URLSearchParams(location.search).has("theme")) location.reload();
});
const pricePerGift = event => event.gift.diamondCount || coinsOf(event) / Math.max(1, event.gift.repeatCount || 1);

function addGift(event) {
  shownEvents.add(event.eventId);
  $("latestDonor").textContent = event.user.nickname;
  // The walking dog thanks the sender in its speech bubble (dogsprite.js), ahead of any greetings.
  window.dogThank?.(event.user.nickname, event.gift?.name, event.gift?.repeatCount);
  const coins = coinsOf(event);
  const tier = tierOf(coins);
  if (burstFrom > 0 && pricePerGift(event) >= burstFrom && window.bigBurst && engine && !reduceMotion && !document.hidden) {
    retrigger($("donorCard"), "pop");
    retrigger($("coinPill"), "bump");
    window.bigBurst(event, () => celebrateJar(coins, tier));
    return;
  }
  pour(event);
  celebrate(coins, tier);
}

// ---------- Restoring the jar ----------
const shownEvents = new Set();
let jarSession = null;

const SLOT_FIT = 42; // the largest gift that may be placed in a rest slot

// Non-overlapping spots inside the jar, from the base up to the rim.
function restSlots() {
  const gap = 30, left = leftOutline(), slots = [];
  for (let y = (TANK ? SAND_TOP : JAR.h) - gap / 2; y >= gap / 2; y -= gap) {
    // A row must fit at its narrowest point, wherever the outline pinches within it.
    const edge = Math.max(...left.filter(([, py]) => Math.abs(py - y) <= gap / 2).map(([x]) => x));
    const half = Math.max(0, CX - edge - gap / 2);
    const cols = Math.floor((2 * half) / gap) + 1;
    const step = cols > 1 ? (2 * half) / (cols - 1) : 0;
    for (let c = 0; c < cols; c++) slots.push({ x: CX - half + c * step, y });
  }
  return slots;
}

// Refills an empty jar without effects: these gifts were already celebrated.
// What fits is placed inside, oldest first; the rest falls in from above and spills as it did live.
// Large gifts would not fit a slot without pushing their neighbours away, so they fall in as well.
function restoreJar(events) {
  const slots = restSlots();
  const items = events.flatMap(event => Array.from({ length: particleCount(event) }, (_, i) => ({ event, i })));
  let placed = 0, falling = 0;
  for (const { event, i } of items) {
    if (placed < slots.length && giftSize(event) <= SLOT_FIT) dropGift(event, i, slots[placed++]);
    else dropLater(event, i, falling++ * 30);
  }
}

function clearJar() {
  window.bigBurstReset?.();
  for (const timer of pendingDrops) clearTimeout(timer);
  pendingDrops.clear();
  shownEvents.clear();
  for (const [body, el] of [...particles]) removeParticle(body, el);
  $("giftLayer").replaceChildren();
}

// Sent on every (re)connect, so skip what is already shown and catch up on anything missed.
function syncJar({ sessionId, gifts }) {
  if (jarSession && jarSession !== sessionId) clearJar();
  jarSession = sessionId;
  const missing = gifts.filter(event => !shownEvents.has(event.eventId));
  for (const event of missing) shownEvents.add(event.eventId);
  if (!particles.size) restoreJar(missing);
  else for (const event of missing) pour(event);
}

// ---------- State ----------
let shownCoins = 0, countRaf = 0;
function setCoins(target) {
  cancelAnimationFrame(countRaf);
  if (reduceMotion || target <= shownCoins) {
    shownCoins = target;
    $("totalCoins").textContent = target.toLocaleString();
    return;
  }
  const from = shownCoins, start = performance.now(), duration = 700;
  const step = now => {
    const p = Math.min(1, (now - start) / duration);
    shownCoins = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
    $("totalCoins").textContent = shownCoins.toLocaleString();
    if (p < 1) countRaf = requestAnimationFrame(step);
  };
  countRaf = requestAnimationFrame(step);
}

// Puts the top donors' avatars on the hanging tags. A heart stands in for an empty place,
// a donor without an avatar, or an image that fails to load (TikTok's links expire).
function renderDonorTags(donors) {
  for (const tag of document.querySelectorAll(".donor-tag")) {
    const frame = tag.querySelector(".donor-frame");
    const avatar = donors[tag.dataset.rank - 1]?.avatar ?? "";
    if (frame.dataset.avatar === avatar) continue; // reloading the same image would make it blink
    frame.dataset.avatar = avatar;
    const heart = () => { frame.replaceChildren(); frame.textContent = "♡"; };
    if (!/^https?:\/\//i.test(avatar)) { heart(); continue; }
    const img = document.createElement("img");
    img.referrerPolicy = "no-referrer";
    img.alt = "";
    img.onerror = heart;
    img.src = avatar;
    frame.replaceChildren(img);
  }
}

function renderState(state) {
  setCoins(state.totalCoins);
  renderDonorTags(state.topDonors);
  const list = $("overlayLeaders");
  list.replaceChildren();
  if (!state.topDonors.length) {
    const li = document.createElement("li");
    li.textContent = "Chưa có người tặng";
    list.append(li);
    return;
  }
  state.topDonors.slice(0, 3).forEach(d => {
    const li = document.createElement("li");
    li.textContent = `${d.nickname} · ${d.coins.toLocaleString()} xu`;
    list.append(li);
  });
}

fitScene();
addEventListener("resize", fitScene); // before startPhysics, so buildFrame sees the new scale
drawJar();
startPhysics();
socket.on("gift", addGift);
// A viewer joined the live: the walking dog greets them (dogsprite.js).
socket.on("member", event => window.dogGreet?.(event?.user?.nickname));
socket.on("state", renderState);
socket.on("jar", syncJar);
// "Tải lại overlay" on the control page, when this page is a source of its own (live.html reloads itself).
socket.on("overlay-reload", () => { if (window.top === window) location.reload(); });
socket.on("session-reset", () => {
  $("latestDonor").textContent = "Chờ món quà đầu tiên";
  $("fxLayer").replaceChildren();
  clearJar();
  jarSession = null;
});

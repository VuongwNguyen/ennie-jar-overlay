const socket = io();
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Inner size of the glass body (px). The outline below drives both the drawing and the physics.
const JAR = { w: 272, h: 356, corner: 70, neck: 66, belly: 134 };
const CX = JAR.w / 2;
const MOUTH = { x: 155, y: 40 }; // where gifts enter, in .jar-wrap coordinates
const MAX_PARTICLES = 180;
const FULL_AT = 110; // gifts that fill the jar, used for the glow
const BIG_GIFT = 100;
const MEGA_GIFT = 1000;

let engine, runner;
let frameBodies = [];
const particles = new Map();

// Ground level with the jar's base plus walls at the edges of the visible frame,
// so gifts that spill out stay on screen and pile up beside the jar.
function buildFrame() {
  if (!engine) return;
  const { Bodies, Composite } = Matter;
  Composite.remove(engine.world, frameBodies);
  const r = $("giftLayer").getBoundingClientRect();
  const left = -r.left, right = innerWidth - r.left;
  const t = 60, tall = 4000;
  frameBodies = [
    Bodies.rectangle((left + right) / 2, JAR.h + t / 2, right - left + 2 * t, t, { isStatic: true }),
    Bodies.rectangle(left - t / 2, JAR.h - tall / 2, t, tall + t, { isStatic: true }),
    Bodies.rectangle(right + t / 2, JAR.h - tall / 2, t, tall + t, { isStatic: true })
  ];
  Composite.add(engine.world, frameBodies);
}

const smooth = t => t * t * (3 - 2 * t);
// Half the inner width of the jar at depth y (narrow neck, shoulders, round belly).
function halfWidth(y) {
  const { neck, belly } = JAR;
  const t = Math.min(1, Math.max(0, (y - 40) / 80));
  return neck + (belly - neck) * smooth(t);
}
// Left side of the outline from the rim down to the middle of the base.
function leftOutline() {
  const { h, corner: r, belly } = JAR;
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
  for (const id of ["bodyFill", "bodyGlow", "clipBody"]) $(id).setAttribute("d", closed);
  $("bodyEdge").setAttribute("d", toPath([...left, ...right]));
  const inset = (pts, d, from, to) => pts.filter(([, y]) => y >= from && y <= to).map(([x, y]) => [x + d, y]);
  $("hlLeft").setAttribute("d", toPath(inset(left, 20, 90, 280)));
  $("hlRight").setAttribute("d", toPath(inset(mirror(left), -16, 110, 250)));
}

function updateFill() {
  $("jarWrap").style.setProperty("--fill", Math.min(1, particles.size / FULL_AT).toFixed(2));
}

function startPhysics() {
  if (!window.Matter) return;
  const { Engine, Runner, Bodies, Composite, Events } = Matter;
  engine = Engine.create({ gravity: { x: 0, y: 1.15 }, enableSleeping: true });
  // The glass is a ring of small static circles placed along the outline.
  const pegR = 8, statics = [];
  const left = leftOutline();
  for (let i = 0; i < left.length; i++) {
    const [x, y] = left[i];
    const [px, py] = left[Math.max(0, i - 1)], [nx, ny] = left[Math.min(left.length - 1, i + 1)];
    const len = Math.hypot(nx - px, ny - py) || 1;
    const ox = -(ny - py) / len, oy = (nx - px) / len; // outward normal
    const cx = x + ox * pegR, cy = y + oy * pegR;
    for (const sx of [cx, 2 * CX - cx]) statics.push(Bodies.circle(sx, cy, pegR, { isStatic: true, friction: 0 }));
  }
  Composite.add(engine.world, statics);
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
      if (body.position.y > JAR.h + 90) removeParticle(body, el);
    }
  });
}

function removeParticle(body, el) {
  if (engine) Matter.Composite.remove(engine.world, body);
  el.remove();
  particles.delete(body);
  updateFill();
}
function trimParticles() {
  while (particles.size > MAX_PARTICLES) {
    // Drop spilled gifts first so the pile inside the jar does not collapse.
    const spilled = [...particles].find(([b]) => b.position.x < 0 || b.position.x > JAR.w);
    const [body, el] = spilled ?? particles.entries().next().value;
    removeParticle(body, el);
  }
}

// Gifts enter from above the visible frame and fall into the jar.
const FALL_G = 1.15 * 0.001; // px/ms², matches the engine gravity
const spawnY = () => Math.min(-40, -$("giftLayer").getBoundingClientRect().top - 60);
const fallDelay = () => Math.sqrt((2 * -spawnY()) / FALL_G);

const tierOf = coins => (coins >= MEGA_GIFT ? 2 : coins >= BIG_GIFT ? 1 : 0);

function dropGift(event, tier, i) {
  const emojis = /rose|hoa/i.test(event.gift.name) ? ["🌹", "🌹", "💗"] : ["💝", "✨", "🌸"];
  const size = 28 * (1 + tier * 0.25);
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
  $("giftLayer").append(el);
  if (engine) {
    const x = CX + (Math.random() - 0.5) * 80;
    const body = Matter.Bodies.circle(x, spawnY(), size * 0.46, { restitution: 0.42, friction: 0.035, density: 0.001 });
    Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 1 });
    Matter.Composite.add(engine.world, body);
    particles.set(body, el);
    updateFill();
    el.style.transform = `translate(${x}px, ${spawnY()}px)`;
  } else {
    el.style.left = `${15 + Math.random() * 70}%`;
    el.style.top = `${10 + i * 9}%`;
  }
}

// ---------- Effects ----------
function fx(text, className, keyframes, options) {
  const el = document.createElement("span");
  el.className = `fx ${className}`;
  el.textContent = text;
  $("fxLayer").append(el);
  const anim = el.animate(keyframes, { fill: "forwards", ...options });
  anim.onfinish = anim.oncancel = () => el.remove();
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
    const el = fx(SPARKS[i % SPARKS.length], "", [
      { transform: `translate(${MOUTH.x}px, ${MOUTH.y}px) scale(.2) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${MOUTH.x + dx}px, ${MOUTH.y + dy}px) scale(1) rotate(${rand(-120, 120)}deg)`, opacity: 0 }
    ], { duration: rand(700, 1100), easing: "cubic-bezier(.1,.7,.3,1)" });
    el.style.color = SPARK_COLORS[i % SPARK_COLORS.length];
    el.style.fontSize = `${rand(14, 26)}px`;
  }
}

function floatText(coins) {
  const x = MOUTH.x - 30 + rand(-30, 30);
  fx(`+${coins.toLocaleString()}`, "fx-plus", [
    { transform: `translate(${x}px, ${MOUTH.y + 10}px) scale(.6)`, opacity: 0 },
    { transform: `translate(${x}px, ${MOUTH.y - 24}px) scale(1.1)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${x}px, ${MOUTH.y - 80}px) scale(1)`, opacity: 0 }
  ], { duration: 1500, easing: "ease-out" });
}

const CONFETTI = ["♥", "♡", "✦", "✿", "★"];
const CONFETTI_COLORS = ["#ff9ccf", "#f4d38d", "#d3a8ff", "#ffffff", "#9fe6d0"];
function confetti(n) {
  for (let i = 0; i < n; i++) {
    const dx = rand(-150, 150), up = rand(90, 190), fall = rand(40, 160);
    const el = fx(CONFETTI[i % CONFETTI.length], "", [
      { transform: `translate(${MOUTH.x}px, ${MOUTH.y}px) scale(.4) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${MOUTH.x + dx * 0.6}px, ${MOUTH.y - up}px) scale(1) rotate(${rand(-200, 200)}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${MOUTH.x + dx}px, ${MOUTH.y - up + fall + up * 0.6}px) scale(.8) rotate(${rand(-360, 360)}deg)`, opacity: 0 }
    ], { duration: rand(1400, 2100), easing: "cubic-bezier(.3,.6,.5,1)", delay: rand(0, 220) });
    el.style.color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    el.style.fontSize = `${rand(14, 24)}px`;
  }
}

function retrigger(el, className) {
  el.classList.remove("pulse", "wobble", "pop", "bump");
  void el.offsetWidth;
  el.classList.add(className);
  el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
}

// Lifts the cork shortly before the gifts reach the mouth and puts it back once they are in.
let corkTimer = 0;
function openCork(delay, hold) {
  setTimeout(() => {
    const wrap = $("jarWrap");
    if (!wrap.classList.contains("open") && !reduceMotion) sparkleBurst(5);
    wrap.classList.add("open");
    clearTimeout(corkTimer);
    corkTimer = setTimeout(() => wrap.classList.remove("open"), hold);
  }, Math.max(0, delay));
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
  retrigger(wrap, tier ? "wobble" : "pulse");
  if (reduceMotion) return;
  sparkleBurst(6 + tier * 5);
  floatText(coins);
  if (tier) confetti(10 + tier * 8);
}

function addGift(event) {
  $("latestDonor").textContent = event.user.nickname;
  const coins = event.calculatedCoins ?? event.gift.diamondCount * event.gift.repeatCount;
  const tier = tierOf(coins);
  const count = Math.min(8, Math.max(1, event.gift.repeatCount)) + tier * 2;
  for (let i = 0; i < count; i++) setTimeout(() => { dropGift(event, tier, i); trimParticles(); }, i * 70);
  openCork(fallDelay() - 300, 300 + count * 70 + 700);
  celebrate(coins, tier);
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

function renderState(state) {
  setCoins(state.totalCoins);
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

drawJar();
startPhysics();
socket.on("gift", addGift);
socket.on("state", renderState);
socket.on("session-reset", () => {
  $("latestDonor").textContent = "Chờ món quà đầu tiên";
  $("giftLayer").replaceChildren();
  $("fxLayer").replaceChildren();
  clearTimeout(corkTimer);
  $("jarWrap").classList.remove("open");
  for (const [body, el] of [...particles]) removeParticle(body, el);
});

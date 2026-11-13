// Ennie herself, cut out of video (tools/video_sprites). The pictures are real frames of the dog with a
// see-through background, played like a GIF on a canvas, so the streaming PC only has to show pictures.
// She sits in the bottom right corner of the jar, facing the viewer, and shows how she feels: she blinks,
// winks, smiles, and jumps for joy when a gift comes (front view sprites in /models/dog-front/).
// With ?roam=1 the side view sprites (/models/dog/) are used instead: she stands, looks around, yawns, wags her
// tail, and walks or hops from one side of the jar to the other.
const ROAM = new URLSearchParams(location.search).has("roam");
const BASE = ROAM ? "/models/dog/" : "/models/dog-front/";
const SIZE = 190; // how wide a whole picture is drawn, in .jar-wrap coordinates
const JAR_LEFT = 5, JAR_RIGHT = 305; // the sides of the jar, in .jar-wrap coordinates
const FLOOR = 416; // where its paws touch the ground
const WALK_SPEED_PX = 60; // how fast she crosses the jar when she walks
const HOP_REACH = 60; // how far one hop carries her
// Sitting, only her face changes from one clip to the next, so the pictures can dissolve into each other. The
// standing clips differ too much in pose: they would show as a ghost, so each starts at once.
const FADE_SECONDS = ROAM ? 0.02 : 0.2;
const RETURN_FADE = ROAM ? 0.02 : 0.3; // back to calm; every clip ends near the calm pose, so a short dissolve is enough
// Sitting, she does not rise off the floor like a stiff picture: only a small lift under the clip's own bounce.
const HOP = ROAM ? 1 : 0.3;
const random = gsap.utils.random;

export async function startSpriteDog() {
  const response = await fetch(`${BASE}manifest.json`);
  if (!response.ok) throw new Error(`manifest: ${response.status}`);
  const { frameSize, clips, groundX, groundY, bodyWidth, walkSpeed } = await response.json();
  // How fast the walking clip carries her at normal speed, as seen on screen: played at the pace of her walk
  // across the jar, her paws do not slide much along the floor.
  const WALK_PX = (walkSpeed ?? 0.5) * SIZE;
  const sheets = {};
  const warm = document.createElement("canvas").getContext("2d");
  // Sitting, she breathes: the picture rises and falls a little, so she is never a frozen picture between clips.
  let breath = 1, placed = "";
  // Waits for onload rather than decode(), which never finishes while the page is hidden.
  // A clip may share the sheet of another one (its "file").
  await Promise.all(Object.keys(clips).map(name => new Promise((done, fail) => {
    const image = new Image();
    image.onload = () => {
      sheets[name] = image;
      // A picture is only decoded when it is first drawn, which stalls the first time a clip plays: draw each sheet
      // once now, into a one pixel canvas, so that happens before she starts.
      try { warm.drawImage(image, 0, 0, 1, 1); } catch { /* not worth stopping for */ }
      done();
    };
    image.onerror = () => fail(new Error(`could not load ${name}`));
    image.src = `${BASE}${clips[name].file ?? name}.png`;
  })));

  const wrap = document.getElementById("jarWrap");
  const shadow = document.createElement("div");
  shadow.className = "dog-sprite-shadow";
  const canvas = document.createElement("canvas");
  canvas.className = "dog-sprite";
  canvas.width = canvas.height = frameSize;
  // SIZE alone decides how big the dog is drawn; the stylesheet only has a starting value.
  canvas.style.width = canvas.style.height = `${SIZE}px`;
  canvas.style.transformOrigin = `${groundX * 100}% ${groundY * 100}%`;
  wrap.append(shadow, canvas);
  document.body.classList.add("dog-sprite-on");
  const ctx = canvas.getContext("2d");

  // ---------- Playing clips ----------
  const now = { name: "Idle", clock: 0, rate: 1, finished: null };
  let previous = null, fade = 1, fadeLen = FADE_SECONDS, shown = "", nextBlink = performance.now() + 3000;

  function draw(name, index, alpha) {
    const { columns } = clips[name];
    ctx.globalAlpha = alpha;
    ctx.drawImage(sheets[name], (index % columns) * frameSize, Math.floor(index / columns) * frameSize, frameSize, frameSize, 0, 0, frameSize, frameSize);
  }

  // Starts a clip with a short fade from the last picture. A clip that ends resolves the returned promise.
  function play(name, { rate = 1, cut = false, fadeSeconds } = {}) {
    if (now.name === name && clips[name].loops) {
      now.rate = rate;
      return Promise.resolve();
    }
    now.finished?.();
    const clip = clips[now.name];
    previous = cut ? null : { name: now.name, frame: Math.min(Math.floor(now.clock) % clip.frames, clip.frames - 1) };
    fade = cut ? 1 : 0;
    fadeLen = fadeSeconds ?? (name === "Idle" ? RETURN_FADE : FADE_SECONDS);
    Object.assign(now, { name, clock: 0, rate, finished: null });
    return new Promise(done => {
      if (clips[name].loops) done();
      else now.finished = done;
    });
  }

  function tick(_time, deltaMs) {
    if (!ROAM) {
      breath = 1 + 0.014 * Math.sin((performance.now() / 1000) * (2 * Math.PI) / 3.4);
      if (placed) canvas.style.transform = `${placed} scaleY(${breath.toFixed(4)})`;
    }
    const seconds = Math.min(deltaMs / 1000, 0.1);
    const clip = clips[now.name];
    now.clock += seconds * clip.fps * now.rate;
    fade = Math.min(1, fade + seconds / fadeLen);
    if (clip.loops) now.clock %= clip.frames;
    else if (now.clock >= clip.frames - 1) {
      now.clock = clip.frames - 1;
      const finished = now.finished;
      now.finished = null;
      finished?.();
    }
    const whole = Math.floor(now.clock);

    // The blink is drawn over the first picture of the standing clip, so it starts from there.
    if (now.name === "Idle" && whole === 0 && performance.now() >= nextBlink) {
      nextBlink = Infinity;
      play("Blink", { rate: 0.7, cut: true }).then(() => {
        nextBlink = performance.now() + (ROAM ? random(2500, 6000) : random(4500, 9000));
        if (now.name === "Blink") play("Idle", { cut: ROAM });
      });
      return;
    }

    // Between two pictures of a slow clip the next one is blended in, in steps: gentle movement is smooth at few
    // pictures. A fast clip is not blended: two ear positions at once would show as a ghost ear.
    const steps = clip.fps <= 10 ? 3 : 0;
    const between = steps ? Math.floor((now.clock - whole) * steps) / steps : 0;
    const key = `${now.name}:${whole}:${between}:${fade.toFixed(2)}`;
    if (key === shown) return;
    shown = key;
    ctx.clearRect(0, 0, frameSize, frameSize);
    if (fade < 1 && previous) draw(previous.name, previous.frame, Math.min(1, 2 * (1 - fade)));
    const alpha = Math.min(1, 2 * fade);
    draw(now.name, whole, alpha);
    if (between) draw(now.name, (whole + 1) % clip.frames, between * alpha);
  }

  // ---------- Hopping from side to side in front of the jar, and no further than its width ----------
  const stage = { x: (JAR_LEFT + JAR_RIGHT) / 2, hop: 0, facing: 1 }; // the pictures face left, so facing 1 is left
  const halfBody = (bodyWidth * SIZE) / 2;
  const shadowWidth = bodyWidth * SIZE * 1.15;
  shadow.style.width = `${shadowWidth}px`;
  const place = () => {
    const y = FLOOR - groundY * SIZE + stage.hop;
    placed = `translate(${(stage.x - groundX * SIZE).toFixed(2)}px, ${y.toFixed(2)}px) scaleX(${stage.facing.toFixed(3)})`;
    canvas.style.transform = ROAM ? placed : `${placed} scaleY(${breath.toFixed(4)})`;
    const lift = Math.min(1, -stage.hop / 60);
    shadow.style.transform = `translate(${(stage.x - shadowWidth / 2).toFixed(2)}px, ${FLOOR - 10}px) scale(${(1 - lift * 0.3).toFixed(3)})`;
    shadow.style.opacity = (1 - lift * 0.5).toFixed(3);
    placeBubble();
  };

  // ---------- A speech bubble over its head, greeting viewers who join the live ----------
  const bubble = document.createElement("div");
  bubble.className = "dog-bubble";
  bubble.innerHTML = '<div class="dog-bubble-body"><span class="dog-bubble-text"></span></div>';
  wrap.append(bubble);
  const bubbleBody = bubble.firstChild, bubbleText = bubble.querySelector(".dog-bubble-text");
  // The top of the head in the pictures, measured once from the first standing picture.
  let headTop = 0.2, headX = 0.5;
  function measureHead() {
    const { data } = ctx.getImageData(0, 0, frameSize, frameSize);
    for (let y = 0; y < frameSize; y++) {
      for (let x = 0; x < frameSize; x++) {
        if (data[(y * frameSize + x) * 4 + 3] > 128) {
          headTop = y / frameSize;
          headX = x / frameSize;
          return;
        }
      }
    }
  }
  function placeBubble() {
    if (!bubble.classList.contains("on")) return;
    // The pictures face left; flipped, the head is on the other side of the ground point.
    const offset = (headX - groundX) * SIZE * stage.facing;
    const top = FLOOR - groundY * SIZE + headTop * SIZE + stage.hop - 6;
    // Kept inside the visible frame, which the jar's right edge is close to.
    const box = wrap.getBoundingClientRect(), s = sceneScale(), half = bubble.offsetWidth / 2;
    const frame = window.jarFrame?.() ?? { left: 0, right: innerWidth };
    const left = Math.min(Math.max(stage.x + offset, (frame.left - box.left) / s + half + 4), (frame.right - box.left) / s - half - 4);
    bubble.style.transform = `translate(${(left - half).toFixed(1)}px, ${(top - bubble.offsetHeight).toFixed(1)}px)`;
    bubble.style.setProperty("--tail", `${(stage.x + offset - left + half).toFixed(1)}px`);
  }

  const sceneScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
  const range = () => {
    const box = wrap.getBoundingClientRect(), s = sceneScale();
    const frame = window.jarFrame?.() ?? { left: 0, right: innerWidth };
    return {
      left: Math.max((frame.left - box.left) / s + halfBody, JAR_LEFT + halfBody),
      right: Math.min((frame.right - box.left) / s - halfBody, JAR_RIGHT - halfBody)
    };
  };
  // She sits in the bottom right corner of the jar, and stays there when the layout changes.
  const toCorner = () => { stage.x = range().right; place(); };
  if (!ROAM) {
    toCorner();
    addEventListener("resize", toCorner);
  }
  gsap.ticker.add(tick);
  tick(0, 0);
  measureHead();
  startGreetings();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.ticker.remove(tick);
    window.dogReact = () => {};
    return;
  }

  const tween = (target, vars) => new Promise(done => gsap.to(target, { ...vars, onComplete: done }));
  const rest = seconds => new Promise(done => gsap.delayedCall(seconds, done));

  let interrupt = null;
  // Walks to a spot on the other side of the jar, or until a gift interrupts. Without a walking clip she hops.
  async function walkAcross() {
    if (!clips.Walk) return hopAcross();
    const { left, right } = range();
    const middle = (left + right) / 2;
    const target = stage.x > middle ? random(left, middle) : random(middle, right);
    const wanted = target > stage.x ? -1 : 1; // the pictures face left
    if (stage.facing !== wanted) await tween(stage, { facing: wanted, duration: 0.2, ease: "sine.inOut", onUpdate: place });
    const speed = random(WALK_SPEED_PX * 0.9, WALK_SPEED_PX * 1.1);
    play("Walk", { rate: speed / WALK_PX });
    await new Promise(done => {
      const finish = () => {
        interrupt = null;
        done();
      };
      const walking = gsap.to(stage, { x: target, duration: Math.abs(target - stage.x) / speed, ease: "none", onUpdate: place, onComplete: finish });
      interrupt = () => {
        walking.kill();
        finish();
      };
    });
    play("Idle");
  }

  // Hops to a spot on the other side of the jar, a few hops at a time. A gift stops her after the hop she is in.
  async function hopAcross() {
    const { left, right } = range();
    const middle = (left + right) / 2;
    const target = stage.x > middle ? random(left, middle) : random(middle, right);
    const wanted = target > stage.x ? -1 : 1; // the pictures face left
    if (stage.facing !== wanted) await tween(stage, { facing: wanted, duration: 0.2, ease: "sine.inOut", onUpdate: place });
    const hops = Math.max(1, Math.round(Math.abs(target - stage.x) / HOP_REACH));
    const step = (target - stage.x) / hops;
    let stop = false;
    interrupt = () => { stop = true; };
    for (let i = 0; i < hops && !stop; i++) await leap(random(14, 20), step, i === hops - 1);
    interrupt = null;
    play("Idle");
  }

  // The clip bounds up; the hop adds height while she is off the floor, and `dx` carries her sideways in the
  // air. A series of hops only settles into standing after the last one.
  const JUMP_LENGTH = clips.Jump.frames / clips.Jump.fps;
  async function leap(height = 26, dx = 0, settle = true) {
    const ended = play("Jump");
    gsap.timeline({ delay: JUMP_LENGTH * 0.2, onUpdate: place })
      .to(stage, { hop: -height * HOP, duration: JUMP_LENGTH * 0.26, ease: "power2.out" })
      .to(stage, { hop: 0, duration: JUMP_LENGTH * 0.24, ease: "power2.in" });
    if (dx) gsap.to(stage, { x: stage.x + dx, duration: JUMP_LENGTH * 0.5, delay: JUMP_LENGTH * 0.2, ease: "sine.inOut", onUpdate: place });
    await ended;
    if (settle) play("Idle");
  }

  // ---------- Resting, and reacting to gifts ----------
  let cheerTier = null, lastCheer = 0, wake = null;

  function calm(seconds) {
    return new Promise(done => {
      let over = false;
      const finish = () => {
        if (over) return;
        over = true;
        timer.kill();
        wake = null;
        done();
      };
      const timer = gsap.delayedCall(seconds, finish);
      wake = finish;
      (async () => {
        while (!over) {
          play("Idle");
          await rest(random(ROAM ? 1.4 : 6, ROAM ? 3.2 : 11));   // sitting she is calm for a good while between expressions
          if (over) return;
          // Only what the footage has: a clip that is missing is left out of the draw.
          // Sitting she only makes the gentle ones; the excited ones (Pant, a hop) are for gifts.
          const acts = (ROAM ? ["TailWag", "Joy", "Joy", "Pant", "HeadTilt", "HeadTilt", "Surprised", "Yawn", "Hop", "Idle"]
            : ["HeadTilt", "HeadTilt", "Joy", "Surprised", "Yawn", "Idle", "Idle"])
            .filter(name => name === "Hop" || name === "Idle" || clips[name]);
          const act = random(acts);
          if (act === "Hop") {
            await leap(random(18, 30));
          } else if (act !== "Idle") {
            // A clip that loops plays for a while; one that does not plays once and she holds its last picture.
            if (clips[act].loops) {
              play(act);
              await rest(random(1.2, 2.4));
            } else {
              await play(act);
              await rest(random(0.2, 0.6));
            }
          }
        }
      })();
    });
  }

  async function cheer() {
    if (cheerTier == null) return;
    const tier = cheerTier;
    cheerTier = null;
    lastCheer = performance.now();
    // Startled by the gift, jumps for joy, then wags with a big smile.
    await play("Surprised");
    await rest(0.2);
    for (let i = 0; i <= tier; i++) await leap(26 + tier * 12);
    play("Joy");
    await rest(1.4 + tier * 0.5);
  }

  async function life() {
    for (;;) {
      if (ROAM) {
        // Mostly she walks; now and then she hops across instead.
        await (Math.random() < 0.8 ? walkAcross() : hopAcross());
        await cheer();
        // A little hop of its own now and then, gift or no gift.
        if (Math.random() < 0.2) await leap(random(18, 30));
        // A rest now and then, to change expression.
        if (Math.random() < 0.6) {
          await calm(random(3, 6));
          await cheer();
        }
      } else {
        // She stays where she is and only changes expression.
        await calm(random(12, 25));
        await cheer();
      }
    }
  }
  gsap.delayedCall(1.2, life);

  // A gift stops the dog where it is, wherever it has got to, and the jump follows at once.
  window.dogReact = (tier = 0) => {
    if (performance.now() - lastCheer < 2500) return;
    cheerTier = Math.max(cheerTier ?? 0, tier);
    wake?.();
    interrupt?.();
  };

  // The speech bubble says one thing at a time: thanks for gifts first, then greetings for viewers
  // who join. A thank-you that arrives during a greeting cuts the greeting short. In a busy live
  // people join faster than anyone could read, so only the latest few greetings wait their turn,
  // and someone who leaves and comes back within 15 seconds is not greeted again.
  function startGreetings() {
    const SHOW = 2.6, THANK_SHOW = 3.2, SHORT_SHOW = 0.8, GAP = 0.3;
    const GREETINGS_MAX = 3, THANKS_MAX = 6, AGAIN_AFTER_MS = 15_000;
    const thanks = [], greetings = [], greeted = new Map();
    let showing = null, hideCall = null;
    const short = (text, max) => {
      const letters = [...String(text)];
      return letters.length > max ? `${letters.slice(0, max - 1).join("")}…` : String(text);
    };

    window.dogGreet = rawName => {
      const name = String(rawName ?? "").trim();
      if (!name) return;
      const now = Date.now();
      if (now - (greeted.get(name) ?? -Infinity) < AGAIN_AFTER_MS) return;
      greeted.set(name, now);
      if (greeted.size > 500) greeted.delete(greeted.keys().next().value);
      greetings.push(name);
      if (greetings.length > GREETINGS_MAX) greetings.splice(0, greetings.length - GREETINGS_MAX);
      if (!showing) next();
    };

    window.dogThank = (rawName, rawGift, count = 1) => {
      const name = String(rawName ?? "").trim() || "bạn";
      const gift = String(rawGift ?? "").trim() || "quà";
      // A sender who has just greeted needs no greeting as well.
      greeted.set(name, Date.now());
      const index = greetings.indexOf(name);
      if (index >= 0) greetings.splice(index, 1);
      // Repeats of the same gift from the same person, still waiting, become one thank-you with a count.
      const same = thanks.find(t => t.name === name && t.gift === gift);
      if (same) same.count += Number(count) || 1;
      else thanks.push({ name, gift, count: Number(count) || 1 });
      if (thanks.length > THANKS_MAX) thanks.splice(0, thanks.length - THANKS_MAX);
      if (!showing) next();
      else if (showing === "greeting") hideSoon(SHORT_SHOW);
    };

    function hideSoon(seconds) {
      hideCall?.kill();
      hideCall = gsap.delayedCall(seconds, () => gsap.to(bubbleBody, {
        scale: 0.8, opacity: 0, duration: 0.25, ease: "power1.in",
        onComplete: () => {
          bubble.classList.remove("on");
          showing = null;
          gsap.delayedCall(GAP, () => { if (!showing) next(); });
        }
      }));
    }

    function next() {
      const thank = thanks.shift();
      const name = thank ? null : greetings.shift();
      if (!thank && !name) return;
      if (thank) {
        const times = thank.count > 1 ? ` ×${thank.count}` : "";
        bubbleText.textContent = `Cảm ơn ${short(thank.name, 14)} đã tặng ${short(thank.gift, 14)}${times}! 💖`;
        bubble.classList.add("thanks");
      } else {
        bubbleText.textContent = `Chào ${short(name, 16)}! 🐾`;
        bubble.classList.remove("thanks");
      }
      showing = thank ? "thanks" : "greeting";
      bubble.classList.add("on");
      placeBubble();
      gsap.fromTo(bubbleBody, { scale: 0.4, opacity: 0, y: 8 }, { scale: 1, opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" });
      // A greeting waiting behind thanks would otherwise never be seen in a busy live; a waiting
      // thank-you shortens the current one a little so the line keeps moving.
      hideSoon(thank ? (thanks.length ? 2.2 : THANK_SHOW) : SHOW);
    }
  }
}

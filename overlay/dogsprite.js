// The poodle with real fur, rendered ahead of time in Blender (blender_pipeline/render_clips.py). It
// plays like a GIF with smooth see-through edges, drawn on a canvas and moved along the floor, so the
// streaming PC only has to show pictures. It walks back and forth in front of the jar, and changes expression:
// a big smile, panting, a yawn, a surprised look and a puzzled head tilt.
const BASE = "/models/dog/";
const SIZE = 190; // how wide a whole picture is drawn, in .jar-wrap coordinates
const JAR_LEFT = 5, JAR_RIGHT = 305; // the sides of the jar, in .jar-wrap coordinates
const WALK_SPEED_PX = 42;
const FLOOR = 416; // where its paws touch the ground
const WALK_SPEED = 0.882; // how fast the paws carry the dog in the walking clip (animation.py)
const FADE_SECONDS = 0.16;
const random = gsap.utils.random;

export async function startSpriteDog() {
  const response = await fetch(`${BASE}manifest.json`);
  if (!response.ok) throw new Error(`manifest: ${response.status}`);
  const { frameSize, clips, groundX, groundY, bodyWidth, walkUnit } = await response.json();
  // The clips' speed as seen on screen, so the paws do not slide much along the floor.
  const WALK_PX = WALK_SPEED * walkUnit * SIZE;
  const sheets = {};
  // Waits for onload rather than decode(), which never finishes while the page is hidden.
  await Promise.all(Object.keys(clips).map(name => new Promise((done, fail) => {
    const image = new Image();
    image.onload = () => {
      sheets[name] = image;
      done();
    };
    image.onerror = () => fail(new Error(`could not load ${name}`));
    image.src = `${BASE}${name}.png`;
  })));

  const wrap = document.getElementById("jarWrap");
  const shadow = document.createElement("div");
  shadow.className = "dog-sprite-shadow";
  const canvas = document.createElement("canvas");
  canvas.className = "dog-sprite";
  canvas.width = canvas.height = frameSize;
  canvas.style.transformOrigin = `${groundX * 100}% ${groundY * 100}%`;
  wrap.append(shadow, canvas);
  document.body.classList.add("dog-sprite-on");
  const ctx = canvas.getContext("2d");

  // ---------- Playing clips ----------
  const now = { name: "Idle", clock: 0, rate: 1, finished: null };
  let previous = null, fade = 1, shown = "", nextBlink = performance.now() + 3000;

  function draw(name, index, alpha) {
    const { columns } = clips[name];
    ctx.globalAlpha = alpha;
    ctx.drawImage(sheets[name], (index % columns) * frameSize, Math.floor(index / columns) * frameSize, frameSize, frameSize, 0, 0, frameSize, frameSize);
  }

  // Starts a clip with a short fade from the last picture. A clip that ends resolves the returned promise.
  function play(name, { rate = 1, cut = false } = {}) {
    if (now.name === name && clips[name].loops) {
      now.rate = rate;
      return Promise.resolve();
    }
    now.finished?.();
    const clip = clips[now.name];
    previous = cut ? null : { name: now.name, frame: Math.min(Math.floor(now.clock) % clip.frames, clip.frames - 1) };
    fade = cut ? 1 : 0;
    Object.assign(now, { name, clock: 0, rate, finished: null });
    return new Promise(done => {
      if (clips[name].loops) done();
      else now.finished = done;
    });
  }

  function tick(_time, deltaMs) {
    const seconds = Math.min(deltaMs / 1000, 0.1);
    const clip = clips[now.name];
    now.clock += seconds * clip.fps * now.rate;
    fade = Math.min(1, fade + seconds / FADE_SECONDS);
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
        nextBlink = performance.now() + random(2500, 6000);
        if (now.name === "Blink") play("Idle", { cut: true });
      });
      return;
    }

    // Slow clips blend from picture to picture, which keeps gentle movement smooth at few pictures.
    const between = clip.fps <= 10 ? Math.floor((now.clock - whole) * 3) / 3 : 0;
    const key = `${now.name}:${whole}:${between}:${fade.toFixed(2)}`;
    if (key === shown) return;
    shown = key;
    ctx.clearRect(0, 0, frameSize, frameSize);
    if (fade < 1 && previous) draw(previous.name, previous.frame, Math.min(1, 2 * (1 - fade)));
    const alpha = Math.min(1, 2 * fade);
    draw(now.name, whole, alpha);
    if (between) draw(now.name, (whole + 1) % clip.frames, between * alpha);
  }

  // ---------- Walking back and forth in front of the jar, and no further than its width ----------
  const stage = { x: (JAR_LEFT + JAR_RIGHT) / 2, hop: 0, facing: 1 }; // the pictures face left, so facing 1 is left
  const halfBody = (bodyWidth * SIZE) / 2;
  const shadowWidth = bodyWidth * SIZE * 1.15;
  shadow.style.width = `${shadowWidth}px`;
  const place = () => {
    const y = FLOOR - groundY * SIZE + stage.hop;
    canvas.style.transform = `translate(${(stage.x - groundX * SIZE).toFixed(2)}px, ${y.toFixed(2)}px) scaleX(${stage.facing.toFixed(3)})`;
    const lift = Math.min(1, -stage.hop / 60);
    shadow.style.transform = `translate(${(stage.x - shadowWidth / 2).toFixed(2)}px, ${FLOOR - 10}px) scale(${(1 - lift * 0.3).toFixed(3)})`;
    shadow.style.opacity = (1 - lift * 0.5).toFixed(3);
  };

  const sceneScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
  const range = () => {
    const box = wrap.getBoundingClientRect(), s = sceneScale();
    return {
      left: Math.max(-box.left / s + halfBody, JAR_LEFT + halfBody),
      right: Math.min((innerWidth - box.left) / s - halfBody, JAR_RIGHT - halfBody)
    };
  };
  place();
  gsap.ticker.add(tick);
  tick(0, 0);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.ticker.remove(tick);
    window.dogReact = () => {};
    return;
  }

  const tween = (target, vars) => new Promise(done => gsap.to(target, { ...vars, onComplete: done }));
  const rest = seconds => new Promise(done => gsap.delayedCall(seconds, done));

  let interrupt = null;
  // Walks to a spot on the other side of the jar, or until a gift interrupts.
  async function walkAcross() {
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

  // The clip crouches, pushes off and lands; the hop adds height while the paws are off the ground.
  const JUMP_LENGTH = clips.Jump.frames / clips.Jump.fps;
  async function leap(height = 26) {
    const ended = play("Jump");
    gsap.timeline({ delay: JUMP_LENGTH * 0.2, onUpdate: place })
      .to(stage, { hop: -height, duration: JUMP_LENGTH * 0.26, ease: "power2.out" })
      .to(stage, { hop: 0, duration: JUMP_LENGTH * 0.24, ease: "power2.in" });
    await ended;
    play("Idle");
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
          await rest(random(1.4, 3.2));
          if (over) return;
          const act = random(["TailWag", "Joy", "Joy", "Pant", "HeadTilt", "HeadTilt", "Surprised", "Yawn", "Hop", "Idle"]);
          if (act === "Hop") {
            await leap(random(18, 30));
          } else if (act === "TailWag" || act === "Joy" || act === "Pant") {
            play(act);
            await rest(random(1.2, 2.4));
          } else if (act === "Surprised") {
            await play("Surprised");
            await rest(random(0.5, 0.9));
          } else if (act !== "Idle") {
            await play(act);
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
      await walkAcross();
      await cheer();
      // A little hop of its own now and then, gift or no gift.
      if (Math.random() < 0.2) await leap(random(18, 30));
      // A rest now and then, to change expression.
      if (Math.random() < 0.6) {
        await calm(random(3, 6));
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
}

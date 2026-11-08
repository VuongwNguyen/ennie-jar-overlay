// The poodle built in Blender (see blender_pipeline), loaded as a GLB with real curly fur.
// Open the overlay with ?dog=glb to use it. It walks and runs along the floor, sits, wags its tail,
// tilts its head, and jumps for joy when a gift lands.
import * as THREE from "three";
import { GLTFLoader } from "/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "/addons/RoomEnvironment.js";

const UNIT_PX = 44, CENTER_Y = 1.91, FOV = 24;
const HOME_X = 240; // centre of the dog, in .jar-wrap coordinates
const WALK_SPEED = 0.882, RUN_SPEED = 4.107; // scene units per second at normal clip speed
const FPS = 30;
const random = gsap.utils.random;

export async function startGlbDog() {
  const canvas = document.getElementById("dogCanvas");
  const gltf = await new GLTFLoader().loadAsync("/models/poodle_web.glb");

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const studio = new THREE.PMREMGenerator(renderer);
  scene.environment = studio.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  studio.dispose();
  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x6e4a38, 0.75));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.5);
  key.position.set(-2.5, 4.5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc6e6, 1);
  rim.position.set(3, 3, -4);
  scene.add(rim);

  const dog = gltf.scene;
  dog.traverse(node => { if (node.isSkinnedMesh || node.isMesh) node.frustumCulled = false; });
  scene.add(dog);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  const resize = () => {
    const box = canvas.getBoundingClientRect(), w = canvas.offsetWidth, h = canvas.offsetHeight;
    renderer.setPixelRatio(Math.min(Math.max(1, (box.width / w) * devicePixelRatio), 3));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, CENTER_Y, h / UNIT_PX / 2 / Math.tan((FOV / 2) * (Math.PI / 180)));
    camera.updateProjectionMatrix();
  };
  document.body.classList.add("dog-3d");
  canvas.addEventListener("webglcontextlost", () => document.body.classList.remove("dog-3d"));
  addEventListener("resize", () => setTimeout(resize, 0));
  resize();

  // ---------- Clips ----------
  const mixer = new THREE.AnimationMixer(dog);
  const clips = Object.fromEntries(gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  for (const name of ["SitDown", "StandUp", "Jump", "HeadTilt"]) {
    clips[name].setLoop(THREE.LoopOnce);
    clips[name].clampWhenFinished = true;
  }
  let current = clips.Sit;
  current.play();
  function play(name, fade = 0.25, speed = 1) {
    const next = clips[name];
    next.timeScale = speed;
    if (next === current) return next;
    next.reset().play();
    current.crossFadeTo(next, fade, false);
    current = next;
    return next;
  }
  const finished = action => new Promise(done => {
    const handler = event => {
      if (event.action === action) { mixer.removeEventListener("finished", handler); done(); }
    };
    mixer.addEventListener("finished", handler);
  });

  // ---------- Small touches on top of the clips: head turn, blinking, panting ----------
  const head = dog.getObjectByName("Head");
  const parts = name => dog.getObjectByName(name);
  const eyes = ["Eye_L", "Eye_R", "EyeShine_L", "EyeShine_R"].map(parts).filter(Boolean);
  const eyeY = eyes.map(eye => eye.scale.y);
  const mouth = parts("Mouth"), tongue = parts("Tongue");
  const mouthY = mouth?.scale.y ?? 1, tongueY = tongue?.scale.y ?? 1, tongueAt = tongue?.position.y ?? 0;
  const face = { yaw: 0, facing: 0.3, blink: 1, pant: 0, open: 0 };
  const yaw = new THREE.Quaternion(), upAxis = new THREE.Vector3(0, 1, 0);
  const headFromClip = head ? head.quaternion.clone() : new THREE.Quaternion();
  const blink = () => {
    gsap.timeline({ onComplete: () => gsap.delayedCall(random(2.6, 5.5), blink) })
      .to(face, { blink: 0.08, duration: 0.07, ease: "power1.in" })
      .to(face, { blink: 1, duration: 0.09, ease: "power1.out" });
  };
  gsap.delayedCall(2, blink);

  let last = 0, time = 0;
  gsap.ticker.add((_t, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.1);
    time += dt;
    // A clip that keeps the head still has no keys for it, so the mixer leaves the bone alone. The
    // turn is therefore removed before each update; otherwise it would add up and spin the head.
    if (head) head.quaternion.copy(headFromClip);
    mixer.update(dt);
    dog.rotation.y = face.facing;
    if (head) {
      headFromClip.copy(head.quaternion);
      yaw.setFromAxisAngle(upAxis, face.yaw);
      head.quaternion.multiply(yaw);
    }
    eyes.forEach((eye, i) => { eye.scale.y = eyeY[i] * face.blink; });
    const open = Math.max(face.open, face.pant * (0.55 + Math.sin(time * 14) * 0.15));
    if (mouth) mouth.scale.y = mouthY * (1 + open * 3.2);
    if (tongue) {
      tongue.scale.y = tongueY * (1 + open * 1.1);
      tongue.position.y = tongueAt;
    }
    if (_t - last < 1 / FPS) return;
    last = _t;
    renderer.render(scene, camera);
  });

  // ---------- Life on the floor ----------
  const stage = { x: 0, y: 0 };
  const place = () => gsap.set(canvas, { x: stage.x, y: stage.y });
  const wrap = document.getElementById("jarWrap");
  const sceneScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
  const bounds = () => {
    const box = wrap.getBoundingClientRect(), s = sceneScale();
    return { min: -box.left / s + 110 - HOME_X, max: (innerWidth - box.left) / s - 110 - HOME_X };
  };
  const within = x => { const { min, max } = bounds(); return Math.min(max, Math.max(min, x)); };
  const tween = (target, vars) => new Promise(done => gsap.to(target, { ...vars, onComplete: done }));
  const rest = seconds => new Promise(done => gsap.delayedCall(seconds, done));
  let sitting = true, lastDir = 1;

  async function standUp() {
    if (!sitting) return;
    sitting = false;
    await finished(play("StandUp", 0.15));
  }
  async function sitDown() {
    if (sitting) return;
    sitting = true;
    gsap.to(face, { facing: 0.3, yaw: -0.3, duration: 0.45, ...{ ease: "sine.inOut" } });
    await finished(play("SitDown", 0.2));
    play("Sit", 0.2);
  }
  async function go(x, fast) {
    const distance = Math.abs(x - stage.x);
    if (distance < 20) return;
    await standUp();
    const dir = (lastDir = Math.sign(x - stage.x));
    const px = fast ? random(170, 230) : random(60, 90);
    play(fast ? "Run" : "Walk", 0.25, px / UNIT_PX / (fast ? RUN_SPEED : WALK_SPEED));
    gsap.to(face, { facing: dir * 1.4, yaw: dir * -0.5, pant: Math.random() < 0.7 ? 1 : 0, duration: 0.35, ease: "sine.inOut" });
    await tween(stage, { x, duration: distance / px, ease: "none", onUpdate: place });
    gsap.to(face, { pant: 0, duration: 0.6 });
    play("Idle", 0.25);
  }
  async function leap(height = 50) {
    await standUp();
    const landing = within(stage.x + lastDir * random(30, 60));
    const action = play("Jump", 0.1);
    gsap.to(face, { open: 0.8, duration: 0.15 });
    await rest(0.16);
    gsap.to(stage, { x: landing, duration: 0.38, ease: "none", onUpdate: place });
    await tween(stage, { y: -height, duration: 0.2, ease: "power2.out", onUpdate: place });
    await tween(stage, { y: 0, duration: 0.18, ease: "power2.in", onUpdate: place });
    gsap.to(face, { open: 0, duration: 0.3 });
    await finished(action);
    play("Idle", 0.2);
  }

  let cheerTier = null, lastCheer = 0, wake = null;
  function calm(seconds) {
    return new Promise(done => {
      const finish = () => { timer.kill(); wake = null; done(); };
      const timer = gsap.delayedCall(seconds, finish);
      wake = finish;
    });
  }
  async function cheer() {
    if (cheerTier == null) return;
    const tier = cheerTier;
    cheerTier = null;
    lastCheer = performance.now();
    for (let i = 0; i <= tier; i++) await leap(40 + tier * 22);
  }
  async function life() {
    for (;;) {
      const { min, max } = bounds();
      await go(random(min, max), Math.random() < 0.25);
      if (Math.random() < 0.5) await leap(random(40, 70));
      await cheer();
      if (Math.random() < 0.5) {
        await sitDown();
      } else {
        gsap.to(face, { yaw: lastDir * -0.9, duration: 0.5, ease: "sine.inOut" });
        const treat = gsap.utils.random(["TailWag", "HeadTilt", "Idle"]);
        play(treat, 0.25);
      }
      await calm(random(2, 6));
      await cheer();
    }
  }
  gsap.delayedCall(1.5, life);

  window.dogReact = (tier = 0) => {
    gsap.to(face, { pant: 1, duration: 0.15, overwrite: "auto" });
    gsap.to(face, { pant: 0, duration: 0.5, delay: 1 + tier * 0.4 });
    if (performance.now() - lastCheer < 2500) return;
    cheerTier = Math.max(cheerTier ?? 0, tier);
    wake?.();
  };
  return { clips: Object.keys(clips) };
}

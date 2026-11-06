// The welcome frame: a rose gold medallion with the viewer's picture, a banner with their name and
// Ennie's poodle, which bursts in and fades away after a few seconds. It is shown for the viewers picked
// on the control page, when they join the live (the server sends "welcome").
// On the jar overlay (overlay.html) it takes its drawing from welcome.html and sits above the jar, so no
// extra source is needed; overlay.html?welcome shows samples, ?welcome=hold keeps one on screen.
// welcome.html on its own shows the frame in the middle; there the options are ?test and ?test=hold.
(async () => {
  const NS = "http://www.w3.org/2000/svg";
  const $ = id => document.getElementById(id);
  const onJar = Boolean($("jarWrap"));
  if (!$("welcome")) {
    try {
      const page = new DOMParser().parseFromString(await (await fetch("/welcome.html")).text(), "text/html");
      document.body.append(document.adoptNode(page.getElementById("welcome")));
    } catch {
      return; // no frame, but the rest of the overlay carries on
    }
  }
  const frame = $("welcome"), art = $("welcomeArt");
  const random = gsap.utils.random;
  const SHOW_SECONDS = 4.8;
  const BANNER_AT = 0.85; // when the banner starts to slide out from behind the medallion
  // The drawing, from the wings to the bow and from the dog's head to the ribbon (see welcome.css).
  const DRAWING = { width: 702, height: 304 };

  // How wide the frame is on the jar overlay, as a share of the source's width: 0.6 leaves the streamer's
  // face clear on a 1080x1920 source. overlay.html?welcomesize=0.5 makes it smaller, 0.8 larger.
  const SHARE = Math.min(1, Math.max(0.3, Number(new URLSearchParams(location.search).get("welcomesize")) || 0.6));

  // On its own the frame takes most of the width of the source. On the jar it sits just above the jar
  // and the sticker on its rim, centred over the jar but kept on screen.
  function place() {
    const style = document.documentElement.style;
    if (!onJar) {
      style.setProperty("--fit", Math.min((innerWidth * 0.92) / 680, (innerHeight * 0.4) / 300));
      return;
    }
    const jar = $("jarWrap").getBoundingClientRect();
    const sticker = document.querySelector(".ennie-sticker")?.getBoundingClientRect();
    const top = Math.min(jar.top, sticker?.height ? sticker.top : jar.top);
    const margin = 12;
    const fit = Math.max(0.2, Math.min((innerWidth * SHARE) / DRAWING.width, (top - 2 * margin) / DRAWING.height));
    const half = (DRAWING.width * fit) / 2;
    const x = Math.min(Math.max(jar.left + jar.width / 2, margin + half), innerWidth - margin - half);
    style.setProperty("--fit", fit);
    style.setProperty("--x", `${x.toFixed(1)}px`);
    style.setProperty("--y", `${(top - margin - (DRAWING.height * fit) / 2).toFixed(1)}px`);
  }
  place();
  addEventListener("resize", place);

  // Pearls around the medallion.
  const pearls = $("wPearls");
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2;
    const pearl = document.createElementNS(NS, "circle");
    pearl.setAttribute("cx", (Math.cos(angle) * 100).toFixed(1));
    pearl.setAttribute("cy", (Math.sin(angle) * 100).toFixed(1));
    pearl.setAttribute("r", i % 3 ? 4.2 : 5.6);
    pearl.setAttribute("fill", "url(#wPearl)");
    pearls.append(pearl);
  }

  const svgEl = (name, attrs, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.append(node);
    return node;
  };
  // Rays of light behind the medallion, alternating long and short.
  const rays = $("wRays");
  for (let i = 0; i < 18; i++) {
    const long = i % 2 === 0, length = long ? 175 : 125, half = long ? 11 : 7;
    svgEl("path", { d: `M${-half} 0 L0 ${-length} L${half} 0Z`, fill: "url(#wRay)", transform: `rotate(${i * 20})` }, rays);
  }
  // Lace scallops along the bottom of the banner.
  const lace = $("wLace");
  for (let x = 228; x <= 620; x += 14) {
    svgEl("path", { d: `M${x - 7} 199 A7 7 0 0 0 ${x + 7} 199`, fill: "#ffffff", stroke: "#ff5fa8", "stroke-width": 1.6 }, lace);
    svgEl("circle", { cx: x, cy: 203, r: 1.6, fill: "#ff3d8a" }, lace);
  }
  // Small diamonds studded along the top edge of the banner, and glitter across it.
  const banner = $("wBanner");
  for (let x = 250; x <= 610; x += 24) {
    if (Math.abs(x - 430) < 20) continue; // the heart jewel sits there
    svgEl("path", { d: `M${x} 102 L${x + 5} 108 L${x} 114 L${x - 5} 108Z`, fill: "#ffffff", stroke: "url(#wGold)", "stroke-width": 1.3 }, banner);
  }
  const glitter = svgEl("g", { id: "wGlitter" }, banner);
  for (let i = 0; i < 46; i++) {
    svgEl("circle", { cx: random(232, 632).toFixed(1), cy: random(118, 192).toFixed(1), r: random(0.8, 2.2).toFixed(1), fill: random(["#ffffff", "#fff3b0", "#ffe0ef"]), opacity: random(0.35, 0.9).toFixed(2) }, glitter);
  }
  // A bow tied at the right end of the banner.
  const bow = svgEl("g", { transform: "translate(648 106) rotate(12)" }, banner);
  svgEl("path", { d: "M-2 2 C-6 14 -10 22 -16 30 L-8 28 L-4 36 C0 24 2 14 2 4Z M2 2 C6 14 10 22 16 30 L8 28 L4 36 C0 24 -2 14 -2 4Z", fill: "#d62f7c", stroke: "url(#wGold)", "stroke-width": 1 }, bow);
  svgEl("path", { d: "M0 0 C-14 -16 -28 -10 -24 0 C-28 10 -14 14 0 0Z M0 0 C14 -16 28 -10 24 0 C28 10 14 14 0 0Z", fill: "url(#wRibbon)", stroke: "url(#wGold)", "stroke-width": 1.4 }, bow);
  svgEl("circle", { r: 5, fill: "url(#wGold)" }, bow);
  // A strand of pearls hanging under the banner.
  const strand = $("wStrand"), strandLength = strand.getTotalLength(), strandPearls = $("wStrandPearls");
  for (let i = 0; i <= 26; i++) {
    const point = strand.getPointAtLength((i / 26) * strandLength);
    svgEl("circle", { cx: point.x.toFixed(1), cy: point.y.toFixed(1), r: i % 5 === 0 ? 4.6 : 3.4, fill: "url(#wPearl)" }, strandPearls);
  }
  for (const i of [6, 13, 20]) {
    const point = strand.getPointAtLength((i / 26) * strandLength);
    svgEl("use", { href: "#wHeartGem", transform: `translate(${point.x.toFixed(1)} ${(point.y + 9).toFixed(1)}) scale(.55)` }, strandPearls);
  }

  // The poodle waving and winking (media/welcome_dog.webm, keyed out of an AI-made green screen clip): it plays only while
  // the frame is shown, from the start each time, so every welcome opens with the wave.
  const dog = $("welcomeDog");
  dog.addEventListener("error", () => dog.remove());
  function dogPlay() {
    if (dog.readyState < 2) {
      // Still loading (the first welcome after the page opens): start as soon as it can.
      dog.addEventListener("canplay", () => { if (frame.classList.contains("show")) dog.play().catch(() => {}); }, { once: true });
      return;
    }
    dog.currentTime = 0;
    dog.play().catch(() => {});
  }

  // Little four-pointed stars that twinkle around the frame while it is shown.
  const STAR = "M7 0 C7.6 5 9 6.4 14 7 C9 7.6 7.6 9 7 14 C6.4 9 5 7.6 0 7 C5 6.4 6.4 5 7 0Z";
  function sparkle(x, y, size, delay) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 14 14");
    svg.classList.add("welcome-spark");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", STAR);
    path.setAttribute("fill", random(["#fff8d6", "#ffffff", "#ffd1e6"]));
    svg.append(path);
    art.append(svg);
    gsap.set(svg, { x, y, scale: 0, rotation: random(-30, 30) });
    gsap.timeline({ delay, onComplete: () => svg.remove() })
      .to(svg, { scale: size, duration: 0.35, ease: "back.out(3)" })
      .to(svg, { rotation: "+=90", duration: 1.2, ease: "none" }, 0)
      .to(svg, { scale: 0, opacity: 0, duration: 0.4, ease: "power1.in" }, 0.8);
  }
  // Big stars that grow and spin slowly behind the frame, then fade, one after another.
  function flare(x, y, delay) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 14 14");
    svg.classList.add("welcome-flare");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", STAR);
    path.setAttribute("fill", random(["#ffc1dd", "#ffd6ea", "#fff3c4", "#ffffff"]));
    svg.append(path);
    art.prepend(svg); // behind the frame, so the name stays easy to read
    gsap.set(svg, { x, y, scale: 0.1, opacity: 0, rotation: random(-45, 45) });
    gsap.timeline({ delay, onComplete: () => svg.remove() })
      // Kept fainter and smaller than the frame: on stream they sit over the streamer's face.
      .to(svg, { scale: random(0.8, 1.25), opacity: random(0.35, 0.55), duration: 0.9, ease: "power2.out" })
      .to(svg, { rotation: "+=60", duration: 2.2, ease: "none" }, 0)
      .to(svg, { scale: "+=0.3", opacity: 0, duration: 1.1, ease: "power1.in" }, 1.1);
  }
  function flares() {
    // Around the edges of the frame, where they show past it.
    const spots = [[136, 144], [20, 40], [660, 70], [560, 270], [60, 285], [360, 20], [470, 250]];
    spots.forEach(([x, y], i) => flare(x + random(-30, 30), y + random(-30, 30), i * 0.35));
  }

  function sparkles(count, spread) {
    for (let i = 0; i < count; i++) {
      const nearMedallion = Math.random() < 0.45;
      const x = nearMedallion ? 136 + random(-110, 110) : random(220, 660);
      const y = nearMedallion ? 144 + random(-110, 110) : random(90, 220);
      sparkle(x, y, random(0.7, 1.6), random(0, spread));
    }
  }

  // Hearts and petals that burst out when the frame appears, then keep drifting while it is shown.
  const BITS = ["♥", "♥", "❀", "✿", "♡", "✦"];
  const BIT_COLOURS = ["#ff5fa8", "#ff8fc4", "#ffc1dd", "#ffd76a", "#ffffff", "#e8549a"];
  function bit(fromX, fromY, burst) {
    const node = document.createElement("span");
    node.className = "welcome-bit";
    node.textContent = random(BITS);
    node.style.color = random(BIT_COLOURS);
    node.style.fontSize = `${random(burst ? 14 : 12, burst ? 30 : 22)}px`;
    art.append(node);
    const angle = random(0, Math.PI * 2), distance = burst ? random(80, 220) : 0;
    const duration = burst ? random(1.1, 1.8) : random(2.4, 3.6);
    gsap.set(node, { x: fromX, y: fromY, scale: 0.3, opacity: 0, rotation: random(-40, 40) });
    gsap.timeline({ onComplete: () => node.remove() })
      .to(node, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(3)" }, 0)
      .to(node, burst
        ? { x: fromX + Math.cos(angle) * distance, y: fromY + Math.sin(angle) * distance * 0.6 + 40, rotation: random(-180, 180), duration, ease: "power2.out" }
        : { x: fromX + random(-40, 40), y: fromY + random(70, 140), rotation: random(-120, 120), duration, ease: "sine.inOut" }, 0)
      .to(node, { opacity: 0, duration: duration * 0.35, ease: "power1.in" }, duration * 0.65);
  }

  // The burst when the frame lands: a flash, rings of light rushing out, and confetti thrown up.
  const CONFETTI = ["#ff3d8a", "#ff8fc4", "#ffd056", "#ffffff", "#ff6fae", "#ffe08a", "#c084fc"];
  // Confetti, hearts and petals thrown out along the banner as it opens.
  function bannerBurst() {
    for (let i = 0; i < 40; i++) confetti(random(260, 640), 155);
    for (let i = 0; i < 30; i++) bit(random(250, 640), 150, true);
  }
  function confetti(fromX, fromY) {
    const piece = document.createElement("div");
    piece.className = "welcome-confetti";
    piece.style.background = random(CONFETTI);
    art.append(piece);
    const angle = random(-Math.PI, 0), power = random(160, 420);
    gsap.set(piece, { x: fromX, y: fromY, rotation: random(0, 360), scale: random(0.6, 1.3) });
    gsap.timeline({ onComplete: () => piece.remove() })
      .to(piece, { x: fromX + Math.cos(angle) * power, y: fromY + Math.sin(angle) * power * 0.7, duration: 0.6, ease: "power3.out" })
      .to(piece, { y: `+=${random(180, 320)}`, x: `+=${random(-60, 60)}`, rotation: `+=${random(360, 900)}`, rotationX: random(360, 1080), duration: random(1.4, 2.2), ease: "power1.in" })
      .to(piece, { opacity: 0, duration: 0.5 }, "-=0.5");
  }
  function boom() {
    const flash = document.createElement("div");
    flash.className = "welcome-flash";
    art.append(flash);
    gsap.fromTo(flash, { scale: 0.2, opacity: 1 }, { scale: 3.2, opacity: 0, duration: 0.7, ease: "power2.out", onComplete: () => flash.remove() });
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement("div");
      ring.className = "welcome-ring";
      art.append(ring);
      gsap.fromTo(ring, { scale: 0.3, opacity: 1, borderWidth: 10 }, {
        scale: 3.4 + i * 0.6, opacity: 0, borderWidth: 1, duration: 0.9 + i * 0.15, delay: i * 0.12, ease: "power2.out",
        onComplete: () => ring.remove()
      });
    }
    for (let i = 0; i < 40; i++) confetti(136, 144);
    for (let i = 0; i < 60; i++) bit(136, 144, true);
  }

  // Motion that runs only while the frame is shown.
  let loops = [];
  function startLoops() {
    // The sticker on the jar's rim can appear after the frame (just after the page opens): keep clear of it.
    if (onJar) loops.push(gsap.to({}, { duration: 0.5, repeat: -1, onRepeat: place }));
    loops.push(gsap.to("#wRays", { rotation: 360, svgOrigin: "136 144", duration: 18, ease: "none", repeat: -1 }));
    loops.push(gsap.to("#wDotRing", { rotation: -360, svgOrigin: "0 0", duration: 12, ease: "none", repeat: -1 }));
    // Glitter on the banner twinkles.
    loops.push(gsap.to("#wGlitter circle", { opacity: () => random(0.1, 1), duration: 0.5, ease: "sine.inOut", stagger: { each: 0.03, repeat: -1, yoyo: true } }));
    loops.push(gsap.fromTo("#wAura", { opacity: 0.6, scale: 0.94, svgOrigin: "136 144" }, { opacity: 1, scale: 1.06, svgOrigin: "136 144", duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    // Butterflies circle the frame, flapping.
    [["#wFly1", 40, 40, 0.9], ["#wFly2", 600, 60, 0.75], ["#wFly3", 330, 250, 0.65]].forEach(([id, x, y, size], i) => {
      gsap.set(id, { x, y, scale: size, transformOrigin: "50% 50%" });
      loops.push(gsap.to(id, { x: `+=${random(60, 120) * (i % 2 ? -1 : 1)}`, y: `+=${random(-40, 30)}`, duration: random(1.6, 2.4), ease: "sine.inOut", yoyo: true, repeat: -1 }));
      loops.push(gsap.fromTo(`${id}`, { scaleX: size }, { scaleX: size * 0.25, duration: 0.14, ease: "sine.inOut", yoyo: true, repeat: -1 }));
    });
    // A steady drift of hearts and petals from above.
    loops.push(gsap.delayedCall(0, function drift() {
      bit(random(0, 660), random(-30, 60), false);
      loops.push(gsap.delayedCall(0.12, drift));
    }));
  }
  function stopLoops() {
    for (const loop of loops) loop.kill();
    loops = [];
  }

  // The jar overlay already has a connection (overlay.js); welcome.html on its own opens one.
  const link = typeof socket !== "undefined" ? socket : io();
  // With this many waiting, each frame plays faster (about 3 seconds instead of 5) so the line moves.
  const CROWD = 3, CROWD_SECONDS = 3;

  let playing = null;
  function show({ key, name, avatar, badge = "KHÁCH QUÝ" }) {
    // Tells the server this person's frame is on screen; only shown frames count towards their limit.
    if (key) link.emit("welcome-shown", key);
    $("welcomeName").textContent = name;
    // A long title ("NHÀ TÀI TRỢ") gets smaller letters, so it stays on the ribbon.
    const ribbon = $("welcomeBadge");
    ribbon.textContent = badge;
    ribbon.style.fontSize = ribbon.style.letterSpacing = "";
    for (let size = 14; ribbon.scrollWidth > ribbon.clientWidth && size > 8; size -= 0.5) {
      ribbon.style.fontSize = `${size}px`;
      ribbon.style.letterSpacing = `${Math.max(0, (size - 10) / 2)}px`;
    }
    const picture = $("welcomeAvatar");
    picture.replaceChildren();
    if (avatar) {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = avatar;
      img.onerror = () => { picture.textContent = [...name][0]?.toUpperCase() ?? "♡"; img.remove(); };
      picture.append(img);
    } else {
      picture.textContent = [...name][0]?.toUpperCase() ?? "♡";
    }

    place(); // the jar may have moved or been resized since the page opened
    frame.classList.add("show");
    playing?.kill();
    stopLoops();
    startLoops();
    dogPlay();
    playing = gsap.timeline({ onComplete: () => { stopLoops(); dog.pause?.(); frame.classList.remove("show"); next(); } })
      // Slams in from nothing, overshoots, wobbles into place, and shakes on landing.
      .fromTo(art, { opacity: 0, scale: 0.15, rotation: -12, x: 0 }, { opacity: 1, scale: 1.18, rotation: 3, duration: 0.32, ease: "power3.out", transformOrigin: "20% 50%" })
      .add(boom, 0.28)
      .to(art, { scale: 1, rotation: 0, duration: 0.7, ease: "elastic.out(1, 0.45)" }, 0.32)
      .to(art, { keyframes: { x: [0, -12, 10, -8, 6, -3, 0] }, duration: 0.45, ease: "none" }, 0.32)
      .fromTo(".welcome-avatar", { scale: 0, rotation: -540 }, { scale: 1, rotation: 0, duration: 0.8, ease: "back.out(2.2)" }, 0.1)
      // The medallion lands first; then the banner slides out from behind it.
      .set(["#wChiffons", ".welcome-dog", ".welcome-text > *"], { opacity: 0 }, 0)
      .fromTo("#wBannerRect", { attr: { width: 0 } }, { attr: { width: 520 }, duration: 0.55, ease: "power3.out" }, BANNER_AT)
      .add(bannerBurst, BANNER_AT + 0.2)
      .to("#wChiffons", { opacity: 0.9, duration: 0.5 }, BANNER_AT + 0.1)
      .fromTo(".welcome-text > *", { scale: 2.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, stagger: 0.1, ease: "back.out(3)" }, BANNER_AT + 0.3)
      .fromTo(".welcome-dog", { y: -160, opacity: 0, rotation: -20 }, { y: 0, opacity: 1, rotation: 0, duration: 0.65, ease: "bounce.out" }, BANNER_AT + 0.45)
      .fromTo("#wShineBar", { attr: { x: -120 } }, { attr: { x: 760 }, duration: 0.9, ease: "power1.inOut" }, BANNER_AT + 0.5)
      .fromTo("#wRays", { opacity: 0, scale: 0.2, svgOrigin: "136 144" }, { opacity: 1, scale: 1.7, svgOrigin: "136 144", duration: 0.45, ease: "power3.out" }, 0.25)
      .to("#wRays", { opacity: 0.85, scale: 1, svgOrigin: "136 144", duration: 0.9, ease: "power2.inOut" }, 0.7)
      .add(() => sparkles(22, 0.6), 0.2)
      .add(flares, 0.1)
      .add(flares, 2.2)
      .add(() => sparkles(14, 1.5), 1.6)
      .add(() => sparkles(12, 1.2), 3)
      .fromTo("#wShineBar", { attr: { x: -120 } }, { attr: { x: 760 }, duration: 1.1, ease: "power1.inOut" }, 2.4)
      .to(art, { opacity: 0, y: -20, scale: 0.96, duration: 0.45, ease: "power1.in" }, SHOW_SECONDS);
    if (waiting.length >= CROWD) playing.timeScale((SHOW_SECONDS + 0.45) / CROWD_SECONDS);
  }

  // One welcome at a time. The others wait in a queue ordered by rank (1 picked by name, 2 team heart,
  // 3 gifter level) and, within a rank, by arrival. A full queue lets go of its lowest place, and tells
  // the server, so that person is not counted as welcomed.
  const QUEUE_MAX = 30;
  const waiting = [];
  // True from the moment a welcome is picked until it has faded out, including the short pause before
  // it starts, so several arriving together queue up instead of each starting one of their own.
  let busy = false;
  function next() {
    playing = null;
    const viewer = waiting.shift();
    busy = Boolean(viewer);
    if (viewer) gsap.delayedCall(0.3, () => show(viewer));
  }
  window.welcomeViewer = viewer => {
    if (!viewer?.name) return;
    // A page in the background (a hidden browser tab) cannot play the frame: it would only pile up.
    if (document.hidden) return;
    const rank = viewer.rank ?? 1;
    const at = waiting.findIndex(other => (other.rank ?? 1) > rank);
    waiting.splice(at < 0 ? waiting.length : at, 0, viewer);
    if (waiting.length > QUEUE_MAX) {
      const dropped = waiting.pop();
      if (dropped.key) link.emit("welcome-dropped", dropped.key);
    }
    if (!busy) next();
  };

  link.on("welcome", viewer => window.welcomeViewer(viewer));
  // Lets the server know a page that can show the frame is open (again after any reconnect), but only
  // while it is visible. Hidden, the browser stops its animation, so a frame would never finish and the
  // queue would only grow: the page says goodbye, empties its queue and stops, until it is shown again.
  const hello = () => { if (!document.hidden) link.emit("overlay-hello"); };
  link.on("connect", hello);
  if (link.connected) hello();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return hello();
    link.emit("overlay-bye");
    waiting.length = 0;
    playing?.kill();
    playing = null;
    stopLoops();
    dog.pause?.();
    frame.classList.remove("show");
    busy = false;
  });

  const test = new URLSearchParams(location.search).get(onJar ? "welcome" : "test");
  // ?welcome=hold (?test=hold on its own) keeps one sample on screen, to see where it sits.
  if (test === "hold") {
    busy = true; // the sample stays; real welcomes wait behind it
    show({ name: "Tên người xem", badge: "KHÁCH QUÝ" });
    playing.seek(2.4).pause();
  } else if (test !== null) {
    const samples = [
      { name: "🌙 𝑳𝑰𝑳𝒀𝑨 🌙" },
      { name: "Nik2026", badge: "TOP 1" },
      { name: "Trần Chí Hữu" },
      { name: "Khô Bòoo", badge: "HỘ VỆ" }
    ];
    let i = 0;
    const loop = () => { window.welcomeViewer(samples[i++ % samples.length]); gsap.delayedCall(SHOW_SECONDS + 1.2, loop); };
    gsap.delayedCall(0.6, loop);
  }
})();

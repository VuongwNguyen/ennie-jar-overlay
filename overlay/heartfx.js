// Plays the Ennie-and-heart clip (media/ennie_heart.webm) when someone sends the team heart gift.
// Runs in heart.html, an overlay of its own beside the jar (overlay.html), with its own connection.
// TikTok calls that gift "Heart Me" ("Tim đội" in the Vietnamese app). The clip is 1080x1920 with a
// transparent top, so it covers the whole source and only the garden at the bottom shows.
// While it plays, more of the same gift are ignored rather than queued: the gift costs 1 coin and
// often arrives dozens of times in a row, so a queue would keep the clip on screen for minutes.
(() => {
  // Matched by the gift's id, which is the same in every language. The server shows gift names in
  // Vietnamese (server/src/gift-names.js), so a test gift from the control page, which has no real id,
  // arrives as "Tim đội"; the English name is kept too, should a gift come through untranslated.
  const TRIGGER_ID = "7934";
  const TRIGGER_NAMES = ["heart me", "tim đội"];
  const video = document.getElementById("heartFx");
  if (!video) return;
  const socket = io();

  const matches = event => String(event?.gift?.id ?? "") === TRIGGER_ID
    || TRIGGER_NAMES.includes(String(event?.gift?.name ?? "").trim().toLowerCase());

  // At Christmas (season.js): snowflakes and a few gold stars falling over the clip while it plays, drawn on a
  // canvas only while it shows.
  const snow = (() => {
    const canvas = document.getElementById("heartSnow");
    if (!window.XMAS || !canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return { start() {}, stop() {} };
    const g = canvas.getContext("2d");
    let flakes = [], frame = 0, last = 0;
    const make = top => {
      const star = Math.random() < 0.12;
      return { x: Math.random() * canvas.width, y: top ? -20 : Math.random() * canvas.height, r: star ? 7 + Math.random() * 6 : 2 + Math.random() * 4.5,
        speed: 40 + Math.random() * 70, drift: Math.random() * Math.PI * 2, star };
    };
    function draw(now) {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (const f of flakes) {
        f.y += f.speed * dt;
        f.drift += dt;
        const x = f.x + Math.sin(f.drift) * 18;
        if (f.star) {
          g.fillStyle = "#ffd84a";
          g.font = `${f.r * 2.4}px "Segoe UI Symbol", sans-serif`;
          g.fillText("★", x, f.y);
        } else {
          g.fillStyle = "rgba(255,255,255,.9)";
          g.beginPath(); g.arc(x, f.y, f.r, 0, Math.PI * 2); g.fill();
        }
        if (f.y > canvas.height + 20) Object.assign(f, make(true));
      }
      frame = requestAnimationFrame(draw);
    }
    return {
      start() {
        canvas.width = innerWidth; canvas.height = innerHeight;
        flakes = Array.from({ length: Math.round(canvas.width * canvas.height / 9000) }, () => make(false));
        canvas.classList.add("show");
        cancelAnimationFrame(frame); last = 0; frame = requestAnimationFrame(draw);
      },
      stop() { cancelAnimationFrame(frame); canvas.classList.remove("show"); }
    };
  })();

  function hide() {
    video.classList.remove("show");
    video.pause();
    snow.stop();
  }

  async function play() {
    if (video.classList.contains("show")) return;
    video.currentTime = 0;
    video.muted = false;
    video.classList.add("show");
    snow.start();
    try {
      await video.play();
    } catch {
      // Some players only allow autoplay without sound; show the clip silently rather than not at all.
      video.muted = true;
      try { await video.play(); } catch { hide(); }
    }
  }

  video.addEventListener("ended", hide);
  video.addEventListener("error", hide);
  const params = new URLSearchParams(location.search);
  // ?hold (the layout page's preview): one still, silent frame of the clip, to see where it sits.
  if (params.has("hold")) {
    video.muted = true;
    video.addEventListener("loadeddata", () => { video.currentTime = Math.min(2.5, video.duration / 2 || 0); }, { once: true });
    video.classList.add("show");
    snow.start();
    return;
  }
  socket.on("gift", event => { if (matches(event)) play(); });
  // "Tải lại overlay" on the control page, when this page is a source of its own (live.html reloads itself).
  socket.on("overlay-reload", () => { if (window.top === window) location.reload(); });
  if (params.has("test")) setTimeout(play, 1000);
})();

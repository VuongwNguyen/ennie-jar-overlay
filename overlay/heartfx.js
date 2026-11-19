// Plays the Ennie-and-heart clip (media/ennie_heart.webm) when someone sends the team heart gift.
// Runs in heart.html, an overlay of its own beside the jar (overlay.html), with its own connection.
// TikTok calls that gift "Heart Me" ("Thả tim cho tôi" in the Vietnamese app; viewers call it "tim đội"). The clip is 1080x1920 with a
// transparent top, so it covers the whole source and only the garden at the bottom shows.
// While it plays, more of the same gift are ignored rather than queued: the gift costs 1 coin and
// often arrives dozens of times in a row, so a queue would keep the clip on screen for minutes.
(() => {
  // Matched by the gift's id, which is the same in every language. The server shows gift names in
  // Vietnamese (server/src/gift-names.js), so a test gift from the control page, which has no real id,
  // arrives as "Thả tim cho tôi"; the English name is kept too, should a gift come through untranslated.
  const TRIGGER_ID = "7934";
  const TRIGGER_NAMES = ["heart me", "thả tim cho tôi", "tim đội"];
  const video = document.getElementById("heartFx");
  if (!video) return;
  const socket = io();

  const matches = event => String(event?.gift?.id ?? "") === TRIGGER_ID
    || TRIGGER_NAMES.includes(String(event?.gift?.name ?? "").trim().toLowerCase());

  function hide() {
    video.classList.remove("show");
    video.pause();
  }

  async function play() {
    if (video.classList.contains("show")) return;
    video.currentTime = 0;
    video.muted = false;
    video.classList.add("show");
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
    return;
  }
  socket.on("gift", event => { if (matches(event)) play(); });
  // "Tải lại overlay" on the control page, when this page is a source of its own (live.html reloads itself).
  socket.on("overlay-reload", () => { if (window.top === window) location.reload(); });
  if (params.has("test")) setTimeout(play, 1000);
})();

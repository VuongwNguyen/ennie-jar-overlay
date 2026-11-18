// The look for a time of year, over the usual one: "none" (the usual pink) or "noel" (Christmas). Chosen on the
// control page (data/effects.json, season), or with ?season=noel / ?season=none in the address, which wins.
// Loaded first on every overlay page, in <head>, so the page is dressed before anything is drawn: it puts a
// class on <html> (xmas.css styles only under html.xmas) and sets window.SEASON / window.XMAS for the scripts.
// The usual look stays exactly as it was; every Christmas change is guarded by that class or flag.
(() => {
  const SEASONS = ["none", "noel"];
  const asked = new URLSearchParams(location.search).get("season");
  let season = "none";
  if (asked) {
    season = SEASONS.includes(asked) ? asked : "none";
  } else {
    try {
      // One quick request to this same server, waited for, so the page never starts in the wrong look.
      const request = new XMLHttpRequest();
      request.open("GET", "/api/effects", false);
      request.send();
      const saved = JSON.parse(request.responseText)?.season;
      if (SEASONS.includes(saved)) season = saved;
    } catch { /* the usual look */ }
  }
  window.SEASON = season;
  window.XMAS = season === "noel";
  if (window.XMAS) document.documentElement.classList.add("xmas");

  // Switched on the control page: the page starts over in the new look (live.html reloads its frames itself
  // as they reload). A ?season in the address stays as it is.
  if (asked) return;
  addEventListener("DOMContentLoaded", () => {
    if (!window.io) return;
    const socket = window.io();
    socket.on("effects", settings => {
      if (SEASONS.includes(settings?.season) && settings.season !== season) location.reload();
    });
  });
})();

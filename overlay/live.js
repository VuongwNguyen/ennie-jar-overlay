// Lays out the parts of the overlay on the single Studio source (live.html). Each part is its own page in
// a frame, placed on a 1080x1920 stage by the layout from the server (data/layout.json), which the layout
// page (layout.html) changes. The stage is scaled to fit the source, so any source size shows the same.
(() => {
  const STAGE = { w: 1080, h: 1920 };
  const params = new URLSearchParams(location.search);
  const preview = params.has("preview");
  const stage = document.getElementById("stage");

  // The page shown in each part. On the jar the welcome frame is left out, since it has a part of its own.
  // The welcome frame may draw outside its box, by BLEED of the box on each side, so its bursts of light
  // are not cut off at the edge; welcome.html?layer fits the drawing to the box in the middle.
  const BLEED = { welcome: 0.3 };
  function source(id) {
    const query = new URLSearchParams();
    if (id === "jar") {
      query.set("nowelcome", "");
      for (const key of ["jar", "dog", "cat", "nosticker"]) if (params.has(key)) query.set(key, params.get(key));
    }
    if (id === "welcome") query.set("layer", "");
    if (preview) {
      query.set("preview", "");
      if (id === "welcome") query.set("test", "hold");
      if (id === "heart") query.set("hold", "");
    }
    const page = { jar: "/overlay.html", welcome: "/welcome.html", heart: "/heart.html" }[id];
    const search = query.toString().replace(/=(&|$)/g, "$1");
    return page && (search ? `${page}?${search}` : page);
  }

  const frames = new Map();
  // How far a part's page reaches above its box (only the jar's does, up to the gifts' ceiling).
  function tellRaise(frame) {
    try { frame.contentWindow?.postMessage({ type: "raise", px: Number(frame.dataset.raise) || 0 }, location.origin); } catch { /* not loaded */ }
  }
  function frameFor(id) {
    if (frames.has(id)) return frames.get(id);
    const src = source(id);
    if (!src) return null;
    const frame = document.createElement("iframe");
    frame.className = "layer";
    frame.dataset.id = id;
    frame.allow = "autoplay";
    frame.setAttribute("aria-hidden", "true");
    frame.src = src;
    frame.addEventListener("load", () => tellRaise(frame));
    stage.append(frame);
    frames.set(id, frame);
    return frame;
  }

  function apply(layers) {
    if (!Array.isArray(layers)) return;
    layers.forEach((layer, index) => {
      // A hidden part is closed, not just made invisible: hidden, the heart clip would still be heard and
      // the welcome frame would still take welcomes that nobody sees. Shown again, it loads afresh.
      if (layer.visible === false) {
        frames.get(layer.id)?.remove();
        frames.delete(layer.id);
        return;
      }
      const frame = frameFor(layer.id);
      if (!frame) return;
      const bleed = BLEED[layer.id] ?? 0;
      // The jar's page reaches up to the ceiling the gifts fall from (drop), when that is above its box;
      // the page is told how much it got, and keeps the jar in the box below it.
      const raise = Number.isFinite(layer.drop) ? Math.max(0, layer.y - layer.drop) : 0;
      const style = frame.style;
      style.left = `${layer.x - layer.w * bleed}px`;
      style.top = `${layer.y - layer.h * bleed - raise}px`;
      style.width = `${layer.w * (1 + 2 * bleed)}px`;
      style.height = `${layer.h * (1 + 2 * bleed) + raise}px`;
      if (frame.dataset.raise !== String(raise)) {
        frame.dataset.raise = String(raise);
        tellRaise(frame);
      }
      style.zIndex = String(index + 1); // first in the list is the bottom layer
    });
  }

  function fit() {
    const scale = Math.min(innerWidth / STAGE.w, innerHeight / STAGE.h);
    const left = (innerWidth - STAGE.w * scale) / 2, top = (innerHeight - STAGE.h * scale) / 2;
    stage.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
  }
  fit();
  addEventListener("resize", fit);

  // The layout page moves its preview while a part is being dragged, before the change is saved.
  if (preview) {
    addEventListener("message", event => {
      if (event.origin === location.origin && event.data?.type === "layout") apply(event.data.layers);
    });
  }

  const socket = io();
  socket.on("layout", layers => { if (!preview) apply(layers); });
  // Fetched again after every reconnect, in case it changed while the server was away.
  const load = () => fetch("/api/layout").then(res => res.json()).then(data => apply(data.layers)).catch(() => {});
  socket.on("connect", load);
  load();
})();

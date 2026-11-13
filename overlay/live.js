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
  function source(id, layer) {
    const query = new URLSearchParams();
    if (id === "jar") {
      query.set("nowelcome", "");
      // Where the jar's box is from the start, so it does not first fill the whole stage.
      query.set("box", [layer.x, layer.y, layer.w, layer.h, Math.min(Number.isFinite(layer.drop) ? layer.drop : layer.y, layer.y)].join(","));
      for (const key of ["jar", "dog", "cat", "nosticker", "sfx", "roam"]) if (params.has(key)) query.set(key, params.get(key));
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
  // The jar's page covers the whole stage (for the big gift effect) and is told where its box is and how
  // high the gifts' ceiling is (drop), in its own pixels, which are the stage's.
  function tellBox(frame) {
    const box = frame._box;
    if (!box) return;
    try { frame.contentWindow?.postMessage({ type: "box", ...box }, location.origin); } catch { /* not loaded */ }
  }
  function frameFor(id, layer) {
    if (frames.has(id)) return frames.get(id);
    const src = source(id, layer);
    if (!src) return null;
    const frame = document.createElement("iframe");
    frame.className = "layer";
    frame.dataset.id = id;
    frame.allow = "autoplay";
    frame.setAttribute("aria-hidden", "true");
    frame.src = src;
    frame.addEventListener("load", () => tellBox(frame));
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
      const frame = frameFor(layer.id, layer);
      if (!frame) return;
      const style = frame.style;
      if (layer.id === "jar") {
        Object.assign(style, { left: "0px", top: "0px", width: `${STAGE.w}px`, height: `${STAGE.h}px` });
        const box = { x: layer.x, y: layer.y, w: layer.w, h: layer.h, top: Math.min(Number.isFinite(layer.drop) ? layer.drop : layer.y, layer.y) };
        if (JSON.stringify(box) !== JSON.stringify(frame._box)) { frame._box = box; tellBox(frame); }
      } else {
        const bleed = BLEED[layer.id] ?? 0;
        style.left = `${layer.x - layer.w * bleed}px`;
        style.top = `${layer.y - layer.h * bleed}px`;
        style.width = `${layer.w * (1 + 2 * bleed)}px`;
        style.height = `${layer.h * (1 + 2 * bleed)}px`;
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
  // "Tải lại overlay" on the control page: the page and every part in it load afresh. Only the pages: the
  // jar, the donors and everything else come back from the server as they were.
  socket.on("overlay-reload", () => { if (!preview) location.reload(); });
  // Fetched again after every reconnect, in case it changed while the server was away.
  const load = () => fetch("/api/layout").then(res => res.json()).then(data => apply(data.layers)).catch(() => {});
  socket.on("connect", load);
  load();
})();

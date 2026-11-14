// The layout page (layout.html): places the parts of the overlay on the single Studio source (live.html),
// the way a design tool does. Layers are listed top first; the frame shows the real overlay (live.html?preview)
// with a box over each part to drag and resize; the right panel has the numbers. Each finished change is
// saved to the server (data/layout.json), which sends it to Studio at once; while dragging, only the preview
// here moves.
(() => {
  const $ = id => document.getElementById(id);
  const ICONS = { jar: "🍯", welcome: "✨", heart: "💗", pk: "⚔️" };
  const MIN = 20;
  let stage = { w: 1080, h: 1920 };
  let layers = []; // bottom layer first, as on the server
  let defaults = [];
  let selected = null;
  let zoom = 0.3, fitZoom = true;
  const past = [], future = [];

  const layerById = id => layers.find(layer => layer.id === id);
  const defaultOf = id => defaults.find(layer => layer.id === id);
  const snapshot = () => JSON.stringify(layers);
  const clone = value => JSON.parse(JSON.stringify(value));

  // ---------- Saving and history ----------
  let saveTimer = null, saving = false, saveAgain = false;
  function setSaveState(text, kind = "") {
    const el = $("saveState");
    el.textContent = text;
    el.className = `save ${kind}`;
  }
  function scheduleSave() {
    setSaveState("Đang lưu…", "busy");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 150);
  }
  async function save() {
    if (saving) { saveAgain = true; return; }
    saving = true;
    try {
      const res = await fetch("/api/layout", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layers })
      });
      if (!res.ok) throw new Error(res.statusText);
      setSaveState("Đã lưu · đã gửi lên live");
    } catch {
      setSaveState("Chưa lưu được, thử lại…", "err");
      saveTimer = setTimeout(save, 2000);
    } finally {
      saving = false;
      if (saveAgain) { saveAgain = false; save(); }
    }
  }
  // Call with the state from before a change, once the change is done.
  function record(before) {
    if (before === snapshot()) return;
    past.push(before);
    if (past.length > 100) past.shift();
    future.length = 0;
    render();
    scheduleSave();
  }
  function undo() {
    if (!past.length) return;
    future.push(snapshot());
    layers = JSON.parse(past.pop());
    if (!layerById(selected)) selected = null;
    render();
    scheduleSave();
  }
  function redo() {
    if (!future.length) return;
    past.push(snapshot());
    layers = JSON.parse(future.pop());
    render();
    scheduleSave();
  }
  // Makes a change to the layers as one step of history.
  function change(fn) {
    const before = snapshot();
    fn();
    record(before);
  }

  // ---------- Preview ----------
  const preview = $("preview");
  function pushPreview() {
    try { preview.contentWindow?.postMessage({ type: "layout", layers }, location.origin); } catch { /* not loaded yet */ }
  }
  preview.addEventListener("load", () => setTimeout(pushPreview, 50));

  // ---------- Zoom ----------
  const canvas = $("canvas"), artboard = $("artboard"), handles = $("handles");
  artboard.prepend($("frameLabel"));
  function computeFit() {
    const r = canvas.getBoundingClientRect();
    return Math.max(0.05, Math.min((r.width - 80) / stage.w, (r.height - 100) / stage.h));
  }
  function applyZoom() {
    if (fitZoom) zoom = computeFit();
    artboard.style.width = `${stage.w * zoom}px`;
    artboard.style.height = `${stage.h * zoom}px`;
    preview.style.width = `${stage.w}px`;
    preview.style.height = `${stage.h}px`;
    preview.style.transform = `scale(${zoom})`;
    $("zoomFit").textContent = `${Math.round(zoom * 100)}%`;
    renderBoxes();
  }
  function setZoom(value) {
    fitZoom = false;
    zoom = Math.max(0.05, Math.min(2, value));
    applyZoom();
  }
  addEventListener("resize", () => { if (fitZoom) applyZoom(); });
  $("zoomIn").onclick = () => setZoom(zoom * 1.25);
  $("zoomOut").onclick = () => setZoom(zoom / 1.25);
  $("zoomFit").onclick = () => { fitZoom = true; applyZoom(); };
  canvas.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom(zoom * Math.exp(-event.deltaY * 0.0015));
  }, { passive: false });

  // ---------- Backdrop ----------
  const backdrop = $("backdrop");
  const store = {
    get: key => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } }
  };
  let backdropImage = store.get("layoutBgImage");
  function applyBackdrop(mode) {
    if (mode === "image" && !backdropImage) mode = "checker";
    $("bgMode").value = mode;
    backdrop.className = `backdrop ${mode === "image" ? "" : mode}`;
    backdrop.style.backgroundImage = mode === "image" ? `url("${backdropImage}")` : "";
    store.set("layoutBgMode", mode);
  }
  $("bgMode").addEventListener("change", event => {
    if (event.target.value === "image") $("bgFile").click();
    applyBackdrop(event.target.value);
  });
  // A picture of the camera (a screenshot from Studio) to line the parts up with; kept only in this browser.
  $("bgFile").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const width = Math.min(720, img.naturalWidth), height = Math.round(img.naturalHeight * width / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = width; c.height = height;
      c.getContext("2d").drawImage(img, 0, 0, width, height);
      backdropImage = c.toDataURL("image/jpeg", 0.85);
      store.set("layoutBgImage", backdropImage);
      URL.revokeObjectURL(img.src);
      applyBackdrop("image");
    };
    img.src = URL.createObjectURL(file);
    event.target.value = "";
  });
  applyBackdrop(store.get("layoutBgMode") || "checker");

  // ---------- Boxes on the canvas ----------
  const boxes = new Map();
  let hoverId = null;
  function boxFor(id) {
    if (boxes.has(id)) return boxes.get(id);
    const box = document.createElement("div");
    box.className = "box";
    box.dataset.id = id;
    box.innerHTML = `<span class="tag"></span><span class="size"></span>`
      + ["n", "e", "s", "w"].map(h => `<i class="edge" data-h="${h}"></i>`).join("")
      + ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map(h => `<i class="knob" data-h="${h}"></i>`).join("");
    handles.append(box);
    boxes.set(id, box);
    return box;
  }
  // The ceiling the jar's gifts fall from: a dashed line across the jar's width, dragged up and down.
  const ceilings = new Map();
  function renderCeilings() {
    for (const layer of layers) {
      if (!("drop" in layer)) continue;
      let line = ceilings.get(layer.id);
      if (!line) {
        line = document.createElement("div");
        line.className = "ceil";
        line.dataset.id = layer.id;
        line.innerHTML = `<span class="ceil-label">Trần quà rơi</span><i class="ceil-grip"></i>`;
        handles.append(line);
        ceilings.set(layer.id, line);
      }
      const top = Math.min(layer.drop, layer.y);
      line.style.left = `${layer.x * zoom}px`;
      line.style.width = `${layer.w * zoom}px`;
      line.style.top = `${top * zoom}px`;
      line.style.setProperty("--reach", `${(layer.y - top) * zoom}px`);
      line.style.display = layer.visible ? "" : "none";
      line.classList.toggle("active", layer.id === selected || layer.id === hoverId);
      line.classList.toggle("locked", layer.locked);
    }
  }
  function renderBoxes() {
    renderCeilings();
    for (const [id, box] of boxes) if (!layerById(id)) { box.remove(); boxes.delete(id); }
    layers.forEach((layer, index) => {
      const box = boxFor(layer.id);
      box.style.left = `${layer.x * zoom}px`;
      box.style.top = `${layer.y * zoom}px`;
      box.style.width = `${layer.w * zoom}px`;
      box.style.height = `${layer.h * zoom}px`;
      box.style.zIndex = layer.id === selected ? 1000 : index + 1;
      box.style.display = layer.visible ? "" : "none";
      box.classList.toggle("selected", layer.id === selected);
      box.classList.toggle("hover", layer.id === hoverId && layer.id !== selected);
      box.classList.toggle("locked", layer.locked);
      box.querySelector(".tag").textContent = `${layer.name}${layer.locked ? " 🔒" : ""}`;
      box.querySelector(".size").textContent = `${layer.w} × ${layer.h}`;
    });
  }

  // Parts under a point, top layer first; locked and hidden ones cannot be picked on the canvas.
  function hitsAt(x, y) {
    return layers.filter(l => l.visible && !l.locked && x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h).reverse();
  }
  const toStage = event => {
    const r = handles.getBoundingClientRect();
    return { x: (event.clientX - r.left) / zoom, y: (event.clientY - r.top) / zoom };
  };

  // ---------- Snapping ----------
  function guidesFor(skipId) {
    const xs = [0, stage.w / 2, stage.w], ys = [0, stage.h / 2, stage.h];
    for (const l of layers) {
      if (l.id === skipId || !l.visible) continue;
      xs.push(l.x, l.x + l.w / 2, l.x + l.w);
      ys.push(l.y, l.y + l.h / 2, l.y + l.h);
    }
    return { xs, ys };
  }
  // The smallest shift that puts one of the points on one of the lines, if it is within reach.
  function nearest(points, lines) {
    const reach = 6 / zoom;
    let best = null;
    for (const p of points) for (const line of lines) {
      const d = line - p;
      if (Math.abs(d) <= reach && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
    }
    return best;
  }
  function showGuides(vx, hy) {
    handles.querySelectorAll(".guide").forEach(g => g.remove());
    for (const x of vx) {
      const g = document.createElement("div");
      g.className = "guide v";
      g.style.left = `${x * zoom}px`;
      handles.append(g);
    }
    for (const y of hy) {
      const g = document.createElement("div");
      g.className = "guide h";
      g.style.top = `${y * zoom}px`;
      handles.append(g);
    }
  }

  // ---------- Dragging and resizing ----------
  let drag = null;
  handles.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const p = toStage(event);
    const grip = event.target.closest(".knob, .edge");
    const ceiling = event.target.closest(".ceil");
    const current = layerById(selected);
    let target, mode, cycleTo = null;
    if (ceiling && !layerById(ceiling.dataset.id)?.locked) {
      target = layerById(ceiling.dataset.id);
      mode = "drop";
      if (target.id !== selected) select(target.id);
    } else if (grip && current && !current.locked) {
      target = current;
      mode = grip.dataset.h;
    } else {
      const hits = hitsAt(p.x, p.y);
      if (!hits.length) { select(null); return; }
      const at = hits.findIndex(l => l.id === selected);
      if (at >= 0) {
        target = hits[at];
        if (hits.length > 1) cycleTo = hits[(at + 1) % hits.length].id;
      } else {
        target = hits[0];
      }
      mode = "move";
      if (target.id !== selected) select(target.id);
    }
    handles.setPointerCapture(event.pointerId);
    drag = { id: target.id, mode, start: p, from: { ...target }, before: snapshot(), moved: false, cycleTo };
    event.preventDefault();
  });

  handles.addEventListener("pointermove", event => {
    const p = toStage(event);
    if (!drag) {
      const hit = hitsAt(p.x, p.y)[0]?.id ?? null;
      if (hit !== hoverId) { hoverId = hit; renderBoxes(); }
      return;
    }
    let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * zoom < 3) return;
    drag.moved = true;
    const layer = layerById(drag.id);
    const snap = !(event.ctrlKey || event.metaKey);
    const { xs, ys } = guidesFor(drag.id);
    const f = drag.from;
    const vx = [], hy = [];
    if (drag.mode === "move") {
      if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      let x = f.x + dx, y = f.y + dy;
      if (snap) {
        const sx = nearest([x, x + f.w / 2, x + f.w], xs), sy = nearest([y, y + f.h / 2, y + f.h], ys);
        if (sx && !(event.shiftKey && dx === 0)) { x += sx.d; vx.push(sx.line); }
        if (sy && !(event.shiftKey && dy === 0)) { y += sy.d; hy.push(sy.line); }
      }
      layer.x = Math.round(x);
      layer.y = Math.round(y);
      // The ceiling moves along with the jar.
      if ("drop" in f) layer.drop = Math.round(f.drop + (layer.y - f.y));
    } else if (drag.mode === "drop") {
      let drop = f.drop + dy;
      if (snap) {
        const s = nearest([drop], ys);
        if (s) { drop += s.d; hy.push(s.line); }
      }
      layer.drop = Math.round(Math.min(drop, layer.y));
    } else {
      Object.assign(layer, resized(f, drag.mode, dx, dy, {
        fromCentre: event.altKey, keepRatio: layer.ratio !== event.shiftKey, snap: snap ? { xs, ys, vx, hy } : null
      }));
    }
    showGuides(vx, hy);
    renderBoxes();
    renderProps();
    pushPreview();
  });

  function endDrag(event) {
    if (!drag) return;
    const done = drag;
    drag = null;
    showGuides([], []);
    try { handles.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (done.moved) record(done.before);
    else if (done.cycleTo) select(done.cycleTo); // a click on the selected part picks the one under it
  }
  handles.addEventListener("pointerup", endDrag);
  handles.addEventListener("pointercancel", endDrag);
  handles.addEventListener("pointerleave", () => { if (!drag && hoverId) { hoverId = null; renderBoxes(); } });

  // The box after dragging handle h (n, e, s, w or a corner) by dx, dy.
  function resized(f, h, dx, dy, { fromCentre, keepRatio, snap }) {
    let x1 = f.x, y1 = f.y, x2 = f.x + f.w, y2 = f.y + f.h;
    const left = h.includes("w"), right = h.includes("e"), top = h.includes("n"), bottom = h.includes("s");
    if (left) x1 += dx;
    if (right) x2 += dx;
    if (top) y1 += dy;
    if (bottom) y2 += dy;
    if (fromCentre) {
      if (left) x2 -= dx;
      if (right) x1 -= dx;
      if (top) y2 -= dy;
      if (bottom) y1 -= dy;
    }
    // Moving edges snap to the guides.
    if (snap && !keepRatio) {
      const sx = nearest([left ? x1 : right ? x2 : NaN], snap.xs);
      if (sx && (left || right)) { if (left) x1 += sx.d; else x2 += sx.d; snap.vx.push(sx.line); }
      const sy = nearest([top ? y1 : bottom ? y2 : NaN], snap.ys);
      if (sy && (top || bottom)) { if (top) y1 += sy.d; else y2 += sy.d; snap.hy.push(sy.line); }
    }
    let w = Math.max(MIN, x2 - x1), h2 = Math.max(MIN, y2 - y1);
    if (keepRatio) {
      const ratio = f.w / f.h;
      const sideways = (left || right) && !(top || bottom);
      const upDown = (top || bottom) && !(left || right);
      if (sideways || (!upDown && w / f.w >= h2 / f.h)) h2 = Math.max(MIN, w / ratio);
      else w = Math.max(MIN, h2 * ratio);
    }
    // Where the box is anchored: the opposite side, the middle for one-sided handles, or the centre.
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    let x, y;
    if (fromCentre) x = cx - w / 2;
    else if (left) x = f.x + f.w - w;
    else if (right) x = f.x;
    else x = cx - w / 2;
    if (fromCentre) y = cy - h2 / 2;
    else if (top) y = f.y + f.h - h2;
    else if (bottom) y = f.y;
    else y = cy - h2 / 2;
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h2) };
  }

  // ---------- Layer list ----------
  const list = $("layerList");
  function renderList() {
    list.replaceChildren(...[...layers].reverse().map(layer => {
      const li = document.createElement("li");
      li.dataset.id = layer.id;
      li.className = `${layer.id === selected ? "selected" : ""} ${layer.visible ? "" : "hidden-layer"}`;
      li.innerHTML = `<span class="kind" title="Kéo để đổi thứ tự">${ICONS[layer.id] ?? "▢"}</span>
        <span class="name"></span>
        <button class="toggle ${layer.locked ? "on" : ""}" data-act="lock" title="${layer.locked ? "Mở khoá" : "Khoá"}">${layer.locked ? "🔒" : "🔓"}</button>
        <button class="toggle ${layer.visible ? "" : "on"}" data-act="eye" title="${layer.visible ? "Ẩn" : "Hiện"}">${layer.visible ? "👁" : "—"}</button>`;
      li.querySelector(".name").textContent = layer.name;
      return li;
    }));
  }
  list.addEventListener("click", event => {
    const li = event.target.closest("li");
    if (!li || listDrag?.moved) return;
    const act = event.target.closest("[data-act]")?.dataset.act;
    const layer = layerById(li.dataset.id);
    if (act === "eye") change(() => { layer.visible = !layer.visible; });
    else if (act === "lock") change(() => { layer.locked = !layer.locked; });
    else select(layer.id);
  });
  // Double click on a name to rename it.
  list.addEventListener("dblclick", event => {
    const name = event.target.closest(".name");
    if (!name) return;
    const layer = layerById(name.closest("li").dataset.id);
    const input = document.createElement("input");
    input.value = layer.name;
    input.maxLength = 40;
    name.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = keep => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (keep && value && value !== layer.name) change(() => { layer.name = value; });
      else renderList();
    };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
      e.stopPropagation();
    });
    input.addEventListener("blur", () => finish(true));
  });
  // Drag a row up or down to change which part is on top.
  let listDrag = null;
  list.addEventListener("pointerdown", event => {
    const li = event.target.closest("li");
    if (!li || event.target.closest("button, input") || event.button !== 0) return;
    listDrag = { id: li.dataset.id, y: event.clientY, moved: false, drop: null };
  });
  addEventListener("pointermove", event => {
    if (!listDrag) return;
    if (!listDrag.moved && Math.abs(event.clientY - listDrag.y) < 4) return;
    listDrag.moved = true;
    list.querySelectorAll("li").forEach(li => li.classList.remove("drop-above", "drop-below"));
    const rows = [...list.querySelectorAll("li")];
    const over = rows.find(li => { const r = li.getBoundingClientRect(); return event.clientY >= r.top && event.clientY < r.bottom; })
      ?? (event.clientY < rows[0]?.getBoundingClientRect().top ? rows[0] : rows.at(-1));
    if (!over) return;
    const r = over.getBoundingClientRect();
    const above = event.clientY < r.top + r.height / 2;
    over.classList.add(above ? "drop-above" : "drop-below");
    listDrag.drop = { id: over.dataset.id, above };
  });
  addEventListener("pointerup", () => {
    if (!listDrag) return;
    const done = listDrag;
    setTimeout(() => { listDrag = null; }, 0); // the click that follows a drag is ignored
    if (!done.moved || !done.drop) { listDrag = null; return; }
    list.querySelectorAll("li").forEach(li => li.classList.remove("drop-above", "drop-below"));
    if (done.drop.id === done.id) { renderList(); return; }
    change(() => {
      const moving = layerById(done.id);
      layers = layers.filter(l => l.id !== done.id);
      // The list shows the top first, so "above" in the list is later in the bottom-first order.
      const at = layers.findIndex(l => l.id === done.drop.id);
      layers.splice(done.drop.above ? at + 1 : at, 0, moving);
    });
  });

  function move(to) {
    const at = layers.findIndex(l => l.id === selected);
    if (at < 0) return;
    const index = { front: layers.length - 1, back: 0, forward: Math.min(layers.length - 1, at + 1), backward: Math.max(0, at - 1) }[to];
    if (index === at) return;
    change(() => { const [layer] = layers.splice(at, 1); layers.splice(index, 0, layer); });
  }
  $("toFront").onclick = () => move("front");
  $("forward").onclick = () => move("forward");
  $("backward").onclick = () => move("backward");
  $("toBack").onclick = () => move("back");

  // ---------- Properties ----------
  const fields = { x: $("fx"), y: $("fy"), w: $("fw"), h: $("fh"), drop: $("fdrop") };
  function renderProps() {
    const layer = layerById(selected);
    $("propsEmpty").hidden = Boolean(layer);
    $("propsBody").hidden = !layer;
    $("propsTitle").textContent = layer ? layer.name : "Thuộc tính";
    for (const id of ["toFront", "forward", "backward", "toBack"]) $(id).disabled = !layer;
    if (!layer) return;
    $("dropRow").hidden = !("drop" in layer);
    $("veilRow").hidden = !("veil" in layer);
    if ("veil" in layer) {
      if (document.activeElement !== $("veil")) $("veil").value = layer.veil;
      $("veilOut").textContent = `${layer.veil}%`;
    }
    for (const [key, input] of Object.entries(fields)) if (document.activeElement !== input) input.value = layer[key] ?? "";
    $("ratio").checked = layer.ratio !== false;
    $("visible").checked = layer.visible;
    $("locked").checked = layer.locked;
    const base = defaultOf(layer.id);
    const percent = base ? Math.round((layer.w / base.w) * 100) : 100;
    if (document.activeElement !== $("scale")) $("scale").value = percent;
    $("scaleOut").textContent = `${percent}%`;
    for (const input of [...Object.values(fields), $("scale")]) input.disabled = layer.locked;
    document.querySelectorAll("[data-align], #fillStage").forEach(b => { b.disabled = layer.locked; });
  }
  // The game panel's background strength: shown while dragging, one step of history when let go.
  let veilBefore = null;
  $("veil").addEventListener("input", () => {
    const layer = layerById(selected);
    if (!layer || !("veil" in layer)) return;
    veilBefore ??= snapshot();
    layer.veil = Number($("veil").value);
    $("veilOut").textContent = `${layer.veil}%`;
    pushPreview();
  });
  $("veil").addEventListener("change", () => {
    if (veilBefore) record(veilBefore);
    veilBefore = null;
  });

  // Sets one number; with "keep ratio" on, width and height follow each other.
  function setField(layer, key, value) {
    value = Math.round(value);
    if (key === "w" || key === "h") {
      value = Math.max(MIN, value);
      if (layer.ratio !== false) {
        const ratio = layer.w / layer.h;
        if (key === "w") { layer.w = value; layer.h = Math.max(MIN, Math.round(value / ratio)); }
        else { layer.h = value; layer.w = Math.max(MIN, Math.round(value * ratio)); }
        return;
      }
    }
    if (key === "drop") value = Math.min(value, layer.y);
    layer[key] = value;
    if (key === "y" && "drop" in layer) layer.drop = Math.min(layer.drop, value);
  }
  for (const [key, input] of Object.entries(fields)) {
    input.addEventListener("change", () => {
      const layer = layerById(selected);
      const value = Number(input.value);
      if (!layer || !Number.isFinite(value)) return renderProps();
      change(() => setField(layer, key, value));
    });
    input.addEventListener("keydown", event => { if (event.key === "Enter") input.blur(); });
  }
  // Drag sideways on X, Y, W or H to change the number; Shift for steps of 10.
  document.querySelectorAll(".scrub").forEach(label => {
    label.addEventListener("pointerdown", event => {
      const layer = layerById(selected);
      if (!layer || layer.locked) return;
      const key = label.dataset.field, startX = event.clientX, from = { ...layer }, before = snapshot();
      label.setPointerCapture(event.pointerId);
      const onMove = e => {
        Object.assign(layer, from);
        setField(layer, key, from[key] + (e.clientX - startX) * (e.shiftKey ? 10 : 1));
        renderBoxes(); renderProps(); pushPreview();
      };
      const onUp = () => {
        label.removeEventListener("pointermove", onMove);
        label.removeEventListener("pointerup", onUp);
        record(before);
      };
      label.addEventListener("pointermove", onMove);
      label.addEventListener("pointerup", onUp);
    });
  });
  // The size slider: 100% is the part's original size, kept around its middle.
  let scaleBefore = null;
  $("scale").addEventListener("input", event => {
    const layer = layerById(selected), base = defaultOf(selected);
    if (!layer || !base) return;
    scaleBefore ??= snapshot();
    const s = Number(event.target.value) / 100;
    const cx = layer.x + layer.w / 2, cy = layer.y + layer.h / 2;
    const ratio = layer.w / layer.h;
    layer.w = Math.max(MIN, Math.round(base.w * s));
    layer.h = Math.max(MIN, Math.round(layer.w / ratio));
    layer.x = Math.round(cx - layer.w / 2);
    layer.y = Math.round(cy - layer.h / 2);
    renderBoxes(); renderProps(); pushPreview();
  });
  $("scale").addEventListener("change", () => { if (scaleBefore) { record(scaleBefore); scaleBefore = null; } });
  $("ratio").onchange = event => change(() => { layerById(selected).ratio = event.target.checked; });
  $("visible").onchange = event => change(() => { layerById(selected).visible = event.target.checked; });
  $("locked").onchange = event => change(() => { layerById(selected).locked = event.target.checked; });
  document.querySelectorAll("[data-align]").forEach(button => {
    button.onclick = () => {
      const layer = layerById(selected);
      if (!layer) return;
      change(() => {
        const to = button.dataset.align;
        if (to === "left") layer.x = 0;
        if (to === "hcenter") layer.x = Math.round((stage.w - layer.w) / 2);
        if (to === "right") layer.x = stage.w - layer.w;
        if (to === "top") layer.y = 0;
        if (to === "vcenter") layer.y = Math.round((stage.h - layer.h) / 2);
        if (to === "bottom") layer.y = stage.h - layer.h;
      });
    };
  });
  $("fillStage").onclick = () => {
    const layer = layerById(selected);
    if (layer) change(() => Object.assign(layer, { x: 0, y: 0, w: stage.w, h: stage.h }));
  };
  $("dropTop").onclick = () => {
    const layer = layerById(selected);
    if (layer && "drop" in layer && !layer.locked) change(() => { layer.drop = 0; });
  };
  $("resetLayer").onclick = () => {
    const layer = layerById(selected), base = defaultOf(selected);
    if (layer && base) change(() => Object.assign(layer, { x: base.x, y: base.y, w: base.w, h: base.h, name: base.name }));
  };
  $("resetAll").onclick = () => {
    if (confirm("Đưa tất cả các lớp về vị trí, cỡ và thứ tự ban đầu?")) change(() => { layers = clone(defaults); });
  };

  // ---------- Studio link ----------
  $("liveUrl").value = `${location.origin}/live.html`;
  $("copyLive").onclick = async () => {
    const button = $("copyLive");
    try { await navigator.clipboard.writeText($("liveUrl").value); } catch { $("liveUrl").select(); document.execCommand("copy"); }
    button.textContent = "Đã copy";
    button.classList.add("done");
    setTimeout(() => { button.textContent = "Copy"; button.classList.remove("done"); }, 1500);
  };

  // ---------- Keyboard ----------
  addEventListener("keydown", event => {
    const typing = event.target.closest?.("input, select, textarea");
    const mod = event.ctrlKey || event.metaKey;
    if (typing) { if (event.key === "Escape") event.target.blur(); return; }
    const key = event.key.toLowerCase();
    if (mod && key === "z") { event.preventDefault(); return event.shiftKey ? redo() : undo(); }
    if (mod && key === "y") { event.preventDefault(); return redo(); }
    if (event.shiftKey && event.code === "Digit1") { fitZoom = true; return applyZoom(); }
    if (event.shiftKey && event.code === "Digit0") return setZoom(1);
    if (event.key === "Escape") return select(null);
    const layer = layerById(selected);
    if (!layer) return;
    if (mod && (event.code === "BracketRight" || event.code === "BracketLeft")) {
      event.preventDefault();
      const up = event.code === "BracketRight";
      return move(event.shiftKey ? (up ? "front" : "back") : (up ? "forward" : "backward"));
    }
    if (mod && event.shiftKey && key === "h") { event.preventDefault(); return change(() => { layer.visible = !layer.visible; }); }
    if (mod && event.shiftKey && key === "l") { event.preventDefault(); return change(() => { layer.locked = !layer.locked; }); }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (arrows && !layer.locked) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      change(() => {
        layer.x += arrows[0] * step;
        layer.y += arrows[1] * step;
        if ("drop" in layer) layer.drop += arrows[1] * step;
      });
    }
  });

  // ---------- Putting it together ----------
  function select(id) {
    selected = id;
    render();
  }
  function render() {
    renderList();
    renderBoxes();
    renderProps();
    $("undo").disabled = !past.length;
    $("redo").disabled = !future.length;
    pushPreview();
  }
  $("undo").onclick = undo;
  $("redo").onclick = redo;

  // Changes saved from another copy of this page.
  const socket = io();
  socket.on("layout", incoming => {
    if (drag || saving || saveTimer && $("saveState").classList.contains("busy")) return;
    if (JSON.stringify(incoming) === snapshot()) return;
    layers = incoming;
    if (!layerById(selected)) selected = null;
    render();
  });

  fetch("/api/layout").then(res => res.json()).then(data => {
    stage = data.stage ?? stage;
    layers = data.layers ?? [];
    defaults = data.defaults ?? [];
    $("frameLabel").textContent = `Studio · ${stage.w} × ${stage.h}`;
    applyZoom();
    render();
  }).catch(() => setSaveState("Không tải được bố cục", "err"));
})();

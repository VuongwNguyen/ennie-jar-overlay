const socket = io();
const $ = id => document.getElementById(id);
function render(state) {
  $("coins").textContent = state.totalCoins.toLocaleString();
  $("gifts").textContent = state.gifts.toLocaleString();
  $("donors").textContent = state.donorCount.toLocaleString();
  const list = $("leaderboard");
  list.replaceChildren();
  if (!state.topDonors.length) {
    const li = document.createElement("li"); li.className = "empty"; li.textContent = "Chưa có dữ liệu"; list.append(li); return;
  }
  state.topDonors.forEach(d => {
    const li = document.createElement("li");
    li.textContent = `${d.nickname} — ${d.coins.toLocaleString()} xu`;
    list.append(li);
  });
}
socket.on("state", render);
const friendlyError = error => (/isn't online/i.test(error || "") ? "Kênh này đang không live." : error || "");
// Messages appear on the page: some embedded browsers, such as streaming apps, silently block alert() and confirm().
let noticeTimer = 0;
function notify(id, text, isError = false) {
  const line = $(id);
  line.textContent = text;
  line.classList.toggle("err", isError);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { line.textContent = ""; }, 4000);
}
function renderTikTok(status) {
  const labels = { disconnected: "Chưa kết nối", connecting: "Đang kết nối…", connected: "Đã kết nối" };
  $("tiktokStatus").textContent = labels[status.state] + (status.username && status.state !== "disconnected" ? ` · @${status.username}` : "");
  $("tiktokStatus").className = `pill ${status.state === "connected" ? "on" : status.state === "connecting" ? "wait" : ""}`;
  // The box shows the channel actually connected, unless someone is typing in it.
  if (status.username && status.state !== "disconnected" && document.activeElement !== $("tiktokUser")) $("tiktokUser").value = status.username;
  $("tiktokError").textContent = friendlyError(status.error);
  $("tiktokConnect").disabled = status.state === "connecting";
  $("tiktokDisconnect").disabled = status.state === "disconnected";
}
socket.on("tiktok-status", renderTikTok);
async function post(url, data) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined });
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}

// Settings save by themselves: a moment after the last change (typing waits for a pause), only when something
// differs from what was last saved or shown, and one request at a time, so a burst of changes sends one save.
function autoSave({ collect, send, delay = 700 }) {
  let timer = 0, sending = null, again = false, last = null;
  async function now() {
    clearTimeout(timer);
    timer = 0;
    if (sending) { again = true; return sending; }
    const data = collect();
    if (data == null) return;
    const key = JSON.stringify(data);
    if (key === last) return;
    sending = (async () => {
      try { if (await send(data)) last = key; } catch { /* send shows its own message */ }
    })();
    await sending;
    sending = null;
    if (again) { again = false; return now(); }
  }
  return {
    soon(ms = delay) { clearTimeout(timer); timer = setTimeout(now, ms); },
    now,
    known(data) { last = JSON.stringify(data); }
  };
}
$("tiktokConnect").addEventListener("click", async () => {
  const username = $("tiktokUser").value.trim();
  if (!username) { $("tiktokError").textContent = "Nhập username TikTok"; return; }
  // Shown straight away, because the answer from TikTok can take several seconds.
  $("tiktokStatus").textContent = "Đang kết nối…";
  $("tiktokError").textContent = "";
  $("tiktokConnect").disabled = true;
  try {
    const { ok, body } = await post("/api/tiktok/connect", { username });
    if (!ok) {
      $("tiktokStatus").textContent = "Chưa kết nối";
      $("tiktokError").textContent = friendlyError(body.error) || "Không kết nối được";
    }
  } catch {
    $("tiktokStatus").textContent = "Chưa kết nối";
    $("tiktokError").textContent = "Không liên lạc được với server.";
  }
  $("tiktokConnect").disabled = false;
});
$("tiktokDisconnect").addEventListener("click", () => post("/api/tiktok/disconnect").catch(() => {
  $("tiktokError").textContent = "Không liên lạc được với server.";
}));
$("sendGift").addEventListener("click", async () => {
  const diamondCount = Number($("diamondCount").value);
  const repeatCount = Number($("repeatCount").value);
  if (!Number.isFinite(diamondCount) || diamondCount < 0 || !Number.isInteger(repeatCount) || repeatCount < 1) {
    notify("giftNotice", "Xu / quà phải ≥ 0 và Số lượng phải là số nguyên ≥ 1.", true);
    return;
  }
  const body = {
    user: { id: $("nickname").value.trim().toLowerCase().replace(/\s+/g, "-") || "demo-user", nickname: $("nickname").value.trim() || "Người xem" },
    gift: { id: "demo", name: $("giftName").value.trim() || "Rose", diamondCount, repeatCount, repeatEnd: true }
  };
  try {
    const response = await fetch("/api/simulate/gift", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if (response.ok) notify("giftNotice", "Đã gửi quà thử nghiệm ✓");
    else notify("giftNotice", "Không gửi được sự kiện thử nghiệm.", true);
  } catch { notify("giftNotice", "Không liên lạc được với server.", true); }
});
// A pretend viewer joining, greeted by the dog with the name in "Người tặng". Nothing is saved.
$("sendMember").addEventListener("click", async () => {
  try {
    const { ok } = await post("/api/simulate/member", { nickname: $("nickname").value.trim() });
    notify("giftNotice", ok ? "Đã gửi người vào live ✓" : "Không gửi được.", !ok);
  } catch { notify("giftNotice", "Không liên lạc được với server.", true); }
});
// Reset wipes the session's gifts, so it asks for a second click within a few seconds.
const RESET_LABEL = $("reset").textContent;
let resetArmed = 0;
$("reset").addEventListener("click", async () => {
  if (!resetArmed) {
    $("reset").textContent = "Bấm lần nữa để xóa hết";
    $("reset").classList.add("danger");
    resetArmed = setTimeout(disarmReset, 4000);
    return;
  }
  disarmReset();
  try {
    const response = await fetch("/api/session/reset", { method: "POST" });
    if (response.ok) notify("resetNotice", "Đã reset phiên ✓");
    else notify("resetNotice", "Không reset được.", true);
  } catch { notify("resetNotice", "Không liên lạc được với server.", true); }
});
function disarmReset() {
  clearTimeout(resetArmed);
  resetArmed = 0;
  $("reset").textContent = RESET_LABEL;
  $("reset").classList.remove("danger");
}
// Which build is running, so an update can be seen to have arrived.
fetch("/api/version").then(r => r.json()).then(({ build }) => {
  $("buildTag").textContent = build == null ? "bản đang phát triển" : `build ${build}`;
}).catch(() => {});

// ---------- Links for Studio ----------
$("liveUrl").value = `${location.origin}/live.html`;
$("overlayUrl").value = `${location.origin}/overlay.html`;
$("heartUrl").value = `${location.origin}/heart.html`;

// ---------- Viewers who get the welcome frame ----------
function renderWelcome(list) {
  const ul = $("welcomeList");
  ul.replaceChildren();
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Chưa có ai";
    ul.append(li);
    return;
  }
  for (const entry of list) {
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = `@${entry.id}`;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = entry.badge;
    const test = document.createElement("button");
    test.className = "chip";
    test.textContent = "Thử";
    test.title = "Hiện khung cho người này ngay";
    test.addEventListener("click", async () => {
      const { ok } = await post("/api/welcome/test", { id: entry.id }).catch(() => ({ ok: false }));
      notify("welcomeNotice", ok ? `Đã hiện khung cho @${entry.id} ✓` : "Không hiện được.", !ok);
    });
    const remove = document.createElement("button");
    remove.className = "chip";
    remove.textContent = "Xóa";
    remove.addEventListener("click", async () => {
      const response = await fetch(`/api/welcome/${encodeURIComponent(entry.id)}`, { method: "DELETE" }).catch(() => null);
      if (response?.ok) renderWelcome(await response.json());
      else notify("welcomeNotice", "Không xóa được.", true);
    });
    li.append(who, badge, test, remove);
    ul.append(li);
  }
}
fetch("/api/welcome").then(r => r.json()).then(renderWelcome).catch(() => {});

// ---------- Welcoming by level ----------
function renderRules(rules) {
  $("ruleFanOn").checked = rules.fan.on;
  $("ruleFanAbove").value = rules.fan.above;
  $("ruleFanBadge").value = rules.fan.badge;
  $("ruleGifterOn").checked = rules.gifter.on;
  $("ruleGifterAbove").value = rules.gifter.above;
  $("ruleGifterBadge").value = rules.gifter.badge;
}
fetch("/api/welcome/rules").then(r => r.json()).then(rules => { renderRules(rules); rulesSaver.known(collectRules()); }).catch(() => {});
const collectRules = () => ({
  fan: { on: $("ruleFanOn").checked, above: Number($("ruleFanAbove").value), badge: $("ruleFanBadge").value.trim() },
  gifter: { on: $("ruleGifterOn").checked, above: Number($("ruleGifterAbove").value), badge: $("ruleGifterBadge").value.trim() }
});
const rulesSaver = autoSave({
  collect: () => {
    // Half-typed: an empty level or title waits until there is something to save.
    if ($("ruleFanAbove").value === "" || $("ruleGifterAbove").value === "") return null;
    const rules = collectRules();
    return rules.fan.badge && rules.gifter.badge ? rules : null;
  },
  send: async rules => {
    try {
      const { ok, body } = await post("/api/welcome/rules", rules);
      if (!ok) { notify("rulesNotice", "Không lưu được.", true); return false; }
      notify("rulesNotice", `Đã lưu ✓ Tim đội từ cấp ${body.fan.above + 1}, cấp quà từ cấp ${body.gifter.above + 1}.`);
      return true;
    } catch { notify("rulesNotice", "Không liên lạc được với server.", true); return false; }
  }
});
$("rulesForm").addEventListener("submit", event => { event.preventDefault(); rulesSaver.now(); });
$("rulesForm").addEventListener("change", event => (event.target.type === "checkbox" ? rulesSaver.now() : rulesSaver.soon(300)));
$("rulesForm").addEventListener("input", event => { if (event.target.type !== "checkbox") rulesSaver.soon(900); });

// ---------- Viewers who just joined, with the @name to copy into the list ----------
// Why someone was or was not welcomed, and how they were seen (TikTok does not report every join).
const REASONS = { list: "chỉ định", fan: "tim đội", gifter: "cấp quà" };
const STATUSES = {
  queued: "⏳ đang chờ", welcomed: "✓ đã chào", limit: "đã chào 3 lần/10 phút", soon: "vừa chào xong",
  dropped: "hàng chờ đầy", below: "chưa đủ cấp", "no-level": "không có cấp",
  "no-overlay": "chưa mở hũ quà (overlay)", missed: "overlay không hiện kịp"
};
const SOURCES = { join: "vào live", chat: "chat", like: "thả tim", social: "follow/share", gift: "tặng quà" };
function statusText(member) {
  const status = STATUSES[member.status] ?? "";
  const reason = REASONS[member.reason];
  return reason && ["queued", "welcomed"].includes(member.status) ? `${status} · ${reason}` : status;
}
let members = [], memberPage = 0;
const MEMBERS_PER_PAGE = 6, MEMBERS_KEPT = 100;
function renderMembers() {
  const ul = $("memberList");
  ul.replaceChildren();
  $("memberCount").textContent = members.length;
  const pages = Math.max(1, Math.ceil(members.length / MEMBERS_PER_PAGE));
  memberPage = Math.min(memberPage, pages - 1);
  $("memberPager").hidden = pages < 2;
  $("memberPage").textContent = `${memberPage + 1} / ${pages}`;
  $("memberPrev").disabled = memberPage === 0;
  $("memberNext").disabled = memberPage >= pages - 1;
  if (!members.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Chưa có ai vào (cần đang kết nối TikTok)";
    ul.append(li);
    return;
  }
  for (const member of members.slice(memberPage * MEMBERS_PER_PAGE, (memberPage + 1) * MEMBERS_PER_PAGE)) {
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    const handle = member.user?.uniqueId ? `@${member.user.uniqueId}` : `id ${member.user?.id ?? "?"}`;
    const levels = [member.user?.fanLevel ? `💗${member.user.fanLevel}` : "", member.user?.gifterLevel ? `🎁${member.user.gifterLevel}` : ""].filter(Boolean).join(" ");
    who.textContent = `${member.user?.nickname ?? "?"} · ${handle}${levels ? ` · ${levels}` : ""}`;
    const time = document.createElement("span");
    time.className = "badge";
    time.textContent = `${new Date(member.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${SOURCES[member.source] ?? "vào live"}`;
    const mark = document.createElement("span");
    mark.className = "badge";
    mark.textContent = statusText(member);
    mark.classList.toggle("off", !["queued", "welcomed"].includes(member.status));
    const add = document.createElement("button");
    add.className = "chip";
    add.textContent = "Thêm";
    add.title = "Thêm người này vào danh sách khung chào mừng";
    add.disabled = member.reason === "list" || !(member.user?.uniqueId || member.user?.id);
    add.addEventListener("click", async () => {
      const { ok, body } = await post("/api/welcome", { id: member.user.uniqueId || member.user.id, badge: "" }).catch(() => ({ ok: false, body: {} }));
      if (ok) { renderWelcome(body); notify("welcomeNotice", `Đã thêm ${handle} ✓`); }
      else notify("welcomeNotice", body.error || "Không thêm được.", true);
    });
    li.append(who, time, mark, add);
    ul.append(li);
  }
}
// The server empties this list each time it connects to a live, and keeps it in memory only. Fetched
// again whenever the page (re)connects to the server, so a page left open does not keep old people.
const loadMembers = () => fetch("/api/members/recent").then(r => r.json()).then(list => { members = list; memberPage = 0; renderMembers(); }).catch(() => {});
socket.on("connect", loadMembers);
socket.on("members-cleared", () => { members = []; memberPage = 0; renderMembers(); });
$("memberPrev").addEventListener("click", () => { memberPage--; renderMembers(); });
$("memberNext").addEventListener("click", () => { memberPage++; renderMembers(); });
// A queued welcome appeared on screen (or was let go): update that person's line.
socket.on("member-status", ({ key, status }) => {
  const member = members.find(item => item.key === key);
  if (!member) return;
  member.status = status;
  renderMembers();
});
socket.on("member", member => {
  members.unshift(member);
  members.length = Math.min(members.length, MEMBERS_KEPT);
  renderMembers();
});
$("welcomeForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("welcomeId").value.trim();
  if (!id) { notify("welcomeNotice", "Nhập @tên TikTok hoặc id.", true); return; }
  try {
    const { ok, body } = await post("/api/welcome", { id, badge: $("welcomeBadge").value.trim() });
    if (!ok) { notify("welcomeNotice", body.error || "Không thêm được.", true); return; }
    renderWelcome(body);
    $("welcomeId").value = "";
    notify("welcomeNotice", `Đã thêm @${id.replace(/^@/, "")} ✓`);
  } catch { notify("welcomeNotice", "Không liên lạc được với server.", true); }
});
// Clicking the address selects all of it, for copying by hand.
for (const field of document.querySelectorAll(".link-url")) field.addEventListener("focus", () => field.select());
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older or embedded browsers without the clipboard API.
    const field = document.createElement("textarea");
    field.value = text;
    document.body.append(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  }
}
for (const button of document.querySelectorAll(".copy")) {
  button.addEventListener("click", async () => {
    const ok = await copyText($(button.dataset.copy).value);
    button.textContent = ok ? "Đã copy ✓" : "Bấm vào ô rồi Ctrl+C";
    button.classList.toggle("done", ok);
    setTimeout(() => { button.textContent = "Copy"; button.classList.remove("done"); }, 1800);
  });
}

// Quick picks fill in the test gift (only the chips that carry a gift, not the pager's).
for (const chip of document.querySelectorAll(".chip[data-gift]")) {
  chip.addEventListener("click", () => {
    $("giftName").value = chip.dataset.gift;
    $("diamondCount").value = chip.dataset.coins;
    $("repeatCount").value = 1;
  });
}

const effectsSaver = autoSave({
  collect: () => {
    if ($("burstFrom").value === "") return null;
    const burstFrom = Math.round(Number($("burstFrom").value));
    if (!Number.isFinite(burstFrom) || burstFrom < 0) { notify("effectsNotice", "Nhập số xu từ 0 trở lên.", true); return null; }
    return { burstFrom };
  },
  send: async data => {
    try {
      const { ok, body: saved } = await post("/api/effects", data);
      if (!ok) throw new Error("not saved");
      notify("effectsNotice", saved.burstFrom ? `Đã lưu: quà từ ${saved.burstFrom.toLocaleString("vi-VN")} xu sẽ nổ tim ✓` : "Đã tắt hiệu ứng nổ tim ✓");
      return true;
    } catch {
      notify("effectsNotice", "Không lưu được, thử lại.", true);
      return false;
    }
  }
});
// The gift price that sets off the heart burst on the jar (0 turns it off).
const showEffects = settings => {
  if (document.activeElement !== $("burstFrom")) $("burstFrom").value = settings.burstFrom;
  effectsSaver.known({ burstFrom: settings.burstFrom });
};
fetch("/api/effects").then(res => res.json()).then(showEffects).catch(() => {});
socket.on("effects", showEffects);
$("effectsForm").addEventListener("submit", event => { event.preventDefault(); effectsSaver.now(); });
$("burstFrom").addEventListener("input", () => effectsSaver.soon(900));
$("burstFrom").addEventListener("change", () => effectsSaver.now());

// ---------- The jar game ----------
// The gift for each level of Phe Phá and of Phe Giữ (server/src/jar-game.js), and buttons to try a turn.
let gameGifts = [], gameLevels = [];
const levelSelect = (team, i) => $(`game-${team}-${i}`);
// A gift's picture, or a little gift box when TikTok has not shown it yet.
function giftPicture(gift, size = 28) {
  const box = document.createElement("span");
  box.className = "gift-pic";
  box.style.setProperty("--pic", `${size}px`);
  if (/^https?:\/\//i.test(gift?.image ?? "")) {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.alt = "";
    img.loading = "lazy";
    img.onerror = () => { img.remove(); box.textContent = "🎁"; };
    img.src = gift.image;
    box.append(img);
  } else {
    box.textContent = "🎁";
  }
  return box;
}
const giftInfo = id => gameGifts.find(gift => gift.id === id);
const coinsText = coins => (coins ? `${coins.toLocaleString("vi-VN")} xu` : "chưa rõ giá");
// Each level's gift is a button showing the chosen gift; it opens the picker (see openGiftPicker).
function fillGiftSelect(button, picked) {
  button.dataset.id = picked?.id ?? "";
  button.dataset.name = picked?.name ?? "";
  const gift = picked ? { ...picked, ...giftInfo(picked.id) } : null;
  button.replaceChildren();
  if (!gift) {
    button.classList.add("empty");
    button.append(Object.assign(document.createElement("span"), { className: "gift-name", textContent: "— Chưa chọn —" }));
    return;
  }
  button.classList.remove("empty");
  const name = Object.assign(document.createElement("span"), { className: "gift-name", textContent: gift.name });
  const price = Object.assign(document.createElement("small"), { textContent: coinsText(gift.coins) });
  button.append(giftPicture(gift), name, price);
}
const pickedGift = button => (button.dataset.id ? { id: button.dataset.id, name: giftInfo(button.dataset.id)?.name ?? button.dataset.name } : null);

// ---------- The gift picker: the gifts of one level's price range, with their pictures ----------
const picker = { el: null, button: null, range: null };
function closeGiftPicker() {
  picker.el?.remove();
  picker.el = picker.button = null;
}
function openGiftPicker(button, range) {
  if (picker.button === button) return closeGiftPicker();
  closeGiftPicker();
  picker.button = button;
  picker.range = range;
  const el = document.createElement("div");
  el.className = "gift-picker";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Chọn quà");
  el.innerHTML = `
    <div class="picker-top">
      <input type="search" placeholder="Tìm quà…" aria-label="Tìm quà">
      <div class="picker-filters" role="group" aria-label="Lọc theo giá">
        <button type="button" class="chip on" data-filter="level">Đúng mức</button>
        <button type="button" class="chip" data-filter="priced">Mọi giá</button>
        <button type="button" class="chip" data-filter="unknown">Chưa rõ giá</button>
      </div>
    </div>
    <div class="picker-grid"></div>
    <p class="picker-note"></p>`;
  document.body.append(el);
  picker.el = el;
  const search = el.querySelector("input"), grid = el.querySelector(".picker-grid"), note = el.querySelector(".picker-note");
  let filter = "level";
  // Gifts already used at another level or by the other side cannot be picked twice.
  const used = new Set([...document.querySelectorAll(".gift-pick")].filter(b => b !== button).map(b => b.dataset.id).filter(Boolean));
  function draw() {
    const words = search.value.trim().toLowerCase();
    let list = gameGifts.filter(gift => !words || gift.name.toLowerCase().includes(words));
    if (filter === "level") list = list.filter(gift => gift.coins >= range.from && gift.coins <= range.to);
    else if (filter === "priced") list = list.filter(gift => gift.coins > 0);
    else list = list.filter(gift => !gift.coins);
    list.sort((a, b) => (a.coins || Infinity) - (b.coins || Infinity) || a.name.localeCompare(b.name, "vi"));
    grid.replaceChildren();
    const none = document.createElement("button");
    none.type = "button";
    none.className = "gift-tile clear";
    none.textContent = "✕ Bỏ chọn";
    none.addEventListener("click", () => choose(null));
    grid.append(none);
    for (const gift of list) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "gift-tile";
      if (gift.id === button.dataset.id) tile.classList.add("picked");
      tile.disabled = used.has(gift.id);
      tile.title = tile.disabled ? "Đang dùng ở chỗ khác" : gift.name;
      const name = Object.assign(document.createElement("span"), { className: "gift-name", textContent: gift.name });
      const price = Object.assign(document.createElement("small"), { textContent: tile.disabled ? "đang dùng" : coinsText(gift.coins) });
      tile.append(giftPicture(gift, 40), name, price);
      tile.addEventListener("click", () => choose(gift));
      grid.append(tile);
    }
    note.textContent = filter === "level"
      ? (list.length ? `Quà ${range.label}. Danh sách giá đầy đủ hơn sau lần kết nối live tới.` : `Chưa biết món nào ${range.label}. Thử "Mọi giá" hoặc "Chưa rõ giá"; danh sách đầy đủ có sau lần kết nối live tới.`)
      : filter === "unknown" ? "Những món này chưa biết giá: chọn thì nhớ đúng khoảng xu của mức." : "";
  }
  function choose(gift) {
    fillGiftSelect(button, gift);
    closeGiftPicker();
    button.focus();
    gameSaver.now();
  }
  el.querySelector(".picker-filters").addEventListener("click", event => {
    const chip = event.target.closest("[data-filter]");
    if (!chip) return;
    filter = chip.dataset.filter;
    el.querySelectorAll("[data-filter]").forEach(c => c.classList.toggle("on", c === chip));
    draw();
  });
  search.addEventListener("input", draw);
  draw();
  // Under the button, kept inside the window.
  const box = button.getBoundingClientRect();
  const width = Math.min(440, innerWidth - 16);
  el.style.width = `${width}px`;
  el.style.left = `${Math.max(8, Math.min(box.left + scrollX, scrollX + innerWidth - width - 8))}px`;
  el.style.top = `${box.bottom + scrollY + 6}px`;
  search.focus();
}
document.addEventListener("mousedown", event => {
  if (picker.el && !picker.el.contains(event.target) && !event.target.closest(".gift-pick")) closeGiftPicker();
});
document.addEventListener("keydown", event => { if (event.key === "Escape" && picker.el) { const back = picker.button; closeGiftPicker(); back?.focus(); } });
// The levels, each with a gift box for either side and what that gift does. Built once; the boxes are filled
// again whenever the settings come in.
function renderGameTiers(tiers) {
  if (gameLevels.length === tiers.length) return;
  gameLevels = tiers;
  const table = $("gameTiers");
  table.replaceChildren();
  const head = table.insertRow();
  for (const text of ["Mức", "Giá trị quà", "😈 Quà Phe Phá", "💗 Quà Phe Giữ"]) {
    const th = document.createElement("th");
    th.textContent = text;
    head.append(th);
  }
  tiers.forEach((tier, i) => {
    const next = tiers[i + 1];
    const row = table.insertRow();
    const value = next ? `${tier.from.toLocaleString("vi-VN")} – ${(next.from - 1).toLocaleString("vi-VN")} xu` : `từ ${tier.from.toLocaleString("vi-VN")} xu`;
    const raid = tier.dogs > 1 ? `${tier.dogs} Ennie tha ${tier.take} món` : `Ennie tha ${tier.take} món`;
    const guard = tier.give === "all" ? "Mưa tim phủ kín, trả lại hết" : `Mưa tim, trả lại ${tier.give} món`;
    row.insertCell().textContent = tier.name;
    row.insertCell().textContent = value;
    for (const [team, effect] of [["raid", raid], ["guard", guard]]) {
      const cell = row.insertCell();
      cell.className = "level-gift";
      const select = document.createElement("button");
      select.type = "button";
      select.className = "gift-pick";
      select.id = `game-${team}-${i}`;
      select.setAttribute("aria-label", `Quà ${team === "raid" ? "Phe Phá" : "Phe Giữ"} mức ${tier.name} (${value})`);
      const range = { from: tier.from, to: next ? next.from - 1 : Infinity, label: next ? `từ ${tier.from.toLocaleString("vi-VN")} đến ${(next.from - 1).toLocaleString("vi-VN")} xu` : `từ ${tier.from.toLocaleString("vi-VN")} xu trở lên` };
      select.addEventListener("click", () => openGiftPicker(select, range));
      const note = document.createElement("small");
      note.textContent = effect;
      cell.append(select, note);
    }
  });
  const tests = $("gameTests");
  tests.querySelectorAll("button").forEach(button => button.remove());
  for (const team of ["raid", "guard"]) {
    tiers.forEach((tier, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = `${team === "raid" ? "😈 Phá" : "💗 Giữ"} ${tier.name.toLowerCase()}`;
      button.addEventListener("click", async () => {
        try {
          const { ok, body } = await post("/api/jar-game/test", { team, tier: i, nickname: $("nickname").value.trim() });
          if (!ok) throw new Error();
          notify("gameNotice", team === "raid"
            ? (body.count ? `Ennie đi tha ${body.count} món ✓` : "Hũ trống, không còn gì để tha.")
            : (body.count ? `Mưa tim trả lại ${body.count} món ✓` : "Mưa tim ✓ (chưa có món nào bị tha)"));
        } catch {
          notify("gameNotice", "Không liên lạc được với server.", true);
        }
      });
      tests.append(button);
    });
  }
}
function showGame(settings) {
  $("gameOn").checked = settings.on;
  $("gameOnLabel").textContent = settings.on ? "Bật" : "Tắt";
  $("gameBody").hidden = !settings.on;
  if (document.activeElement !== $("gameMinutes") && settings.minutes) $("gameMinutes").value = settings.minutes;
  if (document.activeElement !== $("gameDares") && Array.isArray(settings.dares)) $("gameDares").value = settings.dares.join("\n");
  if (settings.round) showRound(settings.round);
  if (settings.tiers) renderGameTiers(settings.tiers);
  gameLevels.forEach((_, i) => {
    fillGiftSelect(levelSelect("raid", i), settings.raid?.[i] ?? null);
    fillGiftSelect(levelSelect("guard", i), settings.guard?.[i] ?? null);
  });
  // What the server holds counts as saved, so showing it sends nothing back.
  if (gameLevels.length) gameSaver.known({ raid: settings.raid ?? [], guard: settings.guard ?? [], minutes: settings.minutes, dares: settings.dares ?? [] });
}
Promise.all([fetch("/api/jar-game/gifts").then(res => res.json()), fetch("/api/jar-game").then(res => res.json())])
  .then(([gifts, settings]) => { gameGifts = gifts; showGame(settings); })
  .catch(() => {});
socket.on("jar-game-settings", settings => showGame(settings));
// ---------- Who gave, on both sides ----------
// A dialog listing everyone who has given in the round under way (refreshed every 2 seconds while open) or in the
// last round, for Ennie to read out and thank.
let donorsTimer = 0;
function fillDonorList(list, people) {
  list.replaceChildren();
  if (!people.length) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = "Chưa có ai";
    list.append(li);
    return;
  }
  for (const person of people) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = person.nickname;
    const coins = document.createElement("em");
    coins.textContent = `${person.coins.toLocaleString("vi-VN")} xu`;
    li.append(name, coins);
    list.append(li);
  }
}
async function loadDonors() {
  try {
    const data = await fetch("/api/jar-game/contributors").then(res => res.json());
    const raid = data.everyone?.raid ?? [], guard = data.everyone?.guard ?? [];
    const coins = list => list.reduce((sum, person) => sum + person.coins, 0);
    $("donorsRaidHead").textContent = `😈 Phe Phá · ${raid.length} người · ${coins(raid).toLocaleString("vi-VN")} xu`;
    $("donorsGuardHead").textContent = `💗 Phe Giữ · ${guard.length} người · ${coins(guard).toLocaleString("vi-VN")} xu`;
    fillDonorList($("donorsRaid"), raid);
    fillDonorList($("donorsGuard"), guard);
    const states = {
      live: "Ván đang chơi, danh sách tự cập nhật.",
      preview: "Ván sắp bắt đầu, chưa ai góp.",
      ending: "Ván vừa hết giờ.",
      done: data.winner === "raid" ? `Ván trước: 😈 Phe Phá thắng, Ennie trả kèo "${data.dare}".` : data.winner === "guard" ? "Ván trước: 💗 Phe Giữ thắng." : "Ván trước: hòa.",
      none: "Chưa có ván nào."
    };
    $("donorsSummary").textContent = states[data.state] ?? "";
  } catch {
    $("donorsSummary").textContent = "Không liên lạc được với server.";
  }
}
$("openDonors").addEventListener("click", () => {
  loadDonors();
  $("donorsDialog").showModal();
  clearInterval(donorsTimer);
  donorsTimer = setInterval(loadDonors, 2000);
});
$("closeDonors").addEventListener("click", () => $("donorsDialog").close());
$("donorsDialog").addEventListener("close", () => clearInterval(donorsTimer));
// A click on the dimmed backdrop closes it too.
$("donorsDialog").addEventListener("click", event => {
  const box = $("donorsDialog").getBoundingClientRect();
  const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  if (event.target === $("donorsDialog") && outside) $("donorsDialog").close();
});

// The round under way, counted down here from the server's own time.
let gameRound = null, roundOffset = 0;
function showRound(data) {
  if (Number.isFinite(data?.now)) roundOffset = data.now - Date.now();
  if (data?.result) {
    const { winner, score, dare, top } = data.result;
    const who = winner === "raid" ? `😈 Phe Phá thắng, Ennie trả kèo: ${dare}` : winner === "guard" ? "💗 Phe Giữ thắng" : "Hòa";
    gameRound = null;
    $("roundStatus").textContent = `Hết giờ: ${who} (${score.raid.toLocaleString("vi-VN")} – ${score.guard.toLocaleString("vi-VN")} xu)${top?.[0] ? ` · Top 1: ${top[0].nickname}` : ""}`;
    $("roundStatus").classList.remove("live");
  } else if (data?.running) {
    gameRound = data;
  } else if (gameRound) {
    gameRound = null;
    $("roundStatus").textContent = "Đã dừng ván, không tính thắng thua.";
    $("roundStatus").classList.remove("live");
  }
  $("roundStart").textContent = gameRound ? "↻ Ván mới" : "▶ Bắt đầu ván";
  $("roundStop").disabled = !gameRound;
  tickRound();
}
function tickRound() {
  if (!gameRound) return;
  const now = Date.now() + roundOffset;
  if (Number.isFinite(gameRound.startsAt) && now < gameRound.startsAt) {
    $("roundStatus").textContent = `Đang hiện kèo trên overlay · bắt đầu sau ${Math.ceil((gameRound.startsAt - now) / 1000)} giây · Kèo: ${gameRound.dare}`;
    $("roundStatus").classList.add("live");
    return;
  }
  const left = Math.max(0, Math.ceil((gameRound.endsAt - now) / 1000));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const { raid, guard } = gameRound.score;
  $("roundStatus").textContent = `Đang đấu · còn ${clock} · 😈 ${raid.toLocaleString("vi-VN")} – ${guard.toLocaleString("vi-VN")} 💗 · Kèo: ${gameRound.dare}`;
  $("roundStatus").classList.add("live");
}
setInterval(tickRound, 500);
socket.on("jar-game-round", showRound);
const dareList = () => $("gameDares").value.split("\n").map(line => line.trim()).filter(Boolean);
const roundMinutes = () => {
  const n = Number($("gameMinutes").value);
  return $("gameMinutes").value !== "" && Number.isFinite(n) ? Math.max(0.5, Math.min(30, Math.round(n * 2) / 2)) : null;
};
// What the boxes hold, as the server keeps it; null while it cannot be saved yet.
function collectGame() {
  if (!gameLevels.length) return null;
  const raid = gameLevels.map((_, i) => pickedGift(levelSelect("raid", i)));
  const guard = gameLevels.map((_, i) => pickedGift(levelSelect("guard", i)));
  const ids = [...raid, ...guard].filter(Boolean).map(gift => gift.id);
  if (new Set(ids).size !== ids.length) { notify("gameNotice", "Mỗi món quà chỉ dùng cho một chỗ, chọn món khác nhé.", true); return null; }
  const minutes = roundMinutes();
  if (minutes == null) return null;
  return { raid, guard, minutes, dares: dareList() };
}
const gameSaver = autoSave({
  collect: collectGame,
  send: async data => {
    try {
      const { ok } = await post("/api/jar-game", data);
      if (!ok) throw new Error();
      const count = team => data[team].filter(Boolean).length;
      notify("gameNotice", count("raid") && count("guard")
        ? `Đã lưu ✓ Phe Phá ${count("raid")} món, Phe Giữ ${count("guard")} món`
        : "Đã lưu ✓ Chọn quà cho cả hai phe nữa nhé.");
      return true;
    } catch {
      notify("gameNotice", "Không lưu được, thử lại.", true);
      return false;
    }
  }
});
$("gameMinutes").addEventListener("input", () => gameSaver.soon(900));
$("gameMinutes").addEventListener("change", () => gameSaver.now());
$("gameDares").addEventListener("input", () => gameSaver.soon(1200));
$("gameDares").addEventListener("blur", () => gameSaver.now());
$("roundStart").addEventListener("click", async () => {
  try {
    // Anything still waiting to be saved goes first, so this round uses the time and dares in the boxes.
    await gameSaver.now();
    const { ok, body } = await post("/api/jar-game/round/start");
    if (!ok) return notify("gameNotice", body.error || "Không bắt đầu được.", true);
    showGame(body);
    notify("gameNotice", `Bắt đầu ván ${body.minutes} phút ✓`);
  } catch {
    notify("gameNotice", "Không liên lạc được với server.", true);
  }
});
$("roundStop").addEventListener("click", async () => {
  try {
    const { ok, body } = await post("/api/jar-game/round/stop");
    if (ok) showGame(body);
  } catch {
    notify("gameNotice", "Không liên lạc được với server.", true);
  }
});
// The switch saves at once, and shows or hides the settings under it. Gifts are picked once it is on; until
// both are, gifts do nothing.
$("gameOn").addEventListener("change", async () => {
  const on = $("gameOn").checked;
  const undo = text => { $("gameOn").checked = !on; $("gameOnLabel").textContent = on ? "Tắt" : "Bật"; $("gameBody").hidden = on; notify("gameNotice", text, true); };
  $("gameOnLabel").textContent = on ? "Bật" : "Tắt";
  $("gameBody").hidden = !on;
  $("gameOn").disabled = true;
  try {
    const { ok, body } = await post("/api/jar-game", { on });
    if (!ok) throw new Error();
    showGame(body);
    notify("gameNotice", !on ? "Đã tắt trò chơi ✓ Quà Ennie tha đã về lại hũ."
      : body.raid?.some(Boolean) && body.guard?.some(Boolean) ? "Đã bật trò chơi ✓"
      : "Đã bật. Chọn quà cho từng mức của hai phe ở dưới nhé.");
  } catch {
    undo("Không lưu được, thử lại.");
  } finally {
    $("gameOn").disabled = false;
  }
});

// Reloads the overlay pages open in Studio. Nothing is deleted: they load the jar and the rest back.
$("reloadOverlay").addEventListener("click", async () => {
  try {
    const { ok } = await post("/api/overlay/reload");
    notify("reloadNotice", ok ? "Đã tải lại overlay, dữ liệu giữ nguyên ✓" : "Không tải lại được.", !ok);
  } catch {
    notify("reloadNotice", "Không liên lạc được với server.", true);
  }
});

// ---------- Tabs ----------
// Four tabs, by when they are used. The one open is remembered in this browser; the Live tab comes first.
const TABS = ["live", "welcome", "overlay", "test"];
let tab = "live";
function openTab(name) {
  tab = TABS.includes(name) ? name : "live";
  for (const id of TABS) {
    $(`tab-${id}`).setAttribute("aria-selected", String(id === tab));
    $(`tab-${id}`).tabIndex = id === tab ? 0 : -1;
    $(`pane-${id}`).hidden = id !== tab;
  }
  if (tab === "live") $("liveAlert").hidden = true;
  try { localStorage.setItem("dashboardTab", tab); } catch { /* not kept, fine */ }
}
for (const id of TABS) $(`tab-${id}`).addEventListener("click", () => openTab(id));
// Arrow keys move between tabs, as tab lists do.
document.querySelector(".tabs").addEventListener("keydown", event => {
  const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
  if (!step) return;
  const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
  openTab(next);
  $(`tab-${next}`).focus();
});
let savedTab = "live";
try { savedTab = localStorage.getItem("dashboardTab") || "live"; } catch { /* default */ }
openTab(savedTab);

// A red dot on the Live tab when the connection to TikTok drops while another tab is open.
let wasConnected = false;
socket.on("tiktok-status", status => {
  if (status.state === "connected") { wasConnected = true; $("liveAlert").hidden = true; return; }
  if (status.state === "disconnected" && wasConnected && tab !== "live") $("liveAlert").hidden = false;
  if (status.state === "disconnected") wasConnected = false;
});

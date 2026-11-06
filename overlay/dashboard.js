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
fetch("/api/welcome/rules").then(r => r.json()).then(renderRules).catch(() => {});
$("rulesForm").addEventListener("submit", async event => {
  event.preventDefault();
  const rules = {
    fan: { on: $("ruleFanOn").checked, above: Number($("ruleFanAbove").value), badge: $("ruleFanBadge").value.trim() },
    gifter: { on: $("ruleGifterOn").checked, above: Number($("ruleGifterAbove").value), badge: $("ruleGifterBadge").value.trim() }
  };
  try {
    const { ok, body } = await post("/api/welcome/rules", rules);
    if (!ok) { notify("rulesNotice", "Không lưu được.", true); return; }
    renderRules(body);
    notify("rulesNotice", `Đã lưu ✓ Tim đội từ cấp ${body.fan.above + 1}, cấp quà từ cấp ${body.gifter.above + 1}.`);
  } catch { notify("rulesNotice", "Không liên lạc được với server.", true); }
});

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

// Quick picks fill in the test gift.
for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => {
    $("giftName").value = chip.dataset.gift;
    $("diamondCount").value = chip.dataset.coins;
    $("repeatCount").value = 1;
  });
}

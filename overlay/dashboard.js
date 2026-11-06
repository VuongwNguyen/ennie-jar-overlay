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

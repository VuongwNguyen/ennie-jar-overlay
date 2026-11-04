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
function renderTikTok(status) {
  const labels = { disconnected: "Chưa kết nối", connecting: "Đang kết nối…", connected: "Đã kết nối" };
  $("tiktokStatus").textContent = labels[status.state] + (status.username && status.state !== "disconnected" ? ` · @${status.username}` : "");
  $("tiktokError").textContent = status.error || "";
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
  try {
    const { ok, body } = await post("/api/tiktok/connect", { username });
    if (!ok) $("tiktokError").textContent = body.error || "Không kết nối được";
  } catch { $("tiktokError").textContent = "Không liên lạc được với server."; }
});
$("tiktokDisconnect").addEventListener("click", () => post("/api/tiktok/disconnect").catch(() => {}));
$("sendGift").addEventListener("click", async () => {
  const diamondCount = Number($("diamondCount").value);
  const repeatCount = Number($("repeatCount").value);
  if (!Number.isFinite(diamondCount) || diamondCount < 0 || !Number.isInteger(repeatCount) || repeatCount < 1) {
    alert("Xu / quà phải ≥ 0 và Số lượng phải là số nguyên ≥ 1.");
    return;
  }
  const body = {
    user: { id: $("nickname").value.trim().toLowerCase().replace(/\s+/g, "-") || "demo-user", nickname: $("nickname").value.trim() || "Người xem" },
    gift: { id: "demo", name: $("giftName").value.trim() || "Rose", diamondCount, repeatCount, repeatEnd: true }
  };
  try {
    const response = await fetch("/api/simulate/gift", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if (!response.ok) alert("Không gửi được sự kiện thử nghiệm.");
  } catch { alert("Không liên lạc được với server."); }
});
$("reset").addEventListener("click", async () => {
  if (!confirm("Reset toàn bộ dữ liệu phiên hiện tại?")) return;
  try { await fetch("/api/session/reset", { method:"POST" }); } catch { alert("Không liên lạc được với server."); }
});

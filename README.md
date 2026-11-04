# TikTok Jar Overlay — Local Web Application

A cross-platform local overlay starter for OBS. The first milestone includes a dashboard, a gift simulator, a transparent browser overlay, basic Matter.js physics, and local JSON session persistence.

## Requirements

- Node.js 22 or newer
- OBS Studio with Browser Source support
- Windows, Linux, or macOS

## Run

```bash
npm install
npm start
```

Open the control dashboard:

- http://127.0.0.1:8787/

Add an OBS Browser Source:

- URL: `http://127.0.0.1:8787/overlay.html`
- Width: `1080`
- Height: `1920`
- Enable browser source transparency / leave the page background transparent.

Stop the server with `Ctrl+C`.

## Kết nối TikTok LIVE

Trên dashboard, nhập username kênh đang livestream rồi bấm **Kết nối**. Adapter (`server/src/tiktok.js`) dùng thư viện không chính thức `tiktok-live-connector`, đổi sự kiện quà về dạng chuẩn bên dưới và đi qua cùng pipeline với simulator.

- Khi khởi động, server tự kết nối tới `ennieiuoiw` và thử lại mỗi 30 giây nếu kênh chưa live hoặc bị rớt. Đổi kênh bằng `TIKTOK_USERNAME=ten_kenh npm start`, tắt bằng `TIKTOK_USERNAME= npm start`. Bấm **Ngắt** trên dashboard sẽ dừng tự kết nối.
- Quà streak (`giftType 1`) chỉ được tính một lần, ở sự kiện cuối `repeatEnd: true`.
- Nếu bị giới hạn ký (rate limit), đặt `EULER_API_KEY` trước khi chạy `npm start`.
- Thư viện này không phải API chính thức của TikTok và có thể ngừng hoạt động khi TikTok thay đổi.

## Test

1. Open the dashboard.
2. Enter a donor name and gift details.
3. Click **Gửi quà thử nghiệm**.
4. Watch the overlay update in the browser or OBS.
5. Use **Reset phiên** to clear the current session.

Health check: `http://127.0.0.1:8787/api/health`

## Project structure

```text
server/src/index.js       Local HTTP + Socket.IO server and normalized event core
overlay/index.html        Control dashboard
overlay/overlay.html      Transparent OBS overlay
server/src/tiktok.js      TikTok LIVE adapter
overlay/dashboard.js      Dashboard interactions
overlay/overlay.js        Overlay rendering and physics
overlay/styles.css        Shared styling
data/session.json         Automatically created local session state
```

## Cross-platform design

- No OS-specific APIs are used by the app.
- OBS loads the same local URL on Windows, Linux, and macOS.
- TikTok integration is intentionally behind a normalized event contract. The simulator works without TikTok.
- The server binds to `127.0.0.1` by default. Do not expose it to your LAN or the public internet without adding authentication and security controls.

## Normalized gift event contract

```js
{
  type: "gift",
  eventId: "unique-event-id",
  user: { id: "viewer-id", nickname: "Viewer", avatar: "" },
  gift: {
    id: "gift-id",
    name: "Rose",
    image: "https://.../rose.png", // optional
    diamondCount: 1,
    repeatCount: 1,
    repeatEnd: true
  },
  timestamp: 1730000000000
}
```

`diamondCount * repeatCount` is the current demo's coin calculation. A real TikTok adapter must verify gift streak semantics and platform-specific values before using this calculation in production.

## Current limitations

- The jar artwork is CSS-based placeholder styling, not final production art.
- Donor avatars are stored in the event contract but not yet rendered.
- The simulator is for local functional testing only.
- This is an MVP scaffold, not a security-audited production release.

## Gói Windows cho người không rành kỹ thuật

`bash scripts/build-windows.sh` tạo `dist/GiftJar-Windows.zip` (kèm Node portable). Người dùng chỉ giải nén và bấm đúp `start.bat`; kênh mặc định là `ennieiuoiw`. Xem `HUONG-DAN.txt` trong gói.

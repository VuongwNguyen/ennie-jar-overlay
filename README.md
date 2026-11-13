# TikTok Jar Overlay — Ennie Live

Overlay chạy local cho TikTok LIVE Studio và OBS. Quà của người xem rơi vào một chiếc hũ thủy tinh có vật lý (Matter.js). Kèm theo là chú chó poodle Ennie cảm ơn người tặng, khung chào mừng người vào live và hiệu ứng tim cho quà lớn. Mọi thứ nằm trên một nguồn Browser Source duy nhất, kích thước 1080 × 1920.

## Yêu cầu

- Node.js 22 trở lên
- TikTok LIVE Studio hoặc OBS Studio (Browser Source)
- Windows, Linux hoặc macOS

## Chạy

```bash
npm install
npm start          # hoặc ./start.sh trên Linux/macOS (tự mở trang điều khiển)
```

Các trang (mặc định `http://127.0.0.1:8787`):

| Trang | Dùng để |
| --- | --- |
| `/` | Trang điều khiển: kết nối TikTok, danh sách người trong live, quy tắc chào mừng, hiệu ứng quà lớn, giả lập |
| `/live.html` | **Nguồn duy nhất cho Studio/OBS**: gộp hũ, khung chào mừng và video tim trên một sân khấu 1080 × 1920 |
| `/layout.html` | Kéo thả bố cục các lớp (vị trí, kích thước, thứ tự, ẩn/hiện, khóa). Thay đổi áp dụng ngay, không cần tải lại nguồn |
| `/overlay.html`, `/welcome.html`, `/heart.html` | Từng phần riêng lẻ, dùng khi muốn tách thành nguồn riêng |

Thêm Browser Source: URL `http://127.0.0.1:8787/live.html`, rộng 1080, cao 1920, nền trong suốt. Dừng server bằng `Ctrl+C`.

Kiểm tra nhanh: `http://127.0.0.1:8787/api/health`.

### Tham số trên URL

- `live.html` chuyển tiếp xuống hũ các tham số `jar=blue|lavender|mint` (màu kính), `dog`, `cat=1` (mèo ngồi trên hũ), `nosticker`, `sfx`.
- `dog=3d|toon|glb|svg` chọn kiểu chú chó khác. Mặc định là chính Ennie, cắt từ video tim đội (xem `tools/video_sprites/`).
- `size=1.2` phóng to hoặc thu nhỏ hũ trong `overlay.html`.

## Kết nối TikTok LIVE

Trên trang điều khiển, nhập username kênh đang live rồi bấm **Kết nối**. Adapter (`server/src/tiktok.js`) dùng thư viện không chính thức `tiktok-live-connector`, đổi sự kiện TikTok về dạng chuẩn rồi đưa qua cùng pipeline với trình giả lập.

- Khi khởi động, server tự kết nối tới `ennieiuoiw` và thử lại mỗi 30 giây nếu kênh chưa live hoặc bị rớt. Đổi kênh bằng `TIKTOK_USERNAME=ten_kenh npm start`, tắt bằng `TIKTOK_USERNAME= npm start`. Bấm **Ngắt** sẽ dừng tự kết nối.
- Quà streak chỉ được tính một lần, ở sự kiện cuối (`repeatEnd`).
- Nếu bị giới hạn ký (rate limit), đặt `EULER_API_KEY` trước khi chạy.
- Thư viện này không phải API chính thức của TikTok và có thể ngừng hoạt động khi TikTok thay đổi.

## Các tính năng

### Hũ quà
- Quà rơi từ trần hũ theo vật lý. Quà từ 199 xu trở lên được vẽ to hơn, tối đa 140px.
- Hũ rung và có hiệu ứng lấp lánh theo mức quà (thường, từ 100 xu, từ 1000 xu).
- Top 3 người tặng hiện avatar trên các thẻ treo.
- Phiên được lưu ở `data/session.json`; mở lại overlay thì hũ được dựng lại. **Reset phiên** xóa sạch.

### Hiệu ứng quà lớn
Quà có giá mỗi món từ ngưỡng đặt trên trang điều khiển (mặc định 1000 xu, `0` là tắt) sẽ gom mọi quà trên màn hình thành hình trái tim ở giữa, nổ ra rồi đổ lại vào hũ (`bigburst.js`). Ngưỡng lưu ở `data/effects.json`.

### Chào mừng người vào live
Khi ai đó vào live, hoặc lần đầu được thấy qua chat, like, quà, follow, share, họ được xét để hiện khung chào mừng (`welcome.html`). Thứ tự xét:

1. Được chỉ định theo @tên hoặc id (ưu tiên cao nhất).
2. Cấp tim đội (fan club) lớn hơn ngưỡng đặt (mặc định trên 10).
3. Cấp quà (gifter) lớn hơn ngưỡng đặt (mặc định trên 15).

Mỗi nhóm có danh hiệu riêng. Fan cấp từ 20 trở lên và Super Fan không có sự kiện "member", nên adapter đọc từ banner vào live. TikTok không gửi cấp khi người ta vào live, nên cấp được nhớ lại mỗi khi thấy ở quà hoặc chat (`data/levels.json`). Danh sách trên trang điều khiển cho biết từng người được chào hay không và vì sao. Các trạng thái: đang chờ, đã chào, không có overlay, hàng đợi đầy, không kịp hiện.

Giới hạn chống spam (tối đa 3 lần trong 10 phút, cách nhau 15 giây cho mỗi người) hiện đang tắt trong `server/src/index.js`, hàm `welcome()`.

### Chú chó Ennie
Chú chó dưới sàn hũ là **Ennie thật**: các khung hình của video tim đội (`overlay/media/ennie_heart.webm`) đã cắt nền, không phải mô hình dựng lại. Cô bé đứng nhìn, chớp mắt, quay nhìn, ngáp, vẫy đuôi, cười, nhảy mừng với đôi tai bay, **đi bộ** từ bên này sang bên kia hũ và thỉnh thoảng nhảy chuyền. Các clip đi bộ, ngáp, vẫy đuôi cắt từ một video AI khác (nền xanh) dựng bằng ảnh của chính Ennie. Cô bé cảm ơn người tặng và chào người vào live qua bong bóng thoại. Có âm thanh nhỏ (`sfx.js`), tự ngủ khi không có hoạt động.

Kích thước chú chó là hằng `SIZE` đầu `overlay/dogsprite.js`. Muốn thêm động tác (chạy, ngồi), dựng thêm video của Ennie rồi cho qua cùng quy trình trong `tools/video_sprites/README.md`.

### Bố cục
`layout.html` chỉnh ba lớp: `jar`, `welcome`, `heart`. Hũ có thêm thông số `drop`, là độ cao trần mà quà rơi xuống, có thể cao hơn khung hũ. Bố cục lưu ở `data/layout.json`. Nút **Tải lại overlay** trên trang điều khiển tải lại mọi overlay đang mở.

### Giả lập
Trang điều khiển có mục **Giả lập** để gửi quà thử và người vào live thử (giả làm người vào, chat, like, social hoặc quà), không ảnh hưởng TikTok.

## Cấu trúc

```text
server/src/index.js        Server HTTP + Socket.IO, trạng thái phiên, quy tắc chào mừng, bố cục, API
server/src/tiktok.js       Adapter TikTok LIVE (quà, người vào, chat/like/follow/share, cấp bậc)
overlay/index.html         Trang điều khiển (dashboard.js)
overlay/live.html          Nguồn duy nhất cho Studio/OBS (live.js)
overlay/layout.html        Trang bố cục (layout.js, layout.css)
overlay/overlay.html       Hũ quà (overlay.js, bigburst.js, jardecor.js, sfx.js)
overlay/welcome.html       Khung chào mừng (welcome.js)
overlay/heart.html         Video tim đội (heartfx.js)
overlay/dog*.js            Các kiểu chú chó (dogsprite.js là bản mặc định; toon, glb, 3D là bản cũ)
overlay/models, media      Ảnh sprite, mô hình GLB, video
tools/video_sprites/       Cắt Ennie ra khỏi video thành sprite cho overlay
blender_pipeline/, poodle/ Mô hình poodle bằng Blender (chỉ còn dùng cho ?dog=glb và ?dog=3d)
scripts/                   Đóng gói Windows và launcher tự cập nhật
data/                      Tự tạo khi chạy: session, levels, welcome, welcome-rules, layout, effects (.json)
```

## API chính

`GET /api/health`, `GET /api/state`, `GET /api/version`, `POST /api/simulate/gift`, `POST /api/simulate/member`, `POST /api/session/reset`, `GET|POST /api/tiktok/*`, `GET|POST /api/welcome`, `GET|POST /api/welcome/rules`, `GET|POST /api/layout`, `GET|POST /api/effects`, `POST /api/overlay/reload`, `GET /api/members/recent`.

## Hợp đồng sự kiện quà

Mọi nguồn quà phải phát ra dạng chuẩn này:

```js
{
  type: "gift",
  eventId: "unique-event-id",
  user: { id: "viewer-id", uniqueId: "handle", nickname: "Viewer", avatar: "", fanLevel: 0, gifterLevel: 0 },
  gift: {
    id: "gift-id",
    name: "Rose",
    image: "https://.../rose.png", // tùy chọn
    diamondCount: 1,
    repeatCount: 1,
    repeatEnd: true
  },
  timestamp: 1730000000000
}
```

Số xu của một quà là `diamondCount * repeatCount`. Sự kiện trùng `eventId` bị bỏ qua, quà streak chưa kết thúc (`repeatEnd: false`) không được tính.

## Bảo mật

Server chỉ lắng nghe `127.0.0.1` và không có xác thực. Các API đổi cấu hình đều mở. Đừng đưa ra mạng LAN hoặc internet khi chưa thêm xác thực.

## Gói Windows cho người không rành kỹ thuật

`bash scripts/build-windows.sh` tạo `dist/GiftJar-Windows.zip` (kèm Node portable). Người dùng chỉ giải nén và bấm đúp `start.bat`; kênh mặc định là `ennieiuoiw`. Xem `HUONG-DAN.txt` trong gói.

### Tự động cập nhật

Mỗi lần push lên `main`, GitHub Actions (`.github/workflows/release.yml`) chạy script trên và đăng một release `build-N` gồm:

- `GiftJar-Windows.zip`: bản đầy đủ, để cài lần đầu.
- `GiftJar-update.zip` và `GiftJar-update.zip.sha256`: bản cập nhật, không kèm Node.

`start.bat` chạy `launcher.mjs` (nguồn ở `scripts/windows/launcher.mjs`). Trước khi bật server, launcher hỏi GitHub release mới nhất. Nếu số build lớn hơn `version.json`, nó tải `GiftJar-update.zip`, kiểm tra mã sha256 rồi thay `overlay/`, `server/`, `node_modules/` và vài file khác. `node/` và `data/` không bị đụng tới. Nếu server của bản mới dừng trong 30 giây đầu, launcher trả lại bản cũ và bỏ qua build đó. Không có mạng thì nó chạy bản đang có. Tắt cập nhật bằng biến `GIFTJAR_NO_UPDATE=1`.

Push chỉ thay đổi `blender_pipeline/`, `poodle/`, `tools/` hoặc tài liệu sẽ không tạo build mới. Repo phải public để máy live tải được release mà không cần đăng nhập.

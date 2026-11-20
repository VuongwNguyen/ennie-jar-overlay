# Lịch sử phát triển overlay hũ quà Ennie

Tổng hợp từ lịch sử commit trên `main`, từ bản đầu tiên (04/11/2026) đến 21/11/2026: 42 commit (không tính 5 commit merge), mỗi lần push lên `main` là một bản build mới.

## Tóm tắt theo giai đoạn

| Giai đoạn | Ngày | Nội dung chính |
|---|---|---|
| Khởi đầu: hũ quà | 04 – 06/11 | Hũ quà Matter.js, poodle, tự cập nhật từ GitHub Releases, hũ hồng pastel |
| Chào khách và hiệu ứng | 06 – 09/11 | Chó chào khách, khung chào, một nguồn Studio, nổ tim quà lớn, bắt fan cấp cao |
| Ennie thật và ổn định | 13/11 | Sổ quà, nối lại nhanh, tên quà tiếng Việt, Ennie thật cắt từ video |
| Trò chơi và lên cấp | 14 – 17/11 | Phe Phá / Phe Giữ, chỉ kết nối khi đang live, overlay lên cấp |
| Bể nuôi cá | 18 – 19/11 | Kiểu Bể nuôi cá, cá nhảy, đồ biển cho mọi overlay, tab Trò chơi, 28 kèo và kịch bản |
| Quà khủng và bắt mọi lượt vào | 21/11 | Quà từ 1.000 xu to theo bậc, thư mục docs, bắt mọi banner vào phòng |

## Chi tiết theo ngày

### 04/11 (Thứ Tư): bản đầu tiên

- **15:49 · `0e0b0ed` · Hũ quà · +2.786 dòng**: Bản đầu tiên: hũ quà TikTok
  - Server Express + Socket.IO, hũ vật lý Matter.js cho OBS / TikTok LIVE Studio
  - Trang điều khiển có giả lập tặng quà
  - Tự kết nối TikTok LIVE, script đóng gói Windows

### 05/11 (Thứ Năm)

- **21:48 · `e76fcc9` · Ennie · +11.875 dòng**: Poodle dựng sẵn, trang trí hũ, quà to theo giá
  - Chó poodle có biểu cảm đứng trước hũ (dựng bằng Blender)
  - Sticker xương trên miệng hũ, đom đóm, đồ trang trí hũ
  - Quà từ 199 xu to hơn; người tặng nhiều nhất treo cao nhất

### 06/11 (Thứ Sáu): ngày nhiều commit nhất (9)

- **11:38 · `0347c59` · Cập nhật · +267**: Tự cập nhật từ GitHub Releases khi mở
  - Mỗi lần push lên main là ra một bản build (bản đầy đủ và bản cập nhật không kèm Node.js, có sha256)
  - start.bat cài bản mới trước khi chạy, giữ `node/` và `data/`
  - Server mới chết trong 30 giây thì tự trả về bản cũ
- **12:02 · `84938e7` · Cập nhật · +61**: Cập nhật chống cài dở, chống kẹt cổng
  - Lỡ tắt cửa sổ giữa chừng thì bù lại phần thiếu
  - Có chương trình khác giữ cổng thì không cập nhật; hiện % tải
- **12:44 · `40ada55` · Hũ quà · +69**: Hũ thủy tinh hồng pastel
  - Giữa trong, đậm dần ra thành, viền mảnh, phản chiếu mờ
  - Có thêm màu xanh, oải hương, bạc hà; đáy bo tròn hơn
- **15:02 · `7c5020f` · Hiệu ứng · +215**: Clip Tim đội thành overlay riêng
  - heart.html phát clip khi có quà Heart Me, chỉnh âm lượng riêng
  - Trang điều khiển: link Studio có nút copy, chọn nhanh quà test
- **15:18 · `69814a3` · Cập nhật · +15**: Hiện "build N" trên trang điều khiển
- **15:24 · `2531a99` · Cập nhật · +26**: Vẫn cập nhật được khi thư mục đang bị mở
  - Sửa lỗi EPERM: thử lại 5 giây rồi chép đè thay vì đổi tên
- **15:31 · `b7a34d1` · Tài liệu · +2**: Ghi số build vào HUONG-DAN.txt
- **16:16 · `a9e02a0` · Chào khách · +165**: Chó chào người vào, cảm ơn người tặng
  - Bong bóng thoại "Chào {tên}!" và "Cảm ơn {tên} đã tặng {quà}!"
  - Quà lặp gộp thành ×N; 10 phút không chào lại một người
- **21:04 · `1c06817` · Chào khách · +1.124**: Khung chào trên hũ
  - Khung hoa văn có ảnh đại diện, băng tên, poodle vẫy tay, pháo giấy, cánh hoa
  - Thứ tự ưu tiên: chọn theo @tên → FAN CỨNG (tim đội > 10) → NHÀ TÀI TRỢ (cấp quà > 15)
  - Nhớ cấp người xem trong `data/levels.json`

### 07/11 (Thứ Bảy): 5 commit

- **01:59 · `97e98d3` · Chào khách · +176**: Chào cả người TikTok không báo vào phòng
  - Xét người xem cả lúc chat, thả tim, tặng, follow, share
  - Tên toàn khoảng trắng thì dùng @tên; hàng chờ 30 người
- **12:40 · `5a2f766` · Hũ quà · +1.254**: Một nguồn Studio cho cả overlay + trang bố cục
  - live.html gom hũ, khung chào, clip tim trên khung 1080×1920
  - layout.html: kéo thả, đổi cỡ, khóa, ẩn từng lớp, đặt trần thả quà
- **15:33 · `0295f99` · Hiệu ứng · +1.344**: Nổ tim cho quà lớn, trang điều khiển 4 tab
  - Quà ≥ 1.000 xu rơi như sao chổi, hút quà thành trái tim, đập rồi nổ
  - Âm thanh Web Audio; nút tải lại overlay
- **18:51 · `ae7d629` · Hiệu ứng · +90**: Nổ tim nhẹ hơn cho máy card onboard
  - Tối đa 60 quà bay lên, bỏ bóng mờ; âm thanh ngủ sau 5 giây
- **22:37 · `74141fb` · Chào khách · +49**: Bắt fan cấp 20+ và Super Fan vào phòng
  - Họ đi qua banner `fans_entrance`, không phải tin vào phòng thường

### 09/11 (Thứ Hai)

- **15:52 · `c1645b3` · Hiệu ứng · −184**: Bỏ vòng phép khỏi nổ tim, cập nhật README
- **18:52 · `7a7ceed` · Hiệu ứng · +8**: Trả lại nổ tim đầy đặn (70 bản sao, 48 tia)

### 13/11 (Thứ Sáu): 6 commit

- **02:07 · `3e80384` · Kết nối · +100**: Sổ quà, rớt mạng nối lại nhanh
  - `data/gift-log.jsonl` ghi mọi quà, xoay vòng khi quá 4 MB
  - Nối lại sau 3s → 6s → 12s → 30s; khớp quà theo id
- **02:24 · `6109cce` · Kết nối · +188**: Tên quà tiếng Việt (~180 quà)
- **14:56 · `78ecdfb` · Ennie · +503**: Ennie thật, cắt ra từ video
  - Lấy khung hình từ clip tim và clip phông xanh, bỏ nền
  - Đi, nhảy, ngáp, vẫy đuôi, chớp mắt, cười
- **20:18 · `505102a` · Ennie · +246**: Ennie ngồi góc nhìn thẳng
  - Ngồi góc phải dưới hũ, đổi biểu cảm, có bóng và nhịp thở
- **20:39 · `ce41f79` · Hũ quà · +8**: Quà từ 90 xu to dần, từ 199 xu nhân 1,3 (tối đa 180px)
- **20:51 · `42a14f6` · Hiệu ứng · +8**: Sửa clip Tim đội không chạy sau khi đổi tên tiếng Việt
  - Giờ khớp theo id quà 7934

### 14/11 (Thứ Bảy): trò chơi ra đời

- **05:19 · `6434609` · Trò chơi · +3.579**: Trò chơi trên hũ: Phe Phá và Phe Giữ
  - Phe Phá: Ennie nhảy lên miệng hũ tha quà đi; Phe Giữ: mưa tim trả quà lại
  - 4 mức quà mỗi phe, vòng có kèo, đồng hồ, xu hai bên, vinh danh
  - pk.html bảng PK riêng; danh mục ~760 quà có giá và hình
- **20:27 · `81e1db1` · Trò chơi · +126**: Mây trước mưa tim, bảng trong suốt, câu kèo rõ hơn
  - "Phe Phá thắng thì Ennie phải: …"; chỉnh độ đậm nền (55%)
- **20:34 · `ab6bf45` · Kết nối · +195**: Soi sự kiện một người xem (chỉ bản dev)
  - Để tìm vì sao sót người vào; bản đóng gói không có

### 16/11 (Thứ Hai)

- **19:08 · `dbcacd1` · Kết nối · +34**: Chỉ kết nối khi Ennie đang live thật
  - Trước đó lúc offline vẫn vào phòng live cũ và báo "đã kết nối"
  - Giờ kiểm tra trang hồ sơ trước, và mỗi phút một lần

### 17/11 (Thứ Ba)

- **09:33 · `0bbacc2` · Lên cấp · +663**: Overlay lên cấp riêng
  - Tim hồng đập khi lên cấp fan, viên ngọc vàng lật khi lên cấp quà
  - Bắt từ msgType 8 và 10, và khi cấp tăng giữa buổi live
  - Trang bố cục có sàn và 2 vách cho quà tràn
- **13:57 · `2360bcb` · Lên cấp · +4**: Cả hai kiểu đều ghi "CHÚC MỪNG LÊN CẤP"

### 18/11 (Thứ Tư): bể cá ra đời

- **17:19 · `c8d1d2f` · Bể cá · +965**: Bể nuôi cá; sửa quà rơi xuyên đáy hũ
  - Quà rơi tõm, chìm chậm xuống cát; cá bơi, quay đầu, tản ra, rỉa quà
  - Rương báu mở cho quà từ 100 xu; đế vỏ sò, rong, sao biển, bảng gỗ
  - Bắt Hộ vệ (HỘ VỆ) và Super Fan (ÁNH SAO) vào phòng
  - Tắt tạm sàn; trang điều khiển còn 3 tab

### 19/11 (Thứ Năm): 8 commit

- **00:08 · `37a1497` · Lên cấp · +27**: Lên cấp có ảnh đại diện cạnh tên
- **00:13 · `6dc9c72` · Lên cấp · −11**: Bỏ hẳn tiếng hiệu ứng lên cấp
- **01:25 · `1bb17a8` · Bể cá · +82**: Cá nhảy vọt khỏi miệng bể
  - 20–40 giây một lần, cao ~115px trên miệng, vẽ đè lên mọi thứ
- **15:34 · `f477af0` · Bể cá · +630**: Các overlay khác mặc đồ biển khi chọn bể cá
  - Khung chào: vô lăng tàu gỗ, sóng lớn, cá hề nhảy, cá heo vọt qua
  - Lên cấp: tim nổi lên chứa nước biển; rương báu phun xu và ngọc
  - Nổ quà, thẻ người tặng (cửa sổ tàu), bong bóng thoại màu biển
- **17:52 · `a2c74ed` · Trò chơi · +60**: Tab Trò chơi riêng, top 3 xếp chồng
  - Ảnh top 1 đằng trước, 2 và 3 nấp sau, bỏ tên và xu; kèo nằm giữa
- **17:57 · `365cffb` · Trò chơi · +26**: 28 kèo mẫu và kịch bản giới thiệu cho Ennie
  - 4 nhóm: hát nhảy, giọng và mặt, cảm ơn ngọt, thử thách nhẹ
- **18:01 · `2273fdb` · Tài liệu**: Kịch bản: câu trả kèo dựng sẵn cho cả 28 kèo
- **18:03 · `6c33930` · Tài liệu · +6**: Đưa kịch bản vào bản build và bản cập nhật

### 21/11 (Thứ Bảy)

- **00:26 · `e613e59` · Hũ quà · +11**: Quà từ 1.000 xu: 215px, mỗi 500 xu thêm 10px
  - Tối đa 270px ở bể, 240px ở hũ
- **00:26 · `b587aa8` · Tài liệu · +6**: Thư mục docs đi kèm build và bản cập nhật
- **00:57 · `83a37bb` · Chào khách · +32**: Bắt mọi kiểu banner vào phòng theo msgType
  - 9 = đại gia cấp quà cao, 11 = fan cấp cao, 15 = người ẩn danh
  - Kiểu banner lạ được ghi log lần đầu thấy

## Số commit theo mảng

| Mảng | Số commit |
|---|---|
| Hiệu ứng | 6 |
| Hũ quà | 5 |
| Chào khách | 5 |
| Cập nhật | 4 |
| Kết nối | 4 |
| Lên cấp | 4 |
| Trò chơi | 4 |
| Tài liệu | 4 |
| Bể cá | 3 |
| Ennie | 3 |
| **Tổng** | **42** |

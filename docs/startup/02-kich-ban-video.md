# Kịch bản video dự thi — DrgX IDE (tối đa 03 phút)

> **Mục tiêu:** trong 180 giây, Hội đồng thấy được (1) vấn đề thật, (2) sản phẩm chạy thật, (3) lợi thế khác biệt, (4) mô hình kinh doanh, (5) tác động xã hội và (6) đội ngũ.
> **Yêu cầu của cuộc thi:** video do thành viên đội thực hiện, tối đa 03 phút, dung lượng ≤ 500MB, không vi phạm bản quyền (Phụ lục 05).

---

## 1. Thông số kỹ thuật

| Hạng mục | Khuyến nghị |
|---|---|
| Độ phân giải | 1920 × 1080 (Full HD), khung hình ngang 16:9 |
| Tốc độ khung | 30 fps (hoặc 25 fps) |
| Âm thanh | Giọng nói rõ, không tạp âm; nhạc nền ≤ 20% âm lượng giọng nói |
| Phụ đề | Tiếng Việt, chữ trắng viền tối, trong vùng an toàn |
| Định dạng xuất | MP4 (H.264 + AAC), bitrate 8–12 Mbps |
| Dung lượng | **≤ 500MB** (mục tiêu 150–250MB) |
| Thời lượng | **≤ 03:00** (mục tiêu 02:50–02:58) |
| Tên tệp | `DrgX-IDE-Video-DuThi.mp4` |

**Thiết bị tối thiểu:** điện thoại/Webcam 1080p, tai nghe có mic, máy tính chạy DrgX IDE. Có thể quay màn hình bằng OBS Studio (miễn phí) hoặc Xbox Game Bar (`Win + G`).

---

## 2. Cấu trúc 180 giây

| Thời gian | Nội dung | Hình ảnh | Chữ trên màn hình |
|---|---|---|---|
| 0:00–0:12 | Hook: quá nhiều công cụ | Montage cửa sổ editor, compiler, judge, AI, đồng hồ | “6–8 công cụ cho một bài code?” |
| 0:12–0:27 | Giới thiệu đội | 3–5 thành viên, tên + vai trò | “Nhóm DrgX — [Trường]” |
| 0:27–0:50 | Vấn đề | Học sinh loay hoay cài đặt; phòng máy yếu; tài liệu tiếng Anh | “Cài đặt 2 giờ. Học code 30 phút.” |
| 0:50–1:45 | Demo sản phẩm | Quay màn hình IDE: chạy, judge, diff, stress, Learn Hub, timer, web lab | “Một IDE. Một lộ trình.” |
| 1:45–2:10 | Khác biệt & pháp lý | Sơ đồ Kiến trúc Tauri 2 + C++17 Judge; logo, theme | “Kiến trúc lõi tự chủ.” |
| 2:10–2:32 | Thị trường & kinh doanh | Slide TAM/SAM/SOM, bảng doanh thu | “Freemium + trường học” |
| 2:32–2:50 | Tác động xã hội | Học sinh vùng khó, giáo viên, phòng lab | “Học code không rào cản” |
| 2:50–3:00 | Kết | Logo + slogan + thông tin liên hệ | “DrgX IDE — Lập trình đã tiến hóa” |

---

## 3. Lời bình đầy đủ (đọc với tốc độ 150–160 từ/phút)

> **[0:00–0:12]**
> Học lập trình, bạn cần bao nhiêu công cụ? Một editor. Một compiler. Vài extension. Một trang judge. Công cụ stress. Đồng hồ thi. AI. Rồi một lộ trình học, một câu lạc bộ, một người mentor. Quá nhiều mảnh ghép cho một học sinh.

> **[0:12–0:27]**
> Chúng tôi là nhóm DrgX, đến từ [Trường/Xã/Phường]. Chúng tôi tin rằng việc học code không nên bắt đầu bằng hai giờ cài đặt.

> **[0:27–0:50]**
> Thực tế, học sinh Việt Nam học trong một mê cung công cụ: tiếng Anh, trả phí, cần mạng, phòng máy yếu. Giáo viên thiếu công cụ chấm nhanh. AI thì mạnh nhưng rời rạc, và dữ liệu học sinh là mối lo.

> **[0:50–1:45] — DEMO**
> DrgX IDE gộp tất cả vào một chỗ. Đây là editor, terminal và AI Agent ngay trong IDE. Bấm F9 để chạy. Ctrl+Alt+J để chấm toàn bộ tests. Bảng kết quả hiện AC, WA, RE, TLE, thời gian từng test và diff ngay trong panel. Khi nghi ngờ, chạy stress test: DrgX tự sinh test, so sánh với brute-force và chỉ ra counterexample. Nhưng học code không chỉ là sửa lỗi. Bấm Ctrl+Alt+L, đây là Hệ sinh thái DrgX: lộ trình 12 tuần, bộ khung câu lạc bộ 2 tuần một vòng, showcase sản phẩm và tài liệu cho giáo viên. Đồng hồ contest nhắc bạn từng phút. Cần dạy cả lớp? Web IDE chạy trên trình duyệt, không cần cài đặt.

> **[1:45–2:10]**
> DrgX được thiết kế với kiến trúc lõi tự chủ: vỏ thực thi Tauri 2 (Rust), nhân soạn thảo tốc độ cao (giấy phép MIT) cùng tầng công nghệ gốc gồm Judge Engine C++17, hai bản CP/Dev Studio, Exam Server, Extension, Web Lab, AI Local-first và Hệ sinh thái học tập. Dữ liệu học sinh được ưu tiên lưu trực tiếp trên máy.

> **[2:10–2:32]**
> Thị trường: khoảng ba triệu học sinh, sinh viên; ba trăm nghìn bạn học Tin học và lập trình thi đấu. Mô hình freemium: miễn phí cho học sinh, trả phí cho Pro và trường học. Mục tiêu năm đầu: năm nghìn người dùng, tám trường; hòa vốn năm 2028.

> **[2:32–2:50]**
> Giá trị xã hội: học sinh vùng khó có công cụ chất lượng cao miễn phí; trường tiết kiệm chi phí; giáo viên có thêm công cụ dạy STEM; dữ liệu học sinh được bảo vệ.

> **[2:50–3:00]**
> DrgX IDE — Lập trình đã tiến hóa. Cùng chúng tôi đưa học sinh Việt Nam lên bản đồ công nghệ.

---

## 4. Shot list và cách quay

### Cảnh 1 — Hook (0:00–0:12)
- Quay màn hình desktop có nhiều cửa sổ: editor rời, terminal, trình duyệt judge, cửa sổ AI, đồng hồ, trang lộ trình học.
- Có thể tua nhanh (speed ramp) cảnh mở từng công cụ.
- Chữ lớn: “6–8 công cụ cho một bài code?”.
- **Không** để lộ thông tin cá nhân, email, đường dẫn có tên thật.

### Cảnh 2 — Đội ngũ (0:12–0:27)
- Quay ngang 3–5 thành viên, mỗi người 3–4 giây, chèn tên + vai trò.
- Nếu không muốn lộ mặt: dùng ảnh đại diện/logo + tên, hoặc quay tay đang code.
- Ghi hình tại trường/CLB để tăng tính xác thực.

### Cảnh 3 — Vấn đề (0:27–0:50)
- Cảnh cài đặt/cấu hình (có thể dàn dựng bằng cách mở lại các bước cài).
- Cảnh phòng máy cũ, màn hình nhỏ, mạng yếu (quay bằng điện thoại).
- Chữ: “Cài đặt 2 giờ. Học code 30 phút.”, “Tiếng Anh? Trả phí? Cần mạng?”.

### Cảnh 4 — Demo (0:50–1:45) — **quan trọng nhất**
Chuẩn bị trước:
1. Mở sẵn thư mục `examples/demo-cp/` trong DrgX IDE.
2. Theme **DrgX Ion**, cỡ chữ editor 16, zoom UI 110–125%.
3. Tắt thông báo Windows, đóng email/chat.
4. Chuẩn bị 2 phiên bản: `solution_buggy.cpp` (đang mở) và `solution.cpp` (đã sửa).
5. Bộ test có ít nhất 4 test: 1 AC, 1 WA, 1 TLE/RE (nếu có), 1 test lớn.

Trình tự quay:
1. Mở `solution_buggy.cpp`, bấm **F9** → Judge hiện **WA** và diff rõ ràng trong kênh "DrgX Judge".
2. Mở `solution.cpp`; bấm **F9** → Judge panel hiện **AC**.
3. Bấm **Ctrl+Alt+J** → Judge panel/verdict **ACCEPTED**.
4. Nộp bài lên **exam server**: server chấm và trả verdict — advisory "server-authoritative" xuất hiện trên màn hình.
5. Bấm **Ctrl+Alt+L** → Learn Hub hiện lộ trình 12 tuần, chuyển nhanh qua mục CLB và showcase (chỉ 8–10 giây).
6. Mở **Contest Timer** → chọn 25 phút → status bar đếm ngược.
7. Đổi sang **DrgX Dev Studio** vài giây: hỏi AI bằng Ctrl+Alt+A → trả lời hiện lên.
8. Mở web IDE trên trình duyệt → chấm bài trên phòng lab.
9. Có thể tua nhanh phần biên dịch, giữ lại khoảnh khắc verdict.

> **Vì sao dùng hai bản?** Judge panel chấm **file đang mở** (extension gửi đường dẫn active file), nên có thể mở `solution.cpp` để demo AC. CP Studio demo quá trình luyện tập và thi thật (nộp server, verdict do server quyết). Dev Studio demo AI như một câu chuyện "tiện ích khi thường ngày". Ta dừng ở 2 app, không hiển thị CLI — CLI đã bị loại hoàn toàn khỏi hệ sinh thái người dùng.

> **Mẹo:** quay màn hình ở 60fps rồi xuất 30fps để thao tác mượt; dùng chuột chậm, không rung; bật chế độ “Do not disturb”.

### Cảnh 5 — Khác biệt & pháp lý (1:45–2:10)
- Slide đơn giản: `Tauri 2 (Rust) + C++17 Judge + DrgX Core Layer`.
- Quay logo, theme Ion/Dawn, About.
- Chữ: “Kiến trúc tự chủ · Bảo mật dữ liệu Local-First”.

### Cảnh 6 — Thị trường & kinh doanh (2:10–2:32)
- Slide TAM/SAM/SOM; bảng 3 năm (chỉ hiện 3 con số lớn).
- Chữ: “3 triệu → 300 nghìn → 5.000 người dùng năm 1”.

### Cảnh 7 — Tác động xã hội (2:32–2:50)
- Học sinh học nhóm, giáo viên hướng dẫn, phòng lab.
- Chữ: “Miễn phí gói cơ bản”, “Chạy trên máy yếu”, “Dữ liệu ưu tiên cục bộ”.

### Cảnh 8 — Kết (2:50–3:00)
- Logo DrgX + slogan “Lập trình đã tiến hóa”.
- Thông tin: `[[Email]] · [[SĐT]] · [[Website/Fanpage]]`.
- Có thể chèn QR code dẫn tới video demo/website.

---

## 5. Checklist trước khi xuất video

- [ ] Thời lượng **≤ 03:00** (kiểm tra bằng đồng hồ, không tin cảm giác).
- [ ] Dung lượng **≤ 500MB**.
- [ ] Đã che thông tin cá nhân: email, số điện thoại, đường dẫn `C:\Users\...`, tên trường nếu chưa muốn công bố.
- [ ] Không có logo/nhãn hiệu Microsoft/VS Code chưa thay; chỉ quay giao diện DrgX đã branding.
- [ ] Nhạc nền có giấy phép (YouTube Audio Library, Pixabay, hoặc tự thu).
- [ ] Phụ đề khớp tiếng nói, không lỗi chính tả.
- [ ] Âm lượng giọng nói ổn định, không clipping.
- [ ] Có ít nhất 2 bản sao: USB + Google Drive/YouTube unlisted.
- [ ] Đặt tên tệp đúng quy định của đơn vị.

---

## 6. Gợi ý tiêu đề và mô tả khi gửi kèm

**Tiêu đề:** `DrgX IDE — Môi trường lập trình local-first cho học sinh Việt Nam | Video dự thi khởi nghiệp 2026`

**Mô tả ngắn:**
> DrgX IDE gộp editor, AI Agent, judge đa testcase, stress test, contest timer, web lab và Hệ sinh thái học tập vào một môi trường nhẹ, tiếng Việt, chạy được khi mất mạng. Video giới thiệu sản phẩm, lợi thế công nghệ, mô hình kinh doanh và tác động xã hội của dự án tại Cuộc thi “Học sinh, sinh viên với ý tưởng khởi nghiệp” tỉnh Phú Thọ 2026–2027.
> Nhóm DrgX — [[Trường/Xã/Phường]].
> Liên hệ: [[Email]] — [[SĐT]].

---

## 7. Phương án dự phòng

- Nếu quay màn hình bị giật: quay ở 1080p 30fps, giảm hiệu ứng Windows, đóng ứng dụng nền.
- Nếu tiếng ồn: thu voiceover riêng trong phòng yên tĩnh, ghép với hình; dùng micro điện thoại cũng đủ nếu để gần miệng.
- Nếu không kịp quay cảnh thật: dùng ảnh chụp màn hình + chuyển động zoom nhẹ (Ken Burns), nhưng vẫn phải có ít nhất 20–30 giây quay màn hình sản phẩm thật.
- Nếu video quá 3 phút: cắt phần giải thích thị trường, giữ nguyên demo và tác động xã hội.

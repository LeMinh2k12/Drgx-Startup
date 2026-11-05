# DANH SÁCH VIỆC CON NGƯỜI PHẢI LÀM TRƯỚC KHI NỘP CHÍNH THỨC (`danh_sach_viec_con_nguoi_phai_lam.md` — ĐỒNG BỘ BẢN V3)

- **Hồ sơ áp dụng:** `hoso_du_an_v3.docx` và `hoso_du_an_v3.pdf`
- **Tài liệu bảng chi tiết đi kèm:** Xem bảng phân công đầy đủ 22 hạng mục theo cấu trúc chuẩn tại `viec_con_nguoi_phai_lam_v3.md`.

Theo nguyên tắc **Không bịa dữ liệu (Zero Fabrication)**, toàn bộ các phần việc cần thông tin cá nhân thật, chữ ký – con dấu, tệp nhật ký đo CSV thô, ảnh chụp màn hình mới, văn bản cam kết vốn gia đình, nguồn thống kê chính thức và khảo sát thực địa đều được giữ nguyên nhãn `[CẦN BỔ SUNG: ...]` / `[CẦN XÁC NHẬN: ...]` (tô nền vàng) trong `hoso_du_an_v3.docx`. Dưới đây là hướng dẫn thực hiện theo thứ tự ưu tiên dành cho nhóm dự án và giáo viên hướng dẫn.

---

## Nhóm 1. Thủ tục hành chính, thông tin liên hệ, chữ ký và cam kết vốn (Bắt buộc trước khi nộp)

1. **Hoàn thiện thông tin liên hệ tại Mục I:**
   - **Email trưởng nhóm (`Mục I.4`):** Xác nhận xem `dotruongphuc206@gmail.com` có phải là email liên hệ chính thức của Trưởng nhóm **Lê Tiến Dũng** hay không; nếu là email của người khác, thay bằng email của Lê Tiến Dũng.
   - **Số điện thoại Phó nhóm Lê Bình Minh (`Mục I.5`):** Số hiện tại `098335869` mới có **9 chữ số** (thiếu 1 chữ số so với chuẩn 10 số). Cần kiểm tra và điền đủ 10 chữ số.
   - **Số điện thoại của Nguyễn Minh Quang và Nguyễn Minh Đăng (`Mục I.5`):** Điền số điện thoại 10 chữ số của hai thành viên (hoặc số điện thoại phụ huynh).
   - **Số điện thoại Giáo viên hướng dẫn (`Mục I.6`):** Điền số điện thoại liên hệ của cô **Nguyễn Thị Thu Mai** (Giáo viên Tổ Tin học, Trường THCS Sông Lô).
2. **Xin chữ ký và dấu xác nhận cho Biên bản thử nghiệm ngày 26/10/2026 (`Mục III.2.1` & `Phụ lục B`):**
   - In biên bản chạy thử nghiệm tại Lớp 9A2 và CLB Tin học Trường THCS Sông Lô (hoặc theo mẫu `Phụ lục D.3`), trình cô **Nguyễn Thị Thu Mai** ký xác nhận giáo viên phụ trách và trình **Ban Giám hiệu Trường THCS Sông Lô** ký tên, đóng dấu đỏ.
3. **Văn bản cam kết vốn đối ứng của gia đình và kiểm tra hiệu lực Đề án 1665 (`Mục III.2.4` & `Bảng 24`):**
   - Phụ huynh của 4 thành viên (đặc biệt là phụ huynh Trưởng nhóm Lê Tiến Dũng) ký văn bản xác nhận sẵn sàng hỗ trợ vốn đối ứng mục tiêu (100 triệu đồng) và đồng ý đứng tên đại diện pháp nhân khi dự án thương mại hóa vào năm 2028.
   - Kiểm tra tên gọi chính thức của chương trình/đề án khởi nghiệp học sinh – sinh viên giai đoạn 2026–2030 (xác nhận Đề án 1665 còn hiệu lực hay đã có quyết định kế tiếp thay thế).

---

## Nhóm 2. Thay ảnh màn hình, đính kèm nhật ký CSV và thử nghiệm tại phòng máy (Bắt buộc trước khi nộp)

4. **Chụp mới `Hình 3(d)` và nâng độ phân giải `Hình 3(b)`, `Hình 3(c)` (`Mục III.2.2`):**
   - **`Hình 3(d)` (`image4.png` — bắt buộc thay thế):** Ảnh hiện tại là ảnh chụp trước khi tắt khung Chat bên phải nên đã được gắn nhãn `[CẦN BỔ SUNG — ẢNH CẦN THAY THẾ]`. Nhóm cần chạy `run-cp.ps1` rồi chụp lại cửa sổ `DrgX CP Studio` khi đã tắt khung Chat bên phải kèm giao diện `Web Lab (:8123)`.
   - **`Hình 3(b)` (`image2.png`) và `Hình 3(c)` (`image3.png`):** Chụp lại ở độ phân giải `≥ 1920×1080` để chữ sắc nét khi in khổ lớn.
5. **Đính kèm tệp nhật ký CSV thô của các phép đo `n = 30` (`Bảng 3` & `Bảng 9`):**
   - Xuất tệp CSV ghi lại 30 lần đo của khâu biên dịch `g++` (`p50 = 0,62 s`), khâu chạy 10 testcase (`p50 = 0,18 s`), đo trực tiếp phân phối tổng thời gian bấm phím F9 (`biên dịch + thực thi`), thời gian mở `drgx-studio.exe`, phản hồi API `oj_server.exe` và vòng lặp Stress Test.
6. **Thực hiện 5 kịch bản kiểm thử gian lận AI tại phòng máy và điền vào `Bảng 7` (`Mục III.2.2`):**
   - Hiện `Bảng 7` được ghi rõ trạng thái là **“Chưa thử nghiệm thực địa”** và đã bổ sung cột **“Người thực hiện / Ngày thực hiện”**. Nhóm phối hợp cùng cô Nguyễn Thị Thu Mai thực hiện 5 bước thử nghiệm thực tế tại phòng máy (gỡ `attrib -R`, bấm `Alt+Tab` trong Veyon/SEB, ngắt gateway, gọi `/exams` từ máy học sinh thứ 2 trong LAN, thu thiết bị đầu giờ), ghi rõ họ tên người thực hiện, ngày thực hiện và kết quả thực tế.
7. **Tra cứu nguồn thống kê trường học tỉnh Phú Thọ, giấy phép VNOI Wiki, trích dẫn Themis và video dự thi:**
   - Điền nguồn *Niên giám Thống kê* hoặc báo cáo *Sở GD&ĐT tỉnh Phú Thọ* cho quy mô trường học và học sinh tại `Mục III.2.1` và `Bảng 16` (`TAM = 160.000 HS`, `SAM lớp 1 = 90.000 HS`, `SAM lớp 2 = 45.000 HS`).
   - Rà soát giấy phép 42 bài giảng tham khảo từ `VNOI Wiki` (`Bảng 13`), bổ sung năm phát hành/liên kết công bố phần mềm `Themis` (`Tài liệu tham khảo [23]`) và điền đường dẫn video thuyết trình dự thi (`Mục III.2.5`).

---

## Nhóm 3. Khảo nghiệm đối chứng A/B, đo tải vật lý và kiểm định thống kê (Bổ sung khi thuyết trình)

8. **Đo tải trên 25–35 máy vật lý tại phòng Tin học (`Phụ lục C` & `Phụ lục D.4`):**
   - Cho 25–35 máy học sinh bấm nộp bài cùng lúc qua switch mạng LAN về máy giáo viên và ghi kết quả vào `Phụ lục D.4`.
9. **Đo Precision / Recall / FPR của cấu hình Winnowing `k = 5, w = 4, ngưỡng Dice 65%` trên 150 cặp bài (`Phụ lục A.3`):**
   - Chạy kiểm định thống kê trên 150 cặp bài thực tế để điền bảng độ chính xác tại `Phụ lục A.3`.
10. **Khảo sát bằng mẫu phiếu trung lập `Phụ lục D.1` và đo đối chứng `Phụ lục D.2` tại 3–5 trường ngoài:**
    - Sử dụng `Phụ lục D.1` (đã viết lại trung lập Câu 2 và Câu 7 để kiểm chứng giả thuyết phòng máy dùng chung, mở rộng dải giá Câu 9 từ `< 200k` đến `> 700k` và Câu 12 từ `< 8 triệu` đến `> 18 triệu/năm`), đo thời gian cài đặt trên 5 máy trắng (`Clean Install Test`) kèm kiểm tra cảnh báo SmartScreen (`Phụ lục D.2`), và thu thập Biên bản (`D.3`) cùng Thư bày tỏ ý định LOI (`D.5`).

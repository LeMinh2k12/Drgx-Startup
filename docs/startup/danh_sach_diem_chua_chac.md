# DANH SÁCH CÁC ĐIỂM KỸ THUẬT, BẢO MẬT & DỮ LIỆU ĐÃ CHUẨN HÓA / CẦN XÁC NHẬN (`danh_sach_diem_chua_chac.md` — ĐỒNG BỘ BẢN V3)

Tài liệu này tổng hợp trạng thái đối chiếu trung thực giữa hồ sơ dự án (`hoso_du_an_v3.docx`), mô hình tài chính (`fin_model.py`) và mã nguồn thực tế (`D:\Dev\vietcode`), phân định rõ: (1) những gì **đã cài đặt ở mức ứng dụng**, (2) những **giới hạn mức hệ điều hành / cấu hình chưa làm hoặc cần kiểm tra tiếp**, và (3) những **giả định thương mại – học liệu cần kiểm chứng thực địa**.

---

## 1. Phân định trung thực về Bảo mật Exam Server và Cách ly máy trạm (`Mục III.2.2`, `Bảng 7`, `Bảng 8`)

1. **Phần đã cài đặt ở mức ứng dụng (đạt `15/15 PASS` trên 1 máy trong `smoke-test.py`):**
   - Trong `products/drgx-cp/profile/User/settings.json` và `run-cp.ps1`: đã đặt bộ khóa tắt tính năng AI/Chat tích hợp của VS Code (`chat.disableAIFeatures = true`, `chat.agent.enabled = false`, `chat.commandCenter.enabled = false`, `editor.inlineSuggest.enabled = false`), tự động ghi đè lại `settings.json` và đặt thuộc tính `IsReadOnly = $true` (`attrib +R`) mỗi lần chạy `run-cp.ps1`.
   - Trong `products/drgx-cp/server/exam-server.py`:
     - Hàm `_build_safe_child_env()` lọc biến môi trường nhạy cảm (`DRGX_ADMIN_TOKEN`, `DRGX_EXAM_ADMIN_KEY`), chạy Python với cờ cô lập `-I`.
     - Hàm `_assign_win32_job_limits()` gắn tiến trình bài nộp vào **Windows Job Object** (`ProcessMemoryLimit = 256 MB`, `ActiveProcessLimit = 2`, `KILL_ON_JOB_CLOSE`).
     - Hàm `_is_admin_authorized()` yêu cầu header `X-DrgX-Admin-Token` đối với các truy vấn quản trị từ IP máy trạm LAN (`GET /exams`, `GET /exam/<code>`, `/export.csv`) và cấp mã phiên `studentToken` 16 ký tự chống nộp bài mạo danh.
2. **Ba giới hạn kỹ thuật còn tồn tại được công khai tại `Bảng 8` (Trạng thái: Chưa làm / Cần kiểm tra):**
   - **Giới hạn 1 (Quyền đọc tệp trên máy chủ — Trạng thái: Chưa làm, lộ trình Quý 1/2027):** Mã dự thi của học sinh vẫn chạy dưới tài khoản Windows của giáo viên nên nếu gọi trực tiếp API đọc tệp theo đường dẫn tuyệt đối thì vẫn có thể đọc các tệp mà tài khoản giáo viên đọc được trên máy chủ, **bao gồm tệp `exams.json` và thư mục `tests/` chứa đáp án `.out`**. *Hướng khắc phục:* chạy dưới tài khoản Windows quyền thấp (`Low-Privilege User / AppContainer`), phân quyền ACL và tách thư mục `tests/` cùng `exams.json` ra ngoài phạm vi đọc của tiến trình chấm.
   - **Giới hạn 2 (Thuộc tính chỉ-đọc trên máy trạm — Trạng thái: Chưa làm phân quyền ACL, lộ trình Quý 1/2027):** Thuộc tính `IsReadOnly` (`attrib +R`) của `settings.json` không phải hàng rào bảo mật hệ điều hành vì học sinh cùng quyền tài khoản người dùng có thể tự gỡ thuộc tính này hoặc sửa `run-cp.ps1`. *Hướng khắc phục:* đặt script và profile mẫu trong thư mục chỉ tài khoản Quản trị (`Administrator`) được ghi (ACL), kết hợp chạy qua `SEB` / `Veyon`.
   - **Giới hạn 3 (Tin cậy kết nối `127.0.0.1` khi chạy chung Web Lab — Trạng thái: Hạng mục cần kiểm tra trong mã nguồn, T11/2026):** Hàm `_is_admin_authorized()` hiện mặc định tin cậy mọi kết nối từ `127.0.0.1`; nếu dịch vụ Web Lab (`:8123`) chạy chung máy chủ và chuyển tiếp yêu cầu nội bộ hoặc học sinh thao tác trên máy chủ thì yêu cầu từ `127.0.0.1` có thể vượt qua bước kiểm tra token. *Hướng khắc phục:* tách máy hoặc bắt buộc nhập token kể cả trên `127.0.0.1` khi bật Web Lab.

---

## 2. Phân định trung thực về Số liệu hiệu năng và Thuật toán (`Bảng 3`, `Bảng 9`, `Phụ lục A.3`)

3. **Thời gian bấm phím `F9` và cỡ mẫu của `run-cp.ps1`:**
   - Khâu biên dịch `g++ -O2 -std=c++17` có trung vị `p50 = 0,62 s` (`p95 = 0,95 s`), khâu chạy 10 testcase có `p50 = 0,18 s` (`p95 = 0,42 s`). Vì trung vị của tổng không nhất thiết bằng tổng hai trung vị, hồ sơ `v3` ghi rõ: **“tổng hai trung vị (0,62 + 0,18) ≈ 0,80 s; trung vị của tổng sẽ được đo lại trong đợt thực nghiệm tiếp theo”** và yêu cầu đính kèm tệp CSV nhật ký đo thô (`n = 30`).
   - Cỡ mẫu của `run-cp.ps1` được thống nhất giữa lời văn và bảng: **`n = 35` máy tại Lớp 9A2** (thực địa) và **`n = 30` lần lặp trên máy thử nghiệm chuẩn**.
4. **Cấu hình tham số Winnowing (`k = 5, w = 4`, ngưỡng Dice `65%`):**
   - Đã cài bộ lọc khung mẫu C++ và chốt chặn bài ngắn (`< 15` vân tay hoặc `< 60` ký tự chuẩn hóa) kèm nhãn trung lập **“CẦN GIÁO VIÊN ĐỐI CHIẾU”**.
   - Ghi rõ trong `Bảng 9`, `Mục III.2.3` và `Phụ lục A.3`: bộ tham số `k = 5, w = 4`, ngưỡng Dice `65%` hiện là **cấu hình kỹ thuật chưa qua kiểm định thống kê**; việc đo `Precision`, `Recall`, `FPR` thực tế sẽ thực hiện trên 150 cặp bài theo `Phụ lục A.3`.

---

## 3. Phân định trung thực về Học liệu, Nguồn vốn, Pháp lý và Tài chính (`Mục III.2.4`, `Bảng 10–25`)

5. **Giả thuyết phòng máy dùng chung và trạng thái `Bảng 7`, `Hình 3(d)`:**
   - Kịch bản *“phòng máy chiều học AI, sáng thi rò rỉ AI”* được ghi rõ là giả thuyết vận hành chưa có số liệu khảo sát diện rộng, sẽ kiểm chứng qua Câu 7 của `Phụ lục D.1`.
   - `Bảng 7` được ghi rõ trạng thái **“Chưa thử nghiệm thực địa”**; `Hình 3(d)` được gắn nhãn `[CẦN BỔ SUNG — ẢNH CẦN THAY THẾ]` vì ảnh cũ chụp trước khi tắt khung Chat.
6. **Trạng thái kho 200 bài tập HSG và 30 đề thi thử (`Bảng 10, 12, 13, 18, 24`):**
   - Ghi rõ tại tất cả các bảng: **“Trạng thái: đang có 47 bài; kho 200 bài và 30 đề chưa biên soạn”**, đơn giá `350.000 đ/bài` là **giả định chưa có báo giá**, và bổ sung dòng rủi ro tại `Bảng 12` rằng **80,3% doanh thu năm 2029 (`489,6 / 609,6 triệu đồng`)** phụ thuộc vào kho bài này.
7. **Lộ trình chứng thư OV Code Signing và trạng thái 3 nguồn vốn 300 triệu (`Bảng 24, 25`):**
   - Đồng bộ lùi việc mua chứng thư số OV Code Signing sang **`Q1–T4/2028` khi thành lập pháp nhân người thành niên** (giai đoạn thí điểm dùng bộ cài nội bộ kèm hướng dẫn giáo viên hoặc nhờ đơn vị bảo trợ ký); đổi cụm *“không bị SmartScreen chặn”* thành **“dự kiến giảm cảnh báo SmartScreen; cần thử nghiệm thực tế trên máy trắng trong Phụ lục D.2”**.
   - Cả 3 nguồn vốn (`120 tr` giải thưởng/Đề án 1665 + `100 tr` gia đình + `80 tr` doanh nghiệp) đều được ghi rõ là **mục tiêu, chưa có cam kết**.
8. **Thống nhất các chỉ số tài chính (`Bảng 16, 17, 19, 20, 21, 22, 23`):**
   - Tách `SAM` thành 2 lớp (`SAM lớp 1 = 90.000 HS có phòng máy`, `SAM lớp 2 = 45.000 HS ôn luyện sâu`); không gọi kịch bản Cơ sở là “thận trọng” và đặt kịch bản Thận trọng (`7 trường trả phí, 15.000 HS, DT 308,3 tr, EAT tinh gọn +19,3 tr`) ngang hàng làm mốc cam kết an toàn.
   - Tính đủ `5,0 triệu đồng/trường/năm` (`3,5 COGS + 1,5 hỗ trợ`) vào Unit Economics (`Bảng 21`, `Bảng 23`), cho **`LTV = 45,50 triệu đồng`, `LTV/CAC = 9,1 lần`** (vòng đời `2,2` và `3,5 năm` ghi rõ là **giả định chưa kiểm chứng**).
   - Bổ sung Dòng 4 tại `Bảng 22` khi **chi phí nhân sự tăng gấp đôi lên `288,0 triệu đồng/năm`** (`EAT = −29,6 tr` ở mức 2 CTV, hoặc `EAT = +96,4 tr` ở chế độ tinh gọn 1 CTV).
   - Sửa diễn đạt cuối `Bảng 19`, `Bảng 20`: **`+100,8 triệu đồng` là số dư quỹ tiền mặt còn lại cuối 2029** sau khi bù lỗ lũy kế (`EAT` lũy kế 2026–2029 là `−199,2 triệu đồng`), dự kiến hoàn toàn bộ vốn gốc `300 triệu đồng` vào khoảng **`Q2/2031`**.
   - Dẫn chiếu pháp lý mua sắm trực tiếp: **`khoản 4 Điều 80 Nghị định số 214/2025/NĐ-CP (được sửa đổi, bổ sung bởi Nghị định số 349/2026/NĐ-CP ngày 09/09/2026)`**.

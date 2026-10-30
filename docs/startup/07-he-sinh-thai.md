# Hệ sinh thái học tập DrgX — thiết kế MVP và kế hoạch mở rộng

> **Mục đích:** mô tả lớp sản phẩm mở rộng của DrgX, giúp Hội đồng thấy sản phẩm không chỉ là IDE mà còn là một quy trình học có lộ trình, câu lạc bộ và người đồng hành. Tài liệu này là bản nội bộ/giải trình, không thay thế bài thuyết minh.

---

## 1. Vấn đề

Một học sinh mới học lập trình thường có đủ công cụ nhưng thiếu ba thứ:

1. **Biết học gì tiếp** — video, blog, khóa học rời rạc; không có mốc hoàn thành.
2. **Vòng luyện tập có phản hồi** — làm bài nhưng không biết sai ở đâu, không có ai review.
3. **Cộng đồng và người đi trước** — không có CLB/mentor để hỏi khi bị kẹt.

DrgX giải quyết phần công cụ (editor, judge, stress, timer, web lab). Learn Hub giải quyết phần quy trình và con người.

---

## 2. Nguyên tắc thiết kế

- **Local-first:** trang tĩnh, chạy từ máy; tiến độ lưu bằng `localStorage`; không cần tài khoản cho MVP.
- **Nối trực tiếp vào CP/Dev Studio:** mở bằng `Ctrl+Alt+L`, menu **Hệ sinh thái DrgX** hoặc lệnh `DrgX: Learn Hub` trong Command Palette; học sinh không phải rời môi trường làm bài.
- **Một việc mỗi màn hình:** lộ trình, CLB, giáo viên, showcase là bốn khối độc lập; không nhồi dashboard.
- **Minh bạch trạng thái:** phần đã chạy, phần đang alpha, phần chỉ là kế hoạch được ghi rõ.
- **Không thu thập dữ liệu cá nhân mặc định:** không analytics, không đăng nhập, không gửi tiến độ lên máy chủ.

---

## 3. Bốn khối của MVP

### 3.1. Lộ trình 12 tuần

| Chặng | Thời lượng | Nội dung chính | Sản phẩm đầu ra |
|---|---|---|---|
| 1. Nhập môn | Tuần 1–3 | Cú pháp C++/Python, tư duy chia bài, đọc/ghi input | 10 bài luyện cơ bản |
| 2. Nền tảng | Tuần 4–6 | Mảng, chuỗi, độ phức tạp, sort, tìm kiếm nhị phân, stack/queue, prefix sum | 18 bài luyện + 1 bài kiểm tra |
| 3. Giải thuật | Tuần 7–9 | Đệ quy, quay lui, đồ thị BFS/DFS, quy hoạch động cơ bản | Bộ 12–15 bài + stress test |
| 4. Sản phẩm | Tuần 10–12 | Chọn đề tài, sprint 1 tuần, README, demo | 1 sản phẩm nhỏ + showcase 5 phút |

Mỗi chặng có: mục tiêu, bài luyện gợi ý, tiêu chí hoàn thành và câu hỏi tự kiểm tra. Học sinh đánh dấu tiến độ trên trang; dữ liệu chỉ nằm trên máy.

### 3.2. Câu lạc bộ theo sprint

Nhịp 2 tuần/vòng:

1. **Học:** 1 buổi 60–75 phút, khái niệm + live coding.
2. **Luyện:** nộp bài qua DrgX Judge; tự xem verdict trước khi hỏi.
3. **Review:** chữa 2–3 bài khó, tập trung vào lỗi tư duy.
4. **Showcase:** 1 thành viên trình bày 5 phút; mentor góp ý.

Vai trò tối thiểu: điều phối, mentor kỹ thuật, người viết/tổng kết. Khuyến nghị mỗi mentor phụ trách tối đa 6 học viên.

### 3.3. Tài liệu giáo viên

- Gói bài tập: đề, input mẫu, expected, bộ test ẩn.
- Cách dùng Judge/Stress/Timer trong lớp.
- Mẫu cuộc thi nội bộ 60–90 phút.
- Tiêu chí đánh giá quá trình (không chỉ điểm cuối kỳ).
- Checklist chuẩn bị phòng máy và phương án web lab.

### 3.4. Showcase

Học sinh trình bày sản phẩm nhỏ: máy tính lịch thi, bản đồ CLB, bộ chấm bài mini, game luyện phản xạ... Tiêu chí: giải được một việc cụ thể, có demo chạy được, giải thích được cách làm và bài học.

---

## 4. Tích hợp kỹ thuật

| Điểm vào | Cơ chế |
|---|---|
| Desktop (CP/Dev Studio) | Menu **Hệ sinh thái DrgX**, phím `Ctrl+Alt+L`; exam server ghi bản nhúng vào `%APPDATA%\vn.drgx.ide\ecosystem` rồi mở bằng trình duyệt mặc định |
| Extension | Lệnh `drgx.learn` trong mỗi bản Studio; mở Learn Hub từ menu lệnh |
| Web | `web/ecosystem/index.html`, có thể nhúng hoặc phục vụ tĩnh |
| Dữ liệu | `localStorage` khóa `drgx.learn.v1`; không có backend |

**Bảo mật:** trang tĩnh không gọi proxy, không đọc file hệ thống, không nhận dữ liệu từ người khác. Khi mở từ app, trang được ghi vào thư mục dữ liệu người dùng và mở qua `rundll32.exe url.dll,FileProtocolHandler`.

---

## 5. Chỉ số đo lường

| Nhóm | Chỉ số | Cách đo | Mục tiêu giai đoạn pilot |
|---|---|---|---|
| Học tập | Tỷ lệ hoàn thành chặng 1 | Số đánh dấu / số bắt đầu | ≥ 50% |
| Luyện tập | Số bài/tuần | Đếm từ Judge (extension + log exam server, thủ công trong pilot) | ≥ 3 bài/tuần |
| Giữ chân | D7 | Quay lại sau 7 ngày | ≥ 30% |
| Cộng đồng | CLB hoạt động ≥ 2 vòng | Biên bản/xác nhận | 3 CLB |
| Chất lượng | Showcase có demo chạy | Danh sách showcase | ≥ 60% |
| Hỗ trợ | Thời gian phản hồi mentor | Nhật ký mentor | ≤ 48 giờ |

Các chỉ số này sẽ được đo trong pilot 3 trường/CLB (11–12/2026). Hồ sơ dự thi không gán số liệu chưa kiểm chứng.

---

## 6. Lộ trình mở rộng

- **Q4/2026:** MVP Learn Hub + bộ khung CLB; pilot 3 trường/CLB.
- **2027:** cổng đăng ký CLB, lịch sinh hoạt, ghép mentor–học viên, dashboard lớp (alpha); gói trường có Learn Hub.
- **2028:** thư viện showcase, báo cáo tiến độ cho giáo viên, API trường.
- **2029:** nội dung đa ngôn ngữ, mở rộng khu vực.

---

## 7. Rủi ro và cách giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Nội dung lộ trình quá tải hoặc lỗi thời | Bắt đầu với 4 chặng, review bởi giáo viên/mentor, cập nhật theo mùa thi |
| CLB thiếu mentor | Bộ khung tối thiểu 3 vai trò; mentor sinh viên/cựu HS; giới hạn 6 học viên/mentor |
| Học sinh không quay lại | Nối tiến độ với bài luyện trong IDE; nhắc qua CLB; D7 là chỉ số chính |
| Trang chỉ là marketing | Đưa vào sản phẩm: Ctrl+Alt+L, lệnh `DrgX: Learn Hub`, menu; có checklist và tiến độ tương tác |
| Dữ liệu cá nhân | Local-first, không tài khoản, không analytics mặc định |

---

## 8. Kịch bản demo 60 giây

1. Mở IDE, bấm `Ctrl+Alt+L` → Learn Hub.
2. Chỉ lộ trình 12 tuần, đánh dấu một mục.
3. Chuyển sang mục CLB → chỉ nhịp 2 tuần và 3 vai trò.
4. Chuyển sang mục Giáo viên → chỉ gói bài tập và bảng verdict.
5. Quay lại IDE, mở một bài trong `examples/demo-cp`, bấm F5/Ctrl+Alt+J để chấm.
6. Kết: “Cùng một vòng lặp: học → luyện → nhận phản hồi → làm sản phẩm.”

---

## 9. Trạng thái minh bạch

- **Đã có:** trang Learn Hub tĩnh, lộ trình, bộ khung CLB, mục giáo viên, showcase mẫu; tích hợp menu/Ctrl+Alt+L/lệnh extension trong cả hai bản Studio.
- **Đang alpha/thiết kế:** ghép mentor tự động, cổng CLB trực tuyến, dashboard lớp, đo D7 tự động.
- **Chưa có:** tài khoản cloud, thanh toán, dữ liệu pilot thật.

Không dùng các phần “đang thiết kế” để tính doanh thu năm 1 hoặc tuyên bố đã vận hành.

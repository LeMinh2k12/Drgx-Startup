# Nhật Ký Nâng Cấp Hệ Sinh Thái DrgX (`CHANGELOG.md`)

## [2.1.0] — 2026-10-25 (Hoàn thiện hồ sơ & bộ thuyết trình theo Kế hoạch 153/KH-SGDĐT)

### Sửa lỗi sản phẩm (tìm ra nhờ đo đạc thực tế)
- **Exam Server (`products/drgx-cp/server/exam-server.py`)**: cả lớp nộp bài cùng lúc từng bị rớt kết nối (hàng đợi kết nối mặc định chỉ 5) và có bài bị chấm TLE oan do tranh chấp CPU. Thêm `ExamServer.request_queue_size = 256`, giới hạn số bài chấm đồng thời (`GRADE_SLOTS`), bắt `TimeoutExpired` khi biên dịch. Đo: **40 bài nộp đồng thời trước khi sửa chỉ thành công ~1/2 số lần; sau khi sửa 5/5 lần (40/40 và 60/60 AC)**. Thêm công cụ `products/drgx-cp/server/load-test.py`.
- **Engine Winnowing (`products/void-bit/OJ/oj_server.cpp`)**: trước đây không chuẩn hóa định danh nên bài chép đổi tên biến chỉ đạt **5,6%** tương đồng. Viết lại `AntiCheat::normalize()` thành bộ chuẩn hóa token (định danh → `@`, hằng số → `0`, chuỗi → `$`, bỏ chú thích `//`, `/* */`, `#`). Kết quả: bài chép đổi tên biến/hàm/chú thích **100% (gắn cờ)**, hai thuật toán khác nhau **15,8%**, Python cũng 100%. Thêm `scripts/verify_winnowing.py` và siết chặt kiểm thử Winnowing trong `verify_ecosystem.py` (vẫn 67/67).
- **Void-bit chạy offline**: 17 trang tải Tailwind/Lucide từ CDN nên mất giao diện khi không có Internet. Lưu bản cục bộ trong `products/void-bit/vendor/`; thêm `scripts/verify_offline_voidbit.py` (16/16 trang đạt khi chặn mạng).
- **Giao diện**: DrgX Studio bị cắt mép phải ở 1280–1440px; 5 trang web tràn ngang trên điện thoại; `drgx_ide_ui.svg` sai cú pháp XML; lỗi JS `e.target.closest` ở bộ slide.

### Bộ thuyết trình (`presentation/`) & hồ sơ
- Thêm **chế độ Video 3 phút** (phím `M`, `?mode=3`) — 12 slide, 176 giây — theo Phụ lục 05; `selftest.html` nâng lên 23 hạng mục kiểm tra cả nội dung (không còn số liệu cũ, phủ đủ 21/21 tiêu chí Phụ lục 06, nhãn “mô phỏng”).
- Gắn nhãn đúng bản chất cho **mô phỏng / ước tính / mục tiêu / dự phóng**; thay so sánh RAM thiếu công bằng bằng số đo thật (vỏ ≈ 39 MB; cả cây tiến trình ≈ 215 MB bộ nhớ riêng).
- Sửa **phân tích độ nhạy tài chính** cho khớp số học và giả định đã nêu: Năm 2 thận trọng **+90,2** (trước ghi +142,2), tích cực **+876,0** (trước ghi +836,0).
- Thống nhất **47 bài** OJ, `oj_server.exe` ≈ 3,8 MB, Phụ lục 06 có **21** tiêu chí thành phần; bỏ cách gọi “AST” (engine là so khớp token).
- Bản Word kịch bản (`Kich-ban-thuyet-trinh-DrgX.docx`) dựng lại: bìa, mục lục, đầu/chân trang, bảng chuẩn; thêm Phần VI (số đo thật) và Phần VII (kịch bản video 3 phút). Bản Word bài dự thi và các PDF được dựng lại từ nguồn.

## [2.0.0] — 2026-10-23 (Bản Hiện Đại Hóa Toàn Diện & `/loop-me` Hardening)

### Bảo mật & Độ ổn định Backend (Giai đoạn 0 & 2)
- **Void-bit C++17 OJ Server (`products/void-bit/OJ/oj_server.cpp`)**:
  - Thêm hàm `sanitize_compiler_path()` chặn đứng lỗ hổng Command Injection qua trường `compiler_path` trong `/api/judge` và `/api/judge/stream`.
  - Bọc `std::stoi` khi đọc `Content-Length` bằng `try/catch` và đặt ngưỡng tối đa `MAX_BODY_SIZE = 2 MB` (trả `HTTP 400` / `HTTP 413` thay vì sập tiến trình khi gặp header dị dạng).
  - Sửa hàm `url_decode()` kiểm tra `std::isxdigit` trước khi giải mã `%XX`, loại bỏ hành vi đọc biến chưa khởi tạo.
  - Thay thế `rand()` không an toàn đa luồng bằng `thread_safe_rand()` dùng `thread_local std::mt19937` và bổ sung `std::mutex g_log_mtx` khi ghi nhật ký `submissions_local.json`.
  - Bắt `input` theo giá trị (by-value) trong luồng ghi ống dẫn `exec_cmd_with_input()` để tránh lỗi truy cập vùng nhớ sau khi hàm trả về sớm (TLE).
  - Thêm endpoint `GET /api/health` và kiểm tra chống Path Traversal (`..`) trong `serve_static()`.
  - Áp dụng **Admin Guard** (`DRGX_ADMIN_TOKEN` hoặc loopback `127.0.0.1`) cho `/api/reload` và `/api/generate`.
- **DrgX CP Classroom Exam Server (`products/drgx-cp/server/exam-server.py`)**:
  - Nâng cấp từ `HTTPServer` đơn luồng lên `ThreadingHTTPServer`, cho phép cả lớp nộp bài C++/Python đồng thời không bị nghẽn hàng đợi.
  - Thêm `DATA_LOCK = threading.Lock()` và cơ chế ghi file nguyên tử (`os.replace` qua file tạm `.tmp`) bảo vệ `exams.json` khỏi hỏng dữ liệu khi ghi song song.
  - Thêm giới hạn payload `512 KB` (`HTTP 413`), kiểm tra regex `SAFE_CODE_RE` cho mã phòng thi và **Admin Guard** cho `/exam/create`.

### Giao diện, Skin & Hiệu năng Web (`web/`)
- **5 Skins chuẩn WCAG 2.2 AA**: Đồng bộ *Ion/Obsidian*, *Nebula*, *Tokyo*, *Matrix*, và *Dawn* trên toàn bộ `web/` (6 trang), `products/void-bit/`, và 2 gói VS Code Extension (`drgx-cp.vsix`, `drgx-dev.vsix`).
- **Tối ưu Web Vitals & SEO (`web/`)**: Chuyển đổi ảnh sang `.webp` (giảm 91% dung lượng), bổ sung JSON-LD Schema, `robots.txt`, `sitemap.xml`, `_headers`, cùng 2 trang `privacy.html` và `terms.html`.

### Kiểm thử, CI/CD & Quy trình `/loop-me` (Giai đoạn 1, 3, 4, 5)
- Thêm kịch bản kiểm thử toàn diện `scripts/verify_ecosystem.py` kiểm tra tự động cả 5 trụ cột và xuất báo cáo `workflows/reports/ecosystem-health-brief.md`.
- Mở rộng `products/drgx-cp/server/smoke-test.py` lên 11 kịch bản (bổ sung kiểm thử 4 luồng nộp bài song song và loại bỏ đường dẫn cứng).
- Thêm công cụ `scripts/demo-doctor.ps1`, cấu hình GitHub Actions `.github/workflows/ci.yml`, `NOTES.md`, `ARCHITECTURE.md`, và bộ 3 workflow cấp root trong `workflows/`.

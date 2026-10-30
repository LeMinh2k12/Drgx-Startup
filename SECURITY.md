# Chính Sách Bảo Mật & Mô Hình Đe Dọa (`SECURITY.md`)

Nhóm phát triển **DrgX** đặt sự an toàn của học sinh, giáo viên và hạ tầng phòng máy trường học lên hàng đầu. Tài liệu này công bố các phiên bản được hỗ trợ, mô hình bảo mật kỹ thuật (Threat Model) và quy trình báo cáo lỗ hổng có trách nhiệm.

---

## 1. Phiên Bản Được Hỗ Trợ (Supported Versions)

| Phiên bản | Thành phần áp dụng | Trạng thái hỗ trợ bảo mật |
| :--- | :--- | :---: |
| **`2.0.x` (Hiện hành)** | `web/`, `products/void-bit/OJ`, `products/drgx-cp`, `products/drgx-dev`, `app/` | ✅ Được hỗ trợ tích cực |
| **`1.0.x`** | Extension & Exam Server thế hệ đầu | ⚠️ Chỉ nhận bản vá khẩn cấp |
| **`< 1.0`** | Các bản thử nghiệm nội bộ / CLI cũ | ❌ Ngừng hỗ trợ |

---

## 2. Mô Hình Bảo Mật Kỹ Thuật (Architecture Security & Threat Model)

### 2.1. Chống Thực Thi Lệnh Tùy Ý (Command Injection Prevention)
- **Void-bit C++17 OJ Server (`products/void-bit/OJ/oj_server.cpp`)**:
  - Hàm `sanitize_compiler_path()` kiểm tra nghiêm ngặt mọi ký tự trong trường `compiler_path` của JSON request.
  - Từ chối tuyệt đối mọi ký tự điều khiển shell (`&`, `|`, `;`, `` ` ``, `$`, `>`, `<`, `"`, `'`, khoảng trắng) và chỉ chấp nhận các trình biên dịch trong danh sách trắng (`g++`, `clang++`) tồn tại hợp lệ trên hệ thống.

### 2.2. Chống Từ Chối Dịch Vụ & Tràn Bộ Nhớ (DoS & Memory Exhaustion Guards)
- **Giới hạn kích thước Payload (`Content-Length` Cap)**:
  - `oj_server.cpp` bọc `std::stoi` trong khối `try/catch`, trả về `HTTP 400 Bad Request` với header phi số và `HTTP 413 Payload Too Large` nếu body vượt quá **2 MB**.
  - `exam-server.py` giới hạn kích thước request tối đa **512 KB** (`MAX_BODY_BYTES`), trả về `HTTP 413` ngay lập tức trước khi cấp phát bộ nhớ.
- **Giới hạn thời gian thực thi (Execution Timeouts)**:
  - Mọi tiến trình chấm bài con trong `oj_server.cpp` (`CreateProcessA` + `WaitForSingleObject` / `TerminateProcess`) và `exam-server.py` (`subprocess.run(..., timeout=3)`) đều có ngưỡng cắt cưỡng bức để chống vòng lặp vô hạn (`while(1);`).

### 2.3. Bảo Vệ Các Endpoint Quản Trị (Admin Guard)
- Các API thay đổi trạng thái hệ thống (`POST /exam/create` trên cổng `8765`, `POST /api/reload` và `POST /api/generate` trên cổng `8080`) được bảo vệ bởi cơ chế **Admin Guard 2 lớp**:
  1. Nếu biến môi trường `DRGX_ADMIN_TOKEN` được thiết lập: bắt buộc xác thực qua header `X-DrgX-Admin-Token: <token>` hoặc `Authorization: Bearer <token>`.
  2. Nếu không thiết lập (chế độ mặc định khi chạy 1-click cục bộ): chỉ chấp nhận kết nối có IP nguồn từ loopback (`127.0.0.1` / `::1`), chặn các máy khác trong mạng LAN tự ý gọi API quản trị.

### 2.4. Chống Path Traversal & Rò Rỉ File Nội Bộ
- `products/void-bit/serve.js` chuẩn hóa đường dẫn qua `path.resolve()`, chặn mọi truy cập vượt ra ngoài thư mục gốc hoặc truy cập vào các thư mục/tệp nội bộ (`/oj/`, `/workflows/`, `/db/`, `.log`, `.err`, `.pid`, `.cpp`, `.ps1`, `.cmd`, `.db`).
- `products/void-bit/OJ/oj_server.cpp` chặn chuỗi `..` trong `serve_static()` và `exam-server.py` kiểm tra mã phòng thi bằng biểu thức chính quy `^[A-Z0-9_-]{1,32}$`.

### 2.5. Quyền Riêng Tư Dữ Liệu Học Sinh (Local-First Privacy)
- **DrgX CP Studio**: Không tích hợp AI, không gửi mã nguồn học sinh ra ngoài Internet (đảm bảo tính liêm chính kỳ thi — *Exam Integrity*).
- **DrgX Dev Studio**: Chỉ gửi đoạn mã khi người dùng chủ động ra lệnh hỏi AI (`Ctrl+Alt+A`) thông qua khóa API do chính người dùng cấu hình (BYOK / Local AI Bridge). Xem chi tiết tại [`PRIVACY.md`](PRIVACY.md).

---

## 3. Quy Trình Báo Cáo Lỗ Hổng Bảo Mật (Vulnerability Disclosure)

Nếu bạn phát hiện lỗ hổng bảo mật trong bất kỳ thành phần nào của hệ sinh thái DrgX:
1. **Không mở Public Issue** chứa mã khai thác (PoC) trực tiếp trên GitHub trước khi bản vá được phát hành.
2. Gửi báo cáo qua tính năng **GitHub Private Vulnerability Reporting** (tab *Security → Report a vulnerability* trên repository) kèm theo:
   - Thành phần và dòng code bị ảnh hưởng.
   - Các bước tái hiện (Reproduction steps).
   - Tác động dự kiến.
3. Nhóm kỹ thuật DrgX cam kết phản hồi xác nhận trong vòng **48 giờ** và phát hành bản vá kèm ghi nhận đóng góp (Security Advisory Credit) trong vòng **7 ngày**.

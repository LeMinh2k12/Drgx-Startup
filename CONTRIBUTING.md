# Hướng Dẫn Đóng Góp Mã Nguồn (`CONTRIBUTING.md`)

Cảm ơn bạn đã quan tâm và đóng góp cho **DrgX** — Hệ sinh thái lập trình Local-First (IDE, Classroom Exam Server, Void-bit C++17 OJ & Learn Hub) dành cho học sinh, sinh viên và cộng đồng lập trình viên Việt Nam!

---

## 1. Bắt Đầu Nhanh Cho Lập Trình Viên (60 Giây)

### 1.1. Yêu cầu công cụ (Prerequisites)
- **Hệ điều hành**: Windows 10/11 (khuyến nghị cài sẵn `C:\msys64\ucrt64\bin` cho C++17 `g++`).
- **Python**: `3.10+` (`python --version`).
- **Node.js**: `18+` (`node --version`).
- **Trình biên dịch C++17**: MinGW-w64 / MSYS2 UCRT64 `g++` (`g++ --version`).

### 1.2. Chạy kiểm thử toàn hệ sinh thái bằng 1 lệnh duy nhất
Tại thư mục gốc của dự án, chạy:

```powershell
.\drgx.cmd test
# Hoặc gọi trực tiếp qua Python:
python -X utf8 scripts\verify_ecosystem.py
```

Lệnh trên sẽ tự động biên dịch (nếu cần) và kiểm tra **toàn bộ 5 trụ cột** (`docs/startup`, `web`, `drgx-cp` & `drgx-dev` extensions, `exam-server.py`, và `oj_server.exe`), đồng thời xuất báo cáo nghiệm thu ra `workflows/reports/ecosystem-health-brief.md`.

---

## 2. Cấu Trúc 5 Trụ Cột & Cách Phát Triển Từng Module

| Trụ cột | Thư mục chính | Lệnh chạy thử / đóng gói |
| :--- | :--- | :--- |
| **1. Website & SEO Hub** | `web/` | Mở trực tiếp `web/index.html` hoặc phục vụ qua static server |
| **2. DrgX CP Studio & Exam Server** | `products/drgx-cp/` | `.\drgx.cmd cp` • Đóng gói VSIX: `powershell -File products\drgx-cp\extension\make-vsix.ps1` |
| **3. DrgX Dev Studio** | `products/drgx-dev/` | `.\drgx.cmd dev` • Đóng gói VSIX: `powershell -File products\drgx-dev\extension\make-vsix.ps1` |
| **4. Void-bit Platform & C++17 OJ** | `products/void-bit/` | `.\drgx.cmd oj` • Biên dịch OJ: xem mục 2.1 bên dưới |
| **5. Hồ sơ khởi nghiệp** | `docs/startup/`, `scripts/` | `python -X utf8 scripts\build_startup_docs.py` |

### 2.1. Biên dịch Void-bit C++17 OJ Server (`oj_server.cpp`)
Khi chỉnh sửa `products/void-bit/OJ/oj_server.cpp`, biên dịch lại bằng lệnh:

```powershell
cd products\void-bit\OJ
C:\msys64\ucrt64\bin\g++.exe -std=c++17 -O2 -pipe -o oj_server.exe oj_server.cpp -lws2_32 -lwinhttp -lpsapi -static
```

### 2.2. Thêm bài tập mới vào Void-bit OJ (`problem-test-intake`)
1. Tạo file JSON nháp tại `products/void-bit/OJ/problems/_inbox/<problem_id>.json` (bắt buộc có trường `reference_solution` viết bằng C++17).
2. Chạy trình kiểm định tự động:
   ```powershell
   python -X utf8 products\void-bit\OJ\tools\validate_problem.py products\void-bit\OJ\problems\_inbox\<problem_id>.json --promote
   ```
   Script sẽ tự động biên dịch `reference_solution`, chạy qua toàn bộ `test_cases`, nếu đạt 100% AC mới xuất bản sang `OJ/problems/<problem_id>.json` và cập nhật `problems-index.json`.

---

## 3. Quy Ước Mã Nguồn & Giao Diện (Coding & UI Standards)

1. **Định dạng tệp**: Tuân thủ cấu hình trong [`.editorconfig`](.editorconfig) (UTF-8, không để khoảng trắng thừa cuối dòng).
2. **Hệ thống 5 Skins WCAG 2.2 AA**:
   - Mọi thành phần giao diện mới trên `web/`, `products/void-bit/` hoặc VS Code Webview phải sử dụng biến màu CSS (`var(--bg)`, `var(--fg)`, `var(--cp-surface)`, v.v.) để tương thích hoàn hảo với cả **5 Skins chuẩn WCAG 2.2 AA** (*Ion/Obsidian*, *Nebula*, *Tokyo*, *Matrix*, *Dawn*).
3. **Không dùng đường dẫn tuyệt đối (Zero Hardcoded Paths)**:
   - Trong Python: luôn dùng `Path(__file__).resolve().parent`.
   - Trong PowerShell: luôn dùng `$PSScriptRoot` hoặc `Split-Path -Parent $MyInvocation.MyCommand.Definition`.

---

## 4. Quy Trình Gửi Pull Request (PR Checklist)

Trước khi mở Pull Request:
- [ ] Đã chạy `.\drgx.cmd test` (`python -X utf8 scripts/verify_ecosystem.py`) và đạt **100% PASS (GREEN)**.
- [ ] Không commit các tệp tạm (`.log`, `.pid`, `profile/`, `exams.json`, `.tmp`).
- [ ] Đã cập nhật [`CHANGELOG.md`](CHANGELOG.md) nếu PR bổ sung tính năng hoặc sửa lỗi quan trọng.

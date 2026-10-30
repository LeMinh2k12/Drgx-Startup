# NOTICE — Thành phần bên thứ ba & ghi công

DrgX IDE được xây dựng dựa trên các thành phần mã nguồn mở. Tài liệu này ghi công và nêu giấy phép của các thành phần chính. Khi phân phối sản phẩm, các thông báo này phải được giữ nguyên.

## 1. Nhân soạn thảo mã nguồn mở (MIT Workbench Core)

- **Giấy phép:** MIT
- **Cách DrgX sử dụng:** nền tảng nhân soạn thảo và chế độ Web Lab cục bộ. Toàn bộ kiến trúc sản phẩm, nhận diện thương hiệu, logo, 5 bộ giao diện và hệ thống chấm bài/khảo thí do nhóm DrgX thiết kế và phát triển.

### MIT License

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. Tauri

- **Dự án:** Tauri — https://tauri.app
- **Giấy phép:** MIT hoặc Apache-2.0 (dual license)
- **Bản quyền:** Tauri Programme within The Commons Conservancy
- **Cách DrgX sử dụng:** framework desktop app (Rust + WebView2).
- **Ghi chú:** DrgX chọn giấy phép MIT cho phần sử dụng Tauri. Bản đầy đủ của giấy phép Apache-2.0 có tại https://www.apache.org/licenses/LICENSE-2.0.

## 3. Rust crates

Các thư viện Rust chính được sử dụng (giấy phép theo từng crate, thường là MIT/Apache-2.0):

| Crate | Mục đích |
|---|---|
| `tauri`, `tauri-build`, `tauri-plugin-dialog`, `tauri-plugin-single-instance` | Desktop app, dialog, single-instance |
| `serde`, `serde_json` | Serialize/deserialize JSON |
| `chrono` | Thời gian, timer |
| `windows-sys`, `windows-core`, `webview2-com` | Win32 API, WebView2, Job Object giới hạn bộ nhớ tiến trình con |

Giấy phép đầy đủ của từng crate có trong `Cargo.lock` và kho mã nguồn tương ứng trên crates.io.

## 4. Node.js / npm packages

- `@tauri-apps/cli` — MIT/Apache-2.0, dùng để build desktop app.
- Không phân phối `node_modules` trong kho lưu trữ.

## 5. Cầu nối AI cục bộ & Mô hình AI (BYOK)

- DrgX hỗ trợ kết nối các mô hình AI thông qua cầu nối cục bộ (`127.0.0.1:45290`) và cơ chế tự mang khóa API (**BYOK**).
- Các mô hình AI bên ngoài **không được phân phối kèm** kho lưu trữ này; người dùng cấu hình/chọn theo điều khoản của nhà cung cấp.
- DrgX không dùng mã nguồn của người dùng để huấn luyện mô hình. Khi người dùng chủ động gọi AI, dữ liệu được gửi tới nhà cung cấp mô hình theo lựa chọn của người dùng.

## 6. WebView2 Runtime

- **Thành phần:** Hệ thống WebView2 Runtime trên Windows.
- **Cách sử dụng:** runtime hệ thống có sẵn trên Windows 10/11; DrgX không phân phối lại WebView2.

## 7. Fonts và tài sản hình ảnh

- Giao diện sử dụng font hệ thống (Segoe UI, Times New Roman, Consolas); DrgX không phân phối tệp font.
- Logo, icon, 5 bộ theme DrgX (Ion, Nebula, Tokyo, Matrix, Dawn), ảnh và video animation trong `web/assets/` và `web/intro/` là tài sản trí tuệ gốc do nhóm DrgX thiết kế và khởi tạo.

## 8. Tài liệu tham khảo chính sách

- Quyết định số 336/QĐ-TTg ngày 25/2/2026 của Thủ tướng Chính phủ.
- Quyết định số 1112/QĐ-BGDĐT ngày 11/5/2026 của Bộ Giáo dục và Đào tạo.
- Thông tư số 07/2022/TT-BGDĐT ngày 23/5/2022 của Bộ Giáo dục và Đào tạo.
- Kế hoạch tổ chức Cuộc thi “Học sinh, sinh viên với ý tưởng khởi nghiệp” tỉnh Phú Thọ, năm học 2026–2027.

## 9. Liên hệ

**Nhóm DrgX** — [[Trường/Xã/Phường]], tỉnh Phú Thọ.
Email: [[Email]] · Điện thoại: [[SĐT]]

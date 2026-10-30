# DrgX Dev Studio

IDE dành cho developer và học sinh tự học: **DrgX Neural AI + BYOK** với nhiều hành động AI hữu ích. Có sẵn bộ C++ tools (cpptools, cmake-tools) cho IntelliSense của C++/CMake.

## Mở nhanh

Bấm **DrgX Dev Studio** trên Desktop hoặc Start Menu. Shortcut trỏ tới `run-dev.cmd` trong thư mục này.

```cmd
run-dev.cmd
```

Launcher mở DrgX Workbench với profile cách ly trong `profile/` và extension `drgx.drgx-dev-1.0.0`.

**Bridge AI tự bật:** nếu cổng `45290` chưa có, launcher mở `drgx-ide.exe` ở dạng thu nhỏ để giữ bridge `http://127.0.0.1:45290/drgx`, đợi bridge sẵn sàng rồi mới mở cửa sổ làm việc. Có thể đóng cửa sổ DrgX IDE (thu nhỏ) khi không dùng AI nữa; lần mở Dev sau launcher sẽ bật lại.

## Sử dụng lệnh

| Lệnh | Phím | Mô tả |
| --- | --- | --- |
| DrgX Dev: Trang chủ | Ctrl+Alt+H | Bảng tổng quan trạng thái bridge + các lệnh |
| DrgX Dev: Trạng thái AI | — | Ping `/health` của bridge |
| DrgX Dev: Hỏi AI | Ctrl+Alt+A | Gõ câu hỏi → gọi `/api/session/<id>/generate` |
| DrgX Dev: Giải thích vùng chọn | Ctrl+Alt+E | Không chọn = giải thích cả file |
| DrgX Dev: Đề xuất cải thiện | — | Hiệu năng, sạch code, lỗi tiềm ẩn, test |
| DrgX Dev: Review code bằng AI | — | Review 4 góc độ, nêu điểm cần làm |
| DrgX Dev: Sinh bộ test bằng AI | Ctrl+Alt+T | Mở file test bên cạnh, tự bỏ bọc ``` nếu có |

Kết quả dài nằm trong **kênh Output "DrgX Dev AI"**; khi quá ngắn thì chỉ hiện toast.

## Cấu hình

- `drgxDev.bridgeUrl` — URL cầu nối (mặc định `http://127.0.0.1:45290/drgx`).
- Model và API key (BYOK) chọn trong app **DrgX IDE**: mở app → Trợ lý AI → chọn provider/model. Extension dùng session AI do bridge tạo, không tự gọi API key.
- Token bridge: extension đọc `bridge-token.js`; nếu app được cài lại và token đổi, extension tự đọc `%APPDATA%\vn.drgx.ide\bridge-token`.

## Sự cố thường gặp

- **"không kết nối được bridge":** kiểm tra `http://127.0.0.1:45290/drgx/health`; nếu chưa có, mở `drgx-ide.exe` hoặc chạy lại shortcut Dev.
- **AI trả 401:** token đã đổi; đóng Dev rồi mở lại để extension đọc token mới.
- **`code` hoặc `node` bị file lạ trong PATH che:** xem mục sự cố trong `../drgx-cp/README.md`.
- Log extension: `profile/logs/<thời-điểm>/window1/exthost/output_logging_*/2-DrgX Dev AI.log`.

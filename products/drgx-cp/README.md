# DrgX CP Studio

Môi trường lập trình thi đấu: **judge cục bộ (F9)** cho luyện tập, **exam server-authoritative** cho phòng thi thật. Không có AI, không có gợi ý code — chủ ý để giữ điều kiện thi công bằng.

## Mở nhanh

Bấm **DrgX CP Studio** trên Desktop hoặc Start Menu. Shortcut trỏ tới `run-cp.cmd` trong thư mục này; không cần mở terminal.

```cmd
run-cp.cmd
```

Việc làm của launcher:

1. Đồng bộ extension `drgx.drgx-cp-1.0.0` vào `extensions/` (nếu app đang chạy thì bỏ qua để không làm crash cửa sổ đang mở).
2. Chạy `server/exam-server.py` (cổng 8765). Nếu server đã chạy thì dùng lại, không tạo trùng.
3. Mở DrgX Workbench với profile cách ly trong `profile/` (có sẵn cấu hình của riêng CP).

Phòng **`DEMO`** có sẵn 4 testcase mẫu trong `server/tests/DEMO/`. Vào phòng `DEMO`, mở `examples/demo-cp/solution.cpp` rồi nộp bài để kiểm tra toàn bộ luồng client → server.

## Sử dụng lệnh

| Lệnh | Mô tả |
| --- | --- |
| **DrgX CP: Chấm testcase** (F9) | Judge **cục bộ**: g++ biên dịch, chạy `tests/*.in`, so với `tests/*.out`; mở **bảng Judge** với diff từng test |
| DrgX CP: Mở bảng chấm bài | Mở lại bảng Judge gần nhất (kết quả local hoặc server) |
| DrgX CP: Trang chủ | Bảng webview tổng quan (server URL, hướng dẫn, trạng thái phòng) |
| DrgX CP: Tạo phòng thi | Server sinh mã phòng (6 ký tự) — không client tự đặt |
| DrgX CP: Tham gia phòng thi | Nhập mã phòng + tên thí sinh |
| DrgX CP: Nộp bài lên server | Gửi source lên server, server tự chấm và trả verdict |
| DrgX CP: Báo cáo | Danh sách phòng trong phiên + lần chấm cuối |
| DrgX CP: Kiểm tra trạng thái server | Ping `/` của exam server |

## Bảng Judge

Mỗi lần chấm (F9 hoặc nộp bài server) mở panel **DrgX Judge** bên cạnh editor:

- Vòng kết quả, số test đạt, tổng thời gian chạy và thời gian biên dịch.
- Danh sách testcase có badge verdict, thời gian chạy và bộ lọc **Tất cả / Đạt / Chưa đạt**.
- Bấm vào test để xem **diff kỳ vọng ↔ nhận được**, stderr và input (local judge).
- Nút **Sao chép** tóm tắt kết quả, **Output** mở kênh `DrgX Judge`, **Chấm lại** chạy lại F9.
- Panel dùng `preserveFocus` nên không cướp focus khỏi editor khi đang chấm.

Kết quả chi tiết vẫn được ghi song song vào **kênh Output "DrgX Judge"**.

## Quản lý testcase phía server

Server chấm bài trong `server/tests/<MÃ_PHÒNG>/<n>.in` và `<n>.out`:

```
server/tests/
  DEMO/          # phòng mẫu, tự nạp khi server khởi động
    01.in  01.out
    02.in  02.out
  C8YGPD/        # phòng do "Tạo phòng thi" sinh mã
    01.in  01.out
```

- Mã phòng được chuẩn hoá hoa/thường và khoảng trắng khi join/submit.
- Thư mục có `.in` nhưng thiếu `.out` trả `NO_OUT` cho test đó, không AC oan.
- Server nạp lại danh sách phòng từ các thư mục trong `server/tests/` sau khi khởi động lại.

Verdict server trả về: `AC` (đạt tất cả), `FAIL` (có WA/NO_OUT), `CE` (lỗi biên dịch), `TLE`, `NO_TESTS`, `NO_OUT`, `BAD_LANG`.

## Exam Integrity nhiều lớp (điều kiện công bố phẳng)

- Mã phòng do **server sinh**, không client nào tự đặt được.
- Chấm bài **chỉ trên server** — client không được quyết định kết quả.
- Nhật ký nộp bài lưu trong bộ nhớ server kèm timestamp.
- Kênh judge tách bạch giữa máy thí sinh và máy chấm.

## Sự cố thường gặp

- **Bấm shortcut không mở / báo không tìm thấy `code`:** kiểm tra `where.exe code` trên PATH hệ thống để đảm bảo trỏ tới đúng tệp thực thi của workbench.
- **`node` chạy không có phản hồi:** kiểm tra `where.exe node`. File rỗng `C:\Windows\System32\node` từng che Node thật; cần quyền Administrator để xoá, sau đó mở terminal mới.
- **Server báo cổng 8765 bận:** đóng tiến trình Python cũ hoặc đổi `-Port` khi chạy `run-cp.ps1`.
- **Extension không cập nhật:** đóng hết cửa sổ CP rồi mở lại; launcher chỉ đồng bộ khi app đã tắt.
- Log app: `profile/logs/<thời-điểm>/...`; log server: `server.log` và `server.log.err`.

# DrgX Product Suite

Hệ sinh thái gồm **hai bản Studio riêng biệt** (mỗi bản dùng profile cách ly và extension riêng trên DrgX Workbench Core) **kèm nền tảng độc lập Void-bit OJ**:

| App | Thư mục | Dành cho | Thành phần chính |
| --- | --- | --- | --- |
| **DrgX CP Studio** | `products/drgx-cp` | Thí sinh thi đấu, giảng viên | Judge cục bộ (F9), Exam Server-authoritative, Exam Integrity nhiều lớp |
| **DrgX Dev Studio** | `products/drgx-dev` | Developer & Học sinh tự học | DrgX Neural AI Bridge + BYOK, hỏi AI, giải thích, review, sinh test |
| **Void-bit OJ** | `products/void-bit` | Luyện OJ + học tập tự học | OJ server C++17 local (cổng 8080, 46 bài chuẩn HSG & luyện tập phân bậc), chấm subtask, anti-cheat Winnowing, stress test, web học tập tĩnh 12 trang (Node, cổng 8000) |

Cả hai bản Studio đều có `profile/` và `extensions/` riêng — mở cửa sổ riêng, cài đặt riêng, không nhiễu nhau.

## Trạng thái kiểm chứng (đã chạy thật trên máy)

- Exam Server chấm bài **server-authoritative**: AC / WA / CE / TLE / NO_TESTS — smoke test 11/11 đã PASS (`server/smoke-test.py`).
- Bridge AI `http://127.0.0.1:45290/drgx` kiểm chứng end-to-end: health → tạo session → generate trả `data.text`.
- Bộ C++ tools (cpptools, CMake) chỉ nằm trong **Dev Studio**; CP Studio giữ môi trường thi đấu tối giản.
- **Void-bit OJ**: nộp probe → **AC 12/12, 100/100 điểm** bằng cả C++17 (thuần 670 ms) lẫn Python 3 (thuần 1,61 s); bài `int main(){return 0;}` bị bắt **WA 0/12** đúng hạn; anti-cheat Winnowing đo được similarity **74,6%** giữa 2 bài nộp đã đổi toàn bộ tên biến.

## Cách chạy

```cmd
products\drgx-cp\run-cp.cmd    :: khởi động exam server + mở profile CP (nếu server đang chạy sẽ tự dùng lại)
products\drgx-dev\run-dev.cmd  :: mở profile Dev
products\void-bit\run-oj.cmd   :: Void-bit OJ (:8080) + web học tập (:8000) + mở trình duyệt
```

## Bảo đảm tính minh bạch kỳ thi (Exam Integrity)

- CP Studio triển khai kiến trúc **Exam Integrity 4 lớp**: cách ly profile tắt AI 100%, chấm bài server-authoritative trên máy giáo viên, mã phòng 6 ký tự do server sinh và thuật toán phát hiện đạo văn cấu trúc Winnowing $k$-gram.

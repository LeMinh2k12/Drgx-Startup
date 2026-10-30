# Demo CP — DrgX Judge & Stress Tester

Bộ bài toán nhỏ để demo (quay video, trình diễn tại gian hàng) và để kiểm thử sản phẩm.

## Bài toán

Cho `n` số nguyên, tính tổng. Giới hạn: `n <= 1e5`, `|a_i| <= 1e9` — tổng có thể vượt `int`, nên phải dùng `long long`.

| Tệp | Mô tả |
|---|---|
| `solution.cpp` | Lời giải đúng bằng C++ (dùng `long long`) |
| `solution.py` | Lời giải đúng bằng Python (đọc toàn bộ stdin) |
| `solution_buggy.cpp` | Bản cố ý sai (dùng `int`) để demo WA |
| `brute.cpp` | Bản đối chiếu cho stress test |
| `gen.py` | Sinh test ngẫu nhiên |
| `tests/01–04` | Bộ testcase mẫu (input `.in`, đáp án `.out`) |

## Chạy thử bằng DrgX CP Studio

Mở thư mục này trong **DrgX CP Studio** (`products/drgx-cp/run-cp.cmd`) rồi dùng lệnh trong Command Palette:

| Hành động | Lệnh DrgX CP |
|---|---|
| Chấm file đang mở — bản đúng 4/4 AC | **DrgX CP: Chấm testcase** (F9) |
| Chấm bản sai — thấy **WA** ở test 02 & 04 | Mở `solution_buggy.cpp` rồi bấm **F9** |
| Tạo phòng thi server-authoritative | **DrgX CP: Tạo phòng thi** |
| Nộp bài lên server (server tự chấm) | **DrgX CP: Nộp bài lên server** |

> Testcase trên server đọc từ `products/drgx-cp/server/tests/<MÃ_PHÒNG>/` — sao chép `tests/01–04` vào thư mục đó để chấm server với bộ demo này.

## Kịch bản demo 60 giây

1. Mở `solution_buggy.cpp`, bấm **F9** — judge cục bộ hiện **WA** và diff trong kênh "DrgX Judge".
2. Sửa `int` → `long long` (hoặc mở `solution.cpp`).
3. Bấm **F9** — hiện **AC** toàn bộ: `4/4 test đạt`.
4. **DrgX CP: Tạo phòng thi** — server sinh mã phòng.
5. **DrgX CP: Nộp bài lên server** — server tự chấm (Exam Integrity: kết quả do server quyết).
6. Mở **Contest Timer** — đặt 25 phút.

> **Lưu ý:** Judge gửi **file đang mở** cho panel. Mở `solution.cpp` rồi bấm F9 để thấy AC; muốn chấm bản sai, mở `solution_buggy.cpp` rồi bấm F9. Kết quả khi **nộp server** luôn do exam server quyết định.

## Kết quả kỳ vọng

```
# solution.cpp
AC 01  12 ms
AC 02  12 ms
AC 03  11 ms
AC 04  13 ms
4/4 AC — ACCEPTED

# solution.py
4/4 AC — ACCEPTED

# solution_buggy.cpp
AC 01
WA 02  output -1294967296, expected 3000000000
AC 03
WA 04  output 1410065408, expected 10000000000
2/4 AC
```

Thời gian có thể thay đổi tùy máy; verdict và diff thì ổn định.

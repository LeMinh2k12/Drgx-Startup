# DrgX — Bộ Thuyết Trình & Cẩm Nang Sân Khấu (Vòng Chung kết tỉnh Phú Thọ 2026–2027)

Bộ trình chiếu và kịch bản **chạy 100% offline** cho Cuộc thi *“Học sinh, sinh viên với ý tưởng khởi nghiệp”* tỉnh Phú Thọ (Kế hoạch số **153/KH-SGDĐT** ngày 25/9/2026).

> **Lưu ý theo Kế hoạch 153:** hồ sơ nộp **01–05/11/2026 (trước 17h00 ngày 05/11)**, bản giấy có chữ ký lãnh đạo và đóng dấu; Vòng chung kết cấp tỉnh **06–15/11/2026** chấm hồ sơ dự án. Sản phẩm bắt buộc kèm bài dự thi gồm **Bản thuyết minh (Phụ lục 04)** và **video thuyết trình ≤ 03 phút, ≤ 500MB (Phụ lục 05)** — vì vậy bộ slide có thêm **chế độ Video 3 phút**.

---

## Danh mục tệp

| Tệp | Vai trò |
| :--- | :--- |
| `index.html` | **Bộ slide tương tác 23 trang** (18 slide chính + 5 slide Phụ lục Q&A `PL1`–`PL5`), 5 skin, đồng hồ sân khấu, Presenter View. |
| `kich-ban-thuyet-trinh.html` | **Cẩm nang sân khấu & thẻ cầm tay (Cue Cards)** — đồng hồ tập dượt, chế độ chữ lớn, lọc 5/7 phút, nút In A4/PDF. |
| `KICH-BAN-THUYET-TRINH.md` | **Kịch bản nguyên văn** (phân vai, ký hiệu `[BẤM →]`, Q&A). Có **Phần VI** (số đo thật · mô phỏng · ước tính · mục tiêu · dự phóng) và **Phần VII** (kịch bản video 3 phút). |
| `Kich-ban-thuyet-trinh-DrgX.docx` | **Bản Word** chuẩn in A4: bìa, mục lục, đầu/chân trang có số trang, bảng có hàng tiêu đề. Sinh bằng `python scripts/generate_pitch_docx.py` từ file `.md`. |
| `Mo-thuyet-trinh.cmd` | Mở nhanh bộ slide bằng một cú nhấp đúp. |
| `selftest.html` | **Kiểm thử tự động 23 hạng mục** (cấu trúc + nội dung). Mở trong trình duyệt, tiêu đề tab hiện `SELFTEST: 23/23 PASS`. |

> Sau khi sửa `KICH-BAN-THUYET-TRINH.md`, chạy lại `python scripts/generate_pitch_docx.py` để cập nhật file Word.

---

## Ba chế độ trình bày (phím `M`)

| Chế độ | Slide | Thời lượng | Dùng khi |
| :--- | :---: | :---: | :--- |
| **Toàn bộ** (mặc định) | 18 | 380 giây | Có 7–10 phút trình bày. |
| **5 phút** (`⏱ 5′`) | 14 | 300 giây | Ban tổ chức giới hạn đúng 5 phút. Mở nhanh bằng `index.html?mode=5`. |
| **Video 3 phút** (`🎬 3′`) | 12 | 176 giây | Quay **video dự thi ≤ 03 phút** (Phụ lục 05). Mở nhanh bằng `index.html?mode=3`. |

Slide của chế độ video: S1, S2, S3, S5, S7, S8, S9, S11, S15, S16, S17, S18. Lời bình từng slide nằm ở Phần VII của kịch bản.

## Ánh xạ tiêu chí chấm (Phụ lục 06 — 6 nhóm, 21 tiêu chí thành phần, 100 điểm)

Mỗi slide ghi mã tiêu chí chứng minh (`Trọng tâm 1.1`, `Trọng tâm 4.2`, …). Bộ kiểm thử `selftest.html` xác nhận **phủ đủ 21/21 tiêu chí**:

| Nhóm | Tiêu chí | Điểm | Slide chính |
| :---: | :--- | :---: | :--- |
| 1 | Sự cần thiết, mức độ ứng dụng thực tế (1.1–1.4) | 20 | S1, S2, S3, S4, S7, S8 |
| 2 | Tính khả thi, tiềm năng (2.1–2.4) | 15 | S6, S9, S11, S13, S14 |
| 3 | Tính mới, độc đáo, sáng tạo (3.1–3.3) | 20 | S5, S7, S8, S10, S12 |
| 4 | Tiềm năng của dự án (4.1–4.4) | 15 | S9, S14, S15, S16 |
| 5 | Truyền thông và Marketing (5.1–5.2) | 10 | S13 |
| 6 | Năng lực triển khai (6.1–6.4) | 20 | S2, S10, S11, S17, S18 |

## Phím tắt

| Phím / thao tác | Chức năng |
| :--- | :--- |
| `→` / `Space` / `PgDn` · `←` / `PgUp` | Tiến / lùi một bước (slide hoặc fragment) |
| Click nửa phải / nửa trái màn hình | Tiến / lùi một slide |
| `1`–`23` + `Enter` | Nhảy tới slide (gõ `19`–`23` để mở nhanh `PL1`–`PL5`) |
| `M` | Đổi chế độ: Toàn bộ → 5 phút → Video 3 phút |
| `A` | Nhảy thẳng tới Phụ lục Q&A (`PL1`) |
| `O` | Lưới tổng quan 23 slide |
| `N` / `P` | Ghi chú diễn giả / mở cửa sổ Presenter View |
| `T` | Đổi skin (Obsidian · Nebula · Tokyo · Matrix · Dawn) |
| `F2` | Ẩn/hiện thanh điều khiển dưới đáy (sân khấu sạch) |
| `L` / `B` / `R` / `F` | Laser / màn hình đen / đặt lại đồng hồ / toàn màn hình |

---

## Quy tắc trung thực của bộ slide

- **Mô phỏng** (S7 Stress Test, S8 Winnowing, S9 sơ đồ 40 máy) đều có nhãn “mô phỏng” ngay trên slide; số đo thật đi kèm ghi rõ ngày đo.
- **Ước tính** (90–120 phút cài đặt, 30–45 phút gom bài, số liệu đối thủ) được gọi đúng là *ước tính của nhóm*.
- **Mục tiêu** (5 trường pilot, 1.000 lượt cài, …) luôn có chữ “mục tiêu”; **tài chính** là dự phóng, giả định minh bạch ở `PL4`.
- Các số đo thật tái kiểm chứng được bằng:
  `python -X utf8 scripts/verify_ecosystem.py` (67/67) · `python products/drgx-cp/server/load-test.py 40` (40 bài nộp đồng thời) · `python -X utf8 scripts/verify_winnowing.py` (engine chống đạo văn thật).

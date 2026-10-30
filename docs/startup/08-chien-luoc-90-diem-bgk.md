# Chiến lược đạt >90/100 điểm trước Ban Giám khảo khó tính nhất
## (Bám sát Phụ lục 06 — Kế hoạch số 153/KH-SGDĐT ngày 25/9/2026 của Sở GD&ĐT Phú Thọ)

> **Mục tiêu:** Đưa dự án **DrgX (CP Studio + Dev Studio + Void-bit OJ + Exam Server + Learn Hub)** vượt mốc **92–96/100 điểm** tại Vòng Chung kết cấp Tỉnh và đủ tiêu chuẩn chọn cử dự thi Quốc gia (**SV_STARTUP lần thứ IX**).

---

## 1. Giải phẫu Ma trận Chấm điểm Phụ lục 06 (100 Điểm) & Cách lấy điểm tối đa

Ban Giám khảo (BGK) cấp tỉnh thường gồm **4 nhóm chuyên gia**:
1. **Giám khảo Công nghệ / Kỹ thuật (ĐH Hùng Vương, Sở KH&CN, chuyên gia CNTT):** Soi rất kỹ *“Sản phẩm có làm thật không hay chỉ đổi tên mã nguồn mở? Độ khó kỹ thuật ở đâu?”*
2. **Giám khảo Tài chính / Doanh nhân / Nhà đầu tư:** Soi *“Lấy tiền từ ai? Chi phí máy chủ AI có làm lỗ vốn không? Bao giờ hòa vốn? LTV/CAC là bao nhiêu?”*
3. **Giám khảo Quản lý Giáo dục / Sư phạm (Sở GD&ĐT):** Soi *“Có đúng định hướng CT GDPT 2018 và Quyết định 1131/QĐ-TTg không? Trường vùng khó có dùng được không? Làm sao chống học sinh dùng AI gian lận khi thi?”*
4. **Giám khảo Truyền thông & Khởi nghiệp:** Soi *“Kế hoạch tiếp cận trường học có thực tế không? Gian hàng trưng bày có mô hình trực quan và phối hợp nhóm tốt không?”*

Bảng dưới đây chỉ rõ **21 tiêu chí thành phần** của Phụ lục 06, lý do các đội khác thường bị trừ điểm và **“Vũ khí ăn điểm tuyệt đối”** của DrgX:

| Mã | Tiêu chí chấm (Phụ lục 06) | Điểm tối đa | Điểm mục tiêu | Lý do giám khảo khó tính hay trừ điểm | Vũ khí ăn điểm của DrgX (Đã tích hợp vào Hồ sơ & Sản phẩm) |
|---|---|---:|---:|---|---|
| **1** | **Sự cần thiết, ứng dụng thực tế** | **20,0** | **19,0** | | |
| 1.1 | Sự cần thiết đối với nhu cầu thị trường | 5,0 | 4,8 | Nêu vấn đề chung chung, không có số liệu đo lường trước/sau | **Bảng 1 Thuyết minh:** Đo lường 6 chỉ số định lượng (cài đặt `120 phút → < 60 giây`, chấm bài `15–60s → < 0,5s`, thu bài 40 máy `45 phút → < 2 phút`). |
| 1.2 | Giá trị cho khách hàng, cộng đồng, xã hội | 5,0 | 4,8 | Sản phẩm chỉ phục vụ nhóm nhỏ có tiền | Gói Free trọn đời cho học sinh; chạy **100% Offline trên mạng LAN** và **Web Lab** cho phòng máy trường huyện/miền núi RAM 4GB. |
| 1.3 | Đánh giá đối tượng, phân khúc khách hàng | 5,0 | 4,7 | Không phân biệt người dùng (HS) và người trả tiền (Trường/PH) | **Bảng 2 Thuyết minh:** Tách rõ 4 phân khúc B2C (HS đại trà, HSG/SV) và B2B (Giáo viên/CLB, Nhà trường) với sản phẩm riêng. |
| 1.4 | Ứng dụng KH&CN giải quyết thực tế | 5,0 | 4,7 | Công nghệ đơn giản (chỉ là web tĩnh hoặc CRUD cơ bản) | Bám sát **Quyết định 1131/QĐ-TTg**: Local-first AI Bridge, C++17 Native Judge (`oj_server.cpp`), SSE Streaming, thuật toán băm trượt **Winnowing $k$-gram**. |
| **2** | **Tính khả thi, tiềm năng dự án** | **15,0** | **14,0** | | |
| 2.1 | Tính khả thi trong kế hoạch, nguồn lực SXKD | 5,0 | 4,8 | Sản phẩm mới dừng ở ý tưởng hoặc bản vẽ Figma | **6 mảnh ghép đã chạy thật**, vượt qua **67/67 chốt chặn tự động (`verify_ecosystem.py`)** và **11/11 smoke test đa luồng (`smoke_test.py`)**. |
| 2.2 | Cơ cấu chi phí và mức độ cạnh tranh | 5,0 | 4,6 | Chi phí vận hành Cloud/AI quá cao làm âm biên lợi nhuận | Kiến trúc **Local-First**: biên dịch & chấm bài trên CPU máy khách → chi phí biến đổi ~0đ, **biên lợi nhuận gộp đạt 82–85%** (Bảng 4). |
| 2.3 | Tính khả thi của kế hoạch bán hàng | 3,0 | 2,8 | Đòi bán trực tiếp cho hàng vạn học sinh bằng quảng cáo đắt đỏ | Chiến lược **B2B2C Land-and-Expand**: 1 Giáo viên dùng Exam Server miễn phí trên lớp → kéo theo 40–120 học sinh cài app → Trường mua gói Lab. |
| 2.4 | Triển khai cộng đồng đơn giản, thân thiện | 2,0 | 1,8 | Cài đặt phức tạp, đòi quyền Admin trên máy trường | Khởi chạy 1 lệnh `drgx.cmd start`; phòng máy khóa quyền cài đặt dùng ngay **DrgX Web Lab** trên trình duyệt Chrome/Edge. |
| **3** | **Tính mới, độc đáo, sáng tạo** | **20,0** | **18,5** | | |
| 3.1 | Mức độ sáng tạo của ý tưởng / triển khai | 10,0 | 9,3 | Giải pháp thiếu chiều sâu kiến trúc | **Kiến trúc Kép Tách Biệt độc quyền:** `CP Studio` (cách ly hoàn toàn AI để thi minh bạch) + `Dev Studio` (có AI Agent để học) + `Void-bit C++17 OJ`. |
| 3.2 | Lợi thế cạnh tranh so với sản phẩm sẵn có | 7,0 | 6,4 | So sánh thiên vị, thiếu tiêu chí kỹ thuật lõi | **Bảng 5 Thuyết minh:** Đối sánh 10 tiêu chí với Editor truyền thống, Web OJ (VNOJ/CF) và Cloud AI IDE (Cursor/Replit). |
| 3.3 | Tích hợp, mô hình hóa hoặc STEM/Robotics | 3,0 | 2,8 | Phần mềm thuần túy thường bỏ quên tiêu chí mô hình hóa/STEM này | **Mục II.3.1 Thuyết minh:** Mô hình hóa trực quan Stress Test 3 cột, biểu đồ vân tay code Winnowing, mô hình LAN và tích hợp lập trình C++/Python cho **Arduino/ESP32/Robotics**. |
| **4** | **Tiềm năng của dự án** | **15,0** | **14,0** | | |
| 4.1 | Dự kiến doanh thu, chi phí, lợi nhuận | 5,0 | 4,7 | Số liệu “vẽ trên mây”, không khớp giữa bảng và CSV | **Bảng 6 & 7 + `financial-model.csv`:** Dự phóng 3 năm chặt chẽ (Doanh thu 244,9tr → 1.588,8tr → 7.594,0tr; hòa vốn Quý 3/2028). |
| 4.2 | Thời gian thu hồi vốn, hiệu quả nguồn lực | 3,0 | 2,8 | Không tính được CAC, LTV và kịch bản rủi ro | **Bảng 8 & 9:** Unit Economics chuẩn quỹ đầu tư (**LTV/CAC = 6,2x–7,9x**, thu hồi CAC < 5,3 tháng) + **Phân tích độ nhạy 3 kịch bản** (giảm 30% vẫn lãi Năm 2). |
| 4.3 | Khả năng tăng trưởng, mở rộng dự án | 3,0 | 2,8 | Chỉ bó hẹp ở 1 trường hoặc 1 môn | Mở rộng 3 tầng địa lý (Phú Thọ → Miền Bắc → Toàn quốc/ĐNA) và mở rộng sang chấm Web/SQL/STEM IoT. |
| 4.4 | Tác động giáo dục, xã hội; tư duy STEM | 4,0 | 3,7 | Thiếu gắn kết với phong trào STEM học đường | Bình đẳng hóa công nghệ cho học sinh vùng khó; giảm 90% tải chấm bài cho giáo viên; khơi dậy tinh thần học sinh tự làm chủ công nghệ lõi. |
| **5** | **Truyền thông và Marketing** | **10,0** | **9,2** | | |
| 5.1 | Kế hoạch hướng tới PH, HS và cộng đồng | 5,0 | 4,6 | Chỉ nói chuyện với học sinh, quên phụ huynh và nhà trường | **Bảng 10:** Tách thông điệp & kênh riêng cho **Học sinh** (tốc độ/skin), **Nhà trường** (phòng thi LAN sạch AI) và **Phụ huynh** (lộ trình 12 tuần an toàn). |
| 5.2 | Giải pháp truyền thông sáng tạo, khác biệt | 5,0 | 4,6 | Chỉ chạy quảng cáo Facebook tốn kém | Chiến dịch video ngắn **“60 giây bắt sống test WA”** (quay Stress Test 3 cột), giải đấu **DrgX Mini-Contest 45 phút** tại CLB và Đại sứ học sinh. |
| **6** | **Năng lực triển khai dự án** | **20,0** | **19,0** | | |
| 6.1 | Khả năng thuyết trình, trình bày ý tưởng | 5,0 | 4,8 | Đọc chữ trên slide, quá giờ, lúng túng khi bị hỏi xoáy | Slide tương tác `pitch.html`, kịch bản 5 phút dẫn mắt bằng Demo sống, bộ **25 câu hỏi phản biện chuyên sâu (`04-hoi-dong-qa.md`)**. |
| 6.2 | Kiến thức tài chính, pháp luật, xã hội | 5,0 | 4,8 | Không hiểu giấy phép mã nguồn mở, vi phạm bản quyền hoặc dữ liệu | Nắm chắc giấy phép MIT (`LICENSE`, `NOTICE.md`), Nghị định 13/2023/NĐ-CP (`PRIVACY.md`), Phụ lục 01 và Quyết định 1131/QĐ-TTg. |
| 6.3 | Kỹ năng làm việc nhóm, hợp tác | 5,0 | 4,7 | Chỉ 1 người nói, các thành viên khác đứng im | Phân vai rõ 5 người khi bảo vệ (1 thuyết trình chính, 1 điều khiển Demo kỹ thuật, 1 trả lời Tài chính/Marketing, 1 phụ trách Sư phạm/QA). |
| 6.4 | Gian hàng đẹp, có mô hình, video/công nghệ | 5,0 | 4,7 | Gian hàng chỉ có tờ giấy và 1 laptop để không | **Gian hàng 3 Trạm Tương tác + Kiosk Giám khảo (`web/judge-demo.html`) + Video Intro động + Poster A3 chuẩn in**. |
| **TỔNG** | **TOÀN BỘ 6 NHÓM TIÊU CHÍ** | **100,0** | **93,7** | | **Đạt ngưỡng Xuất sắc (>90/100 điểm)** |

---

## 2. Kịch bản Demo Trực tiếp 5 Phút tại Vòng Chung kết (“Đòn quyết định” hạ gục Giám khảo khó tính)

Giám khảo công nghệ và đầu tư sẽ tin ngay lập tức khi thấy sản phẩm chạy mượt trước mắt họ mà **không cần Internet**. Hãy chuẩn bị sẵn 1 laptop chạy lệnh `drgx.cmd start` và thực hiện đúng 5 bước sau trong **120 giây đầu của phần Demo**:

### Bước 1 — Khởi động & Nhận diện thương hiệu (15 giây)
- Mở **DrgX CP Studio** hoặc **DrgX Home (`http://127.0.0.1:3000/judge-demo.html`)**:
- **Hình ảnh trên màn hình:** Video Intro động (`drgx_logo_animation.mp4`) chạy mượt mà với thanh trạng thái khởi tạo 3 bước (*Khởi tạo nhân trình soạn thảo → Nạp trình biên dịch C++17 & Python → Kích hoạt giao diện*).
- **Lời bình:** *“Thưa Hội đồng, thay vì mất 2 giờ cài đặt 6 công cụ rời rạc, học sinh mở DrgX lên là có sẵn toàn bộ môi trường trong chưa đầy 5 giây.”*

### Bước 2 — Chấm đa testcase Offline & Kiến trúc Kép chống gian lận AI (25 giây)
- Mở bài toán trong `examples/demo-cp`, nhấn phím **`F9`** (hoặc `Ctrl+Alt+J`).
- **Hình ảnh trên màn hình:** Bảng kết quả hiện tức thì (< 0,5 giây) với đầy đủ trạng thái `AC`, `WA`, `TLE` và khung so sánh lệch dòng (Diff). Chỉ vào thanh công cụ của **CP Studio** để chứng minh **không hề có nút AI Copilot**.
- **Lời bình:** *“Trong giờ kiểm tra, nhà trường dùng bản CP Studio này: hoàn toàn không có AI để đảm bảo công bằng tuyệt đối, chấm đa testcase ngay trên máy không cần mạng.”*

### Bước 3 — Vũ khí Kỹ thuật #1: Differential Stress Test 3 cột tự động bắt lỗi (30 giây)
- Chuyển sang tab **Void-bit OJ (`http://127.0.0.1:8000`)** hoặc **Kiosk Giám khảo (`http://127.0.0.1:3000/judge-demo.html`)**, mở tính năng **Stress Test 3 cột**.
- **Hình ảnh trên màn hình:** Máy chủ C++17 (`:8080`) tự động biên dịch 3 file (`generator.cpp`, `brute.cpp`, `solution.cpp`), chạy đến Test #4 thì dừng lại và **tô đỏ chính xác bộ dữ liệu đầu vào nhỏ nhất làm code học sinh bị sai** (ví dụ: tràn số hoặc trường hợp biên).
- **Lời bình:** *“Khi học sinh bị sai test ẩn mà không biết tại sao, công cụ Stress Test 3 cột của chúng em tự sinh test ngẫu nhiên và bắt sống phản ví dụ chỉ trong 5 giây — thay vì mất cả buổi tối đoán mò.”*

### Bước 4 — Vũ khí Kỹ thuật #2: Thuật toán Winnowing $k$-gram bắt sống đạo văn đổi tên biến (25 giây)
- Mở tab **Kiểm tra Đạo văn (Anti-Cheat Winnowing)**: bên trái là code gốc, bên phải là code đã bị đổi toàn bộ tên biến (`a, b, dp` → `x1, y2, ket_qua`), xóa hết chú thích và đổi khoảng trắng. Nhấn **So sánh cấu trúc**.
- **Hình ảnh trên màn hình:** Hệ thống báo ngay **Độ tương đồng cấu trúc: `100%` (Cảnh báo sao chép)** nhờ chuẩn hóa token và băm trượt $k$-gram.
- **Lời bình:** *“Nếu hai học sinh chép bài nhau rồi sửa tên biến để qua mắt thầy cô, thuật toán Winnowing $k$-gram của DrgX vẫn phát hiện chính xác cấu trúc giải thuật trùng nhau (100%).”*

### Bước 5 — Phòng thi LAN `:8765`, AI Dev Studio & Learn Hub 12 tuần (25 giây)
- Chiếu nhanh bảng điều khiển **Exam Server (`:8765`)** nhận bài nộp đồng thời từ các máy trong lớp, sau đó bấm `Ctrl+Alt+L` mở **Learn Hub 12 tuần** và chuyển đổi trực tiếp giữa **5 bộ Skin chuyên nghiệp** (Ion, Nebula, Tokyo, Matrix, Dawn).
- **Lời bình:** *“Từ tự học ở nhà với AI trong Dev Studio, theo lộ trình 12 tuần trên Learn Hub, đến vào phòng thi LAN minh bạch với CP Studio — tất cả tạo thành một vòng lặp khép kín duy nhất.”*

---

## 3. Sơ đồ bố trí Gian hàng Trưng bày Tương tác 3 Trạm (Ăn trọn 5/5 điểm Tiêu chí 6.4)

Đừng chỉ đặt một chiếc laptop trên bàn! Hãy bố trí bàn trưng bày tại Vòng Chung kết thành **3 khu vực trực quan** (dù chỉ dùng 1–2 laptop + 1 màn hình phụ hoặc máy tính bảng):

```
+-----------------------------------------------------------------------------------+
|                        POSTER A3 & BANNER NHẬN DIỆN DrgX                          |
|         (Trình bày rõ: 6-8 công cụ -> 1 | QĐ 1131/QĐ-TTg | 67/67 PASS)            |
+---------------------------+---------------------------+---------------------------+
|         TRẠM SỐ 1         |         TRẠM SỐ 2         |         TRẠM SỐ 3         |
|   PHÒNG THI LAN MINH BẠCH |   MÔ HÌNH HÓA THUẬT TOÁN  |  KIOSK GIÁM KHẢO & STEM   |
|                           |                           |                           |
| - Laptop 1 mở CP Studio   | - Màn hình mở Void-bit OJ | - Mở trang tương tác      |
|   + Exam Server (:8765)   |   (:8000 / :8080)         |   web/judge-demo.html     |
| - Dán nhãn phím [F9] màu  | - Trình diễn trực tiếp    | - Bộ 02 quyển Hồ sơ in    |
|   nổi để Giám khảo tự tay |   Stress Test 3 cột &     |   màu A4 đóng bìa cứng    |
|   bấm chấm thử < 0,5 giây |   biểu đồ vân tay code    | - Mã QR quét xem Video    |
|   ngay tại chỗ.           |   Winnowing (chép đổi tên biến: 100%).        |   & mô hình mạch STEM.    |
+---------------------------+---------------------------+---------------------------+
```

---

## 4. Phân vai 5 Thành viên khi Phản biện trước Hội đồng (Ăn trọn 5/5 điểm Tiêu chí 6.3)

Giám khảo rất thích những đội mà **mọi thành viên đều hiểu việc của mình**, không phải chỉ 1 bạn nói từ đầu đến cuối:

1. **Thành viên 1 (Trưởng nhóm — Sản phẩm & Chiến lược):** Mở đầu bài thuyết trình, trình bày Nỗi đau thị trường, Giá trị cốt lõi, Mô hình Kép (CP/Dev Studio) và trả lời các câu hỏi về Định hướng phát triển / Khác biệt cạnh tranh.
2. **Thành viên 2 (Giám đốc Kỹ thuật — C++17 / Rust / AI / Server):** Trực tiếp thao tác Demo trên máy tính và trả lời các câu hỏi chuyên sâu về Kiến trúc C++17 Judge, Thuật toán Winnowing, Stress Test, Exam Server đa luồng, bảo mật và giấy phép MIT (`NOTICE.md`).
3. **Thành viên 3 (Thiết kế Trải nghiệm & Mở rộng STEM):** Trả lời các câu hỏi về Tính thân thiện giao diện, 5 bộ Skin chống mỏi mắt, Web Lab cho máy cấu hình yếu và khả năng tích hợp mô hình hóa / lập trình vi điều khiển STEM (Tiêu chí 3.3).
4. **Thành viên 4 (Tài chính & Truyền thông):** Trả lời ngay lập tức các câu hỏi về Bảng dòng tiền 3 năm, Unit Economics (`LTV/CAC = 6,2x–7,9x`, biên lợi nhuận gộp `82–85%`), điểm hòa vốn Quý 3/2028, kịch bản giảm 30% doanh thu và chiến lược Marketing B2B2C.
5. **Thành viên 5 (Kiểm thử QA & Học liệu Sư phạm):** Trả lời các câu hỏi về Lộ trình học 12 tuần (Learn Hub), mô hình CLB Sprint 2 tuần, bộ 47 bài toán chuẩn HSG và quy trình kiểm định chất lượng `67/67 PASS`.

---

## 5. Checklist “4 Không — 4 Có” để giữ vững mốc >90 điểm

### 4 KHÔNG (Tuyệt đối tránh):
1. **KHÔNG trình bày mơ hồ về kiến trúc phần mềm:** Luôn chủ động nói rõ ngay từ đầu: *“Hệ sinh thái DrgX tuân thủ giấy phép mã nguồn mở MIT & Apache-2.0 hợp pháp; giá trị cốt lõi do nhóm tự xây là kiến trúc Kép CP/Dev Studio, máy chủ C++17 Judge, thuật toán Winnowing, Stress Test, Exam Server LAN, 5 skin gốc và Learn Hub.”* Sự rõ ràng và hiểu luật này ghi điểm tuyệt đối về pháp lý (Tiêu chí 6.2).
2. **KHÔNG bịa số liệu doanh thu đã thu tiền thật:** Phân biệt rạch ròi giữa **Kết quả kỹ thuật đã kiểm chứng thật** (`67/67 PASS`, `11/11 smoke test`, `47 bài tập`, `Winnowing (chép đổi tên biến: 100%)`) và **Dự phóng tài chính thận trọng sau giai đoạn Pilot** (`Bảng 6, 7, 8, 9`).
3. **KHÔNG để sót bất kỳ dấu `[[...]]` nào khi in nộp:** Chạy lệnh `python -X utf8 scripts/check_placeholders.py` trước khi đi in.
4. **KHÔNG phụ thuộc vào Wi-Fi hội trường khi thi Chung kết:** Mọi bản Demo (`CP Studio`, `Exam Server :8765`, `Void-bit OJ :8080`, `Web Hub :3000`) đều chạy trên `127.0.0.1` (Localhost).

### 4 CÓ (Bắt buộc mang theo):
1. **CÓ biên bản xác nhận Pilot / Ý kiến nhận xét của Giáo viên Tin học hoặc CLB nhà trường** (dù chỉ là 1–2 lớp thử nghiệm thực tế tại trường) — đây là bằng chứng sống nâng điểm Tiêu chí 1 và Tiêu chí 2 lên mức tối đa.
2. **CÓ mở sẵn trang `http://127.0.0.1:3000/judge-demo.html`** trên máy tại gian hàng để Giám khảo tự bấm thử Stress Test và Anti-Cheat.
3. **CÓ in sẵn 03 bộ Bài thuyết minh màu trên giấy A4 định lượng dày (100–120gsm)** kèm Poster A3 để đặt ngay trên bàn Hội đồng.
4. **CÓ đồng hồ bấm giờ khi luyện nói:** Đảm bảo phần trình bày gói gọn đúng thời lượng quy định, dành trọn thời gian cho phần Demo sống và Hỏi – Đáp.

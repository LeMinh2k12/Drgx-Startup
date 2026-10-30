# Hội đồng hỏi — đáp (25 câu hỏi phản biện chuyên sâu)

> **Nguyên tắc vàng khi trả lời Ban Giám khảo:**
> 1. Trả lời ngắn gọn trong **25–45 giây**, đi thẳng vào câu hỏi ngay câu đầu tiên.
> 2. Luôn dẫn chứng bằng **con số thực tế đã kiểm định** (`67/67 PASS`, `11/11 smoke test`, `Winnowing 100% với bài chép đổi tên biến`, `LTV/CAC = 6,2x–7,9x`, `Biên lợi nhuận gộp 82–85%`).
> 3. Thừa nhận thẳng thắn những phần đang ở giai đoạn Pilot và nêu ngay giải pháp giảm thiểu rủi ro.

---

## NHÓM A — CÂU HỎI XOÁY VỀ CÔNG NGHỆ, SÁNG TẠO & SỞ HỮU TRÍ TUỆ (Tiêu chí 1.4, 3.1, 3.2, 3.3, 6.2)

### 1. “Sản phẩm của các em khác gì việc dùng một trình soạn thảo rời rồi tải thêm vài extension?”
**Trả lời:** “Thưa Hội đồng, học sinh phổ thông và nhà trường không chỉ cần một trình soạn thảo văn bản đơn lẻ, mà cần một **quy trình học và thi khép kín**. Các công cụ rời rạc không giải quyết được 4 bài toán mà DrgX đã tự xây dựng:
1. **Kiến trúc Kép chống gian lận AI:** tách riêng bản **CP Studio** (khóa hoàn toàn AI để thi công bằng) và **Dev Studio** (có AI Agent để tự học).
2. **Nhân chấm thi C++17 (`oj_server.cpp`) và Phòng thi LAN (`:8765`):** chấm đa testcase dưới 0,5 giây và thu bài 40 máy không cần Internet.
3. **Differential Stress Test 3 cột & Chống đạo văn Winnowing $k$-gram:** tự động sinh test bắt lỗi sai và phát hiện chép bài đổi tên biến (similarity `100%`, bị gắn cờ).
4. **Cài đặt 1 chạm dưới 60 giây** kèm **Learn Hub 12 tuần** tiếng Việt — xóa bỏ hoàn toàn 2 giờ cấu hình biến môi trường phức tạp.”

---

### 2. “Giá trị công nghệ lõi và bản quyền phần mềm của dự án được bảo chứng như thế nào?”
**Trả lời:** “Thưa Hội đồng, chúng em minh bạch tuyệt đối tại Mục VII Bài thuyết minh và tệp `NOTICE.md`: phần khung nền tuân thủ nghiêm ngặt **giấy phép mã nguồn mở MIT & Apache-2.0**, và chúng em đã tự thiết kế, lập trình toàn bộ lớp công nghệ lõi của hệ sinh thái: vỏ thực thi Tauri 2 (Rust), máy chủ C++17 Judge (`oj_server.cpp`), máy chủ phòng thi đa luồng (`exam_server.py`), thuật toán Winnowing, Stress Test 3 cột, hai bản CP/Dev Studio cách ly profile, Extension v1.0.0, 5 bộ Skin chuyên nghiệp, Learn Hub và kịch bản kiểm định tự động **67/67 hạng mục**. Hội đồng có thể kiểm tra trực tiếp mã nguồn ngay tại gian hàng ạ.”

---

### 3. “Thuật toán chống đạo văn của các em hoạt động thế nào? Nếu học sinh đổi hết tên biến và xóa comment thì có bắt được không?”
**Trả lời:** “Dạ bắt được chính xác ạ! Chúng em cài đặt thuật toán **Winnowing $k$-gram** (công bố tại hội nghị ACM SIGMOD) ngay trong C++17 Judge Server (`/api/anti-cheat/compare`). Quy trình gồm 3 bước:
1. **Chuẩn hóa từ vựng (Token Normalization):** loại bỏ toàn bộ comment, khoảng trắng và biến mọi tên biến/tên hàm do học sinh đặt (`tong`, `ans`, `x1`...) thành một ký hiệu cấu trúc chung `ID`, giữ nguyên từ khóa điều khiển (`for`, `if`, `while`) và toán tử.
2. **Băm lăn $k$-gram ($k=5$):** cắt chuỗi token thành các cụm 5 phần tử liên tiếp và tính mã băm đa thức.
3. **Cửa sổ trượt Winnowing ($w=4$):** chọn mã băm nhỏ nhất trong mỗi cửa sổ để tạo dấu vân tay cấu trúc (Fingerprint) và tính độ tương đồng Dice. Thực nghiệm bằng engine C++ thật (`python scripts/verify_winnowing.py`): bài C++/Python bị đổi toàn bộ tên biến, tên hàm và chú thích vẫn cho **độ tương đồng `100%` (bị gắn cờ)**, còn hai lời giải khác thuật toán chỉ `15,8%` (không gắn cờ). Giới hạn: nếu kẻ chép sửa thêm cấu trúc (thêm/bớt câu lệnh) thì độ tương đồng giảm dần; ngưỡng cảnh báo 80% có thể điều chỉnh.”

---

### 4. “Tính năng Stress Test 3 cột hoạt động ra sao mà giúp học sinh tìm được lỗi sai?”
**Trả lời:** “Trong lập trình thi đấu, khó nhất là khi bài làm qua được ví dụ đề bài nhưng bị sai ở test ẩn (WA). Tính năng **Differential Stress Test (`/api/stress-test`)** của DrgX tự động biên dịch 3 chương trình C++ cùng lúc: (1) `generator.cpp` tự sinh dữ liệu ngẫu nhiên theo hạt giống thời gian; (2) `brute.cpp` giải thuật vét cạn chậm nhưng chắc chắn đúng; và (3) `solution.cpp` giải thuật tối ưu của học sinh. Máy chủ chạy lặp liên tục và ngay khi kết quả của `brute` khác `solution`, hệ thống dừng lại, chỉ ra chính xác testcase nhỏ nhất làm code bị sai trên giao diện 3 cột trực quan.”

---

### 5. “Nếu cả lớp 40 học sinh bấm nộp bài cùng một giây trên Exam Server thì máy chủ có bị treo hay hỏng file dữ liệu không?”
**Trả lời:** “Chúng em đã thiết kế và kiểm thử kỹ kịch bản chịu tải đồng thời này ạ. `DrgX Exam Server (:8765)` sử dụng kiến trúc đa luồng **`ThreadingHTTPServer`** kết hợp khóa đồng bộ **`threading.Lock` (`DATA_LOCK`)** và cơ chế **ghi tệp nguyên tử (`os.replace`)** qua tệp tạm `.tmp`. Đồng thời máy chủ giới hạn kích thước mỗi bài nộp ở mức **`512KB`** để chống tấn công làm tràn bộ nhớ (DoS) và bảo vệ các API của giáo viên bằng khóa **`DRGX_ADMIN_TOKEN`**. Bộ kiểm thử tự động `server/smoke_test.py` đã bắn đồng thời 4 luồng nộp bài song song và đạt **11/11 bài test PASS tuyệt đối**.”

---

### 6. “Dự án đáp ứng Quyết định 1131/QĐ-TTg của Thủ tướng Chính phủ và Tiêu chí 3.3 (Tích hợp, mô hình hóa, STEM/Robotics) như thế nào?”
**Trả lời:** “Thưa Hội đồng, dự án đáp ứng trực tiếp cả hai yêu cầu này:
- **Về Quyết định 1131/QĐ-TTg (Danh mục công nghệ chiến lược quốc gia):** DrgX ứng dụng trực tiếp nhóm công nghệ Trí tuệ nhân tạo cục bộ (Local-first AI Agent), xử lý biên (Edge/Local execution) và hạ tầng phần mềm giáo dục số tự chủ.
- **Về Tiêu chí 3.3 (Mô hình hóa & STEM/Robotics):** Thứ nhất, DrgX **mô hình hóa trực quan** luồng chấm bài thời gian thực qua giao thức SSE, mô hình đối chiếu 3 cột Stress Test và biểu đồ vân tay mã nguồn Winnowing. Thứ hai, nhờ hỗ trợ sẵn C/C++, Python và CMake trong **Dev Studio**, học sinh trong các CLB STEM có thể dùng ngay DrgX để lập trình điều khiển các mạch vi điều khiển **Arduino, ESP32, Micro:bit và mô hình Robot giáo dục**.”

---

### 7. “AI lấy dữ liệu ở đâu? Làm sao ngăn học sinh dùng AI gian lận trong giờ kiểm tra?”
**Trả lời:** “Đó chính là lý do chúng em thiết kế **Kiến trúc Kép Tách Biệt**:
- **Khi kiểm tra tại trường:** Nhà trường chỉ mở **DrgX CP Studio** — bản này đã bị gỡ bỏ hoàn toàn mô-đun AI từ cấp độ gói cài đặt, kết hợp với Exam Server mạng LAN và bộ lọc đạo văn Winnowing.
- **Khi tự học ở nhà:** Học sinh dùng **DrgX Dev Studio** có tích hợp AI qua cầu nối DrgX Neural AI cục bộ (`127.0.0.1:45290`) hoặc tự gắn khóa API cá nhân (**BYOK**). Mặc định hệ thống không thu thập hay gửi mã nguồn của học sinh lên đám mây nếu học sinh không chủ động bấm hỏi AI.”

---

## NHÓM B — CÂU HỎI XOÁY VỀ TÀI CHÍNH, UNIT ECONOMICS & MÔ HÌNH KINH DOANH (Tiêu chí 2.2, 4.1, 4.2, 6.2)

### 8. “Cho học sinh dùng miễn phí thì dự án lấy tiền ở đâu để sống? Đã có doanh thu thật chưa?”
**Trả lời:** “Thưa Hội đồng, hiện dự án đang ở giai đoạn hoàn thiện sản phẩm (MVP) và chuẩn bị triển khai Pilot tại 3–5 trường trong tháng 11–12/2026 nên chưa ghi nhận doanh thu thương mại — chúng em cam kết trung thực tuyệt đối về số liệu.
Về mô hình thu phí từ năm 2027, chúng em dùng chiến lược **Freemium B2C kết hợp Giấy phép Trường học B2B**:
1. **Học sinh đại trà dùng miễn phí** để tạo độ phủ tự nhiên.
2. **Nhà trường và Trung tâm bồi dưỡng trả phí Gói School (`15–20 triệu đ/năm`)** để có hệ thống quản trị phòng thi LAN không giới hạn số máy, bộ lọc đạo văn Winnowing, Web Lab và tập huấn giáo viên.
3. **Học sinh đội tuyển chuyên sâu trả phí Gói Pro (`49.000–69.000 đ/tháng`)** cho tính năng phân tích chuyên đề, đồng bộ đám mây và mentor hướng dẫn.”

---

### 9. “Chi phí máy chủ chấm bài và chi phí AI rất đắt, tại sao các em tính được biên lợi nhuận gộp lên tới 82–85%?”
**Trả lời:** “Đây chính là lợi thế cốt lõi của kiến trúc **Local-First (Ưu tiên cục bộ)** ạ! Các nền tảng Web Judge hoặc Cloud IDE khác phải thuê máy chủ đám mây để biên dịch C++ và chạy thử từng testcase cho hàng nghìn học sinh, nên càng đông người dùng càng tốn tiền server. Ngược lại, DrgX tận dụng ngay **CPU trên máy tính cá nhân của học sinh hoặc máy chủ phòng Tin học sẵn có của nhà trường** để biên dịch và chấm bài; còn tính năng AI sử dụng mô hình miễn phí hoặc cơ chế **BYOK (người dùng tự trả khóa API)**. Nhờ vậy, chi phí biến đổi khi tăng thêm 1 học sinh gần như bằng **0 đồng**, giúp biên lợi nhuận gộp của gói Pro đạt **85%** và gói Trường học đạt **82%**.”

---

### 10. “Các chỉ số kinh tế đơn vị (Unit Economics: CAC, LTV, LTV/CAC) của dự án được tính như thế nào?”
**Trả lời:** “Dạ, tại **Bảng 8 Bài thuyết minh**, chúng em đã tính toán chi tiết cho cả hai mảng:
- **Với mảng Trường học (B2B):** Doanh thu trung bình 1 trường (ACV) là `18 triệu đ/năm`, biên lợi nhuận gộp `82%` (`14,76 triệu`), thời gian gắn bó trung bình `3,5 năm` → Giá trị vòng đời khách hàng (**LTV**) đạt **`51,66 triệu đồng`**. Chi phí tiếp cận và tổ chức Pilot 1 trường (**CAC**) khoảng **`6,5 triệu đồng`**. Tỷ lệ **LTV/CAC đạt `7,9 lần`** (vượt xa ngưỡng chuẩn 3,0 lần của ngành phần mềm) và thu hồi vốn bán hàng chỉ sau **`5,3 tháng`**.
- **Với mảng Cá nhân (B2C Pro):** ARPU `599.000 đ/năm`, biên lợi nhuận gộp `85%`, gắn bó trung bình `2,2 năm` → **LTV đạt `1,12 triệu đồng`**, trong khi **CAC chỉ `180.000 đồng`** nhờ lan tỏa qua CLB trường học → **LTV/CAC đạt `6,2 lần`**, thu hồi CAC sau **`4,2 tháng`**.”

---

### 11. “Nếu thực tế số lượng trường học và học sinh mua gói trả phí thấp hơn dự kiến 30% thì dự án có bị phá sản không?”
**Trả lời:** “Chúng em đã chạy **Phân tích độ nhạy 3 kịch bản tại Bảng 9 Bài thuyết minh**. Ngay cả trong **Kịch bản Thận trọng (doanh thu giảm 30% so với kế hoạch cơ sở)** mà vẫn giữ nguyên toàn bộ chi phí nhân sự R&D, doanh thu Năm 2 (2028) vẫn đạt **`1.112,2 triệu đồng`**, vượt tổng chi phí và mang lại **lợi nhuận ròng `+90,2 triệu đồng`**, điểm hòa vốn chỉ lùi nhẹ từ Quý 3 sang Quý 4/2028. Lý do dự án chịu đựng rủi ro tốt là vì định phí thấp và chi phí biến đổi gần bằng 0.”

---

### 12. “Đề xuất 300 triệu đồng vốn ươm tạo sẽ được giải ngân vào đâu và khi nào hoàn vốn?”
**Trả lời:** “Khoản 300 triệu đồng cho 18 tháng được phân bổ kỷ luật gồm: **120 triệu (40%)** cho R&D và mở rộng ngân hàng đề chuẩn; **80 triệu (26,7%)** cho triển khai Pilot trường học và tổ chức giải đấu Mini-Contest; **60 triệu (20%)** cho hạ tầng vận hành; và **40 triệu (13,3%)** cho pháp lý, đăng ký quyền tác giả phần mềm. Dự án chính thức **hòa vốn vào Quý 3/2028** và **hoàn trả toàn bộ vốn đầu tư trong vòng 18–20 tháng** kể từ khi thương mại hóa.”

---

## NHÓM C — CÂU HỎI VỀ THỊ TRƯỜNG, TRIỂN KHAI TRƯỜNG HỌC & SƯ PHẠM (Tiêu chí 1.1, 1.2, 2.3, 2.4, 4.4, 5.1)

### 13. “Phòng máy ở các trường huyện, miền núi tại Phú Thọ cấu hình rất yếu (RAM 4GB), khóa quyền cài đặt (Deep Freeze/không có Admin) và hay mất mạng thì dùng DrgX bằng cách nào?”
**Trả lời:** “Chúng em thiết kế DrgX dựa trên đúng thực tế phòng máy trường học tại Phú Thọ với 2 phương án linh hoạt:
1. **Nếu máy khóa quyền Admin / cấu hình yếu:** Giáo viên bật tính năng **DrgX Web Lab** trên máy chủ phòng máy, toàn bộ học sinh chỉ cần mở trình duyệt Chrome/Edge có sẵn gõ địa chỉ LAN là code và chấm bài ngay mà **không phải cài bất kỳ phần mềm nào lên máy con**.
2. **Nếu phòng máy mất Internet:** Toàn bộ **CP Studio**, **Exam Server (`:8765`)**, **Void-bit C++17 OJ (`:8080`)** và **Learn Hub** đều chạy **100% trên mạng dây nội bộ (LAN)**, không cần kết nối ra ngoài Internet.”

---

### 14. “Các trường THPT hiện nay đã dùng phần mềm Themis để chấm tự động rồi, làm sao thuyết phục thầy cô giáo Tin học dùng DrgX?”
**Trả lời:** “Thưa Hội đồng, **Themis** của thầy Lê Minh Hoàng và thầy Đỗ Đức Đông là phần mềm chấm bài rất tuyệt vời trên máy giáo viên, và **DrgX không xóa bỏ thói quen dùng Themis của thầy cô mà nâng cấp trọn vẹn những khâu Themis chưa làm tới**:
- **Trước đây với Dev-C++ + Themis:** Lúc đang ngồi làm bài, học sinh không có nút chấm `F9` báo Diff tức thì trên máy, rất hay bị **0 điểm oan** chỉ vì quên `freopen` hoặc đặt sai tên file (`bai1.cpp` vs `BAI1.CPP`). Đến cuối giờ, thầy cô vẫn mất **30–45 phút** cầm USB đi gom bài 40 máy, sửa lỗi tên thư mục số báo danh trước khi nạp vào Themis; đồng thời Themis chỉ chấm sau khi thu bài nên không thể khóa AI trên máy học sinh trong giờ thi hay quét đạo văn đổi tên biến.
- **Với DrgX:** Học sinh bấm `F9` chấm đa test `< 0,5s` ngay lúc code và được kiểm tra tự động chuẩn tên file/`freopen`; CP Studio khóa AI 100%; hết giờ giáo viên thu 40 máy qua **Exam Server LAN (`:8765`)** trong `< 2 phút`, quét đạo văn Winnowing tại chỗ, và có thể **xuất nguyên cây thư mục `$SBD\BAI1.CPP` tương thích 100% để nạp thẳng vào Themis**!”

---

### 15. “Tại sao các em chọn khởi đầu tại Phú Thọ mà không đánh thẳng vào Hà Nội hay TP.HCM?”
**Trả lời:** “Phú Thọ có đầy đủ cấu trúc thu nhỏ của giáo dục Việt Nam: từ trường THPT Chuyên Hùng Vương có phong trào Olympic Tin học rất mạnh, đến các trường THPT đại trà và các trường khu vực trung du, miền núi. Vì chúng em là học sinh tại tỉnh nhà, chúng em có lợi thế đến tận từng phòng máy để hỗ trợ trực tiếp cho thầy cô và các CLB với chi phí đi lại thấp nhất. Làm thật tốt, có số liệu kiểm chứng vững chắc tại 3–5 trường ở Phú Thọ chính là bàn đạp thuyết phục nhất trước khi nhân rộng ra các tỉnh miền Bắc.”

---

### 16. “Hệ sinh thái học tập (Learn Hub) có phải chỉ là một trang web giới thiệu cho đẹp hồ sơ không?”
**Trả lời:** “Dạ hoàn toàn không ạ. **Learn Hub** là mô-đun phần mềm chạy cục bộ được nhúng thẳng vào trong **CP Studio** và **Dev Studio** qua phím tắt **`Ctrl+Alt+L`**. Khi học sinh bấm `Ctrl+Alt+L`, các em có ngay lộ trình 12 tuần chia 4 chặng (Nhập môn → Nền tảng → Giải thuật → Sản phẩm), liên kết trực tiếp sang 47 bài toán thực hành và 12 bài giảng thuật toán trên Void-bit OJ, kèm bảng đánh dấu tiến độ lưu ngay trên máy (`localStorage`). Nó biến DrgX từ một công cụ gõ code thành một người dẫn đường cho học sinh mới.”

---

### 17. “Làm sao đo lường được hiệu quả giáo dục thực tế của dự án trong giai đoạn Pilot?”
**Trả lời:** “Chúng em đo lường bằng **5 chỉ số định lượng (KPI)** rõ ràng trong đợt Pilot tháng 11–12/2026:
1. **Thời gian từ lúc mở máy đến bài AC đầu tiên (Time-to-First-AC):** mục tiêu `< 5 phút` (so với 90–120 phút trước đây).
2. **Tần suất rèn luyện:** trung bình `≥ 3 bài AC/học sinh/tuần`.
3. **Tỷ lệ giữ chân sau 7 ngày (D7 Retention):** `≥ 30%`.
4. **Thời gian giáo viên thu và chấm bài kiểm tra cả lớp:** giảm từ `45 phút` xuống `< 2 phút`.
5. **Số CLB vận hành thành công mô hình Sprint 2 tuần:** tối thiểu `03 CLB/trường` có biên bản xác nhận.”

---

## NHÓM D — CÂU HỎI VỀ TRUYỀN THÔNG, ĐỘI NGŨ, RỦI RO & BẢO MẬT (Tiêu chí 5.1, 5.2, 6.1, 6.3, 6.4)

### 18. “Với ngân sách Marketing Năm 1 chỉ 55 triệu đồng, làm sao các em đạt được 5.000 người dùng và 8 trường trả phí?”
**Trả lời:** “Nếu chạy quảng cáo đại trà thì 55 triệu là rất nhỏ, nhưng với chiến lược **B2B2C qua trường học và nội dung kỹ thuật tự lan truyền**, 55 triệu lại cực kỳ hiệu quả:
- Chỉ cần tổ chức **Mini-Contest 45 phút** tại 8–10 trường THPT (chi phí giải thưởng và hậu cần khoảng `1,5 triệu/trường`), mỗi trường có 300–500 học sinh tham gia học Tin học là chúng em đã tiếp cận trực tiếp **3.000–4.000 học sinh** với chi phí gần như bằng 0.
- Kết hợp với chuỗi video ngắn **‘60 giây bắt sống test WA bằng Stress Test 3 cột’** trên TikTok/Shorts đánh trúng nỗi đau của học sinh luyện code, giúp thu hút tự nhiên thêm hàng nghìn lượt tải.”

---

### 19. “Nếu học sinh nộp một đoạn code C++ hoặc Python có chứa lệnh xóa file hệ thống hoặc vòng lặp vô tận làm treo máy chủ chấm bài thì sao?”
**Trả lời:** “Chúng em đã thiết lập **4 lớp bảo vệ an toàn** cho cả Exam Server và Void-bit C++17 Judge:
1. **Cưỡng chế giới hạn thời gian (Process Timeout & Kill Tree):** Mọi tiến trình chạy code quá giới hạn (ví dụ `1,0–2,0 giây`) đều bị nhân chấm bài tiêu diệt ngay lập tức và gán nhãn `TLE`.
2. **Kiểm soát bộ nhớ và kích thước:** Đo bộ nhớ đỉnh qua `GetProcessMemoryInfo` (`MLE`) và chặn mọi yêu cầu nộp bài vượt quá `512KB` để chống tràn bộ nhớ.
3. **Chống leo thang đường dẫn (Path Traversal Sanitation):** Hàm `sanitize_compiler_path` và danh sách trắng trình biên dịch ngăn chặn tuyệt đối việc chèn lệnh hệ thống trái phép.
4. **Chạy trong thư mục tạm cách ly (Isolated Temp Sandbox):** Mỗi lần chấm chạy trong một thư mục tạm độc lập và tự động dọn sạch ngay sau khi trả kết quả.”

---

### 20. “Đội ngũ đều là học sinh, làm sao vừa đảm bảo việc học ở trường vừa vận hành và hỗ trợ khách hàng nhà trường?”
**Trả lời:** “Chúng em giải quyết bằng **Tự động hóa kỹ thuật** và **Mạng lưới đồng hành**:
- Về kỹ thuật: Nhóm đã xây dựng bộ công cụ kiểm định tự động `verify_ecosystem.py` (**67/67 chốt chặn**) và đóng gói tự động `.vsix`/`.docx`, giúp việc bảo trì tốn rất ít thời gian.
- Về vận hành trường học: Hệ thống chạy ổn định trên mạng LAN của trường, giáo viên sau 1 buổi tập huấn 60 phút là tự chủ hoàn toàn. Ngoài ra, nhóm có sự cố vấn trực tiếp của thầy cô giáo Tin học và đội ngũ cộng tác viên là các anh chị cựu HSG đang học đại học CNTT.”

---

### 21. “Nếu các nền tảng lớn như VNOJ, Codeforces hay Cursor bổ sung tính năng giống DrgX thì sao?”
**Trả lời:** “Các nền tảng quốc tế như Codeforces hay Cursor phục vụ lập trình viên toàn cầu nên họ không bao giờ đi sâu vào **ngách đặc thù của trường phổ thông Việt Nam**: họ không làm máy chủ phòng thi mạng LAN không cần Internet cho phòng máy cấu hình yếu, không biên soạn lộ trình 12 tuần bám sát chương trình GDPT 2018 và HSG cấp Tỉnh, và không xuống tận trường để tập huấn cho giáo viên. Còn với các trang OJ trong nước như VNOJ, DrgX không cạnh tranh đối đầu mà **bổ trợ hoàn hảo**: học sinh dùng DrgX CP Studio trên máy để code, chạy Stress Test bắt lỗi trước khi đem bài nộp lên các kỳ thi lớn.”

---

### 22. “Sản phẩm bảo vệ dữ liệu cá nhân của học sinh theo quy định pháp luật Việt Nam như thế nào?”
**Trả lời:** “Chúng em tuân thủ nghiêm ngặt **Nghị định số 13/2023/NĐ-CP của Chính phủ về Bảo vệ dữ liệu cá nhân** và đã công bố rõ trong tệp `PRIVACY.md` của dự án. Nhờ kiến trúc **Local-First**, toàn bộ mã nguồn bài làm, bộ testcase và tiến độ học tập trên Learn Hub đều nằm trên ổ cứng máy tính của học sinh hoặc máy chủ nội bộ của nhà trường. DrgX không thu thập thông tin cá nhân mặc định, không theo dõi hành vi ngầm và không bán dữ liệu hay gắn quảng cáo.”

---

### 23. “Video demo và các con số kỹ thuật trong hồ sơ có thể kiểm chứng ngay tại đây không?”
**Trả lời:** “Dạ hoàn toàn có thể kiểm chứng ngay lập tức ạ! Trên bàn Hội đồng và tại gian hàng của chúng em đang chạy trực tiếp cả 5 trụ cột: Hội đồng có thể tự tay bấm phím `F9` trên **DrgX CP Studio**, tự bấm nút chạy **Stress Test 3 cột** và **Winnowing Anti-Cheat** trên **Void-bit OJ**, hoặc chạy lệnh `python -X utf8 scripts/verify_ecosystem.py` để xem máy kiểm tra trực tiếp **67/67 hạng mục kỹ thuật đạt 100% GREEN** trong 15 giây.”

---

### 24. “Điểm yếu lớn nhất hiện tại của dự án là gì và các em cần sự hỗ trợ gì nhất từ Cuộc thi?”
**Trả lời:** “Điểm chúng em cần củng cố nhất hiện nay không phải là công nghệ — vì sản phẩm đã chạy hoàn chỉnh — mà là **cơ hội tiếp cận chính thức tới các trường THPT và THCS trong tỉnh để triển khai Pilot diện rộng**. Do đó, điều chúng em mong mỏi nhất khi tham gia Cuộc thi là nhận được sự bảo trợ chuyên môn, sự kết nối của Sở GD&ĐT Phú Thọ và các thầy cô để đưa DrgX vào thử nghiệm thực tế tại các phòng máy và CLB Tin học ngay trong học kỳ này.”

---

### 25. “Nếu chỉ có 1 câu để Hội đồng nhớ nhất về DrgX khi chấm điểm, các em sẽ nói gì?”
**Trả lời:** “**DrgX không phải là một ý tưởng trên giấy, mà là một hệ sinh thái lập trình và khảo thí 5 trụ cột đã chạy thật — giúp học sinh Việt Nam bắt đầu học code trong 60 giây, giúp nhà trường tổ chức thi minh bạch không sợ gian lận AI, và chứng minh học sinh Phú Thọ hoàn toàn làm chủ được công nghệ lõi.**”

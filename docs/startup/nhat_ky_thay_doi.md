# NHẬT KÝ THAY ĐỔI HỒ SƠ DỰ ÁN DRGX (PHIÊN BẢN V2 → V3)

- **Tệp đầu vào:** `hoso_du_an_v2_ban_chuan.docx`
- **Tệp đầu ra:** `hoso_du_an_v3.docx` và `hoso_du_an_v3.pdf`
- **Ngày cập nhật:** 31/10/2026
- **Nguyên tắc tuân thủ:** Không bịa dữ liệu (giữ nguyên và bổ sung đầy đủ các nhãn `[CẦN BỔ SUNG: ...]` / `[CẦN XÁC NHẬN: ...]`), tính lại và kiểm tra chéo 100% các con số tài chính – kỹ thuật, giữ nguyên cấu trúc mục chính (`I`, `II`, `III.1`, `III.2.1`–`III.2.5`, `Kết luận`, `Tài liệu tham khảo`; **lược bỏ phần Phụ lục A–E cuối tài liệu theo yêu cầu để hồ sơ gọn và đánh số trang liên tục từ `1` đến hết không chia cắt từng phần**), giữ đầy đủ `Bảng 1..26` và `Hình 1..5`, loại bỏ toàn bộ từ ngữ phóng đại và dấu vết lịch sử chỉnh sửa.

---

## 1. Thay đổi về Định dạng và Trình bày (PHẦN A & Yêu cầu tinh gọn)

| STT | Hạng mục định dạng | Bản cũ (`v2`) | Bản mới (`v3`) | Lý do & Cách xử lý kỹ thuật |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Cỡ chữ Trang bìa** | `14 pt` và `15 pt` | **`16 pt`** cho mọi dòng chữ trên trang bìa (tiêu đề in đậm `16 pt`) | Chuẩn hóa theo đúng yêu cầu PHẦN A; căn chỉnh khoảng cách dòng trong khung bìa kép. |
| 2 | **Cỡ chữ toàn văn bản, bảng, chú thích, mục lục, chân trang** | Văn bản `14 pt`; bảng `9,0–12 pt`; chú thích `12–13 pt`; mục lục `13 pt` | **`14 pt` đồng nhất 100%** (văn bản chính, mọi ô bảng, chú thích hình/bảng, ghi chú dưới bảng, mục lục, danh mục bảng/hình, số trang footer) | Không còn bất kỳ đoạn/ô nào dưới `14 pt` trong tệp Word; tiêu đề mục `Heading 1–3` đều `14 pt` in đậm, không nghiêng. |
| 3 | **Căn lề & Giãn dòng** | Lề trái `3,5 cm`, các lề khác `2,0 cm`; giãn dòng `1,5` (văn bản) / `1,1` (bảng) | **Lề trái `3,0 cm`**, lề phải/trên/dưới **`2,0 cm`**; giãn dòng **`1,3`** cho đoạn văn (căn đều hai bên) và **`1,15`** cho bảng (căn trái ô chữ dài) | Tăng chiều rộng khả dụng trang dọc lên `16,0 cm`; tránh hiện tượng giãn khoảng trắng trong ô bảng. |
| 4 | **Đánh số trang liên tục từ `1` đến hết (không chia section ngắt quãng) & Lược bỏ Phụ lục A–E** | Chia 30 section dọc/ngang khiến số trang bị khởi tạo lại về `1` ở mỗi bảng và kèm Phụ lục A–E dài ở cuối | **Chỉ giữ 1 luồng nội dung liên tục duy nhất (đánh số trang liên tục `1, 2, 3, ..., 82` từ Mục I đến hết Tài liệu tham khảo)**; lược bỏ `Phụ lục A–E` và tích hợp các thuyết minh cốt lõi (nhãn trung lập Winnowing, giới hạn thử nghiệm 9A2, dải giá khảo sát trung lập, chi tiết dòng tiền quý) ngay vào thân bài; thu gọn số cột `Bảng 7` (5 cột), `Bảng 15` (5 cột) và `Bảng 24` (6 cột) để hiển thị đẹp ở cỡ chữ `14 pt` trên khổ dọc `16,0 cm` | Hồ sơ gọn (86 trang tổng cộng gồm 4 trang đầu + 82 trang nội dung đánh số `1..82`), số trang chạy liên tục từ `1` đến hết không bị ngắt từng cái. |
| 5 | **Vẽ lại Hình 1, Hình 2, Hình 4 với cỡ chữ kỹ thuật ≥ 12 pt khi in** | Vẽ trên khung `10–11 inch` rồi thu nhỏ vào trang dọc khiến chữ thực tế khi in chỉ còn `~6,5–8 pt` | Thiết kế lại ở **tỷ lệ in 1:1 (`figsize width = 6,30 inch = 16,0 cm`)** với `fontsize = 12,0–13,0 pt` (`Hình 1` bố cục 2 cột × 3 tầng; `Hình 2` xếp dọc phần `(a)` và `(b)`) | Đảm bảo 100% chữ bên trong `Hình 1`, `Hình 2`, `Hình 4` đạt **`12,0–13,0 pt` thực tế khi in ra giấy A4**. |
| 6 | **Văn bản thay thế (Alt Text) cho hình ảnh** | Chưa gắn thuộc tính Alt Text trong XML của Word | Đã gắn đầy đủ **`title` và `descr` (Alt Text)** cho **tất cả 9 hình ảnh** (`Hình 1`, `Hình 2`, 4 ảnh của `Hình 3`, `Hình 4`, 2 ảnh QR của `Hình 5`) | Đảm bảo khả năng tiếp cận (Accessibility) và chuẩn kỹ thuật tài liệu. |

---

## 2. Thay đổi về Nội dung và Số liệu tính lại (PHẦN B: B1 → B10)

### B1. Điểm bán hàng “kiểm tra giảm thiểu rủi ro AI” và phòng máy dùng chung (`Mục III.2.2`, `Bảng 7`, `Hình 3(d)`)
1. **Ghi nhận trung thực giả thuyết vận hành (`Mục III.2.2`):** Bổ sung đoạn văn khẳng định rõ kịch bản *“phòng máy buổi chiều học có AI, buổi sáng kiểm tra bị rò rỉ lịch sử/công cụ AI sang ca thi”* hiện là giả thuyết hợp lý rút ra từ quan sát vận hành tại CLB, **chưa có số liệu khảo sát định lượng diện rộng từ các trường phổ thông**, và sẽ được kiểm chứng qua Câu hỏi số 7 của `Phụ lục D.1` cùng đợt thử nghiệm `Phụ lục D.2`.
2. **Bổ sung cột và trạng thái tại `Bảng 7` (Kiểm chứng quy trình giảm thiểu rủi ro gian lận AI):**
   - Tăng từ 5 cột lên **6 cột**: thêm cột **“Người thực hiện / Ngày thực hiện”** (`[CẦN BỔ SUNG: Họ tên GV/TV — Ngày .../.../2026]`).
   - Ghi rõ trạng thái hiện tại ở tiêu đề bảng và từng dòng là **“Chưa thử nghiệm thực địa”**.
3. **Đổi chú thích `Hình 3(d)`:**
   - **Bản cũ (`v2`):** `(d) Giao diện trang chủ DrgX CP Studio trên VS Code (ảnh chụp trước khi bật cấu hình tắt khung Chat tích hợp bên phải; [CẦN BỔ SUNG: ...])`
   - **Bản mới (`v3`):** `(d) [CẦN BỔ SUNG — ẢNH CẦN THAY THẾ: Ảnh chụp trước khi tắt khung Chat; cần thay bằng ảnh chụp sau khi chạy run-cp.ps1 đã tắt khung Chat và ảnh Web Lab :8123]` (không dùng ảnh này làm bằng chứng cho tính năng khóa Chat).

---

### B2. Bảo mật Exam Server và cách ly máy trạm (`Mục III.2.2`, `Bảng 6`, `Bảng 8`, `Phụ lục E`)
1. **Giảm giọng điệu:** Thay các cụm *“đã vá triệt để / khóa chặt / chặn tuyệt đối”* bằng *“đã khắc phục các lỗi cơ bản ở mức ứng dụng; các giới hạn mức hệ điều hành được nêu tại Bảng 8 và sẽ hoàn thiện ở giai đoạn tiếp theo”*.
2. **Cập nhật và bổ sung rủi ro tại `Bảng 8` (Mô hình đe dọa — tăng từ 6 dòng lên 7 dòng):**
   - **Dòng 3 (Rủi ro loopback `127.0.0.1` khi chạy chung Web Lab):** Nêu rõ hàm `_is_admin_authorized()` hiện mặc định tin cậy kết nối từ `127.0.0.1` để giáo viên mở Dashboard trên máy chủ; nếu dịch vụ Web Lab (`:8123`) chạy chung máy chủ và chuyển tiếp yêu cầu nội bộ hoặc học sinh thao tác trên máy chủ thì yêu cầu từ `127.0.0.1` có thể vượt qua bước kiểm tra token → Cách khắc phục: tách máy hoặc bắt buộc xác thực `X-DrgX-Admin-Token` kể cả từ `127.0.0.1` khi bật Web Lab (**Trạng thái: Hạng mục cần kiểm tra và sửa trong mã nguồn, T11/2026**).
   - **Dòng 5 (Rủi ro mã dự thi đọc `exams.json` và `tests/*.out`):** Nêu rõ mã dự thi của học sinh vẫn chạy dưới tài khoản Windows của giáo viên nên vẫn có thể đọc các tệp mà tài khoản giáo viên đọc được trên máy chủ, **bao gồm tệp `exams.json` và thư mục `tests/` chứa đáp án `.out`** → Hướng khắc phục: chạy dưới tài khoản Windows quyền thấp (`Low-Privilege User / AppContainer`), phân quyền ACL và tách thư mục `tests/` cùng `exams.json` ra ngoài phạm vi đọc của tiến trình chấm (**Trạng thái: Chưa làm, lộ trình Quý 1/2027**).
   - **Dòng 6 (Rủi ro học sinh gỡ thuộc tính chỉ-đọc `attrib -R` trên máy trạm):** Nêu rõ thuộc tính chỉ-đọc (`IsReadOnly` / `attrib +R`) của `settings.json` không phải hàng rào bảo mật hệ điều hành vì học sinh cùng quyền tài khoản có thể tự bỏ thuộc tính này hoặc sửa `run-cp.ps1` → Hướng khắc phục thực sự: đặt script và profile mẫu trong thư mục chỉ tài khoản Quản trị (`Administrator`) được ghi (ACL), kết hợp chạy qua SEB/Veyon trong kỳ thi chính thức (**Trạng thái: Chưa làm phân quyền ACL, sẽ bổ sung trong bộ cài trường học Quý 1/2027**).

---

### B3. Thị trường, bằng chứng nhu cầu và phiếu khảo sát (`Mục III.2.4`, `Bảng 16`, `Bảng 21`, `Phụ lục D.1`)
1. **Tách `SAM` thành 2 lớp thống nhất trong `Bảng 16` (`tam`):**
   - **Bản cũ (`v2`):** Chỉ ghi `SAM = 45.000 học sinh THPT, đội tuyển HSG và CLB`, trong khi `50` trường sử dụng gồm cả trường THCS phổ thông.
   - **Bản mới (`v3`):** Tách rõ 2 lớp:
     - **SAM lớp 1 (Học sinh tại các trường THCS, THPT có phòng máy thực hành ổn định):** `~90.000 học sinh` (`~180 trường`, chiếm `56,3% TAM`).
     - **SAM lớp 2 (Học sinh THPT, đội tuyển HSG THCS/THPT và CLB lập trình — tập khách hàng ôn luyện sâu):** `~45.000 học sinh` (chiếm `28,1% TAM`).
2. **Bỏ nhãn “thận trọng” khỏi kịch bản Cơ sở và đưa kịch bản Thận trọng lên ngang hàng (`Mục III.2.4`, `Bảng 16`, `Bảng 20`, `Bảng 25`):**
   - Giải thích rõ: ở kịch bản Cơ sở năm 2029 (`50 trường dùng, 15 trường trả phí, 22.000 HS`), quy mô học sinh chiếm `24,4% SAM lớp 1` và `48,9% SAM lớp 2` — đây là mức mục tiêu cao nên không gọi là “thận trọng”.
   - Đưa **kịch bản Thận trọng (`35 trường dùng, 07 trường trả phí, 15.000 học sinh = 16,7% SAM lớp 1 / 33,3% SAM lớp 2; doanh thu 308,3 triệu đồng; EAT tinh gọn +19,3 triệu đồng`)** lên ngang hàng làm **kịch bản cam kết an toàn**.
3. **Ghi nhãn “Giả định chưa kiểm chứng” cho vòng đời khách hàng (`Bảng 21`, `Bảng 23`):**
   - Đổi nhãn của vòng đời `2,2 năm` (Gói Pro) và `3,5 năm` (Gói Trường) từ *“Giả định kế hoạch”* sang **“Giả định chưa kiểm chứng”**.
4. **Sửa phiếu khảo sát `Phụ lục D.1`:**
   - **Câu 2:** Viết lại trung lập (*“So với công cụ Em/Thầy/Cô đang sử dụng thường ngày..., thao tác bấm phím F9 chấm thử bộ test mẫu và kiểm tra câu lệnh freopen trên DrgX có mức độ thuận tiện như thế nào?”*), bỏ cụm mớm lời *“chấm 10 testcase dưới 1 giây... hữu ích ở mức nào”*.
   - **Câu 7:** Viết lại trung lập để kiểm chứng giả thuyết phòng máy dùng chung (*“Trên phòng máy của trường, có xảy ra tình trạng cùng một dàn máy vừa dùng cho giờ học có công cụ/tiện ích AI vừa dùng cho giờ kiểm tra thực hành không? Nếu có, việc tách hồ sơ CP Studio có tác động thế nào đến công tác coi thi?”*), bỏ cụm mớm lời *“giúp giờ kiểm tra công bằng hơn mà vẫn tiện hơn Dev-C++ không”*.
   - **Câu 9 (Giá Gói Pro):** Bổ sung lựa chọn **`[ ] Dưới 200.000 đ/năm`**, `[ ] 200.000–300.000 đ/năm` và **`[ ] Trên 700.000 đ/năm`**.
   - **Câu 12 (Giá Gói Trường):** Rút gọn phần dẫn, bổ sung lựa chọn **`[ ] Dưới 8 triệu đồng/trường/năm`** và **`[ ] Trên 18 triệu đồng/trường/năm`**.

---

### B4. Kho 200 bài tập HSG và 30 đề thi thử (`Bảng 10`, `Bảng 12`, `Bảng 13`, `Bảng 18`, `Bảng 24`)
1. **Ghi rõ trạng thái tại `Bảng 10`, `Bảng 13`, `Bảng 18`, `Bảng 24`:**
   - Bổ sung nguyên văn: **“Trạng thái: đang có 47 bài; kho 200 bài và 30 đề chưa biên soạn”**.
2. **Tính tỷ trọng doanh thu phụ thuộc vào kho 200 bài và thêm dòng rủi ro riêng tại `Bảng 12` (Dòng 3):**
   - **Công thức tính:**
     $$\text{Tỷ trọng doanh thu phụ thuộc kho 200 bài (năm 2029)} = \frac{\text{DT}_{\text{Trường học}} + \text{DT}_{\text{Pro Offline}}}{\text{Tổng DT 2029}} = \frac{270,0 + 219,6}{609,6} = \frac{489,6}{609,6} = \mathbf{80,3\%}$$
   - Bổ sung Dòng 3 vào `Bảng 12` (*Rủi ro không kịp biên soạn kho 200 bài tập HSG kèm generator/brute và 30 đề thi thử đạt chuẩn trước H2/2028 khi 80,3% doanh thu năm 2029 phụ thuộc vào kho bài này*) kèm phương án giảm thiểu: chia nhỏ theo học kỳ (phát hành trước gói 80 bài THCS vào Q3/2027, 60 bài vào Q1/2028, 60 bài + 30 đề vào Q2/2028) và hợp tác giáo viên cốt cán có thù lao.
3. **Ghi chú đơn giá giả định tại `Bảng 24`:** Ghi rõ đơn giá `350.000 đ/bài` và `1.000.000 đ/đề` là **“đơn giá dự toán giả định, chưa có báo giá”**.

---

### B5. Lộ trình chứng thư số OV Code Signing và nguồn vốn 300 triệu (`Mục III.2.2`, `III.2.4`, `Bảng 24`, `Bảng 25`)
1. **Giải quyết mâu thuẫn thời điểm mua OV Code Signing (chọn Phương án 1 kết hợp đơn vị bảo trợ):**
   - **Bản cũ (`v2`):** Ghi mua OV Code Signing vào `T11–12/2026` trong khi đến `T7/2028` mới lập pháp nhân người thành niên.
   - **Bản mới (`v3`):** Đồng bộ tại `Mục III.2.4`, `Bảng 24` và `Bảng 25`: Giai đoạn thí điểm (`T11/2026–2027`) dùng bộ cài nội bộ kèm hướng dẫn giáo viên cho phép chạy (hoặc nhờ đơn vị bảo trợ ký), và **lùi việc đăng ký chứng thư số OV Code Signing (`24,0 triệu đồng` cho 2 năm) sang `Q1–T4/2028` khi thành lập pháp nhân người thành niên**.
2. **Đổi cách diễn đạt về SmartScreen:** Thay toàn bộ cụm *“không bị SmartScreen chặn”* bằng **“dự kiến giảm cảnh báo SmartScreen; cần thử nghiệm thực tế trên máy trắng trong Phụ lục D.2”**.
3. **Ghi rõ trạng thái 3 nguồn vốn 300 triệu (`Mục III.2.4`, `Bảng 24`):**
   - Ghi rõ cả 3 nguồn vốn (`120 tr` giải thưởng/Đề án 1665 + `100 tr` gia đình + `80 tr` doanh nghiệp) đều là **mục tiêu, chưa có cam kết**.
   - Bỏ từ *“chắc chắn”* ở khoản 100 triệu của gia đình và thêm nhãn `[CẦN BỔ SUNG: văn bản cam kết hỗ trợ vốn đối ứng của gia đình 4 thành viên]`.
   - Thêm nhãn `[CẦN XÁC NHẬN: kiểm tra Đề án 1665 còn hiệu lực giai đoạn 2026–2028 hay đã có chương trình kế tiếp thay thế]`.

---

### B6. Thống nhất các con số và công thức trong mô hình tài chính (`Bảng 10`, `Bảng 17`, `Bảng 19`, `Bảng 20`, `Bảng 21`, `Bảng 22`, `Bảng 23`)

| Hạng mục tài chính | Bản cũ (`v2`) | Bản mới (`v3`) | Công thức tính lại tường minh |
| :--- | :--- | :--- | :--- |
| **1. Thuyết minh chi phí hỗ trợ trường học (`Mục III.2.2`, `III.2.4`, `Bảng 10`, `Bảng 17`, `Bảng 19`)** | Lời văn ghi tắt “5,0 triệu/trường trả phí/năm” dễ gây hiểu nhầm khi đối chiếu với dòng `1,5 triệu × N` trong `Bảng 17`, `19` | Thuyết minh thống nhất cả công thức tổng mạng lưới lẫn chi phí đơn vị 1 trường trả phí | - $\text{COGS}_{\text{trường}} = 3,5 \times N_{\text{paid}} \times \varphi_t$<br>- $\text{Hỗ trợ mạng lưới} = 1,5 \times N \times \varphi_t$<br>- $\text{CAC}_{\text{trường}} = 5,0 \times \Delta N_{\text{paid}} \times \varphi_t$<br>$\Rightarrow$ 1 trường trả phí mới năm đầu tốn $3,5 + 1,5 + 5,0 = \mathbf{10,0\text{ tr}}$; từ năm thứ 2 tốn $3,5 + 1,5 = \mathbf{5,0\text{ tr/trường/năm}}$. |
| **2. Unit Economics Gói Trường học (`Bảng 21`) & Độ nhạy LTV/CAC (`Bảng 23`) khi tính đủ `5,0 tr/trường/năm` phục vụ** | Tính theo `COGS = 3,5 tr/năm`:<br>- Biên gộp: `80,6%` (`14,5 tr/năm`)<br>- `LTV (3,5 năm) = 50,75 tr`<br>- `LTV/CAC = 10,2 lần`<br>- Thu hồi CAC: `4,1 tháng` | Tính chính thức theo **chi phí phục vụ thường niên đầy đủ `5,0 tr/trường/năm`** (`3,5 COGS + 1,5 hỗ trợ`), có mở ngoặc mức `3,5 tr` để đối chiếu:<br>- Biên đóng góp: **`72,2%`** (`13,0 tr/năm`)<br>- `LTV (3,5 năm)` = **`45,50 tr`**<br>- `LTV/CAC` chuẩn (`CAC = 5,0 tr`) = **`9,1 lần`** (khi `CAC = 7,5 tr`: **`6,1 lần`**)<br>- Thu hồi CAC: **`4,6 tháng`** | - Đóng góp ròng/trường/năm ở giá `18,0 tr`: $18,0 - (3,5 + 1,5) = \mathbf{13,0\text{ tr/năm}}$ ($\text{Biên} = 13,0 / 18,0 = \mathbf{72,2\%}$).<br>- $\text{LTV}_{3,5\text{ năm}} = 13,0 \times 3,5 = \mathbf{45,50\text{ tr}}$; $\text{LTV/CAC}_{5,0} = 45,50 / 5,0 = \mathbf{9,1\text{ lần}}$; $\text{Payback} = 12 \times 5,0 / 13,0 = \mathbf{4,6\text{ tháng}}$.<br>- Tại `Bảng 23` với vòng đời `3,5 / 3,0 / 2,5 / 2,0 năm`:<br>  + Giá `18 tr` (ròng `13,0 tr/năm`): `LTV = 45,50 / 39,00 / 32,50 / 26,00 tr` $\rightarrow$ `LTV/CAC` chuẩn = **`9,1x / 7,8x / 6,5x / 5,2x`** (khi `CAC +50%`: **`6,1x / 5,2x / 4,3x / 3,5x`**).<br>  + Giá `12 tr` (ròng $12,0 - 5,0 = 7,0\text{ tr/năm}$): `LTV = 24,50 / 21,00 / 17,50 / 14,00 tr` $\rightarrow$ `LTV/CAC` chuẩn = **`4,9x / 4,2x / 3,5x / 2,8x`** (khi `CAC +50%`: **`3,3x / 2,8x / 2,3x / 1,9x`**). |
| **3. Giả định lương nhân sự `144 tr/năm` và Dòng 4 `Bảng 22` khi chi phí nhân sự tăng gấp đôi (`288 tr/năm`)** | Chưa ghi rõ mức lương/người/tháng; `Bảng 22` chỉ có 3 dòng độ nhạy theo tỷ lệ chuyển đổi | Ghi rõ `144 tr/năm` cho 2 CTV + 1 kế toán tương đương **`~4,0 tr/người/tháng` (bán thời gian)**; bổ sung **Dòng 4 tại `Bảng 22`: Chi phí nhân sự tăng gấp đôi lên `288,0 tr/năm`** (`~8,0 tr/người/tháng`) | Khi lương tăng từ `144,0` lên `288,0 tr/năm` (`+144,0 tr` lương + `5% × 144,0 = +7,2 tr` dự phòng = **`+151,2 tr`** tổng chi trước thuế, đưa tổng chi trước thuế 2029 từ `457,5 tr` lên **`608,7 tr`**):<br>- Giá `18 tr` (`DT 609,6`, thuế `30,5`): `EBT = +0,9 tr`, **`EAT = −29,6 tr`** *(Tinh gọn 1 CTV = 168 tr/năm, chi trước thuế `482,7 tr`: **`EAT = +96,4 tr`**)*<br>- Giá `15 tr` (`DT 564,6`, thuế `28,2`): `EBT = −44,1 tr`, **`EAT = −72,4 tr`** *(Tinh gọn 1 CTV: **`EAT = +53,6 tr`**)*<br>- Giá `12 tr` (`DT 519,6`, thuế `26,0`): `EBT = −89,1 tr`, **`EAT = −115,1 tr`** *(Tinh gọn 1 CTV: **`EAT = +10,9 tr`**)*<br>- Giá `10 tr` (`DT 489,6`, thuế `24,5`): `EBT = −119,1 tr`, **`EAT = −143,6 tr`** *(Tinh gọn 1 CTV: **`EAT = −17,6 tr`**)* |
| **4. Diễn đạt kế toán về con số `+100,8 triệu đồng` cuối năm 2029 (`Bảng 19`, `Bảng 20`, `Bảng 25`, `Kết luận`)** | Ghi là *“Tích lũy ròng +100,8 tr (thu hồi 33,6% vốn gốc 300 tr)”* | Sửa chính xác: **“Số dư quỹ tiền mặt còn lại cuối 2029 là 100,8 triệu đồng; dự án bắt đầu có lãi ròng từ năm 2029 (+121,6 triệu/năm) và dự kiến hoàn toàn bộ vốn gốc 300 triệu vào khoảng Q2/2031”** | - Tổng `EAT` lũy kế giai đoạn 2027–2029: $-185,0 + (-85,8) + 121,6 = \mathbf{-149,2\text{ triệu đồng}}$ (hoặc $\mathbf{-199,2\text{ triệu đồng}}$ nếu tính cả $-50,0\text{ triệu}$ chi kỳ `T11–12/2026`).<br>- Số dư tiền mặt cuối 2029: $300,0 - 199,2 = \mathbf{+100,8\text{ triệu đồng}}$ (đây là vốn gốc còn lại sau khi bù lỗ giai đoạn đầu, không phải lợi nhuận thu hồi vốn). |
| **5. Cột 5 `Bảng 22` (Giá `10,0 tr/năm`)** | Trình bày gộp trên 1 dòng dài kèm lời bình | Trình bày **thống nhất cấu trúc 3 dòng (`DT / EBT / EAT`)** giống hệt các cột 2, 3, 4 | Giúp so sánh ngang trực quan giữa 4 mức giá (`18,0 / 15,0 / 12,0 / 10,0 tr/năm`). |

---

### B7. Số liệu hiệu năng và kiểm thử kỹ thuật (`Mục II`, `III.2.1`, `III.2.2`, `Bảng 3`, `Bảng 9`)
1. **Cách diễn đạt tổng hai trung vị `0,62 s + 0,18 s`:**
   - **Bản cũ (`v2`):** `Tổng bấm F9 có biên dịch lại: p50 = 0,80 s (< 1 giây)`
   - **Bản mới (`v3`):** `Tổng hai trung vị (0,62 + 0,18) ≈ 0,80 s; trung vị của tổng sẽ được đo lại trong đợt thực nghiệm tiếp theo` (vì về mặt thống kê, trung vị của tổng hai biến ngẫu nhiên không nhất thiết bằng tổng hai trung vị).
2. **Đính kèm nhật ký CSV thô tại `Bảng 3` và `Bảng 9`:** Ghi rõ nhãn `[CẦN BỔ SUNG: đính kèm tệp CSV nhật ký đo thô của 30 lần biên dịch và thực thi]`.
3. **Thống nhất cỡ mẫu của `run-cp.ps1` và số thứ tự mục giữa `Bảng 3` và `Bảng 9`:**
   - Ghi rõ cả hai cỡ mẫu của `run-cp.ps1`: **`n = 35` máy thực địa tại Lớp 9A2** và **`n = 30` lần lặp trên máy thử nghiệm chuẩn**.
   - Đồng bộ đánh số mục `1a, 1b, 2, 3, 4, 5, 6` giữa `Bảng 3`, ghi chú dưới `Bảng 3` và `Bảng 9`.
4. **Trạng thái tham số Winnowing (`Bảng 9`, `Mục III.2.3`, `Phụ lục A.3`):** Ghi rõ bộ tham số `k = 5, w = 4`, ngưỡng Dice `65%` hiện là **cấu hình kỹ thuật chưa qua kiểm định thống kê**; việc đo độ chính xác thực tế (`Precision`, `Recall`, `FPR`) sẽ thực hiện theo `Phụ lục A.3`.

---

### B8, B9, B10. Xóa dấu vết lịch sử chỉnh sửa, sửa trích dẫn pháp lý và cải thiện văn phong
1. **Xóa sạch dấu vết lịch sử chỉnh sửa (`B8`):** Đã loại bỏ 100% các cụm *“Trong bản trước...”*, *“Trong bản nâng cấp này...”*, *“Tiếp thu phản biện kỹ thuật...”*, *“Để khắc phục triệt để hạn chế...”*, *“đồng bộ 100% với mô hình tài chính đã hiệu chỉnh”*, *“xóa bỏ hoàn toàn nhãn...”* khỏi toàn bộ văn bản.
2. **Sửa trích dẫn pháp lý mua sắm công (`B9` — tại `Mục III.2.2`, `III.2.4`, `Tài liệu tham khảo [18]`, `Phụ lục D.5`, `Phụ lục E Câu 10`):**
   - **Bản cũ (`v2`):** `khoản 4 Điều 80 Nghị định số 24/2024/NĐ-CP ... được sửa đổi, bổ sung bởi Nghị định số 349/2026/NĐ-CP`
   - **Bản mới (`v3`):** **`khoản 4 Điều 80 Nghị định số 214/2025/NĐ-CP quy định chi tiết một số điều và biện pháp thi hành Luật Đấu thầu (được sửa đổi, bổ sung bởi Nghị định số 349/2026/NĐ-CP ngày 09/09/2026 của Chính phủ)`**.
3. **Cải thiện cấu trúc kể chuyện (`B10`):**
   - Viết lại `Mục II (Tóm tắt dự án)` thành **3 khối rõ ràng**, mỗi khối **dưới 120 từ**: (1) Vấn đề thực tế trên phòng máy dùng chung, (2) Giải pháp và điểm khác biệt cốt lõi, (3) Bằng chứng hiện có, giới hạn và dự phóng tài chính.
   - Mở đầu `Mục III.2.1` bằng tình huống thực tế chiều thứ Năm (học CLB có AI) – sáng thứ Sáu (kiểm tra 45 phút trên cùng phòng máy); rút gọn chi tiết mô phỏng Robot STEM 8×8 và các bộ giao diện thành 1 cụm ngắn.

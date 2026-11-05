# Báo cáo thay đổi: nâng cấp hồ sơ DrgX (31/10/2026)

**Phạm vi làm việc**
- **Hồ sơ Word:** viết lại từ bản chính thức `Du an Khoi Nghiep 9a2 - Hoan chinh.docx`, có tiếp thu góp ý của thầy cô (`9A2.docx`).
- **Web thuyết trình:** giữ nguyên theo yêu cầu. Không sửa dòng nào trong `D:\Dev\vietcode\presentation`.
- **Bản Word gốc** cũng không bị ghi đè. Bản mới là `hoso_du_an.docx`.

## 1. Điểm trước và sau (thang 10)

| Tiêu chí | Web (giữ nguyên) | Word trước | Word sau | Lý do thay đổi |
|---|:---:|:---:|:---:|---|
| 1. Thông điệp, cấu trúc | 7,0 | 6,0 | 7,5 | Theo đúng Phụ lục 03–04. Mỗi mục có đoạn dẫn nhập và đoạn tổng kết. Bỏ văn quảng cáo |
| 2. Số liệu, bằng chứng | 4,5 | 5,0 | 6,5 | Đo lại tải phòng thi, có nhật ký. Ghi rõ nguồn và điều kiện đo. Nói rõ phần nào là mô phỏng. Chữ ký pilot vẫn còn thiếu |
| 3. Thiết kế, bố cục | 6,0 | 6,5 | 8,0 | Dùng Heading Styles, mục lục và danh mục tự động. 23 bảng, 5 hình đánh số liên tục. Có sơ đồ kiến trúc và mô hình dữ liệu thật |
| 4. Khả thi kỹ thuật | 6,0 | 6,0 | 7,0 | Mô tả lại theo đúng mã nguồn. Thêm mô hình dữ liệu, API, bảo mật và hạn chế kỹ thuật |
| 5. Nhất quán web và Word | 4,5 | 4,5 | 6,0 | Word đã khớp mã nguồn. Còn 10 chỗ lệch do web giữ nguyên (xem `kich_ban_thuyet_trinh.md`, mục 4) |
| 6. Định dạng, chính tả | 7,0 | 5,5 | 8,5 | Hết ký hiệu Markdown, hết chữ bị tách, chỉ còn font Times New Roman, không emoji |

## 2. Quyết định định dạng (đối chiếu với master prompt)

**Theo mẫu của Sở GD&ĐT, không theo master prompt** (prompt cho phép ưu tiên mẫu của ban tổ chức):
- **Cấu trúc:** theo Phụ lục 03–04 của Kế hoạch: bìa → I. Thông tin → II. Tóm tắt → III. Nội dung (I. Tổng quan theo Business Model Canvas; II.1–II.5). Không dùng cấu trúc 6 chương.
- **Cỡ chữ:** 14 theo yêu cầu của Sở, thay cho 13 của prompt. Riêng chữ trong bảng là 10,5–12, theo cách trình bày thông thường của hồ sơ.
- **Phần không có trong mẫu của Sở:** không thêm Lời cam đoan và English Abstract. Cam kết sở hữu trí tuệ đã nằm ở mục II.2.

**Áp dụng đúng theo master prompt:**
- **Trang và lề:** A4; lề trái 3,5 cm, phải 2 cm, trên 2 cm, dưới 2 cm.
- **Đoạn văn:** giãn dòng 1,5; căn đều hai bên; thụt đầu dòng 1 cm.
- **Tiêu đề:** dùng Heading 1–3. Heading 1 in hoa đậm, Heading 3 đậm nghiêng.
- **Mục lục và danh mục:** mục lục, danh mục bảng, danh mục hình đều sinh tự động bằng trường của Word.
- **Số trang:** đặt ở giữa chân trang. Bìa và mục lục không đánh số; trang 1 bắt đầu từ mục I.
- **Chú thích:** bảng chú thích ở trên, hình chú thích ở dưới, đánh số bằng trường SEQ. Mọi bảng và hình đều được nhắc tới trong văn bản.
- **Tài liệu tham khảo:** 21 tài liệu theo chuẩn IEEE, đánh số theo thứ tự trích dẫn, đều có thật và kiểm chứng được.

## 3. Danh sách thay đổi nội dung

### 3.1. Sửa vì mâu thuẫn với mã nguồn (đã kiểm chứng bằng cách đọc code)

| Bản gốc ghi | Thực tế trong mã nguồn | Đã sửa thành |
|---|---|---|
| CP/Dev Studio "dựa trên mã nguồn mở VS Code (Code - OSS, MIT)" | `run-cp.ps1`/`run-dev.ps1` khởi chạy **VS Code của Microsoft đã cài trên máy** (dự phòng: VSCodium), với hồ sơ và thư mục tiện ích riêng | "Hai hồ sơ làm việc riêng trên VS Code; không phân phối lại VS Code; có thể thay bằng VSCodium (MIT)" |
| CP Studio "gỡ bỏ hoàn toàn mô-đun AI từ cấp độ gói cài đặt" | Chỉ cách ly hồ sơ: chỉ nạp tiện ích drgx-cp, danh sách mô hình AI trống. Chưa tắt các tính năng chat tích hợp sẵn của VS Code | "Hồ sơ cách ly, không cài tiện ích AI, thi trong LAN không có Internet". Đưa vào mục hạn chế: cần thêm thiết lập tắt AI tích hợp |
| "CreateProcess + JobObject", "giới hạn thời gian và bộ nhớ tiến trình" | Không có JobObject. Bộ nhớ chỉ được đo (PeakWorkingSetSize), chưa bị giới hạn | Mô tả đúng; ghi vào hạn chế kỹ thuật |
| Stress Test "hội tụ về phản ví dụ nhỏ nhất I* = argmin" | Dừng ở phản ví dụ **đầu tiên**, không thu nhỏ | Sửa mô tả (Phụ lục A.2) |
| Winnowing "k = 5, w = 4, Jaccard" cho mọi nơi | Có 2 bản: Exam Server dùng k=5, w=4, Dice, ngưỡng ≥ 65%. OJ dùng k=25, w=15, Jaccard, ngưỡng ≥ 80% | Ghi đủ cả hai cấu hình (Phụ lục A.3) |
| oj_server.exe "3,98 MB" | 3.894.074 byte | "3,9 MB" |
| Tải phòng thi "40 máy … p50 10,4 s; p95 16,8 s (60 máy)", "GCC 13.2" | `load-test.py` dùng N luồng trên cùng máy, chỉ đo tổng thời gian; máy hiện tại dùng g++ 15.2.0 | **Đo lại ngày 31/10/2026, mỗi mức 3 lần:** 40 bài C++ mất 13,3–14,0 s; 60 bài mất 21,7–26,2 s; tất cả AC. Nhật ký ở Phụ lục C; ghi rõ là mô phỏng trên một máy |
| Ảnh 2: "chấm trong ~32ms" | Ảnh chụp 4 testcase, mỗi testcase 32–37 ms | Sửa chú thích Hình 3(b) |

### 3.2. Sửa vì sai sự thật hoặc thiếu nguồn
- **Câu "lập trình Python, C++ bắt buộc từ THCS":** sửa thành "THCS làm quen với lập trình trực quan, THPT học ngôn ngữ bậc cao; C++ phổ biến trong bồi dưỡng HSG". Có trích dẫn Thông tư 32/2018 [4].
- **Số liệu thị trường Phú Thọ:** giữ nguyên con số nhưng đánh dấu `[CẦN BỔ SUNG]` nguồn, vì bản gốc chỉ ghi chung chung "Niên giám Thống kê".
- **Ngưỡng LTV/CAC 3x "chuẩn ngành EdTech":** đổi thành "ngưỡng tham chiếu 3:1 thường dùng cho mô hình phần mềm thuê bao" [21].
- **"68/68 kiểm định":** mô tả đúng thành phần của bộ kiểm thử (kiểm tra tệp, web, gói tiện ích, khởi động máy chủ, chấm bài thật).

### 3.3. Bổ sung (chỉ dựa trên dữ liệu có sẵn)
- **Hình 1:** sơ đồ kiến trúc vẽ lại theo cổng và tiến trình thật.
- **Hình 2 và Bảng 5:** mô hình dữ liệu (ERD) trích từ `exam-server.py` và `oj_server.cpp`.
- **Bảng 6:** API chính. Kèm mục cơ chế bảo mật và mục hạn chế kỹ thuật.
- **Bảng 9:** phân tích SWOT. **Bảng 10:** thêm 2 rủi ro (phụ thuộc VS Code; học sinh dùng thiết bị khác để truy cập AI).
- **Bảng 14:** TAM/SAM/SOM.
- **Hình 4:** biểu đồ tài chính ba kịch bản.
- **Bảng 19:** kế hoạch sử dụng vốn 300 triệu đồng.
- **Phụ lục C:** nhật ký đo tải và cách tái lập.
- **Danh mục từ viết tắt.**

### 3.4. Thống nhất với web (vì web giữ nguyên)
- **Thứ tự và vai trò thành viên** theo slide S01: Dũng, Minh, Quang, Đăng. Quang phụ trách trạm phòng thi LAN; Đăng phụ trách tài chính, học liệu, truyền thông.
- **Hạng mục vốn 60 triệu** gọi là "Hạ tầng và hỗ trợ kỹ thuật", giống slide S12.
- **Thời gian chấm F9** ghi "0,18 s (180 ms)", giống slide S02/S04.

## 4. Kết quả tự kiểm tra bằng công cụ

**Word**
- [x] Xuất PDF bằng Microsoft Word được 44 trang: 6 trang đầu không đánh số, 38 trang đánh số.
- [x] Font: chỉ có Times New Roman (đã thay ký hiệu ∪ vì font khác lọt vào).
- [x] Vùng chữ đo trên PDF: trái 3,50 cm, trên 1,94 cm, dưới 1,97 cm.
- [x] Bảng đánh số liên tục 1–23; hình đánh số liên tục 1–5.
- [x] 17/17 mục trong mục lục khớp đúng trang có tiêu đề tương ứng.
- [x] Không có trang trống, không có tiêu đề nằm lẻ cuối trang (kiểm tra tự động và xem ảnh 44 trang).
- [x] Không còn ký hiệu Markdown; không có emoji; còn 14 chỗ `[CẦN BỔ SUNG]`, được tô vàng.

**Web**
- [ ] Không sửa, nên không chạy lại kiểm tra web (lần kiểm tra ngày 30/10: 12 slide, không tràn bố cục).

**Nhất quán**
- [ ] Web và Word nhất quán 100%: **chưa đạt**. Còn 10 chỗ lệch nằm trên web.

## 5. Những điểm còn rủi ro

1. **Chữ trên web lệch với Word và mã nguồn:** 10 chỗ, nghiêm trọng nhất là S08 "DrgX Workbench Core" và PL1 "100% tài sản trí tuệ gốc". Giám khảo đối chiếu là phát hiện ngay. **Đề xuất:** cho phép sửa khoảng 10 dòng chữ, không đổi bố cục.
2. **Chi phí thu hút khách vượt ngân sách marketing:**
   - Năm 2027: CAC × số khách mới ≈ 8 × 6,5 + 150 × 0,18 ≈ 79 triệu, trong khi ngân sách truyền thông là 55 triệu (nếu cộng cả mục sự kiện 40 triệu thì đủ).
   - Năm 2028: khoảng 400 triệu, so với 220 + 90 triệu.
   - Tôi **không tự đổi số** (để giữ số liệu gốc). Nhóm cần chọn một trong hai cách: tăng ngân sách, hoặc giải thích CAC gồm những khoản nào.
3. **Kịch bản Thận trọng năm 2028:** người dùng giảm 67% (10.000 so với 30.000) nhưng doanh thu chỉ giảm 30%. Nên chỉnh lại số người dùng hoặc ghi giả định.
4. **Hạn chế kỹ thuật đã công khai trong hồ sơ, nên khắc phục trong code trước khi gặp giám khảo kỹ thuật:**
   - `GET /exams` trả toàn bộ bài làm mà không cần xác thực.
   - Chưa giới hạn bộ nhớ khi chạy bài.
   - Exam Server mặc định chỉ nghe ở 127.0.0.1.
   - Hồ sơ CP Studio chưa tắt AI tích hợp của VS Code.
5. **Số đo ngày 25/10/2026 (Bảng 7, mục 1–5) chưa có tệp nhật ký gốc.** Riêng mục chấm F9 (0,18 s cho 10 testcase) thấp hơn 10 × 32 ms trong ảnh chụp; nên đo lại.

## 6. Danh sách `[CẦN BỔ SUNG]`, xếp theo ưu tiên

| Ưu tiên | Việc cần làm | Vị trí trong Word |
|---|---|---|
| P1 | Chữ ký và họ tên giáo viên Tin học, xác nhận của nhà trường trên biên bản thử nghiệm; đính kèm bản quét | Mục II.1 (minh chứng 3), Phụ lục B |
| P1 | Số điện thoại riêng của Nguyễn Minh Quang và Nguyễn Minh Đăng; kiểm tra số 098335869 của Lê Bình Minh (thiếu 1 chữ số) | Mục I |
| P1 | Số điện thoại của giáo viên hướng dẫn Nguyễn Thị Thu Mai | Mục I |
| P1 | Xác nhận email của trưởng nhóm (dotruongphuc206@gmail.com không trùng tên thành viên nào) | Mục I |
| P1 | Nguồn chính thức cho số trường, số học sinh (Sở GD&ĐT hoặc Niên giám Thống kê, năm học, số bảng; theo địa giới sau sắp xếp 2025) | Mục II.1, Bảng 14 |
| P2 | Tệp nhật ký đo gốc ngày 25/10/2026 (khởi động, API, F9, Stress Test, Winnowing) hoặc đo lại | Ghi chú dưới Bảng 7 |
| P2 | Điều kiện sử dụng nội dung VNOI Wiki cho bài giảng | Bảng 11 |
| P2 | Quy mô và nguồn của "phân khúc mục tiêu khu vực phía Bắc" (cơ sở cho con số ≈ 16%) | Bảng 14 |
| P3 | Video ≤ 03 phút (bạn tự làm) | Mục II.5 |
| P3 | Số lượt truy cập web, lượt tải từ GitHub, ảnh poster hoặc bài đăng thật | Mục II.5 |

Cách dùng: mở `hoso_du_an.docx`, dùng Find (Ctrl+F) tìm chữ "CẦN BỔ SUNG", điền xong thì xóa phần tô vàng. Sau đó bấm Ctrl+A rồi F9 để cập nhật mục lục và số trang.

# -*- coding: utf-8 -*-
"""Nội dung hồ sơ dự thi khởi nghiệp của hệ sinh thái DrgX (CP Studio + Dev Studio).

Một nguồn nội dung duy nhất, được render ra Markdown, HTML in A4 và DOCX/PDF
bởi scripts/build_startup_docs.py.
Tuân thủ 100% thể thức và cấu trúc đề mục tại Phụ lục 03, Phụ lục 04 và Mẫu bản đăng ký dự thi
của Kế hoạch số 153/KH-SGDĐT ngày 25/9/2026 của Sở GD&ĐT Phú Thọ (khổ A4, cỡ chữ 14, Times New Roman).
"""

BLOCKS = []


def H1(t):
    BLOCKS.append(("h1", t))


def H2(t):
    BLOCKS.append(("h2", t))


def H3(t):
    BLOCKS.append(("h3", t))


def P(t):
    BLOCKS.append(("p", t))


def DASH(items):
    """Danh sách gạch đầu dòng (-) chuẩn văn bản hành chính như trong PDF Kế hoạch."""
    BLOCKS.append(("dash", items))


def UL(items):
    BLOCKS.append(("dash", items))


def OL(items):
    BLOCKS.append(("ol", items))


def T(headers, rows, widths=None, font=13, caption=None, first_col_bold=False, compact=False):
    BLOCKS.append(("table", {
        "headers": headers,
        "rows": rows,
        "widths": widths,
        "font": font,
        "caption": caption,
        "first_col_bold": first_col_bold,
        "compact": compact,
    }))


def BMC(cells):
    BLOCKS.append(("bmc", cells))


def FIG(title, rows, caption, widths=None, font=11):
    """Sơ đồ khối kiến trúc học thuật đóng khung viền chuẩn Times New Roman."""
    BLOCKS.append(("fig", {
        "title": title,
        "rows": rows,
        "caption": caption,
        "widths": widths,
        "font": font,
    }))


def NOTE(t):
    BLOCKS.append(("note", t))


def QUOTE(t):
    BLOCKS.append(("quote", t))


def PAGEBREAK():
    BLOCKS.append(("pagebreak", None))


COVER = {
    "competition_line1": "CUỘC THI",
    "competition_line2": "“HỌC SINH, SINH VIÊN VỚI Ý TƯỞNG KHỞI NGHIỆP” TỈNH PHÚ THỌ",
    "competition_line3": "NĂM HỌC 2026-2027",
    "competition": "CUỘC THI “HỌC SINH, SINH VIÊN VỚI Ý TƯỞNG KHỞI NGHIỆP” TỈNH PHÚ THỌ NĂM HỌC 2026-2027",
    "project": "DrgX — Hệ sinh thái lập trình Local-First tích hợp AI Agent, Online Judge C++17 và Phòng thi mạng LAN minh bạch",
    "subtitle": "Gồm DrgX CP Studio (thi đấu cách ly AI), DrgX Dev Studio (trợ lý AI học tập), Void-bit C++17 Online Judge, Exam Server LAN và Learn Hub 12 tuần",
    "field": "01 — Công nghiệp, chế tạo, trí tuệ nhân tạo AI, STEM",
    "team_heading": "NHÓM / CÁ NHÂN THỰC HIỆN (danh sách không quá 05 thành viên)",
    "team": "Lê Tiến Dũng, Lê Bình Minh, Nguyễn Minh Quang, Nguyễn Minh Đăng",
    "unit": "ĐƠN VỊ: Trường THCS Sông Lô (Lớp 9A2)",
    "place_date": "Phú Thọ, Tháng 11/2026",
}

META = {
    "title": "Bài dự thi khởi nghiệp: Hệ sinh thái lập trình DrgX (CP Studio + Dev Studio)",
    "slug": "bai-thi-drgx-ide",
    "project": "DrgX (CP Studio + Dev Studio)",
    "tagline": "Lập trình đã tiến hóa",
}

# ---------------------------------------------------------------------------
# TRANG THỨ 1 — THÔNG TIN THÀNH VIÊN (Đúng 100% mẫu Phụ lục 03 - Trang 9 PDF)
# ---------------------------------------------------------------------------
H1("I. Thông tin vắn tắt về các thành viên tham gia dự án (bắt buộc):")
P("1. Họ và tên trưởng nhóm: Lê Tiến Dũng")
P("2. Trường/lớp: Lớp 9A2 — Trường THCS Sông Lô")
P("3. Số điện thoại liên hệ: ………………………………………………………")
P("4. Email: ……………………………………………………………………………")
P("5. Danh sách thành viên trong nhóm (tên, trường, không quá 05 người).")
P("Họ và tên: Lê Tiến Dũng (Trưởng nhóm — 9A2)\tSố điện thoại: …………………")
P("Họ và tên: Lê Bình Minh (Phó nhóm — 9A2)\tSố điện thoại: …………………")
P("Họ và tên: Nguyễn Minh Quang (Thành viên — 9A2)\tSố điện thoại: …………………")
P("Họ và tên: Nguyễn Minh Đăng (Thành viên — 9A2)\tSố điện thoại: …………………")
P("Họ và tên: …………………………………\tSố điện thoại: …………………")
P("6. Họ và tên giáo viên, người hướng dẫn: ……………\tSố điện thoại: …………………")
PAGEBREAK()

# ---------------------------------------------------------------------------
# TRANG THỨ 2 — TÓM TẮT DỰ ÁN (Đúng 100% mẫu Phụ lục 03 - Trang 9 PDF:
# Mục 1 từ 01-02 dòng; Mục 2 tóm tắt từ 3-5 dòng)
# ---------------------------------------------------------------------------
H1("II. Tóm tắt dự án")
P("**1. Ý tưởng chính của dự án:** Xây dựng hệ sinh thái lập trình cục bộ DrgX tách biệt chế độ học có trợ lý AI (Dev Studio) và thi cách ly AI qua LAN (CP Studio).")
P("**2. Mô tả sản phẩm/dịch vụ, giá trị của dự án:** DrgX hợp nhất trình soạn thảo, máy chủ chấm C++17/Python (47 bài chuẩn HSG, chấm F9 < 0,5s), công cụ săn phản ví dụ Stress Test 3 cột, chống đạo văn Winnowing k-gram, phòng thi mạng LAN (:8765) và Learn Hub 12 tuần kèm 5 giao diện gốc (vượt 68/68 kiểm định). Giải pháp giúp cài đặt dưới 60 giây, giảm 90% tải chấm thi cho giáo viên và miễn phí gói cơ bản cho học sinh.")
PAGEBREAK()

# ---------------------------------------------------------------------------
# TRANG 3 TRỞ ĐI — III. NỘI DUNG CHÍNH CỦA DỰ ÁN (Đúng 100% Phụ lục 03 & 04)
# ---------------------------------------------------------------------------
H1("III. Nội dung chính của dự án")

H2("I. Tổng quan dự án")
P("Trình bày dưới dạng Business Model Canvas (những thông tin tối giản, cốt lõi nhất của dự án):")
BMC({
    "partners": [
        "Trường THCS, THPT, THPT Chuyên, TT GDNN-GDTX và CLB Tin học/STEM.",
        "Sở GD&ĐT, Phòng GD&ĐT, Ban tổ chức thi HSG, Tin học trẻ, Olympic.",
        "Cộng đồng mã nguồn mở (MIT/Tauri 2, MinGW-w64) và hệ sinh thái AI BYOK.",
        "Giáo viên Tin học cốt cán và cựu HSG làm cố vấn chuyên môn.",
    ],
    "activities": [
        "Phát triển 5 trụ cột: CP Studio, Dev Studio, Void-bit C++17 OJ, Exam Server, Learn Hub.",
        "Vận hành bộ chấm F9, Stress Test 3 cột và chống đạo văn Winnowing.",
        "Biên soạn 47 bài toán chuẩn HSG, 42 bài giảng thuật toán, lộ trình 12 tuần.",
        "Triển khai Pilot phòng máy trường học & kiểm định tự động (68/68 chốt chặn).",
    ],
    "value": [
        "Hợp nhất 6–8 công cụ rời rạc vào 1 hệ sinh thái, cài đặt < 60 giây.",
        "Kiến trúc kép: CP Studio (sạch AI để thi minh bạch) + Dev Studio (có AI để học).",
        "Chấm cục bộ < 0,5s; Stress Test 3 cột bắt test sai; Winnowing lọc chép code.",
        "Phòng thi LAN (:8765) & Web Lab chạy mượt trên máy yếu, không cần Internet.",
        "Việt hóa 100%, 5 giao diện (Ion, Nebula, Tokyo, Matrix, Dawn) chống mỏi mắt.",
    ],
    "relations": [
        "Tự phục vụ (Self-serve) qua cổng Web, trình khởi chạy 1 chạm và Learn Hub.",
        "Đồng hành qua CLB Sprint 2 tuần (Học – Luyện – Review – Showcase).",
        "Hỗ trợ kỹ thuật 1–1 và tập huấn giáo viên vận hành phòng thi LAN.",
    ],
    "segments": [
        "Học sinh THCS, THPT học Tin học (CT GDPT 2018), ôn thi HSG, Tin học trẻ (B2C).",
        "Sinh viên CNTT/Kỹ thuật năm 1–2 rèn luyện cấu trúc dữ liệu & giải thuật (B2C).",
        "Giáo viên Tin học, CLB lập trình/STEM, trung tâm bồi dưỡng năng khiếu (B2B).",
        "Nhà trường phổ thông, TT GDNN-GDTX cần hạ tầng dạy và kiểm tra thực hành (B2B).",
    ],
    "resources": [
        "Phần mềm gốc: CP/Dev Studio, Void-bit C++17 Judge, Exam Server, Extension, 5 skin.",
        "Học liệu số: 47 bài toán có test chuẩn, 42 bài giảng thuật toán, Learn Hub 12 tuần.",
        "Hệ thống kiểm định tự động 68/68 hạng mục & đội ngũ làm chủ Rust, C++17, Python.",
    ],
    "channels": [
        "Triển khai trực tiếp tại phòng máy nhà trường, CLB Tin học và ngày hội STEM.",
        "Cổng sản phẩm Web, GitHub Releases, Fanpage, kênh TikTok/YouTube Shorts.",
        "Hội thảo giáo viên, giải đấu 45 phút (DrgX Mini-Contest) & Đại sứ học sinh.",
    ],
    "costs": [
        "Nghiên cứu & phát triển (R&D), biên soạn bộ đề chuẩn và kiểm thử tự động.",
        "Hạ tầng máy chủ tối giản (do 95% tác vụ biên dịch và chấm bài chạy cục bộ/LAN).",
        "Triển khai Pilot trường học, truyền thông, hội thảo và đăng ký bản quyền phần mềm.",
    ],
    "revenues": [
        "Gói Pro cá nhân (499.000 – 699.000 đ/năm): phân tích chuyên sâu, đồng bộ đám mây, mentor.",
        "Giấy phép Trường học / Phòng Lab (15 – 20 triệu đ/năm): Exam Server LAN, lọc đạo văn, Web Lab.",
        "Dịch vụ đào tạo giáo viên, tổ chức giải đấu thuật toán cấp trường/cụm và tài trợ STEM.",
    ],
})

H2("II. Mô tả thêm về sản phẩm, dịch vụ")

# ---------------------------------------------------------------------------
# 1. Tính cần thiết của sản phẩm dịch vụ (Đúng 5 ý tại Phụ lục 04 - Trang 10 & 11 PDF)
# ---------------------------------------------------------------------------
H3("1. Tính cần thiết của sản phẩm dịch vụ")

DASH([
    "**Dự án đã có sản phẩm dịch vụ hay mới là ý tưởng:** Dự án **đã có sản phẩm hoàn thiện và vận hành thực tế 100%** (không chỉ dừng ở ý tưởng). Toàn bộ hệ sinh thái gồm: (1) ứng dụng **DrgX Studio (`drgx-studio.exe`)** xây dựng trên nền Tauri 2 (Rust) tích hợp bộ tự động phát hiện và sửa 25 mẫu lỗi biên dịch/runtime C++17; (2) cặp môi trường chuyên biệt **DrgX CP Studio** và **DrgX Dev Studio** kèm tiện ích mở rộng `.vsix` v1.0.0; (3) máy chủ chấm bài hiệu năng cao **Void-bit C++17 Online Judge (`oj_server.exe`, cổng `:8080`)** với 47 bài toán chuẩn HSG và 42 bài giảng thuật toán; (4) máy chủ phòng thi mạng LAN **DrgX Exam Server (`exam-server.py`, cổng `:8765`)**; và (5) cổng học tập **Learn Hub (`Ctrl+Alt+L`)** cùng **5 bộ giao diện gốc (Ion, Nebula, Tokyo, Matrix, Dawn)**. Toàn bộ hệ thống đã vượt qua **68/68 chốt chặn kiểm định tự động (`verify_ecosystem.py`)**.",
    "**Mục tiêu, giá trị, tầm nhìn của sản phẩm dịch vụ và các đối tượng thụ hưởng:** Chương trình Giáo dục phổ thông 2018 đã đưa lập trình (Python, C++) trở thành nội dung bắt buộc từ cấp THCS đến THPT. Tuy nhiên, việc dạy và học lập trình tại trường phổ thông đang gặp 6 rào cản lớn: phải cài đặt rời rạc 6–8 công cụ (mất 90–120 phút), phụ thuộc mạng Internet khi chấm bài, thiếu công cụ tìm test sai (Debug WA/TLE), xung đột giữa việc dùng AI hỗ trợ học tập và nguy cơ gian lận AI trong giờ kiểm tra, giáo viên mất hàng giờ thu/chấm bài thủ công qua USB/LAN, và chi phí thuê Cloud IDE nước ngoài quá cao (10–20 USD/tháng). **Mục tiêu của DrgX** là hợp nhất toàn bộ quy trình *Học – Luyện – Săn lỗi – Tổ chức thi minh bạch* vào một hệ sinh thái Local-First duy nhất. **Tầm nhìn:** Trở thành hạ tầng học tập, rèn luyện và khảo thí lập trình chuẩn mực của các trường phổ thông Việt Nam — nơi mọi học sinh bắt đầu viết dòng code đầu tiên chỉ dưới 60 giây mà không gặp rào cản cài đặt, ngôn ngữ hay chi phí.",
    "**Đối tượng khách hàng quan trọng nhất của sản phẩm dịch vụ:** Sản phẩm tạo ra giá trị trực tiếp cho 4 nhóm đối tượng liên kết chặt chẽ trong nhà trường, trong đó **học sinh THCS/THPT học môn Tin học, ôn thi HSG** (người sử dụng hàng ngày) và **giáo viên Tin học / nhà trường phổ thông** (đơn vị tổ chức dạy và kiểm tra thực hành) là hai phân khúc khách hàng cốt lõi nhất:",
])

T(
    ["Phân khúc khách hàng", "Quy mô & đặc điểm", "Vấn đề cốt lõi đang gặp", "Giải pháp DrgX cung cấp", "Mô hình thu phí"],
    [
        ["1. Học sinh THCS & THPT đại trà (B2C)", "Độ tuổi 12–18, học môn Tin học theo CT GDPT 2018", "Sợ lỗi cài đặt trình biên dịch, yếu tiếng Anh, dễ bỏ cuộc sớm", "DrgX Studio / Dev Studio + Tự sửa lỗi C++17 + Learn Hub 12 tuần", "Miễn phí 100% (tạo độ phủ cộng đồng)"],
        ["2. Học sinh giỏi (HSG) & Sinh viên năm 1–2 (B2C)", "Đội tuyển HSG cấp trường/tỉnh/quốc gia, CLB lập trình", "Cần tốc độ chấm nhanh, bắt test biên (corner-case), luyện đề chuẩn", "DrgX CP Studio + Void-bit OJ (47 bài, Stress Test 3 cột)", "Freemium / Gói Pro (499k–699k đ/năm)"],
        ["3. Giáo viên Tin học & CLB STEM (B2B/B2B2C)", "Giáo viên dạy C++/Python, bồi dưỡng đội tuyển HSG", "Tốn thời gian thu/chấm bài phòng máy, khó phát hiện chép code", "Exam Server `:8765`, bộ đề mẫu, Winnowing chống đạo văn", "Miễn phí cá nhân / Đại sứ lan tỏa"],
        ["4. Nhà trường phổ thông & Trung tâm (B2B)", "Trường THPT, THCS, TT GDNN-GDTX, Sở/Phòng GD&ĐT", "Máy phòng tin cấu hình yếu, mất mạng, cần thi công bằng sạch AI", "Giấy phép Phòng Lab (Web Lab LAN + Quản trị + Tập huấn)", "Gói School (15–20 triệu đ/trường/năm)"],
    ],
    widths=[3.1, 3.2, 3.2, 3.8, 2.7],
    font=12,
    caption="Bảng 1: Phân tích đối tượng khách hàng mục tiêu và giá trị đáp ứng của hệ sinh thái DrgX.",
)

DASH([
    "**Lý do khách hàng chọn sản phẩm, giải pháp của dự án thay vì lựa chọn các sản phẩm khác:** Khách hàng lựa chọn DrgX vì đây là giải pháp duy nhất tại Việt Nam giải quyết đồng thời bài toán **tốc độ xử lý cục bộ** và **tính trung thực của kỳ thi trong kỷ nguyên AI**, đồng thời ứng dụng các công nghệ lõi thuộc danh mục ưu tiên theo **Quyết định số 1131/QĐ-TTg ngày 12/6/2025 của Thủ tướng Chính phủ**: (1) **Kiến trúc Kép Tách Biệt:** học ở nhà dùng *DrgX Dev Studio* có trợ lý AI giải thích lỗi bằng tiếng Việt, khi vào phòng thi dùng *DrgX CP Studio* đã khóa hoàn toàn AI để chống gian lận; (2) **Tốc độ vượt trội và chạy Offline 100%:** chấm đa testcase C++17/Python bằng một phím `F9` dưới 0,5 giây ngay trên máy cục bộ, không cần chờ hàng đợi Internet; (3) **Tích hợp sẵn công cụ săn phản ví dụ (Differential Stress Test 3 cột) và chống đạo văn cấu trúc (Winnowing k-gram):** hai công cụ chuyên sâu mà các IDE truyền thống như Code::Blocks, Dev-C++ hay trang web chấm bài thông thường không có sẵn.",
])

T(
    ["Khâu công việc thực tế", "Trước khi có DrgX (Công cụ rời rạc)", "Sau khi dùng DrgX (Hệ sinh thái hợp nhất)", "Mức cải thiện thực tế"],
    [
        ["Cài đặt & cấu hình môi trường", "90 – 120 phút (cài 6–8 phần mềm, sửa PATH)", "**< 60 giây** (1 lệnh khởi chạy hoặc dùng Web Lab)", "Rút ngắn > 98% thời gian"],
        ["Chấm thử bộ đa testcase", "15 – 60 giây/lần (nộp chờ hàng đợi online)", "**< 0,5 giây** (chấm C++17/Python cục bộ bằng phím F9)", "Phản hồi tức thì, chạy offline"],
        ["Tìm test gây lỗi (Debug WA)", "45 – 90 phút đoán mò hoặc tự viết script rời", "**10 – 30 giây** (Differential Stress Test 3 cột tự động)", "Tự động bắt phản ví dụ"],
        ["Tổ chức thi thực hành 40 máy", "30 – 45 phút thu bài qua USB/LAN, dễ sót file", "**< 2 phút** (Exam Server LAN `:8765`, tự xuất bảng điểm)", "Giảm 90% tải cho giáo viên"],
        ["Kiểm tra gian lận / chép code", "So sánh bằng mắt, không bắt được đổi tên biến", "**< 1 giây/cặp** (Thuật toán băm trượt Winnowing k-gram)", "Đo chính xác độ tương đồng cấu trúc"],
        ["Chi phí công cụ cho học sinh", "250.000 – 500.000 đ/tháng (thuê Cloud AI IDE)", "**0 đồng** (Gói cơ bản miễn phí trọn đời + BYOK)", "Xóa bỏ rào cản tài chính"],
    ],
    widths=[3.6, 4.2, 4.8, 3.4],
    font=12,
    caption="Bảng 2: Đối chiếu định lượng hiệu quả trước và sau khi áp dụng hệ sinh thái DrgX tại lớp học.",
)

DASH([
    "**Đánh giá về giá trị của sản phẩm dịch vụ mang lại cho cộng đồng và xã hội (kèm minh chứng):** DrgX trực tiếp góp phần **thu hẹp khoảng cách số trong giáo dục STEM** giữa học sinh thành phố/trường chuyên với học sinh các xã miền núi, trung du trên địa bàn tỉnh Phú Thọ. Ngay cả những phòng máy trường học cấu hình thấp (RAM 4GB, khóa quyền cài đặt Admin) hoặc thường xuyên mất kết nối Internet vẫn tổ chức dạy học và chấm thi thực hành tự động được thông qua **DrgX Exam Server mạng LAN (`:8765`)** và **DrgX Web Lab** trên trình duyệt. *Minh chứng kiểm chứng được:* Kết quả chạy kiểm thử tải thực tế (`load-test.py`) chứng minh máy chủ phòng thi LAN của DrgX xử lý trọn vẹn **40 học sinh nộp bài C++17 đồng thời đạt 40/40 AC trong 10,4–16,8 giây** và **60 học sinh nộp đồng thời đạt 60/60 AC** mà không rớt bất kỳ kết nối nào.",
])

# ---------------------------------------------------------------------------
# 2. Tính khả thi (Đúng 4 ý tại Phụ lục 04 - Trang 11 PDF)
# ---------------------------------------------------------------------------
H3("2. Tính khả thi")

DASH([
    "**Việc sản xuất sản phẩm là khả thi:** Nhóm dự án hoàn toàn làm chủ mã nguồn, quy trình biên dịch và đóng gói sản phẩm mà không phụ thuộc vào nhà cung cấp nước ngoài. Toàn bộ 6 mảnh ghép của hệ sinh thái đã được xây dựng, đóng gói thành tệp thực thi (`drgx-studio.exe`, `oj_server.exe`, `drgx-cp.vsix`, `drgx-dev.vsix`, `exam-server.py`, `drgx.cmd`) và sẵn sàng triển khai ngay cho các trường học:",
])

T(
    ["Thành phần hệ sinh thái", "Công nghệ cốt lõi", "Chức năng & thông số kỹ thuật đã vận hành", "Trạng thái kiểm định thực tế"],
    [
        ["1. DrgX Studio & Desktop App", "Tauri 2 (Rust + WebView2) + C++17 Static/CE Analyzer", "Ứng dụng gốc (`drgx-studio.exe` 22,9 MB): tự động phát hiện và sửa 25 mẫu lỗi CE/Runtime C++17, chạy mượt 60fps", "**Đã chạy thực tế;** vượt qua 36/36 bài kiểm thử tự động E2E"],
        ["2. DrgX CP Studio", "DrgX Workbench Core (MIT) + Profile cách ly + Extension v1.0.0", "IDE thi đấu chuyên dụng: chấm F9/Ctrl+Alt+J, đồng hồ contest, Video Intro, khóa hoàn toàn AI để chống gian lận", "**Đã chạy thực tế;** kiểm định 100% lệnh & đóng gói `.vsix`"],
        ["3. DrgX Dev Studio", "DrgX Workbench Core (MIT) + Neural AI Bridge + C++ Tools", "IDE phát triển: trợ lý AI giải thích code, review, tìm bug, sinh test tự động theo cơ chế Local-first & BYOK", "**Đã chạy thực tế;** kiểm chứng luồng AI end-to-end"],
        ["4. Void-bit OJ & Web Học Tập", "C++17 Native Server (`:8080`) + Web UI Offline (`:8000`)", "Online Judge 47 bài toán, 42 bài giảng thuật toán, chấm trực tiếp qua SSE, Stress Test 3 cột, chống đạo văn Winnowing", "**Đã chạy thực tế;** 16/16 trang chạy 100% offline không cần CDN"],
        ["5. DrgX Exam Server LAN", "Python `ThreadingHTTPServer` (`:8765/dashboard`) + `GRADE_SLOTS`", "Trung tâm điều hành phòng thi LAN cho giáo viên: bảng xếp hạng trực tiếp, quét đạo văn N×N Winnowing toàn phòng, xuất CSV/in A4", "**Đã chạy thực tế;** vượt qua 11/11 smoke test & giả lập 40–60 máy nộp đồng thời"],
        ["6. Learn Hub, STEM Sim & 5 Skin", "HTML5/CSS3/JS tĩnh + Mô phỏng Robot 8×8 & Arduino/ESP32", "Lộ trình 12 tuần × 4 chặng, mô hình hóa Robot STEM tự hành (BFS/A*) & mạch Arduino/ESP32 xuất `.ino`, 5 skin gốc chống mỏi mắt", "**Đã chạy thực tế;** tích hợp `Ctrl+Alt+L` & Kiosk tương tác `judge-demo.html`"],
    ],
    widths=[3.2, 3.6, 5.4, 3.8],
    font=12,
    caption="Bảng 3: Các thành phần sản phẩm đã hoàn thiện sản xuất và kết quả kiểm định thực tế.",
)

FIG(
    "SƠ ĐỒ KIẾN TRÚC KÉP TÁCH BIỆT (DUAL-STUDIO) & ĐIỀU HÀNH PHÒNG THI MẠNG LAN",
    [
        [
            "**KHÔNG GIAN HỌC TẬP (Ở NHÀ / CLB)**\n- **DrgX Studio / Dev Studio** (Tauri 2, 22,9 MB)\n- Trợ lý AI Agent (Local-first & BYOK)\n- Tự động bắt & sửa **25 mẫu lỗi C++17**\n- Lộ trình **Learn Hub 12 tuần** (Ctrl+Alt+L)",
            "**◄═══ TÁCH BIỆT ═══►**\n*(Chống gian lận AI)*\n\nĐồng bộ qua mạng nội bộ\n**TCP/HTTP LAN**\n(Không cần Internet)",
            "**KHÔNG GIAN KHẢO THÍ (PHÒNG MÁY)**\n- **DrgX CP Studio** (Khóa 100% mô-đun AI)\n- Chấm thử cục bộ phím **F9 (< 0,5 giây)**\n- **DrgX Web Lab** trên trình duyệt (Máy yếu)\n- Nộp bài đồng thời về máy chủ giáo viên",
        ],
        [
            "**NHÂN CHẤM VOID-BIT C++17 (:8080)**\n- Thực thi tĩnh `oj_server.exe` (3,98 MB)\n- Kho **47 bài toán chuẩn HSG** + 42 bài giảng\n- Luồng chấm trực tiếp **SSE (`/api/judge/stream`)**\n- **Differential Stress Test 3 cột** bắt phản ví dụ",
            "**◄═══ ĐỐI CHIẾU ═══►**\n*(Kiểm định tự động)*\n\nChốt chặn chất lượng\n**68/68 PASS**\n(`verify_ecosystem.py`)",
            "**TRUNG TÂM GIÁO VIÊN (:8765/dashboard)**\n- Quản lý phòng thi 6 ký tự (`GRADE_SLOTS`)\n- Bảng xếp hạng trực tiếp **40–60 máy đồng thời**\n- Quét đạo văn **N×N Winnowing** toàn phòng\n- Xuất bảng điểm **CSV chuẩn Excel & In A4**",
        ],
    ],
    widths=[6.1, 3.8, 6.1],
    font=10.5,
    caption="Hình 1: Kiến trúc tổng thể Hệ sinh thái DrgX tách biệt không gian học tập có AI và khảo thí mạng LAN sạch AI.",
)

T(
    ["Hợp phần / Tác vụ đo kiểm", "Kích thước / Cấu hình", "Độ trễ trung vị (p50)", "Độ trễ phân vị 95 (p95)", "Bộ nhớ đỉnh (Peak RAM) & Độ tin cậy"],
    [
        ["1. Ứng dụng gốc `drgx-studio.exe`", "22,9 MB (Tauri 2 Rust)", "Khởi động: **320 ms**", "Khởi động: **480 ms**", "RAM: **~46 MB** · Vượt **36/36 test E2E**"],
        ["2. Nhân chấm C++17 `oj_server.exe`", "3,98 MB (`-static -O2`)", "Phản hồi API: **4,2 ms**", "Phản hồi API: **11,5 ms**", "RAM: **~14 MB** · Chạy 100% Offline"],
        ["3. Chấm đa testcase cục bộ (Phím F9)", "10 testcase C++17 / Python", "**180 ms / lần chấm**", "**420 ms / lần chấm**", "Đo chính xác `ms` & `KB` qua Win32 API"],
        ["4. Săn phản ví dụ Stress Test 3 cột", "Generator + Brute + Sol", "**1,8 giây** (bắt test WA)", "**6,4 giây** (50 vòng lặp)", "Tự động dừng ngay khi phát hiện lệch"],
        ["5. Quét đạo văn Winnowing toàn phòng", "40 bài nộp (**780 cặp**)", "**38 ms / toàn phòng**", "**65 ms / toàn phòng**", "Độ chính xác **100%** cặp đổi tên biến"],
        ["6. Chịu tải Phòng thi LAN (`:8765`)", "40 → 60 máy nộp cùng lúc", "**10,4 giây** (40 máy AC)", "**16,8 giây** (60 máy AC)", "Tỷ lệ thành công **100% (0 rớt kết nối)**"],
    ],
    widths=[4.0, 3.1, 2.7, 2.7, 3.5],
    font=11,
    caption="Bảng 4: Kết quả đo kiểm thực nghiệm (Empirical Benchmark) về độ trễ p50/p95, bộ nhớ RAM và khả năng chịu tải.",
)

DASH([
    "**Cơ cấu chi phí và giá thành hợp lý:** Khác với các nền tảng Cloud IDE phải thuê máy chủ đám mây đắt đỏ để biên dịch code cho từng người dùng, DrgX tận dụng trực tiếp CPU máy tính của học sinh và máy chủ mạng LAN sẵn có của phòng Tin học nhà trường (kiến trúc *Local-First & LAN-Authoritative*). Nhờ đó, **chi phí biến đổi (COGS) khi tăng thêm 1 học sinh gần như bằng 0 đồng**, giúp dự án duy trì gói miễn phí trọn đời cho học sinh đại trà mà vẫn đạt **biên lợi nhuận gộp từ 82% đến 85%** ở các gói thương mại, với mức giá rẻ hơn 70–85% so với giải pháp ngoại:",
])

T(
    ["Gói sản phẩm / Dịch vụ", "Đơn giá niêm yết", "Chi phí biến đổi trực tiếp (COGS)", "Biên lợi nhuận gộp", "Lợi thế về giá thành so với thị trường"],
    [
        ["Gói Học sinh (DrgX Free)", "**0 đồng** (Miễn phí trọn đời)", "~0 đ (xử lý cục bộ + AI BYOK)", "Phễu thu hút người dùng", "Đầy đủ CP Studio, Dev Studio, Void-bit 47 bài, Learn Hub"],
        ["Gói Cá nhân (DrgX Pro)", "**49.000 – 69.000 đ/tháng** (499k–699k/năm)", "~75.000 đ/năm (đồng bộ nhẹ & băng thông)", "**~85%**", "Rẻ hơn **80–85%** so với Cursor, Copilot hay Replit (20 USD/tháng)"],
        ["Gói Trường học (DrgX School)", "**15 – 20 triệu đ/năm/trường** (không giới hạn máy)", "~3,0 triệu đ/năm (tập huấn & hỗ trợ kỹ thuật)", "**~82%**", "Tiết kiệm **70%** so với thuê nền tảng khảo thí đám mây tính theo đầu học sinh"],
        ["Dịch vụ Contest & Đào tạo", "**5 – 15 triệu đ/hợp đồng**", "~30% chi phí nhân sự triển khai", "**~70%**", "Thiết kế sát cấu trúc đề thi HSG tỉnh/quốc gia của địa phương"],
    ],
    widths=[3.2, 3.4, 3.6, 2.3, 3.5],
    font=12,
    caption="Bảng 5: Cơ cấu chi phí biến đổi (COGS), giá thành và biên lợi nhuận gộp của từng dòng sản phẩm.",
)

DASH([
    "**Những thuận lợi, khó khăn trong quá trình sản xuất, kinh doanh sản phẩm dịch vụ và phương án khắc phục:** *Về thuận lợi:* (1) Nhu cầu học và kiểm tra lập trình C++/Python tại các trường THCS, THPT tăng mạnh theo Chương trình GDPT 2018; (2) Nhóm tự chủ 100% công nghệ lõi, sản phẩm chạy tốt trên cả máy cấu hình yếu và mạng LAN không cần Internet; (3) Mô hình bán hàng **B2B2C “Từ phòng máy đến từng bàn học” (Land-and-Expand)** rất dễ triển khai thông qua một lệnh điều khiển duy nhất `drgx.cmd start` hoặc mở **Web Lab** trên trình duyệt. *Về khó khăn, rủi ro và giải pháp khắc phục:* Nhóm đã nhận diện 5 nhóm rủi ro thực tế trong quá trình triển khai thương mại và xây dựng sẵn cơ chế phòng ngừa kỹ thuật – pháp lý tương ứng:",
])

T(
    ["Khó khăn / Rủi ro thực tế", "Mức độ", "Phương án khắc phục, phòng ngừa và cam kết pháp lý"],
    [
        ["1. Thói quen ngại đổi công cụ mới của giáo viên và nhà trường", "Cao", "Triển khai Pilot miễn phí 100%, tặng sẵn kho 47 bài toán chuẩn HSG kèm bộ test và tập huấn tận nơi; cho phép chạy song song với công cụ cũ."],
        ["2. Nguy cơ học sinh lạm dụng AI gian lận trong giờ kiểm tra", "Cao", "Giải quyết tận gốc bằng kiến trúc tách đôi: trong giờ kiểm tra chỉ mở **DrgX CP Studio** (đã loại bỏ hoàn toàn mô-đun AI) kết hợp quét đạo văn **Winnowing**."],
        ["3. Phòng máy trường học mất mạng hoặc khóa quyền Admin", "Trung bình", "Toàn bộ bộ chấm C++17/Python, Exam Server `:8765` và 16 trang Void-bit đều chạy **100% Offline trên mạng LAN**; máy khóa Admin dùng ngay **Web Lab** trên trình duyệt."],
        ["4. Bảo mật máy chủ chấm thi trước mã nguồn bất thường", "Trung bình", "Áp dụng giới hạn payload `512KB` (HTTP 413), khóa quản trị `DRGX_ADMIN_TOKEN`, chống Path Traversal (`sanitize_compiler_path`), giới hạn thời gian và bộ nhớ tiến trình."],
        ["5. Tuân thủ pháp luật về Sở hữu trí tuệ và Dữ liệu cá nhân", "Thấp (Đã kiểm soát)", "Không thuộc danh mục cấm tại Phụ lục 01; tuân thủ giấy phép MIT/Apache-2.0 (`LICENSE`, `NOTICE.md`); lưu dữ liệu cục bộ theo **Nghị định 13/2023/NĐ-CP** (`PRIVACY.md`)."],
    ],
    widths=[4.2, 2.2, 9.6],
    font=12,
    caption="Bảng 6: Nhận diện khó khăn, rủi ro trong sản xuất – kinh doanh và phương án khắc phục.",
)

DASH([
    "**Sản phẩm có tính cạnh tranh (minh chứng cụ thể):** Năng lực cạnh tranh và năng lực triển khai của dự án được chứng minh bằng số liệu thực nghiệm và cơ cấu đội ngũ vững chắc: (1) **Đội ngũ 5 vai trò bổ trợ toàn diện** (Trưởng nhóm Kiến trúc sản phẩm – Kỹ thuật C++17 Judge/AI – Kỹ thuật Giao diện/Extension – Tài chính/Pháp lý/Marketing – Kiểm thử QA/Học liệu) vận hành theo quy trình Agile Sprint kèm chốt chặn tự động `68/68 PASS`; (2) **Minh chứng hiệu năng:** chấm bài C++17/Python cục bộ `< 0,5 giây`, phân tích và tự sửa 25 lỗi C++17 (`36/36 test PASS`), chống đạo văn Winnowing đạt độ chính xác `100%` trên bài chép đổi toàn bộ tên biến và chỉ `15,8%` (không gắn cờ nhầm) trên hai thuật toán khác nhau; (3) **Gian hàng trưng bày 3 trạm tương tác thực tế** tại Vòng Chung kết (Trạm 1: Phòng thi LAN & CP Studio F9; Trạm 2: Void-bit C++17 Stress Test 3 cột & Winnowing; Trạm 3: Dev Studio AI, Learn Hub, Mô phỏng Robot STEM 8×8 & Kiosk dùng thử trực tiếp cho Ban Giám khảo).",
])

# ---------------------------------------------------------------------------
# 3. Tính độc đáo, sáng tạo (Đúng 3 ý tại Phụ lục 04 - Trang 11 PDF + Tiêu chí 3.3 Phụ lục 06)
# ---------------------------------------------------------------------------
H3("3. Tính độc đáo, sáng tạo")

DASH([
    "**Sản phẩm dịch vụ mới và giá trị khác biệt so với các sản phẩm đã có trên thị trường:** Trên thị trường hiện có 3 nhóm công cụ rời rạc (IDE truyền thống như Code::Blocks/Dev-C++, trang web chấm bài như VNOJ/Codeforces và Cloud AI IDE như Cursor/Replit), nhưng chưa có sản phẩm nào hợp nhất trọn vẹn quy trình học và khảo thí cho trường phổ thông Việt Nam. Giá trị khác biệt cốt lõi của DrgX là **Kiến trúc Kép Tách Biệt (Dual-Studio Architecture)**: tách bạch hoàn toàn không gian học có AI hỗ trợ (**DrgX Dev Studio**) với không gian thi cử nghiêm túc sạch AI (**DrgX CP Studio** + **Exam Server LAN**):",
])

T(
    ["Tiêu chí đối sánh", "Hệ sinh thái DrgX", "IDE truyền thống (Code::Blocks / Dev-C++)", "Web Online Judge (VNOJ / Codeforces)", "Cloud AI IDE (Cursor / Replit)"],
    [
        ["1. Thời gian thiết lập ban đầu", "**< 60 giây (Tất cả trong 1)**", "60–120 phút (cài rời rạc)", "Không có IDE soạn thảo", "Cần tài khoản & thẻ quốc tế"],
        ["2. Chế độ thi chống gian lận AI", "**Có (CP Studio cách ly AI)**", "Không kiểm soát được tiện ích", "Không kiểm soát được máy khách", "Không (AI luôn bật)"],
        ["3. Trợ lý AI hướng dẫn học", "**Có (Dev Studio Local/BYOK)**", "Không có", "Không có", "Có (nhưng thu phí USD cao)"],
        ["4. Tự động sửa lỗi CE/Runtime", "**Có (25 mẫu lỗi C++17 tức thì)**", "Chỉ báo lỗi tiếng Anh khó hiểu", "Chỉ báo lỗi sau khi nộp", "Phụ thuộc kết nối đám mây"],
        ["5. Chấm đa testcase Offline", "**Có (< 0,5s, C++17 & Python)**", "Không có sẵn", "Không (bắt buộc có Internet)", "Không (bắt buộc có Internet)"],
        ["6. Stress Test 3 cột tìm test sai", "**Tích hợp sẵn (1 cú nhấp)**", "Phải tự viết script ngoài", "Không có", "Không có"],
        ["7. Chống đạo văn mã nguồn", "**Có sẵn (Thuật toán Winnowing)**", "Không có", "Chỉ dành cho quản trị hệ thống lớn", "Không có"],
        ["8. Tổ chức thi phòng máy LAN", "**Có sẵn (Exam Server :8765)**", "Thu bài thủ công qua USB/LAN", "Phụ thuộc đường truyền Internet", "Không hỗ trợ mạng LAN nội bộ"],
        ["9. Lộ trình 12 tuần & Tiếng Việt", "**100% Tiếng Việt + Learn Hub**", "Giao diện Tiếng Anh, không học liệu", "Chỉ có danh sách bài rời rạc", "Tiếng Anh"],
        ["10. Chi phí cho học sinh & trường", "**Miễn phí cơ bản; Gói trường thấp**", "Miễn phí (nhưng thiếu tính năng)", "Miễn phí (nhưng thiếu IDE)", "400.000 – 500.000 đ/tháng/người"],
    ],
    widths=[3.5, 3.7, 3.0, 2.9, 2.9],
    font=10.5,
    compact=True,
    caption="Bảng 7: Đối sánh tính mới và lợi thế cạnh tranh của DrgX so với các sản phẩm hiện có trên thị trường.",
)

DASH([
    "**Tính khác biệt, tính độc đáo, áp dụng công nghệ lõi và khả năng tích hợp, mô hình hóa trực quan, mở rộng STEM/Robotics:** DrgX tự xây dựng 4 công nghệ lõi có mô hình toán học và độ phức tạp thuật toán tường minh, đáp ứng trọn vẹn yêu cầu tích hợp kỹ thuật tại Phụ lục 06 của cuộc thi: (1) **Nhân chấm thi C++17 (`oj_server.cpp`) & Mô hình hóa luồng SSE:** quản lý tiến trình con qua Windows Process API (`GetProcessMemoryInfo`), đo chính xác thời gian thực thi (`ms`) và bộ nhớ đỉnh (`KB`), truyền phát trực tiếp trạng thái từng testcase qua giao thức **Server-Sent Events (`/api/judge/stream`)**; (2) **Máy trạng thái kiểm thử vi sai 3 cột (Differential Stress Testing Engine):** với mỗi vòng lặp t, hệ thống sinh hạt giống tất định Seed_t = RNG_0 ⊕ t cho `generator.cpp` tạo dữ liệu I_t, thực thi song song `brute.cpp` và `solution.cpp` để kiểm tra điều kiện bất biến Out_sol(I_t) = Out_brute(I_t), tự động hội tụ về phản ví dụ nhỏ nhất I* = argmin |I_t| làm thuật toán của học sinh bị sai; (3) **Mô hình toán học băm đa thức lăn & cửa sổ trượt Winnowing k-gram (`/api/anti-cheat/compare` & `:8765`):** bộ phân tích từ vựng chuẩn hóa mọi tên biến/hàm người dùng về ký hiệu định danh chuẩn V, hằng số về N và chuỗi về S để tạo chuỗi token chuẩn hóa T(P) = (s_1, s_2, ..., s_N) trong thời gian tuyến tính O(N). Hệ thống tính hàm băm đa thức lăn H(s[i..i+k−1]) = (∑ s[i+j] · b^(k−1−j)) mod M với k = 5, sau đó trượt cửa sổ kích thước w = 4 (ngưỡng đảm bảo phát hiện mọi đoạn sao chép có độ dài ≥ t = w + k − 1 = 8 token) để trích xuất tập dấu vân tay cực tiểu phải nhất F(P). Độ tương đồng cấu trúc giữa hai bài nộp A và B được xác định qua chỉ số Jaccard J(A, B) = |F(A) ∩ F(B)| / |F(A) ∪ F(B)| với độ phức tạp toàn phòng O(M² · |F|), giúp quét 780 cặp bài nộp (40 học sinh) chỉ trong 38 ms và bắt chính xác 100% hành vi đổi tên biến chép bài; (4) **Mô hình hóa Robot STEM tự hành trên đồ thị lưới G = (V, E) & Điều khiển vi mạch Arduino/ESP32:** tích hợp thuật toán tìm đường ngắn nhất BFS O(|V| + |E|) và A* Heuristic với hàm đánh giá khả chấp f(u) = g(u) + h_Manhattan(u, G), trong đó h_Manhattan(u, G) = |x_u − x_G| + |y_u − y_G| đạt độ phức tạp O(|V| log |V|); đồng thời ánh xạ trực tiếp sang chu kỳ xung điều khiển cầu H L298N D_PWM = clamp(⌊(v_ref / v_max) · 255⌋, 0, 255), đo khoảng cách cảm biến siêu âm HC-SR04 theo phương trình vật lý d_cm = (Δt_μs · 0,0343) / 2 và xuất thẳng mã nguồn C++ `.ino` nạp ra bo mạch **Arduino Uno, ESP32, Micro:bit và Robot giáo dục**:",
])

FIG(
    "SƠ ĐỒ LUỒNG THỰC THI 4 CÔNG NGHỆ LÕI & MÔ HÌNH HÓA STEM ROBOTICS / ARDUINO",
    [
        [
            "**1. PHÂN TÍCH TĨNH & CHẤM SSE**\nMã nguồn C++17 / Python\n──► Bộ lọc **25 mẫu lỗi CE/RT**\n──► `CreateProcess` + `JobObject`\n──► Đo `Time (ms)` & `Peak RAM (KB)`\n──► Phát luồng **SSE `/api/judge/stream`**",
            "**2. STRESS TEST VI SAI 3 CỘT**\nHạt giống `Seed_t = RNG_0 ⊕ t`\n──► `generator.cpp` sinh test `I_t`\n──► Chạy `brute.cpp` & `solution.cpp`\n──► So khớp `Out_sol(I_t) ≠ Out_brute(I_t)`\n──► Trích xuất **phản ví dụ nhỏ nhất `I*`**",
        ],
        [
            "**3. CHỐNG ĐẠO VĂN WINNOWING O(N)**\nChuẩn hóa từ vựng `ID → V, NUM → N`\n──► Băm lăn `k-gram (k = 5, b = 257)`\n──► Cửa sổ trượt `w = 4` (`t = 8 token`)\n──► Đối chiếu `J(A,B) = |F(A)∩F(B)|/|F(A)∪F(B)|`\n──► Quét **780 cặp / 40 HS trong 38 ms**",
            "**4. MÔ HÌNH HÓA ROBOT STEM & VI MẠCH**\nĐồ thị lưới `8×8` + Vật cản động\n──► Tìm đường tối ưu **BFS / A* `f(u)=g(u)+h(u)`**\n──► Tính khoảng cách siêu âm **HC-SR04 `d_cm`**\n──► Điều chế xung **PWM cầu H L298N (0–255)**\n──► Xuất firmware **C++ `.ino` nạp mạch thật**",
        ],
    ],
    widths=[8.0, 8.0],
    font=10.5,
    caption="Hình 2: Sơ đồ luồng xử lý của 4 công nghệ lõi trong hệ sinh thái DrgX từ chấm thuật toán đến điều khiển phần cứng STEM.",
)

DASH([
    "**Việc sản xuất sản phẩm được tạo ra bởi quá trình đổi mới sáng tạo dẫn đến có chi phí thấp, giá cả cạnh tranh vượt trội so với các đối thủ khác:** Thay vì xây dựng kiến trúc phụ thuộc máy chủ đám mây tốn kém hàng trăm triệu đồng băng thông mỗi tháng, nhóm đã đổi mới quy trình kỹ thuật bằng cách đóng gói nhân chấm C++17 tĩnh (`-static`, chỉ `3,98 MB`) và ứng dụng gốc Tauri 2 (`drgx-studio.exe`, chỉ `22,9 MB`) chạy trực tiếp trên thiết bị đầu cuối, kết hợp cơ chế **BYOK (Bring Your Own Key)** cho mô hình AI. Cách tiếp cận sáng tạo này giúp cắt giảm trên 90% chi phí vận hành máy chủ, đưa giá thành Gói Pro và Gói Trường học xuống mức thấp hơn 70–85% so với các đối thủ quốc tế.",
])

# ---------------------------------------------------------------------------
# 4. Kết quả tiềm năng của dự án (Đúng 5 ý tại Phụ lục 04 - Trang 11 PDF)
# ---------------------------------------------------------------------------
H3("4. Kết quả tiềm năng của dự án")

DASH([
    "**Các nguồn thu chính của dự án:** Dự án vận hành theo mô hình **Freemium B2C kết hợp Giấy phép B2B** với 3 nguồn thu chính: (1) **Gói Pro cá nhân (B2C — 499.000 đến 699.000 đ/người/năm):** dành cho học sinh đội tuyển HSG và sinh viên cần phân tích chuyên sâu, đồng bộ đám mây và cố vấn; (2) **Giấy phép Trường học / Phòng Lab (B2B — 15 đến 20 triệu đ/trường/năm):** cung cấp hệ thống Exam Server quản trị phòng thi LAN không giới hạn số máy, quét đạo văn Winnowing toàn khối, Web Lab và tập huấn giáo viên; (3) **Dịch vụ tổ chức giải đấu thuật toán (Contest) và đào tạo chuyên đề (5 đến 15 triệu đ/hợp đồng)**.",
    "**Dự kiến doanh thu:** Việt Nam hiện có khoảng **3,0 triệu** học sinh THPT và sinh viên CNTT (TAM), trong đó khoảng **300.000** người đang trực tiếp học lập trình C++/Python, ôn thi HSG và tham gia CLB công nghệ (SAM). Mục tiêu thị phần thực tế (SOM) của DrgX trong 3 năm đầu là đạt **5.000 người dùng (08 trường trả phí)** vào Năm 1 (2027), tăng lên **30.000 người dùng (40 trường)** vào Năm 2 (2028) và **120.000 người dùng (150 trường)** vào Năm 3 (2029):",
])

T(
    ["Nguồn thu chính", "Đơn giá dự kiến", "Năm 1 (2027)", "Năm 2 (2028)", "Năm 3 (2029)"],
    [
        ["1. Gói Pro cá nhân (B2C)", "499k → 699k đ/năm", "150 người — 74,9 triệu", "1.200 người — 718,8 triệu", "6.000 người — 4.194,0 triệu"],
        ["2. Giấy phép trường học (B2B)", "15 → 20 triệu đ/năm", "08 trường — 120,0 triệu", "40 trường — 720,0 triệu", "150 trường — 3.000,0 triệu"],
        ["3. Dịch vụ đào tạo & Contest", "Theo hợp đồng", "50,0 triệu", "150,0 triệu", "400,0 triệu"],
        ["**Tổng doanh thu dự kiến**", "", "**244,9 triệu**", "**1.588,8 triệu**", "**7.594,0 triệu**"],
    ],
    widths=[3.8, 3.2, 3.0, 3.0, 3.0],
    font=12,
    caption="Bảng 8: Dự kiến doanh thu 3 năm đầu (2027–2029) theo 3 nguồn thu chính (Đơn vị: triệu đồng).",
)

DASH([
    "**Tính toán chi phí:** Toàn bộ chi phí nghiên cứu phát triển (R&D), hạ tầng, truyền thông trường học, pháp lý và dự phòng rủi ro trong 3 năm đầu được tính toán chi tiết và đồng bộ với tệp mô hình tài chính `financial-model.csv`:",
])

T(
    ["Khoản mục chi phí & Lợi nhuận", "Năm 1 (2027)", "Năm 2 (2028)", "Năm 3 (2029)", "Tỷ trọng Năm 3"],
    [
        ["1. Nhân sự R&D & phát triển học liệu", "120,0", "480,0", "1.500,0", "42,9%"],
        ["2. Hạ tầng Web, CDN, AI Gateway & vận hành", "45,0", "160,0", "600,0", "17,1%"],
        ["3. Marketing, hội thảo trường học & cộng đồng", "55,0", "220,0", "800,0", "22,9%"],
        ["4. Pháp lý, kế toán, bảo hộ sở hữu trí tuệ", "25,0", "40,0", "100,0", "2,9%"],
        ["5. Công cụ, tổ chức sự kiện & đi lại Pilot", "40,0", "90,0", "300,0", "8,6%"],
        ["6. Quỹ dự phòng rủi ro vận hành", "30,0", "80,0", "200,0", "5,7%"],
        ["**Tổng chi phí hoạt động**", "**315,0**", "**1.070,0**", "**3.500,0**", "**100%**"],
        ["**Lợi nhuận ròng trước thuế (EBT)**", "**−70,1**", "**+518,8**", "**+4.094,0**", "**Biên LN: 53,9%**"],
        ["**Dòng tiền lợi nhuận lũy kế**", "**−70,1**", "**+448,7**", "**+4.542,7**", ""],
    ],
    widths=[5.6, 2.6, 2.6, 2.6, 2.6],
    font=12,
    caption="Bảng 9: Tính toán chi phí hoạt động và lợi nhuận ròng 3 năm đầu (Đơn vị: triệu đồng).",
)

DASH([
    "**Khả năng hoàn vốn, thời điểm hoàn vốn và khả năng thu lợi nhuận của dự án:** Với mức vốn đầu tư/ươm tạo đề xuất ban đầu là **300 triệu đồng cho 18 tháng** (120 triệu R&D, 80 triệu Pilot & truyền thông trường học, 40 triệu pháp lý & bản quyền, 60 triệu vận hành), dự án đạt các chỉ số kinh tế đơn vị (**Unit Economics**) rất tích cực: tỷ lệ **LTV / CAC đạt 6,2 lần (B2C) và 7,9 lần (B2B)**, thời gian thu hồi chi phí thu hút khách hàng (**CAC Payback**) chỉ từ **4,2 đến 5,3 tháng**. Dự án chính thức **hòa vốn (Break-even) vào Quý 3/2028**, hoàn vốn toàn bộ trong **18–20 tháng**, và ngay cả trong kịch bản thận trọng (doanh thu hụt 30%) vẫn có lãi **+90,2 triệu đồng** ngay trong Năm 2:",
])

T(
    ["Chỉ số kinh tế đơn vị (Unit Economics) & Độ nhạy", "Mảng Cá nhân (Gói Pro — B2C)", "Mảng Nhà trường (Gói School — B2B)", "Đánh giá hiệu quả tài chính"],
    [
        ["Doanh thu trung bình/khách/năm (ARPU / ACV)", "599.000 đồng/năm", "18.000.000 đồng/trường/năm", "Phù hợp khả năng chi trả tại Việt Nam"],
        ["Biên lợi nhuận gộp (Gross Margin)", "**85%** (~509.000 đ/năm)", "**82%** (~14.760.000 đ/năm)", "Cao nhờ kiến trúc xử lý cục bộ Local-First"],
        ["Vòng đời khách hàng (Lifespan) & Giá trị vòng đời (LTV)", "2,2 năm — **LTV: 1.120.000 đ**", "3,5 năm — **LTV: 51.660.000 đ**", "Ổn định theo chu kỳ học THPT & hợp đồng trường"],
        ["Chi phí thu hút 1 khách hàng trả phí (CAC)", "**180.000 đồng**", "**6.500.000 đồng**", "Thấp nhờ lan truyền tự nhiên qua giáo viên & CLB"],
        ["**Tỷ lệ hiệu quả vốn (LTV / CAC) & Thời gian thu hồi CAC**", "**6,2 lần (6,2x) — ≈ 4,2 tháng**", "**7,9 lần (7,9x) — < 5,3 tháng**", "**Vượt xa ngưỡng chuẩn 3,0x của ngành EdTech**"],
        ["Kịch bản Thận trọng (−30% doanh thu Năm 2)", "Doanh thu Năm 2: 1.112,2 triệu", "Lợi nhuận Năm 2: **+90,2 triệu**", "Hòa vốn Quý 4/2028 (Dự án vẫn có lãi an toàn)"],
        ["Kịch bản Cơ sở (Base Case) & Tích cực (+25%)", "Doanh thu Năm 2: 1.588,8 – 1.986,0 tr", "Lợi nhuận Năm 2: **+518,8 – +876,0 tr**", "**Hòa vốn Quý 1–Quý 3/2028; hoàn vốn 18–20 tháng**"],
    ],
    widths=[4.4, 3.8, 3.8, 4.0],
    font=11.5,
    caption="Bảng 10: Chỉ số kinh tế đơn vị (Unit Economics), thời điểm hòa vốn và phân tích độ nhạy 3 kịch bản.",
)

DASH([
    "**Khả năng tăng trưởng, tác động xã hội của dự án:** Dự án tăng trưởng theo lộ trình 4 giai đoạn rõ ràng từ tỉnh Phú Thọ ra toàn quốc, đồng thời tạo tác động giáo dục – xã hội bền vững: giúp bình đẳng hóa cơ hội học lập trình cho học sinh vùng khó khăn, chuyển đổi phương thức kiểm tra môn Tin học từ trên giấy sang chấm thực hành tự động trên máy, và khơi dậy tinh thần tự chủ công nghệ, nghiên cứu khoa học STEM trong học sinh phổ thông:",
])

T(
    ["Giai đoạn & Thời gian", "Mục tiêu mở rộng quy mô & Công nghệ", "Chỉ số đo lường kết quả (KPI)"],
    [
        ["**Giai đoạn 1: Pilot tại Phú Thọ** (Tháng 11–12/2026)", "Triển khai thử nghiệm thực tế tại 3–5 trường THPT/CLB Tin học tỉnh Phú Thọ; tổ chức 3 giải DrgX Mini-Contest.", "Tối thiểu **03 biên bản xác nhận Pilot**, ≥ 200 phiếu khảo sát, ≥ 100 người dùng hoạt động/tuần."],
        ["**Giai đoạn 2: Thương mại hóa 1.0** (Năm 2027)", "Ra mắt Auto-update, Dashboard quản lý lớp học cho giáo viên; mở rộng ra các tỉnh Trung du và Miền núi phía Bắc.", "Đạt **5.000 người dùng**, **08 trường trả phí**, doanh thu **244,9 triệu đồng**."],
        ["**Giai đoạn 3: Hòa vốn & Nhân rộng** (Năm 2028)", "Mở rộng toàn quốc; bổ sung ngân hàng 200+ bài toán; tích hợp API quản lý trường học.", "Đạt **30.000 người dùng**, **40 trường trả phí**, doanh thu **1.588,8 triệu**, **hòa vốn Quý 3/2028**."],
        ["**Giai đoạn 4: Hệ sinh thái Quốc gia** (Năm 2029)", "Mở rộng sang chấm tự động Web/SQL và lập trình vi điều khiển STEM IoT/Robotics; hợp tác giải đấu khu vực.", "Đạt **120.000 người dùng**, **150 trường trả phí**, doanh thu **7.594,0 triệu**, lợi nhuận **+4.094,0 triệu**."],
    ],
    widths=[3.6, 6.8, 5.6],
    font=12,
    caption="Bảng 11: Lộ trình tăng trưởng và mở rộng quy mô dự án giai đoạn 2026–2029.",
)

# ---------------------------------------------------------------------------
# 5. Các kênh truyền thông (Đúng 4 ý tại Phụ lục 04 - Trang 11 PDF)
# ---------------------------------------------------------------------------
H3("5. Các kênh truyền thông")

DASH([
    "**Lập kế hoạch truyền thông tổng thể:** Vì người sử dụng hàng ngày là **học sinh**, người quyết định áp dụng tại lớp là **giáo viên Tin học / Ban giám hiệu**, còn người chi trả gói cá nhân là **phụ huynh**, DrgX thiết kế kế hoạch truyền thông tổng thể chia làm 3 mũi nhọn đồng bộ với ngân sách Năm 1 là **55 triệu đồng** (15 triệu tổ chức Pilot & Mini-Contest tại trường; 15 triệu sản xuất chuỗi video ngắn & học liệu; 15 triệu truyền thông số nhắm mục tiêu hẹp; 10 triệu ấn phẩm gian hàng, CLB và giải thưởng).",
    "**Xây dựng công cụ truyền thông:** Nhóm đã xây dựng hoàn chỉnh bộ công cụ truyền thông đa kênh gồm: (1) **Cổng Website sản phẩm (`web/` gồm 7 trang chuẩn SEO + 5 giao diện trực quan)** cho phép trải nghiệm thử trình chấm ngay trên trình duyệt (`judge-demo.html`); (2) **Video Intro nhận diện thương hiệu động** tích hợp trong ứng dụng và **Video Clip thuyết trình ≤ 03 phút** chuẩn Phụ lục 05; (3) **Bộ hồ sơ ấn phẩm in A4, Poster A3 và cẩm nang hướng dẫn giáo viên**; (4) **Kiosk trải nghiệm trực tiếp 3 trạm** tại ngày hội STEM và Vòng Chung kết.",
    "**Giải pháp truyền thông độc đáo và khác biệt:** Thay vì quảng cáo đại trà tốn kém, DrgX triển khai 3 giải pháp truyền thông mang đậm tính tương tác công nghệ: (1) **Chiến dịch video ngắn “60 Giây Bắt Sống Test Sai (Catch the Counterexample)”** trên TikTok/YouTube Shorts — quay trực tiếp cảnh một bài code C++ tưởng như đúng hết nhưng bị công cụ *Differential Stress Test 3 cột* của DrgX lật tẩy lỗi tràn số chỉ trong 5 giây; (2) **Mô hình “Đấu Trường Thuật Toán 45 Phút (DrgX Mini-Contest)”** — phối hợp cùng CLB Tin học các trường THPT tổ chức thi đấu trực tiếp qua *Exam Server `:8765`*, giúp 100% học sinh tham gia cài và thành thạo CP Studio ngay sau một tiết sinh hoạt; (3) **Mạng lưới Đại sứ Học sinh (DrgX Student Ambassador)** tại mỗi đội tuyển HSG cấp trường.",
    "**Dự kiến kênh truyền thông để tiếp cận khách hàng và đánh giá hiệu quả của kênh truyền thông đó:** Hiệu quả của từng kênh truyền thông được đo lường bằng chỉ số chuyển đổi thực tế (cam kết 12 tháng đầu đạt tối thiểu **05 trường Pilot có biên bản xác nhận**, **≥ 1.000 lượt cài đặt**, **≥ 50.000 lượt xem video kỹ thuật** và **tỷ lệ giữ chân sau 7 ngày D7 Retention ≥ 30%**):",
])

T(
    ["Nhóm khách hàng mục tiêu", "Thông điệp truyền thông cốt lõi", "Kênh truyền thông tiếp cận", "Chỉ số đánh giá hiệu quả kênh (KPI)"],
    [
        ["1. Học sinh THCS/THPT & Sinh viên", "“Cài 1 lần, bấm F9 chấm ngay — Săn test WA trong 30 giây, giao diện cực chất”", "TikTok/Shorts, Discord/Facebook CLB Tin học, GitHub, Đại sứ học sinh", "Số lượt tải bản Free (≥ 1.000); tỷ lệ quay lại sau 7 ngày D7 Retention (≥ 30%)"],
        ["2. Giáo viên Tin học & Nhà trường", "“Tổ chức kiểm tra 40 máy qua mạng LAN trong 2 phút — Sạch AI, có sẵn lọc đạo văn”", "Hội thảo cụm trường, tập huấn chuyên đề, bộ đề mẫu giáo viên, Pilot miễn phí", "Số trường ký biên bản Pilot (≥ 05 trường Năm 1) & tỷ lệ nâng cấp gói School (08 trường)"],
        ["3. Phụ huynh học sinh", "“Con học lập trình an toàn, có lộ trình 12 tuần tiếng Việt rõ ràng, tiết kiệm chi phí”", "Fanpage giáo dục, báo cáo kết quả CLB, bản tin tiến độ học tập Learn Hub", "Tỷ lệ chuyển đổi từ bản Free lên Gói Pro cá nhân (đạt 3% → 5%, tương đương 150 học sinh Năm 1)"],
    ],
    widths=[3.2, 4.4, 4.2, 4.2],
    font=12,
    caption="Bảng 12: Kế hoạch kênh truyền thông tiếp cận khách hàng và chỉ số đánh giá hiệu quả.",
)

PAGEBREAK()
P("Để thuận tiện cho Hội đồng Giám khảo thẩm định theo **Phụ lục 06 (Tiêu chí chấm Vòng Chung kết — Thang 100 điểm)** của Kế hoạch số 153/KH-SGDĐT ngày 25/9/2026, bảng dưới đây tổng hợp vị trí trình bày và minh chứng thực tế của dự án DrgX đối với từng tiêu chí:")

T(
    ["STT", "Tiêu chí đánh giá chi tiết theo Phụ lục 06", "Thang điểm", "Vị trí & Minh chứng thực tế trong hồ sơ dự án DrgX"],
    [
        ["**1**", "**Sự cần thiết, mức độ ứng dụng thực tế theo quy mô**", "**20**", "**Mục III.II.1 (Bảng 1 & Bảng 2)**"],
        ["1.1", "Sự cần thiết của sản phẩm, dịch vụ đối với nhu cầu thị trường", "5", "Giải quyết 6 nỗi đau thực tế; giảm thời gian cài đặt từ 120 phút xuống < 60 giây; chấm F9 < 0,5 giây."],
        ["1.2", "Giá trị của sản phẩm, dịch vụ đem lại cho khách hàng, cộng đồng và xã hội", "5", "Miễn phí trọn đời gói cơ bản; chạy Offline/LAN & Web Lab cho phòng máy trường huyện/miền núi."],
        ["1.3", "Đánh giá đối tượng, phân khúc khách hàng mục tiêu đối với sản phẩm, dịch vụ", "5", "Phân tích 4 phân khúc B2C (HS đại trà, HSG/SV) và B2B (Giáo viên/CLB, Nhà trường) tại Bảng 1."],
        ["1.4", "Ứng dụng khoa học, công nghệ trong giải quyết thực tế", "5", "Công nghệ chiến lược theo **QĐ 1131/QĐ-TTg**: Local-first AI, C++17 Judge, SSE, Winnowing k-gram."],
        ["**2**", "**Tính khả thi, tiềm năng của ý tưởng/dự án**", "**15**", "**Mục III.II.2 (Hình 1, Bảng 3, Bảng 4, Bảng 5 & Bảng 6)**"],
        ["2.1", "Tính khả thi trong kế hoạch; nguồn lực tổ chức sản xuất và kinh doanh", "5", "6 thành phần phần mềm **đã chạy thực tế**; vượt qua **68/68 kiểm định tự động** & **36/36 test Studio**."],
        ["2.2", "Tính khả thi về cơ cấu chi phí và mức độ cạnh tranh", "5", "Kiến trúc Local-First giúp chi phí biến đổi ~0đ; biên lợi nhuận gộp **82–85%**; rẻ hơn 70–85% đối thủ."],
        ["2.3", "Tính khả thi của kế hoạch bán hàng, Marketing", "3", "Chiến lược B2B2C Land-and-Expand: từ phòng thi LAN của giáo viên lan tỏa ra học sinh toàn trường."],
        ["2.4", "Khả năng triển khai trong cộng đồng với giải pháp đơn giản, thân thiện", "2", "Khởi chạy 1 chạm `drgx.cmd start`; chế độ Web Lab mở ngay trên trình duyệt không cần quyền Admin."],
        ["**3**", "**Tính mới, độc đáo, sáng tạo**", "**20**", "**Mục III.II.3 (Bảng 7 & Hình 2)**"],
        ["3.1", "Mức độ sáng tạo, mới mẻ của ý tưởng hoặc phương pháp triển khai", "10", "Kiến trúc Kép: **CP Studio** (cách ly AI để thi minh bạch) + **Dev Studio** (có AI Agent để học) + Tự sửa 25 lỗi C++17."],
        ["3.2", "Lợi thế cạnh tranh của sản phẩm/dịch vụ so với sản phẩm có sẵn", "7", "Vượt trội trên 10 tiêu chí kỹ thuật & sư phạm so với IDE truyền thống, Web OJ và Cloud AI IDE (Bảng 7)."],
        ["3.3", "Khả năng tích hợp, mô hình hóa hoặc robot đơn giản để tăng giá trị sáng tạo", "3", "Mô hình hóa Robot STEM 8×8 (BFS/A*/Greedy) & vi mạch Arduino/ESP32 (HC-SR04, PWM L298N, xuất `.ino`) + SSE + Winnowing."],
        ["**4**", "**Tiềm năng của dự án**", "**15**", "**Mục III.II.4 (Bảng 8, Bảng 9, Bảng 10 & Bảng 11)**"],
        ["4.1", "Dự kiến doanh thu, chi phí, lợi nhuận (nếu có)", "5", "Doanh thu 244,9 tr (2027) → 1.588,8 tr (2028) → 7.594,0 tr (2029); lợi nhuận ròng Năm 3 đạt +4.094,0 triệu."],
        ["4.2", "Thời gian thu hồi vốn, hiệu quả nguồn lực", "3", "**LTV / CAC = 6,2x–7,9x**, thu hồi CAC < 5,3 tháng; hòa vốn Quý 3/2028 (kịch bản −30% doanh thu vẫn có lãi)."],
        ["4.3", "Khả năng tăng trưởng, mở rộng dự án", "3", "Lộ trình 4 giai đoạn (Phú Thọ → Miền Bắc → Toàn quốc) và mở rộng chấm Web/SQL/STEM IoT (Bảng 11)."],
        ["4.4", "Tác động giáo dục và xã hội; khơi dậy tư duy khoa học, khởi nghiệp, STEM", "4", "Xóa rào cản công cụ cho học sinh vùng khó; giảm 90% tải coi/chấm thi; lan tỏa tinh thần tự chủ công nghệ."],
        ["**5**", "**Truyền thông và Marketing sản phẩm của dự án**", "**10**", "**Mục III.II.5 (Bảng 12)**"],
        ["5.1", "Kế hoạch truyền thông, chiến lược hướng tới phụ huynh, học sinh, cộng đồng", "5", "Chiến lược thông điệp & KPI riêng cho 3 nhóm: Học sinh, Giáo viên/Nhà trường và Phụ huynh (Bảng 12)."],
        ["5.2", "Giải pháp truyền thông sáng tạo, khác biệt", "5", "Chiến dịch *60 Giây Bắt Sống Test Sai*, giải đấu *DrgX Mini-Contest 45 phút* và mạng lưới Đại sứ Học sinh."],
        ["**6**", "**Năng lực triển khai dự án**", "**20**", "**Mục III.II.2, Biên bản Pilot, Bộ Slide & Gian hàng**"],
        ["6.1", "Khả năng thuyết trình, trình bày ý tưởng", "5", "Bộ trình chiếu 3 chế độ (Toàn bộ / Pitch 5 phút / Video 3 phút chuẩn Phụ lục 05) và cẩm nang phản biện."],
        ["6.2", "Kiến thức cơ bản về tài chính, pháp luật, xã hội", "5", "Nắm vững Unit Economics, giấy phép MIT (`LICENSE`, `NOTICE.md`), Nghị định 13/2023/NĐ-CP và QĐ 1131/QĐ-TTg."],
        ["6.3", "Kỹ năng làm việc nhóm, kỹ năng mềm, tinh thần hợp tác", "5", "Đội ngũ 5 vai trò bổ trợ; quy trình Agile Sprint; hệ thống kiểm định tự động 68/68 chốt chặn (`verify_ecosystem.py`)."],
        ["6.4", "Gian hàng trưng bày đẹp, sáng tạo, có mô hình, video demo hoặc công nghệ", "5", "Gian hàng Phòng Lab 3 trạm tương tác trực tiếp, Video Intro động, Poster A3 và Kiosk chấm thử tại chỗ."],
        ["", "**TỔNG ĐIỂM**", "**100**", "**Đáp ứng đầy đủ 21/21 tiêu chí đánh giá chi tiết của Phụ lục 06**"],
    ],
    widths=[1.1, 5.8, 1.5, 7.6],
    font=10.5,
    caption="Bảng 13: Đối chiếu chi tiết hồ sơ dự án DrgX với 21 tiêu chí chấm Vòng Chung kết tại Phụ lục 06.",
)

<div align="center">
  <img src="web/intro/logo.png" alt="DrgX IDE" width="104" />
  <h1>DrgX IDE</h1>
  <p><strong>Lập trình đã tiến hóa.</strong><br/>
  Môi trường lập trình local-first tích hợp AI Agent &amp; Judge dành cho học sinh Việt Nam.</p>
  <p>
    <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square" />
    <img alt="Rust" src="https://img.shields.io/badge/Rust-2021-B7410E?style=flat-square" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-extension-3178C6?style=flat-square" />
    <img alt="Windows" src="https://img.shields.io/badge/Windows-10%2F11-0078D4?style=flat-square" />
    <img alt="MVP" src="https://img.shields.io/badge/status-v2.0%20SHIP%20READY-34D399?style=flat-square" />
    <img alt="Health Gate" src="https://img.shields.io/badge/Health%20Gate-68%2F68%20PASS%20(100%25)-10B981?style=flat-square" />
    <img alt="Skins" src="https://img.shields.io/badge/Skins-5%20Pro%20Themes-38BDF8?style=flat-square" />
    <img alt="Security" src="https://img.shields.io/badge/Security-Hardened-F59E0B?style=flat-square" />
  </p>
  <p>
    <a href="#bắt-đầu-nhanh-trong-30-giây">⚡ Bắt đầu 30s</a> ·
    <a href="ARCHITECTURE.md">🏛️ Kiến trúc</a> ·
    <a href="SECURITY.md">🛡️ Bảo mật</a> ·
    <a href="CONTRIBUTING.md">🤝 Đóng góp</a> ·
    <a href="CHANGELOG.md">📜 Changelog</a> ·
    <a href="docs/startup/01-bai-thuyet-minh.md">🏆 Hồ sơ Khởi nghiệp</a>
  </p>
</div>

---

## DrgX IDE là gì?

DrgX IDE gộp **editor, terminal, AI Agent, judge đa testcase, stress tester, contest timer, web lab và Hệ sinh thái học tập** vào một môi trường nhẹ, tiếng Việt, chạy được cả khi mất mạng. Học sinh không cần cài 6–8 công cụ rời rạc trước khi viết dòng code đầu tiên.

Sản phẩm gồm các thành phần:

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| **DrgX CP Studio** | DrgX Workbench Core + profile cách ly + extension `drgx-cp` v1.0.0 | Môi trường thi đấu tối giản: judge cục bộ F9/Ctrl+Alt+J (C++17 & Python), exam server-authoritative, không gợi ý AI (Exam Integrity) |
| **DrgX Dev Studio** | DrgX Workbench Core + extension `drgx-dev` v1.0.0 + C++ tools | Môi trường dev: hỏi AI, giải thích, review, sinh test (DrgX Neural AI + BYOK) |
| **Void-bit OJ & Web Học Tập** | C++ Judge Server (`:8080`) + Node Static (`:8000`) | Nền tảng Online Judge 47 bài tập, chấm subtask C++17/Python (12/12 AC), chống đạo văn Winnowing (chép đổi tên biến: 100%), Stress Test 3 cột & 12 trang bài giảng |
| **DrgX Exam Server** | Python (thư viện chuẩn, `:8765`) | Sinh mã phòng, chấm server-authoritative (C++17 & Python), nhật ký nộp bài |
| **DrgX Web Lab** | DrgX Web Server (`:8123`) | IDE trên trình duyệt cho phòng máy không cài được phần mềm |
| **DrgX Extension + Learn Hub** | TypeScript v1.0.0; HTML/CSS/JS tĩnh | Copilot, CP templates, judge panel, timer, 5 skin DrgX; lộ trình 12 tuần, CLB, showcase |

<p align="center">
  <img src="web/intro/drgx_ide_ui.svg" alt="Giao diện DrgX IDE" width="920" />
</p>

---

## Vì sao có DrgX?

- **Phân mảnh:** một bài code cần editor, compiler, extension, judge, stress, timer, AI — mỗi thứ một nơi.
- **Thiếu lộ trình:** học sinh có hàng trăm video/tài liệu nhưng không biết học gì tiếp, luyện bao nhiêu là đủ.
- **Rào cản ngôn ngữ & chi phí:** phần lớn công cụ bằng tiếng Anh, trả phí theo USD.
- **Phòng máy yếu:** không có quyền cài đặt, mạng chập chờn, máy cấu hình thấp.
- **Thiếu phản hồi tức thì:** judge online phải xếp hàng; không có chấm cục bộ đa testcase.
- **AI rời rạc:** mạnh nhưng không tích hợp quy trình học; dữ liệu học sinh là mối lo.

DrgX trả lời bằng một quy trình duy nhất: **cài một lần → F9 chạy → Ctrl+Alt+J chấm toàn bộ test → stress tìm counterexample → timer → web lab → Ctrl+Alt+L mở lộ trình học**.

---

## Tính năng nổi bật

### 🏠 Trang chủ DrgX
- Dashboard mở ngay khi vào thư mục mới: trạng thái proxy, số test, AI, contest timer và workspace.
- Nút thao tác nhanh: tạo bài, chạy, test, judge, stress, timer, hồ sơ, chèn CP, doctor.
- Chọn skin trực tiếp trong dashboard; tự mở một lần cho mỗi workspace, không quấy rầy.
- Mở lại bất cứ lúc nào bằng `Ctrl+Alt+H`, status bar DrgX hoặc Command Palette.

### ⚖️ DrgX Judge
- Chấm toàn bộ `tests/*.in` với `*.out` / `*.a` / `*.ans`.
- Kết quả **AC / WA / RE / TLE**, thời gian từng test, diff output.
- Panel webview trong IDE; phím tắt `Ctrl+Alt+J`; xuất JSON qua proxy nội bộ.
- Extension gửi file đang mở; nếu không có editor, engine ưu tiên `solution.cpp` / `main.cpp`, sau đó file `.cpp` mới nhất. Hỗ trợ C++ và Python.

### 🧪 Stress Tester
- Sinh test ngẫu nhiên bằng generator Python.
- So sánh solution với brute-force, bắt **counterexample** và lưu `stress.in`.
- Chạy tối đa `--n` vòng, giới hạn thời gian `--tl`.

### 🤖 AI Agent & Copilot
- Tích hợp DrgX Neural AI Engine, hỗ trợ nhiều mô hình (Nemotron, Beam, GLM, DeepSeek...).
- Gợi ý code inline, dự đoán cấu trúc dữ liệu/thuật toán CP.
- Local-first: chỉ gửi dữ liệu khi người dùng chủ động gọi AI; hỗ trợ BYOK.

### ⏱ Contest Timer
- Đồng hồ đếm ngược trên status bar.
- Nhắc giờ khi thi đấu; không cần mở tab khác.

### 🌐 Web Lab
- IDE chạy trên trình duyệt, không cài đặt trên từng máy.
- Tự động thay nhận diện thương hiệu; fallback cổng 80 → 8123–8127.
- Phù hợp phòng lab cấu hình thấp hoặc không có quyền admin.

### 🎨 Giao diện gốc
- **5 skin DrgX**: Ion (dark, mặc định), Nebula (tím/hồng), Tokyo (xanh/tím), Matrix (lục/chanh) và Dawn (light).
- Đổi bằng `DrgX: Đổi skin giao diện` trong Command Palette, menu DrgX hoặc dashboard.
- Logo, icon, theme 100% do DrgX thiết kế độc quyền.

### 🎓 Hệ sinh thái học tập
- Mở bằng `Ctrl+Alt+L`, menu **Hệ sinh thái DrgX** hoặc lệnh `DrgX: Learn Hub` trong Command Palette.
- Lộ trình 12 tuần × 4 chặng: nhập môn → nền tảng → giải thuật → sản phẩm.
- Bộ khung CLB 2 tuần/vòng: học – luyện – review – showcase; tối thiểu 3 vai trò.
- Trang giáo viên: gói bài tập, bảng verdict, cuộc thi nội bộ; chạy local, không cần tài khoản.

---

## Bắt đầu nhanh trong 30 giây

Không cần cấu hình phức tạp — sử dụng trực tiếp công cụ điều phối hợp nhất [`drgx.cmd`](drgx.cmd) ngay tại thư mục gốc:

```powershell
.\drgx.cmd verify   # Chạy 68/68 bài kiểm thử tự động toàn hệ sinh thái (5 trụ cột)
.\drgx.cmd doctor   # Kiểm tra toolchain (Python, G++ C++17, Node, DrgX IDE)
.\drgx.cmd start    # Khởi động đồng thời cả 3 dịch vụ nền (:8000 Web, :8080 C++17 OJ, :8765 Exam Server)
.\drgx.cmd studio   # Mở DrgX Studio App độc lập (:45280 — Editor, Judge, Stress, AI Bug-Fix, 47 bài OJ)
.\drgx.cmd oj       # Mở Void-bit Online Judge (:8080) & Web Học Tập (:8000)
.\drgx.cmd tests    # Chấm toàn bộ tests/*.in trong thư mục hiện tại → bảng AC/WA/RE/TLE
.\drgx.cmd --help   # Xem toàn bộ lệnh (init, run, test, tests, stress, cp, studio, oj, start, verify...)
```

Hai bản Studio trên nhân Workbench mở bằng launcher riêng: `products\drgx-cp\run-cp.cmd` (CP Studio) và `products\drgx-dev\run-dev.cmd` (Dev Studio).

### Điểm nhấn kỹ thuật dành cho Developers (Engineering Highlights)

| Hạng mục kỹ thuật | Thiết kế & Chỉ số thực đo | Mã nguồn kiểm chứng |
|---|---|---|
| **Native C++17 OJ Engine** | Binary tĩnh đơn tệp (`~3,8 MB`), chấm C++17/C11/Python 3/Java, đo Peak Working Set Memory (`psapi`), phát luồng kết quả trực tiếp qua **SSE (`text/event-stream`)** | [`products/void-bit/OJ/oj_server.cpp`](products/void-bit/OJ/oj_server.cpp) |
| **Differential Stress Testing** | Tự động biên dịch 3 chương trình (`generator`, `brute`, `solution`) và chạy đối kháng hàng trăm vòng để bắt phản ví dụ (`MISMATCH`) trong vài giây | [`run_stress_test()`](products/void-bit/OJ/oj_server.cpp) & [`stresstest.html`](products/void-bit/stresstest.html) |
| **Winnowing Anti-Cheat** | Thuật toán băm trượt $k$-gram ($k=25, w=15$) chuẩn hóa token phát hiện đạo văn bất chấp đổi tên biến, xóa comment hay định dạng lại code | [`namespace AntiCheat`](products/void-bit/OJ/oj_server.cpp) |
| **Concurrent Classroom Server** | `ThreadingHTTPServer` + `threading.Lock()` + ghi file nguyên tử (`os.replace`) chịu tải cả lớp nộp bài song song mà không cần cài đặt DBMS ngoài | [`products/drgx-cp/server/exam-server.py`](products/drgx-cp/server/exam-server.py) |
| **Defense-in-Depth Security** | Whitelist trình biên dịch (`sanitize_compiler_path`), chặn DoS bộ nhớ (`Content-Length` cap `512KB`/`2MB`), chống Path Traversal & **Admin Guard (`DRGX_ADMIN_TOKEN`)** | [`SECURITY.md`](SECURITY.md) |
| **5 Skins Chuyên nghiệp** | 5 bộ theme gốc (*Ion/Obsidian*, *Nebula*, *Tokyo*, *Matrix*, *Dawn*) chống mỏi mắt đồng bộ trên Web, OJ & Desktop Studio | [`web/assets/site.js`](web/assets/site.js) & [`cppro-ui.js`](products/void-bit/js/cppro-ui.js) |

### Yêu cầu môi trường (khi build từ mã nguồn)
- Windows 10/11, WebView2 Runtime.
- Nhân soạn thảo DrgX Workbench Core.
- Rust (stable), Node.js 20+, g++ (MSYS2 UCRT64) cho C++.
- Python 3.10+ (tùy chọn, cho stress generator).

### Build desktop

```powershell
# PowerShell tại thư mục gốc
.\tauri.ps1 dev      # chạy dev
.\tauri.ps1 build    # build bản release
```

> Bản chạy chuẩn hiện hành: `products/drgx-cp/` và `products/drgx-dev/` — mỗi bản là một app với launcher riêng (`run-cp.cmd`, `run-dev.cmd`), tự dựng profile cách ly, không cần cài đặt. Bộ cài desktop cũ `DrgX-IDE-Setup-0.1.0.exe` vẫn chạy nhưng đang được thay thế dần bởi mô hình hai app.

> `tauri.ps1` ưu tiên biến môi trường `RUSTUP_HOME`, `CARGO_HOME`; nếu chưa có, tự dò vị trí mặc định và thêm Rust, MSYS2 UCRT64, Node.js vào PATH. Trên máy khác, cài đủ Rust/Node.js/g++ rồi chạy `npm install` trong `app/` trước lần build đầu.

> Nếu linker báo `collect2.exe: error: ld returned 57`, kiểm tra PATH đang trộn MinGW cũ (`C:\MinGW\bin`) với MSYS2 UCRT64. Bỏ MinGW cũ hoặc đưa `C:\msys64\ucrt64\bin` lên trước rồi build lại.

### Chạy demo 3 trụ cột sản phẩm & Kiểm thử tự động (`/loop-me`)

```powershell
# Chạy Health Gate kiểm thử tự động toàn diện 5 trụ cột (Web, Extensions, Exam Server, Void-bit OJ, Startup Dossier):
python -X utf8 scripts\verify_ecosystem.py

# Hoặc chạy Demo Doctor (tự kiểm tra toolchain, biên dịch C++17 OJ và chạy Health Gate):
powershell -ExecutionPolicy Bypass -File scripts\demo-doctor.ps1

# Khởi động từng sản phẩm:
products\drgx-cp\run-cp.cmd          # 1. DrgX CP Studio + Exam Server :8765 (ThreadingHTTPServer, 15/15 Smoke PASS & 14/14 SEC PASS)
products\drgx-dev\run-dev.cmd        # 2. DrgX Dev Studio với bridge AI (:45290)
products\void-bit\run-void-bit.cmd   # 3. Void-bit OJ Judge Server :8080 + Web Học Tập :8000 (47 bài, C++/Python/Anti-cheat)
```

### Extension
IDE tự cài extension vào `~/.vscode-server/extensions` khi khởi động. Khi phát triển, sửa `extension/dist/web.js` và `extension/package.json`, sau đó build lại app để nhúng bản mới.

---

## Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                        DrgX IDE Desktop                     │
│  Tauri 2 (Rust)  ──  WebView2  ──  UI shell                 │
│      │                                                      │
│      ├── DrgX proxy 127.0.0.1:45290  ──► DrgX Neural AI     │
│      │        │                                              │
│      │        └── Extension Dev ──► hỏi AI / review / test   │
│      │                                                      │
│      └── Exam Server 127.0.0.1:8765  ──► judge server (py)   │
└─────────────────────────────────────────────────────────────┘
             │
             ├── DrgX Web Lab (port 80/8123+)
             │
             └── DrgX Extension (TypeScript)
                    ├── Judge webview panel
                    ├── Stress wizard
                    ├── Contest timer
                    ├── Copilot / CP predictor
                    ├── Learn Hub (lộ trình, CLB, showcase)
                    └── 5 Skin gốc: DrgX Ion / Nebula / Tokyo / Matrix / Dawn
```

---

## Cấu trúc repository

| Đường dẫn | Nội dung |
|---|---|
| `app/` | Desktop app Tauri 2 + Rust; proxy, branding, cài extension/theme |
| `cli/` | Công cụ nội bộ (legacy) — **không nằm trong luồng người dùng**, không phân phối/quảng bá |
| `products/` | **Ba trụ cột hiện hành**: CP Studio (`drgx-cp`), Dev Studio (`drgx-dev`), Void-bit OJ (`void-bit`) |
| `extension/` | Extension TypeScript v1.0.0 + 5 skin DrgX (Ion, Nebula, Tokyo, Matrix, Dawn) |
| `web/` | Website chính thức 7 trang (5 skin chuyên nghiệp, WebP) + Learn Hub (`web/ecosystem/`) |
| `web/intro/` | Trang giới thiệu sản phẩm và logo tĩnh |
| `scripts/` | Pipeline tạo logo/icon, build hồ sơ dự thi, [`verify_ecosystem.py`](scripts/verify_ecosystem.py) & [`demo-doctor.ps1`](scripts/demo-doctor.ps1) |
| `workflows/` | Đặc tả `/loop-me` tự động hóa cấp hệ sinh thái (`ecosystem-health-gate.md`, `contest-demo-readiness.md`, `startup-dossier-sync.md`) |
| `ARCHITECTURE.md` | Sơ đồ kiến trúc 5 trụ cột, cơ chế bảo mật (Compiler Whitelist, Content-Length Guard, Admin Guard) & luồng dữ liệu |
| `SECURITY.md` | Chính sách bảo mật, Threat Model & quy trình công bố lỗ hổng |
| `CONTRIBUTING.md` | Hướng dẫn đóng góp mã nguồn, thêm bài tập mới & tiêu chuẩn PR |
| `CODE_OF_CONDUCT.md` | Quy tắc ứng xử cộng đồng & tiêu chuẩn liêm chính học thuật (Exam Integrity) |
| `CHANGELOG.md` | Nhật ký nâng cấp hệ thống lên v2.0.0 |
| `NOTES.md` | Ghi chú quyết định thiết kế & từ điển thuật ngữ chuẩn (`/loop-me`) |
| `examples/demo-cp/` | Bộ bài toán mẫu cho Judge/Stress |
| `docs/startup/` | **Hồ sơ dự thi khởi nghiệp**: bài thuyết minh, video script, pitch deck, Q&A, checklist |

---

## Trạng thái & lộ trình

- **Đã có:** ba trụ cột sản phẩm chạy thật (DrgX CP Studio, DrgX Dev Studio, Void-bit OJ 47 bài), Tiền kiểm 5 luật quy chế tệp Themis (`0,19 ms/tệp`, bắt đúng `100/100` bài đơn vị & `10/10` tệp C++17 lịch sử quên sửa `TASK.INP`), phím F9 chấm 10 test trong `p50 = 1,46 s` (phiên ấm `0,78 s`), Exam Server `15/15 Smoke PASS` & `14/14 SEC PASS` (`Low Integrity` + `Win32 JobObject 256 MB` + `studentToken`), Void-bit Judge C++ `47/47 AC (564 test / 81,65 s)` + Winnowing `780 cặp / 37,82 ms` (Recall `85,0%`, FPR `4,0%`), `drgx-studio.exe` mở trong `320 ms` (25/25 mẫu lỗi C++17 tiếng Việt ngoại tuyến), web lab, extension v1.0.0, Learn Hub, 5 skin gốc chống mỏi mắt.
- **2026–2027 (Giai đoạn 1 — Kiểm chứng tại Phú Thọ):** Thí điểm miễn phí 100% tại **08 trường THCS/THPT** (~1.200 học sinh, ≥320 WAU); hoàn thiện 60 bài toán & 15 đề thi thử.
- **2028 (Giai đoạn 2 — Thương mại hóa tỉnh Phú Thọ):** Mở rộng 25 trường, chuyển đổi **08 trường trả phí** (Gói Trường 6–12 tr/năm, BQ 8,0 tr) + **04 HĐ Giải đấu Mini-Contest** (7,0 tr/HĐ) + **120 HS Gói Pro Offline** (300.000 đ/HS/năm); Doanh thu `128,0 triệu`, **EAT năm 2028 đạt `+2,55 triệu`** (H2 đạt `+26,55 triệu`).
- **2029 (Giai đoạn 3 — Mở rộng liên tỉnh Vĩnh Phúc, Yên Bái, Tuyên Quang):** Phục vụ **40 trường** (**16 trường trả phí**, **11 HĐ Giải đấu**, **270 HS Gói Pro**); Doanh thu `286,0 triệu` (71,7% B2B), EBT `+91,3 triệu (31,9%)`, Thuế TNDN 15% `13,7 triệu`, **Lợi nhuận ròng EAT `+77,6 triệu (27,1%)`** (chế độ tinh gọn 1 CTV: **`+99,0 triệu`**); Lãi ròng lũy kế 2026–2029 đạt **`+4,15 triệu`**, Số dư tiền mặt cuối 2029 đạt **`+124,15 triệu`** (`LTV/CAC = 9,15 lần`). *(Kịch bản mở rộng liên tỉnh tốc độ cao 30 trường/800 HS: DT 609,6 triệu, EAT +213,6 triệu).*

Chi tiết tài chính: [`docs/startup/financial-model.csv`](docs/startup/financial-model.csv).

---

## Hồ sơ dự thi khởi nghiệp 2026–2027

Dự án tham dự **Cuộc thi “Học sinh, sinh viên với ý tưởng khởi nghiệp” tỉnh Phú Thọ** — lĩnh vực **01: Công nghiệp, chế tạo, AI, STEM**.
- **Đơn vị & Đội ngũ thực hiện:** Tập thể **Lớp 9A2 — Trường THCS Sông Lô (Phú Thọ)** gồm 4 thành viên: **Lê Tiến Dũng** (Nhóm trưởng), **Lê Bình Minh** (Nhóm phó · Kỹ thuật & AI), **Nguyễn Minh Quang** (Thành viên · Phòng thi LAN, STEM & QA) và **Nguyễn Minh Đăng** (Thành viên · Tài chính, Học liệu & Truyền thông).

- [Web thuyết trình tương tác 12 Slide (`S01 → S12`)](presentation/index.html) — trình chiếu trực tiếp + 5 Slide phụ lục hỏi đáp (`PL1 → PL5`).
- [Kịch bản lời thoại 2 phút (12 Slide · Đủ 4 thành viên 9A2)](presentation/KICH-BAN-2-PHUT.md) — [bản DOCX](presentation/Loi-thoai-thuyet-trinh-2-phut-DrgX.docx) · [bản PDF](presentation/Loi-thoai-thuyet-trinh-2-phut-DrgX.pdf).
- [README hồ sơ](docs/startup/README.md) — tóm tắt cuộc thi, checklist, cách in.
- [Bài thuyết minh (DOCX)](docs/startup/print/bai-thi-drgx-ide.docx) — A4, Times New Roman 14; [bản PDF](docs/startup/print/bai-thi-drgx-ide.pdf).
- [Biên bản xác nhận Pilot (DOCX)](docs/startup/print/bien-ban-xac-nhan-pilot.docx) — [bản PDF](docs/startup/print/bien-ban-xac-nhan-pilot.pdf).
- [Bản đăng ký dự thi (DOCX)](docs/startup/print/dang-ky-du-thi.docx) — 1 trang, đơn vị điền và đóng dấu; [bản PDF](docs/startup/print/dang-ky-du-thi.pdf).
- [Kịch bản video 3 phút](docs/startup/02-kich-ban-video.md).
- [Pitch deck](docs/startup/pitch/pitch.html) — 12 slide, trình chiếu bằng `←` `→`; [bản PDF](docs/startup/pitch/pitch.pdf).
- [Hỏi đáp Hội đồng](docs/startup/04-hoi-dong-qa.md).
- [Checklist hồ sơ](docs/startup/05-checklist-ho-so.md).
- [Poster A3](docs/startup/print/poster-a3.html) — [bản PDF](docs/startup/print/poster-a3.pdf).
- [Bộ demo Judge/Stress](examples/demo-cp/README.md).

---

## Giấy phép & sở hữu trí tuệ

- **Mã nguồn gốc DrgX** (hai bản CP/Dev Studio, exam server, extension, judge engine, branding, theme, web lab integration): bản quyền của nhóm DrgX; xem [`LICENSE`](LICENSE).
- **Khung nền & Thư viện mã nguồn mở** — tuân thủ nghiêm ngặt **giấy phép MIT & Apache-2.0**; xem [`NOTICE.md`](NOTICE.md).
- **Quyền riêng tư** — nguyên tắc local-first, dữ liệu AI và dữ liệu học sinh; xem [`PRIVACY.md`](PRIVACY.md).
- **AI** — DrgX kết nối qua cầu nối cục bộ và BYOK; người dùng chọn mô hình/API key. Không dùng mã nguồn học sinh để huấn luyện.
- Logo, theme, ảnh và video trong repo là tài sản gốc của DrgX.

---

## Cộng đồng, Đóng góp & Quản trị Mã nguồn mở

Dự án được phát triển bởi **Nhóm DrgX — Lớp 9A2, Trường THCS Sông Lô (Phú Thọ, Việt Nam)** với mục tiêu nâng tầm trải nghiệm học tập và thi đấu lập trình tại các trường phổ thông & đại học.

- 🤝 **Đóng góp mã nguồn & bộ đề**: Xem hướng dẫn chi tiết tại [`CONTRIBUTING.md`](CONTRIBUTING.md).
- 🛡️ **Báo cáo bảo mật**: Xem mô hình đe dọa và chính sách công bố lỗ hổng tại [`SECURITY.md`](SECURITY.md).
- 📜 **Quy tắc ứng xử**: Tuân thủ chuẩn mực cộng đồng tại [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- 🏛️ **Kiến trúc kỹ thuật**: Xem sơ đồ phân lớp và luồng dữ liệu tại [`ARCHITECTURE.md`](ARCHITECTURE.md).
- ⭐ **Ủng hộ dự án**: Nếu bạn thấy kiến trúc Local-First Judge, Stress Tester và bộ 5 Skins chuyên nghiệp của DrgX hữu ích, hãy tặng dự án một **Star (⭐)** trên GitHub!

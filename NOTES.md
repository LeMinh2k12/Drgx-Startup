# NOTES — DrgX Ecosystem `/loop-me` Engineering & Modernization

## User decisions already locked
- **Workflow Architecture (Q1 → Option A)**: Root-level `/loop-me` workflow hub at `workflows/` + `NOTES.md` orchestrating all 5 pillars (`web/`, `products/void-bit/`, `products/drgx-cp/`, `products/drgx-dev/`, `docs/startup/`), while preserving and linking the 9 specialized Void-bit loops inside `products/void-bit/workflows/`.
- **Backend Hardening & Concurrency (Q2 → Option A)**:
  - `products/void-bit/OJ/oj_server.cpp`: Strict compiler whitelist (`sanitize_compiler_path`), guarded `Content-Length` parsing (`try/catch` + `2 MB` payload cap), safe hex validation in `url_decode()`, `thread_local std::mt19937` (`thread_safe_rand`), mutex-protected local submission logging, value-captured stdin writer thread, and static recompile (`oj_server.exe`).
  - `products/drgx-cp/server/exam-server.py`: Upgraded from single-threaded `HTTPServer` to `ThreadingHTTPServer`, `DATA_LOCK = threading.Lock()` around `exams.json`, atomic file replacement (`os.replace`), `512 KB` payload cap, and regex validation on `exam_code`.
- **Admin Endpoint Guard (Q3 → Option A)**:
  - Administrative routes (`POST /exam/create` on port `8765`, `POST /api/reload` and `POST /api/generate` on port `8080`) enforce `X-DrgX-Admin-Token` / `Authorization: Bearer <token>` when `DRGX_ADMIN_TOKEN` is set in the environment, and default to allowing loopback (`127.0.0.1` / `::1`) when unset so 1-click local demos and smoke tests work with zero friction while LAN clients cannot trigger admin actions unauthorized.
- **Skin System**:
  - 5 professional skins (`Ion/Obsidian`, `Nebula`, `Tokyo`, `Matrix`, `Dawn`) synchronized across `web/`, `products/void-bit/`, `products/drgx-cp/extension/`, and `products/drgx-dev/extension/`.
- **Release Checkpoint Philosophy**: Push right — run all automated checks (`scripts/verify_ecosystem.py`) autonomously and present one late decision-ready **Brief** (`workflows/reports/ecosystem-health-brief.md`) rather than noisy intermediate logs.
- **MIT-Grade Document Engineering & Visual QA Loop (Q1–Q4 → Recommended)**:
  - **Zero Orphan Table Splits (A2)**: Tables `Bảng 1` → `Bảng 12` in `bai-thi-drgx-ide.docx`/`.pdf` and `Bảng 1` → `Bảng 2` in `bien-ban-xac-nhan-pilot.docx`/`.pdf` must never split 1–2 orphan rows across a page break (`keep_with_next` enforced across table rows and caption). The 21-criteria Phụ lục 06 rubric mapping table (`Bảng 13`) starts cleanly on a new page and fits across 2 consecutive pages without dangling headers or 1-row tail spillovers.
  - **MIT Senior Thesis Technical Rigor (A3)**: `scripts/startup_content.py` includes:
    1. Formal mathematical models & complexity bounds: Winnowing rolling polynomial hash $H(s_{i..i+k-1})$ with $k=5, w=4$, Jaccard fingerprint similarity $\mathcal{O}(N)$ per submission and $\mathcal{O}(M^2 \cdot |F|)$ classroom matrix; Differential Stress Testing state machine converging to minimal counterexample $I^*$; STEM Robot 8×8 grid pathfinding ($A^*$ Manhattan heuristic $f(u)=g(u)+h(u)$) & Arduino/ESP32 PWM duty-cycle control.
    2. Empirical Benchmark & Resource Table (`p50`, `p95` latencies, Peak RAM `KB`, binary size `MB`, concurrent LAN load 40–60 clients).
    3. Two bordered academic architectural block schematics (`Hình 1`: Dual-Studio & LAN Classroom Control Center Architecture; `Hình 2`: 4-Engine Execution Pipeline — C++17 SSE Judge, 3-Column Differential Stress Test, Winnowing Token Fingerprint, and Closed-Loop STEM Robotics/Arduino Simulator) formatted in 100% black-and-white `Times New Roman`.
  - **4-Deliverable Print & PDF Synchronization + Layout Gate (A4)**: `scripts/build_startup_docs.py` and `scripts/generate_pitch_docx.py` generate and export `.docx` + `.pdf` for all 4 documents (`bai-thi-drgx-ide`, `dang-ky-du-thi`, `bien-ban-xac-nhan-pilot`, `kich-ban-thuyet-trinh`), verified automatically by `scripts/verify_docs_layout.py` and `scripts/check_placeholders.py`.
- **Void-bit 42-Lesson Curriculum Restoration & Web Integration (`workflows/voidbit-lessons-web-sync.md`)**:
  - **Navbar & Config Sync**: Restored `lessons` (`Bài giảng` -> `Lesson/index.html`) across `products/void-bit/config/nav.json`, `products/void-bit/js/cppro-ui.js`, and all 16 HTML pages in `products/void-bit/` (`scripts/sync_voidbit_lessons.py`).
  - **Dual Curriculum on `courses.html` & `docs.html`**: `products/void-bit/courses.html` and `docs.html` now showcase all **8 categories — 42 VNOI-Wiki-style lessons** (`js/lessons-data.js`) alongside the **6 quick-reference courses — 12 Cheat-sheet notes** (`js/docs-data.js`), with synchronized category counts in `js/data.js`, `js/lang.js` (`cat.geometry`, default `vi`), `js/lessons.js`, and `js/app.js`.
  - **Main Website Interactive Lesson Explorer (`web/void-bit.html` & `web/ecosystem/index.html`)**: Embedded the interactive **Thư viện 8 Chuyên đề — 42 Bài giảng Thuật toán & C++17 (`#baigiang`)** with category filter pills, live search, and an inline C++17 Lesson Reader Panel linking directly to `http://127.0.0.1:8000/Lesson/index.html?cat=<catId>&id=<lessonId>`.

## Observed world
- **Monorepo Root**: Contains 5 core pillars without a root `package.json`; builds rely on Python 3.10+, Node.js 18+, MinGW-w64 `g++` (C++17), and PowerShell.
- **Landing & Hub Website (`web/`)**: 7 static HTML pages (`index`, `features`, `void-bit`, `download`, `about`, `judge-demo`, `ecosystem/index`), `assets/site.css` v2.0, `assets/site.js` v2.0, WebP media, `sitemap.xml`, `robots.txt`, `_headers`.
- **Void-bit Platform (`products/void-bit/`)**: Static frontend (`serve.js` on port `8000`) + native C++17 OJ backend (`OJ/oj_server.cpp` → `OJ/oj_server.exe` on port `8080`) with 47 problems, contests, Winnowing anti-cheat, differential stress test, and 9 sub-workflows in `products/void-bit/workflows/`.
- **DrgX CP (`products/drgx-cp/`)**: DrgX Extension v1.0.0 (`extension/`, `drgx-cp.vsix`) + LAN Classroom Exam Server (`server/exam-server.py` on port `8765`) + `server/smoke-test.py`.
- **DrgX Dev (`products/drgx-dev/`)**: DrgX Extension v1.0.0 (`extension/`, `drgx-dev.vsix`) with 7 real project templates, Toolchain Doctor, and Learn Hub (`Ctrl+Alt+L`).
- **Startup Dossier (`docs/startup/` & `scripts/`)**: Generated by `scripts/startup_content.py`, `scripts/build_startup_docs.py`, and audited by `scripts/check_placeholders.py`.

## Canonical terms
- **Pillar**: One of the 5 top-level subsystems (`web`, `void-bit`, `drgx-cp`, `drgx-dev`, `startup-dossier`).
- **Health Gate**: The unified verification harness (`scripts/verify_ecosystem.py`) that validates all 5 pillars end-to-end.
- **Demo Doctor**: The PowerShell pre-flight & launcher utility (`scripts/demo-doctor.ps1`) for live contest/jury demonstrations.
- **Admin Guard**: Loopback-by-default or `DRGX_ADMIN_TOKEN` header verification protecting state-mutating administrative endpoints.
- **Brief**: A concise, decision-ready Markdown summary emitted to `workflows/reports/` with pass/fail status, latency metrics, and rollback notes.

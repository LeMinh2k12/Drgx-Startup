# Workflow: voidbit-lessons-web-sync

Loop: Synchronize Void-bit's 42-lesson VNOI-Wiki curriculum (`js/lessons-data.js` + `Lesson/index.html`) and 12 quick Cheat-sheet notes (`js/docs-data.js` + `docs.html`) across all Void-bit pages (`products/void-bit/`) and the main DrgX showcase website (`web/void-bit.html`, `web/ecosystem/index.html`).

Trigger: event. Any change to `products/void-bit/js/lessons-data.js`, `products/void-bit/Lesson/*`, `products/void-bit/courses.html`, `products/void-bit/docs.html`, `products/void-bit/config/nav.json`, or `web/void-bit.html`.

Checkpoint: none. Runs autonomously and is enforced by `scripts/verify_ecosystem.py`.

## Source of Truth
1. **42 Deep Algorithm Lessons (`products/void-bit/js/lessons-data.js`)**:
   - 8 canonical categories (`paradigms`: 10, `linear-ds`: 4, `nonlinear-ds`: 3, `advanced-ds`: 7, `graph-algos`: 8, `math`: 5, `string`: 3, `geometry`: 2 — total **42 lessons**).
   - Rendered in full at `products/void-bit/Lesson/index.html?cat=<catId>&id=<lessonId>` with C++17 syntax highlighting, Active Recall Quiz (`lesson.js`), and direct links to the 47 Void-bit OJ problems.
2. **12 Quick Cheat-Sheet Notes (`products/void-bit/js/docs-data.js`)**:
   - 6 groups (`cpp`, `stl`, `algo`, `dp`, `graph`, `math` — total **12 notes**) rendered at `products/void-bit/docs.html?doc=<docId>`.

## Synchronization Steps
1. **Navbar & Config Parity (`products/void-bit/`)**:
   - Ensure `config/nav.json` includes `lessons` (`Bài giảng` -> `Lesson/index.html`) in both `desktop` and `mobile` nav arrays.
   - Ensure `js/cppro-ui.js` detects `/Lesson/` routes as `lessons` so `data-nav="lessons"` is highlighted active.
   - Ensure every HTML navbar in `products/void-bit/*.html` and `products/void-bit/Lesson/index.html` includes `Bài giảng` (`data-nav="lessons"`).
2. **Course & Lesson Library Integration (`products/void-bit/courses.html`, `docs.html`, `index.html`, `js/data.js`, `js/lang.js`, `js/app.js`, `js/lessons.js`)**:
   - Sync `VOID_DATA.courses` in `js/data.js` and category keys in `js/lang.js` (`cat.geometry` included, default language `vi`) with the exact 8 categories & 42 lessons in `js/lessons-data.js`.
   - Update `js/lessons.js` (`openLessonViewer(initialCatId)`) and `js/app.js` (`initCourseClick`, `renderCourses`) so clicking any course card opens that category immediately and tracks completion from `voidbit_lesson_done`.
   - Upgrade `courses.html` to showcase **both**:
     - Primary section: **8 Chuyên đề · 42 Bài giảng chuyên sâu** (`LESSONS.categories` from `js/lessons-data.js`), with search, difficulty badges, progress tracking, and direct links to `Lesson/index.html?cat=...&id=...`.
     - Secondary section: **6 Khóa Sổ tay Cấp tốc · 12 Ghi chú Cheat-sheet** (`DOCS` from `js/docs-data.js`), linking to `docs.html?doc=...`.
   - Upgrade `docs.html` with a direct cross-link banner and 42-lesson directory pointing to `Lesson/index.html`.
3. **Main DrgX Website Showcase (`web/void-bit.html` & `web/ecosystem/index.html`)**:
   - Embed an interactive **Thư viện 42 Bài giảng Thuật toán & C++17 (8 Chuyên đề VNOI-Wiki)** explorer in `web/void-bit.html` (`#baigiang`) with category filter tabs, search, interactive lesson preview drawer/modal (summary, complexity, C++17 template, linked OJ problem), and deep-links to `http://127.0.0.1:8000/Lesson/index.html?cat=...&id=...`.
   - Add a direct navigation pill & callout in `web/ecosystem/index.html` linking to `../void-bit.html#baigiang` and `http://127.0.0.1:8000/Lesson/index.html`.
4. **Automated Gate (`scripts/verify_ecosystem.py`)**:
   - Assert that `config/nav.json`, `courses.html`, `docs.html`, `Lesson/index.html`, and `web/void-bit.html` expose all 8 categories and 42 lessons without broken links.

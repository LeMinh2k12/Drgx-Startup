# Workflow: ecosystem-health-gate

Loop: Full-ecosystem quality, security, accessibility, and judge regression gate across all 5 pillars (`web`, `void-bit`, `drgx-cp`, `drgx-dev`, `docs/startup`).

## 1. Trigger
Event-driven: Any commit, PR, or local change touching `web/**`, `products/**`, `scripts/**`, or `docs/startup/**`, or manual invocation before a release/demo.

## 2. Inputs & Preconditions
- Python 3.10+ (`python`), MinGW-w64 `g++` (C++17), and Node.js 18+ (`node`) available on `PATH`.
- Binary `products/void-bit/OJ/oj_server.exe` compiled from latest `products/void-bit/OJ/oj_server.cpp`.
- Sub-workflow specs in `products/void-bit/workflows/*.md` available for deep Void-bit drilldowns.

## 3. Autonomous Execution Steps
1. **Startup Dossier & Placeholder Gate**:
   - Run `scripts/check_placeholders.py` logic against `docs/startup/` and `README.md` to ensure zero unresolved `[...]` placeholders and verify presence of `.docx`/`.html`/`.md` artifacts.
2. **Web Quality, SEO, WCAG 2.2 AA & 5 Skins Gate (`web/`)**:
   - Audit all 6 HTML pages (`index.html`, `cp.html`, `dev.html`, `void-bit.html`, `privacy.html`, `terms.html`) for valid `<title>`, `<meta name="description">`, `<link rel="canonical">`, JSON-LD (`application/ld+json`), skip-link, and 5 skins.
   - Verify all referenced local assets (`assets/*.webp`, `assets/*.png`, `assets/site.css`, `assets/site.js`, `robots.txt`, `sitemap.xml`, `_headers`) exist on disk.
3. **VS Code Extensions & VSIX Gate (`products/drgx-cp/` & `products/drgx-dev/`)**:
   - Parse `package.json` and all 5 theme JSON files in both extensions (`v1.0.0`, valid JSON, 5 matching skin IDs, `skin` and `learn` command registration).
   - Verify `drgx-cp.vsix` and `drgx-dev.vsix` exist and are non-empty packages.
4. **DrgX CP Classroom Exam Server Gate (`products/drgx-cp/server/`)**:
   - Spawn `exam-server.py` on an ephemeral or configured local port (`8765`), run all 11 smoke checks (health, create, join, `NO_TESTS`, C++ AC/WA/CE/TLE, Python AC, 404 invalid room, and 4-thread concurrent submissions), plus verify `413 Payload Too Large` on oversized payloads.
5. **Void-bit OJ C++17 Backend & Problem Corpus Gate (`products/void-bit/OJ/`)**:
   - Validate sample problems via `OJ/tools/validate_problem.py`.
   - Spawn `oj_server.exe` on an ephemeral local port, verify `GET /api/health`, `GET /api/problems` (26 problems), `GET /api/contests` (7 contests), `POST /api/judge` (C++17 AC + Python 3 AC + compiler whitelist enforcement), `POST /api/anti-cheat/compare` (Winnowing similarity detection), and malformed `Content-Length` resilience (`400`/`413` without crashing).

## 4. Guardrails & Budgets
- Simple C++17 / Python 3 judge submission round-trip: `< 2500 ms`.
- Concurrent 4-student classroom submission burst: `< 5000 ms` total with zero lost writes in `exams.json`.
- Zero unhandled exceptions or server crashes on malformed headers.

## 5. Checkpoint Policy
- **Checkpoint: None during green runs** (fully autonomous execution via `python -X utf8 scripts/verify_ecosystem.py`).
- **Owner Checkpoint on failure or release sign-off**: Present only the generated Brief at `workflows/reports/ecosystem-health-brief.md`.

## 6. Output Artifact (The Brief)
- Writes `workflows/reports/ecosystem-health-brief.md` containing:
  - Overall Ship/Hold status and pass count.
  - Per-pillar telemetry table (checks passed, latency ms, health score).
  - Links to sub-reports in `products/void-bit/workflows/reports/`.

## 7. Failure & Rollback Recovery
- If `oj_server.exe` fails a check after editing `oj_server.cpp`, revert the offending hunk and recompile with `g++ -std=c++17 -O2 -o oj_server.exe oj_server.cpp -lws2_32 -lwinhttp -lpsapi -static`.
- If `exam-server.py` fails concurrent persistence, remove any stale `.tmp` file and verify `DATA_LOCK` covers read-modify-write.

## 8. Done When
- `python -X utf8 scripts/verify_ecosystem.py` exits with code `0` and writes a 100% green `workflows/reports/ecosystem-health-brief.md`.

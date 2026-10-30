# Workflow: startup-dossier-sync

Loop: Synchronize MIT-grade technical specifications, mathematical models, empirical benchmarks, architectural block diagrams (`Hình 1`, `Hình 2`), and 100% Kế hoạch 153/KH-SGDĐT print/PDF formatting across all 4 competition documents.

## 1. Trigger
Event-driven: Any change to `scripts/startup_content.py`, `scripts/build_startup_docs.py`, `scripts/generate_pitch_docx.py`, `presentation/KICH-BAN-THUYET-TRINH.md`, or core product metrics.

## 2. Inputs & Preconditions
- Python 3.10+ with `python-docx` and `pypdf` installed.
- WPS Office COM (`Kwps.Application`) or Microsoft Word COM (`Word.Application`) available for deterministic `.docx` → `.pdf` export.
- Single source of truth for competition dossier in `scripts/startup_content.py` and presentation playbook in `presentation/KICH-BAN-THUYET-TRINH.md`.

## 3. Autonomous Execution Steps
1. Update structured content, mathematical models, benchmark tables, and `FIG(...)` architectural diagrams in `scripts/startup_content.py`.
2. Run `python -X utf8 scripts/build_startup_docs.py` to generate and export:
   - `docs/startup/01-bai-thuyet-minh.md`
   - `docs/startup/financial-model.csv`
   - `docs/startup/print/bai-thi-drgx-ide.html`, `.docx`, and `.pdf`
   - `docs/startup/print/dang-ky-du-thi.html`, `.docx`, and `.pdf`
   - `docs/startup/print/bien-ban-xac-nhan-pilot.html`, `.docx`, and `.pdf`
3. Run `python -X utf8 scripts/generate_pitch_docx.py` to generate and export:
   - `presentation/Kich-ban-thuyet-trinh-DrgX.docx` and `.pdf`
   - `docs/startup/print/kich-ban-thuyet-trinh.docx`, `.pdf`, and `.html`
4. Run `python -X utf8 scripts/check_placeholders.py` to assert `0` leftover `[[...]]` placeholders across all print/pitch targets.
5. Run `python -X utf8 scripts/verify_docs_layout.py` to assert:
   - 100% `Times New Roman` font compliance (`0` `w:asciiTheme` / `Calibri` attributes),
   - Exact A4 margins (`Left 3.0cm`, `Top/Bottom/Right 2.0cm`) and top-center 14pt page numbering on official competition forms,
   - Zero leaked Markdown syntax (`**`, `` ` ``, `$`, `[[...]]`),
   - Zero orphan 1-row table splits or dangling table headers across PDF page boundaries,
   - Exact page-count budgets (`dang-ky-du-thi.pdf` = 1 page, `bien-ban-xac-nhan-pilot.pdf` = 2 pages).
6. Run `python -X utf8 scripts/verify_ecosystem.py` to update `workflows/reports/ecosystem-health-brief.md`.

## 4. Guardrails & Budgets
- Zero unreplaced `[[...]]` placeholders allowed in any output artifact.
- Zero orphan 1-row table splits (`keep_with_next` enforced on all single-page tables `Bảng 1` → `Bảng 12` and figures `Hình 1` → `Hình 2`).
- `dang-ky-du-thi.pdf` must be strictly `1` page; `bien-ban-xac-nhan-pilot.pdf` must be strictly `2` pages.

## 5. Checkpoint Policy
- **Push right**: Run all generation, PDF conversion, and layout/typography verification steps autonomously first; present a single decision-ready **Brief** only after all automated gates pass `100% GREEN`.

## 6. Output Artifact (The Brief)
- Regenerated `.docx` and `.pdf` files in `docs/startup/print/` and `presentation/`, plus verification report in `workflows/reports/ecosystem-health-brief.md`.

## 7. Failure & Rollback Recovery
- If `.docx` or `.pdf` write fails due to an open file lock in WPS/Word, close the running office instance and re-run `scripts/build_startup_docs.py`.
- If `verify_docs_layout.py` flags a table page-break split or page-budget overflow, adjust row `keep_with_next` or cell padding in `scripts/build_startup_docs.py` and re-export before surfacing to the user.

## 8. Done When
- All 4 `.docx` and `.pdf` deliverables are freshly exported, pass `check_placeholders.py` (`0` hits), pass `verify_docs_layout.py` (`0` layout/font defects), and pass `verify_ecosystem.py` (`5/5 pillars PASS`).

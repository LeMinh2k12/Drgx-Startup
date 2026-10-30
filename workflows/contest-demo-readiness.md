# Workflow: contest-demo-readiness

Loop: Pre-demo & classroom tournament readiness check (`scripts/demo-doctor.ps1`).

## 1. Trigger
Manual invocation (`powershell -ExecutionPolicy Bypass -File scripts/demo-doctor.ps1`) 5 minutes before a startup pitch, jury Q&A, or classroom LAN contest.

## 2. Inputs & Preconditions
- Windows 10/11 host with Python 3, `g++`, and Node.js installed.
- Ports `8000` (Void-bit Web), `8080` (Void-bit OJ Server), and `8765` (DrgX CP Exam Server) either free or already running DrgX services.

## 3. Autonomous Execution Steps
1. Verify host toolchains (`g++ --version`, `python --version`, `node --version`).
2. Check if `products/void-bit/OJ/oj_server.exe` is present; if missing or older than `oj_server.cpp`, automatically compile it.
3. Run `python -X utf8 scripts/verify_ecosystem.py` to execute the full 5-pillar health gate.
4. Optionally start all 3 background demo servers (`serve.js` on `:8000`, `oj_server.exe` on `:8080`, `exam-server.py` on `:8765`) when `-StartServers` is passed.
5. Print a clean, color-coded readiness table with clickable localhost URLs for the presenter.

## 4. Guardrails & Budgets
- Total pre-flight verification time: `< 15 seconds`.
- Never kill unrelated processes on ports `8000`/`8080`/`8765` without explicit confirmation.

## 5. Checkpoint Policy
- **Checkpoint: Presenter** before launching persistent background servers (`-StartServers`).

## 6. Output Artifact (The Brief)
- Updates `workflows/reports/ecosystem-health-brief.md` and prints the live demo URL dashboard in terminal.

## 7. Failure & Rollback Recovery
- If a port is occupied by an old demo instance, stop existing `oj_server` / `exam-server` processes and re-run `scripts/demo-doctor.ps1`.

## 8. Done When
- All toolchains, `.vsix` packages, startup `.docx` files, and live endpoints respond `200 OK` and the presenter has the demo URLs ready.

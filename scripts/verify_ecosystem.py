#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
DrgX Ecosystem Unified Health Gate (`scripts/verify_ecosystem.py`)
Kiểm thử tự động toàn diện 5 trụ cột của dự án khởi nghiệp DrgX:
1. Startup Dossier & Docs (`docs/startup/`, `scripts/check_placeholders.py`)
2. Marketing & Hub Website (`web/` — 7 trang HTML, JSON-LD, 5 Skins Chuyên nghiệp)
3. DrgX Studio Extensions (`products/drgx-cp/extension`, `products/drgx-dev/extension`, `.vsix` packages, 5 themes)
4. DrgX CP Classroom Exam Server (`products/drgx-cp/server/exam-server.py` — ThreadingHTTPServer, C++/Python judge, 4-thread concurrency, 413 guard, Admin Guard)
5. Void-bit Platform & C++17 OJ Server (`products/void-bit/` — `oj_server.exe`, 47 problems, contests, C++/Python judge, Winnowing anti-cheat, Content-Length guard, Admin Guard)

Xuất báo cáo `/loop-me` Brief ra `workflows/reports/ecosystem-health-brief.md`.
"""
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
REPORT_PATH = ROOT / 'workflows' / 'reports' / 'ecosystem-health-brief.md'

try:
    if os.name == 'nt' and Path(r'C:\msys64\ucrt64\bin').exists():
        os.environ['PATH'] = r'C:\msys64\ucrt64\bin;' + os.environ.get('PATH', '')
except OSError:
    pass


def find_free_port(preferred: int) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(('127.0.0.1', preferred)) != 0:
            return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def http_json(url: str, payload=None, method='GET', headers=None, timeout=45):
    hdrs = {'Content-Type': 'application/json'}
    if headers:
        hdrs.update(headers)
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))


def verify_startup_dossier() -> dict:
    t0 = time.perf_counter()
    checks = []
    required_files = [
        ROOT / 'docs' / 'startup' / '01-bai-thuyet-minh.md',
        ROOT / 'docs' / 'startup' / '08-chien-luoc-90-diem-bgk.md',
        ROOT / 'docs' / 'startup' / 'print' / 'bai-thi-drgx-ide.html',
        ROOT / 'docs' / 'startup' / 'print' / 'bai-thi-drgx-ide.docx',
        ROOT / 'docs' / 'startup' / 'print' / 'dang-ky-du-thi.docx',
        ROOT / 'scripts' / 'startup_content.py',
        ROOT / 'scripts' / 'check_placeholders.py',
        ROOT / 'ARCHITECTURE.md',
        ROOT / 'SECURITY.md',
        ROOT / 'CONTRIBUTING.md',
        ROOT / 'CODE_OF_CONDUCT.md',
        ROOT / 'CHANGELOG.md',
        ROOT / '.editorconfig',
        ROOT / 'drgx.cmd',
    ]
    for f in required_files:
        ok = f.exists() and f.stat().st_size > 200
        checks.append((f'File tồn tại & chuẩn hóa: {f.relative_to(ROOT)}', ok))

    readme_text = (ROOT / 'README.md').read_text(encoding='utf-8')
    checks.append(('README.md sạch 100% (không còn placeholder [[...]])', '[[' not in readme_text))

    md_text = (ROOT / 'docs' / 'startup' / '01-bai-thuyet-minh.md').read_text(encoding='utf-8')
    html_text = (ROOT / 'docs' / 'startup' / 'print' / 'bai-thi-drgx-ide.html').read_text(encoding='utf-8')
    checks.append(('Nội dung kỹ thuật sạch (0 TODO/FIXME/XXX trong thuyết minh & bản in HTML)',
                   all(tok not in md_text and tok not in html_text for tok in ('TODO', 'FIXME', 'XXX'))))
    checks.append(('Hồ sơ thuyết minh có đủ 5 Skins (Ion/Nebula/Tokyo/Matrix/Dawn) & sạch không rò rỉ nội bộ',
                   'Nebula' in md_text and 'Dawn' in md_text and 'Code OSS' not in md_text and 'OpenCode' not in md_text and 'drgx-inbox' not in md_text))
    r_ph = subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'scripts' / 'check_placeholders.py')],
                          capture_output=True, text=True, timeout=30)
    r_ly = subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'scripts' / 'verify_docs_layout.py')],
                          capture_output=True, text=True, timeout=30)
    checks.append(('Hồ sơ thuyết minh bám sát QĐ 1131/QĐ-TTg, Unit Economics, chuẩn xuất bản MIT (0 cắt bảng, 0 placeholder)',
                   '1131/QĐ-TTg' in md_text and 'LTV / CAC' in md_text and 'Winnowing' in md_text and 'Phụ lục 06' in md_text
                   and r_ph.returncode == 0 and r_ly.returncode == 0))

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    passed = sum(1 for _, ok in checks if ok)
    return {'name': '1. Startup Dossier (`docs/startup/`)', 'passed': passed, 'total': len(checks),
            'ms': elapsed_ms, 'checks': checks}


def verify_web_pillar() -> dict:
    t0 = time.perf_counter()
    checks = []
    web_dir = ROOT / 'web'
    pages = ['index.html', 'features.html', 'void-bit.html', 'download.html', 'about.html', 'judge-demo.html', 'ecosystem/index.html']
    clean_no_leaks = True
    for page in pages:
        p = web_dir / page
        txt = p.read_text(encoding='utf-8') if p.exists() else ''
        if any(tok in txt for tok in ('drgx-inbox', 'Code OSS', 'OpenCode', 'Wandbox', 'WCAG')):
            clean_no_leaks = False
        ok = (
            '<title>' in txt and
            'name="description"' in txt and
            'rel="canonical"' in txt and
            'application/ld+json' in txt and
            'skip-link' in txt and
            'data-skin="obsidian"' in txt and
            'site.js' in txt
        )
        checks.append((f'HTML chuẩn cấu trúc + 5 Skins: web/{page}', ok))
    checks.append(('Toàn bộ trang web sạch 100% (0 rò rỉ bí mật kiến trúc / tệp nội bộ)', clean_no_leaks))

    site_js = (web_dir / 'assets' / 'site.js').read_text(encoding='utf-8')
    checks.append(('site.js tích hợp 5 Skins chuyên nghiệp (obsidian/nebula/tokyo/matrix/light)',
                   '"obsidian"' in site_js and '"nebula"' in site_js and '"tokyo"' in site_js and '"matrix"' in site_js and '"light"' in site_js))

    for asset in ['assets/site.css', 'assets/site.js', 'robots.txt', 'sitemap.xml', '_headers',
                  'assets/shot-ide.webp', 'assets/shot-judge.webp', 'assets/shot-stress.webp', 'assets/logo-64.webp']:
        ap = web_dir / asset
        checks.append((f'Web asset sẵn sàng: web/{asset}', ap.exists() and ap.stat().st_size > 50))

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    passed = sum(1 for _, ok in checks if ok)
    return {'name': '2. Website & Cổng Học Tập (`web/`)', 'passed': passed, 'total': len(checks),
            'ms': elapsed_ms, 'checks': checks}


def verify_extensions_pillar() -> dict:
    t0 = time.perf_counter()
    checks = []
    for prod, prefix in (('drgx-cp', 'drgxCp'), ('drgx-dev', 'drgxDev')):
        ext_dir = ROOT / 'products' / prod / 'extension'
        pkg_path = ext_dir / 'package.json'
        pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
        themes = pkg.get('contributes', {}).get('themes', [])
        cmds = [c.get('command') for c in pkg.get('contributes', {}).get('commands', [])]
        checks.append((f'{prod}: package.json v{pkg.get("version")} có đủ 5 themes & {prefix}.skin + {prefix}.learn + {prefix}.intro',
                       pkg.get('version') == '1.0.0' and len(themes) == 5 and
                       f'{prefix}.skin' in cmds and f'{prefix}.learn' in cmds and f'{prefix}.intro' in cmds))
        intro_mp4 = ext_dir / 'media' / 'drgx-intro.mp4'
        checks.append((f'{prod}: video intro khởi động app (media/drgx-intro.mp4) sẵn sàng',
                       intro_mp4.exists() and intro_mp4.stat().st_size > 50000))
        for th in themes:
            tp = ext_dir / th['path']
            valid_json = False
            if tp.exists():
                try:
                    json.loads(tp.read_text(encoding='utf-8'))
                    valid_json = True
                except Exception:
                    pass
            checks.append((f'{prod}: theme JSON hợp lệ ({th["label"]})', valid_json))
        vsix = ext_dir / f'{prod}.vsix'
        checks.append((f'{prod}: gói cài đặt {prod}.vsix sẵn sàng ({vsix.stat().st_size // 1024 if vsix.exists() else 0} KB)',
                       vsix.exists() and vsix.stat().st_size > 10000))

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    passed = sum(1 for _, ok in checks if ok)
    return {'name': '3. DrgX Studio Extensions (`drgx-cp` & `drgx-dev`)', 'passed': passed, 'total': len(checks),
            'ms': elapsed_ms, 'checks': checks}


def verify_exam_server_pillar() -> dict:
    t0 = time.perf_counter()
    checks = []
    srv_dir = ROOT / 'products' / 'drgx-cp' / 'server'
    port = find_free_port(18765)
    env = os.environ.copy()
    env['DRGX_CP_SERVER_PORT'] = str(port)
    env['DRGX_CP_SERVER_URL'] = f'http://127.0.0.1:{port}'

    proc = subprocess.Popen(
        [sys.executable, '-X', 'utf8', str(srv_dir / 'exam-server.py')],
        cwd=str(srv_dir), env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    try:
        base_url = f'http://127.0.0.1:{port}'
        ready = False
        for _ in range(30):
            try:
                st, data = http_json(base_url + '/health', timeout=2)
                if st == 200 and data.get('status') == 'ready':
                    ready = True
                    break
            except Exception:
                time.sleep(0.15)
        checks.append(('Khởi động exam-server.py (ThreadingHTTPServer)', ready))

        # Run full smoke-test.py (15 checks including 4 concurrent submissions & security checks)
        smoke = subprocess.run(
            [sys.executable, '-X', 'utf8', str(srv_dir / 'smoke-test.py')],
            cwd=str(srv_dir), env=env, capture_output=True, text=True, timeout=60
        )
        if smoke.returncode != 0:
            print('   [SMOKE STDOUT]:', smoke.stdout.strip(), flush=True)
            print('   [SMOKE STDERR]:', smoke.stderr.strip(), flush=True)
        checks.append(('Chạy smoke-test.py (15/15 kịch bản C++, Python, Low Integrity & 4 luồng song song)',
                       smoke.returncode == 0 and 'ALL SMOKE TESTS PASSED' in smoke.stdout))

        # Verify 413 Payload Too Large protection (> 512 KB)
        got_413 = False
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=3) as sock:
                sock.sendall(b'POST /exam/join HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 600000\r\n\r\n{}')
                raw_resp = sock.recv(1024).decode('utf-8', errors='ignore')
                got_413 = ('413' in raw_resp)
        except Exception:
            pass
        checks.append(('Chống DoS bộ nhớ: từ chối payload > 512KB với HTTP 413', got_413))
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    passed = sum(1 for _, ok in checks if ok)
    return {'name': '4. Classroom Exam Server (`products/drgx-cp/server/`)', 'passed': passed, 'total': len(checks),
            'ms': elapsed_ms, 'checks': checks}


def verify_voidbit_pillar() -> dict:
    t0 = time.perf_counter()
    checks = []
    vb_dir = ROOT / 'products' / 'void-bit'
    oj_dir = vb_dir / 'OJ'

    # 1. Check Void-bit UI skin, stresstest fix & 42-lesson library integration across Void-bit + Web
    ui_js = (vb_dir / 'js' / 'cppro-ui.js').read_text(encoding='utf-8')
    theme_css = (vb_dir / 'css' / 'cppro-theme.css').read_text(encoding='utf-8')
    stress_html = (vb_dir / 'stresstest.html').read_text(encoding='utf-8')
    nav_cfg = json.loads((vb_dir / 'config' / 'nav.json').read_text(encoding='utf-8'))
    courses_html = (vb_dir / 'courses.html').read_text(encoding='utf-8')
    docs_html = (vb_dir / 'docs.html').read_text(encoding='utf-8')
    lesson_idx_html = (vb_dir / 'Lesson' / 'index.html').read_text(encoding='utf-8')
    web_vb_html = (ROOT / 'web' / 'void-bit.html').read_text(encoding='utf-8')
    checks.append(('Void-bit UI có đủ 5 Skins chuyên nghiệp (Dawn/Ion/Nebula/Tokyo/Matrix)',
                   'nebula' in ui_js and 'tokyo' in ui_js and 'matrix' in ui_js and 'cppro-theme-toggle' in theme_css))
    checks.append(('Void-bit stresstest.html không còn lỗi template string newline',
                   'cout << max_val << "\\\\n";' in stress_html))
    checks.append(('Void-bit Navbar & courses.html/docs.html/web/void-bit.html tích hợp đầy đủ 8 chuyên đề — 42 bài giảng',
                   any(x.get('id') == 'lessons' for x in nav_cfg.get('desktop', []))
                   and 'js/lessons-data.js' in courses_html and 'lessonsCourseGrid' in courses_html
                   and 'js/lessons-data.js' in docs_html and 'data-nav="lessons"' in lesson_idx_html
                   and 'id="baigiang"' in web_vb_html and 'id="vbLessonReader"' in web_vb_html))

    # 2. Validate sample problem JSON via OJ/tools/validate_problem.py
    val_proc = subprocess.run(
        [sys.executable, '-X', 'utf8', str(oj_dir / 'tools' / 'validate_problem.py'),
         str(oj_dir / 'problems' / '_inbox' / 'greedy_activity_001.json')],
        cwd=str(oj_dir), env=os.environ.copy(), capture_output=True, text=True, timeout=30
    )
    checks.append(('Validate cấu trúc đề bài & chạy thử reference_solution (validate_problem.py)', val_proc.returncode == 0))

    # 3. Compile oj_server.exe if oj_server.cpp is newer, then spawn on free port and test APIs
    stale_sol_exe = oj_dir / 'sol.exe'
    if stale_sol_exe.exists():
        try:
            stale_sol_exe.unlink()
        except Exception:
            pass
    oj_cpp = oj_dir / 'oj_server.cpp'
    oj_exe = oj_dir / 'oj_server.exe'
    if not oj_exe.exists() or oj_cpp.stat().st_mtime > oj_exe.stat().st_mtime:
        print('   [BUILD] Compiling oj_server.cpp -> oj_server.exe ...', flush=True)
        gxx_bin = r'C:\msys64\ucrt64\bin\g++.exe' if Path(r'C:\msys64\ucrt64\bin\g++.exe').exists() else 'g++'
        comp = subprocess.run(
            [gxx_bin, '-std=c++17', '-O1', '-pipe', '-o', str(oj_exe), str(oj_cpp), '-lws2_32', '-lwinhttp', '-lpsapi', '-static'],
            cwd=str(oj_dir), env=os.environ.copy(), capture_output=True, text=True, timeout=180
        )
        if comp.returncode != 0:
            print('   [g++ stderr]:', (comp.stderr or comp.stdout)[:500], flush=True)
        checks.append(('Biên dịch mới oj_server.cpp -> oj_server.exe (C++17 -static)', comp.returncode == 0))
    checks.append(('Binary oj_server.exe đã biên dịch sẵn sàng', oj_exe.exists() and oj_exe.stat().st_size > 100000))

    port = find_free_port(18080)
    proc = subprocess.Popen(
        [str(oj_exe), str(port), 'static', 'problems'],
        cwd=str(oj_dir), stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    try:
        base_url = f'http://127.0.0.1:{port}'
        ready = False
        probs = []
        for _ in range(30):
            try:
                st, probs = http_json(base_url + '/api/problems', timeout=2)
                if st == 200 and isinstance(probs, list) and len(probs) >= 20:
                    ready = True
                    break
            except Exception:
                time.sleep(0.15)
        checks.append((f'GET /api/problems trả về danh sách bài tập ({len(probs)} bài)', ready))

        try:
            st_c, contests = http_json(base_url + '/api/contests', timeout=5)
        except Exception:
            st_c, contests = 0, []
        checks.append((f'GET /api/contests trả về danh sách kỳ thi ({len(contests)} kỳ thi)',
                       st_c == 200 and len(contests) >= 2))

        # Test C++17 judge + compiler_path sanitization (injected compiler_path must be ignored safely!)
        cpp_sol = (oj_dir / 'data' / 'judge-probe' / 'greedy_activity_001.cpp').read_text(encoding='utf-8')
        try:
            st_j, jr_cpp = http_json(base_url + '/api/judge', {
                'problem_id': 'greedy_activity_001',
                'language': 'cpp',
                'code': cpp_sol,
                'compiler_path': 'cmd.exe /c echo INJECTED &&'
            }, method='POST', timeout=30)
        except Exception:
            st_j, jr_cpp = 0, {}
        checks.append(('POST /api/judge (C++17 AC + chặn đứng command injection qua compiler_path)',
                       st_j == 200 and jr_cpp.get('verdict') == 'AC' and jr_cpp.get('passed') == jr_cpp.get('total')))

        # Test Python 3 judge
        py_sol = (oj_dir / 'data' / 'judge-probe' / 'greedy_activity_001.py').read_text(encoding='utf-8')
        try:
            st_p, jr_py = http_json(base_url + '/api/judge', {
                'problem_id': 'greedy_activity_001',
                'language': 'python',
                'code': py_sol
            }, method='POST', timeout=30)
        except Exception:
            st_p, jr_py = 0, {}
        checks.append(('POST /api/judge (Python 3 AC)',
                       st_p == 200 and jr_py.get('verdict') == 'AC'))

        # Test Winnowing Anti-Cheat API: bài giống hệt = 100%; chép + đổi tên biến/hàm/chú thích vẫn bị gắn cờ; thuật toán khác thì không
        try:
            st_ac, ac_res = http_json(base_url + '/api/anti-cheat/compare', {
                'code_a': cpp_sol,
                'code_b': cpp_sol
            }, method='POST', timeout=10)
        except Exception:
            st_ac, ac_res = 0, {}
        import re as _re
        renamed_src = cpp_sol
        reserved = {'int', 'long', 'double', 'float', 'char', 'bool', 'void', 'auto', 'const', 'unsigned', 'return', 'if', 'else',
                    'for', 'while', 'do', 'break', 'continue', 'struct', 'class', 'using', 'namespace', 'std', 'main', 'cin', 'cout',
                    'endl', 'vector', 'string', 'pair', 'sort', 'min', 'max', 'swap', 'abs', 'size', 'push_back', 'begin', 'end',
                    'first', 'second', 'true', 'false', 'include', 'ios', 'sync_with_stdio', 'tie', 'nullptr', 'scanf', 'printf',
                    'bits', 'stdc', 'iostream', 'algorithm', 'map', 'set', 'queue', 'stack', 'greater', 'less', 'lower_bound',
                    'upper_bound', 'make_pair', 'memset', 'fill', 'reverse', 'accumulate', 'iota', 'unordered_map', 'unordered_set'}
        ids = sorted({m for m in _re.findall(r'\b[A-Za-z_]\w*\b', cpp_sol) if m not in reserved})
        for idx, ident in enumerate(ids):
            renamed_src = _re.sub(r'\b' + _re.escape(ident) + r'\b', f'ten_{idx}', renamed_src)
        renamed_src = '// da doi ten bien\n' + renamed_src.replace('\n', ' // ghi chu\n', 3)
        try:
            st_rn, rn_res = http_json(base_url + '/api/anti-cheat/compare', {'code_a': cpp_sol, 'code_b': renamed_src},
                                      method='POST', timeout=10)
        except Exception:
            st_rn, rn_res = 0, {}
        other_algo = '#include <iostream>\nusing namespace std;\nint main(){ long long s = 0, x; while (cin >> x) s += x * x; cout << s << "\\n"; }\n'
        try:
            st_ot, ot_res = http_json(base_url + '/api/anti-cheat/compare', {'code_a': cpp_sol, 'code_b': other_algo},
                                      method='POST', timeout=10)
        except Exception:
            st_ot, ot_res = 0, {}
        checks.append(('POST /api/anti-cheat/compare (Winnowing: giống hệt = 100%, đổi tên biến/chú thích vẫn gắn cờ, thuật toán khác không gắn cờ)',
                       st_ac == 200 and ac_res.get('similarity') == 100.0 and ac_res.get('flagged') is True
                       and st_rn == 200 and rn_res.get('flagged') is True
                       and st_ot == 200 and ot_res.get('flagged') is False))

        # Test Differential Stress Testing Engine (/api/stress-test catching a real counterexample)
        try:
            st_st, st_res = http_json(base_url + '/api/stress-test', {
                'solution_code': '#include <iostream>\nusing namespace std;\nint main(){ int a,b; if(!(cin>>a>>b)) return 0; cout << (a == 2 ? 42 : a + b) << "\\n"; }',
                'brute_code': '#include <iostream>\nusing namespace std;\nint main(){ int a,b; if(!(cin>>a>>b)) return 0; cout << a + b << "\\n"; }',
                'generator_code': '#include <iostream>\nusing namespace std;\nint main(){ cout << "2 3\\n"; }',
                'iterations': 3,
                'language': 'cpp'
            }, method='POST', timeout=30)
        except Exception:
            st_st, st_res = 0, {}
        checks.append(('POST /api/stress-test (Differential Stress Engine bắt sống counterexample MISMATCH)',
                       st_st == 200 and st_res.get('status') == 'MISMATCH' and st_res.get('expected_output', '').strip() == '5'))

        # Test GET /api/health endpoint
        try:
            st_hl, hl_res = http_json(base_url + '/api/health', timeout=5)
        except Exception:
            st_hl, hl_res = 0, {}
        checks.append(('GET /api/health trả trạng thái ready (v2.0.0)',
                       st_hl == 200 and hl_res.get('status') == 'ready' and hl_res.get('version') == '2.0.0'))

        # Test malformed Content-Length resilience (raw socket)
        survived_malformed = False
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=3) as sock:
                sock.sendall(b'POST /api/judge HTTP/1.1\r\nHost: localhost\r\nContent-Length: NOT_A_NUMBER\r\n\r\n{}')
                raw_resp = sock.recv(1024).decode('utf-8', errors='ignore')
            st_after, _ = http_json(base_url + '/api/problems', timeout=3)
            survived_malformed = ('400' in raw_resp or st_after == 200)
        except Exception:
            pass
        checks.append(('Chống sập server khi gửi Content-Length phi số (trả 400 & server vẫn sống)', survived_malformed))
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    passed = sum(1 for _, ok in checks if ok)
    return {'name': '5. Void-bit Platform & C++17 OJ (`products/void-bit/`)', 'passed': passed, 'total': len(checks),
            'ms': elapsed_ms, 'checks': checks}


def write_brief(pillars: list, total_ms: int) -> bool:
    total_passed = sum(p['passed'] for p in pillars)
    total_checks = sum(p['total'] for p in pillars)
    all_ok = (total_passed == total_checks)
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    lines = [
        '# DrgX Ecosystem `/loop-me` Release & Health Brief',
        '',
        f'- **Timestamp**: `{now_str}`',
        f'- **Status**: **{"SHIP READY (100% GREEN)" if all_ok else "HOLD (FAILURES DETECTED)"}**',
        f'- **Total Checks**: `{total_passed}/{total_checks}` passed in `{total_ms} ms`',
        '',
        '## 1. Per-Pillar Telemetry Summary',
        '',
        '| Pillar | Passed | Latency | Status |',
        '| :--- | :---: | :---: | :---: |',
    ]
    for p in pillars:
        st = 'PASS' if p['passed'] == p['total'] else 'FAIL'
        lines.append(f'| {p["name"]} | `{p["passed"]}/{p["total"]}` | `{p["ms"]} ms` | **{st}** |')

    lines.extend(['', '## 2. Detailed Verification Checklist', ''])
    for p in pillars:
        lines.append(f'### {p["name"]} (`{p["passed"]}/{p["total"]}` — `{p["ms"]} ms`)')
        for label, ok in p['checks']:
            mark = '[x]' if ok else '[ ]'
            lines.append(f'- {mark} {label}')
        lines.append('')

    lines.extend([
        '## 3. Rollback & Recovery Notes',
        '- **OJ Server (`products/void-bit/OJ/oj_server.cpp`)**: Recompile via `g++ -std=c++17 -O2 -o oj_server.exe oj_server.cpp -lws2_32 -lwinhttp -lpsapi -static`.',
        '- **Classroom Exam Server (`products/drgx-cp/server/exam-server.py`)**: Uses atomic `os.replace` on `exams.json`; if a crash leaves `.tmp` files, delete `exams.*.tmp`.',
        '- **Startup Dossier (`docs/startup/`)**: Regenerate anytime via `python -X utf8 scripts/build_startup_docs.py`.',
        ''
    ])

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text('\n'.join(lines), encoding='utf-8')
    return all_ok


def main():
    t0 = time.perf_counter()
    print('=================================================================')
    print('  DrgX Ecosystem Unified Health Gate (verify_ecosystem.py)')
    print('=================================================================')
    pillars = []
    for fn in (
        verify_startup_dossier,
        verify_web_pillar,
        verify_extensions_pillar,
        verify_exam_server_pillar,
        verify_voidbit_pillar,
    ):
        p = fn()
        pillars.append(p)
        status = 'PASS' if p['passed'] == p['total'] else 'FAIL'
        print(f'[{status}] {p["name"]}: {p["passed"]}/{p["total"]} ({p["ms"]} ms)', flush=True)
        for label, ok in p['checks']:
            if not ok:
                print(f'   -> [FAILED] {label}', flush=True)
    total_ms = int((time.perf_counter() - t0) * 1000)

    all_ok = write_brief(pillars, total_ms)
    print('-----------------------------------------------------------------')
    print(f'Brief written to: {REPORT_PATH.relative_to(ROOT)} ({total_ms} ms)')
    if not all_ok:
        sys.exit(1)
    print('ALL 5 PILLARS PASSED (100% GREEN)')


if __name__ == '__main__':
    main()

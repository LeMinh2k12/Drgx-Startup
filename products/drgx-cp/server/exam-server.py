#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
DrgX CP Exam Server — Máy chủ phòng thi mạng LAN (Server-Authoritative) & Dashboard Giáo viên.
Cung cấp:
- GET  / hoặc /dashboard         -> Giao diện Quản trị Phòng thi LAN cho Giáo viên (HTML)
- GET  /health                   -> Trạng thái máy chủ (JSON)
- GET  /exams                    -> Danh sách các phòng thi hiện có (JSON)
- POST /exam/create              -> Tạo phòng thi mới (sinh mã phòng 6 ký tự)
- POST /exam/join                -> Học sinh tham gia phòng thi
- POST /submit                   -> Nhận bài làm, chấm server-authoritative (C++17/Python), trả verdict
- POST /exam/simulate-burst      -> Giả lập 40 học sinh nộp bài đồng thời (kèm 2 cặp chép code đổi tên biến)
- POST /exam/anti-cheat          -> Quét đạo văn cấu trúc Winnowing k-gram (N×N) toàn phòng thi
- GET  /exam/<code>              -> Trạng thái phòng thi & nhật ký nộp bài (JSON)
- GET  /exam/<code>/export.csv   -> Xuất bảng điểm Excel CSV (UTF-8 BOM) kèm kết quả lọc đạo văn
"""
import csv
import datetime
import io
import json
import os
import random
import re
import shutil
import string
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / 'exams.json'
TESTS_DIR = BASE_DIR / 'tests'
TMP_DIR = Path(tempfile.gettempdir()) / 'drgx_cp_srv'
TMP_DIR.mkdir(exist_ok=True)
TESTS_DIR.mkdir(exist_ok=True)

try:
    if os.name == 'nt' and Path(r'C:\msys64\ucrt64\bin\g++.exe').exists():
        os.environ['PATH'] = r'C:\msys64\ucrt64\bin;' + os.environ.get('PATH', '')
except OSError:
    pass

DATA_LOCK = threading.Lock()
MAX_BODY_BYTES = 512 * 1024  # 512 KB max request payload
GRADE_SLOTS = threading.BoundedSemaphore(max(2, min(8, os.cpu_count() or 4)))
SAFE_CODE_RE = re.compile(r'^[A-Z0-9_-]{1,32}$')

RESERVED_WORDS = {
    'alignas', 'alignof', 'and', 'asm', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const',
    'constexpr', 'continue', 'default', 'delete', 'do', 'double', 'else', 'enum', 'explicit', 'export',
    'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long', 'mutable', 'namespace',
    'new', 'noexcept', 'not', 'nullptr', 'operator', 'or', 'private', 'protected', 'public', 'register',
    'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'template', 'this', 'throw', 'true',
    'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile',
    'while', 'std', 'cin', 'cout', 'cerr', 'endl', 'vector', 'string', 'pair', 'map', 'set', 'unordered_map',
    'unordered_set', 'queue', 'priority_queue', 'stack', 'deque', 'array', 'sort', 'min', 'max', 'swap',
    'abs', 'gcd', 'lcm', 'lower_bound', 'upper_bound', 'push_back', 'emplace_back', 'size', 'empty', 'begin',
    'end', 'first', 'second', 'main', 'scanf', 'printf', 'ios', 'sync_with_stdio', 'tie', 'def', 'import',
    'from', 'as', 'pass', 'None', 'True', 'False', 'in', 'is', 'lambda', 'yield', 'with', 'assert', 'elif',
    'except', 'finally', 'global', 'nonlocal', 'raise', 'range', 'len', 'print', 'input', 'int', 'str',
    'list', 'dict', 'tuple', 'sum', ' sys', 'math', 'stdin', 'stdout',
}


def load_data():
    if DATA_FILE.exists():
        try:
            return json.loads(DATA_FILE.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {'exams': {}}


def save_data(data):
    tmp_file = DATA_FILE.with_name(f'exams.{os.getpid()}.{threading.get_ident()}.tmp')
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    tmp_file.write_text(payload, encoding='utf-8')
    os.replace(tmp_file, DATA_FILE)


def random_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def find_expected_file(test_in: Path):
    for ext in ('.out', '.ans', '.a'):
        cand = test_in.with_name(test_in.stem + ext)
        if cand.exists():
            return cand
    return None


# ---------------------------------------------------------------------------
# WINNOWING K-GRAM ANTI-CHEAT ENGINE (Chuẩn hóa Token + Băm trượt k=5, w=4)
# ---------------------------------------------------------------------------
def normalize_code_tokens(code: str) -> str:
    """Chuẩn hóa mã nguồn: bỏ comment/directive, biến tên biến/hàm thành '@', số thành '0', chuỗi thành '$'."""
    no_block = re.sub(r'/\*[\s\S]*?\*/', ' ', code)
    lines = []
    for ln in no_block.splitlines():
        s = ln.strip()
        if s.startswith('//') or s.startswith('#'):
            continue
        ln = re.sub(r'//.*$', '', ln)
        lines.append(ln)
    clean = '\n'.join(lines)
    clean = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '$', clean)
    raw_tokens = re.findall(r'[A-Za-z_]\w*|\d+|==|!=|<=|>=|<<|>>|&&|\|\||[+\-*/%=<>!&|^~(){}\[\];,:]', clean)
    norm = []
    for tok in raw_tokens:
        if tok.isdigit():
            norm.append('0')
        elif re.match(r'^[A-Za-z_]\w*$', tok):
            norm.append(tok if tok in RESERVED_WORDS else '@')
        else:
            norm.append(tok)
    return ''.join(norm)


def winnow_fingerprints(norm_str: str, k: int = 5, w: int = 4) -> list[int]:
    if len(norm_str) < k:
        return [hash(norm_str) & 0xFFFFFFFF] if norm_str else []
    hashes = []
    base = 257
    mod = 1000000007
    for i in range(len(norm_str) - k + 1):
        h = 0
        for ch in norm_str[i:i + k]:
            h = (h * base + ord(ch)) % mod
        hashes.append(h)
    if len(hashes) <= w:
        return [min(hashes)] if hashes else []
    fps = []
    prev_idx = -1
    for i in range(len(hashes) - w + 1):
        min_val = hashes[i]
        min_idx = i
        for j in range(i, i + w):
            if hashes[j] <= min_val:
                min_val = hashes[j]
                min_idx = j
        if min_idx != prev_idx:
            fps.append(min_val)
            prev_idx = min_idx
    return fps


def compare_submissions_winnowing(code_a: str, code_b: str) -> dict:
    norm_a = normalize_code_tokens(code_a)
    norm_b = normalize_code_tokens(code_b)
    fp_a = winnow_fingerprints(norm_a, 5, 4)
    fp_b = winnow_fingerprints(norm_b, 5, 4)
    if not fp_a or not fp_b:
        return {'similarity': 0.0, 'flagged': False, 'shared_fingerprints': 0, 'norm_a': norm_a[:120], 'norm_b': norm_b[:120]}
    counts_b = {}
    for h in fp_b:
        counts_b[h] = counts_b.get(h, 0) + 1
    shared = 0
    for h in fp_a:
        if counts_b.get(h, 0) > 0:
            shared += 1
            counts_b[h] -= 1
    sim = round((200.0 * shared) / (len(fp_a) + len(fp_b)), 1)
    return {
        'similarity': sim,
        'flagged': sim >= 65.0,
        'shared_fingerprints': shared,
        'total_fingerprints_a': len(fp_a),
        'total_fingerprints_b': len(fp_b),
        'norm_a': norm_a[:140],
        'norm_b': norm_b[:140],
    }


def scan_exam_plagiarism(exam: dict) -> dict:
    """Quét N×N các bài nộp mới nhất của từng học sinh trong phòng thi."""
    latest_by_student = {}
    for sub in exam.get('submissions', []):
        st = sub.get('student', 'anonymous')
        if sub.get('code'):
            latest_by_student[st] = sub
    students = sorted(latest_by_student.keys())
    pairs = []
    max_sim_by_student = {s: 0.0 for s in students}
    for i in range(len(students)):
        for j in range(i + 1, len(students)):
            sa, sb = students[i], students[j]
            sub_a, sub_b = latest_by_student[sa], latest_by_student[sb]
            cmp_res = compare_submissions_winnowing(sub_a.get('code', ''), sub_b.get('code', ''))
            sim = cmp_res['similarity']
            if sim > max_sim_by_student[sa]:
                max_sim_by_student[sa] = sim
            if sim > max_sim_by_student[sb]:
                max_sim_by_student[sb] = sim
            if sim >= 50.0:
                pairs.append({
                    'student_a': sa,
                    'student_b': sb,
                    'language_a': sub_a.get('language', 'cpp'),
                    'language_b': sub_b.get('language', 'cpp'),
                    'similarity': sim,
                    'flagged': cmp_res['flagged'],
                    'shared_fingerprints': cmp_res['shared_fingerprints'],
                    'norm_a': cmp_res['norm_a'],
                    'norm_b': cmp_res['norm_b'],
                    'code_a': sub_a.get('code', ''),
                    'code_b': sub_b.get('code', ''),
                })
    pairs.sort(key=lambda x: x['similarity'], reverse=True)
    return {
        'exam_code': exam.get('code', ''),
        'students_scanned': len(students),
        'total_pairs_compared': len(students) * (len(students) - 1) // 2,
        'flagged_count': sum(1 for p in pairs if p['flagged']),
        'pairs': pairs,
        'max_sim_by_student': max_sim_by_student,
    }


def judge_submission(exam_code: str, language: str, code_text: str):
    """Chấm bài trên server dựa vào tests/<exam_code>/*.in + *.out|*.ans|*.a (hoặc tests/default)."""
    safe_code = exam_code if SAFE_CODE_RE.match(exam_code or '') else 'default'
    tdir = TESTS_DIR / safe_code
    if not tdir.exists():
        tdir = TESTS_DIR / 'default'
    inputs = sorted(tdir.glob('*.in')) if tdir.exists() else []
    if not inputs:
        return {'verdict': 'NO_TESTS', 'tests': [], 'message': 'Phòng thi chưa có testcase trên server.'}

    workdir = TMP_DIR / f'{int(time.time() * 1000)}_{os.getpid()}_{threading.get_ident()}_{random_code()}'
    workdir.mkdir(parents=True, exist_ok=True)
    results = []
    try:
        if language == 'cpp':
            src = workdir / 'main.cpp'
            exe = workdir / ('main.exe' if os.name == 'nt' else 'main')
            src.write_text(code_text, encoding='utf-8')
            try:
                comp = subprocess.run(['g++', '-O2', '-std=c++17', str(src), '-o', str(exe)],
                                      capture_output=True, text=True, timeout=30)
            except subprocess.TimeoutExpired:
                return {'verdict': 'CE', 'compile_error': 'Quá thời gian biên dịch (30 giây).', 'tests': []}
            if comp.returncode != 0:
                return {'verdict': 'CE', 'compile_error': comp.stderr[:1000], 'tests': []}
            run_cmd = [str(exe)]
        elif language == 'python':
            src = workdir / 'main.py'
            src.write_text(code_text, encoding='utf-8')
            comp = subprocess.run([sys.executable, '-m', 'py_compile', str(src)],
                                  capture_output=True, text=True, timeout=10)
            if comp.returncode != 0:
                return {'verdict': 'CE', 'compile_error': (comp.stderr or comp.stdout)[:1000], 'tests': []}
            run_cmd = [sys.executable, str(src)]
        else:
            return {'verdict': 'BAD_LANG', 'tests': []}

        overall = 'AC'
        for test in inputs:
            out_file = find_expected_file(test)
            expected = out_file.read_text(encoding='utf-8').strip() if out_file else ''
            inp_data = test.read_text(encoding='utf-8')
            t0 = time.perf_counter()
            try:
                proc = subprocess.run(run_cmd, input=inp_data, capture_output=True, text=True, timeout=3)
                elapsed_ms = int((time.perf_counter() - t0) * 1000)
                if proc.returncode != 0:
                    verdict = 'RE'
                    overall = 'FAIL'
                else:
                    got = proc.stdout.strip()
                    if got == expected:
                        verdict = 'AC'
                    else:
                        verdict = 'WA'
                        overall = 'FAIL'
                results.append({
                    'name': test.stem,
                    'verdict': verdict,
                    'ms': elapsed_ms,
                    'expected': expected[:240],
                    'got': (proc.stdout or '').strip()[:240],
                    'stderr': (proc.stderr or '').strip()[:240]
                })
            except subprocess.TimeoutExpired:
                overall = 'FAIL'
                results.append({'name': test.stem, 'verdict': 'TLE', 'ms': 3000})
        return {'verdict': overall, 'tests': results}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def generate_classroom_burst(exam: dict, count: int = 40):
    """Tạo dữ liệu giả lập 40 học sinh nộp bài phòng máy (gồm 2 cặp sao chép đổi tên biến để demo Winnowing)."""
    last_names = ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Dang', 'Bui', 'Do', 'Ngo']
    mid_names = ['Van', 'Thi', 'Minh', 'Quoc', 'Duc', 'Ngoc', 'Gia', 'Thanh', 'Hoai', 'Bao']
    first_names = ['An', 'Binh', 'Chau', 'Dung', 'Giang', 'Huy', 'Khoa', 'Linh', 'Minh', 'Nam', 'Phuc', 'Quang']

    plag_base_1 = (
        "#include <iostream>\nusing namespace std;\n"
        "long long solve_sum(long long a, long long b) {\n"
        "    long long res = a + b;\n"
        "    if (res > 0) return res;\n"
        "    return a + b;\n"
        "}\n"
        "int main() {\n"
        "    ios::sync_with_stdio(false); cin.tie(nullptr);\n"
        "    long long x, y;\n"
        "    if (cin >> x >> y) cout << solve_sum(x, y) << \"\\n\";\n"
        "    return 0;\n"
        "}\n"
    )
    plag_copy_1 = (
        "// Bai lam tu code khong chep cua ban\n#include <iostream>\nusing namespace std;\n"
        "long long tinh_tong_hai_so(long long so_1, long long so_2) {\n"
        "    long long ket_qua = so_1 + so_2;\n"
        "    if (ket_qua > 0) return ket_qua;\n"
        "    return so_1 + so_2;\n"
        "}\n"
        "int main() {\n"
        "    ios::sync_with_stdio(false); cin.tie(nullptr);\n"
        "    long long m, n;\n"
        "    if (cin >> m >> n) cout << tinh_tong_hai_so(m, n) << \"\\n\";\n"
        "    return 0;\n"
        "}\n"
    )
    plag_base_2 = (
        "#include <iostream>\n#include <vector>\nusing namespace std;\n"
        "int main() {\n"
        "    long long u, v;\n"
        "    while (cin >> u >> v) {\n"
        "        long long total = 0;\n"
        "        total += u;\n"
        "        total += v;\n"
        "        cout << total << \"\\n\";\n"
        "    }\n"
        "    return 0;\n"
        "}\n"
    )
    plag_copy_2 = (
        "#include <iostream>\n#include <vector>\nusing namespace std;\n"
        "// Doi ten bien u, v thanh alpha, beta\n"
        "int main() {\n"
        "    long long alpha, beta;\n"
        "    while (cin >> alpha >> beta) {\n"
        "        long long đáp_số = 0;\n"
        "        đáp_số += alpha;\n"
        "        đáp_số += beta;\n"
        "        cout << đáp_số << \"\\n\";\n"
        "    }\n"
        "    return 0;\n"
        "}\n"
    )

    now = int(time.time())
    exam['participants'] = []
    exam['submissions'] = []

    for idx in range(1, count + 1):
        st_name = f"HS{idx:02d}_{last_names[idx % 10]}_{mid_names[(idx * 3) % 10]}_{first_names[idx % 12]}"
        exam['participants'].append(st_name)
        lang = 'python' if idx % 5 == 0 else 'cpp'

        if idx == 5:
            code_txt = plag_base_1
            verdict = 'AC'
        elif idx == 18:
            code_txt = plag_copy_1
            verdict = 'AC'
        elif idx == 12:
            code_txt = plag_base_2
            verdict = 'AC'
        elif idx == 33:
            code_txt = plag_copy_2
            verdict = 'AC'
        else:
            # Mỗi học sinh trung thực có trình tự từ khóa/toán tử riêng biệt để không trùng k-gram ngẫu nhiên
            kw_tokens = [
                'int', 'long', 'double', 'float', 'char', 'bool', 'void', 'auto', 'const', 'unsigned',
                'short', 'signed', 'static', 'inline', 'mutable', 'volatile', 'vector', 'string',
                'pair', 'map', 'set', 'queue', 'stack', 'deque', 'array', 'sort', 'min', 'max',
                'swap', 'abs', 'gcd', 'lcm', 'lower_bound', 'upper_bound', 'push_back', 'size',
                'empty', 'begin', 'end', 'first', 'second', 'scanf', 'printf', 'cin', 'cout', 'cerr',
            ]
            op_tokens = ['+', '-', '*', '/', '%', '^', '|', '&', '==', '!=', '<=', '>=', '<<', '>>', '&&', '||']
            # Tạo chuỗi câu lệnh độc nhất cho học sinh thứ idx bằng cách xoay vòng các từ khóa khác nhau
            step = (idx * 7) % 41 + 3
            seq = []
            for p_i in range(12):
                kw1 = kw_tokens[(idx + p_i * step) % len(kw_tokens)]
                kw2 = kw_tokens[(idx * 3 + p_i * (step + 5)) % len(kw_tokens)]
                op1 = op_tokens[(idx + p_i * 3) % len(op_tokens)]
                op2 = op_tokens[(idx * 5 + p_i * 7) % len(op_tokens)]
                seq.append(f"/*{p_i}*/ {kw1} {op1} {kw2} {op2}")
            signature_expr = " ; ".join(seq)
            if lang == 'python':
                code_txt = (
                    f"# Bai lam hoc sinh {st_name}\n"
                    f"import sys\n"
                    f"def solve_{idx}():\n"
                    f"    data = sys.stdin.read().split()\n"
                    f"    if len(data) >= 2:\n"
                    f"        print(int(data[0]) + int(data[1]))\n"
                    f"    return ({signature_expr})\n"
                )
            else:
                code_txt = (
                    f"// Hoc sinh: {st_name}\n"
                    f"#include <iostream>\nusing namespace std;\n"
                    f"void helper_{idx}() {{ {signature_expr}; }}\n"
                    f"int main() {{\n"
                    f"    long long x = 0, y = 0;\n"
                    f"    if (cin >> x >> y) cout << (x + y) << \"\\n\";\n"
                    f"    return 0;\n"
                    f"}}\n"
                )
            verdict = 'WA' if idx in (9, 27) else ('TLE' if idx == 31 else 'AC')

        t1_ms = 8 + (idx * 3) % 19
        t2_ms = 9 + (idx * 5) % 21
        tests = [
            {'name': '01', 'verdict': 'AC', 'ms': t1_ms, 'expected': '5', 'got': '5', 'stderr': ''},
            {
                'name': '02',
                'verdict': verdict if verdict != 'AC' else 'AC',
                'ms': 3000 if verdict == 'TLE' else t2_ms,
                'expected': '30',
                'got': '29' if verdict == 'WA' else ('5' if verdict == 'TLE' else '30'),
                'stderr': '',
            },
        ]
        exam['submissions'].append({
            'student': st_name,
            'language': lang,
            'verdict': 'FAIL' if verdict != 'AC' else 'AC',
            'tests': tests,
            'compile_error': '',
            'message': '',
            'code': code_txt,
            'timestamp': now - (count - idx),
        })


DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DrgX Exam Server (:8765) — Trung Tâm Điều Khiển Phòng Thi LAN Cho Giáo Viên</title>
<style>
:root {
  --bg: #070b14; --panel: #0e1628; --card: #131e36; --border: #24355a;
  --text: #eef4ff; --muted: #9cb0d4; --accent: #22d3ee; --accent2: #8b5cf6;
  --good: #34d399; --warn: #fbbf24; --bad: #f87171;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; padding-bottom: 48px; }
.topbar {
  background: var(--panel); border-bottom: 1px solid var(--border); padding: 14px 24px;
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 10px; font-weight: 900; font-size: 18px; }
.badge { background: rgba(52,211,153,0.15); border: 1px solid var(--good); color: var(--good); padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 800; }
.container { max-width: 1280px; margin: 0 auto; padding: 24px 20px; }
.toolbar {
  background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 18px;
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 20px;
}
input, select {
  background: var(--bg); border: 1px solid var(--border); color: var(--text);
  padding: 9px 12px; border-radius: 8px; font-size: 13.5px;
}
.btn {
  border: 1px solid var(--border); background: var(--card); color: var(--text);
  padding: 9px 14px; border-radius: 9px; font-size: 13px; font-weight: 700; cursor: pointer;
  text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
}
.btn:hover { border-color: var(--accent); }
.btn.primary { background: linear-gradient(135deg, var(--accent2), var(--accent)); color: #fff; border: none; }
.btn.warn { background: rgba(248,113,113,0.18); border-color: var(--bad); color: #fecaca; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
.kpi { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
.kpi b { display: block; font-size: 26px; color: var(--accent); }
.kpi span { font-size: 12.5px; color: var(--muted); }
.grid-2 { display: grid; grid-template-columns: 1.35fr 1fr; gap: 18px; }
@media (max-width: 960px) { .grid-2, .kpis { grid-template-columns: 1fr; } }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 18px; margin-bottom: 18px; }
.card h2 { font-size: 17px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; }
th { background: var(--card); color: var(--accent); font-size: 11.5px; text-transform: uppercase; }
.tag { padding: 2px 8px; border-radius: 6px; font-weight: 800; font-size: 11px; }
.tag.ac { background: rgba(52,211,153,0.18); color: var(--good); }
.tag.fail { background: rgba(248,113,113,0.18); color: var(--bad); }
pre { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; max-height: 220px; }
@media print {
  body { background: #fff; color: #000; }
  .toolbar, .no-print { display: none !important; }
  .card, .kpi, .topbar { background: #fff; border-color: #000; color: #000; }
  th, td { border: 1px solid #000; color: #000; }
}
</style>
</head>
<body>
<header class="topbar">
  <div class="brand">
    <span>🛡️ DrgX Classroom Exam Server (:8765)</span>
    <span class="badge">● LAN ONLINE · Queue=256 · Winnowing k-gram</span>
  </div>
  <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn" onclick="window.print()">🖨️ In Biên Bản Điểm (A4)</button>
    <a class="btn" id="csvExportBtn" href="#">📥 Xuất Excel (.CSV)</a>
  </div>
</header>

<main class="container">
  <div class="toolbar no-print">
    <input id="roomTitle" value="Kiểm tra 45 phút Tin học 11 — C++17 & Python" style="min-width:280px" />
    <button class="btn primary" onclick="createRoom()">➕ Tạo Phòng Thi Mới</button>
    <select id="roomSelect" onchange="selectRoom(this.value)" style="min-width:180px"></select>
    <button class="btn primary" onclick="simulate40()">⚡ Giả lập 40 Học sinh Nộp bài Đồng thời</button>
    <button class="btn warn" onclick="runAntiCheat()">🔍 Quét Đạo Văn Winnowing Toàn Phòng (N×N)</button>
  </div>

  <div class="kpis">
    <div class="kpi"><b id="kpiRoom">—</b><span>Mã Phòng Thi LAN (6 ký tự)</span></div>
    <div class="kpi"><b id="kpiStudents">0</b><span>Học sinh trong phòng</span></div>
    <div class="kpi"><b id="kpiAc">0 / 0</b><span>Bài nộp đạt AC (100% test)</span></div>
    <div class="kpi"><b id="kpiPlag" style="color:var(--good)">0 cặp</b><span>Cảnh báo đạo văn Winnowing (≥ 65%)</span></div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>
        <span>📊 Bảng Xếp Hạng & Nhật Ký Nộp Bài Trực Tiếp</span>
        <span id="roomTitleLabel" style="font-size:12.5px;color:var(--muted)"></span>
      </h2>
      <div style="max-height:520px;overflow-y:auto">
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Học sinh</th>
              <th>Ngôn ngữ</th>
              <th>Verdict</th>
              <th>Thời gian</th>
              <th class="no-print">Mã nguồn</th>
            </tr>
          </thead>
          <tbody id="subTableBody">
            <tr><td colspan="6" style="color:var(--muted)">Hãy bấm <b>“⚡ Giả lập 40 Học sinh Nộp bài Đồng thời”</b> hoặc tạo phòng thi mới để bắt đầu.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div>
      <div class="card">
        <h2><span>🔍 Ma Trận Phát Hiện Đạo Văn Winnowing (k=5, w=4)</span></h2>
        <div id="plagSummary" style="font-size:13px;color:var(--muted);margin-bottom:10px">
          Nhấn nút <b>“🔍 Quét Đạo Văn Winnowing Toàn Phòng (N×N)”</b> để đối chiếu dấu vân tay cấu trúc token giữa toàn bộ học sinh.
        </div>
        <div id="plagList"></div>
      </div>

      <div class="card" id="diffCard" style="display:none">
        <h2><span>⚖️ Đối Chiếu Trực Quan 2 Bài Nộp Nghi Vấn</span></h2>
        <div id="diffTitle" style="font-size:12.5px;color:var(--bad);font-weight:700;margin-bottom:8px"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:12px;color:var(--accent);margin-bottom:4px" id="diffLabelA">Học sinh A</div>
            <pre id="diffCodeA"></pre>
          </div>
          <div>
            <div style="font-size:12px;color:var(--accent);margin-bottom:4px" id="diffLabelB">Học sinh B</div>
            <pre id="diffCodeB"></pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</main>

<script>
let currentCode = '';
let lastPlagPairs = [];

async function api(path, payload) {
  const opts = payload ? { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) } : {};
  const r = await fetch(path, opts);
  return r.json();
}

async function initDashboard() {
  const data = await api('/exams');
  const codes = Object.keys(data.exams || {});
  const sel = document.getElementById('roomSelect');
  sel.innerHTML = codes.map(c => `<option value="${c}">${c} — ${data.exams[c].title}</option>`).join('');
  if (codes.length > 0) {
    await selectRoom(codes[codes.length - 1]);
  } else {
    await createRoom();
  }
}

async function createRoom() {
  const title = document.getElementById('roomTitle').value || 'Phòng thi DrgX CP';
  const res = await api('/exam/create', { title });
  if (res.code) {
    const data = await api('/exams');
    const codes = Object.keys(data.exams || {});
    const sel = document.getElementById('roomSelect');
    sel.innerHTML = codes.map(c => `<option value="${c}">${c} — ${data.exams[c].title}</option>`).join('');
    sel.value = res.code;
    await selectRoom(res.code);
  }
}

async function selectRoom(code) {
  if (!code) return;
  currentCode = code;
  document.getElementById('csvExportBtn').href = `/exam/${code}/export.csv`;
  const exam = await api(`/exam/${code}`);
  document.getElementById('kpiRoom').textContent = exam.code || code;
  document.getElementById('roomTitleLabel').textContent = exam.title || '';
  const subs = exam.submissions || [];
  document.getElementById('kpiStudents').textContent = (exam.participants || []).length;
  const acCount = subs.filter(s => s.verdict === 'AC').length;
  document.getElementById('kpiAc').textContent = `${acCount} / ${subs.length}`;

  const tbody = document.getElementById('subTableBody');
  if (subs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">Chưa có bài nộp. Nhấn <b>“⚡ Giả lập 40 Học sinh Nộp bài Đồng thời”</b> để thử tải phòng máy.</td></tr>';
    return;
  }
  tbody.innerHTML = subs.map((s, idx) => {
    const totalMs = (s.tests || []).reduce((acc, t) => acc + (t.ms || 0), 0);
    const cls = s.verdict === 'AC' ? 'ac' : 'fail';
    const subTests = (s.tests || []).map(t => `${t.name}:${t.verdict}`).join(' ');
    return `<tr>
      <td>${idx + 1}</td>
      <td><b>${s.student}</b></td>
      <td>${(s.language || 'cpp').toUpperCase()}</td>
      <td><span class="tag ${cls}">${s.verdict}</span> <span style="font-size:11px;color:var(--muted)">(${subTests})</span></td>
      <td>${totalMs} ms</td>
      <td class="no-print"><button class="btn" style="padding:3px 8px;font-size:11px" onclick="viewSingleCode(${idx})">Xem code</button></td>
    </tr>`;
  }).join('');
  window._currentSubs = subs;
}

function viewSingleCode(idx) {
  const s = (window._currentSubs || [])[idx];
  if (!s) return;
  document.getElementById('diffCard').style.display = 'block';
  document.getElementById('diffTitle').textContent = `Chi tiết bài nộp: ${s.student} (${s.verdict})`;
  document.getElementById('diffLabelA').textContent = `${s.student} (${s.language})`;
  document.getElementById('diffCodeA').textContent = s.code || '// Không có mã nguồn';
  document.getElementById('diffLabelB').textContent = 'Chuỗi kết quả từng Testcase';
  document.getElementById('diffCodeB').textContent = JSON.stringify(s.tests || [], null, 2);
}

async function simulate40() {
  if (!currentCode) await createRoom();
  const res = await api('/exam/simulate-burst', { code: currentCode, count: 40 });
  await selectRoom(res.code || currentCode);
  await runAntiCheat();
}

async function runAntiCheat() {
  if (!currentCode) return;
  const res = await api('/exam/anti-cheat', { code: currentCode });
  lastPlagPairs = res.pairs || [];
  const flagged = res.flagged_count || 0;
  const kpiPlag = document.getElementById('kpiPlag');
  kpiPlag.textContent = `${flagged} cặp`;
  kpiPlag.style.color = flagged > 0 ? 'var(--bad)' : 'var(--good)';

  document.getElementById('plagSummary').innerHTML =
    `Đã quét <b>${res.students_scanned} học sinh</b> (${res.total_pairs_compared} cặp đối chiếu). Phát hiện <b style="color:${flagged > 0 ? 'var(--bad)' : 'var(--good)'}">${flagged} cặp nghi vấn đạo văn cấu trúc (≥ 65%)</b>:`;

  const listEl = document.getElementById('plagList');
  if (lastPlagPairs.length === 0) {
    listEl.innerHTML = '<div style="color:var(--good);font-weight:700">✓ Toàn bộ bài nộp trong phòng đều độc lập (< 50% tương đồng).</div>';
    return;
  }
  listEl.innerHTML = lastPlagPairs.map((p, i) => `
    <div style="padding:10px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--bg);display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div>
        <div style="font-weight:800;color:${p.flagged ? 'var(--bad)' : 'var(--warn)'}">
          🚨 ${p.student_a} ↔ ${p.student_b} — Tương đồng: ${p.similarity}%
        </div>
        <div style="font-size:11.5px;color:var(--muted)">Trùng ${p.shared_fingerprints} dấu vân tay k-gram (k=5, w=4) dù đã đổi tên biến/chú thích</div>
      </div>
      <button class="btn" style="padding:5px 10px;font-size:12px" onclick="showPlagPair(${i})">So sánh 2 cột</button>
    </div>
  `).join('');
  if (lastPlagPairs.length > 0) showPlagPair(0);
}

function showPlagPair(i) {
  const p = lastPlagPairs[i];
  if (!p) return;
  document.getElementById('diffCard').style.display = 'block';
  document.getElementById('diffTitle').textContent = `🚨 CẢNH BÁO WINNOWING: ${p.student_a} ↔ ${p.student_b} (Độ tương đồng cấu trúc: ${p.similarity}%)`;
  document.getElementById('diffLabelA').textContent = `${p.student_a} (Token: ${p.norm_a.slice(0, 45)}...)`;
  document.getElementById('diffCodeA').textContent = p.code_a;
  document.getElementById('diffLabelB').textContent = `${p.student_b} (Token: ${p.norm_b.slice(0, 45)}...)`;
  document.getElementById('diffCodeB').textContent = p.code_b;
}

initDashboard();
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, code, html_str: str):
        body = html_str.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-DrgX-Admin-Token')
        self.end_headers()

    def _is_admin_authorized(self):
        env_token = (os.environ.get('DRGX_ADMIN_TOKEN') or os.environ.get('DRGX_EXAM_ADMIN_KEY') or '').strip()
        if env_token:
            hdr_token = (self.headers.get('X-DrgX-Admin-Token') or '').strip()
            auth_hdr = (self.headers.get('Authorization') or '').strip()
            return hdr_token == env_token or auth_hdr == f'Bearer {env_token}'
        client_ip = self.client_address[0] if self.client_address else ''
        return client_ip in ('127.0.0.1', '::1', 'localhost')

    def _read_json(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise ValueError('BAD_CONTENT_LENGTH')
        if length < 0 or length > MAX_BODY_BYTES:
            raise ValueError('PAYLOAD_TOO_LARGE')
        raw = self.rfile.read(length).decode('utf-8') if length else '{}'
        return json.loads(raw or '{}')

    def do_GET(self):
        if self.path == '/dashboard':
            return self._send_html(200, DASHBOARD_HTML)
        if self.path == '/' and 'text/html' in (self.headers.get('Accept') or ''):
            return self._send_html(200, DASHBOARD_HTML)
        if self.path == '/' or self.path == '/health':
            return self._send(200, {
                'service': 'DrgX CP Exam Server',
                'status': 'ready',
                'version': '1.2.0',
                'concurrency': 'ThreadingHTTPServer',
                'features': ['dashboard', 'winnowing-anti-cheat', 'csv-export', 'burst-40']
            })
        if self.path == '/exams':
            with DATA_LOCK:
                data = load_data()
            return self._send(200, data)
        if self.path.startswith('/exam/') and self.path.endswith('/export.csv'):
            code = self.path.split('/exam/', 1)[1].rsplit('/export.csv', 1)[0].strip().upper()
            with DATA_LOCK:
                data = load_data()
                exam = data['exams'].get(code)
            if not exam:
                return self._send(404, {'error': 'Không tìm thấy phòng thi'})
            plag_res = scan_exam_plagiarism(exam)
            max_sim = plag_res.get('max_sim_by_student', {})
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(['STT', 'Mã phòng', 'Họ và tên học sinh', 'Ngôn ngữ', 'Kết quả (Verdict)', 'Số test đạt', 'Tổng thời gian (ms)', 'Độ tương đồng Winnowing cao nhất (%)', 'Trạng thái đạo văn', 'Thời điểm nộp'])
            for idx, sub in enumerate(exam.get('submissions', []), 1):
                st = sub.get('student', 'anonymous')
                tests = sub.get('tests', [])
                ac_cnt = sum(1 for t in tests if t.get('verdict') == 'AC')
                tot_ms = sum(t.get('ms', 0) for t in tests)
                sim = max_sim.get(st, 0.0)
                flag_txt = 'NGHI VẤN SAO CHÉP' if sim >= 65.0 else 'Hợp lệ'
                ts_str = datetime.datetime.fromtimestamp(sub.get('timestamp', int(time.time()))).strftime('%Y-%m-%d %H:%M:%S')
                writer.writerow([idx, code, st, sub.get('language', 'cpp').upper(), sub.get('verdict', ''), f'{ac_cnt}/{len(tests)}', tot_ms, f'{sim}%', flag_txt, ts_str])
            csv_bytes = ('\ufeff' + buf.getvalue()).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Content-Disposition', f'attachment; filename="Bang-diem-DrgX-{code}.csv"')
            self.send_header('Content-Length', str(len(csv_bytes)))
            self.end_headers()
            self.wfile.write(csv_bytes)
            return
        if self.path.startswith('/exam/'):
            code = self.path.split('/exam/', 1)[1].strip().upper()
            with DATA_LOCK:
                data = load_data()
                exam = data['exams'].get(code)
            if not exam:
                return self._send(404, {'error': 'Không tìm thấy phòng thi'})
            return self._send(200, exam)
        self._send(404, {'error': 'Not found'})

    def do_POST(self):
        try:
            payload = self._read_json()
        except ValueError as exc:
            if str(exc) == 'PAYLOAD_TOO_LARGE':
                return self._send(413, {'error': 'Payload vượt quá giới hạn 512KB'})
            return self._send(400, {'error': 'JSON hoặc Content-Length không hợp lệ'})
        except Exception:
            return self._send(400, {'error': 'Body JSON không hợp lệ'})

        if self.path == '/exam/create':
            if not self._is_admin_authorized():
                return self._send(403, {'error': 'Cần quyền Admin (localhost hoặc X-DrgX-Admin-Token)'})
            with DATA_LOCK:
                data = load_data()
                code = random_code()
                while code in data['exams']:
                    code = random_code()
                data['exams'][code] = {
                    'code': code,
                    'title': str(payload.get('title', 'Phòng thi DrgX CP'))[:120],
                    'createdAt': int(time.time()),
                    'participants': [],
                    'submissions': []
                }
                save_data(data)
                created_exam = data['exams'][code]
            return self._send(200, {'code': code, 'exam': created_exam})

        if self.path == '/exam/join':
            code = str(payload.get('code', '')).strip().upper()
            name = str(payload.get('name', 'hoc-sinh')).strip()[:64] or 'hoc-sinh'
            with DATA_LOCK:
                data = load_data()
                exam = data['exams'].get(code)
                if not exam:
                    return self._send(404, {'error': 'Mã phòng không tồn tại'})
                if name not in exam['participants']:
                    exam['participants'].append(name)
                save_data(data)
            return self._send(200, {'status': 'joined', 'exam': exam})

        if self.path == '/exam/simulate-burst':
            if not self._is_admin_authorized():
                return self._send(403, {'error': 'Cần quyền Admin'})
            code = str(payload.get('code', '')).strip().upper()
            count = min(max(int(payload.get('count', 40)), 5), 60)
            with DATA_LOCK:
                data = load_data()
                if not code or code not in data['exams']:
                    code = random_code()
                    data['exams'][code] = {
                        'code': code,
                        'title': 'Kiểm tra 45 phút Tin học 11 — C++17 & Python (40 máy)',
                        'createdAt': int(time.time()),
                        'participants': [],
                        'submissions': []
                    }
                exam = data['exams'][code]
                generate_classroom_burst(exam, count=count)
                save_data(data)
            return self._send(200, {'status': 'simulated', 'code': code, 'count': count, 'exam': exam})

        if self.path == '/exam/anti-cheat':
            code = str(payload.get('code', '')).strip().upper()
            with DATA_LOCK:
                data = load_data()
                exam = data['exams'].get(code)
            if not exam:
                return self._send(404, {'error': 'Mã phòng không tồn tại'})
            report = scan_exam_plagiarism(exam)
            return self._send(200, report)

        if self.path == '/submit':
            code = str(payload.get('examCode', '')).strip().upper()
            with DATA_LOCK:
                data = load_data()
                if code not in data['exams']:
                    return self._send(404, {'error': 'Mã phòng không tồn tại'})
            lang = str(payload.get('language', 'cpp')).strip().lower()
            src = str(payload.get('code', ''))
            student = str(payload.get('student', 'anonymous')).strip()[:64] or 'anonymous'
            with GRADE_SLOTS:
                res = judge_submission(code, lang, src)
            record = {
                'student': student,
                'language': lang,
                'verdict': res['verdict'],
                'tests': res.get('tests', []),
                'compile_error': res.get('compile_error', ''),
                'message': res.get('message', ''),
                'code': src[:16384],
                'timestamp': int(time.time())
            }
            with DATA_LOCK:
                data = load_data()
                exam = data['exams'].get(code)
                if not exam:
                    return self._send(404, {'error': 'Mã phòng không tồn tại'})
                exam['submissions'].append(record)
                save_data(data)
            return self._send(200, record)

        self._send(404, {'error': 'Not found'})

    def log_message(self, fmt, *args):
        return


class ExamServer(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


def main():
    host = os.environ.get('DRGX_CP_SERVER_HOST', '127.0.0.1')
    port = int(os.environ.get('DRGX_CP_SERVER_PORT', '8765'))
    print(f'[DrgX CP Exam Server] http://{host}:{port} (Dashboard: http://{host}:{port}/dashboard | Queue={ExamServer.request_queue_size})')
    ExamServer((host, port), Handler).serve_forever()


if __name__ == '__main__':
    main()

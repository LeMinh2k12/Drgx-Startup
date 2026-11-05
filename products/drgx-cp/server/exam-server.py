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
import hashlib, hmac, io
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
    _apply_win32_sddl_label(DATA_FILE, 'S:(ML;OICI;NRNWNX;;;ME)')


def random_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def find_expected_file(test_in: Path):
    for ext in ('.out', '.ans', '.a'):
        cand = test_in.with_name(test_in.stem + ext)
        if cand.exists():
            return cand
    return None


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# CRYPTOGRAPHIC TAMPER-EVIDENT AUDIT CHAIN & SIGNED RECEIPTS (MIT 6.824 / 6.858)
# ---------------------------------------------------------------------------
GENESIS_PREV_HASH = '0' * 64
RECEIPT_HMAC_SECRET = (
    os.environ.get('DRGX_RECEIPT_SECRET')
    or os.environ.get('DRGX_ADMIN_TOKEN')
    or 'drgx-mit-6858-authoritative-exam-hmac-secret-v2'
).encode('utf-8')


def _sha256_hex(text: str) -> str:
    return hashlib.sha256((text or '').encode('utf-8')).hexdigest()


def _compute_submission_score(verdict: str, tests: list) -> float:
    if tests:
        ac_cnt = sum(1 for t in tests if t.get('verdict') == 'AC')
        return round((100.0 * ac_cnt) / len(tests), 2)
    return 100.0 if verdict == 'AC' else 0.0


def compute_audit_hash(
    exam_code: str,
    sub_id: str,
    student: str,
    timestamp: int,
    verdict: str,
    score: float,
    code_sha256: str,
    audit_prev_hash: str,
) -> str:
    """
    Tính mắt xích băm bất biến theo chuẩn MIT 6.824 / 6.858:
    SHA256(f"{exam_code}|{sub_id}|{student}|{timestamp}|{verdict}|{score}|{sha256(code)}|{audit_prev_hash}")
    """
    canonical = f"{exam_code}|{sub_id}|{student}|{int(timestamp)}|{verdict}|{float(score):.2f}|{code_sha256}|{audit_prev_hash}"
    return _sha256_hex(canonical)


def sign_submission_receipt(
    exam_code: str,
    sub_id: str,
    student: str,
    timestamp: int,
    verdict: str,
    score: float,
    code_sha256: str,
    audit_prev_hash: str,
    audit_hash: str,
) -> str:
    """Ký điện tử HMAC-SHA256 lên biên lai nộp bài để chống chối bỏ (Non-Repudiation)."""
    msg = f"{exam_code}|{sub_id}|{student}|{int(timestamp)}|{verdict}|{float(score):.2f}|{code_sha256}|{audit_prev_hash}|{audit_hash}".encode('utf-8')
    return hmac.new(RECEIPT_HMAC_SECRET, msg, hashlib.sha256).hexdigest()


def compute_merkle_root(leaf_hashes: list[str]) -> str:
    """Tính Merkle Root nhị phân trên tập các audit_hash của phòng thi."""
    if not leaf_hashes:
        return GENESIS_PREV_HASH
    layer = list(leaf_hashes)
    while len(layer) > 1:
        next_layer = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i + 1] if (i + 1) < len(layer) else layer[i]
            next_layer.append(_sha256_hex(f"{left}:{right}"))
        layer = next_layer
    return layer[0]


def attach_audit_chain_record(exam: dict, record: dict) -> dict:
    """
    Gắn mắt xích SHA-256 Hash-Chain và Biên lai HMAC-SHA256 vào bản ghi bài nộp.
    Hàm này bắt buộc được gọi bên trong DATA_LOCK để đảm bảo tính tuần tự tuyến tính (Linearizability).
    """
    exam_code = str(exam.get('code', '')).strip().upper()
    subs = exam.setdefault('submissions', [])
    seq_no = len(subs) + 1
    sub_id = str(record.get('sub_id') or f"SUB-{seq_no:04d}")
    student = str(record.get('student', 'anonymous'))
    timestamp = int(record.get('timestamp', int(time.time())))
    verdict = str(record.get('verdict', 'FAIL'))
    score = _compute_submission_score(verdict, record.get('tests', []))
    code_sha256 = _sha256_hex(record.get('code', ''))
    audit_prev_hash = subs[-1].get('audit_hash', GENESIS_PREV_HASH) if subs else GENESIS_PREV_HASH
    audit_hash = compute_audit_hash(
        exam_code, sub_id, student, timestamp, verdict, score, code_sha256, audit_prev_hash
    )
    signature = sign_submission_receipt(
        exam_code, sub_id, student, timestamp, verdict, score, code_sha256, audit_prev_hash, audit_hash
    )
    receipt = {
        'receipt_id': f"DRGX-{exam_code}-{sub_id}-{audit_hash[:10].upper()}",
        'exam_code': exam_code,
        'sub_id': sub_id,
        'student': student,
        'timestamp': timestamp,
        'verdict': verdict,
        'score': score,
        'code_sha256': code_sha256,
        'audit_prev_hash': audit_prev_hash,
        'audit_hash': audit_hash,
        'signature': signature,
        'algorithm': 'HMAC-SHA256',
    }
    record['sub_id'] = sub_id
    record['score'] = score
    record['code_sha256'] = code_sha256
    record['audit_prev_hash'] = audit_prev_hash
    record['audit_hash'] = audit_hash
    record['submission_receipt'] = receipt
    exam['head_hash'] = audit_hash
    return record


def verify_exam_audit_chain(exam: dict) -> dict:
    """
    Kiểm định toàn bộ chuỗi băm SHA-256 (audit_prev_hash -> audit_hash) của phòng thi.
    Phát hiện ngay lập tức nếu bất kỳ điểm số, mã nguồn, thời gian hoặc thứ tự bài nộp nào trong exams.json bị chỉnh sửa trái phép.
    """
    exam_code = str(exam.get('code', '')).strip().upper()
    subs = exam.get('submissions', [])
    expected_prev = GENESIS_PREV_HASH
    leaf_hashes = []
    for idx, sub in enumerate(subs):
        sub_id = str(sub.get('sub_id') or f"SUB-{idx + 1:04d}")
        student = str(sub.get('student', 'anonymous'))
        timestamp = int(sub.get('timestamp', 0))
        verdict = str(sub.get('verdict', ''))
        score = sub.get('score')
        if score is None:
            score = _compute_submission_score(verdict, sub.get('tests', []))
        actual_code_sha = _sha256_hex(sub.get('code', ''))
        stored_code_sha = str(sub.get('code_sha256') or actual_code_sha)
        stored_prev = str(sub.get('audit_prev_hash') or '')
        stored_hash = str(sub.get('audit_hash') or '')

        if stored_prev != expected_prev:
            return {
                'valid': False,
                'exam_code': exam_code,
                'checked_records': idx,
                'checked_submissions': idx,
                'total_records': len(subs),
                'total_submissions': len(subs),
                'tampered_index': idx,
                'tampered_sub_id': sub_id,
                'tampered_student': student,
                'reason': 'BROKEN_PREV_HASH_LINK',
                'head_hash': expected_prev,
                'merkle_root': compute_merkle_root(leaf_hashes),
            }
        if stored_code_sha != actual_code_sha:
            return {
                'valid': False,
                'exam_code': exam_code,
                'checked_records': idx,
                'checked_submissions': idx,
                'total_records': len(subs),
                'total_submissions': len(subs),
                'tampered_index': idx,
                'tampered_sub_id': sub_id,
                'tampered_student': student,
                'reason': 'CODE_SHA256_MISMATCH',
                'head_hash': expected_prev,
                'merkle_root': compute_merkle_root(leaf_hashes),
            }
        expected_hash = compute_audit_hash(
            exam_code, sub_id, student, timestamp, verdict, float(score), actual_code_sha, expected_prev
        )
        if not hmac.compare_digest(stored_hash, expected_hash):
            return {
                'valid': False,
                'exam_code': exam_code,
                'checked_records': idx,
                'checked_submissions': idx,
                'total_records': len(subs),
                'total_submissions': len(subs),
                'tampered_index': idx,
                'tampered_sub_id': sub_id,
                'tampered_student': student,
                'reason': 'AUDIT_HASH_MISMATCH',
                'head_hash': expected_prev,
                'merkle_root': compute_merkle_root(leaf_hashes),
            }
        receipt = sub.get('submission_receipt')
        if isinstance(receipt, dict) and receipt.get('signature'):
            expected_sig = sign_submission_receipt(
                exam_code, sub_id, student, timestamp, verdict, float(score), actual_code_sha,
                expected_prev, expected_hash
            )
            if not hmac.compare_digest(str(receipt.get('signature', '')), expected_sig):
                return {
                    'valid': False,
                    'exam_code': exam_code,
                    'checked_records': idx,
                    'checked_submissions': idx,
                    'total_records': len(subs),
                    'total_submissions': len(subs),
                    'tampered_index': idx,
                    'tampered_sub_id': sub_id,
                    'tampered_student': student,
                    'reason': 'RECEIPT_SIGNATURE_MISMATCH',
                    'head_hash': expected_prev,
                    'merkle_root': compute_merkle_root(leaf_hashes),
                }
        leaf_hashes.append(expected_hash)
        expected_prev = expected_hash

    return {
        'valid': True,
        'exam_code': exam_code,
        'checked_records': len(subs),
        'checked_submissions': len(subs),
        'total_records': len(subs),
        'total_submissions': len(subs),
        'tampered_index': None,
        'head_hash': expected_prev,
        'merkle_root': compute_merkle_root(leaf_hashes),
    }


def verify_submission_receipt(payload: dict, data_snapshot: dict | None = None) -> dict:
    """Xác thực chữ ký điện tử HMAC-SHA256 và mắt xích SHA-256 của biên lai học sinh."""
    if isinstance(payload.get('submission_receipt'), dict):
        rcpt = payload['submission_receipt']
    elif isinstance(payload.get('receipt'), dict):
        rcpt = payload['receipt']
    else:
        rcpt = payload if isinstance(payload, dict) else {}

    exam_code = str(rcpt.get('exam_code', '')).strip().upper()
    sub_id = str(rcpt.get('sub_id', '')).strip()
    student = str(rcpt.get('student', '')).strip()
    verdict = str(rcpt.get('verdict', '')).strip()
    code_sha256 = str(rcpt.get('code_sha256', '')).strip()
    audit_prev_hash = str(rcpt.get('audit_prev_hash', '')).strip()
    audit_hash = str(rcpt.get('audit_hash', '')).strip()
    signature = str(rcpt.get('signature', '')).strip()
    try:
        timestamp = int(rcpt.get('timestamp', 0))
        score = float(rcpt.get('score', 0.0))
    except (TypeError, ValueError):
        return {'valid': False, 'error': 'Trường timestamp hoặc score trong biên lai không hợp lệ'}

    if not all([exam_code, sub_id, student, verdict, code_sha256, audit_prev_hash, audit_hash, signature]):
        return {'valid': False, 'error': 'Biên lai thiếu trường mật mã bắt buộc'}

    expected_audit_hash = compute_audit_hash(
        exam_code, sub_id, student, timestamp, verdict, score, code_sha256, audit_prev_hash
    )
    expected_sig = sign_submission_receipt(
        exam_code, sub_id, student, timestamp, verdict, score, code_sha256, audit_prev_hash, expected_audit_hash
    )
    hash_ok = hmac.compare_digest(audit_hash, expected_audit_hash)
    sig_ok = hmac.compare_digest(signature, expected_sig)
    valid = bool(hash_ok and sig_ok)

    in_chain = False
    if valid and data_snapshot and exam_code in data_snapshot.get('exams', {}):
        exam_obj = data_snapshot['exams'][exam_code]
        for s in exam_obj.get('submissions', []):
            if s.get('sub_id') == sub_id and hmac.compare_digest(str(s.get('audit_hash', '')), audit_hash):
                in_chain = True
                break

    return {
        'valid': valid,
        'hash_valid': hash_ok,
        'signature_valid': sig_ok,
        'in_audit_chain': in_chain,
        'receipt_id': rcpt.get('receipt_id', ''),
        'exam_code': exam_code,
        'sub_id': sub_id,
        'student': student,
        'timestamp': timestamp,
        'verdict': verdict,
        'score': score,
        'audit_hash': audit_hash,
    }


def compute_dual_leaderboards(exam: dict) -> dict:
    """
    Tính toán Bảng Điểm Đa Thể Thức (Dual Contest Leaderboard):
    1) IOI / HSG Việt Nam Mode: Tổng điểm subtask cao nhất mỗi bài, ưu tiên thời gian đạt điểm tối đa & tổng ms.
    2) ICPC Quốc tế Mode: Số bài AC + Tổng thời gian phạt T_penalty = t_AC (phút) + 20 * số lần nộp sai trước khi AC.
    """
    exam_start = int(exam.get('createdAt', 0)) or int(time.time())
    subs = exam.get('submissions', [])
    participants = list(exam.get('participants', []))
    all_students = set(participants)
    for s in subs:
        if s.get('student'):
            all_students.add(s['student'])

    # Cấu trúc tích lũy theo học sinh -> theo mã bài (mặc định P1)
    ioi_state = {
        st: {'problems': {}, 'attempts': 0, 'last_ts': exam_start}
        for st in all_students
    }
    icpc_state = {
        st: {'problems': {}, 'total_attempts': 0}
        for st in all_students
    }

    for sub in subs:
        st = sub.get('student', 'anonymous')
        if st not in ioi_state:
            ioi_state[st] = {'problems': {}, 'attempts': 0, 'last_ts': exam_start}
            icpc_state[st] = {'problems': {}, 'total_attempts': 0}
        prob = str(sub.get('problem') or sub.get('problem_id') or 'P1').strip().upper()
        verdict = str(sub.get('verdict', 'FAIL'))
        tests = sub.get('tests', [])
        score = sub.get('score')
        if score is None:
            score = _compute_submission_score(verdict, tests)
        score = float(score)
        exec_ms = sum(int(t.get('ms', 0)) for t in tests)
        ts = int(sub.get('timestamp', exam_start))

        # --- IOI Subtask Mode ---
        ioi_st = ioi_state[st]
        ioi_st['attempts'] += 1
        p_ioi = ioi_st['problems'].get(prob)
        if (
            p_ioi is None
            or score > p_ioi['best_score']
            or (score == p_ioi['best_score'] and exec_ms < p_ioi['best_ms'])
        ):
            ioi_st['problems'][prob] = {
                'best_score': score,
                'best_ms': exec_ms,
                'best_ts': ts if (p_ioi is None or score > p_ioi['best_score']) else p_ioi['best_ts'],
                'verdict': verdict,
            }

        # --- ICPC Penalty Mode ---
        icpc_st = icpc_state[st]
        icpc_st['total_attempts'] += 1
        p_icpc = icpc_st['problems'].setdefault(prob, {
            'solved': False,
            'wrong_before_ac': 0,
            'ac_time_min': 0,
            'penalty_min': 0,
            'exec_ms': 0,
        })
        if not p_icpc['solved']:
            if verdict == 'AC':
                p_icpc['solved'] = True
                t_ac_min = max(0, ts - exam_start) // 60
                p_icpc['ac_time_min'] = t_ac_min
                p_icpc['penalty_min'] = t_ac_min + 20 * p_icpc['wrong_before_ac']
                p_icpc['exec_ms'] = exec_ms
            elif verdict not in ('CE', 'NO_TESTS', 'BAD_LANG'):
                p_icpc['wrong_before_ac'] += 1

    ioi_rows = []
    for st, info in ioi_state.items():
        probs = info['problems']
        tot_score = round(sum(p['best_score'] for p in probs.values()), 2)
        tot_ms = sum(p['best_ms'] for p in probs.values())
        best_ts = max((p['best_ts'] for p in probs.values()), default=exam_start)
        elapsed_sec = max(0, best_ts - exam_start) if probs else 0
        full_ac = sum(1 for p in probs.values() if p['best_score'] >= 100.0)
        ioi_rows.append({
            'student': st,
            'total_score': tot_score,
            'solved_full': full_ac,
            'attempts': info['attempts'],
            'exec_ms': tot_ms,
            'elapsed_sec': elapsed_sec,
            'verdict': 'AC' if (probs and all(p['best_score'] >= 100.0 for p in probs.values())) else ('PARTIAL' if tot_score > 0 else 'FAIL'),
        })
    ioi_rows.sort(key=lambda r: (-r['total_score'], r['elapsed_sec'], r['exec_ms'], r['student']))
    for idx, r in enumerate(ioi_rows, 1):
        r['rank'] = idx

    icpc_rows = []
    for st, info in icpc_state.items():
        probs = info['problems']
        solved_cnt = sum(1 for p in probs.values() if p['solved'])
        penalty_tot = sum(p['penalty_min'] for p in probs.values() if p['solved'])
        wrong_tot = sum(p['wrong_before_ac'] for p in probs.values())
        exec_tot = sum(p['exec_ms'] for p in probs.values() if p['solved'])
        icpc_rows.append({
            'student': st,
            'solved': solved_cnt,
            'penalty_minutes': penalty_tot,
            'wrong_attempts': wrong_tot,
            'total_attempts': info['total_attempts'],
            'exec_ms': exec_tot,
        })
    icpc_rows.sort(key=lambda r: (-r['solved'], r['penalty_minutes'], r['exec_ms'], r['total_attempts'], r['student']))
    for idx, r in enumerate(icpc_rows, 1):
        r['rank'] = idx

    return {'ioi': ioi_rows, 'icpc': icpc_rows}


# WINNOWING K-GRAM ANTI-CHEAT ENGINE (Chuẩn hóa Token + Băm trượt k=5, w=4)
# ---------------------------------------------------------------------------
def normalize_code_tokens(code: str) -> str:
    """Chuẩn hóa mã nguồn: bỏ comment/directive và khung nhập xuất mẫu (boilerplate), biến tên biến/hàm thành '@', số thành '0', chuỗi thành '$'."""
    no_block = re.sub(r'/\*[\s\S]*?\*/', ' ', code)
    lines = []
    for ln in no_block.splitlines():
        s = ln.strip()
        if s.startswith('//') or s.startswith('#'):
            continue
        ln = re.sub(r'//.*$', '', ln)
        lines.append(ln)
    clean = '\n'.join(lines)
    # Loại bỏ khung mẫu C++ phổ biến để tránh cảnh báo giả trên bài ngắn 20-50 dòng
    clean = re.sub(r'\busing\s+namespace\s+std\s*;', ' ', clean)
    clean = re.sub(r'\bios(?:_base)?\s*::\s*sync_with_stdio\s*\([^)]*\)\s*;?', ' ', clean)
    clean = re.sub(r'\b(?:cin|cout)\s*\.\s*tie\s*\([^)]*\)\s*;?', ' ', clean)
    clean = re.sub(r'\bfreopen\s*\([^)]*\)\s*;?', ' ', clean)
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


MIN_NORM_LEN_FOR_FLAG = 60
MIN_FP_COUNT_FOR_FLAG = 15


def compare_submissions_winnowing(code_a: str, code_b: str) -> dict:
    norm_a = normalize_code_tokens(code_a)
    norm_b = normalize_code_tokens(code_b)
    fp_a = winnow_fingerprints(norm_a, 5, 4)
    fp_b = winnow_fingerprints(norm_b, 5, 4)
    if not fp_a or not fp_b:
        return {
            'similarity': 0.0,
            'flagged': False,
            'short_code_guard': True,
            'shared_fingerprints': 0,
            'norm_a': norm_a[:120],
            'norm_b': norm_b[:120],
        }
    counts_b = {}
    for h in fp_b:
        counts_b[h] = counts_b.get(h, 0) + 1
    shared = 0
    for h in fp_a:
        if counts_b.get(h, 0) > 0:
            shared += 1
            counts_b[h] -= 1
    sim = round((200.0 * shared) / (len(fp_a) + len(fp_b)), 1)
    short_guard = (min(len(norm_a), len(norm_b)) < MIN_NORM_LEN_FOR_FLAG) or (min(len(fp_a), len(fp_b)) < MIN_FP_COUNT_FOR_FLAG)
    return {
        'similarity': sim,
        'flagged': (sim >= 65.0) and (not short_guard),
        'short_code_guard': short_guard,
        'shared_fingerprints': shared,
        'total_fingerprints_a': len(fp_a),
        'total_fingerprints_b': len(fp_b),
        'norm_a': norm_a[:140],
        'norm_b': norm_b[:140],
    }


def scan_exam_plagiarism(exam: dict) -> dict:
    """Quét N×N các bài nộp mới nhất của từng học sinh trong phòng thi (có tiền xử lý bộ nhớ đệm O(N) vân tay)."""
    latest_by_student = {}
    for sub in exam.get('submissions', []):
        st = sub.get('student', 'anonymous')
        if sub.get('code'):
            latest_by_student[st] = sub
    students = sorted(latest_by_student.keys())
    # Tiền xử lý chuẩn hóa token và vân tay k-gram 1 lần cho mỗi học sinh (O(N) thay vì O(N^2))
    cached_fp = {}
    for s in students:
        code_str = latest_by_student[s].get('code', '')
        norm_s = normalize_code_tokens(code_str)
        fp_s = winnow_fingerprints(norm_s, 5, 4)
        short_s = (len(norm_s) < MIN_NORM_LEN_FOR_FLAG) or (len(fp_s) < MIN_FP_COUNT_FOR_FLAG)
        counts_s = {}
        for h in fp_s:
            counts_s[h] = counts_s.get(h, 0) + 1
        cached_fp[s] = (norm_s, fp_s, counts_s, short_s)

    pairs = []
    max_sim_by_student = {s: 0.0 for s in students}
    sim_grid = [[0.0] * len(students) for _ in students]
    for i in range(len(students)):
        sa = students[i]
        norm_a, fp_a, _, short_a = cached_fp[sa]
        if short_a or not fp_a:
            continue
        sub_a = latest_by_student[sa]
        for j in range(i + 1, len(students)):
            sb = students[j]
            norm_b, fp_b, counts_b_orig, short_b = cached_fp[sb]
            if short_b or not fp_b:
                continue
            counts_b = counts_b_orig.copy()
            shared = 0
            for h in fp_a:
                if counts_b.get(h, 0) > 0:
                    shared += 1
                    counts_b[h] -= 1
            sim = round((200.0 * shared) / (len(fp_a) + len(fp_b)), 1)
            sim_grid[i][j] = sim
            sim_grid[j][i] = sim
            if sim > max_sim_by_student[sa]:
                max_sim_by_student[sa] = sim
            if sim > max_sim_by_student[sb]:
                max_sim_by_student[sb] = sim
            if sim >= 50.0:
                sub_b = latest_by_student[sb]
                pairs.append({
                    'student_a': sa,
                    'student_b': sb,
                    'language_a': sub_a.get('language', 'cpp'),
                    'language_b': sub_b.get('language', 'cpp'),
                    'similarity': sim,
                    'flagged': sim >= 65.0,
                    'shared_fingerprints': shared,
                    'norm_a': norm_a[:140],
                    'norm_b': norm_b[:140],
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
        'matrix_students': students,
        'matrix': sim_grid,
    }


def _build_safe_child_env(workdir: Path) -> dict:
    """Tạo môi trường tối giản cho tiến trình bài nộp, loại bỏ hoàn toàn DRGX_ADMIN_TOKEN và biến nhạy cảm."""
    safe = {}
    for k in ('SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'PATH'):
        val = os.environ.get(k)
        if val:
            safe[k] = val
    safe['TEMP'] = str(workdir)
    safe['TMP'] = str(workdir)
    safe['PYTHONIOENCODING'] = 'utf-8'
    return safe


def _assign_win32_job_limits(proc_handle, mem_limit_bytes: int = 256 * 1024 * 1024, max_procs: int = 2):
    """Gắn tiến trình bài làm vào Windows Job Object để giới hạn RAM (256MB), số tiến trình con và tự hủy khi đóng."""
    if os.name != 'nt':
        return None
    try:
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.windll.kernel32

        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [('ReadOperationCount', ctypes.c_uint64), ('WriteOperationCount', ctypes.c_uint64),
                        ('OtherOperationCount', ctypes.c_uint64), ('ReadTransferCount', ctypes.c_uint64),
                        ('WriteTransferCount', ctypes.c_uint64), ('OtherTransferCount', ctypes.c_uint64)]

        class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [('PerProcessUserTimeLimit', ctypes.c_int64), ('PerJobUserTimeLimit', ctypes.c_int64),
                        ('LimitFlags', wintypes.DWORD), ('MinimumWorkingSetSize', ctypes.c_size_t),
                        ('MaximumWorkingSetSize', ctypes.c_size_t), ('ActiveProcessLimit', wintypes.DWORD),
                        ('Affinity', ctypes.c_size_t), ('PriorityClass', wintypes.DWORD),
                        ('SchedulingClass', wintypes.DWORD)]

        class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [('BasicLimitInformation', JOBOBJECT_BASIC_LIMIT_INFORMATION),
                        ('IoInfo', IO_COUNTERS), ('ProcessMemoryLimit', ctypes.c_size_t),
                        ('JobMemoryLimit', ctypes.c_size_t), ('PeakProcessMemoryUsed', ctypes.c_size_t),
                        ('PeakJobMemoryUsed', ctypes.c_size_t)]

        k32.CreateJobObjectW.restype = ctypes.c_void_p
        k32.SetInformationJobObject.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        k32.AssignProcessToJobObject.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        job = k32.CreateJobObjectW(None, None)
        if not job:
            return None
        info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        # 0x00000100 = PROCESS_MEMORY, 0x00002000 = KILL_ON_JOB_CLOSE, 0x00000008 = ACTIVE_PROCESS, 0x00000400 = DIE_ON_UNHANDLED_EXCEPTION
        info.BasicLimitInformation.LimitFlags = 0x00000100 | 0x00000200 | 0x00002000 | 0x00000008 | 0x00000400
        info.BasicLimitInformation.ActiveProcessLimit = max_procs
        info.ProcessMemoryLimit = mem_limit_bytes
        info.JobMemoryLimit = mem_limit_bytes
        k32.SetInformationJobObject(ctypes.c_void_p(job), 9, ctypes.byref(info), ctypes.sizeof(info))
        k32.AssignProcessToJobObject(ctypes.c_void_p(job), ctypes.c_void_p(proc_handle))
        return job
    except Exception as e:
        print('JOB_ERR:', e)
        return None


def _close_win32_handle(handle):
    if handle and os.name == 'nt':
        try:
            import ctypes
            k32 = ctypes.windll.kernel32
            k32.CloseHandle.argtypes = [ctypes.c_void_p]
            h_val = handle.value if isinstance(handle, ctypes.c_void_p) else int(handle)
            if h_val:
                k32.CloseHandle(ctypes.c_void_p(h_val))
        except Exception:
            pass



# ---------------------------------------------------------------------------
# WINDOWS KERNEL MANDATORY INTEGRITY CONTROL (MIC) & RESTRICTED TOKEN SANDBOX
# ---------------------------------------------------------------------------
FORBIDDEN_INCLUDE_RE = re.compile(
    r'#\s*include\s*[<"]([^>"]+)[>"]', re.IGNORECASE
)
WIN_DEVICE_NAMES = {
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
}
FORBIDDEN_HEADERS = {
    'windows.h', 'winsock.h', 'winsock2.h', 'ws2tcpip.h', 'wininet.h',
    'tlhelp32.h', 'psapi.h', 'shlobj.h', 'shellapi.h', 'sys/socket.h',
}


MACRO_INCLUDE_RE = re.compile(r'^\s*#\s*include\s+(?![<"])(\S+)', re.IGNORECASE | re.MULTILINE)
FORBIDDEN_CPP_CALL_RE = re.compile(
    r'\b(?:__asm__|__asm|asm|WinExec|CreateProcessA|CreateProcessW|CreateProcessAsUserW|'
    r'ShellExecuteA|ShellExecuteW|WSAStartup|URLDownloadToFileA|URLDownloadToFileW|'
    r'VirtualAllocEx|WriteProcessMemory|OpenProcess)\b'
)


def _scan_cpp_security(code_text: str) -> str | None:
    """Quét chặn #include đường dẫn tuyệt đối, '..', thiết bị DOS, macro #include động và API hệ thống."""
    m_mac = MACRO_INCLUDE_RE.search(code_text)
    if m_mac:
        return f'Từ chối biên dịch: Không cho phép #include thông qua macro ({m_mac.group(1)}).'
    for m in FORBIDDEN_INCLUDE_RE.finditer(code_text):
        inc = m.group(1).strip().replace('\\', '/')
        low = inc.lower()
        if low.startswith('/') or (len(low) >= 2 and low[1] == ':') or '..' in low:
            return f'Từ chối biên dịch: #include chứa đường dẫn tuyệt đối hoặc ".." ({inc}).'
        base = low.split('/')[-1].split('.')[0].upper()
        if base in WIN_DEVICE_NAMES:
            return f'Từ chối biên dịch: #include trỏ tới tên thiết bị hệ thống ({inc}).'
        if low in FORBIDDEN_HEADERS:
            return f'Từ chối biên dịch: Không cho phép thư viện hệ thống/mạng ({inc}) trong bài thi thuật toán.'
    m_call = FORBIDDEN_CPP_CALL_RE.search(code_text)
    if m_call:
        return f'Từ chối biên dịch: Phát hiện từ khóa/API hệ thống bị cấm ({m_call.group(0)}).'
    return None


def _compile_cpp_in_job(src: Path, exe: Path, workdir: Path, safe_env: dict, timeout_sec: float = 12.0, mem_limit_bytes: int = 256 * 1024 * 1024):
    """Biên dịch g++ bên trong Windows Job Object (giới hạn 256 MB RAM, tự hủy cây tiến trình cc1plus.exe khi vượt ngưỡng)."""
    cmd = ['g++', '-O2', '-std=c++17', '-fmax-errors=5', '-ftemplate-depth=64', str(src), '-o', str(exe)]
    creationflags = getattr(subprocess, 'CREATE_NO_WINDOW', 0) if os.name == 'nt' else 0
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding='utf-8', errors='replace', cwd=str(workdir), env=safe_env,
        creationflags=creationflags
    )
    job_handle = _assign_win32_job_limits(getattr(proc, '_handle', None), mem_limit_bytes=mem_limit_bytes, max_procs=8)
    try:
        out, err = proc.communicate(timeout=timeout_sec)
        return proc.returncode, out, err, False
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
        except Exception:
            pass
        return -1, '', 'Quá thời gian biên dịch (12 giây).', True
    finally:
        _close_win32_handle(job_handle)


PY_SANDBOX_GUARD = """import sys, builtins
_BLOCKED_PREFIXES = (
    'socket.', 'subprocess.', 'os.system', 'os.popen', 'os.spawn', 'os.exec',
    'os.fork', 'os.kill', 'os.remove', 'os.unlink', 'os.rmdir', 'os.rename',
    'os.replace', 'os.chmod', 'os.chown', 'shutil.', 'ctypes.', 'winreg.',
    'urllib.', 'http.', 'ftplib.', 'smtplib.', 'telnetlib.', 'webbrowser.',
    'multiprocessing.', 'concurrent.'
)
def _drgx_audit(event, args):
    if event.startswith(_BLOCKED_PREFIXES) or event in ('os.system', 'os.popen', 'os.remove', 'os.unlink', 'os.rmdir', 'ctypes.dlopen', 'ctypes.cdll'):
        raise PermissionError('DrgX Sandbox blocked event: ' + event)
sys.addaudithook(_drgx_audit)
with open('main.py', 'r', encoding='utf-8') as _f:
    _code = compile(_f.read(), 'main.py', 'exec')
exec(_code, {'__name__': '__main__'})
"""


_MIC_LOCK = threading.Lock()
_SPAWN_LOCK = threading.Lock()

if os.name == 'nt':
    import ctypes
    from ctypes import wintypes
    _adv = ctypes.windll.advapi32
    _k32 = ctypes.windll.kernel32
    _k32.GetCurrentProcess.restype = ctypes.c_void_p
    _k32.CreateFileW.restype = ctypes.c_void_p
    _k32.CloseHandle.argtypes = [ctypes.c_void_p]
    _k32.LocalFree.argtypes = [ctypes.c_void_p]
    _k32.ResumeThread.argtypes = [ctypes.c_void_p]
    _k32.WaitForSingleObject.argtypes = [ctypes.c_void_p, wintypes.DWORD]
    _k32.TerminateProcess.argtypes = [ctypes.c_void_p, wintypes.UINT]
    _k32.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD)]
    _adv.OpenProcessToken.argtypes = [ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(ctypes.c_void_p)]
    _adv.GetLengthSid.argtypes = [ctypes.c_void_p]
    _adv.GetLengthSid.restype = wintypes.DWORD
    _adv.SetTokenInformation.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]


def _apply_win32_sddl_label(path_obj: Path, sddl: str) -> bool:
    if os.name != 'nt' or not path_obj.exists():
        return False
    if path_obj.is_file():
        sddl = sddl.replace('OICI;', ';')
    try:
        pSD = ctypes.c_void_p()
        if not _adv.ConvertStringSecurityDescriptorToSecurityDescriptorW(ctypes.c_wchar_p(sddl), 1, ctypes.byref(pSD), None):
            return False
        pSacl = ctypes.c_void_p()
        bPresent = wintypes.BOOL()
        bDefaulted = wintypes.BOOL()
        _adv.GetSecurityDescriptorSacl(pSD, ctypes.byref(bPresent), ctypes.byref(pSacl), ctypes.byref(bDefaulted))
        err = _adv.SetNamedSecurityInfoW(
            ctypes.c_wchar_p(str(path_obj)), 1, 0x00000010, None, None, None, pSacl
        )
        _k32.LocalFree(pSD)
        return err == 0
    except Exception:
        return False


_PROTECTED_ONCE = False
def _protect_server_secret_paths():
    """Đặt nhãn Mandatory Integrity S:(ML;OICI;NRNWNX;;;ME) (NO_READ_UP | NO_WRITE_UP) lên exams.json và tests/."""
    global _PROTECTED_ONCE
    with _MIC_LOCK:
        _apply_win32_sddl_label(DATA_FILE, "S:(ML;OICI;NRNWNX;;;ME)")
        if not _PROTECTED_ONCE:
            _apply_win32_sddl_label(TESTS_DIR, "S:(ML;OICI;NRNWNX;;;ME)")
            _PROTECTED_ONCE = True


def _run_in_low_integrity_sandbox(
    run_cmd: list[str],
    workdir: Path,
    inp_data: str,
    timeout_sec: float = 3.0,
    mem_limit_bytes: int = 256 * 1024 * 1024,
    max_procs: int = 1,
) -> tuple[int, str, str, bool]:
    """
    Thực thi tiến trình bài nộp dưới Windows Restricted Token + Low Integrity Level (S-1-16-4096)
    kết hợp Windows Job Object (giới hạn RAM 256MB và số tiến trình con).
    """
    if os.name != 'nt':
        safe_env = _build_safe_child_env(workdir)
        proc = subprocess.Popen(
            run_cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding='utf-8', errors='replace', cwd=str(workdir), env=safe_env
        )
        try:
            out, err = proc.communicate(input=inp_data, timeout=timeout_sec)
            return proc.returncode, out, err, False
        except subprocess.TimeoutExpired:
            proc.kill()
            return -1, '', 'TLE', True

    class SID_AND_ATTRIBUTES(ctypes.Structure):
        _fields_ = [("Sid", ctypes.c_void_p), ("Attributes", wintypes.DWORD)]

    class SECURITY_ATTRIBUTES(ctypes.Structure):
        _fields_ = [("nLength", wintypes.DWORD), ("lpSecurityDescriptor", ctypes.c_void_p), ("bInheritHandle", wintypes.BOOL)]

    class STARTUPINFOW(ctypes.Structure):
        _fields_ = [
            ("cb", wintypes.DWORD), ("lpReserved", wintypes.LPWSTR), ("lpDesktop", wintypes.LPWSTR),
            ("lpTitle", wintypes.LPWSTR), ("dwX", wintypes.DWORD), ("dwY", wintypes.DWORD),
            ("dwXSize", wintypes.DWORD), ("dwYSize", wintypes.DWORD), ("dwXCountChars", wintypes.DWORD),
            ("dwYCountChars", wintypes.DWORD), ("dwFillAttribute", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
            ("wShowWindow", wintypes.WORD), ("cbReserved2", wintypes.WORD), ("lpReserved2", ctypes.c_void_p),
            ("hStdInput", ctypes.c_void_p), ("hStdOutput", ctypes.c_void_p), ("hStdError", ctypes.c_void_p),
        ]

    class PROCESS_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("hProcess", ctypes.c_void_p), ("hThread", ctypes.c_void_p),
            ("dwProcessId", wintypes.DWORD), ("dwThreadId", wintypes.DWORD),
        ]

    in_path = workdir / "_stdin.tmp"
    out_path = workdir / "_stdout.tmp"
    err_path = workdir / "_stderr.tmp"
    in_path.write_text(inp_data, encoding="utf-8")
    out_path.write_text("", encoding="utf-8")
    err_path.write_text("", encoding="utf-8")

    pi = PROCESS_INFORMATION()
    job_handle = None
    with _SPAWN_LOCK:
        hTok = ctypes.c_void_p()
        hRestricted = ctypes.c_void_p()
        pLowSid = ctypes.c_void_p()
        hIn = hOut = hErr = None
        try:
            if not _adv.OpenProcessToken(ctypes.c_void_p(_k32.GetCurrentProcess()), 0x000F01FF, ctypes.byref(hTok)):
                raise OSError("OpenProcessToken failed")
            if not _adv.CreateRestrictedToken(hTok, 0x1 | 0x2, 0, None, 0, None, 0, None, ctypes.byref(hRestricted)):
                raise OSError("CreateRestrictedToken failed")
            _adv.ConvertStringSidToSidW(ctypes.c_wchar_p("S-1-16-4096"), ctypes.byref(pLowSid))
            tml = SID_AND_ATTRIBUTES(pLowSid, 0x00000020)
            _adv.SetTokenInformation(hRestricted, 25, ctypes.byref(tml), ctypes.sizeof(tml) + _adv.GetLengthSid(pLowSid))

            sa = SECURITY_ATTRIBUTES(ctypes.sizeof(SECURITY_ATTRIBUTES), None, True)
            hIn = _k32.CreateFileW(ctypes.c_wchar_p(str(in_path)), 0x80000000, 1, ctypes.byref(sa), 3, 0x80, None)
            hOut = _k32.CreateFileW(ctypes.c_wchar_p(str(out_path)), 0x40000000, 3, ctypes.byref(sa), 2, 0x80, None)
            hErr = _k32.CreateFileW(ctypes.c_wchar_p(str(err_path)), 0x40000000, 3, ctypes.byref(sa), 2, 0x80, None)

            si = STARTUPINFOW()
            si.cb = ctypes.sizeof(STARTUPINFOW)
            si.dwFlags = 0x00000100
            si.hStdInput = hIn
            si.hStdOutput = hOut
            si.hStdError = hErr

            cmd_line = subprocess.list2cmdline(run_cmd)
            cmd_buf = ctypes.create_unicode_buffer(cmd_line)

            safe_env = _build_safe_child_env(workdir)
            env_block = "".join(f"{k}={v}\x00" for k, v in sorted(safe_env.items(), key=lambda x: x[0].upper())) + "\x00"
            env_buf = ctypes.create_unicode_buffer(env_block)

            flags = 0x08000000 | 0x00000400 | 0x00000004
            ok = _adv.CreateProcessAsUserW(
                hRestricted, None, cmd_buf, None, None, True, flags,
                ctypes.cast(env_buf, ctypes.c_void_p), ctypes.c_wchar_p(str(workdir)), ctypes.byref(si), ctypes.byref(pi)
            )
            if not ok:
                raise OSError(f"CreateProcessAsUserW failed: {ctypes.GetLastError()}")
            job_handle = _assign_win32_job_limits(pi.hProcess, mem_limit_bytes=mem_limit_bytes, max_procs=max_procs)
            _k32.ResumeThread(ctypes.c_void_p(pi.hThread))
        finally:
            for h in (hIn, hOut, hErr, hRestricted, hTok):
                if h:
                    _close_win32_handle(h)
            if pLowSid:
                _k32.LocalFree(pLowSid)

    try:
        wait_ms = int(timeout_sec * 1000)
        wait_res = _k32.WaitForSingleObject(ctypes.c_void_p(pi.hProcess), wait_ms)
        if wait_res == 0x00000102:
            _k32.TerminateProcess(ctypes.c_void_p(pi.hProcess), 1)
            return -1, "", "TLE", True
        exit_code = wintypes.DWORD(0)
        _k32.GetExitCodeProcess(ctypes.c_void_p(pi.hProcess), ctypes.byref(exit_code))
        rc = int(exit_code.value)
    finally:
        _close_win32_handle(pi.hProcess)
        _close_win32_handle(pi.hThread)
        _close_win32_handle(job_handle)

    stdout_str = out_path.read_text(encoding="utf-8", errors="replace") if out_path.exists() else ""
    stderr_str = err_path.read_text(encoding="utf-8", errors="replace") if err_path.exists() else ""
    return rc, stdout_str, stderr_str, False


def judge_submission(exam_code: str, language: str, code_text: str):
    """Chấm bài trên server dưới Windows Restricted Token + Low Integrity Level (S-1-16-4096) + Job Object."""
    _protect_server_secret_paths()
    safe_code = exam_code if SAFE_CODE_RE.match(exam_code or '') else 'default'
    tdir = TESTS_DIR / safe_code
    if not tdir.exists() and safe_code.lower() in ('default', 'demo'):
        tdir = TESTS_DIR / 'default'
    inputs = sorted(tdir.glob('*.in')) if tdir.exists() else []
    if not inputs:
        return {'verdict': 'NO_TESTS', 'tests': [], 'message': 'Phòng thi chưa có testcase trên server.'}

    workdir = TMP_DIR / f'{int(time.time() * 1000)}_{os.getpid()}_{threading.get_ident()}_{random_code()}'
    workdir.mkdir(parents=True, exist_ok=True)
    _apply_win32_sddl_label(workdir, 'S:(ML;OICI;NW;;;LW)')
    safe_env = _build_safe_child_env(workdir)
    results = []
    try:
        if language == 'cpp':
            sec_err = _scan_cpp_security(code_text)
            if sec_err:
                return {'verdict': 'CE', 'compile_error': sec_err, 'tests': []}
            src = workdir / 'main.cpp'
            exe = workdir / ('main.exe' if os.name == 'nt' else 'main')
            src.write_text(code_text, encoding='utf-8')
            rc_c, out_c, err_c, to_c = _compile_cpp_in_job(src, exe, workdir, safe_env, timeout_sec=12.0, mem_limit_bytes=256 * 1024 * 1024)
            if to_c:
                return {'verdict': 'CE', 'compile_error': err_c, 'tests': []}
            if rc_c != 0 or not exe.exists():
                return {'verdict': 'CE', 'compile_error': (err_c or out_c or 'Compiler killed by Job Object memory limit (256 MB).')[:1000], 'tests': []}
            run_cmd = [str(exe)]
            max_child_procs = 1
        elif language == 'python':
            src = workdir / 'main.py'
            src.write_text(code_text, encoding='utf-8')
            try:
                compile(code_text, 'main.py', 'exec')
            except SyntaxError as se:
                return {'verdict': 'CE', 'compile_error': f'SyntaxError line {se.lineno}: {se.msg}', 'tests': []}
            guarded_code = (
                "import sys\n"
                "def _drgx_audit(e, a):\n"
                "    if e.startswith(('socket.','subprocess.','os.system','os.popen','os.spawn','os.exec','ctypes.','winreg.','urllib.','http.','ftplib.','smtplib.','multiprocessing.')):\n"
                "        raise PermissionError('Blocked: ' + e)\n"
                "sys.addaudithook(_drgx_audit)\n"
                + code_text
            )
            run_cmd = [sys.executable, '-I', '-c', guarded_code]
            max_child_procs = 2
        else:
            return {'verdict': 'BAD_LANG', 'tests': []}

        overall = 'AC'
        for test in inputs:
            out_file = find_expected_file(test)
            expected = out_file.read_text(encoding='utf-8').strip() if out_file else ''
            inp_data = test.read_text(encoding='utf-8')
            t0 = time.perf_counter()
            rc, stdout_str, stderr_str, timed_out = _run_in_low_integrity_sandbox(
                run_cmd, workdir, inp_data, timeout_sec=3.0,
                mem_limit_bytes=256 * 1024 * 1024, max_procs=max_child_procs
            )
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            if timed_out:
                overall = 'FAIL'
                results.append({'name': test.stem, 'verdict': 'TLE', 'ms': 3000})
                continue
            if rc != 0:
                verdict = 'RE'
                overall = 'FAIL'
            else:
                got = (stdout_str or '').strip()
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
                'got': (stdout_str or '').strip()[:240],
                'stderr': (stderr_str or '').strip()[:240]
            })
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
            **attach_audit_chain_record(exam, {
                'student': st_name,
                'language': lang,
                'verdict': 'FAIL' if verdict != 'AC' else 'AC',
                'tests': tests,
                'code': code_txt,
                'timestamp': now - (count - idx),
            }),
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
    <button class="btn primary" style="background:linear-gradient(135deg,#059669,#0284c7)" onclick="verifyAuditChain()">🔐 Kiểm định Chuỗi Băm Chống Gian Lận (SHA-256 Audit Chain)</button>
  </div>

  <div class="kpis">
    <div class="kpi"><b id="kpiRoom">—</b><span>Mã Phòng Thi LAN (6 ký tự)</span></div>
    <div class="kpi"><b id="kpiStudents">0</b><span>Học sinh trong phòng</span></div>
    <div class="kpi"><b id="kpiAc">0 / 0</b><span>Bài nộp đạt AC (100% test)</span></div>
    <div class="kpi"><b id="kpiPlag" style="color:var(--good)">0 cặp</b><span>Gợi ý giáo viên đối chiếu (≥ 65%, ≥ 15 vân tay)</span></div>
  </div>

  <div class="card" id="auditChainBanner" style="margin-bottom:20px;border-color:#059669;background:linear-gradient(135deg,rgba(5,150,105,0.12),rgba(14,22,40,0.95))">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-weight:800;font-size:14px;color:var(--good)" id="auditStatusTitle">🔐 SHA-256 Tamper-Evident Audit Chain &amp; Merkle Log (MIT 6.824 / 6.858)</div>
        <div style="font-size:12px;color:var(--muted);font-family:Consolas,monospace;margin-top:4px">
          Head Hash: <b id="auditHeadHash" style="color:var(--accent)">0000000000000000...</b> &nbsp;|&nbsp;
          Merkle Root: <b id="auditMerkleRoot" style="color:#c4b5fd">0000000000000000...</b> &nbsp;|&nbsp;
          Bản ghi đã niêm phong: <b id="auditCheckedCount" style="color:#fff">0</b>
        </div>
      </div>
      <span class="badge" id="auditBadge">✓ CHAIN VERIFIED</span>
    </div>
    <details style="margin-top:8px;font-size:10.5px;color:var(--muted);font-family:Consolas,monospace">
      <summary style="cursor:pointer;color:var(--accent)">Xem đầy đủ head_hash &amp; merkle_root (64 hex)</summary>
      <div style="margin-top:6px;word-break:break-all">head_hash: <code id="auditHeadFull">0000000000000000000000000000000000000000000000000000000000000000</code></div>
      <div style="margin-top:2px;word-break:break-all">merkle_root: <code id="auditMerkleFull">0000000000000000000000000000000000000000000000000000000000000000</code></div>
    </details>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>
        <span>📊 Bảng Xếp Hạng & Nhật Ký Nộp Bài Trực Tiếp</span>
        <span style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span id="roomTitleLabel" style="font-size:12.5px;color:var(--muted);margin-right:6px"></span>
          <button class="btn primary" id="btnModeRaw" style="padding:4px 10px;font-size:11.5px" onclick="setRankMode('raw')">📜 Nhật ký Nộp bài</button>
          <button class="btn" id="btnModeIoi" style="padding:4px 10px;font-size:11.5px" onclick="setRankMode('ioi')">🏆 Bảng điểm IOI / HSG</button>
          <button class="btn" id="btnModeIcpc" style="padding:4px 10px;font-size:11.5px" onclick="setRankMode('icpc')">🎈 Bảng điểm ICPC (Penalty 20p)</button>
        </span>
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
        <div id="plagMatrix" style="margin-bottom:12px"></div>
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
  window._currentExam = exam;
  if (exam.audit_chain) renderAuditBanner(exam.audit_chain);
  if (window._rankMode && window._rankMode !== 'raw') renderRankTable(window._rankMode);
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
    `Đã quét <b>${res.students_scanned} học sinh</b> (${res.total_pairs_compared} cặp đối chiếu, đã lọc bỏ khung nhập xuất mẫu & bài ngắn < 15 vân tay). Có <b style="color:${flagged > 0 ? 'var(--bad)' : 'var(--good)'}">${flagged} cặp gợi ý giáo viên đối chiếu thủ công (≥ 65%, không tự động kết luận gian lận)</b>:`;

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
  renderPlagMatrix(res);
  if (lastPlagPairs.length > 0) showPlagPair(0);
}

function showPlagPair(i) {
  const p = lastPlagPairs[i];
  if (!p) return;
  document.getElementById('diffCard').style.display = 'block';
  document.getElementById('diffTitle').textContent = `⚖️ GỢI Ý GIÁO VIÊN ĐỐI CHIẾU: ${p.student_a} ↔ ${p.student_b} (Độ tương đồng cấu trúc: ${p.similarity}%)`;
  document.getElementById('diffLabelA').textContent = `${p.student_a} (Token: ${p.norm_a.slice(0, 45)}...)`;
  document.getElementById('diffCodeA').textContent = p.code_a;
  document.getElementById('diffLabelB').textContent = `${p.student_b} (Token: ${p.norm_b.slice(0, 45)}...)`;
  document.getElementById('diffCodeB').textContent = p.code_b;
}

window._rankMode = 'raw';

function renderAuditBanner(chain) {
  if (!chain) return;
  const titleEl = document.getElementById('auditStatusTitle');
  const headEl = document.getElementById('auditHeadHash');
  const merkleEl = document.getElementById('auditMerkleRoot');
  const cntEl = document.getElementById('auditCheckedCount');
  const badgeEl = document.getElementById('auditBadge');
  const banner = document.getElementById('auditChainBanner');
  if (headEl) { headEl.textContent = (chain.head_hash || '0'.repeat(64)).slice(0, 20) + '...'; headEl.title = chain.head_hash || ''; }
  if (merkleEl) { merkleEl.textContent = (chain.merkle_root || '0'.repeat(64)).slice(0, 20) + '...'; merkleEl.title = chain.merkle_root || ''; }
  const headFull = document.getElementById('auditHeadFull');
  const merkleFull = document.getElementById('auditMerkleFull');
  if (headFull) headFull.textContent = chain.head_hash || '0'.repeat(64);
  if (merkleFull) merkleFull.textContent = chain.merkle_root || '0'.repeat(64);
  if (cntEl) cntEl.textContent = `${chain.checked_records || 0} / ${chain.total_records != null ? chain.total_records : (chain.checked_records || 0)}`;
  if (chain.valid) {
    if (titleEl) { titleEl.textContent = '🔐 SHA-256 Tamper-Evident Audit Chain & Merkle Log — Toàn vẹn 100%'; titleEl.style.color = 'var(--good)'; }
    if (badgeEl) { badgeEl.textContent = '✓ CHAIN VERIFIED'; badgeEl.style.borderColor = 'var(--good)'; badgeEl.style.color = 'var(--good)'; }
    if (banner) banner.style.borderColor = '#059669';
  } else {
    if (titleEl) { titleEl.textContent = `🚨 CẢNH BÁO CAN THIỆP DỮ LIỆU TRÁI PHÉP TẠI BẢN GHI #${chain.tampered_index} (${chain.tampered_sub_id || ''}) — ${chain.reason || 'TAMPERED'}`; titleEl.style.color = 'var(--bad)'; }
    if (badgeEl) { badgeEl.textContent = '✗ TAMPER DETECTED'; badgeEl.style.borderColor = 'var(--bad)'; badgeEl.style.color = 'var(--bad)'; }
    if (banner) banner.style.borderColor = 'var(--bad)';
  }
}

async function verifyAuditChain() {
  if (!currentCode) return;
  const chain = await api(`/exam/${currentCode}/verify-chain`);
  renderAuditBanner(chain);
}

function setRankMode(mode) {
  window._rankMode = mode || 'raw';
  ['Raw', 'Ioi', 'Icpc'].forEach(k => {
    const btn = document.getElementById('btnMode' + k);
    if (btn) btn.className = (k.toLowerCase() === window._rankMode) ? 'btn primary' : 'btn';
  });
  if (window._rankMode === 'raw') {
    if (currentCode) selectRoom(currentCode);
  } else {
    renderRankTable(window._rankMode);
  }
}

function renderRankTable(mode) {
  const exam = window._currentExam || {};
  const lbs = exam.leaderboards || { ioi: [], icpc: [] };
  const tbody = document.getElementById('subTableBody');
  const theadRow = tbody && tbody.parentElement ? tbody.parentElement.querySelector('thead tr') : null;
  if (mode === 'ioi') {
    if (theadRow) {
      theadRow.innerHTML = '<th>Hạng</th><th>Học sinh</th><th>Chế độ</th><th>Điểm IOI / HSG</th><th>Tổng thời gian</th><th class="no-print">Số lần nộp</th>';
    }
    const rows = lbs.ioi || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">Chưa có dữ liệu xếp hạng IOI.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const cls = r.total_score >= 100 ? 'ac' : 'fail';
      return `<tr>
        <td><b>#${r.rank}</b></td>
        <td><b>${r.student}</b></td>
        <td>IOI Subtask</td>
        <td><span class="tag ${cls}">${r.total_score.toFixed(1)} / 100.0</span></td>
        <td>${r.exec_ms} ms (+${r.elapsed_sec}s)</td>
        <td class="no-print">${r.attempts} lần</td>
      </tr>`;
    }).join('');
  } else if (mode === 'icpc') {
    if (theadRow) {
      theadRow.innerHTML = '<th>Hạng</th><th>Học sinh</th><th>Chế độ</th><th>Số bài AC</th><th>Penalty (T_AC + 20×Sai)</th><th class="no-print">Lần nộp sai</th>';
    }
    const rows = lbs.icpc || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">Chưa có dữ liệu xếp hạng ICPC.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const cls = r.solved > 0 ? 'ac' : 'fail';
      return `<tr>
        <td><b>#${r.rank}</b></td>
        <td><b>${r.student}</b></td>
        <td>ICPC Penalty</td>
        <td><span class="tag ${cls}">${r.solved} bài AC</span></td>
        <td><b>${r.penalty_minutes} phút</b> (${r.exec_ms} ms)</td>
        <td class="no-print">${r.wrong_attempts} lỗi / ${r.total_attempts} nộp</td>
      </tr>`;
    }).join('');
  }
}

function renderPlagMatrix(res) {
  const box = document.getElementById('plagMatrix');
  if (!box) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const maxBySt = res.max_sim_by_student || {};
  const students = Array.isArray(res.matrix_students) ? res.matrix_students : [];
  const matrix = Array.isArray(res.matrix) ? res.matrix : null;

  if (matrix && students.length) {
    const order = students.slice()
      .sort((a, b) => ((maxBySt[b] || 0) - (maxBySt[a] || 0)))
      .slice(0, 12);
    const idx = {};
    students.forEach((s, i) => { idx[s] = i; });
    const cellColor = (v) => v >= 65
      ? 'rgba(220,38,38,0.82)'
      : (v >= 50 ? 'rgba(217,119,6,0.78)' : (v > 0 ? 'rgba(22,163,74,0.26)' : 'transparent'));
    let html = '<div style="font-size:11.5px;color:var(--muted);margin-bottom:6px">🧬 Ma trận tương đồng Winnowing N×N — Top ' +
      Math.min(12, students.length) + '/' + students.length +
      ' học sinh có tương đồng cao nhất (đỏ ≥ 65%, cam ≥ 50%, xanh &lt; 50%):</div>' +
      '<div style="overflow:auto;border:1px solid var(--border);border-radius:10px"><table style="border-collapse:collapse;font-size:10.5px;width:100%">' +
      '<thead><tr><th style="padding:5px;border:1px solid var(--border);background:var(--bg);position:sticky;left:0">#</th>' +
      order.map((s, i) => '<th title="' + esc(s) + '" style="padding:5px;border:1px solid var(--border);background:var(--bg);max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (i + 1) + '</th>').join('') +
      '</tr></thead><tbody>';
    order.forEach((sa, ri) => {
      html += '<tr><th title="' + esc(sa) + '" style="padding:4px 6px;border:1px solid var(--border);background:var(--bg);text-align:left;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (ri + 1) + '. ' + esc(sa) + '</th>';
      order.forEach((sb, ci) => {
        if (ri === ci) {
          html += '<td style="padding:4px;border:1px solid var(--border);text-align:center;color:var(--muted)">—</td>';
        } else {
          const v = Number(matrix[idx[sa]] && matrix[idx[sa]][idx[sb]]) || 0;
          const fg = v >= 50 ? '#fff' : 'var(--text)';
          html += '<td title="' + esc(sa) + ' ↔ ' + esc(sb) + ': ' + v.toFixed(1) + '%" style="padding:4px 5px;border:1px solid var(--border);text-align:center;background:' + cellColor(v) + ';color:' + fg + ';font-weight:' + (v >= 50 ? '800' : '500') + '">' + (v > 0 ? Math.round(v) : '·') + '</td>';
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;
    return;
  }

  const entries = Object.entries(maxBySt).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (!entries.length) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<div style="font-size:11.5px;color:var(--muted);margin-bottom:6px">📊 Phổ tương đồng cấu trúc Winnowing cao nhất (Top 12 máy trạm):</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px">' +
    entries.map(([st, sim]) => {
      const col = sim >= 65 ? 'var(--bad)' : (sim >= 50 ? 'var(--warn)' : 'var(--good)');
      return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 8px;font-size:11px">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700" title="${esc(st)}">${esc(st)}</div>
        <div style="height:5px;background:#1e293b;border-radius:99px;margin:4px 0;overflow:hidden">
          <div style="height:100%;width:${Math.min(100, sim)}%;background:${col}"></div>
        </div>
        <div style="color:${col};font-weight:800">${sim}%</div>
      </div>`;
    }).join('') + '</div>';
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
                'features': ['dashboard', 'winnowing-anti-cheat', 'winnowing-matrix', 'csv-export', 'burst-40', 'sha256-audit-chain', 'hmac-receipts', 'ioi-icpc-leaderboards']
            })
        if self.path == '/exams':
            if not self._is_admin_authorized():
                return self._send(403, {'error': 'Cần quyền Admin (localhost hoặc X-DrgX-Admin-Token)'})
            with DATA_LOCK:
                data = load_data()
            return self._send(200, data)
        if self.path.startswith('/exam/') and self.path.endswith('/export.csv'):
            if not self._is_admin_authorized():
                return self._send(403, {'error': 'Cần quyền Admin (localhost hoặc X-DrgX-Admin-Token)'})
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
            writer.writerow(['STT', 'Mã phòng', 'Họ và tên học sinh', 'Ngôn ngữ', 'Kết quả (Verdict)', 'Số test đạt', 'Tổng thời gian (ms)', 'Độ tương đồng Winnowing cao nhất (%)', 'Cờ gợi ý rà soát kỹ thuật', 'Thời điểm nộp'])
            for idx, sub in enumerate(exam.get('submissions', []), 1):
                st = sub.get('student', 'anonymous')
                tests = sub.get('tests', [])
                ac_cnt = sum(1 for t in tests if t.get('verdict') == 'AC')
                tot_ms = sum(t.get('ms', 0) for t in tests)
                sim = max_sim.get(st, 0.0)
                flag_txt = 'CẦN GIÁO VIÊN ĐỐI CHIẾU' if sim >= 65.0 else 'Bình thường'
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
        if self.path.startswith('/exam/') and self.path.endswith('/verify-chain'):
            code = self.path.split('/exam/', 1)[1].rsplit('/verify-chain', 1)[0].strip().upper()
            with DATA_LOCK:
                data = load_data()
                exam = data['exams'].get(code)
                if not exam:
                    return self._send(404, {'error': 'Không tìm thấy phòng thi'})
                chain_res = verify_exam_audit_chain(exam)
            return self._send(200, chain_res)
        if self.path.startswith('/exam/'):
            if not self._is_admin_authorized():
                return self._send(403, {'error': 'Cần quyền Admin (localhost hoặc X-DrgX-Admin-Token)'})
            code = self.path.split('/exam/', 1)[1].strip().upper()
            with DATA_LOCK:
                data = load_data()
                exam = data['exams'].get(code)
            if not exam:
                return self._send(404, {'error': 'Không tìm thấy phòng thi'})
            enriched = dict(exam)
            enriched['leaderboards'] = compute_dual_leaderboards(exam)
            enriched['audit_chain'] = verify_exam_audit_chain(exam)
            enriched['head_hash'] = enriched['audit_chain'].get('head_hash', GENESIS_PREV_HASH)
            enriched['merkle_root'] = enriched['audit_chain'].get('merkle_root', GENESIS_PREV_HASH)
            return self._send(200, enriched)
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
            client_ip = self.client_address[0] if self.client_address else ''
            req_token = str(payload.get('studentToken', '')).strip()
            with DATA_LOCK:
                data = load_data()
                exam = data['exams'].get(code)
                if not exam:
                    return self._send(404, {'error': 'Mã phòng không tồn tại'})
                tokens = exam.setdefault('studentTokens', {})
                ips = exam.setdefault('studentIps', {})
                if name in tokens:
                    # Nếu học sinh đã đăng ký từ một máy khác và không gửi đúng studentToken thì từ chối giả mạo
                    if req_token and req_token != tokens[name]:
                        return self._send(403, {'error': 'Sai mã phiên học sinh (studentToken)'})
                    if not req_token and ips.get(name) and ips.get(name) != client_ip and client_ip not in ('127.0.0.1', '::1'):
                        return self._send(403, {'error': 'Tên học sinh này đã được đăng ký từ một máy trạm khác trong phòng thi'})
                    st_token = tokens[name]
                else:
                    st_token = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
                    tokens[name] = st_token
                    ips[name] = client_ip
                if name not in exam['participants']:
                    exam['participants'].append(name)
                save_data(data)
                safe_exam = {
                    'code': exam['code'],
                    'title': exam.get('title', ''),
                    'createdAt': exam.get('createdAt', 0),
                    'participants': list(exam.get('participants', [])),
                }
            return self._send(200, {'status': 'joined', 'studentToken': st_token, 'exam': safe_exam})

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
            if not self._is_admin_authorized():
                return self._send(403, {'error': 'Cần quyền Admin (localhost hoặc X-DrgX-Admin-Token)'})
            code = str(payload.get('code', '')).strip().upper()
            with DATA_LOCK:
                data = load_data()
                exam = data['exams'].get(code)
            if not exam:
                return self._send(404, {'error': 'Mã phòng không tồn tại'})
            report = scan_exam_plagiarism(exam)
            return self._send(200, report)

        if self.path == '/exam/verify-receipt':
            with DATA_LOCK:
                data = load_data()
                res_verify = verify_submission_receipt(payload, data)
            return self._send(200, res_verify)

        if self.path == '/submit':
            code = str(payload.get('examCode', '')).strip().upper()
            lang = str(payload.get('language', 'cpp')).strip().lower()
            src = str(payload.get('code', ''))
            student = str(payload.get('student', 'anonymous')).strip()[:64] or 'anonymous'
            req_token = str(payload.get('studentToken', '')).strip()
            client_ip = self.client_address[0] if self.client_address else ''
            with DATA_LOCK:
                data = load_data()
                exam = data['exams'].get(code)
                if not exam:
                    return self._send(404, {'error': 'Mã phòng không tồn tại'})
                tokens = exam.get('studentTokens', {})
                ips = exam.get('studentIps', {})
                if student != 'anonymous' and student in tokens:
                    if req_token and not __import__('hmac').compare_digest(str(req_token), str(tokens[student])):
                        return self._send(403, {'error': 'Mã phiên học sinh (studentToken) không hợp lệ'})
                    if not req_token and ips.get(student) and ips.get(student) != client_ip and client_ip not in ('127.0.0.1', '::1'):
                        return self._send(403, {'error': 'Không được nộp bài mạo danh học sinh ở máy trạm khác'})
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
                attach_audit_chain_record(exam, record)
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
    srv = ExamServer((host, port), Handler)
    cert_file = os.environ.get('DRGX_TLS_CERT', '').strip()
    key_file = os.environ.get('DRGX_TLS_KEY', '').strip()
    scheme = 'http'
    if cert_file and key_file and Path(cert_file).exists() and Path(key_file).exists():
        import ssl
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(certfile=cert_file, keyfile=key_file)
        srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
        scheme = 'https'
    print(f'[DrgX CP Exam Server] {scheme}://{host}:{port} (Dashboard: {scheme}://{host}:{port}/dashboard | Queue={ExamServer.request_queue_size})')
    srv.serve_forever()


if __name__ == '__main__':
    main()

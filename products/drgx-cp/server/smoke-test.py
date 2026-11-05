#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Smoke test server-authoritative judging của DrgX CP exam-server."""
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get('DRGX_CP_SERVER_URL', 'http://127.0.0.1:8765')
TESTS_ROOT = str(Path(__file__).resolve().parent / 'tests')


def req(path, payload=None, method='GET'):
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read().decode('utf-8'))


def fail(name, detail=''):
    print('[FAIL] ' + name + ('  -> ' + str(detail)[:300] if detail else ''))
    sys.exit(1)


def ok(name):
    print('[OK] ' + name)


# 0. health
h = req('/')
if h.get('status') != 'ready':
    fail('health', h)
ok('GET / -> ready (' + h.get('version', '?') + ')')

# 1. create exam (agent call, not UI)
exam = req('/exam/create', {'title': 'SmokeTest'}, 'POST')
code = exam.get('code')
if not code:
    fail('create exam', exam)
ok('POST /exam/create -> code ' + code)

# 2. join exam
j = req('/exam/join', {'code': code, 'name': 'tester'}, 'POST')
if j.get('status') != 'joined':
    fail('join exam', j)
ok('POST /exam/join -> joined')

# 3. no tests choked handled expectedly
nt = req('/submit', {'examCode': code, 'language': 'cpp', 'code': 'int main(){}'}, 'POST')
if nt.get('verdict') != 'NO_TESTS':
    fail('submit without tests should be NO_TESTS', nt)
ok('submit chua co tests -> NO_TESTS (tu choi dung}')

# 4. seed tests for this exam code: sum of two numbers
tdir = TESTS_ROOT + '\\' + code
import os
os.makedirs(tdir, exist_ok=True)
with open(tdir + '\\1.in', 'w', encoding='utf-8') as f:
    f.write('1 2\n')
with open(tdir + '\\1.out', 'w', encoding='utf-8') as f:
    f.write('3\n')
with open(tdir + '\\2.in', 'w', encoding='utf-8') as f:
    f.write('10 20\n')
with open(tdir + '\\2.out', 'w', encoding='utf-8') as f:
    f.write('30\n')
ok('seed tests cho ' + code)

# 5. submit CORRECT cpp -> AC
good = ('#include <bits/stdc++.h>\n'
        'using namespace std;\n'
        'int main(){ long long a,b; cin>>a>>b; cout<< a+b << "\\n"; }\n')
r = req('/submit', {'examCode': code, 'language': 'cpp', 'code': good}, 'POST')
if r.get('verdict') != 'AC':
    fail('AC expected cho bai dung', r)
ok('submit bai DUNG -> AC (' + str(len(r.get('tests', []))) + ' tests)')

# 6. submit WRONG cpp -> WA
bad = ('#include <bits/stdc++.h>\n'
       'using namespace std;\n'
       'int main(){ long long a,b; cin>>a>>b; cout<< a-b << "\\n"; }\n')
r = req('/submit', {'examCode': code, 'language': 'cpp', 'code': bad}, 'POST')
if r.get('verdict') != 'FAIL':
    fail('FAIL expected cho bai sai', r)
wa = [t for t in r.get('tests', []) if t.get('verdict') == 'WA']
if not wa:
    fail('thieu WA trong bai sai', r)
ok('submit bai SAI -> FAIL co WA')

# 7. submit compile-error cpp -> CE
r = req('/submit', {'examCode': code, 'language': 'cpp', 'code': 'int main( {'}, 'POST')
if r.get('verdict') != 'CE':
    fail('CE expected cho loi compile', r)
ok('submit loi bien dich -> CE')

# 8. TLE (vong lap vo han)
r = req('/submit', {'examCode': code, 'language': 'cpp',
                    'code': 'int main(){ while(1); }'}, 'POST')
tle = [t for t in r.get('tests', []) if t.get('verdict') == 'TLE']
if not tle:
    fail('TLE expected', r)
ok('submit vo han -> co TLE')

# 9. submit CORRECT python -> AC
py_good = ('import sys\n'
           'data = sys.stdin.read().split()\n'
           'if len(data) >= 2:\n'
           '    print(int(data[0]) + int(data[1]))\n')
r = req('/submit', {'examCode': code, 'language': 'python', 'code': py_good}, 'POST')
if r.get('verdict') != 'AC':
    fail('AC expected cho bai Python dung', r)
ok('submit Python DUNG -> AC (' + str(len(r.get('tests', []))) + ' tests)')

# 10. join exam khong ton tai -> 404 hanh vi client tu xu ly; kiem tra submit phong ao
try:
    req('/submit', {'examCode': 'ZZZZZZ', 'language': 'cpp', 'code': 'int main(){}'}, 'POST')
    fail('phong ao phai bao loi')
except Exception as e:
    ok('phong khong ton tai -> tu choi (' + str(e)[:60] + ')')

# 11. concurrent submissions (4 parallel students) -> ThreadingHTTPServer + DATA_LOCK
def _submit_parallel(idx):
    return req('/submit', {
        'examCode': code,
        'language': 'python',
        'code': py_good,
        'student': f'hs-song-song-{idx}'
    }, 'POST')

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    parallel_res = list(pool.map(_submit_parallel, range(4)))
if not all(item.get('verdict') == 'AC' for item in parallel_res):
    fail('concurrent submissions should all return AC', parallel_res)
exam_state = req('/exam/' + code)
sub_students = [s.get('student') for s in exam_state.get('submissions', [])]
for idx in range(4):
    if f'hs-song-song-{idx}' not in sub_students:
        fail('missing concurrent submission in exams.json', sub_students)
ok('4 concurrent submissions -> all AC & persisted atomically')

# 12. child process env isolation: student Python code cannot read DRGX_ADMIN_TOKEN
py_env_probe = (
    'import os, sys\n'
    'tok = os.environ.get("DRGX_ADMIN_TOKEN", "")\n'
    'if tok:\n'
    '    print("LEAKED:" + tok)\n'
    'else:\n'
    '    data = sys.stdin.read().split()\n'
    '    if len(data) >= 2:\n'
    '        print(int(data[0]) + int(data[1]))\n'
)
r_env = req('/submit', {'examCode': code, 'language': 'python', 'code': py_env_probe, 'student': 'hs-env-check'}, 'POST')
if r_env.get('verdict') != 'AC':
    fail('child process env isolation failed (DRGX_ADMIN_TOKEN leaked or execution error)', r_env)
ok('child process env isolation -> DRGX_ADMIN_TOKEN stripped from student submission')

# 13. /exam/join returns studentToken and hides submissions from student response
j_sec = req('/exam/join', {'code': code, 'name': 'hs-bao-mat'}, 'POST')
st_tok = j_sec.get('studentToken', '')
if not st_tok or 'submissions' in j_sec.get('exam', {}):
    fail('/exam/join must return studentToken and hide submissions', j_sec)
ok('POST /exam/join -> returns studentToken & hides submissions list')

# 14. /submit with forged studentToken for registered student -> HTTP 403
try:
    req('/submit', {
        'examCode': code,
        'language': 'python',
        'code': py_good,
        'student': 'hs-bao-mat',
        'studentToken': 'FORGED_WRONG_TOKEN'
    }, 'POST')
    fail('forged studentToken must be rejected with HTTP 403')
except urllib.error.HTTPError as he:
    if he.code != 403:
        fail('expected HTTP 403 for forged studentToken', he.code)
    ok('forged studentToken -> rejected HTTP 403 (anti-impersonation)')

# 15. HMAC-SHA256 Signed Submission Receipt & Non-Repudiation Verification (/exam/verify-receipt)
rcpt = r_env.get('submission_receipt')
if not isinstance(rcpt, dict) or not rcpt.get('signature') or not rcpt.get('audit_hash'):
    fail('POST /submit must return cryptographic submission_receipt', r_env)
v_ok = req('/exam/verify-receipt', {'submission_receipt': rcpt}, 'POST')
if not v_ok.get('valid') or not v_ok.get('signature_valid') or not v_ok.get('in_audit_chain'):
    fail('/exam/verify-receipt failed on genuine receipt', v_ok)
tampered_rcpt = dict(rcpt)
tampered_rcpt['score'] = 999.0
v_bad = req('/exam/verify-receipt', {'submission_receipt': tampered_rcpt}, 'POST')
if v_bad.get('valid'):
    fail('/exam/verify-receipt must reject tampered receipt score', v_bad)
ok('HMAC-SHA256 submission_receipt verified & tamper attempt rejected')

# 16. SHA-256 Hash-Chain & Merkle Root Verification after 4 parallel submissions (/exam/<code>/verify-chain)
chain_info = req('/exam/' + code + '/verify-chain')
if not chain_info.get('valid') or chain_info.get('checked_records', 0) < 10:
    fail('GET /exam/<code>/verify-chain must return valid=True for all parallel & sequential submissions', chain_info)
if not chain_info.get('head_hash') or chain_info.get('head_hash') == ('0' * 64) or not chain_info.get('merkle_root'):
    fail('GET /exam/<code>/verify-chain missing head_hash or merkle_root', chain_info)
ok('GET /exam/' + code + '/verify-chain -> valid=True (' + str(chain_info.get('checked_records')) + ' records, merkle=' + chain_info.get('merkle_root', '')[:12] + '...)')

# 17. Dual Contest Leaderboards (IOI Subtask Mode + ICPC Penalty Mode)
exam_full = req('/exam/' + code)
lbs = exam_full.get('leaderboards', {})
ioi_lb = lbs.get('ioi', [])
icpc_lb = lbs.get('icpc', [])
if not ioi_lb or not icpc_lb:
    fail('GET /exam/<code> must include dual leaderboards (ioi & icpc)', lbs)
if ioi_lb[0].get('total_score') != 100.0 or icpc_lb[0].get('solved', 0) < 1:
    fail('Dual leaderboard top rank calculation invalid', lbs)
ok('Dual Leaderboards (IOI Subtask + ICPC Penalty) verified')

# 18. Audit-chain sealing idempotence: hai lần đọc verify-chain liên tiếp phải cho cùng
#     head_hash / merkle_root / checked_records (niêm phong.ALL FU                        (deterministic sealing), và object
#     GET /exam/<code> phải nhúng audit_chain.valid=True với cùng head_hash.
chain_first = req('/exam/' + code + '/verify-chain')
chain_second = req('/exam/' + code + '/verify-chain')
for field in ('head_hash', 'merkle_root', 'checked_records'):
    if chain_first.get(field) != chain_second.get(field):
        fail('verify-chain must be deterministic across consecutive reads (field=' + field + ')',
             (chain_first.get(field), chain_second.get(field)))
embedded_chain = exam_full.get('audit_chain', {})
if not embedded_chain.get('valid') or embedded_chain.get('head_hash') != chain_first.get('head_hash'):
    fail('GET /exam/<code> must embed valid audit_chain with same head_hash as verify-chain endpoint')
ok('verify-chain niêm phong nhất quán (2 lần đọc khớp head=' + str(chain_first.get('head_hash'))[:12] + '...)')

# 19. In-process tamper-evidence: import trực tiếp lõi mã hóa exam-server.py (không đụng exams.json)
#     để chứng minh hàm băm đúng công thức định nghĩa, chữ ký HMAC đúng chuẩn, và mọi can thiệp
#     (sửa điểm / sửa mã nguồn) bị phát hiện chính xác vị trí + lý do.
import importlib.util
_spec_core = importlib.util.spec_from_file_location(
    'drgx_exam_core', str(Path(__file__).resolve().parent / 'exam-server.py'))
core = importlib.util.module_from_spec(_spec_core)
_spec_core.loader.exec_module(core)

def _build_examiner_exam():
    ex = {'code': 'MIT01', 'createdAt': 1700000000, 'participants': [], 'submissions': []}
    for i in range(3):
        rec = {
            'student': f'thi-sinh-{i}',
            'language': 'cpp',
            'verdict': 'AC',
            'tests': [{'name': '1', 'verdict': 'AC', 'ms': 5 + i}],
            'code': f'int main(){{ return {i + 7}; }}',
            'timestamp': 1700000000 + i,
        }
        core.attach_audit_chain_record(ex, rec)
        ex['submissions'].append(rec)
    return ex

probes_chain = core.verify_exam_audit_chain(_build_examiner_exam())
if not probes_chain.get('valid') or probes_chain.get('checked_records') != 3:
    fail('in-process attach_audit_chain_record chain must verify valid=True (3 records)', probes_chain)

probe_rcpt = _build_examiner_exam()['submissions'][0]['submission_receipt']
canonical = (
    f"{probe_rcpt['exam_code']}|{probe_rcpt['sub_id']}|{probe_rcpt['student']}|"
    f"{int(probe_rcpt['timestamp'])}|{probe_rcpt['verdict']}|{float(probe_rcpt['score']):.2f}|"
    f"{probe_rcpt['code_sha256']}|{probe_rcpt['audit_prev_hash']}"
)
import hashlib as _hashlib, hmac as _hmac
indep_hash = _hashlib.sha256(canonical.encode('utf-8')).hexdigest()
if indep_hash != probe_rcpt['audit_hash']:
    fail('audit_hash formula must match spec SHA256(prefix|sha256(code)|prev_hash)', probe_rcpt)
indep_sig = _hmac.new(core.RECEIPT_HMAC_SECRET,
                      (canonical + '|' + probe_rcpt['audit_hash']).encode('utf-8'),
                      _hashlib.sha256).hexdigest()
if indep_sig != probe_rcpt['signature']:
    fail('HMAC signature must match spec formula HMAC-SHA256(secret, msg|audit_hash)', probe_rcpt)

probe_snap = {'exams': {'MIT01': _build_examiner_exam()}}
probe_verify = core.verify_submission_receipt({'submission_receipt': probe_rcpt}, probe_snap)
if not probe_verify.get('valid') or not probe_verify.get('signature_valid') or not probe_verify.get('in_audit_chain'):
    fail('verify_submission_receipt must accept genuine receipt & confirm in_audit_chain', probe_verify)

tamper_score_exam = _build_examiner_exam()
tamper_score_exam['submissions'][1]['score'] = 42.0
tamper_score_res = core.verify_exam_audit_chain(tamper_score_exam)
if tamper_score_res.get('valid') or tamper_score_res.get('reason') != 'AUDIT_HASH_MISMATCH' \
        or tamper_score_res.get('tampered_index') != 1:
    fail('tampered score must break chain with AUDIT_HASH_MISMATCH at index 1', tamper_score_res)

tamper_code_exam = _build_examiner_exam()
tamper_code_exam['submissions'][2]['code'] = 'int main(){ return 999; }'
tamper_code_res = core.verify_exam_audit_chain(tamper_code_exam)
if tamper_code_res.get('valid') or tamper_code_res.get('reason') != 'CODE_SHA256_MISMATCH' \
        or tamper_code_res.get('tampered_student') != 'thi-sinh-2':
    fail('tampered source code must break chain with CODE_SHA256_MISMATCH at student thi-sinh-2', tamper_code_res)

if core.compute_merkle_root([]) != core.GENESIS_PREV_HASH:
    fail('empty Merkle root must equal genesis 0^64')
ok('crypto-core unit proof: công thức SHA-256 & HMAC chuẩn xác, mọi can thiệp bị phát hiện đúng vị trí')

# 20. In-process dual-leaderboard engine math: công thức IOI tổng điểm tốt nhất / ICPC
#     T_penalty = t_AC (phút) + 20 * số lần nộp sai trước khi AC phải tính đúng tới từng phút/giây.
T0 = 1_700_000_000
lb_exam = {'code': 'LBMATH', 'createdAt': T0, 'participants': [], 'submissions': []}
def _lb_add(st, ts, tests):
    rec = {'student': st, 'language': 'cpp', 'tests': tests,
           'code': f'// {st} @ {ts}', 'timestamp': ts,
           'verdict': 'AC' if all(t['verdict'] == 'AC' for t in tests) else 'FAIL'}
    core.attach_audit_chain_record(lb_exam, rec)
    lb_exam['submissions'].append(rec)
# hs-icpc-late: 2 lần WA (t=+120s, +240s) rồi AC ở t=+600s → t_AC = 10 phút, penalty = 10 + 2*20 = 50
_lb_add('hs-icpc-late', T0 + 120, [{'name': '1', 'verdict': 'WA', 'ms': 10}])
_lb_add('hs-icpc-late', T0 + 240, [{'name': '1', 'verdict': 'WA', 'ms': 11}])
_lb_add('hs-icpc-late', T0 + 600, [{'name': '1', 'verdict': 'AC', 'ms': 15}])
# hs-icpc-fast: AC ngay t=+60s, penalty = 1 phút → hơn kém phải thắng nhờ tie-break thời gian
_lb_add('hs-icpc-fast', T0 + 60, [{'name': '1', 'verdict': 'AC', 'ms': 90}])
# hs-ioi-fastcast: 2 nộp cùng 50 điểm nhưng lần sau nhanh hơn (200ms < 500ms) → best_ms phải chọn 200
_lb_add('hs-ioi-fastcast', T0 + 60, [{'name': '1', 'verdict': 'WA', 'ms': 500}, {'name': '2', 'verdict': 'AC', 'ms': 500}])
_lb_add('hs-ioi-fastcast', T0 + 120, [{'name': '1', 'verdict': 'WA', 'ms': 100}, {'name': '2', 'verdict': 'AC', 'ms': 100}])
lbs_model = core.compute_dual_leaderboards(lb_exam)
icpc_rows_by_st = {r['student']: r for r in lbs_model.get('icpc', [])}
ioi_rows_by_st = {r['student']: r for r in lbs_model.get('ioi', [])}
late_icpc = icpc_rows_by_st.get('hs-icpc-late', {})
if np_late := None:
    pass
if late_icpc.get('solved') != 1 or late_icpc.get('wrong_attempts') != 2 or late_icpc.get('penalty_minutes') != 50:
    fail('ICPC penalty formula must be t_AC(/60) + 20*wrong → 10 + 40 = 50 phút', late_icpc)
fast_icpc = icpc_rows_by_st.get('hs-icpc-fast', {})
if fast_icpc.get('penalty_minutes') != 1:
    fail('ICPC penalty for instant AC must be 1 phút', fast_icpc)
if not lbs_model.get('icpc') or lbs_model['icpc'][0]['student'] != 'hs-icpc-fast':
    fail('ICPC ranking must prefer fewer penalty minutes', lbs_model.get('icpc'))
late_ioi = ioi_rows_by_st.get('hs-icpc-late', {})
if late_ioi.get('total_score') != 100.0 or late_ioi.get('elapsed_sec') != 600:
    fail('IOI best score must reach 100.0 with elapsed=600s to reach max score', late_ioi)
fastcast_ioi = ioi_rows_by_st.get('hs-ioi-fastcast', {})
if fastcast_ioi.get('total_score') != 50.0 or fastcast_ioi.get('exec_ms') != 200:
    fail('IOI must keep best (50.0) & tie-break to faster exec_ms=200 (not 500ms)', fastcast_ioi)
if not lbs_model.get('ioi') or lbs_model['ioi'][0]['student'] not in ('hs-icpc-fast', 'hs-icpc-late'):
    fail('IOI ranking must put full-AC students first', lbs_model.get('ioi'))
ok('leaderboard engine math: ICPC penalty=10+2×20=50 ✓, IOI best/tie-break ✓')

# Cleanup temporary test dir created by smoke test
shutil.rmtree(tdir, ignore_errors=True)

print('\nALL SMOKE TESTS PASSED (21/21)')

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

# Cleanup temporary test dir created by smoke test
shutil.rmtree(tdir, ignore_errors=True)

print('\nALL SMOKE TESTS PASSED (15/15)')

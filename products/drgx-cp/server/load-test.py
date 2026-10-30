#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Load test cho DrgX CP exam-server: mô phỏng cả lớp (mặc định 40 học sinh) nộp bài ĐỒNG THỜI.

Dùng:  python load-test.py [N]        (server phải đang chạy; đặt DRGX_CP_SERVER_URL nếu khác :8765)
Kết quả: in thời gian thực tế và số bài AC; thoát mã 1 nếu có bài nào không AC hoặc bị từ chối kết nối.
"""
import concurrent.futures
import json
import os
import shutil
import sys
import time
import urllib.request
from pathlib import Path

BASE = os.environ.get('DRGX_CP_SERVER_URL', 'http://127.0.0.1:8765')
TESTS_ROOT = Path(__file__).resolve().parent / 'tests'
N = int(sys.argv[1]) if len(sys.argv) > 1 else 40


def req(path, payload=None, timeout=300):
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    r = urllib.request.Request(BASE + path, data=data, method='POST' if payload is not None else 'GET',
                               headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


CPP = ('#include <bits/stdc++.h>\nusing namespace std;\n'
       'int main(){ long long a,b; cin>>a>>b; cout<<a+b<<"\\n"; }\n')
PY = 'a, b = map(int, input().split())\nprint(a + b)\n'

exam = req('/exam/create', {'title': f'LoadTest{N}'})
code = exam['code']
tdir = TESTS_ROOT / code
tdir.mkdir(parents=True, exist_ok=True)
for i, (a, b) in enumerate([('1 2', '3'), ('10 20', '30'), ('1000000000 2000000000', '3000000000')], 1):
    (tdir / f'{i}.in').write_text(a + '\n', encoding='utf-8')
    (tdir / f'{i}.out').write_text(b + '\n', encoding='utf-8')

failed = False
try:
    for lang, src in (('python', PY), ('cpp', CPP)):
        def one(i):
            t = time.time()
            try:
                r = req('/submit', {'examCode': code, 'language': lang, 'code': src, 'student': f'hs{i:02d}'})
                return r.get('verdict', '?'), time.time() - t
            except Exception as e:  # kết nối bị từ chối / reset
                return 'ERR:' + type(e).__name__, time.time() - t

        t0 = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=N) as pool:
            out = list(pool.map(one, range(N)))
        wall = time.time() - t0
        ac = sum(1 for v, _ in out if v == 'AC')
        errs = sorted({v for v, _ in out if v != 'AC'})
        print(f'[{lang:6}] {N} bài nộp đồng thời -> AC {ac}/{N} · tổng {wall:.1f}s · chậm nhất {max(t for _, t in out):.1f}s'
              + (f' · lỗi: {errs}' if errs else ''))
        failed = failed or ac != N
finally:
    shutil.rmtree(tdir, ignore_errors=True)

print('LOAD TEST ' + ('FAILED' if failed else 'PASSED'))
sys.exit(1 if failed else 0)

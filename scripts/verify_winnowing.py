#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Kiểm thử hồi quy cho engine chống đạo văn Winnowing THẬT (oj_server.exe, /api/anti-cheat/compare).

Khẳng định các tuyên bố trong hồ sơ/thuyết trình bằng số đo thực tế:
  1. Chép bài + đổi tên biến/hàm + đổi chú thích + định dạng lại  -> bị gắn cờ (>= 80%).
  2. Hai lời giải KHÁC thuật toán cho cùng bài toán                -> KHÔNG bị gắn cờ.
  3. Python: đổi tên biến + chú thích                              -> bị gắn cờ.
Chạy:  python -X utf8 scripts/verify_winnowing.py
"""
import json
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

OJ_DIR = Path(__file__).resolve().parent.parent / 'products' / 'void-bit' / 'OJ'

CPP_A = """#include <iostream>
using namespace std;
int gcd(int a, int b) {
    while (b != 0) {
        int t = a % b;
        a = b;
        b = t;
    }
    return a;
}
int main() {
    int x, y;
    cin >> x >> y;
    cout << gcd(x, y) << endl;
    return 0;
}
"""
CPP_B_RENAMED = """#include <iostream>
using namespace std;
// uoc chung lon nhat
int uocchung(int so1, int so2) {
    while (so2 != 0) {
        int du = so1 % so2; // lay du
        so1 = so2;
        so2 = du;
    }
    return so1;
}
int main() {
    int m, n;
    cin >> m >> n;
    cout << uocchung(m, n) << endl; // in ra
    return 0;
}
"""
CPP_C_OTHER_ALGO = """#include <iostream>
using namespace std;
int gcd(int a, int b) { return b == 0 ? a : gcd(b, a % b); }
int main() { int x, y; cin >> x >> y; cout << gcd(x, y) << "\\n"; }
"""
PY_A = """def dem_uoc(n):
    dem = 0
    for i in range(1, n + 1):
        if n % i == 0:
            dem += 1
    return dem

n = int(input())
print(dem_uoc(n))
"""
PY_B_RENAMED = """# dem so uoc cua so nguyen
def count_divisors(value):
    total = 0
    for k in range(1, value + 1):   # duyet het
        if value % k == 0:
            total += 1
    return total

v = int(input())
print(count_divisors(v))
"""


def free_port(start=19080):
    for p in range(start, start + 200):
        with socket.socket() as s:
            try:
                s.bind(('127.0.0.1', p))
                return p
            except OSError:
                continue


def compare(base, a, b):
    req = urllib.request.Request(base + '/api/anti-cheat/compare', data=json.dumps({'code_a': a, 'code_b': b}).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


port = free_port()
proc = subprocess.Popen([str(OJ_DIR / 'oj_server.exe'), str(port), 'static', 'problems'], cwd=str(OJ_DIR),
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
base = f'http://127.0.0.1:{port}'
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(base + '/api/health', timeout=1)
            break
        except Exception:
            time.sleep(0.2)
    cases = [
        ('C++  chép + đổi tên biến/hàm + chú thích  (phải bị gắn cờ)', CPP_A, CPP_B_RENAMED, True),
        ('C++  hai thuật toán khác nhau              (không gắn cờ)', CPP_A, CPP_C_OTHER_ALGO, False),
        ('Py   chép + đổi tên biến/hàm + chú thích  (phải bị gắn cờ)', PY_A, PY_B_RENAMED, True),
        ('C++  bài giống hệt                         (phải bị gắn cờ)', CPP_A, CPP_A, True),
    ]
    ok_all = True
    for name, a, b, want_flag in cases:
        r = compare(base, a, b)
        good = bool(r.get('flagged')) == want_flag
        ok_all &= good
        print(f"[{'PASS' if good else 'FAIL'}] {name}: similarity = {r.get('similarity')}%  flagged = {r.get('flagged')}")
    print('WINNOWING ' + ('ALL PASSED' if ok_all else 'FAILED'))
    sys.exit(0 if ok_all else 1)
finally:
    proc.kill()

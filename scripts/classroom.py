#!/usr/bin/env python3
"""Portable Classroom launcher. Does not install tools or expose LAN by default."""
import argparse
import importlib.util
import os
from pathlib import Path
import shutil
import webbrowser

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description='DrgX Classroom — Dashboard giáo viên & Local OJ')
    parser.add_argument('--host', default='127.0.0.1', help='Dùng 0.0.0.0 chỉ trong mạng LAN tin cậy')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--doctor', action='store_true', help='Kiểm tra thành phần, không khởi chạy')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('Port phải từ 1 đến 65535')
    required = [ROOT / 'products/drgx-cp/server' / name for name in ('exam-server.py', 'student.html')]
    if args.doctor:
        for path in required:
            print(f'{"OK" if path.is_file() else "MISSING"}: {path.relative_to(ROOT)}')
        print('C++ compiler:', shutil.which('g++') or 'NOT FOUND — cần cài để chấm C++')
        print('Void-bit source:', 'OK' if (ROOT / 'products/void-bit/OJ/oj_server.cpp').exists() else 'MISSING — không ảnh hưởng Classroom')
        return 0 if all(path.is_file() for path in required) else 1
    os.environ['DRGX_CP_SERVER_HOST'] = args.host
    os.environ['DRGX_CP_SERVER_PORT'] = str(args.port)
    spec = importlib.util.spec_from_file_location('drgx_classroom', required[0])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    local_host = '127.0.0.1' if args.host == '0.0.0.0' else args.host
    url = f'http://{local_host}:{args.port}/dashboard'
    print('Dashboard:', url, flush=True)
    print('Local OJ:', url.replace('/dashboard', '/oj'), flush=True)
    if args.host != '127.0.0.1':
        print('LAN: chỉ dùng mạng tin cậy. Trang học sinh cần IP LAN của máy giáo viên.', flush=True)
    if not args.no_browser:
        import threading
        timer = threading.Timer(1.0, lambda: webbrowser.open(url))
        timer.daemon = True
        timer.start()
    try:
        module.main()
    except KeyboardInterrupt:
        print('\nĐã dừng Classroom.')
    except OSError as error:
        parser.exit(1, f'Không khởi chạy được server: {error}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

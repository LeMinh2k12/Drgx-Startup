#!/usr/bin/env python3
"""Syntax-check Classroom inline scripts and CP extension without npm dependencies."""
import ast
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
server = ROOT / 'products/drgx-cp/server/exam-server.py'
module = ast.parse(server.read_text(encoding='utf-8'))
dashboard = next(ast.literal_eval(node.value) for node in module.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'DASHBOARD_HTML' for target in node.targets))
pages = {
    'dashboard': dashboard,
    'student': (server.parent / 'student.html').read_text(encoding='utf-8'),
    'website': (ROOT / 'web/classroom.html').read_text(encoding='utf-8'),
}
with tempfile.TemporaryDirectory() as directory:
    for name, html in pages.items():
        scripts = re.findall(r'<script\b[^>]*>(.*?)</script>', html, re.S | re.I)
        if not scripts:
            raise RuntimeError(f'No script found: {name}')
        for index, script in enumerate(scripts):
            path = Path(directory) / f'{name}-{index}.js'
            path.write_text(script, encoding='utf-8')
            subprocess.run(['node', '--check', str(path)], check=True)
        print('OK:', name)
subprocess.run(['node', '--check', str(ROOT / 'products/drgx-cp/extension/extension.js')], check=True)
print('OK: CP extension')

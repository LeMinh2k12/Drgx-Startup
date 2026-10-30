#!/usr/bin/env python3
"""Build prebuilt binaries from original sources.

Rebuilds every binary that used to be committed to the repo, so the
repository can stay source-only (small + fast to clone):

  - drgx.exe       (app/src-tauri/resources/drgx.exe)   <- cli/ (Rust, cargo release)
  - oj_server.exe  (products/void-bit/OJ/oj_server.exe) <- oj_server.cpp (g++/clang++)
  - drgx-ide.exe & drgx-studio.exe (app side)           <- app/src-tauri (cargo, optional)

Usage:
  python scripts/build.py            # build everything needed for 1-click demos
  python scripts/build.py drgx       # only drgx.exe
  python scripts/build.py oj         # only oj_server.exe
  python scripts/build.py ide        # only the Tauri IDE binaries
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The default C:\MinGW is too old for the rust x86_64-pc-windows-gnu linker
# (dlltool fails). Prefer a modern MSYS2 toolchain when present.
_MSYS2_DIRS = [
    r"C:\msys64\ucrt64\bin",
    r"C:\msys64\mingw64\bin",
    r"C:\msys2\ucrt64\bin",
    r"C:\msys2\mingw64\bin",
]

for _p in _MSYS2_DIRS:
    if Path(_p).is_dir():
        os.environ["PATH"] = _p + os.pathsep + os.environ["PATH"]
        break

TARGETS = {
    "drg": "drgx",
    "drgx": "drgx",
    "oj": "oj",
    "oj_server": "oj",
    "ide": "ide",
    "tauri": "ide",
}


def run(cmd, cwd):
    print(f"[build] $ {' '.join(map(str, cmd))}  (cwd={cwd})")
    subprocess.run(cmd, cwd=cwd, check=True)


def which(name):
    found = shutil.which(name)
    if not found:
        print(f"[skip] '{name}' not found on PATH")
    return found


def build_drgx():
    """Build cli/drgx -> app/src-tauri/resources/drgx.exe"""
    run(["cargo", "build", "--release"], cwd=ROOT / "cli")
    src = ROOT / "cli" / "target" / "release" / "drgx.exe"
    dst_dir = ROOT / "app" / "src-tauri" / "resources"
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / "drgx.exe"
    shutil.copy2(src, dst)
    print(f"[ok] {src.name} ({src.stat().st_size / 1e6:.2f} MB) -> {dst.relative_to(ROOT)}")


def build_oj():
    """Build oj_server.cpp -> products/void-bit/OJ/oj_server.exe"""
    src = ROOT / "products" / "void-bit" / "OJ" / "oj_server.cpp"
    dst = src.with_suffix(".exe")
    cc = which("g++") or which("clang++") or which("cl")
    if not cc:
        print("[error] no C++ compiler found (need g++, clang++ or cl)")
        sys.exit(1)
    if cc.endswith("cl.exe"):
        run([cc, "/O2", "/EHsc", "/MD",
             "/link", "ws2_32.lib", "advapi32.lib", str(src), f"/OUT:{dst}"],
            cwd=src.parent)
    else:
        run([cc, "-O2", "-std=c++17", "-static",
             src, "-o", dst,
             "-lws2_32", "-ladvapi32", "-lwinhttp"],
            cwd=src.parent)
    print(f"[ok] {dst.name} ({dst.stat().st_size / 1e6:.2f} MB)")


def build_ide():
    """Build the Tauri IDE binaries (drgx-ide, drgx-studio)."""
    app = ROOT / "app"
    if (app / "package.json").exists() and which("npm"):
        run(["npm", "install"], cwd=app)
    run(["cargo", "build", "--release"], cwd=ROOT / "app" / "src-tauri")
    print("[ok] Tauri IDE binaries built (see app/src-tauri/target/release/)")


def main(argv):
    wanted = argv or list(TARGETS.values())
    for name in wanted:
        key = TARGETS.get(name.lower())
        if key is None:
            print(f"[error] unknown target: {name} (choose from: drgx, oj, ide)")
            sys.exit(2)
        {"drgx": build_drgx, "oj": build_oj, "ide": build_ide}[key]()


if __name__ == "__main__":
    main(sys.argv[1:])

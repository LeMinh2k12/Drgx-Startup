#!/usr/bin/env python3
"""Nhập icon DrgX từ một tệp .ico/.png và xuất toàn bộ bộ nhận diện.

Cách dùng:
    python -X utf8 scripts/import_icon.py "C:\\duong\\dan\\icon.ico"

Script sẽ tạo bản vuông, bo góc nhẹ, nền đen và ghi đè các tệp logo/icon
đang dùng trong app, web và hồ sơ dự thi. Ảnh gốc được giữ nguyên trong
assets/branding/ để có thể tái tạo.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT / "assets" / "branding" / "drgx-icon-source.ico"
BRAND_BG = (10, 10, 10, 255)


def _logo_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    """Bỏ nền đen/trong suốt để lấy phần nét logo."""
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a < 16:
                continue
            if max(r, g, b) > 40 or (r, g, b) != (10, 10, 10):
                xs.append(x)
                ys.append(y)
    if not xs:
        return (0, 0, rgba.width, rgba.height)
    pad = 2
    return (
        max(0, min(xs) - pad),
        max(0, min(ys) - pad),
        min(rgba.width, max(xs) + pad + 1),
        min(rgba.height, max(ys) + pad + 1),
    )


def _rounded_mask(size: int, radius_ratio: float = 0.19) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    radius = max(6, int(size * radius_ratio))
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def _render(source: Image.Image, size: int) -> Image.Image:
    logo = source.crop(_logo_bbox(source)).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    inner = int(size * 0.78)
    ratio = min(inner / logo.width, inner / logo.height)
    target = (max(1, round(logo.width * ratio)), max(1, round(logo.height * ratio)))
    logo = logo.resize(target, Image.Resampling.LANCZOS)
    logo = logo.filter(ImageFilter.UnsharpMask(radius=0.6, percent=110, threshold=2))

    # Nền đen bo góc, sau đó dán phần nét logo lên trên.
    bg = Image.new("RGBA", (size, size), BRAND_BG)
    bg.putalpha(_rounded_mask(size))
    canvas.alpha_composite(bg)

    # Tách nét sáng khỏi nền đen của ảnh gốc để không tạo viền đen vuông.
    px = logo.load()
    for y in range(logo.height):
        for x in range(logo.width):
            r, g, b, a = px[x, y]
            if a == 0:
                px[x, y] = (0, 0, 0, 0)
            elif r + g + b < 60:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, a)

    canvas.alpha_composite(
        logo,
        ((size - logo.width) // 2, (size - logo.height) // 2),
    )
    return canvas


def main() -> int:
    source_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source_path.exists():
        print(f"[!] Không tìm thấy icon nguồn: {source_path}")
        return 1

    source = Image.open(source_path).convert("RGBA")
    print(f"[i] Nguồn: {source_path} ({source.width}x{source.height})")

    # Lưu ảnh nguồn để pipeline có thể chạy lại.
    brand_dir = ROOT / "assets" / "branding"
    brand_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, DEFAULT_SOURCE)

    base_1024 = _render(source, 1024)
    base_512 = _render(source, 512)

    outputs: list[tuple[Image.Image, Path]] = [
        (base_512, ROOT / "app" / "dist" / "logo.png"),
        (base_512, ROOT / "app" / "src-tauri" / "icons" / "icon.png"),
        (base_512, ROOT / "web" / "assets" / "logo.png"),
        (base_1024, ROOT / "web" / "assets" / "logo-hd.png"),
        (base_512, ROOT / "web" / "intro" / "logo.png"),
        (base_512, ROOT / "docs" / "startup" / "assets" / "logo.png"),
        (base_512, ROOT / "docs" / "startup" / "print" / "logo.png"),
    ]
    for image, path in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, "PNG", optimize=True)
        print(f"  [ok] {path.relative_to(ROOT)}")

    icon_path = ROOT / "app" / "src-tauri" / "icons" / "icon.ico"
    base_512.save(
        icon_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"  [ok] {icon_path.relative_to(ROOT)} (multi-size)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

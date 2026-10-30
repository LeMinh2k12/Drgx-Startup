"""Sinh bộ nhận diện DrgX dùng cho workbench Code OSS.

Chạy: python scripts/build_brand_assets.py
Nguồn duy nhất: web/assets/logo-hd.png (biểu tượng DrgX gốc).
"""
from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "assets" / "logo-hd.png"
OUT = ROOT / "app" / "src-tauri" / "branding"
OUT.mkdir(parents=True, exist_ok=True)


def png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def data_uri(image: Image.Image) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes(image)).decode("ascii")


def mark_only(source: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """Tách nét sáng của logo khỏi nền đen, giữ alpha mượt."""
    rgba = source.convert("RGBA")
    out = Image.new("RGBA", rgba.size, (color[0], color[1], color[2], 0))
    src = rgba.load()
    dst = out.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, _ = src[x, y]
            lum = max(r, g, b)
            # Nền đen -> trong suốt; nét trắng -> đậm dần, khử răng cưa.
            alpha = 0 if lum < 18 else min(255, int((lum - 18) * 1.35))
            if alpha:
                dst[x, y] = (color[0], color[1], color[2], alpha)
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    # Đưa về khung vuông, chừa lề đều để không bị méo khi đặt cạnh chữ.
    side = max(out.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.alpha_composite(out, ((side - out.width) // 2, (side - out.height) // 2))
    return square.resize((512, 512), Image.Resampling.LANCZOS)


def letterpress_svg(mark: Image.Image, fill: str, opacity: float) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 210 64">'
        f'<g opacity="{opacity}">'
        f'<image x="0" y="4" width="56" height="56" href="{data_uri(mark)}"/>'
        f'<text x="66" y="45" font-family="Segoe UI, Arial, sans-serif" '
        f'font-size="34" font-weight="700" letter-spacing="-1" fill="{fill}">DrgX</text>'
        f'<text x="151" y="44" font-family="Segoe UI, Arial, sans-serif" '
        f'font-size="13" font-weight="600" letter-spacing="2" fill="{fill}">IDE</text>'
        "</g></svg>"
    )


def main() -> None:
    source = Image.open(SRC).convert("RGBA")
    white = mark_only(source, (255, 255, 255))
    dark = mark_only(source, (24, 28, 38))

    # Logo đầy đủ cho titlebar workbench (16px) và banner.
    icon = source.resize((128, 128), Image.Resampling.LANCZOS)
    (OUT / "code-icon.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">'
        f'<image width="128" height="128" href="{data_uri(icon)}"/></svg>',
        encoding="utf-8",
    )

    # Watermark khi không mở file: chỉ nét DrgX, không dùng wordmark của VS Code.
    (OUT / "letterpress-dark.svg").write_text(
        letterpress_svg(white, "#ffffff", 0.28), encoding="utf-8"
    )
    (OUT / "letterpress-hcDark.svg").write_text(
        letterpress_svg(white, "#ffffff", 0.40), encoding="utf-8"
    )
    (OUT / "letterpress-light.svg").write_text(
        letterpress_svg(dark, "#181c26", 0.10), encoding="utf-8"
    )
    (OUT / "letterpress-hcLight.svg").write_text(
        letterpress_svg(dark, "#181c26", 0.16), encoding="utf-8"
    )

    # PWA icons.
    for size in (192, 512):
        source.resize((size, size), Image.Resampling.LANCZOS).save(
            OUT / f"code-{size}.png", format="PNG", optimize=True
        )

    print("Đã tạo:", ", ".join(sorted(p.name for p in OUT.iterdir())))


if __name__ == "__main__":
    main()

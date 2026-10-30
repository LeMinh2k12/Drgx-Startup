#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Nhúng trực tiếp file ghi âm (.mp3, .m4a, .wav, .ogg, .webm) vào thẳng
`D:\\Dev\\vietcode\\presentation\\index.html` kèm bảng mốc giây tự động nhảy 19 Slide (S00 -> S18).

Cách dùng:
    python -X utf8 scripts/embed_voiceover.py <duong_dan_file_ghi_am> [tong_so_giay]
"""
from __future__ import annotations

import base64
import json
import mimetypes
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "presentation" / "index.html"

# Số từ chuẩn của 19 slide (S00 -> S18) để tự chia mốc tỷ lệ chính xác theo độ dài file ghi âm
SLIDE_WEIGHTS = [
    ("S00", 25),
    ("S01", 25),
    ("S02", 25),
    ("S03", 26),
    ("S04", 27),
    ("S05", 27),
    ("S06", 26),
    ("S07", 30),  # +3s cho hiệu ứng Live Demo 1: Stress Test 3 cột
    ("S08", 30),  # +3s cho hiệu ứng Live Demo 2: Winnowing k-gram
    ("S09", 29),  # +3s cho hiệu ứng Live Demo 3: Phòng thi LAN 40 máy
    ("S10", 26),
    ("S11", 27),
    ("S12", 26),
    ("S13", 26),
    ("S14", 28),
    ("S15", 27),
    ("S16", 27),
    ("S17", 28),
    ("S18", 28),
]


def build_cues(total_seconds: float) -> dict[str, float]:
    total_w = sum(w for _, w in SLIDE_WEIGHTS)
    cues: dict[str, float] = {}
    acc = 0
    for idx, (code, w) in enumerate(SLIDE_WEIGHTS):
        cues[code] = 0.0 if idx == 0 else round((acc / total_w) * total_seconds, 1)
        acc += w
    return cues


def main() -> int:
    if len(sys.argv) < 2:
        print("Cách dùng: python -X utf8 scripts/embed_voiceover.py <file_ghi_am.mp3/.m4a/.wav> [tong_so_giay]")
        return 1

    audio_path = Path(sys.argv[1]).expanduser().resolve()
    if not audio_path.exists():
        print(f"[!] Không tìm thấy file âm thanh: {audio_path}")
        return 1

    total_sec = float(sys.argv[2]) if len(sys.argv) >= 3 else 128.0
    mime, _ = mimetypes.guess_type(str(audio_path))
    if not mime:
        ext = audio_path.suffix.lower()
        mime = {
            ".mp3": "audio/mpeg",
            ".m4a": "audio/mp4",
            ".wav": "audio/wav",
            ".ogg": "audio/ogg",
            ".webm": "audio/webm",
        }.get(ext, "audio/mpeg")

    b64 = base64.b64encode(audio_path.read_bytes()).decode("ascii")
    data_uri = f"data:{mime};base64,{b64}"
    cues = build_cues(total_sec)

    html = INDEX_HTML.read_text(encoding="utf-8")
    html = re.sub(
        r'<script id="drgx-embedded-voiceover">[\s\S]*?</script>\s*',
        "",
        html,
    )
    payload = (
        '<script id="drgx-embedded-voiceover">\n'
        f"window.DRGX_EMBEDDED_CUES = {json.dumps(cues, ensure_ascii=False)};\n"
        f"window.DRGX_EMBEDDED_AUDIO = {json.dumps(data_uri)};\n"
        f"window.DRGX_EMBEDDED_NAME = {json.dumps(audio_path.name, ensure_ascii=False)};\n"
        "</script>\n"
    )
    target = '<script src="app.js"></script>'
    if target in html:
        html = html.replace(target, payload + target)
    else:
        html = html.replace("</body>", payload + "</body>")

    INDEX_HTML.write_text(html, encoding="utf-8")
    print(f"[OK] Đã nhúng '{audio_path.name}' ({len(b64) // 1024} KB Base64) vào {INDEX_HTML}")
    print(f"[OK] Đã thiết lập 19 mốc tự nhảy Slide (S00 -> S18) trên tổng thời lượng {total_sec:.1f}s.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Kiểm tra các placeholder [[...]] còn sót trong bộ hồ sơ in.

Chạy trước khi in/nộp:
    python -X utf8 scripts/check_placeholders.py

Mã thoát 0 nếu sạch, 1 nếu còn placeholder.
"""

from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STARTUP = ROOT / "docs" / "startup"
PLACEHOLDER = re.compile(r"\[\[[^\]]*\]\]")

TARGETS = [
    STARTUP / "print" / "bai-thi-drgx-ide.docx",
    STARTUP / "print" / "bai-thi-drgx-ide.pdf",
    STARTUP / "print" / "dang-ky-du-thi.docx",
    STARTUP / "print" / "dang-ky-du-thi.pdf",
    STARTUP / "print" / "bien-ban-xac-nhan-pilot.docx",
    STARTUP / "print" / "bien-ban-xac-nhan-pilot.pdf",
    STARTUP / "pitch" / "pitch.html",
    STARTUP / "print" / "poster-a3.html",
]


def docx_text(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    chunks: list[str] = []
    for p in doc.paragraphs:
        chunks.append(p.text)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    chunks.append(p.text)
    for section in doc.sections:
        for part in (
            section.header,
            section.footer,
            section.first_page_header,
            section.first_page_footer,
            section.even_page_header,
            section.even_page_footer,
        ):
            for p in part.paragraphs:
                chunks.append(p.text)
            for table in part.tables:
                for row in table.rows:
                    for cell in row.cells:
                        for p in cell.paragraphs:
                            chunks.append(p.text)
    return "\n".join(chunks)


def pdf_text(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def main() -> int:
    hits: list[tuple[Path, str]] = []
    for path in TARGETS:
        if not path.exists():
            print(f"[!] Thiếu tệp: {path.relative_to(ROOT)}")
            continue
        suffix = path.suffix.lower()
        if suffix == ".docx":
            text = docx_text(path)
        elif suffix == ".pdf":
            text = pdf_text(path)
        else:
            text = path.read_text(encoding="utf-8")

        for match in PLACEHOLDER.finditer(text):
            snippet = text[max(0, match.start() - 35) : match.end() + 35].replace("\n", " ")
            hits.append((path, snippet.strip()))

    if not hits:
        print("[OK] Không còn placeholder [[...]] trong bộ hồ sơ in.")
        return 0

    print(f"[!] Còn {len(hits)} placeholder cần điền:")
    for path, count in Counter(item[0] for item in hits).items():
        print(f"  - {path.relative_to(ROOT)}: {count}")
    print("  Ví dụ:")
    for path, snippet in hits[:12]:
        print(f"    • {path.name}: ...{snippet}...")
    if len(hits) > 12:
        print(f"    ... và {len(hits) - 12} vị trí khác.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

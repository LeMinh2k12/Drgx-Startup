# -*- coding: utf-8 -*-
import re
src = r"D:\Dev\vietcode\docs\startup\print\bai-thi-drgx-ide.docx"
pdf = r"D:\Dev\vietcode\presentation\voiceover\probe.pdf"
from docx2pdf import convert
convert(src, pdf)
from pypdf import PdfReader
r = PdfReader(pdf)
print("Tổng trang:", len(r.pages))
for i, pg in enumerate(r.pages, 1):
    t = re.sub(r"\s+", " ", pg.extract_text() or "")
    print(f"--- Trang {i}: {t[:150]}")

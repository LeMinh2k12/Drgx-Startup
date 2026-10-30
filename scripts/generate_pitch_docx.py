#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Sinh file Microsoft Word (.docx) "Cẩm nang & Kịch bản Thuyết trình" của DrgX từ
`presentation/KICH-BAN-THUYET-TRINH.md`, rồi đồng bộ sang `docs/startup/print/`.

Bản Word chuẩn in: A4, Times New Roman, bìa + mục lục, đầu/chân trang có số trang,
bảng có hàng tiêu đề tô màu, lời thoại (blockquote) có nền riêng, ký hiệu `[BẤM →]` nổi bật.
"""
from __future__ import annotations

import datetime
import re
import shutil
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
MD_PATH = ROOT / 'presentation' / 'KICH-BAN-THUYET-TRINH.md'
MD_2MIN_PATH = ROOT / 'presentation' / 'KICH-BAN-2-PHUT.md'
OUT_DOCX_1 = ROOT / 'presentation' / 'Kich-ban-thuyet-trinh-DrgX.docx'
OUT_DOCX_2 = ROOT / 'docs' / 'startup' / 'print' / 'kich-ban-thuyet-trinh.docx'
OUT_2MIN_DOCX = ROOT / 'presentation' / 'Loi-thoai-thuyet-trinh-2-phut-DrgX.docx'
OUT_2MIN_PRINT = ROOT / 'docs' / 'startup' / 'print' / 'Loi-thoai-thuyet-trinh-2-phut-DrgX.docx'
HTML_SRC = ROOT / 'presentation' / 'kich-ban-thuyet-trinh.html'
HTML_DST = ROOT / 'docs' / 'startup' / 'print' / 'kich-ban-thuyet-trinh.html'
LOGO = ROOT / 'docs' / 'startup' / 'assets' / 'logo.png'

FONT = 'Times New Roman'
NAVY = RGBColor(0x0B, 0x1B, 0x3A)
ACCENT = RGBColor(0x0E, 0x74, 0x90)
CUE = RGBColor(0xB9, 0x1C, 0x1C)
GRAY = RGBColor(0x47, 0x55, 0x69)

EMOJI_RE = re.compile('[\U0001F000-\U0001FAFF\u2600-\u26FF\u23E9-\u23FF\u2B00-\u2BFF\uFE0F\u200D]')
LINK_RE = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
MATH_RE = re.compile(r'\$([^$\n]+)\$')
TOKEN_RE = re.compile(r'(\*\*.+?\*\*|`[^`]+`|(?<![*\w])\*(?!\s)[^*\n]+?\*(?![*\w]))')


def clean(text: str) -> str:
    text = LINK_RE.sub(lambda m: m.group(1).strip('`'), text)
    text = MATH_RE.sub(r'\1', text)
    text = EMOJI_RE.sub('', text)
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = text.replace('\\|', '|')
    return re.sub(r'[ \t]{2,}', ' ', text).strip()


def set_font(run, size=None, bold=None, italic=None, color=None, mono=False):
    name = 'Consolas' if mono else FONT
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.append(rfonts)
    for theme_attr in ('w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'):
        if rfonts.get(qn(theme_attr)) is not None:
            del rfonts.attrib[qn(theme_attr)]
    for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
        rfonts.set(qn(attr), name)
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    if color is not None:
        run.font.color.rgb = color


def add_inline(par, text, size=14, bold=False, italic=False, color=None):
    for part in TOKEN_RE.split(text):
        if not part:
            continue
        if part.startswith('**') and part.endswith('**') and len(part) > 4:
            add_inline(par, part[2:-2], size, True, italic, color)
        elif part.startswith('`') and part.endswith('`') and len(part) > 2:
            inner = part[1:-1]
            if inner.startswith('[BẤM'):
                set_font(par.add_run(inner), size, True, False, CUE)
            else:
                set_font(par.add_run(inner), max(size - 1, 8), bold, italic, RGBColor(0x1E, 0x40, 0xAF), mono=True)
        elif part.startswith('*') and part.endswith('*') and len(part) > 2:
            add_inline(par, part[1:-1], size, bold, True, color)
        else:
            lines = part.split('\n')
            for i, ln in enumerate(lines):
                r = par.add_run(ln)
                set_font(r, size, bold, italic, color)
                if i < len(lines) - 1:
                    r.add_break()


def shade(el_pr, fill):
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill)
    el_pr.append(shd)


def para_border(par, side='left', color='0E7490', size=18, space=6):
    ppr = par._p.get_or_add_pPr()
    bdr = ppr.find(qn('w:pBdr'))
    if bdr is None:
        bdr = OxmlElement('w:pBdr')
        ppr.append(bdr)
    b = OxmlElement(f'w:{side}')
    b.set(qn('w:val'), 'single')
    b.set(qn('w:sz'), str(size))
    b.set(qn('w:space'), str(space))
    b.set(qn('w:color'), color)
    bdr.append(b)


def add_field(par, instr, size=9, color=GRAY):
    for kind in ('begin', None, 'end'):
        run = par.add_run()
        set_font(run, size, None, None, color)
        if kind:
            fc = OxmlElement('w:fldChar')
            fc.set(qn('w:fldCharType'), kind)
            run._r.append(fc)
        else:
            it = OxmlElement('w:instrText')
            it.set(qn('xml:space'), 'preserve')
            it.text = instr
            run._r.append(it)


def setup_document() -> Document:
    doc = Document()
    sec = doc.sections[0]
    sec.orientation = WD_ORIENT.PORTRAIT
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.top_margin, sec.bottom_margin = Cm(2.0), Cm(1.8)
    sec.left_margin, sec.right_margin = Cm(2.2), Cm(1.8)
    sec.header_distance, sec.footer_distance = Cm(0.9), Cm(0.8)

    normal = doc.styles['Normal']
    normal.font.name = FONT
    normal.font.size = Pt(14)
    normal.element.rPr.rFonts.set(qn('w:eastAsia'), FONT)
    for theme_attr in ('w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'):
        if normal.element.rPr.rFonts.get(qn(theme_attr)) is not None:
            del normal.element.rPr.rFonts.attrib[qn(theme_attr)]
    normal.paragraph_format.space_after = Pt(4)
    normal.paragraph_format.line_spacing = 1.25
    for name, size, color, before in (('Heading 1', 15, NAVY, 14), ('Heading 2', 14, ACCENT, 10), ('Heading 3', 14, NAVY, 8)):
        st = doc.styles[name]
        st.font.name = FONT
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = color
        st.element.rPr.rFonts.set(qn('w:eastAsia'), FONT)
        for theme_attr in ('w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'):
            if st.element.rPr.rFonts.get(qn(theme_attr)) is not None:
                del st.element.rPr.rFonts.attrib[qn(theme_attr)]
        st.paragraph_format.space_before = Pt(before)
        st.paragraph_format.space_after = Pt(4)
        st.paragraph_format.keep_with_next = True
    for name in ('List Bullet',):
        st = doc.styles[name]
        st.font.name = FONT
        st.font.size = Pt(14)

    # Header / footer
    hp = sec.header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(hp.add_run('DrgX — Cẩm nang & Kịch bản thuyết trình · Cuộc thi “Học sinh, sinh viên với ý tưởng khởi nghiệp” tỉnh Phú Thọ 2026–2027'), 9, None, True, GRAY)
    para_border(hp, 'bottom', 'CBD5E1', 6, 4)
    fp = sec.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(fp.add_run('Trang '), 9, None, None, GRAY)
    add_field(fp, 'PAGE')
    set_font(fp.add_run(' / '), 9, None, None, GRAY)
    add_field(fp, 'NUMPAGES')
    return doc


def cover(doc: Document, toc_items, title='CẨM NANG & KỊCH BẢN THUYẾT TRÌNH', include_toc=True):
    def line(text, size, bold=False, color=None, after=4, italic=False):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(after)
        set_font(p.add_run(text), size, bold, italic, color)
        return p

    line('SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH PHÚ THỌ', 13, True, None, 0)
    line('CUỘC THI “HỌC SINH, SINH VIÊN VỚI Ý TƯỞNG KHỞI NGHIỆP” NĂM HỌC 2026–2027', 12, True, None, 0)
    line('(Kế hoạch số 153/KH-SGDĐT ngày 25/9/2026) · Lĩnh vực 01: Công nghiệp, chế tạo, AI, STEM', 11, False, GRAY, 26, True)
    if LOGO.exists():
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run().add_picture(str(LOGO), width=Cm(3.6))
    line('', 10, after=10)
    line(title, 22, True, NAVY, 0)
    line('DỰ ÁN DrgX', 24, True, ACCENT, 8)
    line('Hệ sinh thái lập trình local-first: chấm thi C++17, Stress Test, chống đạo văn Winnowing và phòng thi mạng LAN', 13, False, GRAY, 22, True)

    t = doc.add_table(rows=0, cols=2)
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta = [
        ('Đơn vị & Đội ngũ', 'Lớp 9A2 — Trường THCS Sông Lô (Lê Tiến Dũng, Lê Bình Minh, Minh Đăng, Minh Quang)'),
        ('Lời thoại 2 phút', '18 Slide chính + Slide Mở đầu (25–28 từ/slide, cam kết nghiêm ngặt ≤ 50 từ/slide)'),
        ('Bản trình chiếu', 'presentation/index.html — 24 slide, 3 chế độ: Toàn bộ · 2 phút (18 slide) · Video 3 phút'),
        ('Số liệu kiểm định', 'Đã đối chiếu với số đo thật 68/68 chốt chặn tự động (verify_ecosystem.py)'),
        ('Ngày cập nhật', datetime.date.today().strftime('%d/%m/%Y')),
    ]
    for k, v in meta:
        cells = t.add_row().cells
        cells[0].width, cells[1].width = Cm(3.8), Cm(12.4)
        shade(cells[0]._tc.get_or_add_tcPr(), 'E0F2FE')
        cells[0].text = ''
        cells[1].text = ''
        set_font(cells[0].paragraphs[0].add_run(k), 11, True, None, NAVY)
        set_font(cells[1].paragraphs[0].add_run(v), 11)
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    if include_toc:
        p = doc.add_paragraph()
        set_font(p.add_run('MỤC LỤC'), 16, True, None, NAVY)
        p.paragraph_format.space_after = Pt(8)
        for lvl, toc_title in toc_items:
            q = doc.add_paragraph()
            q.paragraph_format.left_indent = Cm(0 if lvl == 1 else 0.9)
            q.paragraph_format.space_after = Pt(1.5)
            set_font(q.add_run(toc_title), 12 if lvl == 1 else 11, lvl == 1, None, NAVY if lvl == 1 else None)
        doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def build_table(doc: Document, rows):
    cols = max(len(r) for r in rows)
    rows = [r + [''] * (cols - len(r)) for r in rows]
    t = doc.add_table(rows=len(rows), cols=cols)
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    weights = []
    for c in range(cols):
        w = max(len(clean(r[c])) for r in rows)
        weights.append(min(max(w, 8), 70) ** 0.8)
    total_w = 16.9
    widths = [max(1.5, total_w * w / sum(weights)) for w in weights]
    scale = total_w / sum(widths)
    widths = [w * scale for w in widths]
    # Fixed layout + explicit grid so Word honours the column widths
    tblpr = t._tbl.tblPr
    layout = OxmlElement('w:tblLayout')
    layout.set(qn('w:type'), 'fixed')
    tblpr.append(layout)
    tblw = tblpr.find(qn('w:tblW'))
    if tblw is None:
        tblw = OxmlElement('w:tblW')
        tblpr.append(tblw)
    tblw.set(qn('w:type'), 'dxa')
    tblw.set(qn('w:w'), str(int(total_w * 567)))
    for ci, w in enumerate(widths):
        t.columns[ci].width = Cm(w)
    font = 9.5 if cols >= 5 else 10
    is_short_table = len(rows) <= 12
    for ri, row in enumerate(rows):
        keep_row = (ri < len(rows) - 1) if is_short_table else (ri in (0, len(rows) - 2))
        for ci in range(cols):
            cell = t.cell(ri, ci)
            cell.width = Cm(widths[ci])
            cell.text = ''
            parts = clean(row[ci]).split('\n') or ['']
            for pi, part in enumerate(parts):
                par = cell.paragraphs[0] if pi == 0 else cell.add_paragraph()
                par.paragraph_format.space_after = Pt(1)
                par.paragraph_format.line_spacing = 1.05
                if keep_row:
                    par.paragraph_format.keep_with_next = True
                if ri == 0:
                    add_inline(par, part, font, True, False, RGBColor(0xFF, 0xFF, 0xFF))
                else:
                    add_inline(par, part, font)
            tcpr = cell._tc.get_or_add_tcPr()
            if ri == 0:
                shade(tcpr, '0E7490')
            elif ri % 2 == 0:
                shade(tcpr, 'F1F5F9')
    # repeat header row on each page; never split a row across two pages
    for row in t.rows:
        rp = row._tr.get_or_add_trPr()
        cs = OxmlElement('w:cantSplit')
        cs.set(qn('w:val'), 'true')
        rp.append(cs)
    trpr = t.rows[0]._tr.get_or_add_trPr()
    th = OxmlElement('w:tblHeader')
    th.set(qn('w:val'), 'true')
    trpr.append(th)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def build_docx(md_text: str, out_path: Path, title='CẨM NANG & KỊCH BẢN THUYẾT TRÌNH', include_toc=True):
    lines = md_text.splitlines()
    # Pre-pass: table of contents (## and ###)
    toc = []
    skipped_title = False
    for ln in lines:
        s = ln.strip()
        if s.startswith('# ') and not skipped_title:
            skipped_title = True
        elif s.startswith('## '):
            toc.append((1, re.sub(r'[`*]', '', clean(s[3:]))))
        elif s.startswith('### '):
            toc.append((2, re.sub(r'[`*]', '', clean(s[4:]))))

    doc = setup_document()
    cover(doc, toc, title=title, include_toc=include_toc)

    table_buf: list[str] = []
    title_skipped = False
    in_meta = True  # the first blockquote block is covered on the cover page

    def flush_table():
        nonlocal table_buf
        if not table_buf:
            return
        rows = []
        for raw in table_buf:
            cells = [c.strip() for c in raw.strip().strip('|').split('|')]
            if all(set(c) <= set('-: ') for c in cells):
                continue
            rows.append(cells)
        table_buf = []
        if rows:
            build_table(doc, rows)

    for line in lines:
        s = line.strip()
        if s.startswith('|') and s.endswith('|'):
            table_buf.append(s)
            continue
        flush_table()
        if not s or s == '---':
            continue
        if s.startswith('# ') and not title_skipped:
            title_skipped = True
            continue
        if in_meta and s.startswith('>'):
            continue  # metadata block already summarised on the cover
        if s.startswith('## '):
            in_meta = False
            h = doc.add_heading(level=1)
            add_inline(h, clean(s[3:]), 16, True, False, NAVY)
            para_border(h, 'bottom', '0E7490', 8, 2)
        elif s.startswith('### '):
            in_meta = False
            h = doc.add_heading(level=2)
            add_inline(h, clean(s[4:]), 14, True, False, ACCENT)
        elif s.startswith('#### '):
            in_meta = False
            h = doc.add_heading(level=3)
            add_inline(h, clean(s[5:]), 14, True, False, NAVY)
        elif s.startswith('>'):
            body = s.lstrip('>').strip()
            while body.startswith('>'):
                body = body[1:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.6)
            p.paragraph_format.space_after = Pt(3)
            shade(p._p.get_or_add_pPr(), 'F1F5F9')
            para_border(p, 'left', '0E7490', 18, 6)
            add_inline(p, clean(body), 14)
        elif re.match(r'^[-*] \[[ xX]\] ', s):
            done = s[3] in 'xX'
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.9)
            p.paragraph_format.first_line_indent = Cm(-0.6)
            set_font(p.add_run('☑ ' if done else '☐ '), 14)
            add_inline(p, clean(s[6:]), 14)
        elif s.startswith('- ') or s.startswith('* '):
            p = doc.add_paragraph(style='List Bullet')
            p.paragraph_format.space_after = Pt(2)
            add_inline(p, clean(s[2:]), 14)
        elif re.match(r'^\d+\. ', s):
            m = re.match(r'^(\d+)\. (.*)$', s)
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.9)
            p.paragraph_format.first_line_indent = Cm(-0.6)
            set_font(p.add_run(m.group(1) + '. '), 14, True)
            add_inline(p, clean(m.group(2)), 14)
        else:
            p = doc.add_paragraph()
            add_inline(p, clean(s), 14)
    flush_table()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        doc.save(str(out_path))
    except PermissionError:
        alt_path = out_path.with_name(out_path.stem + '-Updated' + out_path.suffix)
        doc.save(str(alt_path))
        print(f'WARN: {out_path.name} đang mở trong Word/WPS -> đã lưu bản mới tại {alt_path}')
        return alt_path
    return out_path


def main():
    md_text = MD_PATH.read_text(encoding='utf-8')
    saved_1 = build_docx(md_text, OUT_DOCX_1, title='CẨM NANG & KỊCH BẢN THUYẾT TRÌNH', include_toc=True)
    try:
        shutil.copy2(saved_1, OUT_DOCX_2)
    except PermissionError:
        pass

    saved_2min = OUT_2MIN_DOCX
    if MD_2MIN_PATH.exists():
        md_2min = MD_2MIN_PATH.read_text(encoding='utf-8')
        saved_2min = build_docx(
            md_2min,
            OUT_2MIN_DOCX,
            title='LỜI THOẠI THUYẾT TRÌNH 2 PHÚT (18 SLIDE · ≤ 50 TỪ / SLIDE)',
            include_toc=False,
        )
        try:
            shutil.copy2(saved_2min, OUT_2MIN_PRINT)
        except PermissionError:
            pass

    # Copy HTML playbook to docs/startup/print/ with adjusted relative links
    html_text = HTML_SRC.read_text(encoding='utf-8')
    html_print = (
        html_text
        .replace('href="../web/', 'href="../../../web/')
        .replace('href="index.html', 'href="../../../presentation/index.html')
        .replace('href="Kich-ban-thuyet-trinh-DrgX.docx"', 'href="kich-ban-thuyet-trinh.docx"')
    )
    HTML_DST.parent.mkdir(parents=True, exist_ok=True)
    HTML_DST.write_text(html_print, encoding='utf-8')

    # Export PDF copies via WPS / Word COM if available
    import subprocess
    out_pdf_1 = OUT_DOCX_1.with_suffix('.pdf').resolve()
    out_pdf_2 = OUT_DOCX_2.with_suffix('.pdf').resolve()
    out_2min_pdf = OUT_2MIN_DOCX.with_suffix('.pdf').resolve()
    out_2min_print_pdf = OUT_2MIN_PRINT.with_suffix('.pdf').resolve()
    ps_cmd = "\n".join([
        "$ErrorActionPreference = 'Stop'",
        "$app = $null",
        "foreach ($prog in @('Kwps.Application', 'Word.Application', 'KWPS.Application')) {",
        "  try { $app = New-Object -ComObject $prog; break } catch {}",
        "}",
        "if (-not $app) { exit 2 }",
        "try {",
        "  $app.Visible = $false",
        f"  $doc = $app.Documents.Open('{saved_1.resolve()}', $false, $true)",
        f"  try {{ $doc.ExportAsFixedFormat('{out_pdf_1}', 17) }} catch {{ $doc.ExportPdf('{out_pdf_1}') }}",
        "  $doc.Close($false)",
        f"  if (Test-Path '{saved_2min.resolve()}') {{",
        f"    $doc2 = $app.Documents.Open('{saved_2min.resolve()}', $false, $true)",
        f"    try {{ $doc2.ExportAsFixedFormat('{out_2min_pdf}', 17) }} catch {{ $doc2.ExportPdf('{out_2min_pdf}') }}",
        "    $doc2.Close($false)",
        "  }",
        "} finally {",
        "  $app.Quit()",
        "}",
    ])
    subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=False, timeout=90, capture_output=True)
    if out_pdf_1.exists():
        shutil.copy2(out_pdf_1, out_pdf_2)
    if out_2min_pdf.exists():
        shutil.copy2(out_2min_pdf, out_2min_print_pdf)

    print(f'OK: {OUT_DOCX_1} ({OUT_DOCX_1.stat().st_size} bytes)')
    print(f'OK: {OUT_DOCX_2} ({OUT_DOCX_2.stat().st_size} bytes)')
    if OUT_2MIN_DOCX.exists():
        print(f'OK: {OUT_2MIN_DOCX} ({OUT_2MIN_DOCX.stat().st_size} bytes)')
    if out_pdf_1.exists():
        print(f'OK: {out_pdf_1} ({out_pdf_1.stat().st_size} bytes)')
        print(f'OK: {out_pdf_2} ({out_pdf_2.stat().st_size} bytes)')
    if out_2min_pdf.exists():
        print(f'OK: {out_2min_pdf} ({out_2min_pdf.stat().st_size} bytes)')
    print(f'OK: {HTML_DST} ({HTML_DST.stat().st_size} bytes)')


if __name__ == '__main__':
    main()

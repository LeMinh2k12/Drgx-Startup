# -*- coding: utf-8 -*-
"""Sinh bộ hồ sơ dự thi DrgX IDE: Markdown, HTML in A4, DOCX chuẩn 100% theo PDF Kế hoạch.

Chạy:  python -X utf8 scripts/build_startup_docs.py
"""
from __future__ import annotations

import csv
import html
import re
import shutil
import subprocess
from pathlib import Path

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

import startup_content as C

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "startup"
PRINT = OUT / "print"
ASSETS = OUT / "assets"
PITCH = OUT / "pitch"
for d in (OUT, PRINT, ASSETS, PITCH):
    d.mkdir(parents=True, exist_ok=True)

BLACK = RGBColor(0x00, 0x00, 0x00)

TOKEN_RE = re.compile(r"(\*\*.+?\*\*|\[\[.+?\]\]|(?<![*\w])\*(?!\s)[^*\n]+?\*(?![*\w]))")
MATH_RE = re.compile(r"\$([^$\n]+)\$")


def plain(text: str) -> str:
    """Bản in/Word không hiển thị Markdown: bỏ dấu ` và ký hiệu toán $...$ (chỉ giữ nội dung)."""
    return MATH_RE.sub(r"\1", text).replace("`", "")


def rich_parts(text: str):
    """Tách **đậm**, *nghiêng* và [[chỗ cần điền]] thành các đoạn có kiểu."""
    out = []
    for piece in TOKEN_RE.split(text):
        if not piece:
            continue
        if piece.startswith("**") and piece.endswith("**") and len(piece) > 4:
            out.append(("b", plain(piece[2:-2])))
        elif piece.startswith("[[") and piece.endswith("]]"):
            out.append(("fill", piece))
        elif piece.startswith("*") and piece.endswith("*") and len(piece) > 2:
            out.append(("i", plain(piece[1:-1])))
        else:
            out.append(("t", plain(piece)))
    return out


def md_escape(text: str) -> str:
    return text.replace("|", "\\|")


# ---------------------------------------------------------------------------
# MARKDOWN
# ---------------------------------------------------------------------------
def render_markdown() -> str:
    lines = []
    lines.append(f"# {C.META['title']}\n")
    lines.append(f"> **Cuộc thi:** {C.COVER['competition']}\n")
    lines.append(f"> **Tên dự án:** {C.COVER['project']}\n")
    lines.append(f"> **Thuộc lĩnh vực:** {C.COVER['field']}\n")
    lines.append(f"> **{C.COVER['team_heading']}:** {C.COVER['team']}  \n> **{C.COVER['unit']}**  \n> *{C.COVER['place_date']}*\n")
    lines.append("> **Quy cách trình bày:** Tiếng Việt, khổ A4, cỡ chữ 14, phông chữ Times New Roman theo đúng Phụ lục 03 và Phụ lục 04 (Kế hoạch số 153/KH-SGDĐT ngày 25/9/2026).\n")
    lines.append("\n---\n")

    for kind, data in C.BLOCKS:
        if kind == "h1":
            lines.append(f"\n# {data}\n")
        elif kind == "h2":
            lines.append(f"\n## {data}\n")
        elif kind == "h3":
            lines.append(f"\n### {data}\n")
        elif kind == "p":
            lines.append(f"\n{data.replace(chr(9), ' — ')}\n")
        elif kind in ("ul", "dash"):
            lines.append("")
            for item in data:
                lines.append(f"- {item}")
            lines.append("")
        elif kind == "ol":
            lines.append("")
            for i, item in enumerate(data, 1):
                lines.append(f"{i}. {item}")
            lines.append("")
        elif kind == "quote":
            lines.append(f"\n> {data}\n")
        elif kind == "note":
            lines.append(f"\n> **Lưu ý:** {data}\n")
        elif kind == "table":
            headers = data["headers"]
            rows = data["rows"]
            lines.append("")
            lines.append("| " + " | ".join(md_escape(h) for h in headers) + " |")
            lines.append("|" + "|".join(["---"] * len(headers)) + "|")
            for row in rows:
                lines.append("| " + " | ".join(md_escape(str(c)) for c in row) + " |")
            if data.get("caption"):
                lines.append(f"\n*{data['caption']}*")
            lines.append("")
        elif kind == "bmc":
            bmc_labels = [
                ("partners", "ĐỐI TÁC CHÍNH"),
                ("activities", "HOẠT ĐỘNG CHÍNH"),
                ("value", "GIẢI PHÁP GIÁ TRỊ"),
                ("relations", "QUAN HỆ KHÁCH HÀNG"),
                ("segments", "PHÂN KHÚC KHÁCH HÀNG"),
                ("resources", "TÀI NGUYÊN CHÍNH"),
                ("channels", "CÁC KÊNH THÔNG TIN VÀ KÊNH PHÂN PHỐI"),
                ("costs", "CẤU TRÚC CHI PHÍ"),
                ("revenues", "DÒNG DOANH THU"),
            ]
            lines.append("")
            for key, label in bmc_labels:
                lines.append(f"**{label}**")
                for item in data[key]:
                    lines.append(f"- {item}")
                lines.append("")
        elif kind == "fig":
            lines.append(f"\n**{data['title']}**\n")
            for r in data["rows"]:
                lines.append("| " + " | ".join(md_escape(str(c).replace("\n", " <br> ")) for c in r) + " |")
            if data.get("caption"):
                lines.append(f"\n*{data['caption']}*\n")
        elif kind == "pagebreak":
            lines.append("\n<div style=\"page-break-after: always\"></div>\n")
    return "\n".join(lines).strip() + "\n"


# ---------------------------------------------------------------------------
# HTML (Chuẩn in A4, Times New Roman 14pt, đúng mẫu PDF Kế hoạch)
# ---------------------------------------------------------------------------
def html_inline(text: str) -> str:
    out = []
    for kind, val in rich_parts(text):
        escaped = html.escape(val).replace("\t", "&emsp;&emsp;")
        if kind == "b":
            out.append(f"<strong>{escaped}</strong>")
        elif kind == "i":
            out.append(f"<em>{escaped}</em>")
        elif kind == "fill":
            out.append(f'<span class="fill">{escaped}</span>')
        else:
            out.append(escaped.replace("\n", "<br>"))
    return "".join(out)


def render_html() -> str:
    cover = C.COVER
    parts = []
    parts.append(f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(C.META['title'])}</title>
<style>
@page {{ size: A4 portrait; margin: 20mm 20mm 20mm 30mm; }}
* {{ box-sizing: border-box; }}
html {{ background: #e5e7eb; }}
body {{
  font-family: "Times New Roman", Times, serif;
  font-size: 14pt; line-height: 1.45; color: #000;
  width: 210mm; margin: 0 auto; padding: 20mm 20mm 20mm 30mm; background: #fff;
  box-shadow: 0 0 18px rgba(0,0,0,.14);
}}
.screen-bar {{
  position: sticky; top: 0; z-index: 10; margin: -20mm -20mm 14mm -30mm;
  padding: 10px 20mm; background: #111827; color: #fff;
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  font-family: "Times New Roman", serif; font-size: 12pt;
}}
.screen-bar button {{
  margin-left: auto; border: 1px solid #fff; border-radius: 4px; padding: 6px 14px;
  background: #fff; color: #000; font-weight: 700; cursor: pointer;
  font-family: inherit; font-size: 11pt;
}}
h1 {{ font-size: 14pt; font-weight: 700; color: #000; margin: 12pt 0 6pt; page-break-after: avoid; }}
h2 {{ font-size: 14pt; font-weight: 700; color: #000; margin: 10pt 0 6pt; page-break-after: avoid; }}
h3 {{ font-size: 14pt; font-weight: 700; font-style: italic; color: #000; margin: 10pt 0 5pt; page-break-after: avoid; }}
p {{ margin: 0 0 6pt; text-align: justify; }}
p.dash-item {{ text-indent: 10mm; margin: 0 0 6pt; text-align: justify; }}
ol {{ margin: 2pt 0 8pt 0; padding-left: 22pt; }}
li {{ margin-bottom: 4pt; text-align: justify; }}
strong {{ color: #000; }}
.fill {{ background: #fff3a3; padding: 0 2px; }}
table {{
  width: 100%; border-collapse: collapse; margin: 6pt 0 10pt;
  font-size: 12pt; line-height: 1.3; page-break-inside: auto;
}}
tr {{ page-break-inside: avoid; }}
th, td {{ border: 0.75pt solid #000; padding: 4pt 6pt; vertical-align: top; color: #000; }}
th {{ font-weight: 700; text-align: center; background: #fff; }}
.caption {{ font-size: 12pt; font-style: italic; text-align: center; margin: -4pt 0 8pt; }}
.note {{
  padding: 4pt 0; margin: 6pt 0; font-size: 14pt; font-style: italic;
  text-indent: 10mm; text-align: justify;
}}
.pagebreak {{ page-break-before: always; height: 0; }}
.cover-box {{
  border: 1pt solid #000; min-height: 245mm; padding: 22mm 14mm 18mm;
  display: flex; flex-direction: column; align-items: center; text-align: center;
  page-break-after: always;
}}
.cover-box .comp {{ font-size: 14pt; font-weight: 700; line-height: 1.45; }}
.cover-box .proj-block {{ margin-top: 26mm; font-size: 14pt; line-height: 1.6; text-align: center; }}
.cover-box .team-block {{ margin-top: 24mm; font-size: 14pt; line-height: 1.6; text-align: center; }}
.cover-box .place {{ margin-top: auto; font-size: 14pt; padding-top: 24mm; }}
.bmc {{
  display: grid; grid-template-columns: repeat(5, 1fr);
  border: 0.75pt solid #000; margin: 6pt 0 12pt; font-size: 11pt; line-height: 1.3;
}}
.bmc > div {{ border: 0.5pt solid #000; padding: 5pt 6pt; background: #fff; }}
.bmc h4 {{ margin: 0 0 4pt; font-size: 11.5pt; font-weight: 700; text-align: center; text-transform: uppercase; }}
.bmc p {{ margin: 0 0 3pt; text-align: left; font-size: 10.5pt; }}
.bmc .partners {{ grid-area: 1 / 1 / 3 / 2; }}
.bmc .activities {{ grid-area: 1 / 2 / 2 / 3; }}
.bmc .value {{ grid-area: 1 / 3 / 3 / 4; }}
.bmc .relations {{ grid-area: 1 / 4 / 2 / 5; }}
.bmc .segments {{ grid-area: 1 / 5 / 3 / 6; }}
.bmc .resources {{ grid-area: 2 / 2 / 3 / 3; }}
.bmc .channels {{ grid-area: 2 / 4 / 3 / 5; }}
.bmc .costs {{ grid-area: 3 / 1 / 4 / 4; }}
.bmc .revenues {{ grid-area: 3 / 4 / 4 / 6; }}
@media print {{
  html {{ background: #fff; }}
  body {{ width: auto; margin: 0; padding: 0; box-shadow: none; }}
  .screen-bar {{ display: none; }}
}}
</style>
</head>
<body>
<div class="screen-bar">
  <b>HỒ SƠ DỰ THI KHỞI NGHIỆP — DrgX</b>
  <span>Chuẩn thể thức Phụ lục 03 &amp; 04 (A4 · Times New Roman · Cỡ chữ 14)</span>
  <button onclick="window.print()">In / Lưu PDF</button>
</div>
<section class="cover-box">
  <div class="comp">
    {html.escape(cover['competition_line1'])}<br>
    {html.escape(cover['competition_line2'])}<br>
    {html.escape(cover['competition_line3'])}
  </div>
  <div class="proj-block">
    <strong>Tên dự án:</strong> {html.escape(cover['project'])}<br>
    <strong>Thuộc lĩnh vực:</strong> {html.escape(cover['field'])}
  </div>
  <div class="team-block">
    <strong>{html.escape(cover['team_heading'])}</strong><br>
    {html_inline(cover['team'])}<br>
    <strong>{html_inline(cover['unit'])}</strong>
  </div>
  <div class="place">{html.escape(cover['place_date'])}</div>
</section>
""")

    for kind, data in C.BLOCKS:
        if kind == "h1":
            parts.append(f"<h1>{html_inline(data)}</h1>")
        elif kind == "h2":
            parts.append(f"<h2>{html_inline(data)}</h2>")
        elif kind == "h3":
            parts.append(f"<h3>{html_inline(data)}</h3>")
        elif kind == "p":
            parts.append(f"<p>{html_inline(data)}</p>")
        elif kind in ("ul", "dash"):
            for x in data:
                parts.append(f'<p class="dash-item">- {html_inline(x)}</p>')
        elif kind == "ol":
            parts.append("<ol>" + "".join(f"<li>{html_inline(x)}</li>" for x in data) + "</ol>")
        elif kind == "quote":
            parts.append(f'<p class="note">“{html_inline(data)}”</p>')
        elif kind == "note":
            parts.append(f'<p class="note"><strong>Lưu ý:</strong> {html_inline(data)}</p>')
        elif kind == "table":
            t = data
            out = ["<table>"]
            out.append("<thead><tr>" + "".join(f"<th>{html_inline(str(h))}</th>" for h in t["headers"]) + "</tr></thead><tbody>")
            for row in t["rows"]:
                out.append("<tr>" + "".join(f"<td>{html_inline(str(c))}</td>" for c in row) + "</tr>")
            out.append("</tbody></table>")
            if t.get("caption"):
                out.append(f'<div class="caption">{html_inline(t["caption"])}</div>')
            parts.append("".join(out))
        elif kind == "bmc":
            labels = [
                ("partners", "ĐỐI TÁC CHÍNH"),
                ("activities", "HOẠT ĐỘNG CHÍNH"),
                ("value", "GIẢI PHÁP GIÁ TRỊ"),
                ("relations", "QUAN HỆ KHÁCH HÀNG"),
                ("segments", "PHÂN KHÚC KHÁCH HÀNG"),
                ("resources", "TÀI NGUYÊN CHÍNH"),
                ("channels", "CÁC KÊNH THÔNG TIN VÀ KÊNH PHÂN PHỐI"),
                ("costs", "CẤU TRÚC CHI PHÍ"),
                ("revenues", "DÒNG DOANH THU"),
            ]
            out = ['<div class="bmc">']
            for key, label in labels:
                items = "".join(f"<p>- {html_inline(x)}</p>" for x in data[key])
                out.append(f'<div class="{key}"><h4>{label}</h4>{items}</div>')
            out.append("</div>")
            parts.append("".join(out))
        elif kind == "fig":
            out = ['<table style="border:1pt solid #000;margin:6pt 0 4pt">']
            ncols = max(len(r) for r in data["rows"])
            out.append(f'<thead><tr><th colspan="{ncols}" style="background:#f3f4f6;font-size:11pt;letter-spacing:.03em">{html_inline(data["title"])}</th></tr></thead><tbody>')
            for row in data["rows"]:
                out.append("<tr>" + "".join(f'<td style="font-size:10.5pt;line-height:1.28">{html_inline(str(c))}</td>' for c in row) + "</tr>")
            out.append("</tbody></table>")
            if data.get("caption"):
                out.append(f'<div class="caption">{html_inline(data["caption"])}</div>')
            parts.append("".join(out))
        elif kind == "pagebreak":
            parts.append('<div class="pagebreak"></div>')

    parts.append("</body></html>")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# DOCX helpers (100% Times New Roman, 14pt, đúng thể thức PDF Kế hoạch)
# ---------------------------------------------------------------------------
def force_times_new_roman(rpr):
    """Gỡ bỏ toàn bộ thuộc tính theme font (Calibri) của Word và ép cứng Times New Roman."""
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for theme_attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        if rfonts.get(qn(theme_attr)) is not None:
            del rfonts.attrib[qn(theme_attr)]
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rfonts.set(qn(attr), "Times New Roman")


def set_run_font(run, size=14, bold=None, italic=None, color=BLACK, underline=False):
    run.font.name = "Times New Roman"
    rpr = run._element.get_or_add_rPr()
    force_times_new_roman(rpr)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    if color is not None:
        run.font.color.rgb = color
    if underline:
        run.underline = True


def add_rich(par, text, size=14, bold=False, italic=False, color=BLACK):
    for kind, val in rich_parts(str(text)):
        r = par.add_run(val)
        set_run_font(
            r,
            size=size,
            bold=(bold or kind == "b"),
            italic=(italic or kind == "i"),
            color=color,
        )
        if kind == "fill":
            from docx.enum.text import WD_COLOR_INDEX
            r.font.highlight_color = WD_COLOR_INDEX.YELLOW
    return par


def set_cell_margins(cell, top=60, bottom=60, left=90, right=90):
    tc_pr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement("w:tcMar")
    for tag, val in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        node = OxmlElement(f"w:{tag}")
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        mar.append(node)
    tc_pr.append(mar)


def set_table_borders(table, val="single", sz="6", color="000000"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    else:
        borders.clear()
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b = OxmlElement(f"w:{edge}")
        b.set(qn("w:val"), val)
        if val != "none":
            b.set(qn("w:sz"), str(sz))
            b.set(qn("w:space"), "0")
            b.set(qn("w:color"), color)
        borders.append(b)


def set_fixed_table_layout(table, total_width_cm: float):
    tbl_pr = table._tbl.tblPr
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tbl_pr.append(layout)
    tbl_w = tbl_pr.find(qn("w:tblW"))
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:type"), "dxa")
    tbl_w.set(qn("w:w"), str(int(round(total_width_cm * 567))))


def add_top_page_number(section):
    """Không để số trang ở lề trên đầu mỗi trang để bố cục tài liệu sạch sẽ."""
    header = section.header
    p = header.paragraphs[0]
    p.text = ""


def setup_document() -> Document:
    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(3.0)
    section.right_margin = Cm(2.0)
    section.header_distance = Cm(1.0)
    section.footer_distance = Cm(1.0)
    section.different_first_page_header_footer = True

    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(14)
    style.font.color.rgb = BLACK
    force_times_new_roman(style.element.get_or_add_rPr())
    pf = style.paragraph_format
    pf.line_spacing = 1.3
    pf.space_after = Pt(4)
    pf.space_before = Pt(0)

    for name, italic in (
        ("Heading 1", False),
        ("Heading 2", False),
        ("Heading 3", True),
    ):
        st = doc.styles[name]
        st.font.name = "Times New Roman"
        st.font.size = Pt(14)
        st.font.bold = True
        st.font.italic = italic
        st.font.color.rgb = BLACK
        force_times_new_roman(st.element.get_or_add_rPr())
        st.paragraph_format.keep_with_next = True
        st.paragraph_format.space_before = Pt(8)
        st.paragraph_format.space_after = Pt(4)
        st.paragraph_format.line_spacing = 1.3

    add_top_page_number(section)
    return doc


def docx_cover(doc: Document):
    """Trang bìa đóng khung viền chữ nhật đúng 100% mẫu Phụ lục 03 (Trang 9 PDF)."""
    c = C.COVER
    box = doc.add_table(rows=1, cols=1)
    box.alignment = WD_TABLE_ALIGNMENT.CENTER
    box.autofit = False
    set_fixed_table_layout(box, 16.0)
    set_table_borders(box, val="single", sz="10", color="000000")

    row = box.rows[0]
    tr_pr = row._tr.get_or_add_trPr()
    tr_height = OxmlElement("w:trHeight")
    tr_height.set(qn("w:val"), str(int(24.5 * 567)))
    tr_height.set(qn("w:hRule"), "atLeast")
    tr_pr.append(tr_height)

    cell = row.cells[0]
    cell.width = Cm(16.0)
    set_cell_margins(cell, top=560, bottom=420, left=280, right=280)
    cell.text = ""

    def add_box_line(text="", bold=False, italic=False, align=WD_ALIGN_PARAGRAPH.CENTER, before=0, after=4):
        p = cell. paragraphs[0] if len(cell.paragraphs) == 1 and cell.paragraphs[0].text == "" and not cell.paragraphs[0].runs else cell.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_before = Pt(before)
        p.paragraph_format.space_after = Pt(after)
        p.paragraph_format.line_spacing = 1.35
        if text:
            add_rich(p, text, size=14, bold=bold, italic=italic, color=BLACK)
        return p

    add_box_line(c["competition_line1"], bold=True, before=12, after=2)
    add_box_line(c["competition_line2"], bold=True, before=0, after=2)
    add_box_line(c["competition_line3"], bold=True, before=0, after=42)

    add_box_line(f"**Tên dự án:** {c['project']}", bold=False, before=24, after=8)
    add_box_line(f"**Thuộc lĩnh vực:** {c['field']}", bold=False, before=0, after=48)

    add_box_line(c["team_heading"], bold=True, before=24, after=6)
    add_box_line(c["team"], bold=False, before=0, after=8)
    add_box_line(f"**{c['unit']}**", bold=False, before=0, after=90)

    add_box_line(c["place_date"], bold=False, italic=False, before=60, after=6)

    doc.add_page_break()


def docx_table(doc: Document, t):
    headers = t["headers"]
    rows = t["rows"]
    font = t.get("font", 12)
    is_large = len(rows) > 12
    is_compact = bool(t.get("compact")) or is_large
    top_pad = 24 if is_compact else 42
    bot_pad = 24 if is_compact else 42
    line_sp = 1.04 if is_compact else 1.13
    usable_w = 16.0
    widths = t.get("widths")
    if widths:
        total = sum(widths)
        widths = [w * usable_w / total for w in widths]
    else:
        widths = [usable_w / len(headers)] * len(headers)

    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_fixed_table_layout(table, usable_w)
    set_table_borders(table, val="single", sz="6", color="000000")

    for i, w in enumerate(widths):
        table.columns[i].width = Cm(w)

    hdr = table.rows[0]
    tr_pr = hdr._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tr_pr.append(tbl_header)
    for i, h in enumerate(headers):
        cell = hdr.cells[i]
        cell.text = ""
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(1.5)
        p.paragraph_format.space_after = Pt(1.5)
        p.paragraph_format.line_spacing = line_sp
        p.paragraph_format.keep_with_next = True
        add_rich(p, str(h), size=font, bold=True, color=BLACK)
        set_cell_margins(cell, top=top_pad + 6, bottom=bot_pad + 6, left=65, right=65)
        cell.width = Cm(widths[i])

    has_caption = bool(t.get("caption"))
    for r_idx, row in enumerate(rows):
        cells = table.add_row().cells
        is_last_row = (r_idx == len(rows) - 1)
        # Với bảng vừa và nhỏ (<= 12 dòng), khóa toàn bộ các dòng với nhau để tuyệt đối không bị cắt lẻ 1 dòng qua trang
        if not is_large:
            keep_row_next = (not is_last_row) or has_caption
        else:
            keep_row_next = (r_idx in (0, len(rows) - 2)) or (is_last_row and has_caption)
        for i, val in enumerate(row):
            cell = cells[i]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if widths[i] <= 1.8 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(1.5)
            p.paragraph_format.space_after = Pt(1.5)
            p.paragraph_format.line_spacing = line_sp
            if keep_row_next:
                p.paragraph_format.keep_with_next = True
            add_rich(p, str(val), size=font, color=BLACK)
            set_cell_margins(cell, top=top_pad, bottom=bot_pad, left=65, right=65)
            cell.width = Cm(widths[i])

    for row in table.rows:
        tr_pr = row._tr.get_or_add_trPr()
        tr_pr.append(OxmlElement("w:cantSplit"))

    if has_caption:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(6)
        add_rich(p, t["caption"], size=12, italic=True, color=BLACK)
    else:
        doc.add_paragraph().paragraph_format.space_after = Pt(2)


def docx_fig(doc: Document, data):
    """Vẽ sơ đồ khối kiến trúc học thuật (Hình 1, Hình 2) đóng khung chuẩn Times New Roman."""
    rows = data["rows"]
    ncols = max(len(r) for r in rows)
    font = data.get("font", 10.5)
    usable_w = 16.0
    widths = data.get("widths")
    if widths:
        total = sum(widths)
        widths = [w * usable_w / total for w in widths]
    else:
        widths = [usable_w / ncols] * ncols

    table = doc.add_table(rows=1 + len(rows), cols=ncols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_fixed_table_layout(table, usable_w)
    set_table_borders(table, val="single", sz="8", color="000000")

    for i, w in enumerate(widths):
        table.columns[i].width = Cm(w)

    # Hàng tiêu đề sơ đồ khối (gộp toàn bộ các cột)
    hdr_cell = table.cell(0, 0)
    if ncols > 1:
        hdr_cell.merge(table.cell(0, ncols - 1))
    hdr_cell.width = Cm(usable_w)
    hdr_cell.text = ""
    set_cell_margins(hdr_cell, top=45, bottom=45, left=80, right=80)
    p_hdr = hdr_cell.paragraphs[0]
    p_hdr.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_hdr.paragraph_format.space_before = Pt(1.5)
    p_hdr.paragraph_format.space_after = Pt(1.5)
    p_hdr.paragraph_format.line_spacing = 1.1
    p_hdr.paragraph_format.keep_with_next = True
    add_rich(p_hdr, f"**{data['title']}**", size=font + 0.5, bold=True, color=BLACK)

    for r_idx, row in enumerate(rows):
        cells = table.rows[1 + r_idx].cells
        for c_idx, val in enumerate(row):
            cell = cells[c_idx]
            cell.width = Cm(widths[c_idx])
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            cell.text = ""
            set_cell_margins(cell, top=45, bottom=45, left=75, right=75)
            lines = str(val).split("\n")
            is_center_col = (ncols == 3 and c_idx == 1)
            for l_idx, ln in enumerate(lines):
                p = cell.paragraphs[0] if l_idx == 0 else cell.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if (is_center_col or l_idx == 0) else WD_ALIGN_PARAGRAPH.LEFT
                p.paragraph_format.space_before = Pt(0.5)
                p.paragraph_format.space_after = Pt(1)
                p.paragraph_format.line_spacing = 1.1
                p.paragraph_format.keep_with_next = True
                add_rich(p, ln, size=font, color=BLACK)

    for row in table.rows:
        tr_pr = row._tr.get_or_add_trPr()
        tr_pr.append(OxmlElement("w:cantSplit"))

    if data.get("caption"):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(6)
        add_rich(p, data["caption"], size=12, italic=True, color=BLACK)


def docx_bmc(doc: Document, data):
    """Bảng Business Model Canvas 9 ô đúng 100% bố cục và tiêu đề Phụ lục 04 (Trang 10 PDF)."""
    labels = [
        ("partners", "ĐỐI TÁC CHÍNH", 0, 0, 3.2),
        ("activities", "HOẠT ĐỘNG CHÍNH", 0, 1, 3.2),
        ("value", "GIẢI PHÁP GIÁ TRỊ", 0, 2, 3.2),
        ("relations", "QUAN HỆ KHÁCH HÀNG", 0, 3, 3.2),
        ("segments", "PHÂN KHÚC KHÁCH HÀNG", 0, 4, 3.2),
        ("resources", "TÀI NGUYÊN CHÍNH", 1, 1, 3.2),
        ("channels", "CÁC KÊNH THÔNG TIN VÀ KÊNH PHÂN PHỐI", 1, 3, 3.2),
        ("costs", "CẤU TRÚC CHI PHÍ", 2, 0, 9.6),
        ("revenues", "DÒNG DOANH THU", 2, 3, 6.4),
    ]
    usable_w = 16.0
    col_w = usable_w / 5.0
    table = doc.add_table(rows=3, cols=5)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_fixed_table_layout(table, usable_w)
    set_table_borders(table, val="single", sz="6", color="000000")

    for i in range(5):
        table.columns[i].width = Cm(col_w)

    # Gộp ô theo đúng sơ đồ BMC tại Trang 10 PDF
    table.cell(0, 0).merge(table.cell(1, 0))
    table.cell(0, 2).merge(table.cell(1, 2))
    table.cell(0, 4).merge(table.cell(1, 4))
    table.cell(2, 0).merge(table.cell(2, 2))
    table.cell(2, 3).merge(table.cell(2, 4))

    for key, label, r, c, w_cm in labels:
        cell = table.cell(r, c)
        cell.width = Cm(w_cm)
        cell.text = ""
        set_cell_margins(cell, top=25, bottom=25, left=45, right=45)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(1.5)
        p.paragraph_format.line_spacing = 1.05
        run = p.add_run(label)
        set_run_font(run, size=10, bold=True, color=BLACK)
        for item in data[key]:
            p = cell.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.02
            add_rich(p, "- " + item, size=9.5, color=BLACK)

    for row in table.rows:
        tr_pr = row._tr.get_or_add_trPr()
        tr_pr.append(OxmlElement("w:cantSplit"))

    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def save_docx_safe(doc: Document, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        doc.save(str(path))
        return path
    except PermissionError:
        alt_path = path.with_name(path.stem + "-Updated" + path.suffix)
        doc.save(str(alt_path))
        print(f"WARN: {path.name} đang mở trong Word/WPS -> đã lưu bản mới tại {alt_path}")
        return alt_path


def render_docx() -> Path:
    doc = setup_document()
    doc.core_properties.title = C.META["title"]
    doc.core_properties.author = "Nhóm dự án DrgX"
    doc.core_properties.subject = "Hồ sơ dự thi Học sinh, sinh viên với ý tưởng khởi nghiệp tỉnh Phú Thọ năm học 2026-2027"
    docx_cover(doc)

    for kind, data in C.BLOCKS:
        if kind == "h1":
            p = doc.add_paragraph(style="Heading 1")
            p.paragraph_format.first_line_indent = Cm(0)
            add_rich(p, data, size=14, bold=True, color=BLACK)
        elif kind == "h2":
            p = doc.add_paragraph(style="Heading 2")
            p.paragraph_format.first_line_indent = Cm(0)
            add_rich(p, data, size=14, bold=True, color=BLACK)
        elif kind == "h3":
            # Trong Phụ lục 04 (Trang 10-11 PDF), các mục 1, 2, 3, 4, 5 được in đậm + nghiêng, thụt đầu dòng 1cm
            p = doc.add_paragraph(style="Heading 3")
            p.paragraph_format.first_line_indent = Cm(1.0)
            add_rich(p, data, size=14, bold=True, italic=True, color=BLACK)
        elif kind == "p":
            p = doc.add_paragraph()
            if "\t" in data:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.paragraph_format.tab_stops.add_tab_stop(Cm(9.5), WD_TAB_ALIGNMENT.LEFT)
            elif "……" in data:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                if not re.match(r"^(\*\*)?\d+\.", data.strip()):
                    p.paragraph_format.first_line_indent = Cm(1.0)
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
                if not re.match(r"^(\*\*)?\d+\.", data.strip()):
                    p.paragraph_format.first_line_indent = Cm(1.0)
            add_rich(p, data, size=14, color=BLACK)
        elif kind in ("ul", "dash"):
            for item in data:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
                p.paragraph_format.first_line_indent = Cm(1.0)
                add_rich(p, "- " + item, size=14, color=BLACK)
        elif kind == "ol":
            for i, item in enumerate(data, 1):
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
                p.paragraph_format.first_line_indent = Cm(1.0)
                add_rich(p, f"{i}. " + item, size=14, color=BLACK)
        elif kind == "quote":
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p.paragraph_format.first_line_indent = Cm(1.0)
            add_rich(p, "“" + data + "”", size=14, italic=True, color=BLACK)
        elif kind == "note":
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            p.paragraph_format.first_line_indent = Cm(1.0)
            r = p.add_run("Lưu ý: ")
            set_run_font(r, size=14, bold=True, italic=True, color=BLACK)
            add_rich(p, data, size=14, italic=True, color=BLACK)
        elif kind == "table":
            docx_table(doc, data)
        elif kind == "fig":
            docx_fig(doc, data)
        elif kind == "bmc":
            docx_bmc(doc, data)
        elif kind == "pagebreak":
            doc.add_page_break()

    path = PRINT / f"{C.META['slug']}.docx"
    return save_docx_safe(doc, path)


# ---------------------------------------------------------------------------
# MẪU BẢN ĐĂNG KÝ DỰ THI (Đúng 100% Trang 16 của PDF Kế hoạch)
# ---------------------------------------------------------------------------
def render_registration_docx() -> Path:
    doc = setup_document()
    section = doc.sections[0]
    section.different_first_page_header_footer = False
    section.header.is_linked_to_previous = False
    for p in section.header.paragraphs:
        p.text = ""
    section.footer.is_linked_to_previous = False
    for p in section.footer.paragraphs:
        p.text = ""
    doc.core_properties.title = "Bản đăng ký dự thi — Cuộc thi Học sinh, sinh viên với ý tưởng khởi nghiệp"

    # Quốc hiệu & Đơn vị dự thi (Bảng 2 cột ẩn viền đúng mẫu Trang 16 PDF)
    hdr_tbl = doc.add_table(rows=1, cols=2)
    hdr_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr_tbl.autofit = False
    set_fixed_table_layout(hdr_tbl, 16.0)
    set_table_borders(hdr_tbl, val="none")
    hdr_tbl.columns[0].width = Cm(6.0)
    hdr_tbl.columns[1].width = Cm(10.0)

    left, right = hdr_tbl.rows[0].cells
    left.width = Cm(6.0)
    right.width = Cm(10.0)
    set_cell_margins(left, top=10, bottom=10, left=20, right=20)
    set_cell_margins(right, top=10, bottom=10, left=20, right=20)
    left.text = ""
    right.text = ""

    p_l1 = left.paragraphs[0]
    p_l1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_l1.paragraph_format.space_after = Pt(1)
    p_l1.paragraph_format.line_spacing = 1.15
    add_rich(p_l1, "ĐƠN VỊ CHỦ QUẢN: …………", size=13, bold=False, color=BLACK)

    p_l2 = left.add_paragraph()
    p_l2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_l2.paragraph_format.space_after = Pt(4)
    p_l2.paragraph_format.line_spacing = 1.15
    r_dv = p_l2.add_run("ĐƠN VỊ: ……………………")
    set_run_font(r_dv, size=13, bold=True, color=BLACK, underline=True)

    p_r1 = right.paragraphs[0]
    p_r1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_r1.paragraph_format.space_after = Pt(1)
    p_r1.paragraph_format.line_spacing = 1.15
    add_rich(p_r1, "**CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**", size=13, bold=True, color=BLACK)

    p_r2 = right.add_paragraph()
    p_r2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_r2.paragraph_format.space_after = Pt(4)
    p_r2.paragraph_format.line_spacing = 1.15
    r_dl = p_r2.add_run("Độc lập - Tự do - Hạnh phúc")
    set_run_font(r_dl, size=14, bold=True, color=BLACK, underline=True)

    # Tiêu đề Bản đăng ký dự thi (Trang 16 PDF)
    p_t1 = doc.add_paragraph()
    p_t1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t1.paragraph_format.space_before = Pt(10)
    p_t1.paragraph_format.space_after = Pt(2)
    add_rich(p_t1, "**BẢN ĐĂNG KÝ DỰ THI**", size=14, bold=True, color=BLACK)

    p_t2 = doc.add_paragraph()
    p_t2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t2.paragraph_format.space_before = Pt(0)
    p_t2.paragraph_format.space_after = Pt(8)
    add_rich(p_t2, "**CUỘC THI “HỌC SINH, SINH VIÊN VỚI Ý TƯỞNG KHỞI NGHIỆP”**", size=14, bold=True, color=BLACK)

    # I. Thông tin đơn vị
    p_sec1 = doc.add_paragraph()
    p_sec1.paragraph_format.space_before = Pt(2)
    p_sec1.paragraph_format.space_after = Pt(2)
    add_rich(p_sec1, "**I. Thông tin đơn vị**", size=14, bold=True, color=BLACK)

    for line_text, is_sub in (
        ("1. Thông tin lãnh đạo phụ trách", True),
        ("Họ và tên: ……………………………………………………", False),
        ("Chức vụ: ………………………………………………………", False),
        ("SĐT: ……………………………………………………………", False),
        ("2. Thông tin cán bộ phụ trách", True),
        ("Họ và tên: ……………………………………………………", False),
        ("Chức vụ: ………………………………………………………", False),
        ("SĐT: ……………………………………………………………", False),
    ):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(1.5)
        p.paragraph_format.line_spacing = 1.15
        if not is_sub:
            p.paragraph_format.first_line_indent = Cm(1.27)
        add_rich(p, line_text, size=14, color=BLACK)

    # II. Thông tin dự án
    p_sec2 = doc.add_paragraph()
    p_sec2.paragraph_format.space_before = Pt(3)
    p_sec2.paragraph_format.space_after = Pt(3)
    add_rich(p_sec2, "**II. Thông tin dự án**", size=14, bold=True, color=BLACK)

    docx_table(doc, {
        "headers": ["STT", "Tên dự án", "Lĩnh vực", "Số thành viên", "Thông tin liên hệ"],
        "rows": [
            ["1", "DrgX — Hệ sinh thái lập trình Local-First và phòng thi LAN minh bạch", "01 — Công nghiệp, chế tạo, trí tuệ nhân tạo AI, STEM", "04", "Lê Tiến Dũng (Lớp 9A2)"],
            ["2", "", "", "", ""],
            ["", "", "", "", ""],
            ["", "", "", "", ""],
            ["", "", "", "", ""],
        ],
        "widths": [1.3, 5.7, 3.4, 2.3, 3.3],
        "font": 13,
    })

    # Lưu ý (Đúng từng chữ tại Trang 16 PDF)
    p_note = doc.add_paragraph()
    p_note.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    p_note.paragraph_format.first_line_indent = Cm(1.27)
    p_note.paragraph_format.space_before = Pt(4)
    p_note.paragraph_format.space_after = Pt(6)
    p_note.paragraph_format.line_spacing = 1.2
    add_rich(
        p_note,
        "*Lưu ý: Dự án tham dự là dự án đã được đơn vị lựa chọn tại cơ sở được sắp xếp theo thứ tự ưu tiên điểm từ cao xuống thấp theo đánh giá của đơn vị.*",
        size=14,
        italic=True,
        color=BLACK,
    )

    # Khối chữ ký Lãnh đạo đơn vị bên phải (Bảng 2 cột ẩn viền đúng mẫu Trang 16 PDF)
    sig_tbl = doc.add_table(rows=1, cols=2)
    sig_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    sig_tbl.autofit = False
    set_fixed_table_layout(sig_tbl, 16.0)
    set_table_borders(sig_tbl, val="none")
    sig_tbl.columns[0].width = Cm(7.5)
    sig_tbl.columns[1].width = Cm(8.5)

    s_left, s_right = sig_tbl.rows[0].cells
    s_left.width = Cm(7.5)
    s_right.width = Cm(8.5)
    s_left.text = ""
    s_right.text = ""

    p_date = s_right.paragraphs[0]
    p_date.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_date.paragraph_format.space_after = Pt(2)
    add_rich(p_date, "*…………….., ngày    tháng    năm 2026*", size=14, italic=True, color=BLACK)

    p_role = s_right.add_paragraph()
    p_role.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_role.paragraph_format.space_after = Pt(12)
    add_rich(p_role, "**Lãnh đạo đơn vị**", size=14, bold=True, color=BLACK)

    path = PRINT / "dang-ky-du-thi.docx"
    return save_docx_safe(doc, path)


# ---------------------------------------------------------------------------
# CSV tài chính
# ---------------------------------------------------------------------------
def render_financial_csv() -> Path:
    rows = [
        ["Khoản mục", "Năm 1 (2027)", "Năm 2 (2028)", "Năm 3 (2029)", "Ghi chú"],
        ["DOANH THU", "", "", "", ""],
        ["Gói Pro cá nhân (B2C)", 74.9, 718.8, 4194.0, "150 / 1.200 / 6.000 người; 499k / 599k / 699k đ/năm"],
        ["Giấy phép trường (B2B)", 120.0, 720.0, 3000.0, "8 / 40 / 150 trường; 15 / 18 / 20 triệu đ/năm"],
        ["Dịch vụ & đào tạo", 50.0, 150.0, 400.0, "Đào tạo giáo viên, tổ chức contest, tùy biến"],
        ["Tổng doanh thu", 244.9, 1588.8, 7594.0, "Đơn vị: triệu đồng"],
        ["CHI PHÍ", "", "", "", ""],
        ["Nhân sự / đội ngũ", 120.0, 480.0, 1500.0, "R&D, phát triển học liệu"],
        ["Hạ tầng, AI, vận hành", 45.0, 160.0, 600.0, "VPS, CDN, AI Gateway, backup"],
        ["Marketing & cộng đồng", 55.0, 220.0, 800.0, "Pilot trường học, Mini-Contest, nội dung"],
        ["Pháp lý, kế toán, SHTT", 25.0, 40.0, 100.0, "Đăng ký bản quyền, kế toán"],
        ["Công cụ, sự kiện, đi lại", 40.0, 90.0, 300.0, "Hội thảo cụm trường, đi lại pilot"],
        ["Dự phòng", 30.0, 80.0, 200.0, "Quỹ dự phòng rủi ro"],
        ["Tổng chi phí", 315.0, 1070.0, 3500.0, "Đơn vị: triệu đồng"],
        ["Lợi nhuận sau chi phí", -70.1, 518.8, 4094.0, "Biên lợi nhuận ròng Năm 3: 53.9%"],
        ["Lũy kế", -70.1, 448.7, 4542.7, "Hòa vốn Quý 3/2028"],
        ["", "", "", "", ""],
        ["UNIT ECONOMICS (KINH TẾ ĐƠN VỊ)", "Gói Pro (B2C)", "Gói School (B2B)", "Chuẩn ngành EdTech", "Ghi chú"],
        ["ARPU / ACV (đồng/năm)", 599000, 18000000, "", "Doanh thu trung bình mỗi khách hàng/năm"],
        ["Biên lợi nhuận gộp (%)", "85%", "82%", ">= 70%", "Nhờ kiến trúc xử lý cục bộ Local-First"],
        ["Vòng đời trung bình (năm)", 2.2, 3.5, ">= 2.0", "Theo chu kỳ học cấp THPT / hợp đồng trường"],
        ["LTV (đồng)", 1120000, 51660000, "", "LTV = ARPU * Biên LN gộp * Vòng đời"],
        ["CAC (đồng)", 180000, 6500000, "", "Chi phí thu hút 1 khách hàng trả phí"],
        ["Tỷ lệ LTV / CAC", "6.2x", "7.9x", ">= 3.0x", "Hiệu quả sử dụng vốn rất cao"],
        ["Thời gian thu hồi CAC (tháng)", "≈ 4.2", "< 5.3", "<= 12", "Thu hồi chi phí bán hàng ngay năm đầu"],
        ["", "", "", "", ""],
        ["PHÂN TÍCH ĐỘ NHẠY (NĂM 2 - 2028)", "Doanh thu (tr)", "Lợi nhuận (tr)", "Điểm hòa vốn", "Thời gian hoàn vốn (300tr)"],
        ["Kịch bản Thận trọng (-30% khách hàng)", 1112.2, 90.2, "Quý 4/2028", "> 24 tháng"],
        ["Kịch bản Cơ sở (Base Case)", 1588.8, 518.8, "Quý 3/2028", "18 - 20 tháng"],
        ["Kịch bản Tích cực (+25% khách hàng)", 1986.0, 876.0, "Quý 1/2028", "16 - 18 tháng"],
        ["Giả định độ nhạy", "Định phí giữ nguyên (910 tr)", "Chi phí hạ tầng-AI-vận hành (160 tr) co giãn theo doanh thu", "", "Lợi nhuận = Doanh thu - Chi phí"],
    ]
    path = OUT / "financial-model.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        for row in rows:
            w.writerow(row)
    return path


def render_registration_html() -> str:
    """Sinh bản HTML in A4 cho Bản đăng ký dự thi đúng 100% mẫu Trang 16 PDF."""
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Bản đăng ký dự thi — Cuộc thi Học sinh, sinh viên với ý tưởng khởi nghiệp</title>
<style>
@page {{ size: A4 portrait; margin: 20mm 20mm 20mm 30mm; }}
* {{ box-sizing: border-box; }}
body {{
  font-family: "Times New Roman", Times, serif;
  font-size: 14pt; line-height: 1.35; color: #000;
  margin: 0; padding: 0; background: #fff;
}}
.fill {{ background: #fff3a3; padding: 0 2px; }}
.hdr-grid {{
  width: 100%; border-collapse: collapse; margin-bottom: 14pt;
}}
.hdr-grid td {{ border: none; text-align: center; vertical-align: top; padding: 0; font-size: 13pt; line-height: 1.35; }}
.u-line {{ display: inline-block; border-bottom: 1pt solid #000; padding-bottom: 1pt; }}
.title {{ text-align: center; font-weight: 700; font-size: 14pt; line-height: 1.4; margin: 12pt 0 14pt; }}
.sec {{ font-weight: 700; font-size: 14pt; margin: 6pt 0 2pt; }}
.sub {{ font-size: 14pt; margin: 2pt 0; }}
.indent {{ font-size: 14pt; margin: 2pt 0; text-indent: 12.7mm; }}
table.proj {{ width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 13pt; }}
table.proj th, table.proj td {{ border: 0.75pt solid #000; padding: 5pt 6pt; vertical-align: middle; }}
table.proj th {{ font-weight: 700; text-align: center; }}
table.proj td.c {{ text-align: center; }}
.note {{ font-size: 14pt; font-style: italic; text-indent: 12.7mm; text-align: justify; margin: 8pt 0 12pt; }}
.sig-grid {{ width: 100%; border-collapse: collapse; margin-top: 8pt; }}
.sig-grid td {{ border: none; text-align: center; vertical-align: top; font-size: 14pt; }}
</style>
</head>
<body>
<table class="hdr-grid">
  <tr>
    <td style="width:42%">
      ĐƠN VỊ CHỦ QUẢN: …………………………<br>
      <strong class="u-line">ĐƠN VỊ: ………………………………</strong>
    </td>
    <td style="width:58%">
      <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br>
      <strong class="u-line">Độc lập - Tự do - Hạnh phúc</strong>
    </td>
  </tr>
</table>

<div class="title">
  BẢN ĐĂNG KÝ DỰ THI<br>
  CUỘC THI “HỌC SINH, SINH VIÊN VỚI Ý TƯỞNG KHỞI NGHIỆP”
</div>

<div class="sec">I. Thông tin đơn vị</div>
<div class="sub">1. Thông tin lãnh đạo phụ trách</div>
<div class="indent">Họ và tên: ………………………………………………………………………………………………</div>
<div class="indent">Chức vụ: …………………………………………………………………………………………………</div>
<div class="indent">SĐT: ………………………………………………………………………………………………………</div>
<div class="sub">2. Thông tin cán bộ phụ trách</div>
<div class="indent">Họ và tên: ………………………………………………………………………………………………</div>
<div class="indent">Chức vụ: …………………………………………………………………………………………………</div>
<div class="indent">SĐT: ………………………………………………………………………………………………………</div>

<div class="sec">II. Thông tin dự án</div>
<table class="proj">
  <thead>
    <tr>
      <th style="width:8%">STT</th>
      <th style="width:36%">Tên dự án</th>
      <th style="width:21%">Lĩnh vực</th>
      <th style="width:14%">Số<br>thành viên</th>
      <th style="width:21%">Thông tin<br>liên hệ</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="c">1</td>
      <td>DrgX — Hệ sinh thái lập trình Local-First tích hợp AI Agent, Online Judge C++17 và Phòng thi mạng LAN minh bạch</td>
      <td>01 — Công nghiệp, chế tạo, trí tuệ nhân tạo AI, STEM</td>
      <td class="c">04</td>
      <td>Lê Tiến Dũng (Lớp 9A2 — THCS Sông Lô)</td>
    </tr>
    <tr><td class="c">2</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    <tr><td class="c">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    <tr><td class="c">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
    <tr><td class="c">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
  </tbody>
</table>

<div class="note">
  Lưu ý: Dự án tham dự là dự án đã được đơn vị lựa chọn tại cơ sở được sắp xếp theo thứ tự ưu tiên điểm từ cao xuống thấp theo đánh giá của đơn vị.
</div>

<table class="sig-grid">
  <tr>
    <td style="width:45%"></td>
    <td style="width:55%">
      <em>…………….., ngày &nbsp;&nbsp;&nbsp;&nbsp; tháng &nbsp;&nbsp;&nbsp;&nbsp; năm 2026</em><br>
      <strong>Lãnh đạo đơn vị</strong>
    </td>
  </tr>
</table>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# BIÊN BẢN XÁC NHẬN TRIỂN KHAI THỬ NGHIỆM (PILOT) & KHẢO SÁT THỰC NGHIỆM
# ---------------------------------------------------------------------------
def render_pilot_docx() -> Path:
    """Sinh Biên bản xác nhận triển khai thử nghiệm (Pilot) & Tổng hợp khảo sát thực nghiệm chuẩn hành chính A4."""
    doc = setup_document()
    section = doc.sections[0]
    section.different_first_page_header_footer = False
    doc.core_properties.title = "Biên bản xác nhận triển khai thử nghiệm (Pilot) — Dự án Hệ sinh thái lập trình DrgX"

    # Quốc hiệu & Đơn vị phối hợp thử nghiệm
    hdr_tbl = doc.add_table(rows=1, cols=2)
    hdr_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr_tbl.autofit = False
    set_fixed_table_layout(hdr_tbl, 16.0)
    set_table_borders(hdr_tbl, val="none")
    hdr_tbl.columns[0].width = Cm(6.2)
    hdr_tbl.columns[1].width = Cm(9.8)

    left, right = hdr_tbl.rows[0].cells
    left.width = Cm(6.2)
    right.width = Cm(9.8)
    set_cell_margins(left, top=10, bottom=10, left=20, right=20)
    set_cell_margins(right, top=10, bottom=10, left=20, right=20)
    left.text = ""
    right.text = ""

    p_l1 = left.paragraphs[0]
    p_l1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_l1.paragraph_format.space_after = Pt(1)
    p_l1.paragraph_format.line_spacing = 1.15
    add_rich(p_l1, "SỞ GIÁO DỤC VÀ ĐÀO TẠO PHÚ THỌ", size=12.5, bold=False, color=BLACK)

    p_l2 = left.add_paragraph()
    p_l2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_l2.paragraph_format.space_after = Pt(2)
    p_l2.paragraph_format.line_spacing = 1.15
    r_dv = p_l2.add_run("ĐƠN VỊ: ……………………")
    set_run_font(r_dv, size=13, bold=True, color=BLACK, underline=True)

    p_r1 = right.paragraphs[0]
    p_r1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_r1.paragraph_format.space_after = Pt(1)
    p_r1.paragraph_format.line_spacing = 1.15
    add_rich(p_r1, "**CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**", size=13, bold=True, color=BLACK)

    p_r2 = right.add_paragraph()
    p_r2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_r2.paragraph_format.space_after = Pt(2)
    p_r2.paragraph_format.line_spacing = 1.15
    r_dl = p_r2.add_run("Độc lập - Tự do - Hạnh phúc")
    set_run_font(r_dl, size=14, bold=True, color=BLACK, underline=True)

    # Tiêu đề Biên bản
    p_t1 = doc.add_paragraph()
    p_t1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t1.paragraph_format.space_before = Pt(4)
    p_t1.paragraph_format.space_after = Pt(1)
    add_rich(p_t1, "**BIÊN BẢN XÁC NHẬN TRIỂN KHAI THỬ NGHIỆM (PILOT)**", size=14, bold=True, color=BLACK)

    p_t2 = doc.add_paragraph()
    p_t2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t2.paragraph_format.space_before = Pt(0)
    p_t2.paragraph_format.space_after = Pt(3)
    add_rich(p_t2, "**VÀ TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ DỰ ÁN “HỆ SINH THÁI LẬP TRÌNH DrgX”**", size=13.5, bold=True, color=BLACK)

    def add_sec_title(txt):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.keep_with_next = True
        add_rich(p, f"**{txt}**", size=13.5, bold=True, color=BLACK)
        return p

    def add_line(txt, indent_cm=0.8):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT if "……" in txt else WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.first_line_indent = Cm(indent_cm)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.line_spacing = 1.12
        add_rich(p, txt, size=13, color=BLACK)
        return p

    add_sec_title("I. Thời gian, địa điểm và thành phần tham gia")
    add_line("- Thời gian thử nghiệm: Từ ……/……/2026 đến ……/……/2026; Quy mô: …… máy trạm (…… HS, …… GV).")
    add_line("- Địa điểm triển khai: Phòng máy Tin học / CLB STEM — Trường: …………………………………………")
    add_line("- Đại diện Đơn vị / Tổ chuyên môn: ………………………… — Giáo viên giám sát: ……………………")
    add_line("- Đại diện Nhóm dự án khởi nghiệp DrgX: Lê Tiến Dũng (Lớp 9A2, THCS Sông Lô) — SĐT: …………………")

    add_sec_title("II. Nội dung triển khai thử nghiệm thực tế tại phòng máy")
    add_line("1. **Học tập có AI (DrgX Studio / Dev Studio):** Tự động bắt & sửa 25 mẫu lỗi C++17 bằng tiếng Việt; lộ trình **Learn Hub 12 tuần** (`Ctrl+Alt+L`).")
    add_line("2. **Luyện tập thuật toán (Void-bit OJ `:8080`):** Chấm thử 47 bài toán chuẩn HSG; săn phản ví dụ tự động bằng **Differential Stress Test 3 cột**.")
    add_line("3. **Kiểm tra thực hành qua mạng LAN (`:8765/dashboard`):** Mở **DrgX CP Studio** (cách ly AI chống gian lận), thu bài 40 máy, quét đạo văn **Winnowing** và xuất điểm CSV/A4.")
    add_line("4. **Mô hình hóa STEM Robotics & Vi điều khiển:** Mô phỏng Robot tự hành 8×8 (BFS, A*, Greedy) và điều khiển mạch **Arduino Uno / ESP32** (HC-SR04, L298N, xuất mã `.ino`).")

    add_sec_title("III. Kết quả đo kiểm kỹ thuật và khảo sát thực nghiệm")
    docx_table(doc, {
        "headers": ["TT", "Hạng mục đo kiểm kỹ thuật tại phòng máy", "Trước khi dùng DrgX", "Kết quả đo trên DrgX", "Đánh giá"],
        "rows": [
            ["1", "Thời gian thiết lập môi trường biên dịch & đề bài", "60 – 90 phút", "**< 60 giây** (1 lệnh / Web Lab)", "Đạt vượt mức"],
            ["2", "Tốc độ chấm đa testcase C++17/Python cục bộ (F9)", "15 – 45 giây/lần", "**< 0,5 giây/lần** (Offline 100%)", "Đạt vượt mức"],
            ["3", "Tự động phát hiện & sửa lỗi biên dịch/runtime C++17", "Báo lỗi tiếng Anh rời rạc", "**25/25 mẫu lỗi (36/36 test PASS)**", "Chính xác 100%"],
            ["4", "Chịu tải nộp bài đồng thời qua mạng LAN (`:8765`)", "Thu qua USB/LAN thủ công", "**40/40 máy AC đồng thời (< 17s)**", "Ổn định 100%"],
            ["5", "Quét đạo văn đổi tên biến toàn phòng (Winnowing)", "Kiểm tra thủ công bằng mắt", "**Bắt 100% cặp đổi biến (< 1s)**", "Minh bạch, khách quan"],
        ],
        "widths": [1.1, 5.5, 3.1, 3.5, 2.8],
        "font": 10.5,
        "compact": True,
        "caption": "Bảng 1: Kết quả đo kiểm kỹ thuật thực tế khi vận hành hệ sinh thái DrgX tại phòng máy.",
    })

    docx_table(doc, {
        "headers": ["TT", "Tiêu chí khảo sát ý kiến Học sinh & Giáo viên sau buổi học/thi thử", "Số phiếu khảo sát", "Tỷ lệ Đồng ý / Rất hài lòng", "Ghi chú thực tế"],
        "rows": [
            ["1", "Học sinh tự mở bài, biên dịch và chấm thử F9 thành công ngay trong 5 phút đầu", "…… / …… phiếu", "**…… %** (Mục tiêu ≥ 92%)", "Không cần cấu hình PATH"],
            ["2", "Thông báo lỗi tiếng Việt và gợi ý sửa lỗi C++17 giúp hiểu bài nhanh hơn", "…… / …… phiếu", "**…… %** (Mục tiêu ≥ 90%)", "Giảm tâm lý sợ lỗi CE"],
            ["3", "Công cụ Stress Test 3 cột giúp tự tìm ra test sai mà không cần chờ giáo viên sửa", "…… / …… phiếu", "**…… %** (Mục tiêu ≥ 88%)", "Rất hữu ích cho đội HSG"],
            ["4", "Giáo viên tiết kiệm trên 85% thời gian thu bài, chấm điểm và lọc chép code qua LAN", "…… / …… GV", "**…… %** (Mục tiêu 100%)", "Xuất điểm CSV ngay tại chỗ"],
            ["5", "Mong muốn tiếp tục sử dụng DrgX trong giờ thực hành Tin học và CLB STEM", "…… / …… phiếu", "**…… %** (Mục tiêu ≥ 94%)", "Đề xuất nhân rộng toàn trường"],
        ],
        "widths": [1.1, 6.1, 2.6, 3.0, 3.2],
        "font": 10.5,
        "compact": True,
        "caption": "Bảng 2: Tổng hợp kết quả phiếu khảo sát học sinh và giáo viên sau phiên triển khai thử nghiệm (Pilot).",
    })

    add_sec_title("IV. Nhận xét của Giáo viên chuyên môn và Xác nhận của Đơn vị")
    add_line("- Nhận xét chung về tính ứng dụng sư phạm, độ ổn định kỹ thuật và khả năng áp dụng: …………………")
    add_line("…………………………………………………………………………  …………………………………………………………………………")

    sig_tbl = doc.add_table(rows=1, cols=3)
    sig_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    sig_tbl.autofit = False
    set_fixed_table_layout(sig_tbl, 16.0)
    set_table_borders(sig_tbl, val="none")
    for idx, w_cm in enumerate((5.0, 5.2, 5.8)):
        sig_tbl.columns[idx].width = Cm(w_cm)
        sig_tbl.rows[0].cells[idx].width = Cm(w_cm)
        sig_tbl.rows[0].cells[idx].text = ""

    c0, c1, c2 = sig_tbl.rows[0].cells

    p0 = c0.paragraphs[0]
    p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p0.paragraph_format.space_after = Pt(0)
    add_rich(p0, "**ĐẠI DIỆN NHÓM DỰ ÁN**\n*(Ký, ghi rõ họ tên)*", size=12, color=BLACK)

    p1 = c1.paragraphs[0]
    p1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p1.paragraph_format.space_after = Pt(0)
    add_rich(p1, "**GIÁO VIÊN TIN HỌC / TỔ CM**\n*(Ký, ghi rõ họ tên)*", size=12, color=BLACK)

    p2 = c2.paragraphs[0]
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.paragraph_format.space_after = Pt(0)
    add_rich(p2, "*Phú Thọ, ngày …… tháng …… năm 2026*\n**XÁC NHẬN CỦA LÃNH ĐẠO ĐƠN VỊ**\n*(Ký tên, đóng dấu)*", size=12, color=BLACK)

    path = PRINT / "bien-ban-xac-nhan-pilot.docx"
    return save_docx_safe(doc, path)


def render_pilot_html() -> str:
    """Sinh bản HTML in A4 cho Biên bản xác nhận triển khai thử nghiệm (Pilot)."""
    return """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Biên bản xác nhận triển khai thử nghiệm (Pilot) — Hệ sinh thái lập trình DrgX</title>
<style>
@page { size: A4 portrait; margin: 20mm 20mm 20mm 30mm; }
* { box-sizing: border-box; }
body { font-family: "Times New Roman", Times, serif; font-size: 14pt; line-height: 1.3; color: #000; margin: 0; padding: 0; background: #fff; }
.hdr-grid { width: 100%; border-collapse: collapse; margin-bottom: 10pt; }
.hdr-grid td { border: none; text-align: center; vertical-align: top; padding: 0; font-size: 13pt; line-height: 1.3; }
.u-line { display: inline-block; border-bottom: 1pt solid #000; padding-bottom: 1pt; }
.title { text-align: center; font-weight: 700; font-size: 14pt; line-height: 1.35; margin: 8pt 0 10pt; }
.sec { font-weight: 700; font-size: 14pt; margin: 6pt 0 3pt; }
.line { font-size: 14pt; margin: 2pt 0; text-indent: 10mm; text-align: justify; }
table.grid { width: 100%; border-collapse: collapse; margin: 4pt 0 6pt; font-size: 11.5pt; }
table.grid th, table.grid td { border: 0.75pt solid #000; padding: 4pt 5pt; vertical-align: middle; }
table.grid th { font-weight: 700; text-align: center; }
table.grid td.c { text-align: center; }
.caption { font-size: 11.5pt; font-style: italic; text-align: center; margin-bottom: 6pt; }
.sig-grid { width: 100%; border-collapse: collapse; margin-top: 10pt; }
.sig-grid td { border: none; text-align: center; vertical-align: top; font-size: 12.5pt; line-height: 1.35; }
</style>
</head>
<body>
<table class="hdr-grid">
  <tr>
    <td style="width:40%">
      SỞ GIÁO DỤC VÀ ĐÀO TẠO PHÚ THỌ<br>
      <strong class="u-line">ĐƠN VỊ: ………………………………</strong>
    </td>
    <td style="width:60%">
      <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><br>
      <strong class="u-line">Độc lập - Tự do - Hạnh phúc</strong>
    </td>
  </tr>
</table>
<div class="title">
  BIÊN BẢN XÁC NHẬN TRIỂN KHAI THỬ NGHIỆM (PILOT)<br>
  VÀ TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ DỰ ÁN “HỆ SINH THÁI LẬP TRÌNH DrgX”
</div>
<div class="sec">I. Thời gian, địa điểm và thành phần tham gia</div>
<div class="line">- Thời gian tổ chức thử nghiệm: Từ ngày ……/……/2026 đến ngày ……/……/2026.</div>
<div class="line">- Địa điểm triển khai: Phòng máy Tin học / Câu lạc bộ STEM — Trường: ……………………………………………………………</div>
<div class="line">- Quy mô lớp / đội tuyển tham gia thử nghiệm: ……… máy trạm (……… học sinh và ……… giáo viên Tin học).</div>
<div class="line">- Đại diện Đơn vị / Tổ chuyên môn Tin học: Ông/Bà ……………………………………………… — Chức vụ: ……………………………</div>
<div class="line">- Giáo viên trực tiếp hướng dẫn và giám sát: Ông/Bà …………………………………………… — SĐT: …………………………………</div>
<div class="line">- Đại diện Nhóm dự án khởi nghiệp DrgX: ………………………………………………………… — SĐT: …………………………………</div>
</body>
</html>
"""


def export_pdfs(docx_files: list[Path]) -> list[Path]:
    """Xuất các tệp DOCX sang PDF bằng WPS/Word COM hoặc Microsoft Edge Headless để đồng bộ 100%."""
    pairs = []
    for p in docx_files:
        if not p.exists():
            continue
        base_stem = p.stem[:-8] if p.stem.endswith("-Updated") else p.stem
        base = p.parent / base_stem
        pairs.append((p.resolve(), base.with_suffix(".pdf").resolve(), base.with_suffix(".html").resolve()))
    if not pairs:
        return []
    ps_lines = [
        "$ErrorActionPreference = 'Stop'",
        "$app = $null",
        "foreach ($prog in @('Kwps.Application', 'Word.Application', 'KWPS.Application')) {",
        "  try { $app = New-Object -ComObject $prog; break } catch {}",
        "}",
        "if (-not $app) { exit 2 }",
        "try {",
        "  $app.Visible = $false",
    ]
    for src, dst, _ in pairs:
        ps_lines.append(f"  $doc = $app.Documents.Open('{src}', $false, $true)")
        ps_lines.append(f"  try {{ $doc.ExportAsFixedFormat('{dst}', 17) }} catch {{ $doc.ExportPdf('{dst}') }}")
        ps_lines.append("  $doc.Close($false)")
    ps_lines.extend([
        "} finally {",
        "  $app.Quit()",
        "}",
    ])
    res = subprocess.run(
        ["powershell", "-NoProfile", "-Command", "\n".join(ps_lines)],
        check=False,
        timeout=120,
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        edge_candidates = [
            Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
        ]
        edge_bin = next((p for p in edge_candidates if p.exists()), None)
        if edge_bin:
            for _, dst, html_src in pairs:
                if html_src.exists():
                    subprocess.run(
                        [
                            str(edge_bin),
                            "--headless",
                            "--disable-gpu",
                            "--no-pdf-header-footer",
                            f"--print-to-pdf={dst}",
                            html_src.as_uri(),
                        ],
                        check=False,
                        timeout=60,
                        capture_output=True,
                    )
    return [dst for _, dst, _ in pairs if dst.exists()]


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    src_logo = ROOT / "web" / "intro" / "logo.png"
    if src_logo.exists():
        for dst_logo in (ASSETS / "logo.png", PRINT / "logo.png"):
            try:
                if not dst_logo.exists():
                    shutil.copy2(src_logo, dst_logo)
            except OSError:
                pass

    md = render_markdown()
    (OUT / "01-bai-thuyet-minh.md").write_text(md, encoding="utf-8")

    html_doc = render_html()
    (PRINT / f"{C.META['slug']}.html").write_text(html_doc, encoding="utf-8")

    reg_html = render_registration_html()
    (PRINT / "dang-ky-du-thi.html").write_text(reg_html, encoding="utf-8")

    pilot_html = render_pilot_html()
    (PRINT / "bien-ban-xac-nhan-pilot.html").write_text(pilot_html, encoding="utf-8")

    docx_path = render_docx()
    reg_path = render_registration_docx()
    pilot_path = render_pilot_docx()
    csv_path = render_financial_csv()
    pdf_paths = export_pdfs([docx_path, reg_path, pilot_path])

    print("Đã tạo:")
    print(" -", OUT / "01-bai-thuyet-minh.md")
    print(" -", PRINT / f"{C.META['slug']}.html")
    print(" -", docx_path)
    print(" -", reg_path)
    print(" -", pilot_path)
    for pdf_p in pdf_paths:
        print(" -", pdf_p)
    print(" -", csv_path)


if __name__ == "__main__":
    main()

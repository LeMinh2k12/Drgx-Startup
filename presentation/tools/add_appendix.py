# -*- coding: utf-8 -*-
"""
Thêm PHỤ LỤC vào trang 2 (trang trống) của bai-thi-drgx-ide.docx:
 - Danh sách các phần chính (I, II, III, IV.1–IV.5), Bảng 1–12, Hình 1–2
 - Cột số trang lấy bằng cách render qua Word COM rồi đọc PDF (chính xác 100%)
Chạy:  python add_appendix.py
"""
import os, re, shutil, sys

SRC = r"D:\Dev\vietcode\docs\startup\print\bai-thi-drgx-ide.docx"
PDF_TMP  = r"D:\Dev\vietcode\presentation\voiceover\probe_appendix.pdf"
PDF_FINAL = r"D:\Dev\vietcode\docs\startup\print\bai-thi-drgx-ide.pdf"

# (key, "Phần", tiêu đề chính)  — số trang đo bằng render
ROWS = [
    ("P_I",   "Phần I · Đội ngũ", "Thông tin các thành viên tham gia dự án"),
    ("P_II",  "Phần II · Tóm tắt", "Tóm tắt dự án — ý tưởng chính & giá trị DrgX"),
    ("P_III", "Phần III · Nội dung", "Nội dung chính — Tổng quan dự án & tài nguyên chính"),
    ("P_IV0", "Phần IV · Mở đầu", "Mô tả thêm về sản phẩm, dịch vụ"),
    ("P_IV1", "IV.1", "Tính cần thiết — sản phẩm hoàn thiện, đối tượng & giá trị cộng đồng"),
    ("P_IV2", "IV.2", "Tính khả thi — mức độ đủ mạnh, đo kiểm & cơ cấu chi phí hợp lý"),
    ("P_IV3", "IV.3", "Tính độc đáo, sáng tạo — công nghệ lõi & khác biệt cạnh tranh"),
    ("P_IV4", "IV.4", "Kết quả tiềm năng — doanh thu, hoàn vốn & tác động xã hội"),
    ("P_IV5", "IV.5", "Các kênh truyền thông — kế hoạch tiếp cận đa kênh"),
    ("B1",  "Bảng 1",  "Phân tích đối tượng khách hàng mục tiêu & giá trị đáp ứng"),
    ("B2",  "Bảng 2",  "Đối chiếu định lượng hiệu quả trước/sau khi dùng DrgX"),
    ("B3",  "Bảng 3",  "Thành phần hệ sinh thái đã hoàn thiện & trạng thái kiểm định"),
    ("B4",  "Bảng 4",  "Kết quả đo kiểm thực nghiệm độ trễ p50/p95, RAM"),
    ("B5",  "Bảng 5",  "Cơ cấu chi phí biến đổi (COGS) & biên lợi nhuận gộp"),
    ("B6",  "Bảng 6",  "Nhận diện khó khăn, rủi ro & phương án khắc phục"),
    ("B7",  "Bảng 7",  "Đối sánh tính mới & lợi thế cạnh tranh trên thị trường"),
    ("B8",  "Bảng 8",  "Dự kiến doanh thu 3 năm đầu (2027–2029)"),
    ("B9",  "Bảng 9",  "Chi phí hoạt động & lợi nhuận ròng 3 năm đầu"),
    ("B10", "Bảng 10", "Unit Economics, thời điểm hòa vốn & phân tích độ nhạy"),
    ("B11", "Bảng 11", "Lộ trình tăng trưởng & mở rộng quy mô 2026–2029"),
    ("B12", "Bảng 12", "Kế hoạch kênh truyền thông & chỉ số đánh giá hiệu quả"),
    ("H1",  "Hình 1",  "Sơ đồ kiến trúc kép: Học có AI · Thi sạch AI (LAN)"),
    ("H2",  "Hình 2",  "Sơ đồ luồng thực thi 4 công nghệ lõi & mô hình hóa STEM"),
]

# chuỗi tìm trong text PDF (đã bỏ toàn khoảng trắng) — chỉ quét từ trang 3 trở đi
NEEDLES = {
    "P_I":   "Thôngtinvềcácthànhviên",
    "P_II":  "II.Tómtắtdựán",
    "P_III": "III.Nộidungchínhcủadựán",
    "P_IV0": "IV.Môtảthêm",            # tràunhận: "IV.Môtảthêm về..."
    "P_IV1": "Tínhcần",
    "P_IV2": "Tínhkhảthi",
    "P_IV3": "Tínhđộcđáo",
    "P_IV4": "Kếtquảtiềmnăng",
    "P_IV5": "Cáckênhtruyềnthông",
    "B1": "Bảng1:", "B2": "Bảng2:", "B3": "Bảng3:", "B4": "Bảng4:",
    "B5": "Bảng5:", "B6": "Bảng6:", "B7": "Bảng7:", "B8": "Bảng8:",
    "B9": "Bảng9:", "B10": "Bảng10:", "B11": "Bảng11:", "B12": "Bảng12:",
    "H1": "Hình1:", "H2": "SƠĐỒLUỒNGTHỰCTHI4",
}

APPENDIX_TAG = "PHỤ LỤC — DANH MỤC PHẦN & VỊ TRÍ TRANG"

def render(docx_path, pdf_path):
    from docx2pdf import convert
    try:
        convert(docx_path, pdf_path)
    except Exception as e:
        # Word đôi khi báo lỗi khi Quit — bỏ qua nếu PDF đã tạo
        if not os.path.exists(pdf_path):
            raise
        print(f"(render: bỏ qua lỗi {type(e).__name__})")

def page_map(pdf_path, start_page=3):
    from pypdf import PdfReader
    r = PdfReader(pdf_path)
    found = {}
    for i, pg in enumerate(r.pages, 1):
        if i < start_page:
            continue
        t = (pg.extract_text() or "").replace(" ", "")
        for k, nd in NEEDLES.items():
            if k not in found and nd in t:
                found[k] = i
    return found, len(r.pages)

NSB = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

def first_page_break_after(body_children):
    """trả về child đứng NGAY SAU paragraph chứa page break đầu tiên."""
    for i, k in enumerate(body_children):
        for br in k.findall(".//" + NSB + "br"):
            if br.get(NSB + "type") == "page":
                return i + 1
    return None

def style_run(r, size=10, bold=False, color=None, italic=False, font="Cambria"):
    r.font.size = size; r.font.name = font; r.bold = bold; r.italic = italic
    if color: r.font.color.rgb = color
    return r

def shade(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = tcPr.makeelement(NSB + "shd", {})
    shd.set(NSB + "val", "clear"); shd.set(NSB + "fill", hex_color)
    tcPr.append(shd)

def fill(cell, text, size=9.5, bold=False, color=None, align=None):
    cell.paragraphs[0].style = False if False else cell.paragraphs[0].style  # giữ style
    r = cell.paragraphs[0].add_run(text)
    style_run(r, size=size, bold=bold, color=color, font="Calibri")
    if align:
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        cell.paragraphs[0].alignment = align
    shade(cell, "FFFFFF")

def main():
    # backup 1 lần
    bak = os.path.join(os.path.dirname(SRC), "bai-thi-drgx-ide.backup-truoc-phu-luc.docx")
    if not os.path.exists(bak):
        shutil.copy2(SRC, bak); print("Backup:", bak)

    from docx import Document
    from docx.shared import Pt, RGBColor, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT

    d = Document(SRC)
    kids = list(d.element.body)

    # idempotent: đã có phụ lục thì chỉ re-render + patch
    has_app = any(APPENDIX_TAG in "".join(k.itertext()) for k in kids)

    if not has_app:
        ins = first_page_break_after(kids)
        if ins is None or ins >= len(kids):
            sys.exit("Không tìm được điểm chèn sau page break trang 1")
        anchor = kids[ins]

        # tiêu đề
        head = d.element.body.makeelement(NSB + "p", {})
        anchor.addprevious(head)
        from docx.text.paragraph import Paragraph
        ph = Paragraph(head, d)
        style_run(ph.add_run(APPENDIX_TAG), size=15, bold=True, color=RGBColor(0x0B, 0x63, 0xC5))
        ph.paragraph_format.space_after = Pt(2)

        sub = d.element.body.makeelement(NSB + "p", {})
        anchor.addprevious(sub)
        ps = Paragraph(sub, d)
        style_run(ps.add_run("Tham chiếu nhanh: các phần chính của dự án, vị trí trang và tiêu đề chính của từng phần."),
                  size=10, italic=True, color=RGBColor(0x55, 0x5F, 0x77))
        ps.paragraph_format.space_after = Pt(8)

        # bảng mục lục (tạo cuối doc rồi move lên trước anchor)
        t = d.add_table(rows=1, cols=3)
        try: t.style = "Table Grid"
        except KeyError: pass
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = False
        for wfrac, cell in zip((Cm(3.4), Cm(12.2), Cm(1.6)), t.rows[0].cells):
            cell.width = wfrac
        for cell, txt in zip(t.rows[0].cells, ("Phần", "Tiêu đề chính của phần", "Tr.")):
            fill(cell, txt, size=10, bold=True)
            shade(cell, "D7E7F7")
        for key, part, title in ROWS:
            row = t.add_row()
            a, b, c = row.cells
            for cell, wfrac in zip(row.cells, (Cm(3.4), Cm(12.2), Cm(1.6))): cell.width = wfrac
            fill(a, part, bold=True)
            fill(b, title)
            fill(c, "…", bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
            shade(a, "F2F7FC")
        for i, (key, part, title) in enumerate(ROWS, start=1):
            # key lưu trong attribute để patch
            key_ = key
            d.tables[-1].rows[i].cells[2]._tc.set("key", key_)  # attr tự định nghĩa (không sinhmilieu namespace)
        anchor.addprevious(t._tbl)
        print("Đã chèn phụ lục vào trang 2.")

    d.save(SRC)

    # render pass 1 → đo số trang
    render(SRC, PDF_TMP)
    pm, npages = page_map(PDF_TMP)
    missing = [k for k in NEEDLES if k not in pm]
    if missing:
        print("⚠ Không tìm thấy trên PDF:", missing)

    # patch số trang
    d = Document(SRC)
    key_by_row = {}
    for tbl in d.tables:
        header = [c.text.strip() for c in tbl.rows[0].cells]
        if header[:2] == ["Phần", "Tiêu đề chính của phần"]:
            for i, row in enumerate(tbl.rows[1:]):
                key = row.cells[2]._tc.get("key") or ROWS[i][0]
                row.cells[2].paragraphs[0].clear() if hasattr(row.cells[2].paragraphs[0], "clear") else None
                # xóa run cũ "..." rồi ghi số trang
                p0 = row.cells[2].paragraphs[0]
                for r_ in list(p0.runs):
                    r_._element.getparent().remove(r_._element)
                from docx.enum.text import WD_ALIGN_PARAGRAPH as AL
                r0 = style_run(p0.add_run(str(pm.get(key, "—"))), size=9.5, bold=True, font="Calibri")
                p0.alignment = AL.CENTER
            break
    d.save(SRC)

    # render bản PDF cuối chính thức
    render(SRC, PDF_FINAL)
    pm2, np2 = page_map(PDF_FINAL)
    print(f"✅ Đã có phụ lục + số trang ({np2} trang):\n" +
          "\n".join(f"  {k}: trang {pm2.get(k)}" for k, _, _ in ROWS))

if __name__ == "__main__":
    main()

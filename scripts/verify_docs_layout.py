#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kiểm định tự động chuẩn xuất bản Luận văn MIT & Kế hoạch 153/KH-SGDĐT cho bộ 4 tài liệu Word/PDF.

Chạy:
    python -X utf8 scripts/verify_docs_layout.py
"""
from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from docx import Document
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
PRINT = ROOT / "docs" / "startup" / "print"
PRES = ROOT / "presentation"

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def check_docx_xml_fonts(docx_path: Path, allow_consolas: bool = False) -> list[str]:
    errors: list[str] = []
    allowed = {"Times New Roman", "Consolas"} if allow_consolas else {"Times New Roman"}
    with zipfile.ZipFile(docx_path, "r") as zf:
        for member in ("word/document.xml", "word/styles.xml"):
            if member not in zf.namelist():
                continue
            root = ET.fromstring(zf.read(member))
            for rfonts in root.iter(f"{W_NS}rFonts"):
                for attr, val in rfonts.attrib.items():
                    local = attr.split("}")[-1]
                    if "Theme" in local or "theme" in local:
                        if member == "word/document.xml":
                            errors.append(f"{docx_path.name}:{member} chứa thuộc tính theme font {local}={val}")
                    elif local in ("ascii", "hAnsi", "eastAsia", "cs"):
                        if val not in allowed and member == "word/document.xml":
                            errors.append(f"{docx_path.name}:{member} chứa font {local}={val}")
    return errors


def norm_pdf(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def has_pdf_marker(page_norm: str, marker: str) -> bool:
    return norm_pdf(marker) in page_norm


def check_docx_margins_and_tokens(docx_path: Path, strict_a4_margins: bool = True) -> list[str]:
    errors: list[str] = []
    doc = Document(str(docx_path))
    sec = doc.sections[0]
    if strict_a4_margins:
        if abs(sec.left_margin.cm - 3.0) > 0.08 or abs(sec.right_margin.cm - 2.0) > 0.08:
            errors.append(
                f"{docx_path.name}: Lề trang lệch chuẩn 3-2-2-2cm (left={sec.left_margin.cm:.2f}, right={sec.right_margin.cm:.2f})"
            )
    chunks: list[str] = [p.text for p in doc.paragraphs]
    for tbl in doc.tables:
        for row in tbl.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    chunks.append(p.text)
    full_text = "\n".join(chunks)
    for bad_token in ("[[", "]]", "**", "`"):
        if bad_token in full_text:
            errors.append(f"{docx_path.name}: Còn sót ký hiệu Markdown/placeholder '{bad_token}'")
    return errors


def main() -> int:
    errors: list[str] = []

    deliverables = [
        (PRINT / "bai-thi-drgx-ide.docx", PRINT / "bai-thi-drgx-ide.pdf", False, True),
        (PRINT / "dang-ky-du-thi.docx", PRINT / "dang-ky-du-thi.pdf", False, True),
        (PRINT / "bien-ban-xac-nhan-pilot.docx", PRINT / "bien-ban-xac-nhan-pilot.pdf", False, True),
        (PRINT / "kich-ban-thuyet-trinh.docx", PRINT / "kich-ban-thuyet-trinh.pdf", True, False),
        (PRES / "Kich-ban-thuyet-trinh-DrgX.docx", PRES / "Kich-ban-thuyet-trinh-DrgX.pdf", True, False),
        (PRES / "Loi-thoai-thuyet-trinh-2-phut-DrgX.docx", PRES / "Loi-thoai-thuyet-trinh-2-phut-DrgX.pdf", True, False),
    ]

    for docx_p, pdf_p, allow_consolas, strict_margins in deliverables:
        if not docx_p.exists():
            errors.append(f"Thiếu tệp DOCX: {docx_p.relative_to(ROOT)}")
            continue
        if not pdf_p.exists():
            errors.append(f"Thiếu tệp PDF: {pdf_p.relative_to(ROOT)}")
            continue
        errors.extend(check_docx_xml_fonts(docx_p, allow_consolas=allow_consolas))
        errors.extend(check_docx_margins_and_tokens(docx_p, strict_a4_margins=strict_margins))

    # 1. Kiểm tra Bản đăng ký dự thi: đúng 1 trang
    reg_pdf = PRINT / "dang-ky-du-thi.pdf"
    if reg_pdf.exists():
        reg_pages = PdfReader(str(reg_pdf)).pages
        if len(reg_pages) != 1:
            errors.append(f"dang-ky-du-thi.pdf phải đúng 1 trang (hiện tại: {len(reg_pages)} trang)")

    # 2. Kiểm tra Biên bản xác nhận Pilot: đúng 2 trang, Bảng 1 ở trang 1, Bảng 2 ở trang 2
    pilot_pdf = PRINT / "bien-ban-xac-nhan-pilot.pdf"
    if pilot_pdf.exists():
        pilot_pages = [norm_pdf(p.extract_text()) for p in PdfReader(str(pilot_pdf)).pages]
        if len(pilot_pages) != 2:
            errors.append(f"bien-ban-xac-nhan-pilot.pdf phải đúng 2 trang (hiện tại: {len(pilot_pages)} trang)")
        else:
            if not has_pdf_marker(pilot_pages[0], "Bảng 1:"):
                errors.append("bien-ban-xac-nhan-pilot.pdf: Bảng 1 bị tràn sang trang 2 (không nằm gọn ở trang 1)")
            if not has_pdf_marker(pilot_pages[1], "Bảng 2:"):
                errors.append("bien-ban-xac-nhan-pilot.pdf: Bảng 2 không nằm ở trang 2")

    # 3. Kiểm tra Thuyết minh dự án chính thức (bai-thi-drgx-ide.pdf)
    main_pdf = PRINT / "bai-thi-drgx-ide.pdf"
    if main_pdf.exists():
        pages = [norm_pdf(p.extract_text()) for p in PdfReader(str(main_pdf)).pages]
        full_pdf_text = "".join(pages)

        # Kiểm tra cấu trúc 4 trang đầu đúng Phụ lục 03 & 04
        if not has_pdf_marker(pages[0], "CUỘC THI"):
            errors.append("bai-thi-drgx-ide.pdf: Trang 1 không phải trang bìa đóng khung")
        if not has_pdf_marker(pages[1], "I. Thông tin vắn tắt"):
            errors.append("bai-thi-drgx-ide.pdf: Trang 2 không phải Mục I. Thông tin vắn tắt")
        if not has_pdf_marker(pages[2], "II. Tóm tắt dự án"):
            errors.append("bai-thi-drgx-ide.pdf: Trang 3 không phải Mục II. Tóm tắt dự án")
        if not has_pdf_marker(pages[3], "ĐỐI TÁC CHÍNH") or not has_pdf_marker(pages[3], "DÒNG DOANH THU"):
            errors.append("bai-thi-drgx-ide.pdf: Sơ đồ Business Model Canvas không nằm gọn trong Trang 4")

        # Kiểm tra hàm lượng học thuật MIT (Hình 1, Hình 2, Bảng 1..13, p50/p95, O(N), J(A, B))
        for req_marker in ("Hình 1:", "Hình 2:", "Bảng 4:", "Bảng 13:", "p50", "p95", "O(N)", "J(A, B)"):
            if not has_pdf_marker(full_pdf_text, req_marker):
                errors.append(f"bai-thi-drgx-ide.pdf: Thiếu cấu phần học thuật '{req_marker}'")

        # Kiểm tra không có bảng đơn trang (Bảng 1 -> Bảng 12) hoặc Hình 1, Hình 2 bị cắt lẻ qua 2 trang
        single_page_anchors = [
            ("Bảng 1:", "1. Học sinh"),
            ("Bảng 2:", "Cài đặt & cấu hình"),
            ("Bảng 3:", "1. DrgX Studio"),
            ("Hình 1:", "SƠ ĐỒ KIẾN TRÚC KÉP TÁCH BIỆT"),
            ("Bảng 4:", "1. Ứng dụng gốc"),
            ("Bảng 5:", "Gói Học sinh"),
            ("Bảng 6:", "1. Thói quen ngại đổi"),
            ("Bảng 7:", "1. Thời gian thiết"),
            ("Hình 2:", "SƠ ĐỒ LUỒNG THỰC THI 4 CÔNG NGHỆ LÕI"),
            ("Bảng 8:", "1. Gói Pro cá nhân"),
            ("Bảng 9:", "1. Nhân sự R&D"),
            ("Bảng 10:", "Doanh thu trung"),
            ("Bảng 11:", "Giai đoạn 1: Pilot"),
            ("Bảng 12:", "1. Học sinh"),
        ]
        for caption_prefix, first_row_marker in single_page_anchors:
            cap_pages = [idx for idx, txt in enumerate(pages) if has_pdf_marker(txt, caption_prefix)]
            if not cap_pages:
                errors.append(f"bai-thi-drgx-ide.pdf: Không tìm thấy '{caption_prefix}'")
                continue
            cap_page_idx = cap_pages[0]
            if not has_pdf_marker(pages[cap_page_idx], first_row_marker):
                errors.append(
                    f"bai-thi-drgx-ide.pdf: '{caption_prefix}' bị cắt qua trang (chú thích ở trang {cap_page_idx + 1} nhưng thiếu dòng đầu '{first_row_marker}')"
                )

    if errors:
        print(f"[FAIL] Phát hiện {len(errors)} lỗi bố cục / thể thức tài liệu:")
        for err in errors:
            print("  -", err)
        return 1

    print("[OK] Toàn bộ 4 tài liệu Word & PDF đạt chuẩn xuất bản MIT & Kế hoạch 153/KH-SGDĐT (0 lỗi bố cục, 0 cắt bảng).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

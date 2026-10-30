# -*- coding: utf-8 -*-
"""
Tạo giọng đọc TTS cho kịch bản 2 phút DrgX (19 slide × 4 người nói 4 giọng khác nhau),
ghép thành 1 file mp3 có mốc thời gian từng slide, và xuất bản trình chiếu
tự nhảy slide để quay/xuất MP4.

Cách chạy:  python make_voiceover.py
"""
import asyncio, base64, json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../presentation
OUT  = os.path.join(ROOT, "voiceover")
os.makedirs(OUT, exist_ok=True)

import edge_tts
from mutagen.mp3 import MP3

FFMPEG = r"C:\Users\Le Minh\AppData\Local\Programs\Python\Python312\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"

# --------------------------------------------------------------- kịch bản ----
# (slide_code, người nói, nội dung) — viết kiểu nói tự nhiên: điệm từ "à/ạ/đây",
# chèn "..." để TTS ngắt nghỉ như người thở, chữ mượt hơn chữ viết.
SCRIPT = [
    ("S00", "dung",  "Em chào Ban Giám khảo ạ... Chúng em gồm Tiến Dũng, Bình Minh, Nguyễn Minh Đăng, Nguyễn Minh Quang, đến từ lớp 9A2, trường THCS Sông Lô."),
    ("S01", "dung",  "Mỗi lần cài C++ để học... tụi em mất gần hai tiếng đấy để sửa lỗi. Với DrgX, mở máy lên, sáu mươi giây là code được ngay à."),
    ("S02", "dung",  "DrgX gói trọn năm công cụ vào một ứng dụng chạy thật... là chạy thật luôn nhé... và đã vượt qua toàn bộ sáu mươi tám bài kiểm định tự động."),
    ("S03", "dung",  "Ở phòng máy ấy... học sinh dễ bị không điểm oan vì sai tên file Themis... còn thầy cô thì mất tới bốn mươi phút để gom bài qua USB."),
    ("S04", "dung",  "Còn về AI... thì càng khó hơn nữa: mở AI lúc thi thì các bạn chép bài trong ba giây... mà cấm hẳn đi thì lúc tự học lại thiếu người giảng."),
    ("S05", "dung",  "Vì vậy tụi em tách làm hai chế độ... Giờ tự học thì mở Dev Studio, có AI gợi mở... còn giờ thi thì bật CP Studio, khóa sạch AI."),
    ("S06", "minh",  "Mọi tính năng đều chạy thật... Bấm F9 là chấm bài tức thì... còn phòng máy khóa quyền cài, chỉ cần mở Web Lab trên trình duyệt là xong."),
    ("S07", "minh",  "Nếu code sai ở test ẩn... thì Stress Test ba cột tự sinh dữ liệu để đối chiếu... và bắt sống ngay lỗi tràn số ở vòng thứ tư."),
    ("S08", "minh",  "Dù có bạn chép bài rồi đổi hết tên biến... thì thuật toán Winnowing vẫn chuẩn hóa cấu trúc... và phát hiện trùng khớp một trăm phần trăm."),
    ("S09", "minh",  "Cả lớp bốn mươi máy nộp bài qua mạng LAN, không cần Internet... chỉ mất mười bảy giây thôi... và xuất ngay thư mục chuẩn cho Themis."),
    ("S10", "minh",  "Nhờ viết bằng Rust và C++17... ứng dụng chỉ tốn ba mươi chín mê-ga-bai RAM... tích hợp sẵn mô phỏng nạp mạch Arduino, và Robot STEM nữa."),
    ("S11", "quang", "Toàn bộ hệ thống, cùng kho bốn mươi bảy bài tập và bốn mươi hai bài giảng... đều vượt qua sáu mươi tám chốt chặn tự động."),
    ("S12", "quang", "DrgX không thay thế Themis của thầy cô đâu... mà bổ sung bước tự chấm F9 khi đang code... thu bài qua LAN, và chống đạo văn."),
    ("S13", "dang",  "Chỉ cần một giáo viên dùng phòng thi LAN miễn phí... sẽ kéo theo cả lớp cài đặt... rồi kết hợp giải đấu Mini Contest ngay tại trường."),
    ("S14", "dang",  "Vì trình biên dịch chạy ngay trên máy học sinh... nên chi phí máy chủ gần bằng không... giúp biên lợi nhuận gộp đạt trên tám mươi phần trăm."),
    ("S15", "dang",  "Dự án hòa vốn vào năm thứ hai... Nhờ chi phí vận hành thấp... kể cả doanh thu hụt ba mươi phần trăm thì vẫn có lãi."),
    ("S16", "dung",  "Tụi em bắt đầu thử nghiệm tại Phú Thọ trước... rồi mở rộng ra các trường miền núi... để học sinh thiếu Internet vẫn luyện thi công bằng."),
    ("S17", "dung",  "Bốn thành viên lớp 9A2 trường THCS Sông Lô... mong được Sở Giáo dục kết nối chạy thử nghiệm tại trường... và hỗ trợ cố vấn chuyên môn."),
    ("S18", "all",   "Từ hai giờ cài đặt... nay chỉ còn sáu mươi giây. DrgX đã sẵn sàng cho mọi phòng máy. Chúng em cảm ơn Ban Giám khảo ạ!"),
]

# 4 giọng khác nhau (2 giọng gốc tiếng Việt × biến đổi tốc độ / cao độ)
VOICES = {
    "dung":  dict(voice="vi-VN-NamMinhNeural", rate="-2%",  pitch="-6Hz"),
    "minh":  dict(voice="vi-VN-NamMinhNeural", rate="+8%",  pitch="+14Hz"),
    "quang": dict(voice="vi-VN-NamMinhNeural", rate="-6%",  pitch="+28Hz"),
    "dang":  dict(voice="vi-VN-NamMinhNeural", rate="+2%",  pitch="-26Hz"),
    # "cả 4" = 1 lớp chính (NamMinh chuẩn) + 3 lớp nhân tạo ghép sau
    "all":   dict(voice="vi-VN-NamMinhNeural", rate="+0%",  pitch="+0Hz"),
}

GAP = 0.9  # giây lặng giữa 2 câu (vừa đủ để chuyển cảnh mượt)

def run(args, **kw):
    p = subprocess.run(args, capture_output=True, text=True, **kw)
    if p.returncode != 0:
        print(p.stdout[-2000:]); print(p.stderr[-2000:]); sys.exit(f"Lệnh lỗi: {args[:2]}")
    return p

def duration(f):
    return MP3(f).info.length

async def tts(text, cfg, path):
    for attempt in range(3):
        try:
            c = edge_tts.Communicate(text, cfg["voice"], rate=cfg["rate"], pitch=cfg["pitch"])
            await c.save(path)
            if os.path.getsize(path) > 1000: return
        except Exception as e:
            print(f"  retry {attempt+1}: {e}"); await asyncio.sleep(2)
    sys.exit(f"Không tạo được giọng: {path}")

import random
random.seed(20260728)

def jitter_cfg(who):
    """Ai nói cũng không đều đều kiểu máy: mỗi câu lệch nhẹ tốc độ + tông."""
    b = VOICES[who]
    dr = random.randint(-3, 4)
    dp = random.randint(-5, 6)
    cfg = dict(b)
    cfg["rate"]  = f"{int(b['rate'].rstrip('%')) + dr:+d}%"
    cfg["pitch"] = f"{int(b['pitch'].rstrip('Hz')) + dp:+d}Hz"
    return cfg

async def main():
    # 1) TTS từng slide (mỗi câu một biến thể nhỏ cho giống người đọc) --------
    seg = []
    for code, who, text in SCRIPT:
        f = os.path.join(OUT, f"{code}.mp3")
        cfg = jitter_cfg(who)
        print(f"TTS {code} [{who}] {cfg['rate']} {cfg['pitch']} ..."); await tts(text, cfg, f)
        seg.append((code, f))

    # 2) Slide cuối "cả 4 thành viên": 4 lớp tiếng chồng nhau ----------------
    f18 = os.path.join(OUT, "S18.mp3")
    for i, key in enumerate(VOICES):
        if key == "all": continue
        await tts(SCRIPT[-1][2], VOICES[key], os.path.join(OUT, f"S18-{key}.mp3"))
    inputs, filters, labels = [], [], []
    for i, key in enumerate(["dung", "minh", "quang", "dang"]):
        inputs += ["-i", os.path.join(OUT, f"S18-{key}.mp3")]
        if i == 0:
            filters.append(f"[{i}:a]volume=0.95[v{i}]")
        else:
            filters.append(f"[{i}:a]adelay={i*160}|{i*160},volume=0.55[v{i}]")
        labels.append(f"[v{i}]")
    run([FFMPEG, "-y", *inputs, "-filter_complex",
         ";".join(filters) + ";" + "".join(labels) + "amix=inputs=4:duration=longest:normalize=0",
         "-ar", "24000", "-b:a", "48k", f18])

    # 3) tạo file lặng GAP giây (1 lần, dùng chung) --------------------------
    sil = os.path.join(OUT, "sil.mp3")
    run([FFMPEG, "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(GAP),
         "-b:a", "48k", "-ar", "24000", sil])

    # 4) ghép: lặng 1s đầu + S00 + lặng + S01 + ... --------------------------
    order = [sil] + [x for code, f in seg for x in (f, sil)]
    lst = os.path.join(OUT, "list.txt")
    with open(lst, "w", encoding="utf-8") as fh:
        for f in order:
            fh.write(f"file '{f}'\n")
    master = os.path.join(OUT, "DrgX-voiceover.mp3")
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", master])

    # 5) mốc thời gian: nhảy sang slide khi câu trước vừa nói xong -----------
    durs = {code: duration(f) for code, f in seg}
    cues = {"S00": 0.0}
    t = 0.0
    # Layout: [lặng GAP] S00 [lặng GAP] S01 [lặng GAP] ... S18 [lặng GAP]
    for i, (code, _) in enumerate(seg):
        t += GAP + durs[code]          # kết thúc câu của slide i
        if i + 1 < len(seg):
            cues[seg[i+1][0]] = round(t + GAP / 2, 2)  # nhảy với câu kế sau nửa quãng lặng
    d = duration(master)
    print("\nTổng thời lượng:", round(d, 2), "s")
    for k in sorted(cues): print(f"  {k}: {cues[k]:>7.2f}s")

    # 6) xuất bản trình chiếu nhúng sẵn giọng + mốc --------------------------
    idx = os.path.join(ROOT, "index.html")
    with open(idx, encoding="utf-8") as fh: html = fh.read()
    html = re.sub(r'<script id="drgx-embedded-voiceover">[\s\S]*?</script>\s*', '', html)
    with open(master, "rb") as fh:
        data_url = "data:audio/mpeg;base64," + base64.b64encode(fh.read()).decode()
    payload = ('<script id="drgx-embedded-voiceover">\n'
               f'window.DRGX_EMBEDDED_CUES = {json.dumps(cues)};\n'
               f'window.DRGX_EMBEDDED_AUDIO = "{data_url}";\n'
               'window.DRGX_EMBEDDED_NAME = "DrgX-voiceover.mp3";\n</script>\n')
    target = '<script src="app.js"></script>'
    html = html.replace(target, payload + target)
    out_html = os.path.join(ROOT, "DrgX-thuyet-trinh-tu-noi-mp4.html")
    with open(out_html, "w", encoding="utf-8") as fh: fh.write(html)
    print("\n✅ Đã xuất:", out_html)

asyncio.run(main())

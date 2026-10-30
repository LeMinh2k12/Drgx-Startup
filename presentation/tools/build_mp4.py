# -*- coding: utf-8 -*-
"""
Dựng trực tiếp file MP4 của bài thuyết trình DrgX (bản "có người giảng"):
  - Mở bản trình chiếu tự nói trong Chromium headless, quay video thật (WebM)
  - Con trỏ chuột ảo bay tới từng điểm nhấn trên slide, click tạo vòng ripple,
    hơi rung lung như tay người thật
  - Ghép audio giọng đọc 4 người (mốc nhảy slide đã nhúng sẵn trong bản HTML)
  - Xuất DrgX-thuyet-trinh-vong-2.mp4

Cách chạy:  python build_mp4.py [--out ten.mp4]
"""
import json, os, re, subprocess, sys, time, glob

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, "voiceover")
RECDIR = os.path.join(OUTDIR, "video")
os.makedirs(RECDIR, exist_ok=True)
import imageio_ffmpeg
from mutagen.mp3 import MP3
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# ── 1) Lấy mốc thời gian trong bản trình chiếu tự nói ───────────────────────
src = os.path.join(ROOT, "DrgX-thuyet-trinh-tu-noi-mp4.html")
with open(src, encoding="utf-8") as fh: html = fh.read()
m = re.search(r"window\.DRGX_EMBEDDED_CUES\s*=\s*({.*?});", html)
if not m: sys.exit("Không tìm thấy mốc — chạy make_voiceover.py trước!")
cues  = json.loads(m.group(1))
CODES = [f"S{str(i).zfill(2)}" for i in range(19)]
master = os.path.join(OUTDIR, "DrgX-voiceover.mp3")
TOTAL = MP3(master).info.length

# Điểm nhấn chuột theo từng slide (x%, y%): đầu tiên → tiêu đề, sau đó → khối nội dung
HIGHLIGHTS = {
    "S00": [(50, 78), (30, 35)],
    "S01": [(42, 55), (64, 62)],
    "S02": [(62, 42), (30, 62)],
    "S03": [(28, 48), (68, 50)],
    "S04": [(30, 46), (64, 58)],
    "S05": [(30, 55), (68, 55)],
    "S06": [(58, 46), (32, 66)],
    "S07": [(55, 40), (38, 68)],
    "S08": [(58, 42), (38, 72)],
    "S09": [(60, 40), (36, 74)],
    "S10": [(30, 52), (62, 50)],
    "S11": [(50, 45), (32, 70)],
    "S12": [(32, 52), (66, 52)],
    "S13": [(30, 48), (62, 54)],
    "S14": [(32, 46), (64, 48)],
    "S15": [(32, 46), (66, 50)],
    "S16": [(32, 52), (62, 60)],
    "S17": [(50, 74), (54, 46)],
    "S18": [(50, 48), (50, 64)],
}

# ── 2) Chuột ảo: bay easeInOut + rung nhẹ như tay người + click ripple ──────
MOUSE_JS = r"""
(() => {
  if (window.__DRGX_MOUSE__) return; window.__DRGX_MOUSE__ = true;
  let x = innerWidth * .5, y = innerHeight * .5;   // vị trí hiện tại
  let fx = x, fy = y, tx = x, ty = y;              // from → to
  let t0 = 0, dur = 800;

  const el = document.createElement('div');
  el.id = 'drgx-mouse';
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none;will-change:transform;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5));';
  el.innerHTML = '<svg width="30" height="34" viewBox="0 0 30 34" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M6 2 L24 17 L15 19 L19 29 L15 31 L11 21 L6 25 Z"'
    + ' fill="#fff" stroke="#0a0f1e" stroke-width="2.4" stroke-linejoin="round" transform="rotate(-8 15 17)"/></svg>';
  document.body.appendChild(el);

  const ripple = (px, py) => {
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;left:' + (px - 22) + 'px;top:' + (py - 22) + 'px;width:44px;height:44px;'
      + 'border:3px solid rgba(96,220,255,.95);border-radius:50%;pointer-events:none;z-index:99998;'
      + 'transform:scale(.2);opacity:1;transition:all .5s cubic-bezier(.2,.8,.3,1);';
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(1.35)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 550);
  };

  function raf(ts) {
    if (!t0) t0 = ts;
    const p = Math.min(1, (ts - t0) / dur);
    const e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;   // easeInOutCubic
    x = fx + (tx - fx) * e + Math.sin(ts / 33) * 2.2;    // jitter: tay hơi rung tự nhiên
    y = fy + (ty - fy) * e + Math.cos(ts / 41) * 2.0;
    el.style.transform = 'translate(' + (x - 2) + 'px,' + (y - 1) + 'px)';
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  const moveTo = (nx, ny, d) => { fx = x; fy = y; tx = nx * innerWidth; ty = ny * innerHeight; t0 = 0; dur = d; };

  window.__MOUSE_GOTO    = (nx, ny) => moveTo(nx, ny, 750 + 500 * Math.random());
  window.__MOUSE_WANDER  = (nx, ny) => moveTo(nx, ny, 1300 + 900 * Math.random());
  window.__MOUSE_CLICK   = () => setTimeout(() => ripple(x, y), 120 + 200 * Math.random());
})();

// banner tiêu đề → đổi document.title mỗi khi nhảy slide (phía python đọc để dàn cảnh)
addEventListener('hashchange', () => {
  const h = location.hash.replace('#', '');
  if (h) document.title = 'SLIDE:' + h;
});
"""

from playwright.sync_api import sync_playwright
from playwright._impl._errors import TargetClosedError
url = "file:///" + os.path.join(ROOT, "DrgX-thuyet-trinh-tu-noi-mp4.html").replace("\\", "/")

def record_once(p):
    """Thu 1 lần: trả về (webm, delay, last_slide_index). Bỏ webm nếu bị đóng giữa chừng."""
    ctx = p.chromium.launch_persistent_context(
        RECDIR + os.sep + "profile",
        headless=False,
        viewport={"width": 1920, "height": 1080},
        record_video_dir=RECDIR,
        record_video_size={"width": 1920, "height": 1080},
        args=["--force-device-scale-factor=1"])
    t0 = time.perf_counter()                       # ≈ lúc video bắt đầu quay
    delay, reached = None, ""
    try:
        page = ctx.new_page()
        page.goto(url)
        page.wait_for_timeout(3000)
        page.evaluate("document.body.classList.add('hide-hud');"
                      "const st=document.createElement('style');"
                      "st.textContent='#voiceDock,#hud,#rail,#progress,#notes,#help,#overview{display:none!important}';"
                      "document.head.appendChild(st)")
        page.wait_for_timeout(1400)
        delay = time.perf_counter() - t0           # thời gian "ủ" trước khi bấm ▶
        page.evaluate("window.DRGX && DRGX.toggleAutoPlay()")   # ▶ tự phát + tự nhảy theo mốc
        page.evaluate(MOUSE_JS)

        # Dàn cảnh chuột: slide nào vừa lên là bay tới điểm nhấn rồi click
        last = ""
        try:
            while True:
                title = page.title()
                if title.startswith("SLIDE:") and title != last:
                    last = title
                    code = title[6:].upper()
                    if code in CODES:
                        reached = code
                        pts = HIGHLIGHTS[code]
                        page.evaluate(f"__MOUSE_GOTO({pts[0][0]/100},{pts[0][1]/100})")
                        page.evaluate("__MOUSE_CLICK()")
                        for hx, hy in pts[1:]:
                            page.wait_for_timeout(2600)
                            page.evaluate(f"__MOUSE_WANDER({hx/100},{hy/100})")
                            page.evaluate("__MOUSE_CLICK()")
                        page.wait_for_timeout(600)
                page.wait_for_timeout(260)
        except TargetClosedError:
            # người dùng/tab đóng giữa chừng — coi như kết thúc vượt dự kiến
            if reached != "S18":
                print("⚠ Browser đóng giữa chừng ở", reached)
        # chờ của chuột kết thúc rồi đóng
        time.sleep(1.0)
    except Exception as e:
        print("record:", e)
    try:
        ctx.close()
    except Exception as e:
        print("ctx.close:", e)
    webms = glob.glob(os.path.join(RECDIR, "**", "*.webm"), recursive=True)
    webms = [w for w in webms if os.path.getmtime(w) > t0 - 5]
    webm = max(webms, key=os.path.getmtime) if webms else ""
    if not webm or reached != "S18":
        return ("", delay, reached)
    return (webm, delay, reached)

with sync_playwright() as p:
    webm, delay, reached = record_once(p)
    for attempt in range(2):
        if webm and reached == "S18":
            break
        print(f"Thu lại (lần {attempt + 2}) ...")
        # xoá webm lỗi cũ để tránh chọn nhầm
        for w in glob.glob(os.path.join(RECDIR, "**", "*.webm"), recursive=True):
            try: os.remove(w)
            except OSError: pass
        webm, delay, reached = record_once(p)
if not webm:
    sys.exit("Không lưu được video WebM (bị đóng giữa chừng). Chạy lại script là được.")

# ── 3) Ghép video + giọng đọc (bỏ đoạn video đầu bằng -ss = thời gian ủ) ────
out = os.path.join(ROOT, sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv
                   else "DrgX-thuyet-trinh-vong-2.mp4")
cmd = [FFMPEG, "-y",
       "-ss", f"{max(delay, 0):.3f}", "-i", webm,
       "-i", master,
       "-map", "0:v", "-map", "1:a",
       "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "160k", "-shortest", out]
print("\nEncode MP4 ...")
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr[-3000:]); sys.exit("Encode thất bại")
print(f"\n✅ Đã xuất: {out}  ({os.path.getsize(out)/1e6:.1f} MB, ≈{TOTAL:.0f}s)")

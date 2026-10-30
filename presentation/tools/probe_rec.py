import os, time, glob
from playwright.sync_api import sync_playwright
ROOT = r"D:\Dev\vietcode\presentation"
REC  = os.path.join(ROOT, "voiceover", "probe")
os.makedirs(REC, exist_ok=True)
url = "file:///" + os.path.join(ROOT, "DrgX-thuyet-trinh-tu-noi-mp4.html").replace("\\", "/")
with sync_playwright() as p:
    try:
        b = p.chromium.launch(headless=False, args=["--window-position=0,0", "--force-device-scale-factor=1"])
    except Exception as e:
        print("launch err", e); raise
    ctx = p.chromium.new_context.__self__ if False else None
    ctx = b.new_context(viewport={"width": 1920, "height": 1080}, record_video_dir=REC, record_video_size={"width": 1920, "height": 1080})
    page = ctx.new_page()
    page.goto(url)
    page.wait_for_timeout(2500)
    page.evaluate("document.body.classList.add('hide-hud'); window.DRGX && DRGX.toggleAutoPlay()")
    page.wait_for_timeout(8000)
    ctx.close(); b.close()
webms = glob.glob(os.path.join(REC, "*.webm"))
print(webms)

import os
from playwright.sync_api import sync_playwright
ROOT = r"D:\Dev\vietcode\presentation"
url = "file:///" + os.path.join(ROOT, "DrgX-thuyet-trinh-tu-noi-mp4.html").replace("\\", "/")
with sync_playwright() as p:
    b = p.chromium.launch(headless=False)
    ctx = b.new_context(viewport={"width": 1920, "height": 1080})
    page = ctx.new_page()
    page.goto(url)
    page.wait_for_timeout(2500)
    page.evaluate("document.body.classList.add('hide-hud')")
    page.evaluate("window.DRGX && DRGX.toggleAutoPlay()")
    page.wait_for_timeout(4000)
    print(page.evaluate("""({
        badge: (document.querySelector('#vdBadge')||{}).textContent,
        time: (document.querySelector('#voiceTime')||{}).textContent,
        title: document.title,
        hash: location.hash,
        hideHud: document.body.classList.contains('hide-hud'),
        dockClass: (document.querySelector('#voiceDock')||{className:''}).className
    })"""))
    b.close()

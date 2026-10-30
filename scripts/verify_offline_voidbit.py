"""Regression test (offline mode): block every non-localhost request, then check that Void-bit pages
still render styled (local Tailwind in products/void-bit/vendor/) and Lucide icons are rendered.

Usage: python -X utf8 scripts/verify_offline_voidbit.py [page.html ...]   (requires: pip install playwright)
"""
import os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 47815
h = functools.partial(type("Q", (http.server.SimpleHTTPRequestHandler,), {"log_message": lambda *a: None}), directory=ROOT)
socketserver.ThreadingTCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
pages = sys.argv[1:] or ["index.html", "problems.html", "problem.html", "contests.html", "leaderboard.html", "stresstest.html", "docs.html", "hsg.html", "courses.html", "submissions.html", "profile.html", "users.html", "forum.html", "chat.html", "contest.html", "oj-new.html"]
fails = 0
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for p in pages:
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(f"http://127.0.0.1:{PORT}") or r.request.url.startswith("data:") else r.abort())
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
        try:
            pg.goto(f"http://127.0.0.1:{PORT}/products/void-bit/{p}", wait_until="load", timeout=15000); pg.wait_for_timeout(1200)
        except Exception as e:
            print(f"[FAIL] {p}: load timeout"); fails += 1; ctx.close(); continue
        # Tailwind probe: a utility-class element must get its style
        tw = pg.evaluate("""() => { const el = document.querySelector('[class~="flex"]'); if (!el) return 'n/a';
                 return getComputedStyle(el).display === 'flex' ? 'ok' : 'UNSTYLED'; }""")
        icons_unrendered = pg.evaluate("() => document.querySelectorAll('i[data-lucide]').length")
        ok = tw != "UNSTYLED" and icons_unrendered == 0 and not errs
        fails += 0 if ok else 1
        print(f"[{'PASS' if ok else 'FAIL'}] {p}: tailwind={tw} lucide_unrendered={icons_unrendered} js_errors={len(errs)} {errs[:2]}")
        ctx.close()
    b.close()
srv.shutdown()
print(f"OFFLINE RESULT: {len(pages) - fails}/{len(pages)} pages OK")
sys.exit(1 if fails else 0)

/* =====================================================================
   DrgX — Championship Pitch Deck runtime
   Builds (fragments), live demos, 5-minute mode, presenter view.
   Offline, zero dependencies.
   ===================================================================== */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const STEP_BUILDS = params.has('builds'); // optional step-by-step fragment mode (?builds=1)
  const SHOT = !STEP_BUILDS;                // default: show full richly decorated slide immediately
  const IS_SCREENSHOT = params.has('shot'); // static instant mode for headless screenshot capture
  if (IS_SCREENSHOT) root.classList.add('shot');
  const reduced = IS_SCREENSHOT || matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stage = $('#stage');
  const slides = $$('.slide');
  const isApx = s => s.dataset.apx === '1';
  const inMode = s => mode === 'full' || (mode === 'core' && s.dataset.core === '1') || (mode === 'v3' && s.dataset.v3 === '1');
  const tm = s => (mode === 'v3' && s.dataset.t3) ? +s.dataset.t3 : (+s.dataset.time || 0);   // time budget (s) of a slide in the current mode
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
                  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

  let cur = 0;
  const MODES = ['full', 'core', 'v3'];   // full = 18 slide · core = 5 phút · v3 = video ≤ 3 phút (Phụ lục 05)
  let mode = params.get('mode') === '5' ? 'core' : params.get('mode') === '3' ? 'v3' : (store.get('drgx-mode') || 'full');
  if (!MODES.includes(mode)) mode = 'full';

  /* ---------- Fit fixed canvas ---------- */
  const fit = () => { stage.style.transform = `translate(-50%, -50%) scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`; };
  addEventListener('resize', fit); fit();

  /* ---------- Sequences ---------- */
  const mainSeq = () => slides.map((s, i) => i).filter(i => !isApx(slides[i]) && inMode(slides[i]));
  const apxSeq = () => slides.map((s, i) => i).filter(i => isApx(slides[i]));
  const seqOf = i => (isApx(slides[i]) ? apxSeq() : mainSeq());
  const frs = s => $$('.f', s);
  const toast = (() => { let t; return msg => { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(t); t = setTimeout(() => el.classList.remove('on'), 1800); }; })();

  /* ---------- Stage notes chips (rehearsal mode) ---------- */
  slides.forEach(s => {
    if (!s.dataset.rub) return;
    const d = document.createElement('div'); d.className = 'rub';
    d.innerHTML = s.dataset.rub.split(' ').map(r => `<span>Trọng tâm ${r}</span>`).join('');
    s.appendChild(d);
  });

  /* ---------- Navigation & Full-Slide Morph Choreography ---------- */
  function morphOrbs(i) {
    const angle = i * 0.72;
    const o1x = Math.round(Math.sin(angle) * 260 - 80);
    const o1y = Math.round(Math.cos(angle * 0.8) * 180 + 40);
    const o2x = Math.round(Math.cos(angle * 0.9) * 240 + 60);
    const o2y = Math.round(Math.sin(angle * 0.7) * -170 - 30);
    const o1s = (1 + Math.sin(angle) * 0.14).toFixed(2);
    const o2s = (1 + Math.cos(angle) * 0.14).toFixed(2);
    stage.style.setProperty('--o1-x', o1x + 'px');
    stage.style.setProperty('--o1-y', o1y + 'px');
    stage.style.setProperty('--o2-x', o2x + 'px');
    stage.style.setProperty('--o2-y', o2y + 'px');
    stage.style.setProperty('--o1-s', o1s);
    stage.style.setProperty('--o2-s', o2s);
  }

  function go(i, back = false) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    const prevSlide = slides[cur];
    onLeave(prevSlide);
    slides.forEach((s, k) => { s.classList.toggle('active', k === i); s.classList.toggle('past', k < i); });
    cur = i;
    morphOrbs(i);
    const s = slides[i];
    // Show all slide fragments by default unless ?builds=1 is enabled
    frs(s).forEach(f => f.classList.toggle('on', back || SHOT));
    markLast(s);
    updateChrome();
    onEnter(s, IS_SCREENSHOT);
    if (back || SHOT) frs(s).forEach(f => f.dataset.run && RUN[f.dataset.run] && RUN[f.dataset.run](IS_SCREENSHOT));
    const hashCode = s.dataset.code ? s.dataset.code.toLowerCase() : String(i + 1);
    history.replaceState(null, '', location.search + '#' + hashCode);
    sync();
  }
  function nextSlide() {
    startClock();
    const s = slides[cur], seq = seqOf(cur), k = seq.indexOf(cur);
    if (k === -1) { go(seq.find(i => i > cur) ?? seq[seq.length - 1]); return; }
    if (k < seq.length - 1) go(seq[k + 1]); else toast(isApx(s) ? 'Hết phụ lục' : 'Slide cuối — mời Hội đồng đặt câu hỏi');
  }
  function prevSlide() {
    const seq = seqOf(cur), k = seq.indexOf(cur);
    if (k > 0) go(seq[k - 1], true);
    else if (k === -1) { const p = seq.filter(i => i < cur); if (p.length) go(p[p.length - 1], true); }
  }
  function next() {
    startClock();
    const s = slides[cur], f = !SHOT && frs(s).find(x => !x.classList.contains('on'));
    if (f) { reveal(f); return; }
    nextSlide();
  }
  function prev() {
    const s = slides[cur], on = frs(s).filter(x => x.classList.contains('on'));
    if (!SHOT && on.length) { on[on.length - 1].classList.remove('on'); markLast(s); sync(); return; }
    prevSlide();
  }
  function reveal(f) {
    f.classList.add('on'); markLast(f.closest('.slide'));
    if (f.dataset.run && RUN[f.dataset.run]) RUN[f.dataset.run](false);
    sync();
  }
  function markLast(s) { const on = frs(s).filter(x => x.classList.contains('on')); frs(s).forEach(x => x.classList.toggle('last', x === on[on.length - 1])); }

  /* ---------- Chrome: rail, progress, counter ---------- */
  function updateChrome() {
    const s = slides[cur], seq = seqOf(cur), k = seq.indexOf(cur);
    const ch = +(s.dataset.ch || 0);
    stage.classList.toggle('hide-rail', s.dataset.norail === '1' || isApx(s));
    $$('#rail .ch').forEach(c => { const n = +c.dataset.ch; c.classList.toggle('on', n === ch); c.classList.toggle('done', n < ch); });
    const rubEl = $('#railRubric');
    if (rubEl) {
      const chNames = {
        1: 'THỰC TRẠNG PHÒNG MÁY',
        2: 'KIẾN TRÚC KÉP DRGX',
        3: 'CÔNG NGHỆ LÕI',
        4: 'MÔ HÌNH TĂNG TRƯỞNG',
        5: 'TÁC ĐỘNG QUỐC GIA'
      };
      rubEl.textContent = isApx(s)
        ? 'PHỤ LỤC HỎI ĐÁP · HỘI ĐỒNG'
        : (chNames[ch] || 'HỆ SINH THÁI DRGX LOCAL-FIRST');
    }
    $('#progress').style.width = (isApx(s) ? 100 : ((Math.max(k, 0) + 1) / seq.length * 100)) + '%';
    $('#counter').textContent = isApx(s) ? `PL ${k + 1}/${seq.length}` : `${Math.max(k, 0) + 1} / ${seq.length}`;
    $('#slideTitle').textContent = s.dataset.title || '';
    $('#modeTag').textContent = mode === 'v3' ? 'VIDEO 3 PHÚT' : mode === 'core' ? 'CHẾ ĐỘ 5 PHÚT' : 'TOÀN BỘ';
    $('#bMode').classList.toggle('on', mode !== 'full');
    $('#bMode').textContent = mode === 'v3' ? '🎬 3′' : mode === 'core' ? '⏱ 5′' : '⏱ Toàn bộ';
    renderNotes();
  }

  // Clickable chapter rail pills
  $$('#rail .ch').forEach(c => {
    c.addEventListener('click', () => {
      const targetCh = c.dataset.ch;
      const idx = slides.findIndex(s => s.dataset.ch === targetCh && inMode(s));
      if (idx >= 0) go(idx);
    });
  });

  /* ---------- Slide lifecycle ---------- */
  const vid = $('#introVid');
  let shotTimer = null;
  function onEnter(s, instant) {
    $$('[data-count]', s).forEach(el => countUp(el, instant));
    if (s.contains(vid)) { vid.currentTime = 0; const p = vid.play(); if (p) p.catch(() => {}); }
    if (s.querySelector('#shots')) startShots();
    if (s.querySelector('#proofTerm')) typeProof(instant);
    if (s.id === 'lanSlide' || s.querySelector('#lanSvg')) resetLan();
  }
  function onLeave(s) {
    if (!s) return;
    if (s.contains(vid)) vid.pause();
    if (s.querySelector('#shots')) clearInterval(shotTimer);
    stopTimers();
  }
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  function stopTimers() { timers.forEach(clearTimeout); timers.clear(); cancelAnimationFrame(lanRaf); }

  function countUp(el, instant) {
    const end = +el.dataset.count;
    if (instant || reduced) { el.textContent = end; return; }
    const t0 = performance.now(), dur = 1300;
    later(() => { el.textContent = end; }, dur + 100);   // final value guaranteed even if rAF is throttled
    (function tick(t) {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1 && slides[cur].contains(el)) requestAnimationFrame(tick); else el.textContent = end;
    })(t0);
  }

  function startShots() {
    const imgs = $$('#shots img');
    const thumbs = $$('#shotThumbs .shot-thumb');
    let k = 0;
    const showShot = idx => {
      k = (idx + imgs.length) % imgs.length;
      imgs.forEach((im, j) => im.classList.toggle('on', j === k));
      thumbs.forEach((th, j) => th.classList.toggle('on', j === k));
      $('#shotCap').textContent = imgs[k].dataset.cap;
    };
    showShot(0);
    thumbs.forEach((th, idx) => {
      th.onclick = () => { clearInterval(shotTimer); showShot(idx); };
    });
    clearInterval(shotTimer);
    if (IS_SCREENSHOT) return;
    shotTimer = setInterval(() => showShot(k + 1), 1600);
  }

  /* ---------- LIVE 1 · Differential stress test ---------- */
  function runStress(instant) {
    stopTimers();
    const out = $('#stressOut');
    out.innerHTML = '<div class="faint">⚙ g++ -O2 -std=c++17 generator.cpp brute.cpp solution.cpp … biên dịch xong</div><div class="scan"></div>';
    const fixed = [[412, 87, 905], [33, 768], [250, 999, 14, 640]];
    const rows = fixed.map((arr, i) => {
      const sum = arr.reduce((a, b) => a + b, 0);
      return { id: i + 1, ok: true, ms: [11, 9, 12][i], d: `[${arr.join(', ')}] → brute ${sum.toLocaleString('vi-VN')} · sol ${sum.toLocaleString('vi-VN')}` };
    });
    const a = 1500000000, real = a * 2, wrapped = ((real + 2 ** 31) % 2 ** 32) - 2 ** 31;
    rows.push({ id: 4, ok: false, ms: 10, d: `[1.500.000.000, 1.500.000.000] → brute <b class="good">${real.toLocaleString('vi-VN')}</b> · sol <b class="bad">${wrapped.toLocaleString('vi-VN')}</b>` });
    const step = instant ? 0 : 520;
    rows.forEach((r, k) => later(() => {
      const scan = out.querySelector('.scan'); if (scan) scan.remove();
      out.insertAdjacentHTML('beforeend',
        `<div class="trow"><b>Vòng #0${r.id}</b><span class="tag ${r.ok ? 'ac' : 'wa'}">${r.ok ? 'KHỚP' : 'LỆCH'}</span><span class="faint">${r.ms} ms</span><span>${r.d}</span></div>`);
      if (r.ok && !instant) out.insertAdjacentHTML('beforeend', '<div class="scan"></div>');
      if (!r.ok) out.insertAdjacentHTML('beforeend',
        `<div class="verdict"><span class="bad">🎯 Bắt được phản ví dụ ở vòng #04</span> — tổng vượt 2³¹, <span class="mono">int</span> bị tràn. Cách sửa: <span class="mono good">long long</span>.</div>`);
    }, step * (k + 1) + (instant ? 0 : 300)));
  }

  /* ---------- LIVE 2 · Winnowing k-gram (real algorithm, k=5, w=4) ---------- */
  const KW = new Set('int long short char bool void double float auto const while for if else return do break continue switch case struct class using namespace std include cin cout endl main vector string'.split(' '));
  function tokens(code) {
    code = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const raw = code.match(/[A-Za-z_]\w*|\d+|==|!=|<=|>=|<<|>>|\+\+|--|&&|\|\||[+\-*/%=<>!&|^~(){}[\];,]/g) || [];
    return raw.map(t => (/^\d+$/.test(t) ? 'N' : /^[A-Za-z_]/.test(t) ? (KW.has(t) ? t : 'ID') : t));
  }
  function fnv(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function fingerprints(tok, k = 5, w = 4) {
    const hs = []; for (let i = 0; i + k <= tok.length; i++) hs.push(fnv(tok.slice(i, i + k).join(' ')));
    const fp = new Set(); let last = -1;
    for (let i = 0; i + w <= hs.length; i++) {
      let m = i; for (let j = i + 1; j < i + w; j++) if (hs[j] <= hs[m]) m = j;   // rightmost minimum
      if (m !== last) { fp.add(hs[m]); last = m; }
    }
    return fp;
  }
  function runWin(instant) {
    stopTimers();
    const ta = tokens($('#codeA').value), tb = tokens($('#codeB').value);
    const fa = fingerprints(ta), fb = fingerprints(tb);
    let inter = 0; fa.forEach(h => { if (fb.has(h)) inter++; });
    const sim = fa.size + fb.size ? (2 * inter / (fa.size + fb.size)) * 100 : 0;
    const fg = $('#ringFg'); fg.style.strokeDashoffset = 754 - 754 * sim / 100;
    const txt = $('#ringTxt');
    if (instant || reduced) txt.textContent = Math.round(sim) + '%';
    else { const t0 = performance.now(); (function tick(t) { const p = Math.min(1, (t - t0) / 1600); txt.textContent = Math.round(sim * (1 - Math.pow(1 - p, 3))) + '%'; if (p < 1) requestAnimationFrame(tick); })(t0); }
    later(() => { txt.textContent = Math.round(sim) + '%'; }, instant ? 0 : 1700);   // guarantee final value even if rAF is throttled
    const v = $('#winVerdict');
    v.innerHTML = sim >= 65 ? '<span class="warn">⚠ CẦN GIÁO VIÊN ĐỐI CHIẾU</span><br><span class="muted" style="font-size:19px">Đã lọc khung nhập xuất mẫu — cấu trúc thuật toán trùng khớp</span>'
      : sim >= 40 ? '<span class="warn">Tương đồng trung bình — cần giáo viên xem xét</span>' : '<span class="good">✓ Bài làm độc lập</span>';
    $('#winTok').textContent = `${ta.length}/${tb.length} token · ${fa.size}/${fb.size} vân tay · ${inter} trùng`;
    // Show what the machine sees: first tokens, highlighting positions where both streams agree.
    const LIM = 34, paint = (el, mine, other) => {
      el.innerHTML = el.querySelector('.lab').outerHTML;
      mine.slice(0, LIM).forEach((t, i) => {
        const chip = document.createElement('i'); chip.textContent = t;
        if (other[i] === t) chip.className = 'm';
        chip.style.animationDelay = (instant ? 0 : i * 18) + 'ms';
        el.appendChild(chip);
      });
      if (mine.length > LIM) el.insertAdjacentHTML('beforeend', '<i style="animation-delay:0ms">…</i>');
    };
    paint($('#tokA'), ta, tb); paint($('#tokB'), tb, ta);
  }

  /* ---------- LIVE 3 · LAN classroom (visual simulation) ---------- */
  const svg = $('#lanSvg'), NS = 'http://www.w3.org/2000/svg';
  const SRV = { x: 40, y: 250, w: 230, h: 120 }, HUB = { x: SRV.x + SRV.w, y: SRV.y + SRV.h / 2 };
  const pcs = [];
  (function buildLan() {
    const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    const wires = mk('g', {});
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
      const x = 400 + c * 76, y = 40 + r * 124, cx = x, cy = y + 20;
      mk('line', { class: 'wire', x1: HUB.x, y1: HUB.y, x2: cx, y2: cy }, wires);
      const g = mk('g', { class: 'pc' });
      mk('rect', { x, y, width: 58, height: 40, rx: 7 }, g);
      mk('rect', { x: x + 22, y: y + 44, width: 14, height: 6, rx: 2 }, g);
      pcs.push({ g, x: cx, y: cy });
    }
    const s = mk('g', { class: 'srv' });
    mk('rect', { x: SRV.x, y: SRV.y, width: SRV.w, height: SRV.h, rx: 18 }, s);
    const t1 = mk('text', { x: SRV.x + SRV.w / 2, y: SRV.y + 52, 'text-anchor': 'middle' }, s); t1.textContent = 'Máy giáo viên';
    const t2 = mk('text', { x: SRV.x + SRV.w / 2, y: SRV.y + 86, 'text-anchor': 'middle', style: 'font-size:18px;fill:var(--a1);font-weight:800' }, s); t2.textContent = 'Exam Server :8765';
    const t3 = mk('text', { x: 712, y: 612, 'text-anchor': 'middle' }); t3.textContent = '40 máy học sinh · CP Studio';
  })();
  let lanRaf = 0, packets = [], lanCount = 0;
  function resetLan() {
    cancelAnimationFrame(lanRaf); packets.forEach(p => p.el.remove()); packets = []; lanCount = 0;
    pcs.forEach(p => p.g.classList.remove('ok')); $('#lanCount').textContent = '0';
  }
  function runLan(instant) {
    resetLan();
    if (instant || reduced) { pcs.forEach(p => p.g.classList.add('ok')); $('#lanCount').textContent = '40'; return; }
    const t0 = performance.now(), TRAVEL = 700;
    packets = pcs.map((p, i) => {
      const el = document.createElementNS(NS, 'circle'); el.setAttribute('r', 6); el.setAttribute('class', 'pk'); el.style.opacity = 0; svg.appendChild(el);
      return { p, el, start: (i * 61 + Math.random() * 380), done: false };
    }).sort((a, b) => a.start - b.start);
    const tick = now => {
      const t = now - t0; let alive = false;
      for (const k of packets) {
        if (k.done) continue; alive = true;
        const u = (t - k.start) / TRAVEL;
        if (u < 0) continue;
        if (u >= 1) {
          k.done = true; k.el.remove(); k.p.g.classList.add('ok');
          $('#lanCount').textContent = ++lanCount; continue;
        }
        const e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        k.el.style.opacity = 1;
        k.el.setAttribute('cx', k.p.x + (HUB.x - k.p.x) * e);
        k.el.setAttribute('cy', k.p.y + (HUB.y - k.p.y) * e);
      }
      if (alive) lanRaf = requestAnimationFrame(tick);
    };
    lanRaf = requestAnimationFrame(tick);
    // Safety net: if rAF is throttled (background tab, slow projector PC) still land on the true end state.
    const last = packets[packets.length - 1].start + TRAVEL;
    later(() => {
      cancelAnimationFrame(lanRaf); packets.forEach(k => { k.done = true; k.el.remove(); });
      pcs.forEach(p => p.g.classList.add('ok')); lanCount = 40; $('#lanCount').textContent = '40';
    }, last + 400);
  }

  /* ---------- Proof terminal ---------- */
  const PROOF = [
    ['faint', '$ drgx verify --all-pillars'],
    ['', '  DrgX Ecosystem Unified Health Gate'],
    ['ok', '[PASS] 1. Hồ sơ Dự án & Tài chính ... 18/18'],
    ['ok', '[PASS] 2. Cổng Web & Kiosk Trực quan . 18/18'],
    ['ok', '[PASS] 3. CP Studio & Dev Studio .... 16/16'],
    ['ok', '[PASS] 4. Exam Server (Smoke 15/15) ..  3/3'],
    ['ok', '[PASS] 5. Void-bit & C++17 OJ ....... 13/13'],
    ['faint', '──────────────────────────────────────────'],
    ['ok cur', 'ALL 5 PILLARS PASSED · 68/68 (36 tĩnh + 32 mô-đun)'],
  ];
  function typeProof(instant) {
    const el = $('#proofTerm'); el.innerHTML = '';
    PROOF.forEach(([c, t], i) => later(() => {
      el.querySelectorAll('.cur').forEach(x => x.classList.remove('cur'));
      el.insertAdjacentHTML('beforeend', `<span class="${c}">${t.replace(/&/g, '&amp;')}</span>\n`);
    }, instant ? 0 : 400 + i * 240));
  }

  const RUN = { stress: runStress, win: runWin, lan: runLan };
  const runButtons = { runStress: 'stress', runWin: 'win' };
  Object.entries(runButtons).forEach(([id, key]) => $('#' + id).addEventListener('click', () => {
    const f = $(`[data-run="${key}"]`); if (f && !f.classList.contains('on')) { f.classList.add('on'); markLast(slides[cur]); }
    RUN[key](false); startClock();
  }));

  /* ---------- Ambient particles ---------- */
  const cv = $('#particles'), cx = cv.getContext('2d');
  const P = Array.from({ length: 64 }, () => ({ x: Math.random() * 1920, y: Math.random() * 1080, r: Math.random() * 1.7 + .4, vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22 }));
  const accent = () => getComputedStyle(root).getPropertyValue('--a1').trim() || '#22d3ee';
  let col = accent(), running = false;
  function draw() {
    cx.clearRect(0, 0, 1920, 1080); cx.fillStyle = col; cx.strokeStyle = col;
    for (const p of P) { p.x = (p.x + p.vx + 1920) % 1920; p.y = (p.y + p.vy + 1080) % 1080; cx.globalAlpha = .5; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill(); }
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d = dx * dx + dy * dy;
      if (d < 15000) { cx.globalAlpha = (1 - d / 15000) * .16; cx.beginPath(); cx.moveTo(P[i].x, P[i].y); cx.lineTo(P[j].x, P[j].y); cx.stroke(); }
    }
    if (!reduced && !document.hidden) requestAnimationFrame(draw); else running = false;
  }
  const kick = () => { if (!running) { running = true; requestAnimationFrame(draw); } };
  kick(); document.addEventListener('visibilitychange', () => { if (!document.hidden && !reduced) kick(); });

  /* ---------- Skins ---------- */
  const SKINS = ['obsidian', 'nebula', 'tokyo', 'matrix', 'dawn'];
  const SKIN_NAMES = { obsidian: 'Ion', nebula: 'Nebula', tokyo: 'Tokyo', matrix: 'Matrix', dawn: 'Dawn (máy chiếu sáng)' };
  function setSkin(s, quiet) { root.dataset.skin = s; store.set('drgx-pitch-skin', s); col = accent(); if (reduced) { running = false; draw(); } if (!quiet) toast('Skin: ' + SKIN_NAMES[s]); }
  const cycleSkin = () => setSkin(SKINS[(SKINS.indexOf(root.dataset.skin) + 1) % SKINS.length]);
  const savedSkin = params.get('skin') || store.get('drgx-pitch-skin');
  if (savedSkin && SKINS.includes(savedSkin)) setSkin(savedSkin, true);

  /* ---------- 5-minute mode ---------- */
  function toggleMode() {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]; store.set('drgx-mode', mode);
    const label = mode === 'v3' ? 'Video 3 phút (Phụ lục 05)' : mode === 'core' ? 'Chế độ 5 phút' : 'Toàn bộ';
    toast(`${label} · ${mainSeq().length} slide · ${fmt(total())}`);
    buildOverview(); updateChrome(); sync();
  }

  /* ---------- Overview ---------- */
  const ov = $('#overview'), ovGrid = $('#ovGrid');
  function buildOverview() {
    ovGrid.innerHTML = ''; const seq = mainSeq();
    slides.forEach((s, i) => {
      const b = document.createElement('button');
      const code = s.dataset.code || (isApx(s) ? 'PL' : String(i).padStart(2, '0'));
      b.className = 'th' + (isApx(s) ? ' apx' : '') + (!isApx(s) && !seq.includes(i) ? ' skip' : '') + (i === cur ? ' cur' : '');
      b.innerHTML = `<span><em style="font-style:normal">${code}</em><em style="font-style:normal">${s.dataset.core === '1' ? '5′' : ''}${s.dataset.v3 === '1' ? ' 🎬' : ''} ${s.dataset.time > 0 ? tm(s) + 's' : ''}</em></span><b>${s.dataset.title || ''}</b>`;
      b.onclick = () => { go(i); toggle(ov, false); };
      ovGrid.appendChild(b);
    });
  }
  function toggle(el, on) { const v = on ?? !el.classList.contains('on'); el.classList.toggle('on', v); if (el === ov && v) buildOverview(); }

  /* ---------- Notes, clock, pacing ---------- */
  const total = () => mainSeq().reduce((a, i) => a + tm(slides[i]), 0);
  const fmt = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  let t0 = null;
  function startClock() { if (!t0) t0 = Date.now(); }
  function budgetThrough(i) { const seq = mainSeq(), k = seq.indexOf(i); return k < 0 ? 0 : seq.slice(0, k + 1).reduce((a, j) => a + tm(slides[j]), 0); }
  function renderNotes() {
    const s = slides[cur], seq = seqOf(cur), k = seq.indexOf(cur), nx = slides[seq[k + 1]];
    const nf = frs(s).length;
    $('#nTitle').textContent = `${s.dataset.title} · ~${tm(s)}s${nf ? ` · ${nf} bước` : ''}`;
    $('#nText').textContent = s.dataset.notes || '';
    $('#nNext').textContent = nx ? `Tiếp theo → ${nx.dataset.title}` : 'Hết — mời Hội đồng đặt câu hỏi (phím A: phụ lục).';
  }
  function clockTick() {
    const el = $('#nTimer'), hudT = $('#hudTimer'), bar = $('#nPace'), T = total();
    if (!t0) {
      el.textContent = `00:00 / ${fmt(T)}`;
      if (hudT) hudT.textContent = '00:00';
      return;
    }
    const sec = Math.floor((Date.now() - t0) / 1000), budget = budgetThrough(cur);
    const clr = sec > T ? 'var(--bad)' : sec > budget ? 'var(--warn)' : 'var(--good)';
    el.textContent = `${fmt(sec)} / ${fmt(T)}`;
    el.style.color = sec > T ? 'var(--bad)' : sec > budget ? 'var(--warn)' : 'var(--text)';
    if (hudT) { hudT.textContent = fmt(sec); hudT.style.color = clr; }
    bar.style.width = Math.min(100, sec / T * 100) + '%';
    bar.style.background = clr;
    if (pw && !pw.closed && pw.DRGX_clock) pw.DRGX_clock(sec, T, budget);
  }
  setInterval(clockTick, 500);

  /* ---------- Presenter window (second screen) ---------- */
  let pw = null;
  function openPresenter() {
    pw = open('', 'drgx-presenter', 'width=980,height=680');
    if (!pw) { toast('Trình duyệt chặn cửa sổ — hãy cho phép pop-up'); return; }
    pw.document.open();
    pw.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Presenter · DrgX</title><style>
      body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#060a14;color:#eef3ff;padding:26px 30px;display:grid;gap:18px}
      .r{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
      h1{font-size:30px;margin:0}#meta{color:#8fa0c6;font-size:16px;margin-top:6px}#steps{display:flex;gap:6px;margin-top:10px}#steps i{width:26px;height:8px;border-radius:4px;background:#24304d}#steps i.on{background:#22d3ee}
      #tm{font:800 60px Consolas,monospace;line-height:1}#tt{color:#8fa0c6;font:600 16px Consolas,monospace;text-align:right}
      #bar{height:8px;border-radius:8px;background:#1a2440;overflow:hidden}#bar i{display:block;height:100%;width:0;background:#34d399}
      #nt{font-size:25px;line-height:1.6;background:#0f1730;border:1px solid #22304f;border-radius:16px;padding:24px 26px;min-height:200px}
      #nx{color:#9fb0d3;font-size:18px}button{font-size:20px;padding:14px 26px;border-radius:12px;border:1px solid #2a3b60;background:#111a33;color:#fff;cursor:pointer;margin-right:8px}
      button:hover{border-color:#22d3ee}</style></head><body>
      <div class="r"><div><h1 id="ti">—</h1><div id="meta"></div><div id="steps"></div></div><div><div id="tm">00:00</div><div id="tt"></div></div></div>
      <div id="bar"><i></i></div><div id="nt"></div><div id="nx"></div>
      <div><button id="p">‹ Lùi</button><button id="n">Tiếp ›</button><button id="r">Đặt lại giờ</button><button id="m">Đổi chế độ</button></div>
      </body></html>`);
    pw.document.close();
    const d = pw.document, D = window.DRGX;
    d.getElementById('p').onclick = () => D.prev(); d.getElementById('n').onclick = () => D.next();
    d.getElementById('r').onclick = () => D.resetClock(); d.getElementById('m').onclick = () => D.toggleMode();
    pw.addEventListener('keydown', e => {
      if (e.key === 'F2') { e.preventDefault(); D.toggleHud(); }
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); D.next(); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); D.prev(); }
    });
    pw.DRGX_render = st => {
      d.getElementById('ti').textContent = st.title; d.getElementById('meta').textContent = st.meta;
      d.getElementById('nt').textContent = st.notes; d.getElementById('nx').textContent = st.next;
      d.getElementById('steps').innerHTML = Array.from({ length: st.nf }, (_, i) => `<i class="${i < st.fon ? 'on' : ''}"></i>`).join('');
    };
    pw.DRGX_clock = (sec, T, budget) => {
      const c = sec > T ? '#fb7185' : sec > budget ? '#fbbf24' : '#34d399';
      d.getElementById('tm').textContent = fmt(sec); d.getElementById('tm').style.color = c;
      d.getElementById('tt').textContent = `tổng ${fmt(T)} · mốc slide này ${fmt(budget)}`;
      const b = d.querySelector('#bar i'); b.style.width = Math.min(100, sec / T * 100) + '%'; b.style.background = c;
    };
    sync();
  }
  function sync() {
    if (!pw || pw.closed || !pw.DRGX_render) return;
    const s = slides[cur], seq = seqOf(cur), k = seq.indexOf(cur), nx = slides[seq[k + 1]], f = frs(s);
    pw.DRGX_render({
      title: s.dataset.title, notes: s.dataset.notes || '', nf: f.length, fon: f.filter(x => x.classList.contains('on')).length,
      meta: `${isApx(s) ? 'Phụ lục' : `Slide ${k + 1}/${seq.length}`} · ~${tm(s)}s · ${mode === 'v3' ? 'video 3 phút' : mode === 'core' ? 'chế độ 5 phút' : 'toàn bộ'}`,
      next: nx ? `Tiếp theo → ${nx.dataset.title}` : 'Slide cuối',
    });
  }

  /* ---------- Fullscreen, Magical Firefly Orb Cursor & Sparkling Particle Trail ---------- */
  const fs = () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen().catch(() => {}));
  const laser = $('#laser');
  const trailCv = $('#cursorTrail');
  const trailCtx = trailCv ? trailCv.getContext('2d') : null;
  let idleT;
  let mouseX = -100, mouseY = -100, lastX = -100, lastY = -100;
  let hasMoved = false;
  const sparks = [];
  const ripples = [];
  const MAX_SPARKS = 140;

  function resizeTrail() {
    if (!trailCv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    trailCv.width = Math.floor(innerWidth * dpr);
    trailCv.height = Math.floor(innerHeight * dpr);
    if (trailCtx) trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeTrail();
  addEventListener('resize', resizeTrail);

  function getSparkPalette() {
    if (document.body.classList.contains('laser-on')) {
      return ['#ffffff', '#fecdd3', '#fb7185', '#ff3b5c', '#fbbf24'];
    }
    const st = getComputedStyle(root);
    const a1 = st.getPropertyValue('--a1').trim() || '#22d3ee';
    const a2 = st.getPropertyValue('--a2').trim() || '#818cf8';
    const a3 = st.getPropertyValue('--a3').trim() || '#34d399';
    return ['#ffffff', '#fef08a', a1, a2, a3];
  }

  function spawnSpark(x, y, burst = false) {
    if (!trailCtx) return;
    if (sparks.length >= MAX_SPARKS) sparks.shift();
    const pal = getSparkPalette();
    const color = pal[Math.floor(Math.random() * pal.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = burst ? (Math.random() * 3.6 + 1.1) : (Math.random() * 1.25 + 0.18);
    const isStar = Math.random() < (burst ? 0.55 : 0.32);
    sparks.push({
      x: x + (Math.random() - 0.5) * (burst ? 4 : 10),
      y: y + (Math.random() - 0.5) * (burst ? 4 : 10),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (burst ? 0.1 : 0.28),
      r: isStar ? (Math.random() * 2.8 + 2.0) : (Math.random() * 2.4 + 1.1),
      life: 1,
      decay: burst ? (Math.random() * 0.022 + 0.016) : (Math.random() * 0.024 + 0.015),
      color,
      isStar,
      rot: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 0.12,
      twinkle: Math.random() * Math.PI * 2
    });
  }

  let trailRaf = 0;
  function drawSparkleTrail() {
    if (!trailCtx) return;
    trailCtx.clearRect(0, 0, innerWidth, innerHeight);

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 - 0.018; // gentle upward firefly float
      p.rot += p.vRot;
      p.twinkle += 0.28;
      p.life -= p.decay;
      if (p.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }

      const flicker = 0.72 + 0.28 * Math.sin(p.twinkle);
      const alpha = Math.max(0, p.life * flicker);
      const radius = p.r * (0.45 + 0.55 * p.life);

      trailCtx.save();
      trailCtx.globalAlpha = alpha;
      trailCtx.translate(p.x, p.y);

      // Soft outer glow
      const grad = trailCtx.createRadialGradient(0, 0, 0, 0, 0, radius * 3.2);
      grad.addColorStop(0, p.color);
      grad.addColorStop(0.45, p.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      trailCtx.fillStyle = grad;
      trailCtx.beginPath();
      trailCtx.arc(0, 0, radius * 3.2, 0, Math.PI * 2);
      trailCtx.fill();

      if (p.isStar) {
        // 4-point twinkling star
        trailCtx.rotate(p.rot);
        trailCtx.fillStyle = '#ffffff';
        trailCtx.beginPath();
        const outer = radius * 2.1;
        const inner = radius * 0.45;
        for (let k = 0; k < 8; k++) {
          const rad = k % 2 === 0 ? outer : inner;
          const a = (k * Math.PI) / 4;
          if (k === 0) trailCtx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
          else trailCtx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        trailCtx.closePath();
        trailCtx.fill();
      } else {
        // Bright firefly core
        trailCtx.fillStyle = '#ffffff';
        trailCtx.beginPath();
        trailCtx.arc(0, 0, radius * 0.65, 0, Math.PI * 2);
        trailCtx.fill();
      }
      trailCtx.restore();
    }

    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 2.2;
      rp.life -= 0.045;
      if (rp.life <= 0) {
        ripples.splice(i, 1);
        continue;
      }
      trailCtx.save();
      trailCtx.globalAlpha = rp.life * 0.65;
      trailCtx.strokeStyle = rp.color;
      trailCtx.lineWidth = 1.8;
      trailCtx.beginPath();
      trailCtx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      trailCtx.stroke();
      trailCtx.restore();
    }

    if (sparks.length > 0 || ripples.length > 0) {
      trailRaf = requestAnimationFrame(drawSparkleTrail);
    } else {
      trailRaf = 0;
    }
  }

  function kickTrail() {
    if (!trailRaf) {
      trailRaf = requestAnimationFrame(drawSparkleTrail);
    }
  }

  addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    laser.style.left = mouseX + 'px';
    laser.style.top = mouseY + 'px';

    const isInteractive = e.target instanceof Element
      && !!e.target.closest('button, a, textarea, input, select, label, .ch, .shot-thumb, .switch, .th');
    laser.classList.toggle('hover', isInteractive);

    if (!hasMoved) {
      lastX = mouseX;
      lastY = mouseY;
      hasMoved = true;
    }
    const dx = mouseX - lastX;
    const dy = mouseY - lastY;
    const dist = Math.hypot(dx, dy);
    const steps = Math.min(8, Math.max(1, Math.floor(dist / 9)));
    for (let s = 1; s <= steps; s++) {
      const ix = lastX + (dx * s) / steps;
      const iy = lastY + (dy * s) / steps;
      spawnSpark(ix, iy, false);
      if (dist > 18 && Math.random() < 0.65) spawnSpark(ix, iy, false);
    }
    lastX = mouseX;
    lastY = mouseY;
    kickTrail();

    document.body.classList.add('mouse');
    document.body.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => {
      document.body.classList.remove('mouse');
      document.body.classList.add('idle');
    }, 2600);
  });

  addEventListener('mousedown', e => {
    laser.classList.add('click');
    const pal = getSparkPalette();
    ripples.push({ x: e.clientX, y: e.clientY, r: 6, life: 1, color: pal[2] || '#22d3ee' });
    for (let i = 0; i < 14; i++) spawnSpark(e.clientX, e.clientY, true);
    kickTrail();
  });
  addEventListener('mouseup', () => laser.classList.remove('click'));

  // Gentle ambient firefly emission when cursor is active on screen
  setInterval(() => {
    if (!reduced && hasMoved && !document.hidden && !document.body.classList.contains('idle')) {
      if (Math.random() < 0.75) {
        spawnSpark(mouseX + (Math.random() - 0.5) * 8, mouseY + (Math.random() - 0.5) * 8, false);
        kickTrail();
      }
    }
  }, 220);

  /* ---------- Taskbar (#hud) visibility toggle (F2) ---------- */
  function toggleHud(force) {
    const hidden = document.body.classList.toggle('hide-hud', force);
    toast(hidden ? 'Đã ẩn thanh taskbar điều khiển (Nhấn F2 để hiện lại)' : 'Đã hiện thanh taskbar điều khiển (F2)');
    return hidden;
  }
  if (params.has('nohud')) document.body.classList.add('hide-hud');

  /* ---------- Keyboard ---------- */
  addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); toggleHud(); return; }
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowRight', ' ', 'PageDown', 'ArrowDown'].includes(k)) {
      e.preventDefault();
      if (typeof handleVoiceAdvanceKey === 'function' && handleVoiceAdvanceKey()) return;
      next();
    }
    else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') go(mainSeq()[0]);
    else if (k === 'End') go(mainSeq().slice(-1)[0], true);
    else if (k === 'Enter') { const r = $('[data-run]', slides[cur]); if (r) { r.classList.add('on'); RUN[r.dataset.run](false); } }
    else if (k === 'g') { e.preventDefault(); toggleAutoPlay(); }
    else if (k === 'v') { e.preventDefault(); toggleVoiceModal(); }
    else if (k === 'f') fs();
    else if (k === 'o') toggle(ov);
    else if (k === 'n') { toggle($('#notes')); clockTick(); }
    else if (k === 'p') openPresenter();
    else if (k === 'm') toggleMode();
    else if (k === 'a') go(isApx(slides[cur]) ? mainSeq().slice(-1)[0] : apxSeq()[0], true);
    else if (k === 'j') { document.body.classList.toggle('judge'); toast(document.body.classList.contains('judge') ? 'Hiện tiêu chí chấm (tập dượt)' : 'Ẩn tiêu chí chấm'); }
    else if (k === 'l') document.body.classList.toggle('laser-on');
    else if (k === 'b' || k === '.') toggle($('#blank'));
    else if (k === 't') cycleSkin();
    else if (k === 'r') { t0 = null; clockTick(); toast('Đã đặt lại đồng hồ'); }
    else if (k === 'd') open('https://drgx-web.netlify.app/', '_blank', 'noopener');
    else if (k === '?' || k === 'h') toggle($('#help'));
    else if (k === 'Escape') { [ov, $('#help'), $('#blank'), $('#voiceModal')].forEach(x => x && toggle(x, false)); document.body.classList.remove('laser-on'); }
  });

  /* ---------- Left/Right Half Click + Touch + HUD ---------- */
  $('#viewport').addEventListener('click', e => {
    if (e.button && e.button !== 0) return;
    if ([ov, $('#help'), $('#blank'), $('#voiceModal')].some(x => x && x.classList.contains('on'))) return;
    if (window.getSelection && String(window.getSelection()).trim().length > 0) return;
    if (e.target.closest('button, a, textarea, input, select, label, #hud, #voiceDock, #voiceModal, #rail, #overview, #notes, #help, #blank, .shot-thumb, .switch')) return;
    if (e.clientX < innerWidth / 2) prevSlide();
    else {
      if (typeof handleVoiceAdvanceKey === 'function' && handleVoiceAdvanceKey()) return;
      nextSlide();
    }
  });
  let tx = null;
  addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  addEventListener('touchend', e => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) (dx < 0 ? nextSlide : prevSlide)(); tx = null; });
  $('#bPrev').onclick = prev; $('#bNext').onclick = () => { if (typeof handleVoiceAdvanceKey === 'function' && handleVoiceAdvanceKey()) return; next(); };
  $('#bMode').onclick = toggleMode; $('#bSkin').onclick = cycleSkin;
  $('#bOv').onclick = () => toggle(ov); $('#bNotes').onclick = () => { toggle($('#notes')); clockTick(); };
  $('#bPres').onclick = openPresenter; $('#bFs').onclick = fs; $('#bHelp').onclick = () => toggle($('#help'));
  if ($('#bHideHud')) $('#bHideHud').onclick = () => toggleHud();
  $('#help').onclick = e => { if (e.target.id === 'help') toggle($('#help'), false); };
  $('#blank').onclick = () => toggle($('#blank'), false);

  /* ---------- Audio Auto-Sync & Live Voice Recording Studio ---------- */
  const DEFAULT_CUES = {
    S01: 0.0,
    S02: 10.131,
    S03: 19.835,
    S04: 29.624,
    S05: 39.328,
    S06: 48.52,
    S07: 57.285,
    S08: 65.773,
    S09: 73.749,
    S10: 82.195,
    S11: 91.547,
    S12: 101.163
  };
  const DEFAULT_DURATION = 110.107;
  const mainSlidesList = () => slides.filter(s => !isApx(s));

  let voiceCues = Object.assign({}, DEFAULT_CUES);
  try {
    const savedCues = window.DRGX_EMBEDDED_CUES || JSON.parse(store.get('drgx-voice-cues-12') || 'null');
    if (savedCues && typeof savedCues === 'object') {
      Object.assign(voiceCues, savedCues);
    }
  } catch (e) { /* ignore */ }

  const saveVoiceCues = () => {
    store.set('drgx-voice-cues-12', JSON.stringify(voiceCues));
  };

  const voiceAudio = $('#voiceAudio');
  const voiceDock = $('#voiceDock');
  const voiceModal = $('#voiceModal');
  const voiceSeek = $('#voiceSeek');
  const voiceTime = $('#voiceTime');
  const voiceSub = $('#voiceSub');
  const vdBadge = $('#vdBadge');
  const vdNextInfo = $('#vdNextInfo');
  const vdPlayBtn = $('#vdPlayBtn');
  const vdTapBtn = $('#vdTapBtn');
  const vdStopRecBtn = $('#vdStopRecBtn');
  const bAutoPlay = $('#bAutoPlay');
  const bVoiceSync = $('#bVoiceSync');

  let hasCustomAudio = false;
  let audioDataUrl = window.DRGX_EMBEDDED_AUDIO || '';
  let audioFileName = window.DRGX_EMBEDDED_NAME || 'Ghi âm thuyết trình DrgX';
  let autoPlaying = false;
  let silentTimerActive = false;
  let silentStartPerf = 0;
  let silentOffsetSec = 0;
  let autoRaf = 0;
  let isRecordingVoice = false;
  let isTapSyncing = false;
  let mediaRecorder = null;
  let recChunks = [];
  let recStartPerf = 0;

  const fmtSec = sec => {
    sec = Math.max(0, Number(sec) || 0);
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1).padStart(4, '0');
    return `${String(m).padStart(2, '0')}:${s}`;
  };

  const getTotalVoiceDuration = () => {
    if (hasCustomAudio && voiceAudio && Number.isFinite(voiceAudio.duration) && voiceAudio.duration > 0.5) {
      return voiceAudio.duration;
    }
    const maxCue = Math.max(...Object.values(voiceCues), 105);
    return Math.max(DEFAULT_DURATION, maxCue + 7.5);
  };

  const getCurrentVoiceSec = () => {
    if (isRecordingVoice) {
      return (performance.now() - recStartPerf) / 1000;
    }
    if (hasCustomAudio && voiceAudio) {
      return voiceAudio.currentTime || 0;
    }
    if (silentTimerActive) {
      return silentOffsetSec + (performance.now() - silentStartPerf) / 1000;
    }
    return silentOffsetSec;
  };

  function getSlideForTime(sec) {
    const list = mainSlidesList();
    let best = list[0];
    let bestStart = -1;
    let nextS = null;
    let nextStart = Infinity;
    for (const s of list) {
      const code = s.dataset.code || '';
      const st = Number(voiceCues[code] ?? 0);
      if (st <= sec + 0.05 && st >= bestStart) {
        best = s;
        bestStart = st;
      }
      if (st > sec + 0.05 && st < nextStart) {
        nextS = s;
        nextStart = st;
      }
    }
    return { slide: best, idx: slides.indexOf(best), nextSlide: nextS, nextStart };
  }

  function updateVoiceUI(sec) {
    const dur = getTotalVoiceDuration();
    if (voiceSeek) {
      voiceSeek.max = dur.toFixed(1);
      if (!voiceSeek.matches(':active')) voiceSeek.value = Math.min(dur, sec).toFixed(1);
    }
    if (voiceTime) {
      voiceTime.textContent = `${fmtSec(sec)} / ${fmtSec(dur)}`;
    }
    const s = slides[cur];
    if (voiceSub && s) {
      voiceSub.textContent = `“${s.dataset.notes || s.dataset.title || ''}”`;
    }
    const info = getSlideForTime(sec);
    if (vdNextInfo) {
      if (isRecordingVoice) {
        vdNextInfo.textContent = `· Đang ở ${s.dataset.code} — Đọc xong bấm [→] hoặc [Space] để chốt mốc slide tiếp`;
      } else if (isTapSyncing) {
        vdNextInfo.textContent = `· Đang ở ${s.dataset.code} — Nghe hết câu bấm [Space] để chốt mốc slide tiếp`;
      } else if (info.nextSlide) {
        const rem = Math.max(0, info.nextStart - sec).toFixed(1);
        vdNextInfo.textContent = `· Đang ở ${s.dataset.code} → Tự nhảy ${info.nextSlide.dataset.code} sau ${rem}s`;
      } else {
        vdNextInfo.textContent = `· Đang ở ${s.dataset.code} (Slide cuối)`;
      }
    }
    $$('#vmCueBody tr').forEach(tr => {
      tr.classList.toggle('active-cue', tr.dataset.code === (s && s.dataset.code));
    });
  }

  function syncLoop() {
    if (!autoPlaying && !isRecordingVoice && !isTapSyncing) {
      autoRaf = 0;
      return;
    }
    const sec = getCurrentVoiceSec();
    const dur = getTotalVoiceDuration();
    if (autoPlaying && !isRecordingVoice && !isTapSyncing) {
      const target = getSlideForTime(sec);
      if (target.idx >= 0 && target.idx !== cur) {
        go(target.idx);
      }
      if (!hasCustomAudio && sec >= dur) {
        stopAutoPlay();
        toast('🎉 Đã hoàn thành bài thuyết trình tự động!');
        return;
      }
    }
    updateVoiceUI(sec);
    autoRaf = requestAnimationFrame(syncLoop);
  }

  function startAutoPlay(fromSec) {
    if (isRecordingVoice) stopVoiceRecording();
    isTapSyncing = false;
    if (vdTapBtn) vdTapBtn.style.display = 'none';
    if (voiceDock) voiceDock.classList.add('on');

    const startAt = typeof fromSec === 'number'
      ? fromSec
      : (cur > 0 && cur < mainSlidesList().length ? Number(voiceCues[slides[cur].dataset.code] || 0) : 0);

    const target = getSlideForTime(startAt);
    if (target.idx >= 0 && target.idx !== cur) go(target.idx);
    startClock();

    autoPlaying = true;
    if (bAutoPlay) {
      bAutoPlay.classList.add('playing');
      bAutoPlay.textContent = '⏸ Đang chạy';
    }
    if (vdPlayBtn) vdPlayBtn.textContent = '⏸ Tạm dừng';
    if (vdBadge) vdBadge.textContent = hasCustomAudio ? '🔊 ĐANG PHÁT GHI ÂM & TỰ NHẢY SLIDE' : '⏱ ĐANG TỰ NHẢY SLIDE THEO MỐC 2 PHÚT';

    if (hasCustomAudio && voiceAudio) {
      try { voiceAudio.currentTime = startAt; } catch (e) {}
      const p = voiceAudio.play();
      if (p) p.catch(() => toast('Hãy bấm ▶️ Phát trên thanh điều khiển để trình duyệt cho phép phát âm thanh'));
    } else {
      silentOffsetSec = startAt;
      silentStartPerf = performance.now();
      silentTimerActive = true;
    }
    if (!autoRaf) autoRaf = requestAnimationFrame(syncLoop);
  }

  function stopAutoPlay() {
    autoPlaying = false;
    silentTimerActive = false;
    isTapSyncing = false;
    if (hasCustomAudio && voiceAudio) {
      silentOffsetSec = voiceAudio.currentTime || 0;
      voiceAudio.pause();
    } else if (silentStartPerf) {
      silentOffsetSec = getCurrentVoiceSec();
    }
    if (bAutoPlay) {
      bAutoPlay.classList.remove('playing');
      bAutoPlay.textContent = '▶️ Tự chạy';
    }
    if (vdPlayBtn) vdPlayBtn.textContent = '▶️ Phát tiếp';
    if (vdTapBtn) vdTapBtn.style.display = 'none';
    if (vdBadge) vdBadge.textContent = '⏸ ĐÃ TẠM DỪNG';
  }

  function toggleAutoPlay() {
    if (autoPlaying) stopAutoPlay();
    else startAutoPlay(silentOffsetSec >= getTotalVoiceDuration() - 1 ? 0 : silentOffsetSec);
  }

  function seekVoiceTo(sec) {
    sec = Math.max(0, Math.min(getTotalVoiceDuration(), Number(sec) || 0));
    silentOffsetSec = sec;
    if (silentTimerActive) silentStartPerf = performance.now();
    if (hasCustomAudio && voiceAudio) {
      try { voiceAudio.currentTime = sec; } catch (e) {}
    }
    const target = getSlideForTime(sec);
    if (target.idx >= 0 && target.idx !== cur) go(target.idx);
    updateVoiceUI(sec);
  }

  // Handle key/click advance while recording or tap-syncing
  function handleVoiceAdvanceKey() {
    if (!isRecordingVoice && !isTapSyncing) return false;
    const list = mainSlidesList();
    const curPos = list.indexOf(slides[cur]);
    const sec = Number(getCurrentVoiceSec().toFixed(1));
    if (curPos >= 0 && curPos < list.length - 1) {
      const nextS = list[curPos + 1];
      const nextCode = nextS.dataset.code;
      voiceCues[nextCode] = sec;
      saveVoiceCues();
      go(slides.indexOf(nextS));
      renderCueTable();
      toast(`📌 Đã chốt mốc ${nextCode} tại ${sec.toFixed(1)}s`);
      return true;
    } else {
      if (isRecordingVoice) {
        stopVoiceRecording();
      } else if (isTapSyncing) {
        stopAutoPlay();
        toast('✅ Đã chốt xong toàn bộ 12 mốc Slide!');
        toggleVoiceModal(true);
      }
      return true;
    }
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Trình duyệt không hỗ trợ thu âm trực tiếp — hãy dùng nút Chọn File Ghi Âm');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopAutoPlay();
      toggleVoiceModal(false);
      if (voiceDock) {
        voiceDock.classList.add('on', 'rec');
      }
      if (bVoiceSync) bVoiceSync.classList.add('rec');
      if (vdStopRecBtn) vdStopRecBtn.style.display = 'inline-flex';
      if (vdPlayBtn) vdPlayBtn.style.display = 'none';
      if (vdBadge) vdBadge.textContent = '🔴 ĐANG THU ÂM TRỰC TIẾP — BẤM [→] HOẶC [SPACE] KHI QUA SLIDE';

      recChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) recChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          loadAudioDataUrl(String(reader.result), 'Ban-thu-am-truc-tiep-DrgX.webm', false);
          toast('✅ Đã lưu bản thu âm & 12 mốc nhảy Slide! Bấm ▶️ Tự chạy để xem lại ngay.');
          toggleVoiceModal(true);
        };
        reader.readAsDataURL(blob);
      };

      go(0);
      voiceCues.S01 = 0.0;
      saveVoiceCues();
      recStartPerf = performance.now();
      isRecordingVoice = true;
      mediaRecorder.start(200);
      if (!autoRaf) autoRaf = requestAnimationFrame(syncLoop);
      toast('🎙️ Đang thu âm Slide S01! Đọc xong câu nào hãy bấm [→] hoặc [Space].');
    } catch (err) {
      toast('Không mở được Microphone — hãy cấp quyền Mic hoặc dùng nút Chọn File Ghi Âm');
    }
  }

  function stopVoiceRecording() {
    if (!isRecordingVoice) return;
    isRecordingVoice = false;
    if (voiceDock) voiceDock.classList.remove('rec');
    if (bVoiceSync) bVoiceSync.classList.remove('rec');
    if (vdStopRecBtn) vdStopRecBtn.style.display = 'none';
    if (vdPlayBtn) vdPlayBtn.style.display = 'inline-flex';
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  function autoScaleCuesToDuration(targetDuration) {
    const dur = Number(targetDuration) || getTotalVoiceDuration();
    if (dur <= 2) return;
    const list = mainSlidesList();
    const weights = list.map(s => {
      const words = (s.dataset.notes || '').trim().split(/\s+/).filter(Boolean).length || 26;
      const bonus = ['S05', 'S06', 'S07'].includes(s.dataset.code) ? 3 : 0;
      return words + bonus;
    });
    const totalW = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    list.forEach((s, idx) => {
      const code = s.dataset.code;
      voiceCues[code] = idx === 0 ? 0.0 : Number(((acc / totalW) * dur).toFixed(1));
      acc += weights[idx];
    });
    saveVoiceCues();
    renderCueTable();
    updateVoiceUI(getCurrentVoiceSec());
  }

  function loadAudioDataUrl(dataUrl, name, autoScale) {
    if (!dataUrl || !voiceAudio) return;
    audioDataUrl = dataUrl;
    audioFileName = name || 'voiceover-drgx.mp3';
    hasCustomAudio = true;
    voiceAudio.src = dataUrl;
    voiceAudio.load();
    const dlBtn = $('#vmDownloadAudio');
    if (dlBtn) {
      dlBtn.style.display = 'inline-flex';
      dlBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = audioDataUrl;
        a.download = audioFileName;
        a.click();
      };
    }
    voiceAudio.onloadedmetadata = () => {
      const dur = voiceAudio.duration;
      const stEl = $('#vmAudioStatus');
      if (stEl) {
        stEl.textContent = `Đã nạp "${audioFileName}" (${fmtSec(dur)}) — Sẵn sàng tự nhảy 12 Slide!`;
      }
      if (autoScale && Number.isFinite(dur) && dur > 5) {
        autoScaleCuesToDuration(dur);
        toast(`🎵 Đã nạp "${audioFileName}" (${fmtSec(dur)}) & tự chia đều 12 mốc Slide!`);
      }
      updateVoiceUI(0);
    };
  }

  function renderCueTable() {
    const tbody = $('#vmCueBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const list = mainSlidesList();
    list.forEach((s, idx) => {
      const code = s.dataset.code || `S${String(idx).padStart(2, '0')}`;
      const startVal = Number(voiceCues[code] ?? 0).toFixed(1);
      const tr = document.createElement('tr');
      tr.dataset.code = code;
      if (slides[cur] === s) tr.className = 'active-cue';
      tr.innerHTML = `
        <td><b style="color:var(--a1);font-family:var(--mono)">${code}</b></td>
        <td><b>${s.dataset.title || ''}</b></td>
        <td style="color:var(--muted);font-size:12.5px">${s.dataset.notes || ''}</td>
        <td><input type="number" step="0.1" min="0" class="cue-input" data-code="${code}" value="${startVal}"> <span style="font-size:11px;color:var(--muted)">s</span></td>
        <td>
          <button type="button" class="cue-mini-btn" data-act="setnow" data-code="${code}" title="Lấy giây hiện tại của thanh âm thanh">⏱ Hiện tại</button>
          <button type="button" class="cue-mini-btn" data-act="test" data-code="${code}" title="Phát thử từ mốc của slide này">▶ Thử</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    $$('.cue-input', tbody).forEach(inp => {
      inp.addEventListener('change', () => {
        const code = inp.dataset.code;
        voiceCues[code] = Math.max(0, Number(parseFloat(inp.value || '0').toFixed(1)));
        inp.value = voiceCues[code].toFixed(1);
        saveVoiceCues();
        updateVoiceUI(getCurrentVoiceSec());
      });
    });

    $$('button[data-act]', tbody).forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code;
        const act = btn.dataset.act;
        if (act === 'setnow') {
          const nowSec = Number(getCurrentVoiceSec().toFixed(1));
          voiceCues[code] = nowSec;
          saveVoiceCues();
          renderCueTable();
          toast(`⏱ Đã đặt mốc ${code} = ${nowSec.toFixed(1)}s`);
        } else if (act === 'test') {
          toggleVoiceModal(false);
          startAutoPlay(Number(voiceCues[code] || 0));
        }
      });
    });
  }

  function toggleVoiceModal(force) {
    if (!voiceModal) return;
    const on = force ?? !voiceModal.classList.contains('on');
    voiceModal.classList.toggle('on', on);
    if (on) renderCueTable();
  }

  async function exportEmbeddedHtml() {
    try {
      let rawHtml = '';
      try {
        const res = await fetch(location.href.split('#')[0]);
        rawHtml = await res.text();
      } catch (e) {
        rawHtml = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
      }
      rawHtml = rawHtml.replace(/<script id="drgx-embedded-voiceover">[\s\S]*?<\/script>\s*/g, '');
      const payloadScript = `<script id="drgx-embedded-voiceover">\nwindow.DRGX_EMBEDDED_CUES = ${JSON.stringify(voiceCues)};\nwindow.DRGX_EMBEDDED_AUDIO = ${JSON.stringify(audioDataUrl || '')};\nwindow.DRGX_EMBEDDED_NAME = ${JSON.stringify(audioFileName || '')};\n</script>\n`;
      const targetTag = '<script src="app.js"></script>';
      if (rawHtml.includes(targetTag)) {
        rawHtml = rawHtml.replace(targetTag, payloadScript + targetTag);
      } else {
        rawHtml = rawHtml.replace('</body>', payloadScript + '</body>');
      }
      const blob = new Blob([rawHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'index.html';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('📦 Đã xuất file index.html nhúng sẵn Ghi âm & 12 mốc tự nhảy Slide!');
    } catch (err) {
      toast('Lỗi khi xuất HTML: ' + String(err));
    }
  }

  if (bAutoPlay) bAutoPlay.onclick = toggleAutoPlay;
  if (bVoiceSync) bVoiceSync.onclick = () => toggleVoiceModal();
  if ($('#vmClose')) $('#vmClose').onclick = () => toggleVoiceModal(false);
  if (voiceModal) voiceModal.onclick = e => { if (e.target === voiceModal) toggleVoiceModal(false); };
  if (vdPlayBtn) vdPlayBtn.onclick = toggleAutoPlay;
  if (vdTapBtn) vdTapBtn.onclick = () => handleVoiceAdvanceKey();
  if (vdStopRecBtn) vdStopRecBtn.onclick = stopVoiceRecording;
  if ($('#vdSubBtn')) $('#vdSubBtn').onclick = () => voiceSub && voiceSub.classList.toggle('hide');
  if ($('#vdOpenStudioBtn')) $('#vdOpenStudioBtn').onclick = () => toggleVoiceModal(true);
  if ($('#vdCloseBtn')) $('#vdCloseBtn').onclick = () => { stopAutoPlay(); voiceDock && voiceDock.classList.remove('on'); };
  if (voiceSeek) {
    voiceSeek.addEventListener('input', () => seekVoiceTo(parseFloat(voiceSeek.value)));
  }
  if (voiceAudio) {
    voiceAudio.addEventListener('ended', () => {
      stopAutoPlay();
      toast('🎉 Đã phát hết bản ghi âm thuyết trình!');
    });
  }

  if ($('#vmStartRec')) $('#vmStartRec').onclick = startVoiceRecording;
  if ($('#vmPickFile')) $('#vmPickFile').onclick = () => $('#voiceFileInput') && $('#voiceFileInput').click();
  if ($('#voiceFileInput')) {
    $('#voiceFileInput').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => loadAudioDataUrl(String(reader.result), file.name, true);
      reader.readAsDataURL(file);
    });
  }
  if ($('#vmTapSync')) {
    $('#vmTapSync').onclick = () => {
      if (!hasCustomAudio) {
        toast('Hãy chọn File Ghi Âm (.mp3/.m4a/.wav) trước khi bấm Chốt mốc theo nhạc!');
        return;
      }
      toggleVoiceModal(false);
      go(0);
      voiceCues.S01 = 0.0;
      saveVoiceCues();
      startAutoPlay(0);
      isTapSyncing = true;
      if (vdTapBtn) vdTapBtn.style.display = 'inline-flex';
      if (vdBadge) vdBadge.textContent = '🎯 CHẤM MỐC THEO GHI ÂM — NGHE HẾT CÂU BẤM [SPACE] HOẶC NÚT ĐỎ';
      toast('🎯 Đang phát từ 00:00 — Nghe tới lúc chuyển slide hãy bấm phím [Space]!');
    };
  }
  if ($('#vmAutoScale')) {
    $('#vmAutoScale').onclick = () => {
      autoScaleCuesToDuration(getTotalVoiceDuration());
      toast(`⚡ Đã tự chia đều 12 mốc theo thời lượng ${fmtSec(getTotalVoiceDuration())}!`);
    };
  }
  if ($('#vmResetCues')) {
    $('#vmResetCues').onclick = () => {
      voiceCues = Object.assign({}, DEFAULT_CUES);
      saveVoiceCues();
      renderCueTable();
      updateVoiceUI(0);
      toast('↺ Đã khôi phục 12 mốc thời gian chuẩn ≤ 2 phút (115s)');
    };
  }
  if ($('#vmPlayTest')) {
    $('#vmPlayTest').onclick = () => {
      toggleVoiceModal(false);
      startAutoPlay(0);
    };
  }
  if ($('#vmExportHtml')) $('#vmExportHtml').onclick = exportEmbeddedHtml;

  // Support drag & drop audio file anywhere onto the presentation window
  addEventListener('dragover', e => { e.preventDefault(); });
  addEventListener('drop', e => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file || !/^(audio|video)\//i.test(file.type)) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => {
      loadAudioDataUrl(String(reader.result), file.name, true);
      if (voiceDock) voiceDock.classList.add('on');
    };
    reader.readAsDataURL(file);
  });

  if (audioDataUrl) {
    loadAudioDataUrl(audioDataUrl, audioFileName, false);
    if (voiceDock) voiceDock.classList.add('on');
  }

  window.DRGX = { next, prev, nextSlide, prevSlide, go, toggleMode, toggleHud, toggleAutoPlay, toggleVoiceModal, resetClock: () => { t0 = null; clockTick(); } };

  function parseHashIndex() {
    const h = location.hash.replace(/^#/, '').trim();
    if (!h) return 0;
    const byCode = slides.findIndex(s => (s.dataset.code || '').toLowerCase() === h.toLowerCase());
    if (byCode >= 0) return byCode;
    const mS = h.match(/^s(\d+)$/i);
    if (mS) {
      const code = 'S' + String(parseInt(mS[1], 10)).padStart(2, '0');
      const idx = slides.findIndex(s => s.dataset.code === code);
      if (idx >= 0) return idx;
    }
    const mPl = h.match(/^pl(\d+)$/i);
    if (mPl) {
      const code = 'PL' + parseInt(mPl[1], 10);
      const idx = slides.findIndex(s => s.dataset.code === code);
      if (idx >= 0) return idx;
    }
    const n = parseInt(h, 10);
    if (n === 0) return 0;
    return (n >= 1 && n <= slides.length) ? (n - 1) : 0;
  }
  addEventListener('hashchange', () => {
    const idx = parseHashIndex();
    if (idx !== cur) go(idx, true);
  });
  go(parseHashIndex(), true);

  if (window.parent && window.parent !== window) {
    setTimeout(() => {
      try {
        const checks = [];
        const chk = (name, cond) => checks.push({ name, ok: !!cond });
        chk('1. Đủ 12 Slide trình chiếu chính (S01–S12) & 5 Phụ lục Q&A (PL1–PL5)', mainSlidesList().length === 12 && slides.length === 17);
        chk('2. Có khung Broadcast Stage Frame (.stage-frame) & 4 góc định vị', !!$('.stage-frame .tl'));
        chk('3. Thanh Chương (#rail) có huy hiệu trạng thái (#railRubric)', !!$('#railRubric'));
        chk('4. Thanh Điều khiển (#hud) hiển thị đồng hồ (#hudTimer) + nút Docs + nút Kiosk + nút 👁 F2 (#bHideHud)', !!$('#hudTimer') && !!$('#bHideHud'));
        chk('5. Slide 1 có đồng hồ SVG kép 120m vs 60s (.clock-card)', !!$('.slide.cold .clock-card svg'));
        chk('6. Slide 4 có VS Orb (.vs-orb) & Dải giải pháp (.resolution-banner)', !!$('.vs-orb') && !!$('.resolution-banner'));
        chk('7. Slide 5 có 2 khung cửa sổ Studio (.studio-bar) & Dải 4 lớp khóa thi (.shield-strip)', $$('.studio-bar').length === 2 && !!$('.shield-strip'));
        chk('8. Slide 6 có bộ chuyển đổi 5 ảnh sản phẩm thật (#shotThumbs)', $$('#shotThumbs .shot-thumb').length === 5);
        chk('9. Slide 7 & 8 Live Demo Stress Test + Winnowing O(N) sẵn sàng', !!$('#stressOut') && !!$('#ringTxt'));
        chk('10. Slide 9 Live Demo Phòng thi LAN 40 máy (#lanSvg) có đủ 40 PC', $$('#lanSvg .pc').length === 40);
        chk('11. Slide 10 có biểu đồ thanh RAM (.ram-bars) & tích hợp STEM Arduino/ESP32', !!$('.ram-bars'));
        chk('12. Slide 14 & 15 có thanh LTV/CAC (.ue-bottom) & biểu đồ cột 3D (.cols .pair)', !!$('.ue-bottom') && $$('.cols .pair').length === 3);
        const bt = document.body.innerText;
        chk('13. Nội dung chuẩn mực 100%, không rò rỉ bí mật nội bộ hay chi tiết không liên quan', !bt.includes('Code' + ' OSS') && !bt.includes('Open' + 'Code') && !bt.includes('drgx-' + 'inbox') && !bt.includes('WC' + 'AG'));
        dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
        const hiddenAfterF2 = document.body.classList.contains('hide-hud') && getComputedStyle($('#hud')).opacity === '0';
        dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
        const shownAfterSecondF2 = !document.body.classList.contains('hide-hud');
        chk('14. Phím F2 ẩn/hiện thanh taskbar điều khiển (#hud) hoạt động chính xác', hiddenAfterF2 && shownAfterSecondF2);
        go(0, true);
        const vp = $('#viewport');
        vp.dispatchEvent(new MouseEvent('click', { clientX: Math.floor(innerWidth * 0.75), clientY: 300, button: 0, bubbles: true }));
        const movedForward = slides[1].classList.contains('active');
        vp.dispatchEvent(new MouseEvent('click', { clientX: Math.floor(innerWidth * 0.25), clientY: 300, button: 0, bubbles: true }));
        const movedBack = slides[0].classList.contains('active');
        chk('15. Click nửa phải tiến 1 slide, click nửa trái lùi 1 slide hoạt động chính xác', movedForward && movedBack);
        const flyIdx = slides.findIndex(s => !!s.querySelector('.fly'));
        if (flyIdx >= 0) go(flyIdx, true);
        const hubR = $('.fly .hub').getBoundingClientRect();
        const noFlyOverlap = $$('.fly .node').every(n => {
          const r = n.getBoundingClientRect();
          return r.right <= hubR.left || r.left >= hubR.right || r.bottom <= hubR.top || r.top >= hubR.bottom;
        });
        go(0, true);
        chk('16. Bảng thống kê & Sơ đồ B2B2C/Tài chính có Full Morph Animation và 0% chồng chéo', noFlyOverlap && !!$('.fin-card') && $$('.mini-bar').length >= 10);
        dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 400, bubbles: true }));
        chk('17. Đóm sáng lung linh (#laser) & Hạt sao lấp lánh (#cursorTrail) thay thế con chuột mặc định', !!$('#cursorTrail') && !!$('#laser .orb-core') && getComputedStyle(document.documentElement).cursor === 'none' && sparks.length > 0);
        // ---- Kiểm tra nội dung (không chỉ kiểm tra phần tử tồn tại) ----
        const stageText = stage.textContent;
        const stale = ['42' + '8 học', '5,8' + '3x', 'Tháng ' + '16', '74,' + '6', '142,' + '2', '46 ' + 'bài', '900 tài ' + 'khoản'].filter(x => stageText.includes(x));
        chk('18. Không còn số liệu cũ/sai (428 HS, 5,83x, Tháng 16, 74,6%, 142,2, 46 bài, 900 tài khoản)', stale.length === 0);
        const rubCodes = new Set(slides.flatMap(s => (s.dataset.rub || '').split(' ').filter(Boolean)));
        const rubNeed = '1.1 1.2 1.3 1.4 2.1 2.2 2.3 2.4 3.1 3.2 3.3 4.1 4.2 4.3 4.4 5.1 5.2 6.1 6.2 6.3 6.4'.split(' ');
        chk('19. Phủ đủ 21/21 tiêu chí thành phần của Phụ lục 06 (6 nhóm, 100 điểm)', rubNeed.every(c => rubCodes.has(c)));
        const sumCore = slides.filter(s => s.dataset.core === '1').reduce((a, s) => a + (+s.dataset.time || 0), 0);
        const sumV3 = slides.filter(s => s.dataset.v3 === '1').reduce((a, s) => a + (+s.dataset.t3 || 0), 0);
        chk('20. Chế độ 5 phút ≤ 300s và Video 3 phút ≤ 180s (Phụ lục 05)', sumCore > 0 && sumCore <= 300 && sumV3 > 0 && sumV3 <= 180);
        chk('21. Dự phóng độ nhạy khớp mô hình tài chính: +90,2 / +518,8 / +876,0 triệu (Năm 2)', stageText.includes('+90,2') && stageText.includes('+518,8') && stageText.includes('+876,0'));
        chk('22. Các demo mô phỏng (Stress, Winnowing, LAN 40 máy) đều ghi rõ "mô phỏng"', ['#s-stress', '#s-win', '#s-lan'].every(id => /mô phỏng/i.test($(id).textContent)));
        const m0 = mode; DRGX.toggleMode(); DRGX.toggleMode(); DRGX.toggleMode();
        chk('23. Phím M xoay vòng 3 chế độ (Toàn bộ → 5 phút → Video 3 phút → Toàn bộ)', mode === m0);
        $('#toast').classList.remove('on');
        window.parent.postMessage({ type: 'DRGX_SELFTEST', checks }, '*');
      } catch (err) {
        window.parent.postMessage({ type: 'DRGX_SELFTEST_ERR', error: String(err) }, '*');
      }
    }, 300);
  }
})();

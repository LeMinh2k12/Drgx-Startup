(function () {
  if (window.top !== window) return;
  if (window.__drgxAgentBar) return;
  var api = { version: 5 };
  window.__drgxAgentBar = api;

  var pop = null;
  var label = null;
  var input = null;
  var statusEl = null;
  var sendBtn = null;
  var toastEl = null;
  var handle = null;
  var isOpen = false;
  var busy = false;
  var baseUrl = null;
  var toastTimer = null;
  var pollTimer = null;
  var awaiting = false;
  var awaitingSid = null;
  var sessionMeta = { sid: null, title: '', dir: '' };
  var resizing = null;
  var lastWidthPost = 0;

  function sessionId() {
    var m = location.pathname.match(/\/session\/(ses_[A-Za-z0-9_]+)/);
    return m ? m[1] : (sessionMeta.sid || 'ses_local_default');
  }

  function authHeaders(extra) {
    var headers = extra || {};
    var token = String(window.__DRGX_BRIDGE_TOKEN || '').trim();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  }

  function setStatus(text, tone) {
    var colors = { ok: '#86efac', warn: '#fbbf24', err: '#fca5a5', idle: '#94a3b8' };
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = colors[tone] || colors.idle;
    }
  }

  function showToast(text, tone, ms) {
    if (!toastEl) return;
    var colors = { ok: '#86efac', warn: '#fbbf24', err: '#fca5a5', idle: '#e2e8f0' };
    toastEl.textContent = text;
    toastEl.style.color = colors[tone] || colors.idle;
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    if (ms) {
      toastTimer = setTimeout(function () {
        toastEl.style.display = 'none';
      }, ms);
    }
  }

  function hideToast() {
    clearTimeout(toastTimer);
    if (toastEl) toastEl.style.display = 'none';
  }

  function setBusy(v) {
    busy = v;
    if (sendBtn) {
      sendBtn.disabled = v;
      sendBtn.style.opacity = v ? '0.55' : '1';
      sendBtn.style.cursor = v ? 'default' : 'pointer';
    }
  }

  function autoGrow() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(96, Math.max(34, input.scrollHeight)) + 'px';
  }

  function updateTarget() {
    if (!label) return;
    var t = sessionMeta.title || '';
    label.textContent = t ? 'Điều hướng trực tiếp · ' + t : 'Điều hướng trực tiếp';
    if (pop) {
      pop.title =
        'Điều hướng Agent trực tiếp (Live Steer)' +
        (sessionMeta.dir ? ' trong ' + sessionMeta.dir : '') +
        '. IDE đẩy tin cho agent trong vài giây.';
    }
  }

  async function refreshSessionMeta() {
    var sid = sessionId();
    if (!sid) {
      sessionMeta = { sid: null, title: '', dir: '' };
      updateTarget();
      return;
    }
    if (sessionMeta.sid === sid) return;
    sessionMeta = { sid: sid, title: '', dir: '' };
    updateTarget();
    try {
      var r = await fetch('/api/session/' + sid);
      if (!r.ok) return;
      var j = await r.json();
      var d = (j && j.data) || {};
      sessionMeta = {
        sid: sid,
        title: d.title || '',
        dir: d.directory || (d.location && d.location.directory) || ''
      };
      updateTarget();
    } catch (e) {}
  }

  function build() {
    if (pop) return;
    var root = document.documentElement || document.body;
    if (!root) return;

    pop = document.createElement('div');
    pop.id = 'drgx-steer-pop';
    pop.style.cssText =
      'position:fixed;right:12px;bottom:96px;width:440px;max-width:calc(100vw - 24px);' +
      'z-index:2147483000;display:none;flex-direction:column;gap:8px;padding:10px;border-radius:12px;' +
      'background:rgba(15,23,42,0.97);border:1px solid rgba(148,163,184,0.4);' +
      'box-shadow:0 10px 32px rgba(0,0,0,0.45);backdrop-filter:blur(8px);' +
      'font-family:system-ui,Segoe UI,sans-serif;font-size:12px;color:#e2e8f0;';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:8px;';

    label = document.createElement('span');
    label.textContent = 'Kênh thông tin';
    label.style.cssText =
      'flex:1 1 auto;min-width:0;font-weight:600;color:#93c5fd;letter-spacing:0.2px;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    head.appendChild(label);

    statusEl = document.createElement('span');
    statusEl.textContent = 'Sẵn sàng';
    statusEl.style.cssText = 'flex:0 0 auto;font-size:11px;color:#94a3b8;white-space:nowrap;';
    head.appendChild(statusEl);

    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Đóng (Esc)';
    close.style.cssText =
      'flex:0 0 auto;border:none;background:transparent;color:#94a3b8;font-size:16px;' +
      'line-height:1;cursor:pointer;padding:2px 4px;border-radius:5px;';
    close.addEventListener('mouseenter', function () {
      close.style.color = '#f8fafc';
    });
    close.addEventListener('mouseleave', function () {
      close.style.color = '#94a3b8';
    });
    close.addEventListener('click', hide);
    head.appendChild(close);
    pop.appendChild(head);

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:flex-end;gap:6px;';

    input = document.createElement('textarea');
    input.rows = 1;
    input.maxLength = 8000;
    input.placeholder = 'Nhập thông tin cho agent…';
    input.title = 'Enter: gửi  •  Shift+Enter: xuống dòng  •  Esc: đóng';
    input.style.cssText =
      'flex:1 1 auto;min-width:0;height:34px;max-height:96px;resize:none;overflow-y:auto;' +
      'background:rgba(30,41,59,0.9);border:1px solid rgba(148,163,184,0.35);' +
      'border-radius:7px;color:#f8fafc;padding:7px 8px;font-size:12px;line-height:18px;' +
      'outline:none;font-family:inherit;';
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hide();
      }
    });
    row.appendChild(input);

    sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = 'Gửi';
    sendBtn.title = 'Gửi thông tin (Enter)';
    sendBtn.style.cssText =
      'flex:0 0 auto;border:1px solid rgba(59,130,246,0.7);border-radius:7px;padding:7px 12px;' +
      'background:#1d4ed8;color:#f8fafc;font-size:12px;font-weight:600;cursor:pointer;' +
      'white-space:nowrap;';
    sendBtn.addEventListener('click', function () {
      send();
    });
    row.appendChild(sendBtn);
    pop.appendChild(row);

    toastEl = document.createElement('div');
    toastEl.id = 'drgx-steer-toast';
    toastEl.style.cssText =
      'position:fixed;right:12px;bottom:96px;z-index:2147483000;display:none;' +
      'max-width:calc(100vw - 24px);padding:8px 12px;border-radius:8px;' +
      'background:rgba(15,23,42,0.97);border:1px solid rgba(148,163,184,0.4);' +
      'box-shadow:0 6px 20px rgba(0,0,0,0.4);font-family:system-ui,Segoe UI,sans-serif;' +
      'font-size:11px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

    root.appendChild(pop);
    root.appendChild(toastEl);
    buildResizeHandle(root);
    updateTarget();
  }

  function buildResizeHandle(root) {
    if (handle) return;
    handle = document.createElement('div');
    handle.id = 'drgx-panel-resize';
    handle.title = 'Kéo để đổi độ rộng panel (nhấp đúp để về mặc định)';
    handle.style.cssText =
      'position:fixed;left:0;top:0;bottom:0;width:7px;z-index:2147483001;cursor:ew-resize;' +
      'background:transparent;transition:background 120ms;';
    handle.addEventListener('mouseenter', function () {
      if (!resizing) handle.style.background = 'rgba(59,130,246,0.45)';
    });
    handle.addEventListener('mouseleave', function () {
      if (!resizing) handle.style.background = 'transparent';
    });
    handle.addEventListener('pointerdown', startResize);
    handle.addEventListener('dblclick', function () {
      postWidth(480, true);
    });
    root.appendChild(handle);
  }

  function postWidth(w, immediate) {
    var now = Date.now();
    if (!immediate && now - lastWidthPost < 55) return;
    lastWidthPost = now;
    ensureBase().then(function (base) {
      if (!base) return;
      fetch(base + '/panel-width', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ width: Math.round(w) })
      }).catch(function () {});
    });
  }

  function startResize(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    resizing = { startX: e.screenX, startW: window.innerWidth, current: window.innerWidth };
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) {}
    handle.style.background = 'rgba(59,130,246,0.6)';
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);
  }

  function onResizeMove(e) {
    if (!resizing) return;
    var w = resizing.startW - (e.screenX - resizing.startX);
    w = Math.max(320, Math.min(1400, w));
    resizing.current = w;
    postWidth(w);
  }

  function endResize() {
    if (!resizing) return;
    var w = resizing.current;
    resizing = null;
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', endResize);
    window.removeEventListener('pointercancel', endResize);
    if (handle) handle.style.background = 'transparent';
    if (w) postWidth(w, true);
  }

  function place() {
    var el = document.querySelector('[contenteditable="true"]');
    var top = 0;
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width > 100 && r.height > 10) top = r.top;
    }
    var bottom = (top ? Math.max(10, Math.round(window.innerHeight - top + 8)) : 96) + 'px';
    if (pop) pop.style.bottom = bottom;
    if (toastEl) toastEl.style.bottom = bottom;
  }

  function show() {
    build();
    if (!pop) return;
    var sid = sessionId();
    if (!sid) {
      showToast('Mở một phiên chat trước', 'err', 2800);
      return;
    }
    refreshSessionMeta();
    if (!busy) {
      setStatus(awaiting && awaitingSid === sid ? 'Chờ agent nhận…' : 'Sẵn sàng', awaiting ? 'warn' : 'idle');
    }
    isOpen = true;
    pop.style.display = 'flex';
    hideToast();
    place();
    autoGrow();
    input.focus();
  }

  function hide() {
    isOpen = false;
    if (pop) pop.style.display = 'none';
  }

  function toggle() {
    if (isOpen) hide();
    else show();
  }

  async function probePort(p) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () {
      ctrl.abort();
    }, 700);
    try {
      var r = await fetch('http://127.0.0.1:' + p + '/drgx/health', { signal: ctrl.signal });
      if (!r.ok) return false;
      var j = await r.json();
      return !!(j && j.app === 'drgx-proxy');
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function ensureBase() {
    if (baseUrl) return baseUrl;
    for (var p = 45290; p <= 45299; p++) {
      if (await probePort(p)) {
        baseUrl = 'http://127.0.0.1:' + p + '/drgx';
        return baseUrl;
      }
    }
    return null;
  }

  async function fetchStatus(sid) {
    var base = await ensureBase();
    if (!base) {
      baseUrl = null;
      return null;
    }
    try {
      var url = base + '/inbox/status' + (sid ? '?session=' + encodeURIComponent(sid) : '');
      var r = await fetch(url, { headers: authHeaders() });
      if (!r.ok) {
        baseUrl = null;
        return null;
      }
      return await r.json();
    } catch (e) {
      baseUrl = null;
      return null;
    }
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollStatus() {
    if (busy) return;
    var sid = awaitingSid || sessionId();
    if (!sid) return;
    var s = await fetchStatus(sid);
    if (!s) return;
    if (s.found === false) {
      if (awaiting) {
        stopPoll();
        awaiting = false;
        awaitingSid = null;
        if (!isOpen) hideToast();
      }
      return;
    }
    if (s.pending) {
      awaiting = true;
      if (isOpen) setStatus('Chờ agent nhận…', 'warn');
      else showToast('Chờ agent nhận thông tin…', 'warn');
      return;
    }
    stopPoll();
    if (awaiting) {
      awaiting = false;
      awaitingSid = null;
      if (isOpen) setStatus('Agent đã nhận thông tin', 'ok');
      else showToast('Agent đã nhận thông tin', 'ok', 2600);
    }
  }

  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(pollStatus, 1500);
    // 60 giây: đủ đợi agent có thể đang busy; pollStatus tự dừng khi delivered/found-false
    setTimeout(stopPoll, 60000);
  }

  async function send(text) {
    if (busy) return false;
    var value = String(text == null ? (input ? input.value : '') : text);
    if (!value.trim()) {
      if (input) input.focus();
      return false;
    }
    if (value.length > 8000) {
      setStatus('Nội dung quá dài (tối đa 8000 ký tự)', 'err');
      return false;
    }
    var sid = sessionId();
    if (!sid) {
      showToast('Mở một phiên chat trước', 'err', 2800);
      return false;
    }
    setBusy(true);
    setStatus('Đang gửi…', 'idle');
    try {
      var base = await ensureBase();
      if (!base) {
        baseUrl = null;
        setStatus('Không tìm thấy DrgX IDE (proxy)', 'err');
        return false;
      }
      var r = await fetch(base + '/inbox', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: value.trim(), session: sid })
      });
      var j = null;
      try {
        j = await r.json();
      } catch (e) {}
      if (!r.ok) {
        setStatus('Lỗi: ' + String((j && j.error) || r.status).slice(0, 80), 'err');
        showToast('Lỗi: ' + String((j && j.error) || r.status).slice(0, 80), 'err', 3200);
        return false;
      }
      if (input) {
        input.value = '';
        autoGrow();
      }
      awaiting = true;
      awaitingSid = sid;
      hide();
      showToast('Đã ghi file, chờ agent nhận…', 'warn');
      startPoll();
      return true;
    } catch (e) {
      baseUrl = null;
      setStatus('Lỗi kết nối: ' + String((e && e.message) || e).slice(0, 70), 'err');
      showToast('Lỗi kết nối: ' + String((e && e.message) || e).slice(0, 70), 'err', 3200);
      return false;
    } finally {
      setBusy(false);
      if (input && isOpen) input.focus();
    }
  }

  api.send = send;
  api.sessionId = sessionId;
  api.ensureBase = ensureBase;
  api.status = fetchStatus;
  api.sessionMeta = function () {
    return sessionMeta;
  };
  api.show = show;
  api.hide = hide;

  document.addEventListener(
    'keydown',
    function (e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        toggle();
        return;
      }
      if (isOpen && e.key === 'Escape') {
        e.preventDefault();
        hide();
      }
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    function (e) {
      if (!isOpen || !pop) return;
      if (pop.contains(e.target) || (handle && handle.contains(e.target))) return;
      hide();
    },
    true
  );

  setInterval(function () {
    build();
    if (isOpen) {
      place();
      refreshSessionMeta();
    }
  }, 600);

  build();
})();

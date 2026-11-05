(function () {
  const api = typeof acquireVsCodeApi === 'function'
    ? acquireVsCodeApi()
    : { postMessage: function () {}, setState: function () {}, getState: function () { return null; } };

  const VERDICTS = {
    AC: { label: 'Accepted', short: 'AC', cls: 'ok' },
    WA: { label: 'Wrong Answer', short: 'WA', cls: 'bad' },
    TLE: { label: 'Time Limit Exceeded', short: 'TLE', cls: 'warn' },
    RE: { label: 'Runtime Error', short: 'RE', cls: 'purple' },
    CE: { label: 'Compile Error', short: 'CE', cls: 'bad' },
    NO_OUT: { label: 'Thiếu file .out', short: 'NO_OUT', cls: 'muted' },
    NO_TESTS: { label: 'Chưa có testcase', short: 'NO_TESTS', cls: 'muted' },
    BAD_LANG: { label: 'Ngôn ngữ chưa hỗ trợ', short: 'BAD_LANG', cls: 'muted' },
    FAIL: { label: 'Chưa đạt', short: 'FAIL', cls: 'bad' },
    ERROR: { label: 'Có lỗi', short: 'ERR', cls: 'bad' },
    PENDING: { label: 'Đang chờ', short: '…', cls: 'pending' }
  };

  const MAX_LINES = 120;
  let state = null;
  let filter = 'all';
  const expanded = new Set();

  const el = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmtMs(value) {
    const n = Number(value);
    if (!isFinite(n) || n <= 0) return '0 ms';
    if (n < 1000) return Math.round(n) + ' ms';
    let s = (n / 1000).toFixed(2).replace('.', ',');
    s = s.replace(/0+$/, '').replace(/,$/, '');
    return s + ' s';
  }

  function verdictInfo(key) {
    return VERDICTS[key] || { label: key || '—', short: key || '—', cls: 'muted' };
  }

  function isSettled(test) {
    return test && test.verdict && test.verdict !== 'PENDING';
  }

  function stateColor(key) {
    if (!key) return 'idle';
    const cls = verdictInfo(key).cls;
    if (cls === 'ok') return 'ok';
    if (cls === 'warn') return 'warn';
    if (cls === 'purple') return 'purple';
    if (cls === 'pending') return 'run';
    if (cls === 'muted') return 'idle';
    return 'bad';
  }

  function clipLines(value) {
    const text = String(value == null ? '' : value).replace(/\r/g, '');
    let lines = text.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    let truncated = false;
    if (lines.length > MAX_LINES) {
      lines = lines.slice(0, MAX_LINES);
      truncated = true;
    }
    return { lines: lines, truncated: truncated };
  }

  function lineDiff(a, b) {
    const n = a.length;
    const m = b.length;
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const left = [];
    const right = [];
    let i = 0;
    let j = 0;
    let ln = 1;
    let rn = 1;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        left.push({ text: a[i], type: 'same', no: ln++ });
        right.push({ text: b[j], type: 'same', no: rn++ });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        left.push({ text: a[i], type: 'diff', no: ln++ });
        right.push({ text: '', type: 'gap', no: '' });
        i++;
      } else {
        left.push({ text: '', type: 'gap', no: '' });
        right.push({ text: b[j], type: 'diff', no: rn++ });
        j++;
      }
    }
    while (i < n) {
      left.push({ text: a[i], type: 'diff', no: ln++ });
      right.push({ text: '', type: 'gap', no: '' });
      i++;
    }
    while (j < m) {
      left.push({ text: '', type: 'gap', no: '' });
      right.push({ text: b[j], type: 'diff', no: rn++ });
      j++;
    }
    return { left: left, right: right };
  }

  function renderLines(items) {
    return items.map(function (item) {
      if (item.type === 'gap') {
        return '<span class="line gap"><span class="ln"></span><span class="txt"> </span></span>';
      }
      const text = item.text ? esc(item.text) : ' ';
      return '<span class="line ' + item.type + '"><span class="ln">' + esc(item.no) +
        '</span><span class="txt">' + text + '</span></span>';
    }).join('');
  }

  function pane(title, tag, body, cls) {
    return '<div class="pane ' + cls + '">' +
      '<div class="pane-head"><span>' + esc(title) + '</span>' +
      (tag ? '<span class="pane-tag">' + esc(tag) + '</span>' : '') +
      '</div><pre>' + body + '</pre></div>';
  }

  function outputPane(label, value, tag, cls, paneCls) {
    const clipped = clipLines(value);
    const lines = clipped.lines.map(function (text, index) {
      return { text: text, type: 'same', no: index + 1 };
    });
    const note = clipped.truncated
      ? '<div class="sum">Đã lược bớt ' + MAX_LINES + ' dòng đầu</div>'
      : '';
    return '<div class="diff-grid">' +
      pane(label, tag, renderLines(lines), ('full ' + cls).trim()) +
      '</div>' + (note ? '<div class="test-summary">' + note + '</div>' : '');
  }

  function diffGrid(test) {
    const expected = clipLines(test.expected);
    const got = clipLines(test.got);
    const diff = lineDiff(expected.lines, got.lines);
    let html = '<div class="diff-grid">' +
      pane('Kỳ vọng', 'expected', renderLines(diff.left), 'pane-exp') +
      pane('Nhận được', 'got', renderLines(diff.right), 'pane-got') +
      '</div>';
    if (expected.truncated || got.truncated) {
      html += '<div class="test-summary"><span class="sum">Output đã được lược bớt để hiển thị</span></div>';
    }
    return html;
  }

  function testBody(test) {
    if (!test || test.verdict === 'PENDING') {
      return '<div class="test-summary"><span class="sum">Đang chờ kết quả…</span></div>';
    }
    const info = verdictInfo(test.verdict);
    const summary = [];
    summary.push('<span class="sum">verdict <b>' + esc(info.short) + '</b></span>');
    if (test.ms) summary.push('<span class="sum">thời gian <b>' + esc(fmtMs(test.ms)) + '</b></span>');
    if (test.verdict === 'NO_OUT') summary.push('<span class="sum">thiếu file <b>.out</b></span>');
    let html = '<div class="test-summary">' + summary.join('') + '</div>';
    if (test.verdict === 'AC') {
      html += outputPane('Output', test.got, 'khớp kỳ vọng', '', '');
    } else if (test.missingExpected || test.expected == null) {
      html += outputPane('Nhận được', test.got, 'không có .out', '', 'pane-got');
    } else {
      html += diffGrid(test);
    }
    if (test.stderr) {
      html += '<div class="stderr"><span class="stderr-title">stderr</span><pre>' +
        esc(test.stderr) + '</pre></div>';
    }
    if (test.input) {
      html += '<details class="input"><summary>Input' +
        (test.inputTruncated ? ' · đã lược bớt' : '') + '</summary><pre>' +
        esc(test.input) + '</pre></details>';
    }
    return html;
  }

  function renderTest(test, index) {
    const info = verdictInfo(test.verdict);
    const key = index + ':' + (test.name || '');
    const open = expanded.has(key);
    const time = test.verdict === 'PENDING' ? '—' : (test.ms ? fmtMs(test.ms) : '');
    return '<article class="test' + (open ? ' open' : '') + '" data-key="' + esc(key) + '">' +
      '<button class="test-head" type="button" data-i="' + index + '" aria-expanded="' + open + '">' +
      '<span class="test-index">' + String(index + 1).padStart(2, '0') + '</span>' +
      '<span class="test-name" title="' + esc(test.name) + '">' + esc(test.name) + '</span>' +
      '<span class="badge ' + info.cls + '">' + esc(info.short) + '</span>' +
      '<span class="test-time">' + esc(time) + '</span>' +
      '<span class="chevron"></span>' +
      '</button>' +
      '<div class="test-body">' + (open ? testBody(test) : '') + '</div>' +
      '</article>';
  }

  function renderChips(context) {
    const chips = [];
    const mode = context.state.mode === 'server' ? 'Server' : 'Local';
    chips.push('<span class="chip' + (context.state.mode === 'server' ? ' accent' : '') + '"><b>' +
      mode + '</b>' + (context.state.mode === 'server' ? '' : ' · F9') + '</span>');
    if (context.state.source) {
      chips.push('<span class="chip">File <b title="' +
        esc(context.state.sourcePath || context.state.source) + '">' +
        esc(context.state.source) + '</b></span>');
    }
    if (context.state.examCode) {
      chips.push('<span class="chip accent">Phòng <b>' + esc(context.state.examCode) + '</b></span>');
    }
    if (context.state.receiptShort) {
      chips.push('<span class="chip accent" title="' + esc(context.state.receiptShort) + '">🔐 <b>' +
        esc(context.state.receiptShort.split(' ')[0]) + '</b></span>');
    }
    if (context.running) {
      chips.push('<span class="chip">Đang chấm <b>' + context.settled.length + '/' + context.total + '</b></span>');
    }
    el('chips').innerHTML = chips.join('');
  }

  function renderHero(context) {
    const s = context.state;
    const total = context.total;
    const ac = context.ac;
    const verdictKey = (s.summary && s.summary.verdict) || '';
    const info = verdictInfo(verdictKey);
    let title = 'Chưa có lần chấm nào';
    let desc = 'Mở một file C++ (.cpp) hoặc Python (.py) rồi nhấn F9 để chấm toàn bộ testcase trong thư mục <code>tests/</code>.';
    let color = 'idle';

    if (context.running) {
      color = 'run';
      title = 'Đang chấm bài…';
      const next = s.tests && s.tests[context.settled.length];
      if (s.compile && s.compile.status === 'running') {
        desc = 'Đang biên dịch ' + (s.source ? '<code>' + esc(s.source) + '</code>' : 'bài làm') + '…';
      } else {
        desc = 'Đã chạy ' + context.settled.length + '/' + total + ' test' +
          (next ? ' · tiếp theo <code>' + esc(next.name) + '</code>' : '') + '.';
      }
    } else if (s.phase === 'idle') {
      color = 'idle';
    } else if (verdictKey === 'AC') {
      color = 'ok';
      title = 'Accepted';
      desc = 'Toàn bộ ' + total + ' testcase đều đạt' +
        (s.mode === 'server' ? ' trên server' : ' trên máy') + '.';
    } else if (verdictKey === 'CE') {
      color = 'bad';
      title = 'Compile Error';
      desc = 'Bài làm không biên dịch được. Xem chi tiết lỗi bên dưới rồi chấm lại.';
    } else if (verdictKey === 'NO_TESTS') {
      color = 'idle';
      title = 'Chưa có testcase';
      desc = esc(s.message || 'Phòng thi chưa có testcase trên server.');
    } else if (verdictKey === 'BAD_LANG') {
      color = 'idle';
      title = 'Ngôn ngữ chưa hỗ trợ';
      desc = esc(s.message || 'Server chưa hỗ trợ ngôn ngữ của bài nộp.');
    } else if (verdictKey === 'ERROR') {
      color = 'bad';
      title = 'Có lỗi xảy ra';
      desc = esc(s.message || 'Không chấm được bài.');
    } else if (verdictKey === 'FAIL' || verdictKey === 'WA') {
      color = 'bad';
      const firstBad = context.settled.find(function (test) { return test.verdict !== 'AC'; });
      title = verdictKey === 'WA' ? 'Wrong Answer' : 'Chưa đạt';
      desc = firstBad
        ? 'Test <code>' + esc(firstBad.name) + '</code> ' + verdictInfo(firstBad.verdict).label.toLowerCase() +
          ' · ' + context.failed + '/' + total + ' test chưa đạt.'
        : context.failed + '/' + total + ' test chưa đạt.';
    } else if (total) {
      color = stateColor(verdictKey);
      title = info.label;
      desc = ac + '/' + total + ' test đạt.';
    }

    document.body.dataset.phase = s.phase || 'idle';
    document.body.dataset.verdict = color;
    el('verdictEyebrow').textContent = (s.mode === 'server' ? 'Server judge' : 'Local judge') +
      (s.examCode ? ' · phòng ' + s.examCode : '');
    el('verdictTitle').textContent = title;
    el('verdictDesc').innerHTML = desc;

    const doneCount = context.running ? context.settled.length : ac;
    const pct = total ? Math.round(doneCount / total * 100) : 0;
    el('ringValue').textContent = (s.phase === 'idle' || !total) ? '—' : doneCount + '/' + total;
    el('ringLabel').textContent = context.running ? 'đã chạy' : (s.phase === 'idle' ? 'sẵn sàng' : 'test đạt');
    const circumference = 263.894;
    el('ringProgress').style.strokeDashoffset = String(circumference * (1 - pct / 100));

    const progress = el('progress');
    progress.hidden = !context.running;
    if (context.running) {
      el('progressFill').style.width = (total ? Math.round(context.settled.length / total * 100) : 0) + '%';
      el('progressText').textContent = 'Đang chạy ' + Math.min(context.settled.length + 1, total) + '/' + total +
        (context.settled.length < total ? ' test' : '');
    }

    const tags = [];
    const counts = {};
    context.settled.forEach(function (test) {
      counts[test.verdict] = (counts[test.verdict] || 0) + 1;
    });
    Object.keys(counts).forEach(function (key) {
      const v = verdictInfo(key);
      tags.push('<span class="tag"><b>' + esc(v.short) + '</b> ' + counts[key] + '</span>');
    });
    if (!tags.length && total) {
      tags.push('<span class="tag"><b>' + total + '</b> test</span>');
    }
    el('verdictTags').innerHTML = tags.join('');

    el('statAc').textContent = (s.phase === 'idle' || !total) ? '—' : context.ac + '/' + total;
    if (context.running) {
      el('statTime').textContent = context.totalMs ? fmtMs(context.totalMs) : '…';
    } else if (!context.tests.length) {
      el('statTime').textContent = '—';
    } else if (s.mode === 'server') {
      el('statTime').textContent = 'Server';
    } else {
      el('statTime').textContent = fmtMs(context.totalMs);
    }
    const compile = s.compile || {};
    el('statCompile').textContent = compile.status === 'error'
      ? 'Lỗi'
      : compile.status === 'running'
        ? 'Đang chạy'
        : compile.ms
          ? fmtMs(compile.ms)
          : '—';
    el('statMode').textContent = s.mode === 'server' ? 'Server' : 'Local';

    const compileCard = el('compileCard');
    compileCard.hidden = compile.status !== 'error';
    el('compileMessage').textContent = compile.message || '';
  }

  function renderEmpty(context) {
    const s = context.state;
    const empty = el('emptyCard');
    const verdictKey = (s.summary && s.summary.verdict) || '';
    const show = !context.running && context.tests.length === 0 && verdictKey !== 'CE';
    empty.hidden = !show;
    if (!show) return;
    let title = 'Sẵn sàng chấm bài';
    let desc = 'Nhấn <kbd>F9</kbd> trong editor để chạy judge cục bộ. Kết quả từng testcase, diff output và lỗi biên dịch sẽ xuất hiện tại đây.';
    if (verdictKey === 'CE') {
      title = 'Biên dịch thất bại';
      desc = 'Sửa lỗi biên dịch ở trên rồi nhấn F9 để chấm lại.';
    } else if (verdictKey === 'NO_TESTS') {
      title = 'Chưa có testcase';
      desc = esc(s.message || 'Thêm cặp file .in/.out vào thư mục tests/ để bắt đầu chấm.');
    } else if (verdictKey === 'BAD_LANG') {
      title = 'Ngôn ngữ chưa hỗ trợ';
      desc = esc(s.message || 'Server hiện chỉ hỗ trợ C++ và Python.');
    } else if (verdictKey === 'ERROR') {
      title = 'Có lỗi xảy ra';
      desc = esc(s.message || 'Không chấm được bài.');
    } else if (s.phase === 'done' && verdictKey) {
      title = verdictInfo(verdictKey).label;
      desc = esc(s.message || 'Không có testcase nào được trả về.');
    }
    el('emptyTitle').textContent = title;
    el('emptyDesc').innerHTML = desc;
    const runBtn = el('btnEmptyRun');
    runBtn.hidden = s.mode === 'server' && s.phase !== 'idle';
  }

  function renderResults(context) {
    const results = el('results');
    const show = context.tests.length > 0;
    results.hidden = !show;
    el('tabAll').textContent = String(context.total);
    el('tabAc').textContent = String(context.ac);
    el('tabFail').textContent = String(context.failed);
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    if (!show) return;
    const visible = context.tests.filter(function (test) {
      if (filter === 'all') return true;
      if (filter === 'ac') return test.verdict === 'AC';
      return isSettled(test) && test.verdict !== 'AC';
    });
    el('testList').innerHTML = visible.map(function (test) {
      return renderTest(test, context.tests.indexOf(test));
    }).join('');
    el('noMatch').hidden = visible.length > 0;
    el('toolbarHint').textContent = context.running
      ? context.settled.length + '/' + context.total + ' test đã chạy'
      : 'Bấm vào một test để xem diff';
  }

  function render() {
    if (!state) return;
    const tests = Array.isArray(state.tests) ? state.tests : [];
    const settled = tests.filter(isSettled);
    const ac = tests.filter(function (test) { return test.verdict === 'AC'; }).length;
    const failed = settled.filter(function (test) { return test.verdict !== 'AC'; }).length;
    const total = tests.length || (state.progress && state.progress.total) || 0;
    const totalMs = (state.summary && state.summary.totalMs) || settled.reduce(function (sum, test) {
      return sum + (Number(test.ms) || 0);
    }, 0);
    const context = {
      state: state,
      tests: tests,
      settled: settled,
      ac: ac,
      failed: failed,
      total: total,
      totalMs: totalMs,
      running: state.phase === 'running'
    };
    renderChips(context);
    renderHero(context);
    renderEmpty(context);
    renderResults(context);
    el('subtitle').textContent = state.source
      ? state.source
      : (state.mode === 'server' ? 'Kết quả chấm trên server' : 'Bảng chấm bài');
    el('btnRerun').disabled = context.running;
    el('btnCopy').disabled = state.phase === 'idle';
    el('btnLog').disabled = false;
    el('btnEmptyRun').disabled = context.running;
  }

  function command(name) {
    api.postMessage({ type: 'command', command: name });
  }

  function wire() {
    el('btnRerun').addEventListener('click', function () { command('rerun'); });
    el('btnEmptyRun').addEventListener('click', function () { command('rerun'); });
    el('btnCopy').addEventListener('click', function () { command('copy'); });
    el('btnLog').addEventListener('click', function () { command('openLog'); });
    el('tabs').addEventListener('click', function (event) {
      const tab = event.target.closest('.tab');
      if (!tab) return;
      filter = tab.dataset.filter;
      render();
    });
    el('testList').addEventListener('click', function (event) {
      const head = event.target.closest('.test-head');
      if (!head) return;
      const index = Number(head.dataset.i);
      const test = (state.tests || [])[index];
      if (!test) return;
      const key = index + ':' + (test.name || '');
      if (expanded.has(key)) expanded.delete(key);
      else expanded.add(key);
      render();
    });
    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        command('rerun');
      }
    });
    window.addEventListener('message', function (event) {
      const message = event.data;
      if (!message || message.type !== 'state') return;
      state = message.state;
      render();
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
    wire();
    if (window.__DRGX_DEMO_STATE__) {
      state = window.__DRGX_DEMO_STATE__;
      render();
      return;
    }
    api.postMessage({ type: 'ready' });
  });
})();

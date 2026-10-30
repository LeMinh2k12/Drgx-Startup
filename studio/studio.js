/* ==========================================================================
   DrgX Studio v2.6 — Native Tauri v2 Pro IDE Frontend Controller
   60fps Syntax Highlighting · C++17 IntelliSense · Inline AI Ghost Text · Splitters
   ========================================================================== */

const STUDIO_SKINS = [
  { id: 'ion', label: 'Ion Dark' },
  { id: 'dawn', label: 'Dawn Light' },
  { id: 'nebula', label: 'Nebula Purple' },
  { id: 'tokyo', label: 'Tokyo Night' },
  { id: 'matrix', label: 'Matrix Cyber' }
];

const state = {
  workspace: '',
  files: [],
  openTabs: ['solution.cpp', 'brute.cpp', 'gen.py', 'preview.html'],
  activeFile: 'solution.cpp',
  fileCache: {},
  dirtyFiles: new Set(),
  problems: [],
  activeProblem: null,
  templates: [],
  testCases: [
    { name: 'Test #1', input: '15 27\n', expected: '42', actual: '', verdict: '' },
    { name: 'Test #2 (64-bit)', input: '1000000000 2000000000\n', expected: '3000000000', actual: '', verdict: '' }
  ],
  lastAiFixedCode: '',
  hintLevel: 1,
  pomoSeconds: 25 * 60,
  pomoRunning: false,
  pomoTimer: null,
  ambientMode: 'off',
  audioCtx: null,
  ambientNodes: [],
  editorFontSize: 13.5,
  errorLine: null,
  ghostText: '',
  intellisenseOpen: false,
  intellisenseItems: [],
  intellisenseIndex: 0,
  intellisensePrefixStart: 0,
  autoSaveTimer: null,
  stats: { runs: 0, submits: 0, testsRun: 0, keystrokes: 0 }
};

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('studioToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
window.toast = showToast;

function apiBase() {
  return window.__DRGX_API_BASE__ || '';
}

async function apiGet(url) {
  const r = await fetch(apiBase() + url);
  return await r.json();
}

async function apiPost(url, body) {
  const r = await fetch(apiBase() + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return await r.json();
}

async function pickNativeFolder() {
  try {
    const res = await apiPost('/api/studio/pick-folder', {});
    if (res && res.workspace) {
      state.workspace = res.workspace;
      state.files = res.files || [];
      state.fileCache = {};
      const lbl = document.getElementById('workspacePathLabel');
      if (lbl) lbl.textContent = state.workspace.split(/[\\/]/).slice(-2).join('/');
      renderFileTree();
      if (state.files.length > 0) {
        const firstFile = state.files.find(f => f.type === 'file');
        if (firstFile) await openFileInEditor(firstFile.path);
      }
      showToast('📂 Đã mở thư mục: ' + state.workspace);
    }
  } catch (e) {
    showToast('Không mở được hộp thoại thư mục');
  }
}

/* ---------- Navigation, Layout & Resizable Splitters ---------- */
function switchSidebar(tabId) {
  document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-side') === tabId);
  });
  document.querySelectorAll('.sidebar-pane').forEach(p => {
    p.classList.toggle('active', p.id === `side-${tabId}`);
  });
}

function switchDock(dockId) {
  const shell = document.getElementById('studioShell');
  if (shell) shell.classList.remove('hide-dock');
  document.querySelectorAll('.dock-tabs .tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-dock') === dockId);
  });
  document.querySelectorAll('.dock-pane').forEach(p => {
    p.classList.toggle('active', p.id === `dock-${dockId}`);
  });
}
window.switchTab = switchDock;

function switchRight(paneId) {
  const shell = document.getElementById('studioShell');
  if (shell) shell.classList.remove('hide-right');
  document.querySelectorAll('.right-tabs .tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-right') === paneId);
  });
  document.querySelectorAll('.right-pane').forEach(p => {
    p.classList.toggle('active', p.id === `right-${paneId}`);
  });
}

function switchSidePanel(panelName) {
  if (panelName === 'doctor') {
    switchDock('devtools');
    runStudioDoctor();
  }
}

function togglePanelCollapse(which) {
  const shell = document.getElementById('studioShell');
  if (!shell) return;
  if (which === 'left') shell.classList.toggle('hide-left');
  else if (which === 'right') shell.classList.toggle('hide-right');
  else if (which === 'dock') shell.classList.toggle('hide-dock');
}

function initResizableSplitters() {
  const shell = document.getElementById('studioShell');
  const resLeft = document.getElementById('resizerLeft');
  const resRight = document.getElementById('resizerRight');
  const resDock = document.getElementById('resizerDock');
  if (!shell) return;

  function bindDrag(el, onMove) {
    if (!el) return;
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      el.classList.add('dragging');
      document.body.style.userSelect = 'none';
      const moveHandler = ev => onMove(ev);
      const upHandler = () => {
        el.classList.remove('dragging');
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', upHandler);
      };
      window.addEventListener('mousemove', moveHandler);
      window.addEventListener('mouseup', upHandler);
    });
  }

  bindDrag(resLeft, ev => {
    const w = Math.max(180, Math.min(520, ev.clientX));
    shell.style.setProperty('--left-w', `${w}px`);
  });

  bindDrag(resRight, ev => {
    const w = Math.max(240, Math.min(580, window.innerWidth - ev.clientX));
    shell.style.setProperty('--right-w', `${w}px`);
  });

  bindDrag(resDock, ev => {
    const statusH = 26;
    const h = Math.max(110, Math.min(540, window.innerHeight - ev.clientY - statusH));
    shell.style.setProperty('--dock-h', `${h}px`);
  });
}

function toggleStatementPane(forceState) {
  const area = document.getElementById('editorSplitArea');
  if (!area) return;
  area.classList.remove('with-preview');
  const next = typeof forceState === 'boolean' ? forceState : !area.classList.contains('with-statement');
  area.classList.toggle('with-statement', next);
}

function toggleWebPreviewPane(forceState) {
  const area = document.getElementById('editorSplitArea');
  if (!area) return;
  area.classList.remove('with-statement');
  const next = typeof forceState === 'boolean' ? forceState : !area.classList.contains('with-preview');
  area.classList.toggle('with-preview', next);
  if (next) refreshWebPreview();
}

async function refreshWebPreview() {
  const frame = document.getElementById('webPreviewFrame');
  if (!frame) return;
  await saveCurrentFile(true);
  const base = apiBase();
  if (state.activeFile.endsWith('.html')) {
    frame.src = `${base}/preview/${encodeURIComponent(state.activeFile)}?t=${Date.now()}`;
  } else {
    frame.src = `${base}/preview/preview.html?t=${Date.now()}`;
  }
}

/* ==========================================================================
   PRO CODE EDITOR ENGINE: 60FPS HIGHLIGHTING, GHOST TEXT & INTELLISENSE
   ========================================================================== */
const CPP_TOKEN_REGEX = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(^\s*#[a-zA-Z_]\w*[^\n]*)|\b(alignas|alignof|and|Auto|bool|break|case|catch|char|class|const|constexpr|continue|default|delete|do|double|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|nullptr|operator|or|private|protected|public|register|reinterpret_cast|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while)\b|\b(vector|string|pair|tuple|map|unordered_map|set|unordered_set|multiset|priority_queue|queue|deque|stack|bitset|array|ll|pii|pll|cin|cout|cerr|endl|std|ios|ios_base)\b|\b(sort|reverse|lower_bound|upper_bound|accumulate|max|min|swap|gcd|__gcd|__lg|__builtin_popcount|__builtin_popcountll|memset|fill|iota|unique|push_back|emplace_back|pop_back|begin|end|size|empty|clear|insert|erase|find|substr|tie|sync_with_stdio|freopen|scanf|printf)\b|\b(\d+(?:LL|ULL|ll|ull|f)?)\b/gm;

function highlightLineTokens(line, lang) {
  if (!line) return '';
  if (lang === 'html') {
    return escHtml(line);
  }
  let out = '';
  let lastIdx = 0;
  CPP_TOKEN_REGEX.lastIndex = 0;
  let m;
  while ((m = CPP_TOKEN_REGEX.exec(line)) !== null) {
    if (m.index > lastIdx) {
      out += escHtml(line.slice(lastIdx, m.index));
    }
    const full = m[0];
    if (m[1]) out += `<span class="tok-cmt">${escHtml(full)}</span>`;
    else if (m[2]) out += `<span class="tok-str">${escHtml(full)}</span>`;
    else if (m[3]) out += `<span class="tok-pre">${escHtml(full)}</span>`;
    else if (m[4]) out += `<span class="tok-kw">${escHtml(full)}</span>`;
    else if (m[5]) out += `<span class="tok-type">${escHtml(full)}</span>`;
    else if (m[6]) out += `<span class="tok-fn">${escHtml(full)}</span>`;
    else if (m[7]) out += `<span class="tok-num">${escHtml(full)}</span>`;
    else out += escHtml(full);
    lastIdx = CPP_TOKEN_REGEX.lastIndex;
  }
  if (lastIdx < line.length) {
    out += escHtml(line.slice(lastIdx));
  }
  return out;
}

// Instant 0ms Local AI Ghost Text Predictor (C++17 & CP Patterns)
const GHOST_PATTERNS = [
  { match: /^#inc$/, suggest: 'lude <bits/stdc++.h>' },
  { match: /^#include\s*$/, suggest: '<bits/stdc++.h>' },
  { match: /^using\s+$/, suggest: 'namespace std;' },
  { match: /^\s*ios::$/, suggest: 'sync_with_stdio(false); cin.tie(nullptr);' },
  { match: /^\s*cin\.tie$/, suggest: '(nullptr);' },
  { match: /^\s*for\s*\(\s*int\s+i\s*$/, suggest: ' = 0; i < n; ++i) {' },
  { match: /^\s*for\s*\(\s*$/, suggest: 'int i = 0; i < n; ++i) {' },
  { match: /^\s*vector<$/, suggest: 'long long> a(n);' },
  { match: /^\s*priority_queue<$/, suggest: 'long long, vector<long long>, greater<long long>> pq;' },
  { match: /^\s*sort\($/, suggest: 'a.begin(), a.end());' },
  { match: /^\s*cout\s*<<\s*$/, suggest: 'ans << "\\n";' },
  { match: /^\s*while\s*\(t--$/, suggest: ') solve();' }
];

function computeGhostText(ta) {
  if (!ta) return '';
  const pos = ta.selectionStart || 0;
  if (pos !== ta.selectionEnd) return '';
  const text = ta.value;
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const lineEndIdx = text.indexOf('\n', pos);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const afterCursorOnLine = text.slice(pos, lineEnd);
  // Only show inline ghost text when cursor is at the end of the line
  if (afterCursorOnLine.trim().length > 0) return '';
  const linePrefix = text.slice(lineStart, pos);
  for (const p of GHOST_PATTERNS) {
    if (p.match.test(linePrefix)) {
      return p.suggest;
    }
  }
  return '';
}

let renderRafId = null;
function scheduleEditorRender() {
  if (renderRafId) cancelAnimationFrame(renderRafId);
  renderRafId = requestAnimationFrame(renderEditorNow);
}

function renderEditorNow() {
  renderRafId = null;
  const ta = document.getElementById('codeTextarea');
  const preContent = document.getElementById('codeHighlightContent');
  const pre = document.getElementById('codeHighlightPre');
  const gutter = document.getElementById('lineNumbers');
  const activeBar = document.getElementById('activeLineBar');
  const errBar = document.getElementById('errorLineBar');
  const hudPill = document.getElementById('editorHudPill');
  const ghostStatus = document.getElementById('ghostStatusText');
  if (!ta || !preContent || !gutter) return;

  const code = ta.value;
  const pos = ta.selectionStart || 0;
  const upTo = code.slice(0, pos).split('\n');
  const activeLine = upTo.length; // 1-indexed
  const activeCol = upTo[upTo.length - 1].length + 1;

  const badge = document.getElementById('cursorPosBadge');
  if (badge) badge.textContent = `Ln ${activeLine}, Col ${activeCol}`;

  const langSel = document.getElementById('editorLangSelect');
  const lang = langSel ? langSel.value : detectLangFromFilename(state.activeFile);

  state.ghostText = state.intellisenseOpen ? '' : computeGhostText(ta);
  if (hudPill && ghostStatus) {
    if (state.ghostText) {
      hudPill.classList.add('ghost-ready');
      ghostStatus.innerHTML = `⚡ Bấm <b>Tab</b> để nhận gợi ý AI: <code>${escHtml(state.ghostText)}</code>`;
    } else {
      hudPill.classList.remove('ghost-ready');
      ghostStatus.innerHTML = `⚡ AI Copilot &amp; C++17 IntelliSense sẵn sàng · Gõ <code>/</code> để chèn CP`;
    }
  }

  const lines = code.split('\n');
  const htmlLines = new Array(lines.length);
  const gutterItems = new Array(lines.length);

  for (let i = 0; i < lines.length; i++) {
    const lnNum = i + 1;
    let hl = highlightLineTokens(lines[i], lang);
    if (lnNum === activeLine && state.ghostText) {
      hl += `<span class="ghost-inline">${escHtml(state.ghostText)}</span>`;
    }
    htmlLines[i] = hl;
    const isErr = state.errorLine === lnNum;
    const isAct = activeLine === lnNum;
    gutterItems[i] = `<span class="ln-item${isAct ? ' active' : ''}${isErr ? ' err' : ''}">${lnNum}</span>`;
  }

  preContent.innerHTML = htmlLines.join('\n') + '\n';
  gutter.innerHTML = gutterItems.join('');

  // Sync scroll & active line bar
  const scrollTop = ta.scrollTop;
  const scrollLeft = ta.scrollLeft;
  if (pre) {
    pre.scrollTop = scrollTop;
    pre.scrollLeft = scrollLeft;
  }
  gutter.scrollTop = scrollTop;

  const lineH = Math.round(state.editorFontSize * 1.63);
  if (activeBar) {
    const y = (activeLine - 1) * lineH - scrollTop;
    activeBar.style.transform = `translateY(${y}px)`;
  }
  if (errBar) {
    if (state.errorLine && state.errorLine <= lines.length) {
      errBar.style.display = 'block';
      const ey = (state.errorLine - 1) * lineH - scrollTop;
      errBar.style.transform = `translateY(${ey}px)`;
    } else {
      errBar.style.display = 'none';
    }
  }
}

function updateLineNumbers() {
  renderEditorNow();
}

function updateCursorPos() {
  scheduleEditorRender();
}

function adjustEditorFontSize(delta) {
  state.editorFontSize = Math.max(11.5, Math.min(20, state.editorFontSize + delta * 0.5));
  const lineH = Math.round(state.editorFontSize * 1.63);
  const shell = document.getElementById('studioShell');
  if (shell) {
    shell.style.setProperty('--editor-font-size', `${state.editorFontSize}px`);
    shell.style.setProperty('--editor-line-height', `${lineH}px`);
  }
  const lbl = document.getElementById('fontSizeLabel');
  if (lbl) lbl.textContent = `${state.editorFontSize}px`;
  scheduleEditorRender();
}

/* ---------- Live IntelliSense Autocomplete Engine ---------- */
const BASE_INTELLISENSE_ITEMS = [
  { key: 'fastio', label: 'ios::sync_with_stdio(false); cin.tie(nullptr);', kind: 'Fast I/O', insert: 'ios::sync_with_stdio(false);\n    cin.tie(nullptr);' },
  { key: 'vector', label: 'vector<long long> a(n);', kind: 'STL', insert: 'vector<long long> ' },
  { key: 'priority_queue', label: 'priority_queue<long long> pq;', kind: 'STL', insert: 'priority_queue<long long> ' },
  { key: 'pq_min', label: 'priority_queue<ll, vector<ll>, greater<ll>>', kind: 'STL Min-Heap', insert: 'priority_queue<long long, vector<long long>, greater<long long>> ' },
  { key: 'accumulate', label: 'accumulate(a.begin(), a.end(), 0LL)', kind: 'STL 64-bit', insert: 'accumulate(a.begin(), a.end(), 0LL)' },
  { key: 'lower_bound', label: 'lower_bound(a.begin(), a.end(), x)', kind: 'Binary Search', insert: 'lower_bound(a.begin(), a.end(), )' },
  { key: 'upper_bound', label: 'upper_bound(a.begin(), a.end(), x)', kind: 'Binary Search', insert: 'upper_bound(a.begin(), a.end(), )' },
  { key: 'sort_all', label: 'sort(a.begin(), a.end());', kind: 'STL', insert: 'sort(a.begin(), a.end());' },
  { key: 'unique_erase', label: 'a.erase(unique(a.begin(), a.end()), a.end());', kind: 'Coord Compress', insert: 'a.erase(unique(a.begin(), a.end()), a.end());' },
  { key: 'unordered_map', label: 'unordered_map<long long, int> mp;', kind: 'STL Hash', insert: 'unordered_map<long long, int> ' },
  { key: 'multiset', label: 'multiset<long long> ms;', kind: 'STL Tree', insert: 'multiset<long long> ' },
  { key: 'popcountll', label: '__builtin_popcountll(mask)', kind: 'Bitmask', insert: '__builtin_popcountll()' },
  { key: 'memset_dp', label: 'memset(dp, -1, sizeof(dp));', kind: 'DP', insert: 'memset(dp, -1, sizeof(dp));' },
  { key: 'freopen_io', label: 'freopen("input.inp", "r", stdin);', kind: 'File I/O', insert: 'freopen("TASK.INP", "r", stdin);\n    freopen("TASK.OUT", "w", stdout);' }
];

function buildAllIntellisenseCatalog() {
  const list = [...BASE_INTELLISENSE_ITEMS];
  for (const tpl of state.templates) {
    list.push({
      key: tpl.id,
      label: `/${tpl.id} — ${tpl.name}`,
      kind: '⚡ CP Template',
      insert: tpl.code
    });
  }
  return list;
}

function updateIntellisensePopup() {
  const ta = document.getElementById('codeTextarea');
  const popup = document.getElementById('intellisensePopup');
  if (!ta || !popup) return;

  const pos = ta.selectionStart || 0;
  if (pos !== ta.selectionEnd) {
    closeIntellisense();
    return;
  }
  const before = ta.value.slice(0, pos);
  const m = before.match(/(?:\/([a-zA-Z0-9_]*)|([a-zA-Z_][a-zA-Z0-9_]{1,24}))$/);
  if (!m) {
    closeIntellisense();
    return;
  }

  const isSlash = m[1] !== undefined;
  const query = (isSlash ? m[1] : m[2]).toLowerCase();
  state.intellisensePrefixStart = pos - m[0].length;

  const catalog = buildAllIntellisenseCatalog();
  const matches = catalog.filter(item => {
    if (isSlash && !query) return item.kind.includes('CP');
    return item.key.toLowerCase().includes(query) || item.label.toLowerCase().includes(query);
  }).slice(0, 8);

  if (!matches.length) {
    closeIntellisense();
    return;
  }

  state.intellisenseItems = matches;
  state.intellisenseIndex = 0;
  state.intellisenseOpen = true;

  // Compute approximate pixel coordinates near caret
  const linesUpTo = before.split('\n');
  const lnIdx = linesUpTo.length - 1;
  const colIdx = linesUpTo[linesUpTo.length - 1].length;
  const lineH = Math.round(state.editorFontSize * 1.63);
  const charW = state.editorFontSize * 0.6;
  const topPx = Math.max(12, Math.min(ta.clientHeight - 180, 12 + (lnIdx + 1) * lineH - ta.scrollTop));
  const leftPx = Math.max(16, Math.min(ta.clientWidth - 310, 16 + colIdx * charW - ta.scrollLeft));

  popup.style.top = `${topPx}px`;
  popup.style.left = `${leftPx}px`;
  popup.classList.add('open');
  renderIntellisenseItems();
}

function renderIntellisenseItems() {
  const popup = document.getElementById('intellisensePopup');
  if (!popup) return;
  popup.innerHTML = state.intellisenseItems.map((it, idx) => `
    <div class="intellisense-item ${idx === state.intellisenseIndex ? 'active' : ''}" onmousedown="event.preventDefault(); applyIntellisenseItem(${idx})">
      <span class="is-left">${escHtml(it.label)}</span>
      <span class="is-kind">${escHtml(it.kind)}</span>
    </div>
  `).join('');
}

function applyIntellisenseItem(idx) {
  const ta = document.getElementById('codeTextarea');
  const item = state.intellisenseItems[idx];
  if (!ta || !item) return;
  const end = ta.selectionEnd || 0;
  const start = state.intellisensePrefixStart;
  ta.value = ta.value.slice(0, start) + item.insert + ta.value.slice(end);
  const nextCursor = start + item.insert.length;
  ta.selectionStart = ta.selectionEnd = nextCursor;
  closeIntellisense();
  onEditorContentMutated();
}

function closeIntellisense() {
  state.intellisenseOpen = false;
  state.intellisenseItems = [];
  const popup = document.getElementById('intellisensePopup');
  if (popup) popup.classList.remove('open');
}

/* ---------- Find & Replace Bar (Ctrl+F) & Code Formatter ---------- */
function toggleFindBar(forceState) {
  const bar = document.getElementById('findReplaceBar');
  const findInput = document.getElementById('findInput');
  if (!bar) return;
  const next = typeof forceState === 'boolean' ? forceState : !bar.classList.contains('open');
  bar.classList.toggle('open', next);
  if (next && findInput) {
    const ta = document.getElementById('codeTextarea');
    if (ta && ta.selectionStart !== ta.selectionEnd) {
      findInput.value = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    }
    findInput.focus();
    findInput.select();
  }
}

function findNextInEditor() {
  const ta = document.getElementById('codeTextarea');
  const q = document.getElementById('findInput')?.value || '';
  if (!ta || !q) return;
  const text = ta.value;
  const startFrom = ta.selectionEnd || 0;
  let idx = text.indexOf(q, startFrom);
  if (idx === -1) idx = text.indexOf(q, 0);
  if (idx !== -1) {
    ta.focus();
    ta.setSelectionRange(idx, idx + q.length);
    scheduleEditorRender();
  } else {
    showToast('Không tìm thấy: ' + q);
  }
}

function replaceInEditor(all = false) {
  const ta = document.getElementById('codeTextarea');
  const q = document.getElementById('findInput')?.value || '';
  const rep = document.getElementById('replaceInput')?.value ?? '';
  if (!ta || !q) return;
  if (all) {
    ta.value = ta.value.split(q).join(rep);
    onEditorContentMutated();
    showToast('✨ Đã thay thế tất cả');
  } else {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel === q) {
      const start = ta.selectionStart;
      ta.value = ta.value.slice(0, start) + rep + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = start + rep.length;
      onEditorContentMutated();
    }
    findNextInEditor();
  }
}

function formatCurrentCode() {
  const ta = document.getElementById('codeTextarea');
  if (!ta) return;
  const lines = ta.value.replace(/\r\n/g, '\n').split('\n');
  let depth = 0;
  const formatted = [];
  for (let raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      formatted.push('');
      continue;
    }
    if (trimmed.startsWith('}') || trimmed.startsWith('];') || trimmed.startsWith(');')) {
      depth = Math.max(0, depth - 1);
    }
    const isPreproc = trimmed.startsWith('#');
    const indent = isPreproc ? '' : '    '.repeat(depth);
    formatted.push(indent + trimmed);
    const openCount = (trimmed.match(/\{/g) || []).length;
    const closeCount = (trimmed.match(/\}/g) || []).length;
    if (trimmed.startsWith('}')) {
      depth = Math.max(0, depth + openCount - Math.max(0, closeCount - 1));
    } else {
      depth = Math.max(0, depth + openCount - closeCount);
    }
  }
  ta.value = formatted.join('\n') + '\n';
  onEditorContentMutated();
  showToast('✨ Đã tự động căn chỉnh & format code!');
}

/* ---------- File Explorer, Open Tabs & Custom New File Modal ---------- */
function detectLangFromFilename(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'py') return 'python';
  if (ext === 'js' || ext === 'mjs') return 'javascript';
  if (ext === 'html' || ext === 'htm') return 'html';
  return 'cpp';
}

function fileIcon(name) {
  if (name.endsWith('.cpp') || name.endsWith('.h')) return '🟦';
  if (name.endsWith('.py')) return '🐍';
  if (name.endsWith('.html') || name.endsWith('.css')) return '🌐';
  if (name.endsWith('.js')) return '🟨';
  return '📄';
}

function renderOpenTabs() {
  const bar = document.getElementById('openFileTabs');
  if (!bar) return;
  bar.innerHTML = state.openTabs.map(f => {
    const isDirty = state.dirtyFiles.has(f);
    const active = f === state.activeFile ? 'active' : '';
    return `<div class="file-tab ${active}" onclick="openFileInEditor('${escHtml(f)}')">
      <span>${fileIcon(f)} ${escHtml(f)}${isDirty ? ' ●' : ''}</span>
      ${state.openTabs.length > 1 ? `<span class="tab-close" onclick="event.stopPropagation(); closeFileTab('${escHtml(f)}')" title="Đóng tab">✕</span>` : ''}
    </div>`;
  }).join('');
}

function closeFileTab(relPath) {
  const idx = state.openTabs.indexOf(relPath);
  if (idx === -1 || state.openTabs.length <= 1) return;
  state.openTabs.splice(idx, 1);
  if (state.activeFile === relPath) {
    const nextFile = state.openTabs[Math.max(0, idx - 1)];
    openFileInEditor(nextFile);
  } else {
    renderOpenTabs();
  }
}

function renderFileTree() {
  const container = document.getElementById('fileTreeList');
  if (!container) return;
  const items = [];
  function walk(list, prefix = '') {
    for (const item of list) {
      if (item.type === 'dir') {
        items.push(`<div class="list-item" style="opacity:0.82;font-weight:700"><span>📂 ${escHtml(prefix + item.name)}/</span></div>`);
        if (item.children) walk(item.children, prefix + item.name + '/');
      } else {
        const active = item.path === state.activeFile ? 'active' : '';
        items.push(`<div class="list-item ${active}" onclick="openFileInEditor('${escHtml(item.path)}')">
          <span>${fileIcon(item.name)} ${escHtml(item.path)}</span>
          <span style="font-size:10.5px;color:var(--text-2)">${item.size} B</span>
        </div>`);
      }
    }
  }
  walk(state.files);
  container.innerHTML = items.join('');
}

async function loadWorkspaceFiles() {
  try {
    const data = await apiGet('/api/studio/files');
    state.workspace = data.workspace || '';
    state.files = data.files || [];
    const lbl = document.getElementById('workspacePathLabel');
    if (lbl) lbl.textContent = state.workspace.split(/[\\/]/).slice(-2).join('/');
    renderFileTree();
  } catch (e) {
    console.error(e);
  }
}
window.loadFiles = loadWorkspaceFiles;

async function openFileInEditor(relPath) {
  try {
    const ta = document.getElementById('codeTextarea');
    if (ta && state.activeFile && (state.activeFile in state.fileCache)) {
      state.fileCache[state.activeFile] = ta.value;
    }
    if (!state.openTabs.includes(relPath)) {
      state.openTabs.push(relPath);
    }
    state.activeFile = relPath;
    state.errorLine = null;
    if (!(relPath in state.fileCache)) {
      const data = await apiGet(`/api/studio/file?path=${encodeURIComponent(relPath)}`);
      state.fileCache[relPath] = data.content ?? '';
    }
    const langSel = document.getElementById('editorLangSelect');
    if (langSel) langSel.value = detectLangFromFilename(relPath);
    if (ta) {
      ta.value = state.fileCache[relPath];
      renderEditorNow();
    }
    renderOpenTabs();
    renderFileTree();
    if (relPath.endsWith('.html')) {
      toggleWebPreviewPane(true);
    }
  } catch (e) {
    showToast('Không thể mở tệp: ' + relPath);
  }
}

async function saveCurrentFile(silent = false) {
  const ta = document.getElementById('codeTextarea');
  if (!ta || !state.activeFile) return;
  const content = ta.value;
  state.fileCache[state.activeFile] = content;
  try {
    await apiPost('/api/studio/file', { path: state.activeFile, content });
    state.dirtyFiles.delete(state.activeFile);
    const badge = document.getElementById('saveStateBadge');
    if (badge) {
      badge.textContent = 'Đã lưu';
      badge.className = 'badge easy';
    }
    renderOpenTabs();
    if (!silent) showToast(`💾 Đã lưu ${state.activeFile}`);
  } catch (e) {
    showToast('Lỗi lưu file: ' + e.message);
  }
}

let newFilePresetMode = 'cp';
function promptNewFile() {
  const modal = document.getElementById('newFileModal');
  const input = document.getElementById('newFileNameInput');
  if (!modal) return;
  newFilePresetMode = 'cp';
  modal.classList.add('open');
  if (input) {
    input.value = 'bai1.cpp';
    input.focus();
    input.select();
  }
}

function closeNewFileModal() {
  const modal = document.getElementById('newFileModal');
  if (modal) modal.classList.remove('open');
}

function selectNewFilePreset(defaultName, presetMode) {
  newFilePresetMode = presetMode;
  const input = document.getElementById('newFileNameInput');
  if (input) {
    input.value = defaultName;
    input.focus();
  }
}

async function confirmCreateNewFile() {
  const input = document.getElementById('newFileNameInput');
  const clean = (input ? input.value : '').trim();
  if (!clean) return;
  closeNewFileModal();

  let starter = '';
  if (clean.endsWith('.cpp')) {
    if (newFilePresetMode === 'brute') {
      starter = `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Giải thuật vét cạn (Brute-Force) để đối chiếu kết quả\n    return 0;\n}\n`;
    } else {
      starter = `#include <bits/stdc++.h>\nusing namespace std;\n\nusing ll = long long;\n#define all(x) (x).begin(), (x).end()\n\nvoid solve() {\n    \n}\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int t = 1;\n    // cin >> t;\n    while (t--) solve();\n    return 0;\n}\n`;
    }
  } else if (clean.endsWith('.py')) {
    starter = `import sys\ninput = sys.stdin.readline\n\ndef solve():\n    pass\n\nif __name__ == "__main__":\n    solve()\n`;
  } else if (clean.endsWith('.html')) {
    starter = `<!DOCTYPE html>\n<html lang="vi">\n<head>\n  <meta charset="UTF-8">\n  <title>DrgX Web App</title>\n</head>\n<body>\n  <h1>Hello DrgX Studio</h1>\n</body>\n</html>\n`;
  }

  await apiPost('/api/studio/file', { path: clean, content: starter });
  delete state.fileCache[clean];
  await loadWorkspaceFiles();
  await openFileInEditor(clean);
  showToast(`✨ Đã tạo & mở ${clean}`);
}

function onLangSelectChange() {
  const sel = document.getElementById('editorLangSelect');
  if (sel && sel.value === 'html') toggleWebPreviewPane(true);
  scheduleEditorRender();
}

function onEditorContentMutated() {
  state.dirtyFiles.add(state.activeFile);
  state.stats.keystrokes++;
  state.errorLine = null;
  updateStatsHud();
  const badge = document.getElementById('saveStateBadge');
  if (badge) {
    badge.textContent = 'Đang sửa ●';
    badge.className = 'badge medium';
  }
  renderOpenTabs();
  scheduleEditorRender();

  // Smooth auto-save after 1.2s of idle typing
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(() => {
    saveCurrentFile(true);
  }, 1200);
}

/* ---------- Code Compile & Run (with CE Line Highlighting) ---------- */
function parseCompilerErrorLine(compileOutput) {
  if (!compileOutput) return null;
  const m = String(compileOutput).match(/\.cpp:(\d+):(\d+):\s*(?:fatal\s+)?error:/i);
  return m ? parseInt(m[1], 10) : null;
}

async function runCurrentCode() {
  const ta = document.getElementById('codeTextarea');
  const stdinBox = document.getElementById('stdinBox');
  const stdoutBox = document.getElementById('stdoutBox');
  const verdictBadge = document.getElementById('execVerdictBadge');
  const timeLabel = document.getElementById('execTimeLabel');
  const langSel = document.getElementById('editorLangSelect');

  if (!ta) return;
  await saveCurrentFile(true);
  switchDock('io');

  const lang = langSel ? langSel.value : detectLangFromFilename(state.activeFile);
  if (lang === 'html') {
    toggleWebPreviewPane(true);
    showToast('🌐 Đã cập nhật Live Web Preview');
    return;
  }

  state.errorLine = null;
  verdictBadge.textContent = 'Đang chạy...';
  verdictBadge.className = 'badge info';
  stdoutBox.textContent = '⏳ Đang biên dịch & thực thi...';

  state.stats.runs++;
  updateStatsHud();

  const res = await apiPost('/api/studio/run', {
    code: ta.value,
    lang,
    stdin: stdinBox ? stdinBox.value : '',
    timeoutMs: 4000
  });

  verdictBadge.textContent = res.verdict || (res.ok ? 'OK' : 'ERROR');
  verdictBadge.className = `badge ${res.verdict === 'OK' ? 'AC' : res.verdict || 'WA'}`;
  timeLabel.textContent = `${res.timeMs || 0} ms`;

  if (res.verdict === 'CE') {
    const errOut = res.compileOutput || res.stderr || '';
    state.errorLine = parseCompilerErrorLine(errOut);
    stdoutBox.textContent = `❌ LỖI BIÊN DỊCH (Compilation Error)${state.errorLine ? ` tại Dòng ${state.errorLine}` : ''}:\n\n${errOut}`;
    scheduleEditorRender();
    showToast(`❌ Lỗi biên dịch C++${state.errorLine ? ` (Dòng ${state.errorLine})` : ''}`);
  } else {
    const out = [];
    if (res.stdout) out.push(res.stdout);
    if (res.stderr) out.push(`--- [STDERR] ---\n${res.stderr}`);
    if (!out.length) out.push('(Chương trình kết thúc thành công, không in dữ liệu ra stdout)');
    stdoutBox.textContent = out.join('\n');
    scheduleEditorRender();
    showToast(`✅ Thực thi xong (${res.timeMs || 0} ms)`);
  }
}

function copyOutput() {
  const box = document.getElementById('stdoutBox');
  if (box && navigator.clipboard) {
    navigator.clipboard.writeText(box.textContent || '');
    showToast('📋 Đã sao chép kết quả');
  }
}

async function pasteStdinClipboard() {
  const box = document.getElementById('stdinBox');
  if (box && navigator.clipboard && navigator.clipboard.readText) {
    try {
      box.value = await navigator.clipboard.readText();
      showToast('📥 Đã dán dữ liệu vào STDIN');
    } catch (_) {}
  }
}

/* ---------- Batch Test Runner ---------- */
function renderTestCases() {
  const container = document.getElementById('testCasesContainer');
  const countBadge = document.getElementById('testCountBadge');
  if (countBadge) countBadge.textContent = String(state.testCases.length);
  if (!container) return;

  container.innerHTML = state.testCases.map((tc, idx) => {
    const vBadge = tc.verdict
      ? `<span class="badge ${tc.verdict}">${escHtml(tc.verdict)} ${tc.timeMs != null ? `(${tc.timeMs}ms)` : ''}</span>`
      : `<span class="badge info">Chưa chạy</span>`;
    return `<div class="ai-card" style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${escHtml(tc.name || `Test #${idx + 1}`)}</strong>
        <div style="display:flex;gap:4px;align-items:center">
          ${vBadge}
          <button class="btn sm" onclick="removeTestCase(${idx})" title="Xóa test này">✕</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div>
          <div style="font-size:10.5px;color:var(--text-2);margin-bottom:2px">Input:</div>
          <textarea class="input-box" style="height:52px;font-family:monospace;font-size:11.5px" oninput="state.testCases[${idx}].input=this.value">${escHtml(tc.input)}</textarea>
        </div>
        <div>
          <div style="font-size:10.5px;color:var(--text-2);margin-bottom:2px">Expected Output:</div>
          <textarea class="input-box" style="height:52px;font-family:monospace;font-size:11.5px" oninput="state.testCases[${idx}].expected=this.value">${escHtml(tc.expected)}</textarea>
        </div>
      </div>
      ${tc.actual !== undefined && tc.verdict ? `<div style="font-size:11px;font-family:monospace;padding:4px 6px;border-radius:4px;background:var(--bg-0)"><b>Output thực tế:</b> ${escHtml(tc.actual || '(trống)')}</div>` : ''}
    </div>`;
  }).join('');
}

function addTestCase(input = '', expected = '', name = '') {
  state.testCases.push({
    name: name || `Test #${state.testCases.length + 1}`,
    input,
    expected,
    actual: '',
    verdict: ''
  });
  renderTestCases();
}

function removeTestCase(idx) {
  state.testCases.splice(idx, 1);
  renderTestCases();
}

async function runBatchTests() {
  const ta = document.getElementById('codeTextarea');
  const langSel = document.getElementById('editorLangSelect');
  const summary = document.getElementById('batchSummaryText');
  if (!ta) return;

  switchDock('tests');
  if (summary) summary.textContent = '⏳ Đang biên dịch & chấm toàn bộ bộ test...';

  const res = await apiPost('/api/studio/test-batch', {
    code: ta.value,
    lang: langSel ? langSel.value : 'cpp',
    tests: state.testCases,
    timeoutMs: 3000
  });

  state.stats.testsRun += state.testCases.length;
  updateStatsHud();

  if (res.verdict === 'CE') {
    state.errorLine = parseCompilerErrorLine(res.compileOutput);
    scheduleEditorRender();
    if (summary) summary.textContent = '❌ Lỗi biên dịch (CE) — Xem tab Thực Thi';
    document.getElementById('stdoutBox').textContent = res.compileOutput || 'Lỗi biên dịch';
    showToast('❌ Lỗi biên dịch khi chạy bộ test');
    return;
  }

  (res.results || []).forEach((r, i) => {
    if (state.testCases[i]) {
      state.testCases[i].verdict = r.verdict;
      state.testCases[i].actual = r.actual;
      state.testCases[i].timeMs = r.timeMs;
    }
  });
  renderTestCases();
  if (summary) {
    summary.textContent = `Kết quả: ${res.passed}/${res.total} AC (${res.passed === res.total ? '🎉 Hoàn hảo!' : '⚠️ Có test sai'})`;
  }
  showToast(`🧪 Bộ test: ${res.passed}/${res.total} AC`);
}

/* ---------- Automated Stress Tester ---------- */
async function runStressTest() {
  const ta = document.getElementById('codeTextarea');
  const box = document.getElementById('stressOutputBox');
  const badge = document.getElementById('stressStatusBadge');
  const iterInput = document.getElementById('stressIterInput');
  const tlInput = document.getElementById('stressTlInput');
  if (!ta || !box) return;

  await saveCurrentFile(true);
  if (!state.fileCache['brute.cpp']) {
    const b = await apiGet('/api/studio/file?path=brute.cpp');
    state.fileCache['brute.cpp'] = b.content || '';
  }
  if (!state.fileCache['gen.py']) {
    const g = await apiGet('/api/studio/file?path=gen.py');
    state.fileCache['gen.py'] = g.content || '';
  }

  const iterations = parseInt(iterInput ? iterInput.value : '15', 10) || 15;
  const timeLimitMs = parseInt(tlInput ? tlInput.value : '1500', 10) || 1500;

  badge.textContent = `⏳ Đang chạy ${iterations} test đối chiếu...`;
  badge.className = 'badge info';
  box.textContent = `Đang biên dịch code chính & brute.cpp, sinh ${iterations} test ngẫu nhiên bằng gen.py...`;

  const res = await apiPost('/api/studio/stress', {
    solutionCode: ta.value,
    bruteCode: state.fileCache['brute.cpp'],
    genCode: state.fileCache['gen.py'],
    iterations,
    timeLimitMs
  });

  if (!res.ok) {
    badge.textContent = res.status || 'Lỗi biên dịch';
    badge.className = 'badge CE';
    box.textContent = `❌ Lỗi biên dịch (${res.status}):\n\n${res.compileOutput || ''}`;
    return;
  }

  if (res.status === 'ALL_PASSED') {
    badge.textContent = `✅ Vượt qua ${res.passed}/${res.iterations} test`;
    badge.className = 'badge AC';
    box.textContent = [
      `🎉 HOÀN HẢO! Code của bạn khớp 100% với brute.cpp qua toàn bộ ${res.passed}/${res.iterations} test sinh ngẫu nhiên.`,
      ``,
      `Chi tiết thời gian chạy:`,
      ...(res.history || []).map(h => `  • Test #${h.iteration}: ${h.verdict} (${h.timeMs} ms)`)
    ].join('\n');
    showToast(`⚔️ Stress Test: ${res.passed}/${res.iterations} PASS!`);
  } else if (res.counterExample) {
    const ce = res.counterExample;
    badge.textContent = `🚨 Bắt được phản ví dụ ở Test #${ce.iteration} (${ce.verdict})`;
    badge.className = 'badge WA';
    box.textContent = [
      `🚨 PHÁT HIỆN PHẢN VÍ DỤ TẠI TEST #${ce.iteration} (Verdict: ${ce.verdict})`,
      `==========================================================`,
      `[INPUT SINH BỞI gen.py]:`,
      ce.input.trim(),
      ``,
      `[EXPECTED (brute.cpp)]:`,
      ce.expected,
      ``,
      `[ACTUAL (code của bạn)]:`,
      ce.actual,
      `==========================================================`,
      `💡 Phản ví dụ này đã được tự động thêm vào tab "🧪 Bộ Test" để bạn debug!`
    ].join('\n');
    addTestCase(ce.input, ce.expected, `Phản ví dụ #${ce.iteration}`);
    showToast(`🚨 Đã bắt được phản ví dụ tại Test #${ce.iteration}!`);
  }
}

/* ---------- 47 OJ Problems & Subtask Judging ---------- */
async function loadOjProblems() {
  try {
    const data = await apiGet('/api/studio/problems');
    state.problems = data.problems || [];
    renderProblemList();
    if (state.problems.length > 0 && !state.activeProblem) {
      selectOjProblem(state.problems[0].id, false);
    }
  } catch (e) {
    console.error(e);
  }
}

function renderProblemList() {
  const container = document.getElementById('problemListContainer');
  const q = (document.getElementById('probSearch')?.value || '').trim().toLowerCase();
  const diff = document.getElementById('probDiffFilter')?.value || '';
  if (!container) return;

  const filtered = state.problems.filter(p => {
    if (diff && p.difficulty !== diff) return false;
    if (!q) return true;
    return (
      (p.title || '').toLowerCase().includes(q) ||
      (p.id || '').toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q))
    );
  });

  container.innerHTML = filtered.map(p => {
    const active = state.activeProblem && state.activeProblem.id === p.id ? 'active' : '';
    const dClass = p.difficulty === 'Dễ' ? 'easy' : p.difficulty === 'Khó' ? 'hard' : 'medium';
    return `<div class="list-item ${active}" onclick="selectOjProblem('${escHtml(p.id)}', true)">
      <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <div style="font-weight:700">${escHtml(p.title)}</div>
        <div style="font-size:10.5px;color:var(--text-2)">#${escHtml(p.id)} · ${(p.tags || []).slice(0, 2).join(', ')}</div>
      </div>
      <span class="badge ${dClass}">${escHtml(p.difficulty || 'TB')}</span>
    </div>`;
  }).join('');
}

async function selectOjProblem(probId, openPane = true) {
  try {
    const detail = await apiGet(`/api/studio/problem/${encodeURIComponent(probId)}`);
    if (!detail || detail.error) return;
    state.activeProblem = detail;
    state.hintLevel = 1;
    renderProblemList();

    const titleEl = document.getElementById('activeProblemTitle');
    const bodyEl = document.getElementById('statementBody');
    if (titleEl) titleEl.textContent = `${detail.title} (#${detail.id})`;
    if (bodyEl) {
      const subtasksHtml = Array.isArray(detail.subtasks) && detail.subtasks.length
        ? `<h3>📊 Phân hoạch Subtask</h3>
           <table style="width:100%;border-collapse:collapse;font-size:12px;margin:6px 0">
             <tr style="border-bottom:1px solid var(--border);text-align:left">
               <th style="padding:4px">Subtask</th><th style="padding:4px">Điểm</th><th style="padding:4px">Ràng buộc</th>
             </tr>
             ${detail.subtasks.map((st, idx) => `<tr style="border-bottom:1px solid var(--border)">
               <td style="padding:4px">#${idx + 1}</td>
               <td style="padding:4px"><span class="badge info">${st.score || st.points || 25}đ</span></td>
               <td style="padding:4px">${escHtml(st.description || st.constraints || '')}</td>
             </tr>`).join('')}
           </table>`
        : '';

      const samples = Array.isArray(detail.samples) && detail.samples.length
        ? detail.samples
        : detail.sample_input
        ? [{ input: detail.sample_input, output: detail.sample_output || '' }]
        : [];

      const samplesHtml = samples.map((s, idx) => `
        <h3>🧪 Ví dụ #${idx + 1}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div><small>Input:</small><pre>${escHtml(s.input)}</pre></div>
          <div><small>Output:</small><pre>${escHtml(s.output)}</pre></div>
        </div>
      `).join('');

      bodyEl.innerHTML = `
        <h2>${escHtml(detail.title)}</h2>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          <span class="badge info">⏱️ ${detail.time_limit_ms || 1000} ms</span>
          <span class="badge info">💾 ${detail.memory_limit_mb || 256} MB</span>
          ${(detail.tags || []).map(t => `<span class="badge easy">${escHtml(t)}</span>`).join('')}
        </div>
        <div>${(detail.description || detail.statement || '').replace(/\n/g, '<br>')}</div>
        ${detail.input_format ? `<h3>📥 Dữ liệu vào</h3><div>${escHtml(detail.input_format)}</div>` : ''}
        ${detail.output_format ? `<h3>📤 Dữ liệu ra</h3><div>${escHtml(detail.output_format)}</div>` : ''}
        ${subtasksHtml}
        ${samplesHtml}
      `;
    }
    if (openPane) toggleStatementPane(true);
  } catch (e) {
    console.error(e);
  }
}

function loadProblemSamplesIntoRunner() {
  if (!state.activeProblem) {
    showToast('Hãy chọn 1 bài tập OJ trước');
    return;
  }
  const p = state.activeProblem;
  const samples = Array.isArray(p.samples) && p.samples.length
    ? p.samples
    : p.sample_input
    ? [{ input: p.sample_input, output: p.sample_output || '' }]
    : [];
  if (!samples.length) {
    showToast('Bài tập này chưa có sample riêng');
    return;
  }
  state.testCases = samples.map((s, i) => ({
    name: `${p.id} — Sample #${i + 1}`,
    input: s.input,
    expected: s.output,
    actual: '',
    verdict: ''
  }));
  const stdinBox = document.getElementById('stdinBox');
  if (stdinBox && samples[0]) stdinBox.value = samples[0].input;
  renderTestCases();
  switchDock('tests');
  showToast(`📥 Đã nạp ${samples.length} test mẫu của bài "${p.title}"`);
}

async function submitToOj() {
  const ta = document.getElementById('codeTextarea');
  const langSel = document.getElementById('editorLangSelect');
  const stdoutBox = document.getElementById('stdoutBox');
  const verdictBadge = document.getElementById('execVerdictBadge');
  const probId = state.activeProblem ? state.activeProblem.id : 'greedy_activity_001';

  if (!ta) return;
  switchDock('io');
  verdictBadge.textContent = 'Đang chấm OJ...';
  verdictBadge.className = 'badge info';
  stdoutBox.textContent = `⏳ Đang gửi bài nộp tới C++17 Subtask Judge cho bài #${probId}...`;

  state.stats.submits++;
  updateStatsHud();

  const res = await apiPost('/api/studio/judge', {
    problem_id: probId,
    language: langSel ? langSel.value : 'cpp',
    code: ta.value
  });

  if (res.error) {
    verdictBadge.textContent = 'Lỗi OJ';
    verdictBadge.className = 'badge WA';
    stdoutBox.textContent = `❌ ${res.error}`;
    return;
  }

  const verdict = res.verdict || res.status || 'WA';
  const score = res.score ?? 0;
  const maxScore = res.max_score ?? 100;
  verdictBadge.textContent = `${verdict} (${score}/${maxScore}đ)`;
  verdictBadge.className = `badge ${verdict === 'AC' ? 'AC' : score > 0 ? 'PARTIAL' : 'WA'}`;

  const lines = [
    `🏆 KẾT QUẢ CHẤM TRÊN VOID-BIT SUBTASK JUDGE`,
    `• Bài tập: ${state.activeProblem ? state.activeProblem.title : probId} (#${probId})`,
    `• Phán quyết: ${verdict} — Điểm số: ${score} / ${maxScore}`,
    `• Thời gian tối đa: ${res.max_time_ms ?? 0} ms`,
    ``
  ];
  if (res.compile_error) {
    lines.push(`❌ LỖI BIÊN DỊCH:\n${res.compile_error}`);
  }
  const subtasks = res.subtask_results || res.subtasks || [];
  if (Array.isArray(subtasks) && subtasks.length) {
    lines.push(`📊 CHI TIẾT TỪNG SUBTASK:`);
    subtasks.forEach((st, idx) => {
      lines.push(`  • Subtask #${st.id || idx + 1}: ${st.status || st.verdict || (st.passed ? 'AC' : 'WA')} — ${st.points ?? st.earned_points ?? 0}/${st.max_points ?? st.max_score ?? 0} điểm (${st.passed ?? 0}/${st.total ?? 0} tests)`);
    });
    lines.push('');
  }
  const tcs = res.test_cases || res.results || [];
  if (Array.isArray(tcs) && tcs.length) {
    lines.push(`🧪 CHI TIẾT TỪNG TEST CASE (${tcs.length} tests):`);
    tcs.forEach(tc => {
      lines.push(`  • Test #${tc.index || tc.test_id || tc.id} (Subtask ${tc.subtask || 1}): ${tc.status || tc.verdict} (${Math.round(tc.time_ms ?? 0)} ms)`);
    });
  }
  stdoutBox.textContent = lines.join('\n');
  showToast(`🏆 Chấm xong: ${verdict} (${score}/${maxScore} điểm)`);
}

/* ---------- 15+ Competitive Programming Templates ---------- */
async function loadCpTemplates() {
  try {
    const data = await apiGet('/api/studio/templates');
    state.templates = data.templates || [];
    renderTemplateList();
  } catch (e) {
    console.error(e);
  }
}

function renderTemplateList() {
  const container = document.getElementById('templateListContainer');
  const q = (document.getElementById('tplSearch')?.value || '').trim().toLowerCase();
  if (!container) return;

  const list = state.templates.filter(t => {
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.desc.toLowerCase().includes(q)
    );
  });

  container.innerHTML = list.map(t => `
    <div class="ai-card" style="margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong style="color:var(--text-0)">${escHtml(t.name)}</strong>
        <span class="badge info">${escHtml(t.category)}</span>
      </div>
      <p style="font-size:11.5px;color:var(--text-2);margin:4px 0 8px">${escHtml(t.desc)}</p>
      <div style="display:flex;gap:6px">
        <button class="btn sm primary" onclick="insertTemplate('${escHtml(t.id)}', false)">📥 Chèn vào con trỏ</button>
        <button class="btn sm" onclick="insertTemplate('${escHtml(t.id)}', true)">📄 Thay toàn bộ</button>
      </div>
    </div>
  `).join('');
}

function insertTemplate(tplId, replaceAll = false) {
  const tpl = state.templates.find(t => t.id === tplId);
  const ta = document.getElementById('codeTextarea');
  if (!tpl || !ta) return;

  if (replaceAll) {
    ta.value = tpl.code;
  } else {
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    ta.value = ta.value.slice(0, start) + '\n' + tpl.code + '\n' + ta.value.slice(end);
  }
  onEditorContentMutated();
  showToast(`📚 Đã chèn template: ${tpl.name}`);
}

/* ---------- AI Copilot & Auto-Fixer ---------- */
function appendAiCard(title, htmlBody, extraActionsHtml = '') {
  const feed = document.getElementById('aiFeed');
  if (!feed) return;
  const card = document.createElement('div');
  card.className = 'ai-card';
  card.innerHTML = `
    <h4>${escHtml(title)}</h4>
    <div style="white-space:pre-wrap;font-size:12px">${htmlBody}</div>
    ${extraActionsHtml ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${extraActionsHtml}</div>` : ''}
  `;
  feed.appendChild(card);
  feed.scrollTop = feed.scrollHeight;
}

async function aiAction(mode) {
  switchRight('copilot');
  const ta = document.getElementById('codeTextarea');
  const langSel = document.getElementById('editorLangSelect');
  const code = ta ? ta.value : '';
  const probId = state.activeProblem ? state.activeProblem.id : 'greedy_activity_001';

  const res = await apiPost('/api/studio/ai', {
    mode,
    code,
    lang: langSel ? langSel.value : 'cpp',
    problem_id: probId,
    level: state.hintLevel
  });

  if (mode === 'bugcheck' || mode === 'optimize' || mode === 'explain') {
    if (res.firstErrorLine && res.firstErrorLine > 0) {
      state.errorLine = res.firstErrorLine;
      scheduleEditorRender();
      showToast(`🚨 Phát hiện ${(res.findings || []).length} vấn đề (bắt đầu từ Dòng ${res.firstErrorLine})`);
    } else {
      state.errorLine = 0;
      scheduleEditorRender();
    }
    let btnHtml = '';
    if (res.fixedCode && res.fixedCode !== code) {
      state.lastAiFixedCode = res.fixedCode;
      btnHtml = [
        `<button class="btn sm primary" onclick="applyAiFixToEditor()">✨ Áp dụng bản vá vào Editor</button>`,
        `<button class="btn sm success" onclick="applyAiFixAndRun()">🚀 Vá &amp; Chạy Code Ngay</button>`
      ].join('');
    }
    appendAiCard(`🤖 ${res.title || 'Phân tích AI'}`, escHtml(res.markdown || ''), btnHtml);
    return;
  }

  if (mode === 'gentest') {
    window._lastAiGeneratedTests = res.tests || [];
    const btnHtml = `<button class="btn sm success" onclick="loadAiGeneratedTests()">📥 Nạp ${window._lastAiGeneratedTests.length} Test Hiểm vào Runner</button>`;
    appendAiCard(`🎲 ${res.title}`, escHtml(res.markdown || ''), btnHtml);
    return;
  }

  if (mode === 'hint') {
    const hintText = res.hint || res.content || 'Hãy kiểm tra giới hạn dữ liệu và chọn thuật toán tối ưu.';
    appendAiCard(`💡 Gợi ý Tầng ${state.hintLevel}/3 (${probId})`, escHtml(hintText));
    state.hintLevel = (state.hintLevel % 3) + 1;
    return;
  }

  if (mode === 'solution') {
    const solCode = res.code || res.solution || '';
    state.lastAiFixedCode = solCode;
    const btnHtml = solCode
      ? `<button class="btn sm primary" onclick="applyAiFixToEditor()">📥 Chép Code Mẫu vào Editor</button>`
      : '';
    appendAiCard(`🏅 Code Mẫu C++17 Chuẩn (#${probId})`, `<pre>${escHtml(solCode || 'Không có code mẫu')}</pre>`, btnHtml);
  }
}

function applyAiFixToEditor() {
  const ta = document.getElementById('codeTextarea');
  if (!ta || !state.lastAiFixedCode) return;
  ta.value = state.lastAiFixedCode;
  state.errorLine = 0;
  onEditorContentMutated();
  showToast('✨ Đã áp dụng bản vá tự động vào Editor!');
}

async function applyAiFixAndRun() {
  applyAiFixToEditor();
  await runCurrentCode();
}

function loadAiGeneratedTests() {
  if (!Array.isArray(window._lastAiGeneratedTests) || !window._lastAiGeneratedTests.length) return;
  state.testCases = window._lastAiGeneratedTests.map(t => ({
    name: t.name,
    input: t.input,
    expected: t.expected,
    actual: '',
    verdict: ''
  }));
  renderTestCases();
  switchDock('tests');
  showToast(`📥 Đã nạp ${state.testCases.length} test hiểm vào Bộ Test!`);
}

async function sendAiChat() {
  const input = document.getElementById('aiChatInput');
  const ta = document.getElementById('codeTextarea');
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  input.value = '';

  appendAiCard('🧑 Bạn', escHtml(msg));
  const probId = state.activeProblem ? state.activeProblem.id : 'greedy_activity_001';
  const res = await apiPost('/api/studio/ai', {
    mode: 'chat',
    problem_id: probId,
    message: msg,
    code: ta ? ta.value : ''
  });
  appendAiCard('🤖 DrgX Socratic Tutor', escHtml(res.reply || 'Hãy kiểm tra lại điều kiện biên và độ phức tạp.'));
}

/* ---------- DevTools, Doctor, Git & Anti-Cheat ---------- */
async function runStudioDoctor() {
  const box = document.getElementById('devDoctorBox');
  if (box) box.textContent = '⏳ Đang kiểm tra toàn bộ công cụ biên dịch & máy chấm...';
  const res = await apiGet('/api/studio/doctor');
  const lines = [
    `🩺 DRGX STUDIO DOCTOR — TRẠNG THÁI HỆ THỐNG (${res.ok ? '100% HEALTHY' : 'CẦN KIỂM TRA'})`,
    `• Workspace: ${res.workspace}`,
    `------------------------------------------------------------`,
    ...(res.checks || []).map(c => `[${c.ok ? '✓' : '✗'}] ${c.label.padEnd(30)} : ${c.version}\n    Path: ${c.path}`)
  ];
  if (box) box.textContent = lines.join('\n');
}

async function runGitStatus() {
  switchDock('devtools');
  const box = document.getElementById('devDoctorBox');
  if (box) box.textContent = '⏳ Đang truy vấn trạng thái Git...';
  const res = await apiGet('/api/studio/git');
  if (box) {
    box.textContent = `🌿 GIT STATUS:\n${res.status || '(Sạch)'}\n\n📜 RECENT COMMITS:\n${res.log || ''}`;
  }
}

async function runAntiCheatSelfCheck() {
  const ta = document.getElementById('codeTextarea');
  const box = document.getElementById('devDoctorBox');
  if (!ta || !box) return;
  if (!state.fileCache['brute.cpp']) {
    const b = await apiGet('/api/studio/file?path=brute.cpp');
    state.fileCache['brute.cpp'] = b.content || '';
  }
  const res = await apiPost('/api/studio/ai', {
    mode: 'anticheat',
    codeA: ta.value,
    codeB: state.fileCache['brute.cpp'] || ''
  });
  const sim = res.similarity_percent ?? res.similarity ?? 0;
  box.textContent = [
    `🛡️ KẾT QUẢ QUÉT ĐẠO VĂN WINNOWING K-GRAM FINGERPRINTING`,
    `• Tệp A: ${state.activeFile}`,
    `• Tệp B: brute.cpp`,
    `• Độ tương đồng cấu trúc AST / Token: ${sim}%`,
    `• Đánh giá: ${sim >= 80 ? '⚠️ Nghi vấn sao chép cao' : '✅ Độc lập / Hợp lệ'}`
  ].join('\n');
  showToast(`🛡️ Độ tương đồng Winnowing: ${sim}%`);
}

function devUtilAction(type) {
  const box = document.getElementById('devUtilBox');
  if (!box) return;
  try {
    if (type === 'json') {
      box.value = JSON.stringify(JSON.parse(box.value), null, 2);
      showToast('✨ Đã format JSON');
    } else if (type === 'b64enc') {
      box.value = btoa(unescape(encodeURIComponent(box.value)));
      showToast('✨ Đã mã hóa Base64');
    } else if (type === 'b64dec') {
      box.value = decodeURIComponent(escape(atob(box.value.trim())));
      showToast('✨ Đã giải mã Base64');
    }
  } catch (e) {
    showToast('Lỗi dữ liệu đầu vào: ' + e.message);
  }
}

/* ---------- Vibe Studio: Skins, Pomodoro, WebAudio Synth, Matrix Rain ---------- */
function applyStudioSkin(skinId) {
  const skin = STUDIO_SKINS.find(s => s.id === skinId) || STUDIO_SKINS[0];
  document.documentElement.setAttribute('data-skin', skin.id);
  localStorage.setItem('drgx_studio_skin', skin.id);
  const lbl = document.getElementById('skinLabel');
  if (lbl) lbl.textContent = skin.label;
}

function cycleStudioSkin() {
  const cur = document.documentElement.getAttribute('data-skin') || 'ion';
  const idx = STUDIO_SKINS.findIndex(s => s.id === cur);
  const next = STUDIO_SKINS[(idx + 1) % STUDIO_SKINS.length];
  applyStudioSkin(next.id);
  showToast(`🎨 Giao diện: ${next.label}`);
}

function formatPomo(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updatePomoUi() {
  const txt = formatPomo(state.pomoSeconds);
  const top = document.getElementById('pomoDisplay');
  const big = document.getElementById('vibeTimerBig');
  if (top) top.textContent = txt;
  if (big) big.textContent = txt;
}

function setPomodoroMinutes(mins) {
  state.pomoSeconds = mins * 60;
  updatePomoUi();
  showToast(`⏱️ Đã đặt đồng hồ: ${mins} phút`);
}

function togglePomodoro() {
  state.pomoRunning = !state.pomoRunning;
  clearInterval(state.pomoTimer);
  if (state.pomoRunning) {
    state.pomoTimer = setInterval(() => {
      if (state.pomoSeconds > 0) {
        state.pomoSeconds--;
        updatePomoUi();
      } else {
        state.pomoRunning = false;
        clearInterval(state.pomoTimer);
        showToast('🔔 Hết giờ tập trung! Hãy nghỉ ngơi một chút.');
      }
    }, 1000);
    showToast('⏱️ Đã bắt đầu đếm ngược');
  } else {
    showToast('⏸️ Đã tạm dừng đồng hồ');
  }
}

function ensureAudioCtx() {
  if (!state.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) state.audioCtx = new Ctx();
  }
  if (state.audioCtx && state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }
  return state.audioCtx;
}

function stopAmbientNodes() {
  state.ambientNodes.forEach(n => {
    try { if (n.stop) n.stop(); } catch (_) {}
    try { if (n.disconnect) n.disconnect(); } catch (_) {}
  });
  state.ambientNodes = [];
}

function setAmbientMode(mode) {
  stopAmbientNodes();
  state.ambientMode = mode;
  const lbl = document.getElementById('synthLabel');
  const names = { off: 'Tắt nhạc', rain: 'Mưa đêm', brown: 'Brown Noise', pad: 'Cyber Pad' };
  if (lbl) lbl.textContent = names[mode] || 'Tắt nhạc';
  if (mode === 'off') return;

  const ctx = ensureAudioCtx();
  if (!ctx) return;

  if (mode === 'rain' || mode === 'brown') {
    const bufSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      if (mode === 'brown') {
        out[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = out[i];
        out[i] *= 0.18;
      } else {
        out[i] = white * 0.06;
      }
    }
    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = mode === 'rain' ? 950 : 420;

    whiteNoise.connect(filter);
    filter.connect(ctx.destination);
    whiteNoise.start(0);
    state.ambientNodes.push(whiteNoise, filter);
  } else if (mode === 'pad') {
    [110, 164.81, 220, 277.18].forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.018;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      state.ambientNodes.push(osc, gain);
    });
  }
  showToast(`🎵 Nhạc nền: ${names[mode]}`);
}

function cycleAmbientSound() {
  const order = ['off', 'rain', 'brown', 'pad'];
  const next = order[(order.indexOf(state.ambientMode) + 1) % order.length];
  setAmbientMode(next);
}

function playMechKeyClick() {
  const toggle = document.getElementById('mechKeyToggle');
  if (!toggle || !toggle.checked) return;
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180 + Math.random() * 40, ctx.currentTime);
    gain.gain.setValueAtTime(0.012, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.022);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.023);
  } catch (_) {}
}

function toggleMatrixRainEffect() {
  document.body.classList.toggle('matrix-rain-on');
}

function initMatrixCanvas() {
  const canvas = document.getElementById('matrixCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let cols = 0;
  let drops = [];
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / 18);
    drops = Array(cols).fill(1);
  }
  resize();
  window.addEventListener('resize', resize);
  setInterval(() => {
    if (!document.body.classList.contains('matrix-rain-on')) return;
    ctx.fillStyle = 'rgba(4, 12, 8, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#22c55e';
    ctx.font = '14px monospace';
    for (let i = 0; i < drops.length; i++) {
      const ch = String.fromCharCode(0x30A0 + Math.random() * 96);
      ctx.fillText(ch, i * 18, drops[i] * 18);
      if (drops[i] * 18 > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }, 55);
}

function updateStatsHud() {
  const r = document.getElementById('statRuns');
  const s = document.getElementById('statSubmits');
  const t = document.getElementById('statTestsRun');
  const k = document.getElementById('statKeystrokes');
  if (r) r.textContent = String(state.stats.runs);
  if (s) s.textContent = String(state.stats.submits);
  if (t) t.textContent = String(state.stats.testsRun);
  if (k) k.textContent = String(state.stats.keystrokes);
}

/* ---------- Command Palette (Ctrl+K / Ctrl+Shift+P) ---------- */
const STUDIO_COMMANDS = [
  { label: '▶ Biên dịch & Chạy Code hiện tại (F5)', action: () => runCurrentCode() },
  { label: '✨ Tự động căn chỉnh & Format Code (Shift+Alt+F)', action: () => formatCurrentCode() },
  { label: '🔍 Tìm kiếm & Thay thế trong Editor (Ctrl+F)', action: () => toggleFindBar(true) },
  { label: '📂 Mở thư mục Workspace bằng hộp thoại Windows (Ctrl+O)', action: () => pickNativeFolder() },
  { label: '📄 Tạo tệp mã nguồn mới (Ctrl+N)', action: () => promptNewFile() },
  { label: '🧪 Chạy toàn bộ Bộ Test (Ctrl+Shift+T)', action: () => runBatchTests() },
  { label: '⚔️ Chạy Stress Test đối chiếu brute.cpp + gen.py', action: () => { switchDock('stress'); runStressTest(); } },
  { label: '🏆 Nộp bài lên Void-bit C++17 Subtask Judge', action: () => submitToOj() },
  { label: '🔍 AI Copilot: Quét Bug & Tự động vá code', action: () => aiAction('bugcheck') },
  { label: '📊 AI Copilot: Giải thích code & Tính độ phức tạp O(n)', action: () => aiAction('explain') },
  { label: '⚡ AI Copilot: Tối ưu hóa tốc độ C++17', action: () => aiAction('optimize') },
  { label: '🎲 AI Copilot: Sinh 6 Test Hiểm (Corner Cases)', action: () => aiAction('gentest') },
  { label: '💡 AI Tutor: Lấy gợi ý từng bước cho bài OJ', action: () => aiAction('hint') },
  { label: '🏅 AI Tutor: Xem code mẫu C++17 của bài OJ', action: () => aiAction('solution') },
  { label: '🩺 Chạy DrgX Toolchain Doctor', action: () => { switchDock('devtools'); runStudioDoctor(); } },
  { label: '🛡️ Quét đạo văn Winnowing Fingerprinting', action: () => { switchDock('devtools'); runAntiCheatSelfCheck(); } },
  { label: '🌐 Bật / Tắt Live Web Preview', action: () => toggleWebPreviewPane() },
  { label: '📖 Bật / Tắt Đề bài OJ', action: () => toggleStatementPane() },
  { label: '🎨 Đổi Giao Diện (5 DrgX Skins)', action: () => cycleStudioSkin() },
  { label: '🎵 Đổi Nhạc Nền Tập Trung (Mưa / Brown Noise / Synth)', action: () => cycleAmbientSound() },
  { label: '✨ Bật / Tắt Hiệu Ứng Mưa Ma Trận', action: () => toggleMatrixRainEffect() }
];

function openCommandPalette() {
  const modal = document.getElementById('cmdModal');
  const input = document.getElementById('cmdInput');
  if (!modal) return;
  modal.classList.add('open');
  if (input) {
    input.value = '';
    input.focus();
  }
  renderCommandList();
}

function closeCommandPalette() {
  const modal = document.getElementById('cmdModal');
  if (modal) modal.classList.remove('open');
}

function renderCommandList() {
  const listEl = document.getElementById('cmdList');
  const q = (document.getElementById('cmdInput')?.value || '').trim().toLowerCase();
  if (!listEl) return;
  const filtered = STUDIO_COMMANDS.filter(c => !q || c.label.toLowerCase().includes(q));
  listEl.innerHTML = filtered.map(c => `
    <div class="list-item" onclick="executePaletteCommand(${STUDIO_COMMANDS.indexOf(c)})">
      <span>${escHtml(c.label)}</span>
    </div>
  `).join('');
}

function executePaletteCommand(idx) {
  closeCommandPalette();
  if (STUDIO_COMMANDS[idx]) STUDIO_COMMANDS[idx].action();
}

/* ---------- Smart IDE Editor Keybindings (Auto-Pairs, Indent, Comments, IntelliSense) ---------- */
const AUTO_PAIRS = {
  '{': '}',
  '(': ')',
  '[': ']',
  '"': '"',
  "'": "'"
};
const CLOSING_CHARS = new Set(['}', ')', ']', '"', "'"]);

function bindSmartCodeEditor(ta) {
  if (!ta) return;

  ta.addEventListener('input', () => {
    onEditorContentMutated();
    updateIntellisensePopup();
  });

  ta.addEventListener('scroll', () => {
    const pre = document.getElementById('codeHighlightPre');
    const gutter = document.getElementById('lineNumbers');
    if (pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
    if (gutter) gutter.scrollTop = ta.scrollTop;
    scheduleEditorRender();
  });

  ta.addEventListener('click', () => {
    closeIntellisense();
    scheduleEditorRender();
  });

  ta.addEventListener('keyup', e => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
      scheduleEditorRender();
    }
  });

  ta.addEventListener('keydown', e => {
    playMechKeyClick();

    // 1. IntelliSense Navigation when popup is open
    if (state.intellisenseOpen && state.intellisenseItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.intellisenseIndex = (state.intellisenseIndex + 1) % state.intellisenseItems.length;
        renderIntellisenseItems();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.intellisenseIndex = (state.intellisenseIndex - 1 + state.intellisenseItems.length) % state.intellisenseItems.length;
        renderIntellisenseItems();
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        applyIntellisenseItem(state.intellisenseIndex);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeIntellisense();
        scheduleEditorRender();
        return;
      }
    }

    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const val = ta.value;

    // 2. Tab / Shift+Tab (Ghost Text accept OR block indent/outdent)
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey && start === end && state.ghostText) {
        const ghost = state.ghostText;
        ta.value = val.slice(0, start) + ghost + val.slice(end);
        ta.selectionStart = ta.selectionEnd = start + ghost.length;
        state.ghostText = '';
        onEditorContentMutated();
        return;
      }
      if (start !== end || e.shiftKey) {
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const block = val.slice(lineStart, end);
        const lines = block.split('\n');
        const transformed = lines.map(ln => {
          if (e.shiftKey) {
            return ln.replace(/^ {1,4}|\t/, '');
          }
          return '    ' + ln;
        }).join('\n');
        ta.value = val.slice(0, lineStart) + transformed + val.slice(end);
        ta.selectionStart = lineStart;
        ta.selectionEnd = lineStart + transformed.length;
        onEditorContentMutated();
        return;
      }
      ta.value = val.slice(0, start) + '    ' + val.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 4;
      onEditorContentMutated();
      return;
    }

    // 3. Smart Enter (auto-indent & brace expansion {|})
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const curLine = val.slice(lineStart, start);
      const baseIndent = (curLine.match(/^\s*/) || [''])[0];
      const charBefore = val[start - 1] || '';
      const charAfter = val[end] || '';

      if (charBefore === '{' && charAfter === '}') {
        const innerIndent = baseIndent + '    ';
        const insertStr = `\n${innerIndent}\n${baseIndent}`;
        ta.value = val.slice(0, start) + insertStr + val.slice(end);
        ta.selectionStart = ta.selectionEnd = start + 1 + innerIndent.length;
        onEditorContentMutated();
        return;
      }

      const extraIndent = /[{:]\s*$/.test(curLine) ? '    ' : '';
      const insertStr = '\n' + baseIndent + extraIndent;
      ta.value = val.slice(0, start) + insertStr + val.slice(end);
      ta.selectionStart = ta.selectionEnd = start + insertStr.length;
      onEditorContentMutated();
      return;
    }

    // 4. Auto-closing brackets & quotes
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (CLOSING_CHARS.has(e.key) && start === end && val[start] === e.key) {
        if ((e.key !== '"' && e.key !== "'") || val[start - 1] !== '\\') {
          e.preventDefault();
          ta.selectionStart = ta.selectionEnd = start + 1;
          scheduleEditorRender();
          return;
        }
      }
      if (e.key in AUTO_PAIRS) {
        const closeCh = AUTO_PAIRS[e.key];
        if (start !== end) {
          e.preventDefault();
          const selected = val.slice(start, end);
          ta.value = val.slice(0, start) + e.key + selected + closeCh + val.slice(end);
          ta.selectionStart = start + 1;
          ta.selectionEnd = end + 1;
          onEditorContentMutated();
          return;
        }
        const nextCh = val[start] || '';
        if (!/[a-zA-Z0-9_]/.test(nextCh)) {
          e.preventDefault();
          ta.value = val.slice(0, start) + e.key + closeCh + val.slice(end);
          ta.selectionStart = ta.selectionEnd = start + 1;
          onEditorContentMutated();
          return;
        }
      }
      // Smart Backspace on empty pair {} () [] ""
      if (e.key === 'Backspace' && start === end && start > 0) {
        const prev = val[start - 1];
        const next = val[start];
        if (AUTO_PAIRS[prev] && AUTO_PAIRS[prev] === next) {
          e.preventDefault();
          ta.value = val.slice(0, start - 1) + val.slice(start + 1);
          ta.selectionStart = ta.selectionEnd = start - 1;
          onEditorContentMutated();
          return;
        }
      }
    }

    // 5. Ctrl+/ Toggle Line Comment
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const lang = document.getElementById('editorLangSelect')?.value || 'cpp';
      const prefix = lang === 'python' ? '# ' : '// ';
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const lines = val.slice(lineStart, lineEnd).split('\n');
      const allCommented = lines.every(l => l.trim().startsWith(prefix.trim()));
      const nextLines = lines.map(l => {
        if (allCommented) {
          return l.replace(lang === 'python' ? /^(\s*)#\s?/ : /^(\s*)\/\/\s?/, '$1');
        }
        return prefix + l;
      }).join('\n');
      ta.value = val.slice(0, lineStart) + nextLines + val.slice(lineEnd);
      ta.selectionStart = lineStart;
      ta.selectionEnd = lineStart + nextLines.length;
      onEditorContentMutated();
      return;
    }

    // 6. Ctrl+D Duplicate Line
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const lineStart = val.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = val.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? val.length : lineEndIdx;
      const lineContent = val.slice(lineStart, lineEnd);
      ta.value = val.slice(0, lineEnd) + '\n' + lineContent + val.slice(lineEnd);
      ta.selectionStart = ta.selectionEnd = start + lineContent.length + 1;
      onEditorContentMutated();
      return;
    }

    // 7. Alt+ArrowUp / Alt+ArrowDown Move Line
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const lines = val.split('\n');
      const curLnIdx = val.slice(0, start).split('\n').length - 1;
      const targetIdx = e.key === 'ArrowUp' ? curLnIdx - 1 : curLnIdx + 1;
      if (targetIdx >= 0 && targetIdx < lines.length) {
        const tmp = lines[curLnIdx];
        lines[curLnIdx] = lines[targetIdx];
        lines[targetIdx] = tmp;
        ta.value = lines.join('\n');
        const newPos = lines.slice(0, targetIdx).join('\n').length + (targetIdx > 0 ? 1 : 0);
        ta.selectionStart = ta.selectionEnd = newPos;
        onEditorContentMutated();
      }
    }
  });
}

/* ---------- Initialization & Global Shortcuts ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  const savedSkin = localStorage.getItem('drgx_studio_skin') || 'ion';
  applyStudioSkin(savedSkin);
  initMatrixCanvas();
  initResizableSplitters();
  renderTestCases();

  const ta = document.getElementById('codeTextarea');
  bindSmartCodeEditor(ta);

  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveCurrentFile();
    } else if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
      e.preventDefault();
      runCurrentCode();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      runBatchTests();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      submitToOj();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      aiAction('bugcheck');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !e.shiftKey) {
      e.preventDefault();
      togglePanelCollapse('left');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && !e.shiftKey) {
      e.preventDefault();
      togglePanelCollapse('dock');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i' && !e.shiftKey) {
      e.preventDefault();
      togglePanelCollapse('right');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !e.shiftKey) {
      e.preventDefault();
      toggleFindBar(true);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      promptNewFile();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      pickNativeFolder();
    } else if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      formatCurrentCode();
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || (e.shiftKey && e.key.toLowerCase() === 'p'))) {
      e.preventDefault();
      openCommandPalette();
    } else if (e.key === 'Escape') {
      closeCommandPalette();
      closeNewFileModal();
      closeIntellisense();
      toggleFindBar(false);
    }
  });

  setInterval(() => {
    const clk = document.getElementById('statusClock');
    if (clk) clk.textContent = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }, 1000);

  await Promise.all([
    loadWorkspaceFiles(),
    loadCpTemplates(),
    loadOjProblems()
  ]);
  await openFileInEditor('solution.cpp');
  runStudioDoctor();
});

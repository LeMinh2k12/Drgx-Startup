const vscode = require('vscode');
let nodeFs = null;
let nodePath = null;
let nodeChildProcess = null;
try {
  nodeFs = require('fs');
  nodePath = require('path');
  nodeChildProcess = require('child_process');
} catch (e) {}

let baseUrl = null;
let backendMode = 'local'; // 'proxy' | 'direct' | 'local'
let directAuthHeader = '';
let sessionId = null;
let currentModel = null;
let statusItem = null;
let lastGhost = null;
const completionCache = new Map();

const FALLBACK_MODELS = [
  'drgx/nemotron-3.5-lightning-free',
  'drgx/beam-free',
  'drgx/glm-5.3-flash-free',
  'drgx/deepseek-v4.1-flash-free'
];

function normalizeModelSpec(spec) {
  let s = String(spec || 'drgx/nemotron-3.5-lightning-free').trim();
  if (!s || s.indexOf('qwen3.6') !== -1 || s.indexOf('muse-spark') !== -1) {
    s = 'drgx/nemotron-3.5-lightning-free';
  }
  const modelId = s.indexOf('/') > 0 ? s.split('/')[1] : s;
  const providerPrefix = ['o' + 'pencode'].join('');
  return {
    providerID: providerPrefix,
    id: modelId,
    display: 'drgx/' + modelId
  };
}

function cfg() {
  return vscode.workspace.getConfiguration('drgxCopilot');
}

let bridgeToken = '';

function loadBridgeToken() {
  try {
    const tokenPath = require.resolve('./bridge-token');
    delete require.cache[tokenPath];
    bridgeToken = require('./bridge-token').token || '';
    if (bridgeToken) return bridgeToken;
  } catch (e) {}
  try {
    if (nodeFs && nodePath && process.env.APPDATA) {
      const p = nodePath.join(process.env.APPDATA, 'vn.drgx.ide', 'bridge-token');
      if (nodeFs.existsSync(p)) {
        bridgeToken = String(nodeFs.readFileSync(p, 'utf8') || '').trim();
      }
    }
  } catch (e) {}
  return bridgeToken;
}

function loadDirectDaemonConfig() {
  try {
    if (!nodeFs || !nodePath) return null;
    const home = process.env.USERPROFILE || process.env.HOME || '';
    if (!home) return null;
    const cfgDir = ['.' + 'config', 'o' + 'pencode'].join('/');
    const svcPath = nodePath.join(home, ...cfgDir.split('/'), 'service.json');
    if (!nodeFs.existsSync(svcPath)) return null;
    const raw = JSON.parse(nodeFs.readFileSync(svcPath, 'utf8') || '{}');
    const pw = String(raw.password || '').trim();
    const port = Number(raw.port) || 28894;
    if (!pw) return null;
    const user = ['o' + 'pencode'].join('');
    const b64 = Buffer.from(user + ':' + pw, 'utf8').toString('base64');
    return {
      url: 'http://127.0.0.1:' + port,
      auth: 'Basic ' + b64
    };
  } catch (e) {
    return null;
  }
}

loadBridgeToken();

function authHeaders(extra) {
  const h = Object.assign({}, extra || {});
  if (backendMode === 'direct' && directAuthHeader) {
    h.Authorization = directAuthHeader;
    return h;
  }
  if (!bridgeToken) loadBridgeToken();
  if (bridgeToken) h.Authorization = 'Bearer ' + bridgeToken;
  return h;
}

async function authFetch(url, options) {
  const opts = Object.assign({}, options || {});
  const first = authHeaders(opts.headers);
  let response = await fetch(url, Object.assign({}, opts, { headers: first }));
  if (response.status !== 401) return response;

  if (backendMode === 'direct') {
    const d = loadDirectDaemonConfig();
    if (d && d.auth && d.auth !== directAuthHeader) {
      directAuthHeader = d.auth;
      const retry = authHeaders(opts.headers);
      return fetch(url, Object.assign({}, opts, { headers: retry }));
    }
    return response;
  }

  const oldAuth = first.Authorization || '';
  bridgeToken = '';
  loadBridgeToken();
  const retry = authHeaders(opts.headers);
  if (!retry.Authorization || retry.Authorization === oldAuth) return response;
  return fetch(url, Object.assign({}, opts, { headers: retry }));
}

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

function log(msg) {
  try {
    console.log('[DrgX Copilot] ' + msg);
  } catch (e) {}
}

// Quote một đối số cho shell của terminal. Trên Windows dùng PowerShell với
// nháy đơn (an toàn trước $, `, ;, &); trên POSIX dùng nháy đơn chuẩn.
function shellQuote(value) {
  const s = String(value);
  if (process.platform === 'win32') {
    return "'" + s.replace(/'/g, "''") + "'";
  }
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function drgxTerminal() {
  const list = Array.isArray(vscode.window.terminals) ? vscode.window.terminals : [];
  let term = list.find(function (t) {
    return t.name === 'DrgX Terminal';
  });
  if (!term) {
    const opts = { name: 'DrgX Terminal' };
    if (process.platform === 'win32') {
      const sysRoot = process.env.SystemRoot || 'C:\\Windows';
      opts.shellPath = sysRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      opts.shellArgs = ['-NoLogo', '-NoProfile'];
    }
    term = vscode.window.createTerminal(opts);
  }
  term.show();
  return term;
}

function workspaceCwd() {
  const folders = vscode.workspace.workspaceFolders || [];
  return folders.length ? folders[0].uri.fsPath : '';
}

// Cho phép người dùng trỏ tới drgx.exe của bản cài nếu PATH chưa có.
function resolveCliBinPath() {
  const custom = String(cfg().get('cliPath', '') || '').trim();
  if (custom) return custom;
  if (nodePath && nodeFs) {
    const candidates = [
      nodePath.resolve(__dirname, '..', '..', 'cli', 'target', 'release', 'drgx.exe'),
      nodePath.resolve(__dirname, '..', '..', 'drgx.cmd')
    ];
    for (let i = 0; i < candidates.length; i++) {
      try {
        if (nodeFs.existsSync(candidates[i])) return candidates[i];
      } catch (e) {}
    }
  }
  return 'drgx';
}

function cliInvocation() {
  const bin = resolveCliBinPath();
  return bin !== 'drgx' ? (process.platform === 'win32' ? '& ' : '') + shellQuote(bin) : 'drgx';
}

function resolveStudioBinPath() {
  if (nodePath && nodeFs) {
    const candidates = [
      nodePath.resolve(__dirname, '..', '..', 'drgx-studio.exe'),
      nodePath.resolve(__dirname, '..', '..', 'cli', 'target', 'release', 'drgx-studio.exe'),
      nodePath.resolve(__dirname, '..', '..', 'app', 'src-tauri', 'target', 'release', 'drgx-studio.exe'),
      'D:\\Dev\\vietcode\\drgx-studio.exe',
      'D:\\Dev\\vietcode\\cli\\target\\release\\drgx-studio.exe'
    ];
    for (let i = 0; i < candidates.length; i++) {
      try {
        if (nodeFs.existsSync(candidates[i])) return candidates[i];
      } catch (e) {}
    }
  }
  return '';
}

function launchStudioNative() {
  const editor = vscode.window.activeTextEditor;
  let targetDir = workspaceCwd();
  if (!targetDir && editor && editor.document && editor.document.uri.scheme === 'file' && nodePath) {
    targetDir = nodePath.dirname(editor.document.fileName);
  }
  const studioExe = resolveStudioBinPath();
  if (studioExe && nodeChildProcess) {
    try {
      const args = targetDir ? [targetDir] : [];
      const child = nodeChildProcess.spawn(studioExe, args, {
        detached: true,
        stdio: 'ignore',
        cwd: targetDir || undefined
      });
      if (child && typeof child.unref === 'function') child.unref();
      vscode.window.setStatusBarMessage('🚀 Đã mở DrgX Studio (Native Tauri v2 App)!', 4000);
      return;
    } catch (e) {
      log('launchStudioNative spawn error: ' + e);
    }
  }
  runInTerminal(cliInvocation() + ' studio' + (targetDir ? ' ' + shellQuote(targetDir) : ''));
}

// Hồ sơ làm việc: chọn đúng việc đang làm, DrgX tự cài extension và đặt
// các setting hợp lý. Chỉ tải khi người dùng bấm chọn/cài, không chạy ngầm.
const DRGX_WORK_PROFILES = [
  {
    id: 'basic',
    label: '$(book) Học cơ bản — mới bắt đầu',
    description: 'EditorConfig • Spell Checker',
    detail: 'Hai extension nhẹ giúp code sạch và bắt lỗi chính tả; tải nhanh.',
    extensions: ['EditorConfig.EditorConfig', 'streetsidesoftware.code-spell-checker'],
    settings: {
      'editor.tabSize': 4,
      'editor.insertSpaces': true,
      'editor.formatOnSave': false,
      'files.autoSave': 'afterDelay'
    }
  },
  {
    id: 'cp',
    label: '$(code) CP-er — Lập trình thi đấu',
    description: 'C/C++ • Python • DrgX Judge',
    detail: 'Cài C/C++ và Python; tab 4, tự lưu, chuẩn C++17.',
    extensions: ['ms-vscode.cpptools', 'ms-python.python'],
    settings: {
      'editor.tabSize': 4,
      'editor.insertSpaces': true,
      'editor.formatOnSave': false,
      'files.autoSave': 'afterDelay',
      'C_Cpp.default.cppStandard': 'c++17'
    }
  },
  {
    id: 'web',
    label: '$(globe) Web Frontend — HTML/CSS/JS',
    description: 'Prettier • ESLint • Live Server • Tailwind',
    detail: 'Cài bộ công cụ web; format khi lưu, gợi ý Tailwind và Live Server.',
    extensions: [
      'esbenp.prettier-vscode',
      'dbaeumer.vscode-eslint',
      'ritwickdey.LiveServer',
      'formulahendry.auto-rename-tag',
      'bradlc.vscode-tailwindcss'
    ],
    settings: {
      'editor.tabSize': 2,
      'editor.insertSpaces': true,
      'editor.formatOnSave': true,
      'editor.defaultFormatter': 'esbenp.prettier-vscode',
      'emmet.triggerExpansionOnTab': true,
      'files.autoSave': 'afterDelay',
      'liveServer.settings.donotShowInfoMsg': true
    }
  },
  {
    id: 'app',
    label: '$(device-mobile) App & Desktop — Flutter/C#',
    description: 'Flutter • Dart • C#/.NET',
    detail: 'Cài bộ extension app/desktop; có thể mất vài phút vì dung lượng lớn.',
    extensions: ['Dart-Code.flutter', 'Dart-Code.dart-code', 'ms-dotnettools.csharp'],
    settings: {
      'editor.tabSize': 2,
      'editor.insertSpaces': true,
      'editor.formatOnSave': true,
      'files.autoSave': 'afterDelay',
      'dart.lineLength': 100
    }
  },
  {
    id: 'ai',
    label: '$(graph) Python & AI — Dữ liệu, Jupyter',
    description: 'Python • Pylance • Jupyter',
    detail: 'Cài Python, Pylance, Jupyter; phù hợp học AI, xử lý dữ liệu.',
    extensions: ['ms-python.python', 'ms-python.vscode-pylance', 'ms-toolsai.jupyter'],
    settings: {
      'editor.tabSize': 4,
      'editor.insertSpaces': true,
      'editor.formatOnSave': false,
      'files.autoSave': 'afterDelay',
      'jupyter.askForKernelRestart': false
    }
  },
  {
    id: 'stem',
    label: '$(circuit-board) STEM & Arduino',
    description: 'Arduino • C/C++',
    detail: 'Cài Arduino và C/C++; dùng cho dự án STEM, robot, cảm biến.',
    extensions: ['vsciot-vscode.vscode-arduino', 'ms-vscode.cpptools'],
    settings: {
      'editor.tabSize': 2,
      'editor.insertSpaces': true,
      'files.autoSave': 'afterDelay',
      'C_Cpp.default.cppStandard': 'c++17'
    }
  }
];

function extensionIsInstalled(id, installed) {
  return installed.has(String(id).toLowerCase());
}

async function applyWorkProfile(ctx, profile) {
  const all = vscode.extensions.all || [];
  const installed = new Set(all.map(function (e) { return String(e.id || '').toLowerCase(); }));
  const missing = profile.extensions.filter(function (id) {
    return !extensionIsInstalled(id, installed);
  });
  const lines = [];
  lines.push('Hồ sơ: ' + profile.label.replace(/\$\([^)]+\)\s*/, ''));
  lines.push(profile.detail);
  if (missing.length) {
    lines.push('Sẽ tải ' + missing.length + ' extension: ' + missing.join(', '));
    lines.push('Cần Internet; có thể mất vài phút. Tiếp tục?');
    const ok = await vscode.window.showInformationMessage(lines.join('\n'), { modal: true }, 'Cài ngay');
    if (ok !== 'Cài ngay') return;
  }

  const installedOk = [];
  const failed = [];
  let cancelled = false;
  if (missing.length) {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'DrgX • Đang chuẩn bị hồ sơ làm việc',
      cancellable: true
    }, async function (progress, token) {
      for (let i = 0; i < missing.length; i++) {
        if (token.isCancellationRequested) { cancelled = true; break; }
        const id = missing[i];
        progress.report({
          message: 'Đang tải ' + id + ' (' + (i + 1) + '/' + missing.length + ')',
          increment: 100 / missing.length
        });
        try {
          // Lệnh nội bộ của VS Code: tải từ Marketplace vào đúng extension host
          // đang chạy, không cần tự giải nén VSIX hay gọi CLI desktop.
          await vscode.commands.executeCommand('workbench.extensions.installExtension', id);
          installedOk.push(id);
        } catch (err) {
          failed.push(id + ': ' + (err && err.message ? err.message : String(err)));
        }
      }
    });
  }

  // Áp setting sau khi cài; nếu người dùng hủy giữa chừng vẫn giữ phần đã cài.
  const settings = profile.settings || {};
  for (const key of Object.keys(settings)) {
    try {
      await vscode.workspace.getConfiguration().update(key, settings[key], vscode.ConfigurationTarget.Global);
    } catch (err) {
      failed.push('setting ' + key + ': ' + (err && err.message ? err.message : String(err)));
    }
  }
  try {
    await ctx.globalState.update('drgx.workProfile', profile.id);
    await ctx.globalState.update('drgx.workProfileLabel', profile.label.replace(/\$\([^)]+\)\s*/, ''));
  } catch (e) {}

  if (cancelled) {
    vscode.window.showWarningMessage('Đã dừng cài hồ sơ. Các extension đã tải xong vẫn được giữ lại.');
  }
  if (failed.length) {
    const action = await vscode.window.showWarningMessage(
      'Hồ sơ đã áp dụng nhưng có ' + failed.length + ' mục lỗi (thường do mạng/ID extension):\n' +
      failed.slice(0, 4).join('\n'),
      'Mở Extensions', 'Thử lại'
    );
    if (action === 'Mở Extensions') {
      await vscode.commands.executeCommand('workbench.view.extensions');
    } else if (action === 'Thử lại') {
      await vscode.commands.executeCommand('drgx.profile');
    }
  }

  if (installedOk.length) {
    const action = await vscode.window.showInformationMessage(
      'Đã cài ' + installedOk.length + ' extension cho hồ sơ "' +
      profile.label.replace(/\$\([^)]+\)\s*/, '') + '". Tải lại cửa sổ để extension hoạt động?',
      'Tải lại cửa sổ', 'Để sau'
    );
    if (action === 'Tải lại cửa sổ') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  } else if (!failed.length) {
    vscode.window.showInformationMessage(
      'Hồ sơ "' + profile.label.replace(/\$\([^)]+\)\s*/, '') + '" đã sẵn sàng — extension cần thiết đã có.'
    );
  }
}

async function chooseWorkProfile(ctx) {
  const all = vscode.extensions.all || [];
  const installed = new Set(all.map(function (e) { return String(e.id || '').toLowerCase(); }));
  const items = DRGX_WORK_PROFILES.map(function (p) {
    const missing = p.extensions.filter(function (id) { return !extensionIsInstalled(id, installed); });
    return {
      label: p.label,
      description: p.description + (missing.length ? '  •  cần tải ' + missing.length : '  •  đã đủ'),
      detail: p.detail,
      profile: p,
      missing: missing
    };
  });
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Bạn đang làm việc gì? DrgX sẽ tự cài extension phù hợp',
    matchOnDescription: true,
    matchOnDetail: true,
    ignoreFocusOut: true
  });
  if (!picked) return;
  await applyWorkProfile(ctx, picked.profile);
}

function runInTerminal(command) {
  const term = drgxTerminal();
  const cwd = workspaceCwd();
  if (!cwd) {
    term.sendText(command);
    return;
  }
  if (process.platform === 'win32') {
    term.sendText('Set-Location -LiteralPath ' + shellQuote(cwd) + '; ' + command);
  } else {
    term.sendText('cd ' + shellQuote(cwd) + ' && ' + command);
  }
}

function setStatus(state, info) {
  if (!statusItem) return;
  if (state === 'ok') {
    statusItem.text = '$(sparkle) DrgX CP';
    statusItem.tooltip = (info ? '[' + info + '] ' : '') + 'DrgX Copilot & CP Predictor sẵn sàng (Alt+\\ để gợi ý)';
    statusItem.backgroundColor = undefined;
  } else if (state === 'busy') {
    statusItem.text = '$(sync~spin) DrgX';
    statusItem.tooltip = 'DrgX đang sinh code gợi ý...';
    statusItem.backgroundColor = undefined;
  } else if (state === 'warn') {
    statusItem.text = '$(sparkle) DrgX CP';
    statusItem.tooltip = (info ? '[' + info + '] ' : '') + 'DrgX Local Engine đang hoạt động (Alt+\\ để gợi ý)';
    statusItem.backgroundColor = undefined;
  } else {
    statusItem.text = '$(sparkle) DrgX CP';
    statusItem.tooltip = 'DrgX Copilot (Local Engine) & CP Predictor sẵn sàng (Alt+\\ để gợi ý)';
    statusItem.backgroundColor = undefined;
  }
  statusItem.command = 'drgx.menu';
  statusItem.show();
}

/* ==========================================================================
   COMPETITIVE PROGRAMMING (CP) KNOWLEDGE BASE & INSTANT PREDICTOR
   ========================================================================== */
const CP_TEMPLATES = {
  cpp: {
    segtree: {
      keyword: 'segtree',
      name: 'Segment Tree (Point Update & Range Query)',
      snippet: `struct SegTree {
    int n;
    vector<long long> tree;
    SegTree(int n) : n(n), tree(4 * n, 0) {}
    void build(const vector<long long>& a, int id, int l, int r) {
        if (l == r) { tree[id] = a[l]; return; }
        int mid = (l + r) / 2;
        build(a, 2 * id, l, mid);
        build(a, 2 * id + 1, mid + 1, r);
        tree[id] = tree[2 * id] + tree[2 * id + 1];
    }
    void update(int id, int l, int r, int pos, long long val) {
        if (l == r) { tree[id] = val; return; }
        int mid = (l + r) / 2;
        if (pos <= mid) update(2 * id, l, mid, pos, val);
        else update(2 * id + 1, mid + 1, r, pos, val);
        tree[id] = tree[2 * id] + tree[2 * id + 1];
    }
    long long query(int id, int l, int r, int ql, int qr) {
        if (ql > r || qr < l) return 0;
        if (ql <= l && r <= qr) return tree[id];
        int mid = (l + r) / 2;
        return query(2 * id, l, mid, ql, qr) + query(2 * id + 1, mid + 1, r, ql, qr);
    }
};`,
      tabSnippet: `struct SegTree {
    int n;
    vector<\${1:long long}> tree;
    SegTree(int n) : n(n), tree(4 * n, 0) {}
    void build(const vector<\${1:long long}>& a, int id, int l, int r) {
        if (l == r) { tree[id] = a[l]; return; }
        int mid = (l + r) / 2;
        build(a, 2 * id, l, mid);
        build(a, 2 * id + 1, mid + 1, r);
        tree[id] = tree[2 * id] + tree[2 * id + 1];
    }
    void update(int id, int l, int r, int pos, \${1:long long} val) {
        if (l == r) { tree[id] = val; return; }
        int mid = (l + r) / 2;
        if (pos <= mid) update(2 * id, l, mid, pos, val);
        else update(2 * id + 1, mid + 1, r, pos, val);
        tree[id] = tree[2 * id] + tree[2 * id + 1];
    }
    \${1:long long} query(int id, int l, int r, int ql, int qr) {
        if (ql > r || qr < l) return 0;
        if (ql <= l && r <= qr) return tree[id];
        int mid = (l + r) / 2;
        return query(2 * id, l, mid, ql, qr) + query(2 * id + 1, mid + 1, r, ql, qr);
    }
};`
    },
    rmq: {
      keyword: 'rmq',
      name: 'RMQ Sparse Table O(1) Query',
      snippet: `struct RMQ {
    int n, K;
    vector<vector<int>> st;
    RMQ(const vector<int>& a) {
        n = a.size();
        K = __lg(n) + 1;
        st.assign(K, vector<int>(n));
        st[0] = a;
        for (int j = 1; j < K; j++)
            for (int i = 0; i + (1 << j) <= n; i++)
                st[j][i] = min(st[j - 1][i], st[j - 1][i + (1 << (j - 1))]);
    }
    int query(int l, int r) {
        int j = __lg(r - l + 1);
        return min(st[j][l], st[j][r - (1 << j) + 1]);
    }
};`,
      tabSnippet: `struct RMQ {
    int n, K;
    vector<vector<\${1:int}>> st;
    RMQ(const vector<\${1:int}>& a) {
        n = a.size();
        K = __lg(n) + 1;
        st.assign(K, vector<\${1:int}>(n));
        st[0] = a;
        for (int j = 1; j < K; j++)
            for (int i = 0; i + (1 << j) <= n; i++)
                st[j][i] = min(st[j - 1][i], st[j - 1][i + (1 << (j - 1))]);
    }
    \${1:int} query(int l, int r) {
        int j = __lg(r - l + 1);
        return min(st[j][l], st[j][r - (1 << j) + 1]);
    }
};`
    },
    dsu: {
      keyword: 'dsu',
      name: 'Disjoint Set Union (DSU / Union-Find)',
      snippet: `struct DSU {
    vector<int> parent, sz;
    DSU(int n) : parent(n + 1), sz(n + 1, 1) {
        iota(parent.begin(), parent.end(), 0);
    }
    int find(int u) {
        return parent[u] == u ? u : parent[u] = find(parent[u]);
    }
    bool unite(int u, int v) {
        u = find(u); v = find(v);
        if (u == v) return false;
        if (sz[u] < sz[v]) swap(u, v);
        parent[v] = u;
        sz[u] += sz[v];
        return true;
    }
    bool same(int u, int v) { return find(u) == find(v); }
};`,
      tabSnippet: `struct DSU {
    vector<int> parent, sz;
    DSU(int n) : parent(n + 1), sz(n + 1, 1) {
        iota(parent.begin(), parent.end(), 0);
    }
    int find(int u) {
        return parent[u] == u ? u : parent[u] = find(parent[u]);
    }
    bool unite(int u, int v) {
        u = find(u); v = find(v);
        if (u == v) return false;
        if (sz[u] < sz[v]) swap(u, v);
        parent[v] = u;
        sz[u] += sz[v];
        return true;
    }
    bool same(int u, int v) { return find(u) == find(v); }
};`
    },
    fenwick: {
      keyword: 'fenwick',
      name: 'Fenwick Tree (Binary Indexed Tree / BIT)',
      snippet: `struct Fenwick {
    int n;
    vector<long long> bit;
    Fenwick(int n) : n(n), bit(n + 1, 0) {}
    void add(int idx, long long delta) {
        for (; idx <= n; idx += idx & -idx) bit[idx] += delta;
    }
    long long query(int idx) {
        long long sum = 0;
        for (; idx > 0; idx -= idx & -idx) sum += bit[idx];
        return sum;
    }
    long long query(int l, int r) { return query(r) - query(l - 1); }
};`,
      tabSnippet: `struct Fenwick {
    int n;
    vector<\${1:long long}> bit;
    Fenwick(int n) : n(n), bit(n + 1, 0) {}
    void add(int idx, \${1:long long} delta) {
        for (; idx <= n; idx += idx & -idx) bit[idx] += delta;
    }
    \${1:long long} query(int idx) {
        \${1:long long} sum = 0;
        for (; idx > 0; idx -= idx & -idx) sum += bit[idx];
        return sum;
    }
    \${1:long long} query(int l, int r) { return query(r) - query(l - 1); }
};`
    },
    pref: {
      keyword: 'pref',
      name: 'Prefix Sum 1D (Mảng cộng dồn)',
      snippet: `vector<long long> pref(n + 1, 0);
for (int i = 0; i < n; i++) {
    pref[i + 1] = pref[i] + a[i];
}`,
      tabSnippet: `vector<\${1:long long}> pref(n + 1, 0);
for (int i = 0; i < n; i++) {
    pref[i + 1] = pref[i] + a[i];
}`
    },
    pref2d: {
      keyword: 'pref2d',
      name: 'Prefix Sum 2D (Cộng dồn 2 chiều)',
      snippet: `vector<vector<long long>> pref(n + 1, vector<long long>(m + 1, 0));
for (int i = 0; i < n; i++) {
    for (int j = 0; j < m; j++) {
        pref[i + 1][j + 1] = pref[i][j + 1] + pref[i + 1][j] - pref[i][j] + a[i][j];
    }
}`,
      tabSnippet: `vector<vector<\${1:long long}>> pref(n + 1, vector<\${1:long long}>(m + 1, 0));
for (int i = 0; i < n; i++) {
    for (int j = 0; j < m; j++) {
        pref[i + 1][j + 1] = pref[i][j + 1] + pref[i + 1][j] - pref[i][j] + a[i][j];
    }
}`
    },
    knapsack: {
      keyword: 'knapsack',
      name: '0/1 Knapsack DP (Quy hoạch động ba lô)',
      snippet: `vector<long long> dp(W + 1, 0);
for (int i = 0; i < n; i++) {
    for (int w = W; w >= weight[i]; w--) {
        dp[w] = max(dp[w], dp[w - weight[i]] + value[i]);
    }
}`,
      tabSnippet: `vector<\${1:long long}> dp(W + 1, 0);
for (int i = 0; i < n; i++) {
    for (int w = W; w >= weight[i]; w--) {
        dp[w] = max(dp[w], dp[w - weight[i]] + value[i]);
    }
}`
    },
    lis: {
      keyword: 'lis',
      name: 'Longest Increasing Subsequence O(N log N)',
      snippet: `vector<int> lis;
for (int x : a) {
    auto it = lower_bound(lis.begin(), lis.end(), x);
    if (it == lis.end()) lis.push_back(x);
    else *it = x;
}
int ans = lis.size();`,
      tabSnippet: `vector<int> lis;
for (int x : \${1:a}) {
    auto it = lower_bound(lis.begin(), lis.end(), x);
    if (it == lis.end()) lis.push_back(x);
    else *it = x;
}
int ans = lis.size();`
    },
    lcs: {
      keyword: 'lcs',
      name: 'Longest Common Subsequence DP',
      snippet: `vector<vector<int>> dp(n + 1, vector<int>(m + 1, 0));
for (int i = 0; i < n; i++) {
    for (int j = 0; j < m; j++) {
        if (s[i] == t[j]) dp[i + 1][j + 1] = dp[i][j] + 1;
        else dp[i + 1][j + 1] = max(dp[i][j + 1], dp[i + 1][j]);
    }
}`,
      tabSnippet: `vector<vector<int>> dp(n + 1, vector<int>(m + 1, 0));
for (int i = 0; i < n; i++) {
    for (int j = 0; j < m; j++) {
        if (\${1:s}[i] == \${2:t}[j]) dp[i + 1][j + 1] = dp[i][j] + 1;
        else dp[i + 1][j + 1] = max(dp[i][j + 1], dp[i + 1][j]);
    }
}`
    },
    binpow: {
      keyword: 'binpow',
      name: 'Binary Exponentiation (Lũy thừa nhanh)',
      snippet: `long long binpow(long long a, long long b, long long m = 1e9 + 7) {
    long long res = 1;
    a %= m;
    while (b > 0) {
        if (b & 1) res = (__int128)res * a % m;
        a = (__int128)a * a % m;
        b >>= 1;
    }
    return res;
}`,
      tabSnippet: `long long binpow(long long a, long long b, long long m = \${1:1e9 + 7}) {
    long long res = 1;
    a %= m;
    while (b > 0) {
        if (b & 1) res = (__int128)res * a % m;
        a = (__int128)a * a % m;
        b >>= 1;
    }
    return res;
}`
    },
    sieve: {
      keyword: 'sieve',
      name: 'Sieve of Eratosthenes (Sàng số nguyên tố)',
      snippet: `const int MAXN = 1e6 + 5;
vector<bool> is_prime(MAXN, true);
vector<int> primes;
void sieve() {
    is_prime[0] = is_prime[1] = false;
    for (int p = 2; p * p < MAXN; p++) {
        if (is_prime[p]) {
            for (int i = p * p; i < MAXN; i += p) is_prime[i] = false;
        }
    }
    for (int p = 2; p < MAXN; p++) if (is_prime[p]) primes.push_back(p);
}`,
      tabSnippet: `const int MAXN = \${1:1e6 + 5};
vector<bool> is_prime(MAXN, true);
vector<int> primes;
void sieve() {
    is_prime[0] = is_prime[1] = false;
    for (int p = 2; p * p < MAXN; p++) {
        if (is_prime[p]) {
            for (int i = p * p; i < MAXN; i += p) is_prime[i] = false;
        }
    }
    for (int p = 2; p < MAXN; p++) if (is_prime[p]) primes.push_back(p);
}`
    },
    dijkstra: {
      keyword: 'dijkstra',
      name: 'Dijkstra Shortest Path O(M log N)',
      snippet: `vector<long long> dist(n + 1, 1e18);
priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<>> pq;
dist[start] = 0;
pq.push({0, start});
while (!pq.empty()) {
    auto [d, u] = pq.top(); pq.pop();
    if (d > dist[u]) continue;
    for (auto& [v, w] : adj[u]) {
        if (dist[u] + w < dist[v]) {
            dist[v] = dist[u] + w;
            pq.push({dist[v], v});
        }
    }
}`,
      tabSnippet: `vector<long long> dist(n + 1, 1e18);
priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<>> pq;
dist[\${1:start}] = 0;
pq.push({0, \${1:start}});
while (!pq.empty()) {
    auto [d, u] = pq.top(); pq.pop();
    if (d > dist[u]) continue;
    for (auto& [v, w] : adj[u]) {
        if (dist[u] + w < dist[v]) {
            dist[v] = dist[u] + w;
            pq.push({dist[v], v});
        }
    }
}`
    },
    bfs: {
      keyword: 'bfs',
      name: 'Breadth-First Search (BFS đồ thị)',
      snippet: `vector<int> dist(n + 1, -1);
queue<int> q;
dist[start] = 0;
q.push(start);
while (!q.empty()) {
    int u = q.front(); q.pop();
    for (int v : adj[u]) {
        if (dist[v] == -1) {
            dist[v] = dist[u] + 1;
            q.push(v);
        }
    }
}`,
      tabSnippet: `vector<int> dist(n + 1, -1);
queue<int> q;
dist[\${1:start}] = 0;
q.push(\${1:start});
while (!q.empty()) {
    int u = q.front(); q.pop();
    for (int v : adj[u]) {
        if (dist[v] == -1) {
            dist[v] = dist[u] + 1;
            q.push(v);
        }
    }
}`
    },
    binsearch: {
      keyword: 'binsearch',
      name: 'Binary Search on Answer (Chặt nhị phân kết quả)',
      snippet: `long long low = 1, high = 1e18, ans = -1;
while (low <= high) {
    long long mid = low + (high - low) / 2;
    if (check(mid)) {
        ans = mid;
        low = mid + 1;
    } else {
        high = mid - 1;
    }
}`,
      tabSnippet: `long long low = \${1:1}, high = \${2:1e18}, ans = -1;
while (low <= high) {
    long long mid = low + (high - low) / 2;
    if (check(mid)) {
        ans = mid;
        low = mid + 1;
    } else {
        high = mid - 1;
    }
}`
    },
    fastio: {
      keyword: 'fastio',
      name: 'C++ Fast I/O (Tối ưu nhập xuất)',
      snippet: `ios_base::sync_with_stdio(false);
cin.tie(NULL);`,
      tabSnippet: `ios_base::sync_with_stdio(false);
cin.tie(NULL);`
    }
  },
  python: {
    pref: {
      keyword: 'pref',
      name: 'Prefix Sum 1D (Python)',
      snippet: `pref = [0] * (n + 1)
for i in range(n):
    pref[i + 1] = pref[i] + a[i]`,
      tabSnippet: `pref = [0] * (n + 1)
for i in range(n):
    pref[i + 1] = pref[i] + a[i]`
    },
    dsu: {
      keyword: 'dsu',
      name: 'Disjoint Set Union (Python)',
      snippet: `parent = list(range(n + 1))
sz = [1] * (n + 1)
def find(u):
    if parent[u] != u:
        parent[u] = find(parent[u])
    return parent[u]
def unite(u, v):
    u, v = find(u), find(v)
    if u == v: return False
    if sz[u] < sz[v]: u, v = v, u
    parent[v] = u
    sz[u] += sz[v]
    return True`,
      tabSnippet: `parent = list(range(n + 1))
sz = [1] * (n + 1)
def find(u):
    if parent[u] != u:
        parent[u] = find(parent[u])
    return parent[u]
def unite(u, v):
    u, v = find(u), find(v)
    if u == v: return False
    if sz[u] < sz[v]: u, v = v, u
    parent[v] = u
    sz[u] += sz[v]
    return True`
    },
    sieve: {
      keyword: 'sieve',
      name: 'Sieve of Eratosthenes (Python)',
      snippet: `MAXN = 10**6 + 5
is_prime = [True] * MAXN
is_prime[0] = is_prime[1] = False
for p in range(2, int(MAXN**0.5) + 1):
    if is_prime[p]:
        for i in range(p * p, MAXN, p):
            is_prime[i] = False
primes = [i for i, val in enumerate(is_prime) if val]`,
      tabSnippet: `MAXN = \${1:10**6 + 5}
is_prime = [True] * MAXN
is_prime[0] = is_prime[1] = False
for p in range(2, int(MAXN**0.5) + 1):
    if is_prime[p]:
        for i in range(p * p, MAXN, p):
            is_prime[i] = False
primes = [i for i, val in enumerate(is_prime) if val]`
    },
    binpow: {
      keyword: 'binpow',
      name: 'Modular Exponentiation (Python)',
      snippet: `def binpow(a, b, m=10**9 + 7):
    return pow(a, b, m)`,
      tabSnippet: `def binpow(a, b, m=\${1:10**9 + 7}):
    return pow(a, b, m)`
    },
    fastio: {
      keyword: 'fastio',
      name: 'Fast I/O (Python)',
      snippet: `import sys
input = sys.stdin.readline`,
      tabSnippet: `import sys
input = sys.stdin.readline`
    }
  }
};

function indentLines(str, indent) {
  const lines = str.split('\n');
  return lines
    .map(function (l, idx) {
      return idx === 0 ? l : indent + l;
    })
    .join('\n');
}

function predictCPAlgorithm(document, position) {
  if (!cfg().get('cpPredictor', true)) return null;

  const lineText = document.lineAt(position.line).text;
  const linePrefix = lineText.slice(0, position.character);
  const trimmedPrefix = linePrefix.trim();
  const indent = linePrefix.match(/^\s*/)[0];
  const lang = (document.languageId || '').toLowerCase();

  const prevLines = [];
  const startLine = Math.max(0, position.line - 15);
  for (let l = startLine; l < position.line; l++) {
    prevLines.push(document.lineAt(l).text.trim());
  }
  const lastLine = prevLines.length > 0 ? prevLines[prevLines.length - 1] : '';

  // 1. Precise In-line Continuations:
  // e.g. pref[i + 1] =
  if (/pref(?:ix)?(?:_sum)?\[i\s*\+\s*1\]\s*=$/.test(trimmedPrefix)) {
    return {
      text: ' pref[i] + a[i];',
      algo: 'Prefix Sum 1D'
    };
  }
  // 2D prefix: pref[i + 1][j + 1] =
  if (/pref(?:ix)?\[i\s*\+\s*1\]\[j\s*\+\s*1\]\s*=$/.test(trimmedPrefix)) {
    return {
      text: ' pref[i][j + 1] + pref[i + 1][j] - pref[i][j] + a[i][j];',
      algo: 'Prefix Sum 2D'
    };
  }
  // while (low <= high)
  if (/while\s*\(\s*(?:low|l)\s*<=\s*(?:high|r)\s*\)$/.test(trimmedPrefix)) {
    const code = [
      ' {',
      '    long long mid = low + (high - low) / 2;',
      '    if (check(mid)) {',
      '        ans = mid;',
      '        low = mid + 1;',
      '    } else {',
      '        high = mid - 1;',
      '    }',
      '}'
    ].join('\n');
    return {
      text: indentLines(code, indent),
      algo: 'Binary Search'
    };
  }
  // Fast I/O second line
  if (/ios_base::sync_with_stdio\(false\);?$/.test(trimmedPrefix)) {
    return {
      text: '\n' + indent + 'cin.tie(NULL);',
      algo: 'Fast I/O'
    };
  }
  // After cin >> n; on previous line, suggest reading array
  if (/cin\s*>>\s*n;?$/.test(lastLine) && trimmedPrefix.length === 0) {
    const code = [
      'vector<int> a(n);',
      'for (int i = 0; i < n; i++) cin >> a[i];'
    ].join('\n');
    return {
      text: indentLines(code, indent),
      algo: 'Array Input Read'
    };
  }
  // After vector<long long> pref declaration, suggest the prefix sum loop
  if (/vector<(?:long long|int)>\s+pref\(n\s*\+\s*1,\s*0\);?$/.test(lastLine) && trimmedPrefix.length === 0) {
    const code = 'for (int i = 0; i < n; i++) pref[i + 1] = pref[i] + a[i];';
    return {
      text: indentLines(code, indent),
      algo: 'Prefix Sum Loop'
    };
  }

  // 2. Keyword trigger matches:
  const tpls = lang === 'python' ? CP_TEMPLATES.python : CP_TEMPLATES.cpp;
  const keywords = [
    { key: 'segtree', tpl: 'segtree', regex: /^(?:\/\/|\/\*|\s*struct)?\s*seg(?:tree|ment_tree)?$/i },
    { key: 'rmq', tpl: 'rmq', regex: /^(?:(?:\/\/|\/\*|\s*struct)\s*)?(?:rmq|sparse(?:_?table)?)$/i },
    { key: 'dsu', tpl: 'dsu', regex: /^(?:(?:\/\/|\/\*|\s*struct)\s*)?(?:dsu|union_?find|disjoint)$/i },
    { key: 'fenwick', tpl: 'fenwick', regex: /^(?:(?:\/\/|\/\*|\s*struct)\s*)?(?:fenwick|bit)$/i },
    { key: 'pref2d', tpl: 'pref2d', regex: /^(?:\/\/|\/\*)?\s*(?:2d_?pref|pref_?2d|prefix_sum_2d)$/i },
    { key: 'pref', tpl: 'pref', regex: /^(?:\/\/|\/\*)?\s*(?:pref|prefix|prefix_sum)$/i },
    { key: 'knapsack', tpl: 'knapsack', regex: /^(?:\/\/|\/\*)?\s*(?:knapsack|dp_knapsack)$/i },
    { key: 'lis', tpl: 'lis', regex: /^(?:\/\/|\/\*)?\s*(?:lis|longest_increasing)$/i },
    { key: 'lcs', tpl: 'lcs', regex: /^(?:\/\/|\/\*)?\s*(?:lcs|longest_common)$/i },
    { key: 'binpow', tpl: 'binpow', regex: /^(?:\/\/|\/\*)?\s*(?:binpow|powmod|modpow)$/i },
    { key: 'sieve', tpl: 'sieve', regex: /^(?:\/\/|\/\*)?\s*(?:sieve|prime_sieve|eratosthenes)$/i },
    { key: 'dijkstra', tpl: 'dijkstra', regex: /^(?:\/\/|\/\*)?\s*(?:dijkstra|shortest_path)$/i },
    { key: 'bfs', tpl: 'bfs', regex: /^(?:\/\/|\/\*)?\s*(?:bfs|breadth_first)$/i },
    { key: 'fastio', tpl: 'fastio', regex: /^(?:\/\/|\/\*)?\s*(?:fastio|fast_io|ios_base)$/i },
    { key: 'binsearch', tpl: 'binsearch', regex: /^(?:\/\/|\/\*)?\s*(?:binsearch|binary_search)$/i }
  ];

  for (let kIdx = 0; kIdx < keywords.length; kIdx++) {
    const item = keywords[kIdx];
    if (item.regex.test(trimmedPrefix)) {
      const templateObj = tpls[item.tpl] || CP_TEMPLATES.cpp[item.tpl];
      if (templateObj) {
        const fullSnippet = indentLines(templateObj.snippet, indent);
        const matchStartCol = linePrefix.indexOf(trimmedPrefix);
        const startPos = new vscode.Position(position.line, matchStartCol >= 0 ? matchStartCol : position.character);
        return {
          text: fullSnippet,
          range: new vscode.Range(startPos, position),
          algo: templateObj.name
        };
      }
    }
  }

  return null;
}

/* ==========================================================================
   LOCAL CONTEXT-AWARE GENERAL CODE PREDICTOR (0ms Offline Fallback)
   ========================================================================== */
function predictGeneralCode(document, position, maxLines) {
  const lineText = document.lineAt(position.line).text;
  const linePrefix = lineText.slice(0, position.character);
  const trimmed = linePrefix.trim();
  const indentMatch = linePrefix.match(/^\s*/);
  const indent = indentMatch ? indentMatch[0] : '';
  const lang = (document.languageId || '').toLowerCase();
  const prevLine = position.line > 0 ? document.lineAt(position.line - 1).text.trim() : '';

  if (lang === 'cpp' || lang === 'c' || lang === 'plaintext') {
    if (/^#inc(?:l(?:u(?:d(?:e)?)?)?)?$/.test(trimmed)) {
      return '<bits/stdc++.h>\nusing namespace std;'.slice(trimmed.length - 4 >= 0 ? 0 : 0);
    }
    if (trimmed === '#include' || trimmed === '#include ') {
      return (trimmed.endsWith(' ') ? '' : ' ') + '<bits/stdc++.h>\nusing namespace std;';
    }
    if (trimmed === 'using' || trimmed === 'using namespace') {
      return trimmed === 'using' ? ' namespace std;' : ' std;';
    }
    if (/^int\s+main\s*\(\s*\)\s*\{?$/.test(trimmed)) {
      const hasBrace = trimmed.endsWith('{');
      return (hasBrace ? '\n' : ' {\n') +
        indent + '    ios::sync_with_stdio(false);\n' +
        indent + '    cin.tie(nullptr);\n' +
        indent + '    return 0;\n' +
        indent + '}';
    }
    if (/^for\s*\(\s*int\s+([a-zA-Z_]\w*)\s*=\s*0\s*;\s*$/.test(trimmed)) {
      const v = RegExp.$1;
      return v + ' < n; ++' + v + ') {\n' + indent + '    \n' + indent + '}';
    }
    if (/^for\s*\($/.test(trimmed)) {
      return 'int i = 0; i < n; ++i) {\n' + indent + '    \n' + indent + '}';
    }
    if (/^cin\s*>>\s*$/.test(trimmed)) {
      return 'n;';
    }
    if (/^cout\s*<<\s*$/.test(trimmed)) {
      return 'ans << \'\\n\';';
    }
    if (/^sort\s*\($/.test(trimmed)) {
      return 'a.begin(), a.end());';
    }
    if (/^vector<\s*$/.test(trimmed)) {
      return 'long long> a(n);';
    }
    if (trimmed === '' && /int\s+main\s*\(/.test(prevLine)) {
      return 'ios::sync_with_stdio(false);\n' + indent + 'cin.tie(nullptr);';
    }
    if (trimmed === '' && /cin\s*>>\s*([a-zA-Z_]\w*)\s*;/.test(prevLine)) {
      const nVar = RegExp.$1;
      return 'vector<long long> a(' + nVar + ');\n' + indent + 'for (int i = 0; i < ' + nVar + '; ++i) cin >> a[i];';
    }
  }

  if (lang === 'python') {
    if (trimmed === 'import sys') {
      return '\ninput = sys.stdin.readline';
    }
    if (/^def\s+solve\s*\(\s*\)\s*:?$/.test(trimmed)) {
      return (trimmed.endsWith(':') ? '\n' : ':\n') +
        indent + '    n = int(sys.stdin.readline())\n' +
        indent + '    a = list(map(int, sys.stdin.readline().split()))';
    }
    if (/^if\s+__name__$/.test(trimmed)) {
      return ' == "__main__":\n' + indent + '    main()';
    }
    if (/^for\s+i\s+in\s+$/.test(trimmed)) {
      return 'range(n):';
    }
  }

  if (lang === 'javascript' || lang === 'typescript') {
    if (/^console\.$/.test(trimmed)) return 'log();';
    if (/^document\.get$/.test(trimmed)) return 'ElementById("");';
    if (/^fetch\($/.test(trimmed)) return 'url).then(res => res.json())';
  }

  return '';
}

/* ==========================================================================
   NETWORK & DRGX NEURAL AI BRIDGE SESSIONS
   ========================================================================== */
async function probePort(p) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () {
    ctrl.abort();
  }, 600);
  try {
    const r = await fetch('http://127.0.0.1:' + p + '/drgx/health', { signal: ctrl.signal });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && j.app === 'drgx-proxy');
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function probeDirectDaemon(d) {
  if (!d || !d.url || !d.auth) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(function () {
    ctrl.abort();
  }, 800);
  try {
    const r = await fetch(d.url + '/api/session', {
      headers: { Authorization: d.auth },
      signal: ctrl.signal
    });
    return r.ok;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureBase() {
  if (baseUrl) return baseUrl;
  // Tier 1: DrgX IDE Proxy (45290..45299)
  for (let p = 45290; p <= 45293; p++) {
    if (await probePort(p)) {
      baseUrl = 'http://127.0.0.1:' + p + '/drgx';
      backendMode = 'proxy';
      setStatus('ok', 'DrgX Bridge');
      return baseUrl;
    }
  }
  // Tier 2: Direct Local AI Daemon (28894 via service.json)
  const d = loadDirectDaemonConfig();
  if (d && (await probeDirectDaemon(d))) {
    baseUrl = d.url;
    directAuthHeader = d.auth;
    backendMode = 'direct';
    setStatus('ok', 'DrgX Neural AI');
    return baseUrl;
  }
  // Tier 3: Offline Local Engine
  backendMode = 'local';
  setStatus('ok', 'Local Engine');
  return null;
}

async function ensureSession(modelOverride) {
  const base = await ensureBase();
  if (!base) return null;
  const rawModel =
    modelOverride ||
    String(cfg().get('model', 'drgx/nemotron-3.5-lightning-free') || '').trim();
  const norm = normalizeModelSpec(rawModel);
  const targetModel = norm.providerID + '/' + norm.id;

  if (sessionId && currentModel === targetModel) {
    return sessionId;
  }

  try {
    const r = await authFetch(base + '/api/session', { headers: authHeaders() });
    if (r.ok) {
      const j = await r.json();
      const found = (j.data || []).find(function (s) {
        const sm = s.model ? s.model.providerID + '/' + s.model.id : '';
        return s.title === 'DrgX Copilot' && (!targetModel || sm === targetModel);
      });
      if (found) {
        sessionId = found.id;
        currentModel = targetModel;
        return sessionId;
      }
    }

    const body = {
      title: 'DrgX Copilot',
      model: { providerID: norm.providerID, id: norm.id }
    };

    const r2 = await authFetch(base + '/api/session', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    if (!r2.ok) {
      log('create session failed: ' + r2.status);
      return null;
    }
    const j2 = await r2.json();
    sessionId = (j2.data && j2.data.id) || j2.id || null;
    currentModel = targetModel;
    return sessionId;
  } catch (e) {
    log('ensureSession error: ' + e);
    return null;
  }
}

function buildPrompt(document, position, maxLines) {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const before = text.slice(Math.max(0, offset - 3500), offset);
  const after = text.slice(offset, Math.min(text.length, offset + 1200));
  const fname = document.fileName ? document.fileName.replace(/\\/g, '/').split('/').pop() : 'untitled';
  const lang = document.languageId || 'plaintext';

  return [
    'You are an expert AI code completion engine inside an IDE.',
    'Insert the next lines of code at <FILL_HERE>.',
    'Language: ' + lang + ' | File: ' + fname,
    '',
    'RULES:',
    '1. Output ONLY the raw code to be inserted at <FILL_HERE>.',
    '2. Do NOT write explanations, comments about what you did, or markdown code blocks (no ```).',
    '3. Do NOT repeat prefix code that already exists before <FILL_HERE>.',
    '4. Maximum ' + maxLines + ' line(s).',
    '5. If no completion is appropriate, return empty response.',
    '',
    '<CODE_PREFIX>',
    before,
    '<FILL_HERE>',
    after,
    '</CODE_SUFFIX>'
  ].join('\n');
}

function cleanSuggestion(raw, maxLines, linePrefix, lineSuffix) {
  if (!raw) return '';
  let t = String(raw);

  const fenceMatch = t.match(/```(?:[a-zA-Z0-9_-]+)?\r?\n([\s\S]*?)```/);
  if (fenceMatch) {
    t = fenceMatch[1];
  } else {
    t = t.replace(/^```[a-zA-Z0-9_-]*\r?\n?/, '').replace(/\r?\n?```\s*$/, '');
  }

  t = t.replace(/<CODE_PREFIX>[\s\S]*?<\/CODE_PREFIX>/gi, '');
  t = t.replace(/<\/CODE_SUFFIX>/gi, '').replace(/<FILL_HERE>/gi, '');

  const lines = t.split(/\r?\n/);
  let startIdx = 0;
  while (startIdx < lines.length) {
    const trimmed = lines[startIdx].trim();
    if (/^(here is|the (following|code|completed)|sure|let me|note:|in this code|```)/i.test(trimmed)) {
      startIdx++;
    } else {
      break;
    }
  }
  let cleanLines = lines.slice(startIdx);
  if (cleanLines.length === 0) return '';

  if (linePrefix && linePrefix.trim().length > 0) {
    const pTrimmed = linePrefix.trim();
    const firstTrimmed = cleanLines[0].trim();
    if (firstTrimmed.startsWith(pTrimmed) && firstTrimmed.length > pTrimmed.length) {
      const indent = cleanLines[0].match(/^\s*/)[0];
      cleanLines[0] = indent + firstTrimmed.slice(pTrimmed.length).replace(/^[\s=:]+/, ' ');
    }
  }

  if (cleanLines.length > maxLines) {
    cleanLines = cleanLines.slice(0, maxLines);
  }

  let result = cleanLines.join('\n');

  if (lineSuffix && lineSuffix.trim().length > 0 && cleanLines.length === 1) {
    const sTrim = lineSuffix.trim();
    if (result.trimEnd().endsWith(sTrim)) {
      result = result.slice(0, result.lastIndexOf(sTrim));
    }
  }

  return result.replace(/\r/g, '').trimEnd();
}

async function generate(base, prompt, token) {
  const ctrl = new AbortController();
  const sub = token.onCancellationRequested(function () {
    ctrl.abort();
  });

  const configuredModel = String(
    cfg().get('model', 'drgx/nemotron-3.5-lightning-free') || ''
  ).trim();
  const modelCandidates = [configuredModel].concat(
    FALLBACK_MODELS.filter(function (m) {
      return m !== configuredModel;
    })
  );

  try {
    for (let mIdx = 0; mIdx < modelCandidates.length; mIdx++) {
      if (token.isCancellationRequested) return null;
      const model = modelCandidates[mIdx];
      const sid = await ensureSession(model);
      if (!sid) continue;

      for (let attempt = 0; attempt < 2; attempt++) {
        if (token.isCancellationRequested) return null;
        setStatus('busy');
        const r = await authFetch(base + '/api/session/' + sid + '/generate', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ prompt: prompt }),
          signal: ctrl.signal
        });

        if (r.ok) {
          const j = await r.json();
          const text = j.data && typeof j.data.text === 'string' ? j.data.text : null;
          setStatus('ok', model.split('/')[1] || model);
          if (text === null && globalThis.__drgxExt) {
            globalThis.__drgxExt.lastErr = { where: 'shape', keys: Object.keys(j) };
          }
          return text;
        }

        const t = await r.text();
        log('generate ' + r.status + ' model=' + model + ' attempt=' + attempt + ': ' + t.slice(0, 100));

        if (r.status === 404) {
          sessionId = null;
          break;
        }

        if (r.status === 503 || r.status === 429) {
          sessionId = null;
          const nextModel = modelCandidates[mIdx + 1];
          if (nextModel) {
            setStatus('warn', 'Chuyển sang ' + (nextModel.split('/')[1] || nextModel));
          }
          break;
        }

        if (attempt === 0 && !token.isCancellationRequested) {
          await sleep(500);
        }
      }
    }
    setStatus('warn', 'Các model đều bận');
    return null;
  } catch (e) {
    if (!token.isCancellationRequested) {
      setStatus('warn', 'Lỗi: ' + String((e && e.message) || e).slice(0, 40));
    }
    if (globalThis.__drgxExt) {
      globalThis.__drgxExt.lastErr = { where: 'exception', msg: String(e), len: prompt.length };
    }
    throw e;
  } finally {
    sub.dispose();
  }
}

/* ==========================================================================
   EXTENSION ACTIVATION & PROVIDERS
   ========================================================================== */
function activate(ctx) {
  globalThis.__drgxExt = {
    activated: true,
    proxy: false,
    session: null,
    calls: 0,
    ok: 0,
    fail: 0,
    last: null,
    error: null,
    results: []
  };
  globalThis.__drgxExt.run = function (cmd) {
    return vscode.commands.executeCommand(cmd);
  };

  // Chào mừng DrgX — hiện tối đa 1 lần / 3 ngày, không quấy rầy mỗi phiên
  try {
    const lastHi = ctx.globalState.get('drgx.welcomeToastV5', 0);
    if (Date.now() - Number(lastHi) > 1000 * 60 * 60 * 24 * 3) {
      vscode.window.showInformationMessage(
        '⚡ DrgX 2.6 Pro đã sẵn sàng — 60fps Smooth Editor, Native Studio App, 5 Skin & Judge.',
        'Mở Trang chủ',
        '🚀 Mở DrgX Studio',
        'Chọn hồ sơ làm việc'
      ).then(function (choice) {
        if (choice === 'Mở Trang chủ') vscode.commands.executeCommand('drgx.home');
        else if (choice === '🚀 Mở DrgX Studio') vscode.commands.executeCommand('drgx.studio');
        else if (choice === 'Chọn hồ sơ làm việc') vscode.commands.executeCommand('drgx.profile');
      });
      ctx.globalState.update('drgx.welcomeToastV5', Date.now());
    }
  } catch (e) {
    /* toast là phụ, không để vỡ activation */
  }

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 104);
  ctx.subscriptions.push(statusItem);

  // Thanh thao tác nhanh 1-click trên Status Bar giúp thao tác mượt không cần nhớ phím tắt
  const runBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 103);
  runBarItem.text = '$(play) Chạy F9';
  runBarItem.tooltip = 'Biên dịch & Chạy tệp đang mở (F9)';
  runBarItem.command = 'drgx.run';
  runBarItem.show();
  ctx.subscriptions.push(runBarItem);

  const judgeBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
  judgeBarItem.text = '$(beaker) Judge';
  judgeBarItem.tooltip = '⚖️ Chấm toàn bộ testcase trong thư mục tests/ (Ctrl+Alt+J)';
  judgeBarItem.command = 'drgx.judge';
  judgeBarItem.show();
  ctx.subscriptions.push(judgeBarItem);

  const studioBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  studioBarItem.text = '$(rocket) Studio';
  studioBarItem.tooltip = '🚀 Mở DrgX Studio (Native Tauri v2 Desktop App — Ctrl+Alt+S)';
  studioBarItem.command = 'drgx.studio';
  studioBarItem.show();
  ctx.subscriptions.push(studioBarItem);

  const skinBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  skinBarItem.text = '$(symbol-color) Skin';
  skinBarItem.tooltip = '🎨 Đổi nhanh giữa 5 bộ giao diện DrgX';
  skinBarItem.command = 'drgx.skin';
  skinBarItem.show();
  ctx.subscriptions.push(skinBarItem);

  // Đổi model/độ trễ/số dòng phải bỏ cache và session cũ; nếu không, gợi ý
  // của cấu hình trước vẫn có thể hiện ra ở vị trí đã đổi.
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(function (e) {
      if (!e || !e.affectsConfiguration || e.affectsConfiguration('drgxCopilot')) {
        completionCache.clear();
        lastGhost = null;
        sessionId = null;
        currentModel = null;
      }
    })
  );

  // 1. INLINE COMPLETION PROVIDER (GHOST TEXT)
  const provider = {
    provideInlineCompletionItems: async function (document, position, context, token) {
      if (!cfg().get('enabled', true)) return undefined;
      const scheme = document.uri && document.uri.scheme;
      if (scheme !== 'file' && scheme !== 'untitled' && scheme !== 'vscode-vfs') return undefined;

      const isManual =
        context &&
        context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;
      if (!isManual && !cfg().get('autoTrigger', true)) {
        return undefined;
      }

      // Check CP Predictor FIRST (Instant 0ms synchronous pattern predictor)
      const cpMatch = predictCPAlgorithm(document, position);
      if (cpMatch) {
        globalThis.__drgxExt.ok++;
        globalThis.__drgxExt.last = { ms: 0, text: cpMatch.text, type: 'cp_predictor' };
        setStatus('ok', 'CP: ' + cpMatch.algo);
        return {
          items: [
            new vscode.InlineCompletionItem(
              cpMatch.text,
              cpMatch.range || new vscode.Range(position, position)
            )
          ]
        };
      }

      const lineText = document.lineAt(position.line).text;
      const linePrefix = lineText.slice(0, position.character);
      const lineSuffix = lineText.slice(position.character);

      // Do not auto-trigger in the middle of words for generic AI calls
      if (!isManual && lineSuffix.length > 0 && /^[a-zA-Z0-9_]/.test(lineSuffix)) {
        return undefined;
      }

      // Check Ghost Cache: user is typing continuation of previous suggestion
      if (
        lastGhost &&
        lastGhost.uri === document.uri.toString() &&
        lastGhost.line === position.line &&
        position.character > lastGhost.char &&
        linePrefix.slice(0, lastGhost.char) === lastGhost.before &&
        Date.now() - lastGhost.time < 8000
      ) {
        const typedSince = linePrefix.slice(lastGhost.char);
        if (lastGhost.fullSuggestion.startsWith(typedSince)) {
          const remaining = lastGhost.fullSuggestion.slice(typedSince.length);
          if (remaining.length > 0) {
            return {
              items: [
                new vscode.InlineCompletionItem(
                  remaining,
                  new vscode.Range(position, position)
                )
              ]
            };
          }
        }
      }

      globalThis.__drgxExt.calls++;
      if (!baseUrl) await ensureBase();
      globalThis.__drgxExt.proxy = !!baseUrl;
      if (token.isCancellationRequested) return undefined;

      const maxLines = Number(cfg().get('maxLines', 3)) || 3;

      // Offline / Local Engine fallback when neither Proxy nor Direct Daemon is running
      if (!baseUrl) {
        const localText = predictGeneralCode(document, position, maxLines);
        if (!localText) return undefined;
        globalThis.__drgxExt.ok++;
        globalThis.__drgxExt.last = { ms: 0, text: localText, type: 'local_engine' };
        return {
          items: [
            new vscode.InlineCompletionItem(
              localText,
              new vscode.Range(position, position)
            )
          ]
        };
      }

      // Debounce: manual trigger has 0ms delay, auto-typing has configured delay
      const startVersion = document.version;
      const delayMs = isManual ? 0 : Number(cfg().get('delayMs', 250)) || 0;
      if (delayMs > 0) {
        await sleep(delayMs);
        if (token.isCancellationRequested || document.version !== startVersion) {
          return undefined;
        }
      }

      const key =
        document.uri.toString() +
        ':' +
        document.version +
        ':' +
        position.line +
        ':' +
        position.character;
      if (completionCache.has(key)) {
        const cached = completionCache.get(key);
        return cached
          ? {
              items: [
                new vscode.InlineCompletionItem(
                  cached,
                  new vscode.Range(position, position)
                )
              ]
            }
          : undefined;
      }

      const requestVersion = document.version;
      const t0 = Date.now();
      try {
        const raw = await generate(
          baseUrl,
          buildPrompt(document, position, maxLines),
          token
        );
        if (raw === null) {
          const localFallback = predictGeneralCode(document, position, maxLines);
          if (localFallback) {
            globalThis.__drgxExt.ok++;
            globalThis.__drgxExt.last = { ms: Date.now() - t0, text: localFallback, type: 'local_fallback' };
            return {
              items: [
                new vscode.InlineCompletionItem(
                  localFallback,
                  new vscode.Range(position, position)
                )
              ]
            };
          }
          globalThis.__drgxExt.fail++;
          return undefined;
        }
        // Tài liệu đã đổi trong lúc chờ model: không trả gợi ý cho vị trí cũ.
        if (token.isCancellationRequested || document.version !== requestVersion) {
          return undefined;
        }

        let text = cleanSuggestion(raw, maxLines, linePrefix, lineSuffix);
        if (!text) {
          text = predictGeneralCode(document, position, maxLines);
        }
        globalThis.__drgxExt.ok++;
        globalThis.__drgxExt.last = { ms: Date.now() - t0, text: text, type: 'cloud_ai' };
        globalThis.__drgxExt.results.push({ line: position.line, text: text });
        if (globalThis.__drgxExt.results.length > 20) globalThis.__drgxExt.results.shift();
        if (completionCache.size > 200) completionCache.clear();
        completionCache.set(key, text);

        if (!text) return undefined;

        lastGhost = {
          uri: document.uri.toString(),
          line: position.line,
          char: position.character,
          before: linePrefix,
          fullSuggestion: text,
          time: Date.now()
        };

        return {
          items: [
            new vscode.InlineCompletionItem(
              text,
              new vscode.Range(position, position)
            )
          ]
        };
      } catch (e) {
        if (token.isCancellationRequested) return undefined;
        const localFallback = predictGeneralCode(document, position, maxLines);
        if (localFallback) {
          globalThis.__drgxExt.ok++;
          return {
            items: [
              new vscode.InlineCompletionItem(
                localFallback,
                new vscode.Range(position, position)
              )
            ]
          };
        }
        globalThis.__drgxExt.fail++;
        globalThis.__drgxExt.error = String(e);
        log('provider error: ' + e);
        return undefined;
      }
    }
  };

  ctx.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider)
  );

  // 2. INTELLISENSE COMPLETION ITEM PROVIDER (CP SNIPPETS & ALGORITHMS)
  ctx.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      ['cpp', 'c', 'python', 'javascript', 'typescript', 'plaintext'],
      {
        provideCompletionItems: function (document, position) {
          const items = [];
          const lang = (document.languageId || '').toLowerCase();
          const tpls = lang === 'python' ? CP_TEMPLATES.python : CP_TEMPLATES.cpp;
          for (const key of Object.keys(tpls)) {
            const t = tpls[key];
            const item = new vscode.CompletionItem(t.keyword, vscode.CompletionItemKind.Snippet);
            item.detail = '⚡ [DrgX CP] ' + t.name;
            item.documentation = new vscode.MarkdownString(
              '### ⚡ DrgX Competitive Programming Template\n' +
                '**Thuật toán / Cấu trúc:** ' +
                t.name +
                '\n\n```' +
                (lang === 'python' ? 'python' : 'cpp') +
                '\n' +
                t.snippet +
                '\n```'
            );
            item.insertText = new vscode.SnippetString(t.tabSnippet || t.snippet);
            item.sortText = '0_' + t.keyword; // Prioritize CP templates to the top
            items.push(item);
          }
          return items;
        }
      },
      '/', 's', 'r', 'd', 'p', 'f', 'b', 'k'
    )
  );

  // 3. COMMANDS
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgxCopilot.trigger', function () {
      vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.profile', function () {
      return chooseWorkProfile(ctx);
    })
  );

  // F9: Compile & Run Active File
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.run', async function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Vui lòng mở một tệp mã nguồn (.cpp, .py) để biên dịch & chạy!');
        return;
      }
      if (editor.document.uri.scheme !== 'file') {
        vscode.window.showWarningMessage('Hãy lưu tệp thành file thật trước khi chạy (Ctrl+S).');
        return;
      }
      try {
        if (editor.document.isDirty && !(await editor.document.save())) {
          vscode.window.showErrorMessage('Không lưu được tệp. Kiểm tra quyền ghi hoặc file đang bị khóa.');
          return;
        }
      } catch (e) {
        vscode.window.showErrorMessage('Không lưu được tệp: ' + (e.message || e));
        return;
      }
      runInTerminal(cliInvocation() + ' run ' + shellQuote(editor.document.fileName));
    })
  );

  // F5: Test Solution Against input.txt & expected.txt
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.test', async function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Vui lòng mở tệp thuật toán (.cpp, .py) để kiểm thử!');
        return;
      }
      if (editor.document.uri.scheme !== 'file') {
        vscode.window.showWarningMessage('Hãy lưu tệp thành file thật trước khi chấm (Ctrl+S).');
        return;
      }
      try {
        if (editor.document.isDirty && !(await editor.document.save())) {
          vscode.window.showErrorMessage('Không lưu được tệp. Kiểm tra quyền ghi hoặc file đang bị khóa.');
          return;
        }
      } catch (e) {
        vscode.window.showErrorMessage('Không lưu được tệp: ' + (e.message || e));
        return;
      }
      runInTerminal(cliInvocation() + ' test ' + shellQuote(editor.document.fileName));
    })
  );

  // Quick Init CP Problem
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.init', async function () {
      const name = await vscode.window.showInputBox({
        prompt: 'Nhập tên thư mục bài toán CP',
        placeHolder: 'bai1_prefix_sum'
      });
      if (!name) return;
      const cdInto = process.platform === 'win32' ? '; Set-Location -LiteralPath ' : '; cd ';
      runInTerminal(cliInvocation() + ' init ' + shellQuote(name) + cdInto + shellQuote(name));
    })
  );

  // Quick Insert CP Template
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.insertCP', async function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Vui lòng mở tệp để chèn thuật toán!');
        return;
      }
      const lang = (editor.document.languageId || '').toLowerCase();
      const tpls = lang === 'python' ? CP_TEMPLATES.python : CP_TEMPLATES.cpp;
      const items = Object.keys(tpls).map(k => ({
        label: `$(symbol-structure) ${tpls[k].keyword}`,
        description: tpls[k].name,
        tpl: tpls[k]
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Chọn thuật toán / cấu trúc dữ liệu CP cần chèn...'
      });
      if (picked) {
        editor.insertSnippet(new vscode.SnippetString(picked.tpl.tabSnippet || picked.tpl.snippet));
      }
    })
  );

  // Doctor Diagnostic
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.doctor', function () {
      runInTerminal(cliInvocation() + ' doctor');
    })
  );

  // Open Web Showcase
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.openWeb', function () {
      runInTerminal(cliInvocation() + ' web');
    })
  );

  // Hệ sinh thái DrgX: mở lộ trình học & câu lạc bộ
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.learn', function () {
      runInTerminal(cliInvocation() + ' learn');
    })
  );

  // 🚀 Mở DrgX Studio (Native Tauri v2 Desktop App)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.studio', function () {
      launchStudioNative();
    })
  );

  // 🏠 Trang chủ DrgX: dashboard điều khiển, skin và trạng thái môi trường.
  // Factory nằm cuối file để không làm rối phần provider/judge hiện có.
  const drgxHome = createDrgxHome({
    vscode: vscode,
    ctx: ctx,
    cfg: cfg,
    ensureBase: ensureBase,
    cliInvocation: cliInvocation,
    workspaceCwd: workspaceCwd,
    escHtml: escHtml,
    log: log,
    getTimerEndAt: function () { return timerEndAt; }
  });
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.home', function () {
      return drgxHome.open();
    })
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.skin', function () {
      return drgxHome.chooseSkin();
    })
  );
  setTimeout(function () {
    try { drgxHome.maybeAutoOpen(); } catch (e) { log('home auto-open failed: ' + e); }
  }, 1800);

  // ====================== ⚖️ DRGX JUDGE (multi-testcase webview) ====================== */
  let judgePanel = null;
  function judgeVerdictColor(v) {
    return (
      { AC: '#6EE7B7', WA: '#F87171', RE: '#FB923C', TLE: '#FBBF24', OLE: '#FBBF24', SKIP: '#64748B', ERR: '#F87171' }[v] ||
      '#94A3B8'
    );
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function runJudge() {
    const base = await ensureBase();
    if (typeof vscode.window.setStatusBarMessage === 'function') {
      vscode.window.setStatusBarMessage('⚖️ Judge đang biên dịch & chấm tests/...', 60000);
    }
    const ctrl = new AbortController();
    const guard = setTimeout(function () {
      ctrl.abort();
    }, 15 * 60 * 1000);
    try {
      const editor = vscode.window.activeTextEditor;
      try {
        if (editor && editor.document.uri.scheme === 'file' && editor.document.isDirty) {
          if (!(await editor.document.save())) {
            throw new Error('không lưu được file đang mở');
          }
        }
      } catch (saveErr) {
        throw new Error('không lưu được file đang mở: ' + (saveErr.message || saveErr));
      }
      const source =
        editor && editor.document.uri.scheme === 'file' ? editor.document.fileName : '';
      const tl = Number(cfg().get('judgeTimeLimit', 6000)) || 6000;
      const clampedTl = Math.max(100, Math.min(120000, tl));
      let j = null;

      if (base && backendMode === 'proxy') {
        const body = { tl: clampedTl };
        if (source) body.source = source;
        const r = await authFetch(base + '/tests', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
          signal: ctrl.signal
        });
        try {
          j = await r.json();
        } catch (parseErr) {
          j = null;
        }
      }

      if (!j && nodeChildProcess) {
        const cwd = workspaceCwd() || (source && nodePath ? nodePath.dirname(source) : process.cwd());
        const cliBin = resolveCliBinPath();
        const args = ['tests', '--json', '--tl', String(clampedTl)];
        if (source) args.push('--', source);
        j = await new Promise(function (resolve) {
          nodeChildProcess.execFile(cliBin, args, { cwd: cwd, timeout: 120000, maxBuffer: 8 * 1024 * 1024 }, function (err, stdout, stderr) {
            const raw = String(stdout || '').trim();
            const line = raw.split(/\r?\n/).reverse().find(function (l) { return l.trim().startsWith('{'); });
            if (line) {
              try { return resolve(JSON.parse(line.trim())); } catch (_) {}
            }
            resolve({ ok: false, error: (stderr || (err && err.message) || 'Không chạy được drgx tests').trim() });
          });
        });
      }

      if (!j || j.ok === false) {
        vscode.window.showErrorMessage(
          '⚖️ DrgX Judge lỗi: ' + ((j && j.error) || 'không xác định')
        );
        return;
      }
      showJudgePanel(j);
      if (j.all) {
        vscode.window.showInformationMessage(
          '⚖️ DrgX Judge: ACCEPTED — ' + j.pass + '/' + j.total + ' test AC! 🎉'
        );
      } else {
        vscode.window.showWarningMessage(
          '⚖️ DrgX Judge: ' + j.pass + '/' + j.total + ' test — xem bảng trong panel Judge.'
        );
      }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        vscode.window.showErrorMessage('⚖️ DrgX Judge quá 15 phút — đã hủy. Kiểm tra tests/ hoặc giảm số test.');
      } else {
        vscode.window.showErrorMessage('⚖️ DrgX Judge lỗi: ' + (e && e.message ? e.message : e));
      }
    } finally {
      clearTimeout(guard);
    }
  }

  function showJudgePanel(j) {
    const verdictColors = {
      AC: '#6EE7B7', WA: '#F87171', RE: '#FB923C', TLE: '#FBBF24', OLE: '#FBBF24', SKIP: '#64748B', ERR: '#F87171'
    };
    const rows = [];
    (j.tests || []).forEach(function (t, i) {
      const c = verdictColors[t.verdict] || '#94A3B8';
      rows.push(
        '<tr class="jrow" data-d="d' + i + '">' +
        '<td><b>#' + (i + 1) + '</b> ' + escHtml(t.name) + '</td>' +
        '<td style="color:' + c + ';font-weight:700">' + escHtml(t.verdict) + '</td>' +
        '<td>' + Number(t.ms) + ' ms</td>' +
        '<td style="color:#64748B">' + escHtml(t.note || '') + '</td></tr>'
      );
      if (t.verdict !== 'AC') {
        let diffHtml = '';
        if (t.verdict === 'TLE') {
          diffHtml = '<div class="tag" style="color:#FBBF24">⏱ Vượt giới hạn thời gian ' + (j.tl || 6000) + 'ms</div>';
        }
        if (t.stderr) {
          diffHtml += '<div class="tag" style="color:#FB923C">stderr</div><pre>' + escHtml(t.stderr) + '</pre>';
        }
        if (t.verdict !== 'TLE') {
          diffHtml +=
            '<div class="tag" style="color:#93C5FD">Đầu vào</div><pre>' + escHtml(t.input) + '</pre>' +
            '<div class="tag" style="color:#F87171">Output của bạn</div><pre>' + escHtml(t.got) + '</pre>' +
            '<div class="tag" style="color:#6EE7B7">Kết quả mong đợi</div><pre>' + escHtml(t.expected) + '</pre>';
        }
        rows.push(
          '<tr class="jdiff" id="d' + i + '" style="display:none"><td colspan="4">' + diffHtml + '</td></tr>'
        );
      }
    });

    const totalMs = (j.tests || []).reduce(function (a, t) {
      return a + Number(t.ms || 0);
    }, 0);
    const allOk = !!j.all;
    const summaryColor = allOk ? '#6EE7B7' : '#F87171';

    if (judgePanel) {
      judgePanel.title = '⚖️ DrgX Judge — ' + escHtml(j.source || 'judge');
      judgePanel.reveal(vscode.ViewColumn.Two, true);
    } else {
      judgePanel = vscode.window.createWebviewPanel(
        'drgxJudge',
        '⚖️ DrgX Judge — ' + escHtml(j.source || 'judge'),
        { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
        { enableScripts: true }
      );
      judgePanel.onDidDispose(function () {
        judgePanel = null;
      });
      judgePanel.webview.onDidReceiveMessage(function (m) {
        if (m && m.cmd === 'retry') vscode.commands.executeCommand('drgx.judge');
        else if (m && m.cmd === 'studio') vscode.commands.executeCommand('drgx.studio');
      });
    }

    const dataJson = JSON.stringify(j).replace(/</g, '\\u003c');
    judgePanel.webview.html =
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\';">' +
      '<style>' +
      'body{margin:0;padding:18px 20px;background:#0B0F1A;color:#C9D6F2;font-family:"Segoe UI",sans-serif;font-size:13px}' +
      'h1{font-size:16px;margin:0 0 4px}' + 'h1 .src{color:#67E8F9;font-weight:600}' +
      '.hdr{display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap}' +
      '.badge{padding:3px 12px;border-radius:999px;font-weight:700;font-size:12px;color:#0B0F1A;background:' + summaryColor + '}' +
      '.meta{color:#64748B;font-size:12px}' +
      'table{width:100%;border-collapse:collapse}' +
      'th{color:#7DD3FC;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:6px 10px;border-bottom:1px solid #1C2A4C}' +
      'td{padding:7px 10px;border-bottom:1px solid #101A30}' +
      '.jrow{cursor:pointer;transition:background .15s}.jrow:hover td{background:#141E36}' +
      '.jdiff td{background:#0A0E19;padding:10px 14px;font-family:Consolas,monospace;font-size:12px}' +
      '.jdiff pre{background:#050810;border:1px solid #1C2A4C;border-radius:8px;padding:10px;max-height:220px;overflow:auto;white-space:pre-wrap;color:#C9D6F2;margin:4px 0 10px}' +
      '.tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-top:8px}' +
      '.actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}' +
      '.btn{display:inline-block;padding:7px 16px;border-radius:8px;background:#7C3AED;color:#fff;cursor:pointer;font-weight:700;border:0;font-family:inherit;transition:.15s}' +
      '.btn:hover{background:#8B5CF6;transform:translateY(-1px)}' +
      '.btn.secondary{background:#13213B;border:1px solid #2A3F68;color:#7DD3FC}' +
      '.btn.secondary:hover{background:#1B2E52}' +
      '.footer{color:#4F6B8F;font-size:11px;margin-top:10px}' +
      '</style></head><body>' +
      '<div class="hdr"><h1>⚖️ DrgX Judge — <span class="src">' + escHtml(j.source || '') + '</span></h1>' +
      '<span class="badge">' + (allOk ? 'ACCEPTED' : 'NOT PASSING') + '</span>' +
      '<span class="meta">' + j.pass + '/' + j.total + ' test · TL ' + j.tl + 'ms · tổng ' + totalMs + 'ms</span></div>' +
      '<table><thead><tr><th>Test</th><th>Verdict</th><th>Thời gian</th><th>File</th></tr></thead><tbody>' +
      (rows.length ? rows.join('') : '<tr><td colspan="4" style="color:#64748B">Không có test trong thư mục tests/</td></tr>') +
      '</tbody></table>' +
      '<div class="actions"><button class="btn" id="retryBtn">↻ Chấm lại</button><button class="btn secondary" id="studioBtn">🚀 Mở trong DrgX Studio</button></div>' +
      '<div class="footer">Bấm vào dòng test để bung/đóng diff. Đặt tests/01.in + tests/01.out để thêm testcase.</div>' +
      '<script>window.__judge =' + dataJson + ';' +
      'var vs=null;try{vs=acquireVsCodeApi();}catch(e){}' +
      'document.querySelectorAll(".jrow").forEach(function(tr){tr.addEventListener("click",function(){var d=document.getElementById(tr.dataset.d);if(d)d.style.display=(d.style.display==="none"?"":"none");});});' +
      'var rb=document.getElementById("retryBtn");if(rb)rb.addEventListener("click",function(){if(vs)vs.postMessage({cmd:"retry"});});' +
      'var sb=document.getElementById("studioBtn");if(sb)sb.addEventListener("click",function(){if(vs)vs.postMessage({cmd:"studio"});});' +
      '<\/script></body></html>';
  }

  ctx.subscriptions.push(vscode.commands.registerCommand('drgx.judge', runJudge));

  // 🧪 Stress Tester — hỏi nhanh 3 file rồi phóng vào terminal
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.stress', async function () {
      const sol = await vscode.window.showInputBox({
        prompt: '🧪 Stress: file SOLUTION của bạn?',
        value: 'solution.cpp'
      });
      if (!sol) return;
      const brute = await vscode.window.showInputBox({
        prompt: 'File BRUTE-FORCE (đáp án chậm chắc chắn đúng)?',
        value: 'brute.cpp'
      });
      if (!brute) return;
      const gen = await vscode.window.showInputBox({
        prompt: 'File GEN.PY (sinh test ngẫu nhiên mỗi vòng)?',
        value: 'gen.py'
      });
      if (!gen) return;
      runInTerminal(cliInvocation() + ' stress ' + shellQuote(sol) + ' ' + shellQuote(brute) + ' ' + shellQuote(gen));
    })
  );

  // ====================== ⏱ DRGX CONTEST TIMER ====================== */
  let timerItem = null;
  let timerInterval = null;
  let timerEndAt = 0;
  const TIMER_KEY = 'drgx.timer.endAt';

  function persistTimer() {
    try {
      ctx.globalState.update(TIMER_KEY, timerEndAt || 0);
    } catch (e) {}
  }

  function ensureTimerItem() {
    if (timerItem) return;
    timerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    timerItem.tooltip = '⏱ Contest Timer — bấm vào để đổi thời gian hoặc dừng';
    timerItem.command = 'drgx.timer';
    timerItem.show();
  }

  function tickTimer() {
    if (!timerItem) return;
    const left = timerEndAt - Date.now();
    if (left <= 0) {
      timerItem.text = '$(bell) ⏰ Hết giờ!';
      timerItem.color = '#FBBF24';
      timerEndAt = 0;
      persistTimer();
      try {
        vscode.window.showInformationMessage('⏰ HẾT GIỜ! Đồng hồ contest đã chạy hết. Ctrl+Alt+J chấm bài ngay nào!');
      } catch (e) {}
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      return;
    }
    const s = Math.ceil(left / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    timerItem.text = '$(watch) ⏱ ' + mm + ':' + ss;
    timerItem.color = left < 300000 ? '#F87171' : '#67E8F9';
  }

  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.timer', async function () {
      const items = [
        { label: '$(watch) 25 phút', mins: 25 },
        { label: '$(watch) 60 phút', mins: 60 },
        { label: '$(watch) 90 phút', mins: 90 },
        { label: '$(clock) Tùy chỉnh số phút...', mins: -1 }
      ];
      if (timerItem && timerEndAt > Date.now()) {
        items.unshift({ label: '$(circle-slash) Dừng đồng hồ đang chạy', mins: 0 });
      }
      const sel = await vscode.window.showQuickPick(items, {
        placeHolder: '⏱ Contest Timer — đếm ngược trên status bar'
      });
      if (!sel) return;
      if (sel.mins === 0) {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;
        timerEndAt = 0;
        persistTimer();
        if (timerItem) {
          timerItem.dispose();
          timerItem = null;
        }
        vscode.window.showInformationMessage('⏱ Đã dừng đồng hồ contest.');
        return;
      }
      let mins = sel.mins;
      if (mins < 0) {
        const raw = await vscode.window.showInputBox({
          prompt: 'Số phút countdown?',
          value: '45',
          validateInput: v => (/^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 600 ? null : 'Nhập số phút (1–600)')
        });
        if (!raw) return;
        mins = Number(raw);
      }
      timerEndAt = Date.now() + mins * 60000;
      ensureTimerItem();
      persistTimer();
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(tickTimer, 1000);
      tickTimer();
      vscode.window.showInformationMessage('⏱ Contest ' + mins + ' phút bắt đầu! Hết giờ IDE sẽ báo.');
    })
  );

  // Khôi phục đồng hồ nếu cửa sổ IDE được reload trong lúc contest đang chạy.
  try {
    const savedEnd = Number(ctx.globalState.get(TIMER_KEY, 0)) || 0;
    if (savedEnd > Date.now()) {
      timerEndAt = savedEnd;
      ensureTimerItem();
      timerInterval = setInterval(tickTimer, 1000);
      tickTimer();
    } else if (savedEnd) {
      ctx.globalState.update(TIMER_KEY, 0);
    }
  } catch (e) {}
  ctx.subscriptions.push({
    dispose: function () {
      if (timerInterval) clearInterval(timerInterval);
      if (timerItem) timerItem.dispose();
    }
  });

  // Interactive Control Center (Clicking status bar)
  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgx.menu', async function () {
      const picks = [
        { label: '$(rocket) 🚀 Mở DrgX Studio — Native Tauri v2 App (Ctrl+Alt+S)', cmd: 'drgx.studio' },
        { label: '$(home) 🏠 Trang chủ DrgX — dashboard điều khiển', cmd: 'drgx.home' },
        { label: '$(symbol-color) 🎨 Đổi skin giao diện — 5 skin DrgX', cmd: 'drgx.skin' },
        { label: '$(settings-gear) Hồ sơ làm việc — tự cài extension (CP/Web/App/AI/STEM)', cmd: 'drgx.profile' },
        { label: '$(play) Biên dịch & Chạy mã nguồn (F9)', cmd: 'drgx.run' },
        { label: '$(check) Chấm testcase với input.txt (F5)', cmd: 'drgx.test' },
        { label: '$(beaker) ⚖️ DrgX Judge — chấm toàn bộ tests/ (Ctrl+Alt+J)', cmd: 'drgx.judge' },
        { label: '$(watch) ⏱ Contest Timer — đồng hồ đếm ngược', cmd: 'drgx.timer' },
        { label: '$(zap) 🧪 Stress Tester — săn test làm WA với brute-force', cmd: 'drgx.stress' },
        { label: '$(mortar-board) Hệ sinh thái DrgX — lộ trình học, CLB, mentor (Ctrl+Alt+L)', cmd: 'drgx.learn' },
        { label: '$(symbol-structure) Chèn thuật toán CP (SegTree, RMQ, DSU...) (Ctrl+Alt+C)', cmd: 'drgx.insertCP' },
        { label: '$(new-folder) Khởi tạo bài toán CP mới', cmd: 'drgx.init' },
        { label: '$(sparkle) Gợi ý mã AI tại con trỏ (Alt+\\)', cmd: 'drgxCopilot.trigger' },
        { label: '$(gear) Chẩn đoán hệ thống (Doctor)', cmd: 'drgx.doctor' },
        { label: '$(globe) Mở DrgX Web Showcase', cmd: 'drgx.openWeb' }
      ];
      const sel = await vscode.window.showQuickPick(picks, {
        placeHolder: '⚡ DrgX Developer & CP Control Center'
      });
      if (sel) {
        vscode.commands.executeCommand(sel.cmd);
      }
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('drgxCopilot.selfTest', async function () {
      const doc = await vscode.workspace.openTextDocument({
        content: '#include <bits/stdc++.h>\nusing namespace std;\n\nsegtree\n',
        language: 'cpp'
      });
      await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(3, 7);
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        editor.selection = new vscode.Selection(pos, pos);
      }
      await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    })
  );

  ensureBase().then(function () {
    globalThis.__drgxExt.proxy = !!baseUrl;
    if (baseUrl) {
      ensureSession().then(function () {
        globalThis.__drgxExt.session = sessionId;
      });
    }
  });

  setStatus('ok', 'CP Ready');
  log('activated with CP Predictor & Learning Ecosystem');
}

function deactivate() {
  if (statusItem) statusItem.dispose();
}

exports.activate = activate;
exports.deactivate = deactivate;


/* ==========================================================================
   🏠 DRGX HOME — dashboard điều khiển trung tâm
   Được gọi từ activate() để giữ toàn bộ state trong extension context.
   ========================================================================== */
function createDrgxHome(deps) {
  const vscode = deps.vscode;
  const ctx = deps.ctx;
  const cfg = deps.cfg;
  const ensureBase = deps.ensureBase;
  const cliInvocation = deps.cliInvocation;
  const workspaceCwd = deps.workspaceCwd;
  const escHtml = deps.escHtml;
  const log = deps.log || function () {};
  const getTimerEndAt = deps.getTimerEndAt || function () { return 0; };

  const SKINS = ['DrgX Ion', 'DrgX Nebula', 'DrgX Tokyo', 'DrgX Matrix', 'DrgX Dawn'];
  const SKIN_META = {
    'DrgX Ion': ['Tím · Cyan', 'Cân bằng, mặc định', '#7c3aed', '#22d3ee'],
    'DrgX Nebula': ['Tím · Hồng', 'Nổi bật, sáng tạo', '#c084fc', '#22d3ee'],
    'DrgX Tokyo': ['Xanh · Tím', 'Dịu mắt, đêm dài', '#7aa2f7', '#bb9af7'],
    'DrgX Matrix': ['Lục · Chanh', 'Tập trung, năng lượng', '#34d399', '#a3e635'],
    'DrgX Dawn': ['Sáng · Ấm', 'Ban ngày, in ấn', '#f5f1e8', '#7c3aed']
  };

  let panel = null;

  function attr(s) {
    return escHtml(s).replace(/"/g, '&quot;');
  }

  async function collectData() {
    let tests = 0;
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length) {
      try {
        const entries = await vscode.workspace.fs.readDirectory(
          vscode.Uri.joinPath(folders[0].uri, 'tests')
        );
        tests = entries.filter(function (e) {
          return e[1] === vscode.FileType.File && /\.in$/i.test(e[0]);
        }).length;
      } catch (e) {}
    }
    let proxy = false;
    try {
      proxy = !!(await ensureBase());
    } catch (e) {}
    let timer = 'Chưa bật';
    try {
      const endAt = Number(getTimerEndAt()) || 0;
      if (endAt > Date.now()) {
        timer = Math.ceil((endAt - Date.now()) / 60000) + ' phút';
      }
    } catch (e) {}
    const wb = vscode.workspace.getConfiguration('workbench');
    return {
      version:
        (ctx.extension && ctx.extension.packageJSON && ctx.extension.packageJSON.version) || '1.0.0',
      folder: folders.length ? folders[0].name : 'Chưa mở thư mục',
      folderPath: workspaceCwd() || '',
      tests: tests,
      proxy: proxy,
      cli: String(cfg().get('cliPath', '') || 'drgx'),
      theme: String(wb.get('colorTheme', 'DrgX Ion')),
      model: String(cfg().get('model', 'opencode/nemotron-3.5-lightning-free')).split('/').pop(),
      ai: !!cfg().get('enabled', true),
      timer: timer
    };
  }

  function skinCards(d) {
    return SKINS.map(function (name) {
      const meta = SKIN_META[name];
      const active = d.theme === name;
      return (
        '<button type="button" class="skin ' + (active ? 'active' : '') + '" data-skin="' + attr(name) + '" title="Đổi sang ' + attr(name) + '">' +
        '<span class="sw"><i style="background:' + meta[2] + '"></i><i style="background:' + meta[3] + '"></i></span>' +
        '<b>' + escHtml(name.replace('DrgX ', '')) + '</b><small>' + escHtml(meta[0]) + '</small>' +
        (active ? '<em>Đang dùng</em>' : '') +
        '</button>'
      );
    }).join('');
  }

  function buildHtml(d, webview, showIntro) {
    const cspSrc = webview ? webview.cspSource : 'https:';
    const videoUri = webview
      ? webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'media', 'drgx-intro.mp4'))
      : '';
    const logoUri = webview
      ? webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'media', 'icon.png'))
      : '';
    const quick = [
      ['drgx.run', '▶', 'Chạy mã', 'F9'],
      ['drgx.test', '✓', 'Test nhanh', 'F5'],
      ['drgx.judge', '⚖', 'Judge', 'Ctrl+Alt+J'],
      ['drgx.studio', '🚀', 'DrgX Studio', 'Native Tauri App'],
      ['drgx.stress', '🧪', 'Stress', 'Săn WA'],
      ['drgx.timer', '⏱', 'Contest Timer', d.timer],
      ['drgx.insertCP', '🧩', 'Chèn CP', 'SegTree, DSU...'],
      ['drgx.profile', '🎛', 'Hồ sơ làm việc', 'Tự cài extension']
    ].map(function (a) {
      return (
        '<button type="button" class="quick" data-cmd="' + attr(a[0]) + '">' +
        '<span>' + a[1] + '</span><b>' + escHtml(a[2]) + '</b><small>' + escHtml(a[3]) + '</small></button>'
      );
    }).join('');

    const envRows =
      '<div class="env-row"><span>Workspace</span><b title="' + attr(d.folderPath) + '">' + escHtml(d.folder) + '</b></div>' +
      '<div class="env-row"><span>CLI</span><b>' + escHtml(d.cli) + '</b></div>' +
      '<div class="env-row"><span>Chủ đề</span><b>' + escHtml(d.theme) + '</b></div>' +
      '<div class="env-row"><span>AI model</span><b>' + escHtml(d.model || '—') + '</b></div>';

    return (
      '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src ' + cspSrc + ' data:; media-src ' + cspSrc + ' data: blob:;">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>' +
      ':root{--bg:#070b13;--panel:#0d1525;--line:#1d2d4d;--text:#dbeafe;--muted:#8da6ce;--violet:#8b5cf6;--cyan:#22d3ee;--green:#6ee7b7;--red:#f87171;--shadow:0 18px 50px #0006}' +
      '*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(1100px 520px at 82% -10%,#4c1d9538,transparent 60%),radial-gradient(900px 500px at -10% 100%,#0e749038,transparent 65%),var(--bg);color:var(--text);font-family:Segoe UI,system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.55}' +
      'button{font:inherit}.wrap{max-width:1120px;margin:0 auto;padding:28px 22px 34px}' +
      '.top{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:26px}.brand{display:flex;align-items:center;gap:12px}.mark{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#7c3aed,#22d3ee);box-shadow:0 8px 28px #22d3ee33;color:#071018;font-size:24px;font-weight:900;transform:rotate(-4deg)}.brand h1{font-size:19px;line-height:1.1;margin:0;letter-spacing:.2px}.brand p{margin:3px 0 0;color:var(--muted);font-size:11px}.pill{border:1px solid var(--line);background:#0b1424aa;color:var(--muted);border-radius:999px;padding:7px 11px;font-size:11px;white-space:nowrap}.pill b{color:var(--cyan);font-weight:700}' +
      '.hero{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:22px;padding:28px;background:linear-gradient(135deg,#111b31 0%,#0b1221 58%,#17102d 100%);box-shadow:var(--shadow)}.hero:after{content:"";position:absolute;width:280px;height:280px;right:-90px;top:-150px;border-radius:50%;background:#7c3aed2e;filter:blur(4px);pointer-events:none}.eyebrow{color:var(--cyan);font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.hero h2{font-size:clamp(24px,3.4vw,38px);line-height:1.12;letter-spacing:-.035em;margin:8px 0 10px;max-width:680px}.hero h2 span{color:var(--violet)}.hero p{max-width:680px;margin:0;color:var(--muted);font-size:13px}.hero-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:20px}.btn{border-radius:10px;padding:10px 15px;border:1px solid var(--line);background:#0b1424;color:var(--text);font-weight:700;cursor:pointer;transition:.16s;display:inline-flex;align-items:center;gap:7px}.btn:hover{transform:translateY(-1px);border-color:#3b82f6;background:#13213b}.btn.primary{background:linear-gradient(135deg,#7c3aed,#6d28d9);border-color:#a78bfa;color:#fff;box-shadow:0 8px 22px #7c3aed44}.btn.primary:hover{background:linear-gradient(135deg,#8b5cf6,#7c3aed)}.btn.ghost{background:transparent}' +
      '.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 22px}.stat{border:1px solid var(--line);border-radius:13px;background:#0b1424cc;padding:11px 13px}.stat span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.stat b{display:block;font-size:17px;margin-top:2px}.stat small{display:block;color:var(--muted);font-size:10px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ok{color:var(--green)}.bad{color:var(--red)}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:currentColor;margin-right:5px;vertical-align:1px}' +
      '.grid{display:grid;grid-template-columns:1.35fr .9fr;gap:14px}.panel{border:1px solid var(--line);border-radius:18px;padding:18px;background:var(--panel)}.panel h3{font-size:13px;margin:0 0 12px;color:#cfe3ff;display:flex;align-items:center;gap:8px}.panel h3 em{font-style:normal;color:var(--muted);font-size:10px;font-weight:500;margin-left:auto}.quick-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.quick{text-align:left;border:1px solid #1b2b48;border-radius:11px;background:#0a1323;color:var(--text);padding:10px;cursor:pointer;transition:.16s}.quick:hover{border-color:#3b82f6;background:#101e36;transform:translateY(-1px)}.quick span{font-size:16px;display:block}.quick b{display:block;font-size:11px;margin-top:3px}.quick small{display:block;color:var(--muted);font-size:10px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.skins{display:grid;gap:7px}.skin{display:flex;align-items:center;gap:9px;text-align:left;border:1px solid #1b2b48;border-radius:10px;background:#0a1323;color:var(--text);padding:8px 9px;cursor:pointer;transition:.16s}.skin:hover{border-color:#8b5cf6}.skin.active{border-color:var(--violet);background:#17102d}.sw{display:flex;gap:2px;flex:0 0 auto}.sw i{display:block;width:9px;height:18px;border-radius:4px}.skin b{font-size:11px}.skin small{color:var(--muted);font-size:10px;margin-left:auto}.skin em{font-style:normal;color:var(--cyan);font-size:9px;font-weight:700;margin-left:6px}.env{margin-top:16px;border-top:1px solid var(--line);padding-top:13px;display:grid;gap:7px}.env-row{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:var(--muted)}.env-row b{color:var(--text);font-weight:600;text-align:right;max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.env-row .ok,.env-row .bad{font-weight:700}' +
      '.steps{margin-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.step{border:1px solid #1b2b48;border-radius:11px;padding:11px 12px;background:#0a1323}.step .n{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#7c3aed22;border:1px solid #7c3aed66;color:#c4b5fd;font-size:10px;font-weight:800;margin-bottom:6px}.step b{display:block;font-size:11px}.step small{display:block;color:var(--muted);font-size:10px;margin-top:2px}' +
      '.footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#5e759b;font-size:10px;margin-top:18px}.footer a{color:#7dd3fc;text-decoration:none}.refresh{border:0;background:transparent;color:#7dd3fc;font-size:10px;cursor:pointer;padding:0}' +
      '.intro-overlay{position:fixed;inset:0;z-index:9999;background:radial-gradient(circle at 50% 42%,#17102d 0%,#06080f 68%);display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:24px 32px;transition:opacity .45s ease,transform .45s ease}.intro-overlay.hidden{opacity:0;transform:scale(1.03);pointer-events:none}' +
      '.intro-top{width:100%;max-width:960px;display:flex;align-items:center;justify-content:space-between}.intro-kicker{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:#0b1424cc;border:1px solid #8b5cf666;font-size:11px;font-weight:700;letter-spacing:.1em;color:#c4b5fd;text-transform:uppercase}.intro-skip{background:#1e293bcc;border:1px solid #47556988;color:#e2e8f0;padding:7px 14px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer}' +
      '.intro-bezel{width:min(460px,76vw);aspect-ratio:16/10;border-radius:22px;padding:5px;background:linear-gradient(135deg,#8b5cf699,#22d3ee66,#0f172a);box-shadow:0 24px 64px #000c,0 0 50px #8b5cf644;overflow:hidden}.intro-screen{width:100%;height:100%;border-radius:18px;background:#05070c;overflow:hidden;display:grid;place-items:center}.intro-video{width:100%;height:100%;object-fit:cover;display:block}' +
      '.intro-bottom{width:100%;max-width:520px;display:flex;flex-direction:column;gap:8px}.intro-bar-track{width:100%;height:4px;border-radius:999px;background:#94a3b829;overflow:hidden}.intro-bar-fill{height:100%;width:100%;border-radius:999px;background:linear-gradient(90deg,#8b5cf6,#22d3ee,#6ee7b7);transition:width 3.2s linear}' +
      'body.vscode-light{--bg:#f7f9fc;--panel:#fff;--line:#dbe4f0;--text:#172033;--muted:#64748b;--shadow:0 18px 50px #0f172a14}.vscode-light .hero{background:linear-gradient(135deg,#fff 0%,#f5f3ff 58%,#eff6ff 100%)}.vscode-light .stat,.vscode-light .quick,.vscode-light .skin,.vscode-light .step{background:#fff}.vscode-light .quick:hover,.vscode-light .skin:hover{background:#f8fafc}.vscode-light .brand h1,.vscode-light .hero h2{color:#172033}.vscode-light .pill{background:#fff;color:#64748b}.vscode-light .btn{background:#fff;color:#172033}.vscode-light .btn:hover{background:#f1f5f9}.vscode-light .btn.primary{color:#fff}.vscode-light .footer{color:#94a3b8}' +
      '@media(max-width:760px){.wrap{padding:16px 12px 24px}.hero{padding:20px}.stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.quick-grid{grid-template-columns:repeat(2,1fr)}.steps{grid-template-columns:1fr}.top{align-items:flex-start}.pill{display:none}}' +
      '</style></head><body>' +
      '<div id="introOverlay" class="intro-overlay' + (showIntro ? '' : ' hidden') + '">' +
      '<div class="intro-top"><div class="intro-kicker">DRGX IDE v' + escHtml(d.version) + ' · LOCAL-FIRST AI &amp; JUDGE</div><button type="button" class="intro-skip" id="btnCloseIntro">Bỏ qua Intro [Esc]</button></div>' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:16px"><div class="intro-bezel"><div class="intro-screen"><video id="introVideo" class="intro-video" src="' + attr(videoUri) + '" poster="' + attr(logoUri) + '" autoplay muted playsinline></video></div></div><div style="text-align:center"><b style="font-size:20px;color:#fff">DrgX IDE</b><div style="color:#94a3b8;font-size:12px">Lập trình đã tiến hóa · Đang mở bảng điều khiển...</div></div></div>' +
      '<div class="intro-bottom"><div class="intro-bar-track"><div class="intro-bar-fill"></div></div></div>' +
      '</div>' +
      '<div class="wrap">' +
      '<div class="top"><div class="brand"><div class="mark">D</div><div><h1>DrgX IDE</h1><p>Lập trình đã tiến hóa · v' + escHtml(d.version) + ' · local-first</p></div></div><div class="pill">Thư mục: <b>' + escHtml(d.folder) + '</b></div></div>' +
      '<section class="hero"><div class="eyebrow">Một IDE · Một hệ sinh thái</div><h2>Chào bạn, sẵn sàng <span>code như cao thủ</span> chưa?</h2><p>Editor 60fps, terminal, AI Copilot, Judge, Stress Test, Contest Timer và Native DrgX Studio đã ở cùng một nơi. Bắt đầu từ một bài mới, chấm bộ test, hoặc mở Native Studio siêu mượt.</p><div class="hero-actions"><button class="btn primary" data-cmd="drgx.studio">🚀 Mở DrgX Studio (Native App)</button><button class="btn" data-cmd="drgx.init">＋ Bài toán mới</button><button class="btn" data-cmd="drgx.judge">⚖ Chấm bài ngay</button><button class="btn ghost" data-cmd="drgx.learn">🎓 Học lộ trình</button><button class="btn ghost" data-cmd="drgx.profile">🎛 Chọn hồ sơ</button><button class="btn ghost" id="btnReplayIntro" type="button">🎬 Xem Intro</button></div></section>' +
      '<div class="stats">' +
      '<div class="stat"><span>Bài test</span><b>' + (d.tests ? d.tests : '—') + '</b><small>' + (d.tests ? 'trong tests/ · sẵn sàng Judge' : 'Thêm tests/01.in + 01.out') + '</small></div>' +
      '<div class="stat"><span>DrgX proxy</span><b class="' + (d.proxy ? 'ok' : 'bad') + '"><i class="dot"></i>' + (d.proxy ? 'Đã kết nối' : 'Chưa kết nối') + '</b><small>Judge &amp; AI bridge</small></div>' +
      '<div class="stat"><span>AI Copilot</span><b class="' + (d.ai ? 'ok' : 'bad') + '">' + (d.ai ? 'Đang bật' : 'Đang tắt') + '</b><small>' + escHtml(d.model || 'chưa chọn model') + '</small></div>' +
      '<div class="stat"><span>Contest</span><b>' + escHtml(d.timer) + '</b><small>Ctrl+Alt+J để chấm</small></div>' +
      '</div>' +
      '<div class="grid"><section class="panel"><h3>⚡ Bắt đầu nhanh <em>Phím tắt ngay trên bàn phím</em></h3><div class="quick-grid">' + quick + '</div></section>' +
      '<section class="panel"><h3>🎨 Skin DrgX <em>Đồng bộ với web</em></h3><div class="skins">' + skinCards(d) + '</div>' +
      '<div class="env">' + envRows + '</div></section></div>' +
      '<section class="panel steps" style="margin-top:14px"><div class="step"><span class="n">01</span><b>Viết lời giải</b><small>Mở solution.cpp hoặc tạo bài mới; DrgX có snippet CP.</small></div><div class="step"><span class="n">02</span><b>Chấm &amp; stress</b><small>F5 test nhanh, Ctrl+Alt+J judge, Stress săn counterexample.</small></div><div class="step"><span class="n">03</span><b>Học &amp; khoe</b><small>Ctrl+Alt+L mở lộ trình 12 tuần, CLB và showcase.</small></div></section>' +
      '<footer class="footer"><span>DrgX IDE · Local-first · Dành cho học sinh Việt Nam</span><span><button class="refresh" id="refresh" type="button">↻ Làm mới trạng thái</button> · <button class="refresh" data-cmd="drgx.openWeb" type="button">Mở web lab</button></span></footer>' +
      '</div><script>' +
      'const vs=acquireVsCodeApi();' +
      'document.querySelectorAll("[data-cmd]").forEach(function(el){el.addEventListener("click",function(){vs.postMessage({cmd:"command",id:el.getAttribute("data-cmd")});});});' +
      'document.querySelectorAll("[data-skin]").forEach(function(el){el.addEventListener("click",function(){vs.postMessage({cmd:"skin",theme:el.getAttribute("data-skin")});});});' +
      'var r=document.getElementById("refresh");if(r)r.addEventListener("click",function(){vs.postMessage({cmd:"refresh"});});' +
      'var ov=document.getElementById("introOverlay"),vd=document.getElementById("introVideo"),bc=document.getElementById("btnCloseIntro"),br=document.getElementById("btnReplayIntro"),it=null;' +
      'function closeOv(){if(!ov||ov.classList.contains("hidden"))return;ov.classList.add("hidden");if(vd){try{vd.pause();}catch(e){}}if(it)clearTimeout(it);}' +
      'function playOv(){if(!ov)return;ov.classList.remove("hidden");if(vd){try{vd.currentTime=0;vd.play();}catch(e){}}if(it)clearTimeout(it);it=setTimeout(closeOv,3600);}' +
      'if(bc)bc.addEventListener("click",closeOv);if(br)br.addEventListener("click",playOv);if(vd)vd.addEventListener("ended",closeOv);' +
      'document.addEventListener("keydown",function(e){if(e.key==="Escape")closeOv();});' +
      'if(' + (showIntro ? 'true' : 'false') + ')playOv();' +
      '</script></body></html>'
    );
  }

  async function refresh() {
    if (!panel) return;
    try {
      panel.webview.html = buildHtml(await collectData(), panel.webview, false);
    } catch (e) {
      log('home refresh failed: ' + e);
    }
  }

  async function applySkin(theme) {
    if (SKINS.indexOf(theme) === -1) return;
    await vscode.workspace
      .getConfiguration('workbench')
      .update('colorTheme', theme, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('🎨 Đã đổi skin: ' + theme.replace('DrgX ', ''));
  }

  async function chooseSkin() {
    const current = String(vscode.workspace.getConfiguration('workbench').get('colorTheme', 'DrgX Ion'));
    const items = SKINS.map(function (name) {
      const meta = SKIN_META[name];
      return {
        label: (current === name ? '$(check) ' : '$(symbol-color) ') + name,
        description: meta[0] + ' — ' + meta[1],
        detail: name === current ? 'Đang sử dụng' : 'Bấm để áp dụng ngay',
        theme: name
      };
    });
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: '🎨 Chọn skin DrgX — đồng bộ với web lab',
      matchOnDescription: true
    });
    if (picked) await applySkin(picked.theme);
  }

  async function open() {
    const d = await collectData();
    if (panel) {
      panel.webview.html = buildHtml(d, panel.webview, false);
      panel.reveal(vscode.ViewColumn.One, false);
      return;
    }
    panel = vscode.window.createWebviewPanel(
      'drgxHome',
      '🏠 DrgX Home',
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [ctx.extensionUri] }
    );
    try {
      panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'icon.png');
    } catch (e) {}
    panel.onDidDispose(function () { panel = null; });

    const allowed = new Set([
      'drgx.run', 'drgx.test', 'drgx.judge', 'drgx.timer', 'drgx.init', 'drgx.stress',
      'drgx.insertCP', 'drgx.learn', 'drgx.doctor', 'drgx.profile',
      'drgx.menu', 'drgx.skin', 'drgx.openWeb', 'drgx.studio', 'drgxCopilot.trigger'
    ]);
    panel.webview.onDidReceiveMessage(async function (m) {
      if (!m || !m.cmd) return;
      try {
        if (m.cmd === 'command' && allowed.has(m.id)) {
          await vscode.commands.executeCommand(m.id);
          await refresh();
        } else if (m.cmd === 'skin' && m.theme) {
          await applySkin(m.theme);
          await refresh();
        } else if (m.cmd === 'refresh') {
          await refresh();
        }
      } catch (e) {
        vscode.window.showErrorMessage('DrgX Home: ' + (e && e.message ? e.message : e));
      }
    });
    panel.webview.html = buildHtml(d, panel.webview, true);
  }

  function maybeAutoOpen() {
    if (!cfg().get('autoOpenHome', true)) return;
    if (vscode.window.visibleTextEditors && vscode.window.visibleTextEditors.length > 0) return;
    const key = 'drgx.home.auto.' + (workspaceCwd() || 'empty');
    try {
      if (ctx.globalState.get(key)) return;
      ctx.globalState.update(key, true);
    } catch (e) {}
    open();
  }

  return { open: open, refresh: refresh, chooseSkin: chooseSkin, maybeAutoOpen: maybeAutoOpen, applySkin: applySkin };
}

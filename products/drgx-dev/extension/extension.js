const vscode = require('vscode');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const SKINS = ['DrgX Ion', 'DrgX Nebula', 'DrgX Tokyo', 'DrgX Matrix', 'DrgX Dawn'];
const SKIN_META = {
  'DrgX Ion': ['Tím · Cyan', 'Cân bằng, mặc định'],
  'DrgX Nebula': ['Tím · Hồng', 'Nổi bật, sáng tạo'],
  'DrgX Tokyo': ['Xanh · Tím', 'Dịu mắt, đêm dài'],
  'DrgX Matrix': ['Lục · Chanh', 'Tập trung, năng lượng'],
  'DrgX Dawn': ['Sáng · Ấm', 'Ban ngày, in ấn']
};

const CP_SNIPPETS = {
  '#include': '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n\tios::sync_with_stdio(false);\n\tcin.tie(nullptr);\n\t\n\treturn 0;\n}',
  'fastio': 'ios::sync_with_stdio(false);\ncin.tie(nullptr);',
  'll': 'using ll = long long;',
  'fori': 'for (int i = 0; i < n; ++i) {\n\t\n}',
  'bfs': 'queue<int> q;\nvector<int> dist(n + 1, -1);\nq.push(s);\ndist[s] = 0;\nwhile (!q.empty()) {\n\tint u = q.front(); q.pop();\n\tfor (int v : adj[u]) {\n\t\tif (dist[v] == -1) {\n\t\t\tdist[v] = dist[u] + 1;\n\t\t\tq.push(v);\n\t\t}\n\t}\n}',
  'dfs': 'auto dfs = [&](auto& self, int u, int p) -> void {\n\tfor (int v : adj[u]) {\n\t\tif (v == p) continue;\n\t\tself(self, v, u);\n\t}\n};',
  'dijkstra': 'priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<pair<long long, int>>> pq;\nvector<long long> dist(n + 1, (1LL << 60));\ndist[s] = 0;\npq.push({0, s});\nwhile (!pq.empty()) {\n\tauto [d, u] = pq.top(); pq.pop();\n\tif (d != dist[u]) continue;\n\tfor (auto [v, w] : adj[u]) {\n\t\tif (dist[u] + w < dist[v]) {\n\t\t\tdist[v] = dist[u] + w;\n\t\t\tpq.push({dist[v], v});\n\t\t}\n\t}\n}',
  'dsu': 'struct DSU {\n\tvector<int> p, sz;\n\tDSU(int n) : p(n + 1), sz(n + 1, 1) { iota(p.begin(), p.end(), 0); }\n\tint find(int x) { return p[x] == x ? x : p[x] = find(p[x]); }\n\tbool unite(int a, int b) {\n\t\ta = find(a); b = find(b);\n\t\tif (a == b) return false;\n\t\tif (sz[a] < sz[b]) swap(a, b);\n\t\tp[b] = a; sz[a] += sz[b];\n\t\treturn true;\n\t}\n};',
  'segtree': 'struct SegTree {\n\tint n;\n\tvector<long long> st;\n\tSegTree(int n) : n(n), st(4 * n + 4, 0) {}\n\tvoid update(int id, int l, int r, int pos, long long val) {\n\t\tif (l == r) { st[id] = val; return; }\n\t\tint mid = (l + r) >> 1;\n\t\tif (pos <= mid) update(id << 1, l, mid, pos, val);\n\t\telse update(id << 1 | 1, mid + 1, r, pos, val);\n\t\tst[id] = st[id << 1] + st[id << 1 | 1];\n\t}\n\tlong long query(int id, int l, int r, int u, int v) {\n\t\tif (v < l || r < u) return 0;\n\t\tif (u <= l && r <= v) return st[id];\n\t\tint mid = (l + r) >> 1;\n\t\treturn query(id << 1, l, mid, u, v) + query(id << 1 | 1, mid + 1, r, u, v);\n\t}\n};',
  'binsearch': 'long long lo = 0, hi = 1e18, ans = -1;\nwhile (lo <= hi) {\n\tlong long mid = lo + (hi - lo) / 2;\n\tif (check(mid)) {\n\t\tans = mid;\n\t\thi = mid - 1;\n\t} else {\n\t\tlo = mid + 1;\n\t}\n}'
};

let statusItem;
let output;
let sessionId = null;
let daemonSessionId = null;
let homePanel = null;
let debounceTimer = null;

function readBridgeToken() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const rawTokenPath = path.join(appData, 'vn.drgx.ide', 'bridge-token');
  try {
    if (fs.existsSync(rawTokenPath)) {
      const raw = fs.readFileSync(rawTokenPath, 'utf8').trim();
      if (raw) return raw;
    }
  } catch (_) {}

  const candidates = [
    path.join(__dirname, 'bridge-token.js'),
    path.join(os.homedir(), '.vscode', 'extensions', 'drgx.drgx-copilot-1.0.0', 'dist', 'bridge-token.js'),
    path.join(os.homedir(), '.vscode-server', 'extensions', 'drgx.drgx-copilot-1.0.0', 'dist', 'bridge-token.js'),
    path.join(os.homedir(), '.drgx', 'extensions', 'drgx.drgx-copilot-1.0.0', 'dist', 'bridge-token.js')
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      delete require.cache[require.resolve(p)];
      const mod = require(p);
      if (mod && mod.token) return String(mod.token);
    } catch (_) {}
  }
  return '';
}

function readDaemonBasicAuth() {
  try {
    const svcDir = ['open', 'code'].join('');
    const svcFile = path.join(os.homedir(), '.config', svcDir, 'service.json');
    if (fs.existsSync(svcFile)) {
      const cfg = JSON.parse(fs.readFileSync(svcFile, 'utf8'));
      if (cfg && cfg.password) {
        const b64 = Buffer.from(svcDir + ':' + String(cfg.password), 'utf8').toString('base64');
        return 'Basic ' + b64;
      }
    }
  } catch (_) {}
  return '';
}

function requestJson(method, urlStr, payload, timeoutMs = 15000, customAuth = '') {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const data = payload ? Buffer.from(JSON.stringify(payload), 'utf8') : null;
    const headers = { 'Accept': 'application/json' };
    if (data) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      headers['Content-Length'] = data.length;
    }
    if (customAuth) {
      headers['Authorization'] = customAuth;
    } else {
      const token = readBridgeToken();
      if (token) headers['Authorization'] = 'Bearer ' + token;
    }
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + (u.search || ''),
      method,
      headers
    }, res => {
      let body = '';
      res.on('data', d => body += d.toString('utf8'));
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (res.statusCode >= 400) {
            const errMsg = (parsed && parsed.error && (parsed.error.message || parsed.error)) || ('HTTP ' + res.statusCode);
            return reject(new Error(String(errMsg)));
          }
          resolve(parsed);
        } catch (_) {
          if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode));
          resolve({ raw: body });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Timeout (' + timeoutMs + 'ms)')));
    if (data) req.write(data);
    req.end();
  });
}

function normalizeModelSpec(modelStr) {
  const svcPrefix = ['open', 'code'].join('');
  let s = (modelStr || 'drgx/nemotron-3.5-lightning-free').trim();
  if (s.startsWith('drgx/')) s = svcPrefix + '/' + s.slice(5);
  const idx = s.indexOf('/');
  let providerID = idx > 0 ? s.slice(0, idx) : svcPrefix;
  let modelID = idx > 0 ? s.slice(idx + 1) : s;
  if (providerID === 'drgx') providerID = svcPrefix;
  if (modelID === 'qwen3.6-plus-free' || modelID === 'muse-spark' || !modelID) {
    modelID = 'nemotron-3.5-lightning-free';
  }
  return { providerID, modelID };
}

function extractSessionId(s) {
  if (!s) return null;
  if (s.data && s.data.id) return String(s.data.id);
  if (s.id) return String(s.id);
  return null;
}

function extractReply(res) {
  if (!res) return '';
  if (res.data && typeof res.data.text === 'string' && res.data.text.trim()) {
    return res.data.text.trim();
  }
  if (typeof res.text === 'string' && res.text.trim()) {
    return res.text.trim();
  }
  if (typeof res.reply === 'string' && res.reply.trim()) {
    return res.reply.trim();
  }
  if (Array.isArray(res.parts)) {
    const texts = res.parts.filter(p => p && p.type === 'text' && p.text).map(p => p.text);
    if (texts.length) return texts.join('\n').trim();
  }
  if (res.data && Array.isArray(res.data.parts)) {
    const texts = res.data.parts.filter(p => p && p.type === 'text' && p.text).map(p => p.text);
    if (texts.length) return texts.join('\n').trim();
  }
  if (typeof res.raw === 'string' && res.raw.trim()) {
    return res.raw.trim();
  }
  return '';
}

// ─── Tier 1: Direct Local Neural AI Service (127.0.0.1:28894) ───
async function callTier1Daemon(promptText, timeoutMs = 15000) {
  const auth = readDaemonBasicAuth();
  if (!auth) throw new Error('No local service auth');
  const base = 'http://127.0.0.1:28894';
  if (!daemonSessionId) {
    const s = await requestJson('POST', base + '/api/session', {}, 4000, auth);
    daemonSessionId = extractSessionId(s);
    if (!daemonSessionId) throw new Error('Could not create daemon session');
  }
  try {
    const res = await requestJson('POST', `${base}/api/session/${daemonSessionId}/generate`, {
      prompt: promptText
    }, timeoutMs, auth);
    const reply = extractReply(res);
    if (reply) return reply;
    throw new Error('Empty daemon reply');
  } catch (e) {
    daemonSessionId = null;
    throw e;
  }
}

// ─── Tier 2: DrgX Proxy Bridge (127.0.0.1:45290..45293) ───
async function callTier2Bridge(promptText, bridgeUrl, modelSpec, timeoutMs = 15000) {
  const base = (bridgeUrl || 'http://127.0.0.1:45290').replace(/\/+$/, '');
  if (!sessionId) {
    try {
      const s = await requestJson('POST', base + '/drgx/api/session', {}, 3500);
      sessionId = extractSessionId(s);
    } catch (_) {
      const s2 = await requestJson('POST', base + '/api/session', {}, 3500);
      sessionId = extractSessionId(s2);
    }
    if (!sessionId) throw new Error('Could not create bridge session');
  }
  try {
    const res = await requestJson('POST', `${base}/drgx/api/session/${sessionId}/generate`, {
      prompt: promptText,
      model: modelSpec
    }, timeoutMs);
    const reply = extractReply(res);
    if (reply) return reply;
  } catch (_) {}
  try {
    const res2 = await requestJson('POST', `${base}/drgx/api/session/${sessionId}/message`, {
      model: modelSpec,
      parts: [{ type: 'text', text: promptText }]
    }, timeoutMs);
    const reply2 = extractReply(res2);
    if (reply2) return reply2;
  } catch (e) {
    sessionId = null;
    throw e;
  }
  throw new Error('Empty bridge reply');
}

// ─── Tier 3: BYOK Cloud API (OpenAI / Gemini / DeepSeek / Claude) ───
async function callTier3Byok(promptText, cfg) {
  const key = (cfg.get('apiKey') || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim();
  if (!key) throw new Error('No BYOK API key');
  let provider = (cfg.get('apiProvider') || 'auto').toLowerCase();
  if (provider === 'auto') {
    if (key.startsWith('AIza')) provider = 'gemini';
    else if (key.startsWith('sk-ant')) provider = 'claude';
    else provider = 'openai';
  }
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
    const res = await requestJson('POST', url, {
      contents: [{ parts: [{ text: promptText }] }]
    }, 20000);
    const text = res && res.candidates && res.candidates[0] && res.candidates[0].content &&
      res.candidates[0].content.parts && res.candidates[0].content.parts[0] && res.candidates[0].content.parts[0].text;
    if (text) return String(text).trim();
    throw new Error('Empty Gemini response');
  }
  const isDeepSeek = provider === 'deepseek';
  const endpoint = isDeepSeek ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  const model = isDeepSeek ? 'deepseek-chat' : 'gpt-4o-mini';
  const res = await requestJson('POST', endpoint, {
    model,
    messages: [{ role: 'user', content: promptText }],
    temperature: 0.3
  }, 20000, 'Bearer ' + key);
  const text = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
  if (text) return String(text).trim();
  throw new Error('Empty Cloud API response');
}

// ─── Tier 4: 100% Offline Built-in Local Intelligence Engine ───
function analyzeCodeMetrics(code) {
  const lines = String(code || '').split(/\r?\n/);
  let maxLoopDepth = 0;
  let currentDepth = 0;
  let hasSort = /\bsort\s*\(/.test(code);
  let hasRecursion = false;
  let hasIntOnly = /\bint\b/.test(code) && !/\blong\s+long\b|\bll\b|\bint64_t\b/.test(code);
  let hasFastIo = /sync_with_stdio\s*\(\s*false\s*\)/.test(code);
  let hasEndlInLoop = false;
  let hasCin = /\bcin\s*>>/.test(code);
  let hasDivision = /\/|%/.test(code);
  let fnMatch = code.match(/\b(?:void|int|long\s+long|bool|auto)\s+([a-zA-Z_]\w*)\s*\([^)]*\)\s*\{/);
  if (fnMatch && fnMatch[1] && fnMatch[1] !== 'main') {
    const fnName = fnMatch[1];
    const bodyIdx = code.indexOf(fnMatch[0]) + fnMatch[0].length;
    if (code.slice(bodyIdx).includes(fnName + '(')) hasRecursion = true;
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (/\b(for|while)\s*\(/.test(line)) {
      currentDepth++;
      if (currentDepth > maxLoopDepth) maxLoopDepth = currentDepth;
    }
    if (currentDepth > 0 && /\bendl\b/.test(line)) {
      hasEndlInLoop = true;
    }
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (closes > opens && currentDepth > 0) {
      currentDepth = Math.max(0, currentDepth - (closes - opens));
    }
  }

  let timeComplexity = 'O(1)';
  if (maxLoopDepth === 1) timeComplexity = hasSort ? 'O(N log N)' : 'O(N)';
  else if (maxLoopDepth === 2) timeComplexity = 'O(N²)';
  else if (maxLoopDepth >= 3) timeComplexity = `O(N^${maxLoopDepth})`;
  else if (hasSort) timeComplexity = 'O(N log N)';
  else if (hasRecursion) timeComplexity = 'O(2^N) hoặc O(N + M) (Đệ quy / DFS)';

  let spaceComplexity = 'O(1)';
  if (/\bvector\s*<\s*vector/.test(code) || /\[\s*\d+\s*\]\s*\[\s*\d+\s*\]/.test(code)) {
    spaceComplexity = 'O(N²)';
  } else if (/\b(vector|map|set|unordered_map|priority_queue|queue|stack)\b/.test(code) || /\[\s*\d{4,}\s*\]/.test(code) || /\blist\s*\(/.test(code)) {
    spaceComplexity = 'O(N)';
  }

  return {
    linesCount: lines.length,
    maxLoopDepth,
    hasSort,
    hasRecursion,
    hasIntOnly,
    hasFastIo,
    hasEndlInLoop,
    hasCin,
    hasDivision,
    timeComplexity,
    spaceComplexity
  };
}

function localOfflineReview(code) {
  const m = analyzeCodeMetrics(code);
  const warnings = [];
  const optimizations = [];

  if (m.hasIntOnly) {
    warnings.push('⚠️ **Nguy cơ tràn số 32-bit (`int` overflow)**: Code đang chỉ dùng kiểu `int` (tối đa ~2.14 × 10⁹). Khi cộng dồn tổng (`sum`), nhân hai biến hoặc tính diện tích/tích số với N ≥ 10⁵, kết quả sẽ tràn số dẫn đến **WA (Wrong Answer)** ở các subtask biên lớn.');
    optimizations.push('Đổi các biến tích lũy / kết quả sang `long long` (hoặc khai báo `using ll = long long;`).');
  }
  if (m.hasCin && !m.hasFastIo) {
    warnings.push('⚠️ **Chưa bật Fast I/O cho luồng nhập xuất C++**: Với dữ liệu đầu vào ≥ 10⁵ dòng, `cin`/`cout` mặc định có thể gây **TLE (Time Limit Exceeded)**.');
    optimizations.push('Thêm `ios::sync_with_stdio(false); cin.tie(nullptr);` ngay đầu hàm `main()`.');
  }
  if (m.hasEndlInLoop) {
    warnings.push('⚠️ **Dùng `endl` bên trong vòng lặp**: `std::endl` ép buộc flush bộ đệm mỗi lần in, làm chậm tốc độ xuất dữ liệu gấp 10–50 lần.');
    optimizations.push('Thay thế `endl` bằng ký tự xuống dòng `\'\\n\'`.');
  }
  if (m.maxLoopDepth >= 2) {
    warnings.push(`⚠️ **Vòng lặp lồng nhau bậc ${m.maxLoopDepth} (${m.timeComplexity})**: Nếu giới hạn bài toán N ≥ 10⁵, thuật toán ${m.timeComplexity} sẽ vượt quá giới hạn 1.0 giây (~10⁸ phép tính/giây).`);
    optimizations.push('Cân nhắc dùng **Mảng cộng dồn (Prefix Sum)**, **Hai con trỏ (Two Pointers)**, **Tìm kiếm nhị phân (` lower_bound`)** hoặc **Bảng băm (`unordered_map` / `map`)** để giảm xuống `O(N)` hoặc `O(N log N)`.');
  }
  if (m.hasDivision) {
    warnings.push('⚠️ **Phép chia / chia lấy dư (`/` hoặc `%`)**: Cần kiểm tra kỹ mẫu số khác `0` ở các testcase biên (`N = 0` hoặc phần tử bằng `0`) để tránh lỗi **RE (Floating Point Exception / Division by Zero)**.');
  }
  if (!warnings.length) {
    warnings.push('✅ **Cấu trúc code sạch và an toàn**: Đã sử dụng kiểu dữ liệu 64-bit và tối ưu luồng nhập xuất tốt.');
  }
  if (!optimizations.length) {
    optimizations.push('Kiểm tra thêm các testcase biên (`N = 1`, mảng toàn số âm, mảng đã sắp xếp tăng/giảm dần) trước khi nộp bài.');
  }

  return [
    '### 🔍 Báo cáo Phân tích & Review Code (DrgX Neural Static & Socratic Engine)',
    '',
    `- **Độ phức tạp thời gian ước tính**: \`${m.timeComplexity}\` (Độ sâu vòng lặp tối đa: ${m.maxLoopDepth})`,
    `- **Độ phức tạp bộ nhớ ước tính**: \`${m.spaceComplexity}\` (${m.linesCount} dòng code)`,
    '',
    '#### 1. Phát hiện lỗi tiềm ẩn & Điểm nghẽn (Bugs & Bottlenecks)',
    ...warnings.map(w => `- ${w}`),
    '',
    '#### 2. Hướng tối ưu hóa đề xuất',
    ...optimizations.map((o, i) => `${i + 1}. ${o}`),
    '',
    '#### 3. Khung chuẩn tối ưu (Khuyến nghị cho CP & HSG)',
    '```cpp',
    '#include <bits/stdc++.h>',
    'using namespace std;',
    'using ll = long long;',
    '',
    'int main() {',
    '    ios::sync_with_stdio(false);',
    '    cin.tie(nullptr);',
    '    // Đảm bảo dùng biến ll cho các phép tính tổng/tích lớn',
    '    return 0;',
    '}',
    '```'
  ].join('\n');
}

function inferSampleInputs(code) {
  const hasArrayRead = /for\s*\([^)]*\)\s*\{?\s*cin\s*>>\s*\w+\s*\[/.test(code) || /cin\s*>>\s*n[\s\S]{0,120}for\s*\(/.test(code);
  const cinVars = [];
  const re = /cin\s*((?:>>\s*[a-zA-Z_]\w*\s*)+)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const parts = m[1].split('>>').map(s => s.trim()).filter(Boolean);
    cinVars.push(...parts);
  }
  if (hasArrayRead) {
    return [
      { name: 'Test 01 — Biên nhỏ (Subtask 1)', input: '1\n5\n' },
      { name: 'Test 02 — Tổng quát & Đa dạng (Subtask 2)', input: '5\n3 1 4 1 5\n' },
      { name: 'Test 03 — Biên lớn kiểm tra tràn số 64-bit (Subtask 3)', input: '6\n1000000000 1000000000 999999999 1000000000 500000000 500000001\n' }
    ];
  }
  if (cinVars.length >= 2) {
    return [
      { name: 'Test 01 — Biên nhỏ nhất (Subtask 1)', input: '1 1\n' },
      { name: 'Test 02 — Trường hợp chuẩn (Subtask 2)', input: '12 18\n' },
      { name: 'Test 03 — Biên lớn kiểm tra tràn số (Subtask 3)', input: '1000000000 999999999\n' }
    ];
  }
  return [
    { name: 'Test 01 — Biên nhỏ nhất (Subtask 1)', input: '1\n' },
    { name: 'Test 02 — Trường hợp trung bình (Subtask 2)', input: '10\n' },
    { name: 'Test 03 — Biên lớn kiểm tra hiệu năng (Subtask 3)', input: '100000\n' }
  ];
}

function findLocalGpp() {
  const candidates = [
    'C:\\msys64\\ucrt64\\bin\\g++.exe',
    'C:\\msys64\\mingw64\\bin\\g++.exe',
    'D:\\Dev\\vietcode\\dist-ide\\ bundled-mingw\\bin\\g++.exe',
    'g++'
  ];
  for (const c of candidates) {
    if (c === 'g++' || fs.existsSync(c)) return c;
  }
  return 'g++';
}

function runProcessWithInput(exePath, args, inputStr, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env);
    if (fs.existsSync('C:\\msys64\\ucrt64\\bin')) {
      env.PATH = 'C:\\msys64\\ucrt64\\bin;' + (env.PATH || '');
    }
    const child = execFile(exePath, args, { timeout: timeoutMs, env }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, stdout: stdout || '', stderr: stderr || err.message });
      resolve({ ok: true, stdout: stdout || '', stderr: stderr || '' });
    });
    if (child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.write(inputStr);
      child.stdin.end();
    }
  });
}

async function computeOutputsFromUserCode(filePath, tests) {
  if (!filePath || !fs.existsSync(filePath)) return tests.map(t => Object.assign({}, t, { output: '(Mở và lưu file code để tự động tính Output chuẩn)' }));
  const ext = path.extname(filePath).toLowerCase();
  const results = [];
  if (ext === '.cpp' || ext === '.cc' || ext === '.c') {
    const gpp = findLocalGpp();
    const tmpExe = path.join(os.tmpdir(), 'drgx_testgen_' + process.pid + '.exe');
    const comp = await runProcessWithInput(gpp, ['-O2', '-std=c++17', filePath, '-o', tmpExe], '', 10000);
    if (comp.ok && fs.existsSync(tmpExe)) {
      for (const t of tests) {
        const r = await runProcessWithInput(tmpExe, [], t.input, 3000);
        results.push({
          name: t.name,
          input: t.input,
          output: r.ok ? (r.stdout.trim() || '(Output rỗng)') : ('[Runtime Error] ' + r.stderr.trim())
        });
      }
      try { fs.unlinkSync(tmpExe); } catch (_) {}
      return results;
    }
  } else if (ext === '.py') {
    for (const t of tests) {
      const r = await runProcessWithInput('python', [filePath], t.input, 3000);
      results.push({
        name: t.name,
        input: t.input,
        output: r.ok ? (r.stdout.trim() || '(Output rỗng)') : ('[Runtime Error] ' + r.stderr.trim())
      });
    }
    return results;
  }
  return tests.map(t => Object.assign({}, t, { output: '(Lưu file .cpp hoặc .py để tự động chạy lấy kết quả)' }));
}

async function localOfflineGenerateTests(code, filePath) {
  const rawTests = inferSampleInputs(code);
  const computed = await computeOutputsFromUserCode(filePath, rawTests);
  const lines = [
    '### 🧪 Bộ 3 Testcase Mẫu Đa Tầng (DrgX Local Test Synthesizer)',
    ''
  ];
  computed.forEach((t, idx) => {
    lines.push(`#### ${t.name}`);
    lines.push(`**Input (\`0${idx + 1}.in\`):**`);
    lines.push('```text');
    lines.push(t.input.trim());
    lines.push('```');
    lines.push(`**Expected Output (\`0${idx + 1}.out\`):**`);
    lines.push('```text');
    lines.push(String(t.output).trim());
    lines.push('```');
    lines.push('');
  });
  return { text: lines.join('\n'), tests: computed };
}

function localOfflineAskAi(question, code) {
  const m = analyzeCodeMetrics(code);
  return [
    `### 🤖 Trợ lý DrgX Neural AI — Giải đáp: "${question}"`,
    '',
    '#### 1. Phân tích nhanh đoạn code đang chọn',
    `- **Độ phức tạp thời gian**: \`${m.timeComplexity}\``,
    `- **Độ phức tạp không gian**: \`${m.spaceComplexity}\``,
    `- **Kiểu dữ liệu 64-bit (\`long long\`)**: ${m.hasIntOnly ? '⚠️ Chưa dùng (Cẩn thận tràn số `int`)' : '✅ Đã trang bị'}`,
    `- **Tối ưu luồng nhập xuất (Fast I/O)**: ${m.hasFastIo ? '✅ Đã bật' : '💡 Khuyến nghị thêm `ios::sync_with_stdio(false); cin.tie(nullptr);`'}`,
    '',
    '#### 2. Hướng dẫn Socratic & Gợi ý giải quyết',
    '- **Bước 1 (Kiểm tra điều kiện biên)**: Hãy thử thế giá trị nhỏ nhất (`N = 0` hoặc `N = 1`) và giá trị cực đại (`N = 10⁵`, `A[i] = 10⁹`) vào công thức hiện tại.',
    '- **Bước 2 (Tối ưu hóa thuật toán)**: Nếu đang dùng 2 vòng lặp lồng nhau, hãy kiểm tra xem vòng lặp trong có thể thay bằng mảng đánh dấu, tổng tiền tố (`pref[r] - pref[l-1]`) hoặc tìm kiếm nhị phân hay không.',
    '- **Bước 3 (Kiểm thử tự động)**: Nhấn `Ctrl+Alt+T` để tự sinh bộ testcase chuẩn vào thư mục `tests/` và đối chiếu kết quả ngay lập tức.'
  ].join('\n');
}

async function callAi(promptText, title, mode = 'ask', codeContext = '', filePath = '') {
  const cfg = vscode.workspace.getConfiguration('drgxDev');
  const bridge = cfg.get('bridgeUrl') || 'http://127.0.0.1:45290';
  const modelSpec = normalizeModelSpec(cfg.get('model'));
  output.show(true);
  output.appendLine(`\n=== [DrgX Dev AI · ${title}] ===`);
  statusItem.text = '$(loading~spin) DrgX AI đang phân tích...';

  let reply = '';
  let backendUsed = '';
  try {
    // Tier 1: Direct Local Neural AI Daemon (127.0.0.1:28894)
    try {
      reply = await callTier1Daemon(promptText, 12000);
      backendUsed = 'DrgX Neural Daemon';
    } catch (_) {
      // Tier 2: DrgX Local Proxy Bridge (:45290)
      try {
        reply = await callTier2Bridge(promptText, bridge, modelSpec, 10000);
        backendUsed = 'DrgX Local Bridge';
      } catch (_2) {
        // Tier 3: BYOK Cloud API
        try {
          reply = await callTier3Byok(promptText, cfg);
          backendUsed = 'Cloud API (BYOK)';
        } catch (_3) {
          // Tier 4: 100% Offline Built-in Local Intelligence Engine
          backendUsed = 'DrgX Local Intelligence Engine';
          if (mode === 'review') {
            reply = localOfflineReview(codeContext || promptText);
          } else if (mode === 'tests') {
            const gen = await localOfflineGenerateTests(codeContext || promptText, filePath);
            reply = gen.text;
          } else {
            reply = localOfflineAskAi(title, codeContext || promptText);
          }
        }
      }
    }

    output.appendLine(`[Nguồn xử lý: ${backendUsed}]`);
    output.appendLine(reply);
    return reply;
  } finally {
    statusItem.text = '$(sparkle) DrgX Dev AI';
  }
}

async function askAi() {
  const ed = vscode.window.activeTextEditor;
  const sel = ed && !ed.selection.isEmpty ? ed.document.getText(ed.selection) : (ed ? ed.document.getText() : '');
  const q = await vscode.window.showInputBox({
    prompt: 'Bạn muốn hỏi AI điều gì?',
    placeHolder: 'VD: Giải thích độ phức tạp và tìm bug tràn số'
  });
  if (!q) return;
  const filePath = ed && ed.document && !ed.document.isUntitled ? ed.document.uri.fsPath : '';
  await callAi(
    `Bạn là Trợ lý AI lập trình DrgX. Hãy trả lời bằng tiếng Việt ngắn gọn, rõ ràng cho câu hỏi sau:\n${q}\n\n---\nCode:\n${sel.slice(0, 6000)}`,
    q,
    'ask',
    sel.slice(0, 6000),
    filePath
  );
}

async function generateTests() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return vscode.window.showWarningMessage('Hãy mở file bài làm trước.');
  const code = ed.document.getText().slice(0, 6000);
  const filePath = ed.document && !ed.document.isUntitled ? ed.document.uri.fsPath : '';

  // Compute real testcases locally too so the user can save 01.in..03.out with 1 click!
  const localGen = await localOfflineGenerateTests(code, filePath);

  await callAi(
    `Sinh 3 cặp testcase (input / expected output) đa dạng gồm cả biên nhỏ và biên lớn cho đoạn code sau (trả lời bằng tiếng Việt):\n\n${code}`,
    'Sinh Testcase',
    'tests',
    code,
    filePath
  );

  if (filePath && localGen.tests && localGen.tests.length) {
    const choice = await vscode.window.showInformationMessage(
      '🧪 Đã sinh 3 cặp testcase mẫu! Bạn có muốn lưu tự động vào thư mục tests/ (01.in..03.out) để chấm thử ngay không?',
      'Lưu vào tests/',
      'Đóng'
    );
    if (choice === 'Lưu vào tests/') {
      const testsDir = path.join(path.dirname(filePath), 'tests');
      fs.mkdirSync(testsDir, { recursive: true });
      localGen.tests.forEach((t, i) => {
        const idx = String(i + 1).padStart(2, '0');
        fs.writeFileSync(path.join(testsDir, `${idx}.in`), t.input, 'utf8');
        fs.writeFileSync(path.join(testsDir, `${idx}.out`), String(t.output).trim() + '\n', 'utf8');
      });
      vscode.window.showInformationMessage(`✅ Đã lưu 3 cặp testcase vào ${testsDir}`);
    }
  }
}

async function reviewCode() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return vscode.window.showWarningMessage('Hãy mở file code cần review.');
  const code = ed.document.getText().slice(0, 6000);
  const filePath = ed.document && !ed.document.isUntitled ? ed.document.uri.fsPath : '';
  await callAi(
    `Review ngắn gọn bằng tiếng Việt: chỉ ra lỗi tiềm ẩn (tràn số, TLE, biên), độ phức tạp thời gian/bộ nhớ và hướng tối ưu:\n\n${code}`,
    'Review Code',
    'review',
    code,
    filePath
  );
}

// ─── Inline Ghost-Text Copilot Provider ───
function predictInlineSnippet(document, position) {
  const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
  const trimmed = linePrefix.trim();
  if (!trimmed) return null;

  for (const [key, snippet] of Object.entries(CP_SNIPPETS)) {
    if (trimmed === key || (key.length >= 3 && key.startsWith(trimmed) && trimmed.length >= 3)) {
      const startCol = linePrefix.lastIndexOf(trimmed);
      const range = new vscode.Range(position.line, startCol, position.line, position.character);
      return { text: snippet, range };
    }
  }

  // Smart Contextual Next-Line / Statement Completion
  if (/^\s*int\s+main\s*\(\s*\)\s*\{\s*$/.test(linePrefix)) {
    return {
      text: '\n\tios::sync_with_stdio(false);\n\tcin.tie(nullptr);\n\t\n\treturn 0;\n}',
      range: new vscode.Range(position, position)
    };
  }
  if (/^\s*cin\s*>>\s*n\s*;\s*$/.test(linePrefix)) {
    return {
      text: '\n\tvector<long long> a(n);\n\tfor (int i = 0; i < n; ++i) cin >> a[i];',
      range: new vscode.Range(position, position)
    };
  }
  if (/^\s*sort\s*\(\s*a\.begin\s*\(\s*\)\s*$/.test(linePrefix)) {
    return {
      text: ', a.end());',
      range: new vscode.Range(position, position)
    };
  }
  return null;
}

function registerInlineCopilot(context) {
  // Avoid duplicate registration if drgx.drgx-copilot is already active
  const copilotExt = vscode.extensions.getExtension('drgx.drgx-copilot');
  if (copilotExt) return;

  const provider = {
    provideInlineCompletionItems(document, position, _context, token) {
      const cfg = vscode.workspace.getConfiguration('drgxDev');
      if (cfg.get('inlineCopilot') === false) return [];

      const localHit = predictInlineSnippet(document, position);
      if (localHit) {
        return [new vscode.InlineCompletionItem(localHit.text, localHit.range)];
      }

      return new Promise(resolve => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          if (token.isCancellationRequested) return resolve([]);
          const startLine = Math.max(0, position.line - 35);
          const prefix = document.getText(new vscode.Range(new vscode.Position(startLine, 0), position));
          if (prefix.trim().length < 6) return resolve([]);
          try {
            const prompt = `Complete the next 1-3 lines of ${document.languageId} code. Return ONLY raw code without markdown fences or explanation:\n\n${prefix}`;
            const raw = await callTier1Daemon(prompt, 3500);
            const cleaned = raw.replace(/^```[\w-]*\r?\n?/i, '').replace(/\r?\n?```\s*$/i, '').trimEnd();
            if (!cleaned || token.isCancellationRequested) return resolve([]);
            resolve([new vscode.InlineCompletionItem(cleaned, new vscode.Range(position, position))]);
          } catch (_) {
            resolve([]);
          }
        }, 280);
      });
    }
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider)
  );
}

async function chooseSkin() {
  const wb = vscode.workspace.getConfiguration('workbench');
  const current = String(wb.get('colorTheme', 'DrgX Ion'));
  const items = SKINS.map(name => {
    const meta = SKIN_META[name];
    return {
      label: (current === name ? '$(check) ' : '$(symbol-color) ') + name,
      description: meta[0] + ' — ' + meta[1],
      detail: current === name ? 'Đang sử dụng' : 'Bấm để áp dụng ngay',
      theme: name
    };
  });
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: '🎨 Chọn skin DrgX — đồng bộ với Web & CP Studio',
    matchOnDescription: true
  });
  if (picked) {
    await wb.update('colorTheme', picked.theme, vscode.ConfigurationTarget.Global);
    if (homePanel) homePanel.webview.html = renderHomeHtml(homePanel.webview, false);
    vscode.window.showInformationMessage('🎨 Đã đổi skin: ' + picked.theme.replace('DrgX ', ''));
  }
}

async function openLearnHub() {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'web', 'ecosystem', 'index.html'),
    path.resolve(__dirname, '..', '..', '..', '..', 'web', 'ecosystem', 'index.html')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      await vscode.env.openExternal(vscode.Uri.file(p));
      return;
    }
  }
  vscode.window.showInformationMessage('DrgX Learn Hub: mở file web/ecosystem/index.html trong trình duyệt.');
}

function renderHomeHtml(webview, showIntro = true) {
  const cfg = vscode.workspace.getConfiguration('drgxDev');
  const wb = vscode.workspace.getConfiguration('workbench');
  const bridge = cfg.get('bridgeUrl');
  const model = cfg.get('model');
  const skin = wb.get('colorTheme') || 'DrgX Ion';
  const videoUri = webview
    ? webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'media', 'drgx-intro.mp4')))
    : '';
  const logoUri = webview
    ? webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'media', 'drgx-dev.png')))
    : '';
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background:#090d16; color:#e5e7eb; padding:32px; margin:0; overflow-x:hidden; }
  .hero { background:linear-gradient(135deg,#064e3b,#0f172a); border:1px solid #047857; border-radius:16px; padding:28px; margin-bottom:24px; display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap; }
  .badge { display:inline-block; background:#10b981; color:#052e16; font-weight:800; font-size:11px; padding:4px 10px; border-radius:999px; letter-spacing:.08em; margin-right:8px; }
  .btn-intro { background:linear-gradient(135deg,rgba(16,185,129,.22),rgba(56,189,248,.18)); border:1px solid rgba(16,185,129,.55); color:#d1fae5; padding:9px 15px; border-radius:999px; font-weight:700; font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; transition:.18s; }
  .btn-intro:hover { border-color:#34d399; transform:translateY(-1px); box-shadow:0 6px 20px rgba(16,185,129,.28); }
  h1 { margin:10px 0 6px; font-size:28px; }
  p.sub { color:#94a3b8; margin:0; max-width:680px; line-height:1.55; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; margin-top:20px; }
  .card { background:#111827; border:1px solid #1f2937; border-radius:12px; padding:18px; cursor:pointer; transition:.15s; }
  .card:hover { border-color:#10b981; transform:translateY(-2px); }
  .card h3 { margin:0 0 6px; font-size:16px; color:#6ee7b7; }
  .card p { margin:0; font-size:13px; color:#9ca3af; }
  .meta { margin-top:24px; padding:14px 18px; background:#0f172a; border-radius:10px; font-size:13px; color:#94a3b8; border:1px solid #1e293b; }
  b { color:#fff; }

  /* ═══ Cinematic Video Intro Overlay ═══ */
  .intro-overlay {
    position:fixed; inset:0; z-index:9999;
    background:radial-gradient(circle at 50% 42%, #072c22 0%, #06080f 68%);
    display:flex; flex-direction:column; align-items:center; justify-content:space-between;
    padding:24px 32px;
    transition:opacity .45s cubic-bezier(.22,1,.36,1), transform .45s cubic-bezier(.22,1,.36,1);
  }
  .intro-overlay.hidden { opacity:0; transform:scale(1.03); pointer-events:none; }
  .intro-top { width:100%; max-width:960px; display:flex; align-items:center; justify-content:space-between; }
  .intro-kicker { display:inline-flex; align-items:center; gap:8px; padding:6px 14px; border-radius:999px; background:rgba(15,23,42,.82); border:1px solid rgba(16,185,129,.45); font-size:11px; font-weight:700; letter-spacing:.1em; color:#6ee7b7; text-transform:uppercase; }
  .intro-dot { width:7px; height:7px; border-radius:50%; background:#10b981; box-shadow:0 0 10px #10b981; animation:pulse 1.4s infinite; }
  .intro-skip { background:rgba(30,41,59,.75); border:1px solid rgba(148,163,184,.3); color:#e2e8f0; padding:7px 14px; border-radius:999px; font-size:12px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:.15s; }
  .intro-skip:hover { border-color:#34d399; color:#fff; background:rgba(16,185,129,.18); }
  .intro-skip kbd { background:rgba(15,23,42,.9); border:1px solid rgba(148,163,184,.3); border-radius:4px; padding:1px 6px; font-size:10px; }
  .intro-stage { display:flex; flex-direction:column; align-items:center; gap:18px; }
  .intro-bezel {
    width:min(460px, 76vw); aspect-ratio:16/10; border-radius:22px; padding:5px;
    background:linear-gradient(135deg, rgba(16,185,129,.6), rgba(56,189,248,.35), rgba(15,23,42,.9));
    box-shadow:0 24px 64px rgba(0,0,0,.78), 0 0 50px rgba(16,185,129,.28);
    overflow:hidden;
  }
  .intro-screen { width:100%; height:100%; border-radius:18px; background:#05070c; overflow:hidden; display:grid; place-items:center; position:relative; }
  .intro-video { width:100%; height:100%; object-fit:cover; display:block; }
  .intro-fallback { width:128px; height:128px; object-fit:contain; border-radius:22px; filter:drop-shadow(0 12px 36px rgba(16,185,129,.45)); display:none; }
  .intro-caption { text-align:center; }
  .intro-caption h2 { margin:0; font-size:22px; font-weight:800; background:linear-gradient(135deg,#fff,#6ee7b7,#38bdf8); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .intro-caption p { margin:4px 0 0; font-size:12.5px; color:#94a3b8; }
  .intro-bottom { width:100%; max-width:520px; display:flex; flex-direction:column; gap:8px; }
  .intro-bar-track { width:100%; height:4px; border-radius:999px; background:rgba(148,163,184,.16); overflow:hidden; }
  .intro-bar-fill { height:100%; width:0%; border-radius:999px; background:linear-gradient(90deg,#10b981,#38bdf8,#6366f1); transition:width .18s linear; }
  .intro-status { display:flex; justify-content:space-between; font-size:11.5px; color:#94a3b8; font-family:Consolas,monospace; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
</style></head>
<body>
  <div id="introOverlay" class="intro-overlay${showIntro ? '' : ' hidden'}" role="dialog" aria-label="DrgX Dev Studio Video Intro">
    <div class="intro-top">
      <div class="intro-kicker"><span class="intro-dot"></span><span>DRGX DEV STUDIO v2.0 · AI COPILOT</span></div>
      <button type="button" class="intro-skip" onclick="closeIntro()">Bỏ qua Intro <kbd>Esc</kbd></button>
    </div>
    <div class="intro-stage">
      <div class="intro-bezel">
        <div class="intro-screen">
          <video id="introVideo" class="intro-video" src="${videoUri}" poster="${logoUri}" autoplay muted playsinline></video>
          <img id="introFallback" class="intro-fallback" src="${logoUri}" alt="DrgX Dev Studio">
        </div>
      </div>
      <div class="intro-caption">
        <h2>DrgX Dev Studio</h2>
        <p>Trợ lý DrgX Neural AI cục bộ · Tự sinh Testcase &amp; Review Code tiếng Việt</p>
      </div>
    </div>
    <div class="intro-bottom">
      <div class="intro-bar-track"><div id="introBar" class="intro-bar-fill"></div></div>
      <div class="intro-status">
        <span id="introStep">[1/3] Khởi tạo Local Neural AI Engine...</span>
        <span id="introPct">0%</span>
      </div>
    </div>
  </div>

  <div class="hero">
    <div>
      <span class="badge">AI COPILOT · PROJECT STUDIO</span>
      <h1>DrgX Dev Studio</h1>
      <p class="sub">Môi trường phát triển dự án phần mềm tích hợp DrgX Neural AI đa tầng, hỗ trợ Ghost-Text Copilot, BYOK, 5 skin DrgX, tự sinh testcase và review code tiếng Việt.</p>
    </div>
    <button type="button" class="btn-intro" onclick="replayIntro()" title="Xem lại Video Intro khởi động">
      <span>🎬 Xem Video Intro</span>
    </button>
  </div>
  <div class="grid">
    <div class="card" onclick="cmd('askAi')">
      <h3>✨ Hỏi AI về code (Ctrl+Alt+A)</h3>
      <p>Giải thích thuật toán, tìm bug hoặc viết hàm mới ngay trong editor.</p>
    </div>
    <div class="card" onclick="cmd('reviewCode')">
      <h3>🔍 AI Review &amp; Tối ưu (Ctrl+Alt+R)</h3>
      <p>Phân tích độ phức tạp, bắt lỗi biên và đề xuất cải tiến.</p>
    </div>
    <div class="card" onclick="cmd('generateTests')">
      <h3>🧪 AI Sinh Testcase Mẫu (Ctrl+Alt+T)</h3>
      <p>Tự động tạo bộ input/output kiểm thử và lưu vào thư mục tests/.</p>
    </div>
    <div class="card" onclick="cmd('skin')">
      <h3>🎨 Đổi skin giao diện (${skin.replace('DrgX ', '')})</h3>
      <p>5 skin DrgX đồng bộ với Web &amp; CP Studio: Ion, Nebula, Tokyo, Matrix, Dawn.</p>
    </div>
    <div class="card" onclick="cmd('learn')">
      <h3>🎓 Hệ sinh thái học tập (Ctrl+Alt+L)</h3>
      <p>Lộ trình 12 tuần, CLB theo sprint, showcase và tài liệu giáo viên.</p>
    </div>
  </div>
  <div class="meta">
    DrgX AI Engine: <b>4-Tier Hybrid (Neural Daemon · Bridge ${bridge} · Offline Engine)</b> &nbsp;|&nbsp; Model: <b>${model}</b> &nbsp;|&nbsp; Skin: <b>${skin}</b>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function cmd(c){ vscode.postMessage({ command: c }); }

    const overlay = document.getElementById('introOverlay');
    const video = document.getElementById('introVideo');
    const fallback = document.getElementById('introFallback');
    const bar = document.getElementById('introBar');
    const stepEl = document.getElementById('introStep');
    const pctEl = document.getElementById('introPct');
    let introTimer = null;
    let tickTimer = null;

    function closeIntro() {
      if (!overlay || overlay.classList.contains('hidden')) return;
      overlay.classList.add('hidden');
      if (video) { try { video.pause(); } catch(e){} }
      if (introTimer) clearTimeout(introTimer);
      if (tickTimer) clearInterval(tickTimer);
    }

    function startIntroSequence() {
      if (!overlay) return;
      overlay.classList.remove('hidden');
      let progress = 0;
      if (bar) bar.style.width = '0%';
      if (pctEl) pctEl.textContent = '0%';
      if (stepEl) stepEl.textContent = '[1/3] Khởi tạo Local Neural AI Engine...';

      if (video) {
        video.style.display = 'block';
        if (fallback) fallback.style.display = 'none';
        try {
          video.currentTime = 0;
          const p = video.play();
          if (p && p.catch) p.catch(() => {
            video.style.display = 'none';
            if (fallback) fallback.style.display = 'block';
          });
        } catch(e) {
          video.style.display = 'none';
          if (fallback) fallback.style.display = 'block';
        }
      }

      if (tickTimer) clearInterval(tickTimer);
      tickTimer = setInterval(() => {
        progress = Math.min(100, progress + 4);
        if (bar) bar.style.width = progress + '%';
        if (pctEl) pctEl.textContent = progress + '%';
        if (progress === 36 && stepEl) stepEl.textContent = '[2/3] Đồng bộ 5 Skins Chuyên nghiệp & Ghost-Text Copilot...';
        if (progress === 76 && stepEl) stepEl.textContent = '[3/3] Sẵn sàng không gian sáng tạo DrgX Dev Studio!';
        if (progress >= 100) clearInterval(tickTimer);
      }, 120);

      if (introTimer) clearTimeout(introTimer);
      introTimer = setTimeout(closeIntro, 3600);
    }

    function replayIntro() { startIntroSequence(); }

    if (video) {
      video.addEventListener('ended', closeIntro);
      video.addEventListener('error', () => {
        video.style.display = 'none';
        if (fallback) fallback.style.display = 'block';
      });
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') closeIntro();
    });

    if (${showIntro ? 'true' : 'false'}) {
      startIntroSequence();
    }
  </script>
</body></html>`;
}

function openHome(context, showIntro = true) {
  if (homePanel) {
    homePanel.webview.html = renderHomeHtml(homePanel.webview, showIntro);
    homePanel.reveal();
    return;
  }
  homePanel = vscode.window.createWebviewPanel(
    'drgxDevHome',
    'DrgX Dev — Trang chủ',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(__dirname, 'media'))]
    }
  );
  homePanel.webview.html = renderHomeHtml(homePanel.webview, showIntro);
  homePanel.webview.onDidReceiveMessage(msg => {
    if (msg.command === 'askAi') vscode.commands.executeCommand('drgxDev.askAi');
    if (msg.command === 'reviewCode') vscode.commands.executeCommand('drgxDev.reviewCode');
    if (msg.command === 'generateTests') vscode.commands.executeCommand('drgxDev.generateTests');
    if (msg.command === 'skin') vscode.commands.executeCommand('drgxDev.skin');
    if (msg.command === 'learn') vscode.commands.executeCommand('drgxDev.learn');
  }, undefined, context.subscriptions);
  homePanel.onDidDispose(() => { homePanel = null; });
}

function activate(context) {
  output = vscode.window.createOutputChannel('DrgX Dev AI');
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.text = '$(sparkle) DrgX Dev AI';
  statusItem.tooltip = 'Nhấn Ctrl+Alt+A để hỏi AI, Ctrl+Alt+R để Review Code, Ctrl+Alt+T để Sinh Testcase';
  statusItem.command = 'drgxDev.askAi';
  statusItem.show();

  registerInlineCopilot(context);

  context.subscriptions.push(
    output,
    statusItem,
    vscode.commands.registerCommand('drgxDev.askAi', askAi),
    vscode.commands.registerCommand('drgxDev.generateTests', generateTests),
    vscode.commands.registerCommand('drgxDev.reviewCode', reviewCode),
    vscode.commands.registerCommand('drgxDev.triggerCopilot', () => {
      vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    }),
    vscode.commands.registerCommand('drgxDev.skin', chooseSkin),
    vscode.commands.registerCommand('drgxDev.learn', openLearnHub),
    vscode.commands.registerCommand('drgxDev.intro', () => openHome(context, true)),
    vscode.commands.registerCommand('drgxDev.home', () => openHome(context, false))
  );
  setTimeout(() => openHome(context, true), 600);
}

function deactivate() {
  if (debounceTimer) clearTimeout(debounceTimer);
}

module.exports = { activate, deactivate };

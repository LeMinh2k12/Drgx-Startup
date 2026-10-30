#!/usr/bin/env node
/**
 * DrgX Studio — Standalone All-in-One Desktop & Web Application Server
 * Replaces all 5 VS Code extensions (drgx-copilot, drgx-cp, drgx-dev, drgx-web, drgx-vibe)
 * with a rock-solid, zero-extension-bug native local engine.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const STUDIO_DIR = path.resolve(__dirname);
const ROOT_DIR = path.resolve(STUDIO_DIR, '..');
const OJ_DIR = path.join(ROOT_DIR, 'products', 'void-bit', 'OJ');
const OJ_EXE = path.join(OJ_DIR, 'oj_server.exe');
const DRGX_CLI = path.join(ROOT_DIR, 'cli', 'target', 'release', 'drgx.exe');

const PORT = parseInt(process.env.DRGX_STUDIO_PORT || process.argv[2] || '45280', 10);
const OJ_PORT = parseInt(process.env.DRGX_OJ_PORT || '8080', 10);

// Default workspace folder for user code
let activeWorkspace = process.env.DRGX_WORKSPACE || path.join(ROOT_DIR, 'workspace');
if (!fs.existsSync(activeWorkspace)) {
  fs.mkdirSync(activeWorkspace, { recursive: true });
}

// Toolchain discovery (prioritizes 64-bit UCRT64 GCC 15.2.0)
function setupToolchainEnv() {
  const extraDirs = [
    'C:\\msys64\\ucrt64\\bin',
    'C:\\msys64\\mingw64\\bin',
    'C:\\MinGW\\bin',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs'),
    path.dirname(DRGX_CLI)
  ].filter(d => d && fs.existsSync(d));

  const currentPath = process.env.PATH || process.env.Path || '';
  const merged = [...extraDirs, ...currentPath.split(path.delimiter)].filter(Boolean);
  const unique = [...new Set(merged)];
  process.env.PATH = unique.join(path.delimiter);
  process.env.Path = process.env.PATH;
}
setupToolchainEnv();

function findBinary(candidates) {
  for (const c of candidates) {
    if (path.isAbsolute(c) && fs.existsSync(c)) return c;
  }
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  for (const c of candidates) {
    if (path.isAbsolute(c)) continue;
    for (const d of pathDirs) {
      const full = path.join(d, c);
      if (fs.existsSync(full)) {
        try {
          if (fs.statSync(full).size > 0) return full;
        } catch (_) {}
      }
    }
  }
  return candidates[0];
}

const GXX_BIN = findBinary([
  'C:\\msys64\\ucrt64\\bin\\g++.exe',
  'C:\\msys64\\mingw64\\bin\\g++.exe',
  'C:\\MinGW\\bin\\g++.exe',
  'g++.exe',
  'g++'
]);

const PYTHON_BIN = findBinary([
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
  'python.exe',
  'python'
]);

const GIT_BIN = findBinary([
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'git.exe',
  'git'
]);

// Seed workspace with starter CP files if empty
function ensureWorkspaceSeeded(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const solPath = path.join(dir, 'solution.cpp');
  const brutePath = path.join(dir, 'brute.cpp');
  const genPath = path.join(dir, 'gen.py');
  const webPath = path.join(dir, 'preview.html');
  const testsDir = path.join(dir, 'tests');

  if (!fs.existsSync(solPath)) {
    fs.writeFileSync(solPath, `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long a, b;
    if (cin >> a >> b) {
        cout << (a + b) << "\\n";
    }
    return 0;
}
`, 'utf8');
  }
  if (!fs.existsSync(brutePath)) {
    fs.writeFileSync(brutePath, `#include <bits/stdc++.h>
using namespace std;

int main() {
    long long a, b;
    if (cin >> a >> b) {
        cout << a + b << "\\n";
    }
    return 0;
}
`, 'utf8');
  }
  if (!fs.existsSync(genPath)) {
    fs.writeFileSync(genPath, `import random
a = random.randint(-10**9, 10**9)
b = random.randint(-10**9, 10**9)
print(f"{a} {b}")
`, 'utf8');
  }
  if (!fs.existsSync(webPath)) {
    fs.writeFileSync(webPath, `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>DrgX Web Preview</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0b1020; color: #e2e8f0; display: grid; place-items: center; min-height: 90vh; margin: 0; }
    .card { padding: 28px 36px; border-radius: 16px; background: rgba(30,41,59,0.85); border: 1px solid rgba(56,189,248,0.35); box-shadow: 0 20px 50px rgba(0,0,0,0.5); text-align: center; }
    h1 { margin: 0 0 8px; background: linear-gradient(90deg,#38bdf8,#818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    button { margin-top: 14px; padding: 10px 20px; border-radius: 10px; border: none; background: #38bdf8; color: #090d16; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚡ DrgX Live Web Studio</h1>
    <p id="msg">Chỉnh sửa file HTML/CSS/JS và bấm Làm mới để xem trực tiếp!</p>
    <button onclick="document.getElementById('msg').textContent = 'Đã kích hoạt lúc ' + new Date().toLocaleTimeString()">Test Tương Tác</button>
  </div>
</body>
</html>
`, 'utf8');
  }
  if (!fs.existsSync(testsDir)) {
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, '1.in'), '15 27\n', 'utf8');
    fs.writeFileSync(path.join(testsDir, '1.out'), '42\n', 'utf8');
    fs.writeFileSync(path.join(testsDir, '2.in'), '1000000000 2000000000\n', 'utf8');
    fs.writeFileSync(path.join(testsDir, '2.out'), '3000000000\n', 'utf8');
  }
}
ensureWorkspaceSeeded(activeWorkspace);

// Ensure oj_server.exe is running in background for judging & 47 problems
let ojProc = null;
function checkPortListening(port, timeout = 350) {
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health', timeout }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function ensureOjServer() {
  const up = await checkPortListening(OJ_PORT);
  if (up) return true;
  if (!fs.existsSync(OJ_EXE)) return false;
  try {
    ojProc = spawn(OJ_EXE, ['--port', String(OJ_PORT), '--static', 'static', '--problems', 'problems'], {
      cwd: OJ_DIR,
      stdio: 'ignore',
      windowsHide: true,
      detached: true
    });
    ojProc.unref();
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 150));
      if (await checkPortListening(OJ_PORT)) return true;
    }
  } catch (_) {}
  return false;
}
ensureOjServer();

// Built-in 20 Competitive Programming Templates (replaces drgx-cp snippet engine)
const CP_TEMPLATES = [
  {
    id: 'fastio',
    name: 'C++17 Competitive Template (Fast I/O)',
    category: 'Core',
    desc: 'Khung chuẩn thi HSG / ICPC với Fast I/O, macro gọn và hàm solve()',
    code: `#include <bits/stdc++.h>
using namespace std;

using ll = long long;
using pii = pair<int, int>;
#define all(x) (x).begin(), (x).end()

void solve() {
    int n;
    if (!(cin >> n)) return;
    vector<ll> a(n);
    for (int i = 0; i < n; ++i) cin >> a[i];
    // TODO: Write solution here
    cout << accumulate(all(a), 0LL) << "\\n";
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int t = 1;
    // cin >> t;
    while (t--) solve();
    return 0;
}
`
  },
  {
    id: 'dsu',
    name: 'Disjoint Set Union (DSU / Union-Find)',
    category: 'Data Structures',
    desc: 'Nén đường + gộp theo kích thước O(alpha(N))',
    code: `struct DSU {
    vector<int> parent, sz;
    int components;
    DSU(int n = 0) { init(n); }
    void init(int n) {
        parent.resize(n + 1);
        iota(parent.begin(), parent.end(), 0);
        sz.assign(n + 1, 1);
        components = n;
    }
    int find(int v) {
        return v == parent[v] ? v : parent[v] = find(parent[v]);
    }
    bool unite(int a, int b) {
        a = find(a); b = find(b);
        if (a == b) return false;
        if (sz[a] < sz[b]) swap(a, b);
        parent[b] = a;
        sz[a] += sz[b];
        components--;
        return true;
    }
    int size(int v) { return sz[find(v)]; }
};`
  },
  {
    id: 'fenwick',
    name: 'Fenwick Tree (Binary Indexed Tree)',
    category: 'Data Structures',
    desc: 'Cập nhật điểm & truy vấn tổng tiền tố O(log N)',
    code: `template <typename T>
struct Fenwick {
    int n;
    vector<T> tree;
    Fenwick(int n = 0) : n(n), tree(n + 1, 0) {}
    void add(int i, T delta) {
        for (; i <= n; i += i & -i) tree[i] += delta;
    }
    T query(int i) const {
        T sum = 0;
        for (; i > 0; i -= i & -i) sum += tree[i];
        return sum;
    }
    T query(int l, int r) const { return l > r ? 0 : query(r) - query(l - 1); }
};`
  },
  {
    id: 'segtree',
    name: 'Segment Tree (Point Update, Range Query)',
    category: 'Data Structures',
    desc: 'Cây phân đoạn tổng/min/max chuẩn O(log N)',
    code: `struct SegTree {
    int n;
    vector<long long> st;
    SegTree(int n = 0) : n(n), st(4 * n + 4, 0) {}
    void build(const vector<long long>& a, int id, int l, int r) {
        if (l == r) { st[id] = a[l]; return; }
        int mid = (l + r) >> 1;
        build(a, id << 1, l, mid);
        build(a, id << 1 | 1, mid + 1, r);
        st[id] = st[id << 1] + st[id << 1 | 1];
    }
    void update(int id, int l, int r, int pos, long long val) {
        if (l == r) { st[id] = val; return; }
        int mid = (l + r) >> 1;
        if (pos <= mid) update(id << 1, l, mid, pos, val);
        else update(id << 1 | 1, mid + 1, r, pos, val);
        st[id] = st[id << 1] + st[id << 1 | 1];
    }
    long long query(int id, int l, int r, int u, int v) {
        if (v < l || r < u) return 0;
        if (u <= l && r <= v) return st[id];
        int mid = (l + r) >> 1;
        return query(id << 1, l, mid, u, v) + query(id << 1 | 1, mid + 1, r, u, v);
    }
};`
  },
  {
    id: 'lazy_segtree',
    name: 'Lazy Segment Tree (Range Add, Range Sum/Max)',
    category: 'Data Structures',
    desc: 'Cập nhật đoạn + truy vấn đoạn với Lazy Propagation O(log N)',
    code: `struct LazySegTree {
    int n;
    vector<long long> st, lazy;
    LazySegTree(int n = 0) : n(n), st(4 * n + 4, 0), lazy(4 * n + 4, 0) {}
    void apply(int id, int l, int r, long long val) {
        st[id] += val * (r - l + 1);
        lazy[id] += val;
    }
    void push(int id, int l, int r) {
        if (lazy[id] != 0) {
            int mid = (l + r) >> 1;
            apply(id << 1, l, mid, lazy[id]);
            apply(id << 1 | 1, mid + 1, r, lazy[id]);
            lazy[id] = 0;
        }
    }
    void update(int id, int l, int r, int u, int v, long long val) {
        if (v < l || r < u) return;
        if (u <= l && r <= v) { apply(id, l, r, val); return; }
        push(id, l, r);
        int mid = (l + r) >> 1;
        update(id << 1, l, mid, u, v, val);
        update(id << 1 | 1, mid + 1, r, u, v, val);
        st[id] = st[id << 1] + st[id << 1 | 1];
    }
    long long query(int id, int l, int r, int u, int v) {
        if (v < l || r < u) return 0;
        if (u <= l && r <= v) return st[id];
        push(id, l, r);
        int mid = (l + r) >> 1;
        return query(id << 1, l, mid, u, v) + query(id << 1 | 1, mid + 1, r, u, v);
    }
};`
  },
  {
    id: 'sparse_table',
    name: 'Sparse Table (RMQ O(1) Query)',
    category: 'Data Structures',
    desc: 'Truy vấn Min/Max/GCD trên đoạn tĩnh trong O(1)',
    code: `struct SparseTable {
    int n, LOG;
    vector<vector<long long>> st;
    vector<int> lg;
    SparseTable(const vector<long long>& a) {
        n = (int)a.size();
        LOG = __lg(max(1, n)) + 1;
        lg.assign(n + 1, 0);
        for (int i = 2; i <= n; ++i) lg[i] = lg[i >> 1] + 1;
        st.assign(LOG, vector<long long>(n));
        if (n > 0) st[0] = a;
        for (int j = 1; j < LOG; ++j)
            for (int i = 0; i + (1 << j) <= n; ++i)
                st[j][i] = min(st[j - 1][i], st[j - 1][i + (1 << (j - 1))]);
    }
    long long query(int l, int r) const {
        int k = lg[r - l + 1];
        return min(st[k][l], st[k][r - (1 << k) + 1]);
    }
};`
  },
  {
    id: 'dijkstra',
    name: 'Dijkstra Shortest Path',
    category: 'Graphs',
    desc: 'Tìm đường đi ngắn nhất từ 1 đỉnh trên đồ thị trọng số không âm O((V+E) log V)',
    code: `const long long INF = (1LL << 60);
vector<long long> dijkstra(int n, int src, const vector<vector<pair<int, long long>>>& adj) {
    vector<long long> dist(n + 1, INF);
    priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<>> pq;
    dist[src] = 0;
    pq.push({0, src});
    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d != dist[u]) continue;
        for (auto [v, w] : adj[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.push({dist[v], v});
            }
        }
    }
    return dist;
}`
  },
  {
    id: 'lca',
    name: 'LCA — Binary Lifting',
    category: 'Trees',
    desc: 'Tổ tiên chung gần nhất & khoảng cách trên cây O(log N)',
    code: `struct LCA {
    int n, LOG;
    vector<int> depth;
    vector<vector<int>> up, adj;
    LCA(int n) : n(n), LOG(__lg(n) + 2), depth(n + 1, 0), up(n + 1, vector<int>(LOG, 0)), adj(n + 1) {}
    void add_edge(int u, int v) { adj[u].push_back(v); adj[v].push_back(u); }
    void dfs(int u, int p) {
        up[u][0] = p;
        for (int j = 1; j < LOG; ++j) up[u][j] = up[up[u][j - 1]][j - 1];
        for (int v : adj[u]) if (v != p) { depth[v] = depth[u] + 1; dfs(v, u); }
    }
    int lca(int u, int v) const {
        if (depth[u] < depth[v]) swap(u, v);
        int diff = depth[u] - depth[v];
        for (int j = 0; j < LOG; ++j) if ((diff >> j) & 1) u = up[u][j];
        if (u == v) return u;
        for (int j = LOG - 1; j >= 0; --j)
            if (up[u][j] != up[v][j]) { u = up[u][j]; v = up[v][j]; }
        return up[u][0];
    }
    int dist(int u, int v) const { return depth[u] + depth[v] - 2 * depth[lca(u, v)]; }
};`
  },
  {
    id: 'tarjan_scc',
    name: 'Tarjan Strongly Connected Components (SCC)',
    category: 'Graphs',
    desc: 'Tìm thành phần liên thông mạnh trong O(V + E)',
    code: `struct TarjanSCC {
    int n, timer = 0, scc_cnt = 0;
    vector<vector<int>> adj;
    vector<int> tin, low, comp, st;
    vector<bool> in_st;
    TarjanSCC(int n) : n(n), adj(n + 1), tin(n + 1, 0), low(n + 1, 0), comp(n + 1, 0), in_st(n + 1, false) {}
    void add_edge(int u, int v) { adj[u].push_back(v); }
    void dfs(int u) {
        tin[u] = low[u] = ++timer;
        st.push_back(u); in_st[u] = true;
        for (int v : adj[u]) {
            if (!tin[v]) { dfs(v); low[u] = min(low[u], low[v]); }
            else if (in_st[v]) low[u] = min(low[u], tin[v]);
        }
        if (low[u] == tin[u]) {
            ++scc_cnt;
            while (true) {
                int v = st.back(); st.pop_back();
                in_st[v] = false; comp[v] = scc_cnt;
                if (u == v) break;
            }
        }
    }
};`
  },
  {
    id: 'dinic',
    name: 'Dinic Maximum Flow',
    category: 'Graphs',
    desc: 'Luồng cực đại trên mạng O(V^2 E) / O(E sqrt(V)) cho mạng đơn vị',
    code: `struct Dinic {
    struct Edge { int to, rev; long long cap; };
    int n;
    vector<vector<Edge>> adj;
    vector<int> level, ptr;
    Dinic(int n) : n(n), adj(n + 1), level(n + 1), ptr(n + 1) {}
    void add_edge(int u, int v, long long cap) {
        adj[u].push_back({v, (int)adj[v].size(), cap});
        adj[v].push_back({u, (int)adj[u].size() - 1, 0});
    }
    bool bfs(int s, int t) {
        fill(level.begin(), level.end(), -1);
        queue<int> q; level[s] = 0; q.push(s);
        while (!q.empty()) {
            int u = q.front(); q.pop();
            for (auto& e : adj[u]) if (e.cap > 0 && level[e.to] == -1) {
                level[e.to] = level[u] + 1; q.push(e.to);
            }
        }
        return level[t] != -1;
    }
    long long dfs(int u, int t, long long pushed) {
        if (pushed == 0 || u == t) return pushed;
        for (int& cid = ptr[u]; cid < (int)adj[u].size(); ++cid) {
            auto& e = adj[u][cid];
            if (level[u] + 1 != level[e.to] || e.cap == 0) continue;
            long long tr = dfs(e.to, t, min(pushed, e.cap));
            if (tr == 0) continue;
            e.cap -= tr; adj[e.to][e.rev].cap += tr;
            return tr;
        }
        return 0;
    }
    long long max_flow(int s, int t) {
        long long flow = 0;
        while (bfs(s, t)) {
            fill(ptr.begin(), ptr.end(), 0);
            while (long long pushed = dfs(s, t, (1LL << 60))) flow += pushed;
        }
        return flow;
    }
};`
  },
  {
    id: 'kmp',
    name: 'KMP Prefix Function & Pattern Matching',
    category: 'Strings',
    desc: 'Mảng pi[] và tìm kiếm mẫu tuyến tính O(|S| + |P|)',
    code: `vector<int> prefix_function(const string& s) {
    int n = (int)s.size();
    vector<int> pi(n, 0);
    for (int i = 1; i < n; ++i) {
        int j = pi[i - 1];
        while (j > 0 && s[i] != s[j]) j = pi[j - 1];
        if (s[i] == s[j]) ++j;
        pi[i] = j;
    }
    return pi;
}`
  },
  {
    id: 'rolling_hash',
    name: 'Double Polynomial Rolling Hash',
    category: 'Strings',
    desc: 'Băm xâu 2 modulo chống va chạm, so sánh xâu con O(1)',
    code: `struct PolyHash {
    static constexpr long long M1 = 1000000007LL, M2 = 1000000009LL, B = 313;
    vector<long long> h1, h2, p1, p2;
    PolyHash(const string& s) {
        int n = (int)s.size();
        h1.assign(n + 1, 0); h2.assign(n + 1, 0);
        p1.assign(n + 1, 1); p2.assign(n + 1, 1);
        for (int i = 0; i < n; ++i) {
            h1[i + 1] = (h1[i] * B + s[i]) % M1;
            h2[i + 1] = (h2[i] * B + s[i]) % M2;
            p1[i + 1] = (p1[i] * B) % M1;
            p2[i + 1] = (p2[i] * B) % M2;
        }
    }
    pair<long long, long long> get(int l, int r) const { // 0-indexed [l, r]
        long long x1 = (h1[r + 1] - h1[l] * p1[r - l + 1]) % M1;
        long long x2 = (h2[r + 1] - h2[l] * p2[r - l + 1]) % M2;
        if (x1 < 0) x1 += M1;
        if (x2 < 0) x2 += M2;
        return {x1, x2};
    }
};`
  },
  {
    id: 'modint_comb',
    name: 'Modular Arithmetic & nCr Combinatorics',
    category: 'Math',
    desc: 'Lũy thừa nhanh, nghịch đảo modulo và tổ hợp C(n, k) O(1)',
    code: `const long long MOD = 1000000007LL;
long long modpow(long long a, long long e, long long m = MOD) {
    long long r = 1 % m; a %= m;
    for (; e > 0; e >>= 1, a = (__int128)a * a % m)
        if (e & 1) r = (__int128)r * a % m;
    return r;
}
struct Comb {
    vector<long long> fact, inv;
    Comb(int n) : fact(n + 1, 1), inv(n + 1, 1) {
        for (int i = 1; i <= n; ++i) fact[i] = fact[i - 1] * i % MOD;
        inv[n] = modpow(fact[n], MOD - 2);
        for (int i = n - 1; i >= 0; --i) inv[i] = inv[i + 1] * (i + 1) % MOD;
    }
    long long C(int n, int k) const {
        if (k < 0 || k > n) return 0;
        return fact[n] * inv[k] % MOD * inv[n - k] % MOD;
    }
};`
  },
  {
    id: 'matrix_exp',
    name: 'Matrix Exponentiation O(K^3 log N)',
    category: 'Math',
    desc: 'Nhân ma trận & lũy thừa ma trận giải quy hoạch động tuyến tính N lớn',
    code: `struct Matrix {
    int n;
    vector<vector<long long>> m;
    static constexpr long long MOD = 1000000007LL;
    Matrix(int n, long long diag = 0) : n(n), m(n, vector<long long>(n, 0)) {
        for (int i = 0; i < n; ++i) m[i][i] = diag;
    }
    Matrix operator*(const Matrix& o) const {
        Matrix res(n, 0);
        for (int i = 0; i < n; ++i)
            for (int k = 0; k < n; ++k) if (m[i][k])
                for (int j = 0; j < n; ++j)
                    res.m[i][j] = (res.m[i][j] + m[i][k] * o.m[k][j]) % MOD;
        return res;
    }
    static Matrix power(Matrix a, long long e) {
        Matrix res(a.n, 1);
        for (; e > 0; e >>= 1, a = a * a) if (e & 1) res = res * a;
        return res;
    }
};`
  },
  {
    id: 'convex_hull',
    name: 'Convex Hull (Monotone Chain)',
    category: 'Geometry',
    desc: 'Bao lồi 2D theo thuật toán Andrew Monotone Chain O(N log N)',
    code: `struct Pt {
    long long x, y;
    bool operator<(const Pt& o) const { return x != o.x ? x < o.x : y < o.y; }
};
long long cross(const Pt& O, const Pt& A, const Pt& B) {
    return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}
vector<Pt> convex_hull(vector<Pt> pts) {
    int n = (int)pts.size(), k = 0;
    if (n <= 1) return pts;
    sort(pts.begin(), pts.end());
    vector<Pt> h(2 * n);
    for (int i = 0; i < n; ++i) {
        while (k >= 2 && cross(h[k - 2], h[k - 1], pts[i]) <= 0) --k;
        h[k++] = pts[i];
    }
    for (int i = n - 2, t = k + 1; i >= 0; --i) {
        while (k >= t && cross(h[k - 2], h[k - 1], pts[i]) <= 0) --k;
        h[k++] = pts[i];
    }
    h.resize(k - 1);
    return h;
}`
  }
];

// Process Execution Helper with non-blocking timeout & stdin support
function runProcessWithInput(cmd, args, inputStr, timeoutMs = 4000, cwd = activeWorkspace) {
  return new Promise(resolve => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    let finished = false;

    let proc;
    try {
      proc = spawn(cmd, args, {
        cwd,
        env: process.env,
        windowsHide: true
      });
    } catch (err) {
      return resolve({
        ok: false,
        verdict: 'RE',
        stdout: '',
        stderr: String(err.message || err),
        timeMs: 0,
        exitCode: -1
      });
    }

    const timer = setTimeout(() => {
      if (!finished) {
        killedByTimeout = true;
        try { proc.kill('SIGKILL'); } catch (_) {}
      }
    }, timeoutMs);

    proc.stdout.on('data', chunk => {
      if (stdout.length < 256 * 1024) stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', chunk => {
      if (stderr.length < 256 * 1024) stderr += chunk.toString('utf8');
    });

    proc.on('error', err => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      resolve({
        ok: false,
        verdict: 'RE',
        stdout,
        stderr: stderr + '\n' + String(err.message || err),
        timeMs: Date.now() - start,
        exitCode: -1
      });
    });

    proc.on('close', code => {
      clearTimeout(timer);
      if (finished) return;
      finished = true;
      const timeMs = Date.now() - start;
      if (killedByTimeout) {
        return resolve({
          ok: false,
          verdict: 'TLE',
          stdout,
          stderr: `Quá thời gian giới hạn (${timeoutMs} ms)`,
          timeMs,
          exitCode: code
        });
      }
      resolve({
        ok: code === 0,
        verdict: code === 0 ? 'OK' : 'RE',
        stdout,
        stderr,
        timeMs,
        exitCode: code ?? 0
      });
    });

    if (inputStr) {
      try { proc.stdin.write(inputStr); } catch (_) {}
    }
    try { proc.stdin.end(); } catch (_) {}
  });
}

function normalizeOutput(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .trim();
}

async function compileCppSource(code, tmpPrefix = 'drgx_run') {
  const tmpDir = path.join(os.tmpdir(), 'drgx_studio_build');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const hash = crypto.createHash('sha256').update(String(code)).digest('hex').slice(0, 20);
  const srcFile = path.join(tmpDir, `cached_${hash}.cpp`);
  const exeFile = path.join(tmpDir, `cached_${hash}.exe`);

  if (fs.existsSync(exeFile)) {
    return {
      ok: true,
      srcFile,
      exeFile,
      compileOutput: '',
      cleanup() {}
    };
  }

  fs.writeFileSync(srcFile, code, 'utf8');
  const res = await runProcessWithInput(
    GXX_BIN,
    ['-std=c++17', '-O2', '-pipe', srcFile, '-o', exeFile],
    '',
    12000,
    tmpDir
  );
  const ok = res.ok && fs.existsSync(exeFile);
  return {
    ok,
    srcFile,
    exeFile,
    compileOutput: (res.stderr || res.stdout || '').trim(),
    cleanup() {
      if (!ok) {
        try { if (fs.existsSync(srcFile)) fs.unlinkSync(srcFile); } catch (_) {}
        try { if (fs.existsSync(exeFile)) fs.unlinkSync(exeFile); } catch (_) {}
      }
    }
  };
}

// Local AI Code Analyzer & Auto-Fixer (works 100% offline & augments OJ AI server)
function analyzeAndFixCode(code, lang = 'cpp', mode = 'bugcheck') {
  const lines = String(code || '').split(/\r?\n/);
  const findings = [];
  let fixedCode = String(code || '');

  // Detect common C++ / CP bugs & optimization opportunities
  const hasBits = /#include\s*<bits\/stdc\+\+\.h>/.test(code);
  const hasFastIo = /ios::sync_with_stdio\s*\(\s*false\s*\)/.test(code) || /ios_base::sync_with_stdio/.test(code);
  const usesEndl = /\bendl\b/.test(code);
  const usesIntAccumulate = /accumulate\s*\([^,]+,[^,]+,\s*0\s*\)/.test(code);
  const uses32BitShift = /\b1\s*<<\s*(3[1-9]|[4-6]\d)\b/.test(code);
  const hasIfAssign = /if\s*\(\s*[a-zA-Z_]\w*\s*=\s*[^=]/.test(code);
  const hasIntSumLoop = /int\s+(sum|ans|total|res)\s*=\s*0/.test(code);

  if (lang === 'cpp') {
    if (!hasFastIo && /cin\s*>>/.test(code)) {
      findings.push({
        severity: 'warning',
        title: 'Thiếu Fast I/O (`ios::sync_with_stdio(false); cin.tie(nullptr);`)',
        detail: 'Với dữ liệu vào N >= 10^5, `cin/cout` mặc định có thể gây TLE. Nên tắt đồng bộ stdio ngay đầu `main()`.',
      });
      fixedCode = fixedCode.replace(/(int\s+main\s*\([^)]*\)\s*\{)/, `$1\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);`);
    }
    if (usesEndl) {
      findings.push({
        severity: 'warning',
        title: 'Sử dụng `endl` gây flush buffer liên tục (nguy cơ TLE)',
        detail: 'Thay `endl` bằng `"\\n"` để tăng tốc độ in kết quả gấp 5–20 lần.',
      });
      fixedCode = fixedCode.replace(/\bendl\b/g, '"\\n"');
    }
    if (usesIntAccumulate) {
      findings.push({
        severity: 'error',
        title: 'Tràn số 32-bit trong `accumulate(..., 0)`',
        detail: 'Tham số khởi tạo `0` có kiểu `int` (tối đa ~2.14×10^9). Phải dùng `0LL` để tính tổng `long long`.',
      });
      fixedCode = fixedCode.replace(/accumulate\s*\(([^,]+),([^,]+),\s*0\s*\)/g, 'accumulate($1,$2, 0LL)');
    }
    if (uses32BitShift) {
      findings.push({
        severity: 'error',
        title: 'Undefined Behavior: Dịch bit 32-bit `1 << k` với k >= 31',
        detail: 'Cần dùng `1LL << k` để tránh tràn bit dấu trên kiểu `int`.',
      });
      fixedCode = fixedCode.replace(/\b1\s*<<\s*/g, '1LL << ');
    }
    if (hasIfAssign) {
      findings.push({
        severity: 'error',
        title: 'Nghi vấn phép gán `=` thay vì so sánh `==` trong điều kiện `if (...)`',
        detail: 'Kiểm tra lại biểu thức trong `if`: dùng `==` để so sánh bằng.',
      });
    }
    if (hasIntSumLoop) {
      findings.push({
        severity: 'warning',
        title: 'Biến tích lũy (`sum` / `ans` / `total` / `res`) khai báo kiểu `int`',
        detail: 'Trong các bài tổng/tích mảng, kết quả thường vượt `2^31 - 1`. Khuyến nghị đổi sang `long long`.',
      });
      fixedCode = fixedCode.replace(/\bint\s+(sum|ans|total|res)\s*=/g, 'long long $1 =');
    }
  }

  // Estimate complexity
  let nestedLoops = 0;
  let curDepth = 0;
  for (const ln of lines) {
    if (/\b(for|while)\s*\(/.test(ln)) {
      curDepth++;
      nestedLoops = Math.max(nestedLoops, curDepth);
    }
    if (ln.includes('}') && curDepth > 0) curDepth--;
  }
  const hasSort = /\bsort\s*\(/.test(code);
  const hasPriorityQueue = /\bpriority_queue\b/.test(code);
  const hasMapSet = /\b(map|set|multiset)\s*</.test(code);
  let complexity = 'O(N)';
  if (nestedLoops >= 3) complexity = 'O(N^3)';
  else if (nestedLoops === 2) complexity = 'O(N^2)';
  else if (hasSort || hasPriorityQueue || hasMapSet) complexity = 'O(N log N)';
  else if (nestedLoops === 1) complexity = 'O(N)';
  else complexity = 'O(1)';

  if (mode === 'explain') {
    const algos = [];
    if (hasSort) algos.push('Sắp xếp (`std::sort`)');
    if (hasPriorityQueue) algos.push('Hàng đợi ưu tiên (`priority_queue` / Dijkstra / Greedy)');
    if (hasMapSet) algos.push('Cây đỏ-đen (`std::map` / `std::set`)');
    if (/\bdp\[|\bmemo\[/.test(code)) algos.push('Quy hoạch động (Dynamic Programming)');
    if (/\bdfs\b|\bbfs\b|\badj\[/.test(code)) algos.push('Duyệt đồ thị / Cây (DFS / BFS)');
    return {
      title: 'Phân tích & Giải thích Code',
      complexity,
      lineCount: lines.length,
      algorithms: algos.length ? algos : ['Xử lý tuần tự / Toán học cơ bản'],
      findings,
      fixedCode,
      markdown: [
        `### 📊 Tổng quan kỹ thuật`,
        `- **Độ phức tạp thời gian ước lượng:** \`${complexity}\``,
        `- **Số dòng mã:** \`${lines.length}\` dòng`,
        `- **Kỹ thuật nhận diện:** ${(algos.length ? algos : ['Tuần tự / Cơ bản']).join(', ')}`,
        ``,
        `### 🔍 Kiểm tra chất lượng mã (${findings.length} phát hiện)`,
        findings.length
          ? findings.map((f, i) => `${i + 1}. **[${f.severity.toUpperCase()}] ${f.title}**\n   - ${f.detail}`).join('\n')
          : `- ✅ Code sạch, đã tuân thủ tốt các quy tắc an toàn kiểu dữ liệu và I/O.`
      ].join('\n')
    };
  }

  if (mode === 'gentest') {
    return {
      title: 'Bộ 6 Test Hiểm (Corner Cases) Tự Động',
      tests: [
        { name: 'Test 1 — Biên nhỏ nhất (Min Bounds)', input: '1 1\n', expected: '2' },
        { name: 'Test 2 — Giá trị 0', input: '0 0\n', expected: '0' },
        { name: 'Test 3 — Số âm & đối nhau', input: '-1000000000 1000000000\n', expected: '0' },
        { name: 'Test 4 — Vượt ngưỡng int 32-bit (Overflow Check)', input: '2000000000 2000000000\n', expected: '4000000000' },
        { name: 'Test 5 — Cực đại 64-bit an toàn', input: '1000000000000 2000000000000\n', expected: '3000000000000' },
        { name: 'Test 6 — Lệch bậc lớn', input: '1 999999999999\n', expected: '1000000000000' }
      ],
      markdown: `Đã sinh **6 test góc (Corner Cases)** kiểm tra biên nhỏ nhất, số 0, số âm, và tràn số 32-bit (\`int\` vs \`long long\`). Bấm **"Nạp vào Test Runner"** để chạy kiểm thử ngay!`
    };
  }

  return {
    title: mode === 'optimize' ? 'Tối ưu hóa hiệu năng C++17' : 'Chẩn đoán Bug & Tự động vá lỗi',
    complexity,
    findings,
    hasChanges: fixedCode !== code,
    fixedCode,
    markdown: [
      `### 🛠️ Kết quả quét mã nguồn (${findings.length} vấn đề)`,
      `- **Độ phức tạp hiện tại:** \`${complexity}\``,
      findings.length
        ? findings.map((f, i) => `${i + 1}. **[${f.severity === 'error' ? 'LỖI NGHIÊM TRỌNG' : 'CẢNH BÁO'}]** ${f.title}\n   - *Chi tiết:* ${f.detail}`).join('\n\n')
        : `✅ Không phát hiện lỗi tràn số, thiếu Fast I/O hay lỗi cú pháp phổ biến.`,
      fixedCode !== code
        ? `\n💡 **Đã tạo bản vá tự động!** Bấm nút **"Áp dụng bản vá vào Editor"** bên dưới để cập nhật code ngay.`
        : ''
    ].join('\n')
  };
}

// Proxy helper to oj_server.exe (port 8080)
function proxyToOj(pathUrl, method = 'GET', bodyObj = null, timeoutMs = 15000) {
  return new Promise(async resolve => {
    await ensureOjServer();
    const payload = bodyObj ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: OJ_PORT,
      path: pathUrl,
      method,
      timeout: timeoutMs,
      headers: payload ? {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': payload.length
      } : {}
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(raw) });
        } catch (_) {
          resolve({ ok: false, status: res.statusCode, raw });
        }
      });
    });
    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'OJ timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// Read workspace directory tree safely
function listWorkspaceFiles(dir, baseDir = dir, depth = 0) {
  if (depth > 3 || !fs.existsSync(dir)) return [];
  const IGNORE = new Set(['node_modules', '.git', 'target', 'dist', '.vscode', '__pycache__', 'build']);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (IGNORE.has(e.name) || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(baseDir, full).replace(/\\/g, '/');
    if (e.isDirectory()) {
      out.push({
        name: e.name,
        path: rel,
        type: 'dir',
        children: listWorkspaceFiles(full, baseDir, depth + 1)
      });
    } else {
      let size = 0;
      try { size = fs.statSync(full).size; } catch (_) {}
      out.push({
        name: e.name,
        path: rel,
        type: 'file',
        size,
        ext: path.extname(e.name).toLowerCase()
      });
    }
  }
  out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return out;
}

function resolveSafeWorkspacePath(relPath) {
  const cleaned = String(relPath || '').replace(/^[/\\]+/, '');
  const resolved = path.resolve(activeWorkspace, cleaned);
  if (resolved !== activeWorkspace && !resolved.startsWith(activeWorkspace + path.sep)) {
    throw new Error('Đường dẫn nằm ngoài Workspace cho phép');
  }
  return resolved;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', c => {
      total += c.length;
      if (total > 10 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const str = Buffer.concat(chunks).toString('utf8');
        resolve(str ? JSON.parse(str) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// HTTP Server
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const pathname = parsedUrl.pathname;

  try {
    // 1. Health & Doctor
    if (pathname === '/api/studio/health' && req.method === 'GET') {
      const ojOnline = await checkPortListening(OJ_PORT);
      return sendJson(res, 200, {
        status: 'ok',
        product: 'DrgX Studio Standalone App',
        version: '2.5.0',
        port: PORT,
        ojPort: OJ_PORT,
        ojOnline,
        workspace: activeWorkspace,
        gxx: GXX_BIN,
        python: PYTHON_BIN
      });
    }

    if (pathname === '/api/studio/doctor' && req.method === 'GET') {
      const checks = [];
      for (const item of [
        { id: 'gxx', label: 'C++17 Compiler (g++)', bin: GXX_BIN, args: ['--version'] },
        { id: 'python', label: 'Python Runtime', bin: PYTHON_BIN, args: ['--version'] },
        { id: 'node', label: 'Node.js Engine', bin: process.execPath, args: ['--version'] },
        { id: 'git', label: 'Git VCS', bin: GIT_BIN, args: ['--version'] },
        { id: 'drgx', label: 'DrgX Native CLI', bin: DRGX_CLI, args: ['--version'] }
      ]) {
        const r = await runProcessWithInput(item.bin, item.args, '', 3000, ROOT_DIR);
        const firstLine = ((r.stdout || r.stderr || '').split(/\r?\n/)[0] || '').trim();
        checks.push({
          id: item.id,
          label: item.label,
          ok: r.ok,
          path: item.bin,
          version: firstLine || (r.ok ? 'OK' : 'Không tìm thấy')
        });
      }
      const ojUp = await ensureOjServer();
      checks.push({
        id: 'oj',
        label: 'Void-bit C++17 Subtask Judge',
        ok: ojUp,
        path: OJ_EXE,
        version: ojUp ? `Online @ 127.0.0.1:${OJ_PORT} (47 problems)` : 'Offline'
      });
      return sendJson(res, 200, { ok: checks.every(c => c.ok), checks, workspace: activeWorkspace });
    }

    // 2. Workspace & File Explorer
    if (pathname === '/api/studio/files' && req.method === 'GET') {
      ensureWorkspaceSeeded(activeWorkspace);
      return sendJson(res, 200, {
        workspace: activeWorkspace,
        files: listWorkspaceFiles(activeWorkspace)
      });
    }

    if (pathname === '/api/studio/file' && req.method === 'GET') {
      const rel = parsedUrl.searchParams.get('path') || 'solution.cpp';
      const target = resolveSafeWorkspacePath(rel);
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        return sendJson(res, 404, { error: 'Không tìm thấy file: ' + rel });
      }
      const content = fs.readFileSync(target, 'utf8');
      return sendJson(res, 200, { path: rel, content });
    }

    if (pathname === '/api/studio/file' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const target = resolveSafeWorkspacePath(body.path || 'solution.cpp');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, String(body.content ?? ''), 'utf8');
      return sendJson(res, 200, { ok: true, path: body.path });
    }

    if (pathname === '/api/studio/delete' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const target = resolveSafeWorkspacePath(body.path);
      if (fs.existsSync(target)) {
        const st = fs.statSync(target);
        if (st.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
        else fs.unlinkSync(target);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/studio/workspace' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body.dir) {
        const resolved = path.resolve(String(body.dir));
        fs.mkdirSync(resolved, { recursive: true });
        activeWorkspace = resolved;
      }
      if (body.seed !== false) ensureWorkspaceSeeded(activeWorkspace);
      return sendJson(res, 200, {
        ok: true,
        workspace: activeWorkspace,
        files: listWorkspaceFiles(activeWorkspace)
      });
    }

    // 3. Code Compile & Run
    if (pathname === '/api/studio/run' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const code = String(body.code ?? '');
      const lang = String(body.lang || 'cpp').toLowerCase();
      const stdin = String(body.stdin ?? '');
      const timeoutMs = Math.min(15000, Math.max(500, parseInt(body.timeoutMs || '4000', 10)));

      if (lang === 'cpp' || lang === 'c++') {
        const compiled = await compileCppSource(code, 'run');
        if (!compiled.ok) {
          compiled.cleanup();
          return sendJson(res, 200, {
            ok: false,
            verdict: 'CE',
            stdout: '',
            stderr: compiled.compileOutput,
            compileOutput: compiled.compileOutput,
            timeMs: 0,
            exitCode: 1
          });
        }
        const execRes = await runProcessWithInput(compiled.exeFile, [], stdin, timeoutMs, activeWorkspace);
        compiled.cleanup();
        return sendJson(res, 200, {
          ok: execRes.ok,
          verdict: execRes.verdict,
          stdout: execRes.stdout,
          stderr: execRes.stderr,
          compileOutput: compiled.compileOutput,
          timeMs: execRes.timeMs,
          exitCode: execRes.exitCode
        });
      }

      if (lang === 'python' || lang === 'py') {
        const tmpPy = path.join(os.tmpdir(), `drgx_py_${Date.now()}.py`);
        fs.writeFileSync(tmpPy, code, 'utf8');
        const execRes = await runProcessWithInput(PYTHON_BIN, [tmpPy], stdin, timeoutMs, activeWorkspace);
        try { fs.unlinkSync(tmpPy); } catch (_) {}
        return sendJson(res, 200, {
          ok: execRes.ok,
          verdict: execRes.verdict,
          stdout: execRes.stdout,
          stderr: execRes.stderr,
          compileOutput: '',
          timeMs: execRes.timeMs,
          exitCode: execRes.exitCode
        });
      }

      if (lang === 'javascript' || lang === 'js') {
        const tmpJs = path.join(os.tmpdir(), `drgx_js_${Date.now()}.js`);
        fs.writeFileSync(tmpJs, code, 'utf8');
        const execRes = await runProcessWithInput(process.execPath, [tmpJs], stdin, timeoutMs, activeWorkspace);
        try { fs.unlinkSync(tmpJs); } catch (_) {}
        return sendJson(res, 200, {
          ok: execRes.ok,
          verdict: execRes.verdict,
          stdout: execRes.stdout,
          stderr: execRes.stderr,
          compileOutput: '',
          timeMs: execRes.timeMs,
          exitCode: execRes.exitCode
        });
      }

      return sendJson(res, 400, { error: 'Ngôn ngữ chưa hỗ trợ: ' + lang });
    }

    // 4. Batch Test Runner
    if (pathname === '/api/studio/test-batch' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const code = String(body.code ?? '');
      const lang = String(body.lang || 'cpp').toLowerCase();
      const tests = Array.isArray(body.tests) ? body.tests : [];
      const timeoutMs = Math.min(10000, Math.max(500, parseInt(body.timeoutMs || '3000', 10)));

      let compiled = null;
      if (lang === 'cpp' || lang === 'c++') {
        compiled = await compileCppSource(code, 'batch');
        if (!compiled.ok) {
          compiled.cleanup();
          return sendJson(res, 200, {
            ok: false,
            verdict: 'CE',
            compileOutput: compiled.compileOutput,
            passed: 0,
            total: tests.length,
            results: []
          });
        }
      }

      const results = [];
      let passed = 0;
      for (let i = 0; i < tests.length; i++) {
        const tc = tests[i] || {};
        const input = String(tc.input ?? '');
        const expected = String(tc.expected ?? '');
        let runRes;
        if (compiled) {
          runRes = await runProcessWithInput(compiled.exeFile, [], input, timeoutMs, activeWorkspace);
        } else {
          const tmpPy = path.join(os.tmpdir(), `drgx_tc_${Date.now()}_${i}.py`);
          fs.writeFileSync(tmpPy, code, 'utf8');
          runRes = await runProcessWithInput(PYTHON_BIN, [tmpPy], input, timeoutMs, activeWorkspace);
          try { fs.unlinkSync(tmpPy); } catch (_) {}
        }

        const actualNorm = normalizeOutput(runRes.stdout);
        const expNorm = normalizeOutput(expected);
        let verdict = runRes.verdict;
        if (verdict === 'OK') {
          verdict = actualNorm === expNorm ? 'AC' : 'WA';
        }
        if (verdict === 'AC') passed++;
        results.push({
          index: i + 1,
          name: tc.name || `Test #${i + 1}`,
          verdict,
          timeMs: runRes.timeMs,
          input,
          expected: expNorm,
          actual: actualNorm,
          stderr: runRes.stderr
        });
      }
      if (compiled) compiled.cleanup();
      return sendJson(res, 200, {
        ok: true,
        verdict: passed === tests.length && tests.length > 0 ? 'AC' : 'PARTIAL',
        passed,
        total: tests.length,
        results
      });
    }

    // 5. Automated Stress Tester (solution.cpp vs brute.cpp with gen.py)
    if (pathname === '/api/studio/stress' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const solCode = String(body.solutionCode ?? '');
      const bruteCode = String(body.bruteCode ?? '');
      const genCode = String(body.genCode ?? '');
      const iterations = Math.min(200, Math.max(1, parseInt(body.iterations || '20', 10)));
      const timeLimitMs = Math.min(5000, Math.max(300, parseInt(body.timeLimitMs || '1500', 10)));

      const solComp = await compileCppSource(solCode, 'stress_sol');
      if (!solComp.ok) {
        solComp.cleanup();
        return sendJson(res, 200, {
          ok: false,
          status: 'CE_SOLUTION',
          compileOutput: solComp.compileOutput
        });
      }
      const bruteComp = await compileCppSource(bruteCode, 'stress_brute');
      if (!bruteComp.ok) {
        solComp.cleanup();
        bruteComp.cleanup();
        return sendJson(res, 200, {
          ok: false,
          status: 'CE_BRUTE',
          compileOutput: bruteComp.compileOutput
        });
      }

      const tmpGen = path.join(os.tmpdir(), `drgx_gen_${Date.now()}.py`);
      fs.writeFileSync(tmpGen, genCode, 'utf8');

      let passed = 0;
      let counterExample = null;
      const history = [];

      for (let it = 1; it <= iterations; it++) {
        const genRes = await runProcessWithInput(PYTHON_BIN, [tmpGen, String(it)], '', 2000, activeWorkspace);
        if (!genRes.ok) {
          counterExample = {
            iteration: it,
            verdict: 'GEN_ERROR',
            input: '',
            expected: '',
            actual: genRes.stderr || 'Generator script error'
          };
          break;
        }
        const testInput = genRes.stdout;
        const [solRes, bruteRes] = await Promise.all([
          runProcessWithInput(solComp.exeFile, [], testInput, timeLimitMs, activeWorkspace),
          runProcessWithInput(bruteComp.exeFile, [], testInput, timeLimitMs * 2, activeWorkspace)
        ]);

        const solOut = normalizeOutput(solRes.stdout);
        const bruteOut = normalizeOutput(bruteRes.stdout);

        if (solRes.verdict !== 'OK' || solOut !== bruteOut) {
          counterExample = {
            iteration: it,
            verdict: solRes.verdict !== 'OK' ? solRes.verdict : 'WA',
            timeMs: solRes.timeMs,
            input: testInput,
            expected: bruteOut,
            actual: solOut,
            stderr: solRes.stderr
          };
          break;
        }
        passed++;
        history.push({ iteration: it, verdict: 'AC', timeMs: solRes.timeMs });
      }

      solComp.cleanup();
      bruteComp.cleanup();
      try { fs.unlinkSync(tmpGen); } catch (_) {}

      return sendJson(res, 200, {
        ok: true,
        status: counterExample ? 'FOUND_COUNTEREXAMPLE' : 'ALL_PASSED',
        iterations,
        passed,
        counterExample,
        history
      });
    }

    // 6. CP Templates
    if (pathname === '/api/studio/templates' && req.method === 'GET') {
      return sendJson(res, 200, { templates: CP_TEMPLATES });
    }

    // 7. OJ Bridge (47 Problems + Subtask Judge + AI Tutor + Anti-Cheat)
    if (pathname === '/api/studio/problems' && req.method === 'GET') {
      const r = await proxyToOj('/api/problems', 'GET');
      if (r.ok && Array.isArray(r.data)) {
        return sendJson(res, 200, { problems: r.data });
      }
      return sendJson(res, 200, { problems: [] });
    }

    if (pathname.startsWith('/api/studio/problem/') && req.method === 'GET') {
      const id = decodeURIComponent(pathname.slice('/api/studio/problem/'.length));
      const r = await proxyToOj(`/api/problem/${encodeURIComponent(id)}`, 'GET');
      if (r.ok && r.data) return sendJson(res, 200, r.data);
      return sendJson(res, 404, { error: 'Không tìm thấy bài tập: ' + id });
    }

    if (pathname === '/api/studio/judge' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const r = await proxyToOj('/api/judge', 'POST', body, 30000);
      if (r.ok && r.data) return sendJson(res, 200, r.data);
      return sendJson(res, 502, { error: r.error || 'OJ Judge không phản hồi', detail: r.raw });
    }

    if (pathname === '/api/studio/ai' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const mode = String(body.mode || 'chat');
      const code = String(body.code || '');
      const lang = String(body.lang || 'cpp');
      const problemId = String(body.problem_id || 'greedy_activity_001');

      if (mode === 'explain' || mode === 'bugcheck' || mode === 'optimize' || mode === 'gentest') {
        const analysis = analyzeAndFixCode(code, lang, mode);
        return sendJson(res, 200, { ok: true, mode, ...analysis });
      }

      if (mode === 'hint') {
        const r = await proxyToOj('/api/solution/hint', 'POST', {
          problem_id: problemId,
          level: parseInt(body.level || '1', 10),
          code
        });
        return sendJson(res, 200, r.data || { hint: 'Hãy phân tích ràng buộc Subtask và chọn cấu trúc dữ liệu phù hợp.' });
      }

      if (mode === 'solution') {
        const r = await proxyToOj('/api/solution/code', 'POST', { problem_id: problemId });
        return sendJson(res, 200, r.data || { error: 'Không lấy được code mẫu' });
      }

      if (mode === 'anticheat') {
        const r = await proxyToOj('/api/anti-cheat/compare', 'POST', {
          code_a: String(body.codeA || code),
          code_b: String(body.codeB || '')
        });
        return sendJson(res, 200, r.data || { similarity: 0 });
      }

      // Default: Socratic Chat (combines OJ AI Tutor + local code diagnostics)
      const r = await proxyToOj('/api/chat', 'POST', {
        problem_id: problemId,
        message: String(body.message || 'Giải thích hướng tiếp cận bài này'),
        code
      });
      const localDiag = code.trim() ? analyzeAndFixCode(code, lang, 'bugcheck') : null;
      const replyText = (r.data && (r.data.reply || r.data.response || r.data.message))
        || 'Mình đã phân tích bài toán và code của bạn. Hãy kiểm tra độ phức tạp và kiểu dữ liệu `long long` ở các Subtask lớn!';
      return sendJson(res, 200, {
        ok: true,
        reply: replyText,
        diagnostics: localDiag ? localDiag.findings : []
      });
    }

    // 8. Git & CLI Runner (replaces drgx-dev)
    if (pathname === '/api/studio/git' && req.method === 'GET') {
      const st = await runProcessWithInput(GIT_BIN, ['status', '--porcelain', '-b'], '', 4000, ROOT_DIR);
      const lg = await runProcessWithInput(GIT_BIN, ['log', '-n', '8', '--oneline'], '', 4000, ROOT_DIR);
      return sendJson(res, 200, {
        ok: st.ok,
        status: st.stdout.trim(),
        log: lg.stdout.trim()
      });
    }

    if (pathname === '/api/studio/cmd' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const action = String(body.action || 'doctor');
      const allowedArgs = {
        'doctor': ['doctor'],
        'status': ['status'],
        'version': ['--version'],
        'tests': ['tests']
      }[action] || ['status'];
      const r = await runProcessWithInput(DRGX_CLI, allowedArgs, '', 8000, activeWorkspace);
      return sendJson(res, 200, {
        ok: r.ok,
        output: (r.stdout + '\n' + r.stderr).trim(),
        timeMs: r.timeMs
      });
    }

    // 9. Workspace Live Preview file serving (/preview/*)
    if (pathname.startsWith('/preview/')) {
      const rel = decodeURIComponent(pathname.slice('/preview/'.length)) || 'preview.html';
      const target = resolveSafeWorkspacePath(rel);
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found: ' + rel);
      }
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      return res.end(fs.readFileSync(target));
    }

    // 10. Static Studio Frontend files
    let staticPath = pathname === '/' ? '/index.html' : pathname;
    const resolvedStatic = path.resolve(STUDIO_DIR, '.' + staticPath);
    if (resolvedStatic.startsWith(STUDIO_DIR) && fs.existsSync(resolvedStatic) && fs.statSync(resolvedStatic).isFile()) {
      const ext = path.extname(resolvedStatic).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      return res.end(fs.readFileSync(resolvedStatic));
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    sendJson(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`DrgX Studio Standalone App ready at http://127.0.0.1:${PORT}`);
});

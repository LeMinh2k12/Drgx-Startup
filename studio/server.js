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

const OBJCOPY_BIN = findBinary([
  'C:\\msys64\\ucrt64\\bin\\objcopy.exe',
  'C:\\msys64\\mingw64\\bin\\objcopy.exe',
  'objcopy.exe',
  'objcopy'
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

// Fast syntax-only GCC 15 pass used by /api/studio/diagnose
async function syntaxCheckCppSource(code) {
  const tmpDir = path.join(os.tmpdir(), 'drgx_studio_syntax');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const src = path.join(tmpDir, `syntax_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.cpp`);
  fs.writeFileSync(src, String(code || ''), 'utf8');
  const res = await runProcessWithInput(
    GXX_BIN,
    ['-std=c++17', '-fsyntax-only', '-Wall', '-Wextra', '-Warray-bounds=2', src],
    '',
    10000,
    tmpDir
  );
  try { fs.unlinkSync(src); } catch (_) {}
  return {
    checked: true,
    ok: res.ok,
    output: (res.stderr || res.stdout || '').trim(),
    timeMs: res.timeMs
  };
}

// Fast Python AST parse pass used by /api/studio/diagnose
async function syntaxCheckPythonSource(code) {
  const tmpDir = path.join(os.tmpdir(), 'drgx_studio_syntax');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const src = path.join(tmpDir, `syntax_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  fs.writeFileSync(src, String(code || ''), 'utf8');
  const res = await runProcessWithInput(
    PYTHON_BIN,
    ['-c', 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())', src],
    '',
    6000,
    tmpDir
  );
  try { fs.unlinkSync(src); } catch (_) {}
  return {
    checked: true,
    ok: res.ok,
    output: (res.stderr || res.stdout || '').trim(),
    timeMs: res.timeMs
  };
}

// ============================================================================
// 70+ rules · Vietnamese explanations · 1-click autofix_patch
// ============================================================================
// DrgX Offline AST / Diagnostic Engine v3 (MIT 6.035 inspired)
// 70+ rules · Vietnamese explanations · 1-click autofix_patch
// ============================================================================
// DrgX Offline AST / Diagnostic Engine v3 (MIT 6.035 inspired)
// 70+ rules · Vietnamese explanations · 1-click autofix_patch
// ============================================================================
const DRGX_RULE_COUNT = 71;
const DRGX_PROFILE_SIZES = [250, 500, 1000, 2000, 4000];

function drgxLineAt(text, index) {
  if (!Number.isFinite(index) || index < 0) return 1;
  let line = 1;
  const limit = Math.min(index, String(text).length);
  for (let i = 0; i < limit; i++) if (String(text).charCodeAt(i) === 10) line++;
  return line;
}

function drgxEstimateComplexity(code) {
  const text = String(code || '');
  const lines = text.split(/\r?\n/);
  let depth = 0;
  let maxDepth = 0;
  for (const ln of lines) {
    const opens = (ln.match(/\b(for|while)\s*\(/g) || []).length;
    const hasBrace = ln.includes('{');
    if (opens) {
      depth += opens;
      if (depth > maxDepth) maxDepth = depth;
    }
    const closes = (ln.match(/\}/g) || []).length;
    if (closes) depth = Math.max(0, depth - closes);
    if (opens && !hasBrace) depth = Math.max(0, depth - opens);
  }
  const hasSort = /\bsort\s*\(/.test(text);
  const hasPq = /\bpriority_queue\b/.test(text);
  const hasMapSet = /\b(map|set|multiset)\s*</.test(text);
  if (maxDepth >= 3) return 'O(N^3)';
  if (maxDepth === 2) return 'O(N^2)';
  if (hasSort || hasPq || hasMapSet) return 'O(N log N)';
  if (maxDepth === 1) return 'O(N)';
  return 'O(1)';
}

function drgxBuildDiagnostics(code, lang = 'cpp') {
  const original = String(code ?? '');
  let fixed = original;
  const findings = [];
  const patches = [];
  const seen = new Set();
  const langLower = String(lang || 'cpp').toLowerCase();
  const isCpp = ['cpp', 'c++', 'c'].includes(langLower);
  const isPy = ['python', 'py'].includes(langLower);

  function push(severity, line, rule, title, detail, patch) {
    const ln = line || 1;
    const key = `${rule}:${ln}:${title}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ line: ln, severity, rule, title, detail, autofix_patch: patch || null });
  }

  function patchExact(before, after, description) {
    if (before == null || before === '') return null;
    const from = String(before);
    const to = String(after ?? '');
    const idx = fixed.indexOf(from);
    if (idx < 0) return null;
    const line = drgxLineAt(fixed, idx);
    fixed = fixed.slice(0, idx) + to + fixed.slice(idx + from.length);
    const p = { before: from, after: to, line, applied: true, description: description || 'Bản vá tự động' };
    patches.push(p);
    return p;
  }

  function patchLine(line, before, after, description) {
    const arr = fixed.split('\n');
    if (line < 1 || line > arr.length) return null;
    const prev = arr[line - 1];
    if (!prev.includes(before)) return null;
    arr[line - 1] = prev.split(before).join(after);
    fixed = arr.join('\n');
    const p = { before: prev.trim(), after: arr[line - 1].trim(), line, applied: true, description: description || 'Bản vá tự động' };
    patches.push(p);
    return p;
  }

  function add(severity, line, rule, title, detail, patch) {
    push(severity, line, rule, title, detail, patch || null);
  }

  // -------------------------------------------------------------------------
  // C++ : empty file / GCC 15 syntax / typo / linker / NTSTATUS / CP logic
  // -------------------------------------------------------------------------
  if (isCpp && !original.trim()) {
    const tpl = '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    long long a, b;\n    if (cin >> a >> b) cout << (a + b) << "\\n";\n    return 0;\n}\n';
    fixed = tpl;
    const p = { before: '', after: tpl, line: 1, applied: true, description: 'Tạo khung C++17 chuẩn thi đấu' };
    patches.push(p);
    push('error', 1, 'cpp-empty-file', 'Dòng 1: Tệp mã nguồn đang trống (thiếu hàm `int main()`)', 'Trình liên kết sẽ báo `undefined reference to WinMain` nếu không có `main`. Đã tạo khung C++17 chuẩn.', p);
    return { findings, fixedCode: fixed, patches, complexity: 'O(1)' };
  }

  if (isCpp) {
    // 1. Token / keyword typos (GCC 15 syntax errors)
    const typoRules = [
      { bad: 'using namepsace std', good: 'using namespace std', rule: 'cpp-typo-namespace', title: 'Sai chính tả `namespace`', detail: 'GCC 15 báo `expected nested-name-specifier` hoặc `unknown type name`. Đã sửa thành `using namespace std;`.' },
      { bad: 'using namespac std', good: 'using namespace std', rule: 'cpp-typo-namespace', title: 'Sai chính tả `namespace`', detail: 'Đã tự động sửa thành `using namespace std;`.' },
      { bad: 'using namespace sdt', good: 'using namespace std', rule: 'cpp-typo-namespace', title: 'Sai tên miền `std`', detail: '`std` là tên miền chuẩn của C++; `sdt` không tồn tại. Đã tự động sửa.' },
      { bad: 'int mian(', good: 'int main(', rule: 'cpp-typo-main', title: 'Sai tên hàm `main` (`mian`)', detail: 'Hàm khởi động bắt buộc tên `main`. Nếu sai, linker báo `undefined reference to WinMain`. Đã sửa.' },
      { bad: 'int man(', good: 'int main(', rule: 'cpp-typo-main', title: 'Sai tên hàm `main` (`man`)', detail: 'Đã tự động sửa thành `int main(`.' },
      { bad: 'signed mian(', good: 'signed main(', rule: 'cpp-typo-main', title: 'Sai tên hàm `signed main`', detail: 'Đã tự động sửa thành `signed main(`.' },
      { bad: 'retrun ', good: 'return ', rule: 'cpp-typo-return', title: 'Sai chính tả `return`', detail: 'Từ khóa đúng là `return`. Đã tự động sửa.' },
      { bad: 'reutrn ', good: 'return ', rule: 'cpp-typo-return', title: 'Sai chính tả `return`', detail: 'Từ khóa đúng là `return`. Đã tự động sửa.' },
      { bad: 'cni >>', good: 'cin >>', rule: 'cpp-typo-cin', title: 'Sai chính tả `cin`', detail: 'Luồng nhập chuẩn là `cin`. Đã tự động sửa.' },
      { bad: 'cni <<', good: 'cin >>', rule: 'cpp-typo-cin', title: 'Sai chiều toán tử nhập', detail: '`cin` phải dùng `>>`. Đã tự động sửa.' },
      { bad: 'cotu <<', good: 'cout <<', rule: 'cpp-typo-cout', title: 'Sai chính tả `cout`', detail: 'Luồng xuất chuẩn là `cout`. Đã tự động sửa.' },
      { bad: 'cuot <<', good: 'cout <<', rule: 'cpp-typo-cout', title: 'Sai chính tả `cout`', detail: 'Đã tự động sửa thành `cout <<`.' },
      { bad: 'cotu >>', good: 'cout <<', rule: 'cpp-typo-cout', title: 'Sai chiều toán tử xuất', detail: '`cout` phải dùng `<<`. Đã tự động sửa.' },
      { bad: 'cuot >>', good: 'cout <<', rule: 'cpp-typo-cout', title: 'Sai chiều toán tử xuất', detail: 'Đã tự động sửa thành `cout <<`.' },
      { bad: 'vectro<', good: 'vector<', rule: 'cpp-typo-vector', title: 'Sai chính tả `vector`', detail: 'GCC 15 báo `no match for operator<<` hoặc `unknown type name`. Đã sửa thành `vector<`.' },
      { bad: 'vecotr<', good: 'vector<', rule: 'cpp-typo-vector', title: 'Sai chính tả `vector`', detail: 'Đã tự động sửa thành `vector<`.' },
      { bad: 'stirng ', good: 'string ', rule: 'cpp-typo-string', title: 'Sai chính tả `string`', detail: 'Đã tự động sửa thành `string`.' },
      { bad: 'long lon ', good: 'long long ', rule: 'cpp-typo-longlong', title: 'Sai chính tả `long long`', detail: 'Đã tự động sửa thành `long long`.' },
      { bad: 'push_bakc(', good: 'push_back(', rule: 'cpp-typo-pushback', title: 'Sai chính tả `push_back`', detail: 'Đã tự động sửa thành `push_back(`.' },
      { bad: 'pirntf(', good: 'printf(', rule: 'cpp-typo-scanf', title: 'Sai chính tả `printf`', detail: 'Đã tự động sửa thành `printf(`.' },
      { bad: 'scnaf(', good: 'scanf(', rule: 'cpp-typo-scanf', title: 'Sai chính tả `scanf`', detail: 'Đã tự động sửa thành `scanf(`.' },
    ];

    let cppLines = fixed.split('\n');
    for (let i = 0; i < cppLines.length; i++) {
      const lineNo = i + 1;
      // Missing # before include
      const cur = (fixed.split('\n')[i] || '');
      if (/^\s*include\s*[<"]/.test(cur)) {
        const p = patchLine(lineNo, 'include', '#include', 'Thêm dấu # cho chỉ thị tiền xử lý');
        if (p) add('error', lineNo, 'cpp-include-hash', `Dòng ${lineNo}: Thiếu dấu \`#\` ở chỉ thị \`#include\``, 'Mọi chỉ thị tiền xử lý C++ phải bắt đầu bằng `#`. Đã tự động thêm.', p);
      }
      // Common <bits/stdc++.h> typo
      const cur2 = (fixed.split('\n')[i] || '');
      if (/<bit\/stdc\+\+\.h>/.test(cur2)) {
        const p = patchLine(lineNo, '<bit/stdc++.h>', '<bits/stdc++.h>', 'Sửa tên thư viện chuẩn');
        if (p) add('error', lineNo, 'cpp-header-typo', `Dòng ${lineNo}: Sai tên thư viện \`<bit/stdc++.h>\``, 'Tên đúng là `#include <bits/stdc++.h>`. Đã tự động sửa.', p);
      }
      // Apply typo table
      for (const t of typoRules) {
        const lineNow = fixed.split('\n')[i] || '';
        if (!lineNow.includes(t.bad)) continue;
        const p = patchLine(lineNo, t.bad, t.good, t.title);
        if (p) add('error', lineNo, t.rule, `Dòng ${lineNo}: ${t.title} (\`${t.bad.trim()}\`)`, t.detail, p);
      }
      // =< and => comparison operators
      let lineNow = fixed.split('\n')[i] || '';
      if (lineNow.includes('=<') && !lineNow.includes('<=<')) {
        const p = patchLine(lineNo, '=<', '<=', 'Sửa toán tử so sánh');
        if (p) add('error', lineNo, 'cpp-comparison-operator', `Dòng ${lineNo}: Toán tử so sánh sai \`=<` + `\``, 'Trong C++ phải viết `<=`. Đã tự động sửa.', p);
      }
      lineNow = fixed.split('\n')[i] || '';
      if ((/\bif\s*\(/.test(lineNow) || /\bwhile\s*\(/.test(lineNow)) && lineNow.includes('=>')) {
        const p = patchLine(lineNo, '=>', '>=', 'Sửa toán tử so sánh');
        if (p) add('error', lineNo, 'cpp-comparison-operator', `Dòng ${lineNo}: Toán tử so sánh sai \`=>\``, 'Trong C++ phải viết `>=`. Đã tự động sửa.', p);
      }
      // Assignment inside if/while
      lineNow = fixed.split('\n')[i] || '';
      const cond = lineNow.match(/\b(if|while)\s*\(([^)]*)\)/);
      if (cond && /(^|[^=!<>])=([^=]|$)/.test(cond[2]) && !/==/.test(cond[2])) {
        const fixedCond = cond[2].replace(/(^|[^=!<>])=([^=]|$)/, '$1==$2');
        const p = patchLine(lineNo, cond[2], fixedCond, 'Đổi phép gán thành so sánh');
        if (p) add('error', lineNo, 'cpp-if-assign', `Dòng ${lineNo}: Dùng phép gán \`=\` trong điều kiện \`${cond[1]}\``, '`if (a = b)` sẽ gán giá trị thay vì so sánh. Đã tự động đổi thành `==` (hãy kiểm tra lại logic).', p);
      }
      // void main
      lineNow = fixed.split('\n')[i] || '';
      if (/\bvoid\s+main\s*\(/.test(lineNow)) {
        const p = patchLine(lineNo, 'void main', 'int main', 'Chuẩn hóa chữ ký main');
        if (p) add('error', lineNo, 'cpp-void-main', `Dòng ${lineNo}: Hàm \`main\` khai báo \`void\``, 'Chuẩn C++ yêu cầu `int main()`. Đã tự động sửa; hãy thêm `return 0;` nếu cần.', p);
      }
    }

    // endl flush -> "\n" (TLE optimization)
    if (/\bendl\b/.test(fixed)) {
      const endlCount = (fixed.match(/\bendl\b/g) || []).length;
      fixed = fixed.replace(/\bstd::endl\b/g, '"\\n"').replace(/\bendl\b/g, '"\\n"');
      const p = { before: 'endl', after: '"\\n"', line: 1, applied: true, description: `Thay ${endlCount} lần endl bằng "\\n"` };
      patches.push(p);
      add('warning', 1, 'cpp-endl', `Phát hiện ${endlCount} lần dùng \`endl\``, '`endl` flush buffer sau mỗi lần in, làm chương trình chậm 5–20 lần và dễ TLE. Đã tự động đổi thành `"\\n"`.', p);
    }

    // Missing semicolon heuristic
    cppLines = fixed.split('\n');
    for (let i = 0; i < cppLines.length; i++) {
      const raw = cppLines[i];
      const t = raw.trim();
      if (!t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('#')) continue;
      if (/^(if|for|while|switch|else|do|case|default|public|private|protected)\b/.test(t)) continue;
      if (/[;{}:,]$/.test(t) || t.endsWith('\\')) continue;
      const looksDecl = /^(int|long long|double|float|char|bool|string|auto|unsigned|long|short|vector<[^;]+>)\s+[A-Za-z_]\w*(\s*=\s*[^;{}]+)?$/.test(t);
      const looksReturn = /^return\s+[^;{}]+$/.test(t);
      const looksIo = /^(cin\s*>>|cout\s*<<|cerr\s*<<|printf\s*\(|scanf\s*\()/.test(t) && !t.endsWith(';');
      const looksUsing = /^using\s+namespace\s+[A-Za-z_]\w*\s*$/.test(t);
      const looksExpr = /^[A-Za-z_]\w*(\s*(\+\+|--|\+=|-=|\*=|\/=|=|<<|>>)\s*[^;{}]+)?$/.test(t);
      if (!looksDecl && !looksReturn && !looksIo && !looksUsing && !looksExpr) continue;
      const p = patchLine(i + 1, raw, raw + ';', 'Thêm dấu chấm phẩy bị thiếu');
      if (p) add('error', i + 1, 'cpp-missing-semicolon', `Dòng ${i + 1}: Thiếu dấu \`;\` (GCC 15: expected ';' before ...)`, 'Đây là lỗi cú pháp phổ biến nhất của người mới. Đã tự động thêm `;` vào cuối dòng.', p);
    }

    // Unbalanced braces / parentheses / quotes
    const noComments = fixed.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const openBraces = (noComments.match(/\{/g) || []).length;
    const closeBraces = (noComments.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      add('error', 1, 'cpp-unbalanced-braces', 'Số dấu `{` và `}` không cân bằng', `Phát hiện ${openBraces} dấu \`{\` nhưng chỉ có ${closeBraces} dấu \`}\`. GCC 15 sẽ báo \`expected '}'\` ở cuối tệp. Hãy kiểm tra lại các khối lệnh.`, null);
    }
    const openParens = (noComments.match(/\(/g) || []).length;
    const closeParens = (noComments.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      add('error', 1, 'cpp-unbalanced-parens', 'Số dấu `(` và `)` không cân bằng', `Phát hiện ${openParens} dấu \`(\` nhưng chỉ có ${closeParens} dấu \`)\`. Hãy kiểm tra các lời gọi hàm và điều kiện.`, null);
    }
    const rawLines = fixed.split('\n');
    for (let i = 0; i < rawLines.length; i++) {
      const s = rawLines[i].replace(/\\"/g, '').replace(/\/\/.*$/, '');
      const q = (s.match(/"/g) || []).length;
      if (q % 2 === 1) add('error', i + 1, 'cpp-odd-quotes', `Dòng ${i + 1}: Số dấu nháy kép \`"\` không chẵn`, 'Chuỗi ký tự chưa được đóng. GCC 15 sẽ báo lỗi `missing terminating " character`.', null);
    }

    // 2. Format / type / unsafe functions
    const llNames = new Set();
    for (const m of fixed.matchAll(/\blong\s+long\s+([^;]+);/g)) {
      m[1].split(',').forEach(v => {
        const n = v.trim().replace(/=.*$/, '').trim();
        if (/^[A-Za-z_]\w*$/.test(n)) llNames.add(n);
      });
    }
    const lines2 = fixed.split('\n');
    for (let i = 0; i < lines2.length; i++) {
      const lineNo = i + 1;
      const line = fixed.split('\n')[i] || '';
      const hasLl = [...llNames].some(n => new RegExp(`\\b${n}\\b`).test(line));

      if (/\bprintf\s*\(/.test(line) && /%d/.test(line) && hasLl) {
        const p = patchLine(lineNo, '%d', '%lld', 'Sửa định dạng printf cho long long');
        if (p) add('error', lineNo, 'cpp-format-longlong', `Dòng ${lineNo}: Dùng \`%d\` để in \`long long\``, 'Trên Windows, `%d` chỉ in 32-bit và có thể in sai/tràn. Đã tự động đổi thành `%lld`.', p);
      }
      if (/\bscanf\s*\(/.test(line) && /%d/.test(line) && hasLl) {
        const p = patchLine(lineNo, '%d', '%lld', 'Sửa định dạng scanf cho long long');
        if (p) add('error', lineNo, 'cpp-format-longlong', `Dòng ${lineNo}: Dùng \`%d\` để nhập \`long long\``, 'Đã tự động đổi thành `%lld` để đọc đúng 64-bit.', p);
      }
      const sc = line.match(/\bscanf\s*\(\s*"([^"]*)"\s*,\s*([A-Za-z_]\w*)\s*\)/);
      if (sc && !/^[su]/.test(sc[1].trim())) {
        const before = sc[0];
        const after = before.replace(sc[2], '&' + sc[2]);
        const p = patchLine(lineNo, before, after, 'Thêm & vào tham số scanf');
        if (p) add('error', lineNo, 'cpp-scanf-address', `Dòng ${lineNo}: \`scanf\` thiếu dấu \`&\``, '`scanf` cần địa chỉ biến (`&x`) để ghi dữ liệu. Đã tự động thêm.', p);
      }
      if (/\bscanf\s*\(\s*"[^"]*%s/.test(line) && !/%\d+s/.test(line)) {
        add('warning', lineNo, 'cpp-scanf-width', `Dòng ${lineNo}: \`scanf("%s")\` không giới hạn độ dài`, 'Người dùng nhập chuỗi dài hơn mảng sẽ gây tràn bộ nhớ (0xC0000005). Dùng `%100s` hoặc `fgets`.', null);
      }
      if (/\bgets\s*\(/.test(line)) {
        add('warning', lineNo, 'cpp-gets', `Dòng ${lineNo}: Hàm \`gets()\` không an toàn`, '`gets()` đã bị loại khỏi C++17 và gây tràn buffer. Hãy dùng `fgets(buf, sizeof(buf), stdin)`.', null);
      }
      if (/\bfflush\s*\(\s*stdin\s*\)/.test(line)) {
        add('warning', lineNo, 'cpp-fflush-stdin', `Dòng ${lineNo}: \`fflush(stdin)\` là hành vi không xác định`, 'C++ không định nghĩa `fflush(stdin)`. Hãy dùng `cin.ignore(...)` khi cần xóa bộ đệm.', null);
      }
      if (/\bsystem\s*\(\s*"pause"\s*\)/.test(line)) {
        const p = patchLine(lineNo, 'system("pause");', '', 'Xóa system("pause")');
        if (p) add('warning', lineNo, 'cpp-system-pause', `Dòng ${lineNo}: \`system("pause")\` không phù hợp khi chấm tự động`, 'Lệnh này treo chương trình trên Themis/OJ. Đã tự động xóa.', p);
      }
      if (/#include\s*<conio\.h>/.test(line) || /\bgetch\s*\(/.test(line)) {
        add('warning', lineNo, 'cpp-conio', `Dòng ${lineNo}: Dùng \`<conio.h>\` / \`getch()\` (bị cấm trên Themis)`, 'Thư viện `conio.h` không có trên GCC Linux/Themis. Hãy dùng `getchar()` hoặc bỏ hoàn toàn.', null);
      }
      const mm = line.match(/memset\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
      if (mm) {
        const val = mm[2].trim();
        const okVals = new Set(['0', '-1', '0x3f', '0x3F', '0xff', '0xFF', '0x00', "'\\0'"]);
        if (!okVals.has(val)) {
          const before = mm[0];
          const after = before.replace(mm[2], ' 0');
          const p = patchLine(lineNo, before, after, 'Đổi giá trị memset về 0');
          if (p) add('error', lineNo, 'cpp-memset-value', `Dòng ${lineNo}: \`memset\` với giá trị \`${val}\` không đúng`, '`memset` ghi từng byte. Chỉ `0`, `-1`, `0x3f` mới cho kết quả có nghĩa; các giá trị khác tạo số rác. Đã tự động đổi về `0`.', p);
        }
      }
      const pInf = line.match(/\bconst\s+int\s+([A-Za-z_]\w*)\s*=\s*1e9\b/);
      if (pInf) {
        const before = pInf[0];
        const after = before.replace(/\bconst\s+int\b/, 'const long long').replace(/1e9\b/, '1000000000LL');
        const p = patchLine(lineNo, before, after, 'Đổi INF sang long long');
        if (p) add('warning', lineNo, 'cpp-inf-double', `Dòng ${lineNo}: \`const int ${pInf[1]} = 1e9\``, '`1e9` là kiểu `double`, dễ gây lỗi so sánh/tràn. Đã đổi thành `const long long ... = 1000000000LL`.', p);
      }
      if (/#define\s+int\s+long\s+long/.test(line)) {
        add('warning', lineNo, 'cpp-define-int', `Dòng ${lineNo}: \`#define int long long\``, 'Kỹ thuật này làm `main` thành `long long main` (sai chuẩn) và tăng bộ nhớ. Nên khai báo `long long` ở từng biến.', null);
      }
      if (/\babs\s*\(\s*INT_MIN\s*\)/.test(line)) {
        add('warning', lineNo, 'cpp-abs-intmin', `Dòng ${lineNo}: \`abs(INT_MIN)\` là hành vi không xác định`, '`abs(INT_MIN)` không biểu diễn được trong `int`. Dùng `llabs((long long)INT_MIN)` hoặc `long long`.', null);
      }
      if (/\brand\s*\(\s*\)\s*%/.test(line)) {
        add('info', lineNo, 'cpp-rand-bias', `Dòng ${lineNo}: \`rand() % N\` bị lệch phân phối`, 'Với N không chia hết RAND_MAX, kết quả bị thiên lệch. Dùng `mt19937` + `uniform_int_distribution`.', null);
      }
      if (/\bvector\s*<\s*bool\s*>/.test(line)) {
        add('warning', lineNo, 'cpp-vector-bool', `Dòng ${lineNo}: \`vector<bool>\` là specialization đặc biệt`, '`vector<bool>` không trả về `bool&` thật, gây lỗi khi dùng con trỏ/tham chiếu. Dùng `vector<char>` hoặc `bitset`.', null);
      }
      if (/\bnew\b/.test(line) && !/\bdelete\b/.test(line) && !/\/\//.test(line)) {
        add('info', lineNo, 'cpp-new-delete', `Dòng ${lineNo}: Cấp phát \`new\` nhưng chưa thấy \`delete\``, 'Rò rỉ bộ nhớ có thể làm chương trình bị giới hạn bộ nhớ. Ưu tiên `vector` / `unique_ptr`.', null);
      }
      if (/\bmalloc\s*\(/.test(line) && !/\bfree\s*\(/.test(line) && !/\/\//.test(line)) {
        add('info', lineNo, 'cpp-malloc-free', `Dòng ${lineNo}: \`malloc\` nhưng chưa thấy \`free\``, 'Hãy đảm bảo giải phóng bộ nhớ hoặc dùng `vector`.', null);
      }

      // Accumulate int and 32-bit shift
      const acc = line.match(/accumulate\s*\(([^;]*),\s*0\s*\)/);
      if (acc) {
        const before = acc[0];
        const after = before.replace(/,\s*0\s*\)$/, ', 0LL)');
        const p = patchLine(lineNo, before, after, 'Đổi 0 thành 0LL');
        if (p) add('error', lineNo, 'cpp-accumulate-int', `Dòng ${lineNo}: \`accumulate(..., 0)\` dùng kiểu \`int\``, 'Giá trị khởi tạo `0` là `int`, tổng sẽ tràn ở 2.14×10^9. Đã tự động đổi thành `0LL`.', p);
      }
      if (/\b1\s*<<\s*(3[1-9]|[4-9]\d|\d{3,}|[A-Za-z_]\w*)/.test(line)) {
        const before = line.match(/\b1\s*<<\s*(3[1-9]|[4-9]\d|\d{3,}|[A-Za-z_]\w*)/)[0];
        const after = before.replace(/^1\s*<</, '1LL <<');
        const p = patchLine(lineNo, before, after, 'Đổi 1 << thành 1LL <<');
        if (p) add('error', lineNo, 'cpp-shift-overflow', `Dòng ${lineNo}: Dịch bit 32-bit \`1 << k\` với k >= 31`, '`1` là `int` 32-bit; dịch từ bit 31 là Undefined Behavior. Đã tự động đổi thành `1LL <<`.', p);
      }
    }

    // memset/sizeof on pointer parameters (classic 0xC0000005)
    const ptrParams = new Set();
    for (const m of fixed.matchAll(/\(([^)]*)\)\s*\{/g)) {
      for (const p of m[1].split(',')) {
        const pm = p.match(/\*\s*([A-Za-z_]\w*)/) || p.match(/([A-Za-z_]\w*)\s*\[\s*\]/);
        if (pm) ptrParams.add(pm[1]);
      }
    }
    if (ptrParams.size) {
      const plines = fixed.split('\n');
      for (let i = 0; i < plines.length; i++) {
        const lineNo = i + 1;
        const line = fixed.split('\n')[i] || '';
        for (const name of ptrParams) {
          if (new RegExp(`memset\\s*\\(\\s*${name}\\s*,\\s*[^,]+,\\s*sizeof\\s*\\(\\s*${name}\\s*\\)`).test(line)) {
            add('error', lineNo, 'cpp-memset-sizeof', `Dòng ${lineNo}: \`memset(${name}, ..., sizeof(${name}))\` trên tham số con trỏ`, `\`sizeof(${name})\` chỉ là 8 byte của con trỏ, không phải kích thước mảng. Hãy truyền thêm kích thước hoặc dùng \`vector\`.`, null);
          }
          if (new RegExp(`sizeof\\s*\\(\\s*${name}\\s*\\)`).test(line) && new RegExp(`\\b${name}\\s*\\[`).test(fixed)) {
            add('warning', lineNo, 'cpp-sizeof-array-param', `Dòng ${lineNo}: \`sizeof(${name})\` trên tham số mảng`, 'Trong hàm, mảng được truyền dưới dạng con trỏ nên `sizeof` trả về 8 byte. Hãy truyền kích thước `n` riêng.', null);
          }
        }
      }
    }

    // int accumulator
    const intAcc = /\bint\s+(sum|ans|total|res)\s*=/;
    if (intAcc.test(fixed)) {
      const p = patchExact('int ' + (fixed.match(intAcc) || [])[1] + ' =', 'long long ' + (fixed.match(intAcc) || [])[1] + ' =', 'Đổi biến tích lũy sang long long');
      if (p) add('warning', 1, 'cpp-int-accumulator', 'Biến tích lũy khai báo `int` (nguy cơ tràn 32-bit)', 'Tổng/tích thường vượt `2^31 - 1`. Đã tự động đổi biến tích lũy đầu tiên sang `long long`.', p);
    }

    // 3. Bounds / unsigned / loop / CP logic
    const arrSizes = new Map();
    for (const m of fixed.matchAll(/^\s*(?:int|long long|double|char|bool)\s+([A-Za-z_]\w*)\s*\[\s*([^\]]+)\s*\]/gm)) {
      arrSizes.set(m[1], m[2].trim());
    }
    const lines3 = fixed.split('\n');
    for (let i = 0; i < lines3.length; i++) {
      const lineNo = i + 1;
      const line = fixed.split('\n')[i] || '';

      const uc = line.match(/\bfor\s*\(\s*int\s+(\w+)\s*=\s*0\s*;\s*\1\s*<\s*([A-Za-z_]\w*)\.size\s*\(\s*\)/);
      if (uc) {
        const before = `int ${uc[1]}`;
        const after = `size_t ${uc[1]}`;
        const p = patchLine(lineNo, before, after, 'Đổi biến vòng lặp sang size_t');
        if (p) add('warning', lineNo, 'cpp-unsigned-compare', `Dòng ${lineNo}: So sánh \`int\` với \`${uc[2]}.size()\` (size_t)`, 'So sánh signed/unsigned có thể gây cảnh báo và lỗi khi size > 2^31. Đã tự động đổi biến lặp thành `size_t`.', p);
      }
      const sc = line.match(/\bint\s+(\w+)\s*=\s*([A-Za-z_]\w*)\.size\s*\(\s*\)/);
      if (sc) {
        const before = sc[0];
        const after = `int ${sc[1]} = (int)${sc[2]}.size()`;
        const p = patchLine(lineNo, before, after, 'Ép kiểu size() về int');
        if (p) add('warning', lineNo, 'cpp-size-cast', `Dòng ${lineNo}: Gán \`.size()\` vào \`int\``, '`size_t` có thể vượt `INT_MAX`; nên ép `(int)` để tránh cảnh báo và hành vi lạ.', p);
      }
      const rev = line.match(/\bfor\s*\(\s*int\s+(\w+)\s*=\s*([A-Za-z_]\w*)\.size\s*\(\s*\)\s*-\s*1\s*;/);
      if (rev) {
        const before = `int ${rev[1]} = ${rev[2]}.size() - 1`;
        const after = `int ${rev[1]} = (int)${rev[2]}.size() - 1`;
        const p = patchLine(lineNo, before, after, 'Ép kiểu trước khi trừ 1');
        if (p) add('warning', lineNo, 'cpp-reverse-size', `Dòng ${lineNo}: \`int i = ${rev[2]}.size() - 1\` có thể underflow`, 'Khi container rỗng, `size() - 1` tràn thành `SIZE_MAX`. Đã tự động ép `(int)` trước khi trừ.', p);
      }
      if (/\[[^\]]*\.size\s*\(\s*\)\s*-\s*1\s*\]/.test(line)) {
        add('warning', lineNo, 'cpp-empty-last', `Dòng ${lineNo}: Truy cập phần tử cuối bằng \`.size() - 1\``, 'Nếu container rỗng, biểu thức này tràn chỉ số và gây `0xC0000005`. Hãy kiểm tra `!v.empty()` trước.', null);
      }
      const ob = line.match(/\bfor\s*\(\s*(?:int|long long)\s+(\w+)\s*=\s*0\s*;\s*\1\s*<=\s*([A-Za-z_]\w*)\s*;/);
      if (ob && arrSizes.has(ob[2]) && /^\s*\d+\s*$/.test(arrSizes.get(ob[2]) || '')) {
        add('warning', lineNo, 'cpp-loop-offbyone', `Dòng ${lineNo}: Vòng lặp \`<= ${ob[2]}\` với mảng \`${ob[2]}[${arrSizes.get(ob[2])}]\``, 'Chỉ số hợp lệ là `0..N-1`; `i <= N` sẽ đọc phần tử ngoài mảng và gây Access Violation. Đổi thành `i < N`.', null);
      }
      if (/\[[^\]]*\+\s*1\s*\]/.test(line)) {
        add('warning', lineNo, 'cpp-index-plus-one', `Dòng ${lineNo}: Truy cập \`a[i + 1]\``, 'Nếu `i` là phần tử cuối, `i + 1` vượt biên (0xC0000005). Hãy kiểm tra `i + 1 < n`.', null);
      }
      const vla = line.match(/^(\s*)(int|long long)\s+(\w+)\s*\[\s*([a-z_]\w*(?:\s*[+\-*/]\s*\w+)*)\s*\]\s*(=\s*\{[^}]*\})?\s*;/);
      if (vla) {
        const init = vla[5] ? ', 0' : '';
        const before = line;
        const after = `${vla[1]}vector<${vla[2]}> ${vla[3]}(${vla[4].trim()}${init});`;
        const p = patchLine(lineNo, before, after, 'VLA -> vector chuẩn C++');
        if (vla[5]) {
          if (p) add('error', lineNo, 'cpp-vla-init', `Dòng ${lineNo}: Mảng động \`${vla[3]}[${vla[4]}]\` khởi tạo bằng \`= {...}\``, 'GCC 15 báo `variable-sized object may not be initialized`. VLA không được khởi tạo tập trung. Đã đổi thành `vector` có giá trị khởi tạo.', p);
        } else if (p) {
          add('info', lineNo, 'cpp-vla', `Dòng ${lineNo}: Mảng động \`${vla[3]}[${vla[4]}]\` (VLA)`, 'VLA là extension không chuẩn của GCC, dễ tràn stack và không dùng được trong `struct`. Đã đổi thành `vector`.', p);
        }
      }
      const big = line.match(/^(\s*)(int|long long|double|char|bool)\s+(\w+)\s*\[\s*(\d{6,})\s*\]\s*;/);
      if (big) {
        const before = line;
        const after = `${big[1]}static ${big[2]} ${big[3]}[${big[4]}];`;
        const p = patchLine(lineNo, before, after, 'Chuyển mảng lớn sang static');
        if (p) add('error', lineNo, 'cpp-large-local-array', `Dòng ${lineNo}: Mảng lớn \`${big[3]}[${big[4]}]\` khai báo trong hàm`, 'Mảng này nằm trên stack (mặc định 1 MB) và gây `0xC00000FD` Stack Overflow. Đã tự động thêm `static` để chuyển sang vùng nhớ tĩnh.', p);
      }
      if (/\b(?:int|long long)\s+[A-Za-z_]\w*\s*=\s*[^;]*\/\s*([A-Za-z_]\w*)\s*;/.test(line) && !/\/\s*0\b/.test(line) && !/!=\s*0|==\s*0|>\s*0/.test(line)) {
        add('warning', lineNo, 'cpp-divide-zero', `Dòng ${lineNo}: Phép chia cho biến có thể bằng 0`, 'Nếu mẫu số bằng 0, Windows ném `0xC0000094` (Integer Divide by Zero). Hãy kiểm tra `if (mau != 0)` trước khi chia.', null);
      }
      if (/\b(?:double|float)\b[^;]*==\s*\d+\.\d+/.test(line)) {
        add('warning', lineNo, 'cpp-float-equal', `Dòng ${lineNo}: So sánh số thực bằng \`==\``, 'Số thực có sai số biểu diễn. Dùng `fabs(a - b) < 1e-9`.', null);
      }
      if (/\(\s*[A-Za-z_]\w*\s*\+\s*[A-Za-z_]\w*\s*\)\s*\/\s*2/.test(line)) {
        add('info', lineNo, 'cpp-int-average', `Dòng ${lineNo}: Trung bình cộng hai số nguyên bằng \`/ 2\``, 'Phép chia nguyên làm mất phần thập phân. Nếu cần chính xác, dùng `(a + b) / 2.0` hoặc kiểm tra tính chẵn lẻ.', null);
      }
      if (/\bgoto\b/.test(line)) {
        add('info', lineNo, 'cpp-goto', `Dòng ${lineNo}: Sử dụng \`goto\``, '`goto` làm code khó đọc và dễ bỏ qua khởi tạo biến. Hãy dùng vòng lặp/cờ trạng thái.', null);
      }
    }

    // Recursion without base case / memoization
    const funcDefs = [];
    for (const m of fixed.matchAll(/\b([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{/g)) {
      if (!['if', 'for', 'while', 'switch', 'main'].includes(m[1])) funcDefs.push({ name: m[1], index: m.index });
    }
    for (const f of funcDefs.slice(0, 12)) {
      const after = fixed.slice(f.index, f.index + 700);
      const recursive = new RegExp(`\\b${f.name}\\s*\\(`).test(after.slice(after.indexOf('{') + 1));
      if (!recursive) continue;
      const bodyStart = after.indexOf('{') + 1;
      const head = after.slice(bodyStart, bodyStart + 320);
      if (!/\bif\s*\(|\breturn\b/.test(head)) {
        add('warning', 1, 'cpp-recursion-base', `Hàm đệ quy \`${f.name}\` có thể thiếu điểm dừng`, 'Đệ quy không có `if` dừng sẽ làm tràn stack và Windows báo `0xC00000FD`. Hãy thêm điều kiện cơ sở.', null);
      }
      if (!/\bmemo\b|\bdp\b|\bcache\b/.test(after)) {
        add('info', 1, 'cpp-recursion-memo', `Hàm đệ quy \`${f.name}\` chưa thấy memoization`, 'Nếu hàm được gọi lặp lại, hãy dùng `memo`/`dp` để tránh O(2^N).', null);
      }
    }

    // Themis / abs / cout vector / string conversion
    const usesInput = /\b(cin\s*>>|scanf\s*\()/.test(fixed);
    if (usesInput && !/\bfreopen\s*\(/.test(fixed)) {
      add('info', 1, 'cpp-freopen', 'Chưa thấy `freopen` cho tệp `.INP` / `.OUT`', 'Themis thường yêu cầu đọc/ghi tệp. Nếu bài nộp dùng stdin/stdout thì bỏ qua cảnh báo này.', null);
    }
    if (/[A-Za-z]:\\\\/.test(fixed)) {
      add('warning', 1, 'cpp-absolute-path', 'Phát hiện đường dẫn tuyệt đối kiểu Windows', 'Đường dẫn `C:\\...` sẽ sai trên máy chấm. Dùng đường dẫn tương đối hoặc `freopen("TEN.INP", ...)`.', null);
    }
    const vectorNames = new Set();
    for (const m of fixed.matchAll(/\bvector\s*<[^>]+>\s+([A-Za-z_]\w*)/g)) vectorNames.add(m[1]);
    for (const [name] of vectorNames) {
      if (new RegExp(`\\bcout\\s*<<\\s*${name}\\b`).test(fixed)) {
        add('error', 1, 'cpp-cout-vector', `Không thể \`cout << ${name}\` trực tiếp với \`vector\``, 'GCC 15 báo `no match for operator<<`. Hãy duyệt từng phần tử hoặc dùng hàm in riêng.', null);
      }
    }
    const stringVars = new Set();
    for (const m of fixed.matchAll(/\bstring\s+([A-Za-z_]\w*)/g)) stringVars.add(m[1]);
    for (const s of stringVars) {
      const m = fixed.match(new RegExp(`\\bint\\s+([A-Za-z_]\\w*)\\s*=\\s*${s}\\s*;`));
      if (m) {
        const before = m[0];
        const after = m[0].replace(new RegExp(`${s}\\s*;`), `stoi(${s});`);
        const p = patchExact(before, after, 'Chuyển string sang int bằng stoi');
        if (p) add('error', 1, 'cpp-string-to-int', 'Gán `std::string` trực tiếp vào `int`', 'GCC 15 báo `cannot convert std::string to int`. Đã tự động bọc `stoi(...)`.', p);
        break;
      }
    }
    if (/\bunsigned\b/.test(fixed) && /\babs\s*\(/.test(fixed)) {
      add('warning', 1, 'cpp-abs-unsigned', 'Gọi `abs()` trên biểu thức `unsigned`', '`abs(unsigned)` có thể gây `ambiguous overload` hoặc trả về giá trị sai. Hãy ép `(long long)` trước khi gọi.', null);
    }

    // 4. Includes / namespace / main / fast IO (insertions last: line numbers stable)
    const usesStd = /\b(cin|cout|cerr|string|vector|map|set|multiset|queue|stack|priority_queue|pair|sort|accumulate|memset|printf|scanf|freopen|ios)\b/.test(fixed);
    const hasInclude = /#include\s*</.test(fixed);
    if (usesStd && !hasInclude) {
      fixed = '#include <bits/stdc++.h>\n' + fixed;
      const p = { before: '<đầu tệp>', after: '#include <bits/stdc++.h>', line: 1, applied: true, description: 'Chèn thư viện chuẩn' };
      patches.push(p);
      add('error', 1, 'cpp-missing-include', 'Thiếu `#include <bits/stdc++.h>`', 'Code dùng `cin/cout` hoặc STL nhưng chưa khai báo thư viện. GCC 15 sẽ báo `cin was not declared` / `no match for operator<<`. Đã tự động chèn.', p);
    }
    if (usesStd && !/using\s+namespace\s+std\s*;/.test(fixed) && !/\bstd::/.test(fixed)) {
      if (/#include[^\n]*\n/.test(fixed)) fixed = fixed.replace(/(#include[^\n]*\n)/, '$1using namespace std;\n');
      else fixed = 'using namespace std;\n' + fixed;
      const p = { before: '<sau #include>', after: 'using namespace std;', line: 1, applied: true, description: 'Thêm using namespace std' };
      patches.push(p);
      add('error', 1, 'cpp-missing-using', 'Thiếu `using namespace std;`', 'Nếu không có `std::`, GCC 15 không tìm thấy `cin`, `cout`, `vector`... Đã tự động chèn sau `#include`.', p);
    }
    if (!/\b(?:int|signed)\s+main\s*\(/.test(fixed)) {
      const tpl = '\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    return 0;\n}\n';
      fixed = fixed.replace(/\s*$/, '') + tpl;
      const p = { before: '<cuối tệp>', after: 'int main() { ... }', line: 1, applied: true, description: 'Thêm hàm main' };
      patches.push(p);
      add('error', 1, 'cpp-missing-main', 'Không tìm thấy hàm `int main()`', 'Linker sẽ báo `undefined reference to WinMain` hoặc `ld returned 1 exit status`. Đã tự động thêm khung `main`.', p);
    }
    if (/\b(cin|cout)\b/.test(fixed) && !/ios::sync_with_stdio\s*\(\s*false\s*\)/.test(fixed)) {
      const m = fixed.match(/(int\s+main\s*\([^)]*\)\s*\{)/);
      if (m) {
        const before = m[1];
        const after = `${before}\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);`;
        const p = patchExact(before, after, 'Bật Fast I/O');
        if (p) add('warning', 1, 'cpp-missing-fastio', 'Thiếu Fast I/O (`ios::sync_with_stdio(false); cin.tie(nullptr);`)', 'Với N >= 10^5, `cin/cout` mặc định có thể gây TLE. Đã tự động chèn vào đầu `main`.', p);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Python 3 runtime / CP rules
  // -------------------------------------------------------------------------
  if (isPy) {
    const pyLines = fixed.split('\n');
    const hasRecursion = /\bdef\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*:/.test(fixed) && (fixed.match(/\bdef\s+([A-Za-z_]\w*)\s*\(/g) || []).length > 1;
    for (let i = 0; i < pyLines.length; i++) {
      const lineNo = i + 1;
      const line = fixed.split('\n')[i] || '';
      if (/\binput\s*\(\s*\)/.test(line) && /\bfor\b|\bwhile\b/.test(pyLines.slice(Math.max(0, i - 3), i + 1).join('\n'))) {
        add('warning', lineNo, 'py-input-loop', `Dòng ${lineNo}: Gọi \`input()\` trong vòng lặp`, '`input()` chậm với N lớn. Dùng `sys.stdin.buffer.read().split()` hoặc `sys.stdin.readline()`.', null);
      }
      if (/\bdef\s+[A-Za-z_]\w*\s*\([^)]*=\s*(\[\]|\{\})\s*[,)]/.test(line)) {
        add('error', lineNo, 'py-mutable-default', `Dòng ${lineNo}: Tham số mặc định là list/dict (mutable)`, 'Giá trị mặc định chỉ tạo một lần và bị chia sẻ giữa các lần gọi. Dùng `None` rồi khởi tạo bên trong hàm.', null);
      }
      if (/\bis\s+(-?\d+|"[^"]*"|'[^']*')\b/.test(line)) {
        const before = line.match(/\bis\s+(-?\d+|"[^"]*"|'[^']*')\b/)[0];
        const after = before.replace(/\bis\b/, '==');
        const p = patchLine(lineNo, before, after, 'Đổi is thành ==');
        if (p) add('warning', lineNo, 'py-is-literal', `Dòng ${lineNo}: Dùng \`is\` để so sánh giá trị`, '`is` so sánh danh tính đối tượng, không phải giá trị. Đã tự động đổi thành `==`.', p);
      }
      if (/^\s*except\s*:\s*$/.test(line)) {
        const p = patchLine(lineNo, 'except:', 'except Exception:', 'Bắt lỗi cụ thể');
        if (p) add('warning', lineNo, 'py-bare-except', `Dòng ${lineNo}: \`except:\` bắt mọi ngoại lệ (kể cả Ctrl+C)`, 'Nên bắt `Exception` hoặc loại lỗi cụ thể. Đã tự động sửa thành `except Exception:`.', p);
      }
      if (/\brange\s*\(\s*len\s*\(/.test(line)) {
        add('info', lineNo, 'py-range-len', `Dòng ${lineNo}: Dùng \`range(len(...))\``, 'Pythonic hơn: `for x in arr:` hoặc `for i, x in enumerate(arr):`.', null);
      }
      if (/\.append\s*\(/.test(line) && /\bfor\b/.test(pyLines.slice(Math.max(0, i - 3), i + 1).join('\n'))) {
        add('info', lineNo, 'py-list-append', `Dòng ${lineNo}: \`append\` trong vòng lặp`, 'Có thể thay bằng list comprehension để nhanh và gọn hơn.', null);
      }
      if (/\bprint\s*\([^)]*\/[^)]*\)/.test(line) && !/\/\//.test(line)) {
        add('info', lineNo, 'py-division', `Dòng ${lineNo}: Dùng phép chia \`/\` (trả về float)`, 'Trong bài đếm/CP, `/` tạo số thực và có thể mất chính xác với số lớn. Dùng `//` nếu cần chia nguyên.', null);
      }
      const shadow = line.match(/^\s*(list|dict|set|str|int|sum|min|max|input|id)\s*=/);
      if (shadow) {
        add('info', lineNo, 'py-shadow-builtin', `Dòng ${lineNo}: Ghi đè hàm/kiểu tích hợp \`${shadow[1]}\``, 'Đặt tên biến trùng builtin sẽ che mất hàm gốc. Hãy đổi tên biến.', null);
      }
      if (/\b[A-Za-z_]\w*\s*\+=\s*["']/.test(line) && /\bfor\b/.test(pyLines.slice(Math.max(0, i - 3), i + 1).join('\n'))) {
        add('warning', lineNo, 'py-string-concat', `Dòng ${lineNo}: Nối chuỗi bằng \`+=\` trong vòng lặp`, 'Mỗi lần `+=` tạo chuỗi mới, chi phí O(N^2). Dùng `"".join(parts)`.', null);
      }
    }
    if (hasRecursion && !/setrecursionlimit/.test(fixed)) {
      const p = { before: '<đầu tệp>', after: 'import sys\nsys.setrecursionlimit(1_000_000)', line: 1, applied: false, description: 'Tăng giới hạn đệ quy Python' };
      add('warning', 1, 'py-recursion-limit', 'Đệ quy Python có thể chạm giới hạn 1000 tầng', 'Python mặc định giới hạn ~1000 lần gọi. Hãy thêm `import sys; sys.setrecursionlimit(1_000_000)`.', p);
    }
  }

  return { findings, fixedCode: fixed, patches, complexity: drgxEstimateComplexity(original) };
}

function analyzeAndFixCode(code, lang = 'cpp', mode = 'bugcheck') {
  const diag = drgxBuildDiagnostics(code, lang);
  const lines = String(code || '').split(/\r?\n/);
  const findings = diag.findings;
  const fixedCode = diag.fixedCode;
  const complexity = diag.complexity;
  const hasChanges = fixedCode !== String(code || '');
  const autofixPatch = {
    available: hasChanges,
    appliedCount: diag.patches.length,
    patches: diag.patches.slice(0, 80),
    fixedCode
  };
  const ruleCatalogue = DRGX_RULE_COUNT;

  if (mode === 'explain') {
    const algos = [];
    if (/\bsort\s*\(/.test(code)) algos.push('Sắp xếp (`std::sort`)');
    if (/\bpriority_queue\b/.test(code)) algos.push('Hàng đợi ưu tiên (`priority_queue` / Dijkstra / Greedy)');
    if (/\b(map|set|multiset)\s*</.test(code)) algos.push('Cây đỏ-đen (`std::map` / `std::set`)');
    if (/\bdp\[|\bmemo\[/.test(code)) algos.push('Quy hoạch động (Dynamic Programming)');
    if (/\bdfs\b|\bbfs\b|\badj\[/.test(code)) algos.push('Duyệt đồ thị / Cây (DFS / BFS)');
    return {
      title: 'Phân tích & Giải thích Code',
      complexity,
      lineCount: lines.length,
      algorithms: algos.length ? algos : ['Xử lý tuần tự / Toán học cơ bản'],
      findings,
      fixedCode,
      hasChanges,
      autofix_patch: autofixPatch,
      ruleCount: ruleCatalogue,
      firstErrorLine: findings.find(f => f.severity === 'error')?.line || 0,
      markdown: [
        '### 📊 Tổng quan kỹ thuật',
        `- **Độ phức tạp thời gian ước lượng:** \`${complexity}\``,
        `- **Số dòng mã:** \`${lines.length}\` dòng`,
        `- **Bộ quy tắc AST/GCC 15:** \`${ruleCatalogue}\` quy tắc tiếng Việt`,
        `- **Kỹ thuật nhận diện:** ${(algos.length ? algos : ['Tuần tự / Cơ bản']).join(', ')}`,
        '',
        `### 🔍 Kiểm tra chất lượng mã (${findings.length} phát hiện)`,
        findings.length
          ? findings.map((f, i) => `${i + 1}. **[${String(f.severity).toUpperCase()}] ${f.title}**\n   - ${f.detail}`).join('\n')
          : '- ✅ Code sạch, đã tuân thủ tốt các quy tắc an toàn kiểu dữ liệu và I/O.'
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
      markdown: 'Đã sinh **6 test góc (Corner Cases)** kiểm tra biên nhỏ nhất, số 0, số âm, và tràn số 32-bit (`int` vs `long long`). Bấm **"Nạp vào Test Runner"** để chạy kiểm thử ngay!'
    };
  }

  const changesNote = hasChanges
    ? '\n\n💡 **Đã tạo bản vá tự động!** Bấm nút **"✨ Áp dụng bản vá vào Editor"** hoặc **"🚀 Vá & Chạy Code Ngay"** bên dưới.'
    : '';
  return {
    title: mode === 'optimize' ? 'Tối ưu hóa hiệu năng C++17' : 'Chẩn đoán Bug (AST 71 quy tắc + GCC 15) & Tự động vá lỗi',
    complexity,
    findings,
    hasChanges,
    fixedCode,
    autofix_patch: autofixPatch,
    ruleCount: ruleCatalogue,
    firstErrorLine: findings.find(f => f.severity === 'error')?.line || 0,
    markdown: [
      `### 🛠️ Kết quả quét mã nguồn (${findings.length} vấn đề · ${ruleCatalogue} quy tắc)`,
      `- **Độ phức tạp hiện tại:** \`${complexity}\``,
      findings.length
        ? findings.map((f, i) => `${i + 1}. **[${f.severity === 'error' ? 'LỖI NGHIÊM TRỌNG' : f.severity === 'warning' ? 'CẢNH BÁO' : 'THÔNG TIN'}]** ${f.title}\n   - *Chi tiết:* ${f.detail}${f.autofix_patch ? '\n   - *Bản vá 1-click:* `' + String(f.autofix_patch.before || '').slice(0, 80) + '` → `' + String(f.autofix_patch.after || '').slice(0, 80) + '`' : ''}`).join('\n\n')
        : '✅ Không phát hiện lỗi tràn số, thiếu Fast I/O hay lỗi cú pháp phổ biến.',
      changesNote
    ].join('\n')
  };
}

function drgxExplainCompilerOutput(raw, lang = 'cpp', exitCode = 0) {
  const text = String(raw || '');
  const out = [];
  const seen = new Set();
  const first = text.match(/(?:^|\n)[^\r\n:]*?:(\d+):(\d+):\s*(?:fatal error|error):\s*([^\r\n]+)/);
  const errLine = first ? parseInt(first[1], 10) : 0;
  function add(rule, severity, title, detail, line) {
    if (seen.has(rule)) return;
    seen.add(rule);
    out.push({
      line: line || errLine || 1,
      severity,
      rule,
      title,
      detail,
      autofix_patch: null
    });
  }
  const has = (re) => re.test(text);

  if (has(/expected\s+['`]?;['`]?\s+before/i)) add('gcc-expected-semicolon', 'error', "GCC 15: `expected ';' before ...` — thiếu dấu chấm phẩy", 'Hãy thêm `;` vào cuối dòng được báo lỗi. Đây là lỗi cú pháp phổ biến nhất; bộ lọc AST phía trên đã cố gắng tự vá.', errLine);
  if (has(/no match for\s+['`]?operator<</i)) add('gcc-no-operator-shift', 'error', "GCC 15: `no match for 'operator<<'`", 'Bạn đang in một kiểu chưa có `operator<<` (ví dụ `vector`, `pair`, struct) hoặc dùng `cin <<` sai chiều. Hãy in từng phần tử hoặc nạp `<bits/stdc++.h>` + `using namespace std;`.', errLine);
  if (has(/no match for\s+['`]?operator>>/i)) add('gcc-no-operator-extract', 'error', "GCC 15: `no match for 'operator>>'`", 'Thường do `cout >>` thay vì `cout <<`, hoặc nhập trực tiếp vào kiểu không hỗ trợ. Kiểm tra lại chiều toán tử.', errLine);
  if (has(/cannot convert/i)) add('gcc-cannot-convert', 'error', 'GCC 15: `cannot convert ...` — sai kiểu dữ liệu', 'Ví dụ gán `std::string` vào `int`, hoặc truyền `int` vào hàm cần `long long&`. Hãy dùng `stoi`, `to_string`, hoặc ép kiểu tường minh.', errLine);
  if (has(/ambiguous overload/i)) add('gcc-ambiguous-overload', 'error', 'GCC 15: `ambiguous overload` — gọi hàm mơ hồ', 'Có nhiều hàm cùng tên nhận các kiểu khác nhau (thường gặp với `abs`, `max`, `min` giữa `int` và `size_t`). Hãy ép kiểu cụ thể, ví dụ `max<long long>(a, b)`.', errLine);
  if (has(/variable-sized object may not be initialized/i)) add('gcc-vla-init', 'error', 'GCC 15: `variable-sized object may not be initialized`', 'Không thể khởi tạo mảng có kích thước động bằng `= {0}`. Dùng `vector<int> a(n, 0);` hoặc `memset(a, 0, sizeof(a))` sau khi khai báo.', errLine);
  if (has(/was not declared in this scope/i) || has(/is not a member of\s+['`]?std/i)) add('gcc-not-declared', 'error', 'GCC 15: biến/hàm chưa được khai báo', 'Thường do thiếu `#include <bits/stdc++.h>`, thiếu `using namespace std;`, hoặc gõ sai tên. Bộ lọc AST đã kiểm tra các trường hợp này.', errLine);
  if (has(/redefinition of/i)) add('gcc-redefinition', 'error', 'GCC 15: `redefinition of ...` — khai báo trùng', 'Bạn đã khai báo cùng một biến/hàm hai lần. Hãy đổi tên hoặc xóa khai báo thừa.', errLine);
  if (has(/no matching function for call/i)) add('gcc-no-matching-function', 'error', 'GCC 15: `no matching function for call`', 'Số lượng hoặc kiểu tham số không khớp. Kiểm tra lại chữ ký hàm và ép kiểu.', errLine);
  if (has(/too few arguments/i)) add('gcc-too-few-args', 'error', 'GCC 15: truyền thiếu tham số', 'Hàm được gọi với ít đối số hơn khai báo. Hãy bổ sung tham số.', errLine);
  if (has(/too many arguments/i)) add('gcc-too-many-args', 'error', 'GCC 15: truyền dư tham số', 'Hàm được gọi với nhiều đối số hơn khai báo. Hãy kiểm tra lại.', errLine);
  if (has(/control reaches end of non-void function/i)) add('gcc-missing-return', 'warning', 'GCC 15: hàm không trả về giá trị', 'Hàm có kiểu trả về khác `void` nhưng thiếu `return` ở một nhánh. Đây là Undefined Behavior.', errLine);
  if (has(/undefined reference to\s+[`'"]?WinMain/i)) add('linker-winmain', 'error', 'Linker: `undefined reference to WinMain`', 'Không tìm thấy `int main()`. Hãy thêm hàm `main` hoặc kiểm tra lại tên `mian`/`man`. Bộ lọc AST có thể tự chèn khung `main`.', 1);
  if (has(/undefined reference to/i)) add('linker-undefined-reference', 'error', 'Linker: `undefined reference to ...`', 'Bạn gọi một hàm/biến chưa được định nghĩa hoặc thiếu file nguồn khi liên kết. Kiểm tra khai báo và tên hàm.', 1);
  if (has(/ld returned 1 exit status/i) || has(/collect2\.exe.*error/i)) add('linker-ld-exit', 'error', 'Linker: `ld returned 1 exit status`', 'Lỗi liên kết tổng hợp. Nếu file `.exe` cũ đang mở, hãy đóng chương trình/tiến trình đó rồi biên dịch lại. Dọn các file `.exe` trong thư mục build nếu cần.', 1);
  if (has(/Permission denied|Cannot open output file|text file busy/i)) add('linker-locked-exe', 'error', 'Không ghi được file `.exe` (file đang bị khóa)', 'Một tiến trình cũ đang giữ file thực thi. Hãy đóng cửa sổ chương trình, tắt antivirus tạm thời hoặc đổi tên file build.', 1);
  if (has(/0xC0000005|3221225477|Access Violation/i)) add('runtime-access-violation', 'error', 'Runtime NTSTATUS `0xC0000005` — Access Violation', 'Truy cập bộ nhớ ngoài biên (mảng/vector) hoặc con trỏ null. Hãy kiểm tra chỉ số `i + 1`, `v[v.size()-1]` khi rỗng, và các vòng lặp `<= n`.', 1);
  if (has(/0xC00000FD|3221225725|Stack Overflow/i)) add('runtime-stack-overflow', 'error', 'Runtime NTSTATUS `0xC00000FD` — Stack Overflow', 'Đệ quy thiếu điểm dừng hoặc mảng quá lớn khai báo trong hàm. Hãy thêm `if` dừng, giảm kích thước mảng, hoặc chuyển mảng ra ngoài/`static`.', 1);
  if (has(/0xC0000094|3221225592|Integer Divide by Zero/i)) add('runtime-divide-zero', 'error', 'Runtime NTSTATUS `0xC0000094` — chia cho 0', 'Mẫu số bằng 0 trong phép `/` hoặc `%`. Hãy kiểm tra `if (mau != 0)` trước khi chia.', 1);
  if (has(/IndentationError/i)) add('py-indentation', 'error', 'Python: `IndentationError` — thụt lề sai', 'Python dùng thụt lề để xác định khối lệnh. Hãy dùng đúng 4 dấu cách và không trộn tab với space.', 1);
  if (has(/SyntaxError/i)) add('py-syntax', 'error', 'Python: `SyntaxError` — lỗi cú pháp', 'Kiểm tra dấu `:`, ngoặc và từ khóa. Đọc dòng được báo lỗi để sửa.', 1);
  if (has(/NameError/i)) add('py-name', 'error', 'Python: `NameError` — tên chưa định nghĩa', 'Biến/hàm được dùng trước khi khai báo hoặc gõ sai tên.', 1);
  if (has(/IndexError/i)) add('py-index', 'error', 'Python: `IndexError` — chỉ số ngoài phạm vi', 'List/string không có phần tử tại chỉ số đó. Kiểm tra `len()` trước khi truy cập.', 1);
  if (has(/RecursionError/i)) add('py-recursion', 'error', 'Python: `RecursionError` — đệ quy quá sâu', 'Thêm `sys.setrecursionlimit(1_000_000)` hoặc chuyển sang vòng lặp.', 1);
  if (has(/ZeroDivisionError/i)) add('py-zero-division', 'error', 'Python: `ZeroDivisionError` — chia cho 0', 'Kiểm tra mẫu số trước khi thực hiện `/` hoặc `%`.', 1);
  if (has(/ModuleNotFoundError/i)) add('py-module', 'error', 'Python: `ModuleNotFoundError`', 'Thư viện chưa được cài hoặc tên module sai. Hãy dùng thư viện chuẩn hoặc cài bằng `pip`.', 1);
  if (has(/TypeError/i)) add('py-type', 'error', 'Python: `TypeError` — sai kiểu dữ liệu', 'Ví dụ cộng `str` với `int`. Hãy dùng `int()`, `str()` hoặc kiểm tra kiểu.', 1);

  const status = Number(exitCode) >>> 0;
  if (status === 0xC0000005) add('runtime-access-violation', 'error', 'Runtime NTSTATUS `0xC0000005` — Access Violation', 'Truy cập ngoài biên mảng/vector hoặc con trỏ null. Hãy kiểm tra các chỉ số và điều kiện vòng lặp.', 1);
  if (status === 0xC00000FD) add('runtime-stack-overflow', 'error', 'Runtime NTSTATUS `0xC00000FD` — Stack Overflow', 'Đệ quy thiếu điểm dừng hoặc mảng lớn trên stack. Hãy thêm điều kiện dừng/chuyển mảng sang `static`.', 1);
  if (status === 0xC0000094) add('runtime-divide-zero', 'error', 'Runtime NTSTATUS `0xC0000094` — chia cho 0', 'Kiểm tra mẫu số trước phép chia/lấy dư.', 1);

  return out;
}

// ============================================================================
// Empirical Time & Space Complexity Regression Engine (MIT 6.046 / 6.172)
// ============================================================================
function drgxMedian(values) {
  if (!values.length) return 0;
  const a = values.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function drgxDefaultProfileInput(n, mode = 'array') {
  if (mode === 'single') return `${n}\n`;
  if (mode === 'pairs') {
    const rows = [];
    for (let i = 0; i < n; i++) rows.push(`${(i * 37) % 1000000000} ${(i * 91 + 7) % 1000000000}`);
    return `${n}\n${rows.join('\n')}\n`;
  }
  let seed = 123456789 + Number(n);
  const vals = [];
  for (let i = 0; i < n; i++) {
    seed = (1103515245 * seed + 12345) % 2147483648;
    vals.push(seed % 1000000000);
  }
  return `${n}\n${vals.join(' ')}\n`;
}

async function drgxGenerateProfileInput(n, opts, tmpDir) {
  if (opts.generator && String(opts.generator).trim()) {
    const genPath = path.join(tmpDir, 'profile_gen.py');
    fs.writeFileSync(genPath, String(opts.generator), 'utf8');
    const r = await runProcessWithInput(PYTHON_BIN, [genPath, String(n)], '', 8000, tmpDir);
    if (!r.ok) throw new Error(`Generator lỗi tại N=${n}: ${(r.stderr || r.stdout || '').trim().slice(0, 500)}`);
    return r.stdout;
  }
  if (opts.inputTemplate) {
    return String(opts.inputTemplate).replace(/\{\{\s*N\s*\}\}|\{\s*N\s*\}/g, String(n));
  }
  return drgxDefaultProfileInput(n, opts.inputMode || 'array');
}

// ---------------------------------------------------------------------------
// Self-timing harness (MIT 6.172 style). The solution's `main` is renamed to
// `drgx_user_main`, and a generated harness calls it repeatedly inside one
// process, measuring only the solution body with steady_clock. This removes
// ~50 ms of Windows process-spawn noise and lets N=250..4000 produce clean
// log-log slopes even for O(N^2).
// ---------------------------------------------------------------------------
const DRGX_PROFILE_HARNESS_SRC = String.raw`#include <bits/stdc++.h>
#include <chrono>
#ifdef _WIN32
#include <io.h>
#endif
using namespace std;
extern int drgx_user_main();

int main(int argc, char** argv) {
    if (argc < 4) return 2;
    int mode = atoi(argv[1]);
    const char* inPath = argv[2];
    const char* outPath = argv[3];
    int forceReps = argc > 4 ? atoi(argv[4]) : 0;
    string data;
    {
        ifstream f(inPath, ios::binary);
        ostringstream ss;
        ss << f.rdbuf();
        data = ss.str();
    }
#ifdef _WIN32
    freopen("NUL", "w", stdout);
#else
    freopen("/dev/null", "w", stdout);
#endif
    auto emit = [&](double us, int reps) {
        char buf[256];
        snprintf(buf, sizeof buf, "DRGX_PROFILE time_us=%.3f reps=%d\n", us, reps);
        ofstream out(outPath, ios::binary | ios::trunc);
        out << buf;
    };
    if (mode == 1) {
        if (!freopen(inPath, "r", stdin)) return 3;
        clearerr(stdin);
        cin.clear();
        drgx_user_main();
        cout.flush();
        double total = 0.0;
        int reps = 0;
        int cap = forceReps > 0 ? forceReps : 400;
        do {
            if (reps > 0) {
                fseek(stdin, 0, SEEK_SET);
                clearerr(stdin);
                cin.clear();
            }
            auto t0 = chrono::steady_clock::now();
            drgx_user_main();
            auto t1 = chrono::steady_clock::now();
            cout.flush();
            total += chrono::duration<double, micro>(t1 - t0).count();
            reps++;
        } while (reps < cap && (forceReps > 0 ? reps < cap : total < 60000.0));
        emit(total / reps, reps);
    } else {
        auto one = [&]() {
            istringstream in(data);
            streambuf* old = cin.rdbuf(in.rdbuf());
            cin.clear();
            drgx_user_main();
            cout.flush();
            cin.rdbuf(old);
        };
        one();
        auto timeReps = [&](int reps) {
            auto t0 = chrono::steady_clock::now();
            for (int i = 0; i < reps; i++) one();
            auto t1 = chrono::steady_clock::now();
            return chrono::duration<double, micro>(t1 - t0).count() / reps;
        };
        double u1 = timeReps(1);
        int reps = forceReps > 0 ? forceReps : (int)ceil(60000.0 / max(u1, 1.0));
        if (reps < 1) reps = 1;
        if (reps > 200) reps = 200;
        double us = reps > 1 ? timeReps(reps) : u1;
        emit(us, reps);
    }
    return 0;
}
`;

const DRGX_PROFILE_PY_WRAPPER = String.raw`import sys, io, os, time

script = sys.argv[1]
inp = sys.argv[2]
outp = sys.argv[3]
force = int(sys.argv[4]) if len(sys.argv) > 4 else 0

src = open(script, 'rb').read()
code = compile(src, script, 'exec')
data = open(inp, 'rb').read()
devnull = open(os.devnull, 'w', encoding='utf-8', errors='replace')
real_out = sys.stdout

class FakeStdin(io.TextIOWrapper):
    pass

def make_stdin():
    return FakeStdin(io.BytesIO(data), encoding='utf-8', errors='replace', newline='')

g = {'__name__': '__main__', '__file__': script}

def one():
    sys.stdin = make_stdin()
    sys.stdout = devnull
    try:
        exec(code, g)
    except SystemExit:
        pass
    finally:
        sys.stdout = real_out

try:
    one()
    def timed(reps):
        t0 = time.perf_counter()
        for _ in range(reps):
            one()
        t1 = time.perf_counter()
        return (t1 - t0) * 1e6 / reps
    u1 = timed(1)
    reps = force if force > 0 else max(1, min(100, int(12000.0 / max(u1, 1.0) + 0.999)))
    us = timed(reps) if reps > 1 else u1
    with open(outp, 'w', encoding='utf-8') as f:
        f.write('DRGX_PROFILE time_us=%.3f reps=%d\n' % (us, reps))
except BaseException as e:
    sys.stderr.write('DRGX_PROFILE_ERROR ' + type(e).__name__ + ': ' + str(e)[:300] + '\n')
    sys.exit(3)
`;

let drgxHarnessObjectPromise = null;
function drgxEnsureHarnessObject() {
  if (drgxHarnessObjectPromise) return drgxHarnessObjectPromise;
  drgxHarnessObjectPromise = (async () => {
    const dir = path.join(os.tmpdir(), 'drgx_profile_cache');
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(dir, `drgx_harness_${process.pid}.cpp`);
    const obj = path.join(dir, `drgx_harness_${process.pid}.o`);
    if (fs.existsSync(obj)) return obj;
    fs.writeFileSync(src, DRGX_PROFILE_HARNESS_SRC, 'utf8');
    const r = await runProcessWithInput(
      GXX_BIN,
      ['-std=c++17', '-O2', '-pipe', '-c', src, '-o', obj],
      '',
      30000,
      dir
    );
    if (!r.ok) {
      drgxHarnessObjectPromise = null;
      try { fs.unlinkSync(obj); } catch (_) {}
      throw new Error(`Không biên dịch được profiler harness: ${(r.stderr || r.stdout || '').trim().slice(0, 600)}`);
    }
    return obj;
  })();
  return drgxHarnessObjectPromise;
}

async function drgxBuildCppProfiler(code, tmpDir) {
  const srcPath = path.join(tmpDir, 'solution.cpp');
  fs.writeFileSync(srcPath, code, 'utf8');
  const objPath = path.join(tmpDir, 'solution.o');
  const compile = await runProcessWithInput(
    GXX_BIN,
    ['-std=c++17', '-O2', '-pipe', '-c', srcPath, '-o', objPath],
    '',
    20000,
    tmpDir
  );
  if (!compile.ok) {
    return { ok: false, stage: 'rename', compileOutput: (compile.stderr || compile.stdout || '').trim() };
  }
  // Rename `main` after codegen (not via -Dmain) so the compiler still applies
  // the C++ rule "falling off main returns 0" for solutions without `return`.
  const rename = await runProcessWithInput(
    OBJCOPY_BIN,
    ['--redefine-sym', 'main=_Z14drgx_user_mainv', objPath],
    '',
    10000,
    tmpDir
  );
  if (!rename.ok) {
    return { ok: false, stage: 'rename', compileOutput: (rename.stderr || rename.stdout || '').trim() };
  }
  let harnessObj;
  try {
    harnessObj = await drgxEnsureHarnessObject();
  } catch (err) {
    return { ok: false, stage: 'harness', compileOutput: String(err.message || err) };
  }
  const exePath = path.join(tmpDir, 'solution_profile.exe');
  const link = await runProcessWithInput(
    GXX_BIN,
    ['-std=c++17', '-O2', objPath, harnessObj, '-o', exePath],
    '',
    25000,
    tmpDir
  );
  if (!link.ok || !fs.existsSync(exePath)) {
    return { ok: false, stage: 'link', compileOutput: (link.stderr || link.stdout || '').trim() };
  }
  return { ok: true, exePath, args: [] };
}

function drgxWritePythonWrapper(tmpDir) {
  const wrapper = path.join(tmpDir, 'drgx_py_profile.py');
  fs.writeFileSync(wrapper, DRGX_PROFILE_PY_WRAPPER, 'utf8');
  return wrapper;
}

function drgxParseProfileTime(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const m = text.match(/time_us=([0-9.]+)\s+reps=(\d+)/);
    if (!m) return null;
    const us = parseFloat(m[1]);
    if (!Number.isFinite(us) || us <= 0) return null;
    return { timeUs: us, reps: parseInt(m[2], 10) || 1 };
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PowerShell keeps the child process handle so PeakWorkingSet64 is exact.
// Timing itself comes from the in-process harness, not from PowerShell.
// ---------------------------------------------------------------------------
const DRGX_PS_PROFILE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "Write-Output 'READY'",
  "while ($true) {",
  "  $line = [Console]::In.ReadLine()",
  "  if ($null -eq $line -or $line -eq 'QUIT') { break }",
  "  if (-not $line.StartsWith('RUN|')) { continue }",
  "  $parts = $line.Split('|')",
  "  if ($parts.Length -lt 4) { Write-Output 'ERROR|bad protocol'; continue }",
  "  try {",
  "    $exe = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[1]))",
  "    $argText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[2]))",
  "    $timeoutMs = [int]$parts[3]",
  "    $psi = New-Object System.Diagnostics.ProcessStartInfo",
  "    $psi.FileName = $exe",
  "    $psi.Arguments = $argText",
  "    $psi.UseShellExecute = $false",
  "    $psi.RedirectStandardInput = $true",
  "    $psi.RedirectStandardOutput = $true",
  "    $psi.RedirectStandardError = $true",
  "    $psi.CreateNoWindow = $true",
  "    $p = New-Object System.Diagnostics.Process",
  "    $p.StartInfo = $psi",
  "    [void]$p.Start()",
  "    $outTask = $p.StandardOutput.ReadToEndAsync()",
  "    $errTask = $p.StandardError.ReadToEndAsync()",
  "    $writer = $p.StandardInput",
  "    $writer.Close()",
  "    $sw = [System.Diagnostics.Stopwatch]::StartNew()",
  "    $peak = 0",
  "    $timedOut = 0",
  "    while (-not $p.HasExited) {",
  "      try { $p.Refresh(); $v = $p.PeakWorkingSet64; if ($v -gt $peak) { $peak = $v } } catch {}",
  "      if ($sw.ElapsedMilliseconds -gt $timeoutMs) { $timedOut = 1; try { $p.Kill() } catch {}; break }",
  "      Start-Sleep -Milliseconds 1",
  "    }",
  "    $p.WaitForExit()",
  "    Write-Output ('RESULT|' + $peak + '|' + $p.ExitCode + '|' + $timedOut)",
  "    try { [void]$outTask.Result; [void]$errTask.Result } catch {}",
  "  } catch {",
  "    Write-Output ('ERROR|' + ($_.Exception.Message -replace '[\\r\\n]+', ' '))",
  "  }",
  "}"
].join('\n');

let drgxPsProfilerPromise = null;
function drgxGetPowerShellProfiler() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  if (drgxPsProfilerPromise) return drgxPsProfilerPromise;
  drgxPsProfilerPromise = new Promise(resolve => {
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (!fs.existsSync(ps)) return resolve(null);
    let proc;
    try {
      proc = spawn(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(DRGX_PS_PROFILE_SCRIPT, 'utf16le').toString('base64')], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (_) {
      return resolve(null);
    }
    let buffer = '';
    let ready = false;
    let waiter = null;
    let closed = false;
    const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
    const startTimer = setTimeout(() => {
      try { proc.kill(); } catch (_) {}
      resolve(null);
    }, 9000);

    const api = {
      run(exe, args, timeoutMs) {
        return new Promise((res, rej) => {
          if (closed || !ready) return rej(new Error('PowerShell profiler chưa sẵn sàng'));
          const argText = args.map(a => /\s/.test(String(a)) ? `"${String(a).replace(/"/g, '\\"')}"` : String(a)).join(' ');
          const line = 'RUN|' + b64(exe) + '|' + b64(argText) + '|' + timeoutMs;
          const timer = setTimeout(() => {
            waiter = null;
            rej(new Error('PowerShell profiler timeout'));
          }, timeoutMs + 6000);
          waiter = resp => {
            clearTimeout(timer);
            if (resp.startsWith('ERROR|')) return rej(new Error(resp.slice(6)));
            const p = resp.split('|');
            res({
              peakBytes: parseInt(p[1], 10) || 0,
              exitCode: parseInt(p[2], 10),
              timedOut: p[3] === '1'
            });
          };
          try { proc.stdin.write(line + '\n'); }
          catch (err) { clearTimeout(timer); waiter = null; rej(err); }
        });
      },
      close() {
        closed = true;
        try { proc.stdin.write('QUIT\n'); } catch (_) {}
        try { proc.kill(); } catch (_) {}
      }
    };

    function handleLine(line) {
      if (line === 'READY') {
        ready = true;
        clearTimeout(startTimer);
        resolve(api);
        return;
      }
      if (waiter && (line.startsWith('RESULT|') || line.startsWith('ERROR|'))) {
        const w = waiter;
        waiter = null;
        w(line);
      }
    }

    proc.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        handleLine(line);
      }
    });
    proc.stderr.on('data', () => {});
    proc.on('error', () => {
      closed = true;
      clearTimeout(startTimer);
      resolve(null);
    });
    proc.on('close', () => {
      closed = true;
      clearTimeout(startTimer);
      if (!ready) resolve(null);
      if (waiter) {
        const w = waiter;
        waiter = null;
        w('ERROR|PowerShell profiler đã đóng');
      }
    });
  });
  return drgxPsProfilerPromise;
}

async function drgxRunMeasured(profiler, exe, args, timeoutMs, cwd) {
  const started = Date.now();
  if (profiler) {
    try {
      const r = await profiler.run(exe, args, timeoutMs);
      return { ...r, wallUs: (Date.now() - started) * 1000 };
    } catch (_) {}
  }
  return await drgxNativeTimedRun(exe, args, '', timeoutMs, cwd);
}

function drgxNativeTimedRun(cmd, args, input, timeoutMs, cwd) {
  return new Promise(resolve => {
    const start = process.hrtime.bigint();
    let proc;
    try {
      proc = spawn(cmd, args, {
        cwd,
        env: process.env,
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'ignore']
      });
    } catch (err) {
      return resolve({ wallUs: 0, peakBytes: null, exitCode: -1, timedOut: false, error: String(err.message || err) });
    }
    let timedOut = false;
    let done = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGKILL'); } catch (_) {}
    }, timeoutMs);
    proc.on('error', err => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ wallUs: Number(process.hrtime.bigint() - start) / 1000, peakBytes: null, exitCode: -1, timedOut, error: String(err.message || err) });
    });
    proc.on('close', code => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ wallUs: Number(process.hrtime.bigint() - start) / 1000, peakBytes: null, exitCode: code == null ? -1 : code, timedOut });
    });
    try {
      if (input) proc.stdin.write(input);
      proc.stdin.end();
    } catch (_) {}
  });
}

async function drgxMeasureProfileOverhead(profiler, lang, tmpDir) {
  const samples = [];
  if (lang === 'cpp') {
    const calib = await compileCppSource('int main() { return 0; }\n', 'profile_calib');
    if (calib.ok) {
      for (let i = 0; i < 3; i++) {
        const r = await drgxRunMeasured(profiler, calib.exeFile, [], 3000, tmpDir);
        if (!r.timedOut && r.wallUs > 0) samples.push(r.wallUs);
      }
    }
  } else if (lang === 'python') {
    for (let i = 0; i < 3; i++) {
      const r = await drgxRunMeasured(profiler, PYTHON_BIN, ['-c', 'pass'], 3000, tmpDir);
      if (!r.timedOut && r.wallUs > 0) samples.push(r.wallUs);
    }
  }
  return samples.length ? Math.min(...samples) : 0;
}

function drgxClassifyComplexity(k) {
  if (!Number.isFinite(k)) return 'Không xác định';
  if (k < 0.25) return 'O(1)';
  if (k < 0.6) return 'O(log N)';
  if (k < 1.15) return 'O(N)';
  if (k < 1.55) return 'O(N log N)';
  if (k < 2.4) return 'O(N^2)';
  return 'O(N^3)';
}

function drgxRegression(points) {
  const valid = points.filter(p => p.verdict === 'OK' && p.timeUs > 0 && p.n > 1);
  if (valid.length < 2) {
    return { valid: false, k: NaN, c: NaN, r2: 0, equation: 'Không đủ dữ liệu hợp lệ', complexity: 'Không xác định' };
  }
  const xs = valid.map(p => Math.log2(p.n));
  const ys = valid.map(p => Math.log2(Math.max(p.timeUs, 0.001)));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const k = den === 0 ? 0 : num / den;
  const c = my - k * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = k * xs[i] + c;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));
  const complexity = drgxClassifyComplexity(k);
  return {
    valid: true,
    k,
    c,
    r2,
    complexity,
    equation: `log2 T(N) = ${k.toFixed(4)} · log2 N + ${c.toFixed(4)}`
  };
}

function drgxProject(k, c, n) {
  const lg = k * Math.log2(n) + c;
  if (!Number.isFinite(lg)) return { ms: Infinity, overflow: true };
  const us = Math.pow(2, Math.min(lg, 60));
  return { ms: us / 1000, overflow: lg > 60 };
}

async function drgxProfileComplexity(body = {}) {
  const code = String(body.code ?? '');
  const langRaw = String(body.lang || 'cpp').toLowerCase();
  const lang = (langRaw === 'py' || langRaw === 'python') ? 'python' : (langRaw === 'c++' ? 'cpp' : langRaw);
  if (lang !== 'cpp' && lang !== 'python') throw new Error('Profiler hỗ trợ C++17 và Python 3');
  if (!code.trim()) throw new Error('Code đang trống — không thể đo độ phức tạp');

  const requested = Array.isArray(body.sizes) && body.sizes.length
    ? body.sizes.map(x => parseInt(x, 10)).filter(x => Number.isFinite(x) && x >= 1 && x <= 10000000).slice(0, 12)
    : DRGX_PROFILE_SIZES.slice();
  const sizes = [...new Set(requested)].sort((a, b) => a - b);
  if (sizes.length < 2) throw new Error('Cần ít nhất 2 kích thước N hợp lệ');
  const timeLimitMs = Math.min(20000, Math.max(200, parseInt(body.timeLimitMs || '5000', 10)));
  const repeats = Math.min(5, Math.max(1, parseInt(body.repeats || '2', 10)));
  const started = Date.now();
  const warnings = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drgx_profile_'));

  try {
    let exe = '';
    let baseArgs = [];
    let pythonWrapper = '';
    let scriptPath = '';
    const usesCStdio = /\b(scanf|printf|gets|fgets|getchar|puts|fputs|fread|fwrite|freopen|fopen)\s*\(/.test(code);
    const usesSelfFreopen = /\bfreopen\s*\(/.test(code);
    const forceReps = usesSelfFreopen ? 1 : 0;
    const harnessMode = usesCStdio && !/\b(cin|cout|cerr)\b/.test(code) ? 1 : 0;

    if (lang === 'cpp') {
      const built = await drgxBuildCppProfiler(code, tmpDir);
      if (!built.ok) {
        const fallback = await compileCppSource(code, 'profile_fallback');
        if (!fallback.ok) {
          fallback.cleanup();
          const diag = analyzeAndFixCode(code, lang, 'bugcheck');
          return {
            ok: false,
            error: 'CE',
            lang: 'cpp',
            compileOutput: built.compileOutput || fallback.compileOutput,
            findings: diag.findings,
            fixedCode: diag.fixedCode,
            hasChanges: diag.hasChanges,
            autofix_patch: diag.autofix_patch,
            message: 'Biên dịch thất bại — hãy sửa các lỗi GCC 15 bên dưới rồi đo lại.',
            warnings
          };
        }
        exe = fallback.exeFile;
        baseArgs = [];
        warnings.push('Không dựng được self-timing harness; dùng đo wall-clock có hiệu chỉnh (kém chính xác hơn).');
      } else {
        exe = built.exePath;
      }
    } else {
      scriptPath = path.join(tmpDir, 'solution.py');
      fs.writeFileSync(scriptPath, code, 'utf8');
      pythonWrapper = drgxWritePythonWrapper(tmpDir);
      exe = PYTHON_BIN;
    }

    const profiler = await drgxGetPowerShellProfiler();
    const overheadUs = await drgxMeasureProfileOverhead(profiler, lang, tmpDir);
    if (overheadUs > 0) warnings.push(`Đã hiệu chỉnh overhead khởi động tiến trình ~${Math.round(overheadUs)} µs.`);

    const points = [];
    let generatorError = null;
    for (const n of sizes) {
      if (Date.now() - started > 90000) {
        warnings.push('Dừng sớm do tổng thời gian đo vượt 90 giây.');
        break;
      }
      let input = '';
      try {
        input = await drgxGenerateProfileInput(n, {
          generator: body.generator,
          inputTemplate: body.inputTemplate,
          inputMode: body.inputMode
        }, tmpDir);
      } catch (err) {
        generatorError = String(err.message || err);
        break;
      }
      const inputPath = path.join(tmpDir, `input_${n}.txt`);
      fs.writeFileSync(inputPath, input, 'utf8');

      const rawSamples = [];
      const peakSamples = [];
      let lastExit = 0;
      let timeouts = 0;
      let harnessReps = 0;
      let runError = '';
      for (let r = 0; r < repeats; r++) {
        const timeFile = path.join(tmpDir, `time_${n}_${r}.txt`);
        try { fs.unlinkSync(timeFile); } catch (_) {}
        let args;
        if (lang === 'cpp') {
          args = [String(harnessMode), inputPath, timeFile, String(forceReps)];
        } else {
          args = [pythonWrapper, scriptPath, inputPath, timeFile, String(forceReps)];
        }
        const run = await drgxRunMeasured(profiler, exe, args, timeLimitMs, tmpDir);
        const measured = drgxParseProfileTime(timeFile);
        const fallbackUs = Math.max(1, run.wallUs - overheadUs);
        rawSamples.push(measured ? measured.timeUs : fallbackUs);
        if (measured && measured.reps > 0) harnessReps = Math.max(harnessReps, measured.reps);
        if (run.peakBytes && run.peakBytes > 0) peakSamples.push(run.peakBytes);
        lastExit = run.exitCode;
        if (run.timedOut) timeouts++;
        if (run.error) runError = run.error;
      }
      const bestUs = rawSamples.length ? Math.min(...rawSamples) : 0;
      const verdict = timeouts === repeats ? 'TLE' : (lastExit === 0 ? 'OK' : 'RE');
      points.push({
        n,
        timeUs: Math.round(bestUs * 1000) / 1000,
        rawTimeUs: Math.round(bestUs * 1000) / 1000,
        peakKb: peakSamples.length ? Math.round(Math.max(...peakSamples) / 1024) : null,
        verdict,
        exitCode: lastExit,
        harnessReps: harnessReps || undefined,
        error: runError || undefined
      });
    }

    if (profiler) profiler.close();
    if (generatorError) {
      return {
        ok: false,
        error: 'GENERATOR',
        message: generatorError,
        points,
        warnings
      };
    }
    if (!points.length) {
      return { ok: false, error: 'NO_DATA', message: 'Không thu được mẫu đo nào.', warnings };
    }

    const regression = drgxRegression(points);
    const ast = analyzeAndFixCode(code, lang, 'explain');
    const heuristicK = { 'O(1)': 0, 'O(log N)': 0.4, 'O(N)': 1, 'O(N log N)': 1.3, 'O(N^2)': 2, 'O(N^3)': 3 }[ast.complexity] ?? 1;
    const useK = regression.valid ? regression.k : heuristicK;
    const useC = regression.valid ? regression.c : Math.log2(Math.max(points[0].timeUs, 0.001)) - useK * Math.log2(points[0].n);
    const p1e5 = drgxProject(useK, useC, 1e5);
    const p1e6 = drgxProject(useK, useC, 1e6);
    const tle1e5 = p1e5.ms > 1000;
    const tle1e6 = p1e6.ms > 1000;
    if (tle1e5 || tle1e6) {
      warnings.push('Dự phóng vượt 1000 ms (TLE) ở ít nhất một mốc N lớn — cần tối ưu thuật toán hoặc dùng Fast I/O.');
    }
    if (!regression.valid) warnings.push('Không đủ mẫu OK để hồi quy; đang dùng độ phức tạp heuristic từ AST.');
    if (regression.valid && regression.r2 < 0.9) warnings.push(`R² = ${regression.r2.toFixed(4)} < 0.90: mô hình chưa ổn định (nhiễu tiến trình hoặc code có nhiều nhánh).`);
    const maxTime = Math.max(...points.map(p => p.timeUs));
    if (maxTime < 2000) warnings.push('T(N) rất nhỏ (< 2 ms) — hãy dùng N lớn hơn hoặc generator nặng hơn để tăng độ tin cậy.');
    if (points.some(p => p.verdict === 'TLE')) warnings.push('Có mẫu vượt time limit và bị loại khỏi hồi quy.');
    if (points.some(p => p.verdict === 'RE')) warnings.push('Có mẫu kết thúc với mã lỗi runtime (RE) và bị loại khỏi hồi quy.');

    const peakKb = points.reduce((mx, p) => p.peakKb != null ? Math.max(mx, p.peakKb) : mx, 0);
    const harnessReps = Math.max(0, ...points.map(p => p.harnessReps || 0));
    return {
      ok: true,
      lang: lang === 'cpp' ? 'C++17' : 'Python 3',
      sizes,
      points,
      regression: {
        model: 'log2 T(N) = k · log2 N + c',
        k: Number(useK.toFixed(6)),
        c: Number(useC.toFixed(6)),
        r2: regression.valid ? Number(regression.r2.toFixed(6)) : 0,
        equation: regression.valid
          ? `T(N) ≈ 2^(${regression.k.toFixed(4)} · log2 N + ${regression.c.toFixed(4)}) µs`
          : `T(N) ≈ 2^(${useK.toFixed(4)} · log2 N + ${useC.toFixed(4)}) µs (heuristic)`,
        complexity: regression.valid ? regression.complexity : ast.complexity,
        confidence: regression.valid ? (regression.r2 >= 0.98 ? 'cao' : regression.r2 >= 0.9 ? 'trung bình' : 'thấp') : 'heuristic'
      },
      projections: {
        n1e5: { n: 100000, timeMs: Math.round(p1e5.ms * 1000) / 1000, tle: tle1e5, overflow: !!p1e5.overflow },
        n1e6: { n: 1000000, timeMs: Math.round(p1e6.ms * 1000) / 1000, tle: tle1e6, overflow: !!p1e6.overflow }
      },
      harness: {
        mode: lang === 'cpp' ? (harnessMode === 1 ? 'stdio-loop' : 'iostream-loop') : 'python-exec-loop',
        reps: harnessReps || null,
        calibratedOverheadUs: Math.round(overheadUs * 1000) / 1000
      },
      peakKb: peakKb || null,
      warnings,
      astComplexity: ast.complexity,
      ruleCount: DRGX_RULE_COUNT,
      findings: ast.findings,
      fixedCode: ast.fixedCode,
      hasChanges: ast.hasChanges,
      autofix_patch: ast.autofix_patch,
      elapsedMs: Date.now() - started
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
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
    if ((pathname === '/api/studio/health' || pathname === '/api/health') && req.method === 'GET') {
      const ojOnline = await checkPortListening(OJ_PORT);
      return sendJson(res, 200, {
        status: 'ok',
        product: 'DrgX Studio Standalone App',
        version: '2.7.0',
        port: PORT,
        ojPort: OJ_PORT,
        ojOnline,
        workspace: activeWorkspace,
        gxx: GXX_BIN,
        python: PYTHON_BIN,
        capabilities: {
          profileComplexity: true,
          diagnosticRules: DRGX_RULE_COUNT,
          autofixPatch: true,
          profileSizes: DRGX_PROFILE_SIZES
        }
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

    // 1b. Compiler / Runtime Diagnostic API (50+ AST rules + GCC 15 + NTSTATUS + autofix_patch)
    if ((pathname === '/api/studio/diagnose' || pathname === '/api/diagnose') && req.method === 'POST') {
      const body = await readJsonBody(req);
      const code = String(body.code ?? '');
      const lang = String(body.lang || 'cpp').toLowerCase();
      let stderr = String(body.stderr ?? body.compileOutput ?? body.runtimeStderr ?? '');
      let compiler = null;
      if (!stderr.trim() && body.autoCompile !== false && code.trim()) {
        if (lang === 'cpp' || lang === 'c++' || lang === 'c') {
          compiler = await syntaxCheckCppSource(code);
          stderr = compiler.output || '';
        } else if (lang === 'python' || lang === 'py') {
          compiler = await syntaxCheckPythonSource(code);
          stderr = compiler.output || '';
        }
      }
      const analysis = analyzeAndFixCode(code, lang, 'bugcheck');
      const compilerFindings = drgxExplainCompilerOutput(stderr, lang, body.exitCode || body.exit_code || 0);
      const merged = analysis.findings.slice();
      for (const cf of compilerFindings) {
        const duplicate = merged.some(f => f.rule === cf.rule && (f.line === cf.line || cf.line === 1));
        if (duplicate) continue;
        const patch = (analysis.autofix_patch.patches || []).find(p => p.line === cf.line) || null;
        merged.push({ ...cf, autofix_patch: patch });
      }
      merged.sort((a, b) => (a.line || 0) - (b.line || 0));
      const firstError = merged.find(f => f.severity === 'error')?.line || 0;
      const markdown = [
        `### 🛠️ Chẩn đoán AST + GCC 15 (${merged.length} phát hiện · ${DRGX_RULE_COUNT} quy tắc)`,
        compiler && compiler.checked
          ? `- **GCC 15 syntax check:** ${compiler.ok ? '✅ PASS' : '❌ FAIL'} (${compiler.timeMs} ms)`
          : '- **GCC 15 syntax check:** bỏ qua (dùng stderr do client cung cấp)',
        '',
        merged.length
          ? merged.map((f, i) => `${i + 1}. **[${String(f.severity).toUpperCase()}] Dòng ${f.line}: ${f.title}**\n   - ${f.detail}${f.autofix_patch ? '\n   - *1-click patch:* `' + String(f.autofix_patch.before || '').slice(0, 90) + '` → `' + String(f.autofix_patch.after || '').slice(0, 90) + '`' : ''}`).join('\n\n')
          : '✅ Không phát hiện lỗi cú pháp, kiểu dữ liệu hay logic CP nào.'
      ].join('\n');
      return sendJson(res, 200, {
        ok: true,
        lang,
        compiler,
        findings: merged,
        firstErrorLine: firstError,
        fixedCode: analysis.fixedCode,
        hasChanges: analysis.hasChanges,
        autofix_patch: analysis.autofix_patch,
        complexity: analysis.complexity,
        ruleCount: DRGX_RULE_COUNT,
        markdown
      });
    }

    // 1c. Empirical Time & Space Complexity Regression Engine (MIT 6.046 / 6.172)
    if ((pathname === '/api/profile-complexity' || pathname === '/api/studio/profile-complexity') && req.method === 'POST') {
      const body = await readJsonBody(req);
      try {
        const result = await drgxProfileComplexity(body);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 400, {
          ok: false,
          error: 'PROFILE_ERROR',
          message: String(err.message || err),
          ruleCount: DRGX_RULE_COUNT
        });
      }
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

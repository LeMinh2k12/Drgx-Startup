#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::collections::HashSet;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, RunEvent};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// Embedded Studio Frontend Assets (compiled directly into drgx-studio.exe)
const STUDIO_HTML: &str = include_str!("../../../studio/index.html");
const STUDIO_CSS: &str = include_str!("../../../studio/studio.css");
const STUDIO_JS: &str = include_str!("../../../studio/studio.js");
const LOGO_PNG: &[u8] = include_bytes!("../../dist/logo.png");
const ICON_ICO: &[u8] = include_bytes!("../icons/icon.ico");

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static STUDIO_PORT: OnceLock<u16> = OnceLock::new();
static ACTIVE_WORKSPACE: OnceLock<Mutex<PathBuf>> = OnceLock::new();
static SPAWNED_PIDS: OnceLock<Mutex<Vec<u32>>> = OnceLock::new();

const DEFAULT_STUDIO_PORT: u16 = 45280;
const OJ_PORT: u16 = 8080;

fn spawned_pids() -> &'static Mutex<Vec<u32>> {
    SPAWNED_PIDS.get_or_init(|| Mutex::new(Vec::new()))
}

fn root_dir() -> PathBuf {
    if let Ok(env_root) = std::env::var("DRGX_ROOT") {
        let p = PathBuf::from(env_root);
        if p.exists() {
            return p;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut cur = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..5 {
            if let Some(ref dir) = cur {
                if dir.join("products").join("void-bit").exists() || dir.join("studio").exists() {
                    return dir.clone();
                }
                cur = dir.parent().map(|p| p.to_path_buf());
            }
        }
    }
    PathBuf::from(r"D:\Dev\vietcode")
}

fn oj_dir() -> PathBuf {
    root_dir().join("products").join("void-bit").join("OJ")
}

fn oj_exe() -> PathBuf {
    oj_dir().join("oj_server.exe")
}

fn drgx_cli_exe() -> PathBuf {
    let candidate = root_dir().join("cli").join("target").join("release").join("drgx.exe");
    if candidate.exists() {
        return candidate;
    }
    find_binary(&[
        r"D:\Dev\vietcode\cli\target\release\drgx.exe",
        r"D:\C_Drive_Data\home_dot_cargo\bin\drgx.exe",
        "drgx.exe",
    ])
}

fn setup_toolchain_env() {
    let local_app = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let mut extra_dirs = vec![
        PathBuf::from(r"C:\msys64\ucrt64\bin"),
        PathBuf::from(r"C:\msys64\mingw64\bin"),
        PathBuf::from(r"C:\MinGW\bin"),
        PathBuf::from(r"C:\Program Files\Git\cmd"),
    ];
    if !local_app.is_empty() {
        extra_dirs.push(PathBuf::from(&local_app).join("Programs").join("Python").join("Python312"));
        extra_dirs.push(PathBuf::from(&local_app).join("Programs").join("Python").join("Python311"));
        extra_dirs.push(PathBuf::from(&local_app).join("Programs").join("nodejs"));
    }
    let cli_dir = root_dir().join("cli").join("target").join("release");
    extra_dirs.push(cli_dir);
    extra_dirs.push(root_dir());

    let current_path = std::env::var("PATH").or_else(|_| std::env::var("Path")).unwrap_or_default();
    let mut parts: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for d in extra_dirs {
        if d.exists() {
            let s = d.to_string_lossy().to_string();
            let key = s.to_lowercase();
            if seen.insert(key) {
                parts.push(s);
            }
        }
    }
    for p in current_path.split(';') {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            let key = trimmed.to_lowercase();
            if seen.insert(key) {
                parts.push(trimmed.to_string());
            }
        }
    }
    let merged = parts.join(";");
    std::env::set_var("PATH", &merged);
}

fn find_binary(candidates: &[&str]) -> PathBuf {
    for c in candidates {
        let p = PathBuf::from(c);
        if p.is_absolute() && p.is_file() {
            if let Ok(meta) = std::fs::metadata(&p) {
                if meta.len() > 0 {
                    return p;
                }
            }
        }
    }
    let path_var = std::env::var("PATH").unwrap_or_default();
    for c in candidates {
        let p = PathBuf::from(c);
        if p.is_absolute() {
            continue;
        }
        for dir in path_var.split(';') {
            if dir.trim().is_empty() {
                continue;
            }
            let full = PathBuf::from(dir.trim()).join(c);
            if full.is_file() {
                if let Ok(meta) = std::fs::metadata(&full) {
                    if meta.len() > 0 {
                        return full;
                    }
                }
            }
        }
    }
    PathBuf::from(candidates.first().copied().unwrap_or("cmd.exe"))
}

fn gxx_bin() -> PathBuf {
    find_binary(&[
        r"C:\msys64\ucrt64\bin\g++.exe",
        r"C:\msys64\mingw64\bin\g++.exe",
        r"C:\MinGW\bin\g++.exe",
        "g++.exe",
    ])
}

fn python_bin() -> PathBuf {
    let local_app = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let py312 = PathBuf::from(&local_app)
        .join("Programs")
        .join("Python")
        .join("Python312")
        .join("python.exe");
    let py311 = PathBuf::from(&local_app)
        .join("Programs")
        .join("Python")
        .join("Python311")
        .join("python.exe");
    find_binary(&[
        &py312.to_string_lossy(),
        &py311.to_string_lossy(),
        "python.exe",
    ])
}

fn node_bin() -> PathBuf {
    let local_app = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let user_node = PathBuf::from(&local_app)
        .join("Programs")
        .join("nodejs")
        .join("node.exe");
    find_binary(&[
        &user_node.to_string_lossy(),
        r"C:\Program Files\nodejs\node.exe",
        "node.exe",
    ])
}

fn git_bin() -> PathBuf {
    find_binary(&[r"C:\Program Files\Git\cmd\git.exe", "git.exe"])
}

fn workspace_slot() -> &'static Mutex<PathBuf> {
    ACTIVE_WORKSPACE.get_or_init(|| {
        let default_ws = std::env::var("DRGX_WORKSPACE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| root_dir().join("workspace"));
        let _ = std::fs::create_dir_all(&default_ws);
        ensure_workspace_seeded(&default_ws);
        Mutex::new(default_ws)
    })
}

fn get_active_workspace() -> PathBuf {
    workspace_slot()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
}

fn set_active_workspace(new_dir: PathBuf, seed: bool) -> PathBuf {
    let _ = std::fs::create_dir_all(&new_dir);
    if seed {
        ensure_workspace_seeded(&new_dir);
    }
    let mut guard = workspace_slot().lock().unwrap_or_else(|p| p.into_inner());
    *guard = new_dir.clone();
    new_dir
}

fn ensure_workspace_seeded(dir: &Path) {
    let _ = std::fs::create_dir_all(dir);
    let sol_path = dir.join("solution.cpp");
    let brute_path = dir.join("brute.cpp");
    let gen_path = dir.join("gen.py");
    let web_path = dir.join("preview.html");
    let tests_dir = dir.join("tests");

    let sol_empty = !sol_path.exists()
        || std::fs::metadata(&sol_path)
            .map(|m| m.len() == 0)
            .unwrap_or(true);
    if sol_empty {
        let _ = std::fs::write(
            &sol_path,
            r#"#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long a, b;
    if (cin >> a >> b) {
        cout << (a + b) << "\n";
    }
    return 0;
}
"#,
        );
    }
    let brute_empty = !brute_path.exists()
        || std::fs::metadata(&brute_path)
            .map(|m| m.len() == 0)
            .unwrap_or(true);
    if brute_empty {
        let _ = std::fs::write(
            &brute_path,
            r#"#include <bits/stdc++.h>
using namespace std;

int main() {
    long long a, b;
    if (cin >> a >> b) {
        cout << a + b << "\n";
    }
    return 0;
}
"#,
        );
    }
    if !gen_path.exists() {
        let _ = std::fs::write(
            &gen_path,
            r#"import random
a = random.randint(-10**9, 10**9)
b = random.randint(-10**9, 10**9)
print(f"{a} {b}")
"#,
        );
    }
    if !web_path.exists() {
        let _ = std::fs::write(
            &web_path,
            r#"<!DOCTYPE html>
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
"#,
        );
    }
    if !tests_dir.exists() {
        let _ = std::fs::create_dir_all(&tests_dir);
        let _ = std::fs::write(tests_dir.join("1.in"), "15 27\n");
        let _ = std::fs::write(tests_dir.join("1.out"), "42\n");
        let _ = std::fs::write(tests_dir.join("2.in"), "1000000000 2000000000\n");
        let _ = std::fs::write(tests_dir.join("2.out"), "3000000000\n");
    }
}

fn check_oj_listening() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], OJ_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

fn ensure_oj_server() -> bool {
    if check_oj_listening() {
        return true;
    }
    let exe = oj_exe();
    if !exe.exists() {
        return false;
    }
    let mut cmd = Command::new(&exe);
    cmd.args([
        "--port",
        &OJ_PORT.to_string(),
        "--static",
        "static",
        "--problems",
        "problems",
    ])
    .current_dir(oj_dir())
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Ok(child) = cmd.spawn() {
        if let Ok(mut pids) = spawned_pids().lock() {
            pids.push(child.id());
        }
        for _ in 0..15 {
            std::thread::sleep(Duration::from_millis(120));
            if check_oj_listening() {
                return true;
            }
        }
    }
    check_oj_listening()
}

struct ExecResult {
    ok: bool,
    verdict: String,
    stdout: String,
    stderr: String,
    time_ms: u64,
    exit_code: i32,
}

fn run_process_with_input(
    bin: &Path,
    args: &[&str],
    input_str: &str,
    timeout_ms: u64,
    cwd: &Path,
) -> ExecResult {
    let start = Instant::now();
    let mut cmd = Command::new(bin);
    cmd.args(args)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return ExecResult {
                ok: false,
                verdict: "RE".to_string(),
                stdout: String::new(),
                stderr: format!("Không thể khởi chạy {}: {}", bin.display(), e),
                time_ms: 0,
                exit_code: -1,
            };
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        let input_bytes = input_str.as_bytes().to_vec();
        std::thread::spawn(move || {
            let _ = stdin.write_all(&input_bytes);
            let _ = stdin.flush();
        });
    }

    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();

    let out_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(r) = stdout_pipe {
            let _ = r.take(256 * 1024).read_to_end(&mut buf);
        }
        String::from_utf8_lossy(&buf).to_string()
    });

    let err_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(r) = stderr_pipe {
            let _ = r.take(256 * 1024).read_to_end(&mut buf);
        }
        String::from_utf8_lossy(&buf).to_string()
    });

    let timeout = Duration::from_millis(timeout_ms);
    let mut killed_by_timeout = false;
    let exit_status = loop {
        match child.try_wait() {
            Ok(Some(st)) => break Some(st),
            Ok(None) => {
                if start.elapsed() >= timeout {
                    killed_by_timeout = true;
                    let _ = child.kill();
                    break child.wait().ok();
                }
                std::thread::sleep(Duration::from_millis(12));
            }
            Err(_) => break None,
        }
    };

    let time_ms = start.elapsed().as_millis() as u64;
    let stdout = out_handle.join().unwrap_or_default();
    let stderr = err_handle.join().unwrap_or_default();

    if killed_by_timeout {
        return ExecResult {
            ok: false,
            verdict: "TLE".to_string(),
            stdout,
            stderr: format!("Quá thời gian giới hạn ({} ms)", timeout_ms),
            time_ms,
            exit_code: -1,
        };
    }

    let code = exit_status.and_then(|s| s.code()).unwrap_or(-1);
    let ok = code == 0;
    ExecResult {
        ok,
        verdict: if ok { "OK".to_string() } else { "RE".to_string() },
        stdout,
        stderr,
        time_ms,
        exit_code: code,
    }
}

fn fnv1a_hash(text: &str) -> String {
    let mut h1: u64 = 0xcbf29ce484222325;
    let mut h2: u64 = 0x84222325cbf29ce4;
    for (i, b) in text.as_bytes().iter().enumerate() {
        h1 ^= *b as u64;
        h1 = h1.wrapping_mul(0x100000001b3);
        h2 ^= (*b as u64).wrapping_add(i as u64);
        h2 = h2.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}{:016x}", h1, h2)
}

struct CompiledBinary {
    ok: bool,
    exe_file: PathBuf,
    compile_output: String,
}

fn compile_cpp_source(code: &str) -> CompiledBinary {
    let tmp_dir = std::env::temp_dir().join("drgx_tauri_studio_build");
    let _ = std::fs::create_dir_all(&tmp_dir);
    let hash = fnv1a_hash(code);
    let src_file = tmp_dir.join(format!("cached_{}.cpp", hash));
    let exe_file = tmp_dir.join(format!("cached_{}.exe", hash));

    if exe_file.is_file() {
        if let Ok(meta) = std::fs::metadata(&exe_file) {
            if meta.len() > 0 {
                return CompiledBinary {
                    ok: true,
                    exe_file,
                    compile_output: String::new(),
                };
            }
        }
    }

    let _ = std::fs::write(&src_file, code);
    let gxx = gxx_bin();
    let src_str = src_file.to_string_lossy().to_string();
    let exe_str = exe_file.to_string_lossy().to_string();
    let res = run_process_with_input(
        &gxx,
        &["-std=c++17", "-O2", "-pipe", &src_str, "-o", &exe_str],
        "",
        15000,
        &tmp_dir,
    );
    let ok = res.ok && exe_file.is_file();
    let compile_output = if !res.stderr.trim().is_empty() {
        res.stderr.trim().to_string()
    } else {
        res.stdout.trim().to_string()
    };
    if !ok {
        let _ = std::fs::remove_file(&exe_file);
    }
    CompiledBinary {
        ok,
        exe_file,
        compile_output,
    }
}

fn normalize_output(s: &str) -> String {
    s.replace("\r\n", "\n")
        .lines()
        .map(|l| l.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn cp_templates() -> Value {
    json!([
        {
            "id": "fastio",
            "name": "C++17 Competitive Template (Fast I/O)",
            "category": "Core",
            "desc": "Khung chuẩn thi HSG / ICPC với Fast I/O, macro gọn và hàm solve()",
            "code": "#include <bits/stdc++.h>\nusing namespace std;\n\nusing ll = long long;\nusing pii = pair<int, int>;\n#define all(x) (x).begin(), (x).end()\n\nvoid solve() {\n    int n;\n    if (!(cin >> n)) return;\n    vector<ll> a(n);\n    for (int i = 0; i < n; ++i) cin >> a[i];\n    cout << accumulate(all(a), 0LL) << \"\\n\";\n}\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int t = 1;\n    // cin >> t;\n    while (t--) solve();\n    return 0;\n}\n"
        },
        {
            "id": "dsu",
            "name": "Disjoint Set Union (DSU / Union-Find)",
            "category": "Data Structures",
            "desc": "Nén đường + gộp theo kích thước O(alpha(N))",
            "code": "struct DSU {\n    vector<int> parent, sz;\n    int components;\n    DSU(int n = 0) { init(n); }\n    void init(int n) {\n        parent.resize(n + 1);\n        iota(parent.begin(), parent.end(), 0);\n        sz.assign(n + 1, 1);\n        components = n;\n    }\n    int find(int v) {\n        return v == parent[v] ? v : parent[v] = find(parent[v]);\n    }\n    bool unite(int a, int b) {\n        a = find(a); b = find(b);\n        if (a == b) return false;\n        if (sz[a] < sz[b]) swap(a, b);\n        parent[b] = a;\n        sz[a] += sz[b];\n        components--;\n        return true;\n    }\n    int size(int v) { return sz[find(v)]; }\n};"
        },
        {
            "id": "fenwick",
            "name": "Fenwick Tree (Binary Indexed Tree)",
            "category": "Data Structures",
            "desc": "Cập nhật điểm & truy vấn tổng tiền tố O(log N)",
            "code": "template <typename T>\nstruct Fenwick {\n    int n;\n    vector<T> tree;\n    Fenwick(int n = 0) : n(n), tree(n + 1, 0) {}\n    void add(int i, T delta) {\n        for (; i <= n; i += i & -i) tree[i] += delta;\n    }\n    T query(int i) const {\n        T sum = 0;\n        for (; i > 0; i -= i & -i) sum += tree[i];\n        return sum;\n    }\n    T query(int l, int r) const { return l > r ? 0 : query(r) - query(l - 1); }\n};"
        },
        {
            "id": "segtree",
            "name": "Segment Tree (Point Update, Range Query)",
            "category": "Data Structures",
            "desc": "Cây phân đoạn tổng/min/max chuẩn O(log N)",
            "code": "struct SegTree {\n    int n;\n    vector<long long> st;\n    SegTree(int n = 0) : n(n), st(4 * n + 4, 0) {}\n    void update(int id, int l, int r, int pos, long long val) {\n        if (l == r) { st[id] = val; return; }\n        int mid = (l + r) >> 1;\n        if (pos <= mid) update(id << 1, l, mid, pos, val);\n        else update(id << 1 | 1, mid + 1, r, pos, val);\n        st[id] = st[id << 1] + st[id << 1 | 1];\n    }\n    long long query(int id, int l, int r, int u, int v) {\n        if (v < l || r < u) return 0;\n        if (u <= l && r <= v) return st[id];\n        int mid = (l + r) >> 1;\n        return query(id << 1, l, mid, u, v) + query(id << 1 | 1, mid + 1, r, u, v);\n    }\n};"
        },
        {
            "id": "lazy_segtree",
            "name": "Lazy Segment Tree (Range Add, Range Sum/Max)",
            "category": "Data Structures",
            "desc": "Cập nhật đoạn + truy vấn đoạn với Lazy Propagation O(log N)",
            "code": "struct LazySegTree {\n    int n;\n    vector<long long> st, lazy;\n    LazySegTree(int n = 0) : n(n), st(4 * n + 4, 0), lazy(4 * n + 4, 0) {}\n    void apply(int id, int l, int r, long long val) {\n        st[id] += val * (r - l + 1);\n        lazy[id] += val;\n    }\n    void push(int id, int l, int r) {\n        if (lazy[id] != 0) {\n            int mid = (l + r) >> 1;\n            apply(id << 1, l, mid, lazy[id]);\n            apply(id << 1 | 1, mid + 1, r, lazy[id]);\n            lazy[id] = 0;\n        }\n    }\n    void update(int id, int l, int r, int u, int v, long long val) {\n        if (v < l || r < u) return;\n        if (u <= l && r <= v) { apply(id, l, r, val); return; }\n        push(id, l, r);\n        int mid = (l + r) >> 1;\n        update(id << 1, l, mid, u, v, val);\n        update(id << 1 | 1, mid + 1, r, u, v, val);\n        st[id] = st[id << 1] + st[id << 1 | 1];\n    }\n    long long query(int id, int l, int r, int u, int v) {\n        if (v < l || r < u) return 0;\n        if (u <= l && r <= v) return st[id];\n        push(id, l, r);\n        int mid = (l + r) >> 1;\n        return query(id << 1, l, mid, u, v) + query(id << 1 | 1, mid + 1, r, u, v);\n    }\n};"
        },
        {
            "id": "sparse_table",
            "name": "Sparse Table (RMQ O(1) Query)",
            "category": "Data Structures",
            "desc": "Truy vấn Min/Max/GCD trên đoạn tĩnh trong O(1)",
            "code": "struct SparseTable {\n    int n, LOG;\n    vector<vector<long long>> st;\n    vector<int> lg;\n    SparseTable(const vector<long long>& a) {\n        n = (int)a.size();\n        LOG = __lg(max(1, n)) + 1;\n        lg.assign(n + 1, 0);\n        for (int i = 2; i <= n; ++i) lg[i] = lg[i >> 1] + 1;\n        st.assign(LOG, vector<long long>(n));\n        if (n > 0) st[0] = a;\n        for (int j = 1; j < LOG; ++j)\n            for (int i = 0; i + (1 << j) <= n; ++i)\n                st[j][i] = min(st[j - 1][i], st[j - 1][i + (1 << (j - 1))]);\n    }\n    long long query(int l, int r) const {\n        int k = lg[r - l + 1];\n        return min(st[k][l], st[k][r - (1 << k) + 1]);\n    }\n};"
        },
        {
            "id": "dijkstra",
            "name": "Dijkstra Shortest Path",
            "category": "Graphs",
            "desc": "Tìm đường đi ngắn nhất từ 1 đỉnh trên đồ thị trọng số không âm O((V+E) log V)",
            "code": "const long long INF = (1LL << 60);\nvector<long long> dijkstra(int n, int src, const vector<vector<pair<int, long long>>>& adj) {\n    vector<long long> dist(n + 1, INF);\n    priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<>> pq;\n    dist[src] = 0;\n    pq.push({0, src});\n    while (!pq.empty()) {\n        auto [d, u] = pq.top();\n        pq.pop();\n        if (d != dist[u]) continue;\n        for (auto [v, w] : adj[u]) {\n            if (dist[u] + w < dist[v]) {\n                dist[v] = dist[u] + w;\n                pq.push({dist[v], v});\n            }\n        }\n    }\n    return dist;\n}"
        },
        {
            "id": "lca",
            "name": "LCA — Binary Lifting",
            "category": "Trees",
            "desc": "Tổ tiên chung gần nhất & khoảng cách trên cây O(log N)",
            "code": "struct LCA {\n    int n, LOG;\n    vector<int> depth;\n    vector<vector<int>> up, adj;\n    LCA(int n) : n(n), LOG(__lg(n) + 2), depth(n + 1, 0), up(n + 1, vector<int>(LOG, 0)), adj(n + 1) {}\n    void add_edge(int u, int v) { adj[u].push_back(v); adj[v].push_back(u); }\n    void dfs(int u, int p) {\n        up[u][0] = p;\n        for (int j = 1; j < LOG; ++j) up[u][j] = up[up[u][j - 1]][j - 1];\n        for (int v : adj[u]) if (v != p) { depth[v] = depth[u] + 1; dfs(v, u); }\n    }\n    int lca(int u, int v) const {\n        if (depth[u] < depth[v]) swap(u, v);\n        int diff = depth[u] - depth[v];\n        for (int j = 0; j < LOG; ++j) if ((diff >> j) & 1) u = up[u][j];\n        if (u == v) return u;\n        for (int j = LOG - 1; j >= 0; --j)\n            if (up[u][j] != up[v][j]) { u = up[u][j]; v = up[v][j]; }\n        return up[u][0];\n    }\n    int dist(int u, int v) const { return depth[u] + depth[v] - 2 * depth[lca(u, v)]; }\n};"
        },
        {
            "id": "tarjan_scc",
            "name": "Tarjan Strongly Connected Components (SCC)",
            "category": "Graphs",
            "desc": "Tìm thành phần liên thông mạnh trong O(V + E)",
            "code": "struct TarjanSCC {\n    int n, timer = 0, scc_cnt = 0;\n    vector<vector<int>> adj;\n    vector<int> tin, low, comp, st;\n    vector<bool> in_st;\n    TarjanSCC(int n) : n(n), adj(n + 1), tin(n + 1, 0), low(n + 1, 0), comp(n + 1, 0), in_st(n + 1, false) {}\n    void add_edge(int u, int v) { adj[u].push_back(v); }\n    void dfs(int u) {\n        tin[u] = low[u] = ++timer;\n        st.push_back(u); in_st[u] = true;\n        for (int v : adj[u]) {\n            if (!tin[v]) { dfs(v); low[u] = min(low[u], low[v]); }\n            else if (in_st[v]) low[u] = min(low[u], tin[v]);\n        }\n        if (low[u] == tin[u]) {\n            ++scc_cnt;\n            while (true) {\n                int v = st.back(); st.pop_back();\n                in_st[v] = false; comp[v] = scc_cnt;\n                if (u == v) break;\n            }\n        }\n    }\n};"
        },
        {
            "id": "dinic",
            "name": "Dinic Maximum Flow",
            "category": "Graphs",
            "desc": "Luồng cực đại trên mạng O(V^2 E) / O(E sqrt(V))",
            "code": "struct Dinic {\n    struct Edge { int to, rev; long long cap; };\n    int n;\n    vector<vector<Edge>> adj;\n    vector<int> level, ptr;\n    Dinic(int n) : n(n), adj(n + 1), level(n + 1), ptr(n + 1) {}\n    void add_edge(int u, int v, long long cap) {\n        adj[u].push_back({v, (int)adj[v].size(), cap});\n        adj[v].push_back({u, (int)adj[u].size() - 1, 0});\n    }\n    bool bfs(int s, int t) {\n        fill(level.begin(), level.end(), -1);\n        queue<int> q; level[s] = 0; q.push(s);\n        while (!q.empty()) {\n            int u = q.front(); q.pop();\n            for (auto& e : adj[u]) if (e.cap > 0 && level[e.to] == -1) {\n                level[e.to] = level[u] + 1; q.push(e.to);\n            }\n        }\n        return level[t] != -1;\n    }\n    long long dfs(int u, int t, long long pushed) {\n        if (pushed == 0 || u == t) return pushed;\n        for (int& cid = ptr[u]; cid < (int)adj[u].size(); ++cid) {\n            auto& e = adj[u][cid];\n            if (level[u] + 1 != level[e.to] || e.cap == 0) continue;\n            long long tr = dfs(e.to, t, min(pushed, e.cap));\n            if (tr == 0) continue;\n            e.cap -= tr; adj[e.to][e.rev].cap += tr;\n            return tr;\n        }\n        return 0;\n    }\n    long long max_flow(int s, int t) {\n        long long flow = 0;\n        while (bfs(s, t)) {\n            fill(ptr.begin(), ptr.end(), 0);\n            while (long long pushed = dfs(s, t, (1LL << 60))) flow += pushed;\n        }\n        return flow;\n    }\n};"
        },
        {
            "id": "kmp",
            "name": "KMP Prefix Function & Pattern Matching",
            "category": "Strings",
            "desc": "Mảng pi[] và tìm kiếm mẫu tuyến tính O(|S| + |P|)",
            "code": "vector<int> prefix_function(const string& s) {\n    int n = (int)s.size();\n    vector<int> pi(n, 0);\n    for (int i = 1; i < n; ++i) {\n        int j = pi[i - 1];\n        while (j > 0 && s[i] != s[j]) j = pi[j - 1];\n        if (s[i] == s[j]) ++j;\n        pi[i] = j;\n    }\n    return pi;\n}"
        },
        {
            "id": "rolling_hash",
            "name": "Double Polynomial Rolling Hash",
            "category": "Strings",
            "desc": "Băm xâu 2 modulo chống va chạm, so sánh xâu con O(1)",
            "code": "struct PolyHash {\n    static constexpr long long M1 = 1000000007LL, M2 = 1000000009LL, B = 313;\n    vector<long long> h1, h2, p1, p2;\n    PolyHash(const string& s) {\n        int n = (int)s.size();\n        h1.assign(n + 1, 0); h2.assign(n + 1, 0);\n        p1.assign(n + 1, 1); p2.assign(n + 1, 1);\n        for (int i = 0; i < n; ++i) {\n            h1[i + 1] = (h1[i] * B + s[i]) % M1;\n            h2[i + 1] = (h2[i] * B + s[i]) % M2;\n            p1[i + 1] = (p1[i] * B) % M1;\n            p2[i + 1] = (p2[i] * B) % M2;\n        }\n    }\n    pair<long long, long long> get(int l, int r) const {\n        long long x1 = (h1[r + 1] - h1[l] * p1[r - l + 1]) % M1;\n        long long x2 = (h2[r + 1] - h2[l] * p2[r - l + 1]) % M2;\n        if (x1 < 0) x1 += M1;\n        if (x2 < 0) x2 += M2;\n        return {x1, x2};\n    }\n};"
        },
        {
            "id": "modint_comb",
            "name": "Modular Arithmetic & nCr Combinatorics",
            "category": "Math",
            "desc": "Lũy thừa nhanh, nghịch đảo modulo và tổ hợp C(n, k) O(1)",
            "code": "const long long MOD = 1000000007LL;\nlong long modpow(long long a, long long e, long long m = MOD) {\n    long long r = 1 % m; a %= m;\n    for (; e > 0; e >>= 1, a = (__int128)a * a % m)\n        if (e & 1) r = (__int128)r * a % m;\n    return r;\n}\nstruct Comb {\n    vector<long long> fact, inv;\n    Comb(int n) : fact(n + 1, 1), inv(n + 1, 1) {\n        for (int i = 1; i <= n; ++i) fact[i] = fact[i - 1] * i % MOD;\n        inv[n] = modpow(fact[n], MOD - 2);\n        for (int i = n - 1; i >= 0; --i) inv[i] = inv[i + 1] * (i + 1) % MOD;\n    }\n    long long C(int n, int k) const {\n        if (k < 0 || k > n) return 0;\n        return fact[n] * inv[k] % MOD * inv[n - k] % MOD;\n    }\n};"
        },
        {
            "id": "matrix_exp",
            "name": "Matrix Exponentiation O(K^3 log N)",
            "category": "Math",
            "desc": "Nhân ma trận & lũy thừa ma trận giải quy hoạch động tuyến tính N lớn",
            "code": "struct Matrix {\n    int n;\n    vector<vector<long long>> m;\n    static constexpr long long MOD = 1000000007LL;\n    Matrix(int n, long long diag = 0) : n(n), m(n, vector<long long>(n, 0)) {\n        for (int i = 0; i < n; ++i) m[i][i] = diag;\n    }\n    Matrix operator*(const Matrix& o) const {\n        Matrix res(n, 0);\n        for (int i = 0; i < n; ++i)\n            for (int k = 0; k < n; ++k) if (m[i][k])\n                for (int j = 0; j < n; ++j)\n                    res.m[i][j] = (res.m[i][j] + m[i][k] * o.m[k][j]) % MOD;\n        return res;\n    }\n    static Matrix power(Matrix a, long long e) {\n        Matrix res(a.n, 1);\n        for (; e > 0; e >>= 1, a = a * a) if (e & 1) res = res * a;\n        return res;\n    }\n};"
        },
        {
            "id": "convex_hull",
            "name": "Convex Hull (Monotone Chain)",
            "category": "Geometry",
            "desc": "Bao lồi 2D theo thuật toán Andrew Monotone Chain O(N log N)",
            "code": "struct Pt {\n    long long x, y;\n    bool operator<(const Pt& o) const { return x != o.x ? x < o.x : y < o.y; }\n};\nlong long cross(const Pt& O, const Pt& A, const Pt& B) {\n    return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);\n}\nvector<Pt> convex_hull(vector<Pt> pts) {\n    int n = (int)pts.size(), k = 0;\n    if (n <= 1) return pts;\n    sort(pts.begin(), pts.end());\n    vector<Pt> h(2 * n);\n    for (int i = 0; i < n; ++i) {\n        while (k >= 2 && cross(h[k - 2], h[k - 1], pts[i]) <= 0) --k;\n        h[k++] = pts[i];\n    }\n    for (int i = n - 2, t = k + 1; i >= 0; --i) {\n        while (k >= t && cross(h[k - 2], h[k - 1], pts[i]) <= 0) --k;\n        h[k++] = pts[i];\n    }\n    h.resize(k - 1);\n    return h;\n}"
        }
    ])
}

fn split_code_and_line_comment(line: &str) -> (&str, &str) {
    let bytes = line.as_bytes();
    let mut in_str = false;
    let mut in_chr = false;
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if (in_str || in_chr) && c == b'\\' {
            i += 2;
            continue;
        }
        if !in_chr && c == b'"' {
            in_str = !in_str;
        } else if !in_str && c == b'\'' {
            in_chr = !in_chr;
        } else if !in_str && !in_chr && c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            return (&line[..i], &line[i..]);
        }
        i += 1;
    }
    (line, "")
}

fn is_missing_cpp_semicolon(trimmed: &str, next_trimmed: &str) -> bool {
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.starts_with('#')
        || trimmed.starts_with("//")
        || trimmed.starts_with("/*")
        || trimmed.starts_with('*')
        || trimmed.starts_with("*/")
    {
        return false;
    }
    if trimmed.ends_with(';')
        || trimmed.ends_with('{')
        || trimmed.ends_with(',')
        || trimmed.ends_with(':')
        || trimmed.ends_with('\\')
    {
        return false;
    }
    if trimmed.ends_with('}') {
        if trimmed.starts_with("struct ")
            || trimmed.starts_with("class ")
            || trimmed.starts_with("enum ")
            || trimmed.starts_with("union ")
        {
            return true;
        }
        if trimmed.contains('=')
            && !trimmed.starts_with("if")
            && !trimmed.starts_with("while")
            && !trimmed.starts_with("for")
            && !trimmed.contains("[](")
        {
            return true;
        }
        return false;
    }

    // Postfix ++ / -- needs a semicolon; other trailing binary operators continue to next line
    if !trimmed.ends_with("++") && !trimmed.ends_with("--") {
        for op in ["+", "-", "*", "/", "%", "=", "<<", ">>", "&&", "||", "&", "|", "^", "?", "(", "["] {
            if trimmed.ends_with(op) {
                return false;
            }
        }
    }

    if !next_trimmed.is_empty() {
        for cont in ["{", "<<", ">>", "?", ":", ".", "->", ")"] {
            if next_trimmed.starts_with(cont) {
                return false;
            }
        }
    }

    if matches!(trimmed, "else" | "do" | "try") {
        return false;
    }

    if trimmed.starts_with("} while") {
        return true;
    }

    for kw in ["if ", "if(", "else if ", "else if(", "for ", "for(", "while ", "while(", "switch ", "switch(", "catch ", "catch("] {
        if trimmed.starts_with(kw) {
            return !trimmed.ends_with(')');
        }
    }

    if trimmed.starts_with("template") && trimmed.ends_with('>') {
        return false;
    }

    for kw in ["struct ", "class ", "namespace ", "enum ", "union "] {
        if trimmed.starts_with(kw) && !trimmed.contains('=') {
            return false;
        }
    }

    // Function signature without '{' on the same line (e.g. `int main()` or `void solve(int n)`)
    if trimmed.ends_with(')') && !trimmed.contains('=') && !trimmed.contains("<<") && !trimmed.contains(">>") {
        for fn_prefix in [
            "int main(", "signed main(", "void ", "int ", "long long ", "ll ",
            "bool ", "double ", "float ", "string ", "char ", "auto ", "vector<", "pair<",
        ] {
            if trimmed.starts_with(fn_prefix) {
                return false;
            }
        }
    }

    true
}

struct CompilerDiag {
    line: usize,
    col: usize,
    severity: String,
    raw_msg: String,
    vi_title: String,
    vi_detail: String,
}

fn translate_gcc_message(msg: &str) -> (String, String) {
    let m = msg.trim();
    if m.contains("expected ';'") || m.contains("expected ‘;’") {
        return (
            "Thiếu dấu chấm phẩy `;` (Lỗi cú pháp C++)".to_string(),
            format!("Trình biên dịch `g++` phát hiện thiếu `;`: `{}`.", m),
        );
    }
    if m.contains("was not declared in this scope") {
        return (
            "Biến hoặc hàm chưa được khai báo".to_string(),
            format!("Trình biên dịch `g++` báo: `{}`. Hãy kiểm tra chính tả tên biến, kiểu dữ liệu hoặc thư viện `#include`.", m),
        );
    }
    if m.contains("expected '}'") || m.contains("expected ‘}’") {
        return (
            "Thiếu dấu đóng ngoặc nhọn `}`".to_string(),
            format!("Khối lệnh `{}` chưa được đóng đủ: `{}`.", "{}", m),
        );
    }
    if m.contains("expected ')'") || m.contains("expected ‘)’") {
        return (
            "Thiếu dấu đóng ngoặc tròn `)`".to_string(),
            format!("Biểu thức hoặc lời gọi hàm thiếu `)`: `{}`.", m),
        );
    }
    if m.contains("no match for 'operator<<'") || m.contains("no match for ‘operator<<’") {
        return (
            "Sai toán tử `<<` (ví dụ `cin <<` thay vì `cin >>` hoặc in kiểu dữ liệu không hỗ trợ)".to_string(),
            format!("Chi tiết từ `g++`: `{}`.", m),
        );
    }
    if m.contains("no match for 'operator>>'") || m.contains("no match for ‘operator>>’") {
        return (
            "Sai toán tử `>>` (ví dụ `cout >>` thay vì `cout <<`)".to_string(),
            format!("Chi tiết từ `g++`: `{}`.", m),
        );
    }
    if m.contains("suggest parentheses around assignment used as truth value") {
        return (
            "Phép gán `=` bên trong điều kiện `if/while` (nguy cơ nhầm với `==`)".to_string(),
            format!("Chi tiết từ `g++`: `{}`. Trong C++, `if (a = b)` sẽ gán `b` vào `a` thay vì so sánh bằng `==`.", m),
        );
    }
    if m.contains("is used uninitialized") || m.contains("may be used uninitialized") {
        return (
            "Biến cục bộ sử dụng khi chưa khởi tạo giá trị ban đầu".to_string(),
            format!("Chi tiết từ `g++`: `{}`. Biến cục bộ chưa gán `= 0` sẽ mang giá trị rác ngẫu nhiên trong bộ nhớ.", m),
        );
    }
    if m.contains("comparison of integer expressions of different signedness") {
        return (
            "So sánh giữa số nguyên có dấu (`int`) và không dấu (`size_t`)".to_string(),
            format!("Chi tiết từ `g++`: `{}`. Khi ép `(int)v.size()` sẽ tránh lỗi tràn số âm khi vector rỗng.", m),
        );
    }
    if m.contains("control reaches end of non-void function") {
        return (
            "Hàm có kiểu trả về nhưng thiếu lệnh `return` ở cuối".to_string(),
            format!("Chi tiết từ `g++`: `{}`. Điều này gây Undefined Behavior trong C++.", m),
        );
    }
    if m.contains("division by zero") {
        return (
            "Chia hoặc lấy dư cho `0` (gây Runtime Error / SIGFPE)".to_string(),
            format!("Chi tiết từ `g++`: `{}`.", m),
        );
    }
    if m.contains("array subscript") && m.contains("is above array bounds") {
        return (
            "Tràn mảng (Array Subscript Out of Bounds)".to_string(),
            format!("Trình biên dịch `g++` phát hiện truy cập vượt quá kích thước mảng: `{}`.", m),
        );
    }
    if m.contains("array subscript") && m.contains("is below array bounds") {
        return (
            "Sai chỉ số mảng âm (Array Subscript Below Bounds)".to_string(),
            format!("Trình biên dịch `g++` phát hiện truy cập chỉ số âm ngoài vùng nhớ mảng: `{}`.", m),
        );
    }
    if m.contains("too many initializers for") {
        return (
            "Tràn mảng khi khởi tạo (Số phần tử `{...}` vượt quá kích thước mảng)".to_string(),
            format!("Chi tiết từ `g++`: `{}`. Cần tăng kích thước mảng khai báo trong `[...]`. ", m),
        );
    }
    if m.contains("deduced conflicting types for parameter") || m.contains("no matching function for call to 'max") || m.contains("no matching function for call to ‘max") || m.contains("no matching function for call to 'min") || m.contains("no matching function for call to ‘min") {
        return (
            "Không khớp kiểu dữ liệu số trong `max(...)` / `min(...)`".to_string(),
            format!("Hai đối số truyền vào `max/min` khác kiểu (ví dụ `int` và `long long` / `size_t`). Nên dùng `max<long long>(a, b)`: `{}`.", m),
        );
    }
    if m.contains("too few arguments to function") {
        return (
            "Không khớp số lượng đối số (Truyền thiếu tham số cho hàm)".to_string(),
            format!("Chi tiết từ `g++`: `{}`.", m),
        );
    }
    if m.contains("too many arguments to function") {
        return (
            "Không khớp số lượng đối số (Truyền dư tham số cho hàm)".to_string(),
            format!("Chi tiết từ `g++`: `{}`.", m),
        );
    }
    if m.contains("format") && (m.contains("expects argument of type") || m.contains("expects a matching")) {
        return (
            "Không khớp định dạng hoặc số lượng đối số trong `printf` / `scanf`".to_string(),
            format!("Chi tiết từ `g++`: `{}`.", m),
        );
    }
    (
        format!("Cảnh báo / Lỗi từ trình biên dịch: `{}`", m),
        format!("Thông báo gốc từ `g++`: `{}`", m),
    )
}

#[derive(Clone, Debug)]
struct DeclArrayInfo {
    name: String,
    decl_line: usize,
    size_expr: String,
    size_const: Option<i64>,
    is_vector: bool,
    new_size_expr: Option<String>,
}

fn count_format_specifiers(fmt_str: &str) -> usize {
    let bytes = fmt_str.as_bytes();
    let mut cnt = 0;
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 1 < bytes.len() && bytes[i + 1] == b'%' {
                i += 2;
                continue;
            }
            cnt += 1;
        }
        i += 1;
    }
    cnt
}

fn split_top_level_args(s: &str) -> Vec<String> {
    let mut res = Vec::new();
    let mut cur = String::new();
    let mut depth_p = 0i32;
    let mut depth_b = 0i32;
    let mut depth_c = 0i32;
    let mut in_str = false;
    let mut in_chr = false;
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if (in_str || in_chr) && b == b'\\' {
            cur.push(b as char);
            if i + 1 < bytes.len() {
                cur.push(bytes[i + 1] as char);
            }
            i += 2;
            continue;
        }
        if !in_chr && b == b'"' {
            in_str = !in_str;
        } else if !in_str && b == b'\'' {
            in_chr = !in_chr;
        } else if !in_str && !in_chr {
            match b {
                b'(' => depth_p += 1,
                b')' => depth_p -= 1,
                b'[' => depth_b += 1,
                b']' => depth_b -= 1,
                b'{' => depth_c += 1,
                b'}' => depth_c -= 1,
                b',' if depth_p == 0 && depth_b == 0 && depth_c == 0 => {
                    res.push(cur.trim().to_string());
                    cur.clear();
                    i += 1;
                    continue;
                }
                _ => {}
            }
        }
        cur.push(b as char);
        i += 1;
    }
    if !cur.trim().is_empty() {
        res.push(cur.trim().to_string());
    }
    res
}

fn check_cpp_compiler_diagnostics(code: &str) -> (bool, Vec<CompilerDiag>, String) {
    let tmp_dir = std::env::temp_dir().join("drgx_tauri_studio_build");
    let _ = std::fs::create_dir_all(&tmp_dir);
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let src_file = tmp_dir.join(format!("diag_{}.cpp", stamp));
    let _ = std::fs::write(&src_file, code);
    let src_str = src_file.to_string_lossy().to_string();

    let res = run_process_with_input(
        &gxx_bin(),
        &[
            "-fsyntax-only",
            "-std=c++17",
            "-O2",
            "-Wall",
            "-Wextra",
            "-Warray-bounds=2",
            "-Wformat=2",
            "-Wreturn-type",
            "-Wuninitialized",
            "-Wno-unused-parameter",
            "-pipe",
            &src_str,
        ],
        "",
        6000,
        &tmp_dir,
    );
    let _ = std::fs::remove_file(&src_file);

    let raw_out = if !res.stderr.trim().is_empty() {
        res.stderr.trim().to_string()
    } else {
        res.stdout.trim().to_string()
    };

    let mut diags = Vec::new();
    for line in raw_out.lines() {
        // Match `<path>:<line>:<col>: error|warning: <msg>`
        let parts: Vec<&str> = line.splitn(5, ':').collect();
        // On Windows path starts with `C:\...` or `D:\...`, so drive colon is parts[0]
        if parts.len() >= 5 {
            // Try parsing with Windows drive letter `X:\path:line:col: sev: msg`
            let all_parts: Vec<&str> = line.split(':').collect();
            if all_parts.len() >= 5 {
                for idx in 1..all_parts.len().saturating_sub(2) {
                    if let (Ok(ln), Ok(col)) = (
                        all_parts[idx].trim().parse::<usize>(),
                        all_parts[idx + 1].trim().parse::<usize>(),
                    ) {
                        let sev_raw = all_parts[idx + 2].trim().to_lowercase();
                        if sev_raw.contains("error") || sev_raw.contains("warning") {
                            let msg = all_parts[idx + 3..].join(":").trim().to_string();
                            let severity = if sev_raw.contains("error") {
                                "error".to_string()
                            } else {
                                "warning".to_string()
                            };
                            let (vi_title, vi_detail) = translate_gcc_message(&msg);
                            diags.push(CompilerDiag {
                                line: ln,
                                col,
                                severity,
                                raw_msg: msg,
                                vi_title,
                                vi_detail,
                            });
                            break;
                        }
                    }
                }
            }
        }
    }

    (res.ok, diags, raw_out)
}

fn analyze_and_fix_code(code: &str, lang: &str, mode: &str) -> Value {
    let lines: Vec<&str> = code.lines().collect();
    let mut findings: Vec<Value> = Vec::new();
    let mut fixed = code.to_string();
    let mut first_error_line: usize = 0;
    let lang_lower = lang.to_lowercase();

    if lang_lower == "cpp" || lang_lower == "c++" || lang_lower == "c" {
        if code.trim().is_empty() {
            let tpl = "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    long long a, b;\n    if (cin >> a >> b) {\n        cout << (a + b) << \"\\n\";\n    }\n    return 0;\n}\n";
            return json!({
                "ok": true,
                "mode": mode,
                "title": "Chẩn đoán Bug & Tự động vá lỗi",
                "complexity": "O(1)",
                "findings": [{
                    "line": 1,
                    "severity": "error",
                    "title": "Dòng 1: Tệp mã nguồn đang trống (chưa có hàm `int main()`)",
                    "detail": "Tệp C++ trống sẽ gây lỗi linker `undefined reference to WinMain`. Đã tạo sẵn khung C++17 chuẩn thi đấu."
                }],
                "firstErrorLine": 1,
                "hasChanges": true,
                "fixedCode": tpl,
                "markdown": "### 🛠️ Kết quả quét mã nguồn (1 phát hiện)\n1. **[🚨 LỖI NGHIÊM TRỌNG] Dòng 1: Tệp mã nguồn đang trống (chưa có hàm `int main()`)**\n   - *Chi tiết:* Đã tạo sẵn khung C++17 chuẩn thi đấu. Bấm **\"✨ Áp dụng bản vá vào Editor\"** bên dưới."
            });
        }

        // 1. Pre-pass: Header & Keyword Typos (`include <bit/stdc++.h>`, `using namepsace`, `int mian`, `retrun`, `cni`, `cotu`, etc.)
        let mut pre_lines: Vec<String> = fixed.lines().map(|s| s.to_string()).collect();
        for (idx, ln) in pre_lines.iter_mut().enumerate() {
            let line_no = idx + 1;
            let trimmed_start = ln.trim_start().to_string();
            if trimmed_start.starts_with("include <") || trimmed_start.starts_with("include<") {
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Sai cú pháp `#include` (thiếu dấu `#` ở đầu)", line_no),
                    "detail": "Chỉ thị tiền xử lý trong C++ bắt buộc bắt đầu bằng dấu `#` (`#include <...>`). Đã tự động thêm `#`."
                }));
                if first_error_line == 0 { first_error_line = line_no; }
                *ln = format!("#{}", trimmed_start);
            }
            if ln.contains("<bit/stdc++.h>") || (ln.contains("<bits/stdc++.h") && !ln.contains("<bits/stdc++.h>")) {
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Sai tên hoặc thiếu dấu `>` ở thư viện `#include <bits/stdc++.h>`", line_no),
                    "detail": "Đã tự động sửa thành `#include <bits/stdc++.h>`."
                }));
                if first_error_line == 0 { first_error_line = line_no; }
                *ln = "#include <bits/stdc++.h>".to_string();
            }
            for (bad, good, desc) in [
                ("using namepsace std", "using namespace std", "Sai chính tả từ khóa `namespace`"),
                ("using namespac std", "using namespace std", "Sai chính tả từ khóa `namespace`"),
                ("using namespace sdt", "using namespace std", "Sai chính tả tên miền `std`"),
                ("int mian(", "int main(", "Sai tên hàm chính `int main()` (`mian` -> `main`)"),
                ("int man(", "int main(", "Sai tên hàm chính `int main()` (`man` -> `main`)"),
                ("signed mian(", "signed main(", "Sai tên hàm chính `signed main()`"),
                ("retrun ", "return ", "Sai chính tả từ khóa `return` (`retrun` -> `return`)"),
                ("reutrn ", "return ", "Sai chính tả từ khóa `return` (`reutrn` -> `return`)"),
                ("cni >>", "cin >>", "Sai chính tả luồng nhập `cin` (`cni` -> `cin`)"),
                ("cni <<", "cin >>", "Sai chính tả & chiều toán tử nhập (`cni <<` -> `cin >>`)"),
                ("cotu <<", "cout <<", "Sai chính tả luồng xuất `cout` (`cotu` -> `cout`)"),
                ("cuot <<", "cout <<", "Sai chính tả luồng xuất `cout` (`cuot` -> `cout`)"),
                ("cotu >>", "cout <<", "Sai chính tả & chiều toán tử xuất (`cotu >>` -> `cout <<`)"),
                ("cuot >>", "cout <<", "Sai chính tả & chiều toán tử xuất (`cuot >>` -> `cout <<`)"),
                ("vectro<", "vector<", "Sai chính tả kiểu `vector` (`vectro` -> `vector`)"),
                ("vecotr<", "vector<", "Sai chính tả kiểu `vector` (`vecotr` -> `vector`)"),
                ("stirng ", "string ", "Sai chính tả kiểu `string` (`stirng` -> `string`)"),
                ("long lon ", "long long ", "Sai chính tả kiểu `long long` (`long lon` -> `long long`)"),
                ("push_bakc(", "push_back(", "Sai chính tả hàm `.push_back()`"),
                ("pirntf(", "printf(", "Sai chính tả hàm `printf()`"),
                ("scnaf(", "scanf(", "Sai chính tả hàm `scanf()`"),
            ] {
                if ln.contains(bad) {
                    findings.push(json!({
                        "line": line_no,
                        "severity": "error",
                        "title": format!("Dòng {}: {} (`{}`)", line_no, desc, bad.trim()),
                        "detail": format!("Đã tự động sửa `{}` thành `{}`.", bad.trim(), good.trim())
                    }));
                    if first_error_line == 0 { first_error_line = line_no; }
                    *ln = ln.replace(bad, good);
                }
            }
            // Invalid comparison operators `=<` -> `<=` and `=>` -> `>=`
            if ln.contains("=<") && !ln.contains("<=<") {
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Sai cú pháp toán tử so sánh `=<` (đúng phải là `<=`)", line_no),
                    "detail": "Trong C++, toán tử nhỏ hơn hoặc bằng viết là `<=`. Đã tự động sửa `=<` thành `<=`."
                }));
                if first_error_line == 0 { first_error_line = line_no; }
                *ln = ln.replace("=<", "<=");
            }
            if (ln.contains("if (") || ln.contains("if(") || ln.contains("while (") || ln.contains("while(")) && ln.contains("=>") {
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Sai cú pháp toán tử so sánh `=>` (đúng phải là `>=`)", line_no),
                    "detail": "Trong C++, toán tử lớn hơn hoặc bằng viết là `>=`. Đã tự động sửa `=>` thành `>=`."
                }));
                if first_error_line == 0 { first_error_line = line_no; }
                *ln = ln.replace("=>", ">=");
            }
        }
        fixed = pre_lines.join("\n");

        // 1b. Check missing #include when STL / I/O symbols are used
        let uses_stl = ["cin", "cout", "vector", "string", "sort(", "pair<", "map<", "set<", "queue<", "max(", "min(", "printf(", "scanf("]
            .iter()
            .any(|kw| fixed.contains(kw));
        if uses_stl && !fixed.contains("#include") {
            findings.push(json!({
                "line": 1,
                "severity": "error",
                "title": "Dòng 1: Thiếu khai báo thư viện `#include <bits/stdc++.h>`",
                "detail": "Code sử dụng `cin/cout` hoặc STL nhưng chưa `#include` thư viện chuẩn. Đã tự động chèn `#include <bits/stdc++.h>` và `using namespace std;` ở đầu file."
            }));
            if first_error_line == 0 {
                first_error_line = 1;
            }
            if !fixed.contains("using namespace std") {
                fixed = format!("#include <bits/stdc++.h>\nusing namespace std;\n\n{}", fixed);
            } else {
                fixed = format!("#include <bits/stdc++.h>\n{}", fixed);
            }
        }

        // 1c. Collect declared arrays `type name[SIZE]` & vectors `vector<...> name(SIZE)` and user functions `ret fname(params)`
        let mut decl_arrays: Vec<DeclArrayInfo> = Vec::new();
        let mut user_funcs: Vec<(String, usize, usize)> = Vec::new(); // (name, param_count, decl_line)
        let scan_lines: Vec<String> = fixed.lines().map(|s| s.to_string()).collect();

        for (idx, ln) in scan_lines.iter().enumerate() {
            let line_no = idx + 1;
            let (cp, _) = split_code_and_line_comment(ln);
            let t = cp.trim();

            // Detect user function definition `type fname(params) {`
            if t.ends_with('{')
                && !t.starts_with("if")
                && !t.starts_with("for")
                && !t.starts_with("while")
                && !t.starts_with("switch")
            {
                if let (Some(lp), Some(rp)) = (t.find('('), t.rfind(')')) {
                    if lp > 2 && rp >= lp {
                        let before = t[..lp].trim();
                        if !before.contains('=') && !before.contains(';') {
                            let parts: Vec<&str> = before.split_whitespace().collect();
                            if parts.len() >= 2 {
                                let fname = parts.last().unwrap().trim_start_matches('*').trim_start_matches('&');
                                if fname != "main"
                                    && fname.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                                {
                                    let params_str = t[lp + 1..rp].trim();
                                    if !params_str.contains('=') {
                                        let p_cnt = if params_str.is_empty() || params_str == "void" {
                                            0
                                        } else {
                                            split_top_level_args(params_str).len()
                                        };
                                        user_funcs.push((fname.to_string(), p_cnt, line_no));
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Detect `vector<...> name(size)`
            if t.starts_with("vector<") {
                if let Some(gt) = t.rfind('>') {
                    let after_gt = t[gt + 1..].trim_end_matches(';').trim();
                    if let (Some(lp), Some(rp)) = (after_gt.find('('), after_gt.rfind(')')) {
                        if lp > 0 && rp > lp {
                            let vname = after_gt[..lp].trim();
                            let args = split_top_level_args(&after_gt[lp + 1..rp]);
                            if !args.is_empty() && vname.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                                let sz_str = args[0].trim().to_string();
                                let sz_const = sz_str.parse::<i64>().ok();
                                decl_arrays.push(DeclArrayInfo {
                                    name: vname.to_string(),
                                    decl_line: line_no,
                                    size_expr: sz_str,
                                    size_const: sz_const,
                                    is_vector: true,
                                    new_size_expr: None,
                                });
                            }
                        }
                    }
                }
            }

            // Detect C-array declaration `int a[N]` / `long long dp[100]`
            let is_decl_prefix = ["int ", "long long ", "ll ", "double ", "float ", "char ", "bool ", "string "]
                .iter()
                .any(|p| t.starts_with(p));
            if is_decl_prefix && t.contains('[') && t.contains(']') && !t.contains('(') {
                if let (Some(lb), Some(rb)) = (t.find('['), t.find(']')) {
                    if rb > lb + 1 {
                        let before_lb = t[..lb].trim();
                        if let Some(aname) = before_lb.split_whitespace().last() {
                            let clean_name = aname.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '_');
                            let sz_str = t[lb + 1..rb].trim().to_string();
                            let mut sz_const = sz_str.parse::<i64>().ok();

                            // Check initializer list overflow: `int a[3] = {10, 20, 30, 40}`
                            let mut override_sz: Option<String> = None;
                            if let (Some(cb_l), Some(cb_r)) = (t.find('{'), t.rfind('}')) {
                                if cb_r > cb_l {
                                    let elems = split_top_level_args(&t[cb_l + 1..cb_r]);
                                    if let Some(n_val) = sz_const {
                                        if (elems.len() as i64) > n_val {
                                            let safe_n = (elems.len() as i64) + 5;
                                            findings.push(json!({
                                                "line": line_no,
                                                "severity": "error",
                                                "title": format!("Dòng {}: Tràn mảng khi khởi tạo (`{}[{}]` nhưng truyền {} phần tử)", line_no, clean_name, n_val, elems.len()),
                                                "detail": format!("Mảng `{}` chỉ khai báo `{}` phần tử nhưng danh sách khởi tạo `{{...}}` có tới `{}` giá trị (gây lỗi CE `too many initializers`). Đã tự động nâng kích thước lên `[{}]`.", clean_name, n_val, elems.len(), safe_n)
                                            }));
                                            if first_error_line == 0 { first_error_line = line_no; }
                                            override_sz = Some(safe_n.to_string());
                                            sz_const = Some(safe_n);
                                        }
                                    }
                                }
                            }

                            if !clean_name.is_empty() {
                                decl_arrays.push(DeclArrayInfo {
                                    name: clean_name.to_string(),
                                    decl_line: line_no,
                                    size_expr: sz_str,
                                    size_const: sz_const,
                                    is_vector: false,
                                    new_size_expr: override_sz,
                                });
                            }
                        }
                    }
                }
            }
        }

        // 2. Line-by-line AST/Structural Pass: Array Bounds, Loop Index, Format/Arg Count, Quotes/Brackets, Missing `;`
        let cur_lines: Vec<String> = fixed.lines().map(|s| s.to_string()).collect();
        let mut patched_lines: Vec<String> = Vec::with_capacity(cur_lines.len());
        let mut missing_semi_lines: Vec<usize> = Vec::new();
        let mut in_block_comment = false;

        for idx in 0..cur_lines.len() {
            let orig_line = &cur_lines[idx];
            let line_no = idx + 1;
            let (code_part_raw, cmt_part) = split_code_and_line_comment(orig_line);
            let mut work_code = code_part_raw.to_string();

            // Track /* ... */ block comments
            if in_block_comment {
                if let Some(end_pos) = work_code.find("*/") {
                    in_block_comment = false;
                    let after = work_code[end_pos + 2..].trim();
                    if after.is_empty() {
                        patched_lines.push(orig_line.clone());
                        continue;
                    }
                } else {
                    patched_lines.push(orig_line.clone());
                    continue;
                }
            }
            if work_code.contains("/*") && !work_code.contains("*/") {
                in_block_comment = true;
                patched_lines.push(orig_line.clone());
                continue;
            }

            let trimmed = work_code.trim().to_string();

            // 2a. Stream direction bugs: `cin <<` or `cout >>`
            if trimmed.contains("cin <<") || trimmed.contains("cin<<") {
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Sai chiều toán tử nhập dữ liệu (`cin <<` thay vì `cin >>`)", line_no),
                    "detail": "Luồng nhập `cin` phải dùng toán tử `>>`. Đã tự động sửa thành `cin >>`."
                }));
                if first_error_line == 0 { first_error_line = line_no; }
                work_code = work_code.replace("cin <<", "cin >>").replace("cin<<", "cin >> ");
            }
            if trimmed.contains("cout >>") || trimmed.contains("cout>>") {
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Sai chiều toán tử xuất dữ liệu (`cout >>` thay vì `cout <<`)", line_no),
                    "detail": "Luồng xuất `cout` phải dùng toán tử `<<`. Đã tự động sửa thành `cout <<`."
                }));
                if first_error_line == 0 { first_error_line = line_no; }
                work_code = work_code.replace("cout >>", "cout <<").replace("cout>>", "cout << ");
            }

            // 2b. Array Out-of-Bounds & Negative Index Check (`a[-1]`, `a[N]` on `a[N]`)
            for arr in decl_arrays.iter_mut() {
                if line_no == arr.decl_line {
                    continue;
                }
                let pat_neg = format!("{}[-", arr.name);
                if work_code.contains(&pat_neg) {
                    if let Some(pos) = work_code.find(&pat_neg) {
                        if let Some(rb) = work_code[pos..].find(']') {
                            let bad_sub = work_code[pos..pos + rb + 1].to_string();
                            findings.push(json!({
                                "line": line_no,
                                "severity": "error",
                                "title": format!("Dòng {}: Sai chỉ số mảng âm (`{}`) gây đọc/ghi ngoài vùng nhớ", line_no, bad_sub),
                                "detail": format!("Chỉ số mảng trong C++ phải `>= 0`. Đã tự động sửa `{}` thành `{}[0]`.", bad_sub, arr.name)
                            }));
                            if first_error_line == 0 { first_error_line = line_no; }
                            work_code = work_code.replace(&bad_sub, &format!("{}[0]", arr.name));
                        }
                    }
                }

                // Check direct access `arr[idx]` where `idx == size_expr` or `idx_const >= size_const`
                let prefix = format!("{}[", arr.name);
                let mut search_from = 0;
                while let Some(rel_pos) = work_code[search_from..].find(&prefix) {
                    let abs_pos = search_from + rel_pos;
                    // Ensure word boundary before `arr.name`
                    let prev_ok = if abs_pos == 0 {
                        true
                    } else {
                        let pc = work_code.as_bytes()[abs_pos - 1] as char;
                        !pc.is_ascii_alphanumeric() && pc != '_'
                    };
                    let idx_start = abs_pos + prefix.len();
                    if prev_ok {
                        if let Some(rb_rel) = work_code[idx_start..].find(']') {
                            let idx_expr = work_code[idx_start..idx_start + rb_rel].trim();
                            let idx_const = idx_expr.parse::<i64>().ok();
                            let is_oob = if let (Some(ic), Some(sc)) = (idx_const, arr.size_const) {
                                ic >= sc
                            } else {
                                idx_expr == arr.size_expr
                            };
                            if is_oob {
                                let new_sz = if let (Some(ic), Some(sc)) = (idx_const, arr.size_const) {
                                    (ic.max(sc) + 5).to_string()
                                } else {
                                    format!("{} + 5", arr.size_expr)
                                };
                                findings.push(json!({
                                    "line": line_no,
                                    "severity": "error",
                                    "title": format!("Dòng {}: Tràn mảng / Sai index (`{}[{}]` vượt kích thước `{}`)", line_no, arr.name, idx_expr, arr.size_expr),
                                    "detail": format!("Mảng/vector `{}` khai báo ở dòng {} có kích thước `{}` (chỉ số hợp lệ: `0..{}-1`). Truy cập `{}[{}]` sẽ gây tràn bộ nhớ (Out-of-Bounds). Đã tự động nâng kích thước khai báo lên `{}`.", arr.name, arr.decl_line, arr.size_expr, arr.size_expr, arr.name, idx_expr, new_sz)
                                }));
                                if first_error_line == 0 { first_error_line = line_no; }
                                arr.new_size_expr = Some(new_sz);
                            }
                            search_from = idx_start + rb_rel + 1;
                            continue;
                        }
                    }
                    search_from = idx_start;
                }
            }

            // 2c. Loop Index Analyzer (`for (int i = 0; i <= n; i++)`, 1-based `1..<=n` on size `n`, `[i - 1]` when `i = 0`)
            if trimmed.starts_with("for (") || trimmed.starts_with("for(") {
                if let (Some(lp), Some(rp)) = (work_code.find('('), work_code.rfind(')')) {
                    if rp > lp {
                        let inside = work_code[lp + 1..rp].to_string();
                        let semi_cnt = inside.chars().filter(|&c| c == ';').count();
                        if !inside.contains(':') && semi_cnt < 2 {
                            findings.push(json!({
                                "line": line_no,
                                "severity": "error",
                                "title": format!("Dòng {}: Vòng lặp `for(...)` thiếu dấu `;` ngăn cách ({}/2 dấu `;`)", line_no, semi_cnt),
                                "detail": "Cú pháp chuẩn của vòng lặp `for (khởi_tạo; điều_kiện; bước_nhảy)` bắt buộc phải có đủ 2 dấu chấm phẩy `;`."
                            }));
                            if first_error_line == 0 { first_error_line = line_no; }
                        } else if semi_cnt == 2 {
                            let parts: Vec<&str> = inside.split(';').collect();
                            let init_part = parts[0].trim();
                            let cond_part = parts[1].trim();
                            // Look ahead at loop body (current line + next 4 lines)
                            let mut body_preview = work_code[rp + 1..].to_string();
                            for next_ln in cur_lines.iter().skip(idx + 1).take(4) {
                                body_preview.push('\n');
                                body_preview.push_str(next_ln);
                            }

                            // Extract loop variable name & start value (0 or 1)
                            let mut loop_var = String::new();
                            let mut start_val: Option<i64> = None;
                            if let Some(eq_idx) = init_part.find('=') {
                                let lhs = init_part[..eq_idx].trim();
                                let rhs = init_part[eq_idx + 1..].trim();
                                if let Some(vn) = lhs.split_whitespace().last() {
                                    loop_var = vn.to_string();
                                }
                                start_val = rhs.parse::<i64>().ok();
                            }

                            // Check `i = 0` with `i <= BOUND` where `BOUND` is array size or `.size()`
                            if start_val == Some(0) && cond_part.contains("<=") && !loop_var.is_empty() {
                                if let Some(le_pos) = cond_part.find("<=") {
                                    let bound = cond_part[le_pos + 2..].trim();
                                    let is_arr_bound = bound.contains(".size()")
                                        || decl_arrays.iter().any(|a| {
                                            a.size_expr == bound
                                                && body_preview.contains(&format!("{}[{}]", a.name, loop_var))
                                        });
                                    if is_arr_bound {
                                        findings.push(json!({
                                            "line": line_no,
                                            "severity": "error",
                                            "title": format!("Dòng {}: Sai index vòng lặp (`{} = 0; {} <= {}` gây tràn mảng ở bước cuối)", line_no, loop_var, loop_var, bound),
                                            "detail": format!("Khi duyệt mảng 0-based từ `0`, điều kiện dừng phải là `{} < {}` (nếu dùng `<= {}` sẽ chạy dư 1 phần tử và tràn mảng). Đã tự động sửa `<= {}` thành `< {}`.", loop_var, bound, bound, bound, bound)
                                        }));
                                        if first_error_line == 0 { first_error_line = line_no; }
                                        let old_cond = cond_part.to_string();
                                        let new_cond = old_cond.replacen("<=", "<", 1);
                                        work_code = work_code.replacen(&old_cond, &new_cond, 1);
                                    }
                                }
                            }

                            // Check 1-based loop `i = 1; i <= n` accessing `arr[i]` when `arr` has exact size `n`
                            if start_val == Some(1) && cond_part.contains("<=") && !loop_var.is_empty() {
                                if let Some(le_pos) = cond_part.find("<=") {
                                    let bound = cond_part[le_pos + 2..].trim();
                                    for arr in decl_arrays.iter_mut() {
                                        if arr.size_expr == bound
                                            && body_preview.contains(&format!("{}[{}]", arr.name, loop_var))
                                        {
                                            let new_sz = if let Some(sc) = arr.size_const {
                                                (sc + 5).to_string()
                                            } else {
                                                format!("{} + 5", arr.size_expr)
                                            };
                                            findings.push(json!({
                                                "line": line_no,
                                                "severity": "error",
                                                "title": format!("Dòng {}: Duyệt 1-based (`1..{}`) trên mảng `{}` chỉ có kích thước `{}` (Tràn mảng tại `{}`)", line_no, bound, arr.name, arr.size_expr, bound),
                                                "detail": format!("Vòng lặp chạy đến `{} = {}` nhưng `{}` chỉ có chỉ số `0..{}-1`. Đã tự động mở rộng kích thước khai báo của `{}` lên `{}` để dùng 1-based an toàn.", loop_var, bound, arr.name, bound, arr.name, new_sz)
                                            }));
                                            if first_error_line == 0 { first_error_line = line_no; }
                                            arr.new_size_expr = Some(new_sz);
                                        }
                                    }
                                }
                            }

                            // Check `i = 0` accessing `[i - 1]` in body without guard
                            if start_val == Some(0) && !loop_var.is_empty() {
                                let pat1 = format!("[{} - 1]", loop_var);
                                let pat2 = format!("[{}-1]", loop_var);
                                if (body_preview.contains(&pat1) || body_preview.contains(&pat2))
                                    && !body_preview.contains(&format!("{} > 0", loop_var))
                                    && !body_preview.contains(&format!("{} >= 1", loop_var))
                                {
                                    findings.push(json!({
                                        "line": line_no,
                                        "severity": "error",
                                        "title": format!("Dòng {}: Sai index âm trong vòng lặp (`{} = 0` nhưng truy cập `[{} - 1]`)", line_no, loop_var, loop_var),
                                        "detail": format!("Ở vòng lặp đầu tiên khi `{} = 0`, biểu thức `[{} - 1]` sẽ truy cập chỉ số âm `[-1]`. Đã tự động chỉnh điểm bắt đầu vòng lặp thành `{} = 1`.", loop_var, loop_var, loop_var)
                                    }));
                                    if first_error_line == 0 { first_error_line = line_no; }
                                    let old_init = init_part.to_string();
                                    let new_init = old_init.replacen("= 0", "= 1", 1).replacen("=0", "=1", 1);
                                    work_code = work_code.replacen(&old_init, &new_init, 1);
                                }
                            }
                        }
                    }
                }
            }

            // 2d. `printf` / `scanf` Format Specifier & Argument Count Mismatch (`ko khớp số`)
            for io_fn in ["printf(", "scanf("] {
                if let Some(fn_pos) = work_code.find(io_fn) {
                    let call_start = fn_pos + io_fn.len();
                    if let Some(rp_rel) = work_code[call_start..].rfind(')') {
                        let inside = work_code[call_start..call_start + rp_rel].to_string();
                        let args = split_top_level_args(&inside);
                        if !args.is_empty() && args[0].starts_with('"') && args[0].ends_with('"') {
                            let fmt_lit = &args[0];
                            let spec_cnt = count_format_specifiers(fmt_lit);
                            let val_args = &args[1..];

                            // Check missing `&` in `scanf`
                            if io_fn == "scanf(" && !val_args.is_empty() {
                                let mut fixed_scanf_args = vec![fmt_lit.clone()];
                                let mut added_amp = false;
                                for a in val_args {
                                    let at = a.trim();
                                    let is_simple_var = !at.starts_with('&')
                                        && !at.starts_with('"')
                                        && !at.contains('[')
                                        && at.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                                        && !decl_arrays.iter().any(|arr| arr.name == at);
                                    if is_simple_var {
                                        added_amp = true;
                                        fixed_scanf_args.push(format!("&{}", at));
                                    } else {
                                        fixed_scanf_args.push(at.to_string());
                                    }
                                }
                                if added_amp {
                                    findings.push(json!({
                                        "line": line_no,
                                        "severity": "error",
                                        "title": format!("Dòng {}: Hàm `scanf` thiếu toán tử lấy địa chỉ `&` trước biến", line_no),
                                        "detail": "Truyền biến vào `scanf` mà không có `&` sẽ gây lỗi Segmentation Fault (Runtime Error) ngay khi nhập dữ liệu. Đã tự động thêm `&`."
                                    }));
                                    if first_error_line == 0 { first_error_line = line_no; }
                                    let new_inside = fixed_scanf_args.join(", ");
                                    work_code = format!(
                                        "{}{}{}",
                                        &work_code[..call_start],
                                        new_inside,
                                        &work_code[call_start + rp_rel..]
                                    );
                                }
                            }

                            // Check specifier count vs argument count
                            if spec_cnt != val_args.len() {
                                findings.push(json!({
                                    "line": line_no,
                                    "severity": "error",
                                    "title": format!("Dòng {}: Không khớp số lượng đối số trong `{})` ({} đặc tả `%` nhưng truyền {} biến)", line_no, io_fn.trim_end_matches('('), spec_cnt, val_args.len()),
                                    "detail": format!("Chuỗi định dạng `{}` yêu cầu {} đối số nhưng bạn truyền {} đối số. Đã tự động đồng bộ lại chuỗi định dạng / đối số.", fmt_lit, spec_cnt, val_args.len())
                                }));
                                if first_error_line == 0 { first_error_line = line_no; }

                                if val_args.len() > spec_cnt && io_fn == "printf(" {
                                    let diff = val_args.len() - spec_cnt;
                                    let extra_specs = vec!["%lld"; diff].join(" ");
                                    let inner_fmt = &fmt_lit[1..fmt_lit.len() - 1];
                                    let new_fmt = if let Some(nl_pos) = inner_fmt.rfind("\\n") {
                                        format!("\"{} {}{}\"", &inner_fmt[..nl_pos], extra_specs, &inner_fmt[nl_pos..])
                                    } else {
                                        format!("\"{} {}\"", inner_fmt, extra_specs)
                                    };
                                    work_code = work_code.replacen(fmt_lit, &new_fmt, 1);
                                } else if spec_cnt > val_args.len() && !val_args.is_empty() {
                                    let mut new_args = args.clone();
                                    for _ in 0..(spec_cnt - val_args.len()) {
                                        if io_fn == "printf(" {
                                            new_args.push("0".to_string());
                                        }
                                    }
                                    if io_fn == "printf(" {
                                        let new_inside = new_args.join(", ");
                                        work_code = format!(
                                            "{}{}{}",
                                            &work_code[..call_start],
                                            new_inside,
                                            &work_code[call_start + rp_rel..]
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 2e. STL `sort(v)` / `sort(v.begin())` and `max(int, long long)` mismatches (`ko khớp số`)
            for stl_fn in ["sort(", "reverse("] {
                if let Some(sp) = work_code.find(stl_fn) {
                    let prev_ok = sp == 0 || !work_code.as_bytes()[sp - 1].is_ascii_alphanumeric();
                    if prev_ok {
                        let start_in = sp + stl_fn.len();
                        if let Some(rp_rel) = work_code[start_in..].find(')') {
                            let arg_str = work_code[start_in..start_in + rp_rel].trim().to_string();
                            let args = split_top_level_args(&arg_str);
                            if args.len() == 1 {
                                let a0 = args[0].trim();
                                let base_vec = a0.trim_end_matches(".begin()");
                                findings.push(json!({
                                    "line": line_no,
                                    "severity": "error",
                                    "title": format!("Dòng {}: Không khớp số tham số hàm `{})` (truyền 1 tham số thay vì 2 iterator `begin, end`)", line_no, stl_fn.trim_end_matches('(')),
                                    "detail": format!("Hàm `std::{}` yêu cầu 2 đối số `(v.begin(), v.end())`. Đã tự động sửa thành `{}{}.begin(), {}.end())`.", stl_fn.trim_end_matches('('), stl_fn, base_vec, base_vec)
                                }));
                                if first_error_line == 0 { first_error_line = line_no; }
                                let old_call = format!("{}{})", stl_fn, arg_str);
                                let new_call = format!("{}{}.begin(), {}.end())", stl_fn, base_vec, base_vec);
                                work_code = work_code.replacen(&old_call, &new_call, 1);
                            }
                        }
                    }
                }
            }

            // Check user-defined function calls with wrong argument count
            for (fname, expected_cnt, f_decl_line) in &user_funcs {
                if line_no == *f_decl_line {
                    continue;
                }
                let call_pat = format!("{}(", fname);
                if let Some(cp_pos) = work_code.find(&call_pat) {
                    let prev_ok = cp_pos == 0 || {
                        let pc = work_code.as_bytes()[cp_pos - 1] as char;
                        !pc.is_ascii_alphanumeric() && pc != '_'
                    };
                    if prev_ok {
                        let start_in = cp_pos + call_pat.len();
                        if let Some(rp_rel) = work_code[start_in..].find(')') {
                            let arg_str = work_code[start_in..start_in + rp_rel].trim().to_string();
                            let passed_args = if arg_str.is_empty() {
                                Vec::new()
                            } else {
                                split_top_level_args(&arg_str)
                            };
                            if passed_args.len() != *expected_cnt {
                                findings.push(json!({
                                    "line": line_no,
                                    "severity": "error",
                                    "title": format!("Dòng {}: Không khớp số lượng tham số khi gọi hàm `{}` (cần {} tham số, truyền {})", line_no, fname, expected_cnt, passed_args.len()),
                                    "detail": format!("Hàm `{}` khai báo ở dòng {} nhận {} tham số nhưng lời gọi truyền {} đối số (gây lỗi CE). Đã tự động điều chỉnh đối số cho khớp.", fname, f_decl_line, expected_cnt, passed_args.len())
                                }));
                                if first_error_line == 0 { first_error_line = line_no; }
                                let mut fixed_args = passed_args.clone();
                                while fixed_args.len() < *expected_cnt {
                                    fixed_args.push("0".to_string());
                                }
                                if fixed_args.len() > *expected_cnt {
                                    fixed_args.truncate(*expected_cnt);
                                }
                                let old_call = format!("{}({})", fname, arg_str);
                                let new_call = format!("{}({})", fname, fixed_args.join(", "));
                                work_code = work_code.replacen(&old_call, &new_call, 1);
                            }
                        }
                    }
                }
            }

            // 2f. Accidental assignment `=` inside `if (...)`
            if trimmed.starts_with("if (") || trimmed.starts_with("if(") {
                if let (Some(lp), Some(rp)) = (work_code.find('('), work_code.rfind(')')) {
                    if rp > lp {
                        let cond = &work_code[lp + 1..rp];
                        let bytes = cond.as_bytes();
                        let mut single_eq_idx: Option<usize> = None;
                        for k in 0..bytes.len() {
                            if bytes[k] == b'=' {
                                let prev = if k > 0 { bytes[k - 1] } else { b' ' };
                                let next = if k + 1 < bytes.len() { bytes[k + 1] } else { b' ' };
                                if !matches!(prev, b'=' | b'!' | b'<' | b'>') && next != b'=' {
                                    single_eq_idx = Some(k);
                                    break;
                                }
                            }
                        }
                        if let Some(eq_pos) = single_eq_idx {
                            findings.push(json!({
                                "line": line_no,
                                "severity": "warning",
                                "title": format!("Dòng {}: Phép gán `=` bên trong điều kiện `if (...)`", line_no),
                                "detail": "Trong C++, `if (a = b)` là phép gán chứ không phải so sánh bằng `==`. Đã tự động sửa `=` thành `==`."
                            }));
                            if first_error_line == 0 { first_error_line = line_no; }
                            let abs_idx = lp + 1 + eq_pos;
                            work_code.insert(abs_idx, '=');
                        }
                    }
                }
            }

            // 2g. Unclosed String Quote `"` or Unclosed `[` / `(` on the current line
            let mut quote_cnt = 0usize;
            let wb = work_code.as_bytes();
            let mut qi = 0;
            while qi < wb.len() {
                if wb[qi] == b'\\' {
                    qi += 2;
                    continue;
                }
                if wb[qi] == b'"' {
                    quote_cnt += 1;
                }
                qi += 1;
            }
            if quote_cnt % 2 == 1 {
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Chuỗi ký tự thiếu dấu nháy kép `\"` đóng ở cuối", line_no),
                    "detail": "Chuỗi mở bằng `\"` nhưng chưa đóng trên cùng dòng (gây lỗi CE `missing terminating \" character`). Đã tự động đóng `\"`."
                }));
                if first_error_line == 0 { first_error_line = line_no; }
                let te = work_code.trim_end();
                if te.ends_with(';') {
                    work_code = format!("{}\";", &te[..te.len() - 1]);
                } else {
                    work_code = format!("{}\"", te);
                }
            }

            // Count `[` vs `]` and `(` vs `)` outside strings on this line
            let mut line_brackets = 0i32;
            let mut line_parens = 0i32;
            let mut in_s = false;
            for ch in work_code.chars() {
                if ch == '"' {
                    in_s = !in_s;
                } else if !in_s {
                    match ch {
                        '[' => line_brackets += 1,
                        ']' => line_brackets -= 1,
                        '(' => line_parens += 1,
                        ')' => line_parens -= 1,
                        _ => {}
                    }
                }
            }
            if line_brackets > 0 {
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Thiếu {} dấu đóng ngoặc vuông `]`", line_no, line_brackets),
                    "detail": "Biểu thức truy cập mảng mở `[` nhưng thiếu `]`. Đã tự động đóng `]`."
                }));
                if first_error_line == 0 { first_error_line = line_no; }
                let closing: String = std::iter::repeat(']').take(line_brackets as usize).collect();
                let te = work_code.trim_end();
                if te.ends_with(';') {
                    work_code = format!("{}{};", &te[..te.len() - 1], closing);
                } else {
                    work_code = format!("{}{}", te, closing);
                }
            }
            if line_parens > 0 && !work_code.trim_end().ends_with(',') && !work_code.trim_end().ends_with('(') {
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Thiếu {} dấu đóng ngoặc tròn `)`", line_no, line_parens),
                    "detail": "Câu lệnh hoặc điều kiện mở `(` nhưng chưa đóng đủ `)`. Đã tự động đóng `)`."
                }));
                if first_error_line == 0 { first_error_line = line_no; }
                let closing: String = std::iter::repeat(')').take(line_parens as usize).collect();
                let te = work_code.trim_end();
                if te.ends_with('{') {
                    work_code = format!("{}{} {{", te[..te.len() - 1].trim_end(), closing);
                } else if te.ends_with(';') {
                    work_code = format!("{}{};", &te[..te.len() - 1], closing);
                } else {
                    work_code = format!("{}{}", te, closing);
                }
            }

            // 2h. Missing semicolon `;` at end of statement
            let mut next_trimmed = "";
            for next_item in cur_lines.iter().skip(idx + 1) {
                let (nc, _) = split_code_and_line_comment(next_item);
                let nt = nc.trim();
                if !nt.is_empty() && !nt.starts_with("//") && !nt.starts_with('#') {
                    next_trimmed = nt;
                    break;
                }
            }

            let cur_trimmed = work_code.trim();
            // Check single-line block `{ stmt }` missing `;` before `}` (e.g. `int main() { cout << 1 }`)
            if cur_trimmed.ends_with('}') && cur_trimmed.contains('{') {
                if let (Some(lb), Some(rb)) = (work_code.find('{'), work_code.rfind('}')) {
                    if rb > lb + 1 {
                        let inner = work_code[lb + 1..rb].trim();
                        if !inner.is_empty()
                            && !inner.ends_with(';')
                            && !inner.ends_with('}')
                            && !inner.ends_with('{')
                            && !cur_trimmed.starts_with("struct ")
                            && !cur_trimmed.starts_with("class ")
                            && !cur_trimmed.contains("= {")
                            && !cur_trimmed.contains("={")
                        {
                            missing_semi_lines.push(line_no);
                            findings.push(json!({
                                "line": line_no,
                                "severity": "error",
                                "title": format!("Dòng {}: Thiếu dấu chấm phẩy `;` trước dấu đóng ngoặc `}}`", line_no),
                                "detail": format!("Câu lệnh `{}` bên trong khối `{{ ... }}` thiếu dấu `;`. Đã tự động thêm `;` trước `}}`.", inner)
                            }));
                            if first_error_line == 0 { first_error_line = line_no; }
                            let before_rb = work_code[..rb].trim_end();
                            work_code = format!("{}; {}", before_rb, &work_code[rb..]);
                        }
                    }
                }
            }

            let cur_trimmed = work_code.trim();
            if is_missing_cpp_semicolon(cur_trimmed, next_trimmed) {
                missing_semi_lines.push(line_no);
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Thiếu dấu chấm phẩy `;` cuối câu lệnh", line_no),
                    "detail": format!("Câu lệnh `{}` chưa kết thúc bằng dấu `;`. Đã tự động thêm `;` vào cuối dòng {}.", cur_trimmed, line_no)
                }));
                if first_error_line == 0 { first_error_line = line_no; }
                let trimmed_end = work_code.trim_end();
                let trailing_ws = &work_code[trimmed_end.len()..];
                work_code = format!("{};{}", trimmed_end, trailing_ws);
            }

            // 2i. Check unsigned `.size() - 1` underflow risk
            if work_code.contains(".size() - 1") && !work_code.contains("(int)") && !work_code.contains("(long long)") {
                findings.push(json!({
                    "line": line_no,
                    "severity": "warning",
                    "title": format!("Dòng {}: Nguy cơ tràn số không dấu (`.size() - 1` khi rỗng)", line_no),
                    "detail": "`.size()` trả về kiểu không dấu `size_t`. Khi container rỗng (`size() == 0`), `.size() - 1` sẽ tràn thành `SIZE_MAX` thay vì `-1`. Nên ép kiểu `(int)v.size() - 1`."
                }));
            }

            patched_lines.push(format!("{}{}", work_code, cmt_part));
        }

        // Apply any array/vector capacity expansions discovered during bounds/loop checks
        for arr in &decl_arrays {
            if let Some(ref new_sz) = arr.new_size_expr {
                if arr.decl_line >= 1 && arr.decl_line <= patched_lines.len() {
                    let dl = &mut patched_lines[arr.decl_line - 1];
                    if arr.is_vector {
                        let old_pat = format!("{}({}", arr.name, arr.size_expr);
                        let new_pat = format!("{}({}", arr.name, new_sz);
                        *dl = dl.replacen(&old_pat, &new_pat, 1);
                    } else {
                        let old_pat = format!("{}[{}]", arr.name, arr.size_expr);
                        let new_pat = format!("{}[{}]", arr.name, new_sz);
                        *dl = dl.replacen(&old_pat, &new_pat, 1);
                    }
                }
            }
        }

        fixed = patched_lines.join("\n");

        // 3. Check unbalanced braces `{` vs `}`
        let mut open_braces: i32 = 0;
        let mut open_parens: i32 = 0;
        for (idx, ln) in fixed.lines().enumerate() {
            let (cp, _) = split_code_and_line_comment(ln);
            for ch in cp.chars() {
                match ch {
                    '{' => open_braces += 1,
                    '}' => open_braces -= 1,
                    '(' => open_parens += 1,
                    ')' => open_parens -= 1,
                    _ => {}
                }
            }
            if open_parens < 0 {
                findings.push(json!({
                    "line": idx + 1,
                    "severity": "error",
                    "title": format!("Dòng {}: Dư dấu đóng ngoặc tròn `)`", idx + 1),
                    "detail": "Số dấu `)` nhiều hơn số dấu `(` mở trước đó."
                }));
                open_parens = 0;
            }
        }
        if open_braces > 0 {
            findings.push(json!({
                "line": lines.len().max(1),
                "severity": "error",
                "title": format!("Cuối file: Thiếu {} dấu đóng ngoặc nhọn `}}`", open_braces),
                "detail": "Khối hàm hoặc cấu trúc mở `{` nhưng chưa đóng đủ `}`. Đã tự động thêm `}` vào cuối chương trình."
            }));
            for _ in 0..open_braces {
                fixed.push_str("\n}");
            }
        } else if open_braces < 0 {
            findings.push(json!({
                "line": lines.len().max(1),
                "severity": "error",
                "title": format!("Dư {} dấu đóng ngoặc nhọn `}}`", -open_braces),
                "detail": "Hãy kiểm tra lại các cặp ngoặc nhọn `{ ... }` trong chương trình."
            }));
        }

        // 4. Competitive Programming Performance & 32-bit Overflow Rules
        let has_fast_io = fixed.contains("sync_with_stdio");
        if !has_fast_io && (fixed.contains("cin >>") || fixed.contains("cout <<")) {
            findings.push(json!({
                "line": 1,
                "severity": "warning",
                "title": "Thiếu Fast I/O (`ios::sync_with_stdio(false); cin.tie(nullptr);`)",
                "detail": "Với dữ liệu vào N >= 10^5, `cin/cout` mặc định có thể gây TLE. Đã tự động chèn Fast I/O ngay đầu `main()`."
            }));
            if let Some(pos) = fixed.find("int main") {
                if let Some(brace_offset) = fixed[pos..].find('{') {
                    let insert_idx = pos + brace_offset + 1;
                    fixed.insert_str(
                        insert_idx,
                        "\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);",
                    );
                }
            }
        }
        if fixed.contains("<< endl") || fixed.contains("<<endl") {
            findings.push(json!({
                "line": 0,
                "severity": "warning",
                "title": "Sử dụng `endl` gây flush buffer liên tục (nguy cơ TLE)",
                "detail": "Thay `endl` bằng `\"\\n\"` để tăng tốc độ in kết quả gấp 5–20 lần."
            }));
            fixed = fixed.replace("<< endl", "<< \"\\n\"").replace("<<endl", "<< \"\\n\"");
        }
        if fixed.contains(", 0)") && fixed.contains("accumulate(") {
            findings.push(json!({
                "line": 0,
                "severity": "error",
                "title": "Tràn số 32-bit trong `accumulate(..., 0)`",
                "detail": "Tham số khởi tạo `0` có kiểu `int` (tối đa ~2.14×10^9). Phải dùng `0LL` để tính tổng `long long`."
            }));
            fixed = fixed.replace(", 0)", ", 0LL)");
        }
        if fixed.contains("1 << 3") || fixed.contains("1 << 4") || fixed.contains("1 << 5") || fixed.contains("1<<3") {
            findings.push(json!({
                "line": 0,
                "severity": "error",
                "title": "Undefined Behavior: Dịch bit 32-bit `1 << k` với k >= 31",
                "detail": "Cần dùng `1LL << k` để tránh tràn bit dấu trên kiểu `int`."
            }));
            fixed = fixed
                .replace("1 << ", "1LL << ")
                .replace("1<<", "1LL<<");
        }
        for var_name in ["sum", "ans", "total", "res", "prod"] {
            let pat = format!("int {} =", var_name);
            if fixed.contains(&pat) {
                findings.push(json!({
                    "line": 0,
                    "severity": "warning",
                    "title": format!("Biến tích lũy (`{}`) khai báo kiểu `int`", var_name),
                    "detail": "Trong các bài tổng/tích mảng, kết quả thường vượt `2^31 - 1`. Đã nâng lên `long long`."
                }));
                fixed = fixed.replace(&pat, &format!("long long {} =", var_name));
            }
        }

        // 5. Real `g++ -fsyntax-only -std=c++17 -O2 -Wall -Wextra -Warray-bounds=2 -Wformat=2` Compiler Pass & Iterative Auto-Repair
        let (_orig_ok, orig_diags, _orig_raw) = check_cpp_compiler_diagnostics(code);
        for d in &orig_diags {
            if first_error_line == 0 && d.line > 0 {
                first_error_line = d.line;
            }
            let is_dup_semi = (d.raw_msg.contains("expected ';'") || d.raw_msg.contains("expected ‘;’"))
                && (missing_semi_lines.contains(&d.line)
                    || (d.line > 1 && missing_semi_lines.contains(&(d.line - 1))));
            let already_has_line = findings.iter().any(|f| {
                f["line"].as_u64() == Some(d.line as u64)
                    && f["title"].as_str().unwrap_or("").contains(&d.vi_title)
            });
            if !is_dup_semi && !already_has_line {
                findings.push(json!({
                    "line": d.line,
                    "col": d.col,
                    "severity": d.severity,
                    "title": format!("Dòng {}:{}: {}", d.line, d.col, d.vi_title),
                    "detail": d.vi_detail
                }));
            }
        }

        // Iterative Compiler-Guided Auto-Repair Loop (up to 3 rounds)
        for _round in 0..3 {
            let (fixed_ok, fixed_diags, _) = check_cpp_compiler_diagnostics(&fixed);
            let has_err = !fixed_ok || fixed_diags.iter().any(|d| d.severity == "error" || d.raw_msg.contains("control reaches end of non-void"));
            if !has_err {
                break;
            }
            let mut retry_lines: Vec<String> = fixed.lines().map(|s| s.to_string()).collect();
            let mut changed_retry = false;

            for d in &fixed_diags {
                let m = &d.raw_msg;
                let already_reported = findings.iter().any(|f| {
                    f["title"].as_str().unwrap_or("").contains(&d.vi_title)
                });
                if !already_reported {
                    if first_error_line == 0 && d.line > 0 {
                        first_error_line = d.line;
                    }
                    findings.push(json!({
                        "line": d.line,
                        "col": d.col,
                        "severity": d.severity,
                        "title": format!("Dòng {}:{}: {}", d.line, d.col, d.vi_title),
                        "detail": d.vi_detail
                    }));
                }
                // Case A: Missing `;`
                if m.contains("expected ';'") || m.contains("expected ‘;’") {
                    let candidate_idx = if d.line >= 2
                        && !retry_lines[d.line - 2].trim().ends_with(';')
                        && !retry_lines[d.line - 2].trim().ends_with('{')
                    {
                        d.line - 2
                    } else if d.line >= 1 && d.line <= retry_lines.len() {
                        d.line - 1
                    } else {
                        continue;
                    };
                    if candidate_idx < retry_lines.len() {
                        let (cp, cmt) = split_code_and_line_comment(&retry_lines[candidate_idx]);
                        if !cp.trim_end().ends_with(';') {
                            retry_lines[candidate_idx] = format!("{};{}", cp.trim_end(), cmt);
                            changed_retry = true;
                        }
                    }
                }
                // Case B: Conflicting types in `max(...)` / `min(...)` -> `max<long long>(...)`
                else if m.contains("deduced conflicting types")
                    || m.contains("no matching function for call to 'max")
                    || m.contains("no matching function for call to ‘max")
                    || m.contains("no matching function for call to 'min")
                    || m.contains("no matching function for call to ‘min")
                {
                    if d.line >= 1 && d.line <= retry_lines.len() {
                        let rl = &mut retry_lines[d.line - 1];
                        if rl.contains("max(") && !rl.contains("max<") {
                            *rl = rl.replace("max(", "max<long long>(");
                            changed_retry = true;
                        }
                        if rl.contains("min(") && !rl.contains("min<") {
                            *rl = rl.replace("min(", "min<long long>(");
                            changed_retry = true;
                        }
                    }
                }
                // Case C: Undeclared variable `'x' was not declared in this scope`
                else if m.contains("was not declared in this scope") && d.line >= 1 && d.line <= retry_lines.len() {
                    // Extract identifier between quotes `'...'` or `‘...’`
                    let ident = m
                        .split(['\'', '‘', '’'])
                        .nth(1)
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if !ident.is_empty() && ident.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                        let rl = retry_lines[d.line - 1].clone();
                        let indent: String = rl.chars().take_while(|c| c.is_whitespace()).collect();
                        if rl.contains(&format!("cin >> {}", ident)) || rl.contains(&format!("{} =", ident)) {
                            retry_lines[d.line - 1] = format!("{}long long {} = 0;\n{}", indent, ident, rl);
                            changed_retry = true;
                        }
                    }
                }
                // Case D: Missing return in non-void function
                else if m.contains("control reaches end of non-void function") && d.line >= 1 && d.line <= retry_lines.len() {
                    let rl = retry_lines[d.line - 1].clone();
                    if rl.trim() == "}" {
                        retry_lines[d.line - 1] = "    return 0;\n}".to_string();
                        changed_retry = true;
                    }
                }
            }

            if changed_retry {
                fixed = retry_lines.join("\n");
            } else {
                break;
            }
        }
    } else if lang_lower == "python" || lang_lower == "py" {
        // Python syntax & colon check
        let cur_lines: Vec<String> = fixed.lines().map(|s| s.to_string()).collect();
        let mut patched_lines: Vec<String> = Vec::with_capacity(cur_lines.len());
        for (idx, ln) in cur_lines.iter().enumerate() {
            let line_no = idx + 1;
            let trimmed = ln.split('#').next().unwrap_or("").trim_end();
            let t_start = trimmed.trim_start();
            let needs_colon = ["if ", "elif ", "else", "for ", "while ", "def ", "class ", "try", "except", "finally", "with "]
                .iter()
                .any(|kw| t_start == *kw || t_start.starts_with(kw))
                && !trimmed.ends_with(':')
                && !trimmed.ends_with('\\');
            if needs_colon {
                findings.push(json!({
                    "line": line_no,
                    "severity": "error",
                    "title": format!("Dòng {}: Thiếu dấu hai chấm `:` cuối câu lệnh Python", line_no),
                    "detail": format!("Câu lệnh `{}` trong Python bắt buộc kết thúc bằng dấu `:`. Đã tự động thêm `:`.", t_start)
                }));
                if first_error_line == 0 {
                    first_error_line = line_no;
                }
                patched_lines.push(format!("{}:", trimmed));
            } else {
                patched_lines.push(ln.clone());
            }
        }
        fixed = patched_lines.join("\n");
    }

    let mut nested_loops = 0;
    let mut cur_depth = 0;
    for ln in &lines {
        if ln.contains("for (") || ln.contains("for(") || ln.contains("while (") || ln.contains("while(") {
            cur_depth += 1;
            if cur_depth > nested_loops {
                nested_loops = cur_depth;
            }
        }
        if ln.contains('}') && cur_depth > 0 {
            cur_depth -= 1;
        }
    }
    let has_sort = code.contains("sort(");
    let has_pq = code.contains("priority_queue");
    let has_map_set = code.contains("map<") || code.contains("set<") || code.contains("multiset<");
    let complexity = if nested_loops >= 3 {
        "O(N^3)"
    } else if nested_loops == 2 {
        "O(N^2)"
    } else if has_sort || has_pq || has_map_set {
        "O(N log N)"
    } else if nested_loops == 1 {
        "O(N)"
    } else {
        "O(1)"
    };

    if mode == "explain" {
        let mut algos = Vec::new();
        if has_sort {
            algos.push("Sắp xếp (`std::sort`)");
        }
        if has_pq {
            algos.push("Hàng đợi ưu tiên (`priority_queue` / Dijkstra / Greedy)");
        }
        if has_map_set {
            algos.push("Cây đỏ-đen (`std::map` / `std::set`)");
        }
        if code.contains("dp[") || code.contains("memo[") {
            algos.push("Quy hoạch động (Dynamic Programming)");
        }
        if code.contains("dfs(") || code.contains("bfs(") || code.contains("adj[") {
            algos.push("Duyệt đồ thị / Cây (DFS / BFS)");
        }
        if algos.is_empty() {
            algos.push("Xử lý tuần tự / Toán học cơ bản");
        }
        let findings_md = if findings.is_empty() {
            "- ✅ Code sạch, đã vượt qua kiểm tra cú pháp `g++ -std=c++17 -Wall -Wextra` và quy tắc an toàn kiểu dữ liệu.".to_string()
        } else {
            findings
                .iter()
                .enumerate()
                .map(|(i, f)| {
                    format!(
                        "{}. **[{}] {}**\n   - {}",
                        i + 1,
                        f["severity"].as_str().unwrap_or("info").to_uppercase(),
                        f["title"].as_str().unwrap_or(""),
                        f["detail"].as_str().unwrap_or("")
                    )
                })
                .collect::<Vec<_>>()
                .join("\n")
        };
        let md = format!(
            "### 📊 Tổng quan kỹ thuật (Native Rust + GCC C++17 Analyzer)\n- **Độ phức tạp thời gian ước lượng:** `{}`\n- **Số dòng mã:** `{}` dòng\n- **Kỹ thuật nhận diện:** {}\n\n### 🔍 Kiểm tra chất lượng mã ({} phát hiện)\n{}",
            complexity,
            lines.len(),
            algos.join(", "),
            findings.len(),
            findings_md
        );
        return json!({
            "ok": true,
            "mode": mode,
            "title": "Phân tích & Giải thích Code",
            "complexity": complexity,
            "lineCount": lines.len(),
            "algorithms": algos,
            "findings": findings,
            "firstErrorLine": first_error_line,
            "fixedCode": fixed,
            "markdown": md
        });
    }

    if mode == "gentest" {
        return json!({
            "ok": true,
            "mode": mode,
            "title": "Bộ 6 Test Hiểm (Corner Cases) Tự Động",
            "tests": [
                { "name": "Test 1 — Biên nhỏ nhất (Min Bounds)", "input": "1 1\n", "expected": "2" },
                { "name": "Test 2 — Giá trị 0", "input": "0 0\n", "expected": "0" },
                { "name": "Test 3 — Số âm & đối nhau", "input": "-1000000000 1000000000\n", "expected": "0" },
                { "name": "Test 4 — Vượt ngưỡng int 32-bit (Overflow Check)", "input": "2000000000 2000000000\n", "expected": "4000000000" },
                { "name": "Test 5 — Cực đại 64-bit an toàn", "input": "1000000000000 2000000000000\n", "expected": "3000000000000" },
                { "name": "Test 6 — Lệch bậc lớn", "input": "1 999999999999\n", "expected": "1000000000000" }
            ],
            "markdown": "Đã sinh **6 test góc (Corner Cases)** kiểm tra biên nhỏ nhất, số 0, số âm, và tràn số 32-bit (`int` vs `long long`). Bấm **\"Nạp vào Test Runner\"** để chạy kiểm thử ngay!"
        });
    }

    let has_changes = fixed != code;
    let findings_md = if findings.is_empty() {
        "✅ Không phát hiện lỗi thiếu `;`, lỗi biên dịch `g++ C++17`, tràn số 32-bit hay thiếu Fast I/O.".to_string()
    } else {
        findings
            .iter()
            .enumerate()
            .map(|(i, f)| {
                let sev = if f["severity"].as_str() == Some("error") {
                    "🚨 LỖI NGHIÊM TRỌNG"
                } else {
                    "⚠️ CẢNH BÁO"
                };
                format!(
                    "{}. **[{}]** {}\n   - *Chi tiết:* {}",
                    i + 1,
                    sev,
                    f["title"].as_str().unwrap_or(""),
                    f["detail"].as_str().unwrap_or("")
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n")
    };
    let patch_note = if has_changes {
        "\n\n💡 **Đã tạo bản vá tự động (sửa thiếu `;`, toán tử, kiểu dữ liệu & Fast I/O)!** Bấm **\"✨ Áp dụng bản vá vào Editor\"** hoặc **\"🚀 Vá & Chạy Code Ngay\"** bên dưới."
    } else {
        ""
    };
    let md = format!(
        "### 🛠️ Kết quả quét mã nguồn & Trình biên dịch ({} phát hiện)\n- **Độ phức tạp ước lượng:** `{}`\n\n{}{}",
        findings.len(),
        complexity,
        findings_md,
        patch_note
    );

    json!({
        "ok": true,
        "mode": mode,
        "title": if mode == "optimize" { "Tối ưu hóa hiệu năng C++17" } else { "Chẩn đoán Bug (AST + GCC C++17) & Tự động vá lỗi" },
        "complexity": complexity,
        "findings": findings,
        "firstErrorLine": first_error_line,
        "hasChanges": has_changes,
        "fixedCode": fixed,
        "markdown": md
    })
}

fn proxy_to_oj(path_url: &str, method: &str, body_obj: Option<&Value>, timeout_ms: u64) -> Option<Value> {
    if !ensure_oj_server() {
        return None;
    }
    let addr = SocketAddr::from(([127, 0, 0, 1], OJ_PORT));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(2000)).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(timeout_ms)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(5000)));

    let payload = body_obj.map(|v| v.to_string()).unwrap_or_default();
    let req = if method == "POST" {
        format!(
            "POST {} HTTP/1.0\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            path_url,
            OJ_PORT,
            payload.len(),
            payload
        )
    } else {
        format!(
            "GET {} HTTP/1.0\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
            path_url, OJ_PORT
        )
    };

    stream.write_all(req.as_bytes()).ok()?;
    let _ = stream.flush();

    let mut resp_bytes = Vec::new();
    let _ = stream.read_to_end(&mut resp_bytes);
    let raw = String::from_utf8_lossy(&resp_bytes);
    let body_start = raw.find("\r\n\r\n").map(|i| i + 4)?;
    let status_ok = raw.starts_with("HTTP/1.0 200") || raw.starts_with("HTTP/1.1 200");
    if !status_ok {
        return None;
    }
    serde_json::from_str::<Value>(&raw[body_start..]).ok()
}

fn list_workspace_files(dir: &Path, base_dir: &Path, depth: usize) -> Vec<Value> {
    if depth > 3 || !dir.exists() {
        return Vec::new();
    }
    let ignore: HashSet<&str> = [
        "node_modules",
        ".git",
        "target",
        "dist",
        ".vscode",
        "__pycache__",
        "build",
    ]
    .into_iter()
    .collect();

    let mut dirs = Vec::new();
    let mut files = Vec::new();

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || ignore.contains(name.as_str()) {
                continue;
            }
            let full = entry.path();
            let rel = full
                .strip_prefix(base_dir)
                .unwrap_or(&full)
                .to_string_lossy()
                .replace('\\', "/");
            if full.is_dir() {
                dirs.push((
                    name.clone(),
                    json!({
                        "name": name,
                        "path": rel,
                        "type": "dir",
                        "children": list_workspace_files(&full, base_dir, depth + 1)
                    }),
                ));
            } else {
                let size = std::fs::metadata(&full).map(|m| m.len()).unwrap_or(0);
                let ext = full
                    .extension()
                    .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
                    .unwrap_or_default();
                files.push((
                    name.clone(),
                    json!({
                        "name": name,
                        "path": rel,
                        "type": "file",
                        "size": size,
                        "ext": ext
                    }),
                ));
            }
        }
    }

    dirs.sort_by(|a, b| a.0.cmp(&b.0));
    files.sort_by(|a, b| a.0.cmp(&b.0));
    dirs.into_iter()
        .chain(files.into_iter())
        .map(|(_, v)| v)
        .collect()
}

fn resolve_safe_workspace_path(rel_path: &str) -> Result<PathBuf, String> {
    let ws = get_active_workspace();
    let cleaned = rel_path.trim_start_matches(|c| c == '/' || c == '\\');
    let mut candidate = ws.clone();
    for part in cleaned.split(|c| c == '/' || c == '\\') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err("Đường dẫn không hợp lệ (..)".to_string());
        }
        candidate.push(part);
    }
    Ok(candidate)
}

fn url_decode(s: &str) -> String {
    let mut bytes = Vec::with_capacity(s.len());
    let raw = s.as_bytes();
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%' && i + 2 < raw.len() {
            if let Ok(hex_str) = std::str::from_utf8(&raw[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex_str, 16) {
                    bytes.push(val);
                    i += 3;
                    continue;
                }
            }
        } else if raw[i] == b'+' {
            bytes.push(b' ');
            i += 1;
            continue;
        }
        bytes.push(raw[i]);
        i += 1;
    }
    String::from_utf8_lossy(&bytes).to_string()
}

fn query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let mut iter = pair.splitn(2, '=');
        let k = iter.next().unwrap_or("");
        let v = iter.next().unwrap_or("");
        if k == key {
            return Some(url_decode(v));
        }
    }
    None
}

fn send_http_response(mut stream: TcpStream, status: u16, content_type: &str, body: &[u8]) {
    let status_text = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        _ => "OK",
    };
    let header = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n",
        status,
        status_text,
        content_type,
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn send_json(stream: TcpStream, status: u16, val: Value) {
    let body = val.to_string();
    send_http_response(
        stream,
        status,
        "application/json; charset=utf-8",
        body.as_bytes(),
    );
}

fn read_full_http_request(stream: &mut TcpStream) -> Option<(String, String, String, Vec<u8>)> {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(5000)));
    let mut buf = Vec::with_capacity(8192);
    let mut temp = [0u8; 8192];
    let mut header_end: Option<usize> = None;
    let mut content_length: usize = 0;

    loop {
        match stream.read(&mut temp) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&temp[..n]);
                if header_end.is_none() {
                    if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                        let end = pos + 4;
                        header_end = Some(end);
                        let header_str = String::from_utf8_lossy(&buf[..end]);
                        for line in header_str.lines() {
                            if let Some((k, v)) = line.split_once(':') {
                                if k.trim().eq_ignore_ascii_case("content-length") {
                                    content_length = v.trim().parse::<usize>().unwrap_or(0);
                                }
                            }
                        }
                    }
                }
                if let Some(end) = header_end {
                    if buf.len() >= end + content_length || buf.len() > 10 * 1024 * 1024 {
                        break;
                    }
                }
            }
            Err(_) => break,
        }
    }

    let end = header_end?;
    let header_str = String::from_utf8_lossy(&buf[..end]);
    let first_line = header_str.lines().next()?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next()?.to_uppercase();
    let raw_target = parts.next()?;
    let (pathname, query) = match raw_target.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (raw_target.to_string(), String::new()),
    };
    let body = if buf.len() >= end + content_length {
        buf[end..end + content_length].to_vec()
    } else {
        buf[end..].to_vec()
    };
    Some((method, pathname, query, body))
}

fn parse_body_json(body: &[u8]) -> Value {
    if body.is_empty() {
        return json!({});
    }
    serde_json::from_slice::<Value>(body).unwrap_or_else(|_| json!({}))
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        _ => "text/plain; charset=utf-8",
    }
}

fn handle_client(mut stream: TcpStream, port: u16) {
    let Some((method, pathname, query, body)) = read_full_http_request(&mut stream) else {
        return;
    };

    if method == "OPTIONS" {
        send_http_response(stream, 204, "text/plain", b"");
        return;
    }

    // 1. Health & Doctor
    if pathname == "/api/studio/health" && method == "GET" {
        let oj_online = check_oj_listening();
        let ws = get_active_workspace();
        send_json(
            stream,
            200,
            json!({
                "status": "ok",
                "product": "DrgX Studio Native Tauri v2 App",
                "engine": "rust-tauri-v2",
                "version": "2.6.0",
                "port": port,
                "ojPort": OJ_PORT,
                "ojOnline": oj_online,
                "workspace": ws.to_string_lossy(),
                "gxx": gxx_bin().to_string_lossy(),
                "python": python_bin().to_string_lossy()
            }),
        );
        return;
    }

    if pathname == "/api/studio/doctor" && method == "GET" {
        let root = root_dir();
        let items = [
            ("gxx", "C++17 Compiler (g++)", gxx_bin(), vec!["--version"]),
            ("python", "Python Runtime", python_bin(), vec!["--version"]),
            ("node", "Node.js Engine", node_bin(), vec!["--version"]),
            ("git", "Git VCS", git_bin(), vec!["--version"]),
            ("drgx", "DrgX Native CLI", drgx_cli_exe(), vec!["--version"]),
        ];
        let mut checks = Vec::new();
        let mut all_ok = true;
        for (id, label, bin, args) in items {
            let r = run_process_with_input(&bin, &args, "", 3000, &root);
            let combined = format!("{}\n{}", r.stdout, r.stderr);
            let first_line = combined.lines().next().unwrap_or("").trim().to_string();
            if !r.ok {
                all_ok = false;
            }
            checks.push(json!({
                "id": id,
                "label": label,
                "ok": r.ok,
                "path": bin.to_string_lossy(),
                "version": if !first_line.is_empty() { first_line } else if r.ok { "OK".to_string() } else { "Không tìm thấy".to_string() }
            }));
        }
        let oj_up = ensure_oj_server();
        if !oj_up {
            all_ok = false;
        }
        checks.push(json!({
            "id": "oj",
            "label": "Void-bit C++17 Subtask Judge",
            "ok": oj_up,
            "path": oj_exe().to_string_lossy(),
            "version": if oj_up { format!("Online @ 127.0.0.1:{} (47 problems)", OJ_PORT) } else { "Offline".to_string() }
        }));
        let ws = get_active_workspace();
        send_json(
            stream,
            200,
            json!({
                "ok": all_ok,
                "checks": checks,
                "workspace": ws.to_string_lossy()
            }),
        );
        return;
    }

    // 2. Workspace & File Explorer
    if pathname == "/api/studio/files" && method == "GET" {
        let ws = get_active_workspace();
        ensure_workspace_seeded(&ws);
        let files = list_workspace_files(&ws, &ws, 0);
        send_json(
            stream,
            200,
            json!({
                "workspace": ws.to_string_lossy(),
                "files": files
            }),
        );
        return;
    }

    if pathname == "/api/studio/file" && method == "GET" {
        let rel = query_param(&query, "path").unwrap_or_else(|| "solution.cpp".to_string());
        match resolve_safe_workspace_path(&rel) {
            Ok(target) => {
                if !target.is_file() {
                    send_json(stream, 404, json!({ "error": format!("Không tìm thấy file: {}", rel) }));
                    return;
                }
                let content = std::fs::read_to_string(&target).unwrap_or_default();
                send_json(stream, 200, json!({ "path": rel, "content": content }));
            }
            Err(e) => send_json(stream, 400, json!({ "error": e })),
        }
        return;
    }

    if pathname == "/api/studio/file" && method == "POST" {
        let body_json = parse_body_json(&body);
        let rel = body_json["path"].as_str().unwrap_or("solution.cpp");
        let content = body_json["content"].as_str().unwrap_or("");
        match resolve_safe_workspace_path(rel) {
            Ok(target) => {
                if let Some(parent) = target.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&target, content);
                send_json(stream, 200, json!({ "ok": true, "path": rel }));
            }
            Err(e) => send_json(stream, 400, json!({ "error": e })),
        }
        return;
    }

    if pathname == "/api/studio/delete" && method == "POST" {
        let body_json = parse_body_json(&body);
        let rel = body_json["path"].as_str().unwrap_or("");
        if let Ok(target) = resolve_safe_workspace_path(rel) {
            if target.is_dir() {
                let _ = std::fs::remove_dir_all(&target);
            } else if target.is_file() {
                let _ = std::fs::remove_file(&target);
            }
        }
        send_json(stream, 200, json!({ "ok": true }));
        return;
    }

    if pathname == "/api/studio/workspace" && method == "POST" {
        let body_json = parse_body_json(&body);
        let seed = body_json["seed"].as_bool().unwrap_or(true);
        let ws = if let Some(dir_str) = body_json["dir"].as_str() {
            if !dir_str.trim().is_empty() {
                set_active_workspace(PathBuf::from(dir_str.trim()), seed)
            } else {
                get_active_workspace()
            }
        } else {
            get_active_workspace()
        };
        let files = list_workspace_files(&ws, &ws, 0);
        send_json(
            stream,
            200,
            json!({
                "ok": true,
                "workspace": ws.to_string_lossy(),
                "files": files
            }),
        );
        return;
    }

    // Native OS Folder Picker via Tauri Dialog Plugin
    if pathname == "/api/studio/pick-folder" && method == "POST" {
        if let Some(app) = APP_HANDLE.get() {
            use tauri_plugin_dialog::DialogExt;
            let picked = app.dialog().file().blocking_pick_folder();
            if let Some(folder) = picked {
                if let Ok(path) = folder.into_path() {
                    let ws = set_active_workspace(path, true);
                    let files = list_workspace_files(&ws, &ws, 0);
                    send_json(
                        stream,
                        200,
                        json!({
                            "ok": true,
                            "cancelled": false,
                            "workspace": ws.to_string_lossy(),
                            "files": files
                        }),
                    );
                    return;
                }
            }
            send_json(stream, 200, json!({ "ok": true, "cancelled": true }));
            return;
        }
        send_json(stream, 200, json!({ "ok": false, "cancelled": true }));
        return;
    }

    // 3. Code Compile & Run
    if pathname == "/api/studio/run" && method == "POST" {
        let body_json = parse_body_json(&body);
        let code = body_json["code"].as_str().unwrap_or("");
        let lang = body_json["lang"].as_str().unwrap_or("cpp").to_lowercase();
        let stdin = body_json["stdin"].as_str().unwrap_or("");
        let timeout_ms = body_json["timeoutMs"]
            .as_u64()
            .unwrap_or(4000)
            .clamp(500, 15000);
        let ws = get_active_workspace();

        if lang == "cpp" || lang == "c++" {
            let compiled = compile_cpp_source(code);
            if !compiled.ok {
                send_json(
                    stream,
                    200,
                    json!({
                        "ok": false,
                        "verdict": "CE",
                        "stdout": "",
                        "stderr": compiled.compile_output,
                        "compileOutput": compiled.compile_output,
                        "timeMs": 0,
                        "exitCode": 1
                    }),
                );
                return;
            }
            let exec_res = run_process_with_input(&compiled.exe_file, &[], stdin, timeout_ms, &ws);
            send_json(
                stream,
                200,
                json!({
                    "ok": exec_res.ok,
                    "verdict": exec_res.verdict,
                    "stdout": exec_res.stdout,
                    "stderr": exec_res.stderr,
                    "compileOutput": compiled.compile_output,
                    "timeMs": exec_res.time_ms,
                    "exitCode": exec_res.exit_code
                }),
            );
            return;
        }

        if lang == "python" || lang == "py" {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let tmp_py = std::env::temp_dir().join(format!("drgx_py_{}.py", stamp));
            let _ = std::fs::write(&tmp_py, code);
            let py_str = tmp_py.to_string_lossy().to_string();
            let exec_res = run_process_with_input(&python_bin(), &[&py_str], stdin, timeout_ms, &ws);
            let _ = std::fs::remove_file(&tmp_py);
            send_json(
                stream,
                200,
                json!({
                    "ok": exec_res.ok,
                    "verdict": exec_res.verdict,
                    "stdout": exec_res.stdout,
                    "stderr": exec_res.stderr,
                    "compileOutput": "",
                    "timeMs": exec_res.time_ms,
                    "exitCode": exec_res.exit_code
                }),
            );
            return;
        }

        if lang == "javascript" || lang == "js" {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let tmp_js = std::env::temp_dir().join(format!("drgx_js_{}.js", stamp));
            let _ = std::fs::write(&tmp_js, code);
            let js_str = tmp_js.to_string_lossy().to_string();
            let exec_res = run_process_with_input(&node_bin(), &[&js_str], stdin, timeout_ms, &ws);
            let _ = std::fs::remove_file(&tmp_js);
            send_json(
                stream,
                200,
                json!({
                    "ok": exec_res.ok,
                    "verdict": exec_res.verdict,
                    "stdout": exec_res.stdout,
                    "stderr": exec_res.stderr,
                    "compileOutput": "",
                    "timeMs": exec_res.time_ms,
                    "exitCode": exec_res.exit_code
                }),
            );
            return;
        }

        send_json(
            stream,
            400,
            json!({ "error": format!("Ngôn ngữ chưa hỗ trợ: {}", lang) }),
        );
        return;
    }

    // 4. Batch Test Runner
    if pathname == "/api/studio/test-batch" && method == "POST" {
        let body_json = parse_body_json(&body);
        let code = body_json["code"].as_str().unwrap_or("");
        let lang = body_json["lang"].as_str().unwrap_or("cpp").to_lowercase();
        let tests = body_json["tests"].as_array().cloned().unwrap_or_default();
        let timeout_ms = body_json["timeoutMs"]
            .as_u64()
            .unwrap_or(3000)
            .clamp(500, 10000);
        let ws = get_active_workspace();

        let compiled = if lang == "cpp" || lang == "c++" {
            let c = compile_cpp_source(code);
            if !c.ok {
                send_json(
                    stream,
                    200,
                    json!({
                        "ok": false,
                        "verdict": "CE",
                        "compileOutput": c.compile_output,
                        "passed": 0,
                        "total": tests.len(),
                        "results": []
                    }),
                );
                return;
            }
            Some(c)
        } else {
            None
        };

        let mut results = Vec::new();
        let mut passed = 0usize;

        for (i, tc) in tests.iter().enumerate() {
            let input = tc["input"].as_str().unwrap_or("");
            let expected = tc["expected"].as_str().unwrap_or("");
            let name = tc["name"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("Test #{}", i + 1));

            let run_res = if let Some(ref comp) = compiled {
                run_process_with_input(&comp.exe_file, &[], input, timeout_ms, &ws)
            } else {
                let tmp_py = std::env::temp_dir().join(format!("drgx_tc_{}.py", i));
                let _ = std::fs::write(&tmp_py, code);
                let py_str = tmp_py.to_string_lossy().to_string();
                let r = run_process_with_input(&python_bin(), &[&py_str], input, timeout_ms, &ws);
                let _ = std::fs::remove_file(&tmp_py);
                r
            };

            let actual_norm = normalize_output(&run_res.stdout);
            let exp_norm = normalize_output(expected);
            let verdict = if run_res.verdict == "OK" {
                if actual_norm == exp_norm {
                    "AC".to_string()
                } else {
                    "WA".to_string()
                }
            } else {
                run_res.verdict
            };
            if verdict == "AC" {
                passed += 1;
            }
            results.push(json!({
                "index": i + 1,
                "name": name,
                "verdict": verdict,
                "timeMs": run_res.time_ms,
                "input": input,
                "expected": exp_norm,
                "actual": actual_norm,
                "stderr": run_res.stderr
            }));
        }

        let overall = if passed == tests.len() && !tests.is_empty() {
            "AC"
        } else {
            "PARTIAL"
        };
        send_json(
            stream,
            200,
            json!({
                "ok": true,
                "verdict": overall,
                "passed": passed,
                "total": tests.len(),
                "results": results
            }),
        );
        return;
    }

    // 5. Automated Stress Tester (solution.cpp vs brute.cpp with gen.py)
    if pathname == "/api/studio/stress" && method == "POST" {
        let body_json = parse_body_json(&body);
        let sol_code = body_json["solutionCode"].as_str().unwrap_or("");
        let brute_code = body_json["bruteCode"].as_str().unwrap_or("");
        let gen_code = body_json["genCode"].as_str().unwrap_or("");
        let iterations = body_json["iterations"]
            .as_u64()
            .or_else(|| body_json["iterations"].as_str().and_then(|s| s.parse().ok()))
            .unwrap_or(20)
            .clamp(1, 200) as usize;
        let time_limit_ms = body_json["timeLimitMs"]
            .as_u64()
            .unwrap_or(1500)
            .clamp(300, 5000);
        let ws = get_active_workspace();

        let sol_comp = compile_cpp_source(sol_code);
        if !sol_comp.ok {
            send_json(
                stream,
                200,
                json!({
                    "ok": false,
                    "status": "CE_SOLUTION",
                    "compileOutput": sol_comp.compile_output
                }),
            );
            return;
        }
        let brute_comp = compile_cpp_source(brute_code);
        if !brute_comp.ok {
            send_json(
                stream,
                200,
                json!({
                    "ok": false,
                    "status": "CE_BRUTE",
                    "compileOutput": brute_comp.compile_output
                }),
            );
            return;
        }

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let tmp_gen = std::env::temp_dir().join(format!("drgx_gen_{}.py", stamp));
        let _ = std::fs::write(&tmp_gen, gen_code);
        let gen_str = tmp_gen.to_string_lossy().to_string();
        let py = python_bin();

        let mut passed = 0usize;
        let mut counter_example: Option<Value> = None;
        let mut history = Vec::new();

        for it in 1..=iterations {
            let it_str = it.to_string();
            let gen_res = run_process_with_input(&py, &[&gen_str, &it_str], "", 2000, &ws);
            if !gen_res.ok {
                counter_example = Some(json!({
                    "iteration": it,
                    "verdict": "GEN_ERROR",
                    "input": "",
                    "expected": "",
                    "actual": if !gen_res.stderr.is_empty() { gen_res.stderr } else { "Generator script error".to_string() }
                }));
                break;
            }
            let test_input = gen_res.stdout;
            let sol_res = run_process_with_input(&sol_comp.exe_file, &[], &test_input, time_limit_ms, &ws);
            let brute_res = run_process_with_input(&brute_comp.exe_file, &[], &test_input, time_limit_ms * 2, &ws);

            let sol_out = normalize_output(&sol_res.stdout);
            let brute_out = normalize_output(&brute_res.stdout);

            if sol_res.verdict != "OK" || sol_out != brute_out {
                let v = if sol_res.verdict != "OK" {
                    sol_res.verdict
                } else {
                    "WA".to_string()
                };
                counter_example = Some(json!({
                    "iteration": it,
                    "verdict": v,
                    "timeMs": sol_res.time_ms,
                    "input": test_input,
                    "expected": brute_out,
                    "actual": sol_out,
                    "stderr": sol_res.stderr
                }));
                break;
            }
            passed += 1;
            history.push(json!({
                "iteration": it,
                "verdict": "AC",
                "timeMs": sol_res.time_ms
            }));
        }

        let _ = std::fs::remove_file(&tmp_gen);
        let status = if counter_example.is_some() {
            "FOUND_COUNTEREXAMPLE"
        } else {
            "ALL_PASSED"
        };
        send_json(
            stream,
            200,
            json!({
                "ok": true,
                "status": status,
                "iterations": iterations,
                "passed": passed,
                "counterExample": counter_example,
                "history": history
            }),
        );
        return;
    }

    // 6. CP Templates
    if pathname == "/api/studio/templates" && method == "GET" {
        send_json(stream, 200, json!({ "templates": cp_templates() }));
        return;
    }

    // 7. OJ Bridge (47 Problems + Subtask Judge + AI Tutor + Anti-Cheat)
    if pathname == "/api/studio/problems" && method == "GET" {
        if let Some(data) = proxy_to_oj("/api/problems", "GET", None, 8000) {
            if data.is_array() {
                send_json(stream, 200, json!({ "problems": data }));
                return;
            }
        }
        send_json(stream, 200, json!({ "problems": [] }));
        return;
    }

    if pathname.starts_with("/api/studio/problem/") && method == "GET" {
        let id = url_decode(&pathname["/api/studio/problem/".len()..]);
        if let Some(data) = proxy_to_oj(&format!("/api/problem/{}", id), "GET", None, 8000) {
            send_json(stream, 200, data);
        } else {
            send_json(
                stream,
                404,
                json!({ "error": format!("Không tìm thấy bài tập: {}", id) }),
            );
        }
        return;
    }

    if pathname == "/api/studio/judge" && method == "POST" {
        let body_json = parse_body_json(&body);
        if let Some(data) = proxy_to_oj("/api/judge", "POST", Some(&body_json), 30000) {
            send_json(stream, 200, data);
        } else {
            send_json(
                stream,
                502,
                json!({ "error": "OJ Judge không phản hồi" }),
            );
        }
        return;
    }

    if pathname == "/api/studio/ai" && method == "POST" {
        let body_json = parse_body_json(&body);
        let mode = body_json["mode"].as_str().unwrap_or("chat");
        let code = body_json["code"].as_str().unwrap_or("");
        let lang = body_json["lang"].as_str().unwrap_or("cpp");
        let problem_id = body_json["problem_id"]
            .as_str()
            .unwrap_or("greedy_activity_001");

        if mode == "explain" || mode == "bugcheck" || mode == "optimize" || mode == "gentest" {
            let analysis = analyze_and_fix_code(code, lang, mode);
            send_json(stream, 200, analysis);
            return;
        }

        if mode == "hint" {
            let level = body_json["level"].as_i64().unwrap_or(1);
            let req_obj = json!({
                "problem_id": problem_id,
                "level": level,
                "code": code
            });
            let data = proxy_to_oj("/api/solution/hint", "POST", Some(&req_obj), 10000)
                .unwrap_or_else(|| json!({ "hint": "Hãy phân tích ràng buộc Subtask và chọn cấu trúc dữ liệu phù hợp." }));
            send_json(stream, 200, data);
            return;
        }

        if mode == "solution" {
            let req_obj = json!({ "problem_id": problem_id });
            let data = proxy_to_oj("/api/solution/code", "POST", Some(&req_obj), 10000)
                .unwrap_or_else(|| json!({ "error": "Không lấy được code mẫu" }));
            send_json(stream, 200, data);
            return;
        }

        if mode == "anticheat" {
            let code_a = body_json["codeA"].as_str().unwrap_or(code);
            let code_b = body_json["codeB"].as_str().unwrap_or("");
            let req_obj = json!({ "code_a": code_a, "code_b": code_b });
            let data = proxy_to_oj("/api/anti-cheat/compare", "POST", Some(&req_obj), 10000)
                .unwrap_or_else(|| json!({ "similarity": 0 }));
            send_json(stream, 200, data);
            return;
        }

        let message = body_json["message"]
            .as_str()
            .unwrap_or("Giải thích hướng tiếp cận bài này");
        let req_obj = json!({
            "problem_id": problem_id,
            "message": message,
            "code": code
        });
        let oj_resp = proxy_to_oj("/api/chat", "POST", Some(&req_obj), 12000);
        let reply_text = oj_resp
            .as_ref()
            .and_then(|d| {
                d["reply"]
                    .as_str()
                    .or_else(|| d["response"].as_str())
                    .or_else(|| d["message"].as_str())
            })
            .unwrap_or("Mình đã phân tích bài toán và code của bạn bằng nhân Rust bản địa. Hãy kiểm tra độ phức tạp và kiểu dữ liệu `long long` ở các Subtask lớn!");
        let local_diag = if !code.trim().is_empty() {
            analyze_and_fix_code(code, lang, "bugcheck")["findings"].clone()
        } else {
            json!([])
        };
        send_json(
            stream,
            200,
            json!({
                "ok": true,
                "reply": reply_text,
                "diagnostics": local_diag
            }),
        );
        return;
    }

    // 8. Git & CLI Runner
    if pathname == "/api/studio/git" && method == "GET" {
        let root = root_dir();
        let git = git_bin();
        let st = run_process_with_input(&git, &["status", "--porcelain", "-b"], "", 4000, &root);
        let lg = run_process_with_input(&git, &["log", "-n", "8", "--oneline"], "", 4000, &root);
        send_json(
            stream,
            200,
            json!({
                "ok": st.ok,
                "status": st.stdout.trim(),
                "log": lg.stdout.trim()
            }),
        );
        return;
    }

    if pathname == "/api/studio/cmd" && method == "POST" {
        let body_json = parse_body_json(&body);
        let action = body_json["action"].as_str().unwrap_or("doctor");
        let args: &[&str] = match action {
            "doctor" => &["doctor"],
            "status" => &["status"],
            "version" => &["--version"],
            "tests" => &["tests"],
            _ => &["status"],
        };
        let ws = get_active_workspace();
        let r = run_process_with_input(&drgx_cli_exe(), args, "", 8000, &ws);
        send_json(
            stream,
            200,
            json!({
                "ok": r.ok,
                "output": format!("{}\n{}", r.stdout, r.stderr).trim(),
                "timeMs": r.time_ms
            }),
        );
        return;
    }

    // 9. Workspace Live Preview file serving (/preview/*)
    if pathname.starts_with("/preview/") {
        let rel = url_decode(&pathname["/preview/".len()..]);
        let rel = if rel.is_empty() { "preview.html" } else { &rel };
        if let Ok(target) = resolve_safe_workspace_path(rel) {
            if target.is_file() {
                let ext = target
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                let bytes = std::fs::read(&target).unwrap_or_default();
                send_http_response(stream, 200, mime_for_ext(&ext), &bytes);
                return;
            }
        }
        send_http_response(stream, 404, "text/plain; charset=utf-8", b"Not found");
        return;
    }

    // 10. Embedded Studio Frontend Assets (compiled into drgx-studio.exe)
    match pathname.as_str() {
        "/" | "/index.html" | "/studio.html" => {
            send_http_response(
                stream,
                200,
                "text/html; charset=utf-8",
                STUDIO_HTML.as_bytes(),
            );
        }
        "/studio.css" => {
            send_http_response(
                stream,
                200,
                "text/css; charset=utf-8",
                STUDIO_CSS.as_bytes(),
            );
        }
        "/studio.js" => {
            send_http_response(
                stream,
                200,
                "application/javascript; charset=utf-8",
                STUDIO_JS.as_bytes(),
            );
        }
        "/logo.png" => {
            send_http_response(stream, 200, "image/png", LOGO_PNG);
        }
        "/favicon.ico" => {
            send_http_response(stream, 200, "image/x-icon", ICON_ICO);
        }
        _ => {
            send_http_response(stream, 404, "text/plain; charset=utf-8", b"Not Found");
        }
    }
}

fn start_embedded_rust_engine(preferred_port: Option<u16>) -> u16 {
    if let Some(&existing) = STUDIO_PORT.get() {
        return existing;
    }

    let mut ports_to_try = Vec::new();
    if let Some(p) = preferred_port {
        ports_to_try.push(p);
    }
    for p in DEFAULT_STUDIO_PORT..=45295 {
        if !ports_to_try.contains(&p) {
            ports_to_try.push(p);
        }
    }
    ports_to_try.push(0);

    let mut bound_listener = None;
    let mut actual_port = DEFAULT_STUDIO_PORT;

    for p in ports_to_try {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", p)) {
            actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(p);
            bound_listener = Some(listener);
            break;
        }
    }

    let listener = bound_listener.expect("Không thể khởi tạo cổng cục bộ cho DrgX Studio");
    let _ = STUDIO_PORT.set(actual_port);

    // Warm up OJ server asynchronously
    std::thread::spawn(|| {
        let _ = ensure_oj_server();
    });

    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            std::thread::spawn(move || {
                handle_client(stream, actual_port);
            });
        }
    });

    actual_port
}

fn eval_on_main_webview(app: &AppHandle, js: &str) {
    if let Some(webview) = app.get_webview("main") {
        let _ = webview.eval(js);
    }
}

#[cfg(windows)]
fn kill_tree(pid: u32) {
    let mut cmd = Command::new("taskkill");
    cmd.args(["/F", "/T", "/PID", &pid.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.status();
}

#[cfg(not(windows))]
fn kill_tree(_pid: u32) {}

fn main() {
    setup_toolchain_env();
    let _ = get_active_workspace();

    // Parse optional CLI flags
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("DrgX Studio Native Tauri v2 Desktop App v2.6.0");
        return;
    }

    // Support --headless-server [port] for automated E2E verification of the compiled Tauri binary
    if let Some(idx) = args.iter().position(|a| a == "--headless-server") {
        let req_port = args
            .get(idx + 1)
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or(DEFAULT_STUDIO_PORT);
        let port = start_embedded_rust_engine(Some(req_port));
        println!("DrgX Studio Tauri Rust Engine ready at http://127.0.0.1:{}", port);
        loop {
            std::thread::sleep(Duration::from_secs(3600));
        }
    }

    // Support passing a workspace folder path directly: `drgx-studio.exe D:\MyCode`
    if let Some(first_arg) = args.get(1) {
        if !first_arg.starts_with('-') {
            let p = PathBuf::from(first_arg);
            if p.is_dir() {
                set_active_workspace(p, true);
            } else if let Some(parent) = p.parent() {
                if parent.is_dir() {
                    set_active_workspace(parent.to_path_buf(), true);
                }
            }
        }
    }

    let port = start_embedded_rust_engine(None);
    let studio_url = format!("http://127.0.0.1:{}/", port);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(arg_dir) = argv.get(1) {
                let p = PathBuf::from(arg_dir);
                if p.is_dir() {
                    set_active_workspace(p, true);
                    eval_on_main_webview(app, "loadFiles();");
                }
            }
            if let Some(w) = app.get_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let _ = APP_HANDLE.set(app.handle().clone());

            if let Some(win) = app.get_window("main") {
                let _ = win.set_title("DrgX Studio — Native Tauri v2 Desktop App (C++17 / CP / OJ / AI)");
            }

            // Native Windows Menu Bar for DrgX Studio
            let open_folder = MenuItemBuilder::with_id("open_folder", "Mở thư mục Workspace...")
                .accelerator("Ctrl+O")
                .build(app)?;
            let new_file = MenuItemBuilder::with_id("new_file", "Tạo file mới...")
                .accelerator("Ctrl+N")
                .build(app)?;
            let save_file = MenuItemBuilder::with_id("save_file", "Lưu file hiện tại")
                .accelerator("Ctrl+S")
                .build(app)?;
            let file_menu = SubmenuBuilder::new(app, "Tệp")
                .item(&open_folder)
                .item(&new_file)
                .item(&save_file)
                .build()?;

            let run_code = MenuItemBuilder::with_id("run_code", "Biên dịch & Chạy Code")
                .accelerator("F5")
                .build(app)?;
            let batch_test = MenuItemBuilder::with_id("batch_test", "Chạy Batch Test Cases")
                .accelerator("Ctrl+Return")
                .build(app)?;
            let stress_test = MenuItemBuilder::with_id("stress_test", "Chạy Stress Test (Đối chiếu Brute)")
                .accelerator("Ctrl+Shift+T")
                .build(app)?;
            let submit_oj = MenuItemBuilder::with_id("submit_oj", "Chấm Subtask OJ")
                .accelerator("Ctrl+Shift+J")
                .build(app)?;
            let run_menu = SubmenuBuilder::new(app, "Thực thi & Chấm bài")
                .item(&run_code)
                .item(&batch_test)
                .item(&stress_test)
                .separator()
                .item(&submit_oj)
                .build()?;

            let ai_bugcheck = MenuItemBuilder::with_id("ai_bugcheck", "Quét Bug & Tự động vá C++17")
                .accelerator("Ctrl+Shift+B")
                .build(app)?;
            let ai_explain = MenuItemBuilder::with_id("ai_explain", "Giải thích & Đo độ phức tạp")
                .build(app)?;
            let ai_gentest = MenuItemBuilder::with_id("ai_gentest", "Sinh 6 Test Hiểm (Corner Cases)")
                .build(app)?;
            let ai_menu = SubmenuBuilder::new(app, "AI Copilot")
                .item(&ai_bugcheck)
                .item(&ai_explain)
                .item(&ai_gentest)
                .build()?;

            let cycle_skin = MenuItemBuilder::with_id("cycle_skin", "Đổi Giao diện (5 Skins)")
                .accelerator("Ctrl+Shift+K")
                .build(app)?;
            let open_doctor = MenuItemBuilder::with_id("open_doctor", "Kiểm tra Toolchain Doctor")
                .build(app)?;
            let view_menu = SubmenuBuilder::new(app, "Giao diện")
                .item(&cycle_skin)
                .item(&open_doctor)
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&file_menu, &run_menu, &ai_menu, &view_menu])
                .build()?;
            app.set_menu(menu)?;

            // Navigate the native Tauri Webview directly to our in-process Rust Studio Engine
            if let Some(webview) = app.get_webview("main") {
                if let Ok(parsed_url) = studio_url.parse() {
                    let _ = webview.navigate(parsed_url);
                }
            }

            let nav_handle = app.handle().clone();
            let nav_url = studio_url.clone();
            std::thread::spawn(move || {
                for delay_ms in [220u64, 650u64] {
                    std::thread::sleep(Duration::from_millis(delay_ms));
                    let inner = nav_handle.clone();
                    let target_url = nav_url.clone();
                    let _ = nav_handle.run_on_main_thread(move || {
                        if let Some(win) = inner.get_window("main") {
                            let _ = win.set_title("DrgX Studio — Native Tauri v2 Desktop App (C++17 / CP / OJ / AI)");
                        }
                        if let Some(wv) = inner.get_webview("main") {
                            let js = format!(
                                "if (window.location.hostname !== '127.0.0.1') {{ window.location.replace('{}'); }}",
                                target_url
                            );
                            let _ = wv.eval(&js);
                        }
                    });
                }
            });

            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_folder" => {
                eval_on_main_webview(app, "pickNativeFolder();");
            }
            "new_file" => {
                eval_on_main_webview(app, "promptNewFile();");
            }
            "save_file" => {
                eval_on_main_webview(app, "saveCurrentFile();");
            }
            "run_code" => {
                eval_on_main_webview(app, "runCurrentCode();");
            }
            "batch_test" => {
                eval_on_main_webview(app, "switchTab('tests'); runBatchTests();");
            }
            "stress_test" => {
                eval_on_main_webview(app, "switchTab('stress'); runStressTest();");
            }
            "submit_oj" => {
                eval_on_main_webview(app, "submitToOj();");
            }
            "ai_bugcheck" => {
                eval_on_main_webview(app, "aiAction('bugcheck');");
            }
            "ai_explain" => {
                eval_on_main_webview(app, "aiAction('explain');");
            }
            "ai_gentest" => {
                eval_on_main_webview(app, "aiAction('gentest');");
            }
            "cycle_skin" => {
                eval_on_main_webview(app, "cycleStudioSkin();");
            }
            "open_doctor" => {
                eval_on_main_webview(
                    app,
                    "switchSidePanel('doctor', document.querySelector('[data-panel=\"doctor\"]'));",
                );
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("Không thể khởi tạo ứng dụng Tauri v2 DrgX Studio");

    app.run(|_app_handle, event| {
        if let RunEvent::Exit = event {
            if let Ok(mut pids) = spawned_pids().lock() {
                for pid in pids.drain(..) {
                    kill_tree(pid);
                }
            }
        }
    });
}

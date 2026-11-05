use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

const VERSION: &str = "0.2.0";
const MAX_OUTPUT_BYTES: u64 = 8 * 1024 * 1024;
const MAX_ERR_BYTES: u64 = 1024 * 1024;
const MAX_TEST_BYTES: u64 = 16 * 1024 * 1024;
const MEMORY_LIMIT_BYTES: usize = 512 * 1024 * 1024;

// ANSI Styling
const RESET: &str = "\x1b[0m";
const BOLD: &str = "\x1b[1m";
const DIM: &str = "\x1b[2m";
const RED: &str = "\x1b[31m";
const GREEN: &str = "\x1b[32m";
const YELLOW: &str = "\x1b[33m";
const CYAN: &str = "\x1b[36m";
const GOLD: &str = "\x1b[38;2;250;204;21m";
const CROWN: &str = "\x1b[38;2;234;179;8m";

#[cfg(windows)]
fn init_windows_vt() {
    extern "system" {
        fn GetStdHandle(n_std_handle: u32) -> *mut std::ffi::c_void;
        fn GetConsoleMode(h_console: *mut std::ffi::c_void, lp_mode: *mut u32) -> i32;
        fn SetConsoleMode(h_console: *mut std::ffi::c_void, dw_mode: u32) -> i32;
    }
    const STD_OUTPUT_HANDLE: u32 = 0xFFFFFFF5;
    const ENABLE_VIRTUAL_TERMINAL_PROCESSING: u32 = 0x0004;

    unsafe {
        let handle = GetStdHandle(STD_OUTPUT_HANDLE);
        let mut mode: u32 = 0;
        if GetConsoleMode(handle, &mut mode) != 0 {
            SetConsoleMode(handle, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
        }
    }
}

#[cfg(not(windows))]
fn init_windows_vt() {}

fn print_banner() {
    println!("{GOLD}{BOLD}  ____            __   __{RESET}", GOLD = GOLD, BOLD = BOLD, RESET = RESET);
    println!("{GOLD}{BOLD} |  _ \\ _ __ __ _ \\ \\ / /{RESET}", GOLD = GOLD, BOLD = BOLD, RESET = RESET);
    println!("{GOLD}{BOLD} | | | | '__/ _` | \\ V / {RESET}  {CYAN}{BOLD}DrgX CLI{RESET} {DIM}v{}{RESET}", VERSION, GOLD = GOLD, BOLD = BOLD, RESET = RESET, CYAN = CYAN, DIM = DIM);
    println!("{GOLD}{BOLD} | |_| | | | (_| |  < <  {RESET}  {DIM}Bộ công cụ dòng lệnh Lập Trình Thi Đấu & AI{RESET}", GOLD = GOLD, BOLD = BOLD, RESET = RESET, DIM = DIM);
    println!("{GOLD}{BOLD} |____/|_|  \\__, |   \\_/ {RESET}  {GREEN}Native Win32 · Sub-0.1s · Zero Latency{RESET}", GOLD = GOLD, BOLD = BOLD, RESET = RESET, GREEN = GREEN);
    println!("{GOLD}{BOLD}            |___/        {RESET}", GOLD = GOLD, BOLD = BOLD, RESET = RESET);
    println!();
}

fn print_help() {
    print_banner();
    println!("{BOLD}CÁCH SỬ DỤNG:{RESET}");
    println!("  {CYAN}drgx{RESET} {GREEN}<lệnh>{RESET} [tùy chọn...]");
    println!();
    println!("{BOLD}CÁC LỆNH CHÍNH:{RESET}");
    println!("  {GREEN}init{RESET} <tên>          Khởi tạo thư mục bài toán CP (solution.cpp, input.txt, expected.txt)");
    println!("  {GREEN}run{RESET}  <file.cpp|py>  Biên dịch & chạy nhanh với đo thời gian (ms)");
    println!("  {GREEN}test{RESET} <file.cpp|py>  Chạy tự động kiểm thử với input.txt và so khớp expected.txt (AC/WA)");
    println!("  {GREEN}tests{RESET} [file] [--tl ms] {BOLD}⚖️ DRGX JUDGE{RESET}: chấm toàn bộ tests/*.in → bảng AC/WA/RE/TLE");
    println!("  {GREEN}stress{RESET} <sol> <brute> <gen.py> [--n 500] [--tl 2000]");
    println!("                            {BOLD}🧪 Stress tester{RESET}: sinh test ngẫu nhiên, săn test làm WA");
    println!("  {GOLD}profile{RESET} <file.cpp|py> [--n 250,500,...] [--tl ms] [--json]");
    println!("                            {BOLD}📈 Đo độ phức tạp thực nghiệm O(N^k){RESET}: T(µs), Peak RAM, R², dự phóng TLE 10^5/10^6");
    println!("  {GREEN}cp{RESET}   <thuật toán>   Xuất template giải thuật CP (segtree, rmq, dsu, fenwick, pref...)");
    println!("  {GREEN}studio{RESET} / {GREEN}app{RESET}        {BOLD}🚀 Mở DrgX Studio App độc lập (:45280 - Thay thế 5 Extensions){RESET}");
    println!("  {GREEN}oj{RESET}                 Mở Void-bit C++17 Subtask Judge (:8080) & Web Học Tập (:8000)");
    println!("  {GREEN}start{RESET}              Khởi động đồng thời toàn bộ dịch vụ (:8000, :8080, :8765)");
    println!("  {GREEN}verify{RESET}             Chạy bộ kiểm thử tự động 67/67 toàn hệ sinh thái");
    println!("  {GREEN}ide{RESET}  [thư mục]      Khởi chạy giao diện DrgX IDE");
    println!("  {GREEN}web{RESET}                Mở trang giới thiệu DrgX Showcase trên trình duyệt");
    println!("  {GREEN}learn{RESET}              Mở Hệ sinh thái DrgX: lộ trình học, câu lạc bộ, showcase");
    println!("  {GREEN}doctor{RESET}             Kiểm tra môi trường hệ thống (G++, Python, Node, DrgX IDE)");
    println!("  {GOLD}status{RESET}             {GOLD}⚡ Hiển thị thông số kiến trúc & trạng thái hệ sinh thái DrgX Local-First{RESET}");
    println!();
    println!("{BOLD}VÍ DỤ:{RESET}");
    println!("  {DIM}# Khởi tạo bài toán mới:{RESET}");
    println!("  drgx init bai1_prefix_sum");
    println!();
    println!("  {DIM}# Biên dịch và kiểm thử tự động:{RESET}");
    println!("  drgx test solution.cpp");
    println!();
    println!("  {DIM}# Xuất code Segment Tree vào file hoặc terminal:{RESET}");
    println!("  drgx cp segtree");
    println!("  drgx cp rmq -o rmq.cpp");
    println!();
}

fn find_on_path(names: &[&str]) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    for dir in env::split_paths(&path) {
        // Bỏ qua entry tương đối để không chạy nhầm executable trong CWD.
        if dir.as_os_str().is_empty() || !dir.is_absolute() {
            continue;
        }
        for name in names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn system_exe(name: &str) -> PathBuf {
    let root = env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    PathBuf::from(root).join("System32").join(name)
}

fn probe_exe(path: &Path, args: &[&str]) -> bool {
    let mut cmd = Command::new(path);
    setup_toolchain_env(&mut cmd, path);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| {
            o.status.success()
                && (!o.stdout.is_empty() || !o.stderr.is_empty())
        })
        .unwrap_or(false)
}

fn find_gxx() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cxx) = env::var("CXX") {
        let p = PathBuf::from(cxx.trim().trim_matches('"'));
        if p.is_file() {
            candidates.push(p);
        }
    }
    for c in [
        "C:\\msys64\\ucrt64\\bin\\g++.exe",
        "C:\\msys64\\mingw64\\bin\\g++.exe",
    ] {
        let p = PathBuf::from(c);
        if p.is_file() {
            candidates.push(p);
        }
    }
    if let Some(p) = find_on_path(&["g++.exe", "clang++.exe"]) {
        if !candidates.contains(&p) {
            candidates.push(p);
        }
    }
    let fallback = PathBuf::from("C:\\MinGW\\bin\\g++.exe");
    if fallback.is_file() && !candidates.contains(&fallback) {
        candidates.push(fallback);
    }
    candidates.into_iter().find(|p| probe_exe(p, &["--version"]))
}

fn setup_toolchain_env(cmd: &mut Command, compiler_path: &Path) {
    let cur_path = env::var_os("PATH").unwrap_or_default();
    let mut parts: Vec<PathBuf> = env::split_paths(&cur_path)
        .filter(|p| !p.as_os_str().is_empty())
        .collect();
    if let Some(parent) = compiler_path.parent() {
        parts.retain(|p| p != parent);
        parts.insert(0, parent.to_path_buf());
    }
    if let Ok(joined) = env::join_paths(parts) {
        env::set_var("PATH", &joined);
        cmd.env("PATH", joined);
    }
}

fn find_python() -> Option<PathBuf> {
    if let Ok(custom) = env::var("DRGX_PYTHON") {
        let p = PathBuf::from(custom.trim().trim_matches('"'));
        if p.is_file() && probe_exe(&p, &["--version"]) {
            return Some(p);
        }
    }
    let mut candidates = Vec::new();
    for name in ["python.exe", "python3.exe", "py.exe"] {
        if let Some(p) = find_on_path(&[name]) {
            candidates.push(p);
        }
    }
    let local = env::var("LOCALAPPDATA").unwrap_or_default();
    if !local.is_empty() {
        let root = PathBuf::from(&local).join("Programs").join("Python");
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                let p = entry.path().join("python.exe");
                if p.is_file() {
                    candidates.push(p);
                }
            }
        }
    }
    candidates.into_iter().find(|p| {
        let is_launcher = p
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.eq_ignore_ascii_case("py.exe"))
            .unwrap_or(false);
        if is_launcher {
            probe_exe(p, &["-3", "--version"])
        } else {
            probe_exe(p, &["--version"])
        }
    })
}

fn python_command(python: &Path) -> Command {
    let mut cmd = Command::new(python);
    if python
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.eq_ignore_ascii_case("py.exe"))
        .unwrap_or(false)
    {
        cmd.arg("-3");
    }
    cmd.env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONDONTWRITEBYTECODE", "1");
    cmd
}

fn cmd_init(args: &[String]) {
    let name = args.get(0).map(|s| s.as_str()).unwrap_or("cp_problem");
    let target_dir = Path::new(name);

    if name != "." && !target_dir.exists() {
        if let Err(e) = fs::create_dir_all(target_dir) {
            eprintln!("{RED}[!] Không tạo được thư mục '{}': {}{RESET}", name, e);
            std::process::exit(1);
        }
    }

    let cpp_path = if name == "." {
        PathBuf::from("solution.cpp")
    } else {
        target_dir.join("solution.cpp")
    };
    let input_path = if name == "." {
        PathBuf::from("input.txt")
    } else {
        target_dir.join("input.txt")
    };
    let expected_path = if name == "." {
        PathBuf::from("expected.txt")
    } else {
        target_dir.join("expected.txt")
    };

    let template = r#"#include <bits/stdc++.h>
using namespace std;

void solve() {
    int n;
    if (!(cin >> n)) return;
    vector<long long> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];

    // Mảng cộng dồn 1D (Prefix Sum)
    vector<long long> pref(n + 1, 0);
    for (int i = 0; i < n; i++) pref[i + 1] = pref[i] + a[i];

    cout << pref[n] << "\n";
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int t = 1;
    // cin >> t;
    while (t--) {
        solve();
    }
    return 0;
}
"#;

    for (path, data, label) in [
        (&cpp_path, template, "solution.cpp"),
        (&input_path, "5\n1 2 3 4 5\n", "input.txt"),
        (&expected_path, "15\n", "expected.txt"),
    ] {
        if !path.exists() {
            if let Err(e) = fs::write(path, data) {
                eprintln!(
                    "{RED}[!] Không ghi được {} tại '{}': {}{RESET}",
                    label,
                    path.display(),
                    e
                );
                std::process::exit(1);
            }
        }
    }

    println!("{GREEN}{BOLD}✓ Đã khởi tạo bài toán thành công tại: '{}'{RESET}", name);
    println!("  ├── {CYAN}{}{RESET}  (Code thuật toán C++ với Fast I/O)", cpp_path.display());
    println!("  ├── {YELLOW}{}{RESET}     (Dữ liệu test đầu vào)", input_path.display());
    println!("  └── {GREEN}{}{RESET}  (Kết quả mẫu mong đợi)", expected_path.display());
    println!();
    println!("{BOLD}Bước tiếp theo:{RESET}");
    if name != "." {
        println!("  cd {}", name);
    }
    println!("  drgx test solution.cpp");
}

fn cmd_run(args: &[String]) {
    if args.is_empty() {
        eprintln!("{RED}[!] Vui lòng chỉ định tệp mã nguồn: drgx run <file.cpp|py>{RESET}");
        std::process::exit(1);
    }
    let file = &args[0];
    let path = Path::new(file);
    if !path.is_file() {
        eprintln!("{RED}[!] Tệp '{}' không tồn tại hoặc không phải file!{RESET}", file);
        std::process::exit(1);
    }

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "cpp" | "cxx" | "cc" => run_cpp(path, false),
        "py" => run_python(path),
        "rs" => run_rust(path),
        _ => {
            eprintln!(
                "{RED}[!] Đuôi tệp '{}' chưa được hỗ trợ. Dùng .cpp/.cc/.cxx/.py/.rs.{RESET}",
                ext
            );
            std::process::exit(1);
        }
    }
}

fn compile_cpp(gxx: &Path, source: &Path, out_exe: &str) -> Result<std::time::Duration, String> {
    let t0 = Instant::now();
    for std_flag in ["-std=c++20", "-std=c++17", "-std=c++14"] {
        let mut cmd = Command::new(gxx);
        setup_toolchain_env(&mut cmd, gxx);
        cmd.arg("-O2")
            .arg(std_flag)
            .arg("-Wall")
            .arg(source)
            .arg("-o")
            .arg(out_exe);
        match cmd.output() {
            Ok(out) => {
                if out.status.success() {
                    return Ok(t0.elapsed());
                }
                let err_str = String::from_utf8_lossy(&out.stderr).to_string();
                if err_str.contains("unrecognized command line option") {
                    continue;
                }
                return Err(err_str);
            }
            Err(e) => return Err(format!("Lỗi gọi g++: {}", e)),
        }
    }
    Err("Không biên dịch được với các chuẩn C++20/C++17/C++14".to_string())
}

fn run_cpp(path: &Path, is_test_mode: bool) {
    let gxx = match find_gxx() {
        Some(p) => p,
        None => {
            eprintln!("{RED}[!] Không tìm thấy trình biên dịch G++ (MinGW / UCRT64).{RESET}");
            eprintln!("    Hãy chạy '{CYAN}drgx doctor{RESET}' để kiểm tra.");
            std::process::exit(1);
        }
    };

    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("solution");
    let (run_dir, _run_guard) = match make_run_dir("run") {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{RED}[!] {}{RESET}", e);
            std::process::exit(1);
        }
    };
    let out_exe_path = run_dir.join(format!("{}.exe", stem));
    let out_exe = out_exe_path.to_string_lossy().to_string();

    print!("{CYAN}[1/2] Đang biên dịch {}...{RESET}", path.display());
    let _ = io::stdout().flush();

    match compile_cpp(&gxx, path, &out_exe) {
        Ok(dur) => println!(" {GREEN}OK ({:.1?}){RESET}", dur),
        Err(e) => {
            println!(" {RED}[LỖI BIÊN DỊCH]{RESET}");
            eprintln!("{}", e);
            std::process::exit(1);
        }
    }

    if is_test_mode {
        return;
    }

    // Interactive or stdin-piped execution
    println!("{CYAN}[2/2] Đang thực thi {}...{RESET}", out_exe_path.display());
    println!("{DIM}----------------------------------------{RESET}");
    let t_run = Instant::now();

    let input_file = Path::new("input.txt");
    let mut cmd = Command::new(&out_exe_path);
    setup_toolchain_env(&mut cmd, &gxx);

    let (stdin_file, stdin_temp) = if input_file.exists() {
        match stdin_without_bom(input_file) {
            Ok(v) => {
                println!("{DIM}(Đã tự động nạp đầu vào từ input.txt){RESET}");
                v
            }
            Err(e) => {
                eprintln!("{RED}[!] {}{RESET}", e);
                std::process::exit(1);
            }
        }
    } else {
        (None, None)
    };
    if let Some(f) = stdin_file {
        cmd.stdin(Stdio::from(f));
    }

    let status = cmd.status();
    let dur = t_run.elapsed();
    println!("{DIM}----------------------------------------{RESET}");
    let exit_code = match status {
        Ok(s) if s.success() => {
            println!("{GREEN}{BOLD}✓ Hoàn thành trong {:.2?} (Exit Code: 0){RESET}", dur);
            0
        }
        Ok(s) => {
            println!("{RED}{BOLD}✗ Tiến trình kết thúc với mã lỗi: {}{RESET}", s);
            s.code().unwrap_or(1)
        }
        Err(e) => {
            eprintln!("{RED}[!] Lỗi chạy tệp: {}{RESET}", e);
            1
        }
    };
    if let Some(p) = stdin_temp {
        fs::remove_file(p).ok();
    }
    if exit_code != 0 {
        std::process::exit(exit_code);
    }
}

fn run_python(path: &Path) {
    let t_run = Instant::now();
    let Some(python) = find_python() else {
        eprintln!("{RED}[!] Không tìm thấy Python. Hãy cài Python hoặc chạy 'drgx doctor'.{RESET}");
        std::process::exit(1);
    };
    println!("{CYAN}Đang chạy Python: {}...{RESET}", path.display());
    println!("{DIM}----------------------------------------{RESET}");
    let mut cmd = python_command(&python);
    cmd.arg(path);
    let input_file = Path::new("input.txt");
    let (stdin_file, stdin_temp) = if input_file.exists() {
        match stdin_without_bom(input_file) {
            Ok(v) => {
                println!("{DIM}(Đã nạp input.txt){RESET}");
                v
            }
            Err(e) => {
                eprintln!("{RED}[!] {}{RESET}", e);
                std::process::exit(1);
            }
        }
    } else {
        (None, None)
    };
    if let Some(f) = stdin_file {
        cmd.stdin(Stdio::from(f));
    }
    let status = cmd.status();
    println!("{DIM}----------------------------------------{RESET}");
    let exit_code = match status {
        Ok(s) if s.success() => {
            println!("{GREEN}{BOLD}✓ Xong trong {:.2?}{RESET}", t_run.elapsed());
            0
        }
        Ok(s) => {
            println!(
                "{RED}{BOLD}✗ Tiến trình kết thúc với mã lỗi: {}{RESET}",
                s.code().map(|c| c.to_string()).unwrap_or_else(|| "?".into())
            );
            s.code().unwrap_or(1)
        }
        Err(e) => {
            eprintln!("{RED}[!] Lỗi chạy Python: {}{RESET}", e);
            1
        }
    };
    if let Some(p) = stdin_temp {
        fs::remove_file(p).ok();
    }
    if exit_code != 0 {
        std::process::exit(exit_code);
    }
}

fn run_rust(path: &Path) {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("main");
    let (run_dir, _run_guard) = match make_run_dir("rust") {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{RED}[!] {}{RESET}", e);
            std::process::exit(1);
        }
    };
    let exe_path = run_dir.join(format!("{}.exe", stem));
    println!("{CYAN}[1/2] Đang biên dịch Rust (--edition 2021) {}...{RESET}", path.display());
    let _ = io::stdout().flush();
    let t_compile = Instant::now();
    let Some(rustc) = find_on_path(&["rustc.exe"]) else {
        eprintln!("{RED}[!] Không tìm thấy rustc. Hãy cài Rust (rustup).{RESET}");
        std::process::exit(1);
    };
    let status = Command::new(&rustc)
        .args(["--edition", "2021", "-O"])
        .arg(path)
        .arg("-o")
        .arg(&exe_path)
        .status();
    match status {
        Ok(s) if s.success() => {
            println!(" {GREEN}OK ({:.1?}){RESET}", t_compile.elapsed());
        }
        Ok(_) => {
            println!(" {RED}[LỖI BIÊN DỊCH rustc]{RESET}");
            std::process::exit(1);
        }
        Err(e) => {
            eprintln!("{RED}[!] Không gọi được rustc: {}. Hãy cài Rust (rustup).{RESET}", e);
            std::process::exit(1);
        }
    }

    println!("{CYAN}[2/2] Đang thực thi {}...{RESET}", exe_path.display());
    println!("{DIM}----------------------------------------{RESET}");
    let t_run = Instant::now();
    let mut cmd = Command::new(&exe_path);
    let input_file = Path::new("input.txt");
    let (stdin_file, stdin_temp) = if input_file.exists() {
        match stdin_without_bom(input_file) {
            Ok(v) => {
                println!("{DIM}(Đã tự động nạp đầu vào từ input.txt){RESET}");
                v
            }
            Err(e) => {
                eprintln!("{RED}[!] {}{RESET}", e);
                std::process::exit(1);
            }
        }
    } else {
        (None, None)
    };
    if let Some(f) = stdin_file {
        cmd.stdin(Stdio::from(f));
    }
    let status = cmd.status();
    println!("{DIM}----------------------------------------{RESET}");
    let exit_code = match status {
        Ok(s) if s.success() => {
            println!("{GREEN}{BOLD}✓ Hoàn thành trong {:.2?} (Exit Code: 0){RESET}", t_run.elapsed());
            0
        }
        Ok(s) => {
            println!(
                "{RED}{BOLD}✗ Tiến trình kết thúc với mã lỗi: {}{RESET}",
                s.code().map(|c| c.to_string()).unwrap_or_else(|| "?".into())
            );
            s.code().unwrap_or(1)
        }
        Err(e) => {
            eprintln!("{RED}[!] Lỗi chạy tệp: {}{RESET}", e);
            1
        }
    };
    if let Some(p) = stdin_temp {
        fs::remove_file(p).ok();
    }
    if exit_code != 0 {
        std::process::exit(exit_code);
    }
}

fn normalize(s: &str) -> String {
    s.trim_start_matches('\u{feff}')
        .lines()
        .map(|l| l.trim_end())
        .collect::<Vec<&str>>()
        .join("\n")
        .trim()
        .to_string()
}

/// Một số editor trên Windows lưu UTF-8 kèm BOM. BOM ở đầu input làm Python
/// đọc sai số đầu tiên, nên tạo bản sao không BOM trước khi chạy.
/// Mở stdin cho lệnh `run` với cùng cách xử lý BOM như Judge/F5.
fn stdin_without_bom(input: &Path) -> Result<(Option<fs::File>, Option<PathBuf>), String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let scratch = env::temp_dir().join(format!(
        "drgx-run-stdin-{}-{}.tmp",
        std::process::id(),
        stamp
    ));
    let (path, temp) = input_without_bom(input, &scratch)?;
    let file = fs::File::open(&path)
        .map_err(|e| format!("không mở được input {}: {}", path.display(), e))?;
    Ok((Some(file), temp))
}

fn input_without_bom(
    input: &Path,
    scratch: &Path,
) -> Result<(PathBuf, Option<PathBuf>), String> {
    let bytes = fs::read(input)
        .map_err(|e| format!("không đọc được input {}: {}", input.display(), e))?;
    let has_bom = bytes.starts_with(&[0xEF, 0xBB, 0xBF])
        || bytes.starts_with(&[0xFF, 0xFE])
        || bytes.starts_with(&[0xFE, 0xFF]);
    if !has_bom {
        return Ok((input.to_path_buf(), None));
    }
    let text = decode_text_bytes(&bytes)?;
    fs::write(scratch, text.as_bytes())
        .map_err(|e| format!("không tạo được stdin tạm {}: {}", scratch.display(), e))?;
    Ok((scratch.to_path_buf(), Some(scratch.to_path_buf())))
}

fn cmd_test(args: &[String]) {
    let file = args.get(0).map(|s| s.as_str()).unwrap_or("solution.cpp");
    let path = Path::new(file);
    if !path.is_file() {
        eprintln!("{RED}[!] Tệp '{}' không tồn tại hoặc không phải file!{RESET}", file);
        std::process::exit(1);
    }

    let input_path = Path::new("input.txt");
    let expected_path = Path::new("expected.txt");
    if !input_path.is_file() {
        eprintln!("{RED}[!] Không tìm thấy 'input.txt'. Tạo input.txt trước khi chạy F5.{RESET}");
        std::process::exit(1);
    }
    if !expected_path.is_file() {
        eprintln!("{RED}[!] Không tìm thấy 'expected.txt'. Tạo expected.txt trước khi chạy F5.{RESET}");
        std::process::exit(1);
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let is_py = ext.eq_ignore_ascii_case("py");
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("solution");
    let (run_dir, _run_guard) = match make_run_dir("f5") {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{RED}[!] {}{RESET}", e);
            std::process::exit(1);
        }
    };
    let exe_path = run_dir.join(format!("{}.exe", stem));
    let exe = exe_path.to_string_lossy().to_string();
    let mut gxx: Option<PathBuf> = None;
    let mut child_cmd;

    if is_py {
        let Some(python) = find_python() else {
            eprintln!("{RED}[!] Không tìm thấy Python. Hãy cài Python hoặc chạy 'drgx doctor'.{RESET}");
            std::process::exit(1);
        };
        print!("{CYAN}[1/2] Đang chạy trực tiếp {}...{RESET}", file);
        let _ = io::stdout().flush();
        println!(" {GREEN}OK{RESET}");
        child_cmd = python_command(&python);
        child_cmd.arg(path);
    } else if ext.eq_ignore_ascii_case("cpp")
        || ext.eq_ignore_ascii_case("cc")
        || ext.eq_ignore_ascii_case("cxx")
    {
        let g = match find_gxx() {
            Some(p) => p,
            None => {
                eprintln!("{RED}[!] Không tìm thấy G++. Hãy cài MinGW hoặc kiểm tra PATH.{RESET}");
                std::process::exit(1);
            }
        };
        print!("{CYAN}[1/2] Đang biên dịch {}...{RESET}", file);
        let _ = io::stdout().flush();
        match compile_cpp(&g, path, &exe) {
            Ok(dur) => println!(" {GREEN}OK ({:.1?}){RESET}", dur),
            Err(e) => {
                println!(" {RED}[LỖI BIÊN DỊCH]{RESET}");
                eprintln!("{}", e);
                std::process::exit(1);
            }
        }
        gxx = Some(g);
        child_cmd = Command::new(&exe_path);
    } else {
        eprintln!("{RED}[!] F5 chỉ hỗ trợ .cpp/.cc/.cxx/.py (nhận: '{}').{RESET}", ext);
        std::process::exit(1);
    }

    print!("{CYAN}[2/2] Đang kiểm thử với input.txt...{RESET}");
    let _ = io::stdout().flush();
    // Không để output.txt cũ gây hiểu nhầm nếu lần này biên dịch/chạy lỗi.
    fs::remove_file("output.txt").ok();

    let input_data = match read_text_capped(input_path, MAX_TEST_BYTES) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{RED}[!] {}{RESET}", e);
            std::process::exit(1);
        }
    };
    let expected_data = match read_text_capped(expected_path, MAX_OUTPUT_BYTES) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{RED}[!] {}{RESET}", e);
            std::process::exit(1);
        }
    };
    let out_path = run_dir.join("f5_out.txt");
    let err_path = run_dir.join("f5_err.txt");
    let run = run_child_files(
        child_cmd,
        input_path,
        &out_path,
        &err_path,
        gxx.as_deref(),
        10_000,
    );
    let actual_raw = if run.verdict == RunVerdict::Ole {
        read_prefix_text(&out_path, MAX_OUTPUT_BYTES)
    } else {
        match read_text_capped(&out_path, MAX_OUTPUT_BYTES) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("{RED}[!] Không đọc được output của chương trình: {}{RESET}", e);
                std::process::exit(1);
            }
        }
    };
    if let Err(e) = fs::write("output.txt", &actual_raw) {
        eprintln!("{YELLOW}[!] Không ghi được output.txt: {}{RESET}", e);
    }

    let actual_norm = normalize(&actual_raw);
    let expected_norm = normalize(&expected_data);
    let (label, color) = match run.verdict {
        RunVerdict::Ac if actual_norm == expected_norm => ("ACCEPTED (AC)", GREEN),
        RunVerdict::Ac => ("WRONG ANSWER (WA)", RED),
        RunVerdict::Re => ("RUNTIME ERROR (RE)", RED),
        RunVerdict::Tle => ("TIME LIMIT EXCEEDED (TLE)", YELLOW),
        RunVerdict::Ole => ("OUTPUT LIMIT EXCEEDED (OLE)", YELLOW),
        RunVerdict::SpawnErr => ("KHÔNG CHẠY ĐƯỢC (ERR)", RED),
        RunVerdict::Wa => ("WRONG ANSWER (WA)", RED),
        RunVerdict::Skipped => ("BỎ QUA (SKIP)", DIM),
    };

    println!();
    println!("{DIM}===================================================={RESET}");
    println!("{color}{BOLD} [{}] {} - {:.2?}{RESET}", if run.verdict == RunVerdict::Ac && actual_norm == expected_norm { "✓" } else { "✗" }, label, std::time::Duration::from_millis(run.ms as u64));
    if !run.stderr.trim().is_empty() {
        println!("{DIM}--- stderr (tối đa 20 dòng) ---{RESET}");
        for line in run.stderr.trim().lines().take(20) {
            eprintln!("{RED}{}{RESET}", line);
        }
    }
    if run.verdict != RunVerdict::Ac || actual_norm != expected_norm {
        println!("{DIM}----------------------------------------------------{RESET}");
        println!("{BOLD}Đầu vào (input.txt):{RESET}");
        println!("{}", cap_text(input_data.trim(), 4000));
        println!("{DIM}----------------------------------------------------{RESET}");
        println!("{RED}{BOLD}Output của bạn (output.txt):{RESET}");
        println!("{}", cap_text(&actual_norm, 8000));
        println!("{DIM}----------------------------------------------------{RESET}");
        println!("{GREEN}{BOLD}Kết quả mong đợi (expected.txt):{RESET}");
        println!("{}", cap_text(&expected_norm, 8000));
    } else {
        println!("{BOLD}Output:{RESET}");
        println!("{}", cap_text(&actual_norm, 8000));
    }
    println!("{DIM}===================================================={RESET}");

    fs::remove_file(out_path).ok();
    fs::remove_file(err_path).ok();
    if run.verdict != RunVerdict::Ac || actual_norm != expected_norm {
        std::process::exit(1);
    }
}

// ====================== DRGX JUDGE: multi-testcase & stress ==========================

#[cfg(windows)]
struct JobGuard(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl Drop for JobGuard {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

/// Spawn bằng CREATE_SUSPENDED, gán Job Object giới hạn bộ nhớ rồi mới cho
/// tiến trình chạy. Nếu gán sau khi spawn, chương trình có thể đã cấp phát
/// hàng trăm MB trước khi bị giới hạn.
#[cfg(windows)]
fn resume_suspended_process(pid: u32) {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
    };
    use windows_sys::Win32::System::Threading::{OpenThread, ResumeThread, THREAD_SUSPEND_RESUME};
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
        if snapshot as isize == -1 {
            return;
        }
        let mut entry: THREADENTRY32 = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
        if Thread32First(snapshot, &mut entry) != 0 {
            loop {
                if entry.th32OwnerProcessID == pid {
                    let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                    if !thread.is_null() {
                        ResumeThread(thread);
                        CloseHandle(thread);
                    }
                }
                if Thread32Next(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
    }
}

/// Đọc private commit của tiến trình. Dùng làm fallback khi job object không
/// gán được (ví dụ CLI đang chạy trong một job của IDE/terminal khác).
#[cfg(windows)]
fn process_private_bytes(pid: u32) -> Option<usize> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::ProcessStatus::{
        K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut info: PROCESS_MEMORY_COUNTERS_EX = std::mem::zeroed();
        info.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
        let ok = K32GetProcessMemoryInfo(
            handle,
            &mut info as *mut PROCESS_MEMORY_COUNTERS_EX as *mut PROCESS_MEMORY_COUNTERS,
            info.cb,
        );
        CloseHandle(handle);
        if ok != 0 {
            Some(info.PrivateUsage)
        } else {
            None
        }
    }
}

#[cfg(not(windows))]
fn process_private_bytes(_pid: u32) -> Option<usize> {
    None
}

#[cfg(windows)]
fn job_for_child(pid: u32) -> Option<JobGuard> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_JOB_MEMORY, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOB_OBJECT_LIMIT_PROCESS_MEMORY,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return None;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            | JOB_OBJECT_LIMIT_PROCESS_MEMORY
            | JOB_OBJECT_LIMIT_JOB_MEMORY;
        info.ProcessMemoryLimit = MEMORY_LIMIT_BYTES;
        info.JobMemoryLimit = MEMORY_LIMIT_BYTES;
        if SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) == 0
        {
            CloseHandle(job);
            return None;
        }
        let proc = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if proc.is_null() {
            CloseHandle(job);
            return None;
        }
        let assigned = AssignProcessToJobObject(job, proc);
        CloseHandle(proc);
        if assigned == 0 {
            CloseHandle(job);
            return None;
        }
        Some(JobGuard(job))
    }
}

#[derive(Clone, Copy, PartialEq)]
enum RunVerdict {
    Ac,
    Wa,
    Re,
    Tle,
    Ole,
    SpawnErr,
    Skipped,
}

impl RunVerdict {
    fn code(self) -> &'static str {
        match self {
            RunVerdict::Ac => "AC",
            RunVerdict::Wa => "WA",
            RunVerdict::Re => "RE",
            RunVerdict::Tle => "TLE",
            RunVerdict::Ole => "OLE",
            RunVerdict::SpawnErr => "ERR",
            RunVerdict::Skipped => "SKIP",
        }
    }
}

struct ChildRun {
    verdict: RunVerdict,
    exit_code: Option<i32>,
    ms: u128,
    stderr: String,
}

/// Chạy tiến trình: stdin ← file input, stdout → file output, stderr → file err,
/// watcher polling 5ms — quá tl_ms thì kill (đánh dấu TLE). An toàn với output lớn.
fn decode_text_bytes(bytes: &[u8]) -> Result<String, String> {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    if bytes.starts_with(&[0xFF, 0xFE]) {
        if bytes.len() % 2 != 0 {
            return Err("UTF-16LE lỗi độ dài".to_string());
        }
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16(&units).map_err(|_| "UTF-16LE không hợp lệ".to_string());
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        if bytes.len() % 2 != 0 {
            return Err("UTF-16BE lỗi độ dài".to_string());
        }
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16(&units).map_err(|_| "UTF-16BE không hợp lệ".to_string());
    }
    String::from_utf8(bytes.to_vec()).map_err(|_| "output không phải UTF-8/UTF-16 hợp lệ".to_string())
}

fn read_text_capped(path: &Path, max_bytes: u64) -> Result<String, String> {
    let bytes = read_bytes_capped(path, max_bytes)?;
    decode_text_bytes(&bytes)
}

/// Đọc tối đa `max_bytes` đầu tiên và ghi rõ nếu tệp bị cắt. Dùng cho OLE:
/// chương trình đã in quá giới hạn, không nên biến một verdict OLE thành lỗi
/// "không đọc được output" khó hiểu cho học sinh.
fn read_prefix_text(path: &Path, max_bytes: u64) -> String {
    let mut bytes = Vec::new();
    if let Ok(file) = fs::File::open(path) {
        let _ = file
            .take(max_bytes.saturating_add(1))
            .read_to_end(&mut bytes);
    }
    let truncated = bytes.len() as u64 > max_bytes;
    if truncated {
        bytes.truncate(max_bytes as usize);
    }
    let mut text = decode_text_bytes(&bytes)
        .unwrap_or_else(|_| String::from_utf8_lossy(&bytes).into_owned());
    if truncated {
        text.push_str("\n… [output bị cắt: vượt giới hạn 8 MB]");
    }
    text
}

fn read_bytes_capped(path: &Path, max_bytes: u64) -> Result<Vec<u8>, String> {
    let meta = fs::metadata(path).map_err(|e| format!("không đọc được {}: {}", path.display(), e))?;
    if !meta.is_file() {
        return Err(format!("{} không phải file", path.display()));
    }
    if meta.len() > max_bytes {
        return Err(format!("{} vượt quá {} byte", path.display(), max_bytes));
    }
    fs::read(path).map_err(|e| format!("không đọc được {}: {}", path.display(), e))
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn run_child_files(
    mut cmd: Command,
    input: &Path,
    output: &Path,
    err_path: &Path,
    gxx: Option<&Path>,
    tl_ms: u128,
) -> ChildRun {
    if let Some(g) = gxx {
        setup_toolchain_env(&mut cmd, g);
    }
    let out_file = match fs::File::create(output) {
        Ok(f) => f,
        Err(e) => {
            return ChildRun {
                verdict: RunVerdict::SpawnErr,
                exit_code: None,
                ms: 0,
                stderr: format!("không tạo được file output: {}", e),
            };
        }
    };
    let err_file = match fs::File::create(err_path) {
        Ok(f) => f,
        Err(e) => {
            return ChildRun {
                verdict: RunVerdict::SpawnErr,
                exit_code: None,
                ms: 0,
                stderr: format!("không tạo được file stderr: {}", e),
            };
        }
    };
    cmd.stdout(Stdio::from(out_file));
    cmd.stderr(Stdio::from(err_file));

    let scratch = output.with_extension("stdin");
    let (stdin_path, temp_stdin) = match input_without_bom(input, &scratch) {
        Ok(v) => v,
        Err(e) => {
            return ChildRun {
                verdict: RunVerdict::SpawnErr,
                exit_code: None,
                ms: 0,
                stderr: e,
            };
        }
    };
    let stdin_file = match fs::File::open(&stdin_path) {
        Ok(f) => f,
        Err(e) => {
            if let Some(p) = &temp_stdin {
                let _ = fs::remove_file(p);
            }
            return ChildRun {
                verdict: RunVerdict::SpawnErr,
                exit_code: None,
                ms: 0,
                stderr: format!(
                    "không mở được input {}: {}",
                    stdin_path.display(),
                    e
                ),
            };
        }
    };
    cmd.stdin(Stdio::from(stdin_file));

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_SUSPENDED: u32 = 0x0000_0004;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_SUSPENDED | CREATE_NO_WINDOW);
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            if let Some(p) = &temp_stdin {
                let _ = fs::remove_file(p);
            }
            return ChildRun {
                verdict: RunVerdict::SpawnErr,
                exit_code: None,
                ms: 0,
                stderr: format!("không spawn được tiến trình: {}", e),
            };
        }
    };
    #[cfg(windows)]
    let _job = {
        // Gán job khi tiến trình còn treo, sau đó mới resume để giới hạn
        // 512 MB có hiệu lực trước khi chương trình kịp cấp phát.
        let job = job_for_child(child.id());
        resume_suspended_process(child.id());
        job
    };

    let t0 = Instant::now();
    let deadline = std::time::Duration::from_millis(tl_ms as u64);
    let mut timed_out = false;
    let mut output_limited = false;
    let mut memory_limited = false;
    let mut last_status = None;
    let mut last_memory_check = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(st)) => {
                last_status = Some(st);
                break;
            }
            Ok(None) => {
                if t0.elapsed() >= deadline {
                    timed_out = true;
                    let _ = child.kill();
                    last_status = child.try_wait().ok().flatten();
                    break;
                }
                if file_size(output) > MAX_OUTPUT_BYTES || file_size(err_path) > MAX_ERR_BYTES {
                    output_limited = true;
                    let _ = child.kill();
                    last_status = child.try_wait().ok().flatten();
                    break;
                }
                // Job object có thể không gán được khi CLI đang nằm trong job
                // khác; kiểm tra private commit trực tiếp để vẫn chặn 512 MB.
                if last_memory_check.elapsed() >= std::time::Duration::from_millis(5) {
                    last_memory_check = Instant::now();
                    if process_private_bytes(child.id())
                        .map(|bytes| bytes > MEMORY_LIMIT_BYTES)
                        .unwrap_or(false)
                    {
                        memory_limited = true;
                        let _ = child.kill();
                        last_status = child.try_wait().ok().flatten();
                        break;
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            Err(_) => break,
        }
    }
    if file_size(output) > MAX_OUTPUT_BYTES || file_size(err_path) > MAX_ERR_BYTES {
        output_limited = true;
    }
    let ms = t0.elapsed().as_millis();
    let stderr = read_text_capped(err_path, MAX_ERR_BYTES)
        .unwrap_or_else(|e| format!("(không đọc được stderr: {})", e));
    let verdict = if timed_out {
        RunVerdict::Tle
    } else if output_limited {
        RunVerdict::Ole
    } else if memory_limited {
        RunVerdict::Re
    } else if last_status.map(|s| s.success()).unwrap_or(false) {
        RunVerdict::Ac
    } else {
        RunVerdict::Re
    };
    if let Some(p) = &temp_stdin {
        let _ = fs::remove_file(p);
    }
    ChildRun {
        verdict,
        exit_code: last_status.and_then(|s| s.code()),
        ms,
        stderr,
    }
}

fn cap_text(s: &str, max_chars: usize) -> String {
    let n = s.chars().count();
    if n <= max_chars {
        s.to_string()
    } else {
        let head: String = s.chars().take(max_chars).collect();
        format!("{}\n… (cắt bớt {} ký tự)", head, n - max_chars)
    }
}

fn auto_detect_source() -> Option<PathBuf> {
    // Chọn file vừa sửa gần nhất trong thư mục hiện tại, không ưu tiên
    // solution.cpp/main.cpp một cách mù quáng (người dùng có thể đang sửa file khác).
    let mut candidates: Vec<(std::time::SystemTime, PathBuf)> = if let Ok(rd) = fs::read_dir(".") {
        rd.flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && matches!(
                        p.extension()
                            .and_then(|e| e.to_str())
                            .map(|e| e.to_ascii_lowercase())
                            .as_deref(),
                        Some("cpp") | Some("cxx") | Some("cc") | Some("py")
                    )
            })
            .map(|p| {
                let modified = fs::metadata(&p)
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                (modified, p)
            })
            .collect()
    } else {
        Vec::new()
    };
    candidates.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    candidates.into_iter().next().map(|(_, p)| p)
}

fn judge_fail(json_out: bool, msg: &str) -> ! {
    if json_out {
        println!(
            "{}",
            json!({ "ok": false, "error": msg }).to_string()
        );
    } else {
        eprintln!("{RED}[!] {}{RESET}", msg);
    }
    std::process::exit(1);
}

struct TempDirGuard(PathBuf);
impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn make_run_dir(label: &str) -> Result<(PathBuf, TempDirGuard), String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = env::temp_dir().join(format!(
        "drgx-{}-{}-{}",
        label,
        std::process::id(),
        stamp
    ));
    fs::create_dir_all(&dir)
        .map_err(|e| format!("không tạo được thư mục tạm {}: {}", dir.display(), e))?;
    Ok((dir.clone(), TempDirGuard(dir)))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension(format!("tmp-{}", std::process::id()));
    fs::write(&tmp, bytes).map_err(|e| format!("không ghi được {}: {}", tmp.display(), e))?;
    match fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::write(path, bytes).map_err(|e| format!("không ghi được {}: {}", path.display(), e))?;
            let _ = fs::remove_file(&tmp);
            Ok(())
        }
    }
}

/// ⚖️ drgx tests — chấm toàn bộ tests/*.in đối với tests/*.out
/// Usage: drgx tests [--json] [--tl <ms>] [solution.cpp]
fn find_expected_file(tests_dir: &Path, stem: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(tests_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let same_stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case(stem))
            .unwrap_or(false);
        let ext_ok = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| {
                e.eq_ignore_ascii_case("out")
                    || e.eq_ignore_ascii_case("a")
                    || e.eq_ignore_ascii_case("ans")
            })
            .unwrap_or(false);
        if same_stem && ext_ok {
            return Some(path);
        }
    }
    None
}

fn cmd_tests(args: &[String]) {
    let mut json_out = false;
    let mut tl_ms: u128 = 6000;
    let mut source: Option<String> = None;
    let mut end_opts = false;
    let mut i = 0;
    while i < args.len() {
        if !end_opts {
            match args[i].as_str() {
                "--" => {
                    end_opts = true;
                    i += 1;
                    continue;
                }
                "--json" => {
                    json_out = true;
                    i += 1;
                    continue;
                }
                "--tl" => {
                    let value = args.get(i + 1).and_then(|v| v.parse::<u128>().ok());
                    match value.filter(|v| (100..=120_000).contains(v)) {
                        Some(v) => tl_ms = v,
                        None => judge_fail(json_out, "--tl phải là số từ 100 đến 120000 ms"),
                    }
                    i += 2;
                    continue;
                }
                _ => {}
            }
        }
        if source.is_none() {
            source = Some(args[i].to_string());
        }
        i += 1;
    }

    let src_path: PathBuf = match source.map(PathBuf::from) {
        Some(p) => {
            if p.is_file() {
                p
            } else {
                judge_fail(
                    json_out,
                    &format!("Tệp '{}' không tồn tại hoặc không phải file!", p.display()),
                );
            }
        }
        None => match auto_detect_source() {
            Some(p) => p,
            None => {
                judge_fail(
                    json_out,
                    "Không tìm thấy file source (.cpp/.cc/.cxx/.py) trong thư mục hiện tại!",
                )
            }
        },
    };

    let tests_dir = Path::new("tests");
    if !tests_dir.is_dir() {
        judge_fail(
            json_out,
            "Không tìm thấy thư mục tests/. Đặt các file tests/01.in, tests/01.out... rồi chấm lại!",
        );
    }
    let mut inputs: Vec<PathBuf> = Vec::new();
    let rd = match fs::read_dir(tests_dir) {
        Ok(rd) => rd,
        Err(e) => judge_fail(json_out, &format!("Không đọc được thư mục tests/: {}", e)),
    };
    for entry in rd {
        let entry = match entry {
            Ok(v) => v,
            Err(e) => judge_fail(json_out, &format!("Không đọc được mục trong tests/: {}", e)),
        };
        let file_type = match entry.file_type() {
            Ok(v) => v,
            Err(e) => judge_fail(json_out, &format!("Không đọc được loại file test: {}", e)),
        };
        if file_type.is_file()
            && entry
                .path()
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("in"))
                .unwrap_or(false)
        {
            inputs.push(entry.path());
        }
    }
    inputs.sort();
    if inputs.is_empty() {
        judge_fail(json_out, "Thư mục tests/ không có file *.in nào!");
    }

    let is_py = src_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("py"))
        .unwrap_or(false);
    let mut gxx: Option<PathBuf> = None;
    let python = if is_py {
        match find_python() {
            Some(p) => Some(p),
            None => judge_fail(json_out, "Không tìm thấy Python. Chạy 'drgx doctor' kiểm tra."),
        }
    } else {
        None
    };
    if !is_py {
        let ext = src_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(ext.as_str(), "cpp" | "cc" | "cxx") {
            judge_fail(
                json_out,
                &format!("Judge chỉ hỗ trợ .cpp/.cc/.cxx/.py (nhận: '{}').", ext),
            );
        }
    }

    let (run_dir, _run_guard) = match make_run_dir("judge") {
        Ok(v) => v,
        Err(e) => judge_fail(json_out, &e),
    };
    let exe_path = run_dir.join("solution.exe");
    let exe_name = exe_path.to_string_lossy().to_string();

    if !is_py {
        let g = match find_gxx() {
            Some(p) => p,
            None => judge_fail(json_out, "Không tìm thấy G++. Hãy chạy 'drgx doctor'."),
        };
        if !json_out {
            print!("{CYAN}⚖️ Judge: biên dịch {}...{RESET}", src_path.display());
            let _ = io::stdout().flush();
        }
        match compile_cpp(&g, &src_path, &exe_name) {
            Ok(_) => {
                if !json_out {
                    println!(" {GREEN}OK{RESET}");
                }
            }
            Err(e) => {
                judge_fail(
                    json_out,
                    &format!("LỖI BIÊN DỊCH {}:\n{}", src_path.display(), e.lines().take(15).collect::<Vec<&str>>().join("\n")),
                )
            }
        }
        gxx = Some(g);
    }

    let out_path = run_dir.join("out.txt");
    let err_path = run_dir.join("err.txt");

    struct TRec {
        name: String,
        verdict: RunVerdict,
        ms: u128,
        input: String,
        expected: String,
        got: String,
        stderr: String,
        note: String,
    }

    let mut recs: Vec<TRec> = Vec::new();
    for (idx, input) in inputs.iter().enumerate() {
        let stem = match input.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => format!("test{}", idx),
        };
        let expected = find_expected_file(tests_dir, &stem);

        let expected_note = match &expected {
            Some(p) => format!("({})", p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()),
            None => "(thiếu file kết quả)".to_string(),
        };

        if !json_out {
            print!("{DIM}  #{} {} {RESET}", idx + 1, stem);
            let _ = io::stdout().flush();
        }

        let mut got = String::new();
        let mut expected_text = String::new();
        let mut input_text = String::new();
        let mut note = expected_note;
        let (v, child) = match &expected {
            Some(exp_path) => {
                let input_read = read_text_capped(input, MAX_TEST_BYTES);
                let expected_read = read_text_capped(exp_path, MAX_OUTPUT_BYTES);
                match (input_read, expected_read) {
                    (Ok(inp), Ok(exp)) => {
                        input_text = inp;
                        expected_text = exp;
                        let cmd = if let Some(py) = &python {
                            let mut c = python_command(py);
                            c.arg(&src_path);
                            c
                        } else {
                            Command::new(&exe_path)
                        };
                        let _ = fs::remove_file(&out_path);
                        let r = run_child_files(
                            cmd,
                            input,
                            &out_path,
                            &err_path,
                            gxx.as_deref(),
                            tl_ms,
                        );
                        match read_text_capped(&out_path, MAX_OUTPUT_BYTES) {
                            Ok(out) => {
                                got = out;
                                let v = if r.verdict == RunVerdict::Ac {
                                    if normalize(&got) == normalize(&expected_text) {
                                        RunVerdict::Ac
                                    } else {
                                        RunVerdict::Wa
                                    }
                                } else {
                                    r.verdict
                                };
                                (v, r)
                            }
                            Err(e) => {
                                note = format!("(không đọc được output: {})", e);
                                (
                                    RunVerdict::SpawnErr,
                                    ChildRun {
                                        verdict: RunVerdict::SpawnErr,
                                        exit_code: r.exit_code,
                                        ms: r.ms,
                                        stderr: e,
                                    },
                                )
                            }
                        }
                    }
                    (Err(e), _) | (_, Err(e)) => {
                        note = format!("(lỗi đọc test: {})", e);
                        (
                            RunVerdict::SpawnErr,
                            ChildRun {
                                verdict: RunVerdict::SpawnErr,
                                exit_code: None,
                                ms: 0,
                                stderr: e,
                            },
                        )
                    }
                }
            }
            None => (
                RunVerdict::Skipped,
                ChildRun {
                    verdict: RunVerdict::Skipped,
                    exit_code: None,
                    ms: 0,
                    stderr: String::new(),
                },
            ),
        };

        if !json_out {
            let tag = match v {
                RunVerdict::Ac => format!("{GREEN}{BOLD}AC{RESET}"),
                RunVerdict::Wa => format!("{RED}{BOLD}WA{RESET}"),
                RunVerdict::Re => format!("{YELLOW}{BOLD}RE{RESET}"),
                RunVerdict::Tle => format!("{YELLOW}{BOLD}TLE{RESET}"),
                RunVerdict::Ole => format!("{YELLOW}{BOLD}OLE{RESET}"),
                RunVerdict::Skipped => format!("{DIM}SKIP{RESET}"),
                RunVerdict::SpawnErr => format!("{RED}ERR{RESET}"),
            };
            println!("{} {:>6} ms", tag, child.ms);
        }
        recs.push(TRec {
            name: stem,
            verdict: v,
            ms: child.ms,
            input: input_text,
            expected: expected_text,
            got,
            stderr: child.stderr,
            note,
        });
    }

    let total = recs.len();
    let pass = recs.iter().filter(|t| t.verdict == RunVerdict::Ac).count();
    let all_pass = pass == total;

    if json_out {
        let tests_json: Vec<Value> = recs
            .iter()
            .map(|t| {
                json!({
                    "name": t.name,
                    "verdict": t.verdict.code(),
                    "ms": t.ms,
                    "input": cap_text(&t.input, 4000),
                    "expected": cap_text(&t.expected, 4000),
                    "got": cap_text(&t.got, 4000),
                    "stderr": cap_text(&t.stderr, 2000),
                    "note": t.note,
                })
            })
            .collect();
        println!(
            "{}",
            json!({
                "ok": true,
                "source": src_path.display().to_string(),
                "tl": tl_ms,
                "pass": pass,
                "total": total,
                "all": all_pass,
                "summary": if total == 0 { "EMPTY" } else if all_pass { "AC" } else { recs.iter().find(|t| t.verdict != RunVerdict::Ac).map(|t| t.verdict.code()).unwrap_or("WA") },
                "tests": tests_json,
            })
            .to_string()
        );
    } else {
        println!("{DIM}===================================================={RESET}");
        let summary_tag = if total == 0 {
            format!("{YELLOW}EMPTY{RESET}")
        } else if all_pass {
            format!("{GREEN}{BOLD}[✓] ACCEPTED — {}/{} test{RESET}", pass, total)
        } else {
            format!(
                "{RED}{BOLD}[✗] {}/{} test — đầu lỗi #{}: {}{RESET}",
                pass,
                total,
                recs
                    .iter()
                    .position(|t| t.verdict != RunVerdict::Ac)
                    .map(|i| i + 1)
                    .unwrap_or(0),
                recs.iter().find(|t| t.verdict != RunVerdict::Ac).map(|t| t.verdict.code()).unwrap_or("?")
            )
        };
        println!("⚖️ {}", summary_tag);
        if let Some(bad) = recs.iter().find(|t| !matches!(t.verdict, RunVerdict::Ac | RunVerdict::Skipped)) {
            println!("{DIM}----------------------------------------------------{RESET}");
            println!("{BOLD}Đầu vào ({}):{RESET}", bad.name);
            println!("{}", cap_text(bad.input.lines().take(40).collect::<Vec<&str>>().join("\n").as_str(), 4000));
            if !bad.stderr.trim().is_empty() {
                println!("{YELLOW}--- stderr (20 dòng) ---{RESET}");
                for line in bad.stderr.trim().lines().take(20) {
                    println!("{YELLOW}{}{RESET}", line);
                }
            }
            if bad.verdict != RunVerdict::Tle {
                println!("{RED}{BOLD}Output của bạn{RESET}");
                println!("{}", cap_text(bad.got.lines().take(40).collect::<Vec<&str>>().join("\n").as_str(), 4000));
                println!("{GREEN}{BOLD}Kết quả mong đợi{RESET}");
                println!("{}", cap_text(bad.expected.lines().take(40).collect::<Vec<&str>>().join("\n").as_str(), 4000));
            }
        }
        println!("{DIM}===================================================={RESET}");
    }

    fs::remove_file(&out_path).ok();
    fs::remove_file(&err_path).ok();
    if !all_pass {
        let _ = io::stdout().flush();
        std::process::exit(1);
    }
}

/// 🧪 drgx stress — sinh test ngẫu nhiên, so khớp solution với brute-force
/// Usage: drgx stress <sol.cpp> <brute.cpp> <gen.py> [--n 500] [--tl 2000]
fn cmd_stress(args: &[String]) {
    let mut n: usize = 500;
    let mut tl_ms: u128 = 2000;
    let mut pos: Vec<String> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--n" => {
                let value = args.get(i + 1).and_then(|v| v.parse::<usize>().ok());
                match value.filter(|v| (1..=10_000).contains(v)) {
                    Some(v) => n = v,
                    None => {
                        eprintln!("{RED}[!] --n phải là số từ 1 đến 10000.{RESET}");
                        std::process::exit(1);
                    }
                }
                i += 2;
                continue;
            }
            "--tl" => {
                let value = args.get(i + 1).and_then(|v| v.parse::<u128>().ok());
                match value.filter(|v| (100..=60_000).contains(v)) {
                    Some(v) => tl_ms = v,
                    None => {
                        eprintln!("{RED}[!] --tl phải là số từ 100 đến 60000 ms.{RESET}");
                        std::process::exit(1);
                    }
                }
                i += 2;
                continue;
            }
            "--" => {
                pos.extend(args[i + 1..].iter().cloned());
                break;
            }
            other if other.starts_with('-') => {
                eprintln!("{RED}[!] Tham số không hợp lệ: {}.{RESET}", other);
                std::process::exit(1);
            }
            other => pos.push(other.to_string()),
        }
        i += 1;
    }
    if pos.len() != 3 {
        eprintln!("{RED}[!] Usage: drgx stress <sol.cpp> <brute.cpp> <gen.py> [--n 500] [--tl 2000]{RESET}");
        std::process::exit(1);
    }
    let sol_path = PathBuf::from(&pos[0]);
    let brute_path = PathBuf::from(&pos[1]);
    let gen_path = PathBuf::from(&pos[2]);
    for (label, p) in [("solution", &sol_path), ("brute", &brute_path), ("gen", &gen_path)] {
        if !p.is_file() {
            eprintln!("{RED}[!] File {} '{}' không tồn tại hoặc không phải file!{RESET}", label, p.display());
            std::process::exit(1);
        }
    }
    let gxx = match find_gxx() {
        Some(p) => p,
        None => {
            eprintln!("{RED}[!] Không tìm thấy G++. Chạy 'drgx doctor' kiểm tra.{RESET}");
            std::process::exit(1);
        }
    };
    let python = match find_python() {
        Some(p) => p,
        None => {
            eprintln!("{RED}[!] Không tìm thấy Python (gen.py cần Python). Chạy 'drgx doctor'.{RESET}");
            std::process::exit(1);
        }
    };
    let (run_dir, _run_guard) = match make_run_dir("stress") {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{RED}[!] {}{RESET}", e);
            std::process::exit(1);
        }
    };
    let sol_exe = run_dir.join("sol.exe");
    let brute_exe = run_dir.join("brute.exe");

    println!("{BOLD}🧪 DRGX STRESS TESTER{RESET} — n={} · TL={}ms{RESET}", n, tl_ms);
    print!("{CYAN}[1/3] Biên dịch solution {}...{RESET}", sol_path.display());
    let _ = io::stdout().flush();
    if let Err(e) = compile_cpp(&gxx, &sol_path, &sol_exe.to_string_lossy()) {
        println!(" {RED}[LỖI]{RESET}\n{}", e.lines().take(15).collect::<Vec<&str>>().join("\n"));
        std::process::exit(1);
    }
    println!(" {GREEN}OK{RESET}");
    print!("{CYAN}[2/3] Biên dịch brute {}...{RESET}", brute_path.display());
    let _ = io::stdout().flush();
    if let Err(e) = compile_cpp(&gxx, &brute_path, &brute_exe.to_string_lossy()) {
        println!(" {RED}[LỖI]{RESET}\n{}", e.lines().take(15).collect::<Vec<&str>>().join("\n"));
        std::process::exit(1);
    }
    println!(" {GREEN}OK{RESET}");
    println!("{CYAN}[3/3] Quay vòng {} lần so khớp...{RESET} 💥 bấm Ctrl+C để dừng khi thấy dấu hiệu lỗi", n);

    let out_path = run_dir.join("stress_out.txt");
    let err_path = run_dir.join("stress_err.txt");
    let expect_path = run_dir.join("stress_expect.txt");
    let gen_out = run_dir.join("stress_gen.txt");
    let gen_in = run_dir.join("stress_gen_in.txt");
    let current_in = run_dir.join("current.in");
    let stress_in = PathBuf::from("stress.in");
    if let Err(e) = fs::write(&gen_in, b"") {
        eprintln!("{RED}[!] Không tạo được input cho gen.py: {}{RESET}", e);
        std::process::exit(1);
    }

    for it in 1..=n {
        let run_gen = run_child_files(
            {
                let mut c = python_command(&python);
                c.arg(&gen_path);
                c
            },
            &gen_in,
            &gen_out,
            &err_path,
            None,
            15_000,
        );
        if !matches!(run_gen.verdict, RunVerdict::Ac) {
            eprintln!(
                "{RED}[!] gen.py lỗi ở vòng {}: {}{RESET}",
                it,
                run_gen.verdict.code()
            );
            for line in run_gen.stderr.lines().take(15) {
                eprintln!("{YELLOW}{}{RESET}", line);
            }
            std::process::exit(1);
        }
        let data = match read_bytes_capped(&gen_out, MAX_TEST_BYTES) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("{RED}[!] Không đọc được dữ liệu gen.py ở vòng {}: {}{RESET}", it, e);
                std::process::exit(1);
            }
        };
        if data.iter().all(|b| b.is_ascii_whitespace()) {
            eprintln!("{RED}[!] gen.py không sinh ra dữ liệu ở vòng {}{RESET}", it);
            std::process::exit(1);
        }
        if let Err(e) = atomic_write(&current_in, &data) {
            eprintln!("{RED}[!] Không ghi được test tạm: {}{RESET}", e);
            std::process::exit(1);
        }

        let run_sol = run_child_files(
            Command::new(&sol_exe),
            &current_in,
            &out_path,
            &err_path,
            Some(&gxx),
            tl_ms,
        );
        if let RunVerdict::Tle | RunVerdict::Re | RunVerdict::Ole | RunVerdict::SpawnErr =
            run_sol.verdict
        {
            println!();
            println!("{RED}{BOLD}[💥] Solution tự lỗi ở vòng #{} · {}ms{RESET}", it, run_sol.ms);
            println!("     Verdict: {} · exit: {:?}", run_sol.verdict.code(), run_sol.exit_code);
            let se = run_sol.stderr.trim();
            if !se.is_empty() {
                for line in se.lines().take(15) {
                    println!("{YELLOW}    {}{RESET}", line);
                }
            }
            match atomic_write(&stress_in, &data) {
                Ok(()) => println!("{BOLD}Test gây lỗi giữ tại '{}'{RESET}", stress_in.display()),
                Err(e) => eprintln!("{YELLOW}[!] Không lưu được stress.in: {}{RESET}", e),
            }
            let _ = io::stdout().flush();
            std::process::exit(1);
        }

        let run_brute = run_child_files(
            Command::new(&brute_exe),
            &current_in,
            &expect_path,
            &err_path,
            Some(&gxx),
            tl_ms,
        );
        if !matches!(run_brute.verdict, RunVerdict::Ac) {
            println!();
            println!(
                "{YELLOW}[!] brute lỗi ở vòng #{} · verdict {}{RESET}",
                it,
                run_brute.verdict.code()
            );
            for line in run_brute.stderr.lines().take(15) {
                println!("{YELLOW}    {}{RESET}", line);
            }
            match atomic_write(&stress_in, &data) {
                Ok(()) => println!("   Test đang giữ tại '{}'", stress_in.display()),
                Err(e) => eprintln!("{YELLOW}   Không lưu được stress.in: {}{RESET}", e),
            }
            let _ = io::stdout().flush();
            std::process::exit(1);
        }

        let got = match read_text_capped(&out_path, MAX_OUTPUT_BYTES) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("{RED}[!] Không đọc được output solution: {}{RESET}", e);
                let _ = atomic_write(&stress_in, &data);
                std::process::exit(1);
            }
        };
        let exp = match read_text_capped(&expect_path, MAX_OUTPUT_BYTES) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("{RED}[!] Không đọc được output brute: {}{RESET}", e);
                let _ = atomic_write(&stress_in, &data);
                std::process::exit(1);
            }
        };
        if normalize(&got) != normalize(&exp) {
            println!();
            println!("{RED}{BOLD}[💥] BẮT ĐƯỢC COUNTEREXAMPLE ở vòng #{}!{RESET}", it);
            println!("{DIM}----------------------------------------------------{RESET}");
            match atomic_write(&stress_in, &data) {
                Ok(()) => println!("{BOLD}Input test gây lỗi — lưu tại '{}' và output từng bên:{RESET}", stress_in.display()),
                Err(e) => {
                    println!("{YELLOW}[!] Không lưu được stress.in: {}{RESET}", e);
                    println!("{BOLD}Input test gây lỗi — output từng bên:{RESET}");
                }
            }
            let text = String::from_utf8_lossy(&data);
            println!("{}", cap_text(&text, 4000));
            println!("{RED}{BOLD}--- Solution output ---{RESET}");
            println!("{}", cap_text(&got, 4000));
            println!("{GREEN}{BOLD}--- Brute output (đáp án chuẩn) ---{RESET}");
            println!("{}", cap_text(&exp, 4000));
            println!("{DIM}----------------------------------------------------{RESET}");
            println!("{BOLD}→ Copy '{}' thành tests/stress{}.in để rải vào bộ testcase chính thức!{RESET}", stress_in.display(), it);
            let _ = io::stdout().flush();
            std::process::exit(1);
        }
        if it % 50 == 0 || it == n {
            println!("{DIM}  ✓ vòng {}/{} còn đúng khớp{RESET}", it, n);
        }
    }

    println!("{GREEN}{BOLD}[✓] {} vòng · solution == brute-force. Sinh trắc nghiệm sạch bay — tự tin nộp nha!{RESET}", n);
}

fn cmd_cp(args: &[String]) {
    if args.is_empty() || args[0] == "list" {
        println!("{BOLD}CÁC THUẬT TOÁN CP CÓ SẴN TRONG DRGX:{RESET}");
        println!("  {CYAN}segtree{RESET}       Segment Tree (Point Update & Range Sum/Min/Max Query)");
        println!("  {CYAN}lazy_segtree{RESET}  Segment Tree với Lazy Propagation (Range Update)");
        println!("  {CYAN}rmq{RESET}           RMQ Sparse Table O(1) Range Minimum Query");
        println!("  {CYAN}dsu{RESET}           Disjoint Set Union (Path Compression & Union by Rank)");
        println!("  {CYAN}fenwick{RESET} / bit Binary Indexed Tree (BIT)");
        println!("  {CYAN}pref{RESET}          Prefix Sum 1D (Mảng cộng dồn 1 chiều)");
        println!("  {CYAN}pref2d{RESET}        Prefix Sum 2D (Mảng cộng dồn ma trận 2 chiều)");
        println!("  {CYAN}knapsack{RESET}      0/1 Knapsack DP (Quy hoạch động ba lô)");
        println!("  {CYAN}lis{RESET}           Longest Increasing Subsequence O(N log N)");
        println!("  {CYAN}lcs{RESET}           Longest Common Subsequence DP");
        println!("  {CYAN}binpow{RESET}        Binary Exponentiation (Lũy thừa nhanh chia để trị)");
        println!("  {CYAN}sieve{RESET}         Sieve of Eratosthenes (Sàng số nguyên tố)");
        println!("  {CYAN}dijkstra{RESET}      Dijkstra Shortest Path O(M log N)");
        println!("  {CYAN}bfs{RESET}           Breadth-First Search (Loang đồ thị)");
        println!("  {CYAN}binsearch{RESET}     Binary Search on Answer (Chặt nhị phân kết quả)");
        println!("  {CYAN}fastio{RESET}        C++ Fast I/O Optimization");
        println!();
        println!("{BOLD}Cách dùng:{RESET} drgx cp <tên> [-o file.cpp]");
        return;
    }

    let algo = &args[0];
    let mut out_file = None;
    if args.len() >= 3 && args[1] == "-o" {
        out_file = Some(&args[2]);
    }

    let code = match algo.to_lowercase().as_str() {
        "segtree" => r#"struct SegTree {
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
};"#,
        "lazy_segtree" => r#"struct LazySegTree {
    int n;
    vector<long long> tree, lazy;
    LazySegTree(int n) : n(n), tree(4 * n, 0), lazy(4 * n, 0) {}
    void push(int id, int l, int r) {
        if (lazy[id] == 0) return;
        int mid = (l + r) / 2;
        tree[2 * id] += lazy[id] * (mid - l + 1);
        lazy[2 * id] += lazy[id];
        tree[2 * id + 1] += lazy[id] * (r - mid);
        lazy[2 * id + 1] += lazy[id];
        lazy[id] = 0;
    }
    void update(int id, int l, int r, int ql, int qr, long long val) {
        if (ql <= l && r <= qr) {
            tree[id] += val * (r - l + 1);
            lazy[id] += val;
            return;
        }
        push(id, l, r);
        int mid = (l + r) / 2;
        if (ql <= mid) update(2 * id, l, mid, ql, qr, val);
        if (qr > mid) update(2 * id + 1, mid + 1, r, ql, qr, val);
        tree[id] = tree[2 * id] + tree[2 * id + 1];
    }
    long long query(int id, int l, int r, int ql, int qr) {
        if (ql <= l && r <= qr) return tree[id];
        push(id, l, r);
        int mid = (l + r) / 2;
        long long res = 0;
        if (ql <= mid) res += query(2 * id, l, mid, ql, qr);
        if (qr > mid) res += query(2 * id + 1, mid + 1, r, ql, qr);
        return res;
    }
};"#,
        "rmq" | "sparse" => r#"struct RMQ {
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
};"#,
        "dsu" | "unionfind" => r#"struct DSU {
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
};"#,
        "fenwick" | "bit" => r#"struct Fenwick {
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
};"#,
        "pref" | "prefix" => r#"vector<long long> pref(n + 1, 0);
for (int i = 0; i < n; i++) {
    pref[i + 1] = pref[i] + a[i];
}
auto query = [&](int l, int r) -> long long {
    return pref[r + 1] - pref[l];
};"#,
        "pref2d" => r#"vector<vector<long long>> pref(n + 1, vector<long long>(m + 1, 0));
for (int i = 0; i < n; i++) {
    for (int j = 0; j < m; j++) {
        pref[i + 1][j + 1] = pref[i][j + 1] + pref[i + 1][j] - pref[i][j] + a[i][j];
    }
}
auto get_sum = [&](int r1, int c1, int r2, int c2) -> long long {
    return pref[r2 + 1][c2 + 1] - pref[r1][c2 + 1] - pref[r2 + 1][c1] + pref[r1][c1];
};"#,
        "knapsack" => r#"vector<long long> dp(W + 1, 0);
for (int i = 0; i < n; i++) {
    for (int w = W; w >= weight[i]; w--) {
        dp[w] = max(dp[w], dp[w - weight[i]] + value[i]);
    }
}"#,
        "lis" => r#"vector<int> lis;
for (int x : a) {
    auto it = lower_bound(lis.begin(), lis.end(), x);
    if (it == lis.end()) lis.push_back(x);
    else *it = x;
}
int ans = lis.size();"#,
        "lcs" => r#"vector<vector<int>> dp(n + 1, vector<int>(m + 1, 0));
for (int i = 0; i < n; i++) {
    for (int j = 0; j < m; j++) {
        if (s[i] == t[j]) dp[i + 1][j + 1] = dp[i][j] + 1;
        else dp[i + 1][j + 1] = max(dp[i][j + 1], dp[i + 1][j]);
    }
}"#,
        "binpow" => r#"long long binpow(long long a, long long b, long long m = 1e9 + 7) {
    long long res = 1;
    a %= m;
    while (b > 0) {
        if (b & 1) res = (__int128)res * a % m;
        a = (__int128)a * a % m;
        b >>= 1;
    }
    return res;
}"#,
        "sieve" => r#"const int MAXN = 1e6 + 5;
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
}"#,
        "dijkstra" => r#"vector<long long> dist(n + 1, 1e18);
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
}"#,
        "bfs" => r#"vector<int> dist(n + 1, -1);
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
}"#,
        "binsearch" => r#"long long low = 1, high = 1e18, ans = -1;
while (low <= high) {
    long long mid = low + (high - low) / 2;
    if (check(mid)) {
        ans = mid;
        low = mid + 1;
    } else {
        high = mid - 1;
    }
}"#,
        "fastio" => r#"ios_base::sync_with_stdio(false);
cin.tie(NULL);"#,
        _ => {
            eprintln!("{RED}[!] Thuật toán '{}' không tìm thấy. Gõ 'drgx cp list' để xem danh sách.{RESET}", algo);
            return;
        }
    };

    if let Some(target) = out_file {
        if let Err(e) = fs::write(target, code) {
            eprintln!("{RED}[!] Không ghi được file '{}': {}{RESET}", target, e);
        } else {
            println!("{GREEN}{BOLD}✓ Đã ghi template '{}' vào file: {}{RESET}", algo, target);
        }
    } else {
        println!("{BOLD}{CYAN}// === Template: {} ==={RESET}", algo);
        println!("{}", code);
    }
}

fn search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(home) = env::var("DRGX_HOME") {
        if !home.trim().is_empty() {
            roots.push(PathBuf::from(home));
        }
    }
    if let Ok(cwd) = env::current_dir() {
        roots.push(cwd.clone());
        if let Some(parent) = cwd.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            let mut cur = Some(dir);
            for _ in 0..5 {
                if let Some(d) = cur {
                    roots.push(d.to_path_buf());
                    cur = d.parent();
                }
            }
        }
    }
    roots
}

fn find_relative_file(rel: &str) -> Option<PathBuf> {
    for root in search_roots() {
        let p = root.join(rel);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn find_ide_exe() -> Option<PathBuf> {
    if let Ok(p) = env::var("DRGX_IDE_EXE") {
        let p = PathBuf::from(p.trim().trim_matches('"'));
        if p.is_file() {
            return Some(p);
        }
    }
    // Chỉ tìm cạnh executable đã cài hoặc trong thư mục cài chuẩn. Không bao
    // giờ chạy drgx-ide.exe từ thư mục dự án hiện tại (có thể bị cài mã độc).
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("drgx-ide.exe"));
            candidates.push(dir.join("..\\drgx-ide.exe"));
            candidates.push(dir.join("..\\..\\drgx-ide.exe"));
            candidates.push(dir.join("..\\..\\..\\app\\src-tauri\\target\\release\\drgx-ide.exe"));
        }
    }
    let local = env::var("LOCALAPPDATA").unwrap_or_default();
    let prog = env::var("ProgramFiles").unwrap_or_default();
    for base in [&local, &prog] {
        if base.is_empty() {
            continue;
        }
        for rel in [
            "Programs\\DrgX\\drgx-ide.exe",
            "DrgX\\drgx-ide.exe",
            "DrgX IDE\\drgx-ide.exe",
            "Programs\\Microsoft VS Code\\Code.exe",
            "Microsoft VS Code\\Code.exe",
        ] {
            candidates.push(PathBuf::from(base).join(rel));
        }
    }
    candidates.into_iter().find(|p| p.is_file())
}

fn open_local_path(path: &Path) -> bool {
    let mut cmd = Command::new(system_exe("rundll32.exe"));
    cmd.arg("url.dll,FileProtocolHandler").arg(path);
    match cmd.spawn() {
        Ok(_) => true,
        Err(e) => {
            eprintln!("{RED}[!] Không mở được trình duyệt: {}{RESET}", e);
            false
        }
    }
}

fn find_ecosystem_page() -> Option<PathBuf> {
    find_relative_file("web\\ecosystem\\index.html")
}

fn find_studio_exe() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("drgx-studio.exe"));
            candidates.push(dir.join("..\\drgx-studio.exe"));
            candidates.push(dir.join("..\\..\\drgx-studio.exe"));
            candidates.push(dir.join("..\\..\\..\\drgx-studio.exe"));
            candidates.push(dir.join("..\\..\\..\\app\\src-tauri\\target\\release\\drgx-studio.exe"));
        }
    }
    candidates.push(PathBuf::from("D:\\Dev\\vietcode\\app\\src-tauri\\target\\release\\drgx-studio.exe"));
    candidates.push(PathBuf::from("D:\\Dev\\vietcode\\drgx-studio.exe"));
    candidates.into_iter().find(|p| p.is_file())
}

fn cmd_oj() {
    let oj_cmd = PathBuf::from("D:\\Dev\\vietcode\\products\\void-bit\\run-void-bit.cmd");
    if oj_cmd.is_file() {
        let _ = Command::new(system_exe("cmd.exe"))
            .args(["/C", &oj_cmd.to_string_lossy()])
            .status();
    } else {
        eprintln!("{RED}[!] Không tìm thấy run-void-bit.cmd{RESET}");
    }
}

fn cmd_verify() {
    if let Some(py) = find_python() {
        let script = PathBuf::from("D:\\Dev\\vietcode\\scripts\\verify_ecosystem.py");
        if script.is_file() {
            let status = python_command(&py).arg(&script).status();
            std::process::exit(status.ok().and_then(|s| s.code()).unwrap_or(1));
        }
    }
    eprintln!("{RED}[!] Không tìm thấy verify_ecosystem.py{RESET}");
    std::process::exit(1);
}

fn cmd_start_services() {
    let script = PathBuf::from("D:\\Dev\\vietcode\\scripts\\demo-doctor.ps1");
    if script.is_file() {
        let _ = Command::new(system_exe("WindowsPowerShell\\v1.0\\powershell.exe"))
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", &script.to_string_lossy(), "-StartServers"])
            .status();
    }
}

fn cmd_studio(args: &[String]) {
    if let Some(exe) = find_studio_exe() {
        let is_blocking = args
            .iter()
            .any(|a| a == "--version" || a == "-V" || a == "--headless-server");
        if is_blocking {
            let status = Command::new(&exe).args(args).status();
            std::process::exit(status.ok().and_then(|s| s.code()).unwrap_or(0));
        }
        println!(
            "{GREEN}{BOLD}Khởi chạy ứng dụng Tauri v2 DrgX Studio ({})...{RESET}",
            exe.display()
        );
        match Command::new(&exe).args(args).spawn() {
            Ok(_) => {}
            Err(e) => {
                eprintln!("{RED}[!] Lỗi chạy DrgX Studio: {}{RESET}", e);
                std::process::exit(1);
            }
        }
    } else {
        eprintln!("{RED}[!] Không tìm thấy drgx-studio.exe.{RESET}");
        std::process::exit(1);
    }
}

fn cmd_ide(args: &[String]) {
    let path = args.get(0).map(|s| s.as_str()).unwrap_or(".");
    let target = fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));

    match find_ide_exe() {
        Some(exe) => {
            println!("{GREEN}{BOLD}Khởi chạy DrgX IDE tại: {}{RESET}", target.display());
            match Command::new(exe).arg(target).spawn() {
                Ok(_) => {}
                Err(e) => {
                    eprintln!("{RED}[!] Không khởi chạy được DrgX IDE: {}{RESET}", e);
                    std::process::exit(1);
                }
            }
        }
        None => {
            eprintln!(
                "{RED}[!] Chưa tìm thấy drgx-ide.exe. Đặt DRGX_IDE_EXE trỏ tới bản cài DrgX.{RESET}"
            );
            std::process::exit(1);
        }
    }
}

fn cmd_web() {
    match find_relative_file("web\\intro\\drgx-intro.html") {
        Some(path) => {
            println!("{GREEN}{BOLD}Mở DrgX Web Showcase trên trình duyệt...{RESET}");
            if !open_local_path(&path) {
                std::process::exit(1);
            }
        }
        None => {
            eprintln!("{RED}[!] Không tìm thấy web/intro/drgx-intro.html{RESET}");
            std::process::exit(1);
        }
    }
}

const ECOSYSTEM_HTML: &str = include_str!("../../web/ecosystem/index.html");
const ECOSYSTEM_LOGO: &[u8] = include_bytes!("../../web/assets/logo.png");

/// CLI cài bằng `cargo install` không có thư mục `web/`; giải nén bản nhúng
/// vào state của DrgX để `drgx learn` luôn mở được.
fn extract_ecosystem_page() -> Option<PathBuf> {
    let base = env::var("APPDATA")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
        .join("vn.drgx.ide")
        .join("ecosystem");
    fs::create_dir_all(&base).ok()?;
    let page = base.join("index.html");
    fs::write(&page, ECOSYSTEM_HTML).ok()?;
    fs::write(base.join("logo.png"), ECOSYSTEM_LOGO).ok()?;
    Some(page)
}

fn cmd_learn() {
    match find_ecosystem_page().or_else(extract_ecosystem_page) {
        Some(path) => {
            println!("{GREEN}{BOLD}Mở Hệ sinh thái DrgX...{RESET}");
            println!("{DIM}Lộ trình học · câu lạc bộ · showcase · mentor{RESET}");
            if !open_local_path(&path) {
                std::process::exit(1);
            }
        }
        None => {
            eprintln!("{RED}[!] Không tìm thấy web/ecosystem/index.html và không giải nén được bản nhúng{RESET}");
            std::process::exit(1);
        }
    }
}

fn cmd_doctor() {
    println!("{BOLD}DRGX SYSTEM DIAGNOSTIC (DOCTOR):{RESET}");
    println!("{DIM}----------------------------------------{RESET}");

    // 1. G++
    match find_gxx() {
        Some(p) => {
            let mut cmd = Command::new(&p);
            setup_toolchain_env(&mut cmd, &p);
            let ver = cmd.arg("--version").output();
            let v_str = ver.map(|o| String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").to_string()).unwrap_or_default();
            println!("{GREEN}[✓] G++ Compiler:{RESET} {} ({})", p.display(), v_str);
        }
        None => println!("{RED}[✗] G++ Compiler: Không tìm thấy! (Cần cài đặt MinGW / MSYS2 UCRT64){RESET}"),
    }

    // 2. Python
    match find_python() {
        Some(p) => {
            let mut c = python_command(&p);
            let out = c.arg("--version").output();
            let v = out
                .map(|o| {
                    let text = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    if text.is_empty() {
                        String::from_utf8_lossy(&o.stderr).trim().to_string()
                    } else {
                        text
                    }
                })
                .unwrap_or_default();
            println!("{GREEN}[✓] Python:{RESET} {} ({})", p.display(), v);
        }
        None => println!("{YELLOW}[-] Python: Không tìm thấy trong PATH{RESET}"),
    }

    // 3. Node.js — không bao giờ chạy 'node' trần từ CWD.
    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let mut node_candidates = Vec::new();
    if !local_appdata.is_empty() {
        node_candidates.push(PathBuf::from(&local_appdata).join("Programs\\nodejs\\node.exe"));
    }
    if let Some(p) = find_on_path(&["node.exe"]) {
        node_candidates.push(p);
    }
    let mut node_found = false;
    for n in &node_candidates {
        if let Ok(out) = Command::new(n).arg("--version").output() {
            if out.status.success() {
                let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
                println!("{GREEN}[✓] Node.js:{RESET} {} ({})", n.display(), v);
                node_found = true;
                break;
            }
        }
    }
    if !node_found {
        println!("{YELLOW}[-] Node.js: Không tìm thấy{RESET}");
    }

    // 4. DrgX IDE binary
    match find_ide_exe() {
        Some(path) => println!("{GREEN}[✓] DrgX IDE Binary:{RESET} Sẵn sàng ({})", path.display()),
        None => println!("{YELLOW}[-] DrgX IDE Binary: Chưa tìm thấy (đặt DRGX_IDE_EXE hoặc cài DrgX IDE){RESET}"),
    }

    // 5. DrgX Studio Extension
    let mut ext_installed = None;
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let ext_dirs = [
        format!("{}\\.vscode-server\\extensions", home),
        format!("{}\\.vscode\\extensions", home),
    ];
    for ed in &ext_dirs {
        if let Ok(entries) = std::fs::read_dir(ed) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with("drgx.drgx-copilot-") {
                    let ver = name.trim_start_matches("drgx.drgx-copilot-").to_string();
                    ext_installed = Some((ver, e.path().to_string_lossy().to_string()));
                    break;
                }
            }
        }
        if ext_installed.is_some() {
            break;
        }
    }

    if let Some((ver, path)) = ext_installed {
        println!("{GREEN}[✓] Copilot & CP Extension:{RESET} Đã cài đặt (v{}) tại {}", ver, path);
    } else {
        println!("{YELLOW}[-] Copilot & CP Extension: Chưa cài đặt{RESET}");
    }

    // 6. Hệ sinh thái DrgX — bản cài từ cargo không có thư mục web/ vẫn có
    // trang nhúng; doctor phản ánh đúng khả năng mở `drgx learn`.
    let ecosystem = find_ecosystem_page().or_else(extract_ecosystem_page);
    if let Some(page) = ecosystem {
        println!("{GREEN}[✓] DrgX Ecosystem:{RESET} Sẵn sàng ({})", page.display());
    } else {
        println!("{YELLOW}[-] DrgX Ecosystem: Không tìm thấy trang web và không giải nén được bản nhúng{RESET}");
    }

    println!("{DIM}----------------------------------------{RESET}");
    println!("{BOLD}Kiểm tra hoàn tất. Cài thêm các mục [✗]/[-] nếu bạn cần dùng tính năng tương ứng.{RESET}");
}

fn cmd_status() {
    println!("{CROWN}{BOLD}╔══════════════════════════════════════════════════════════════════════╗{RESET}");
    println!("{CROWN}{BOLD}║         ⚡  DRGX LOCAL-FIRST ECOSYSTEM · TRẠNG THÁI KIẾN TRÚC        ║{RESET}");
    println!("{CROWN}{BOLD}╚══════════════════════════════════════════════════════════════════════╝{RESET}");
    println!("{GOLD} ★ Kiến trúc lõi      : {BOLD}Dual-Profile Isolation (Học có AI · Thi sạch AI){RESET}");
    println!("{GOLD} ★ Tốc độ chấm F9     :{RESET} {GREEN}{BOLD}< 0.5s Offline Multi-Test Judge (C++17 & Python 3){RESET}");
    println!("{GOLD} ★ Động cơ kiểm thử   :{RESET} {CYAN}{BOLD}Differential Stress Tester 3 cột & Winnowing AST{RESET}");
    println!("{GOLD} ★ Phòng thi nội bộ   :{RESET} {GREEN}{BOLD}Exam Server LAN :8765 · Tương thích chuẩn Themis{RESET}");
    println!();
    println!("{DIM}Toàn bộ mã nguồn và dữ liệu chấm bài được xử lý cục bộ 100% tại trường học.{RESET}");
    println!();
}

fn main() {
    init_windows_vt();

    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        print_help();
        return;
    }

    match args[0].as_str() {
        "help" | "--help" | "-h" => print_help(),
        "version" | "-v" | "--version" => {
            println!("drgx version {}", VERSION);
        }
        "init" => cmd_init(&args[1..]),
        "run" => cmd_run(&args[1..]),
        "test" => cmd_test(&args[1..]),
        "tests" => cmd_tests(&args[1..]),
        "stress" => cmd_stress(&args[1..]),
        "profile" => cmd_profile(&args[1..]),
        "cp" => cmd_cp(&args[1..]),
        "ide" => cmd_ide(&args[1..]),
        "studio" | "app" => cmd_studio(&args[1..]),
        "oj" => cmd_oj(),
        "verify" => cmd_verify(),
        "start" => cmd_start_services(),
        "web" => cmd_web(),
        "learn" => cmd_learn(),
        "doctor" => cmd_doctor(),
        "status" | "info" => cmd_status(),
        _ => {
            eprintln!("{RED}[!] Lệnh không hợp lệ: '{}'{RESET}", args[0]);
            println!("Gõ '{CYAN}drgx help{RESET}' để xem danh sách lệnh hỗ trợ.");
            std::process::exit(2);
        }
    }
}

// ============================================================================
// 📈 drgx profile — Đo độ phức tạp thực nghiệm O(N^k) + Peak Working Set
// ============================================================================
const DRGX_PROFILE_HARNESS: &str = r####"#include <bits/stdc++.h>
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
        } while (reps < cap && (forceReps > 0 ? reps < cap : total < 12000.0));
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
        int reps = forceReps > 0 ? forceReps : (int)ceil(12000.0 / max(u1, 1.0));
        if (reps < 1) reps = 1;
        if (reps > 200) reps = 200;
        double us = reps > 1 ? timeReps(reps) : u1;
        emit(us, reps);
    }
    return 0;
}
"####;

const DRGX_PROFILE_PY: &str = r####"import sys, io, os, time

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
"####;

#[derive(Clone, Debug)]
struct ProfilePoint {
    n: u64,
    time_us: f64,
    peak_kb: Option<u64>,
    verdict: String,
    reps: u32,
}

#[derive(Clone, Debug)]
struct ProfileRegression {
    valid: bool,
    k: f64,
    c: f64,
    r2: f64,
    complexity: String,
}

fn profile_classify(k: f64) -> &'static str {
    if !k.is_finite() {
        "Không xác định"
    } else if k < 0.25 {
        "O(1)"
    } else if k < 0.6 {
        "O(log N)"
    } else if k < 1.15 {
        "O(N)"
    } else if k < 1.55 {
        "O(N log N)"
    } else if k < 2.4 {
        "O(N^2)"
    } else {
        "O(N^3)"
    }
}

fn profile_regression(points: &[ProfilePoint]) -> ProfileRegression {
    let valid: Vec<&ProfilePoint> = points
        .iter()
        .filter(|p| p.verdict == "OK" && p.time_us > 0.0 && p.n > 1)
        .collect();
    if valid.len() < 2 {
        return ProfileRegression {
            valid: false,
            k: f64::NAN,
            c: f64::NAN,
            r2: 0.0,
            complexity: "Không xác định".to_string(),
        };
    }
    let xs: Vec<f64> = valid.iter().map(|p| (p.n as f64).log2()).collect();
    let ys: Vec<f64> = valid.iter().map(|p| p.time_us.max(0.001).log2()).collect();
    let n = xs.len() as f64;
    let mx = xs.iter().sum::<f64>() / n;
    let my = ys.iter().sum::<f64>() / n;
    let mut num = 0.0;
    let mut den = 0.0;
    for i in 0..xs.len() {
        num += (xs[i] - mx) * (ys[i] - my);
        den += (xs[i] - mx) * (xs[i] - mx);
    }
    let k = if den == 0.0 { 0.0 } else { num / den };
    let c = my - k * mx;
    let mut ss_res = 0.0;
    let mut ss_tot = 0.0;
    for i in 0..xs.len() {
        let pred = k * xs[i] + c;
        ss_res += (ys[i] - pred) * (ys[i] - pred);
        ss_tot += (ys[i] - my) * (ys[i] - my);
    }
    let r2 = if ss_tot == 0.0 {
        1.0
    } else {
        (1.0 - ss_res / ss_tot).clamp(0.0, 1.0)
    };
    ProfileRegression {
        valid: true,
        k,
        c,
        r2,
        complexity: profile_classify(k).to_string(),
    }
}

fn profile_project_ms(k: f64, c: f64, n: f64) -> (f64, bool) {
    let lg = k * n.log2() + c;
    if !lg.is_finite() {
        return (f64::INFINITY, true);
    }
    if lg > 60.0 {
        return ((2f64.powi(60)) / 1000.0, true);
    }
    ((2f64.powf(lg)) / 1000.0, false)
}

fn profile_gen_input(n: u64) -> String {
    let mut seed: u64 = 123_456_789u64.wrapping_add(n);
    let mut out = String::with_capacity((n as usize) * 10 + 16);
    out.push_str(&n.to_string());
    out.push('\n');
    for i in 0..n {
        seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345) % 2_147_483_648;
        if i > 0 {
            out.push(' ');
        }
        out.push_str(&(seed % 1_000_000_000).to_string());
    }
    out.push('\n');
    out
}

fn parse_profile_time(path: &Path) -> Option<(f64, u32)> {
    let text = fs::read_to_string(path).ok()?;
    let idx = text.find("time_us=")?;
    let rest = &text[idx + 8..];
    let mut it = rest.split_whitespace();
    let us: f64 = it.next()?.parse().ok()?;
    let reps_part = it.next().unwrap_or("reps=1");
    let reps: u32 = reps_part.trim_start_matches("reps=").parse().unwrap_or(1);
    if us > 0.0 {
        Some((us, reps))
    } else {
        None
    }
}

#[cfg(windows)]
fn profile_peak_ws(handle: *mut std::ffi::c_void) -> Option<u64> {
    use windows_sys::Win32::System::ProcessStatus::{
        K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
    };
    let mut info: PROCESS_MEMORY_COUNTERS = unsafe { std::mem::zeroed() };
    info.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
    let ok = unsafe {
        K32GetProcessMemoryInfo(handle, &mut info, info.cb)
    };
    if ok != 0 && info.PeakWorkingSetSize > 0 {
        Some(info.PeakWorkingSetSize as u64)
    } else {
        None
    }
}

#[cfg(not(windows))]
fn profile_peak_ws(_handle: ()) -> Option<u64> {
    None
}

#[cfg(windows)]
fn profile_spawn_no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000);
}

#[cfg(not(windows))]
fn profile_spawn_no_window(_cmd: &mut Command) {}

fn profile_run_child(
    exe: &Path,
    args: &[String],
    cwd: &Path,
    timeout: std::time::Duration,
) -> (Option<i32>, bool, Option<u64>) {
    let mut cmd = Command::new(exe);
    cmd.args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    profile_spawn_no_window(&mut cmd);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => return (None, false, None),
    };
    let start = Instant::now();
    let mut peak: u64 = 0;
    let mut timed_out = false;
    let mut code: Option<i32> = None;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                code = status.code();
                break;
            }
            Ok(None) => {}
            Err(_) => break,
        }
        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawHandle;
            let h = child.as_raw_handle() as *mut std::ffi::c_void;
            if let Some(p) = profile_peak_ws(h) {
                if p > peak {
                    peak = p;
                }
            }
        }
        if start.elapsed() > timeout {
            timed_out = true;
            let _ = child.kill();
            let _ = child.wait();
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(2));
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        let h = child.as_raw_handle() as *mut std::ffi::c_void;
        if let Some(p) = profile_peak_ws(h) {
            if p > peak {
                peak = p;
            }
        }
    }
    (code, timed_out, if peak > 0 { Some(peak) } else { None })
}

fn profile_fnvb(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

fn profile_gxx(
    gxx: &Path,
    args: &[String],
    cwd: &Path,
) -> Result<(), String> {
    let mut cmd = Command::new(gxx);
    setup_toolchain_env(&mut cmd, gxx);
    profile_spawn_no_window(&mut cmd);
    let out = cmd
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("không chạy được g++: {}", e))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

/// 📈 drgx profile <file.cpp|py> [--n 250,500,1000,2000,4000] [--gen gen.py] [--tl 5000] [--json]
fn cmd_profile(args: &[String]) {
    let mut file: Option<String> = None;
    let mut sizes: Vec<u64> = vec![250, 500, 1000, 2000, 4000];
    let mut generator: Option<String> = None;
    let mut time_limit_ms: u64 = 5000;
    let mut json_out = false;
    let mut repeats: u32 = 2;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--json" => json_out = true,
            "--n" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    let parsed: Vec<u64> = v
                        .split(',')
                        .filter_map(|x| x.trim().parse::<u64>().ok())
                        .filter(|x| *x >= 1 && *x <= 10_000_000)
                        .collect();
                    if parsed.len() >= 2 {
                        sizes = parsed;
                    }
                }
            }
            "--gen" => {
                i += 1;
                generator = args.get(i).cloned();
            }
            "--tl" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    time_limit_ms = v.parse().unwrap_or(5000).clamp(200, 20_000);
                }
            }
            "--repeats" => {
                i += 1;
                if let Some(v) = args.get(i) {
                    repeats = v.parse().unwrap_or(2).clamp(1, 5);
                }
            }
            other if other.starts_with("--") => {}
            other => file = Some(other.to_string()),
        }
        i += 1;
    }

    let file = match file {
        Some(f) => f,
        None => {
            eprintln!("{RED}[!] Vui lòng chỉ định tệp: drgx profile <file.cpp|py> [--n 250,500,...]{RESET}");
            std::process::exit(1);
        }
    };
    let path = Path::new(&file);
    if !path.is_file() {
        eprintln!("{RED}[!] Tệp '{}' không tồn tại!{RESET}", file);
        std::process::exit(1);
    }
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let is_py = ext == "py";
    if !is_py && !matches!(ext.as_str(), "cpp" | "cc" | "cxx" | "c") {
        eprintln!("{RED}[!] Profiler hỗ trợ .cpp/.cc/.cxx và .py{RESET}");
        std::process::exit(1);
    }
    sizes.sort_unstable();
    sizes.dedup();

    let code = fs::read_to_string(path).unwrap_or_default();
    if code.trim().is_empty() {
        eprintln!("{RED}[!] Tệp mã nguồn đang trống.{RESET}");
        std::process::exit(1);
    }

    let (run_dir, _guard) = match make_run_dir("profile") {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{RED}[!] {}{RESET}", e);
            std::process::exit(1);
        }
    };

    let force_reps: u32 = if code.contains("freopen(") || code.contains("os._exit") {
        1
    } else {
        0
    };

    let exe_path: PathBuf;
    let mut base_args: Vec<String> = Vec::new();
    let mut harness_mode: u32 = 0;

    if is_py {
        let python = match find_python() {
            Some(p) => p,
            None => {
                eprintln!("{RED}[!] Không tìm thấy Python 3 trong PATH.{RESET}");
                std::process::exit(1);
            }
        };
        let script = run_dir.join("solution.py");
        if let Err(e) = fs::write(&script, &code) {
            eprintln!("{RED}[!] Không ghi được tệp tạm: {}{RESET}", e);
            std::process::exit(1);
        }
        let wrapper = run_dir.join("drgx_py_profile.py");
        if let Err(e) = fs::write(&wrapper, DRGX_PROFILE_PY) {
            eprintln!("{RED}[!] Không ghi được wrapper: {}{RESET}", e);
            std::process::exit(1);
        }
        exe_path = python;
        base_args = vec![
            wrapper.display().to_string(),
            script.display().to_string(),
        ];
    } else {
        let gxx = match find_gxx() {
            Some(g) => g,
            None => {
                eprintln!("{RED}[!] Không tìm thấy g++ (MSYS2 UCRT64 / MinGW).{RESET}");
                std::process::exit(1);
            }
        };
        let src = run_dir.join("solution.cpp");
        if let Err(e) = fs::write(&src, &code) {
            eprintln!("{RED}[!] Không ghi được tệp tạm: {}{RESET}", e);
            std::process::exit(1);
        }
        let obj = run_dir.join("solution.o");
        let sol_args = vec![
            "-std=c++17".to_string(),
            "-O2".to_string(),
            "-pipe".to_string(),
            "-c".to_string(),
            src.display().to_string(),
            "-Dmain=drgx_user_main".to_string(),
            "-o".to_string(),
            obj.display().to_string(),
        ];
        if let Err(e) = profile_gxx(&gxx, &sol_args, &run_dir) {
            eprintln!("{RED}{BOLD}[CE] Biên dịch thất bại:{RESET}");
            eprintln!("{}", e);
            std::process::exit(1);
        }
        let cache = env::temp_dir().join("drgx-profile-cache");
        let _ = fs::create_dir_all(&cache);
        let harness_obj = cache.join(format!("harness-{:x}.o", profile_fnvb(DRGX_PROFILE_HARNESS)));
        if !harness_obj.is_file() {
            let hsrc = cache.join(format!("harness-{:x}.cpp", profile_fnvb(DRGX_PROFILE_HARNESS)));
            if let Err(e) = fs::write(&hsrc, DRGX_PROFILE_HARNESS) {
                eprintln!("{RED}[!] Không ghi được harness: {}{RESET}", e);
                std::process::exit(1);
            }
            let h_args = vec![
                "-std=c++17".to_string(),
                "-O2".to_string(),
                "-pipe".to_string(),
                "-c".to_string(),
                hsrc.display().to_string(),
                "-o".to_string(),
                harness_obj.display().to_string(),
            ];
            if let Err(e) = profile_gxx(&gxx, &h_args, &cache) {
                eprintln!("{RED}[!] Không biên dịch được profiler harness:{RESET}\n{}", e);
                std::process::exit(1);
            }
        }
        let exe = run_dir.join("solution_profile.exe");
        let link_args = vec![
            "-std=c++17".to_string(),
            "-O2".to_string(),
            obj.display().to_string(),
            harness_obj.display().to_string(),
            "-o".to_string(),
            exe.display().to_string(),
        ];
        if let Err(e) = profile_gxx(&gxx, &link_args, &run_dir) {
            eprintln!("{RED}{BOLD}[CE] Liên kết thất bại:{RESET}");
            eprintln!("{}", e);
            std::process::exit(1);
        }
        exe_path = exe;
        let uses_c_stdio = ["scanf(", "printf(", "gets(", "fgets(", "getchar(", "puts(", "freopen(", "fopen("]
            .iter()
            .any(|p| code.contains(p));
        let uses_iostream = code.contains("cin") || code.contains("cout") || code.contains("cerr");
        harness_mode = if uses_c_stdio && !uses_iostream { 1 } else { 0 };
    }

    let python_for_gen = find_python();
    if !json_out {
        println!();
        println!("{GOLD}{BOLD}📈 DRGX EMPIRICAL COMPLEXITY PROFILER{RESET}");
        println!(
            "{DIM}File: {}{RESET} · {}{}",
            file,
            if is_py { "Python 3" } else { "C++17" },
            if is_py { "" } else if harness_mode == 1 { " · stdio-loop harness" } else { " · iostream-loop harness" }
        );
    }

    let mut points: Vec<ProfilePoint> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut generator_error: Option<String> = None;

    for n in &sizes {
        let input_path = run_dir.join(format!("input_{}.txt", n));
        let input = if let Some(gen) = &generator {
            match (python_for_gen.as_ref(), Path::new(gen).is_file()) {
                (Some(py), true) => {
                    let mut cmd = python_command(py);
                    profile_spawn_no_window(&mut cmd);
                    match cmd
                        .arg(gen)
                        .arg(n.to_string())
                        .current_dir(&run_dir)
                        .output()
                    {
                        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
                        Ok(o) => {
                            generator_error = Some(format!(
                                "Generator lỗi tại N={}: {}",
                                n,
                                String::from_utf8_lossy(&o.stderr).trim()
                            ));
                            break;
                        }
                        Err(e) => {
                            generator_error = Some(format!("Không chạy được generator: {}", e));
                            break;
                        }
                    }
                }
                _ => {
                    generator_error = Some(format!("Không tìm thấy generator '{}'", gen));
                    break;
                }
            }
        } else {
            profile_gen_input(*n)
        };
        if let Err(e) = fs::write(&input_path, &input) {
            warnings.push(format!("Không ghi được input N={}: {}", n, e));
            continue;
        }

        let mut best: Option<f64> = None;
        let mut best_reps: u32 = 0;
        let mut peak_kb: Option<u64> = None;
        let mut last_code: Option<i32> = None;
        let mut all_timeout = true;
        for r in 0..repeats {
            let time_file = run_dir.join(format!("time_{}_{}.txt", n, r));
            let _ = fs::remove_file(&time_file);
            let mut run_args: Vec<String> = if is_py {
                base_args.clone()
            } else {
                vec![harness_mode.to_string()]
            };
            run_args.push(input_path.display().to_string());
            run_args.push(time_file.display().to_string());
            run_args.push(force_reps.to_string());
            let (code, timed_out, peak) = profile_run_child(
                &exe_path,
                &run_args,
                &run_dir,
                std::time::Duration::from_millis(time_limit_ms),
            );
            if peak.is_some() {
                peak_kb = Some(peak.unwrap() / 1024);
            }
            if !timed_out {
                all_timeout = false;
            }
            if let Some((us, reps)) = parse_profile_time(&time_file) {
                if best.map_or(true, |b| us < b) {
                    best = Some(us);
                    best_reps = reps;
                }
            }
            last_code = code;
        }

        let verdict = if best.is_none() && all_timeout {
            "TLE".to_string()
        } else if last_code == Some(0) {
            "OK".to_string()
        } else if is_py && best.is_none() {
            "RE".to_string()
        } else {
            "OK".to_string()
        };
        let time_us = best.unwrap_or(time_limit_ms as f64 * 1000.0);
        points.push(ProfilePoint {
            n: *n,
            time_us,
            peak_kb,
            verdict,
            reps: best_reps,
        });
        if !json_out {
            println!(
                "  {CYAN}N={:<7}{RESET} T={:<12} Peak={:<9} {}{}{RESET}",
                n,
                format!("{:.1} µs", time_us),
                peak_kb
                    .map(|k| format!("{} KB", k))
                    .unwrap_or_else(|| "—".to_string()),
                if best.is_some() { GREEN } else { RED },
                points.last().map(|p| p.verdict.clone()).unwrap_or_default()
            );
        }
    }

    if let Some(err) = generator_error {
        eprintln!("{RED}[!] {}{RESET}", err);
        std::process::exit(1);
    }
    if points.is_empty() {
        eprintln!("{RED}[!] Không thu được mẫu đo nào.{RESET}");
        std::process::exit(1);
    }

    let reg = profile_regression(&points);
    let ast_k = if code.contains("for") {
        let mut depth = 0i32;
        let mut max_depth = 0i32;
        for line in code.lines() {
            let opens = line.matches("for (").count() + line.matches("for(").count() + line.matches("while (").count();
            depth += opens as i32;
            max_depth = max_depth.max(depth);
            depth -= line.matches('}').count() as i32;
            depth = depth.max(0);
        }
        match max_depth {
            0 => 0.0,
            1 => 1.0,
            2 => 2.0,
            _ => 3.0,
        }
    } else {
        0.0
    };
    let (k_use, c_use) = if reg.valid {
        (reg.k, reg.c)
    } else {
        let k = ast_k;
        let c = points[0].time_us.max(0.001).log2() - k * (points[0].n as f64).log2();
        (k, c)
    };
    let (ms_1e5, of_1e5) = profile_project_ms(k_use, c_use, 100_000.0);
    let (ms_1e6, of_1e6) = profile_project_ms(k_use, c_use, 1_000_000.0);
    let tle_1e5 = ms_1e5 > 1000.0;
    let tle_1e6 = ms_1e6 > 1000.0;
    if tle_1e5 || tle_1e6 {
        warnings.push("Dự phóng vượt 1000 ms (TLE) ở ít nhất một mốc N lớn — cần tối ưu thuật toán hoặc Fast I/O.".to_string());
    }
    if !reg.valid {
        warnings.push("Không đủ mẫu OK để hồi quy; đang dùng heuristic từ AST.".to_string());
    }
    if reg.valid && reg.r2 < 0.9 {
        warnings.push(format!("R² = {:.4} < 0.90: mô hình chưa ổn định.", reg.r2));
    }
    if points.iter().any(|p| p.verdict == "TLE") {
        warnings.push("Có mẫu TLE bị loại khỏi hồi quy.".to_string());
    }
    if points.iter().any(|p| p.verdict == "RE") {
        warnings.push("Có mẫu RE bị loại khỏi hồi quy.".to_string());
    }

    if json_out {
        let pts: Vec<Value> = points
            .iter()
            .map(|p| {
                json!({
                    "n": p.n,
                    "timeUs": (p.time_us * 1000.0).round() / 1000.0,
                    "peakKb": p.peak_kb,
                    "verdict": p.verdict,
                    "harnessReps": if p.reps > 0 { json!(p.reps) } else { Value::Null }
                })
            })
            .collect();
        let out = json!({
            "ok": true,
            "file": file,
            "lang": if is_py { "Python 3" } else { "C++17" },
            "sizes": sizes,
            "points": pts,
            "regression": {
                "model": "log2 T(N) = k · log2 N + c",
                "k": (k_use * 1_000_000.0).round() / 1_000_000.0,
                "c": (c_use * 1_000_000.0).round() / 1_000_000.0,
                "r2": if reg.valid { (reg.r2 * 1_000_000.0).round() / 1_000_000.0 } else { 0.0 },
                "complexity": if reg.valid { reg.complexity.clone() } else { profile_classify(ast_k).to_string() },
                "confidence": if reg.valid {
                    if reg.r2 >= 0.98 { "cao" } else if reg.r2 >= 0.9 { "trung bình" } else { "thấp" }
                } else { "heuristic" }
            },
            "projections": {
                "n1e5": { "n": 100000, "timeMs": (ms_1e5 * 1000.0).round() / 1000.0, "tle": tle_1e5, "overflow": of_1e5 },
                "n1e6": { "n": 1000000, "timeMs": (ms_1e6 * 1000.0).round() / 1000.0, "tle": tle_1e6, "overflow": of_1e6 }
            },
            "warnings": warnings,
            "ruleCount": 71,
        });
        println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
        return;
    }

    println!();
    println!("{BOLD}HỒI QUY LOG-LOG:{RESET}");
    if reg.valid {
        println!(
            "  log2 T(N) = {GOLD}{BOLD}{:.4}{RESET} · log2 N + {:.4}",
            reg.k, reg.c
        );
        println!(
            "  R² = {}{:.6}{RESET}  →  {GOLD}{BOLD}{}{RESET}",
            if reg.r2 >= 0.98 { GREEN } else if reg.r2 >= 0.9 { YELLOW } else { RED },
            reg.r2,
            reg.complexity
        );
    } else {
        println!("  {YELLOW}Không đủ dữ liệu — dùng heuristic AST: {}{RESET}", profile_classify(ast_k));
    }
    println!();
    println!("{BOLD}DỰ PHÓNG TẠI N LỚN:{RESET}");
    println!(
        "  N = 10^5 : {}{}{RESET}  {}",
        if tle_1e5 { RED } else { GREEN },
        format!("{:.3} ms", ms_1e5),
        if tle_1e5 { "⚠️ TLE" } else { "✅ OK" }
    );
    println!(
        "  N = 10^6 : {}{}{RESET}  {}",
        if tle_1e6 { RED } else { GREEN },
        format!("{:.3} ms", ms_1e6),
        if tle_1e6 { "⚠️ TLE" } else { "✅ OK" }
    );
    for w in &warnings {
        println!("  {YELLOW}• {}{RESET}", w);
    }
    println!();
    println!("{DIM}Mẹo: dùng --n 1000,2000,4000,8000,16000 để tăng độ chính xác; --json để lấy máy đọc.{RESET}");
    println!();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_ecosystem_extracts_with_logo() {
        let page = extract_ecosystem_page().expect("extract ecosystem");
        assert!(page.is_file());
        let html = fs::read_to_string(&page).unwrap();
        assert!(html.contains("id=\"lo-trinh\""));
        assert!(page.with_file_name("logo.png").is_file());
        let _ = fs::remove_dir_all(page.parent().unwrap());
    }
}

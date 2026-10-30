use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Manager, RunEvent};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const WEB_PORT_DEFAULT: u16 = 80;
static WEB_PORT_STATE: std::sync::Mutex<u16> = std::sync::Mutex::new(WEB_PORT_DEFAULT);
static PROXY_PORT_STATE: std::sync::OnceLock<u16> = std::sync::OnceLock::new();
static WEB_SETUP_ERROR: std::sync::OnceLock<std::sync::Mutex<Option<String>>> =
    std::sync::OnceLock::new();
const WEB_PORTS_FALLBACK: &[u16] = &[8123, 8124, 8125, 8126, 8127];
const ICON_ICO_BYTES: &[u8] = include_bytes!("../icons/icon.ico");
// Bộ nhận diện DrgX thay cho logo/chữ ký VS Code trong workbench.
// Sinh lại bằng: python scripts/build_brand_assets.py
const BRAND_CODE_ICON_SVG: &[u8] = include_bytes!("../branding/code-icon.svg");
const BRAND_LETTERPRESS_DARK: &[u8] = include_bytes!("../branding/letterpress-dark.svg");
const BRAND_LETTERPRESS_HCDARK: &[u8] = include_bytes!("../branding/letterpress-hcDark.svg");
const BRAND_LETTERPRESS_LIGHT: &[u8] = include_bytes!("../branding/letterpress-light.svg");
const BRAND_LETTERPRESS_HCLIGHT: &[u8] = include_bytes!("../branding/letterpress-hcLight.svg");
const BRAND_CODE_192_PNG: &[u8] = include_bytes!("../branding/code-192.png");
const BRAND_CODE_512_PNG: &[u8] = include_bytes!("../branding/code-512.png");
// Tăng chuỗi này khi đổi asset để bỏ qua cache 1 năm của serve-web.
const BRAND_CACHE_BUST: &str = "drgx-brand-20261019";
static LOG_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
static BRIDGE_TOKEN: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn bridge_token_path() -> std::path::PathBuf {
    std::path::PathBuf::from(app_state_dir()).join("bridge-token")
}

fn bridge_token() -> String {
    BRIDGE_TOKEN
        .get_or_init(|| {
            let path = bridge_token_path();
            if let Ok(existing) = std::fs::read_to_string(&path) {
                let token = existing.trim().to_string();
                if token.len() >= 48 && token.chars().all(|c| c.is_ascii_hexdigit()) {
                    return token;
                }
            }
            let mut bytes = [0u8; 32];
            if getrandom::fill(&mut bytes).is_err() {
                // Fallback chỉ dùng khi CSPRNG của hệ điều hành không khả dụng.
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0);
                let seed = format!("{}:{}:{:p}", now, std::process::id(), &bytes);
                let mut hash = 0xcbf29ce484222325u64;
                for b in seed.as_bytes() {
                    hash ^= *b as u64;
                    hash = hash.wrapping_mul(0x100000001b3);
                }
                for (i, b) in bytes.iter_mut().enumerate() {
                    *b = ((hash >> ((i % 8) * 8)) & 0xff) as u8;
                }
            }
            let token: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&path, &token);
            token
        })
        .clone()
}

fn token_matches(candidate: &str) -> bool {
    let expected = bridge_token();
    if candidate.len() != expected.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in candidate.bytes().zip(expected.bytes()) {
        diff |= a ^ b;
    }
    diff == 0
}

fn web_port() -> u16 {
    *WEB_PORT_STATE.lock().unwrap_or_else(|p| p.into_inner())
}

fn web_url() -> String {
    if web_port() == 80 {
        "http://drgx.localhost".to_string()
    } else {
        format!("http://127.0.0.1:{}", web_port())
    }
}

fn setup_error_slot() -> &'static std::sync::Mutex<Option<String>> {
    WEB_SETUP_ERROR.get_or_init(|| std::sync::Mutex::new(None))
}

fn set_setup_error(message: Option<String>) {
    *setup_error_slot().lock().unwrap_or_else(|p| p.into_inner()) = message;
}

fn setup_error() -> Option<String> {
    setup_error_slot()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
}

fn proxy_setup_url() -> Option<String> {
    for _ in 0..30 {
        if let Some(port) = PROXY_PORT_STATE.get() {
            return Some(format!("http://127.0.0.1:{}/drgx/setup", port));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    None
}
const PANEL_WIDTH_DEFAULT: f64 = 480.0;
const PANEL_WIDTH_MIN: f64 = 320.0;
static PANEL_WIDTH_STATE: std::sync::Mutex<f64> = std::sync::Mutex::new(PANEL_WIDTH_DEFAULT);
static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

struct Servers(std::sync::Mutex<Vec<u32>>);
struct AgentPanel(std::sync::Mutex<Option<tauri::Webview>>);

static DAEMON_URL: std::sync::OnceLock<std::sync::Mutex<Option<String>>> =
    std::sync::OnceLock::new();
static AGENT_COOKIE: std::sync::OnceLock<std::sync::Mutex<String>> = std::sync::OnceLock::new();
static AGENT_SESSION: std::sync::OnceLock<std::sync::Mutex<Option<String>>> =
    std::sync::OnceLock::new();

fn agent_session_slot() -> &'static std::sync::Mutex<Option<String>> {
    AGENT_SESSION.get_or_init(|| std::sync::Mutex::new(None))
}

fn daemon_url_slot() -> &'static std::sync::Mutex<Option<String>> {
    DAEMON_URL.get_or_init(|| std::sync::Mutex::new(None))
}

fn agent_cookie_slot() -> &'static std::sync::Mutex<String> {
    AGENT_COOKIE.get_or_init(|| std::sync::Mutex::new(String::new()))
}

fn port_up(port: u16) -> bool {
    use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
    let addr = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::new(127, 0, 0, 1), port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(120)).is_ok()
}

fn code_cmd_path() -> Option<String> {
    if let Ok(custom) = std::env::var("DRGX_CODE_PATH") {
        let p = custom.trim().trim_matches('"');
        if !p.is_empty() && std::path::Path::new(p).is_file() {
            return Some(p.to_string());
        }
    }
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let prog = std::env::var("ProgramFiles").unwrap_or_default();
    let prog86 = std::env::var("ProgramFiles(x86)").unwrap_or_default();
    let mut candidates = Vec::new();
    for base in [&local, &prog, &prog86] {
        if base.is_empty() {
            continue;
        }
        for rel in [
            "Programs\\Microsoft VS Code\\bin\\code.cmd",
            "Microsoft VS Code\\bin\\code.cmd",
            "Programs\\VSCodium\\bin\\codium.cmd",
            "VSCodium\\bin\\codium.cmd",
        ] {
            candidates.push(std::path::PathBuf::from(base).join(rel));
        }
    }
    for candidate in candidates {
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    find_on_path(&["code.cmd", "code-insiders.cmd", "codium.cmd"])
        .map(|p| p.to_string_lossy().to_string())
}

fn opencode_cmd_path() -> Option<String> {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    if !appdata.is_empty() {
        let exe = format!("{}\\npm\\node_modules\\@opencode\\cli\\bin\\opencode.exe", appdata);
        if std::path::Path::new(&exe).is_file() {
            return Some(exe);
        }
        let candidate = format!("{}\\npm\\opencode.cmd", appdata);
        if std::path::Path::new(&candidate).is_file() {
            return Some(candidate);
        }
    }
    find_on_path(&["opencode.exe", "opencode.cmd"])
        .map(|p| p.to_string_lossy().to_string())
}

fn run_opencode_cmd(args: &[&str]) -> Option<std::process::Output> {
    let prog = opencode_cmd_path()?;
    let is_batch = prog.to_ascii_lowercase().ends_with(".cmd") || prog.to_ascii_lowercase().ends_with(".bat");
    let mut cmd = if is_batch {
        // cmd.exe /S /C cần một chuỗi lệnh có bao ngoài; nếu truyền từng arg,
        // đường dẫn có dấu cách sẽ bị cmd cắt tại khoảng trắng đầu tiên.
        let mut line = format!("\"{}\"", prog);
        for a in args {
            line.push(' ');
            line.push_str(a);
        }
        let mut c = Command::new(system_exe("cmd.exe"));
        c.args(["/D", "/S", "/C"]).raw_arg(format!("\"{}\"", line));
        c
    } else {
        Command::new(&prog)
    };
    if !is_batch {
        cmd.args(args);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.output().ok()
}

fn spawn_serve_web(port: u16) -> Option<u32> {
    // Ưu tiên bản serve-web đã có trong cache (~/.vscode/cli/serve-web).
    // `code serve-web` của VS Code 1.142 luôn cố tải bản server mới nhất từ
    // Internet; khi mạng chậm/bị chặn, nó trả 202 "đang tải" mãi và app không
    // mở được workbench. Chạy trực tiếp code-server.cmd trong cache giúp mở
    // app offline, đúng phiên bản đã được vá branding.
    if let Some(dir) = serve_web_dir() {
        let bat = std::path::PathBuf::from(&dir).join("bin").join("code-server.cmd");
        if bat.is_file() {
            let mut cmd = Command::new(system_exe("cmd.exe"));
            let line = format!(
                "\"\"{}\" --port {} --host 127.0.0.1 --without-connection-token --accept-server-license-terms --disable-telemetry\"",
                bat.display(),
                port
            );
            cmd.args(["/D", "/S", "/C"]).raw_arg(line);
            let old = std::env::var_os("PATH").unwrap_or_default();
            let mut parts: Vec<std::path::PathBuf> = std::env::split_paths(&old)
                .filter(|p| !p.as_os_str().is_empty())
                .collect();
            let server_bin = std::path::PathBuf::from(&dir).join("bin");
            if !parts.iter().any(|p| p == &server_bin) {
                parts.insert(0, server_bin);
            }
            if let Ok(exe) = std::env::current_exe() {
                if let Some(app_dir) = exe.parent() {
                    if !parts.iter().any(|p| p == app_dir) {
                        parts.insert(0, app_dir.to_path_buf());
                    }
                }
            }
            if let Ok(joined) = std::env::join_paths(parts) {
                cmd.env("PATH", joined);
            }
            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);
            let pid = cmd.spawn().ok().map(|c: Child| c.id());
            if let Some(pid) = pid {
                #[cfg(windows)]
                assign_kill_on_close_job(pid);
            }
            return pid;
        }
    }

    let code = code_cmd_path()?;
    let mut cmd = Command::new(system_exe("cmd.exe"));
    let line = format!(
        "\"\"{}\" serve-web --port {} --host 127.0.0.1 --without-connection-token --accept-server-license-terms --disable-telemetry\"",
        code, port
    );
    cmd.args(["/D", "/S", "/C"]).raw_arg(line);
    // Terminal trong workbench phải tìm thấy CLI đi kèm bộ cài (drgx.learn,
    // drgx.aura...) mà người dùng không cần thêm thư mục cài vào PATH.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let old = std::env::var_os("PATH").unwrap_or_default();
            let mut parts: Vec<std::path::PathBuf> = std::env::split_paths(&old)
                .filter(|p| !p.as_os_str().is_empty())
                .collect();
            if !parts.iter().any(|p| p == dir) {
                parts.insert(0, dir.to_path_buf());
            }
            if let Ok(joined) = std::env::join_paths(parts) {
                cmd.env("PATH", joined);
            }
        }
    }
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let pid = cmd.spawn().ok().map(|c: Child| c.id());
    if let Some(pid) = pid {
        #[cfg(windows)]
        assign_kill_on_close_job(pid);
    }
    pid
}

fn add_bundled_cli_to_path() {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let old = std::env::var_os("PATH").unwrap_or_default();
            let mut parts: Vec<std::path::PathBuf> = std::env::split_paths(&old)
                .filter(|p| !p.as_os_str().is_empty())
                .collect();
            if !parts.iter().any(|p| p == dir) {
                parts.insert(0, dir.to_path_buf());
                if let Ok(joined) = std::env::join_paths(parts) {
                    std::env::set_var("PATH", joined);
                }
            }
        }
    }
}

/// GET "/" trên 127.0.0.1:<port> và trả về head+body (giới hạn 16KB) dưới dạng text.
fn http_get_root(port: u16) -> Option<String> {
    use std::io::{Read, Write};
    let addr = format!("127.0.0.1:{}", port);
    let mut stream = std::net::TcpStream::connect(&addr).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(1))).ok()?;
    stream.set_write_timeout(Some(Duration::from_secs(1))).ok()?;
    let req = "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: text/html,application/xhtml+xml\r\nConnection: close\r\n\r\n";
    stream.write_all(req.as_bytes()).ok()?;
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).ok()?;
    if raw.len() > 16 * 1024 {
        raw.truncate(16 * 1024);
    }
    Some(String::from_utf8_lossy(&raw).to_string())
}

/// Kiểm tra port này có thực sự là VS Code serve-web hay không (tránh server lạ chiếm port).
fn serve_web_check(port: u16) -> bool {
    let body = match http_get_root(port) {
        Some(b) => b,
        None => return false,
    };
    let ok = body.contains("200 OK")
        && (body.contains("WORKBENCH_WEB_CONFIGURATION")
            || body.contains("vscode-web")
            || body.contains("workbench"));
    nav_log(&format!("web: port {} serve-web check = {}", port, ok));
    ok
}

/// Tìm pid đang LISTEN trên port (qua netstat) — dùng để restart serve-web sau khi patch CSP.
fn pid_listening_on(port: u16) -> Option<u32> {
    let mut cmd = Command::new(system_exe("netstat.exe"));
    cmd.arg("-ano");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let port_str = port.to_string();
    for line in text.lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() >= 5 && cols[0].eq_ignore_ascii_case("tcp") && cols[3].eq_ignore_ascii_case("LISTENING") {
            let is_port = cols[1]
                .rsplit_once(':')
                .map(|(_, p)| p == port_str)
                .unwrap_or(false);
            if is_port {
                if let Ok(pid) = cols[4].parse::<u32>() {
                    return Some(pid);
                }
            }
        }
    }
    None
}

#[cfg(windows)]
fn process_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    const STILL_ACTIVE: u32 = 259;
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut code = 0u32;
        let ok = GetExitCodeProcess(handle, &mut code);
        CloseHandle(handle);
        ok != 0 && code == STILL_ACTIVE
    }
}

enum WebWait {
    Healthy,
    WrapperExited,
    Timeout,
}

/// Đợi serve-web khỏe. Nếu tiến trình bọc `cmd.exe` đã thoát (ví dụ code.cmd sai
/// đường dẫn), trả WrapperExited để không thử tiếp 6 cổng còn lại — trang
/// /drgx/setup phải hiện nhanh để học sinh biết cần cài workbench.
fn wait_for_serve_web(port: u16, pid: u32) -> WebWait {
    for _ in 0..60 {
        if port_up(port) && serve_web_check(port) {
            return WebWait::Healthy;
        }
        if !process_alive(pid) {
            // Một số wrapper có thể trả quyền điều khiển trước khi node kịp mở
            // cổng; kiểm tra thêm một nhịp ngắn trước khi bỏ cuộc.
            nav_log(&format!(
                "web: wrapper pid {} exited before port {} became healthy",
                pid, port
            ));
            std::thread::sleep(Duration::from_millis(250));
            if port_up(port) && serve_web_check(port) {
                return WebWait::Healthy;
            }
            return WebWait::WrapperExited;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    WebWait::Timeout
}

/// Tái sử dụng serve-web sẵn có nếu đúng là serve-web; nếu port 80 bị app khác chiếm
/// thì chuyển sang port fallback; trả về (port, Option<pid spawn mới>, lỗi nếu có).
fn ensure_web_server() -> (u16, Option<u32>, Option<String>) {
    let started = std::time::Instant::now();
    let patched_csp = ensure_serve_web_branding();
    nav_log(&format!("web: branding check took {:?}", started.elapsed()));
    let code_available = code_cmd_path().is_some() || serve_web_dir().is_some();

    let mut candidates: Vec<u16> = Vec::new();
    if let Some(c) = std::env::var("DRGX_WEB_PORT")
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok())
        .filter(|p| *p > 0 && *p < 65535)
    {
        candidates.push(c);
    }
    candidates.push(WEB_PORT_DEFAULT);
    candidates.extend(WEB_PORTS_FALLBACK.iter().copied());

    // Pass 1: tái sử dụng serve-web đang chạy (đúng hàng hiệu).
    for p in &candidates {
        if port_up(*p) && serve_web_check(*p) {
            if patched_csp {
                // Vừa patch xong CSP → restart server để bản vá có hiệu lực.
                if let Some(old_pid) = pid_listening_on(*p) {
                    nav_log(&format!(
                        "web: restarting serve-web pid {} on port {} after CSP patch",
                        old_pid, p
                    ));
                    kill_tree(old_pid);
                    std::thread::sleep(Duration::from_millis(400));
                    if let Some(pid) = spawn_serve_web(*p) {
                        if matches!(wait_for_serve_web(*p, pid), WebWait::Healthy) {
                            return (*p, Some(pid), None);
                        }
                        kill_tree(pid);
                    }
                }
            } else {
                return (*p, None, None);
            }
        }
    }

    if !code_available {
        let message = "Không tìm thấy nhân soạn thảo DrgX Workbench Core để khởi chạy môi trường. \
            Hãy chạy trình thiết lập DrgX hoặc đặt biến môi trường DRGX_CODE_PATH trỏ tới tệp thực thi rồi mở lại DrgX."
            .to_string();
        nav_log("web: code command not found");
        return (WEB_PORT_DEFAULT, None, Some(message));
    }

    // Pass 2: spawn lên port rỗng đầu tiên, đợi server thực sự trả workbench.
    for p in &candidates {
        if port_up(*p) {
            continue;
        }
        if let Some(pid) = spawn_serve_web(*p) {
            nav_log(&format!(
                "web: spawned serve-web on port {} pid={}",
                p, pid
            ));
            match wait_for_serve_web(*p, pid) {
                WebWait::Healthy => {
                    // Lần đầu chưa có serve-web: `code serve-web` vừa tải workbench
                    // DrgX Workbench về nên asset vẫn là logo gốc. Patch ngay; nếu
                    // product.json/CSP vừa đổi thì khởi động lại đúng một lần.
                    if ensure_serve_web_branding() {
                        nav_log(&format!(
                            "web: re-patching new serve-web on port {} then restarting",
                            p
                        ));
                        kill_tree(pid);
                        std::thread::sleep(Duration::from_millis(400));
                        if let Some(pid2) = spawn_serve_web(*p) {
                            if matches!(wait_for_serve_web(*p, pid2), WebWait::Healthy) {
                                return (*p, Some(pid2), None);
                            }
                            kill_tree(pid2);
                        }
                        continue;
                    }
                    return (*p, Some(pid), None);
                }
                WebWait::WrapperExited => {
                    nav_log(&format!(
                        "web: wrapper exited on port {} — workbench command failed; not trying more ports",
                        p
                    ));
                    kill_tree(pid);
                    break;
                }
                WebWait::Timeout => {
                    nav_log(&format!(
                        "web: serve-web on port {} did not become healthy; stopping",
                        p
                    ));
                    kill_tree(pid);
                    std::thread::sleep(Duration::from_millis(300));
                }
            }
        }
    }
    nav_log("web: no usable port found");
    (
        WEB_PORT_DEFAULT,
        None,
        Some(
            "Không khởi động được DrgX Workbench Core (các cổng 80/8123–8127 đều bận \
             hoặc tiến trình thoát ngay). Hãy đóng ứng dụng đang chiếm cổng rồi mở lại DrgX."
                .to_string(),
        ),
    )
}

#[cfg(windows)]
fn assign_kill_on_close_job(pid: u32) {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            nav_log("job: CreateJobObject failed");
            return;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if ok == 0 {
            nav_log("job: SetInformationJobObject failed");
        }
        let proc = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if proc.is_null() {
            nav_log("job: OpenProcess failed");
            return;
        }
        let assigned = AssignProcessToJobObject(job, proc);
        nav_log(&format!("job: assigned pid {} ok={}", pid, assigned));
        CloseHandle(proc);
        // Intentionally leak the job handle: when this process dies — even via
        // force-kill — the last handle closes and Windows kills every process
        // still in the job (the whole detached serve-web tree included).
    }
}

fn base64_encode_bytes(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(n & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn opencode_basic_auth() -> Option<String> {
    let home = std::env::var("USERPROFILE").ok()?;
    let cfg_path = std::path::PathBuf::from(home)
        .join(".config")
        .join("opencode")
        .join("service.json");
    let raw = std::fs::read_to_string(cfg_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let pw = v.get("password")?.as_str()?;
    if pw.is_empty() {
        return None;
    }
    let cred = format!("opencode:{}", pw);
    Some(format!("Basic {}", base64_encode_bytes(cred.as_bytes())))
}

fn extract_http_url(text: &str) -> Option<String> {
    for line in text.lines() {
        if let Some(idx) = line.find("http://").or_else(|| line.find("https://")) {
            let rest = &line[idx..];
            let end = rest
                .find(|c: char| c.is_whitespace() || c == ',' || c == ')' || c == '"' || c == '\'')
                .unwrap_or(rest.len());
            let candidate = rest[..end].trim_end_matches('/');
            if candidate.len() > 10 {
                return Some(candidate.to_string());
            }
        }
    }
    None
}

fn opencode_service_url() -> Option<String> {
    if port_up(28894) {
        return Some("http://127.0.0.1:28894".to_string());
    }
    let out = run_opencode_cmd(&["service", "status"])?;
    let text = String::from_utf8_lossy(&out.stdout);
    extract_http_url(&text)
}

fn pairing_url() -> Option<String> {
    let out = run_opencode_cmd(&["pair"])?;
    let text = String::from_utf8_lossy(&out.stdout);
    for line in text.lines() {
        if line.contains("/auth/connect/") {
            if let Some(u) = extract_http_url(line) {
                return Some(u);
            }
        }
    }
    None
}

fn acquire_agent_cookie() -> Option<String> {
    use std::io::{Read, Write};
    let link = pairing_url()?;
    let url = link.trim().strip_prefix("http://")?;
    let (hostport, path) = url.split_once('/')?;
    let path = format!("/{}", path);
    let mut stream = TcpStream::connect(hostport).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).ok()?;
    let req = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nAccept: text/html,application/xhtml+xml,application/xml\r\nConnection: close\r\n\r\n",
        path, hostport
    );
    stream.write_all(req.as_bytes()).ok()?;
    let mut resp = Vec::new();
    stream.read_to_end(&mut resp).ok()?;
    let text = String::from_utf8_lossy(&resp);
    for line in text.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("set-cookie:") {
            if let Some((_, cookie_val)) = line.split_once(':') {
                let first_cookie = cookie_val.split(';').next().unwrap_or("").trim();
                if first_cookie.starts_with("opencode_session_") {
                    let mut guard = agent_cookie_slot().lock().unwrap();
                    *guard = first_cookie.to_string();
                    nav_log(&format!("agent: acquired cookie ({} bytes)", first_cookie.len()));
                    return Some(first_cookie.to_string());
                }
            }
        }
    }
    None
}

fn ensure_agent_cookie() -> Option<String> {
    let current = agent_cookie_slot().lock().unwrap().clone();
    if !current.is_empty() {
        return Some(current);
    }
    acquire_agent_cookie()
}

fn ensure_opencode_service() -> Option<String> {
    if let Some(url) = opencode_service_url() {
        *daemon_url_slot().lock().unwrap() = Some(url.clone());
        let _ = ensure_agent_cookie();
        return Some(url);
    }
    let _ = run_opencode_cmd(&["service", "start"]);
    let result = opencode_service_url();
    if let Some(url) = &result {
        *daemon_url_slot().lock().unwrap() = Some(url.clone());
        let _ = ensure_agent_cookie();
    }
    result
}

fn agent_url() -> Option<String> {
    let base = ensure_opencode_service()?;
    if let Some(link) = pairing_url() {
        return Some(link);
    }
    Some(format!("{}/", base.trim_end_matches('/')))
}

fn kill_tree(pid: u32) {
    let mut cmd = Command::new(system_exe("taskkill.exe"));
    cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.status();
}

#[cfg(windows)]
fn capture_agent_cookies(
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    url: &str,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2CookieList, ICoreWebView2_2,
    };
    use webview2_com::{CoTaskMemPWSTR, GetCookiesCompletedHandler};
    use windows_core::Interface;
    let Ok(core2) = core.cast::<ICoreWebView2_2>() else {
        return;
    };
    let Ok(manager) = (unsafe { core2.CookieManager() }) else {
        return;
    };
    let handler = GetCookiesCompletedHandler::create(Box::new(|_sender, cookies| {
        let Some(cookies): Option<ICoreWebView2CookieList> = cookies else {
            return Ok(());
        };
        let mut count = 0u32;
        if unsafe { cookies.Count(&mut count) }.is_err() {
            return Ok(());
        }
        let mut parts = Vec::new();
        for idx in 0..count {
            if let Ok(cookie) = unsafe { cookies.GetValueAtIndex(idx) } {
                let mut name = windows_core::PWSTR::null();
                let mut value = windows_core::PWSTR::null();
                if unsafe { cookie.Name(&mut name) }.is_ok()
                    && unsafe { cookie.Value(&mut value) }.is_ok()
                {
                    let n = CoTaskMemPWSTR::from(name).to_string();
                    let v = CoTaskMemPWSTR::from(value).to_string();
                    if !n.is_empty() {
                        parts.push(format!("{}={}", n, v));
                    }
                }
            }
        }
        *agent_cookie_slot().lock().unwrap() = parts.join("; ");
        nav_log(&format!("agent: cookies captured ({})", parts.len()));
        Ok(())
    }));
    let uri = windows_core::HSTRING::from(url);
    let _ = unsafe { manager.GetCookies(&uri, &handler) };
    std::mem::forget(handler);
}

fn allowed_origin(origin: &str) -> bool {
    // Panel trợ lý AI được DrgX Neural AI phục vụ trên một cổng loopback riêng
    // (thường 45278), không phải cổng workbench. Chỉ cho phép origin loopback;
    // mọi endpoint thay đổi dữ liệu vẫn bắt buộc Bearer token.
    if let Ok(parsed) = url::Url::parse(origin) {
        if parsed.scheme() == "http" {
            let host = parsed.host_str().unwrap_or("");
            if host.eq_ignore_ascii_case("127.0.0.1")
                || host.eq_ignore_ascii_case("localhost")
                || host.eq_ignore_ascii_case("::1")
            {
                return true;
            }
        }
    }
    let port = web_port();
    if origin == "http://drgx.localhost" {
        return true;
    }
    if port == 80 {
        if origin == "http://127.0.0.1" || origin == "http://localhost" {
            return true;
        }
    }
    origin == format!("http://127.0.0.1:{}", port)
        || origin == format!("http://localhost:{}", port)
}

fn cors_headers(origin: Option<&str>) -> String {
    let Some(o) = origin else {
        return String::new();
    };
    if !allowed_origin(o) {
        return String::new();
    }
    format!(
        "Access-Control-Allow-Origin: {}\r\nVary: Origin\r\nAccess-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: content-type, authorization\r\n",
        o
    )
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn read_http_head(
    reader: &mut std::io::BufReader<std::net::TcpStream>,
) -> std::io::Result<(String, Vec<(String, String)>)> {
    use std::io::BufRead;
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;
    let mut headers = Vec::new();
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            break;
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            headers.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
        }
        if headers.len() > 120 {
            break;
        }
    }
    Ok((request_line.trim().to_string(), headers))
}

fn write_proxy_error(
    client: &mut std::net::TcpStream,
    status: u16,
    message: &str,
    cors: &str,
) -> std::io::Result<()> {
    let body = serde_json::json!({ "ok": false, "error": message }).to_string();
    let resp = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        status_text(status),
        cors,
        body.len(),
        body
    );
    use std::io::Write;
    client.write_all(resp.as_bytes())
}

fn decode_chunked(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < data.len() {
        let Some(rel_end) = find_subslice(&data[i..], b"\r\n") else {
            break;
        };
        let line_end = i + rel_end;
        let size_str = String::from_utf8_lossy(&data[i..line_end]);
        let size = usize::from_str_radix(
            size_str.trim().split(';').next().unwrap_or("0").trim(),
            16,
        )
        .unwrap_or(0);
        i = line_end + 2;
        if size == 0 {
            break;
        }
        let end = (i + size).min(data.len());
        out.extend_from_slice(&data[i..end]);
        i = end + 2;
    }
    out
}

fn status_text(code: u16) -> &'static str {
    match code {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        413 => "Payload Too Large",
        415 => "Unsupported Media Type",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ => "OK",
    }
}

fn html_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn setup_page_html() -> String {
    let message = setup_error().unwrap_or_else(|| "Không khởi động được workbench.".to_string());
    format!(
        r#"<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DrgX IDE — cần cài workbench</title>
<style>
:root{{color-scheme:dark}}
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1120;color:#e2e8f0;font:15px/1.65 system-ui,"Segoe UI",sans-serif}}
main{{max-width:680px;padding:40px 28px}}
h1{{font-size:26px;margin:0 0 12px;color:#93c5fd}}
p{{margin:0 0 12px;color:#cbd5e1}}
code{{background:#1e293b;padding:2px 6px;border-radius:5px;color:#fbbf24}}
.box{{border:1px solid #334155;background:#0f172a;border-radius:14px;padding:22px}}
a.btn{{display:inline-block;margin-top:12px;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600}}
small{{color:#94a3b8}}
</style></head><body><main><div class="box">
<h1>DrgX IDE chưa mở được không gian làm việc</h1>
<p>{}</p>
<p>DrgX sử dụng <b>DrgX Workbench Core</b> làm nền soạn thảo cục bộ. Hãy chạy trình thiết lập DrgX hoặc kiểm tra lại đường dẫn hệ thống, sau đó mở lại DrgX.</p>
<p>Nếu nhân soạn thảo đã cài ở vị trí tùy chỉnh, đặt biến môi trường <code>DRGX_CODE_PATH</code> trỏ tới tệp thực thi.</p>
<p style="margin-top:18px"><small>Đây là trang chẩn đoán cục bộ của DrgX. Không có dữ liệu nào được gửi lên mạng.</small></p>
</div></main></body></html>"#,
        html_escape(&message)
    )
}

/// Tìm executable trên các thư mục PATH, không bao giờ dùng thư mục hiện tại.
/// Trên Windows, CreateProcess có thể tự chèn CWD nếu ta truyền tên trần; vì vậy
/// mọi tiến trình hệ thống quan trọng phải được truyền bằng đường dẫn tuyệt đối.
fn find_on_path(names: &[&str]) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        // Không chấp nhận mục PATH tương đối: CreateProcess có thể ghép với CWD
        // và chạy nhầm file do dự án cung cấp.
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

fn system_exe(name: &str) -> std::path::PathBuf {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    std::path::PathBuf::from(root).join("System32").join(name)
}

/// Tìm vị trí CLI drgx. Ưu tiên bản đóng gói cạnh app để bản cài mới không bị
/// một bản drgx cũ trên PATH che mất; chỉ dùng PATH/cargo làm fallback.
fn drgx_cli_path() -> Option<String> {
    let try_bin = |bin: &str| {
        Command::new(bin)
            .arg("--version")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()
            .map(|o| o.status.success())
            .unwrap_or(false)
    };
    // Bản cài đặt đóng gói CLI trong thư mục resources cạnh app.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for rel in [
                "drgx.exe",
                "cli\\drgx.exe",
                "resources\\drgx.exe",
                "..\\resources\\drgx.exe",
            ] {
                let p = dir.join(rel);
                if p.is_file() {
                    let text = p.to_string_lossy().to_string();
                    if try_bin(&text) {
                        return Some(text);
                    }
                }
            }
        }
    }
    if let Some(p) = find_on_path(&["drgx.exe"]) {
        let text = p.to_string_lossy().to_string();
        if try_bin(&text) {
            return Some(text);
        }
    }
    if let Ok(ch) = std::env::var("CARGO_HOME") {
        let p = format!("{}\\bin\\drgx.exe", ch);
        if try_bin(&p) {
            return Some(p);
        }
    }
    if let Ok(h) = std::env::var("USERPROFILE") {
        let p = format!("{}\\.cargo\\bin\\drgx.exe", h);
        if try_bin(&p) {
            return Some(p);
        }
    }
    if let Ok(out) = Command::new(system_exe("where.exe"))
        .arg("drgx.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Some(line) = text.lines().next() {
                let p = line.trim().to_string();
                if !p.is_empty() && std::path::Path::new(&p).is_file() && try_bin(&p) {
                    return Some(p);
                }
            }
        }
    }
    None
}

fn read_text_capped(path: &std::path::Path, max_bytes: u64) -> String {
    use std::io::Read;
    let Ok(file) = std::fs::File::open(path) else {
        return String::new();
    };
    let mut bytes = Vec::new();
    if file.take(max_bytes).read_to_end(&mut bytes).is_err() {
        return String::new();
    }
    String::from_utf8_lossy(&bytes).to_string()
}

fn validate_judge_source(
    cwd: &str,
    source: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(source) = source.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let cwd = std::fs::canonicalize(cwd)
        .map_err(|_| "thư mục project không còn tồn tại".to_string())?;
    let requested = std::path::PathBuf::from(source);
    let requested = if requested.is_absolute() {
        requested
    } else {
        cwd.join(requested)
    };
    let canonical = std::fs::canonicalize(&requested)
        .map_err(|_| "không tìm thấy file đang mở".to_string())?;
    if !canonical.starts_with(&cwd) || !canonical.is_file() {
        return Err("file chấm bài phải nằm trong thư mục project đang mở".to_string());
    }
    let relative = canonical
        .strip_prefix(&cwd)
        .map_err(|_| "đường dẫn file không hợp lệ".to_string())?;
    Ok(Some(relative.to_string_lossy().to_string()))
}

struct TempFiles(Vec<std::path::PathBuf>);
impl Drop for TempFiles {
    fn drop(&mut self) {
        for path in &self.0 {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// DrgX Judge backend: gọi `drgx tests --json` với cwd = thư mục project đang mở
/// (lưu tại %APPDATA%\vn.drgx.ide\last_folder.txt). Trả về JSON của CLI.
fn run_judge(body: &[u8]) -> String {
    let Some(cli) = drgx_cli_path() else {
        return "{\"ok\":false,\"error\":\"không tìm thấy drgx CLI\"}".to_string();
    };

    let body_val = serde_json::from_slice::<serde_json::Value>(body).ok();
    let tl = body_val
        .as_ref()
        .and_then(|v| v.get("tl").and_then(|t| t.as_u64()))
        .filter(|t| (100..=120000).contains(t));
    let source = body_val
        .as_ref()
        .and_then(|v| v.get("source").and_then(|s| s.as_str()).map(str::to_string))
        .or_else(|| {
            body_val
                .as_ref()
                .and_then(|v| v.get("file").and_then(|s| s.as_str()).map(str::to_string))
        });

    let cwd = std::env::var("APPDATA")
        .ok()
        .map(|a| {
            let p = format!("{}\\vn.drgx.ide\\last_folder.txt", a);
            std::fs::read_to_string(p).ok()
        })
        .flatten()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && std::path::Path::new(s).is_dir());
    let Some(cwd) = cwd else {
        return "{\"ok\":false,\"error\":\"chưa mở thư mục project nào trong IDE\"}".to_string();
    };

    // Chỉ cho phép file nằm trong project đang mở. Tránh biến endpoint nội bộ
    // thành công cụ biên dịch/đọc file tùy ý ngoài workspace.
    let source = match validate_judge_source(&cwd, source.as_deref()) {
        Ok(value) => value,
        Err(message) => {
            return serde_json::json!({ "ok": false, "error": message }).to_string();
        }
    };

    let state_dir = std::path::PathBuf::from(format!(
        "{}\\vn.drgx.ide",
        std::env::var("APPDATA").unwrap_or_default()
    ));
    if std::fs::create_dir_all(&state_dir).is_err() {
        return "{\"ok\":false,\"error\":\"không ghi được thư mục state\"}".to_string();
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let out_path = state_dir.join(format!(
        "judge_out_{}_{}.json",
        std::process::id(),
        stamp
    ));
    let err_path = state_dir.join(format!(
        "judge_err_{}_{}.txt",
        std::process::id(),
        stamp
    ));
    let _cleanup = TempFiles(vec![out_path.clone(), err_path.clone()]);

    let mut cmd = Command::new(cli);
    cmd.args(["tests", "--json"]);
    if let Some(t) = tl {
        cmd.arg("--tl").arg(t.to_string());
    }
    if let Some(src) = source {
        cmd.arg("--").arg(src);
    }
    cmd.current_dir(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Ok(f) = std::fs::File::create(&out_path) {
        cmd.stdout(Stdio::from(f));
    }
    if let Ok(f) = std::fs::File::create(&err_path) {
        cmd.stderr(Stdio::from(f));
    }
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return format!("{{\"ok\":false,\"error\":\"spawn judge thất bại: {}\"}}", e),
    };
    let t0 = std::time::Instant::now();
    let timeout = Duration::from_secs(
        ((tl.unwrap_or(6000) as u64 * 20) / 1000 + 180).clamp(300, 1800),
    );
    let mut completed = false;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                completed = true;
                break;
            }
            Ok(None) => {
                if t0.elapsed() > timeout {
                    kill_tree(child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(120));
            }
            Err(_) => break,
        }
    }
    if !completed {
        return format!(
            "{{\"ok\":false,\"error\":\"judge quá {}s (biên dịch hoặc chấm quá lâu)\"}}",
            timeout.as_secs()
        );
    }
    let text = read_text_capped(&out_path, 8 * 1024 * 1024);
    let trimmed = text.trim().to_string();
    if trimmed.starts_with('{') {
        return trimmed;
    }
    if let Some(line) = text.lines().rfind(|l| l.trim().starts_with('{')) {
        return line.trim().to_string();
    }
    let err_text = read_text_capped(&err_path, 512 * 1024);
    let _ = std::fs::write(
        &state_dir.join("judge_last_raw.log"),
        format!("stdout:\n{}\nstderr:\n{}", text, err_text),
    );
    return "{\"ok\":false,\"error\":\"drgx tests không trả JSON (xem judge_last_raw.log)\"}".to_string();
}

fn handle_proxy(mut client: std::net::TcpStream, port: u16) -> std::io::Result<()> {
    use std::io::{Read, Write};
    client.set_read_timeout(Some(Duration::from_secs(10)))?;
    client.set_write_timeout(Some(Duration::from_secs(120)))?;
    let mut reader = std::io::BufReader::new(client.try_clone()?);
    let (request_line, headers) = read_http_head(&mut reader)?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_ascii_uppercase();
    let path = parts.next().unwrap_or("/").to_string();
    let origin = headers
        .iter()
        .find(|(k, _)| k == "origin")
        .map(|(_, v)| v.as_str());
    let cors = cors_headers(origin);

    // Chống DNS rebinding: Host phải trỏ đúng listener loopback của DrgX.
    let allowed_hosts = [
        format!("127.0.0.1:{}", port),
        format!("localhost:{}", port),
    ];
    let host_ok = headers
        .iter()
        .find(|(k, _)| k == "host")
        .map(|(_, v)| allowed_hosts.iter().any(|h| v.eq_ignore_ascii_case(h)))
        .unwrap_or(false);
    if !host_ok {
        return write_proxy_error(&mut client, 403, "host không hợp lệ", "");
    }

    // Trình duyệt lạ không được tạo request có side effect, kể cả CORS đơn giản.
    if let Some(o) = origin {
        if !allowed_origin(o) {
            return write_proxy_error(&mut client, 403, "origin không hợp lệ", "");
        }
    }

    // Trang chẩn đoán khi không tìm thấy workbench. Không chứa dữ liệu nhạy cảm
    // và không yêu cầu token; Host vẫn phải là loopback của proxy.
    if method == "GET" && path == "/drgx/setup" {
        let body = setup_page_html();
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.as_bytes().len(),
            body
        );
        client.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if method == "OPTIONS" {
        if origin.is_none() {
            return write_proxy_error(&mut client, 400, "thiếu origin", "");
        }
        let resp = format!(
            "HTTP/1.1 204 No Content\r\n{}Content-Length: 0\r\nConnection: close\r\n\r\n",
            cors
        );
        client.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if path == "/drgx/health" {
        let body = "{\"app\":\"drgx-proxy\",\"version\":2,\"authRequired\":true}";
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            cors,
            body.len(),
            body
        );
        client.write_all(resp.as_bytes())?;
        return Ok(());
    }

    // Mọi endpoint còn lại đều cần token do app sinh và chỉ ghi trong profile
    // người dùng. Token không bao giờ nằm trong URL hay response.
    let bearer = headers
        .iter()
        .find(|(k, _)| k == "authorization")
        .and_then(|(_, v)| v.strip_prefix("Bearer "))
        .map(str::trim)
        .unwrap_or("");
    if !token_matches(bearer) {
        return write_proxy_error(&mut client, 401, "thiếu hoặc sai bridge token", &cors);
    }

    if matches!(method.as_str(), "POST" | "PUT" | "PATCH" | "DELETE") {
        let content_type = headers
            .iter()
            .find(|(k, _)| k == "content-type")
            .map(|(_, v)| v.to_ascii_lowercase())
            .unwrap_or_default();
        if !content_type.starts_with("application/json") {
            return write_proxy_error(
                &mut client,
                415,
                "chỉ chấp nhận application/json",
                &cors,
            );
        }
    }

    if method == "GET" && path.starts_with("/drgx/inbox/status") {
        let session = path
            .split_once('?')
            .map(|(_, q)| q)
            .and_then(|q| {
                q.split('&')
                    .find_map(|kv| kv.strip_prefix("session="))
                    .filter(|s| s.starts_with("ses_"))
            });
        let (status, payload) = handle_inbox_status(session);
        let resp = format!(
            "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            status,
            status_text(status),
            cors,
            payload.len(),
            payload
        );
        client.write_all(resp.as_bytes())?;
        return Ok(());
    }

    const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
    let declared_length = headers
        .iter()
        .find(|(k, _)| k == "content-length")
        .and_then(|(_, v)| v.parse::<usize>().ok())
        .unwrap_or(0);
    if declared_length > MAX_BODY_BYTES {
        return write_proxy_error(&mut client, 413, "body quá lớn", &cors);
    }
    let mut body = vec![0u8; declared_length];
    if declared_length > 0 {
        reader.read_exact(&mut body)?;
    }

    if method == "GET" && path == "/drgx/panel-width" {
        let payload = format!("{{\"ok\":true,\"width\":{:.0}}}", panel_width_logical());
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            cors,
            payload.len(),
            payload
        );
        client.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if method == "POST" && path == "/drgx/panel-width" {
        let width = serde_json::from_slice::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("width").and_then(|w| w.as_f64()).filter(|w| w.is_finite()));
        let (status, payload) = match width {
            Some(w) => {
                set_panel_width(w);
                (200, format!("{{\"ok\":true,\"width\":{:.0}}}", panel_width_logical()))
            }
            None => (400, "{\"ok\":false,\"error\":\"invalid width\"}".to_string()),
        };
        let resp = format!(
            "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            status,
            status_text(status),
            cors,
            payload.len(),
            payload
        );
        client.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if method == "POST" && path == "/drgx/inbox" {
        let (status, payload) = handle_inbox_post(&body);
        let resp = format!(
            "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            status,
            status_text(status),
            cors,
            payload.len(),
            payload
        );
        client.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if method == "POST" && path == "/drgx/tests" {
        let payload = run_judge(&body);
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            cors,
            payload.len(),
            payload
        );
        client.write_all(resp.as_bytes())?;
        return Ok(());
    }

    let target = path.strip_prefix("/drgx").unwrap_or(&path).to_string();
    let cached = daemon_url_slot().lock().unwrap().clone();
    let daemon = match cached {
        Some(d) => d,
        None => {
            let found = opencode_service_url();
            if let Some(d) = &found {
                *daemon_url_slot().lock().unwrap() = Some(d.clone());
            }
            found.unwrap_or_default()
        }
    };
    if daemon.is_empty() {
        return write_proxy_error(&mut client, 503, "daemon unavailable", &cors);
    }
    let hostport = daemon
        .trim_start_matches("http://")
        .trim_end_matches('/')
        .to_string();
    let mut upstream = match std::net::TcpStream::connect(&hostport) {
        Ok(s) => s,
        Err(_) => {
            *daemon_url_slot().lock().unwrap() = None;
            let refreshed = opencode_service_url();
            if let Some(refreshed) = refreshed {
                *daemon_url_slot().lock().unwrap() = Some(refreshed.clone());
                let new_hp = refreshed
                    .trim_start_matches("http://")
                    .trim_end_matches('/')
                    .to_string();
                match std::net::TcpStream::connect(&new_hp) {
                    Ok(s) => s,
                    Err(_) => return write_proxy_error(&mut client, 502, "daemon unreachable", &cors),
                }
            } else {
                return write_proxy_error(&mut client, 502, "daemon unreachable", &cors);
            }
        }
    };
    upstream.set_read_timeout(Some(Duration::from_secs(120)))?;
    upstream.set_write_timeout(Some(Duration::from_secs(30)))?;

    let cookie = ensure_agent_cookie().unwrap_or_default();
    let basic_auth = opencode_basic_auth().unwrap_or_default();
    let mut req = format!("{} {} HTTP/1.1\r\nHost: {}\r\n", method, target, hostport);
    if let Some((_, ct)) = headers.iter().find(|(k, _)| k == "content-type") {
        req.push_str(&format!("Content-Type: {}\r\n", ct));
    }
    if let Some((_, accept)) = headers.iter().find(|(k, _)| k == "accept") {
        req.push_str(&format!("Accept: {}\r\n", accept));
    }
    if !basic_auth.is_empty() {
        req.push_str(&format!("Authorization: {}\r\n", basic_auth));
    }
    if !cookie.is_empty() {
        req.push_str(&format!("Cookie: {}\r\n", cookie));
    }
    req.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    ));
    upstream.write_all(req.as_bytes())?;
    if !body.is_empty() {
        upstream.write_all(&body)?;
    }

    let mut raw = Vec::new();
    upstream.read_to_end(&mut raw)?;

    let (mut head_text, mut resp_body, mut status_line) = match find_subslice(&raw, b"\r\n\r\n") {
        Some(i) => {
            let text = String::from_utf8_lossy(&raw[..i]).to_string();
            let first_line = text.lines().next().unwrap_or("HTTP/1.1 200 OK").trim().to_string();
            (
                text,
                raw[i + 4..].to_vec(),
                first_line,
            )
        }
        None => (
            String::new(),
            Vec::new(),
            "HTTP/1.1 502 Bad Gateway".to_string(),
        ),
    };

    if status_line.contains("401") {
        nav_log("proxy: upstream 401, refreshing cookie and retrying once");
        *agent_cookie_slot().lock().unwrap() = String::new();
        if let Some(new_cookie) = acquire_agent_cookie() {
            if let Ok(mut retry_upstream) = std::net::TcpStream::connect(&hostport) {
                let _ = retry_upstream.set_read_timeout(Some(Duration::from_secs(120)));
                let _ = retry_upstream.set_write_timeout(Some(Duration::from_secs(30)));
                let mut retry_req = format!("{} {} HTTP/1.1\r\nHost: {}\r\n", method, target, hostport);
                if let Some((_, ct)) = headers.iter().find(|(k, _)| k == "content-type") {
                    retry_req.push_str(&format!("Content-Type: {}\r\n", ct));
                }
                if let Some((_, accept)) = headers.iter().find(|(k, _)| k == "accept") {
                    retry_req.push_str(&format!("Accept: {}\r\n", accept));
                }
                if !basic_auth.is_empty() {
                    retry_req.push_str(&format!("Authorization: {}\r\n", basic_auth));
                }
                retry_req.push_str(&format!("Cookie: {}\r\n", new_cookie));
                retry_req.push_str(&format!(
                    "Content-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                ));
                if retry_upstream.write_all(retry_req.as_bytes()).is_ok() {
                    if !body.is_empty() {
                        let _ = retry_upstream.write_all(&body);
                    }
                    let mut retry_raw = Vec::new();
                    if retry_upstream.read_to_end(&mut retry_raw).is_ok() && !retry_raw.is_empty() {
                        if let Some(ri) = find_subslice(&retry_raw, b"\r\n\r\n") {
                            head_text = String::from_utf8_lossy(&retry_raw[..ri]).to_string();
                            status_line = head_text.lines().next().unwrap_or("HTTP/1.1 200 OK").trim().to_string();
                            resp_body = retry_raw[ri + 4..].to_vec();
                        }
                    }
                }
            }
        }
    }

    let mut out_headers: Vec<(String, String)> = Vec::new();
    let mut chunked = false;
    for line in head_text.lines().skip(1) {
        if let Some((k, v)) = line.split_once(':') {
            let kl = k.trim().to_ascii_lowercase();
            if kl == "transfer-encoding" && v.to_ascii_lowercase().contains("chunked") {
                chunked = true;
            }
            if kl == "connection"
                || kl == "keep-alive"
                || kl == "transfer-encoding"
                || kl == "content-length"
                || kl == "vary"
                || kl.starts_with("access-control-")
            {
                continue;
            }
            out_headers.push((k.trim().to_string(), v.trim().to_string()));
        }
    }
    if chunked {
        resp_body = decode_chunked(&resp_body);
    }

    let mut out = format!("{}\r\n", status_line.trim());
    for (k, v) in &out_headers {
        out.push_str(&format!("{}: {}\r\n", k, v));
    }
    out.push_str(&cors);
    out.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n",
        resp_body.len()
    ));
    client.write_all(out.as_bytes())?;
    client.write_all(&resp_body)?;
    Ok(())
}

fn start_api_proxy() {
    std::thread::spawn(move || {
        for port in 45290u16..=45299u16 {
            let addr = format!("127.0.0.1:{}", port);
            if let Ok(listener) = std::net::TcpListener::bind(&addr) {
                let _ = PROXY_PORT_STATE.set(port);
                nav_log(&format!("proxy: listening on {}", addr));
                for stream in listener.incoming().flatten() {
                    std::thread::spawn(move || {
                        if let Err(e) = handle_proxy(stream, port) {
                            nav_log(&format!("proxy: conn error: {}", e));
                        }
                    });
                }
                return;
            }
        }
        nav_log("proxy: no free port in 45290-45299");
    });
}

fn app_state_dir() -> String {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    format!("{}\\vn.drgx.ide", appdata)
}

fn inbox_state_path() -> String {
    format!("{}\\inbox_state.txt", app_state_dir())
}

fn panel_width_file() -> String {
    format!("{}\\panel_width.txt", app_state_dir())
}

fn load_panel_width() -> f64 {
    std::fs::read_to_string(panel_width_file())
        .ok()
        .and_then(|s| s.trim().parse::<f64>().ok())
        .filter(|w| w.is_finite())
        .map(|w| w.clamp(PANEL_WIDTH_MIN, 1400.0))
        .unwrap_or(PANEL_WIDTH_DEFAULT)
}

fn save_panel_width(width: f64) {
    let _ = std::fs::create_dir_all(app_state_dir());
    let _ = std::fs::write(panel_width_file(), format!("{:.0}\n", width));
}

fn panel_width_logical() -> f64 {
    *PANEL_WIDTH_STATE.lock().unwrap()
}

fn set_panel_width(width: f64) {
    let clamped = width.clamp(PANEL_WIDTH_MIN, 1400.0);
    *PANEL_WIDTH_STATE.lock().unwrap() = clamped;
    save_panel_width(clamped);
    let Some(app) = APP_HANDLE.get().cloned() else {
        return;
    };
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = app2.get_window("main") {
            if let Ok(size) = window.inner_size() {
                let scale = window.scale_factor().unwrap_or(1.0);
                layout_split(&app2, size, scale);
            }
        }
    });
}

struct InboxState {
    path: String,
    offset: u64,
    session: String,
}

fn load_inbox_states() -> Vec<InboxState> {
    let Ok(text) = std::fs::read_to_string(inbox_state_path()) else {
        return Vec::new();
    };
    text.split("\n\n")
        .filter_map(|block| {
            let mut lines = block.lines();
            let path = lines.next()?.trim().to_string();
            if path.is_empty() {
                return None;
            }
            let offset = lines
                .next()
                .and_then(|l| l.trim().parse::<u64>().ok())
                .unwrap_or(0);
            let session = lines.next().unwrap_or("").trim().to_string();
            Some(InboxState {
                path,
                offset,
                session,
            })
        })
        .collect()
}

fn save_inbox_states(states: &[InboxState]) {
    let _ = std::fs::create_dir_all(app_state_dir());
    let text = states
        .iter()
        .map(|s| format!("{}\n{}\n{}\n", s.path, s.offset, s.session))
        .collect::<Vec<_>>()
        .join("\n");
    let _ = std::fs::write(inbox_state_path(), text);
}

fn upsert_inbox_state(path: &str, session: &str) -> Vec<InboxState> {
    let current_len = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let mut states = load_inbox_states();
    if let Some(st) = states.iter_mut().find(|s| s.path == path) {
        if st.offset > current_len {
            st.offset = 0;
        }
        st.session = session.to_string();
    } else {
        states.push(InboxState {
            path: path.to_string(),
            offset: current_len,
            session: session.to_string(),
        });
    }
    save_inbox_states(&states);
    states
}

fn ensure_agents_block(_dir: &str, _inbox_path: &str) {
    // Không tự động chèn chỉ dẫn nội bộ vào AGENTS.md của thư mục dự án người dùng.
}

fn daemon_http(method: &str, path: &str, body: Option<&str>) -> Option<(u16, String)> {
    daemon_http_impl(method, path, body, false)
}

fn daemon_http_impl(
    method: &str,
    path: &str,
    body: Option<&str>,
    retried_auth: bool,
) -> Option<(u16, String)> {
    use std::io::{Read, Write};
    let daemon = daemon_url_slot()
        .lock()
        .unwrap()
        .clone()
        .or_else(|| {
            let found = opencode_service_url();
            if let Some(d) = &found {
                *daemon_url_slot().lock().unwrap() = Some(d.clone());
            }
            found
        })?;
    let hostport = daemon
        .trim_start_matches("http://")
        .trim_end_matches('/')
        .to_string();
    let mut stream = match std::net::TcpStream::connect(&hostport) {
        Ok(s) => s,
        Err(_) => {
            *daemon_url_slot().lock().unwrap() = None;
            let refreshed = opencode_service_url()?;
            *daemon_url_slot().lock().unwrap() = Some(refreshed.clone());
            let new_hostport = refreshed
                .trim_start_matches("http://")
                .trim_end_matches('/')
                .to_string();
            std::net::TcpStream::connect(&new_hostport).ok()?
        }
    };
    stream.set_read_timeout(Some(Duration::from_secs(30))).ok()?;
    stream.set_write_timeout(Some(Duration::from_secs(10))).ok()?;
    let cookie = ensure_agent_cookie().unwrap_or_default();
    let basic_auth = opencode_basic_auth().unwrap_or_default();
    let payload = body.unwrap_or("");
    let mut req = format!("{} {} HTTP/1.1\r\nHost: {}\r\n", method, path, hostport);
    if !payload.is_empty() {
        req.push_str("Content-Type: application/json\r\n");
    }
    if !basic_auth.is_empty() {
        req.push_str(&format!("Authorization: {}\r\n", basic_auth));
    }
    if !cookie.is_empty() {
        req.push_str(&format!("Cookie: {}\r\n", cookie));
    }
    req.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        payload.len(),
        payload
    ));
    stream.write_all(req.as_bytes()).ok()?;
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).ok()?;
    let i = find_subslice(&raw, b"\r\n\r\n")?;
    let head = String::from_utf8_lossy(&raw[..i]).to_string();
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())?;
    if status == 401 && !retried_auth {
        nav_log("daemon_http: 401 unauthorized, re-acquiring cookie and retrying");
        *agent_cookie_slot().lock().unwrap() = String::new();
        let _ = acquire_agent_cookie();
        return daemon_http_impl(method, path, body, true);
    }
    let mut resp_body = raw[i + 4..].to_vec();
    if head.to_ascii_lowercase().contains("transfer-encoding: chunked") {
        resp_body = decode_chunked(&resp_body);
    }
    Some((status, String::from_utf8_lossy(&resp_body).to_string()))
}

fn handle_inbox_post(body: &[u8]) -> (u16, String) {
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(body) else {
        return (400, "{\"ok\":false,\"error\":\"invalid json\"}".to_string());
    };
    let text = v
        .get("text")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let session = v
        .get("session")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if text.is_empty() {
        return (400, "{\"ok\":false,\"error\":\"empty text\"}".to_string());
    }
    if text.len() > 8000 {
        return (413, "{\"ok\":false,\"error\":\"text too long\"}".to_string());
    }
    if !session.starts_with("ses_")
        || session.len() > 200
        || !session
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return (409, "{\"ok\":false,\"error\":\"no session\"}".to_string());
    }
    let dir = match daemon_http("GET", &format!("/api/session/{}", session), None) {
        Some((200, session_json)) => serde_json::from_str::<serde_json::Value>(&session_json)
            .ok()
            .and_then(|sv| {
                sv.pointer("/data/location/directory")
                    .and_then(|d| d.as_str())
                    .or_else(|| sv.pointer("/data/directory").and_then(|d| d.as_str()))
                    .filter(|d| !d.is_empty() && std::path::Path::new(d).is_dir())
                    .map(|s| s.to_string())
            })
            .or_else(|| std::env::var("USERPROFILE").ok())
            .unwrap_or_default(),
        _ => std::env::var("USERPROFILE").unwrap_or_default(),
    };
    if dir.is_empty() || !std::path::Path::new(&dir).is_dir() {
        return (409, "{\"ok\":false,\"error\":\"session has no folder\"}".to_string());
    }
    let file = std::path::PathBuf::from(app_state_dir()).join("live-steer.log");
    let file_str = file.to_string_lossy().to_string();
    upsert_inbox_state(&file_str, &session);
    let line = format!(
        "[{}] {}\n",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        text
    );
    use std::io::Write;
    let appended = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .and_then(|mut f| f.write_all(line.as_bytes()));
    if appended.is_err() {
        return (500, "{\"ok\":false,\"error\":\"write failed\"}".to_string());
    }
    *agent_session_slot().lock().unwrap() = Some(session.clone());
    ensure_agents_block(&dir, &file_str);
    nav_log(&format!(
        "inbox: appended {} bytes for {} ({})",
        line.len(),
        session,
        file_str
    ));
    let resp = serde_json::json!({
        "ok": true,
        "file": file_str,
        "deliverWithinSec": 5
    })
    .to_string();
    (200, resp)
}

fn handle_inbox_status(session_filter: Option<&str>) -> (u16, String) {
    let states = load_inbox_states();
    if let Some(sid) = session_filter {
        let matching: Vec<&InboxState> = states.iter().filter(|s| s.session == sid).collect();
        if matching.is_empty() {
            return (
                200,
                serde_json::json!({
                    "ok": true,
                    "found": false,
                    "pending": false,
                    "delivered": false,
                    "session": sid
                })
                .to_string(),
            );
        }
        let mut pending = false;
        let mut last_file = String::new();
        let mut last_offset = 0u64;
        let mut last_size = 0u64;
        for st in matching {
            let len = std::fs::metadata(&st.path).map(|m| m.len()).unwrap_or(0);
            if len > st.offset {
                pending = true;
            }
            last_file = st.path.clone();
            last_offset = st.offset;
            last_size = len;
        }
        return (
            200,
            serde_json::json!({
                "ok": true,
                "found": true,
                "pending": pending,
                "delivered": !pending,
                "file": last_file,
                "session": sid,
                "offset": last_offset,
                "size": last_size
            })
            .to_string(),
        );
    }
    let mut pending = false;
    let entries: Vec<serde_json::Value> = states
        .iter()
        .map(|st| {
            let len = std::fs::metadata(&st.path).map(|m| m.len()).unwrap_or(0);
            let p = len > st.offset;
            pending |= p;
            serde_json::json!({
                "file": st.path,
                "session": st.session,
                "pending": p,
                "offset": st.offset,
                "size": len
            })
        })
        .collect();
    (
        200,
        serde_json::json!({
            "ok": true,
            "pending": pending,
            "sessions": entries
        })
        .to_string(),
    )
}

fn poll_inbox() {
    use std::io::{Read, Seek, SeekFrom};
    let mut states = load_inbox_states();
    if states.is_empty() {
        return;
    }
    let current = agent_session_slot().lock().unwrap().clone();
    let mut changed = false;
    for st in states.iter_mut() {
        let Ok(meta) = std::fs::metadata(&st.path) else {
            continue;
        };
        let len = meta.len();
        if len < st.offset {
            st.offset = 0;
            changed = true;
        }
        if len == st.offset {
            continue;
        }
        let Some(mut sid) = (if st.session.is_empty() {
            current.clone()
        } else {
            Some(st.session.clone())
        }) else {
            continue;
        };
        let Ok(mut file) = std::fs::File::open(&st.path) else {
            continue;
        };
        if file.seek(SeekFrom::Start(st.offset)).is_err() {
            continue;
        }
        let mut buf = Vec::new();
        if file.take(64 * 1024).read_to_end(&mut buf).is_err() {
            continue;
        }
        let Some(last_nl) = buf.iter().rposition(|b| *b == b'\n') else {
            if buf.len() >= 64 * 1024 {
                st.offset += buf.len() as u64;
                changed = true;
            }
            continue;
        };
        let chunk = &buf[..=last_nl];
        let text = String::from_utf8_lossy(chunk).trim().to_string();
        let advance = st.offset + last_nl as u64 + 1;
        if text.is_empty() {
            st.offset = advance;
            changed = true;
            continue;
        }
        let prompt = serde_json::json!({
            "text": format!(
                "Yêu cầu điều hướng trực tiếp từ người dùng (DrgX Live Steer):\n{}",
                text
            ),
            "delivery": "steer"
        })
        .to_string();
        let attempt = |session: &str| {
            daemon_http(
                "POST",
                &format!("/api/session/{}/prompt", session),
                Some(&prompt),
            )
        };
        let mut delivered = false;
        match attempt(&sid) {
            Some((status, _)) if (200..300).contains(&status) => delivered = true,
            Some((404, _)) => {
                if let Some(cur) = &current {
                    if *cur != sid {
                        if let Some((s2, _)) = attempt(cur) {
                            if (200..300).contains(&s2) {
                                delivered = true;
                                sid = cur.clone();
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        if delivered {
            st.offset = advance;
            st.session = sid.clone();
            changed = true;
            nav_log(&format!(
                "inbox: delivered {} bytes to {}",
                chunk.len(),
                sid
            ));
        } else {
            nav_log(&format!("inbox: delivery failed for {}, retry", sid));
        }
    }
    if changed {
        save_inbox_states(&states);
    }
}

fn start_inbox_pump() {
    std::thread::spawn(|| loop {
        std::thread::sleep(Duration::from_secs(5));
        poll_inbox();
    });
}

fn panel_width_px(scale: f64) -> u32 {
    (panel_width_logical() * scale).round() as u32
}

fn effective_panel_px(size_width: u32, scale: f64) -> u32 {
    let min_ide = (380.0 * scale).round() as u32;
    let min_panel = (PANEL_WIDTH_MIN * scale).round() as u32;
    panel_width_px(scale)
        .min(size_width.saturating_sub(min_ide))
        .max(min_panel.min(size_width.saturating_sub(200)))
}

fn layout_split(app: &tauri::AppHandle, size: tauri::PhysicalSize<u32>, scale: f64) {
    let panel_w = effective_panel_px(size.width, scale);
    if size.width <= panel_w + 200 {
        return;
    }
    let ide_w = size.width - panel_w;
    if let Some(main) = app.get_webview("main") {
        let _ = main.set_size(tauri::PhysicalSize::new(ide_w, size.height));
        let _ = main.set_position(tauri::PhysicalPosition::new(0, 0));
    }
    if let Some(agent) = app
        .state::<AgentPanel>()
        .0
        .lock()
        .unwrap()
        .as_ref()
    {
        let _ = agent.set_size(tauri::PhysicalSize::new(panel_w, size.height));
        let _ = agent.set_position(tauri::PhysicalPosition::new(ide_w as i32, 0));
    }
}


fn close_agent(app: &tauri::AppHandle) {
    let panel = app.state::<AgentPanel>();
    let webview = panel.0.lock().unwrap().take();
    if let Some(webview) = webview {
        let _ = webview.close();
        if let Some(window) = app.get_window("main") {
            if let Ok(size) = window.inner_size() {
                if let Some(main) = app.get_webview("main") {
                    let _ = main.set_size(size);
                    let _ = main.set_position(tauri::PhysicalPosition::new(0, 0));
                }
            }
        }
    }
}

fn open_agent(app: &tauri::AppHandle, url: String) {
    nav_log("agent: opening panel");
    let panel = app.state::<AgentPanel>();
    let mut guard = panel.0.lock().unwrap();
    if guard.is_some() {
        nav_log("agent: already open");
        return;
    }

    let Some(window) = app.get_window("main") else {
        nav_log("agent: no main window");
        return;
    };
    let Ok(size) = window.inner_size() else {
        nav_log("agent: no inner size");
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let panel_w = effective_panel_px(size.width, scale);
    nav_log(&format!(
        "agent: size={}x{} panel_w={}",
        size.width, size.height, panel_w
    ));
    if size.width <= panel_w + 200 {
        nav_log("agent: window too narrow");
        return;
    }
    let Ok(url) = url.parse() else {
        return;
    };
    let builder = tauri::webview::WebviewBuilder::new("agent", tauri::WebviewUrl::External(url));
    let ide_w = size.width - panel_w;
    match window.add_child(
        builder,
        tauri::PhysicalPosition::new(ide_w as i32, 0),
        tauri::PhysicalSize::new(panel_w, size.height),
    ) {
        Ok(webview) => {
            #[cfg(windows)]
            attach_handlers(&webview, app.clone(), "agent");
            if let Some(main) = app.get_webview("main") {
                let _ = main.set_size(tauri::PhysicalSize::new(ide_w, size.height));
                let _ = main.set_position(tauri::PhysicalPosition::new(0, 0));
            }
            *guard = Some(webview);
            nav_log("agent: created");
        }
        Err(e) => nav_log(&format!("agent: add_child error: {}", e)),
    }
}

fn open_agent_async(app: &tauri::AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Some(url) = agent_url() {
            let inner = handle.clone();
            let _ = handle.run_on_main_thread(move || open_agent(&inner, url));
        }
    });
}

#[cfg(windows)]
fn allowed_main_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("drgx.localhost") {
        return true;
    }
    if host.eq_ignore_ascii_case("127.0.0.1") || host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    false
}

#[cfg(windows)]
fn is_allowed_navigation(uri: &str, target: &str) -> bool {
    if uri == "about:blank" {
        return true;
    }
    let Ok(parsed) = url::Url::parse(uri) else {
        return false;
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return false;
    }
    let host = parsed.host_str().unwrap_or("");
    if target == "agent" {
        if host.eq_ignore_ascii_case("opencode.ai")
            || host.eq_ignore_ascii_case("auth.opencode.ai")
        {
            return true;
        }
        if let Some(daemon) = daemon_url_slot().lock().unwrap().clone() {
            if let Ok(daemon) = url::Url::parse(&daemon) {
                return parsed.host_str() == daemon.host_str()
                    && parsed.port_or_known_default() == daemon.port_or_known_default();
            }
        }
        // Trước khi daemon kịp khởi động, chỉ cho loopback.
        return host.eq_ignore_ascii_case("127.0.0.1") || host.eq_ignore_ascii_case("localhost");
    }
    if !allowed_main_host(host) {
        return false;
    }
    if parsed.path() == "/drgx/setup"
        && (host.eq_ignore_ascii_case("127.0.0.1")
            || host.eq_ignore_ascii_case("localhost")
            || host.eq_ignore_ascii_case("drgx.localhost"))
    {
        return true;
    }
    let expected_port = if web_port() == 80 { None } else { Some(web_port()) };
    parsed.port_or_known_default() == expected_port.or(Some(80))
        || (host.eq_ignore_ascii_case("drgx.localhost") && parsed.port().is_none())
}

fn open_local_html(path: &std::path::Path) {
    if !path.is_file() {
        return;
    }
    let mut cmd = Command::new(system_exe("rundll32.exe"));
    cmd.arg("url.dll,FileProtocolHandler").arg(path);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.spawn();
}

fn open_ecosystem_page() {
    let dir = std::path::PathBuf::from(app_state_dir()).join("ecosystem");
    let _ = std::fs::create_dir_all(&dir);
    let page = dir.join("index.html");
    let logo = dir.join("logo.png");
    let _ = std::fs::write(&page, include_str!("../../../web/ecosystem/index.html"));
    let _ = std::fs::write(&logo, include_bytes!("../../../web/assets/logo.png"));
    open_local_html(&page);
}

#[cfg(windows)]
fn open_external_url(uri: &str) {
    let Ok(parsed) = url::Url::parse(uri) else {
        return;
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return;
    }
    // Không dùng `cmd /C start` vì `&` trong URL có thể chèn lệnh.
    let mut cmd = Command::new(system_exe("rundll32.exe"));
    cmd.arg("url.dll,FileProtocolHandler").arg(parsed.as_str());
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.spawn();
}

#[cfg(windows)]
fn attach_core_handlers(
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    app_handle: tauri::AppHandle,
    target_label: String,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY,
        COREWEBVIEW2_PERMISSION_KIND_CAMERA,
        COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ,
        COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_KIND_MIDI_SYSTEM_EXCLUSIVE_MESSAGES,
        COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS,
        COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS,
        COREWEBVIEW2_PERMISSION_KIND_OTHER_SENSORS,
        COREWEBVIEW2_PERMISSION_KIND_WINDOW_MANAGEMENT,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW, COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
        COREWEBVIEW2_PERMISSION_STATE_DENY,
    };
    use webview2_com::{
        CoTaskMemPWSTR, NavigationStartingEventHandler, NewWindowRequestedEventHandler,
        PermissionRequestedEventHandler, SourceChangedEventHandler,
    };

    let handler = PermissionRequestedEventHandler::create(Box::new(|_sender, args| {
        if let Some(args) = args {
            let mut kind = unsafe { std::mem::zeroed() };
            let state = if unsafe { args.PermissionKind(&mut kind) }.is_err() {
                COREWEBVIEW2_PERMISSION_STATE_DENY
            } else if kind == COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ
                || kind == COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY
            {
                COREWEBVIEW2_PERMISSION_STATE_ALLOW
            } else if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                || kind == COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION
                || kind == COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS
                || kind == COREWEBVIEW2_PERMISSION_KIND_MIDI_SYSTEM_EXCLUSIVE_MESSAGES
                || kind == COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS
                || kind == COREWEBVIEW2_PERMISSION_KIND_OTHER_SENSORS
                || kind == COREWEBVIEW2_PERMISSION_KIND_WINDOW_MANAGEMENT
            {
                COREWEBVIEW2_PERMISSION_STATE_DENY
            } else {
                // File read/write và các quyền lạ: để WebView2 hỏi người dùng.
                COREWEBVIEW2_PERMISSION_STATE_DEFAULT
            };
            let _ = unsafe { args.SetState(state) };
        }
        Ok(())
    }));

    let mut token: i64 = 0;
    let _ = unsafe { core.add_PermissionRequested(&handler, &mut token) };
    std::mem::forget(handler);

    // Chặn điều hướng top-level sang site lạ. Link ngoài được mở bằng trình
    // duyệt mặc định thay vì chạy trong webview có quyền của IDE.
    let nav_target = target_label.clone();
    let navigation = NavigationStartingEventHandler::create(Box::new(move |_sender, args| {
        if let Some(args) = args {
            let mut uri = unsafe { std::mem::zeroed() };
            if unsafe { args.Uri(&mut uri) }.is_ok() {
                let uri = CoTaskMemPWSTR::from(uri).to_string();
                if !is_allowed_navigation(&uri, &nav_target) {
                    let _ = unsafe { args.SetCancel(true) };
                    nav_log("webview: blocked external navigation");
                }
            }
        }
        Ok(())
    }));
    let mut token_nav: i64 = 0;
    let _ = unsafe { core.add_NavigationStarting(&navigation, &mut token_nav) };
    std::mem::forget(navigation);

    let app_for_new_window = app_handle.clone();
    let target_for_new_window = target_label.clone();
    let new_window = NewWindowRequestedEventHandler::create(Box::new(move |_sender, args| {
        if let Some(args) = args {
            let _ = unsafe { args.SetHandled(true) };

            let mut uri = unsafe { std::mem::zeroed() };
            let _ = unsafe { args.Uri(&mut uri) };
            let uri = CoTaskMemPWSTR::from(uri).to_string();
            if is_allowed_navigation(&uri, &target_for_new_window) {
                let label = if target_for_new_window == "agent" {
                    "agent"
                } else {
                    "main"
                };
                if let Some(webview) = tauri::Manager::get_webview(&app_for_new_window, label) {
                    if let Ok(url) = uri.parse() {
                        let _ = webview.navigate(url);
                    }
                }
            } else {
                open_external_url(&uri);
            }
        }
        Ok(())
    }));

    let mut token2: i64 = 0;
    let _ = unsafe { core.add_NewWindowRequested(&new_window, &mut token2) };
    std::mem::forget(new_window);

    if target_label == "main" {
        let app_for_state = app_handle.clone();
        let core_for_source = core.clone();
        let source_changed = SourceChangedEventHandler::create(Box::new(move |_sender, _args| {
            let mut uri = unsafe { std::mem::zeroed() };
            if unsafe { core_for_source.Source(&mut uri) }.is_ok() {
                let url = CoTaskMemPWSTR::from(uri).to_string();
                save_last_folder(&app_for_state, &url);
            }
            Ok(())
        }));
        let mut token3: i64 = 0;
        let _ = unsafe { core.add_SourceChanged(&source_changed, &mut token3) };
        std::mem::forget(source_changed);

        let script = windows_core::HSTRING::from(include_str!("brand.js"));
        let _ = unsafe {
            core.AddScriptToExecuteOnDocumentCreated(
                &script,
                None::<&webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler>,
            )
        };
    }

    if target_label == "agent" {
        let core_for_cookie = core.clone();
        let source_cookie = SourceChangedEventHandler::create(Box::new(move |_sender, _args| {
            let mut uri = unsafe { std::mem::zeroed() };
            if unsafe { core_for_cookie.Source(&mut uri) }.is_ok() {
                let url = CoTaskMemPWSTR::from(uri).to_string();
                if let Some(rest) = url.split("/session/").nth(1) {
                    let sid: String = rest
                        .chars()
                        .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                        .collect();
                    if sid.starts_with("ses_") && sid.len() > 8 {
                        *agent_session_slot().lock().unwrap() = Some(sid);
                        nav_log("agent: session captured");
                    }
                }
                if is_allowed_navigation(&url, "agent") {
                    capture_agent_cookies(&core_for_cookie, &url);
                }
            }
            Ok(())
        }));
        let mut token4: i64 = 0;
        let _ = unsafe { core.add_SourceChanged(&source_cookie, &mut token4) };
        std::mem::forget(source_cookie);

        // Chỉ tiêm bridge token vào đúng cổng của DrgX Neural AI agent. Nếu người dùng
        // điều hướng panel sang một trang loopback khác, trang đó không đọc được
        // token dù cùng chạy trên máy.
        let agent_port = daemon_url_slot()
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .as_deref()
            .and_then(|u| url::Url::parse(u).ok())
            .and_then(|u| u.port_or_known_default())
            .unwrap_or(0);
        let script = format!(
            "window.__DRGX_BRIDGE_TOKEN = ((location.hostname === '127.0.0.1' || location.hostname === 'localhost') && (location.port || '80') === '{}') ? {} : '';\n{}",
            agent_port,
            serde_json::to_string(&bridge_token()).unwrap_or_else(|_| "\"\"".to_string()),
            include_str!("agent_bar.js")
        );
        let script = windows_core::HSTRING::from(script);
        let _ = unsafe {
            core.AddScriptToExecuteOnDocumentCreated(
                &script,
                None::<&webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2AddScriptToExecuteOnDocumentCreatedCompletedHandler>,
            )
        };
        let _ = unsafe {
            core.ExecuteScript(
                &script,
                None::<&webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2ExecuteScriptCompletedHandler>,
            )
        };
    }
}

#[cfg(windows)]
fn attach_handlers(webview: &tauri::Webview, app_handle: tauri::AppHandle, label: &str) {
    let label = label.to_string();
    let _ = webview.with_webview(move |wv| unsafe {
        if let Ok(core) = wv.controller().CoreWebView2() {
            attach_core_handlers(&core, app_handle, label);
        }
    });
}

fn nav_log(msg: &str) {
    use std::io::Write;
    let _guard = LOG_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    if msg.contains("opencode_session_")
        || msg.contains("/auth/connect/")
        || msg.contains("Bearer ")
        || msg.to_ascii_lowercase().contains("cookie=")
    {
        return;
    }
    let dir = std::path::PathBuf::from(app_state_dir()).join("logs");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("app.log");
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > 1024 * 1024 {
            let _ = std::fs::rename(&path, dir.join("app.log.1"));
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(f, "[{}] {}", chrono::Local::now().format("%H:%M:%S%.3f"), msg);
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push(((hi << 4) | lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn state_file(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("last_folder.txt"))
}

fn save_last_folder(app: &tauri::AppHandle, url: &str) {
    let Some(rest) = url.split("folder=").nth(1) else {
        return;
    };
    let raw = rest.split('&').next().unwrap_or("");
    if raw.is_empty() {
        return;
    }
    let decoded = percent_decode(raw);
    let folder = folder_for_web(&decoded);
    if !std::path::Path::new(&web_folder_to_os(&folder)).is_dir() {
        return;
    }
    if let Some(path) = state_file(app) {
        let _ = std::fs::write(path, folder);
    }
}

fn load_last_folder(app: &tauri::AppHandle) -> Option<String> {
    let path = state_file(app)?;
    let value = std::fs::read_to_string(path).ok()?;
    let value = value.trim_start_matches('\u{feff}').trim().to_string();
    if value.is_empty() {
        return None;
    }
    // Tương thích file cũ: có thể là `D:\...` hoặc `\\?\D:\...`.
    let folder = folder_for_web(&value);
    if !std::path::Path::new(&web_folder_to_os(&folder)).is_dir() {
        return None;
    }
    Some(folder)
}

/// Chuyển đường dẫn Windows (kể cả dạng `\\?\D:\...` do canonicalize trả về)
/// thành dạng folder mà VS Code serve-web hiểu: `/D:/Dev/...`.
fn folder_for_web(path: &str) -> String {
    let mut p = path.trim().trim_matches('"');
    if let Some(rest) = p.strip_prefix(r"\\?\UNC\") {
        return format!("//{}", rest.replace('\\', "/"));
    }
    if let Some(rest) = p.strip_prefix(r"\\?\") {
        p = rest;
    }
    let p = p.replace('\\', "/");
    if p.len() >= 2
        && p.as_bytes()[0].is_ascii_alphabetic()
        && p.as_bytes()[1] == b':'
    {
        format!("/{}", p)
    } else {
        p
    }
}

/// Đổi folder dạng web (`/D:/Dev/...`) về đường dẫn Windows để kiểm tra is_dir.
fn web_folder_to_os(path: &str) -> String {
    let p = path.trim();
    if p.len() >= 3 && p.as_bytes()[0] == b'/' && p.as_bytes()[2] == b':' {
        p[1..].replace('/', "\\")
    } else {
        p.replace('/', "\\")
    }
}

fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

const EXT_PKG: &str = include_str!("../../../extension/package.json");
const EXT_WEB: &str = include_str!("../../../extension/dist/web.js");
const EXT_THEME: &str = include_str!("../../../extension/themes/drgx-ion.json");
const EXT_THEME_LIGHT: &str = include_str!("../../../extension/themes/drgx-dawn.json");
const EXT_THEME_NEBULA: &str = include_str!("../../../extension/themes/drgx-nebula.json");
const EXT_THEME_TOKYO: &str = include_str!("../../../extension/themes/drgx-tokyo.json");
const EXT_THEME_MATRIX: &str = include_str!("../../../extension/themes/drgx-matrix.json");
const EXT_ICON: &[u8] = include_bytes!("../../../extension/media/icon.png");
const EXT_INTRO_MP4: &[u8] = include_bytes!("../../../extension/media/drgx-intro.mp4");

/// Loại bỏ comment `//` và `/* */` ngoài chuỗi (JSONC) để parse settings/keybindings an toàn.
fn strip_jsonc(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut keep = vec![true; bytes.len()];
    let mut i = 0usize;
    let mut in_string = false;
    while i < bytes.len() {
        let b = bytes[i];
        if in_string {
            if b == b'\\' && i + 1 < bytes.len() {
                i += 2;
                continue;
            }
            if b == b'"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        match b {
            b'"' => {
                in_string = true;
                i += 1;
            }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'/' => {
                while i < bytes.len() && bytes[i] != b'\n' {
                    keep[i] = false;
                    i += 1;
                }
            }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'*' => {
                keep[i] = false;
                keep[i + 1] = false;
                i += 2;
                while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    keep[i] = false;
                    i += 1;
                }
                if i + 1 < bytes.len() {
                    keep[i] = false;
                    keep[i + 1] = false;
                    i += 2;
                } else if i < bytes.len() {
                    keep[i] = false;
                    i += 1;
                }
            }
            _ => i += 1,
        }
    }
    let filtered: Vec<u8> = bytes
        .iter()
        .enumerate()
        .filter(|(idx, _)| keep[*idx])
        .map(|(_, b)| *b)
        .collect();

    // JSONC cho phép dấu phẩy cuối trước `}`/`]`; serde_json thì không.
    let mut cleaned = Vec::with_capacity(filtered.len());
    let mut i = 0usize;
    let mut in_string = false;
    while i < filtered.len() {
        let b = filtered[i];
        if in_string {
            cleaned.push(b);
            if b == b'\\' && i + 1 < filtered.len() {
                cleaned.push(filtered[i + 1]);
                i += 2;
                continue;
            }
            if b == b'"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if b == b'"' {
            in_string = true;
            cleaned.push(b);
            i += 1;
            continue;
        }
        if b == b',' {
            let mut j = i + 1;
            while j < filtered.len() && filtered[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < filtered.len() && (filtered[j] == b'}' || filtered[j] == b']') {
                i += 1;
                continue;
            }
        }
        cleaned.push(b);
        i += 1;
    }

    String::from_utf8_lossy(&cleaned)
        .trim_start_matches('\u{feff}')
        .to_string()
}

fn parse_jsonc_value(text: &str) -> Option<serde_json::Value> {
    serde_json::from_str::<serde_json::Value>(&strip_jsonc(text)).ok()
}

/// Đọc text an toàn: hỗ trợ UTF-8 (có/không BOM) và UTF-16LE/BE do PowerShell
/// hoặc Notepad tạo ra. Không dùng lossy cho file cấu hình vì sẽ làm hỏng dữ liệu.
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
    String::from_utf8(bytes.to_vec()).map_err(|_| "file không phải UTF-8/UTF-16 hợp lệ".to_string())
}

fn read_existing_text(path: &str) -> Result<Option<String>, String> {
    if !std::path::Path::new(path).exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path).map_err(|e| format!("không đọc được {}: {}", path, e))?;
    decode_text_bytes(&bytes).map(Some)
}

fn backup_raw(path: &str) -> bool {
    let bak = format!("{}.drgx-bak", path);
    if std::path::Path::new(&bak).exists() {
        return true;
    }
    std::fs::copy(path, &bak).is_ok()
}

/// Ghi file JSON nhưng: (1) bỏ qua nếu nội dung không đổi, (2) giữ lại
/// một bản gốc duy nhất dạng `.drgx-bak` trước lần ghi đầu tiên.
/// Trả về false nếu không đọc/ghi được — tuyệt đối không ghi đè mù.
fn backup_then_write(path: &str, text: &str) -> bool {
    if std::path::Path::new(path).exists() {
        match std::fs::read(path) {
            Ok(current) => {
                if current == text.as_bytes() {
                    return true;
                }
                if !backup_raw(path) {
                    nav_log(&format!("write: cannot backup {}", path));
                    return false;
                }
            }
            Err(e) => {
                nav_log(&format!("write: cannot read {}: {}", path, e));
                return false;
            }
        }
    }
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let tmp = format!("{}.drgx-tmp-{}", path, std::process::id());
    if std::fs::write(&tmp, text).is_err() {
        return false;
    }
    match std::fs::rename(&tmp, path) {
        Ok(()) => true,
        Err(_) => {
            let ok = std::fs::write(path, text).is_ok();
            let _ = std::fs::remove_file(&tmp);
            ok
        }
    }
}

/// Merge đảm bảo: giữ 100% settings người dùng (JSONC ok), chỉ chèn/cập nhật key của DrgX.
fn merge_json_object(
    path: &str,
    apply: impl FnOnce(&mut serde_json::Map<String, serde_json::Value>),
) -> bool {
    let exists = std::path::Path::new(path).exists();
    let existing_text = match read_existing_text(path) {
        Ok(Some(text)) => text,
        Ok(None) => String::new(),
        Err(e) => {
            nav_log(&format!("settings: unreadable, skipped {} ({})", path, e));
            return false;
        }
    };
    let mut map = if existing_text.trim().is_empty() {
        serde_json::Map::new()
    } else {
        match parse_jsonc_value(&existing_text) {
            Some(serde_json::Value::Object(v)) => v,
            _ => {
                // Không parse được: tuyệt đối không ghi đè, chỉ giữ bản sao để
                // người dùng có thể sửa tay. Đây là đường dẫn settings sống.
                if exists {
                    let _ = backup_raw(path);
                }
                nav_log(&format!("settings: unparseable, skipped {}", path));
                return false;
            }
        }
    };
    apply(&mut map);
    let formatted =
        serde_json::to_string_pretty(&serde_json::Value::Object(map)).unwrap_or_default();
    if !backup_then_write(path, &formatted) {
        nav_log(&format!("settings: write failed, kept old {}", path));
        return false;
    }
    true
}

/// Merge keybindings của DrgX vào file của người dùng, không xóa gì.
fn merge_keybindings(path: &str) -> bool {
    let ours = serde_json::json!([
        { "key": "f9", "command": "drgx.run", "when": "editorTextFocus" },
        { "key": "f5", "command": "drgx.test", "when": "editorTextFocus && !inDebugMode" },
        { "key": "ctrl+alt+r", "command": "drgx.run", "when": "editorTextFocus" },
        { "key": "ctrl+alt+t", "command": "drgx.test", "when": "editorTextFocus" },
        { "key": "ctrl+alt+c", "command": "drgx.insertCP", "when": "editorTextFocus" },
        { "key": "ctrl+alt+j", "command": "drgx.judge" },
        { "key": "ctrl+alt+s", "command": "drgx.studio" },
        { "key": "ctrl+alt+l", "command": "drgx.learn" },
        { "key": "ctrl+alt+a", "command": "drgx.aura", "when": "editorTextFocus" }
    ]);
    let exists = std::path::Path::new(path).exists();
    let text = match read_existing_text(path) {
        Ok(Some(text)) => text,
        Ok(None) => String::new(),
        Err(e) => {
            nav_log(&format!("keybindings: unreadable, skipped {} ({})", path, e));
            return false;
        }
    };
    let mut user: Vec<serde_json::Value> = if text.trim().is_empty() {
        Vec::new()
    } else {
        match parse_jsonc_value(&text).and_then(|v| v.as_array().cloned()) {
            Some(items) => items,
            None => {
                if exists {
                    let _ = backup_raw(path);
                }
                nav_log(&format!("keybindings: unparseable, skipped {}", path));
                return false;
            }
        }
    };
    // Dọn keybinding VPN của bản cũ; không đụng các phím khác của người dùng.
    user.retain(|item| {
        let command = item.get("command").and_then(|c| c.as_str()).unwrap_or("");
        !matches!(command, "drgx.vpn" | "drgx.vpn.toggle" | "drgx.vpn.test")
    });
    let extra = ours.as_array().cloned().unwrap_or_default();
    for item in &extra {
        let exists = user.iter().any(|u| {
            u.get("key").and_then(|k| k.as_str()) == item.get("key").and_then(|k| k.as_str())
                && u.get("command").and_then(|c| c.as_str())
                    == item.get("command").and_then(|c| c.as_str())
        });
        if !exists {
            user.push(item.clone());
        }
    }
    let formatted = serde_json::to_string_pretty(&serde_json::Value::Array(user)).unwrap_or_default();
    if !backup_then_write(path, &formatted) {
        nav_log(&format!("keybindings: write failed, kept old {}", path));
        return false;
    }
    true
}

fn ext_version() -> String {
    EXT_PKG
        .lines()
        .find(|l| l.trim_start().starts_with("\"version\""))
        .and_then(|l| l.split('"').nth(3))
        .unwrap_or("0.0.0")
        .to_string()
}

fn install_copilot_extension() {
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    if home.is_empty() {
        return;
    }
    let targets = [
        format!("{}\\.vscode-server\\extensions", home),
        format!("{}\\.vscode\\extensions", home),
    ];
    let version = ext_version();
    let name = format!("drgx.drgx-copilot-{}", version);
    let token_js = format!("module.exports = {{ token: {:?} }};\n", bridge_token());

    for ext_root in targets {
        if !std::path::Path::new(&ext_root).exists() {
            let _ = std::fs::create_dir_all(&ext_root);
        }
        let dir = format!("{}\\{}", ext_root, name);
        let web_path = format!("{}\\dist\\web.js", dir);
        let token_path = format!("{}\\dist\\bridge-token.js", dir);
        let pkg_path = format!("{}\\package.json", dir);
        let theme_path = format!("{}\\themes\\drgx-ion.json", dir);
        let theme_light_path = format!("{}\\themes\\drgx-dawn.json", dir);
        let theme_nebula_path = format!("{}\\themes\\drgx-nebula.json", dir);
        let theme_tokyo_path = format!("{}\\themes\\drgx-tokyo.json", dir);
        let theme_matrix_path = format!("{}\\themes\\drgx-matrix.json", dir);
        let icon_path = format!("{}\\media\\icon.png", dir);
        let intro_mp4_path = format!("{}\\media\\drgx-intro.mp4", dir);

        let up_to_date = std::fs::read_to_string(&web_path)
            .map(|s| s == EXT_WEB)
            .unwrap_or(false)
            && std::fs::read_to_string(&token_path)
                .map(|s| s == token_js)
                .unwrap_or(false)
            && std::fs::read_to_string(&pkg_path)
                .map(|s| s == EXT_PKG)
                .unwrap_or(false)
            && std::fs::read_to_string(&theme_path)
                .map(|s| s == EXT_THEME)
                .unwrap_or(false)
            && std::fs::read_to_string(&theme_light_path)
                .map(|s| s == EXT_THEME_LIGHT)
                .unwrap_or(false)
            && std::fs::read_to_string(&theme_nebula_path)
                .map(|s| s == EXT_THEME_NEBULA)
                .unwrap_or(false)
            && std::fs::read_to_string(&theme_tokyo_path)
                .map(|s| s == EXT_THEME_TOKYO)
                .unwrap_or(false)
            && std::fs::read_to_string(&theme_matrix_path)
                .map(|s| s == EXT_THEME_MATRIX)
                .unwrap_or(false)
            && std::fs::read(&icon_path)
                .map(|b| b == EXT_ICON)
                .unwrap_or(false)
            && std::fs::read(&intro_mp4_path)
                .map(|b| b == EXT_INTRO_MP4)
                .unwrap_or(false);
        if !up_to_date {
            let _ = std::fs::create_dir_all(format!("{}\\dist", dir));
            let _ = std::fs::create_dir_all(format!("{}\\themes", dir));
            let _ = std::fs::create_dir_all(format!("{}\\media", dir));
            let _ = std::fs::write(&pkg_path, EXT_PKG);
            let _ = std::fs::write(&web_path, EXT_WEB);
            let _ = std::fs::write(&token_path, &token_js);
            let _ = std::fs::write(&theme_path, EXT_THEME);
            let _ = std::fs::write(&theme_light_path, EXT_THEME_LIGHT);
            let _ = std::fs::write(&theme_nebula_path, EXT_THEME_NEBULA);
            let _ = std::fs::write(&theme_tokyo_path, EXT_THEME_TOKYO);
            let _ = std::fs::write(&theme_matrix_path, EXT_THEME_MATRIX);
            let _ = std::fs::write(&icon_path, EXT_ICON);
            let _ = std::fs::write(&intro_mp4_path, EXT_INTRO_MP4);
            nav_log(&format!("extension: wrote {}", name));
        }
        if let Ok(dirs) = std::fs::read_dir(&ext_root) {
            for entry in dirs.flatten() {
                let n = entry.file_name().to_string_lossy().to_string();
                if (n.starts_with("drgx.drgx-copilot-") && n != name)
                    || n.starts_with("vietcode.vietcode-copilot-")
                {
                    let _ = std::fs::remove_dir_all(entry.path());
                    nav_log(&format!("extension: removed stale {}", n));
                }
            }
        }

        let manifest_path = format!("{}\\extensions.json", ext_root);
        let manifest_exists = std::path::Path::new(&manifest_path).exists();
        let manifest_text = match read_existing_text(&manifest_path) {
            Ok(Some(text)) => text,
            Ok(None) => String::new(),
            Err(e) => {
                nav_log(&format!(
                    "extension: manifest unreadable, skipped {} ({})",
                    manifest_path, e
                ));
                continue;
            }
        };
        let mut entries: Vec<serde_json::Value> = if manifest_text.trim().is_empty() {
            Vec::new()
        } else {
            match serde_json::from_str::<serde_json::Value>(&manifest_text) {
                Ok(serde_json::Value::Array(items)) => items,
                _ => {
                    if manifest_exists {
                        let _ = backup_raw(&manifest_path);
                    }
                    nav_log("extension: manifest unparseable, skipped");
                    continue;
                }
            }
        };
        let current = entries.iter().any(|e| {
            e.pointer("/identifier/id").and_then(|v| v.as_str())
                == Some("drgx.drgx-copilot")
                && e.get("version").and_then(|v| v.as_str()) == Some(version.as_str())
        });
        if !current {
            entries.retain(|e| {
                let id = e.pointer("/identifier/id").and_then(|v| v.as_str());
                id != Some("drgx.drgx-copilot") && id != Some("vietcode.vietcode-copilot")
            });
            let slash = dir.replace('\\', "/");
            entries.push(serde_json::json!({
                "identifier": {"id": "drgx.drgx-copilot"},
                "version": version,
                "location": {
                    "$mid": 1,
                    "fsPath": dir,
                    "_sep": 1,
                    "external": format!("file:///{}", url_encode(&slash)),
                    "path": format!("/{}", slash),
                    "scheme": "file"
                },
                "relativeLocation": name
            }));
            if let Ok(text) = serde_json::to_string(&serde_json::Value::Array(entries)) {
                backup_then_write(&manifest_path, &text);
                nav_log("extension: manifest updated");
            }
        }
    }

    // Chỉ đặt mặc định cho các key chưa có. Không bao giờ đè lựa chọn của
    // người dùng (theme, proxy, env terminal, update mode...).
    let settings_dirs = [
        format!("{}\\.vscode-server\\data\\User", home),
        format!("{}\\.vscode-server\\data\\Machine", home),
        format!("{}\\AppData\\Roaming\\Code\\User", home),
    ];
    for s_dir in settings_dirs {
        if !std::path::Path::new(&s_dir).exists() {
            let _ = std::fs::create_dir_all(&s_dir);
        }
        let settings_file = format!("{}\\settings.json", s_dir);
        merge_json_object(&settings_file, |settings| {
            cleanup_legacy_vpn_settings(settings);
            for (key, value) in [
                ("editor.inlineSuggest.enabled", serde_json::json!(true)),
                ("editor.inlineSuggest.showToolbar", serde_json::json!("always")),
                ("editor.inlineSuggest.suppressSuggestions", serde_json::json!(false)),
                ("editor.suggest.preview", serde_json::json!(true)),
                (
                    "editor.quickSuggestions",
                    serde_json::json!({
                        "other": "on",
                        "comments": "on",
                        "strings": "on"
                    }),
                ),
                ("editor.acceptSuggestionOnEnter", serde_json::json!("on")),
                ("editor.suggestOnTriggerCharacters", serde_json::json!(true)),
                ("drgxCopilot.enabled", serde_json::json!(true)),
                ("drgxCopilot.cpPredictor", serde_json::json!(true)),
                ("drgxCopilot.autoTrigger", serde_json::json!(true)),
                ("drgxCopilot.delayMs", serde_json::json!(100)),
                ("drgxCopilot.judgeTimeLimit", serde_json::json!(6000)),
                ("drgxCopilot.autoOpenHome", serde_json::json!(true)),
                ("workbench.colorTheme", serde_json::json!("DrgX Ion")),
                ("workbench.startupEditor", serde_json::json!("none")),
                // Mặc định "IDE đã sẵn sàng": tự lưu, dọn file sạch, cuộn mượt
                // và giảm các gợi ý/experiment gây nhiễu cho học sinh.
                ("files.autoSave", serde_json::json!("afterDelay")),
                ("files.autoSaveDelay", serde_json::json!(1000)),
                ("files.trimTrailingWhitespace", serde_json::json!(true)),
                ("files.insertFinalNewline", serde_json::json!(true)),
                ("files.trimFinalNewlines", serde_json::json!(true)),
                ("editor.stickyScroll.enabled", serde_json::json!(true)),
                ("editor.smoothScrolling", serde_json::json!(true)),
                ("editor.cursorBlinking", serde_json::json!("smooth")),
                ("editor.cursorSmoothCaretAnimation", serde_json::json!("on")),
                ("editor.cursorWidth", serde_json::json!(2)),
                (
                    "editor.fontFamily",
                    serde_json::json!("'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace"),
                ),
                ("editor.fontLigatures", serde_json::json!(true)),
                ("editor.fontSize", serde_json::json!(14)),
                ("editor.lineHeight", serde_json::json!(22)),
                ("editor.mouseWheelZoom", serde_json::json!(true)),
                ("editor.padding", serde_json::json!({ "top": 10, "bottom": 10 })),
                ("editor.bracketPairColorization.enabled", serde_json::json!(true)),
                ("editor.guides.bracketPairs", serde_json::json!("active")),
                ("editor.renderWhitespace", serde_json::json!("selection")),
                ("workbench.list.smoothScrolling", serde_json::json!(true)),
                ("workbench.tips.enabled", serde_json::json!(false)),
                ("workbench.enableExperiments", serde_json::json!(false)),
                ("explorer.compactFolders", serde_json::json!(false)),
                ("breadcrumbs.enabled", serde_json::json!(true)),
                ("workbench.editor.tabSizing", serde_json::json!("shrink")),
                ("terminal.integrated.gpuAcceleration", serde_json::json!("on")),
                ("terminal.integrated.smoothScrolling", serde_json::json!(true)),
                (
                    "workbench.welcomePage.walkthroughs.openOnInstall",
                    serde_json::json!(false),
                ),
                // IDE local cho học sinh: tắt Restricted Mode để extension,
                // terminal và trình biên dịch hoạt động ngay khi mở thư mục mới.
                ("security.workspace.trust.enabled", serde_json::json!(false)),
                // Hồ sơ làm việc tự cài extension từ Marketplace; cho phép cài
                // các publisher thuộc bộ hồ sơ mà không hỏi lại từng extension.
                // Người dùng có thể siết lại bằng extensions.allowed trong Settings.
                // Phải có thêm một publisher cụ thể: VS Code coi object chỉ có
                // {"*": true} là giá trị mặc định và vẫn hỏi trust từng publisher.
                ("extensions.allowed", serde_json::json!({"*": true, "drgx": true})),
                // Tài liệu mẫu của DrgX là tiếng Việt; từ điển mặc định của
                // Code Spell Checker chỉ có tiếng Anh nên sẽ báo hàng chục lỗi
                // giả trong tab Problems. Tắt kiểm tra chính tả cho Markdown.
                ("cSpell.enabledFileTypes", serde_json::json!(["!markdown"])),
                ("extensions.autoUpdate", serde_json::json!(false)),
                ("git.openRepositoryInParentFolders", serde_json::json!("never")),
                ("update.mode", serde_json::json!("none")),
                ("update.showInstallUpdates", serde_json::json!(false)),
            ] {
                settings
                    .entry(key.to_string())
                    .or_insert(value);
            }
        });
        let kb_file = format!("{}\\keybindings.json", s_dir);
        merge_keybindings(&kb_file);
    }
}

/// Dọn dấu vết VPN của bản DrgX cũ. Chỉ tác động khi có marker DRGX_VPN do
/// chính DrgX ghi, để không xóa proxy/env do người dùng tự đặt.
fn cleanup_legacy_vpn_settings(settings: &mut serde_json::Map<String, serde_json::Value>) {
    let env_key = "terminal.integrated.env.windows";
    let marker = settings
        .get(env_key)
        .and_then(|v| v.as_object())
        .map(|env| env.contains_key("DRGX_VPN") || env.contains_key("DRGX_VPN_NODE"))
        .unwrap_or(false);
    if !marker {
        return;
    }

    let mut env_empty = false;
    if let Some(serde_json::Value::Object(env)) = settings.get_mut(env_key) {
        for key in [
            "DRGX_VPN",
            "DRGX_VPN_NODE",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
            "http_proxy",
            "https_proxy",
            "all_proxy",
            "GIT_HTTP_PROXY",
        ] {
            env.remove(key);
        }
        env_empty = env.is_empty();
    }
    if env_empty {
        settings.remove(env_key);
    }

    let proxy_support = settings
        .get("http.proxySupport")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let proxy = settings
        .get("http.proxy")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let weak_ssl = settings
        .get("http.proxyStrictSSL")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    if (proxy_support == "off" && proxy.is_empty())
        || (proxy_support == "override" && !weak_ssl)
    {
        settings.remove("http.proxy");
        settings.remove("http.proxySupport");
        settings.remove("http.proxyStrictSSL");
    }
}

fn cleanup_legacy_state() {
    let state = app_state_dir();
    let _ = std::fs::remove_file(format!("{}\\vpn.json", state));
    // Log cũ nằm trong %TEMP% và từng chứa cookie/pairing token.
    let _ = std::fs::remove_file(std::env::temp_dir().join("drgx-nav.log"));
}

/// Trả về thư mục serve-web mới nhất trong ~/.vscode/cli/serve-web (ưu tiên mtime).
fn serve_web_dir() -> Option<String> {
    let root = format!(
        "{}\\.vscode\\cli\\serve-web",
        std::env::var("USERPROFILE").unwrap_or_default()
    );
    let mut best: Option<(std::time::SystemTime, String)> = None;
    if let Ok(entries) = std::fs::read_dir(&root) {
        for e in entries.flatten() {
            let path = e.path();
            // Chỉ nhận bản server đầy đủ. Thư mục `.staging-*` (đang tải dở)
            // cũng nằm trong cache và thường mới hơn bản hoàn chỉnh; nếu chọn
            // nhầm, app sẽ vá branding vào chỗ dở và không chạy được server.
            if !path.is_dir()
                || !path.join("out").join("server-main.js").is_file()
                || !path.join("node.exe").is_file()
                || !path.join("bin").join("code-server.cmd").is_file()
            {
                continue;
            }
            let t = path
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            if best.as_ref().map_or(true, |(bt, _)| t > *bt) {
                best = Some((t, path.to_string_lossy().to_string()));
            }
        }
    }
    best.map(|(_, d)| d)
}

/// Thay giá trị field chuỗi trong file JSON thuần theo dạng "field":"value".
fn replace_json_field(text: &str, field: &str, value: &str) -> Option<String> {
    let needle = format!("\"{}\"", field);
    let idx = text.find(&needle)?;
    let after = &text[idx + needle.len()..];
    let colon = after.find(':')?;
    let rest = &after[colon + 1..];
    let lead = rest.len() - rest.trim_start().len();
    let val = rest.trim_start();
    if !val.starts_with('"') {
        return None;
    }
    let close = val[1..].find('"')? + 1;
    let mut out = String::with_capacity(text.len() + value.len() + 8);
    out.push_str(&text[..idx]);
    out.push_str(&needle);
    out.push_str(&after[..colon + 1]);
    out.push_str(&after[colon + 1..][..lead]);
    out.push('"');
    out.push_str(value);
    out.push('"');
    out.push_str(&val[close + 1..]);
    Some(out)
}

/// Tự patch branding + CSP cho serve-web mới (khi VS Code update sang hash thư mục mới).
/// Trả về true nếu vừa patch CSP trong lần chạy này (cần restart server).
fn ensure_serve_web_branding() -> bool {
    let mut patched_csp = false;
    let mut patched_product = false;
    let Some(dir) = serve_web_dir() else {
        return false;
    };
    let hash = std::path::Path::new(&dir)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let backup_root = format!(
        "{}\\vn.drgx.ide\\branding_backup\\{}",
        std::env::var("APPDATA").unwrap_or_default(),
        hash
    );
    let backup = |rel: &str, src: &str| {
        if std::path::Path::new(src).exists() {
            let target = format!("{}\\{}", backup_root, rel.replace(['\\', '/'], "_").replace(':', "_"));
            if !std::path::Path::new(&target).exists() {
                if let Some(parent) = std::path::Path::new(&target).parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::copy(src, &target);
            }
        }
    };

    // 1. product.json — danh tính: tên + applicationName
    let pj = format!("{}\\product.json", dir);
    if let Ok(text) = std::fs::read_to_string(&pj) {
        let mut next = text.clone();
        let mut changed = false;
        for (field, value) in [
            ("nameLong", "DrgX IDE"),
            ("nameShort", "DrgX"),
            ("applicationName", "DrgX"),
        ] {
            if let Some(n2) = replace_json_field(&next, field, value) {
                if n2 != next {
                    next = n2;
                    changed = true;
                }
            }
        }
        // Các publisher thuộc bộ Hồ sơ làm việc được tin cậy sẵn để VS Code
        // không hỏi "Trust Publisher" cho từng extension khi cài tự động.
        // Chỉ publisher tuyển chọn; extension ngoài danh sách vẫn hỏi.
        const TRUSTED_PUBLISHERS: &[&str] = &[
            "drgx",
            "microsoft",
            "github",
            "openai",
            "ms-vscode",
            "ms-python",
            "ms-dotnettools",
            "ms-toolsai",
            "dart-code",
            "esbenp",
            "dbaeumer",
            "ritwickdey",
            "formulahendry",
            "bradlc",
            "vsciot-vscode",
            "editorconfig",
            "streetsidesoftware",
        ];
        if let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&next) {
            let mut trust_changed = false;
            if value.is_object() {
                if value.get("trustedExtensionPublishers").is_none() {
                    value["trustedExtensionPublishers"] = serde_json::json!([]);
                }
                if let Some(list) = value
                    .get_mut("trustedExtensionPublishers")
                    .and_then(|v| v.as_array_mut())
                {
                    for publisher in TRUSTED_PUBLISHERS {
                        let exists = list.iter().any(|v| {
                            v.as_str()
                                .map(|s| s.eq_ignore_ascii_case(publisher))
                                .unwrap_or(false)
                        });
                        if !exists {
                            list.push(serde_json::json!(publisher));
                            trust_changed = true;
                        }
                    }
                }
                if trust_changed {
                    if let Ok(pretty) = serde_json::to_string_pretty(&value) {
                        next = pretty;
                        changed = true;
                    }
                }
            }
        }
        if changed {
            backup("product.json", &pj);
            let _ = std::fs::write(&pj, next);
            nav_log("branding: product.json patched");
            patched_product = true;
        }
    }

    // 2. manifest.json — PWA name + ngôn ngữ
    let mf = format!("{}\\resources\\server\\manifest.json", dir);
    if let Ok(text) = std::fs::read_to_string(&mf) {
        let mut next = text.clone();
        for (field, value) in [
            ("name", "DrgX IDE"),
            ("short_name", "DrgX"),
            ("lang", "vi"),
        ] {
            if let Some(n2) = replace_json_field(&next, field, value) {
                next = n2;
            }
        }
        for icon in ["code-192.png", "code-512.png"] {
            let versioned = format!("{}?{}", icon, BRAND_CACHE_BUST);
            if !next.contains(&versioned) {
                next = next.replace(icon, &versioned);
            }
        }
        if next != text {
            backup("resources_server_manifest.json", &mf);
            let _ = std::fs::write(&mf, next);
            nav_log("branding: manifest.json patched");
        }
    }

    // 3. favicon.ico
    let fav = format!("{}\\resources\\server\\favicon.ico", dir);
    backup("resources_server_favicon.ico", &fav);
    let existing = std::fs::read(&fav).unwrap_or_default();
    if existing != ICON_ICO_BYTES {
        if let Some(parent) = std::path::Path::new(&fav).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if std::fs::write(&fav, ICON_ICO_BYTES).is_ok() {
            nav_log("branding: favicon patched");
        } else {
            nav_log("branding: favicon write failed (file locked?)");
        }
    }

    // 4. Logo/chữ ký trong workbench: titlebar, banner, watermark editor trống, PWA.
    // VS Code lưu các asset này trong nhiều thư mục; patch cả bản sao để không
    // còn logo Microsoft/VS Code xuất hiện sau mỗi lần serve-web update.
    let patch_asset = |rel: &str, bytes: &[u8], backup_name: &str, label: &str| -> bool {
        let path = format!("{}\\{}", dir, rel);
        if std::fs::read(&path).ok().as_deref() == Some(bytes) {
            return false;
        }
        backup(backup_name, &path);
        if let Some(parent) = std::path::Path::new(&path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        match std::fs::write(&path, bytes) {
            Ok(_) => {
                nav_log(&format!("branding: {} patched", label));
                true
            }
            Err(_) => {
                nav_log(&format!("branding: {} write failed (file locked?)", label));
                false
            }
        }
    };
    for (rel, bytes, backup_name, label) in [
        (
            "out\\media\\code-icon.svg",
            BRAND_CODE_ICON_SVG,
            "out_media_code-icon.svg",
            "workbench titlebar icon",
        ),
        (
            "out\\vs\\workbench\\browser\\media\\code-icon.svg",
            BRAND_CODE_ICON_SVG,
            "out_vs_workbench_browser_media_code-icon.svg",
            "workbench code icon",
        ),
        (
            "out\\media\\letterpress-dark.svg",
            BRAND_LETTERPRESS_DARK,
            "out_media_letterpress-dark.svg",
            "empty editor watermark (dark)",
        ),
        (
            "out\\media\\letterpress-hcDark.svg",
            BRAND_LETTERPRESS_HCDARK,
            "out_media_letterpress-hcDark.svg",
            "empty editor watermark (hc dark)",
        ),
        (
            "out\\media\\letterpress-light.svg",
            BRAND_LETTERPRESS_LIGHT,
            "out_media_letterpress-light.svg",
            "empty editor watermark (light)",
        ),
        (
            "out\\media\\letterpress-hcLight.svg",
            BRAND_LETTERPRESS_HCLIGHT,
            "out_media_letterpress-hcLight.svg",
            "empty editor watermark (hc light)",
        ),
        (
            "resources\\server\\code-192.png",
            BRAND_CODE_192_PNG,
            "resources_server_code-192.png",
            "PWA icon 192",
        ),
        (
            "resources\\server\\code-512.png",
            BRAND_CODE_512_PNG,
            "resources_server_code-512.png",
            "PWA icon 512",
        ),
        (
            "extensions\\github-authentication\\media\\code-icon.svg",
            BRAND_CODE_ICON_SVG,
            "extensions_github-authentication_media_code-icon.svg",
            "GitHub auth code icon",
        ),
        (
            "extensions\\github-authentication\\media\\sessions-icon.svg",
            BRAND_CODE_ICON_SVG,
            "extensions_github-authentication_media_sessions-icon.svg",
            "GitHub auth sessions icon",
        ),
        (
            "extensions\\github-authentication\\media\\icon.png",
            BRAND_CODE_192_PNG,
            "extensions_github-authentication_media_icon.png",
            "GitHub auth icon",
        ),
        (
            "extensions\\github-authentication\\media\\favicon.ico",
            ICON_ICO_BYTES,
            "extensions_github-authentication_media_favicon.ico",
            "GitHub auth favicon",
        ),
    ] {
        patch_asset(rel, bytes, backup_name, label);
    }

    // 5. workbench.html — tiêu đề PWA + fallback khi script bị chặn.
    let wh = format!("{}\\out\\vs\\code\\browser\\workbench\\workbench.html", dir);
    if let Ok(text) = std::fs::read_to_string(&wh) {
        let mut next = text.clone();
        for (old, new) in [
            ("<html>", "<html lang=\"vi\">"),
            (
                "<meta name=\"apple-mobile-web-app-title\" content=\"Code\">",
                "<meta name=\"apple-mobile-web-app-title\" content=\"DrgX\">",
            ),
            (
                "<h1>The editor failed to load</h1>",
                "<h1>DrgX chưa tải được trình soạn thảo</h1>",
            ),
            (
                "<p>A proxy, browser extension or content filter may be blocking or modifying this page's scripts. Check the browser developer tools console for Content Security Policy errors.</p>",
                "<p>Proxy, extension trình duyệt hoặc bộ lọc nội dung có thể đang chặn script của DrgX. Hãy mở DevTools Console để kiểm tra lỗi Content Security Policy.</p>",
            ),
        ] {
            if next.contains(old) {
                next = next.replace(old, new);
            }
        }
        // URL asset có cache 1 năm; thêm version để WebView2 không dùng logo cũ.
        for (old, suffix) in [
            (
                "<link rel=\"stylesheet\" href=\"{{WORKBENCH_WEB_BASE_URL}}/out/vs/code/browser/workbench/workbench.css\">",
                "workbench.css",
            ),
            (
                "<link rel=\"icon\" href=\"{{WORKBENCH_WEB_BASE_URL}}/resources/server/favicon.ico\" type=\"image/x-icon\" />",
                "favicon.ico",
            ),
            (
                "<link rel=\"apple-touch-icon\" href=\"{{WORKBENCH_WEB_BASE_URL}}/resources/server/code-192.png\" />",
                "code-192.png",
            ),
            (
                "<link rel=\"manifest\" href=\"{{WORKBENCH_WEB_BASE_URL}}/resources/server/manifest.json\" crossorigin=\"use-credentials\" />",
                "manifest.json",
            ),
        ] {
            let versioned_needle = format!("{}?{}", suffix, BRAND_CACHE_BUST);
            if next.contains(old) && !next.contains(&versioned_needle) {
                let versioned = old.replace(suffix, &versioned_needle);
                next = next.replace(old, &versioned);
            }
        }
        if next != text {
            backup("out_workbench_workbench.html", &wh);
            let _ = std::fs::write(&wh, next);
            nav_log("branding: workbench.html patched");
        }
    }

    // 5b. workbench.css — version hóa URL logo/watermark đã cache 1 năm.
    let wc = format!(
        "{}\\out\\vs\\code\\browser\\workbench\\workbench.css",
        dir
    );
    if let Ok(text) = std::fs::read_to_string(&wc) {
        let mut next = text.clone();
        for asset in [
            "code-icon.svg",
            "letterpress-dark.svg",
            "letterpress-hcDark.svg",
            "letterpress-light.svg",
            "letterpress-hcLight.svg",
        ] {
            let old = format!("media/{}", asset);
            let new = format!("media/{}?{}", asset, BRAND_CACHE_BUST);
            if next.contains(&old) && !next.contains(&new) {
                next = next.replace(&old, &new);
            }
        }
        if next != text {
            backup("out_workbench_workbench.css", &wc);
            match std::fs::write(&wc, next) {
                Ok(_) => nav_log("branding: workbench.css cache-busted"),
                Err(_) => nav_log("branding: workbench.css write failed (file locked?)"),
            }
        }
    }

    // 6. out/server-main.js:
    //    - CSP: cho phép extension fetch qua proxy 127.0.0.1.
    //    - Tắt workspace trust ở tầng workbench web. Nếu chỉ đặt
    //      security.workspace.trust.enabled=false thì sau Reload Window
    //      workbench vẫn có thể quay lại Restricted Mode (extensions/terminal
    //      bị hạn chế). Server đọc enableWorkspaceTrust từ HTML nên phải vá
    //      trực tiếp giá trị này.
    let sm = format!("{}\\out\\server-main.js", dir);
    if let Ok(text) = std::fs::read_to_string(&sm) {
        let mut next = text.clone();
        let mut changed = false;
        let csp_old = "connect-src 'self' ws: wss: https:;";
        let csp_new = "connect-src 'self' ws: wss: https: http://127.0.0.1:* http://localhost:*;";
        if next.contains(csp_old) {
            next = next.replace(csp_old, csp_new);
            changed = true;
        } else if !next.contains(csp_new) {
            nav_log("branding: csp pattern not found");
        }
        let trust_old = "enableWorkspaceTrust:!this._environmentService.args[\"disable-workspace-trust\"]";
        let trust_new = "enableWorkspaceTrust:!1";
        if next.contains(trust_old) {
            next = next.replace(trust_old, trust_new);
            changed = true;
        }
        if changed {
            backup("out_server-main.js", &sm);
            if std::fs::write(&sm, next).is_ok() {
                nav_log("branding: csp/workspace-trust patched (serve-web mới — sẽ restart server nếu đang chạy)");
                patched_csp = true;
            }
        }
    }
    patched_csp || patched_product
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(
            |app, args, _cwd| {
                // Lần chạy thứ hai: đưa cửa sổ đang mở lên trước,
                // và nếu được truyền folder thì navigate chính webview cũ.
                nav_log(&format!("single-instance: args={}", args.len()));
                let folder = args.iter().nth(1).and_then(|arg| {
                    let p = std::path::PathBuf::from(arg);
                    if p.is_dir() {
                        std::fs::canonicalize(&p)
                            .ok()
                            .map(|c| folder_for_web(&c.to_string_lossy()))
                    } else if p.is_file() {
                        p.parent()
                            .and_then(|parent| std::fs::canonicalize(parent).ok())
                            .map(|c| folder_for_web(&c.to_string_lossy()))
                    } else {
                        None
                    }
                });
                if let Some(folder) = folder {
                    let url = format!("{}/?folder={}", web_url(), url_encode(&folder));
                    let app_h = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        if let Some(webview) = app_h.get_webview("main") {
                            if let Ok(u) = url.parse() {
                                let _ = webview.navigate(u);
                            }
                        }
                        if let Some(window) = app_h.get_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    });
                } else if let Some(window) = app.get_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            },
        ))
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            *PANEL_WIDTH_STATE.lock().unwrap() = load_panel_width();

            #[cfg(windows)]
            if let Some(webview) = app.get_webview("main") {
                attach_handlers(&webview, app.handle().clone(), "main");
            }

            let open_folder =
                MenuItemBuilder::with_id("open_folder", "Mở thư mục...").build(app)?;
            let studio = MenuItemBuilder::with_id("studio", "🚀 Mở DrgX Studio (Native App)")
                .accelerator("Ctrl+Alt+S")
                .build(app)?;
            let agent = MenuItemBuilder::with_id("agent", "Trợ lý AI")
                .accelerator("Ctrl+Shift+A")
                .build(app)?;
            let learn = MenuItemBuilder::with_id("learn", "Hệ sinh thái DrgX")
                .accelerator("Ctrl+Alt+L")
                .build(app)?;
            let file_menu = SubmenuBuilder::new(app, "Tệp")
                .item(&open_folder)
                .item(&studio)
                .separator()
                .item(&agent)
                .item(&learn)
                .build()?;
            let menu = MenuBuilder::new(app).items(&[&file_menu]).build()?;
            app.set_menu(menu)?;

            nav_log("setup: begin");
            cleanup_legacy_state();
            let _ = bridge_token();
            add_bundled_cli_to_path();
            nav_log("setup: extension install begin");
            install_copilot_extension();
            nav_log("setup: extension install done");
            let mut pids = Vec::new();
            nav_log("setup: web server begin");
            let (web_port_used, web_pid, web_error) = ensure_web_server();
            nav_log("setup: web server done");
            set_setup_error(web_error);
            *WEB_PORT_STATE.lock().unwrap_or_else(|p| p.into_inner()) = web_port_used;
            if let Some(pid) = web_pid {
                pids.push(pid);
            }
            app.manage(Servers(std::sync::Mutex::new(pids)));
            app.manage(AgentPanel(std::sync::Mutex::new(None)));

            start_api_proxy();
            start_inbox_pump();

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut url = None;
                for _ in 0..40 {
                    if let Some(u) = agent_url() {
                        url = Some(u);
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
                if let Some(url) = url {
                    let inner = handle.clone();
                    let _ = handle.run_on_main_thread(move || open_agent(&inner, url));
                } else {
                    nav_log("agent: no url after retries");
                }
            });

            let web_handle = app.handle().clone();
            std::thread::spawn(move || {
                nav_log("web thread start");
                for _ in 0..240 {
                    if setup_error().is_some() {
                        break;
                    }
                    if port_up(web_port()) {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(500));
                }
                nav_log(&format!("port_up({}) = {}", web_port(), port_up(web_port())));

                // Support opening directory from command line arguments (e.g. drgx ide <dir>)
                let cli_target = std::env::args().nth(1).and_then(|arg| {
                    let p = std::path::PathBuf::from(&arg);
                    if p.is_dir() {
                        std::fs::canonicalize(&p)
                            .ok()
                            .map(|c| folder_for_web(&c.to_string_lossy()))
                    } else if p.is_file() {
                        p.parent()
                            .and_then(|parent| std::fs::canonicalize(parent).ok())
                            .map(|c| folder_for_web(&c.to_string_lossy()))
                    } else {
                        None
                    }
                });

                let initial_folder = cli_target.or_else(|| load_last_folder(&web_handle));
                let url = if setup_error().is_some() {
                    proxy_setup_url().unwrap_or_else(|| format!("{}/", web_url()))
                } else {
                    match initial_folder {
                        Some(folder) => format!("{}/?folder={}", web_url(), url_encode(&folder)),
                        None => format!("{}/", web_url()),
                    }
                };
                nav_log("target folder resolved");
                let inner = web_handle.clone();
                let queued = web_handle.run_on_main_thread(move || {
                    nav_log("on main thread");
                    match tauri::Manager::get_webview(&inner, "main") {
                        Some(webview) => {
                            nav_log("webview found");
                            match url.parse() {
                                Ok(url) => {
                                    let res = webview.navigate(url);
                                    nav_log(&format!("navigate result: {:?}", res));
                                }
                                Err(e) => nav_log(&format!("url parse error: {}", e)),
                            }
                        }
                        None => nav_log("webview NOT found"),
                    }
                });
                nav_log(&format!("run_on_main_thread: {:?}", queued));
            });

            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_folder" => {
                let app = app.clone();
                use tauri_plugin_dialog::DialogExt;
                app.dialog().file().pick_folder(move |folder| {
                    let Some(folder) = folder else { return };
                    let Ok(path) = folder.into_path() else { return };
                    let url = format!(
                        "{}/?folder={}",
                        web_url(),
                        url_encode(&folder_for_web(&path.to_string_lossy()))
                    );
                    if let Some(webview) = tauri::Manager::get_webview(&app, "main") {
                        if let Ok(url) = url.parse() {
                            let _ = webview.navigate(url);
                        }
                    }
                });
            }
            "agent" => {
                let is_open = app.state::<AgentPanel>().0.lock().unwrap().is_some();
                if is_open {
                    close_agent(app);
                } else {
                    open_agent_async(app);
                }
            }
            "learn" => open_ecosystem_page(),
            "studio" => {
                if let Ok(exe) = std::env::current_exe() {
                    if let Some(dir) = exe.parent() {
                        let studio_exe = dir.join("drgx-studio.exe");
                        let bin = if studio_exe.is_file() {
                            studio_exe
                        } else {
                            std::path::PathBuf::from("D:\\Dev\\vietcode\\drgx-studio.exe")
                        };
                        let mut cmd = Command::new(bin);
                        if let Some(folder) = load_last_folder(app) {
                            cmd.arg(folder);
                        }
                        let _ = cmd.spawn();
                    }
                }
            }
            _ => {}
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Resized(size) = event {
                let app = window.app_handle();
                let has_agent = app.state::<AgentPanel>().0.lock().unwrap().is_some();
                if has_agent {
                    let scale = window.scale_factor().unwrap_or(1.0);
                    layout_split(app, *size, scale);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build app");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            let pids: Vec<u32> = app_handle
                .state::<Servers>()
                .0
                .lock()
                .unwrap()
                .drain(..)
                .collect();
            nav_log(&format!("exit: kill_tree pids {:?}", pids));
            for pid in pids {
                kill_tree(pid);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_file(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "drgx-settings-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn jsonc_accepts_bom_comments_and_trailing_commas() {
        let value = parse_jsonc_value(
            "\u{feff}{\n  // ghi chú\n  \"a\": 1,\n  /* khối */ \"b\": [1, 2,],\n}",
        )
        .unwrap();
        assert_eq!(value["a"], 1);
        assert_eq!(value["b"][1], 2);
    }

    #[test]
    fn merge_keeps_user_keys_and_creates_one_backup() {
        let path = scratch_file("settings.json");
        std::fs::write(&path, "{\n  // người dùng\n  \"user.key\": 42,\n}").unwrap();
        let path_text = path.to_string_lossy().to_string();
        assert!(merge_json_object(&path_text, |map| {
            map.insert("drgx.key".to_string(), serde_json::json!(true));
        }));
        let value = parse_jsonc_value(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(value["user.key"], 42);
        assert_eq!(value["drgx.key"], true);
        assert!(std::path::Path::new(&format!("{}.drgx-bak", path_text)).exists());
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn malformed_settings_are_never_overwritten() {
        let path = scratch_file("settings.json");
        let broken = "{ // không đóng\n  \"user.key\": 42,";
        std::fs::write(&path, broken).unwrap();
        let path_text = path.to_string_lossy().to_string();
        assert!(!merge_json_object(&path_text, |map| {
            map.insert("drgx.key".to_string(), serde_json::json!(true));
        }));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), broken);
        assert!(std::path::Path::new(&format!("{}.drgx-bak", path_text)).exists());
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn keybindings_keep_user_keys_and_drop_legacy_vpn() {
        let path = scratch_file("keybindings.json");
        std::fs::write(
            &path,
            r#"[
                { "key": "ctrl+k", "command": "workbench.action.openSettings" },
                { "key": "ctrl+alt+v", "command": "drgx.vpn" },
            ]"#,
        )
        .unwrap();
        assert!(merge_keybindings(&path.to_string_lossy()));
        let value =
            parse_jsonc_value(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let items = value.as_array().unwrap();
        assert!(items.iter().any(|i| i["command"] == "workbench.action.openSettings"));
        assert!(items.iter().any(|i| i["command"] == "drgx.run"));
        assert!(!items.iter().any(|i| i["command"] == "drgx.vpn"));
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }
}

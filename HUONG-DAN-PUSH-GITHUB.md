# 🚀 HƯỚNG DẪN SIÊU CHI TIẾT: Push DrgX lên GitHub (Git Bash + Windows)

> Repo đích: **https://github.com/LeMinh2k12/Drgx-Startup**
> Repo cục bộ: **`D:\Dev\vietcode`** (nhánh `main`, đã commit, đã sẵn sàng push)
>
> ⚠️ **Vấn đề duy nhất cần xử lý**: máy này đang lưu credential của tài khoản
> **`LeMinhVoid-VnxD`** → push bị báo `403 Permission denied`.
> Bạn cần đăng nhập tài khoản **`LeMinh2k12`** — xem **Phần 3**.

---

## 📑 MỤC LỤC
- [Phần 1 — Hiểu trạng thái hiện tại](#phần-1--hiểu-trạng-thái-hiện-tại)
- [Phần 2 — Mở Git Bash & vào đúng thư mục](#phần-2--mở-git-bash--vào-đúng-thư-mục)
- [Phần 3 — Chuyển sang tài khoản LeMinh2k12 (xử lý lỗi 403)](#phần-3--chuyển-sang-tài-khoản-leminh2k12-xử-lý-lỗi-403)
- [Phần 4 — Push (push chính thức)](#phần-4--push)
- [Phần 5 — Kiểm tra sau khi push](#phần-5--kiểm-tra-sau-khi-push)
- [Phần 6 — Push các lần sau (nhịp làm việc thường ngày)](#phần-6--push-các-lần-sau)
- [Phần 7 — Build binary từ source (scripts/build.py)](#phần-7--build-binary-từ-source-scriptsbuildpy)
- [Phần 8 — Bảng tra cứu lỗi thường gặp](#phần-8--bảng-tra-cứu-lỗi-thường-gặp)

---

## Phần 1 — Hiểu trạng thái hiện tại

Dưới đây là những gì **đã được làm sẵn** trong repo — bạn **không cần làm lại**:

| Việc | Trạng thái | Kết quả |
|---|---|---|
| `git init` | ✅ xong | Repo Git nội bộ đã tạo ở `D:\Dev\vietcode` |
| `.gitignore` | ✅ xong | Đã che toàn bộ build artifacts: `**/target/`, `*.exe`, `*.dll`, `products/*/profile/`, plus mới thêm `presentation/voiceover/video/profile/` |
| Dọn browser profile bị staged | ✅ xong | Dữ liệu cookies/login đã bị gỡ khỏi index (quan trọng vì lý do bảo mật) |
| Commit đầu tiên | ✅ xong | "Initial commit: DrgX ecosystem..." trên nhánh `main` |
| `scripts/build.py` | ✅ xong | Build `drgx.exe` (Rust) + `oj_server.exe` (C++) từ source gốc — đã test OK |
| Remote `origin` | ✅ xong | Trỏ tới `https://github.com/LeMinh2k12/Drgx-Startup.git` |
| **Push** | ⛔ **chưa xong** | Chặn bởi 403 (credential sai tài khoản) — bạn sẽ fix ở Phần 3 |

Các lệnh dùng để kiểm tra lại (nếu bạn muốn nhìn bằng mắt):

```bash
git -C /d/Dev/vietcode log --oneline          # phải thấy: Initial commit...
git -C /d/Dev/vietcode remote -v              # phải thấy origin → Drgx-Startup.git
git -C /d/Dev/vietcode status                 # nên gần sạch, chỉ file ignore còn lại
git -C /d/Dev/vietcode branch --show-current  # phải là: main
```

> 💡 Trong **Git Bash**, ổ `D:` được mount là `/d/` — `D:\Dev\vietcode` = `/d/Dev/vietcode`.

---

## Phần 2 — Mở Git Bash & vào đúng thư mục

1. Nhấn **Start** → gõ **"Git Bash"** → Enter (hoặc bấm phải trên Desktop → *Open Git Bash here* nếu bạn đang ở `D:\Dev`).
2. Gõ các lệnh sau, từng dòng:

```bash
cd /d/Dev/vietcode
pwd
# ⇢ phải in ra exactly: /d/Dev/vietcode
```

3. Kiểm tra nhánh & remote (như Phần 1). Nếu `git branch --show-current` không ra
   `main`, chạy: `git branch -M main`.

---

## Phần 3 — Chuyển sang tài khoản LeMinh2k12 (xử lý lỗi 403)

⚡ Đây là **phần quan trọng nhất**. Chọn **1 trong 3 cách**, khuyến nghị cách 3A.

### 🔴 3A. Cách nhanh nhất: đ позитив credential manager & đăng nhập lại

```bash
# 1) Nhìn xem credential nào đang được dùng
git config --list | grep -i credential
# Hoặc liệt kê trong Windows Credential Manager:
echo "Mở: Start → 'Credential Manager' → Windows Credentials"

# 2) Đăng xuất khỏi tài khoản cũ (LeMinhVoid-VnxD)
git credential-manager github logout LeMinhVoid-VnxD   # gcm (Git for Windows mặc định)
# nếu lệnh trên không nhận diện được, dùng:
cmdkey /list | findstr github                           # xem key
cmdkey /delete:git:https://github.com                   # xóa credential github cũ
cmdkey /delete:github.com                               # (nếu có, một trong 2 sẽ báo lỗi — bình thường)

# 3) Xóa cache credential của git + bật lại credential manager
git config --local --unset-all credential.helper || true
git config --global --unset-all credential.helper      || true
git config --global credential.helper manager

# 4) Giờ push sẽ tự mở cửa sổ → đăng nhập tài khoản LeMinh2k12
git push -u origin main
```

Khi cửa sổ **GitHub sign-in** hiện lên:
- Chọn **"Sign in with your browser"** (hoặc *Token* nếu bạn có PAT).
- Đảm bảo trình duyệt đang đăng nhập bằng account **`LeMinh2k12`** (cần đăng xuất tài khoản GitHub trong trình duyệt trước, hoặc dùng cửa sổ ẩn danh).
- Bấm **Authorize**.

### 🟠 3B. Cách 2: dùng Personal Access Token (PAT) — username/password style

> PAT = password thay thế cho git push một số trường hợp.

1. Mở https://github.com/settings/tokens \(Tokens\) — chọn **"Generate new token (classic)"**.
   - ✅ Tick scope: `repo`
   - (Tùy chọn) đặt tên: `push-drgx-startup`
   - Cấp hạn sử dụng ngắn (7–30 ngày đủ dùng).
2. Copy **TOKEN** (chuỗi bắt đầu `ghp_`).
3. Trong Git Bash:
   ```bash
   git credential reject <<EOF
   protocol=https
   host=github.com
   EOF
   git push -u origin main
   # Username for 'https://github.com': LeMinh2k12
   # Password: → PASTE PAT vào đây (phím Ctrl+Shift+V để paste trong Git Bash)
   ```

### 🟡 3C. Cách 3: nhúng PAT vào URL remote (nhanh, nhưng PAT sẽ ghi vào file config)

```bash
git remote set-url origin https://LeMinh2k12:<TOKEN>@github.com/LeMinh2k12/Drgx-Startup.git
git push -u origin main
```
> ⚠️ Sau khi push xong nên **rotate token** hoặc đặt lại URL về dạng sạch:
> ```bash
> git remote set-url origin https://github.com/LeMinh2k12/Drgx-Startup.git
> ```

### 🟢 3D. Cách 4: cài GitHub CLI (gh) + login

```bash
winget install GitHub.cli        # hoặc download: https://cli.github.com/
refreshenv                        # (chỉ khi dùng trong Git Bash — đóng/mở lại Git Bash)
gh auth login                     # chọn: GitHub.com → HTTPS → Login with web browser → LeMinh2k12
git remote set-url origin https://github.com/LeMinh2k12/Drgx-Startup.git  # (nếu 3C đã nhúng token)
git push -u origin main
```

---

## Phần 4 — Push

Sau khi ước 3 có một bước thao tác auth thành công, lệnh push chính thống như sau:

```bash
git push -u origin main
```

**Ý nghĩa từng tham số:**
- `push` = đẩy các commit từ repo cục bộ lên remote GitHub.
- `-u` (=`--set-upstream`) = gán tracking giữa nhánh cục bộ `main` và nhánh remote `origin/main`,
  để **các lần sau chỉ cần gõ** `git push` (không cần thêm `origin main`).
- `origin` = tên remote (đã trỏ tới `https://github.com/LeMinh2k12/Drgx-Startup.git`).
- `main` = tên nhánh gửi lên.

**Kết quả mong đợi (stdout):**
```
Enumerating objects: 574, done.
Counting objects: 100% (574/574), done.
Delta compression using up to N threads
Compressing objects: 100% (X/X), done.
Writing objects: 100% (574/574), yyyy KiB | zz ZiB/s, done.
Total 574 (delta 0), reused 0 (delta 0), pack-reused 0
remote: Resolving deltas: 100% (…/…), done.
To https://github.com/LeMinh2k12/Drgx-Startup.git
 * [new branch]      main → main
branch 'main' set up to track 'origin/main'.
```

> 📦 Repo push lên sẽ **payload nhẹ** (~vài MB) vì toàn binary lớn + browser profile
> đã bị `.gitignore` che trước đó. Chỉ còn `drgx.exe` (1.7 MB) trong index.

---

## Phần 5 — Kiểm tra sau khi push

Mở công khai ở: **https://github.com/LeMinh2k12/Drgx-Startup**

Xem nhanh trên máy:

```bash
git log --oneline -1                 # commit mới nhất
git status                           # phải clean ("working tree clean")
git ls-remote --heads origin         # phải hiện: <sha>  refs/heads/main
```

Về phần UI trên GitHub:
1. Tải trang https://github.com/LeMinh2k12/Drgx-Startup
2. Tìm và đọc `README.md` (nếu chưa có, GitHub sẽ hiển thị nội dung `docs…` nếu được cấu hình theo bất kỳ).
3. Vào **Settings → Topics** (optional) để thêm tag: `tauri`, `rust`, `competitive-programming`, `ide`.

---

## Phần 6 — Push các lần sau (nhịp làm việc thường ngày)

Cứ mỗi khi sửa code, chu trình chuẩn như sau:

```bash
cd /d/Dev/vietcode

git status                 # 1. Xem có gì thay đổi
git diff                   # 2. (tùy chọn) xem chi tiết thay đổi từng dòng
git add -A                 # 3. Stage toàn bộ thay đổi (add . cũng được)
git commit -m "Mô tả ngắn rõ ràng về thay đổi"   # 4. Commit
git pull --rebase          # 5. (nếu có cùng làm việc trên đa máy) cập nhật remote trước
git push                   # 6. Push (đã có tracking, chỉ cần `git push`)
```

**Quy tắc viết commit message** (trelawny tốt cho git log sau này):
- ≤ 50 ký tự, ngắn gọn, chủ động, viết ở thì hiện tại: "add", "fix", "refactor"…
Ví dụ: `fix(oj): handle timeout for Python submissions`, `docs: update checklist ho so`.

---

## Phần 7 — Build binary từ source (scripts/build.py)

Repository "source-only" nghĩa là bạn **không cần commit mỗi exe lớn**.
Đi đây là script rebuild tất cả binary cần thiết từ source gốc:

```bash
cd /d/Dev/vietcode

python scripts/build.py           # build TẤT CẢ (drgx + oj + ide)
python scripts/build.py drgx      # chỉ rebuild app/src-tauri/resources/drgx.exe (từ cli/, Rust)
python scripts/build.py oj        # chỉ rebuild products/void-bit/OJ/oj_server.exe (từ oj_server.cpp)
python scripts/build.py ide       # chỉ rebuild Tauri IDE (drgx-ide & drgx-studio)
```

**Yêu cầu môi trường:**
- Python 3.10+
- Rust (rustup, stable) — khuyến nghị dùng toolchain `x86_64-pc-windows-gnu` với
  **MSYS2 MinGW mới** ở `C:\msys64\ucrt64\bin` (script tự thêm vào PATH nếu có).
  ⚠️ `C:\MinGW` cũ **không** dùng được (bug dlltool "Invalid bfd target").
- MSVC Build Tools (cho target `ide`, hoặc nếu build bằng GNU có vấn đề).
- g++/clang++ (MSYS2 mingw-w64) cho `oj_server.cpp`.

**Kiểm tra build đã activer chữ ký đúng:**

```bash
./app/src-tauri/resources/drgx.exe --version
./products/void-bit/OJ/oj_server.exe --help
```

---

## Phần 8 — Bảng tra cứu lỗi thường gặp

| Lỗi | Nguyên nhân | Cách fix |
|---|---|---|
| `remote: Permission to LeMinh2k12/Drgx-Startup.git denied to LeMinhVoid-VnxD. 403` | Windows Credential Manager đang giữ token của tài khoản **khác** | Phần 3A — logout/xóa credential cũ, đăng nhập lại là LeMinh2k12 |
| `Authentication failed` | SAI password/paste PAT sai | Dùng Phần 3A (browser auth, không phải PAT) để tránh nhầm lẫn |
| `Repository not found` | Tên account/URL sai, hoặc repo là **private** nhưng bạn chưa có quyền access – hoặc repo chưa được tạo | Mở https://github.com/LeMinh2k12/Drgx-Startup để confirm tồn tại & bạn đang logged in đúng tài khoản |
| `error: src refspec main does not match any` | Chưa có commit nào | `git add -A && git commit -m "initial"` rồi push lại |
| `! [rejected] master -> main (non-fast-forward)` | Nhánh cục bộ vẫn là master | `git branch -M main && git push -u origin main` |
| `Updates were rejected because the remote contains work` | Repo trên GitHub đã có file (như repo được khởi tạo với README/LICENSE có README/LICENSE) | `git pull --rebase origin main && git push` (an toàn) hoặc `--force` (⚠️ chỉ khi chắc chắn remote toàn là file khởi tạo, không có gì quan trọng) |
| `fatal: repository not found` | Remote URL sai | `git remote set-url origin https://github.com/LeMinh2k12/Drgx-Startup.git` |
| `ssl certificate problem` | Proxy/VPN/company cert | `git config --global http.sslBackend schannel` (Git for Windows) rồi thử lại |
| `file exceeds GitHub's 100 MB limit` | Binary quá to đã lọt qua `.gitignore` | Đừng bỏ ignore line `**/target/`, `*.exe`. Nếu chắc chắn là binary cứng cần có → push bằng `git lfs` |
| `drgx.exe` đẩy lên nhưng quá lớn | 228 MB (build debug) | Giữ `.gitignore` `**/target/` — chỉ commit bản release/strip trong `resources/` |

---

## 🔗 Link liên quan

- **Repo đích**: https://github.com/LeMinh2k12/Drgx-Startup
- **Hướng dẫn PAT**: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- **Tài liệu Git push**: https://git-scm.com/docs/git-push
- **GitHub CLI**: https://cli.github.com/
- **Cài Git Bash (nếu chưa có)**: https://git-scm.com/download/win

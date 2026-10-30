param(
    [switch]$StartServers = $false
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (Test-Path 'C:\msys64\ucrt64\bin') {
    $env:Path = "C:\msys64\ucrt64\bin;$env:Path"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  DrgX Ecosystem Demo Doctor & Pre-Flight Check" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check toolchains
foreach ($cmd in @('python', 'g++', 'node')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "Thiếu công cụ bắt buộc trên PATH: $cmd"
    }
}
Write-Host "[OK] Toolchains (python, g++, node) sẵn sàng." -ForegroundColor Green

# 2. Check / rebuild oj_server.exe if needed
$ojDir = Join-Path $Root "products\void-bit\OJ"
$ojCpp = Join-Path $ojDir "oj_server.cpp"
$ojExe = Join-Path $ojDir "oj_server.exe"
if ((-not (Test-Path $ojExe)) -or ((Get-Item $ojCpp).LastWriteTime -gt (Get-Item $ojExe).LastWriteTime)) {
    Write-Host "[BUILD] Đang biên dịch lại oj_server.exe..." -ForegroundColor Yellow
    Push-Location $ojDir
    try {
        & g++ -std=c++17 -O2 -o oj_server.exe oj_server.cpp -lws2_32 -lwinhttp -lpsapi -static
        if ($LASTEXITCODE -ne 0) { throw "Biên dịch oj_server.exe thất bại" }
    } finally {
        Pop-Location
    }
}
Write-Host "[OK] Binary oj_server.exe đã đồng bộ với oj_server.cpp." -ForegroundColor Green

# 3. Run unified ecosystem health gate
& python -X utf8 (Join-Path $Root "scripts\verify_ecosystem.py")
if ($LASTEXITCODE -ne 0) {
    throw "Health Gate phát hiện lỗi! Xem chi tiết tại workflows\reports\ecosystem-health-brief.md"
}

if ($StartServers) {
    Write-Host "`n[START] Đang khởi động 3 dịch vụ Demo nền..." -ForegroundColor Cyan
    Start-Process -FilePath "node" -ArgumentList "serve.js" -WorkingDirectory (Join-Path $Root "products\void-bit") -WindowStyle Minimized
    Start-Process -FilePath $ojExe -ArgumentList "8080 static problems" -WorkingDirectory $ojDir -WindowStyle Minimized
    Start-Process -FilePath "python" -ArgumentList "-X utf8 exam-server.py" -WorkingDirectory (Join-Path $Root "products\drgx-cp\server") -WindowStyle Minimized
    Start-Sleep -Seconds 2
    Write-Host "[READY] Void-bit Web UI:      http://localhost:8000" -ForegroundColor Green
    Write-Host "[READY] Void-bit OJ API/UI:   http://localhost:8080" -ForegroundColor Green
    Write-Host "[READY] DrgX CP Exam Server:  http://127.0.0.1:8765/health" -ForegroundColor Green
}

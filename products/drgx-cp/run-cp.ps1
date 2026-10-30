param(
    [string]$Port = '8765'
)

$ErrorActionPreference = 'Stop'

$base = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (Test-Path 'C:\msys64\ucrt64\bin') {
    $env:Path = 'C:\msys64\ucrt64\bin;' + $env:Path
}
$profile = Join-Path $base 'profile'
$extensions = Join-Path $base 'extensions'
$serverScript = Join-Path $base 'server\exam-server.py'
$srvLog = Join-Path $base 'server.log'
$srvPid  = Join-Path $base 'server.pid'
$codeCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe'),
    'C:\Program Files\Microsoft VS Code\Code.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code Insiders\Code - Insiders.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\VSCodium\VSCodium.exe')
)
$codePath = $codeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $codePath) {
    $cmdCode = Get-Command 'code.cmd' -ErrorAction SilentlyContinue
    if ($cmdCode) { $codePath = $cmdCode.Source }
}
if (-not $codePath -or -not (Test-Path $codePath)) {
    Write-Host 'DrgX CP: can not find Code.exe (VS Code / VSCodium)'
    exit 1
}
if (-not (Test-Path $profile)) { New-Item -ItemType Directory -Path $profile | Out-Null }
if (-not (Test-Path $extensions)) { New-Item -ItemType Directory -Path $extensions | Out-Null }

$extSource = Join-Path $base 'extension'
$extDest = Join-Path $extensions 'drgx.drgx-cp-1.0.0'
if (-not (Test-Path $extDest)) { New-Item -ItemType Directory -Path $extDest | Out-Null }

# Không xoá/thay thư mục extension khi app đang chạy: Windows sẽ làm extension
# host mất file giữa chừng và cửa sổ hiện tại có thể crash. Chỉ đồng bộ khi app tắt.
$appRunning = Get-CimInstance Win32_Process -Filter "Name='Code.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) }
if ($appRunning) {
    Write-Host '> app is running, skip extension sync'
} else {
    Get-ChildItem -Path $extSource -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch '\.vsix$|^make-vsix\.ps1$|^\.vsixmanifest$' } |
        Copy-Item -Destination $extDest -Recurse -Force
}
if (-not (Test-Path (Join-Path $extDest 'package.json'))) { Write-Host 'DrgX CP: extension not found'; exit 1 }

Write-Host '> start server'
$env:DRGX_CP_SERVER_PORT = $Port
$alreadyListening = Get-NetTCPConnection -LocalPort ([int]$Port) -State Listen -ErrorAction SilentlyContinue
if ($alreadyListening) {
    Write-Host ('> reuse existing server on port ' + $Port)
    $owner = ($alreadyListening | Select-Object -First 1).OwningProcess
    if ($owner) { Set-Content -Path $srvPid -Value $owner }
} else {
    $proc = Start-Process -FilePath 'python' -ArgumentList @($serverScript) -WindowStyle Hidden -RedirectStandardOutput $srvLog -RedirectStandardError "$srvLog.err" -PassThru
    Set-Content -Path $srvPid -Value $proc.Id
    $ready = $false
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Milliseconds 300
        try {
            $r = Invoke-RestMethod -Uri ("http://127.0.0.1:$Port/") -TimeoutSec 1
            if ($r.status -eq 'ready') { $ready = $true; break }
        } catch {}
    }
    if (-not $ready) { Write-Host '> exam server chua san sang (kiem tra server.log.err)' }
}
Write-Host '> start code'
Start-Process -FilePath $codePath -ArgumentList @('--user-data-dir', $profile, '--extensions-dir', $extensions)
Write-Host "> ready http://127.0.0.1:$Port"

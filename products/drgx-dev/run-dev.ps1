param()

$ErrorActionPreference = 'Stop'

$base = Split-Path -Parent $MyInvocation.MyCommand.Definition
$profile = Join-Path $base 'profile'
$extensions = Join-Path $base 'extensions'
$extSource = Join-Path $base 'extension\drgx.drgx-dev-1.0.0'
$extDest = Join-Path $extensions 'drgx.drgx-dev-1.0.0'
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
    Write-Host 'DrgX Dev: can not find Code.exe (VS Code / VSCodium)'
    exit 1
}
if (-not (Test-Path $profile)) { New-Item -ItemType Directory -Path $profile | Out-Null }
if (-not (Test-Path $extensions)) { New-Item -ItemType Directory -Path $extensions | Out-Null }
if (-not (Test-Path $extSource)) { $extSource = Join-Path $base 'extension' }
if (-not (Test-Path $extDest)) { New-Item -ItemType Directory -Path $extDest | Out-Null }

# Không đụng vào extension đang được app nạp (tránh crash khi bấm mở lần hai).
$appRunning = Get-CimInstance Win32_Process -Filter "Name='Code.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile) }
if ($appRunning) {
    Write-Host '> app is running, skip extension sync'
} else {
    Get-ChildItem -Path $extSource -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch '\.vsix$|^make-vsix\.ps1$|^\.vsixmanifest$' } |
        Copy-Item -Destination $extDest -Recurse -Force
}
if (-not (Test-Path (Join-Path $extDest 'package.json'))) { Write-Host 'DrgX Dev: extension not found' ; exit 1 }

# Kiểm tra Local Neural AI Engine (:28894 hoặc :45290).
$bridgeUp = $false
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:28894/global/health' -UseBasicParsing -TimeoutSec 2
    $bridgeUp = ($r.StatusCode -eq 200 -or $r.StatusCode -eq 401)
} catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) {
        $bridgeUp = $true
    }
}
if (-not $bridgeUp) {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:45290/drgx/health' -UseBasicParsing -TimeoutSec 2
        $bridgeUp = ($r.StatusCode -eq 200)
    } catch {}
}
if (-not $bridgeUp) {
    $ide = Join-Path $env:LOCALAPPDATA 'Programs\DrgX IDE\drgx-ide.exe'
    if (Test-Path $ide) {
        Write-Host '> start DrgX IDE bridge (minimized)'
        Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DrgXWindow { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }' -ErrorAction SilentlyContinue
        $appProc = Start-Process -FilePath $ide -WorkingDirectory (Split-Path $ide) -PassThru
        for ($j = 0; $j -lt 30; $j++) {
            Start-Sleep -Milliseconds 200
            if ($appProc.HasExited) { break }
            try { $appProc.Refresh() } catch { break }
            if ($appProc.MainWindowHandle -ne 0) {
                [DrgXWindow]::ShowWindow($appProc.MainWindowHandle, 6) | Out-Null
                break
            }
        }
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Milliseconds 400
            try {
                $r = Invoke-WebRequest -Uri 'http://127.0.0.1:45290/drgx/health' -UseBasicParsing -TimeoutSec 1
                if ($r.StatusCode -eq 200) { $bridgeUp = $true; break }
            } catch {}
        }
    }
}
if (-not $bridgeUp) { Write-Host '> DrgX Local Intelligence Engine san sang (Offline + Hybrid Mode)' }

Write-Host '> start code'
Start-Process -FilePath $codePath -ArgumentList @('--user-data-dir', $profile, '--extensions-dir', $extensions)
Write-Host '> ready'

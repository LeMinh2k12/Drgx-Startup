$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Ưu tiên biến môi trường sẵn có; nếu chưa có thì dùng vị trí chuẩn của Windows.
if (-not $env:RUSTUP_HOME) {
    $candidate = 'D:\C_Drive_Data\home_dot_rustup'
    $env:RUSTUP_HOME = if (Test-Path $candidate) { $candidate } else { Join-Path $env:USERPROFILE '.rustup' }
}
if (-not $env:CARGO_HOME) {
    $candidate = 'D:\C_Drive_Data\home_dot_cargo'
    $env:CARGO_HOME = if (Test-Path $candidate) { $candidate } else { Join-Path $env:USERPROFILE '.cargo' }
}

$pathCandidates = @(
    (Join-Path $env:CARGO_HOME 'bin'),
    'C:\msys64\ucrt64\bin',
    (Join-Path $env:ProgramFiles 'nodejs'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs')
) | Where-Object { Test-Path $_ }

if ($pathCandidates) {
    $env:Path = ($pathCandidates -join ';') + ';' + $env:Path
}

Set-Location (Join-Path $root 'app')
& '.\node_modules\.bin\tauri.cmd' @args

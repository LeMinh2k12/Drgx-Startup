param(
    [string]$Source = $PSScriptRoot,
    [string]$Output = (Join-Path $PSScriptRoot 'drgx-cp.vsix')
)

$ErrorActionPreference = 'Stop'

if (Test-Path $Output) { Remove-Item $Output -Force }
$temp = Join-Path $env:USERPROFILE 'AppData\Local\Temp\drgx-cp-vsix-build'
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
$extDir = Join-Path $temp 'extension'
New-Item -ItemType Directory -Force -Path $extDir | Out-Null

$pkg = Get-Content (Join-Path $Source 'package.json') -Raw | ConvertFrom-Json
Get-ChildItem -Path $Source -Force |
    Where-Object { $_.Name -notmatch '\.vsix$|^make-vsix\.ps1$|^\.vsixmanifest$' } |
    Copy-Item -Destination $extDir -Recurse -Force

$desc = [System.Security.SecurityElement]::Escape([string]$pkg.description)
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="$($pkg.name)" Version="$($pkg.version)" Publisher="$($pkg.publisher)" />
    <DisplayName>$([System.Security.SecurityElement]::Escape([string]$pkg.displayName))</DisplayName>
    <Description xml:space="preserve">$desc</Description>
    <Tags>drgx,judge,exam</Tags>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.85.0" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
"@
$contentTypes = @"
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="html" ContentType="text/html" />
  <Default Extension="css" ContentType="text/css" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="mp4" ContentType="video/mp4" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
</Types>
"@
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $temp 'extension.vsixmanifest'), $manifest, $utf8)
[System.IO.File]::WriteAllText((Join-Path $temp '[Content_Types].xml'), $contentTypes, $utf8)

$zipPath = $Output -replace '\.vsix$', '.zip'
Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $zipPath -Force
Remove-Item $temp -Recurse -Force
Rename-Item -Path $zipPath -NewName ([IO.Path]::GetFileName($Output)) -Force
Write-Host "OK -> $Output"

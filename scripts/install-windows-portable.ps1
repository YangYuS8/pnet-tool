Param(
  [string]$Bin = "$PSScriptRoot/../src-tauri/target/release/pnet-tool.exe"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $Bin)) { Write-Error "Binary not found: $Bin" }

$TargetDir = Join-Path $env:LOCALAPPDATA "Programs\pnet-tool"
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

Copy-Item $Bin (Join-Path $TargetDir "pnet-tool.exe") -Force
if (Test-Path "$PSScriptRoot/../build/icons/pnet-tool.png") {
  Copy-Item "$PSScriptRoot/../build/icons/pnet-tool.png" (Join-Path $TargetDir "pnet-tool.png") -Force
}

# Create Start Menu shortcut
$ShortcutDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$ShortcutPath = Join-Path $ShortcutDir "PNET Tool.lnk"
$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = (Join-Path $TargetDir "pnet-tool.exe")
$Shortcut.WorkingDirectory = $TargetDir
$Shortcut.IconLocation = (Join-Path $TargetDir "pnet-tool.exe")
$Shortcut.Save()

Write-Host "Installed to: $TargetDir"
Write-Host "Start Menu shortcut: $ShortcutPath"

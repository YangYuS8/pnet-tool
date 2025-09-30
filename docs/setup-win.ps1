<#!
.SYNOPSIS
  Windows setup / uninstall / configure script for pnet-telnet workflow.
.USAGE
  powershell -ExecutionPolicy Bypass -File .\setup-win.ps1 install [-Terminal wezterm|kitty|wt|powershell] [-NoHandler] [-Force]
  powershell -ExecutionPolicy Bypass -File .\setup-win.ps1 uninstall [-Purge]
  powershell -ExecutionPolicy Bypass -File .\setup-win.ps1 configure -Terminal kitty
  powershell -ExecutionPolicy Bypass -File .\setup-win.ps1 show
.NOTES
  Creates %USERPROFILE%\.config\pnet-telnet and a launcher pnet-telnet.cmd.
  Protocol handler registration (future) will require registry writes.
#!>

$ErrorActionPreference = 'Stop'

function Parse-Args {
  param([string[]]$Args)
  $res = @{ Action=''; Terminal=''; NoHandler=$false; Force=$false; Purge=$false }
  if ($Args.Length -eq 0) { return $res }
  $res.Action = $Args[0]
  for ($i=1; $i -lt $Args.Length; $i++) {
    switch ($Args[$i]) {
      '-Terminal' { $res.Terminal = $Args[++$i]; continue }
      '-NoHandler' { $res.NoHandler = $true; continue }
      '-Force' { $res.Force = $true; continue }
      '-Purge' { $res.Purge = $true; continue }
      default { }
    }
  }
  return $res
}

function Detect-Terminal {
  param([string]$Preferred)
  if ($Preferred) { return $Preferred }
  foreach ($c in 'wezterm','kitty','wt','powershell') { if (Get-Command $c -ErrorAction SilentlyContinue) { return $c } }
  return 'powershell'
}

function Ensure-ConfigDir {
  param($Dir)
  if (-not (Test-Path $Dir)) { New-Item -ItemType Directory -Path $Dir | Out-Null }
}

function Write-Config {
  param($Path,$Terminal)
  if (-not (Test-Path $Path)) {
@"
TERM_BIN=$Terminal
LOG_TRUNCATE=1
FOCUS_EXISTING=1
FRESH_ON_FOCUS=1
AUTO_RECONNECT=0
RECONNECT_DELAY=5
USE_EXPECT=0
"@ | Out-File -Encoding UTF8 $Path
  }
}

function Update-Terminal-InConfig {
  param($Path,$Terminal)
  if (-not (Test-Path $Path)) { Write-Config -Path $Path -Terminal $Terminal; return }
  (Get-Content $Path) | ForEach-Object { if ($_ -match '^TERM_BIN=') { "TERM_BIN=$Terminal" } else { $_ } } | Set-Content $Path -Encoding UTF8
}

function Install-App {
  param($Terminal,$NoHandler,$Force)
  $home = $env:USERPROFILE
  $cfgDir = Join-Path $home '.config/pnet-telnet'
  $cfgFile = Join-Path $cfgDir 'config'
  $launcher = Join-Path $home 'pnet-telnet.cmd'
  Ensure-ConfigDir $cfgDir
  Write-Config -Path $cfgFile -Terminal $Terminal
  if ((Test-Path $launcher) -and -not $Force) { Write-Host "[SKIP] $launcher exists (use -Force)"; } else {
@"@echo off
set TERM_BIN=$Terminal
set PNET_CONFIG=%USERPROFILE%\.config\pnet-telnet\config
REM Basic parser (HOST:PORT or telnet://HOST:PORT)
set RAW=%1
if "%RAW%"=="" echo Usage: pnet-telnet.cmd host:port & exit /b 1
set RAW=%RAW:telnet://=%
for /f "tokens=1,2 delims=:" %%a in ("%RAW%") do set HOST=%%a & set PORT=%%b
if "%HOST%"=="" echo Parse error & exit /b 2
set LOGDIR=%USERPROFILE%\pnetlab-logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1
set LOGFILE=%LOGDIR%\%HOST%_%PORT%.log
if exist "%LOGFILE%" type NUL > "%LOGFILE%"
echo [pnet] connecting %HOST%:%PORT%
REM TODO: integrate real telnet client (e.g., putty/plink or busybox telnet)
REM For now just keep window open:
echo (placeholder) Press Ctrl+C to exit & echo. & pause
"@ | Out-File -Encoding ASCII $launcher
    Write-Host "[OK] Installed launcher: $launcher"
  }
  Write-Host "[OK] Config: $cfgFile (TERM_BIN=$Terminal)"
  if (-not $NoHandler) {
    Write-Host "[INFO] Protocol handler registration not yet implemented (future)."
  }
}

function Uninstall-App {
  param($Purge)
  $home = $env:USERPROFILE
  $cfgDir = Join-Path $home '.config/pnet-telnet'
  $launcher = Join-Path $home 'pnet-telnet.cmd'
  if (Test-Path $launcher) { Remove-Item $launcher -Force; Write-Host "[OK] Removed $launcher" }
  if ($Purge -and (Test-Path $cfgDir)) { Remove-Item $cfgDir -Recurse -Force; Write-Host "[OK] Purged $cfgDir" }
}

function Show-Info {
  $home = $env:USERPROFILE
  $cfgDir = Join-Path $home '.config/pnet-telnet'
  $cfgFile = Join-Path $cfgDir 'config'
  $launcher = Join-Path $home 'pnet-telnet.cmd'
  Write-Host "Launcher : $launcher (exists: $((Test-Path $launcher)))"
  Write-Host "ConfigDir: $cfgDir (exists: $((Test-Path $cfgDir)))"
  if (Test-Path $cfgFile) { Write-Host "TERM_BIN line: $((Select-String '^TERM_BIN=' $cfgFile).Line)" }
}

$parsed = Parse-Args -Args $Args
$terminal = Detect-Terminal -Preferred $parsed.Terminal

switch ($parsed.Action) {
  'install'   { Install-App -Terminal $terminal -NoHandler $parsed.NoHandler -Force $parsed.Force }
  'uninstall' { Uninstall-App -Purge $parsed.Purge }
  'configure' { $home = $env:USERPROFILE; $cfgDir = Join-Path $home '.config/pnet-telnet'; $cfgFile = Join-Path $cfgDir 'config'; Ensure-ConfigDir $cfgDir; Update-Terminal-InConfig -Path $cfgFile -Terminal $terminal; Write-Host "[OK] Updated terminal to $terminal" }
  'show'      { Show-Info }
  default     { Write-Host 'Specify action: install|uninstall|configure|show  (use -Terminal to override)'; }
}

Write-Host 'Done.'

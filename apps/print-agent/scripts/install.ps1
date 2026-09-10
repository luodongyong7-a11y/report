param(
  [string]$ErpUrl = "",
  [ValidateSet("loopback", "lan")]
  [string]$Bind = "lan"
)
$ErrorActionPreference = "Stop"
$Here = $PSScriptRoot

# Prefer exe next to this script (zip package), then repo dist/, then build
$ExeSrc = Join-Path $Here "tk-print-agent.exe"
if (-not (Test-Path $ExeSrc)) {
  $Root = Split-Path -Parent $Here
  $ExeSrc = Join-Path $Root "dist\tk-print-agent.exe"
}
if (-not (Test-Path $ExeSrc) -and (Test-Path (Join-Path $Here "build.ps1"))) {
  & (Join-Path $Here "build.ps1")
  $Root = Split-Path -Parent $Here
  $ExeSrc = Join-Path $Root "dist\tk-print-agent.exe"
}
if (-not (Test-Path $ExeSrc)) {
  throw "找不到 tk-print-agent.exe。请解压安装包后双击「安装.bat」。"
}

$InstallDir = Join-Path $env:LOCALAPPDATA "tk-print-agent"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item $ExeSrc (Join-Path $InstallDir "tk-print-agent.exe") -Force
Remove-Item (Join-Path $InstallDir "SumatraPDF.exe") -Force -ErrorAction SilentlyContinue

$cfgPath = Join-Path $InstallDir "agent.json"
$machineId = [guid]::NewGuid().ToString()
if (Test-Path $cfgPath) {
  try {
    $old = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($old.machineId) { $machineId = [string]$old.machineId }
  } catch { }
}
$cfg = [ordered]@{
  port      = 19290
  machineId = $machineId
  bindMode  = $Bind
  autoAllow = $true
}
if ($ErpUrl) { $cfg.erpBaseUrl = $ErpUrl.TrimEnd('/') }
($cfg | ConvertTo-Json) | Set-Content -Path $cfgPath -Encoding UTF8

$exe = Join-Path $InstallDir "tk-print-agent.exe"
$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "TK Print Agent.lnk"
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)
$sc.TargetPath = $exe
$sc.Arguments = ""
$sc.WorkingDirectory = $InstallDir
$sc.Save()

Get-Process -Name "tk-print-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $exe -WorkingDirectory $InstallDir -WindowStyle Hidden
Write-Host "已安装并启动（默认局域网共享）。托盘可看地址、开关共享。"
Write-Host $InstallDir

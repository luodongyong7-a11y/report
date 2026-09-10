param([switch]$Purge)
$ErrorActionPreference = "Stop"
Get-Process -Name "tk-print-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$startup = Join-Path ([Environment]::GetFolderPath("Startup")) "TK Print Agent.lnk"
if (Test-Path $startup) { Remove-Item $startup -Force }
try {
  Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "TK Print Agent" -ErrorAction SilentlyContinue
} catch { }
$InstallDir = Join-Path $env:LOCALAPPDATA "tk-print-agent"
if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
Write-Host "Uninstalled"

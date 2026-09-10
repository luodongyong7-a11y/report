param(
  [string]$OutDir = ""
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot          # apps/print-agent
$RepoRoot = (Resolve-Path (Join-Path $Root "..\..")).Path  # tk-report
if (-not $OutDir) { $OutDir = Join-Path $Root "dist" }

$sumatra = Join-Path $Root "third_party\SumatraPDF.exe"
if (-not (Test-Path $sumatra)) {
  & (Join-Path $PSScriptRoot "fetch-sumatra.ps1")
}
if (-not (Test-Path $sumatra)) {
  throw "SumatraPDF.exe required at build time for single-exe embed: $sumatra"
}

$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
Push-Location $Root
try {
  cargo build --release
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$exe = Join-Path $Root "target\release\tk-print-agent.exe"
$outExe = Join-Path $OutDir "tk-print-agent.exe"
Copy-Item $exe $outExe -Force
Remove-Item (Join-Path $OutDir "SumatraPDF.exe") -Force -ErrorAction SilentlyContinue

$readme = @"
TK 打印代理
1. 解压后双击 tk-print-agent.exe
2. 会自动安装到本机并开机启动（默认局域网共享）
3. 在 ERP 打开一次「打印设置」完成登记
4. 其他电脑在「在线共享代理」中选择即可
"@
Set-Content -Path (Join-Path $OutDir "README.txt") -Value $readme -Encoding UTF8

# Browser-safe download: zip with single exe (bare .exe is often blocked)
$zip = Join-Path $OutDir "tk-print-agent-windows-x64.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $outExe, (Join-Path $OutDir "README.txt") -DestinationPath $zip -Force

$starterDir = Join-Path $RepoRoot "report-starter\src\main\resources\print-agent"
New-Item -ItemType Directory -Force -Path $starterDir | Out-Null
Copy-Item $zip (Join-Path $starterDir "tk-print-agent-windows-x64.zip") -Force
Remove-Item (Join-Path $starterDir "tk-print-agent-windows-x64.exe") -Force -ErrorAction SilentlyContinue

Write-Host "Built: $outExe"
Write-Host "Download package: $zip"

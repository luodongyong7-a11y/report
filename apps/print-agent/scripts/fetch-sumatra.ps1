$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$DestDir = Join-Path $Root "third_party"
New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
$Dest = Join-Path $DestDir "SumatraPDF.exe"
if (Test-Path $Dest) {
  Write-Host "Already present: $Dest"
  exit 0
}

$url = "https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64.zip"
$tmpZip = Join-Path $env:TEMP "sumatra-tk.zip"
$tmpDir = Join-Path $env:TEMP "sumatra-tk-extract"
Write-Host "Downloading $url ..."
Invoke-WebRequest -Uri $url -OutFile $tmpZip -UseBasicParsing
if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force
$found = Get-ChildItem -Path $tmpDir -Recurse -Filter "*.exe" | Select-Object -First 1
if (-not $found) { throw "SumatraPDF exe not found in zip" }
Copy-Item $found.FullName $Dest -Force
Write-Host "Saved $Dest"

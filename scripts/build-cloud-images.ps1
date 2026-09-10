# Build the three standalone images for a public VPS (no ERP deploy lib).
param(
    [string]$Tag = 'standalone',
    [string]$BarcodeRepo = 'https://github.com/luodongyong7-a11y/barcode.git',
    [string]$PdfRepo = 'https://github.com/luodongyong7-a11y/pdf.git'
)
$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

$fontsDir = Join-Path $RepoRoot 'report-pdf\fonts'
New-Item -ItemType Directory -Path $fontsDir -Force | Out-Null
foreach ($f in @(
    'times.ttf', 'timesbd.ttf', 'timesi.ttf', 'timesbi.ttf',
    'simsun.ttc', 'simhei.ttf', 'seguisym.ttf'
)) {
    $src = Join-Path $env:WINDIR "Fonts\$f"
    $dst = Join-Path $fontsDir $f
    if ((Test-Path $src) -and -not (Test-Path $dst)) { Copy-Item $src $dst }
}
$missing = @('times.ttf','simsun.ttc','simhei.ttf') | Where-Object { -not (Test-Path (Join-Path $fontsDir $_)) }
if ($missing.Count) { Write-Warning "Missing fonts: $($missing -join ', ') — PDF Chinese/Times may fail" }

$libRoot = Join-Path $RepoRoot '.docker-libs'
if (Test-Path $libRoot) { Remove-Item $libRoot -Recurse -Force }
New-Item -ItemType Directory -Path $libRoot -Force | Out-Null
git clone --depth 1 $BarcodeRepo (Join-Path $libRoot 'niqer-barcode')
git clone --depth 1 $PdfRepo (Join-Path $libRoot 'niqer-pdf')

Write-Host 'build @niqer/report' -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot 'packages\report')
try {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        # prefer workspace from root
    }
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'npm install @niqer/report failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'build @niqer/report failed' }
}
finally { Pop-Location }

Write-Host 'build report-tool-web (VITE_BASE=/)' -ForegroundColor Cyan
$env:VITE_BASE = '/'
Push-Location $RepoRoot
try {
    pnpm install
    pnpm --filter @niqer/report build
    pnpm --filter report-tool-web build
    if ($LASTEXITCODE -ne 0) { throw 'pnpm web build failed' }
}
finally { Pop-Location }

$pdfImage = "report-pdf:$Tag"
$apiImage = "report-tool-api:$Tag"
$webImage = "report-tool-web:$Tag"

Write-Host "docker build $pdfImage" -ForegroundColor Cyan
docker build -f (Join-Path $RepoRoot 'report-pdf\Dockerfile') -t $pdfImage $RepoRoot
if ($LASTEXITCODE -ne 0) { throw 'docker build report-pdf failed' }

Write-Host "docker build $apiImage" -ForegroundColor Cyan
docker build -f (Join-Path $RepoRoot 'apps\report-tool-api\Dockerfile') -t $apiImage $RepoRoot
if ($LASTEXITCODE -ne 0) { throw 'docker build api failed' }

Write-Host "docker build $webImage" -ForegroundColor Cyan
docker build -f (Join-Path $RepoRoot 'apps\report-tool-web\Dockerfile') -t $webImage $RepoRoot
if ($LASTEXITCODE -ne 0) { throw 'docker build web failed' }

Write-Host "OK images: $pdfImage $apiImage $webImage" -ForegroundColor Green
Write-Host 'Next: docker save ... then scp to VPS (see docs/deploy-cloud.md)'

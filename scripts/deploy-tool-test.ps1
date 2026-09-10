param(
    [ValidateSet('test', 'branch', 'prod')][string]$Target = 'test',
    [string]$Tag = 'standalone',
    [switch]$SkipBuild,
    [switch]$Confirm
)

$ErrorActionPreference = 'Stop'
$ErpDeploy = 'D:\tk-erp\scripts\deploy'
. (Join-Path $ErpDeploy 'lib.ps1')
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$hosts = Import-PowerShellDataFile (Join-Path $ErpDeploy 'hosts.psd1')
if (-not $hosts.ContainsKey($Target)) { throw "unknown target $Target" }
$cfg = $hosts[$Target]
if ($cfg.IsProd -and -not $Confirm) { throw "prod target requires -Confirm" }

$apiImage = 'report-tool-api:' + $Tag
$webImage = 'report-tool-web:' + $Tag
$pdfImage = 'report-pdf:' + $Tag
$remoteDir = Join-Path $cfg.DockerData 'report-tool'

function Invoke-Host {
    param([hashtable]$HostCfg, [scriptblock]$Body, [hashtable]$Vars = @{})
    if ($HostCfg.Local) {
        foreach ($k in $Vars.Keys) { Set-Variable -Name $k -Value $Vars[$k] -Scope Script }
        & $Body
    }
    else {
        Invoke-Remote -HostCfg $HostCfg -Body $Body -Vars $Vars
    }
}

Write-Log ("deploy report-tool target={0} ip={1}" -f $Target, $cfg.Ip) STEP
if (-not $cfg.Local) {
    Write-Log ("ready -> " + (Test-RemoteReady -HostCfg $cfg)) OK
}

$fontsDir = Join-Path $RepoRoot 'report-pdf\fonts'
if (-not (Test-Path $fontsDir)) { New-Item -ItemType Directory -Path $fontsDir -Force | Out-Null }
foreach ($f in @(
    'times.ttf', 'timesbd.ttf', 'timesi.ttf', 'timesbi.ttf',
    'simsun.ttc', 'simhei.ttf', 'seguisym.ttf'
)) {
    $src = Join-Path 'C:\Windows\Fonts' $f
    $dst = Join-Path $fontsDir $f
    if ((Test-Path $src) -and -not (Test-Path $dst)) { Copy-Item $src $dst }
}

$libRoot = Join-Path $RepoRoot '.docker-libs'
$barcodeLib = Join-Path $libRoot 'niqer-barcode'
$pdfLib = Join-Path $libRoot 'niqer-pdf'
if (Test-Path $libRoot) { Remove-Item $libRoot -Recurse -Force }
New-Item -ItemType Directory -Path $barcodeLib -Force | Out-Null
New-Item -ItemType Directory -Path $pdfLib -Force | Out-Null
cmd /c "robocopy D:\niqer-barcode `"$barcodeLib`" /E /XD .git node_modules /NFL /NDL /NJH /NJS /NC /NS"
if ($LASTEXITCODE -ge 8) { throw "robocopy niqer-barcode failed code=$LASTEXITCODE" }
cmd /c "robocopy D:\niqer-pdf `"$pdfLib`" /E /XD .git node_modules /NFL /NDL /NJH /NJS /NC /NS"
if ($LASTEXITCODE -ge 8) { throw "robocopy niqer-pdf failed code=$LASTEXITCODE" }

if (-not $SkipBuild) {
    Write-Log 'build web dist' STEP
    Push-Location 'D:\niqer-report'
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw 'npm install @niqer/report failed' }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'npm run build @niqer/report failed' }
    }
    finally { Pop-Location }
    Push-Location (Join-Path $RepoRoot 'apps\report-tool-web')
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw 'npm install report-tool-web failed' }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'vite build failed' }
    }
    finally { Pop-Location }

    Write-Log ("docker build " + $pdfImage) STEP
    docker build -f (Join-Path $RepoRoot 'report-pdf\Dockerfile') -t $pdfImage $RepoRoot
    if ($LASTEXITCODE -ne 0) { throw 'docker build report-pdf failed' }

    Write-Log ("docker build " + $apiImage) STEP
    docker build -f (Join-Path $RepoRoot 'apps\report-tool-api\Dockerfile') -t $apiImage $RepoRoot
    if ($LASTEXITCODE -ne 0) { throw 'docker build report-tool-api failed' }

    Write-Log ("docker build " + $webImage) STEP
    docker build -f (Join-Path $RepoRoot 'apps\report-tool-web\Dockerfile') -t $webImage $RepoRoot
    if ($LASTEXITCODE -ne 0) { throw 'docker build report-tool-web failed' }
}

if (-not $cfg.Local) {
    Send-Image -HostCfg $cfg -Image $pdfImage
    Send-Image -HostCfg $cfg -Image $apiImage
    Send-Image -HostCfg $cfg -Image $webImage
}

$composeSrc = Join-Path $RepoRoot 'docker-compose.tool.test.yml'
$remoteCompose = Join-Path $remoteDir 'docker-compose.yml'
$envText = "REPORT_TOOL_API_IMAGE=$apiImage`nREPORT_TOOL_WEB_IMAGE=$webImage`nREPORT_PDF_IMAGE=$pdfImage`n"
$localEnv = Join-Path $env:TEMP 'report-tool.env'
Set-Content -Path $localEnv -Value $envText -Encoding ascii

Invoke-Host -HostCfg $cfg -Vars @{ Dest = $remoteDir } -Body {
    if (-not (Test-Path $Dest)) { New-Item -ItemType Directory -Path $Dest -Force | Out-Null }
}
if ($cfg.Local) {
    Copy-Item $composeSrc $remoteCompose -Force
    Copy-Item $localEnv (Join-Path $remoteDir '.env') -Force
}
else {
    Copy-FileToRemote -HostCfg $cfg -LocalFile $composeSrc -RemoteFile $remoteCompose
    Copy-FileToRemote -HostCfg $cfg -LocalFile $localEnv -RemoteFile (Join-Path $remoteDir '.env')
}

Write-Log 'remote compose up' STEP
Invoke-Host -HostCfg $cfg -Vars @{ Dest = $remoteDir } -Body {
    Set-Location $Dest
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $up = @(docker compose up -d 2>&1)
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    $up | ForEach-Object { "$_" }
    if ($code -ne 0) { throw ("docker compose up failed: " + ($up -join "`n")) }
}

Write-Log 'wait api health' STEP
$deadline = (Get-Date).AddSeconds(90)
$ok = $false
while ((Get-Date) -lt $deadline) {
    $line = Invoke-Host -HostCfg $cfg -Body {
        try {
            $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8088/health' -UseBasicParsing -TimeoutSec 5
            "http=$($r.StatusCode)"
        }
        catch { 'http=err' }
    }
    if ("$line" -match 'http=200') { $ok = $true; break }
    Start-Sleep -Seconds 3
}
if (-not $ok) { throw 'api health timeout' }

Write-Log ("published http://{0}:8089 api http://{0}:8088 login admin/admin123" -f $cfg.Ip) OK
Close-AllSessions

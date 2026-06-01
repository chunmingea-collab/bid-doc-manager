# Build paddleocr_runner.exe — a single-file Windows binary that bundles
# Python + PaddleOCR. Run once on a developer machine that has Python 3.11+.
# The output is committed (or attached as a release artifact) to vendor/paddleocr/.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\build-paddleocr-runner.ps1

$ErrorActionPreference = "Stop"

$Root      = Split-Path -Parent $PSScriptRoot
$VenvDir   = Join-Path $Root ".venv-paddleocr"
$VendorDir = Join-Path $Root "vendor\paddleocr"
$Runner    = Join-Path $Root "scripts\paddleocr_runner.py"

Write-Host "== Building paddleocr_runner.exe ==" -ForegroundColor Cyan
Write-Host "Root:   $Root"
Write-Host "Venv:   $VenvDir"
Write-Host "Output: $VendorDir"

if (-not (Test-Path $VenvDir)) {
    Write-Host "Creating venv..."
    python -m venv $VenvDir
}

$Pip    = Join-Path $VenvDir "Scripts\pip.exe"
$Python = Join-Path $VenvDir "Scripts\python.exe"

Write-Host "Installing paddleocr + paddlepaddle + pyinstaller (this may take a while)..."
& $Pip install --upgrade pip
& $Pip install paddlepaddle paddleocr pyinstaller

New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null

Push-Location $Root
try {
    & $Python -m PyInstaller `
        --noconfirm `
        --onefile `
        --name paddleocr_runner `
        --distpath $VendorDir `
        --workpath (Join-Path $Root "build\pyinstaller") `
        --specpath (Join-Path $Root "build") `
        --collect-all paddleocr `
        --collect-all paddle `
        $Runner
} finally {
    Pop-Location
}

$ExePath = Join-Path $VendorDir "paddleocr_runner.exe"
if (-not (Test-Path $ExePath)) {
    Write-Error "Build failed — $ExePath not produced"
    exit 1
}

Write-Host ""
Write-Host "Built: $ExePath" -ForegroundColor Green
Write-Host ""
Write-Host "Self-test..."
& $ExePath --selftest

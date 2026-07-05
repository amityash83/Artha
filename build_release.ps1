# Financial Operating System (FOS) Release Build Automation Script
# Version: 1.0.0
# Date: July 2026

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   FINANCIAL OPERATING SYSTEM (FOS) RELEASE BUILD SYSTEM" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Step 1: Kill active application instances to prevent file locking
Write-Host "[1/5] Terminating active FOS/Artha instances..." -ForegroundColor Yellow
Stop-Process -Name "Artha", "FinanceOS", "main" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Step 2: Compile React Frontend Assets
Write-Host "[2/5] Compiling React frontend assets..." -ForegroundColor Yellow
npm run build:frontend
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend compilation failed!"
    Exit $LASTEXITCODE
}

# Step 3: Compile Python Backend Sidecar
Write-Host "[3/5] Compiling Python FastAPI backend sidecar..." -ForegroundColor Yellow
npm run build:backend
if ($LASTEXITCODE -ne 0) {
    Write-Error "Backend compilation failed!"
    Exit $LASTEXITCODE
}

# Step 4: Package standalone portable Electron executable
Write-Host "[4/5] Packaging standalone portable desktop executable..." -ForegroundColor Yellow
npx electron-builder --win portable
if ($LASTEXITCODE -ne 0) {
    Write-Error "Electron packaging failed!"
    Exit $LASTEXITCODE
}

# Step 5: Copy active database to portable folder
Write-Host "[5/5] Syncing active database to portable release directory..." -ForegroundColor Yellow
if (Test-Path "data/finance.db") {
    if (-not (Test-Path "dist-portable/data")) {
        New-Item -ItemType Directory -Force -Path "dist-portable/data" | Out-Null
    }
    Copy-Item -Path "data/finance.db" -Destination "dist-portable/data/finance.db" -Force
    Write-Host "Database copied successfully." -ForegroundColor Green
} else {
    Write-Host "Warning: Source database (data/finance.db) not found. Skipping database copy." -ForegroundColor Gray
}

# Retrieve target executable name from package.json version and build properties
$packageJson = Get-Content -Raw -Path "package.json" | ConvertFrom-Json
$version = $packageJson.version
$productName = $packageJson.build.productName
$exeName = "$productName $version.exe"
$exePath = Join-Path (Get-Location) "dist-portable\$exeName"

# Copy to external deployment path if it exists (e.g., D:\Artha)
$targetDeployDir = "D:\Artha"
if (Test-Path $targetDeployDir) {
    Write-Host "`n[Deployment] Copying fresh binary to $targetDeployDir..." -ForegroundColor Yellow
    
    # Terminate any running instance of the app to prevent copy lock
    Stop-Process -Name $productName, "FinanceOS" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    
    Copy-Item -Path $exePath -Destination (Join-Path $targetDeployDir $exeName) -Force
    Write-Host "Deployed successfully to $targetDeployDir\$exeName" -ForegroundColor Green
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "   BUILD SUCCESSFUL!" -ForegroundColor Green
Write-Host "   Executable: $exePath" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

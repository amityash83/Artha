# artha.ps1 - Control script for the Artha dev stack (backend + Vite + Electron).
# Usage: .\artha.ps1 [start|stop|restart|status]
#
# start   Launches `npm start` (concurrently: uvicorn --reload :8000, vite :5173,
#         electron) as one background tree, tracked via .artha.pid, and waits until
#         both servers actually respond before declaring success.
# stop    Kills ONLY Artha's own processes: the tracked tree plus any stray
#         uvicorn/vite/electron whose command line points at this repo. Never
#         touches unrelated node/python processes (e.g. other projects, VS Code
#         extension language servers).
# restart stop + start.
# status  PID liveness, port ownership, and an API identity check.

param (
    [string]$Action = "start"
)

$RootDir = $PSScriptRoot
$PID_FILE = Join-Path $RootDir ".artha.pid"
$LOG_FILE = Join-Path $RootDir "artha.log"
$ERR_FILE = Join-Path $RootDir "artha.err.log"
$BackendPort = if ($env:ARTHA_BACKEND_PORT) { [int]$env:ARTHA_BACKEND_PORT } else { 8000 }
$FrontendPort = if ($env:ARTHA_FRONTEND_PORT) { [int]$env:ARTHA_FRONTEND_PORT } else { 5173 }

function Show-Header {
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "   ARTHA FINANCIAL OS CONTROL UTILITY   " -ForegroundColor Cyan -NoNewline
    Write-Host "v2.0" -ForegroundColor Yellow
    Write-Host "=============================================" -ForegroundColor Cyan
}

# A port responding is NOT proof it's Artha — check response content, not just liveness.
function Test-ArthaBackend {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$BackendPort/api/init" -UseBasicParsing -TimeoutSec 3
        return ($resp.Content -match '"summary"')
    } catch { return $false }
}

function Test-ArthaFrontend {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$FrontendPort/" -UseBasicParsing -TimeoutSec 3
        return ($resp.Content -match '(?i)<title>Artha')
    } catch { return $false }
}

function Get-PortOwner([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) { return ($conn.OwningProcess | Select-Object -Unique) }
    return $null
}

# All processes that are demonstrably Artha's: command line references this repo's
# uvicorn app, or the executable/args point into this repo (vite, electron, concurrently).
function Get-ArthaProcesses {
    $repoPattern = "*$RootDir*"
    $found = @()
    $found += Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
        Where-Object { $_.CommandLine -like "*uvicorn*backend.main:app*" }
    $found += Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -like $repoPattern }
    $found += Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" |
        Where-Object { ($_.ExecutablePath -like $repoPattern) -or ($_.CommandLine -like $repoPattern) }
    return $found
}

function Stop-Services {
    Show-Header
    $killedAny = $false

    if (Test-Path $PID_FILE) {
        $rootProcId = Get-Content $PID_FILE -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($rootProcId -and (Get-Process -Id $rootProcId -ErrorAction SilentlyContinue)) {
            Write-Host "[+] Stopping tracked Artha tree (root pid $rootProcId)..." -ForegroundColor Green
            taskkill /pid $rootProcId /t /f 2>$null | Out-Null
            $killedAny = $true
        }
        Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Milliseconds 500
    foreach ($proc in Get-ArthaProcesses) {
        Write-Host "    - Terminating stray $($proc.Name) (pid $($proc.ProcessId))" -ForegroundColor Gray
        taskkill /pid $proc.ProcessId /t /f 2>$null | Out-Null
        $killedAny = $true
    }

    Start-Sleep -Milliseconds 500
    foreach ($port in @($BackendPort, $FrontendPort)) {
        $owner = Get-PortOwner $port
        if ($owner) {
            Write-Host "[!] Port $port is still in use by pid $owner - NOT Artha's process, refusing to kill it." -ForegroundColor Yellow
            Write-Host "    Inspect it with: Get-Process -Id $owner" -ForegroundColor Yellow
        }
    }

    if ($killedAny) {
        Write-Host "[x] Artha services stopped." -ForegroundColor Green
    } else {
        Write-Host "[-] Nothing to stop - no Artha processes found." -ForegroundColor Yellow
    }
}

function Start-Services {
    Show-Header

    if (Test-ArthaBackend) {
        Write-Host "[-] Artha's backend is already serving on port $BackendPort. Use '.\artha.ps1 restart' instead." -ForegroundColor Red
        return
    }
    foreach ($port in @($BackendPort, $FrontendPort)) {
        $owner = Get-PortOwner $port
        if ($owner) {
            Write-Host "[-] Port $port is already in use by pid $owner (not Artha). Free it or override ARTHA_BACKEND_PORT/ARTHA_FRONTEND_PORT." -ForegroundColor Red
            return
        }
    }

    # Shells spawned from Electron-based hosts (VS Code terminals, etc.) inherit
    # ELECTRON_RUN_AS_NODE, which makes `electron .` run as plain Node and crash on
    # require('electron') (ipcMain undefined). Clear it for the child tree.
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    Remove-Item Env:ELECTRON_NO_ATTACH_CONSOLE -ErrorAction SilentlyContinue

    Write-Host "[+] Launching Artha (npm start: backend :$BackendPort + vite :$FrontendPort + electron)..." -ForegroundColor Green
    $proc = Start-Process -FilePath "npm.cmd" -ArgumentList "start" -WorkingDirectory $RootDir `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $LOG_FILE -RedirectStandardError $ERR_FILE
    $proc.Id | Out-File -FilePath $PID_FILE -Encoding ascii

    Write-Host "[+] Waiting for services to come up..." -ForegroundColor Green
    $backendUp = $false
    $frontendUp = $false
    for ($i = 0; $i -lt 30; $i++) {
        if (-not $backendUp) { $backendUp = Test-ArthaBackend }
        if (-not $frontendUp) { $frontendUp = Test-ArthaFrontend }
        if ($backendUp -and $frontendUp) { break }
        Start-Sleep -Seconds 1
    }

    if ($backendUp -and $frontendUp) {
        Write-Host "[x] Artha is up: backend http://127.0.0.1:$BackendPort | frontend http://localhost:$FrontendPort" -ForegroundColor Green
        Write-Host "    Root pid: $($proc.Id) (tree tracked in .artha.pid) | Logs: artha.log / artha.err.log" -ForegroundColor Gray
    } else {
        Write-Host "[-] Startup incomplete after 30s (backend up: $backendUp, frontend up: $frontendUp)." -ForegroundColor Red
        Write-Host "    Check artha.log and artha.err.log for the failing service." -ForegroundColor Red
    }
}

function Show-Status {
    Show-Header
    if (Test-Path $PID_FILE) {
        $rootProcId = Get-Content $PID_FILE | Select-Object -First 1
        $alive = [bool](Get-Process -Id $rootProcId -ErrorAction SilentlyContinue)
        $state = if ($alive) { "RUNNING" } else { "DEAD (stale pid file)" }
        Write-Host "[*] Tracked root pid ${rootProcId}: $state" -ForegroundColor $(if ($alive) { 'Green' } else { 'Red' })
    } else {
        Write-Host "[*] No .artha.pid - not started via this script." -ForegroundColor Yellow
    }

    $backendOk = Test-ArthaBackend
    $frontendOk = Test-ArthaFrontend
    Write-Host "[*] Backend  :$BackendPort -> $(if ($backendOk) { 'Artha API responding' } else { 'not responding / not Artha' })" -ForegroundColor $(if ($backendOk) { 'Green' } else { 'Red' })
    Write-Host "[*] Frontend :$FrontendPort -> $(if ($frontendOk) { 'Artha UI responding' } else { 'not responding / not Artha' })" -ForegroundColor $(if ($frontendOk) { 'Green' } else { 'Red' })

    $procs = Get-ArthaProcesses
    if ($procs) {
        Write-Host "[*] Artha processes:" -ForegroundColor Cyan
        foreach ($p in $procs) {
            Write-Host "    - $($p.ProcessId) $($p.Name)" -ForegroundColor Gray
        }
    } else {
        Write-Host "[*] No Artha processes running." -ForegroundColor Yellow
    }
}

switch ($Action.ToLower()) {
    "start"   { Start-Services }
    "stop"    { Stop-Services }
    "restart" { Stop-Services; Write-Host ""; Start-Services }
    "status"  { Show-Status }
    default {
        Write-Host "[!] Unknown action: $Action" -ForegroundColor Red
        Write-Host "    Usage: .\artha.ps1 [start|stop|restart|status]" -ForegroundColor Yellow
    }
}

# artha.ps1 - Control script for starting/stopping Artha services

param (
    [string]$Action = "start"
)

$PID_FILE = "$PSScriptRoot\.artha.pid"

function Show-Header {
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "   ARTHA FINANCIAL OS CONTROL UTILITY       " -ForegroundColor Cyan -NoNewline
    Write-Host " v1.0" -ForegroundColor Yellow
    Write-Host "=============================================" -ForegroundColor Cyan
}

function Start-Services {
    Show-Header
    if (Test-Path $PID_FILE) {
        Write-Host "[!] Services might already be running. Checking..." -ForegroundColor Yellow
        $pids = Get-Content $PID_FILE -ErrorAction SilentlyContinue
        $activeCount = 0
        foreach ($pidVal in $pids) {
            if (Get-Process -Id $pidVal -ErrorAction SilentlyContinue) {
                $activeCount++
            }
        }
        if ($activeCount -gt 0) {
            Write-Host "[-] Artha is already running (PIDs: $pids)." -ForegroundColor Red
            Write-Host "[-] Run '.\artha.ps1 stop' to stop them first." -ForegroundColor Red
            return
        }
        Remove-Item $PID_FILE
    }

    Write-Host "[+] Starting Backend FastAPI Server..." -ForegroundColor Green
    $backendProcess = Start-Process -FilePath "venv\Scripts\python.exe" -ArgumentList "-m uvicorn backend.main:app --host 127.0.0.1 --port 8000" -WindowStyle Hidden -PassThru

    Write-Host "[+] Starting Frontend & Desktop Client..." -ForegroundColor Green
    $frontendProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run start" -WindowStyle Normal -PassThru

    # Write PIDs to file
    $pids = @($backendProcess.Id, $frontendProcess.Id)
    $pids | Out-File -FilePath $PID_FILE -Encoding ascii

    Write-Host "[+] Services launched successfully!" -ForegroundColor Green
    Write-Host "    - Backend PID: $($backendProcess.Id) (running hidden on port 8000)" -ForegroundColor Gray
    Write-Host "    - Frontend PID: $($frontendProcess.Id)" -ForegroundColor Gray
    Write-Host "    - Run '.\artha.ps1 stop' to terminate." -ForegroundColor Yellow
}

function Stop-Services {
    Show-Header
    if (-not (Test-Path $PID_FILE)) {
        Write-Host "[!] No active services recorded in .artha.pid." -ForegroundColor Yellow
        Write-Host "[!] Cleaning up any runaway node, electron, or python instances..." -ForegroundColor Gray
        Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
        Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue
        
        # Stop uvicorn/python process
        Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object { $_.CommandLine -like "*uvicorn*" } | ForEach-Object {
            Write-Host "    - Terminating python/uvicorn process: $($_.ProcessId)" -ForegroundColor Gray
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
        
        Write-Host "[x] Finished." -ForegroundColor Green
        return
    }

    $pids = Get-Content $PID_FILE
    Write-Host "[+] Stopping Artha services..." -ForegroundColor Green
    
    foreach ($pidVal in $pids) {
        $p = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "    - Terminating Process ID $pidVal ($($p.ProcessName))..." -ForegroundColor Gray
            Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
        }
    }

    # Ensure orphaned dependencies are stopped
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object { $_.CommandLine -like "*uvicorn*" } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

    Remove-Item $PID_FILE -ErrorAction SilentlyContinue
    Write-Host "[x] All Artha services stopped successfully." -ForegroundColor Green
}

function Show-Status {
    Show-Header
    if (Test-Path $PID_FILE) {
        $pids = Get-Content $PID_FILE
        Write-Host "[*] Active processes recorded:" -ForegroundColor Cyan
        foreach ($pidVal in $pids) {
            $p = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
            if ($p) {
                Write-Host "    - PID $($pidVal): $($p.ProcessName) (Status: RUNNING)" -ForegroundColor Green
            } else {
                Write-Host "    - PID $($pidVal): (Status: TERMINATED/DEAD)" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "[-] Artha services are currently STOPPED." -ForegroundColor Yellow
    }
}

switch ($Action.ToLower()) {
    "start" { Start-Services }
    "stop" { Stop-Services }
    "status" { Show-Status }
    default {
        Write-Host "[!] Unknown action: $Action" -ForegroundColor Red
        Write-Host "    Usage: .\artha.ps1 [start|stop|status]" -ForegroundColor Yellow
    }
}

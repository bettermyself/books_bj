$ErrorActionPreference = 'SilentlyContinue'

# Port 8000 already listening = service already running; just open browser
if (Get-NetTCPConnection -LocalPort 8000 -State Listen) {
    Write-Host 'Service already running: http://localhost:8000'
    Start-Process 'http://localhost:8000'
    Start-Sleep -Seconds 3
    exit 0
}

# Start python in a hidden window (background, detached from any terminal).
# SERVER_LOG=1 is inherited by the child so server.py writes server.log.
$env:SERVER_LOG = '1'
Start-Process -FilePath 'python.exe' -ArgumentList 'server.py' -WindowStyle Hidden -WorkingDirectory $PSScriptRoot
Start-Sleep -Seconds 2
Write-Host 'Service started (background): http://localhost:8000'
Write-Host 'Closing this window will NOT stop the service.'
Start-Sleep -Seconds 3

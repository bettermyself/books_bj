$ErrorActionPreference = 'SilentlyContinue'
$conns = Get-NetTCPConnection -LocalPort 8000 -State Listen
if ($conns) {
    $conns | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
    Write-Host 'Service stopped.'
} else {
    Write-Host 'Service not running.'
}
Start-Sleep -Seconds 3

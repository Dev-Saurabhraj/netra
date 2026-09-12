param (
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "stop", "status", "link-down-sw2", "link-up-sw2", "add-sw4", "remove-sw4")]
    [string]$Action
)

$LabCompose = Join-Path $PSScriptRoot "..\docker-compose.lab.yml"

switch ($Action) {
    "start" {
        Write-Host "🚀 Starting NETRA Simulated Network Lab (6 nodes)..." -ForegroundColor Cyan
        docker compose -f $LabCompose up -d --build
        Write-Host "✅ Network Lab is running on subnet 192.168.100.0/24" -ForegroundColor Green
    }
    "stop" {
        Write-Host "🛑 Stopping Network Lab..." -ForegroundColor Yellow
        docker compose -f $LabCompose down
        Write-Host "✅ Network Lab stopped." -ForegroundColor Green
    }
    "status" {
        docker compose -f $LabCompose ps
    }
    "link-down-sw2" {
        Write-Host "⚠️ Simulating Link Failure: Disconnecting SW2 from lab network..." -ForegroundColor Red
        docker network disconnect netra_lab_net netra-lab-sw2
        Write-Host "✅ SW2 link is now DOWN. Trigger NETRA discovery to see LINK_REMOVED alert." -ForegroundColor Yellow
    }
    "link-up-sw2" {
        Write-Host "🔄 Restoring Link: Reconnecting SW2 to lab network..." -ForegroundColor Cyan
        docker network connect --ip 192.168.100.3 netra_lab_net netra-lab-sw2
        Write-Host "✅ SW2 link is now RECOVERED." -ForegroundColor Green
    }
    "add-sw4" {
        Write-Host "➕ Simulating New Device: Launching Access Switch 4 (SW4)..." -ForegroundColor Cyan
        docker run -d --name netra-lab-sw4 --hostname SW4-NewSwitch --net netra_lab_net --ip 192.168.100.5 alpine:3.19 sleep infinity
        Write-Host "✅ SW4 added at 192.168.100.5. Trigger discovery to see NEW_DEVICE detection." -ForegroundColor Green
    }
    "remove-sw4" {
        Write-Host "➖ Removing simulated SW4..." -ForegroundColor Yellow
        docker rm -f netra-lab-sw4
        Write-Host "✅ SW4 removed." -ForegroundColor Green
    }
}


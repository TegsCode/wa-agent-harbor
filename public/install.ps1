# WhatsApp Agent Hub - local bridge installer (WAHA + Tailscale Funnel)
#
# The bridge needs a public HTTPS URL that never changes. A Cloudflare quick
# tunnel cannot do that: it mints a new random trycloudflare.com hostname every
# time it restarts (and it restarts whenever the network blips), so the URL you
# pasted into Settings dies and the app answers "error code 1033 / 1016".
# Tailscale Funnel keeps one hostname for the life of the machine, free.
$ErrorActionPreference = "Stop"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Error "Docker Desktop is required: https://docs.docker.com/desktop/install/windows-install/" }
$dir = Join-Path $HOME "wa-agent-bridge"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Location $dir
if (-not (Test-Path .env)) { $key = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) }); "WAHA_API_KEY=$key" | Out-File -Encoding ascii .env }
@'
services:
  waha:
    # Pinned: WAHA renamed the no-browser engine (NOWEBJS -> NOWEB in 2026.x).
    # An unknown engine name silently falls back to WEBJS, which needs Chromium
    # and leaves sessions stuck in STARTING on many machines.
    image: devlikeapro/waha:latest-2026.10.1
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      WAHA_API_KEY: ${WAHA_API_KEY}
      WHATSAPP_API_KEY: ${WAHA_API_KEY}
      WHATSAPP_DEFAULT_ENGINE: NOWEB
    volumes:
      - ./sessions:/app/.sessions
'@ | Out-File -Encoding utf8 docker-compose.yml
docker compose up -d

$ts = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) {
  Write-Host "Installing Tailscale..."
  winget install --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements --silent | Out-Null
  Start-Sleep 5
}
if (-not (Test-Path $ts)) { $ts = "tailscale" }

$state = $null
try { $state = (& $ts status --json 2>$null | ConvertFrom-Json) } catch { $state = $null }
if (-not $state -or $state.BackendState -ne "Running") {
  Write-Host ""
  Write-Host "Tailscale needs a one-time login. Open the URL below, then run this"
  Write-Host "installer again."
  & $ts up
  exit 0
}

& $ts funnel --bg 3000 | Out-Null
$url = "https://" + $state.Self.DNSName.TrimEnd('.')

Write-Host ""
Write-Host "==========================================="
Write-Host " Bridge URL:     $url"
Write-Host (" Bridge API key: " + ((Get-Content .env) -replace 'WAHA_API_KEY=',''))
Write-Host "==========================================="
Write-Host "Paste both into WhatsApp Agent Hub > Settings > Bridge."
Write-Host "This URL never changes - it survives reboots and network changes."

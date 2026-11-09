# WhatsApp Agent Hub - local bridge installer (WAHA + Cloudflare Tunnel)
$ErrorActionPreference = "Stop"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Error "Docker Desktop is required: https://docs.docker.com/desktop/install/windows-install/" }
$dir = Join-Path $HOME "wa-agent-bridge"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Location $dir
if (-not (Test-Path .env)) { $key = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) }); "WAHA_API_KEY=$key" | Out-File -Encoding ascii .env }
@'
services:
  waha:
    image: devlikeapro/waha
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      WAHA_API_KEY: ${WAHA_API_KEY}
      WHATSAPP_API_KEY: ${WAHA_API_KEY}
      WHATSAPP_DEFAULT_ENGINE: WEBJS
    volumes:
      - ./sessions:/app/.sessions
  tunnel:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate --url http://waha:3000
    depends_on:
      - waha
'@ | Out-File -Encoding utf8 docker-compose.yml
docker compose up -d
Write-Host "Waiting for Cloudflare Tunnel URL..."
$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) {
  $m = (docker compose logs tunnel 2>$null) | Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1
  if ($m) { $url = $m.Matches[0].Value } else { Start-Sleep 2 }
}
Write-Host ""
Write-Host "Bridge URL:     $url"
Write-Host ("Bridge API key: " + ((Get-Content .env) -replace 'WAHA_API_KEY=',''))
Write-Host "Paste both into WhatsApp Agent Hub > Settings > Bridge."

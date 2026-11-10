export const COMPOSE_YML = `services:
  waha:
    # Pinned: WAHA renamed the no-browser engine (NOWEBJS -> NOWEB in 2026.x).
    # An unknown engine name silently falls back to WEBJS, which needs Chromium
    # and leaves sessions stuck in STARTING on many machines.
    image: devlikeapro/waha:2026.10.1
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      WAHA_API_KEY: \${WAHA_API_KEY}
      WHATSAPP_API_KEY: \${WAHA_API_KEY}
      WHATSAPP_DEFAULT_ENGINE: NOWEB
    volumes:
      - ./sessions:/app/.sessions
  tunnel:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate --url http://waha:3000
    depends_on:
      - waha
`;

export const INSTALL_SH = `#!/usr/bin/env bash
# WhatsApp Agent Hub - local bridge installer (WAHA + Cloudflare Tunnel)
set -euo pipefail
command -v docker >/dev/null 2>&1 || { echo "Docker is required: https://docs.docker.com/get-docker/"; exit 1; }
DIR="$HOME/wa-agent-bridge"
mkdir -p "$DIR" && cd "$DIR"
if [ ! -f .env ]; then
  KEY="$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \\n')"
  echo "WAHA_API_KEY=$KEY" > .env
fi
cat > docker-compose.yml <<'YML'
${COMPOSE_YML}YML
docker compose up -d
echo "Waiting for Cloudflare Tunnel URL..."
URL=""
for i in $(seq 1 30); do
  URL="$(docker compose logs tunnel 2>/dev/null | grep -o 'https://[a-z0-9-]*\\.trycloudflare\\.com' | tail -1 || true)"
  [ -n "$URL" ] && break
  sleep 2
done
echo ""
echo "==========================================="
echo " Bridge URL:     \${URL:-<check: docker compose logs tunnel>}"
echo " Bridge API key: $(grep WAHA_API_KEY .env | cut -d= -f2)"
echo "==========================================="
echo "Paste both into WhatsApp Agent Hub > Settings > Bridge."
`;

export const INSTALL_PS1 = `# WhatsApp Agent Hub - local bridge installer (WAHA + Cloudflare Tunnel)
$ErrorActionPreference = "Stop"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Error "Docker Desktop is required: https://docs.docker.com/desktop/install/windows-install/" }
$dir = Join-Path $HOME "wa-agent-bridge"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Location $dir
if (-not (Test-Path .env)) { $key = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) }); "WAHA_API_KEY=$key" | Out-File -Encoding ascii .env }
@'
${COMPOSE_YML}'@ | Out-File -Encoding utf8 docker-compose.yml
docker compose up -d
Write-Host "Waiting for Cloudflare Tunnel URL..."
$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) {
  $m = (docker compose logs tunnel 2>$null) | Select-String -Pattern 'https://[a-z0-9-]+\\.trycloudflare\\.com' | Select-Object -Last 1
  if ($m) { $url = $m.Matches[0].Value } else { Start-Sleep 2 }
}
Write-Host ""
Write-Host "Bridge URL:     $url"
Write-Host ("Bridge API key: " + ((Get-Content .env) -replace 'WAHA_API_KEY=',''))
Write-Host "Paste both into WhatsApp Agent Hub > Settings > Bridge."
`;

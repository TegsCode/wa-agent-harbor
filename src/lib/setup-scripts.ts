export const COMPOSE_YML = `services:
  waha:
    # Pinned: WAHA renamed the no-browser engine (NOWEBJS -> NOWEB in 2026.x).
    # An unknown engine name silently falls back to WEBJS, which needs Chromium
    # and leaves sessions stuck in STARTING on many machines.
    image: devlikeapro/waha:latest-2026.10.1
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      WAHA_API_KEY: \${WAHA_API_KEY}
      WHATSAPP_API_KEY: \${WAHA_API_KEY}
      WHATSAPP_DEFAULT_ENGINE: NOWEB
    volumes:
      - ./sessions:/app/.sessions
`;

export const INSTALL_SH = `#!/usr/bin/env bash
# WhatsApp Agent Hub - local bridge installer (WAHA + Tailscale Funnel)
#
# The bridge needs a public HTTPS URL that never changes. A Cloudflare quick
# tunnel cannot do that: it mints a new random trycloudflare.com hostname every
# time it restarts (and it restarts whenever the network blips), so the URL you
# pasted into Settings dies and the app answers "error code 1033 / 1016".
# Tailscale Funnel keeps one hostname for the life of the machine, free.
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

SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Installing Tailscale..."
  curl -fsSL https://tailscale.com/install.sh | $SUDO sh
fi

if ! tailscale status >/dev/null 2>&1; then
  echo ""
  echo "Tailscale needs a one-time login. Open the URL it prints, then run this"
  echo "installer again."
  $SUDO tailscale up || tailscale up || true
  exit 0
fi

$SUDO tailscale funnel --bg 3000 >/dev/null
HOST="$(tailscale status --json | sed -n 's/.*"DNSName": *"\\([^"]*\\)".*/\\1/p' | head -1 | sed 's/\\.$//')"

echo ""
echo "==========================================="
echo " Bridge URL:     https://\${HOST:-<check: tailscale status>}"
echo " Bridge API key: $(grep WAHA_API_KEY .env | cut -d= -f2)"
echo "==========================================="
echo "Paste both into WhatsApp Agent Hub > Settings > Bridge."
echo "This URL never changes - it survives reboots and network changes."
`;

export const INSTALL_PS1 = `# WhatsApp Agent Hub - local bridge installer (WAHA + Tailscale Funnel)
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
${COMPOSE_YML}'@ | Out-File -Encoding utf8 docker-compose.yml
docker compose up -d

$ts = Join-Path $env:ProgramFiles "Tailscale\\tailscale.exe"
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
`;

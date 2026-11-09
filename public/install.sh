#!/usr/bin/env bash
# WhatsApp Agent Hub - local bridge installer (WAHA + Cloudflare Tunnel)
set -euo pipefail
command -v docker >/dev/null 2>&1 || { echo "Docker is required: https://docs.docker.com/get-docker/"; exit 1; }
DIR="$HOME/wa-agent-bridge"
mkdir -p "$DIR" && cd "$DIR"
if [ ! -f .env ]; then
  KEY="$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  echo "WAHA_API_KEY=$KEY" > .env
fi
cat > docker-compose.yml <<'YML'
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
YML
docker compose up -d
echo "Waiting for Cloudflare Tunnel URL..."
URL=""
for i in $(seq 1 30); do
  URL="$(docker compose logs tunnel 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || true)"
  [ -n "$URL" ] && break
  sleep 2
done
echo ""
echo "==========================================="
echo " Bridge URL:     ${URL:-<check: docker compose logs tunnel>}"
echo " Bridge API key: $(grep WAHA_API_KEY .env | cut -d= -f2)"
echo "==========================================="
echo "Paste both into WhatsApp Agent Hub > Settings > Bridge."

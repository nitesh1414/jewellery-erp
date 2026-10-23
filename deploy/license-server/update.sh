#!/usr/bin/env bash
# Update the license server on the VPS to the latest code:
#   git pull → npm ci → build (license-core + server + admin portal) → restart → health check
#
# Usage:
#   bash deploy/license-server/update.sh           # restart via PM2 (default)
#   bash deploy/license-server/update.sh systemd   # restart via systemd
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Installing dependencies (Electron binary not needed on a server)"
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci

echo "==> Building license-core + license-server + admin-portal"
npm run build:license

echo "==> Restarting service"
if [ "${1:-pm2}" = "systemd" ]; then
  sudo systemctl restart jewellery-license-server
else
  pm2 restart jewellery-license-server
fi

echo "==> Waiting for health check"
PORT="$(grep -E '^PORT=' packages/license-server/.env 2>/dev/null | cut -d= -f2 || true)"
PORT="${PORT:-4010}"
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
    echo "OK — license server is up on port ${PORT}."
    exit 0
  fi
  sleep 2
done
echo "ERROR — health check never passed. Inspect logs:"
echo "  PM2:     pm2 logs jewellery-license-server --lines 100"
echo "  systemd: journalctl -u jewellery-license-server -n 100 --no-pager"
exit 1

#!/usr/bin/env bash
# Back up everything the license server cannot be rebuilt without:
# the SQLite database (data/), the Ed25519 signing keys (keys/) and .env.
# Losing data/ loses every subscription ever sold; losing the private key
# makes every license already issued unverifiable by the desktop apps.
#
#   bash deploy/license-server/backup.sh
# Suggested cron (daily 02:30):  crontab -e
#   30 2 * * * bash /var/www/jewellery-erp/deploy/license-server/backup.sh >/dev/null 2>&1
#
# ⚠️ The archive contains the PRIVATE signing key and .env secrets — copy it
# off the VPS (scp/S3/etc.) and treat it as a secret.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER_DIR="$REPO_ROOT/packages/license-server"
BACKUP_DIR="$REPO_ROOT/backups"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%F-%H%M%S)"
ARCHIVE="$BACKUP_DIR/license-backup-${STAMP}.tar.gz"

ITEMS=(data keys)
[ -f "$SERVER_DIR/.env" ] && ITEMS+=(.env)

tar -czf "$ARCHIVE" -C "$SERVER_DIR" "${ITEMS[@]}"
chmod 600 "$ARCHIVE"
echo "Backup written to $ARCHIVE"
echo "Now copy it somewhere OFF this server, e.g.:  scp $ARCHIVE you@backup-host:~/"

# Keep the newest 14 archives on this machine.
ls -1t "$BACKUP_DIR"/license-backup-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

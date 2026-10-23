# Deploying the License Server on a VPS (step-by-step)

This guide deploys the **cloud license server** (`packages/license-server`)
together with the **admin portal** (`packages/admin-portal`) on a single
Linux VPS, behind Nginx with HTTPS. It assumes Ubuntu 22.04/24.04 or
Debian 12 — the commands use `apt`; on other distros only Step 1 changes.

> **Hitting `Cannot find module '.../@jewellery-erp/license-core/dist/index.js'`?**
> `license-core` is a compiled workspace package whose `dist/` is gitignored,
> so a fresh clone has nothing for Node to load. One-command fix from the repo
> root: `npm run build -w packages/license-core` — then re-run your command.
> This is now automatic (`postinstall` + the license-server scripts build it
> when missing/stale; see `scripts/ensure-license-core.mjs`). If `git pull`
> says "Already up to date" you are probably on a branch that does not have
> the fix yet — cherry-pick it or just run that one build command.
> Also note the old `npx ts-node-dev … src/scripts/generate-keys.ts` form is
> superseded by `npm run license:generate-keys` (Step 5).

## What you are deploying

| Piece | Role on the VPS |
|---|---|
| `packages/license-server` | API on port **4010** (`/api/license/*` for desktop apps, `/api/auth|subscriptions|stats` for admins) **and** serves the built admin portal — one process, one URL |
| `packages/admin-portal` | React UI; in production it is only a static build (`dist/`) served by the license server — no separate process |
| `packages/license-core` | Shared signing/validation library; compiled to `dist/` at install/build time, never run standalone |
| Database | **SQLite** at `packages/license-server/data/license.db`, created and schema-pushed automatically on first start |
| Signing keys | Ed25519 pair in `packages/license-server/keys/` — private key never leaves this server |

The desktop apps only ever talk to `https://<your-domain>/api/license/activate|validate|deactivate`.
You (the admin) open the same URL in a browser to manage subscriptions.

Placeholders below: domain = `licenses.example.com`, checkout =
`/var/www/jewellery-erp` (replace both with your real values).

---

## Step 0 — Prerequisites

- A VPS with root (or sudo) SSH access, ≥ 1 GB RAM.
- A DNS **A record**: `licenses.example.com` → your VPS IP (create this first;
  HTTPS in Step 10 needs it to resolve).
- Ports **22, 80, 443** allowed by your cloud provider's firewall/security
  group. Port 4010 must **not** be exposed publicly (Step 11).

## Step 1 — Install system packages, Node.js and PM2

```bash
ssh root@<vps-ip>
apt update && apt upgrade -y
apt install -y git curl nginx ufw certbot python3-certbot-nginx

# Node.js 22 LTS (NodeSource). Node 20 LTS also works — swap setup_22.x → setup_20.x.
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

npm install -g pm2
node --version   # v22.x
npm --version
```

> Running everything as `root` works, but a dedicated user is safer for a
> public service. If you prefer one: `adduser jewellery-erp` and run the
> remaining steps as that user with the checkout in `/var/www` owned by it
> (`chown -R jewellery-erp:jewellery-erp /var/www/jewellery-erp`). The systemd
> unit in `deploy/license-server/` already assumes such a user; the PM2 path
> works either way.

## Step 2 — Get the code

```bash
mkdir -p /var/www && cd /var/www
git clone <your-repo-url> jewellery-erp      # skip if already cloned
cd /var/www/jewellery-erp
git pull --ff-only                            # if updating an existing clone
```

## Step 3 — Install dependencies

```bash
cd /var/www/jewellery-erp
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
```

- `npm ci` installs the whole monorepo exactly as locked. `ELECTRON_SKIP_BINARY_DOWNLOAD=1`
  just skips the ~100 MB Electron binary that a server never needs.
- The root `postinstall` now compiles `packages/license-core` automatically —
  you should see `[license-core] Built packages/license-core/dist.`
  Verify any time with: `ls packages/license-core/dist/index.js`.
  (If you are on an older checkout without the fix, run
  `npm run build -w packages/license-core` once, manually.)

## Step 4 — Configure the server (`.env`)

Do this **before the first start**: the admin account is created from
`ADMIN_EMAIL`/`ADMIN_PASSWORD` on first boot only.

```bash
cd /var/www/jewellery-erp/packages/license-server
cp .env.example .env
openssl rand -hex 48        # ← copy the output as your JWT_SECRET
nano .env
```

Set at least:

| Variable | What to put |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` | `127.0.0.1` (Nginx will be the only public entry point) |
| `PORT` | `4010` |
| `JWT_SECRET` | the long random string from `openssl rand -hex 48` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | your real admin login — **not** the defaults |
| `LICENSE_DATA_DIR` | absolute path, e.g. `/var/www/jewellery-erp/packages/license-server/data` |

`.env` is loaded by the server itself at startup (`src/config.ts`), is
gitignored, and real environment variables override it. Full reference:
[Appendix A](#appendix-a--environment-variables).

## Step 5 — Generate the PRODUCTION signing keys

```bash
cd /var/www/jewellery-erp
npm run license:generate-keys
ls -l packages/license-server/keys/
```

Creates `keys/license-private-key.pem` (secret, mode 600, gitignored) and
`keys/license-public-key.pem`. This replaces the old
`npx ts-node-dev --transpile-only src/scripts/generate-keys.ts` incantation —
no build required, and it refuses to overwrite existing production keys
without `--force`.

⚠️ **Order matters.** Licenses are verified by desktop apps against the
*public* key baked into the installer. Generate the production keypair
**before** building desktop installers you ship (Step 12). The keypair
committed in the repo (`keys/dev-license-*.pem`) is public development
material — if the server logs `Using DEVELOPMENT signing key` in production,
stop and do this step.

Back both files up off-server (Step 13). Losing the private key means every
license already issued stops verifying on customer machines.

## Step 6 — Build

```bash
cd /var/www/jewellery-erp
npm run build:license
```

Builds, in order: `license-core` → `license-server`
(`packages/license-server/dist/`) → `admin-portal`
(`packages/admin-portal/dist/`, which the server serves as the UI).

## Step 7 — Smoke-test in the foreground

```bash
npm run start:license
```

Expected on first run:

```
[license-server] Created default admin admin@… (password from ADMIN_PASSWORD env …)
[license-server] listening on http://127.0.0.1:4010
```

Two warnings must **not** appear: `Using DEVELOPMENT signing key` (Step 5)
and the `JWT_SECRET is not set` warning (Step 4).

In a second SSH session:

```bash
curl -s http://127.0.0.1:4010/api/health
# {"ok":true,"service":"license-server","time":"…"}
```

Then `Ctrl+C` the foreground server. First start also created
`packages/license-server/data/license.db` and pushed the schema — no manual
migration step exists for SQLite.

## Step 8 — Run it as a service (PM2)

```bash
cd /var/www/jewellery-erp
cp deploy/license-server/ecosystem.config.example.cjs deploy/license-server/ecosystem.config.cjs
pm2 start deploy/license-server/ecosystem.config.cjs
pm2 status
pm2 logs jewellery-license-server --lines 30
pm2 save
pm2 startup        # prints one sudo command — run it, so PM2 resurrects on reboot
```

Keep `instances: 1` — the database is SQLite, so a single writer process is
required (see Appendix B for PostgreSQL).

**systemd alternative** (instead of PM2):
`deploy/license-server/jewellery-license-server.service` is a ready unit —
edit `User=`/`ExecStart` node path, then
`cp` it to `/etc/systemd/system/`, `systemctl daemon-reload`,
`systemctl enable --now jewellery-license-server`,
logs via `journalctl -u jewellery-license-server -f`.

## Step 9 — Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

Do **not** open 4010. With `HOST=127.0.0.1` the API is unreachable from
outside anyway; this is belt-and-braces.

## Step 10 — Nginx reverse proxy + HTTPS

```bash
cd /var/www/jewellery-erp
sed 's/licenses.example.com/licenses.YOUR-DOMAIN/' deploy/license-server/nginx-license-server.conf \
  | tee /etc/nginx/sites-available/jewellery-license-server
ln -s /etc/nginx/sites-available/jewellery-license-server /etc/nginx/sites-enabled/
# If this VPS serves nothing else, also remove Ubuntu's stock site so it can
# never claim your domain:  rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# BEFORE running certbot, prove OUR site (not the default one) owns the domain:
nginx -T 2>/dev/null | grep -E "server_name|listen"
curl -s http://licenses.YOUR-DOMAIN/api/health    # must already proxy → {"ok":true,...}

certbot --nginx -d licenses.YOUR-DOMAIN     # obtains cert, adds 443 + redirect
systemctl reload nginx
```

> ⚠️ **Check certbot's output line** `Successfully deployed certificate for …
> to /etc/nginx/sites-enabled/…`. It must say **`jewellery-license-server`**,
> **not `default`**. Certbot picks the server block whose `server_name`
> matches the domain; if our site wasn't enabled yet, it silently deploys
> HTTPS onto Ubuntu's `default` static site and every `/api/…` request then
> returns an nginx **404** (the proxy is never consulted; `nginx -t` also
> warns about a "conflicting server name" once both sites claim the domain,
> and the block from the alphabetically-first file wins). Fix: enable our
> site (`ln -s` above), then **remove only certbot's `<domain>` blocks from
> the file it deployed to** — on a shared VPS, back up that file first and
> delete just its appended `server { … }` blocks for your domain; deleting
> the whole `default` site is only OK on a dedicated box. Reload, then either
> re-run certbot ("Keep the existing certificate") so it deploys to our site,
> or paste the manual 443 block from the Troubleshooting table.

HTTPS is not optional in practice: license keys and admin passwords cross
this connection, and desktops should only ever activate against an
`https://` URL.

## Step 11 — Verify end-to-end

```bash
curl -s https://licenses.example.com/api/health
# {"ok":true,"service":"license-server",...}

# Admin login (replace credentials with the ones from your .env)
TOKEN=$(curl -s https://licenses.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@jewellery-erp.cloud","password":"YOUR-ADMIN-PASSWORD"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).token")

# Create a test subscription (12 months)
curl -s https://licenses.example.com/api/subscriptions \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"customerName":"Deployment Test","durationType":"MONTHS","durationCount":12}'
```

Then open **https://licenses.example.com** in a browser → you should get the
admin portal login, and the test subscription (with its `JERP-…` key) should
be listed. Delete the test subscription afterwards if you don't need it.

## Step 12 — Point the desktop app at your server

Customers' apps verify licenses offline against the public key baked in at
**build time**, and activate against the baked-in server URL. Build
installers (on your build machine/CI, not necessarily the VPS) with:

```bash
# copy the PUBLIC key off the VPS first (never the private one):
#   scp root@<vps>:/var/www/jewellery-erp/packages/license-server/keys/license-public-key.pem .
LICENSE_SERVER_URL=https://licenses.example.com \
LICENSE_PUBLIC_KEY_FILE=/path/to/license-public-key.pem \
npm run dist:desktop:win        # or :mac / :linux
```

- Never ship installers built with the committed **dev** public key against
  this server — activation would succeed but offline verification would fail
  with `INVALID_SIGNATURE`.
- If customers already run dev-key builds, keep both public keys trusted
  during rollout: concatenate old + new PEM blocks into the file passed as
  `LICENSE_PUBLIC_KEY_FILE` (see *Rotation* in `docs/SUBSCRIPTION.md`).
- Existing installs can also be repointed manually from the activation
  screen's *Advanced* server-URL field.

Test one real activation with a key created in the portal before announcing
the URL.

## Step 13 — Backups (do this now, not later)

Everything irreplaceable lives in three places: `data/` (all subscriptions),
`keys/license-private-key.pem` (signing key), `.env` (secrets/admin).

```bash
bash deploy/license-server/backup.sh     # → backups/license-backup-<timestamp>.tar.gz (mode 600)
```

Copy the archive **off the VPS** and schedule it, e.g. daily via `crontab -e`:

```
30 2 * * * bash /var/www/jewellery-erp/deploy/license-server/backup.sh >/dev/null 2>&1
```

Treat the archive as a secret — it contains the private signing key.

---

## Day-2 operations

**Deploy an update**

```bash
bash deploy/license-server/update.sh            # PM2 (add `systemd` for the unit-file setup)
# manual equivalent:
git pull --ff-only && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci && npm run build:license && pm2 restart jewellery-license-server
```

**Logs / status** — `pm2 logs jewellery-license-server`, `pm2 status`
(systemd: `journalctl -u jewellery-license-server -f`).
Uptime monitors can poll `GET /api/health`.

**Reset the admin password** (env vars only seed the *first* admin):

```bash
npm run build:license                                    # ensure dist/ is current
node packages/license-server/dist/scripts/seed-admin.js admin@jewellery-erp.cloud 'NewStrongPassword'
# equivalently: npm run seed:admin:prod -w packages/license-server -- <email> <password>
```

**Local development reminder** — on your dev machine the same stack runs with
hot reload: `npm run dev:license` (API :4010, Vite portal :5174 proxying
`/api`). Production never uses `dev` scripts or `ts-node-dev`.

## Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| `Cannot find module '.../license-core/dist/index.js'` / `Please verify that the package.json has a valid "main" entry` | `license-core` never built on this checkout (its `dist/` is gitignored). → `npm run build -w packages/license-core`, or pull the fix (postinstall + scripts now build it automatically via `scripts/ensure-license-core.mjs`). |
| `ts-node-dev … generate-keys.ts` hangs / needed Ctrl+C | `ts-node-dev` is a file-watcher, wrong tool for one-off scripts. → `npm run license:generate-keys`. |
| Server logs `Using DEVELOPMENT signing key` | No production keypair found. → Step 5, then restart. Anything signed with the dev key is forgeable by anyone with the repo. |
| Server logs `JWT_SECRET is not set` warning | `.env` missing/not edited or server started from an env without it. → Step 4, restart. |
| `EADDRINUSE … 4010` | Something (often a leftover foreground/dev server) already owns the port. → `ss -ltnp \| grep 4010`, stop it (`pm2 list`). |
| Nginx `502 Bad Gateway` | App down or `HOST`/`PORT` mismatch with `proxy_pass`. → `pm2 logs`, `curl 127.0.0.1:4010/api/health` locally first. |
| Portal loads but login fails with 401 | Admin was seeded with different credentials (e.g. default `Admin@12345` before you edited `.env`). → reset via `seed:admin:prod` above. |
| Changed `ADMIN_PASSWORD` in `.env`, no effect | By design — env only seeds the first admin. → `seed:admin:prod`. |
| Desktop says `INVALID_SIGNATURE` after successful activation | Installer embeds a different public key than the one matching the server's private key. → rebuild desktop with this server's `license-public-key.pem` (Step 12). |
| Desktop can't reach server / activation times out | Wrong `LICENSE_SERVER_URL` baked in (still `localhost:4010`), DNS not propagated, or 443 blocked. → Step 12; test with activation screen *Advanced* URL override. |
| `prisma … failed to download` engine during `npm ci`/build | VPS cannot reach Prisma's engine CDN (`binaries.prisma.sh`). → fix outbound network/proxy, re-run `npm run build:license`. |
| Service gone after reboot | `pm2 save`/`pm2 startup` not completed. → Step 8 (run the printed `sudo env …` command). |
| `SQLITE_CANTOPEN` / permission errors under systemd | Service user can't write `data/`/`keys/`. → `chown -R <user> packages/license-server/data packages/license-server/keys`. |

## Security checklist

- [ ] Production Ed25519 keys generated; no `DEVELOPMENT signing key` in logs
- [ ] `JWT_SECRET` = long random value; admin password strong and not `Admin@12345`
- [ ] HTTPS via Certbot; `LICENSE_SERVER_URL` in desktop builds uses `https://`
- [ ] `HOST=127.0.0.1`, firewall exposes only 22/80/443 — 4010 is private
- [ ] `keys/license-private-key.pem` is mode 600, backed up off-server, never committed/shared
- [ ] Exactly one server instance (SQLite); backups scheduled (Step 13)
- [ ] OS + Node kept updated (`apt upgrade`, NodeSource LTS track)

## Appendix A — Environment variables

All read in `packages/license-server/src/config.ts`; put them in
`packages/license-server/.env` or the real environment.

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind interface — use `127.0.0.1` behind Nginx |
| `PORT` | `4010` | HTTP port |
| `JWT_SECRET` | *(dev value — set it!)* | Signs admin login tokens (12 h) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | `admin@jewellery-erp.cloud` / `Admin@12345` / `License Admin` | First-boot admin seed only |
| `LICENSE_DATA_DIR` | `packages/license-server/data` | Holds the default SQLite DB |
| `DATABASE_URL` | `file:<LICENSE_DATA_DIR>/license.db` | Prisma datasource (see Appendix B) |
| `LICENSE_PRIVATE_KEY_FILE` | `keys/license-private-key.pem` | Ed25519 private key path |
| `LICENSE_PRIVATE_KEY` | — | Inline PEM instead of a file (takes precedence) |
| `ADMIN_PORTAL_DIST` | `packages/admin-portal/dist` | Where the built portal is served from |
| `EXPIRING_SOON_DAYS` | `30` | Dashboard "expiring soon" window |
| `LICENSE_AUTO_DB_PUSH` | unset | Set `1` to auto-push schema on PostgreSQL (Appendix B) |

Runtime files of record: `packages/license-server/data/license.db`,
`packages/license-server/keys/license-*.pem`, `packages/license-server/.env`.

## Appendix B — PostgreSQL instead of SQLite (optional)

SQLite is the right default for a single license server (one writer, simple
backups). Move to managed PostgreSQL only if you need multiple instances or
external durability guarantees:

1. In `packages/license-server/prisma/schema.prisma`, change
   `provider = "sqlite"` → `"postgresql"` (commit this change).
2. Set `DATABASE_URL=postgresql://user:pass@host:5432/dbname` in `.env`.
3. Rebuild (`npm run build:license` regenerates the Prisma client).
4. For the **first** boot only, set `LICENSE_AUTO_DB_PUSH=1` so tables are
   created; afterwards unset it and manage schema changes deliberately
   (`prisma db push` / migrations) — the server intentionally refuses to
   auto-push against PostgreSQL by default.
5. Only then may PM2 `instances` be raised above 1.

Related docs: `docs/SUBSCRIPTION.md` (architecture, API, key rotation),
`docs/ELECTRON.md` (building desktop installers).

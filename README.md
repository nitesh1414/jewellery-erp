# Jewellery ERP & POS

Complete jewellery shop ERP + POS — billing, inventory, job work, ledger,
reports — packaged as an **offline desktop application** (Electron + SQLite)
with a **cloud-managed subscription system**.

## Packages

| Package | Description |
|---|---|
| `packages/frontend` | React 18 + Vite web UI |
| `packages/backend` | NestJS + Prisma API (SQLite dev / Postgres prod) |
| `packages/desktop-electron` | **Offline desktop app** — Windows / macOS / Linux installers |
| `packages/license-core` | Shared license logic (keys, Ed25519 signing, offline validation) |
| `packages/license-server` | **Cloud license server** (subscription admin API) |
| `packages/admin-portal` | **Cloud admin panel** to manage subscriptions |
| `packages/desktop` | Legacy Tauri shell (superseded by `desktop-electron`) |
| `packages/shared` | Shared types/validation |

## Quick start (web/dev)

```bash
npm install
npm run db:push        # create/update the dev SQLite database
npm run db:seed        # demo data
npm run dev            # backend :3001 + frontend :5173
```

`db:push`/`db:seed`/`dev` auto-create `packages/backend/.env` with
`DATABASE_URL="file:./dev.db"` (SQLite) on first run — set `DATABASE_URL` in
the environment to use PostgreSQL instead. After pulling changes that touch
`packages/backend/prisma/schema.prisma`, run `npm run db:push` again to
update your local database.

Login: `admin@jewellery.com` / `admin123`.

## Desktop app (offline, subscription-licensed)

```bash
npm run dist:desktop:win     # Windows installer (.exe)
npm run dist:desktop:mac     # macOS (.dmg, Intel + Apple Silicon)
npm run dist:desktop:linux   # Linux (.AppImage / .deb / .rpm)
```

The installed app runs **fully offline** with a local SQLite database —
internet is needed only once, to activate the subscription key right after
installation (or use offline activation codes).

See **[docs/ELECTRON.md](docs/ELECTRON.md)** for the full build guide.

## Subscriptions (cloud-managed)

```bash
npm run dev:license     # license server :4010 + admin portal :5174
```

Admins create license keys from the cloud panel: day / month / year / lifetime
plans, optionally locked to a specific **machine ID**, or open keys with N
seats. Revocations and extensions propagate automatically when a machine is
online; expired subscriptions lock the app until renewed.

See **[docs/SUBSCRIPTION.md](docs/SUBSCRIPTION.md)** for the complete
architecture, API and security notes.

# Jewellery ERP & POS

Complete jewellery shop ERP + POS — billing (bills **and** estimated bills),
inventory with barcode sticker printing, job work with worker master, ledger,
quotations with shareable links, reports — packaged as an **offline desktop
application** (Electron + SQLite) with a **cloud-managed subscription system**.

## Packages

| Package | Description |
|---|---|
| `packages/frontend` | React 18 + Vite web UI |
| `packages/backend` | NestJS + Prisma API (SQLite dev / Postgres prod) |
| `packages/desktop-electron` | **Offline desktop app** — Windows / macOS / Linux installers |
| `packages/license-core` | Shared license logic (keys, Ed25519 signing, offline validation) |
| `packages/license-server` | **Cloud license server** (subscription admin API) |
| `packages/admin-portal` | **Cloud admin panel** to manage subscriptions |
| `packages/shared` | Shared types/validation |

---

## Step-by-step setup (web / development)

**1. Install** (Node.js 20+):

```powershell
npm install
```

**2. Create/update the local database** (SQLite; a `packages/backend/.env` with
`DATABASE_URL="file:./dev.db"` is auto-created on first run — no manual setup):

```powershell
npm run db:push
```

**3. Seed demo data** (optional; safe to re-run):

```powershell
npm run db:seed
```

Login: `admin@jewellery.com` / `admin123` (also manager/sales/cashier demo
users — see `packages/backend/prisma/seed.ts`).

**4. Run the app** (backend :3001 + frontend :5173):

```powershell
npm run dev
```

Open http://localhost:5173

> Whenever you pull changes that touch `packages/backend/prisma/schema.prisma`,
> run `npm run db:push` again to update your local database.

### Handy extras

```powershell
npm run db:studio      # browse/edit the database in Prisma Studio
npm run build          # compile every package
```

### Daily use cheatsheet

- **Billing** (`/billing`): scan barcodes (F4) or manual items (F5); switch the
  top-right tabs between **Bill** and **Estimated Bill**. Estimates get their
  own `EST-…` number, stay editable (Bills → Estimated Bills → ✏) and are
  converted into a real GST/Non-GST bill with one click (→ button).
- **Print sizes**: on any print screen choose A4 GST / A4 plain / A5 /
  thermal 80 / 76 / 58 mm / estimate.
- **Barcodes**: Barcodes → print stickers on every common label size; item
  rows in *Jewellery Items* have a 🖨 print-barcode button too.
- **Multi-branch**: if the user has access to more than one branch, a branch
  selector appears in the top bar. All actions (sale, purchase, expense,
  income, URD, payment…) are recorded against the selected branch; the default
  is the user's primary branch. Estimated bills never affect sales,
  outstanding, today's totals or GST until confirmed into a real bill.
- **Job work**: New Job Order picks customers from the database (or prompts to
  add new), assigns a worker, and walks CREATED → ASSIGNED → IN PROGRESS →
  READY → DELIVERED; generate the final bill when READY.
- **Company details**: Settings → Shop Profile (name, address, **logo**) is
  shown in the header and on every print.

---

## Desktop app (offline, subscription-licensed)

Builds native installers that run **100% offline** with a local SQLite
database. Internet is needed only once — to activate the subscription key
right after installation (offline activation codes also supported).

```powershell
npm run dist:desktop:win     # Windows installer (.exe)  → packages/desktop-electron/release/
npm run dist:desktop:mac     # macOS (.dmg, Intel + Apple Silicon)
npm run dist:desktop:linux   # Linux (.AppImage / .deb / .rpm / .tar.gz)
npm run dist:desktop         # current OS
```

Prerequisites per OS are listed in **[docs/ELECTRON.md](docs/ELECTRON.md)**.

After installing, the app opens the activation screen: paste the license key
you received (the machine ID shown there is what your vendor needs for
machine-locked keys). First login after activation:
`admin@jewellery.com` / `admin123` — change it immediately.

To test the desktop shell locally without building an installer:

```powershell
npm run dev:desktop          # builds backend+frontend, launches Electron
```

App updates keep the database, uploads and subscription license intact
(`%APPDATA%\Shri Jewellers ERP` on Windows, `~/Library/Application Support/…`
on macOS, `~/.config/…` on Linux) — the schema is upgraded automatically on
first launch of the new version.

## Subscriptions (cloud-managed)

```powershell
npm run dev:license     # license server :4010 + admin portal :5174
```

Admins create license keys from the cloud panel: day / month / year / lifetime
plans, optional **machine-ID lock** or open keys with N seats, bulk creation,
revoke / extend, and offline activation codes. Revocations and extensions
reach desktops automatically whenever they are online; expired subscriptions
lock the app until renewed.

Default admin (first boot): `admin@jewellery-erp.cloud` / `Admin@12345` —
configure `ADMIN_EMAIL` / `ADMIN_PASSWORD` before first start and change it.

Full architecture, API and security notes:
**[docs/SUBSCRIPTION.md](docs/SUBSCRIPTION.md)**.

## Production deployment (web)

The backend supports PostgreSQL — point `DATABASE_URL` at your Postgres
instance and run `npm run build && npm start -w packages/backend`. The desktop
build is unaffected and always uses its local SQLite database.

## Verification scripts

```powershell
node scripts/check-prisma-schema.mjs   # offline schema relation check
node scripts/test-license-flow.mjs     # 26-case license/subscription test suite
```

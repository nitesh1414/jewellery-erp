# Subscription / Licensing System

This document explains how desktop subscriptions work end-to-end: the cloud
admin panel, machine IDs, activation at installation time, day/month/year/lifetime
plans (with or without machine binding), and how the app keeps validating
licenses **completely offline** after activation.

## Components

| Package | What it is | Where it runs |
|---|---|---|
| `packages/license-core` | Shared logic: license keys, Ed25519 signing/verification, expiry math, offline evaluation | Used by both sides |
| `packages/license-server` | Cloud license API + database (admin auth, subscriptions, activations, events) | Cloud (any host; SQLite by default, switch to Postgres for scale) |
| `packages/admin-portal` | Admin panel UI (dashboard, create/revoke/extend subscriptions, offline codes) | Cloud — served by the license server |
| `packages/desktop-electron` | Desktop app with subscription enforcement (activation screen, machine ID, local license file) | Customer PCs |

## How it works

```
        ADMIN (you)                    CUSTOMER
   ┌──────────────────┐          ┌───────────────────────────┐
   │  Admin Portal    │          │  Desktop app (Electron)   │
   │  (cloud)         │          │                           │
   │  · create keys   │          │  installer → first run    │
   │  · revoke/extend │          │  → ACTIVATION SCREEN      │
   │  · offline codes │          │  · shows MACHINE ID       │
   └────────┬─────────┘          │  · enter license key      │
            │                    └───────────┬───────────────┘
            v                                │ POST /api/license/activate
   ┌──────────────────┐          ┌───────────v───────────────┐
   │  License Server  │<─────────│  one-time ONLINE call     │
   │  (cloud)         │  signs   │  → signed license.json    │
   │  Ed25519 priv.key│          │  → stored locally         │
   └──────────────────┘          └───────────┬───────────────┘
                                             │ forever after:
                                             │ offline Ed25519 verify
                                             v
                                   ┌───────────────────┐
                                   │  App runs 100%    │
                                   │  offline (SQLite) │
                                   └───────────────────┘
```

### License keys

Format `JERP-XXXXX-XXXXX-XXXXX-XXXXX` (Crockford base32 — no I/L/O/U so it is
safe to read over the phone). Keys are random; all meaning (plan, duration,
binding) lives on the server.

### Subscription plans the admin can create

* **Duration** — N days, N months, N years, or **lifetime**.
  The clock starts on **first activation** (so pre-sold keys don't burn time),
  unless the admin already fixed an expiry via *Extend*.
* **Machine binding**
  * *Lock to machine ID* — only that exact machine can activate.
  * *Any machine* — the key works on the first N machines (seats); each
    activation is remembered. A seat can be freed with *Deactivate* or from
  the admin panel.
* **Quantity** — bulk-create many keys in one go.

### Machine ID

A stable fingerprint of the machine (not of the installation):

* Windows: `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`
* macOS: `IOPlatformUUID`
* Linux: `/etc/machine-id` (fallback: MAC addresses + hostname)

The raw value is SHA-256-hashed into a 64-hex-char ID, shown with a copy
button on the activation screen. The customer sends it to the admin, who can
create a machine-locked subscription or an offline activation code for it.

## Activation flows

### 1. Normal (online once) — "activation at installation time"

1. Admin creates a subscription in the portal and gives the key to the customer.
2. Customer installs the app. The installer launches the app at the end
   (`runAfterFinish`), which opens the **activation screen** immediately.
3. Customer pastes the key → the app calls the license server **once**
   (`POST /api/license/activate`) → server checks binding/seats/revocation,
   computes the expiry, signs the license with **Ed25519** and returns it.
4. The app stores `license/license.json` in its user data folder and verifies
   it locally from then on. **No internet is needed to run the app.**

Silent/enterprise installs can pre-seed the key right in the installer:

```
ShriJewellersERP-Setup-1.0.0.exe /S /LICENSEKEY=JERP-XXXXX-XXXXX-XXXXX-XXXXX
```

The installer writes a pending-key file; the app activates it automatically on
first launch.

### 2. Fully offline machines

If the PC can never be online (not even once):

1. Customer reads the machine ID from the activation screen and sends it to the admin.
2. Admin opens the subscription → **Offline activation** → enters the machine
   ID → generates a signed offline code → sends it back (email/WhatsApp).
3. Customer pastes the code under **Activate offline**. The code carries the
   same Ed25519 signature, so it validates forever without internet.

## Offline enforcement (desktop side)

On every launch — and hourly while running — the desktop app evaluates the
stored license **locally**:

1. **Signature** — Ed25519 against the public key embedded in the app build
   (the private key never leaves the cloud). Forged/edited licenses fail here.
2. **Machine binding** — the license payload contains the machine ID it was
   issued for.
3. **Revocation** — a flag set after the server reports revocation while online.
4. **Clock tampering** — every successful check stores a `lastSeenAt`
   watermark; if the system clock moves back by more than 24 h the app demands
   one online re-verification.
5. **Expiry** — days/months/years subscriptions lock the app with a renew
   screen when they end; lifetime licenses never expire.

While the internet *happens* to be available the app also revalidates in the
background every 6 hours — this instantly picks up **revocations** and
**extensions** (the server re-issues the signed license, so renewals reach the
desktop automatically). If there is no internet, these checks are simply
skipped: the app keeps working offline.

## Admin panel

Run locally: `npm run dev:license` → license server on
`http://localhost:4010`, portal on `http://localhost:5174`.
In production the license server serves the built portal itself (single URL).

Default admin (first boot): `admin@jewellery-erp.cloud` / `Admin@12345`
(configure via `ADMIN_EMAIL` / `ADMIN_PASSWORD` env before first start — and
change it immediately).

Features:

* Dashboard — counts, expiring-soon, recent events
* Subscriptions — search/filter, create (plan, duration, machine binding,
  seats, quantity), edit, **revoke / restore**, **extend** (adds days/months/
  years or converts to lifetime), delete
* Subscription detail — activated machines, last-seen, deactivation, event log,
  **offline activation code generation** (with `.lic` file download)

## License server API

Admin (JWT-protected):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Admin login → JWT |
| GET | `/api/stats` | Dashboard numbers + recent events |
| GET | `/api/subscriptions` | List/search (`?search=&status=&page=`) |
| POST | `/api/subscriptions` | Create (supports `quantity` for bulk) |
| GET/PATCH/DELETE | `/api/subscriptions/:id` | Detail / edit / delete |
| POST | `/api/subscriptions/:id/revoke` / `restore` / `extend` | Lifecycle |
| POST | `/api/subscriptions/:id/offline-license` | Issue signed offline code |

Device (public; the key is the credential):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/license/activate` | Activate `{licenseKey, machineId, machineInfo}` |
| POST | `/api/license/validate` | Periodic re-check (returns a re-signed license) |
| POST | `/api/license/deactivate` | Free a seat |

## Keys & security

* Licenses are Ed25519-signed. The **private key lives only on the license
  server**; desktop builds embed the **public key**.
* This repository ships a **dev keypair** at
  `packages/license-server/keys/dev-license-*.pem` so everything works out of
  the box. It is public — do not use it for real customers.
* For production:
  1. `cd packages/license-server && npx ts-node-dev --transpile-only src/scripts/generate-keys.ts`
  2. Keep `keys/license-private-key.pem` on the server only (or set
     `LICENSE_PRIVATE_KEY_FILE`). It is gitignored.
  3. Build desktop installers with
     `LICENSE_PUBLIC_KEY_FILE=/path/to/license-public-key.pem` so the matching
     public key is embedded.
  4. Build with `LICENSE_SERVER_URL=https://licenses.yourcompany.com` so the
     app activates against your server (users can also change the URL on the
     activation screen under *Advanced*).
* Rotation: generate a new keypair, embed the new public key in an app update.
  Old licenses keep validating if you keep the old public key trusted —
  `resources/license-public-key.pem` can list several PEM blocks; the desktop
  accepts a signature valid under **any** listed public key.

## Server deployment notes

* Default port `4010` (`PORT`), data in `packages/license-server/data`
  (`LICENSE_DATA_DIR`), SQLite by default (`DATABASE_URL`).
* For managed Postgres: set `DATABASE_URL=postgresql://…` — the server pushes
  the schema on boot. `JWT_SECRET` must be set to a long random value.
* Suggested hosts: Railway/Render/Fly.io (Node service + disk) or any VPS.

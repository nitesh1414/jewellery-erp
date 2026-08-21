# Desktop Builds — Electron

The desktop application is packaged with **Electron** and produces native
installers for **Windows, macOS and Linux** from the same codebase. After
installation it runs **100% offline**: the app bundles

* the full **NestJS backend** (running as a local service on
  `127.0.0.1:<random port>`),
* a **SQLite database** stored in the user's data folder,
* the **React frontend** served by that local backend.

The only thing that ever needs internet is the **one-time subscription
activation** (or use offline activation codes — see `docs/SUBSCRIPTION.md`).

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Shri Jewellers ERP (Electron app)                          │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Main process (Node)                                  │  │
│  │  · machine ID + subscription guard (activation,      │  │
│  │    expiry, revocation, clock-tamper detection)       │  │
│  │  · spawns the backend as a utility process           │  │
│  │  · waits for /api/health, then loads the UI          │  │
│  └──────────────────────────────────────────────────────┘  │
│         │                       │                          │
│  ┌──────▼───────────┐   ┌───────▼──────────────────────┐   │
│  │ Activation       │   │ Backend (NestJS + Prisma)    │   │
│  │ screen (bundled) │   │  · SQLite in userData/data   │   │
│  │ shown until the  │   │  · serves React UI + /api    │   │
│  │ license is valid │   │  · 127.0.0.1 only, offline   │   │
│  └──────────────────┘   └──────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

User data (writable, survives updates):

| Platform | Location |
|---|---|
| Windows | `%APPDATA%\Shri Jewellers ERP` |
| macOS | `~/Library/Application Support/Shri Jewellers ERP` |
| Linux | `~/.config/Shri Jewellers ERP` |

Contains: `data/jewellery.db` (database), `uploads/`, `license/`
(subscription), `logs/` (backend + app logs).

First login after install: **admin@jewellery.com / admin123** — change it
immediately (the setup wizard runs on first login).

## Prerequisites

* Node.js 20+ and npm 10+
* Windows: nothing extra (NSIS is downloaded by electron-builder)
* macOS: Xcode command line tools
* Linux: `sudo apt install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0 libgbm1` (build deps for AppImage/deb/rpm)

## Build installers

From the repository root (one command does everything — builds backend,
frontend, activation page, stages dependencies + SQLite template DB, then runs
electron-builder):

```bash
# current platform (auto-detects)
npm run dist:desktop

# specific platforms
npm run dist:desktop:win     # → NSIS .exe installer
npm run dist:desktop:mac     # → .dmg (x64 + arm64)
npm run dist:desktop:linux   # → .AppImage, .deb, .rpm, .tar.gz (x64/arm64)
```

Outputs land in `packages/desktop-electron/release/`:

| OS | Artifacts |
|---|---|
| Windows | `ShriJewellersERP-Setup-<version>.exe` |
| macOS | `ShriJewellersERP-Setup-<version>-x64.dmg`, `…-arm64.dmg` |
| Linux | `ShriJewellersERP-<version>-x64.AppImage`, `.deb`, `.rpm`, `.tar.gz` |

Build-time options:

```bash
LICENSE_SERVER_URL=https://licenses.yourcompany.com \
LICENSE_PUBLIC_KEY_FILE=/path/to/license-public-key.pem \
npm run dist:desktop:win
```

Cross-compilation is **not** required for Windows/macOS/Linux x64 — but each
OS must be built **on** that OS (or use the included GitHub Actions workflow
`.github/workflows/build-electron.yml`, which builds all three on tagged
pushes and uploads the installers as artifacts).

### Unpacked / test run

```bash
cd packages/desktop-electron
npm run package     # unpacked app in release/<platform>-unpacked — quick smoke test
npm start           # run electron from source against local builds
```

### Development

```bash
npm run dev:license   # optional: local license server + admin portal
npm run dev:desktop   # builds backend+frontend, launches the Electron shell
```

## What the installer does

1. Installs the app per-user (no admin rights needed; can be changed to
   per-machine in `electron-builder.yml`).
2. Optional silent install with a pre-seeded subscription key:
   `ShriJewellersERP-Setup-1.0.0.exe /S /LICENSEKEY=JERP-…`
3. Launches the app at the end of installation → the **activation screen**
   appears immediately (this is the subscription step of the installation).
4. After activation the app starts the local backend, copies the pristine
   SQLite template database into the user data folder and opens the ERP.

## Updating / code signing

* **Windows**: builds are unsigned by default (SmartScreen warning). Add a
  certificate in `electron-builder.yml` (`win.certificateFile` or env
  `CSC_LINK`) to sign. Auto-update infrastructure (e.g. `electron-updater`
  with GitHub Releases) can be added later — updates are intentionally
  manual for now.
* **macOS**: `identity: null` produces an unsigned app (Gatekeeper will ask
  to allow). Set a Developer ID + `notarize` for distribution.
* App updates keep the user's database and subscription license intact
  (they live in the user data folder, outside the installation directory).

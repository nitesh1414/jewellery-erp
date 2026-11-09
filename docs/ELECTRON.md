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
`ci/build-electron.yml` (copy to `.github/workflows/` to activate), which builds all three on tagged
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

## Smoke test after installing

Run through this once on a clean Windows machine before shipping a build:

1. **Install** `ShriJewellersERP-Setup-<version>.exe` (per-user, no admin).
2. **Activation** — the app opens the activation screen showing the machine ID.
   Activate with a key, or install silently with a pre-seeded key:
   `ShriJewellersERP-Setup-1.0.0.exe /S /LICENSEKEY=JERP-…` (the installer writes
   `%APPDATA%\Shri Jewellers ERP\pending-license-key.txt`, the app activates it
   on first launch and deletes it).
3. **Login** — `admin@jewellery.com` / `admin123`, then change the password.
4. **Local backend** — Dashboard loads (it calls `/api/*` on `127.0.0.1:8973`).
   If not, `%APPDATA%\Shri Jewellers ERP\logs\backend.log` has the reason.
5. **Database** — `%APPDATA%\Shri Jewellers ERP\data\jewellery.db` exists after
   the first launch (copied from the bundled `template.db`).
6. **Printer** — Barcodes → Print → **Test label** prints the 2.1 × 0.5 in
   jewellery tag with sample data; confirm it fits the stock and scans.
7. **Uninstall** — keeps `%APPDATA%\Shri Jewellers ERP` (database + license), so a
   reinstall/upgrade continues where the user left off.

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

## Troubleshooting

Every build can be driven through the wrapper, which checks the environment
first, pre-fetches the NSIS toolchain, writes a full log to
`packages/desktop-electron/release/build.log` and turns the common failures
into an actionable message:

```bash
npm run dist:desktop:win                 # wrapper (recommended)
npm run dist:desktop:win:no-fetch        # offline: toolchain must be cached
npm run dist:desktop:win:verbose         # DEBUG=electron-builder
node scripts/build-desktop.mjs win --skip-prepare   # re-package only
```

### Build stops after “signing with signtool.exe … elevate.exe”

This is the most common Windows failure and it is **not** a code problem. That
line is the last step before electron-builder unpacks its **NSIS toolchain**,
which it downloads from GitHub *release assets*:

```
• signing with signtool.exe  path=release\win-unpacked\resources\elevate.exe
• no signing info identified, signing is skipped
⨯ Get "https://release-assets.githubusercontent.com/…nsis-resources-3.4.1.7z…": EOF
```

`release-assets.githubusercontent.com` is frequently blocked or throttled on
Indian ISPs, office proxies and antivirus web filters. Fix it once, before the
build:

```powershell
npm run tools:fetch                      # retries + automatic public mirror
npm run tools:fetch -- --mirror https://npmmirror.com/mirrors/electron-builder-binaries/
npm run tools:check                      # → "✔ … (cached)"
```

Then rebuild. If the machine has no internet at all, run `tools:fetch` on a
connected machine and copy the cache folder:

| OS | electron-builder cache |
|---|---|
| Windows | `%LOCALAPPDATA%\electron-builder\Cache` |
| macOS | `~/Library/Caches/electron-builder` |
| Linux | `~/.cache/electron-builder` |

(`ELECTRON_BUILDER_CACHE` can point at a shared folder instead.)

### Build stops while downloading Electron (`electron-v33.x.y-win32-x64.zip`)

Same root cause, different file: the Electron runtime zip is also served from
GitHub release assets. Use a mirror and rebuild:

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"   # PowerShell
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/         # cmd
npm run dist:desktop:win
```

### No way to download anything? Ship a portable `.zip`

The ZIP target does **not** need the NSIS toolchain, so it always works:

```powershell
npm run dist:desktop:win:zip     # → packages/desktop-electron/release/*.zip
```

The user unzips it and runs `Shri Jewellers ERP.exe` — same app, same local
backend, database and licence; it just has no installer, Start-menu entry or
uninstaller. Use it to ship while the network problem is being sorted out.

### “EPERM / EBUSY: operation not permitted” while writing `release\`

A file from a previous build is locked: the app is still running, an Explorer
window is showing the folder, or antivirus is scanning the new `.exe`. Close
the app and Explorer, pause real-time protection, then rebuild. The wrapper
closes stray `Shri Jewellers ERP.exe` processes and removes the stale
`release\win-unpacked` automatically.

### makensis fails (`cannot execute … exit status 1`)

The generated installer script did not compile — usually a mistake in
`packages/desktop-electron/assets/installer.nsh`. The makensis error text is
printed above the failure (and stored in `release/build.log`); fix the include
and rebuild. Nothing needs to be downloaded again at this point.

### Installer is huge / build is slow

`staging/backend/node_modules` (Prisma engines, NestJS, SQLite) plus Electron
produce a ~300–400 MB installer and the build needs ~4 GB of free disk. The
first run is slower because production dependencies are installed into
`staging/` and the Prisma client is generated for Windows.

### Re-running just the packaging step

```bash
node scripts/build-desktop.mjs win --skip-prepare --keep-release
```

The staging folder is reused; delete `packages/desktop-electron/staging` if the
backend/frontend changed.

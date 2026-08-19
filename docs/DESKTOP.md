# Desktop Build Guide — Tauri 2

This guide explains how to build standalone executable installers for **Windows**, **macOS**, and **Linux** from the same React/Vite frontend used in the web and SPA builds.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Desktop App (Tauri 2 + WebView2 / WKWebView / WebKitGTK) │
│  ┌─────────────────────────────┐            │
│  │  React/Vite UI (your SPA)    │            │
│  └─────────────────────────────┘            │
│                   ↕                          │
│  ┌─────────────────────────────┐            │
│  │   Rust Backend (Tauri)        │            │
│  │  - Hardware: barcode scanner │            │
│  │  - Hardware: thermal printer │            │
│  │  - File system               │            │
│  │  - Local SQLite (offline)    │            │
│  └─────────────────────────────┘            │
└─────────────────────────────────────────────┘
              ↕ (HTTP to backend API)
┌─────────────────────────────────────────────┐
│  NestJS Server (your existing backend)       │
└─────────────────────────────────────────────┘
```

## Prerequisites

### All platforms
- Node.js 20+ and npm 10+
- Rust toolchain (install via [rustup.rs](https://rustup.rs/)) — needed only for building
- Tauri CLI: `npm install -D @tauri-apps/cli`

### Windows
- Install **Visual Studio Build Tools** with "Desktop development with C++" workload
- Install **WebView2 Runtime** (already bundled with Windows 11; for older Windows, MS Edge is required)
- Install Rust target: `rustup target add x86_64-pc-windows-msvc`

### macOS
- Xcode Command Line Tools: `xcode-select --install`
- Rust target: `rustup target add aarch64-apple-darwin` (and `x86_64-apple-darwin` for Intel)

### Linux
- Ubuntu/Debian packages:
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
  ```
- Fedora: replace with `webkit2gtk4.1-devel` and equivalent
- Rust target: `rustup target add x86_64-unknown-linux-gnu`

## Build Commands — from project root

### Windows (.exe / .msi)
```bash
npm run tauri:build --workspace packages/desktop -- x86_64-pc-windows-msvc
```
Output: `packages/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/{nsis,msi}/`

The `.exe` is the NSIS installer; `.msi` is the Windows installer.

### macOS (.dmg / .app on Universal)
```bash
# Apple Silicon (M1/M2/M3)
npm run tauri:build:m1

# Intel
cd packages/desktop && npx tauri build --target x86_64-apple-darwin

# Universal (both architectures in one .app)
cd packages/desktop && npx tauri build --target universal-apple-darwin
```
Output: `packages/desktop/src-tauri/target/{arch}/release/bundle/dmg/`

### Linux (.AppImage / .deb / .rpm)
```bash
cd packages/desktop && npx tauri build --target x86_64-unknown-linux-gnu
```
Output: `packages/desktop/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/{deb,appimage,rpm}/`

## Building for Current Platform (Default)

If you just want to build for whichever OS you're running on:

```bash
cd packages/desktop
npm run tauri:build
```

## Cross-Compilation Notes

- **From Windows**: Can build for Windows (x86_64, ARM64)
- **From macOS**: Can build for macOS (Intel + Apple Silicon) and possibly Linux (needs extra setup)
- **From Linux**: Can build for Linux only (most reliable). Windows/macOS cross-compilation is not officially supported; use CI runners or a separate Mac/Windows machine.

For full multi-platform builds, use the **GitHub Actions workflow** at `.github/workflows/build-desktop.yml`, which builds on:
- `windows-latest` runner → Windows .exe + .msi
- `macos-latest` runner → macOS .dmg for both Intel & Apple Silicon
- `ubuntu-22.04` runner → Linux .AppImage / .deb

## Icon Setup (Required before build)

Tauri requires platform-specific icons. From a single source PNG (recommended 1024x1024 px):

```bash
cd packages/desktop
npm run tauri:icon -- ./my-logo.png
```

This generates:
- `src-tauri/icons/32x32.png`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/icon.icns` (macOS multi-resolution)
- `src-tauri/icons/icon.ico` (Windows multi-resolution)

## Output Locations

After successful build, find installers at:

| Platform | Path |
|----------|------|
| Windows installer | `packages/desktop/src-tauri/target/release/bundle/nsis/*Setup*.exe` |
| Windows MSI | `packages/desktop/src-tauri/target/release/bundle/msi/*.msi` |
| macOS DMG | `packages/desktop/src-tauri/target/release/bundle/dmg/*.dmg` |
| macOS .app | `packages/desktop/src-tauri/target/release/bundle/macos/*.app` |
| Linux AppImage | `packages/desktop/src-tauri/target/release/bundle/appimage/*.AppImage` |
| Linux .deb | `packages/desktop/src-tauri/target/release/bundle/deb/*.deb` |
| Linux .rpm | `packages/desktop/src-tauri/target/release/bundle/rpm/*.rpm` |

## Desktop-only capabilities

The Tauri backend adds these capabilities to the SPA:

1. **Thermal printer support** — Raw ESC/POS command generation
2. **Barcode scanner integration** — Serial port access (USB HID)
3. **Offline SQLite** — Local data cache + pending transaction queue
4. **File system** — Export/import data, save PDFs natively
5. **Cash drawer control** — ESC/POS kick-out command
6. **Local config** — Settings stored in `app_data_dir/`

## Bundler Customization

Modify `packages/desktop/src-tauri/tauri.conf.json` to change:

```json
"bundle": {
  "targets": "all",                  // or "deb", "appimage", "msi", "nsis"
  "icon": ["icons/32x32.png", ...],
  "windows": { "nsis": { ... } },     // NSIS installer options
  "macOS": { "dmg": { ... } },         // DMG customization
  "linux": { "deb": { ... } }          // Debian package
}
```

## Offline Mode

The desktop app boots in **offline mode** if no backend is reachable. Pending sales are queued in `app_data_dir/jewellery-offline.db` and synced when the backend becomes reachable.

To configure: open the app, navigate to **Settings → Sync**, enter the backend URL (default `http://localhost:3001`).

## Cross-platform Build Commands (overview)

```bash
# Current platform
cd packages/desktop && npm run tauri:build

# Specific platform (requires platform-specific tools)
cd packages/desktop && npx tauri build --target x86_64-pc-windows-msvc       # Windows
cd packages/desktop && npx tauri build --target x86_64-apple-darwin           # macOS Intel
cd packages/desktop && npx tauri build --target aarch64-apple-darwin          # macOS ARM64
cd packages/desktop && npx tauri build --target x86_64-unknown-linux-gnu     # Linux x86_64
cd packages/desktop && npx tauri build --target aarch64-unknown-linux-gnu    # Linux ARM
cd packages/desktop && npx tauri build --target universal-apple-darwin        # macOS Universal
```

## Code-signing (production)

For production builds with code-signing certificates:

| OS | Setup |
|----|-------|
| Windows | Add `certificatePath`, `certificateThumbprint`, and `tsp: true` in `tauri.conf.json > bundle.windows`. |
| macOS   | Add `signingIdentity`, `providerShortName`, and `entitlements` in `tauri.conf.json > bundle.macOS`. |
| Linux   | Add GPG key for `.deb`/`.rpm` signing via `dpkg-sig` or `rpm-sign`. |

Store credentials in **GitHub Actions secrets**, never commit them.

## Auto-Updater (Optional)

Tauri 2 includes an official auto-updater plugin. Configure in `tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "active": true,
    "endpoints": ["https://releases.your-domain.com/{version}"]
  }
}
```

The desktop app checks this URL on launch and prompts user to update. See [Tauri Updater docs](https://tauri.app/v1/guides/distribution/updater) for full configuration.

---

## Quick Summary

| Step | Command |
|------|---------|
| 1. Install Rust | https://rustup.rs |
| 2. Install Tauri CLI | `npm install -D @tauri-apps/cli` |
| 3. Generate icons | `cd packages/desktop && npm run tauri:icon -- ./logo.png` |
| 4. Build for your OS | `cd packages/desktop && npm run tauri:build` |
| 5. Multi-platform | Push a `v*` tag → GitHub Actions builds all platforms |

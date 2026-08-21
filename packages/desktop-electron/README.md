# Desktop App (Electron)

Offline desktop build of the Jewellery ERP. See `docs/ELECTRON.md` for the
full guide and `docs/SUBSCRIPTION.md` for the licensing system.

```bash
# from the repository root
npm run dist:desktop          # installer for the current OS
npm run dist:desktop:win      # Windows NSIS installer
npm run dist:desktop:mac      # macOS dmg (Intel + Apple Silicon)
npm run dist:desktop:linux    # AppImage / deb / rpm / tar.gz

npm run dev:desktop           # run the desktop shell in dev mode
npm run dev:license           # local license server + admin portal
```

Output: `packages/desktop-electron/release/`

- `electron/` — main process (subscription guard, local backend, machine ID)
- `src/activation/` + `activation.html` — activation/status screen renderer
- `scripts/prepare-backend.mjs` — stages backend + frontend + SQLite template
- `electron-builder.yml` — installer targets and bundling
- `build/installer.nsh` — NSIS customization (pre-seeding the license key)

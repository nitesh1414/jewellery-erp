# Tauri Icons

This folder should contain Tauri app icons in the following formats:

## Required icon files:
- `32x32.png` — 32x32 pixel PNG
- `128x128.png` — 128x128 pixel PNG
- `128x128@2x.png` — 256x256 pixel PNG (Apple "Retina" 2x)
- `icon.icns` — macOS icon fileset (multi-resolution)
- `icon.ico` — Windows icon file (multi-resolution ICO)

## Generation

If you have a source logo (PNG, SVG, etc.), use Tauri's built-in icon generator:

```bash
cd packages/desktop
npm run tauri:icon -- /path/to/source-logo.png
```

This will generate all required formats from a single source image (recommended: square, 512x512 or higher, transparent background).

## Manual creation

If you don't have Tauri CLI, create the files manually:
- Use ImageMagick, Photoshop, or [rcedit](https://github.com/electron/rcedit)
- For `icon.ico` (Windows): convert PNGs to multi-size ICO
- For `icon.icns` (macOS): use `iconutil` on macOS or `png2icns`

## Placeholder note

If you build without providing these icons, Tauri build will fail with errors mentioning missing icon files.

A simple solution: download or create a 512x512 PNG with a "diamond" icon and run:

```bash
npx tauri icon ./source.png
```

Tauri CLI must be installed:
```bash
npm install -D @tauri-apps/cli
```

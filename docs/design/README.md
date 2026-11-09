# Jewellery tag — 2.1 × 0.5 in (53.34 × 12.7 mm)

Reference design for the small barbell/price tags Indian jewellers staple or
loop through ornaments. Implemented as a printed sticker template in
`packages/frontend/src/modules/barcodes/JewelleryTag.tsx` and selectable in
**Barcodes → Print** (size “2.1 × 0.5 in”) or via **Print Jewellery Tags** on
the barcode list.

| File | What it is |
|---|---|
| `jewellery-tag-2.1x0.5.svg` | Vector art at exact print size (opens in any browser) |
| `jewellery-tag-2.1x0.5.png` | 600 dpi raster reference |

## Layout (millimetres)

```
┌──────────────────────────────────────┬───────────────────────────────┐
│        Rajshri Jewellers             │  Gents Ring                   │  ← 2.45 mm bold
│ ▌▎▍▌▋▊▉█▉▊▋▌▍▎▏ (CODE128, 4.35 mm)   │  PURITY: 22K                  │  ← 1.95 mm
│            0000909011                │  G WT:  3.65                  │
│                                      │  N.WT:  3.65                  │
│                                      │  HUID:  IVFN8S                │
└──────────────────────────────────────┴───────────────────────────────┘
   ← 27.7 mm (52 %) ────────────────────→← 25.6 mm (48 %) →
```

| Element | Size / position |
|---|---|
| Tag | 53.34 × 12.7 mm (2.1 × 0.5 in) |
| Outer padding | 0.55 mm top/bottom, 0.9 mm left |
| Shop name | bold, auto-shrinks from 3.0 mm to fit 26 mm, one line |
| Barcode | CODE128, 4.35 mm tall, margin 0, stretched to the column width |
| Human-readable number | 2.3 mm, monospaced, letter-spaced |
| Item name | bold, 2.45 mm |
| Detail rows | 1.95 mm, label column right-aligned (8.6 mm), values bold and left-aligned so the colons line up |

## Where the values come from

| Printed | Source |
|---|---|
| Shop name | **Settings → Shop Profile → Shop name** |
| Item name | ornament → category → design code → SKU |
| PURITY | `jewelleryItem.purity` (underscores removed, `GOLD` prefix dropped, metal appended for silver/platinum) |
| G WT / N.WT | `grossWeight` / `netWeight`, two decimals (`3.65`), `—` when missing |
| HUID | `hallmarkNumber` → `huid` → `certificateNumber`, upper-cased |
| Number under the barcode | the barcode itself (e.g. `G00000001`) |

The tag ignores Settings → Barcode field ordering on purpose: at 53 × 13 mm
there is only room for this exact six-piece layout, which is what the price
tags look like.

## Printing

1. Barcodes → select/print, or Barcodes → **Print Jewellery Tags**.
   Not sure about the printer? Press **Test label** on the print screen — it
   renders this exact design with sample data (no barcode records needed).
2. Choose **2.1 × 0.5 in (53 × 13 mm)** in the size selector.
3. In the browser print dialog pick your label printer and set the stock to
   **2.1 × 0.5 in / 54 × 13 mm**, scale **100 % (actual size)**, margins
   **none**. The page CSS declares `@page { size: 53.34mm 12.7mm }`, so a
   label printer feeds exactly one sticker per page.
4. For thermal label printers (TSC / Zebra / Godex) 203 dpi is enough; 300 dpi
   gives crisper 1.95 mm text.

## Regenerating the reference art

The SVG/PNG in this folder are a static rendering of the same geometry (they
are documentation, not used by the app). Regenerate by hand if the component
metrics change — the numbers above are the source of truth.

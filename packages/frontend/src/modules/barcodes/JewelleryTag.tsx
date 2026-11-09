import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Jewellery barbell tag — 2.1 × 0.5 inch (53.34 × 12.7 mm).
 *
 * Reproduces the classic Indian jewellery price tag:
 *
 *   ┌──────────────────────────────┬────────────────────────┐
 *   │      Rajshri Jewellers       │  Gents Ring            │
 *   │   ▏▎▍▌▋▊▉█▉▊▋▌▍▎▏            │  PURITY: 22K           │
 *   │        0000909011            │  G WT : 3.65           │
 *   │                              │  N.WT : 3.65           │
 *   │                              │  HUID : IVFN8S         │
 *   └──────────────────────────────┴────────────────────────┘
 *
 * Everything is expressed in millimetres and derives from the tag height, so
 * the same component also prints acceptably on a 2.2 in tag. Bars are drawn
 * as CODE128 with `preserveAspectRatio="none"`, which stretches the bars
 * horizontally only — every bar gets the same factor, so the code stays valid.
 */

export const TAG_W_MM = 53.34; // 2.1 in
export const TAG_H_MM = 12.7; //  0.5 in

export interface JewelleryTagProps {
  barcode: string;
  item: any;
  shopName: string;
  /** mm; defaults to the 2.1 × 0.5 in tag */
  width?: number;
  height?: number;
  isLast?: boolean;
  /** dashed cutting guide + border (screen only) */
  showGuide?: boolean;
}

const mm = (v: number) => `${Math.round(v * 100) / 100}mm`;

/**
 * Weights on a jewellery tag are printed with two decimals: 3.65.
 * Accepts numbers (jewellery rows) as well as the pre-formatted strings the
 * /barcodes/labels endpoint returns ("3.650 g"), and falls back through
 * several fields because `?codes=` rows are a merge of both shapes.
 */
function grams(...values: any[]): string {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (Number.isFinite(n) && n > 0) return n.toFixed(2);
  }
  return '\u2014';
}

function purityText(item: any): string {
  const raw = String(item?.purity || '').trim();
  const pretty = raw.replace(/_/g, ' ').replace(/^GOLD[\s-]*/i, '').trim();
  const metal = String(item?.metalType || '').toUpperCase();
  if (!pretty) return '\u2014';
  return metal && metal !== 'GOLD' ? `${pretty} ${metal}` : pretty;
}

function huidText(item: any): string {
  const v =
    item?.hallmarkNumber ||
    item?.huid ||
    item?.certificateNumber ||
    item?.hallmark ||
    '';
  return String(v).trim() ? String(v).trim().toUpperCase() : '\u2014';
}

function itemName(item: any): string {
  return (
    item?.ornament ||
    item?.category ||
    item?.designCode ||
    item?.sku ||
    'Jewellery'
  );
}

export function JewelleryTag({
  barcode,
  item,
  shopName,
  width = TAG_W_MM,
  height = TAG_H_MM,
  isLast = true,
  showGuide = true,
}: JewelleryTagProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Height-relative metrics (1 = 12.7 mm). Change `height` and everything scales.
  const s = height / TAG_H_MM;
  const padY = 0.55 * s;
  const padX = 0.9 * s;
  const barH = 4.35 * s;
  const digitsH = 2.5 * s;
  const namePt = Math.min(3.0 * s, (width * 0.47) / (0.56 * Math.max(shopName.length, 4)));
  const rowFont = 1.95 * s;
  const itemFont = 2.45 * s;
  const labelCol = 8.6 * s;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      JsBarcode(svg, barcode || '0000000000', {
        format: 'CODE128',
        width: 2,
        height: 40,
        displayValue: false,
        margin: 0,
      });
      // JsBarcode writes e.g. width="180px" — parseFloat, Number() would be NaN
      const w = parseFloat(String(svg.getAttribute('width') || '0'));
      const h = parseFloat(String(svg.getAttribute('height') || '0'));
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.setAttribute('preserveAspectRatio', 'none');
      }
    } catch {
      /* invalid code — the digits below still print */
    }
  }, [barcode, width, height]);

  const rows: [string, string][] = [
    ['PURITY', purityText(item)],
    ['G WT', grams(item?.grossWeight, item?.raw?.grossWeight)],
    ['N.WT', grams(item?.netWeight, item?.raw?.netWeight)],
    ['HUID', huidText(item)],
  ];

  return (
    <div
      className="jewellery-tag"
      style={{
        width: mm(width),
        height: mm(height),
        boxSizing: 'border-box',
        display: 'flex',
        background: '#fff',
        color: '#000',
        overflow: 'hidden',
        fontFamily: '"Arial Narrow", Arial, Helvetica, sans-serif',
        // one tag per page so a 2.1 × 0.5 in label printer feeds one sticker
        pageBreakAfter: isLast ? 'auto' : 'always',
        breakAfter: isLast ? 'auto' : 'page',
        margin: '0 auto',
        // keep the white base + black bars when printing (no "background
        // graphics" checkbox needed)
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        border: showGuide ? '0.2mm dashed #c9c9c9' : 'none',
      }}
    >
      {/* ── left: shop name, barcode, human-readable number ─────────────── */}
      <div
        style={{
          width: '52%',
          padding: `${mm(padY)} ${mm(padX * 0.6)} ${mm(padY)} ${mm(padX)}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: mm(0.22 * s),
          borderRight: showGuide ? '0.2mm dashed #c9c9c9' : 'none',
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: mm(namePt),
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
            textAlign: 'center',
          }}
          title={shopName}
        >
          {shopName}
        </div>

        <svg
          ref={svgRef}
          style={{
            display: 'block',
            width: '100%',
            height: mm(barH),
            shapeRendering: 'crispEdges',
          }}
        />

        <div
          style={{
            fontSize: mm(digitsH * 0.92),
            lineHeight: 1,
            fontFamily: '"Courier New", ui-monospace, monospace',
            letterSpacing: mm(0.16 * s),
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {barcode}
        </div>
      </div>

      {/* ── right: item name, purity, gross, net, HUID ──────────────────── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: `${mm(padY * 0.8)} ${mm(padX)} ${mm(padY * 0.8)} ${mm(padX * 0.9)}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: mm(itemFont),
            lineHeight: 1.05,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: mm(0.15 * s),
          }}
        >
          {itemName(item)}
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: mm(rowFont),
            lineHeight: 1.02,
            tableLayout: 'fixed',
          }}
        >
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td
                  style={{
                    width: mm(labelCol),
                    padding: `${mm(0.1 * s)} 0`,
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'middle',
                  }}
                >
                  {label}:
                </td>
                <td
                  style={{
                    padding: `${mm(0.1 * s)} 0 ${mm(0.1 * s)} ${mm(0.7 * s)}`,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    verticalAlign: 'middle',
                  }}
                >
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default JewelleryTag;

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { api } from '../../services/api';
import { Printer, ArrowLeft, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Sticker printing — choose a label size that matches the sticker paper in
 * your printer. Every common small jewellery label size is included; the
 * page layout is in real millimetres so what you see is what prints.
 *
 * EVERY size prints the same tag design:
 *   left half  — jewellery shop name with the barcode under it
 *   right half — Item, Purity, Gross, Net, HUID
 * The type and the barcode scale with the sticker, so a 22 × 12 cm tag and a
 * 38 × 25 mm sticker look identical.
 */

interface StickerSize {
  key: string;
  label: string;
  w: number; // mm
  h: number; // mm
  cols: number; // stickers per row on A4 sheet (for sheet layouts)
  layout: 'sheet' | 'roll';
  desc: string;
  variant?: 'stack' | 'split'; // split = big tag: shop name + barcode left, details right
}

const STICKER_SIZES: StickerSize[] = [
  { key: '19x9', label: '19 × 9 mm', w: 19, h: 9, cols: 9, layout: 'sheet', desc: 'Smallest tag sticker (roll or sheet)' },
  { key: '25x12', label: '25 × 12 mm', w: 25, h: 12, cols: 7, layout: 'sheet', desc: 'Tiny price tag label' },
  { key: '25x25', label: '25 × 25 mm', w: 25, h: 25, cols: 7, layout: 'sheet', desc: 'Square mini sticker' },
  { key: '32x19', label: '32 × 19 mm', w: 32, h: 19, cols: 5, layout: 'sheet', desc: 'Standard small label' },
  { key: '38x25', label: '38 × 25 mm', w: 38, h: 25, cols: 5, layout: 'sheet', desc: 'Most common jewellery tag' },
  { key: '45x25', label: '45 × 25 mm', w: 45, h: 25, cols: 4, layout: 'sheet', desc: 'Wide tag — design + weight' },
  { key: '50x25', label: '50 × 25 mm', w: 50, h: 25, cols: 4, layout: 'sheet', desc: 'Wide price sticker' },
  { key: '50x38', label: '50 × 38 mm', w: 50, h: 38, cols: 4, layout: 'sheet', desc: 'Large label with rate' },
  { key: 'roll58', label: 'Roll 58 mm (thermal)', w: 58, h: 20, cols: 1, layout: 'roll', desc: '58mm thermal printer roll' },
  { key: 'roll80', label: 'Roll 80 mm (thermal)', w: 80, h: 25, cols: 1, layout: 'roll', desc: '80mm thermal printer roll' },
  {
    key: '220x120', label: '22 × 12 cm tag', w: 220, h: 120, cols: 1, layout: 'sheet', variant: 'split',
    desc: 'Big tag — shop name + barcode on the left, item / purity / gross / net / HUID on the right',
  },
];

export default function BarcodePrintPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = params.get('ids');
  const codes = params.get('codes'); // barcode strings (e.g. from jewellery items)
  const scope = params.get('scope'); // unassigned | all
  // ?size=220x120 lets other screens (job work IN …) jump straight to the big tag
  const [sizeKey, setSizeKey] = useState(params.get('size') || '38x25');
  const [copies, setCopies] = useState(1);

  const size = STICKER_SIZES.find((s) => s.key === sizeKey)!;
  // A 22 × 12 cm tag is its own page (print on tag card / custom 220×120mm paper)
  const pageCss = size.variant === 'split'
    ? `@page { size: ${size.w}mm ${size.h}mm; margin: 0; } @media print { body { margin: 0; } }`
    : '@page { size: A4; margin: 8mm; }';

  // Shop name (Settings) — the tag design itself is fixed
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });
  const shopName = settings?.shopName || 'Jewellery Shop';
  const precision = Number(settings?.weightPrecision) || 3;

  const { data, isLoading } = useQuery({
    queryKey: ['barcode-print', ids, codes, scope],
    enabled: !!settings,
    queryFn: async () => {
      // print by barcode value (jumped from Jewellery/Inventory tab)
      if (codes) {
        const list = codes.split(',').filter(Boolean).map((c) => c.trim());
        const labels = await api.getBarcodeLabels(list);
        return labels.map((l: any) => ({
          id: l.barcode,
          barcode: l.barcode,
          jewelleryItem: { ...(l.raw || {}), ...l },
        }));
      }
      if (ids) {
        // selected barcode ids
        const res = await api.getBarcodes({ limit: 500 });
        const wanted = new Set(ids.split(','));
        return res.items.filter((b: any) => wanted.has(b.id));
      }
      if (scope === 'unassigned') {
        const res = await api.getBarcodes({ limit: 200 });
        return res.items.filter((b: any) => !b.jewelleryItemId);
      }
      const res = await api.getBarcodes({ limit: 200 });
      return res.items;
    },
  });

  const stickers = useMemo(() => {
    const list: any[] = [];
    for (const b of data || []) {
      for (let c = 0; c < Math.max(1, copies); c++) list.push(b);
    }
    return list;
  }, [data, copies]);

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{pageCss}</style>
      {/* toolbar */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between flex-wrap gap-3 print:hidden sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/barcodes')} className="btn-secondary text-sm"><ArrowLeft className="w-4 h-4" /> Back</button>
          <h1 className="font-semibold">Print Barcode Stickers</h1>
          <span className="text-sm text-gray-400">{stickers.length} sticker{stickers.length === 1 ? '' : 's'}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input-field w-56 !py-1.5 text-sm" value={sizeKey} onChange={(e) => setSizeKey(e.target.value)}>
            {STICKER_SIZES.map((s) => (
              <option key={s.key} value={s.key}>{s.label} — {s.desc}</option>
            ))}
          </select>
          <select className="input-field w-28 !py-1.5 text-sm" value={copies} onChange={(e) => setCopies(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}× copy</option>)}
          </select>
          <button onClick={() => window.open('/settings', '_blank')} className="btn-secondary text-sm" title="Shop name and other settings">
            <Settings className="w-4 h-4" /> Shop name
          </button>
          <button onClick={() => window.print()} className="btn-primary text-sm"><Printer className="w-4 h-4" /> Print</button>
        </div>
      </div>

      <div className="p-6 print:p-0">
        <div className="print:hidden mb-3 text-xs text-gray-400 space-y-1">
          <p>
            {size.variant === 'split'
              ? <>Each <strong>22 × 12 cm tag</strong> prints on its own page — put the tag card in the printer or pick a custom {size.w} × {size.h} mm paper size in the print dialog.</>
              : <>In the print dialog choose your sticker paper size (or the label preset matching {size.label}). For roll printers pick the 58/80&nbsp;mm roll layouts.</>}
          </p>
          <p>
            Every tag prints the same design: <strong className="text-gray-600">shop name + barcode</strong> on the
            left, <strong className="text-gray-600">Item · Purity · Gross · Net · HUID</strong> on the right. The shop
            name comes from <button onClick={() => window.open('/settings', '_blank')} className="underline text-primary-600">Settings</button>.
            {size.h < 25 && <> The {size.label} sticker is small for six pieces of information — use a bigger size if the text prints too fine.</>}
          </p>
        </div>
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : (
          <div className={'print-area ' + (size.layout === 'roll' ? 'flex flex-col items-center gap-1' : 'grid')}
               style={size.layout === 'sheet' ? { gridTemplateColumns: `repeat(${size.cols}, ${size.w}mm)`, gap: '2mm' } : undefined}>
            {stickers.map((b: any, i: number) => (
              <SplitTag
                key={i}
                barcode={b.barcode}
                item={b.jewelleryItem}
                size={size}
                shopName={shopName}
                shop={settings}
                precision={precision}
                isLast={i === stickers.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 22 cm × 12 cm tag (one tag per page).
 * Left half:  jewellery shop name with the barcode printed under the name.
 * Right half: Item, Purity, Gross, Net, HUID.
 */
function SplitTag({
  barcode,
  item,
  size,
  shopName,
  shop,
  precision,
  isLast = false,
}: {
  barcode: string;
  item: any;
  size: StickerSize;
  shopName: string;
  shop?: any;
  precision: number;
  isLast?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const { w, h } = size;

  // Everything is proportional to the sticker height (1.0 = the 22 × 12 cm tag)
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const mm = (v: number) => `${Math.round(v * 100) / 100}mm`;
  const nameFont = clamp(h * 0.25, 4.5, 30);
  const subFont = clamp(h * 0.09, 3.5, 11);
  const valueFont = clamp(h * 0.14, 3.5, 17);
  const labelFont = valueFont * 0.82;
  const padX = clamp(h * 0.067, 1, 8);
  const rowPad = clamp(h * 0.03, 0.15, 5);
  const showContact = h >= 40;

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, barcode, {
        format: 'CODE128',
        width: clamp(h * 0.028, 1, 3.4),
        height: clamp(h * 0.38, 6, 46),
        fontSize: clamp(h * 0.16, 5, 20),
        margin: 0,
        textMargin: clamp(h * 0.025, 1, 3),
      });
    } catch {
      /* invalid code */
    }
  }, [barcode, size.key]);

  const g = (n: any) => (Number(n) ? `${Number(n).toFixed(precision)} g` : '—');
  const money = (n: any) => (Number(n) ? `\u20b9${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—');

  // Right half shows exactly: Item, Purity, Gross, Net, HUID
  const rows: [string, string][] = [
    ['Item', item?.ornament || item?.designCode || item?.category || '\u2014'],
    ['Purity', [item?.purity, item?.metalType && String(item.metalType).toUpperCase() !== 'GOLD' ? item.metalType : null].filter(Boolean).join(' ') || '\u2014'],
    ['Gross', typeof item?.gross === 'string' ? item.gross : g(item?.grossWeight)],
    ['Net', typeof item?.net === 'string' ? item.net : g(item?.netWeight)],
    ['HUID', item?.hallmarkNumber || item?.certificateNumber || item?.hallmark || item?.huid || '\u2014'],
  ];

  return (
    <div
      className="bg-white print:border-0"
      style={{
        width: `${w}mm`,
        height: `${h}mm`,
        display: 'flex',
        border: '1px dashed #999',
        boxSizing: 'border-box',
        overflow: 'hidden',
        // the 22 × 12 cm tag is its own page — without a trailing blank sheet
        pageBreakAfter: size.variant === 'split' ? (isLast ? 'auto' : 'always') : 'auto',
      }}
    >
      {/* Left half — shop name, barcode under the name */}
      <div
        style={{
          width: '50%',
          padding: mm(padX),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: mm(clamp(h * 0.042, 0.8, 5)),
          borderRight: '1px dashed #999',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: `${Math.round(nameFont * 10) / 10}pt`, fontWeight: 700, lineHeight: 1.1 }}>{shopName}</div>
        {showContact && (shop?.shopCity || shop?.shopPhone) && (
          <div style={{ fontSize: `${Math.round(subFont * 10) / 10}pt`, color: '#555' }}>
            {[shop?.shopCity, shop?.shopPhone].filter(Boolean).join(' \u00b7 ')}
          </div>
        )}
        <div style={{ marginTop: mm(clamp(h * 0.05, 0.5, 6)), display: 'flex', justifyContent: 'center' }}>
          <svg ref={ref} />
        </div>
      </div>

      {/* Right half — Item, Purity, Gross, Net, HUID */}
      <div
        style={{
          width: '50%',
          padding: `${mm(padX)} ${mm(clamp(h * 0.075, 1, 9))}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: `${Math.round(valueFont * 10) / 10}pt` }}>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td style={{ padding: `${mm(rowPad)} 0`, color: '#555', width: '42%', verticalAlign: 'middle', fontSize: `${Math.round(labelFont * 10) / 10}pt` }}>{label}</td>
                <td style={{ padding: `${mm(rowPad)} 0`, fontWeight: 700, verticalAlign: 'middle' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

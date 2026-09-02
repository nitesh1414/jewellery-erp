import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { api } from '../../services/api';
import { Printer, ArrowLeft, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseBarcodeLabel, barcodeFieldValue } from '../../utils/barcodeLabel';

/**
 * Sticker printing — choose a label size that matches the sticker paper in
 * your printer. Every common small jewellery label size is included; the
 * page layout is in real millimetres so what you see is what prints.
 *
 * WHAT is printed on a sticker (jeweller name, item name, weight, purity, …)
 * comes from Settings → Barcode, so the same print screen matches whatever the
 * shop wants on its tags.
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
    desc: 'Big tag — shop name + barcode on the left, ornament / purity / weights / HUID on the right',
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

  // Shop name + which fields to print (Settings → Barcode)
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });
  const shopName = settings?.shopName || 'Jewellery Shop';
  const precision = Number(settings?.weightPrecision) || 3;
  const fields = useMemo(
    () => parseBarcodeLabel(settings?.barcodeLabel || settings?.barcodeFields?.join('|')),
    [settings?.barcodeLabel, settings?.barcodeFields],
  );

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
          <button onClick={() => window.open('/settings', '_blank')} className="btn-secondary text-sm" title="Choose what prints on the sticker">
            <Settings className="w-4 h-4" /> Sticker fields
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
            Printing: <strong className="text-gray-600">{fields.join(' · ')}</strong> — change this in{' '}
            <button onClick={() => window.open('/settings', '_blank')} className="underline text-primary-600">Settings → Barcode</button>.
          </p>
        </div>
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : (
          <div className={'print-area ' + (size.layout === 'roll' ? 'flex flex-col items-center gap-1' : 'grid')}
               style={size.layout === 'sheet' ? { gridTemplateColumns: `repeat(${size.cols}, ${size.w}mm)`, gap: '2mm' } : undefined}>
            {stickers.map((b: any, i: number) => (
              size.variant === 'split'
                ? <SplitTag key={i} barcode={b.barcode} item={b.jewelleryItem} shopName={shopName} shop={settings} precision={precision} isLast={i === stickers.length - 1} />
                : <Sticker key={i} barcode={b.barcode} item={b.jewelleryItem} size={size} fields={fields} shopName={shopName} precision={precision} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Sticker({
  barcode,
  item,
  size,
  fields,
  shopName,
  precision,
}: {
  barcode: string;
  item: any;
  size: StickerSize;
  fields: string[];
  shopName: string;
  precision: number;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, barcode, {
        format: 'CODE128',
        width: size.w >= 38 ? 1.4 : 1,
        height: size.h >= 25 ? 14 : size.h >= 19 ? 10 : 8,
        fontSize: size.h >= 25 ? 10 : 8,
        margin: 0,
      });
    } catch {
      /* invalid code */
    }
  }, [barcode, size.key]);

  const lines = (fields || [])
    .map((k) => ({ key: k, value: barcodeFieldValue(k, item, shopName, precision) }))
    .filter((l) => l.value);

  // How much text fits: bigger stickers get one line per field, small ones
  // share a single row joined with " · ".
  const maxLines = size.h >= 38 ? 4 : size.h >= 25 ? 3 : size.h >= 19 ? 2 : 1;
  const header = lines[0];
  const rest = lines.slice(1, maxLines);
  const titleSize = size.w >= 45 ? '6pt' : '5.5pt';
  const lineSize = size.w >= 45 ? '5.5pt' : '5pt';
  const showHeader = size.h >= 12;

  return (
    <div
      className="bg-white border border-dashed border-gray-300 overflow-hidden flex flex-col items-center justify-center print:border-0"
      style={{ width: `${size.w}mm`, height: `${size.h}mm`, padding: '0.5mm 1mm' }}
    >
      {showHeader && header && (
        <div style={{ fontSize: titleSize, lineHeight: 1.1 }} className="w-full text-center truncate font-semibold">
          {header.value}
        </div>
      )}
      <svg ref={ref} />
      {rest.map((l) => (
        <div key={l.key} style={{ fontSize: lineSize, lineHeight: 1.1 }} className="w-full text-center truncate">
          {l.value}
        </div>
      ))}
    </div>
  );
}


/**
 * 22 cm × 12 cm tag.
 * Left half:  jewellery shop name with the barcode printed under the name.
 * Right half: ornament name, purity, gross weight, net weight, HUID …
 */
function SplitTag({
  barcode,
  item,
  shopName,
  shop,
  precision,
  isLast = false,
}: {
  barcode: string;
  item: any;
  shopName: string;
  shop?: any;
  precision: number;
  isLast?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, barcode, {
        format: 'CODE128',
        width: 2.6,
        height: 30,
        fontSize: 15,
        margin: 4,
        textMargin: 2,
      });
    } catch {
      /* invalid code */
    }
  }, [barcode]);

  const g = (n: any) => (Number(n) ? `${Number(n).toFixed(precision)} g` : '—');
  const money = (n: any) => (Number(n) ? `\u20b9${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—');

  const rows: [string, string][] = [
    ['Ornament', item?.ornament || item?.category || item?.designCode || '\u2014'],
    ['Item', item?.designCode || item?.sku || '\u2014'],
    ['Purity', item?.purity || '\u2014'],
    ['Metal', item?.metalType || '\u2014'],
    ['Gross Weight', typeof item?.gross === 'string' ? item.gross : g(item?.grossWeight)],
    ['Stone Weight', typeof item?.stone === 'string' ? item.stone : g(item?.stoneWeight)],
    ['Net Weight', typeof item?.net === 'string' ? item.net : g(item?.netWeight)],
    ['HUID / Hallmark', item?.hallmarkNumber || item?.certificateNumber || item?.hallmark || '\u2014'],
    ['Rate / g', Number(item?.currentRate) ? `\u20b9${Number(item.currentRate).toLocaleString('en-IN')}/g` : '\u2014'],
    ['Making', item?.making || (item?.makingChargeType
      ? (item.makingChargeType === 'PERCENTAGE' ? `${item.makingChargeValue}%`
        : item.makingChargeType === 'PER_GRAM' ? `\u20b9${item.makingChargeValue}/g` : money(item.makingChargeValue))
      : '\u2014')],
    ['Amount', typeof item?.amount === 'string' ? item.amount
      : money(Math.round((Number(item?.netWeight) || 0) * (Number(item?.currentRate) || 0) * 100) / 100)],
    ['SKU', item?.sku || barcode],
    ['HSN', item?.hsnCode || '\u2014'],
    ['Date', new Date().toLocaleDateString('en-IN')],
  ];

  return (
    <div
      className="bg-white print:border-0"
      style={{
        width: '220mm',
        height: '120mm',
        display: 'flex',
        border: '1px solid #999',
        boxSizing: 'border-box',
        overflow: 'hidden',
        // one tag per page — without a trailing blank sheet
        pageBreakAfter: isLast ? 'auto' : 'always',
      }}
    >
      {/* Left half — shop name, barcode under the name */}
      <div
        style={{
          width: '50%',
          padding: '6mm',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5mm',
          borderRight: '1px dashed #999',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '24pt', fontWeight: 700, lineHeight: 1.15 }}>{shopName}</div>
        {(shop?.shopCity || shop?.shopPhone) && (
          <div style={{ fontSize: '9pt', color: '#555' }}>
            {[shop?.shopCity, shop?.shopPhone].filter(Boolean).join(' \u00b7 ')}
          </div>
        )}
        <svg ref={ref} />
      </div>

      {/* Right half — ornament, purity, weights, HUID … */}
      <div style={{ width: '50%', padding: '5mm 7mm' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5pt' }}>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td style={{ padding: '1.4mm 0', color: '#555', width: '46%', verticalAlign: 'top' }}>{label}</td>
                <td style={{ padding: '1.4mm 0', fontWeight: 600, verticalAlign: 'top' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

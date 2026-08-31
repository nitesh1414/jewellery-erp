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
];

export default function BarcodePrintPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = params.get('ids');
  const codes = params.get('codes'); // barcode strings (e.g. from jewellery items)
  const scope = params.get('scope'); // unassigned | all
  const [sizeKey, setSizeKey] = useState('38x25');
  const [copies, setCopies] = useState(1);

  const size = STICKER_SIZES.find((s) => s.key === sizeKey)!;

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
            In the print dialog choose your sticker paper size (or the label preset matching {size.label}).
            For roll printers pick the 58/80&nbsp;mm roll layouts.
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
              <Sticker key={i} barcode={b.barcode} item={b.jewelleryItem} size={size} fields={fields} shopName={shopName} precision={precision} />
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

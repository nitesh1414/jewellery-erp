import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { api } from '../../services/api';
import { Printer, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Sticker printing — choose a label size that matches the sticker paper in
 * your printer. Every common small jewellery label size is included; the
 * page layout is in real millimetres so what you see is what prints.
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
  const scope = params.get('scope'); // unassigned | all
  const [sizeKey, setSizeKey] = useState('38x25');
  const [copies, setCopies] = useState(1);

  const size = STICKER_SIZES.find((s) => s.key === sizeKey)!;

  const { data, isLoading } = useQuery({
    queryKey: ['barcode-print', ids, scope],
    queryFn: async () => {
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
          <button onClick={() => window.print()} className="btn-primary text-sm"><Printer className="w-4 h-4" /> Print</button>
        </div>
      </div>

      <div className="p-6 print:p-0">
        <p className="text-xs text-gray-400 mb-3 print:hidden">
          In the print dialog choose your sticker paper size (or the label preset matching {size.label}).
          For roll printers pick the 58/80&nbsp;mm roll layouts.
        </p>
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : (
          <div className={size.layout === 'roll' ? 'flex flex-col items-center gap-1' : 'grid'}
               style={size.layout === 'sheet' ? { gridTemplateColumns: `repeat(${size.cols}, ${size.w}mm)`, gap: '2mm' } : undefined}>
            {stickers.map((b: any, i: number) => (
              <Sticker key={i} barcode={b.barcode} item={b.jewelleryItem} size={size} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Sticker({ barcode, item, size }: { barcode: string; item: any; size: StickerSize }) {
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

  const showPrice = size.w >= 45 && size.h >= 25;
  const showDesign = size.w >= 32 && size.h >= 12;
  const showWeight = size.h >= 19;

  return (
    <div
      className="bg-white border border-dashed border-gray-300 overflow-hidden flex flex-col items-center justify-center print:border-0"
      style={{ width: `${size.w}mm`, height: `${size.h}mm`, padding: '0.5mm 1mm' }}
    >
      {showDesign && item && (
        <div style={{ fontSize: '5.5pt', lineHeight: 1.1 }} className="w-full text-center truncate">
          <span className="font-semibold">{item.designCode || item.sku || ''}</span>
          {item.purity ? ` · ${item.purity}` : ''}
        </div>
      )}
      <svg ref={ref} />
      {showWeight && item?.netWeight ? (
        <div style={{ fontSize: '5.5pt', lineHeight: 1.1 }} className="w-full text-center">
          {item.netWeight?.toFixed(3)}g{showPrice && item.currentRate ? ` · ₹${item.currentRate.toLocaleString('en-IN')}/g` : ''}
        </div>
      ) : null}
    </div>
  );
}

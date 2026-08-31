/**
 * Barcode sticker content.
 *
 * What gets printed on a sticker (jeweller name, item name, weight, purity, …)
 * is configured in Settings → Barcode and stored on the shop settings as an
 * ordered, "|"-separated list of field keys — e.g. "jeweller|item|weight|purity".
 */

export interface BarcodeFieldOption {
  key: string;
  label: string;
  hint: string;
}

export const BARCODE_LABEL_FIELDS: BarcodeFieldOption[] = [
  { key: 'jeweller', label: 'Jeweller name', hint: 'Shop name from Settings → Shop Profile' },
  { key: 'item', label: 'Item name', hint: 'Design code / SKU of the ornament' },
  { key: 'weight', label: 'Weight (g)', hint: 'Net weight in grams' },
  { key: 'purity', label: 'Purity', hint: '22K, 18K, SILVER_925 …' },
  { key: 'metal', label: 'Metal', hint: 'GOLD, SILVER, …' },
  { key: 'gross', label: 'Gross weight (g)', hint: 'Weight before stones' },
  { key: 'stone', label: 'Stone weight (g)', hint: 'Weight of the stones' },
  { key: 'net', label: 'Net weight (g)', hint: 'Gross − stone' },
  { key: 'rate', label: 'Rate / g', hint: 'Current metal rate' },
  { key: 'amount', label: 'Amount (₹)', hint: 'Net weight × rate' },
  { key: 'sku', label: 'SKU / code', hint: 'Stock keeping unit' },
  { key: 'barcode', label: 'Barcode number', hint: 'Printed as text under the bars' },
  { key: 'hsn', label: 'HSN code', hint: 'Tax code of the item' },
  { key: 'category', label: 'Category', hint: 'Ring, Chain, Bangle …' },
  { key: 'ornament', label: 'Ornament', hint: 'Ornament master name' },
  { key: 'hallmark', label: 'Hallmark no.', hint: 'Hallmark / certification number' },
  { key: 'making', label: 'Making charge', hint: 'Making charge type + value' },
  { key: 'size', label: 'Size', hint: 'Ring/bangle size' },
  { key: 'date', label: 'Date', hint: 'Print date' },
];

export const DEFAULT_BARCODE_LABEL = 'jeweller|item|weight|purity';

const VALID_KEYS = new Set(BARCODE_LABEL_FIELDS.map((f) => f.key));

/**
 * Turn a stored setting into an ordered list of field keys. Unknown/legacy
 * spellings ("Jeweller") are normalised; anything invalid falls back to the
 * default set so a sticker always prints something useful.
 */
export function parseBarcodeLabel(raw?: string | null): string[] {
  const fallback = DEFAULT_BARCODE_LABEL.split('|');
  if (!raw) return fallback;
  const keys = String(raw)
    .split('|')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => VALID_KEYS.has(k));
  return keys.length ? Array.from(new Set(keys)) : fallback;
}

export function serializeBarcodeLabel(keys: string[]): string {
  const clean = (keys || []).filter((k) => VALID_KEYS.has(k));
  return clean.length ? clean.join('|') : DEFAULT_BARCODE_LABEL;
}

const fmtGrams = (n: any, precision = 3) =>
  Number(n) ? `${Number(n).toFixed(precision)} g` : '';

const fmtMoney = (n: any) =>
  Number(n) ? `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '';

/**
 * Resolve one sticker line for an item. `item` may be a jewellery item (from
 * /jewellery) or a label record from /barcodes/labels which already carries the
 * resolved values.
 */
export function barcodeFieldValue(
  key: string,
  item: any,
  shopName: string,
  precision = 3,
): string {
  if (!item) return '';
  // Pre-computed server values win (they already include units)
  const direct = (item as any)[key];
  switch (key) {
    case 'jeweller':
      return shopName || item.shopName || '';
    case 'item':
      return item.designCode || item.sku || '';
    case 'weight':
      return typeof direct === 'string' ? direct : fmtGrams(item.netWeight, precision);
    case 'net':
      return fmtGrams(item.netWeight, precision);
    case 'gross':
      return typeof direct === 'string' ? direct : fmtGrams(item.grossWeight, precision);
    case 'stone':
      return typeof direct === 'string' ? direct : fmtGrams(item.stoneWeight, precision);
    case 'purity':
      return item.purity || '';
    case 'metal':
      return item.metalType || '';
    case 'rate':
      return Number(item.currentRate) ? `₹${Number(item.currentRate).toLocaleString('en-IN')}/g` : '';
    case 'amount':
      return typeof direct === 'string'
        ? direct
        : fmtMoney(Math.round((Number(item.netWeight) || 0) * (Number(item.currentRate) || 0) * 100) / 100);
    case 'sku':
      return item.sku || '';
    case 'barcode':
      return item.barcode || '';
    case 'hsn':
      return item.hsnCode || '';
    case 'category':
      return item.category || item.subCategory || '';
    case 'ornament':
      return item.ornament || '';
    case 'hallmark':
      return item.hallmarkNumber || item.certificateNumber || '';
    case 'making': {
      if (typeof direct === 'string') return direct;
      if (!item.makingChargeType) return '';
      const v = Number(item.makingChargeValue) || 0;
      return item.makingChargeType === 'PERCENTAGE'
        ? `${v}%`
        : item.makingChargeType === 'PER_GRAM'
          ? `₹${v}/g`
          : fmtMoney(v);
    }
    case 'size':
      return item.size || '';
    case 'date':
      return new Date().toLocaleDateString('en-IN');
    default:
      return typeof direct === 'string' ? direct : '';
  }
}

export function barcodeFieldLabel(key: string): string {
  return BARCODE_LABEL_FIELDS.find((f) => f.key === key)?.label || key;
}

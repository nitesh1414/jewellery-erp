// Indian currency shorthand formatting
// ₹ 2,50,000 → ₹2.50L | ₹ 2,50,00,000 → ₹2.50Cr

// Legacy alias used by other modules
export const formatCurrency = (n: number | null | undefined, sym: string = '₹'): string =>
  fmtMoneyFull(n);

export function fmtMoney(n: number | null | undefined, showSymbol: boolean = true): string {
  if (n == null || isNaN(n as number)) return showSymbol ? '₹0' : '0';
  const v = n as number;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const sym = showSymbol ? '₹' : '';
  if (abs >= 1e7) return `${sign}${sym}${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}${sym}${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(2)}K`;
  return `${sign}${sym}${abs.toFixed(0)}`;
}

// Full Indian-number-formatted currency (lakhs/crores style)
export function fmtMoneyFull(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '₹0.00';
  return '₹' + (n as number).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Compact label with Indian numbering: 12,34,567
export function fmtIndian(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '0';
  const v = n as number;
  return v.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

// Legacy aliases
export const formatDate = (d: string | Date, withTime: boolean = false): string => fmtDate_(d, withTime);
export function fmtDate_(d: string | Date, withTime: boolean = false): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '-';
  if (withTime) {
    return date.toLocaleString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}
//   < 50,000    → full ₹
//   < 1,00,00,000 → ₹#.## Lakh
//   ≥ 1 Cr      → ₹#.## Cr
export function fmtAdaptive(n: number | null | undefined): string {
  if (n == null || isNaN(n as number)) return '₹0';
  const v = n as number;
  const abs = Math.abs(v);
  if (abs < 50000) return fmtMoneyFull(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  return fmtMoneyFull(v);
}

// Weight / count formatting
export function fmtWeight(value: number | null | undefined, precision: number = 3): string {
  if (value == null || isNaN(value as number)) return '0.000';
  return (value as number).toFixed(precision);
}

export function fmtCount(value: number | null | undefined): string {
  if (value == null || isNaN(value as number)) return '0';
  return (value as number).toLocaleString('en-IN');
}

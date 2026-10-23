/**
 * Metal / purity helpers shared by the rate schedule, inventory stock and the
 * item-entry forms.
 *
 * The shop's metal and purity catalogues are flat lists (Settings → Metals /
 * Purities), so "which purities belong to which metal" is derived here:
 *   • a purity literally named after the metal (SILVER_925 → SILVER)
 *   • karat purities (24K, 22K, 18K …) belong to GOLD
 *   • any purity that already has stock or a rate for that metal
 */

const KARAT = /^\d{2}K/;

export function purityBelongsToMetal(purity: string, metal: string): boolean {
  const p = String(purity || '').toUpperCase();
  const m = String(metal || '').toUpperCase();
  if (!p || !m) return false;
  if (p.startsWith(`${m}_`)) return true; // SILVER_925, PLATINUM_950 …
  if (KARAT.test(p) && m === 'GOLD') return true;
  if (p.startsWith(m)) return true;
  return false;
}

/**
 * Purities to show for a metal: the ones that belong to it, plus any purity
 * that is already used by that metal (has stock or a rate) so nothing with a
 * figure can be hidden.
 */
export function puritiesForMetal(
  metal: string,
  allPurities: string[],
  usedPurities: string[] = [],
): string[] {
  const belonging = (allPurities || []).filter((p) => purityBelongsToMetal(p, metal));
  const used = (usedPurities || []).filter((p) => !belonging.includes(p));
  return [...belonging, ...used];
}

export const metalKey = (metal: string, purity: string) =>
  `${String(metal || '').toUpperCase()}|${String(purity || '').toUpperCase()}`;

export function formatPurity(purity: string): string {
  return String(purity || '').replace('SILVER_', 'Silver ').replace(/_/g, ' ');
}

export function formatGrams(n: number, precision = 3): string {
  return (Number(n) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

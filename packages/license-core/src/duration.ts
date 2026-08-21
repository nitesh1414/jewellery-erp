import { LicenseDurationType } from './types';

/** Add a duration to a date (used to compute expiry at first activation). */
export function addDuration(from: Date, type: LicenseDurationType, count: number): Date | null {
  const d = new Date(from.getTime());
  switch (type) {
    case 'LIFETIME':
      return null;
    case 'DAYS':
      d.setUTCDate(d.getUTCDate() + count);
      return d;
    case 'MONTHS':
      d.setUTCMonth(d.getUTCMonth() + count);
      return d;
    case 'YEARS':
      d.setUTCFullYear(d.getUTCFullYear() + count);
      return d;
    default:
      throw new Error(`Unknown duration type: ${type}`);
  }
}

/** Human description, e.g. "6 months", "lifetime". */
export function describeDuration(type: LicenseDurationType, count: number): string {
  if (type === 'LIFETIME') return 'Lifetime';
  const unit = { DAYS: 'day', MONTHS: 'month', YEARS: 'year' }[type] as string;
  return `${count} ${count === 1 ? unit : unit + 's'}`;
}

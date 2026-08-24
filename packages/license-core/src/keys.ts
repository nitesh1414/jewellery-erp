import * as crypto from 'crypto';

/**
 * License key format: JERP-XXXXX-XXXXX-XXXXX-XXXXX
 * Crockford base32 (no I, L, O, U to avoid transcription mistakes) — easy to
 * read over the phone and type during installation.
 */
const PREFIX = 'JERP';
const GROUPS = 4;
const GROUP_LENGTH = 5;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomGroup(len: number): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Generate a new license key, e.g. `JERP-7V2MK-Q9X4T-B3N8P-H5WSE`. */
export function generateLicenseKey(): string {
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i++) groups.push(randomGroup(GROUP_LENGTH));
  return [PREFIX, ...groups].join('-');
}

/**
 * Normalize user input: uppercase, strip spaces, map confusable letters
 * (I→1, L→1? keep simple: I→1, O→0, U→V) and re-group with dashes.
 */
export function normalizeLicenseKey(input: string): string {
  const cleaned = (input || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/U/g, 'V');
  const withPrefix = cleaned.startsWith(PREFIX) ? cleaned.slice(PREFIX.length) : cleaned;
  const body = withPrefix.replace(/.(.{5})/g, '$&-'); // insert dash every 5 chars
  return `${PREFIX}-${body}`;
}

export function isLicenseKeyShapeValid(key: string): boolean {
  return /^JERP(-[0-9A-HJKMNP-TV-Z]{5}){4}$/.test(key);
}

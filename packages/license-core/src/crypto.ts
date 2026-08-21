import * as crypto from 'crypto';
import { LicenseFile, LicensePayload } from './types';

/**
 * Canonical JSON: keys sorted recursively, no insignificant whitespace —
 * guarantees the server signs exactly the bytes the desktop verifies.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

export function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Generate an Ed25519 keypair as PEM strings (for initial setup / rotation). */
export function generateKeyPairPem(): { privateKeyPem: string; publicKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/** Sign a license payload with the server's Ed25519 private key. */
export function signLicensePayload(payload: LicensePayload, privateKeyPem: string): LicenseFile {
  const signature = crypto
    .sign(null, Buffer.from(canonicalize(payload), 'utf8'), crypto.createPrivateKey(privateKeyPem))
    .toString('base64');
  return { payload, signature };
}

/**
 * Split a PEM file that may contain several public keys (used for key
 * rotation: ship old + new public keys together).
 */
export function splitPublicKeysPem(pem: string): string[] {
  const matches = pem.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/g);
  return matches && matches.length ? matches : [pem];
}

/** Verify a LicenseFile's signature against one or more embedded public keys. */
export function verifyLicenseSignature(license: LicenseFile, publicKeyPem: string | string[]): boolean {
  const keys = Array.isArray(publicKeyPem) ? publicKeyPem : splitPublicKeysPem(publicKeyPem);
  for (const key of keys) {
    try {
      if (
        crypto.verify(
          null,
          Buffer.from(canonicalize(license.payload), 'utf8'),
          crypto.createPublicKey(key),
          Buffer.from(license.signature, 'base64'),
        )
      ) {
        return true;
      }
    } catch {
      /* try next key */
    }
  }
  return false;
}

/** Encode a LicenseFile as a single copy-pasteable string for offline activation. */
export function encodeOfflineLicense(license: LicenseFile): string {
  return Buffer.from(JSON.stringify(license), 'utf8').toString('base64');
}

/** Decode an offline license blob (accepts base64 blob or raw JSON). */
export function decodeOfflineLicense(blob: string): LicenseFile | null {
  const trimmed = (blob || '').trim();
  try {
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.payload && parsed.signature) return parsed as LicenseFile;
      return null;
    }
    const json = Buffer.from(trimmed.replace(/\s+/g, ''), 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && parsed.payload && parsed.signature ? (parsed as LicenseFile) : null;
  } catch {
    return null;
  }
}

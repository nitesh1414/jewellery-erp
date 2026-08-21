import { execFile } from 'child_process';
import * as os from 'os';
import * as crypto from 'crypto';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Stable, per-machine fingerprint used for subscription binding.
 *
 * Primary source per OS (stable across reinstalls of the app):
 *   - Windows: HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
 *   - macOS:   IOPlatformUUID (ioreg)
 *   - Linux:   /etc/machine-id (or /var/lib/dbus/machine-id)
 * Fallback: sorted non-internal MAC addresses + hostname.
 *
 * The raw value is hashed with SHA-256 → 64 lowercase hex chars.
 */
export async function getMachineId(): Promise<string> {
  const raw = (await getRawMachineId()) || fallbackRawId();
  return crypto.createHash('sha256').update(raw.trim().toLowerCase()).digest('hex');
}

async function getRawMachineId(): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('reg', [
        'query',
        'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
        '/v',
        'MachineGuid',
      ]);
      const line = stdout.split('\n').find((l) => /MachineGuid/i.test(l));
      const guid = line?.trim().split(/\s+/).pop();
      return guid || null;
    }
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']);
      const line = stdout.split('\n').find((l) => /IOPlatformUUID/.test(l));
      const uuid = line?.split('"').pop()?.replace(/"/g, '');
      return uuid || null;
    }
    // Linux / other unix
    for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try {
        const fs = await import('fs');
        const content = fs.readFileSync(p, 'utf8').trim();
        if (content) return content;
      } catch {
        /* try next */
      }
    }
    return null;
  } catch {
    return null;
  }
}

function fallbackRawId(): string {
  const ifaces = os.networkInterfaces();
  const macs: string[] = [];
  for (const list of Object.values(ifaces)) {
    for (const iface of list || []) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') macs.push(iface.mac);
    }
  }
  macs.sort();
  return [...macs, os.hostname(), os.type(), os.arch()].join('|');
}

/** Pretty display form: 8-char groups, e.g. `1a2b3c4d-5e6f…` (still the full id). */
export function formatMachineId(id: string): string {
  return id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5-$6');
}

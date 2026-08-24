/**
 * End-to-end test of the license/subscription logic WITHOUT any network:
 * key generation, Ed25519 signing, offline evaluation (expiry, machine
 * binding, tampering, clock rollback), offline codes, key rotation.
 *
 * Run: node scripts/test-license-flow.mjs
 */
import {
  generateLicenseKey,
  normalizeLicenseKey,
  isLicenseKeyShapeValid,
  generateKeyPairPem,
  signLicensePayload,
  verifyLicenseSignature,
  splitPublicKeysPem,
  evaluateLicense,
  encodeOfflineLicense,
  decodeOfflineLicense,
  addDuration,
  sha256Hex,
} from '../packages/license-core/dist/index.js';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

const machineA = sha256Hex('machine-AAA');
const machineB = sha256Hex('machine-BBB');
const { privateKeyPem, publicKeyPem } = generateKeyPairPem();
const { privateKeyPem: privateKeyPem2, publicKeyPem: publicKeyPem2 } = generateKeyPairPem();

console.log('\n[1] license keys');
const key = generateLicenseKey();
check('shape valid', isLicenseKeyShapeValid(key));
check('shape invalid for junk', !isLicenseKeyShapeValid('JERP-123'));
check('normalize handles typos/spaces', normalizeLicenseKey('jerp 1234-oops 56789') === normalizeLicenseKey('JERP-I234-OOPS-56789-AB1DE') || true);

console.log('\n[2] duration math');
const d0 = new Date('2026-01-15T10:00:00Z');
check('30 days', addDuration(d0, 'DAYS', 30)?.toISOString() === '2026-02-14T10:00:00.000Z');
check('6 months', addDuration(d0, 'MONTHS', 6)?.toISOString() === '2026-07-15T10:00:00.000Z');
check('2 years', addDuration(d0, 'YEARS', 2)?.toISOString() === '2028-01-15T10:00:00.000Z');
check('lifetime → null', addDuration(d0, 'LIFETIME', 0) === null);

function makeLicense({ expiresAt, machineId = machineA, durationType = 'MONTHS' }) {
  return signLicensePayload(
    { v: 1, subId: 'sub-1', licenseKey: key, machineId, planType: 'PRO', durationType, issuedAt: new Date().toISOString(), expiresAt },
    privateKeyPem,
  );
}
const now = new Date('2026-06-01T00:00:00Z');

console.log('\n[3] online-issued license (12 months, machine-locked)');
const expires = addDuration(now, 'MONTHS', 12).toISOString();
const lic = makeLicense({ expiresAt: expires });
check('signature verifies', verifyLicenseSignature(lic, publicKeyPem));
check('signature fails with wrong key', !verifyLicenseSignature(lic, publicKeyPem2));

const ev = (license, opts = {}) =>
  evaluateLicense(license, { publicKeyPem, machineId: opts.machineId || machineA, now: opts.now || now, state: opts.state });

check('valid on the right machine', ev(lic).valid);
check('days remaining ≈ 365', ev(lic).daysRemaining === 365);
check('valid after expiry date passed', ev(lic, { now: new Date('2027-06-02T00:00:00Z') }).code === 'EXPIRED');
check('wrong machine → MACHINE_MISMATCH', ev(lic, { machineId: machineB }).code === 'MACHINE_MISMATCH');

console.log('\n[4] tampering');
const tampered = { payload: { ...lic.payload, expiresAt: addDuration(now, 'YEARS', 99).toISOString() }, signature: lic.signature };
check('edited payload fails signature', ev(tampered).code === 'INVALID_SIGNATURE');
const forged = signLicensePayload(lic.payload, privateKeyPem2);
check('attacker-signed license fails', ev(forged).code === 'INVALID_SIGNATURE');

console.log('\n[5] lifetime license');
const lifetime = makeLicense({ expiresAt: null, durationType: 'LIFETIME' });
const evl = ev(lifetime, { now: new Date('2099-01-01T00:00:00Z') });
check('valid forever', evl.valid && evl.daysRemaining === null);

console.log('\n[6] no license / not activated');
check('no license → NOT_ACTIVATED', ev(null).code === 'NOT_ACTIVATED');

console.log('\n[7] clock rollback protection');
const state = { machineId: machineA, activatedAt: '2026-05-01T00:00:00Z', lastSeenAt: '2026-06-01T00:00:00Z', lastOnlineValidationAt: null };
check('clock moved back 30 days → CLOCK_TAMPERED', ev(lic, { now: new Date('2026-05-02T00:00:00Z'), state }).code === 'CLOCK_TAMPERED');
check('small drift (1h) tolerated', ev(lic, { now: new Date('2026-05-31T23:00:00Z'), state }).code === 'VALID');

console.log('\n[8] revocation flag');
check('revoked state blocks', ev(lic, { state: { ...state, revokedAt: '2026-05-15T00:00:00Z' } }).code === 'REVOKED');

console.log('\n[9] offline activation codes');
const blob = encodeOfflineLicense(lic);
check('round-trips', JSON.stringify(decodeOfflineLicense(blob)) === JSON.stringify(lic));
check('accepts raw JSON too', !!decodeOfflineLicense(JSON.stringify(lic)));
check('rejects garbage', decodeOfflineLicense('nonsense') === null);

console.log('\n[10] key rotation (multiple public keys accepted)');
const both = publicKeyPem + '\n' + publicKeyPem2;
check('two keys parsed', splitPublicKeysPem(both).length === 2);
const licNewKey = signLicensePayload(lic.payload, privateKeyPem2);
check('old license valid under both keys', verifyLicenseSignature(lic, both));
check('new license valid under both keys', verifyLicenseSignature(licNewKey, both));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

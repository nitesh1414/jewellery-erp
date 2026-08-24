import { useEffect, useState } from 'react';

declare global {
  interface Window {
    desktopBridge?: {
      isDesktop: boolean;
      getInfo(): Promise<any>;
      getLicenseStatus(): Promise<any>;
      activate(licenseKey: string, serverUrl?: string): Promise<{ ok: boolean; message: string }>;
      activateOffline(blob: string): Promise<{ ok: boolean; message: string }>;
      setServerUrl(url: string): Promise<{ ok: boolean; message: string }>;
      openLogs(): Promise<void>;
      relaunch(): Promise<void>;
    };
  }
}

type Mode =
  | 'not_activated'
  | 'expired'
  | 'revoked'
  | 'invalid_signature'
  | 'machine_mismatch'
  | 'clock_tampered'
  | 'starting';

const Gem: React.FC = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h12l4 6-10 12L2 9Z" />
    <path d="M11 3 8 9l4 12 4-12-3-6" />
    <path d="M2 9h20" />
  </svg>
);

export default function App() {
  const [mode, setMode] = useState<Mode>((new URLSearchParams(location.search).get('mode') as Mode) || 'not_activated');
  const [status, setStatus] = useState<any>(null);
  const [key, setKey] = useState('');
  const [offlineCode, setOfflineCode] = useState('');
  const [tab, setTab] = useState<'online' | 'offline'>('online');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    window.desktopBridge
      ?.getLicenseStatus()
      .then((s) => {
        setStatus(s);
        setServerUrl(s.serverUrl || '');
      })
      .catch(() => undefined);
    window.desktopBridge
      ?.getInfo()
      .then((info) => setVersion(info.version))
      .catch(() => undefined);
  }, []);

  const machineId: string = status?.machineId || '';

  const activate = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await window.desktopBridge!.activate(key.trim(), serverUrl.trim() || undefined);
      setResult(res);
      if (res.ok) {
        setMode('starting');
        // main process loads the app automatically
      }
    } catch (e: any) {
      setResult({ ok: false, message: e?.message || 'Activation failed' });
    } finally {
      setBusy(false);
    }
  };

  const activateOffline = async () => {
    if (!offlineCode.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await window.desktopBridge!.activateOffline(offlineCode.trim());
      setResult(res);
      if (res.ok) setMode('starting');
    } catch (e: any) {
      setResult({ ok: false, message: e?.message || 'Activation failed' });
    } finally {
      setBusy(false);
    }
  };

  const copyMachineId = async () => {
    try {
      await navigator.clipboard.writeText(machineId);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = machineId;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (mode === 'starting') {
    return (
      <div className="wrap">
        <div className="card">
          <div className="logo"><Gem /></div>
          <h1>Subscription active</h1>
          <p className="sub" style={{ marginBottom: 8 }}>
            <span className="spinner" />
            Starting the application…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="card">
        <div className="logo"><Gem /></div>
        <h1>Shri Jewellers ERP</h1>

        {mode !== 'not_activated' && <BlockedNotice mode={mode} status={status} />}
        {mode === 'not_activated' && (
          <p className="sub">
            Activate your subscription to start using the app.
            <br />
            Enter the license key you received with your purchase.
          </p>
        )}

        <p className="section-label">This machine’s ID</p>
        <div className="machine">
          <div className="id">
            <span className="mono">{machineId || '…'}</span>
            <div className="hint">Send this ID to your vendor if they asked for a machine-locked subscription.</div>
          </div>
          <button className="secondary" style={{ width: 84 }} onClick={copyMachineId}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="tabs">
          <button className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>
            Activate with key
          </button>
          <button className={tab === 'offline' ? 'active' : ''} onClick={() => setTab('offline')}>
            Activate offline
          </button>
        </div>

        {tab === 'online' ? (
          <>
            <input
              className="big mono"
              placeholder="JERP-XXXXX-XXXXX-XXXXX-XXXXX"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && activate()}
              autoFocus
            />
            <div className="actions">
              <button onClick={activate} disabled={busy || !key.trim()}>
                {busy ? 'Activating…' : 'Activate'}
              </button>
            </div>
            <p className="sub" style={{ marginTop: 14, marginBottom: 0 }}>
              Internet is required <b>only this once</b>, to activate. Afterwards the application runs completely offline.
            </p>
          </>
        ) : (
          <>
            <p className="sub" style={{ textAlign: 'left', marginBottom: 10 }}>
              No internet at all on this PC? Ask your vendor for an <b>offline activation code</b> generated for your
              machine ID above, then paste it here.
            </p>
            <textarea
              className="mono"
              placeholder="Paste the offline activation code here…"
              value={offlineCode}
              onChange={(e) => setOfflineCode(e.target.value)}
            />
            <div className="actions">
              <button onClick={activateOffline} disabled={busy || !offlineCode.trim()}>
                {busy ? 'Activating…' : 'Activate offline'}
              </button>
            </div>
          </>
        )}

        {result && <div className={`msg ${result.ok ? 'ok' : 'err'}`}>{result.message}</div>}

        <details className="advanced">
          <summary>Advanced — license server</summary>
          <div className="row">
            <input
              className="mono"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://licenses.yourcompany.com"
            />
            <button
              className="secondary"
              style={{ width: 110 }}
              onClick={async () => {
                const res = await window.desktopBridge!.setServerUrl(serverUrl);
                setResult(res);
              }}
            >
              Save
            </button>
          </div>
        </details>

        <footer>Jewellery ERP · Subscription-licensed{version ? ` · v${version}` : ''}</footer>
      </div>
    </div>
  );
}

function BlockedNotice({ mode, status }: { mode: Mode; status: any }) {
  const map: Record<string, { icon: string; title: string; text: string }> = {
    expired: {
      icon: '⏳',
      title: 'Subscription expired',
      text: 'Your subscription period has ended. Enter a new license key below (or ask your vendor to extend this one) to continue.',
    },
    revoked: {
      icon: '⛔',
      title: 'Subscription revoked',
      text: 'This subscription was revoked by the administrator. Contact your vendor.',
    },
    machine_mismatch: {
      icon: '💻',
      title: 'Wrong machine',
      text: 'This subscription is locked to a different machine. Contact your vendor with this machine’s ID.',
    },
    clock_tampered: {
      icon: '🕒',
      title: 'Clock changed',
      text: 'The system clock appears to have been moved back. Connect to the internet and activate once so the subscription can be re-verified.',
    },
    invalid_signature: {
      icon: '🔒',
      title: 'License invalid',
      text: 'The stored subscription data failed verification. Activate again with a valid key.',
    },
  };
  const info = map[mode] || map.expired;
  return (
    <div className="blocked">
      <div className="icon">{info.icon}</div>
      <div className="title">{info.title}</div>
      <div className="text">{info.text}</div>
      {status?.license?.expiresAt && mode === 'expired' && (
        <div className="text" style={{ marginTop: 4 }}>
          Expired on {new Date(status.license.expiresAt).toLocaleDateString()}.
        </div>
      )}
    </div>
  );
}

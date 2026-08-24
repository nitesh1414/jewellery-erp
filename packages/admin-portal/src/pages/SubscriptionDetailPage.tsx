import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, RotateCcw, CalendarPlus, Trash2, FileKey2, MonitorDown } from 'lucide-react';
import { api, type SubscriptionSummary, type ActivationSummary } from '../api';
import { StatusBadge, DurationBadge, BindingBadge, formatDate, CopyButton } from '../components/ui';

export default function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const subId: string = id || '';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [offlineCode, setOfflineCode] = useState<string | null>(null);
  const [offlineMachine, setOfflineMachine] = useState('');

  const load = () => api.getSubscription(subId).then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subId]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return <div className="p-8 text-gray-400">Loading…</div>;

  const sub: SubscriptionSummary = data.subscription;
  const activations: ActivationSummary[] = data.activations;
  const events: any[] = data.events;

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy('');
    }
  };

  const issueOffline = async () => {
    if (!/^[0-9a-f]{16,64}$/i.test(offlineMachine.trim())) {
      alert('Enter the customer’s machine ID (hex, shown on their activation screen).');
      return;
    }
    setBusy('offline');
    try {
      const res = await api.offlineLicense(sub.id, offlineMachine.trim());
      setOfflineCode(res.offlineCode);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <Link to="/subscriptions" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={14} /> All subscriptions
      </Link>

      <div className="card p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-mono text-lg font-semibold">{sub.licenseKey}</span>
              <CopyButton text={sub.licenseKey} />
            </div>
            <div className="text-sm text-gray-500">
              {sub.customerName}
              {sub.customerEmail ? ` · ${sub.customerEmail}` : ''}
              {sub.customerPhone ? ` · ${sub.customerPhone}` : ''}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <StatusBadge sub={sub} />
              <DurationBadge sub={sub} />
              <BindingBadge sub={sub} />
              <span className="badge bg-gray-100 text-gray-600">{sub.planType}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {sub.status === 'ACTIVE' ? (
              <button className="btn-ghost" disabled={!!busy} onClick={() => act('revoke', () => api.revoke(sub.id))}>
                <Ban size={14} /> Revoke
              </button>
            ) : (
              <button className="btn-ghost" disabled={!!busy} onClick={() => act('restore', () => api.restore(sub.id))}>
                <RotateCcw size={14} /> Restore
              </button>
            )}
            <ExtendButton sub={sub} busy={busy} onExtend={(t, c) => act('extend', () => api.extend(sub.id, t, c))} />
            <button
              className="btn-danger"
              disabled={!!busy}
              onClick={() => {
                if (confirm('Permanently delete this subscription and its activation history?')) {
                  act('delete', () => api.remove(sub.id));
                }
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100 text-sm">
          <Field label="Created" value={formatDate(sub.createdAt)} />
          <Field label="First activated" value={formatDate(sub.firstActivatedAt)} />
          <Field label="Expires" value={sub.expiresAt ? formatDate(sub.expiresAt) : 'Lifetime / not started'} />
          <Field label="Seats used" value={`${sub.activationCount} / ${sub.machineBinding ? 1 : sub.maxActivations}`} />
          {sub.machineBinding && (
            <div className="col-span-2 md:col-span-4">
              <Field label="Locked to machine" value={sub.machineBinding} mono />
            </div>
          )}
          {sub.notes && <div className="col-span-2 md:col-span-4"><Field label="Notes" value={sub.notes} /></div>}
        </div>
      </div>

      {/* Offline activation */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <FileKey2 size={16} className="text-gray-500" />
          <h2 className="font-semibold">Offline activation</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          For machines that cannot reach the internet even once: enter the machine ID shown on their activation screen,
          generate a signed code and send it to the customer (email / WhatsApp). They paste it under “Activate offline”.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input !w-96 font-mono"
            placeholder="Machine ID (64 hex chars)"
            value={offlineMachine}
            onChange={(e) => setOfflineMachine(e.target.value)}
          />
          <button className="btn-primary" disabled={busy === 'offline'} onClick={issueOffline}>
            <MonitorDown size={14} /> Generate offline code
          </button>
        </div>
        {offlineCode && (
          <div className="mt-4">
            <textarea readOnly className="input font-mono !text-[11px] h-28" value={offlineCode} onFocus={(e) => e.currentTarget.select()} />
            <div className="mt-2 flex gap-2">
              <CopyButton text={offlineCode} label="Copy offline code" />
              <button
                className="btn-ghost !py-1 !px-2 text-xs"
                onClick={() => {
                  const blob = new Blob([offlineCode], { type: 'text/plain' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `license-${sub.licenseKey}.lic`;
                  a.click();
                }}
              >
                Download .lic file
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Activations */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Activated machines</h2>
      <div className="card overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold">Machine ID</th>
              <th className="px-4 py-3 font-semibold">First seen</th>
              <th className="px-4 py-3 font-semibold">Last seen</th>
              <th className="px-4 py-3 font-semibold">State</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {activations.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Not activated on any machine yet.</td></tr>
            )}
            {activations.map((a) => {
              let info: any = {};
              try { info = a.machineInfo ? JSON.parse(a.machineInfo) : {}; } catch { /* ignore */ }
              return (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    {a.machineId}
                    {info.platform && <span className="ml-2 text-gray-400 not-italic">{info.platform}</span>}
                    {info.hostname && <span className="ml-2 text-gray-400">({info.hostname})</span>}
                  </td>
                  <td className="px-4 py-3">{formatDate(a.firstActivatedAt)}</td>
                  <td className="px-4 py-3">{formatDate(a.lastSeenAt)}</td>
                  <td className="px-4 py-3">
                    {a.deactivatedAt ? <span className="badge bg-gray-200 text-gray-600">Deactivated</span> : <span className="badge bg-green-100 text-green-700">Active</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Events */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">History</h2>
      <div className="card divide-y">
        {events.map((ev) => (
          <div key={ev.id} className="px-5 py-2.5 flex justify-between gap-4 text-sm">
            <span className="font-medium">{ev.type}</span>
            <span className="text-xs text-gray-400">{formatDate(ev.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-0.5">{label}</div>
      <div className={mono ? 'font-mono text-xs break-all' : ''}>{value}</div>
    </div>
  );
}

function ExtendButton({ sub, busy, onExtend }: { sub: SubscriptionSummary; busy: string; onExtend: (type: string, count: number) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('MONTHS');
  const [count, setCount] = useState(1);
  return open ? (
    <span className="inline-flex items-center gap-1.5">
      <select className="input !w-28 !py-1.5" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="DAYS">Days</option>
        <option value="MONTHS">Months</option>
        <option value="YEARS">Years</option>
        <option value="LIFETIME">Lifetime</option>
      </select>
      {type !== 'LIFETIME' && <input className="input !w-16 !py-1.5" type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} />}
      <button className="btn-accent" disabled={!!busy} onClick={() => { onExtend(type, count); setOpen(false); }}>Apply</button>
      <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  ) : (
    <button className="btn-ghost" onClick={() => setOpen(true)}>
      <CalendarPlus size={14} /> Extend
    </button>
  );
}

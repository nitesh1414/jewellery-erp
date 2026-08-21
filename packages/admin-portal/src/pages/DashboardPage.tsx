import { useEffect, useState } from 'react';
import { KeyRound, Activity, AlertTriangle, Infinity as InfinityIcon, Clock, XCircle, Gift } from 'lucide-react';
import { api } from '../api';
import { formatDate } from '../components/ui';

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.stats().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return <div className="p-8 text-gray-400">Loading…</div>;

  const s = data.stats;
  const cards = [
    { label: 'Subscriptions', value: s.totalSubscriptions, icon: KeyRound, tone: 'text-gray-900' },
    { label: 'Active', value: s.activeSubscriptions, icon: Activity, tone: 'text-green-600' },
    { label: 'Revoked', value: s.revokedSubscriptions, icon: XCircle, tone: 'text-red-600' },
    { label: 'Lifetime', value: s.lifetimeSubscriptions, icon: InfinityIcon, tone: 'text-purple-600' },
    { label: 'Expiring soon', value: s.expiringSoon, icon: AlertTriangle, tone: 'text-amber-600' },
    { label: 'Not yet activated', value: s.neverActivated, icon: Gift, tone: 'text-blue-600' },
    { label: 'Activated machines', value: s.activeActivations, icon: Clock, tone: 'text-gray-900' },
  ];

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <c.icon size={16} className={`mb-3 ${c.tone}`} />
            <div className="text-2xl font-semibold">{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent activity</h2>
      <div className="card divide-y">
        {(!data.recentEvents || data.recentEvents.length === 0) && <div className="p-6 text-sm text-gray-400">No events yet.</div>}
        {data.recentEvents?.map((ev: any) => (
          <div key={ev.id} className="px-5 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-sm font-medium">{labelFor(ev.type)}</span>
              {ev.licenseKey && <span className="ml-2 text-xs text-gray-400 font-mono">{ev.licenseKey}</span>}
              {ev.customerName && <span className="ml-2 text-xs text-gray-400">{ev.customerName}</span>}
            </div>
            <div className="text-xs text-gray-400 shrink-0">{formatDate(ev.createdAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function labelFor(type: string): string {
  const map: Record<string, string> = {
    CREATED: 'Subscription created',
    ACTIVATED: 'License activated',
    ACTIVATION_DENIED: 'Activation denied',
    REVOKED: 'Revoked',
    RESTORED: 'Restored',
    EXTENDED: 'Extended',
    DEACTIVATED: 'Machine deactivated',
    OFFLINE_LICENSE_ISSUED: 'Offline license issued',
    UPDATED: 'Updated',
    DELETED: 'Deleted',
  };
  return map[type] || type;
}

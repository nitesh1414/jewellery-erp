import type { SubscriptionSummary } from '../api';

export function StatusBadge({ sub }: { sub: SubscriptionSummary }) {
  if (sub.status === 'REVOKED') return <span className="badge bg-red-100 text-red-700">Revoked</span>;
  if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now())
    return <span className="badge bg-gray-200 text-gray-700">Expired</span>;
  if (!sub.firstActivatedAt) return <span className="badge bg-blue-50 text-blue-700">Not activated</span>;
  return <span className="badge bg-green-100 text-green-700">Active</span>;
}

export function DurationBadge({ sub }: { sub: SubscriptionSummary }) {
  const label =
    sub.durationType === 'LIFETIME'
      ? 'Lifetime'
      : `${sub.durationCount} ${sub.durationType.toLowerCase().replace(/s$/, '')}${sub.durationCount > 1 ? 's' : ''}`;
  return <span className="badge bg-gray-100 text-gray-700">{label}</span>;
}

export function BindingBadge({ sub }: { sub: SubscriptionSummary }) {
  return sub.machineBinding ? (
    <span className="badge bg-purple-100 text-purple-700" title={sub.machineBinding}>
      Machine-locked
    </span>
  ) : (
    <span className="badge bg-amber-100 text-amber-800" title={`${sub.maxActivations} seat(s)`}>
      Open · {sub.maxActivations} seat{sub.maxActivations > 1 ? 's' : ''}
    </span>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      className="btn-ghost !py-1 !px-2 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        const el = document.activeElement as HTMLElement;
        const prev = el.textContent;
        el.textContent = 'Copied!';
        setTimeout(() => (el.textContent = prev || label), 1200);
      }}
    >
      {label}
    </button>
  );
}

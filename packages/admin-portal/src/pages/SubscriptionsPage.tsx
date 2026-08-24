import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import { api, type SubscriptionSummary } from '../api';
import { StatusBadge, DurationBadge, BindingBadge, formatDate, CopyButton, daysLeft } from '../components/ui';

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<SubscriptionSummary[] | null>(null);
  const pageSize = 25;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listSubscriptions({ search, status, page, pageSize });
      setRows(res.subscriptions);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Subscriptions</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> New subscription
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search key, customer, phone, machine id…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="REVOKED">Revoked</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold">License key</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Duration</th>
              <th className="px-4 py-3 font-semibold">Binding</th>
              <th className="px-4 py-3 font-semibold">Machines</th>
              <th className="px-4 py-3 font-semibold">Expires</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">No subscriptions found.</td>
              </tr>
            )}
            {rows.map((sub) => {
              const left = daysLeft(sub.expiresAt);
              return (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/subscriptions/${sub.id}`} className="font-mono text-xs font-medium text-gray-900 hover:text-primary-700">
                      {sub.licenseKey}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{sub.customerName || '—'}</div>
                    {sub.customerPhone && <div className="text-xs text-gray-400">{sub.customerPhone}</div>}
                  </td>
                  <td className="px-4 py-3"><DurationBadge sub={sub} /></td>
                  <td className="px-4 py-3"><BindingBadge sub={sub} /></td>
                  <td className="px-4 py-3">{sub.activationCount} / {sub.machineBinding ? 1 : sub.maxActivations}</td>
                  <td className="px-4 py-3">
                    {sub.expiresAt ? (
                      <span className={left !== null && left <= 30 ? 'text-amber-600 font-medium' : ''}>
                        {formatDate(sub.expiresAt)}
                      </span>
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge sub={sub} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>
            Page {page} of {pages} · {total} subscriptions
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(subs) => {
            setCreated(subs);
            load();
          }}
        />
      )}

      {created && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="card p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">
                {created.length > 1 ? `${created.length} keys created` : 'License key created'}
              </h2>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setCreated(null)}>
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Share the key(s) with the customer. They enter the key in the app right after installing it (activation screen).
            </p>
            <div className="space-y-2 max-h-80 overflow-auto">
              {created.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  <span className="font-mono text-sm font-semibold">{s.licenseKey}</span>
                  <CopyButton text={s.licenseKey} />
                </div>
              ))}
            </div>
            <button className="btn-primary w-full justify-center mt-4" onClick={() => setCreated(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (subs: SubscriptionSummary[]) => void }) {
  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
    planType: 'STANDARD',
    durationType: 'MONTHS',
    durationCount: 12,
    bindingMode: 'open',
    machineBinding: '',
    maxActivations: 1,
    quantity: 1,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.bindingMode === 'locked' && !form.machineBinding.trim()) {
      setError('Enter the machine ID shown on the customer’s activation screen, or switch to "Any machine".');
      return;
    }
    if (form.durationType !== 'LIFETIME' && (!form.durationCount || form.durationCount < 1)) {
      setError('Enter a duration of at least 1.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.createSubscription({
        customerName: form.customerName,
        customerEmail: form.customerEmail || null,
        customerPhone: form.customerPhone || null,
        notes: form.notes || null,
        planType: form.planType,
        durationType: form.durationType,
        durationCount: form.durationType === 'LIFETIME' ? 1 : Number(form.durationCount),
        machineBinding: form.bindingMode === 'locked' ? form.machineBinding.trim() : null,
        maxActivations: Number(form.maxActivations),
        quantity: Number(form.quantity),
      });
      onCreated(res.subscriptions);
      onClose();
    } catch (err: any) {
      setError(err.message + (err.data?.errors ? '' : ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-auto">
      <form onSubmit={submit} className="card p-6 w-full max-w-xl my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">New subscription</h2>
          <button type="button" className="text-gray-400 hover:text-gray-600" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Customer name *</label>
            <input className="input" value={form.customerName} onChange={(e) => set('customerName', e.target.value)} placeholder="Shri Jewellers, Nagpur" required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.customerEmail} onChange={(e) => set('customerEmail', e.target.value)} placeholder="owner@shop.com" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} placeholder="98765 43210" />
          </div>

          <div>
            <label className="label">Plan</label>
            <select className="input" value={form.planType} onChange={(e) => set('planType', e.target.value)}>
              <option value="TRIAL">Trial</option>
              <option value="STANDARD">Standard</option>
              <option value="PRO">Pro</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </div>

          <div>
            <label className="label">Quantity (bulk keys)</label>
            <input className="input" type="number" min={1} max={200} value={form.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />
          </div>

          <div className="col-span-2 border-t border-gray-100 pt-4 mt-1">
            <label className="label">Validity</label>
            <div className="flex gap-2">
              <select className="input !w-36" value={form.durationType} onChange={(e) => set('durationType', e.target.value)}>
                <option value="DAYS">Days</option>
                <option value="MONTHS">Months</option>
                <option value="YEARS">Years</option>
                <option value="LIFETIME">Lifetime</option>
              </select>
              {form.durationType !== 'LIFETIME' && (
                <input className="input" type="number" min={1} max={500} value={form.durationCount} onChange={(e) => set('durationCount', Number(e.target.value))} />
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">For day/month/year plans the clock starts when the customer first activates the key.</p>
          </div>

          <div className="col-span-2 border-t border-gray-100 pt-4 mt-1">
            <label className="label">Machine binding</label>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={form.bindingMode === 'locked'} onChange={() => set('bindingMode', 'locked')} />
                Lock to machine ID
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={form.bindingMode === 'open'} onChange={() => set('bindingMode', 'open')} />
                Any machine (key works on first N PCs)
              </label>
            </div>
            {form.bindingMode === 'locked' ? (
              <input
                className="input font-mono"
                value={form.machineBinding}
                onChange={(e) => set('machineBinding', e.target.value)}
                placeholder="Machine ID from the customer’s activation screen (64 hex chars)"
              />
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">Number of machines (seats):</span>
                <input className="input !w-24" type="number" min={1} max={100} value={form.maxActivations} onChange={(e) => set('maxActivations', Number(e.target.value))} />
              </div>
            )}
          </div>

          <div className="col-span-2">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Payment ref, sales person…" />
          </div>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-4">{error}</div>}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-accent" disabled={saving}>{saving ? 'Creating…' : 'Create subscription'}</button>
        </div>
      </form>
    </div>
  );
}

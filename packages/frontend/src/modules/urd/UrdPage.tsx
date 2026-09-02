import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Search, Plus, Gem, Eye, Pencil, X, Wallet, ArrowUpRight, BadgeIndianRupee, Recycle } from 'lucide-react';

/** Net Weight = Weight (gross) − Stone Weight. */
const calcNet = (gross: number, stone: number) =>
  Math.round(Math.max(0, (Number(gross) || 0) - (Number(stone) || 0)) * 1000) / 1000;
const grams3 = (v: any) => String(Math.round((Number(v) || 0) * 1000) / 1000);

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'badge-success',
  PROPOSED: 'badge-warning',
  ADJUSTED: 'badge-info',
  SETTLED: 'badge-gray',
  SOLD: 'badge-gray',
};

const STATUS_HELP: Record<string, string> = {
  ACTIVE: 'Old gold received — metal is in the material ledger, value is owed to the customer',
  PROPOSED: 'Proposed on an estimate — nothing is posted until the bill is confirmed',
  ADJUSTED: 'Value adjusted against a bill',
  SETTLED: 'Customer has been paid in full',
  SOLD: 'Old gold sold / melted out',
};

export default function UrdPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [acting, setActing] = useState<{ mode: 'settle' | 'sell' | 'adjust'; row: any } | null>(null);
  const [actionForm, setActionForm] = useState<any>({ amount: 0, paymentMode: 'CASH', accountId: '', reference: '', notes: '' });
  const [form, setForm] = useState({ customerId: '', customerName: '', metalType: 'GOLD', purity: '22K', grossWeight: 0, stoneWeight: 0, netWeight: 0, rate: 0, deduction: 0, meltingLoss: 0, notes: '' });

  // Ctrl/Cmd+A → new URD
  useAppShortcut('app:add', () => {
    setEditingId(null);
    setForm({ customerId: '', customerName: '', metalType: 'GOLD', purity: '22K', grossWeight: 0, stoneWeight: 0, netWeight: 0, rate: 0, deduction: 0, meltingLoss: 0, notes: '' });
    setShowForm(true);
  });

  const { data } = useQuery({ queryKey: ['urd', search, status, page], queryFn: () => api.getUrdTransactions({ search, status, page, limit: 20 }) });
  const { data: stats }: any = useQuery({ queryKey: ['urd-stats'], queryFn: () => api.getUrdStats() });
  const { data: settings }: any = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });
  const { data: customers }: any = useQuery({ queryKey: ['customers', 'urd-picker', search], queryFn: () => api.getCustomers({ search: search || undefined, limit: 50 }), enabled: showForm, staleTime: 30000 });
  const { data: accounts }: any = useQuery({
    queryKey: ['accounts', 'cash-bank'],
    queryFn: () => api.getAccounts({ type: 'ALL' }),
    staleTime: 60000,
  });
  const accountRows: any[] = Array.isArray(accounts) ? accounts : (accounts?.accounts || accounts?.items || []);
  const cashAccounts = accountRows.filter((a: any) => a.isActive !== false && ['CASH', 'BANK'].includes(a.type));
  const { data: openBills }: any = useQuery({
    queryKey: ['sales', 'urd-adjust', acting?.row?.customerId],
    queryFn: () => api.getSales({ customerId: acting?.row?.customerId, unpaid: 'true', limit: 50 }),
    enabled: !!acting && acting.mode === 'adjust' && !!acting.row?.customerId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['urd'] });
    qc.invalidateQueries({ queryKey: ['urd-stats'] });
    qc.invalidateQueries({ queryKey: ['accounts'] });
    qc.invalidateQueries({ queryKey: ['entries'] });
  };

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createUrd(b),
    onSuccess: () => { toast.success('Old gold received — added to the metal ledger & customer ledger'); invalidate(); setShowForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.updateUrd(id, body),
    onSuccess: () => {
      toast.success('URD transaction updated!');
      invalidate();
      setShowForm(false);
      setEditingId(null);
      setViewing(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const actMutation = useMutation({
    mutationFn: ({ id, mode, body }: { id: string; mode: 'settle' | 'sell' | 'adjust'; body: any }) =>
      mode === 'settle' ? api.settleUrd(id, body) : mode === 'sell' ? api.sellUrd(id, body) : api.adjustUrd(id, body),
    onSuccess: (_d, v) => {
      toast.success(
        v.mode === 'settle'
          ? 'Payment to the customer recorded'
          : v.mode === 'sell'
            ? 'Old gold sold out — metal removed, money received'
            : 'Adjusted against the bill — customer credit cleared',
      );
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      invalidate();
      setActing(null);
      setViewing(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const openView = async (id: string) => {
    try {
      const t = await api.getUrd(id);
      setViewing(t);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Could not load transaction');
    }
  };

  const openEdit = async (u: any) => {
    try {
      const t = await api.getUrd(u.id);
      setForm({
        customerId: t.customerId || '',
        customerName: t.customerName || '',
        metalType: t.metalType || 'GOLD',
        purity: t.purity || '22K',
        grossWeight: t.grossWeight || 0,
        stoneWeight: t.stoneWeight || 0,
        netWeight: t.netWeight || 0,
        rate: t.rate || 0,
        deduction: t.deduction || 0,
        meltingLoss: t.meltingLoss || 0,
        notes: t.notes || '',
      });
      setEditingId(t.id);
      setShowForm(true);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Could not load transaction');
    }
  };

  const openAction = (mode: 'settle' | 'sell' | 'adjust', row: any) => {
    const outstanding = Math.max(0, Number(row.finalValue || 0) - Number(row.settledAmount || 0));
    if (mode === 'adjust' && !row.customerId) {
      toast.error('Link this exchange to a customer first (edit it) to adjust it against a bill');
      return;
    }
    setActionForm({ amount: mode === 'sell' ? Number(row.finalValue || 0) : outstanding, saleId: '', paymentMode: row.paymentMode || 'CASH', accountId: cashAccounts[0]?.id || '', reference: '', notes: '' });
    setActing({ mode, row });
  };

  const grossValue = form.netWeight * form.rate;
  const netValue = grossValue - (form.deduction || 0);
  const finalValue = netValue * (1 - (form.meltingLoss || 0) / 100);

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN');

  const filters = ['ALL', 'ACTIVE', 'PROPOSED', 'ADJUSTED', 'SETTLED', 'SOLD'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">URD Exchange</h1>
          <p className="text-gray-500 text-sm mt-1">
            Old gold / silver taken from a customer → metal ledger + customer ledger, then adjusted in a bill, paid out or sold.
          </p>
        </div>
        <button onClick={() => { setEditingId(null); setForm({ customerId: '', customerName: '', metalType: 'GOLD', purity: '22K', grossWeight: 0, stoneWeight: 0, netWeight: 0, rate: 0, deduction: 0, meltingLoss: 0, notes: '' }); setShowForm(true); }} className="btn-primary self-start">
          <Plus className="w-4 h-4" /> Receive Old Gold
        </button>
      </div>

      {/* Where the metal and the money are right now */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-3 sm:p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Old metal received</p>
          <p className="text-lg sm:text-xl font-bold mt-1">{grams3(stats?.grams || 0)} g</p>
          <p className="text-[11px] text-gray-400 mt-0.5">credited to the metal ledger</p>
        </div>
        <div className="card p-3 sm:p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Value of old metal</p>
          <p className="text-lg sm:text-xl font-bold mt-1">{fm(stats?.value || 0)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">across {stats?.total || 0} exchanges</p>
        </div>
        <div className="card p-3 sm:p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Paid to customers</p>
          <p className="text-lg sm:text-xl font-bold mt-1">{fm(stats?.settled || 0)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">out of cash / bank</p>
        </div>
        <div className="card p-3 sm:p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Still payable</p>
          <p className="text-lg sm:text-xl font-bold mt-1 text-amber-600">{fm(stats?.payableToCustomers || 0)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{stats?.active || 0} exchanges pending</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => { setStatus(f); setPage(1); }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${status === f ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative sm:max-w-xs sm:w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search URD number or customer..." className="input-field pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="table-wrap">
          <table className="w-full min-w-[900px]">
            <thead><tr className="border-b bg-gray-50">
              <th className="table-header">URD No.</th><th className="table-header">Customer</th><th className="table-header">Metal</th>
              <th className="table-header text-right">Gross</th><th className="table-header text-right">Net</th><th className="table-header text-right">Rate</th>
              <th className="table-header text-right">Value</th><th className="table-header text-right">Paid</th><th className="table-header">Status</th>
              <th className="table-header text-right">Actions</th>
            </tr></thead>
            <tbody>
              {data?.items?.map((u: any) => {
                const outstanding = Math.max(0, Number(u.finalValue || 0) - Number(u.settledAmount || 0));
                const canAct = u.status === 'ACTIVE';
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-medium whitespace-nowrap">{u.urdNumber}</td>
                    <td className="table-cell">{u.customerName}</td>
                    <td className="table-cell whitespace-nowrap">{u.metalType} {u.purity}</td>
                    <td className="table-cell text-right">{u.grossWeight.toFixed(3)}</td>
                    <td className="table-cell text-right">{u.netWeight.toFixed(3)}</td>
                    <td className="table-cell text-right">{fm(u.rate)}</td>
                    <td className="table-cell text-right">{fm(u.value)}</td>
                    <td className="table-cell text-right whitespace-nowrap">
                      <span className="font-medium">{fm(u.settledAmount || 0)}</span>
                      {u.status === 'ACTIVE' && outstanding > 0 && <span className="block text-[10px] text-amber-600">{fm(outstanding)} due</span>}
                    </td>
                    <td className="table-cell"><span className={'badge ' + (STATUS_STYLE[u.status] || 'badge-gray')} title={STATUS_HELP[u.status]}>{u.status}</span></td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openView(u.id)} className="btn-ghost p-1.5 text-primary-600" title="View"><Eye className="w-4 h-4" /></button>
                        {canAct && (
                          <>
                            <button onClick={() => openAction('adjust', u)} className="btn-ghost p-1.5 text-blue-600" title="Adjust against a bill"><BadgeIndianRupee className="w-4 h-4" /></button>
                            <button onClick={() => openAction('settle', u)} className="btn-ghost p-1.5 text-green-600" title="Pay the customer"><Wallet className="w-4 h-4" /></button>
                            <button onClick={() => openAction('sell', u)} className="btn-ghost p-1.5 text-orange-600" title="Sell / melt the old gold out"><ArrowUpRight className="w-4 h-4" /></button>
                          </>
                        )}
                        <button onClick={() => openEdit(u)} className="btn-ghost p-1.5 text-amber-600" title="Edit"><Pencil className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!data?.items || data.items.length === 0) && <tr><td colSpan={10} className="text-center py-12 text-gray-400">No URD exchanges</td></tr>}
            </tbody>
          </table>
        </div>
        {data && data.totalPages > 1 && (
          <div className="flex justify-between px-4 py-3 border-t">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm py-1">Prev</button>
            <span className="text-sm text-gray-500">{page}/{data.totalPages}</span>
            <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm py-1">Next</button>
          </div>
        )}
      </div>

      {/* Receive / edit old gold */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4 sm:p-6 modal-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{editingId ? 'Edit URD / Old Metal Transaction' : 'Receive Old Gold / Silver'}</h3>
                <p className="text-xs text-gray-500 mt-0.5">The metal is credited to the material ledger and the value to the customer ledger.</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Customer * <span className="text-gray-400 font-normal">(credited in their ledger)</span></label>
                <input
                  className="input-field"
                  list="urd-customer-list"
                  placeholder="Type a name…"
                  value={form.customerName}
                  onChange={e => {
                    const name = e.target.value;
                    const match = (customers?.items || customers?.customers || []).find((c: any) => c.name === name);
                    setForm({ ...form, customerName: name, customerId: match?.id || '' });
                  }}
                  onBlur={() => {
                    const match = (customers?.items || customers?.customers || []).find((c: any) => c.name?.toLowerCase() === form.customerName?.toLowerCase());
                    if (match) setForm(f => ({ ...f, customerId: match.id }));
                  }}
                />
                <datalist id="urd-customer-list">
                  {(customers?.items || customers?.customers || []).map((c: any) => <option key={c.id} value={c.name}>{c.mobile || ''}</option>)}
                </datalist>
                {form.customerId
                  ? <p className="text-[10px] text-green-600 mt-0.5">Linked to the customer ledger</p>
                  : <p className="text-[10px] text-amber-600 mt-0.5">Name only — no customer ledger entry</p>}
              </div>
              <div><label className="label">Metal</label><select className="input-field" value={form.metalType} onChange={e => setForm({ ...form, metalType: e.target.value })}>{(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></div>
              <div><label className="label">Purity</label><select className="input-field" value={form.purity} onChange={e => setForm({ ...form, purity: e.target.value })}>{(settings?.allPurities || ['24K', '22K', '18K', 'SILVER_999', 'SILVER_925']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}</select></div>
              <div><label className="label">Gross Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.grossWeight || ''} onChange={e => { const grossWeight = Number(e.target.value); setForm({ ...form, grossWeight, netWeight: calcNet(grossWeight, form.stoneWeight) }); }} /></div>
              <div><label className="label">Stone Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.stoneWeight || ''} onChange={e => { const stoneWeight = Number(e.target.value); setForm({ ...form, stoneWeight, netWeight: calcNet(form.grossWeight, stoneWeight) }); }} /></div>
              <div><label className="label">Net Weight (g) * <span className="text-gray-400">auto</span></label><input type="number" step="0.001" className="input-field bg-gray-100" value={form.netWeight || ''} readOnly title="Net Weight = Gross Weight − Stone Weight" /><p className="text-[10px] text-gray-400 mt-0.5">Gross − stone</p></div>
              <div><label className="label">Rate (₹/g) *</label><input type="number" className="input-field" value={form.rate || ''} onChange={e => setForm({ ...form, rate: Number(e.target.value) })} /></div>
              <div><label className="label">Deduction (₹)</label><input type="number" className="input-field" value={form.deduction || ''} onChange={e => setForm({ ...form, deduction: Number(e.target.value) })} /></div>
              <div><label className="label">Melting Loss (%)</label><input type="number" step="0.1" className="input-field" value={form.meltingLoss || ''} onChange={e => setForm({ ...form, meltingLoss: Number(e.target.value) })} /></div>
              <div className="col-span-2"><label className="label">Notes</label><input className="input-field" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>

            {form.netWeight > 0 && form.rate > 0 && (
              <div className="mt-4 p-4 bg-gray-50 rounded-xl space-y-2 text-sm">
                <div className="flex justify-between"><span>Gross Value</span><span className="font-medium">{fm(grossValue)}</span></div>
                <div className="flex justify-between"><span>Deduction</span><span className="text-red-600">-{fm(form.deduction || 0)}</span></div>
                <div className="flex justify-between"><span>Melting Loss</span><span className="text-red-600">-{fm(form.meltingLoss || 0)}%</span></div>
                <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Final Value</span><span>{fm(finalValue)}</span></div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!form.customerName || !form.netWeight || !form.rate) { toast.error('Fill required fields'); return; }
                if (editingId) updateMutation.mutate({ id: editingId, body: form });
                else createMutation.mutate(form);
              }} disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary"><Gem className="w-4 h-4" /> {editingId ? 'Update URD' : 'Receive Old Gold'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Pay the customer / sell the old gold out */}
      {acting && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setActing(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-4 sm:p-6 modal-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {acting.mode === 'settle'
                  ? <><Wallet className="w-5 h-5 text-green-600" /> Pay the customer</>
                  : acting.mode === 'sell'
                    ? <><Recycle className="w-5 h-5 text-orange-600" /> Sell / melt out</>
                    : <><BadgeIndianRupee className="w-5 h-5 text-blue-600" /> Adjust against a bill</>}
              </h3>
              <button onClick={() => setActing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {acting.mode === 'settle'
                ? `Clears ${acting.row.customerName}'s credit of ₹${Number(acting.row.finalValue || 0).toLocaleString('en-IN')} and takes the money out of cash / bank.`
                : acting.mode === 'sell'
                  ? 'Removes the metal from the material ledger and records the money received for it.'
                  : `Uses the old gold to pay ${acting.row.customerName}'s pending bill — no cash moves.`}
            </p>
            <div className="space-y-3">
              {acting.mode === 'adjust' && (
                <div>
                  <label className="label">Bill to adjust</label>
                  <select className="input-field" value={actionForm.saleId} onChange={e => setActionForm({ ...actionForm, saleId: e.target.value })}>
                    <option value="">Select a pending bill…</option>
                    {(openBills?.items || openBills?.sales || []).map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.billNumber} · ₹{Number(b.balanceAmount ?? b.netAmount).toLocaleString('en-IN')} due
                      </option>
                    ))}
                  </select>
                  {(!openBills?.items?.length && !openBills?.sales?.length) && (
                    <p className="text-[11px] text-amber-600 mt-0.5">This customer has no pending bill.</p>
                  )}
                </div>
              )}
              <div>
                <label className="label">Amount (₹)</label>
                <input type="number" className="input-field" value={actionForm.amount || ''} onChange={e => setActionForm({ ...actionForm, amount: Number(e.target.value) })} />
                {acting.mode === 'settle' && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Outstanding ₹{Math.max(0, Number(acting.row.finalValue || 0) - Number(acting.row.settledAmount || 0)).toLocaleString('en-IN')}
                  </p>
                )}
              </div>
              {acting.mode !== 'adjust' && (
                <>
                  <div>
                    <label className="label">From / to account</label>
                    <select className="input-field" value={actionForm.accountId} onChange={e => setActionForm({ ...actionForm, accountId: e.target.value })}>
                      <option value="">Default cash account</option>
                      {cashAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Payment mode</label>
                    <select className="input-field" value={actionForm.paymentMode} onChange={e => setActionForm({ ...actionForm, paymentMode: e.target.value })}>
                      {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'].map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Reference</label>
                    <input className="input-field" value={actionForm.reference} onChange={e => setActionForm({ ...actionForm, reference: e.target.value })} placeholder="UPI id / cheque no / voucher" />
                  </div>
                </>
              )}
              <div>
                <label className="label">Notes</label>
                <input className="input-field" value={actionForm.notes} onChange={e => setActionForm({ ...actionForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setActing(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => {
                  if (!(Number(actionForm.amount) > 0)) { toast.error('Enter an amount'); return; }
                  if (acting.mode === 'adjust' && !actionForm.saleId) { toast.error('Pick the bill to adjust'); return; }
                  actMutation.mutate({ id: acting.row.id, mode: acting.mode, body: actionForm });
                }}
                disabled={actMutation.isPending}
                className="btn-primary"
              >
                <BadgeIndianRupee className="w-4 h-4" /> {acting.mode === 'settle' ? 'Record payment' : acting.mode === 'sell' ? 'Record sale' : 'Adjust bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View URD Modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4 sm:p-6 modal-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">URD {viewing.urdNumber}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{STATUS_HELP[viewing.status] || ''}</p>
              </div>
              <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-gray-400">Customer</p><p className="font-medium">{viewing.customerName}</p></div>
              <div><p className="text-xs text-gray-400">Status</p><p className="font-medium"><span className={'badge ' + (STATUS_STYLE[viewing.status] || 'badge-gray')}>{viewing.status}</span></p></div>
              <div><p className="text-xs text-gray-400">Metal / Purity</p><p className="font-medium">{viewing.metalType} · {viewing.purity}</p></div>
              <div><p className="text-xs text-gray-400">Gross / Stone / Net</p><p className="font-medium">{viewing.grossWeight} · {viewing.stoneWeight || 0} · {viewing.netWeight} g</p></div>
              <div><p className="text-xs text-gray-400">Rate</p><p className="font-medium">{fm(viewing.rate)}/g</p></div>
              <div><p className="text-xs text-gray-400">Value</p><p className="font-medium">{fm(viewing.value)}</p></div>
              <div><p className="text-xs text-gray-400">Deduction</p><p className="font-medium">{fm(viewing.deduction || 0)}</p></div>
              <div><p className="text-xs text-gray-400">Melting Loss</p><p className="font-medium">{viewing.meltingLoss || 0}%</p></div>
              <div><p className="text-xs text-gray-400">Final Value</p><p className="font-bold text-green-700">{fm(viewing.finalValue)}</p></div>
              <div><p className="text-xs text-gray-400">Paid to customer</p><p className="font-bold">{fm(viewing.settledAmount || 0)}</p></div>
              {viewing.notes && <div className="col-span-2"><p className="text-xs text-gray-400">Notes</p><p className="font-medium">{viewing.notes}</p></div>}
            </div>

            {/* the data flow of this exchange */}
            <div className="mt-5 pt-4 border-t">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ledger movements</p>
              {(!viewing.movements || viewing.movements.length === 0) ? (
                <p className="text-xs text-gray-400">No ledger movements yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {viewing.movements.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2 gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{m.account?.name}</p>
                        <p className="text-gray-500 truncate">{m.description}</p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <p className={m.type === 'CREDIT' ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                          {m.type === 'CREDIT' ? '+' : '−'}{m.grams ? `${grams3(m.grams)} g` : fm(m.amount)}
                        </p>
                        {m.grams > 0 && m.amount > 0 && <p className="text-gray-500">{fm(m.amount)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 mt-6 pt-4 border-t">
              <button onClick={() => setViewing(null)} className="btn-secondary text-sm">Close</button>
              {viewing.status === 'ACTIVE' && (
                <>
                  <button onClick={() => openAction('adjust', viewing)} className="btn-secondary text-sm"><BadgeIndianRupee className="w-4 h-4" /> Adjust bill</button>
                  <button onClick={() => openAction('sell', viewing)} className="btn-secondary text-sm"><ArrowUpRight className="w-4 h-4" /> Sell out</button>
                  <button onClick={() => openAction('settle', viewing)} className="btn-secondary text-sm"><Wallet className="w-4 h-4" /> Pay customer</button>
                </>
              )}
              <button onClick={() => { setViewing(null); openEdit(viewing); }} className="btn-primary text-sm"><Pencil className="w-4 h-4" /> Edit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

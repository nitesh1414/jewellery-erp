import { confirmAction } from '../../components/ConfirmDialog';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { paymentAccounts } from '../../utils/accounts';
import { Plus, Trash2 } from 'lucide-react';

const SOURCES = ['Rent Received', 'Interest', 'Commission', 'Old Gold Scrap', 'Misc Income', 'Refund', 'Other'];

export default function IncomePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  // Ctrl/Cmd+A → add income
  useAppShortcut('app:add', () => {
    setForm({ source: 'Misc Income', amount: 0, accountId: '', description: '', date: new Date().toISOString().split('T')[0], receivedInMode: 'CASH', reference: '' });
    setShowForm(true);
  });
  const [form, setForm] = useState<any>({ source: 'Misc Income', amount: 0, accountId: '', description: '', date: new Date().toISOString().split('T')[0], receivedInMode: 'CASH', reference: '' });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<any>('/ledger/accounts') });
  const { data: incData, isLoading } = useQuery({ queryKey: ['income'], queryFn: () => api.get<any>('/ledger/income') });
  const createMut = useMutation({
    mutationFn: (b: any) => api.post('/ledger/income', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['income'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); setShowForm(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete('/ledger/income/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['income'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); },
  });

  const list: any[] = ((incData as any)?.items) || [];
  const accList = paymentAccounts(accounts);
  const total = list.reduce((s, i) => s + i.amount, 0);
  const fmtMoney = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  function submit() {
    if (!form.amount || form.amount <= 0) return;
    createMut.mutate(form);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Income (Non-Sale)</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-[13px]">
            <p className="text-gray-500">Total</p>
            <p className="font-bold text-green-700">+ {fmtMoney(total)}</p>
          </div>
          <button data-hotkey-add className="btn-primary" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Add Income</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="table-wrap">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Date</th><th className="table-header">Source</th><th className="table-header">Description</th>
            <th className="table-header">Account</th><th className="table-header text-right">Amount</th><th className="table-header"></th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading…</td></tr>}
            {!isLoading && list.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-gray-400">No income recorded</td></tr>}
            {list.map((i) => (
              <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell text-[13px]">{new Date(i.date).toLocaleDateString('en-IN')}</td>
                <td className="table-cell"><span className="badge-success">{i.source}</span></td>
                <td className="table-cell text-[13px] text-gray-700">{i.description || '—'}</td>
                <td className="table-cell text-[13px] text-gray-500">{i.receivedInMode || 'CASH'}</td>
                <td className="table-cell text-right font-semibold text-green-700">+ {fmtMoney(i.amount)}</td>
                <td className="table-cell text-right">
                  <button className="btn-ghost p-1 text-red-500" onClick={async () => { if (await confirmAction({ title: 'Delete this income entry?', danger: true, confirmLabel: 'Delete' })) deleteMut.mutate(i.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-3 sm:p-4 modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-3">New Income (Non-Sale)</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Date</label><input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div><label className="label">Amount (₹) *</label><input type="number" step="0.01" className="input-field" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} autoFocus /></div>
              </div>
              <div>
                <label className="label">Source</label>
                <select className="input-field" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Receipt Account</label>
                <select className="input-field" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                  <option value="">Auto-select primary</option>
                  {accList.map((a) => <option key={a.id} value={a.id}>{a.name} (bal: ₹{(a.currentBalance || 0).toLocaleString('en-IN')})</option>)}
                </select>
              </div>
              <div><label className="label">Description *</label><input className="input-field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Interest received from HDFC bank" /></div>
              <div><label className="label">Reference (optional)</label><input className="input-field" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="TFR # / Cheque #" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-3 pt-3 border-t">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button data-hotkey-save className="btn-primary" onClick={submit} disabled={!form.amount || !form.description}>Save Income</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

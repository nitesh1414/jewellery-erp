import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Plus, Trash2 } from 'lucide-react';

const CATEGORIES = ['Inventory', 'Salary', 'Rent', 'Utilities', 'Marketing', 'Maintenance', 'Office', 'Travel', 'Insurance', 'Tax', 'Misc'];

export default function ExpensesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ category: 'Misc', amount: 0, accountId: '', vendor: '', description: '', date: new Date().toISOString().split('T')[0], paymentMode: 'CASH', reference: '' });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<any>('/ledger/accounts') });
  const { data: expData, isLoading } = useQuery({ queryKey: ['expenses'], queryFn: () => api.get<any>('/ledger/expenses') });
  const createMut = useMutation({
    mutationFn: (b: any) => api.post('/ledger/expenses', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); setShowForm(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete('/ledger/expenses/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); },
  });

  const list: any[] = ((expData as any)?.items) || [];
  const accList: any[] = (accounts as any) || [];
  const total = list.reduce((s, e) => s + e.amount, 0);
  const fmtMoney = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  function submit() {
    if (!form.amount || form.amount <= 0) return;
    createMut.mutate(form);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="text-gray-500 text-sm mt-1">Track business expenses — auto-posts DEBIT to ledger</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <p className="text-gray-500">Total</p>
            <p className="font-bold text-red-600">− {fmtMoney(total)}</p>
          </div>
          <button className="btn-primary" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Add Expense</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Date</th><th className="table-header">Category</th><th className="table-header">Vendor</th>
            <th className="table-header">Description</th><th className="table-header">Account</th>
            <th className="table-header text-right">Amount</th><th className="table-header"></th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading…</td></tr>}
            {!isLoading && list.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-400">No expenses yet</td></tr>}
            {list.map((e) => (
              <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell text-sm">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                <td className="table-cell"><span className="badge-warning">{e.category}</span></td>
                <td className="table-cell text-sm">{e.vendor || '—'}</td>
                <td className="table-cell text-sm text-gray-700">{e.description || '—'}</td>
                <td className="table-cell text-sm text-gray-500">{e.paidFromMode || 'CASH'}</td>
                <td className="table-cell text-right font-semibold text-red-600">− {fmtMoney(e.amount)}</td>
                <td className="table-cell text-right">
                  <button className="btn-ghost p-1 text-red-500" onClick={() => confirm('Delete this expense? The ledger entry will be reversed.') && deleteMut.mutate(e.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">New Expense</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Date</label><input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div><label className="label">Amount (₹) *</label><input type="number" step="0.01" className="input-field" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} autoFocus /></div>
              </div>
              <div>
                <label className="label">Category</label>
                <select className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="label">Vendor / Paid To</label><input className="input-field" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="HDFC Electricity / Reliance" /></div>
              <div>
                <label className="label">From Account</label>
                <select className="input-field" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                  <option value="">Auto-select primary</option>
                  {accList.map((a) => <option key={a.id} value={a.id}>{a.name} (bal: ₹{(a.currentBalance || 0).toLocaleString('en-IN')})</option>)}
                </select>
              </div>
              <div><label className="label">Description *</label><input className="input-field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Rent for Oct 2026" /></div>
              <div><label className="label">Reference (optional)</label><input className="input-field" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Bill # / Cheque #" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-primary" onClick={submit} disabled={!form.amount || !form.description}>Save Expense</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

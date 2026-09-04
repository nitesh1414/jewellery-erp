import { confirmAction } from '../../components/ConfirmDialog';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Plus, ArrowDownCircle, ArrowUpCircle, Trash2 } from 'lucide-react';

export default function EntriesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [form, setForm] = useState<any>({ accountId: '', type: 'CREDIT', amount: 0, grams: 0, date: new Date().toISOString().split('T')[0], description: '', reference: '' });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<any>('/ledger/accounts') });
  const { data: entriesData, isLoading } = useQuery({
    queryKey: ['entries', accountId],
    queryFn: () => api.get<any>('/ledger/entries' + (accountId ? '?accountId=' + accountId : '')),
  });

  const createMut = useMutation({
    mutationFn: (b: any) => api.post('/ledger/entries', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entries'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); setShowForm(false); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete('/ledger/entries/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entries'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); },
  });

  const list: any[] = ((entriesData as any)?.items) || [];
  const accList: any[] = Array.isArray(accounts) ? (accounts as any[]) : [];
  const selectedAccount = accList.find((a: any) => a.id === form.accountId);
  const isMetal = selectedAccount?.type === 'METAL';

  function submit() {
    if (!form.accountId) return;
    if (!form.amount && !(isMetal && form.grams)) return;
    const body: any = { ...form };
    if (!isMetal) delete body.grams;
    createMut.mutate(body);
  }

  const fmtMoney = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const totalCredit = list.filter((e) => e.type === 'CREDIT').reduce((s, e) => s + e.amount, 0);
  const totalDebit = list.filter((e) => e.type === 'DEBIT').reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Credit / Debit Entries</h1>
        </div>
        <button data-hotkey-add className="btn-primary" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> New Entry</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card">
          <p className="text-xs text-gray-500">Total Credits (in)</p>
          <p className="text-xl font-bold text-green-700 mt-1">+ {fmtMoney(totalCredit)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">Total Debits (out)</p>
          <p className="text-xl font-bold text-red-700 mt-1">− {fmtMoney(totalDebit)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">Net (Credit − Debit)</p>
          <p className={'text-xl font-bold mt-1 ' + (totalCredit >= totalDebit ? 'text-gray-900' : 'text-red-600')}>{fmtMoney(totalCredit - totalDebit)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <select className="input-field w-72" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">All accounts</option>
          {accList.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="table-wrap">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Date</th><th className="table-header">Account</th><th className="table-header">Description</th>
            <th className="table-header text-right">Type</th><th className="table-header text-right">Amount</th><th className="table-header text-right">Weight (g)</th><th className="table-header">Ref</th><th className="table-header"></th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading…</td></tr>}
            {!isLoading && list.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-gray-400">No entries yet</td></tr>}
            {list.map((e) => (
              <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell text-[13px]">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                <td className="table-cell font-medium text-[13px]">{e.account?.name || '—'}</td>
                <td className="table-cell">
                  <p className="text-[13px]">{e.description || '—'}</p>
                </td>
                <td className="table-cell text-right">
                  <span className={'inline-flex items-center gap-1 text-xs font-semibold ' + (e.type === 'CREDIT' ? 'text-green-700' : 'text-red-700')}>
                    {e.type === 'CREDIT' ? <ArrowDownCircle className="w-3.5 h-3.5" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                    {e.type}
                  </span>
                </td>
                <td className={'table-cell text-right font-semibold ' + (e.type === 'CREDIT' ? 'text-green-700' : 'text-red-700')}>
                  {e.type === 'CREDIT' ? '+' : '−'} {fmtMoney(e.amount)}
                </td>
                <td className="table-cell text-right text-[13px]">{Number(e.grams) ? Number(e.grams).toFixed(3) : '—'}</td>
                <td className="table-cell text-xs text-gray-500">{e.reference || '—'}</td>
                <td className="table-cell text-right">
                  {e.linkedTo === 'ADJUSTMENT' && (
                    <button className="btn-ghost p-1 text-red-500" onClick={async () => { if (await confirmAction({ title: 'Delete this entry?', message: 'The account balance will be corrected automatically.', danger: true, confirmLabel: 'Delete' })) deleteMut.mutate(e.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
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
            <h3 className="text-base font-semibold mb-1">New Credit / Debit Entry</h3>
            <p className="text-xs text-gray-500 mb-3">Add to any account. Balance updates automatically.</p>
            <div className="space-y-3">
              <div>
                <label className="label">Account</label>
                <select className="input-field" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                  <option value="">Select account...</option>
                  {accList.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} (bal: ₹{(a.currentBalance || 0).toLocaleString('en-IN')})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  <button onClick={() => setForm({ ...form, type: 'CREDIT' })} className={'flex-1 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all ' + (form.type === 'CREDIT' ? 'bg-green-100 text-green-800' : 'text-gray-500')}>Credit (money in)</button>
                  <button onClick={() => setForm({ ...form, type: 'DEBIT' })} className={'flex-1 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all ' + (form.type === 'DEBIT' ? 'bg-red-100 text-red-800' : 'text-gray-500')}>Debit (money out)</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Amount (₹){isMetal ? '' : ' *'}</label>
                  <input type="number" step="0.01" className="input-field" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} autoFocus />
                </div>
                {isMetal ? (
                  <div>
                    <label className="label">Weight (g) *</label>
                    <input type="number" step="0.001" className="input-field" value={form.grams || ''} onChange={(e) => setForm({ ...form, grams: Number(e.target.value) })} placeholder="0.000" />
                  </div>
                ) : (
                  <div>
                    <label className="label">Date</label>
                    <input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                )}
              </div>
              {isMetal && (
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              )}
              {isMetal && (
                <p className="text-[11px] text-gray-400">
                  Metal ledger — the weight is {form.type === 'CREDIT' ? 'added to' : 'deducted from'} the stock of this
                  metal. Value is taken from the amount entered.
                </p>
              )}
              <div>
                <label className="label">Description *</label>
                <input className="input-field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Cash deposited / withdrawn from bank" />
              </div>
              <div>
                <label className="label">Reference (optional)</label>
                <input className="input-field" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-3 pt-3 border-t">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button data-hotkey-save className="btn-primary" onClick={submit} disabled={!form.accountId || !form.description || (!form.amount && !(isMetal && form.grams))}>
                {form.type === 'CREDIT' ? 'Credit' : 'Debit'} ₹{form.amount || 0}{isMetal && form.grams ? ` · ${form.grams} g` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

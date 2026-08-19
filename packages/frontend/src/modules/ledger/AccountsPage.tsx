import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Wallet, Plus, Edit2, Trash2, IndianRupee } from 'lucide-react';

export default function AccountsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', type: 'CASH', openingBalance: 0, accountNumber: '', bankName: '', ifscCode: '', notes: '' });

  const { data: accounts, isLoading } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<any>('/ledger/accounts') });
  const createMut = useMutation({
    mutationFn: (b: any) => api.post('/ledger/accounts', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setShowForm(false); resetForm(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: any) => api.put('/ledger/accounts/' + id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setEditing(null); resetForm(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete('/ledger/accounts/' + id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });

  function resetForm() {
    setForm({ name: '', type: 'CASH', openingBalance: 0, accountNumber: '', bankName: '', ifscCode: '', notes: '' });
    setEditing(null);
  }

  function openEdit(a: any) {
    setEditing(a);
    setForm({
      name: a.name, type: a.type, openingBalance: a.openingBalance,
      accountNumber: a.accountNumber || '', bankName: a.bankName || '',
      ifscCode: a.ifscCode || '', notes: a.notes || '',
    });
  }

  function submit() {
    if (!form.name) return;
    if (editing) updateMut.mutate({ id: editing.id, body: form });
    else createMut.mutate(form);
  }

  const fmtMoney = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const list: any[] = (accounts as any) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Ledger Accounts</h1>
          <p className="text-gray-500 text-sm mt-1">Cash, bank, wallet — one balance per account</p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <div className="col-span-full text-center py-12 text-gray-400">Loading…</div>}
        {!isLoading && list.length === 0 && (
          <div className="col-span-full card text-center py-12">
            <Wallet className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500">No accounts yet. Click "Add Account" or finish the setup wizard.</p>
          </div>
        )}
        {list.map((a) => (
          <div key={a.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary-600" />
                <div>
                  <p className="font-semibold">{a.name}</p>
                  <p className="text-xs text-gray-500">{a.type}{a.bankName ? ' • ' + a.bankName : ''}{a.accountNumber ? ' • A/C ' + a.accountNumber : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {a.isPrimary && <span className="badge bg-yellow-100 text-yellow-800 text-[10px]">PRIMARY</span>}
                <button className="btn-ghost p-1 text-primary-600" onClick={() => openEdit(a)}><Edit2 className="w-3.5 h-3.5" /></button>
                <button className="btn-ghost p-1 text-red-500" onClick={() => confirm('Delete account "' + a.name + '"?') && deleteMut.mutate(a.id)}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-gray-500">Current Balance</p>
              <p className={'text-2xl font-bold mt-1 ' + (a.currentBalance >= 0 ? 'text-green-700' : 'text-red-600')}>
                <IndianRupee className="inline w-4 h-4" /> {fmtMoney(a.currentBalance)}
              </p>
              {a.totals && (
                <div className="mt-2 flex gap-3 text-[11px] text-gray-500">
                  <span>Credits: <em className="text-green-600 not-italic font-semibold">{fmtMoney(a.totals.credits)}</em></span>
                  <span>Debits: <em className="text-red-600 not-italic font-semibold">{fmtMoney(a.totals.debits)}</em></span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">{editing ? 'Edit' : 'New'} Ledger Account</h3>
            <p className="text-xs text-gray-500 mb-4">Track money held in cash, bank, wallet or card-receivables.</p>
            <div className="space-y-3">
              <div>
                <label className="label">Account name</label>
                <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cash Counter / HDFC Bank / Petty Cash" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="CARD">Card</option><option value="WALLET">Wallet/UPI</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Opening Balance (₹)</label>
                  <input type="number" className="input-field" value={form.openingBalance || 0} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} />
                </div>
              </div>
              {form.type === 'BANK' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Bank name</label>
                    <input className="input-field" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">A/C no.</label>
                    <input className="input-field" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">IFSC</label>
                    <input className="input-field" value={form.ifscCode} onChange={(e) => setForm({ ...form, ifscCode: e.target.value })} />
                  </div>
                </div>
              )}
              <div>
                <label className="label">Notes (optional)</label>
                <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
              <button className="btn-primary" onClick={submit} disabled={!form.name}>{editing ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { confirmAction } from '../../components/ConfirmDialog';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Wallet, Plus, Edit2, Trash2, IndianRupee, Gem, Weight } from 'lucide-react';

const emptyForm = () => ({
  name: '', type: 'CASH', openingBalance: 0,
  metalType: 'GOLD', purity: '22K', openingGrams: 0,
  accountNumber: '', bankName: '', ifscCode: '', notes: '',
});

export default function AccountsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm());
  const [filter, setFilter] = useState<'ALL' | 'CASH_BANK' | 'METAL'>('ALL');
  const [valueEdited, setValueEdited] = useState(false);

  // Ctrl/Cmd+A → add account
  useAppShortcut('app:add', () => {
    setEditing(null);
    setForm(emptyForm());
    setValueEdited(false);
    setShowForm(true);
  });

  const { data: accounts, isLoading } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get<any>('/ledger/accounts') });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });
  const { data: rateMaster } = useQuery({ queryKey: ['rates'], queryFn: () => api.getRates(), staleTime: 300000 });

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
    setForm(emptyForm());
    setEditing(null);
    setValueEdited(false);
  }

  const isMetal = (form.type || '') === 'METAL';

  const getRateForPurity = (purity: string): number => {
    const rows: any[] = (rateMaster as any) || [];
    const exact = rows.find((r: any) => (r.purity || '').toUpperCase() === (purity || '').toUpperCase());
    return exact ? Number(exact.rate) || 0 : 0;
  };

  /** Opening value of a metal ledger = opening grams × today's rate. */
  const suggestedValue = (grams: number, purity: string) =>
    Math.round((Number(grams) || 0) * getRateForPurity(purity) * 100) / 100;

  function openEdit(a: any) {
    setEditing(a);
    setForm({
      name: a.name,
      type: a.type,
      openingBalance: a.openingBalance,
      metalType: a.metalType || 'GOLD',
      purity: a.purity || '22K',
      openingGrams: a.openingGrams ?? a.grams ?? 0,
      accountNumber: a.accountNumber || '',
      bankName: a.bankName || '',
      ifscCode: a.ifscCode || '',
      notes: a.notes || '',
    });
    setValueEdited(true); // keep the stored value when editing
    setShowForm(true);
  }

  function changePurity(purity: string) {
    const rate = getRateForPurity(purity);
    setForm((f: any) => ({
      ...f,
      purity,
      openingBalance: !valueEdited && rate ? suggestedValue(f.openingGrams, purity) : f.openingBalance,
    }));
  }

  function changeGrams(grams: number) {
    setForm((f: any) => ({
      ...f,
      openingGrams: grams,
      openingBalance: !valueEdited ? suggestedValue(grams, f.purity) : f.openingBalance,
    }));
  }

  function submit() {
    if (!form.name) return;
    const body: any = {
      name: form.name,
      type: form.type,
      openingBalance: Number(form.openingBalance) || 0,
      notes: form.notes,
    };
    if (isMetal) {
      body.metalType = form.metalType;
      body.purity = form.purity;
      body.openingGrams = Number(form.openingGrams) || 0;
    } else {
      body.accountNumber = form.accountNumber;
      body.bankName = form.bankName;
      body.ifscCode = form.ifscCode;
    }
    if (editing) updateMut.mutate({ id: editing.id, body });
    else createMut.mutate(body);
  }

  const fmtMoney = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const fmtGrams = (n: number) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' g';

  const all: any[] = (accounts as any) || [];
  const list = all.filter((a) => {
    if (filter === 'METAL') return a.type === 'METAL';
    if (filter === 'CASH_BANK') return a.type !== 'METAL';
    return true;
  });
  const metalAccounts = all.filter((a) => a.type === 'METAL');
  const totalGrams = metalAccounts.reduce((s, a) => s + (Number(a.grams) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Ledger Accounts</h1>
          <p className="text-gray-500 text-[13px] mt-1">Cash, bank, wallet — and metal/material ledgers stocked in grams</p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit max-w-full overflow-x-auto">
        {([['ALL', 'All'], ['CASH_BANK', 'Cash & Bank'], ['METAL', 'Metal / Material']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key as any)}
            className={'px-3 py-1.5 text-[13px] font-medium rounded-md transition-all ' + (filter === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
            {label}
          </button>
        ))}
      </div>

      {metalAccounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card bg-amber-50 border-amber-100">
            <p className="text-xs text-amber-700">Metal ledgers</p>
            <p className="text-xl font-bold text-amber-900 mt-1">{metalAccounts.length}</p>
          </div>
          <div className="card bg-amber-50 border-amber-100">
            <p className="text-xs text-amber-700">Total metal in stock</p>
            <p className="text-xl font-bold text-amber-900 mt-1">{fmtGrams(totalGrams)}</p>
          </div>
          <div className="card bg-amber-50 border-amber-100">
            <p className="text-xs text-amber-700">Stock value</p>
            <p className="text-xl font-bold text-amber-900 mt-1">
              {fmtMoney(metalAccounts.reduce((s, a) => s + (Number(a.currentBalance) || 0), 0))}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {isLoading && <div className="col-span-full text-center py-12 text-gray-400">Loading…</div>}
        {!isLoading && list.length === 0 && (
          <div className="col-span-full card text-center py-12">
            <Wallet className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500">
              {filter === 'METAL'
                ? 'No metal ledger yet. Click "Add Account", pick type Metal / Material and enter the opening stock in grams.'
                : 'No accounts yet. Click "Add Account" or finish the setup wizard.'}
            </p>
          </div>
        )}
        {list.map((a) => {
          const metal = a.type === 'METAL';
          return (
            <div key={a.id} className={'card ' + (metal ? 'border-amber-200 bg-amber-50/40' : '')}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {metal ? <Gem className="w-5 h-5 text-amber-600" /> : <Wallet className="w-5 h-5 text-primary-600" />}
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-xs text-gray-500">
                      {metal
                        ? `${a.metalType || '—'}${a.purity ? ' · ' + a.purity : ''}`
                        : `${a.type}${a.bankName ? ' • ' + a.bankName : ''}${a.accountNumber ? ' • A/C ' + a.accountNumber : ''}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {a.isPrimary && <span className="badge bg-yellow-100 text-yellow-800 text-[11px]">PRIMARY</span>}
                  <button className="btn-ghost p-1 text-primary-600" onClick={() => openEdit(a)}><Edit2 className="w-3.5 h-3.5" /></button>
                  <button className="btn-ghost p-1 text-red-500" onClick={async () => { if (await confirmAction({ title: 'Delete account “' + a.name + '”?', message: 'Only accounts with no entries can be deleted.', danger: true, confirmLabel: 'Delete' })) deleteMut.mutate(a.id); }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t">
                {metal ? (
                  <>
                    <p className="text-xs text-gray-500">Metal in stock</p>
                    <p className="text-xl font-bold mt-1 text-amber-800">{fmtGrams(a.grams)}</p>
                    <div className="mt-2 flex gap-3 text-[11px] text-gray-500">
                      <span>In: <em className="text-green-600 not-italic font-semibold">{fmtGrams(a.totals?.gramsIn || 0)}</em></span>
                      <span>Out: <em className="text-red-600 not-italic font-semibold">{fmtGrams(a.totals?.gramsOut || 0)}</em></span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Stock value <span className="font-semibold text-gray-700">{fmtMoney(a.currentBalance)}</span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">Current Balance</p>
                    <p className={'text-xl font-bold mt-1 ' + (a.currentBalance >= 0 ? 'text-green-700' : 'text-red-600')}>
                      <IndianRupee className="inline w-4 h-4" /> {fmtMoney(a.currentBalance)}
                    </p>
                    {a.totals && (
                      <div className="mt-2 flex gap-3 text-[11px] text-gray-500">
                        <span>Credits: <em className="text-green-600 not-italic font-semibold">{fmtMoney(a.totals.credits)}</em></span>
                        <span>Debits: <em className="text-red-600 not-italic font-semibold">{fmtMoney(a.totals.debits)}</em></span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-3" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-3 sm:p-6 max-h-[90vh] overflow-y-auto modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-3">{editing ? 'Edit' : 'New'} Ledger Account</h3>
            <p className="text-xs text-gray-500 mb-3">
              {isMetal
                ? 'A metal (material) ledger tracks stock in grams for one metal + purity — set its opening inventory below.'
                : 'Track money held in cash, bank, wallet or card-receivables.'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Account name</label>
                <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cash Counter / HDFC Bank / Gold 22K" />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank</option>
                  <option value="CARD">Card</option>
                  <option value="WALLET">Wallet/UPI</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="METAL">Metal / Material (grams)</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {isMetal ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Metal</label>
                      <select className="input-field" value={form.metalType} onChange={(e) => setForm({ ...form, metalType: e.target.value })}>
                        {(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Purity</label>
                      <select className="input-field" value={form.purity} onChange={(e) => changePurity(e.target.value)}>
                        {(settings?.allPurities || ['24K', '22K', '18K']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Opening stock (g)</label>
                      <input type="number" step="0.001" className="input-field" value={form.openingGrams || ''} onChange={(e) => changeGrams(Number(e.target.value))} placeholder="0.000" />
                    </div>
                    <div>
                      <label className="label">Opening value (₹)</label>
                      <input type="number" step="0.01" className="input-field" value={form.openingBalance || ''} onChange={(e) => { setValueEdited(true); setForm({ ...form, openingBalance: Number(e.target.value) }); }} />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 flex items-start gap-1">
                    <Weight className="w-3 h-3 mt-0.5 shrink-0" />
                    Opening value is auto-filled from today's rate
                    {getRateForPurity(form.purity) ? ` (₹${getRateForPurity(form.purity).toLocaleString('en-IN')}/g)` : ''} — type over it to change.
                  </p>
                </>
              ) : (
                <div>
                  <label className="label">Opening Balance (₹)</label>
                  <input type="number" className="input-field" value={form.openingBalance || 0} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} />
                </div>
              )}

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
            <div className="flex justify-end gap-3 mt-3 pt-3 border-t">
              <button className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
              <button className="btn-primary" onClick={submit} disabled={!form.name}>{editing ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

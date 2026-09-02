import { humanize } from '../../utils/format';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Search, Plus, CircleDollarSign, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function PaymentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerId: '', supplierId: '', amount: 0, paymentMode: 'CASH', accountId: '', reference: '', notes: '' });

  // Ctrl/Cmd+A → new payment
  useAppShortcut('app:add', () => { setForm({ customerId: '', supplierId: '', amount: 0, paymentMode: 'CASH', accountId: '', reference: '', notes: '' }); setShowForm(true); });

  const { data } = useQuery({ queryKey: ['payments', search, page], queryFn: () => api.getPayments({ search, page, limit: 20 }) });
  const { data: customers } = useQuery({ queryKey: ['customers-all'], queryFn: () => api.getCustomers({ limit: 100 }) });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.getAccounts(), staleTime: 60000 });
  const activeAccounts = ((accounts as any) || []).filter((a: any) => a.isActive !== false && !['INCOME', 'SALES', 'REVENUE'].includes(a.type));

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createPayment(b),
    onSuccess: () => { toast.success('Payment recorded!'); qc.invalidateQueries({ queryKey: ['payments'] }); setShowForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="page-title">Payments</h1><p className="text-gray-500 text-sm mt-1">Record and track all payments</p></div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Payment</button>
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search payment ref..." className="input-field pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="table-wrap">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Transaction ID</th><th className="table-header">Type</th><th className="table-header">Customer/Supplier</th>
            <th className="table-header text-right">Amount</th><th className="table-header">Mode</th><th className="table-header">Date</th><th className="table-header">Reference</th>
          </tr></thead>
          <tbody>
            {data?.items?.map((p: any) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell font-mono text-xs">{p.transactionId}</td>
                <td className="table-cell">
                  <span className="flex items-center gap-1">
                    {p.customerId ? <ArrowDownLeft className="w-3.5 h-3.5 text-green-500" /> : <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />}
                    {p.customerId ? 'Receipt' : 'Payment'}
                  </span>
                </td>
                <td className="table-cell">{p.customerId ? 'Customer' : p.supplierId ? 'Supplier' : '—'}</td>
                <td className="table-cell text-right font-medium">{fm(p.amount)}</td>
                <td className="table-cell"><span className="badge-info">{humanize(p.paymentMode)}</span></td>
                <td className="table-cell text-sm">{new Date(p.date).toLocaleDateString('en-IN')}</td>
                <td className="table-cell text-xs text-gray-400">{p.reference || '—'}</td>
              </tr>
            ))}
            {(!data?.items || data.items.length === 0) && <tr><td colSpan={7} className="text-center py-12 text-gray-400">No payments recorded</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-4 sm:p-6 modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
            <div className="space-y-4">
              <div><label className="label">Customer</label>
                <select className="input-field" value={form.customerId} onChange={e => setForm({...form, customerId: e.target.value, supplierId: '' })}>
                  <option value="">Select customer (or leave blank)</option>
                  {customers?.items?.map((c: any) => <option key={c.id} value={c.id}>{c.name} - {c.mobile}</option>)}
                </select></div>
              <div><label className="label">Amount (₹) *</label><input type="number" className="input-field" value={form.amount || ''} onChange={e => setForm({...form, amount: Number(e.target.value)})} /></div>
              <div><label className="label">Payment Mode</label>
                <select className="input-field" value={form.paymentMode} onChange={e => setForm({...form, paymentMode: e.target.value})}>
                  <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="DEBIT_CARD">Debit Card</option>
                  <option value="CREDIT_CARD">Credit Card</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CHEQUE">Cheque</option>
                </select></div>
              <div><label className="label">Received Into (Cash / Bank Ledger)</label>
                <select className="input-field" value={form.accountId} onChange={e => setForm({...form, accountId: e.target.value})}>
                  <option value="">— no ledger —</option>
                  {activeAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">The amount is credited to this account in the ledger.</p></div>
              <div><label className="label">Reference</label><input className="input-field" value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} placeholder="UPI ref / cheque no" /></div>
              <div><label className="label">Notes</label><input className="input-field" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => { if (!form.amount) { toast.error('Amount required'); return; } createMutation.mutate(form); }} disabled={createMutation.isPending} className="btn-primary"><CircleDollarSign className="w-4 h-4" /> Record Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { Search, Plus, Gem, ArrowUpRight } from 'lucide-react';

export default function UrdPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerName: '', metalType: 'GOLD', purity: '22K', grossWeight: 0, stoneWeight: 0, netWeight: 0, rate: 0, deduction: 0, meltingLoss: 0, notes: '' });

  const { data } = useQuery({ queryKey: ['urd', search, page], queryFn: () => api.getUrdTransactions({ search, page, limit: 20 }) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createUrd(b),
    onSuccess: () => { toast.success('URD transaction created!'); qc.invalidateQueries({ queryKey: ['urd'] }); setShowForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const grossValue = form.netWeight * form.rate;
  const netValue = grossValue - (form.deduction || 0);
  const finalValue = netValue * (1 - (form.meltingLoss || 0) / 100);

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">URD / Old Gold & Silver</h1><p className="text-gray-500 text-sm mt-1">Unregistered Dealer transactions & old metal valuation</p></div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> New URD</button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search URD number or customer..." className="input-field pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">URD No.</th><th className="table-header">Customer</th><th className="table-header">Metal</th><th className="table-header">Purity</th>
            <th className="table-header text-right">Gross</th><th className="table-header text-right">Net</th><th className="table-header text-right">Rate</th>
            <th className="table-header text-right">Value</th><th className="table-header text-right">Final</th><th className="table-header">Status</th>
          </tr></thead>
          <tbody>
            {data?.items?.map((u: any) => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell font-medium">{u.urdNumber}</td>
                <td className="table-cell">{u.customerName}</td>
                <td className="table-cell">{u.metalType}</td>
                <td className="table-cell">{u.purity}</td>
                <td className="table-cell text-right">{u.grossWeight.toFixed(3)}</td>
                <td className="table-cell text-right">{u.netWeight.toFixed(3)}</td>
                <td className="table-cell text-right">{fm(u.rate)}</td>
                <td className="table-cell text-right">{fm(u.value)}</td>
                <td className="table-cell text-right font-medium">{fm(u.finalValue)}</td>
                <td className="table-cell"><span className={'badge ' + (u.status === 'ACTIVE' ? 'badge-success' : 'badge-gray')}>{u.status}</span></td>
              </tr>
            ))}
            {(!data?.items || data.items.length === 0) && <tr><td colSpan={10} className="text-center py-12 text-gray-400">No URD transactions</td></tr>}
          </tbody>
        </table>
        {data && data.totalPages > 1 && (
          <div className="flex justify-between px-4 py-3 border-t">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm py-1">Prev</button>
            <span className="text-sm text-gray-500">{page}/{data.totalPages}</span>
            <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm py-1">Next</button>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">New URD / Old Metal Transaction</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Customer Name *</label><input className="input-field" value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} /></div>
              <div><label className="label">Metal</label><select className="input-field" value={form.metalType} onChange={e => setForm({...form, metalType: e.target.value})}>{(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></div>
              <div><label className="label">Purity</label><select className="input-field" value={form.purity} onChange={e => setForm({...form, purity: e.target.value})}>{(settings?.allPurities || ['24K', '22K', '18K', 'SILVER_999', 'SILVER_925']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}</select></div>
              <div><label className="label">Gross Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.grossWeight || ''} onChange={e => setForm({...form, grossWeight: Number(e.target.value)})} /></div>
              <div><label className="label">Stone Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.stoneWeight || ''} onChange={e => setForm({...form, stoneWeight: Number(e.target.value)})} /></div>
              <div><label className="label">Net Weight (g) *</label><input type="number" step="0.001" className="input-field" value={form.netWeight || ''} onChange={e => setForm({...form, netWeight: Number(e.target.value)})} /></div>
              <div><label className="label">Rate (₹/g) *</label><input type="number" className="input-field" value={form.rate || ''} onChange={e => setForm({...form, rate: Number(e.target.value)})} /></div>
              <div><label className="label">Deduction (₹)</label><input type="number" className="input-field" value={form.deduction || ''} onChange={e => setForm({...form, deduction: Number(e.target.value)})} /></div>
              <div><label className="label">Melting Loss (%)</label><input type="number" step="0.1" className="input-field" value={form.meltingLoss || ''} onChange={e => setForm({...form, meltingLoss: Number(e.target.value)})} /></div>
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
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!form.customerName || !form.netWeight || !form.rate) { toast.error('Fill required fields'); return; }
                createMutation.mutate(form);
              }} disabled={createMutation.isPending} className="btn-primary"><Gem className="w-4 h-4" /> Create URD</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

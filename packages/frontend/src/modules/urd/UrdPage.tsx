import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Search, Plus, Gem, ArrowUpRight, Eye, Pencil, X } from 'lucide-react';

/** Net Weight = Weight (gross) − Stone Weight. */
const calcNet = (gross: number, stone: number) =>
  Math.round(Math.max(0, (Number(gross) || 0) - (Number(stone) || 0)) * 1000) / 1000;

export default function UrdPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  // Ctrl/Cmd+A → new URD
  useAppShortcut('app:add', () => { setEditingId(null); setForm({ customerName: '', metalType: 'GOLD', purity: '22K', grossWeight: 0, stoneWeight: 0, netWeight: 0, rate: 0, deduction: 0, meltingLoss: 0, notes: '' }); setShowForm(true); });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [form, setForm] = useState({ customerName: '', metalType: 'GOLD', purity: '22K', grossWeight: 0, stoneWeight: 0, netWeight: 0, rate: 0, deduction: 0, meltingLoss: 0, notes: '' });

  const { data } = useQuery({ queryKey: ['urd', search, page], queryFn: () => api.getUrdTransactions({ search, page, limit: 20 }) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createUrd(b),
    onSuccess: () => { toast.success('URD transaction created!'); qc.invalidateQueries({ queryKey: ['urd'] }); setShowForm(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.updateUrd(id, body),
    onSuccess: () => {
      toast.success('URD transaction updated!');
      qc.invalidateQueries({ queryKey: ['urd'] });
      setShowForm(false);
      setEditingId(null);
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
            <th className="table-header text-right">Actions</th>
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
                <td className="table-cell text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openView(u.id)} className="btn-ghost p-1.5 text-primary-600" title="View"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => openEdit(u)} className="btn-ghost p-1.5 text-amber-600" title="Edit"><Pencil className="w-4 h-4" /></button>
                  </div>
                </td>
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
            <h3 className="text-lg font-semibold mb-4">{editingId ? 'Edit URD / Old Metal Transaction' : 'New URD / Old Metal Transaction'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Customer Name *</label><input className="input-field" value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} /></div>
              <div><label className="label">Metal</label><select className="input-field" value={form.metalType} onChange={e => setForm({...form, metalType: e.target.value})}>{(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></div>
              <div><label className="label">Purity</label><select className="input-field" value={form.purity} onChange={e => setForm({...form, purity: e.target.value})}>{(settings?.allPurities || ['24K', '22K', '18K', 'SILVER_999', 'SILVER_925']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}</select></div>
              <div><label className="label">Gross Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.grossWeight || ''} onChange={e => { const grossWeight = Number(e.target.value); setForm({...form, grossWeight, netWeight: calcNet(grossWeight, form.stoneWeight)}); }} /></div>
              <div><label className="label">Stone Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.stoneWeight || ''} onChange={e => { const stoneWeight = Number(e.target.value); setForm({...form, stoneWeight, netWeight: calcNet(form.grossWeight, stoneWeight)}); }} /></div>
              <div><label className="label">Net Weight (g) * <span className="text-gray-400">auto</span></label><input type="number" step="0.001" className="input-field bg-gray-100" value={form.netWeight || ''} readOnly title="Net Weight = Gross Weight − Stone Weight" /><p className="text-[10px] text-gray-400 mt-0.5">Gross − stone</p></div>
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
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!form.customerName || !form.netWeight || !form.rate) { toast.error('Fill required fields'); return; }
                if (editingId) updateMutation.mutate({ id: editingId, body: form });
                else createMutation.mutate(form);
              }} disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary"><Gem className="w-4 h-4" /> {editingId ? 'Update URD' : 'Create URD'}</button>
            </div>
          </div>
        </div>
      )}

      {/* View URD Modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold">URD {viewing.urdNumber}</h3>
              <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-gray-400">Customer</p><p className="font-medium">{viewing.customerName}</p></div>
              <div><p className="text-xs text-gray-400">Status</p><p className="font-medium">{viewing.status}</p></div>
              <div><p className="text-xs text-gray-400">Metal / Purity</p><p className="font-medium">{viewing.metalType} · {viewing.purity}</p></div>
              <div><p className="text-xs text-gray-400">Gross / Stone / Net</p><p className="font-medium">{viewing.grossWeight} · {viewing.stoneWeight || 0} · {viewing.netWeight} g</p></div>
              <div><p className="text-xs text-gray-400">Rate</p><p className="font-medium">{fm(viewing.rate)}/g</p></div>
              <div><p className="text-xs text-gray-400">Value</p><p className="font-medium">{fm(viewing.value)}</p></div>
              <div><p className="text-xs text-gray-400">Deduction</p><p className="font-medium">{fm(viewing.deduction || 0)}</p></div>
              <div><p className="text-xs text-gray-400">Melting Loss</p><p className="font-medium">{viewing.meltingLoss || 0}%</p></div>
              <div className="col-span-2"><p className="text-xs text-gray-400">Final Value</p><p className="font-bold text-green-700">{fm(viewing.finalValue)}</p></div>
              {viewing.notes && <div className="col-span-2"><p className="text-xs text-gray-400">Notes</p><p className="font-medium">{viewing.notes}</p></div>}
            </div>
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              <button onClick={() => { setViewing(null); openEdit(viewing); }} className="btn-secondary text-sm"><Pencil className="w-4 h-4" /> Edit</button>
              <button onClick={() => setViewing(null)} className="btn-primary text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Search, Plus, Truck, Phone, MapPin, ExternalLink } from 'lucide-react';

export default function SuppliersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);

  // Ctrl/Cmd+A → add supplier
  useAppShortcut('app:add', () => { setSelectedSupplier(null); setForm({ name: '', mobile: '', address: '', gstin: '', contact: '' }); setShowAdd(true); });
  const [form, setForm] = useState({ name: '', mobile: '', address: '', gstin: '', contact: '' });
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);

  const { data } = useQuery({ queryKey: ['suppliers', search, page], queryFn: () => api.getSuppliers({ search, page, limit: 20 }) });
  const { data: supplierDetail } = useQuery({
    queryKey: ['supplier', selectedSupplier?.id],
    queryFn: () => api.get('/suppliers/' + selectedSupplier.id),
    enabled: !!selectedSupplier,
  });

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createSupplier(b),
    onSuccess: () => { toast.success('Supplier created!'); qc.invalidateQueries({ queryKey: ['suppliers'] }); setShowAdd(false); setForm({ name: '', mobile: '', address: '', gstin: '', contact: '' }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="page-title">Suppliers</h1>
        <button data-hotkey-add onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Supplier</button>
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input data-search-input type="text" placeholder="Search suppliers..." className="input-field pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); setSelectedSupplier(null); }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {data?.items?.map((s: any) => (
              <div key={s.id} onClick={() => setSelectedSupplier(s)}
                className={'p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ' + (selectedSupplier?.id === s.id ? 'bg-primary-50 border-l-4 border-l-primary-500' : '')}>
                <p className="font-medium text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-500 mt-1">{s.mobile}</p>
              </div>
            ))}
            {(!data?.items || data.items.length === 0) && <p className="text-center py-8 text-gray-400">No suppliers</p>}
          </div>
          {data && data.totalPages > 1 && (
            <div className="flex justify-between items-center mt-3">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-[13px] py-1">Prev</button>
              <span className="text-[13px] text-gray-500">{page}/{data.totalPages}</span>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-[13px] py-1">Next</button>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {selectedSupplier ? (
            <div className="space-y-3">
              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selectedSupplier.name}</h2>
                    <div className="mt-2 space-y-1 text-[13px] text-gray-600">
                      {selectedSupplier.mobile && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{selectedSupplier.mobile}</p>}
                      {selectedSupplier.address && <p className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" />{selectedSupplier.address}</p>}
                      {selectedSupplier.gstin && <p className="text-xs text-gray-400">GST: {selectedSupplier.gstin}</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Ledger */}
              <div className="card">
                <h3 className="section-title mb-3">Ledger</h3>
                <div className="overflow-auto max-h-64">
                  <div className="table-wrap">
                  <table className="w-full text-[13px]">
                    <thead><tr className="border-b"><th className="text-left py-2 text-gray-500">Date</th><th className="text-left py-2 text-gray-500">Type</th><th className="text-right py-2 text-gray-500">Debit</th><th className="text-right py-2 text-gray-500">Credit</th><th className="text-right py-2 text-gray-500">Balance</th></tr></thead>
                    <tbody>
                      {supplierDetail?.ledgerEntries?.map((e: any) => (
                        <tr key={e.id} className="border-b border-gray-50">
                          <td className="py-2">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                          <td className="py-2">{e.transactionType}</td>
                          <td className="py-2 text-right text-red-600">{e.debit > 0 ? fm(e.debit) : '-'}</td>
                          <td className="py-2 text-right text-green-600">{e.credit > 0 ? fm(e.credit) : '-'}</td>
                          <td className="py-2 text-right font-medium">{fm(e.balance)}</td>
                        </tr>
                      ))}
                      {(!supplierDetail?.ledgerEntries || supplierDetail.ledgerEntries.length === 0) && (
                        <tr><td colSpan={5} className="py-8 text-center text-gray-400">No ledger entries</td></tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card flex items-center justify-center py-16 text-gray-400">
              <div className="text-center">
                <Truck className="w-12 h-12 mx-auto mb-3" />
                <p className="text-base font-medium">Select a supplier</p>
                <p className="text-[13px]">View details, ledger, and purchase history</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-3 sm:p-4 modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-3">Add Supplier</h3>
            <div className="space-y-3">
              <div><label className="label">Name *</label><input className="input-field" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div><label className="label">Mobile</label><input className="input-field" value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} /></div>
              <div><label className="label">Address</label><input className="input-field" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
              <div><label className="label">GSTIN</label><input className="input-field" value={form.gstin} onChange={e => setForm({...form, gstin: e.target.value})} /></div>
              <div><label className="label">Contact Person</label><input className="input-field" value={form.contact} onChange={e => setForm({...form, contact: e.target.value})} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-3 pt-3 border-t">
              <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => { if (!form.name) { toast.error('Name required'); return; } createMutation.mutate(form); }} data-hotkey-save disabled={createMutation.isPending} className="btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

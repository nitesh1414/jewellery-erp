import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Search, Truck, Trash2, Package } from 'lucide-react';

interface PurchaseItem {
  id: string;
  designCode: string;
  purity: string;
  grossWeight: number;
  netWeight: number;
  rate: number;
  quantity: number;
  makingChargeType: string;
  makingChargeValue: number;
}

export default function PurchasesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<any>({
    supplierId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().split('T')[0],
    metalType: 'GOLD', purity: '22K', rate: 0, paidAmount: 0, notes: '',
  });
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [itemForm, setItemForm] = useState<any>({
    id: '', designCode: '', purity: '22K', grossWeight: 0, stoneWeight: 0, netWeight: 0, rate: 0, quantity: 1,
    makingChargeType: 'PERCENTAGE', makingChargeValue: 10,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', search, page],
    queryFn: () => api.getPurchases({ search, page, limit: 20 }),
  });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers-all'], queryFn: () => api.getSuppliers({ limit: 100 }) });

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createPurchase(b),
    onSuccess: () => {
      toast.success('Purchase created! Items added to inventory with barcodes.');
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['jewellery'] });
      qc.invalidateQueries({ queryKey: ['inv-summary'] });
      setShowCreate(false);
      setItems([]);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  // Calculate purchase totals
  const totalItemsWeight = items.reduce((s, i) => s + (i.netWeight || 0), 0);
  const amount = totalItemsWeight * (form.rate || 0);
  const totalAmount = amount;

  const addItem = () => {
    if (!itemForm.designCode || !itemForm.netWeight) {
      toast.error('Fill design code and net weight');
      return;
    }
    setItems([...items, { ...itemForm, id: 'item-' + Date.now() }]);
    setItemForm({ id: '', designCode: '', purity: '22K', grossWeight: 0, stoneWeight: 0, netWeight: 0, rate: 0, quantity: 1, makingChargeType: 'PERCENTAGE', makingChargeValue: 10 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Purchases</h1><p className="text-gray-500 text-sm mt-1">Supplier purchases & material entry into inventory</p></div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Purchase</button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search by invoice number..." className="input-field pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Purchase List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Invoice No</th><th className="table-header">Supplier</th><th className="table-header">Date</th>
            <th className="table-header">Metal</th><th className="table-header text-right">Weight</th>
            <th className="table-header text-right">Amount</th><th className="table-header text-right">Paid</th><th className="table-header text-right">Balance</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading...</td></tr> :
             data?.items?.length === 0 ? <tr><td colSpan={8} className="text-center py-12 text-gray-400">No purchases found</td></tr> :
             data?.items?.map((p: any) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell font-medium">{p.invoiceNumber}</td>
                <td className="table-cell"><Truck className="w-3.5 h-3.5 inline mr-1 text-gray-400" />{p.supplier?.name || '—'}</td>
                <td className="table-cell text-sm">{new Date(p.invoiceDate).toLocaleDateString('en-IN')}</td>
                <td className="table-cell">{p.purity}</td>
                <td className="table-cell text-right font-medium">{p.netWeight?.toFixed(3)}g</td>
                <td className="table-cell text-right">{fm(p.totalAmount)}</td>
                <td className="table-cell text-right text-green-600">{fm(p.paidAmount)}</td>
                <td className="table-cell text-right text-red-600">{p.balanceAmount > 0 ? fm(p.balanceAmount) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-500">Page {page} of {data.totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm py-1">Prev</button>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm py-1">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Purchase Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">New Purchase — Material Entry</h3>

            {/* Purchase Header */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div><label className="label">Supplier *</label>
                <select className="input-field" value={form.supplierId} onChange={e => setForm({...form, supplierId: e.target.value})}>
                  <option value="">Select supplier...</option>
                  {suppliers?.items?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label className="label">Invoice Number *</label>
                <input className="input-field" value={form.invoiceNumber} onChange={e => setForm({...form, invoiceNumber: e.target.value})} placeholder="INV-2026-001" /></div>
              <div><label className="label">Invoice Date</label>
                <input type="date" className="input-field" value={form.invoiceDate} onChange={e => setForm({...form, invoiceDate: e.target.value})} /></div>
              <div><label className="label">Metal Type</label>
                <select className="input-field" value={form.metalType} onChange={e => setForm({...form, metalType: e.target.value})}>
                  <option value="GOLD">Gold</option><option value="SILVER">Silver</option>
                </select></div>
              <div><label className="label">Default Purity</label>
                <select className="input-field" value={form.purity} onChange={e => setForm({...form, purity: e.target.value})}>
                  <option value="24K">24K</option><option value="22K">22K</option><option value="18K">18K</option>
                  <option value="SILVER_999">Silver 999</option><option value="SILVER_925">Silver 925</option>
                </select></div>
              <div><label className="label">Default Rate/g (₹)</label>
                <input type="number" className="input-field" value={form.rate || ''} onChange={e => setForm({...form, rate: Number(e.target.value)})} /></div>
            </div>

            {/* Items */}
            <h4 className="font-medium text-gray-700 mb-3">Items (auto-generates barcodes + stock)</h4>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-6 gap-3">
                <div><label className="label">Design Code</label>
                  <input className="input-field text-xs" value={itemForm.designCode} onChange={e => setItemForm({...itemForm, designCode: e.target.value})} placeholder="RING-005" /></div>
                <div><label className="label">Purity</label>
                  <select className="input-field text-xs" value={itemForm.purity} onChange={e => setItemForm({...itemForm, purity: e.target.value})}>
                    <option value="24K">24K</option><option value="22K">22K</option><option value="18K">18K</option>
                  </select></div>
                <div><label className="label">Gross (g)</label>
                  <input type="number" step="0.001" className="input-field text-xs" value={itemForm.grossWeight || ''} onChange={e => setItemForm({...itemForm, grossWeight: Number(e.target.value)})} /></div>
                <div><label className="label">Stone (g)</label>
                  <input type="number" step="0.001" className="input-field text-xs" value={itemForm.stoneWeight || ''} onChange={e => setItemForm({...itemForm, stoneWeight: Number(e.target.value)})} placeholder="0" /></div>
                <div><label className="label">Net (g) *</label>
                  <input type="number" step="0.001" className="input-field text-xs" value={itemForm.netWeight || ''} onChange={e => setItemForm({...itemForm, netWeight: Number(e.target.value)})} /></div>
                <div><label className="label">Rate/g</label>
                  <input type="number" className="input-field text-xs" value={itemForm.rate || ''} onChange={e => setItemForm({...itemForm, rate: Number(e.target.value)})} /></div>
              </div>
              <button onClick={addItem} className="btn-secondary mt-3 text-xs"><Plus className="w-3 h-3" /> Add Item</button>
            </div>

            {items.length > 0 && (
              <div className="mb-4">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left py-2 text-gray-500">Design</th><th className="text-left py-2 text-gray-500">Purity</th><th className="text-right py-2 text-gray-500">Gross</th><th className="text-right py-2 text-gray-500">Net</th><th className="text-right py-2 text-gray-500">Rate</th><th className="text-right py-2 text-gray-500">Value</th><th></th></tr></thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={item.id} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{item.designCode}</td>
                        <td className="py-2">{item.purity}</td>
                        <td className="py-2 text-right">{item.grossWeight?.toFixed(3)}</td>
                        <td className="py-2 text-right">{item.netWeight?.toFixed(3)}</td>
                        <td className="py-2 text-right">{item.rate || form.rate}</td>
                        <td className="py-2 text-right">{(item.netWeight * (item.rate || form.rate)).toFixed(0)}</td>
                        <td className="py-2 text-right"><button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between items-center mt-3 p-3 bg-green-50 rounded-lg">
                  <span className="font-medium text-green-800">Total Weight: <strong>{totalItemsWeight.toFixed(3)} g</strong></span>
                  <span className="font-bold text-green-800">Total: {fm(totalAmount)}</span>
                </div>
              </div>
            )}

            {/* Payment */}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Paid Amount (₹)</label>
                <input type="number" className="input-field" value={form.paidAmount || ''} onChange={e => setForm({...form, paidAmount: Number(e.target.value)})} /></div>
              <div><label className="label">Notes</label>
                <input className="input-field" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!form.supplierId || !form.invoiceNumber) { toast.error('Supplier and invoice number required'); return; }
                if (items.length === 0 && (!form.rate || !totalItemsWeight)) { toast.error('Add items or enter metal details'); return; }
                createMutation.mutate({ ...form, items });
              }} disabled={createMutation.isPending} className="btn-primary">
                {createMutation.isPending ? 'Creating...' : 'Create Purchase & Add to Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
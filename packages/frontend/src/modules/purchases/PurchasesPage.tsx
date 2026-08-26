import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Plus, Search, Truck, Trash2, Package, Eye, Pencil, X } from 'lucide-react';

interface PurchaseItem {
  id: string;
  designCode: string;
  metalType: string;
  purity: string;
  category: string;
  subCategory: string;
  ornament: string;
  ornamentGender: string;
  hsnCode: string;
  grossWeight: number;
  stoneWeight: number;
  netWeight: number;
  rate: number;
  quantity: number;
  makingChargeType: string;
  makingChargeValue: number;
  hallmarkNumber: string;
  certificateNumber: string;
}

const emptyItem = (): PurchaseItem => ({
  id: 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
  designCode: '', metalType: 'GOLD', purity: '22K', category: '', subCategory: '',
  ornament: '', ornamentGender: '', hsnCode: '7113',
  grossWeight: 0, stoneWeight: 0, netWeight: 0, rate: 0, quantity: 1,
  makingChargeType: 'PERCENTAGE', makingChargeValue: 10,
  hallmarkNumber: '', certificateNumber: '',
});

export default function PurchasesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [form, setForm] = useState<any>({
    supplierId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().split('T')[0],
    paidAmount: 0, paymentMode: 'CASH', accountId: '', notes: '', location: '',
  });
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [itemForm, setItemForm] = useState<PurchaseItem>(emptyItem());

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', search, page],
    queryFn: () => api.getPurchases({ search, page, limit: 20 }),
  });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers-all'], queryFn: () => api.getSuppliers({ limit: 100 }) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });
  const { data: rateMaster } = useQuery({ queryKey: ['rates'], queryFn: () => api.getRates(), staleTime: 300000 });
  const { data: ornamentsData } = useQuery({ queryKey: ['ornaments-active'], queryFn: () => api.getOrnaments({ isActive: 'true' }), staleTime: 60000 });
  const hallmarkMaster: any[] = settings?.allHallmarks || [];
  // Rate for a purity from the DB rate schedule (used to auto-fill the item rate).
  const getRateForPurity = (purity: string): number => {
    const rows: any[] = (rateMaster as any) || [];
    const exact = rows.find((r: any) => (r.purity || '').toUpperCase() === (purity || '').toUpperCase());
    return exact ? Number(exact.rate) || 0 : 0;
  };
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.getAccounts(), staleTime: 60000 });
  const activeAccounts = ((accounts as any) || []).filter((a: any) => a.isActive !== false && !['INCOME', 'SALES', 'REVENUE'].includes(a.type));
  const ornaments = (ornamentsData?.items || []).map((o: any) => o);

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createPurchase(b),
    onSuccess: () => {
      toast.success('Purchase created! Items added to inventory with barcodes.');
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['jewellery'] });
      qc.invalidateQueries({ queryKey: ['inv-summary'] });
      resetForm();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.updatePurchase(id, body),
    onSuccess: () => {
      toast.success('Purchase updated!');
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['jewellery'] });
      resetForm();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const openView = async (id: string) => {
    try {
      const p = await api.getPurchase(id);
      setViewing(p);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Could not load purchase');
    }
  };

  const openEdit = async (p: any) => {
    try {
      const full = await api.getPurchase(p.id);
      setForm({
        supplierId: full.supplierId || '',
        invoiceNumber: full.invoiceNumber || '',
        invoiceDate: full.invoiceDate ? new Date(full.invoiceDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        paidAmount: full.paidAmount || 0,
        paymentMode: 'CASH',
        accountId: '',
        notes: full.notes || '',
        location: '',
      });
      setItems((full.items || []).map((i: any) => ({
        id: 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        designCode: i.designCode || '',
        metalType: i.metalType || 'GOLD',
        purity: i.purity || '22K',
        category: i.category || '',
        subCategory: i.subCategory || '',
        ornament: i.ornament || '',
        ornamentGender: i.ornamentGender || '',
        hsnCode: i.hsnCode || '7113',
        grossWeight: i.grossWeight || 0,
        stoneWeight: i.stoneWeight || 0,
        netWeight: i.netWeight || 0,
        rate: i.rate || 0,
        quantity: i.quantity || 1,
        makingChargeType: i.makingChargeType || 'PERCENTAGE',
        makingChargeValue: i.makingChargeValue || 10,
        hallmarkNumber: i.hallmarkNumber || '',
        certificateNumber: i.certificateNumber || '',
      })));
      setEditingId(full.id);
      setShowCreate(true);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Could not load purchase');
    }
  };

  const resetForm = () => {
    setShowCreate(false);
    setEditingId(null);
    setItems([]);
    setItemForm(emptyItem());
    setForm({ supplierId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().split('T')[0], paidAmount: 0, paymentMode: 'CASH', accountId: '', notes: '', location: '' });
  };

  // Ctrl/Cmd+A → new purchase
  useAppShortcut('app:add', () => { resetForm(); setShowCreate(true); });

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  // Item line value
  const itemValue = (i: any) => (i.netWeight || 0) * (i.rate || 0) + (i.makingCharges || 0) + (i.stoneCharges || 0) + (i.otherCharges || 0);
  const totalItemsWeight = items.reduce((s, i) => s + (i.netWeight || 0), 0);
  const totalItemsAmount = items.reduce((s, i) => s + itemValue(i), 0);
  const totalAmount = totalItemsAmount;
  const balanceAmount = Math.max(0, totalAmount - (form.paidAmount || 0));

  const addItem = () => {
    if (!itemForm.designCode || !itemForm.netWeight) {
      toast.error('Fill design code and net weight');
      return;
    }
    setItems([...items, { ...itemForm }]);
    setItemForm(emptyItem());
  };

  const updateLine = (idx: number, patch: any) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const save = () => {
    if (!form.supplierId) { toast.error('Select a supplier'); return; }
    if (items.length === 0) { toast.error('Add at least one item'); return; }
    const body = {
      ...form,
      items: items.map(({ id, ...rest }) => rest),
    };
    if (editingId) updateMutation.mutate({ id: editingId, body });
    else createMutation.mutate(body);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Purchases</h1><p className="text-gray-500 text-sm mt-1">Supplier purchases & material entry into inventory (multiple metals per bill)</p></div>
        <button onClick={() => { resetForm(); setShowCreate(true); }} className="btn-primary"><Plus className="w-4 h-4" /> New Purchase</button>
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
            <th className="table-header text-right">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading...</td></tr> :
             data?.items?.length === 0 ? <tr><td colSpan={9} className="text-center py-12 text-gray-400">No purchases found</td></tr> :
             data?.items?.map((p: any) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell font-medium">{p.invoiceNumber}</td>
                <td className="table-cell"><Truck className="w-3.5 h-3.5 inline mr-1 text-gray-400" />{p.supplier?.name || '—'}</td>
                <td className="table-cell text-sm">{new Date(p.invoiceDate).toLocaleDateString('en-IN')}</td>
                <td className="table-cell">{p.metalType}{p.purity && p.purity !== 'MIXED' ? ' · ' + p.purity : ''}{(p.items?.length || 0) > 1 ? ` (${p.items.length} items)` : ''}</td>
                <td className="table-cell text-right font-medium">{p.netWeight?.toFixed(3)}g</td>
                <td className="table-cell text-right">{fm(p.totalAmount)}</td>
                <td className="table-cell text-right text-green-600">{fm(p.paidAmount)}</td>
                <td className="table-cell text-right text-red-600">{p.balanceAmount > 0 ? fm(p.balanceAmount) : '—'}</td>
                <td className="table-cell text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openView(p.id)} className="btn-ghost p-1.5 text-primary-600" title="View"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => openEdit(p)} className="btn-ghost p-1.5 text-amber-600" title="Edit"><Pencil className="w-4 h-4" /></button>
                  </div>
                </td>
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

      {/* View Purchase Modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold">Purchase {viewing.invoiceNumber}</h3>
              <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
              <div><p className="text-xs text-gray-400">Supplier</p><p className="font-medium">{viewing.supplier?.name || '—'}</p></div>
              <div><p className="text-xs text-gray-400">Invoice Date</p><p className="font-medium">{new Date(viewing.invoiceDate).toLocaleDateString('en-IN')}</p></div>
              <div><p className="text-xs text-gray-400">Total</p><p className="font-medium">{fm(viewing.totalAmount)}</p></div>
              <div><p className="text-xs text-gray-400">Paid / Balance</p><p className="font-medium text-green-600">{fm(viewing.paidAmount)}</p><p className="text-red-600">{viewing.balanceAmount > 0 ? fm(viewing.balanceAmount) : 'Settled'}</p></div>
            </div>
            <div className="border rounded-xl overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b"><th className="text-left px-3 py-2 text-gray-500">Design</th><th className="text-left px-3 py-2 text-gray-500">Metal</th><th className="text-left px-3 py-2 text-gray-500">Purity</th><th className="text-right px-3 py-2 text-gray-500">Net</th><th className="text-right px-3 py-2 text-gray-500">Rate</th><th className="text-right px-3 py-2 text-gray-500">Value</th></tr></thead>
                <tbody>
                  {(viewing.items || []).map((i: any, idx: number) => (
                    <tr key={idx} className="border-b border-gray-50">
                      <td className="px-3 py-2 font-medium">{i.designCode}{i.ornament ? ` · ${i.ornament}` : ''}</td>
                      <td className="px-3 py-2">{i.metalType}</td>
                      <td className="px-3 py-2">{i.purity}</td>
                      <td className="px-3 py-2 text-right">{i.netWeight?.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right">{fm(i.rate)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fm((i.netWeight || 0) * (i.rate || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setViewing(null); openEdit(viewing); }} className="btn-secondary text-sm"><Pencil className="w-4 h-4" /> Edit</button>
              <button onClick={() => setViewing(null)} className="btn-primary text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Purchase Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 p-6 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingId ? 'Edit Purchase' : 'New Purchase'} — Material Entry (multiple metals)</h3>

            {/* Purchase Header */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="col-span-2"><label className="label">Supplier *</label>
                <select className="input-field" value={form.supplierId} onChange={e => setForm({...form, supplierId: e.target.value})}>
                  <option value="">Select supplier...</option>
                  {suppliers?.items?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label className="label">Supplier Invoice No. <span className="text-gray-400">(optional)</span></label>
                <input className="input-field" value={form.invoiceNumber} onChange={e => setForm({...form, invoiceNumber: e.target.value})} placeholder="INV-2026-001" /></div>
              <div><label className="label">Invoice Date</label>
                <input type="date" className="input-field" value={form.invoiceDate} onChange={e => setForm({...form, invoiceDate: e.target.value})} /></div>
              <div><label className="label">Storage Location</label>
                <input className="input-field" value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Showcase A1" /></div>
              <div><label className="label">Notes</label>
                <input className="input-field" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
            </div>

            {/* Item adder — same fields as inventory add */}
            <h4 className="font-medium text-gray-700 mb-3">Add Item (each item can have its own metal, purity & ornament)</h4>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><label className="label">Design Code *</label>
                  <input className="input-field text-xs" value={itemForm.designCode} onChange={e => setItemForm({...itemForm, designCode: e.target.value})} placeholder="RING-005" /></div>
                <div><label className="label">Metal Type *</label>
                  <select className="input-field text-xs" value={itemForm.metalType} onChange={e => setItemForm({...itemForm, metalType: e.target.value})}>
                    {(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select></div>
                <div><label className="label">Purity *</label>
                  <select className="input-field text-xs" value={itemForm.purity} onChange={e => { const purity = e.target.value; setItemForm({...itemForm, purity, rate: getRateForPurity(purity)}); }}>
                    {(settings?.allPurities || ['24K', '22K', '18K', 'SILVER_999', 'SILVER_925']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}
                  </select></div>
                <div><label className="label">HSN Code</label>
                  <input className="input-field text-xs" value={itemForm.hsnCode} onChange={e => setItemForm({...itemForm, hsnCode: e.target.value})} /></div>
                <div><label className="label">Category</label>
                  <input className="input-field text-xs" value={itemForm.category} onChange={e => setItemForm({...itemForm, category: e.target.value})} placeholder="Ring" /></div>
                <div><label className="label">Sub Category</label>
                  <input className="input-field text-xs" value={itemForm.subCategory} onChange={e => setItemForm({...itemForm, subCategory: e.target.value})} /></div>
                <div>
                  <label className="label">Ornament (master)</label>
                  <select className="input-field text-xs" value={itemForm.ornament} onChange={e => {
                    const o = ornaments.find((x: any) => x.name === e.target.value);
                    setItemForm({ ...itemForm, ornament: e.target.value, ornamentGender: o?.gender || '' });
                  }}>
                    <option value="">— none —</option>
                    {ornaments.map((o: any) => <option key={o.id} value={o.name}>{o.name} ({o.gender === 'MALE' ? 'Male' : o.gender === 'FEMALE' ? 'Female' : 'Unisex'})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Ornament For</label>
                  <select className="input-field text-xs" value={itemForm.ornamentGender} onChange={e => setItemForm({...itemForm, ornamentGender: e.target.value})}>
                    <option value="">—</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="UNISEX">Unisex</option>
                  </select>
                </div>
                <div><label className="label">Gross (g)</label>
                  <input type="number" step="0.001" className="input-field text-xs" value={itemForm.grossWeight || ''} onChange={e => setItemForm({...itemForm, grossWeight: Number(e.target.value)})} /></div>
                <div><label className="label">Stone (g)</label>
                  <input type="number" step="0.001" className="input-field text-xs" value={itemForm.stoneWeight || ''} onChange={e => setItemForm({...itemForm, stoneWeight: Number(e.target.value)})} /></div>
                <div><label className="label">Net (g) *</label>
                  <input type="number" step="0.001" className="input-field text-xs" value={itemForm.netWeight || ''} onChange={e => setItemForm({...itemForm, netWeight: Number(e.target.value)})} /></div>
                <div><label className="label">Rate/g (₹) *</label>
                  <input type="number" className="input-field text-xs" value={itemForm.rate || ''} onChange={e => setItemForm({...itemForm, rate: Number(e.target.value)})} /></div>
                <div><label className="label">Qty</label>
                  <input type="number" className="input-field text-xs" value={itemForm.quantity || 1} onChange={e => setItemForm({...itemForm, quantity: Number(e.target.value)})} /></div>
                <div><label className="label">Making Type</label>
                  <select className="input-field text-xs" value={itemForm.makingChargeType} onChange={e => setItemForm({...itemForm, makingChargeType: e.target.value})}>
                    <option value="PERCENTAGE">%</option><option value="PER_GRAM">/g</option><option value="FIXED_AMOUNT">Fixed</option>
                  </select></div>
                <div><label className="label">Making Value</label>
                  <input type="number" className="input-field text-xs" value={itemForm.makingChargeValue || ''} onChange={e => setItemForm({...itemForm, makingChargeValue: Number(e.target.value)})} /></div>
                <div><label className="label">Hallmark (from master)</label>
                  <select className="input-field text-xs" value="" onChange={e => {
                    const h = hallmarkMaster.find((x: any) => x.id === e.target.value);
                    if (h) setItemForm({ ...itemForm, purity: h.purity, hallmarkNumber: h.label, rate: getRateForPurity(h.purity) });
                  }}>
                    <option value="">— select —</option>
                    {hallmarkMaster.map((h: any) => <option key={h.id} value={h.id}>{h.label} ({h.purity} · ₹{h.charge})</option>)}
                  </select></div>
                <div><label className="label">Hallmark No.</label>
                  <input className="input-field text-xs" value={itemForm.hallmarkNumber} onChange={e => setItemForm({...itemForm, hallmarkNumber: e.target.value})} /></div>
                <div><label className="label">Certificate No.</label>
                  <input className="input-field text-xs" value={itemForm.certificateNumber} onChange={e => setItemForm({...itemForm, certificateNumber: e.target.value})} /></div>
              </div>
              <button onClick={addItem} className="btn-secondary mt-3 text-xs"><Plus className="w-3 h-3" /> Add Item to Purchase</button>
            </div>

            {items.length > 0 && (
              <div className="mb-4">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left py-2 text-gray-500">Design</th><th className="text-left py-2 text-gray-500">Metal</th><th className="text-left py-2 text-gray-500">Purity</th><th className="text-left py-2 text-gray-500">Ornament</th><th className="text-right py-2 text-gray-500">Gross</th><th className="text-right py-2 text-gray-500">Net</th><th className="text-right py-2 text-gray-500">Rate</th><th className="text-right py-2 text-gray-500">Value</th><th></th></tr></thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={item.id} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{item.designCode}</td>
                        <td className="py-2">{item.metalType}</td>
                        <td className="py-2">{item.purity}</td>
                        <td className="py-2 text-xs">{item.ornament || '—'}</td>
                        <td className="py-2 text-right">{item.grossWeight?.toFixed(3)}</td>
                        <td className="py-2 text-right">{item.netWeight?.toFixed(3)}</td>
                        <td className="py-2 text-right">{item.rate}</td>
                        <td className="py-2 text-right">{fm(itemValue(item))}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <button onClick={() => { setItemForm(item); setItems(items.filter((_, idx) => idx !== i)); }} className="p-1 text-primary-600" title="Edit line"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="label">Paid Amount (₹)</label>
                <input type="number" className="input-field" value={form.paidAmount || ''} onChange={e => setForm({...form, paidAmount: Number(e.target.value)})} /></div>
              <div><label className="label">Payment Mode</label>
                <select className="input-field" value={form.paymentMode} onChange={e => setForm({...form, paymentMode: e.target.value})}>
                  <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="DEBIT_CARD">Debit Card</option>
                  <option value="CREDIT_CARD">Credit Card</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CHEQUE">Cheque</option>
                </select></div>
              <div><label className="label">Into Account (Cash/Bank)</label>
                <select className="input-field" value={form.accountId} onChange={e => setForm({...form, accountId: e.target.value})}>
                  <option value="">— no ledger —</option>
                  {activeAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                </select></div>
              <div><label className="label">Balance</label>
                <input className="input-field" value={fm(balanceAmount)} disabled /></div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary">
                {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editingId ? 'Update Purchase' : 'Create Purchase & Add to Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

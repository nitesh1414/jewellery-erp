import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Search, Package } from 'lucide-react';

export default function JewelleryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [metalType, setMetalType] = useState('');
  const [purity, setPurity] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState<any>({
    designCode: '', metalType: 'GOLD', purity: '22K', grossWeight: 0, stoneWeight: 0,
    netWeight: 0, currentRate: 0, quantity: 1, hsnCode: '7113',
    makingChargeType: 'PERCENTAGE', makingChargeValue: 10,
    category: '', subCategory: '', location: '', ornament: '', ornamentGender: '',
    purchaseDate: new Date().toISOString().split('T')[0],
  });
  const [bulkItems, setBulkItems] = useState('');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });
  const { data: ornamentsData } = useQuery({ queryKey: ['ornaments-active'], queryFn: () => api.getOrnaments({ isActive: 'true' }), staleTime: 60000 });
  const ornaments = (ornamentsData?.items || []).map((o: any) => o);

  const { data, isLoading } = useQuery({
    queryKey: ['jewellery', search, status, metalType, purity, page],
    queryFn: () => api.getJewelleryItems({ search, status, metalType, purity, page, limit: 25 }),
  });
  const { data: stats } = useQuery({ queryKey: ['jewellery-stats'], queryFn: () => api.get('/jewellery/stats') });

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createJewelleryItem(b),
    onSuccess: () => { toast.success('Item added!'); qc.invalidateQueries({ queryKey: ['jewellery'] }); setShowAdd(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const bulkMutation = useMutation({
    mutationFn: (items: any[]) => api.post('/jewellery/bulk', { items }),
    onSuccess: (d: any) => { toast.success(d.count + ' items added!'); qc.invalidateQueries({ queryKey: ['jewellery'] }); setShowBulk(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (!newStatus) return;
    try {
      await api.put('/jewellery/' + id + '/status', { status: newStatus });
      toast.success('Status updated');
      qc.invalidateQueries({ queryKey: ['jewellery'] });
    } catch (e: any) { toast.error(e.response?.data?.message || 'Error'); }
  };

  const fm = (n: number) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Jewellery Items</h1><p className="text-gray-500 text-sm mt-1">Material entry and inventory management</p></div>
        <div className="flex gap-2">
          <button onClick={() => setShowBulk(true)} className="btn-secondary"><Package className="w-4 h-4" /> Bulk Import</button>
          <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Item</button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-4">
        <div className="stat-card"><p className="stat-label">Total</p><p className="stat-value">{stats?.totalItems || 0}</p></div>
        <div className="stat-card"><p className="stat-label">In Stock</p><p className="stat-value text-green-600">{stats?.inStock || 0}</p></div>
        <div className="stat-card"><p className="stat-label">Sold</p><p className="stat-value">{stats?.sold || 0}</p></div>
        <div className="stat-card"><p className="stat-label">In Mfg</p><p className="stat-value text-orange-600">{stats?.inManufacturing || 0}</p></div>
        <div className="stat-card"><p className="stat-label">Gold Wt</p><p className="stat-value">{(stats?.goldWeight || 0).toFixed(2)}g</p></div>
        <div className="stat-card"><p className="stat-label">Total Value</p><p className="stat-value">₹{(stats?.totalValue || 0).toLocaleString('en-IN')}</p></div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="text" placeholder="Search barcode, SKU, design..." className="input-field pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
        <select className="input-field w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All Status</option><option value="IN_STOCK">In Stock</option><option value="SOLD">Sold</option><option value="RESERVED">Reserved</option><option value="IN_MANUFACTURING">In Mfg</option><option value="IN_REPAIR">In Repair</option></select>
        <select className="input-field w-32" value={metalType} onChange={e => { setMetalType(e.target.value); setPage(1); }}><option value="">All Metal</option><option value="GOLD">Gold</option><option value="SILVER">Silver</option></select>
        <select className="input-field w-28" value={purity} onChange={e => { setPurity(e.target.value); setPage(1); }}><option value="">Purity</option>{(settings?.allPurities || ['24K','22K','18K','SILVER_925']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', '925 ')}</option>)}</select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Barcode</th><th className="table-header">Design</th><th className="table-header">Purity</th>
            <th className="table-header text-right">Gross</th><th className="table-header text-right">Net Wt</th>
            <th className="table-header text-right">Rate/g</th><th className="table-header text-right">Value</th>
            <th className="table-header">Status</th><th className="table-header"></th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading...</td></tr> :
             data?.items?.length === 0 ? <tr><td colSpan={9} className="text-center py-12 text-gray-400">No items found</td></tr> :
             data?.items?.map((item: any) => (
              <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell font-mono text-primary-700 text-xs">{item.barcode}</td>
                <td className="table-cell"><p className="font-medium">{item.designCode || item.product?.name || '—'}</p><p className="text-xs text-gray-400">{item.category}</p></td>
                <td className="table-cell">{item.purity}</td>
                <td className="table-cell text-right">{item.grossWeight?.toFixed(3)}</td>
                <td className="table-cell text-right font-medium">{item.netWeight?.toFixed(3)}</td>
                <td className="table-cell text-right">₹{item.currentRate?.toLocaleString('en-IN')}</td>
                <td className="table-cell text-right font-medium">₹{(item.netWeight * item.currentRate).toLocaleString('en-IN')}</td>
                <td className="table-cell"><span className={'badge ' + (item.status === 'IN_STOCK' ? 'badge-success' : item.status === 'SOLD' ? 'badge-danger' : item.status === 'RESERVED' ? 'badge-info' : 'badge-warning')}>{item.status}</span></td>
                <td className="table-cell">
                  {item.status === 'IN_STOCK' && (
                    <select onChange={e => handleStatusChange(item.id, e.target.value)} value="" className="text-xs border rounded p-1">
                      <option value="">Set Status</option>
                      <option value="RESERVED">Reserve</option>
                      <option value="IN_MANUFACTURING">To Mfg</option>
                      <option value="IN_REPAIR">To Repair</option>
                      <option value="SCRAPPED">Scrap</option>
                    </select>
                  )}
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

      {/* Add Item Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Add Jewellery Item (Material Entry)</h3>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="label">Design Code</label><input className="input-field" value={form.designCode} onChange={e => setForm({...form, designCode: e.target.value})} placeholder="RING-001" /></div>
              <div><label className="label">Metal Type</label><select className="input-field" value={form.metalType} onChange={e => setForm({...form, metalType: e.target.value})}><option value="GOLD">Gold</option><option value="SILVER">Silver</option></select></div>
              <div><label className="label">Purity</label><select className="input-field" value={form.purity} onChange={e => setForm({...form, purity: e.target.value})}>{(settings?.allPurities || ['24K','22K','18K']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}</select></div>
              <div><label className="label">Category</label><input className="input-field" value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="Ring" /></div>
              <div><label className="label">Sub Category</label><input className="input-field" value={form.subCategory} onChange={e => setForm({...form, subCategory: e.target.value})} /></div>
              <div>
                <label className="label">Ornament (ledger master)</label>
                <select className="input-field" value={form.ornament} onChange={e => {
                  const o = ornaments.find((x: any) => x.name === e.target.value);
                  setForm({ ...form, ornament: e.target.value, ornamentGender: o?.gender || '' });
                }}>
                  <option value="">— none —</option>
                  {ornaments.map((o: any) => <option key={o.id} value={o.name}>{o.name} ({o.gender === 'MALE' ? 'Male' : o.gender === 'FEMALE' ? 'Female' : 'Unisex'})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Ornament For</label>
                <select className="input-field" value={form.ornamentGender} onChange={e => setForm({...form, ornamentGender: e.target.value})}>
                  <option value="">—</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="UNISEX">Unisex</option>
                </select>
              </div>
              <div><label className="label">HSN Code</label><input className="input-field" value={form.hsnCode} onChange={e => setForm({...form, hsnCode: e.target.value})} /></div>
              <div><label className="label">Gross Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.grossWeight || ''} onChange={e => setForm({...form, grossWeight: Number(e.target.value)})} /></div>
              <div><label className="label">Stone Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.stoneWeight || ''} onChange={e => setForm({...form, stoneWeight: Number(e.target.value)})} /></div>
              <div><label className="label">Net Weight (g) *</label><input type="number" step="0.001" className="input-field" value={form.netWeight || ''} onChange={e => setForm({...form, netWeight: Number(e.target.value)})} /></div>
              <div><label className="label">Rate / g (₹) *</label><input type="number" className="input-field" value={form.currentRate || ''} onChange={e => setForm({...form, currentRate: Number(e.target.value)})} /></div>
              <div><label className="label">Quantity</label><input type="number" className="input-field" value={form.quantity} onChange={e => setForm({...form, quantity: Number(e.target.value)})} /></div>
              <div><label className="label">Making Charge</label><select className="input-field" value={form.makingChargeType} onChange={e => setForm({...form, makingChargeType: e.target.value})}><option value="PERCENTAGE">Percentage</option><option value="PER_GRAM">Per Gram</option><option value="FIXED_AMOUNT">Fixed</option></select></div>
              <div><label className="label">Making Value</label><input type="number" className="input-field" value={form.makingChargeValue} onChange={e => setForm({...form, makingChargeValue: Number(e.target.value)})} /></div>
              <div><label className="label">Location</label><input className="input-field" value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Showcase A1" /></div>
              <div><label className="label">Purchase Date</label><input type="date" className="input-field" value={form.purchaseDate} onChange={e => setForm({...form, purchaseDate: e.target.value})} /></div>
            </div>
            <p className="text-xs text-gray-400 mt-2">* Required fields. Barcode auto-generated.</p>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!form.designCode || !form.netWeight || !form.currentRate) { toast.error('Fill required fields'); return; }
                createMutation.mutate(form);
              }} disabled={createMutation.isPending} className="btn-primary">
                {createMutation.isPending ? 'Adding...' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowBulk(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Bulk Material Import</h3>
            <p className="text-sm text-gray-500 mb-3">Paste JSON array of items. Each needs: designCode, metalType, purity, netWeight, currentRate</p>
            <textarea className="input-field font-mono text-xs h-48" value={bulkItems} onChange={e => setBulkItems(e.target.value)}
              placeholder='[{"designCode":"RING-002","metalType":"GOLD","purity":"22K","netWeight":10.5,"currentRate":70000},{"designCode":"EARRING-003","metalType":"GOLD","purity":"18K","netWeight":5.2,"currentRate":56000}]' />
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
              <button onClick={() => setShowBulk(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                try { const items = JSON.parse(bulkItems); if (!Array.isArray(items) || items.length === 0) { toast.error('Invalid format'); return; } bulkMutation.mutate(items); }
                catch { toast.error('Invalid JSON format'); }
              }} disabled={bulkMutation.isPending} className="btn-primary">
                {bulkMutation.isPending ? 'Importing...' : 'Import Items'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
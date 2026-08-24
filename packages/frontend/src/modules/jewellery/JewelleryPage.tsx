import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Search, Package, Printer, Pencil } from 'lucide-react';

export default function JewelleryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [metalType, setMetalType] = useState('');
  const [purity, setPurity] = useState('');
  const [category, setCategory] = useState('');
  const [lkGender, setLkGender] = useState('');
  const [lkOrnament, setLkOrnament] = useState('');
  const [location, setLocation] = useState('');
  const [minWt, setMinWt] = useState('');
  const [maxWt, setMaxWt] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
    queryKey: ['jewellery', search, status, metalType, purity, category, lkGender, lkOrnament, location, minWt, maxWt, sort, page],
    queryFn: () => api.getJewelleryItems({
      search: search || undefined, status: status || undefined, metalType: metalType || undefined,
      purity: purity || undefined, category: category || undefined, ornamentGender: lkGender || undefined,
      ornament: lkOrnament || undefined, location: location || undefined,
      minNetWeight: minWt || undefined, maxNetWeight: maxWt || undefined, sort: sort || undefined,
      page, limit: 25,
    }),
    placeholderData: (prev: any) => prev,
  });
  const { data: stats } = useQuery({ queryKey: ['jewellery-stats'], queryFn: () => api.get('/jewellery/stats') });

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createJewelleryItem(b),
    onSuccess: () => { toast.success('Item added!'); qc.invalidateQueries({ queryKey: ['jewellery'] }); setShowAdd(false); setEditingId(null); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.put('/jewellery/' + id, body),
    onSuccess: () => {
      toast.success('Item updated!');
      qc.invalidateQueries({ queryKey: ['jewellery'] });
      setShowAdd(false);
      setEditingId(null);
      setDetail(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const openEditItem = (item: any) => {
    setForm({
      designCode: item.designCode || '',
      metalType: item.metalType || 'GOLD',
      purity: item.purity || '22K',
      grossWeight: item.grossWeight || 0,
      stoneWeight: item.stoneWeight || 0,
      netWeight: item.netWeight || 0,
      currentRate: item.currentRate || 0,
      quantity: item.quantity || 1,
      hsnCode: item.hsnCode || '7113',
      makingChargeType: item.makingChargeType || 'PERCENTAGE',
      makingChargeValue: item.makingChargeValue || 10,
      category: item.category || '',
      subCategory: item.subCategory || '',
      location: item.location || '',
      ornament: item.ornament || '',
      ornamentGender: item.ornamentGender || '',
      purchaseDate: item.purchaseDate ? new Date(item.purchaseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    });
    setEditingId(item.id);
    setShowAdd(true);
  };

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

      <div className="flex gap-2 flex-wrap items-center bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="text" placeholder="Barcode, SKU, design, hallmark no…" className="input-field pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
        <select className="input-field w-32" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          {['IN_STOCK', 'RESERVED', 'IN_MANUFACTURING', 'IN_REPAIR', 'SOLD', 'SCRAPPED'].map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="input-field w-28" value={metalType} onChange={e => { setMetalType(e.target.value); setPage(1); }}><option value="">All Metal</option>{(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m}</option>)}</select>
        <select className="input-field w-28" value={purity} onChange={e => { setPurity(e.target.value); setPage(1); }}><option value="">Purity</option>{(settings?.allPurities || ['24K','22K','18K','SILVER_925']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', '925 ')}</option>)}</select>
        <input className="input-field w-28" placeholder="Category" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} />
        <select className="input-field w-40" value={lkOrnament} onChange={e => { setLkOrnament(e.target.value); setLkGender(''); setPage(1); }}>
          <option value="">All ornaments</option>
          {(ornaments || []).map((o: any) => <option key={o.id} value={o.name}>{o.name}</option>)}
        </select>
        <select className="input-field w-32" value={lkGender} onChange={e => { setLkGender(e.target.value); setPage(1); }}>
          <option value="">Male + Female</option>
          <option value="MALE">Male ornaments</option>
          <option value="FEMALE">Female ornaments</option>
          <option value="UNISEX">Unisex</option>
        </select>
        <input className="input-field w-24" placeholder="Location" value={location} onChange={e => { setLocation(e.target.value); setPage(1); }} />
        <div className="flex items-center gap-1">
          <input type="number" step="0.1" className="input-field w-20" placeholder="Wt ≥" value={minWt} onChange={e => { setMinWt(e.target.value); setPage(1); }} />
          <span className="text-gray-400 text-xs">—</span>
          <input type="number" step="0.1" className="input-field w-20" placeholder="≤" value={maxWt} onChange={e => { setMaxWt(e.target.value); setPage(1); }} />
        </div>
        <select className="input-field w-40" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="">Newest first</option>
          <option value="netWeight_desc">Weight: high → low</option>
          <option value="netWeight_asc">Weight: low → high</option>
          <option value="value_desc">Rate/g: high → low</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Barcode</th><th className="table-header">Design / Ornament</th><th className="table-header">Metal / Purity</th>
            <th className="table-header text-right">Gross / Stone / Net</th>
            <th className="table-header text-right">Rate/g</th><th className="table-header text-right">Value</th>
            <th className="table-header">Making</th><th className="table-header">Hallmark</th><th className="table-header">Location</th>
            <th className="table-header">Status</th><th className="table-header"></th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading...</td></tr> :
             data?.items?.length === 0 ? <tr><td colSpan={9} className="text-center py-12 text-gray-400">No items found</td></tr> :
             data?.items?.map((item: any) => (
              <tr key={item.id} className="border-b border-gray-50 hover:bg-primary-50/40 cursor-pointer" onClick={() => setDetail(item)}>
                <td className="table-cell font-mono text-primary-700 text-xs">{item.barcode}</td>
                <td className="table-cell">
                  <p className="font-medium">{item.designCode || item.product?.name || '—'}</p>
                  <p className="text-xs text-gray-400">
                    {item.category || '—'}{item.ornament ? ` · ${item.ornament}` : ''}{item.ornamentGender ? ` (${item.ornamentGender[0]}${item.ornamentGender.slice(1).toLowerCase()})` : ''}
                  </p>
                </td>
                <td className="table-cell text-xs">{item.metalType}<br /><span className="text-gray-400">{item.purity}</span></td>
                <td className="table-cell text-right text-xs">{item.grossWeight?.toFixed(3)} / {item.stoneWeight?.toFixed(3) ?? '0.000'} / <strong>{item.netWeight?.toFixed(3)}</strong> g</td>
                <td className="table-cell text-right">₹{item.currentRate?.toLocaleString('en-IN')}</td>
                <td className="table-cell text-right font-medium">₹{(item.netWeight * item.currentRate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className="table-cell text-xs">{item.makingChargeType === 'PERCENTAGE' ? item.makingChargeValue + '%' : item.makingChargeType === 'PER_GRAM' ? '₹' + item.makingChargeValue + '/g' : '₹' + item.makingChargeValue}</td>
                <td className="table-cell text-xs">{item.hallmarkNumber || '—'}</td>
                <td className="table-cell text-xs">{item.location || '—'}</td>
                <td className="table-cell"><span className={'badge ' + (item.status === 'IN_STOCK' ? 'badge-success' : item.status === 'SOLD' ? 'badge-danger' : item.status === 'RESERVED' ? 'badge-info' : 'badge-warning')}>{item.status.replace(/_/g, ' ')}</span></td>
                <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => window.open('/print/barcodes?codes=' + encodeURIComponent(item.barcode), '_blank')}
                      className="p-1 text-gray-400 hover:text-primary-600" title="Print barcode sticker"><Printer className="w-4 h-4" /></button>
                    {item.status === 'IN_STOCK' && (
                      <select onChange={e => handleStatusChange(item.id, e.target.value)} value="" className="text-xs border rounded p-1">
                        <option value="">Set Status</option>
                        <option value="RESERVED">Reserve</option>
                        <option value="IN_MANUFACTURING">To Mfg</option>
                        <option value="IN_REPAIR">To Repair</option>
                        <option value="SCRAPPED">Scrap</option>
                      </select>
                    )}
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

      {/* Add Item Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingId ? 'Edit Jewellery Item' : 'Add Jewellery Item (Material Entry)'}</h3>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="label">Design Code</label><input className="input-field" value={form.designCode} onChange={e => setForm({...form, designCode: e.target.value})} placeholder="RING-001" /></div>
              <div><label className="label">Metal Type</label><select className="input-field" value={form.metalType} onChange={e => setForm({...form, metalType: e.target.value})}>{(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></div>
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
              <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!form.designCode || !form.netWeight || !form.currentRate) { toast.error('Fill required fields'); return; }
                if (editingId) updateMutation.mutate({ id: editingId, body: form });
                else createMutation.mutate(form);
              }} disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary">
                {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editingId ? 'Update Item' : 'Add Item'}
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
    
      {/* Item detail drawer */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{detail.designCode || detail.product?.name || 'Item'}</h3>
                  <p className="font-mono text-xs text-primary-700">{detail.barcode}</p>
                </div>
                <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ['Status', (detail.status || '').replace(/_/g, ' ')],
                  ['Metal / Purity', `${detail.metalType} · ${detail.purity}`],
                  ['Category', detail.category || '—'],
                  ['Sub category', detail.subCategory || '—'],
                  ['Ornament', detail.ornament ? `${detail.ornament} (${detail.ornamentGender || '—'})` : '—'],
                  ['Gross weight', detail.grossWeight + ' g'],
                  ['Stone weight', (detail.stoneWeight ?? 0) + ' g'],
                  ['Net weight', detail.netWeight + ' g'],
                  ['Quantity', String(detail.quantity)],
                  ['Size / Color', `${detail.size || '—'} / ${detail.color || '—'}`],
                  ['Purchase rate', '₹' + (detail.purchaseRate || 0).toLocaleString('en-IN')],
                  ['Current rate', '₹' + (detail.currentRate || 0).toLocaleString('en-IN')],
                  ['Current value', '₹' + (detail.netWeight * detail.currentRate).toLocaleString('en-IN', { maximumFractionDigits: 0 })],
                  ['Making charge', detail.makingChargeType === 'PERCENTAGE' ? detail.makingChargeValue + '%' : detail.makingChargeType === 'PER_GRAM' ? '₹' + detail.makingChargeValue + '/g' : '₹' + detail.makingChargeValue],
                  ['Hallmark no.', detail.hallmarkNumber || '—'],
                  ['Certificate no.', detail.certificateNumber || '—'],
                  ['HSN', detail.hsnCode],
                  ['Location', detail.location || '—'],
                  ['SKU', detail.sku || '—'],
                  ['Purchase date', detail.purchaseDate ? new Date(detail.purchaseDate).toLocaleDateString('en-IN') : '—'],
                ].map(([label, value]: any) => (
                  <div key={label}><p className="text-xs text-gray-400">{label}</p><p className="font-medium">{value}</p></div>
                ))}
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => { openEditItem(detail); setDetail(null); }} className="btn-secondary flex-1">
                  <Pencil className="w-4 h-4" /> Edit Item
                </button>
                <button onClick={() => window.open('/print/barcodes?codes=' + encodeURIComponent(detail.barcode), '_blank')} className="btn-primary flex-1">
                  <Printer className="w-4 h-4" /> Print Barcode Sticker
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


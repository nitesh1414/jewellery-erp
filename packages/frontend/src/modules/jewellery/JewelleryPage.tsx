import { confirmAction } from '../../components/ConfirmDialog';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Plus, Search, Package, Printer, Pencil, Diamond, X, Trash2 } from 'lucide-react';
import { formatPurity } from '../../utils/metalPurity';

/** Net Weight = Weight (gross) − Stone Weight (− other weight). */
const calcNet = (gross: number, stone: number, other: number = 0) =>
  Math.round(Math.max(0, (Number(gross) || 0) - (Number(stone) || 0) - (Number(other) || 0)) * 1000) / 1000;

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
    designCode: '', metalType: 'GOLD', purity: '22K', grossWeight: 0, stoneWeight: 0, otherWeight: 0,
    netWeight: 0, currentRate: 0, quantity: 1, hsnCode: '7113', metalLedgerAccountId: '',
    makingChargeType: 'PERCENTAGE', makingChargeValue: 10,
    category: '', subCategory: '', location: '', ornament: '', ornamentGender: '',
    hallmarkNumber: '', purchaseDate: new Date().toISOString().split('T')[0],
  });
  const [bulkItems, setBulkItems] = useState('');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });
  const { data: rateMaster } = useQuery({ queryKey: ['rates'], queryFn: () => api.getRates(), staleTime: 300000 });
  const { data: ornamentsData } = useQuery({ queryKey: ['ornaments-active'], queryFn: () => api.getOrnaments({ isActive: 'true' }), staleTime: 60000 });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.getAccounts(), staleTime: 60000 });

  // Rate for a purity from the DB rate schedule (used to auto-fill the item rate).
  const getRateForPurity = (purity: string): number => {
    const rows: any[] = Array.isArray(rateMaster) ? (rateMaster as any[]) : [];
    const exact = rows.find((r: any) => (r.purity || '').toUpperCase() === (purity || '').toUpperCase());
    return exact ? Number(exact.rate) || 0 : 0;
  };
  const hallmarkMaster: any[] = settings?.allHallmarks || [];
  const ornaments = (ornamentsData?.items || []).map((o: any) => o);

  // Metal (material) ledgers — picking one filters the ornament master below and
  // shows the stock held in that metal + purity.
  const metalAccounts: any[] = (Array.isArray(accounts) ? (accounts as any[]) : []).filter((a: any) => a.type === 'METAL' && a.isActive !== false);
  const metalAccountById = (id: string) => metalAccounts.find((a: any) => a.id === id);
  /** The metal ledger that holds a metal + purity (used to pre-pick the ledger). */
  const autoLedgerFor = (metal: string, pur: string) => metalAccounts.find((a: any) =>
    (a.metalType || '').toUpperCase() === (metal || '').toUpperCase()
    && (a.purity || '').toUpperCase() === (pur || '').toUpperCase());
  const { data: ornamentOptions } = useQuery({
    queryKey: ['ornaments-with-stock', form.metalLedgerAccountId || ''],
    queryFn: () => api.getOrnamentsWithStock({ isActive: 'true', metalLedgerAccountId: form.metalLedgerAccountId || undefined }),
    staleTime: 30000,
  });
  const ornamentList: any[] = Array.isArray(ornamentOptions) ? (ornamentOptions as any[]) : [];
  const ornamentStockLabel = (o: any) => {
    const pieces = Number(o.stockPieces ?? o.totalPieces) || 0;
    const weight = Number(o.stockWeight ?? o.totalWeight) || 0;
    return pieces || weight ? ` · ${pieces} pc${pieces === 1 ? '' : 's'} · ${weight.toFixed(3)} g` : ' · no stock';
  };

  /** Choose the metal ledger: it sets the metal + purity and filters the ornament master. */
  const pickMetalLedger = (accountId: string) => {
    const account = metalAccountById(accountId);
    const purity = account?.purity || form.purity;
    const rate = purity ? getRateForPurity(purity) : form.currentRate;
    setForm({
      ...form,
      metalLedgerAccountId: accountId,
      metalType: account?.metalType || form.metalType,
      purity,
      currentRate: rate || form.currentRate,
      ornament: accountId ? '' : form.ornament,
    });
  };

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
    onSuccess: () => {
      toast.success('Item added!');
      qc.invalidateQueries({ queryKey: ['jewellery'] });
      qc.invalidateQueries({ queryKey: ['jewellery-stats'] });
      // The gross weight left the metal ledger and became ornament stock
      qc.invalidateQueries({ queryKey: ['inventory-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-metal-stock'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['ornaments-with-stock'] });
      setShowAdd(false); setEditingId(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.put('/jewellery/' + id, body),
    onSuccess: () => {
      toast.success('Item updated!');
      qc.invalidateQueries({ queryKey: ['jewellery'] });
      qc.invalidateQueries({ queryKey: ['jewellery-stats'] });
      qc.invalidateQueries({ queryKey: ['inventory-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-metal-stock'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['ornaments-with-stock'] });
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
      metalLedgerAccountId: item.metalLedgerAccountId || '',
      grossWeight: item.grossWeight || 0,
      stoneWeight: item.stoneWeight || 0,
      otherWeight: item.otherWeight || 0,
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
      hallmarkNumber: item.hallmarkNumber || '',
      purchaseDate: item.purchaseDate ? new Date(item.purchaseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    });
    setEditingId(item.id);
    setShowAdd(true);
  };

  /** Open a fresh Add Item form — metal ledger pre-picked from metal + purity. */
  const openAddItem = () => {
    setEditingId(null);
    const metalType = 'GOLD';
    const purity = '22K';
    setForm({
      designCode: '', metalType, purity, grossWeight: 0, stoneWeight: 0, otherWeight: 0,
      netWeight: 0, currentRate: getRateForPurity(purity), quantity: 1, hsnCode: '7113',
      metalLedgerAccountId: autoLedgerFor(metalType, purity)?.id || '',
      makingChargeType: 'PERCENTAGE', makingChargeValue: 10,
      category: '', subCategory: '', location: '', ornament: '', ornamentGender: '',
      hallmarkNumber: '', purchaseDate: new Date().toISOString().split('T')[0],
    });
    setShowAdd(true);
  };

  // Ctrl/Cmd+A → add item
  useAppShortcut('app:add', openAddItem);

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

  /** Delete an item and give its gross weight back to the metal ledger it came from. */
  const handleDeleteItem = async (item: any) => {
    const account = metalAccountById(item.metalLedgerAccountId);
    const message = `Delete ${item.designCode || item.barcode}?`
      + (account ? `\n\nIts net weight (${fmtG(item.netWeight)} g) will be given back to ${account.name}.` : '');
    if (!(await confirmAction({ title: 'Delete this item?', message, danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await api.delete('/jewellery/' + item.id);
      toast.success(account ? 'Item deleted — metal returned to ' + account.name : 'Item deleted');
      qc.invalidateQueries({ queryKey: ['jewellery'] });
      qc.invalidateQueries({ queryKey: ['jewellery-stats'] });
      qc.invalidateQueries({ queryKey: ['inventory-stock'] });
      qc.invalidateQueries({ queryKey: ['inv-metal-stock'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['ornaments-with-stock'] });
    } catch (e: any) { toast.error(e.response?.data?.message || 'Error'); }
  };

  /** Grams without trailing zeros: 15, 12.5, 10.25 … */
  const fmtG = (n: any) => String(Math.round((Number(n) || 0) * 1000) / 1000);
  const fm = (n: number) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="page-title">Jewellery Items</h1><p className="text-gray-500 text-[13px] mt-1">Material entry and inventory management</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowBulk(true)} className="btn-secondary"><Package className="w-4 h-4" /> Bulk Import</button>
          <button data-hotkey-add onClick={openAddItem} className="btn-primary"><Plus className="w-4 h-4" /> Add Item</button>
        </div>
      </div>

      <div className="grid stat-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="stat-card"><p className="stat-label">Total</p><p className="stat-value">{stats?.totalItems || 0}</p></div>
        <div className="stat-card"><p className="stat-label">In Stock</p><p className="stat-value text-green-600">{stats?.inStock || 0}</p></div>
        <div className="stat-card"><p className="stat-label">Sold</p><p className="stat-value">{stats?.sold || 0}</p></div>
        <div className="stat-card"><p className="stat-label">In Mfg</p><p className="stat-value text-orange-600">{stats?.inManufacturing || 0}</p></div>
        <div className="stat-card"><p className="stat-label">Gold Wt</p><p className="stat-value">{(stats?.goldWeight || 0).toFixed(2)}g</p></div>
        <div className="stat-card"><p className="stat-label">Total Value</p><p className="stat-value">₹{(stats?.totalValue || 0).toLocaleString('en-IN')}</p></div>
      </div>

      <div className="flex gap-2 flex-wrap items-center bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input data-search-input type="text" placeholder="Barcode, SKU, design, hallmark no…" className="input-field pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
        <select className="input-field w-32" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          {['IN_STOCK', 'RESERVED', 'IN_MANUFACTURING', 'IN_REPAIR', 'SOLD', 'SCRAPPED'].map((st) => <option key={st} value={st}>{st.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="input-field w-28" value={metalType} onChange={e => { setMetalType(e.target.value); setPage(1); }}><option value="">All Metal</option>{(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m}</option>)}</select>
        <select className="input-field w-28" value={purity} onChange={e => { setPurity(e.target.value); setPage(1); }}><option value="">Purity</option>{(settings?.allPurities || ['24K','22K','18K','SILVER_925']).map((p: string) => <option key={p} value={p}>{formatPurity(p)}</option>)}</select>
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
        <div className="table-wrap">
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
                <td className="table-cell text-xs">{item.metalType}<br /><span className="text-gray-400">{item.purity}</span>{item.metalLedgerAccountId && metalAccountById(item.metalLedgerAccountId) ? (<><br /><span className="text-amber-700">from {metalAccountById(item.metalLedgerAccountId)?.name}</span></>) : null}</td>
                <td className="table-cell text-right text-xs">{item.grossWeight?.toFixed(3)} / {item.stoneWeight?.toFixed(3) ?? '0.000'} / <strong>{item.netWeight?.toFixed(3)}</strong> g</td>
                <td className="table-cell text-right">₹{item.currentRate?.toLocaleString('en-IN')}</td>
                <td className="table-cell text-right font-medium">₹{(item.netWeight * item.currentRate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className="table-cell text-xs">{item.makingChargeType === 'PERCENTAGE' ? item.makingChargeValue + '%' : item.makingChargeType === 'PER_GRAM' ? '₹' + item.makingChargeValue + '/g' : '₹' + item.makingChargeValue}</td>
                <td className="table-cell text-xs">{item.hallmarkNumber || '—'}</td>
                <td className="table-cell text-xs">{item.location || '—'}</td>
                <td className="table-cell"><span className={'badge ' + (item.status === 'IN_STOCK' ? 'badge-success' : item.status === 'SOLD' ? 'badge-danger' : item.status === 'RESERVED' ? 'badge-info' : 'badge-warning')}>{item.status.replace(/_/g, ' ')}</span></td>
                <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditItem(item)} className="p-1 text-amber-600 hover:text-amber-700" title="Edit item"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => window.open('/print/barcodes?codes=' + encodeURIComponent(item.barcode), '_blank')}
                      className="p-1 text-gray-400 hover:text-primary-600" title="Print barcode sticker"><Printer className="w-4 h-4" /></button>
                    {item.metalLedgerAccountId && (
                      <button onClick={() => handleDeleteItem(item)} className="p-1 text-red-400 hover:text-red-600"
                        title="Delete item — returns the metal to its ledger"><Trash2 className="w-4 h-4" /></button>
                    )}
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
        </div>
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-3 border-t">
            <span className="text-[13px] text-gray-500">Page {page} of {data.totalPages}</span>
            <div className="flex flex-wrap gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-[13px] py-1">Prev</button>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-[13px] py-1">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 p-3 sm:p-6 max-h-[90vh] overflow-y-auto modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-3">{editingId ? 'Edit Jewellery Item' : 'Add Jewellery Item (Material Entry)'}</h3>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Design Code</label><input className="input-field" value={form.designCode} onChange={e => setForm({...form, designCode: e.target.value})} placeholder="RING-001" /></div>
              <div><label className="label">Metal Type</label><select className="input-field" value={form.metalType} onChange={e => { const metalType = e.target.value; setForm({...form, metalType, metalLedgerAccountId: autoLedgerFor(metalType, form.purity)?.id || ''}); }}>{(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></div>
              <div><label className="label">Purity</label><select className="input-field" value={form.purity} onChange={e => { const purity = e.target.value; const autoRate = getRateForPurity(purity); setForm({...form, purity, currentRate: autoRate, metalLedgerAccountId: autoLedgerFor(form.metalType, purity)?.id || ''}); }}>{(settings?.allPurities || ['24K','22K','18K']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}</select></div>
              <div><label className="label">Category</label><input className="input-field" value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="Ring" /></div>
              <div><label className="label">Sub Category</label><input className="input-field" value={form.subCategory} onChange={e => setForm({...form, subCategory: e.target.value})} /></div>
              <div>
                <label className="label">Metal ledger (metal stock)</label>
                <select className="input-field" value={form.metalLedgerAccountId || ''} onChange={e => pickMetalLedger(e.target.value)}>
                  <option value="">— none —</option>
                  {metalAccounts.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name} · {(Number(a.grams) || 0).toFixed(3)} g</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {metalAccountById(form.metalLedgerAccountId)
                    ? `Stock in this ledger: ${(Number(metalAccountById(form.metalLedgerAccountId)?.grams) || 0).toFixed(3)} g`
                    : 'Pick a metal ledger to filter the ornament master and set metal + purity'}
                </p>
                <p className="text-[11px] mt-0.5 text-amber-700">
                  {form.metalLedgerAccountId
                    ? `On save ${fmtG(form.netWeight)} g (net) is deducted from ${metalAccountById(form.metalLedgerAccountId)?.name || 'this ledger'} and added to ornament stock — gross ${fmtG(form.grossWeight)} − stone ${fmtG(form.stoneWeight)} − other ${fmtG(form.otherWeight)}.`
                    : 'No ledger selected — the metal stock will not change.'}
                </p>
              </div>
              <div>
                <label className="label">Ornament (ledger master)</label>
                <select className="input-field" value={form.ornament} onChange={e => {
                  const o = ornamentList.find((x: any) => x.name === e.target.value);
                  setForm({ ...form, ornament: e.target.value, ornamentGender: o?.gender || '' });
                }}>
                  <option value="">— none —</option>
                  {ornamentList.map((o: any) => (
                    <option key={o.id} value={o.name}>
                      {o.name}{o.gender === 'MALE' ? ' (Male)' : o.gender === 'FEMALE' ? ' (Female)' : ' (Unisex)'}{ornamentStockLabel(o)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {form.metalLedgerAccountId
                    ? `Stock shown is for ${metalAccountById(form.metalLedgerAccountId)?.metalType || ''} ${metalAccountById(form.metalLedgerAccountId)?.purity || ''}`
                    : 'Stock shown is the total across all metals'}
                </p>
              </div>
              <div>
                <label className="label">Ornament For</label>
                <select className="input-field" value={form.ornamentGender} onChange={e => setForm({...form, ornamentGender: e.target.value})}>
                  <option value="">—</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="UNISEX">Unisex</option>
                </select>
              </div>
              <div><label className="label">HSN Code</label><input className="input-field" value={form.hsnCode} onChange={e => setForm({...form, hsnCode: e.target.value})} /></div>
              <div><label className="label">Gross Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.grossWeight || ''} onChange={e => { const grossWeight = Number(e.target.value); setForm({...form, grossWeight, netWeight: calcNet(grossWeight, form.stoneWeight, form.otherWeight)}); }} /></div>
              <div><label className="label">Stone Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.stoneWeight || ''} onChange={e => { const stoneWeight = Number(e.target.value); setForm({...form, stoneWeight, netWeight: calcNet(form.grossWeight, stoneWeight, form.otherWeight)}); }} /></div>
              <div><label className="label">Other Weight (g)</label><input type="number" step="0.001" className="input-field" value={form.otherWeight || ''} onChange={e => { const otherWeight = Number(e.target.value); setForm({...form, otherWeight, netWeight: calcNet(form.grossWeight, form.stoneWeight, otherWeight)}); }} /></div>
              <div>
                <label className="label">Net Weight (g) * <span className="text-gray-400">auto</span></label>
                <input type="number" step="0.001" className="input-field bg-gray-100" value={form.netWeight || ''} readOnly title="Net Weight = Gross Weight − Stone Weight" />
                <p className="text-[11px] text-gray-400 mt-0.5">Gross − stone − other</p>
              </div>
              <div><label className="label">Rate / g (₹) *</label><input type="number" className="input-field" value={form.currentRate || ''} onChange={e => setForm({...form, currentRate: Number(e.target.value)})} /></div>
              <div><label className="label">Quantity</label><input type="number" className="input-field" value={form.quantity} onChange={e => setForm({...form, quantity: Number(e.target.value)})} /></div>
              <div><label className="label">Making Charge</label><select className="input-field" value={form.makingChargeType} onChange={e => setForm({...form, makingChargeType: e.target.value})}><option value="PERCENTAGE">Percentage</option><option value="PER_GRAM">Per Gram</option><option value="FIXED_AMOUNT">Fixed</option></select></div>
              <div><label className="label">Making Value</label><input type="number" className="input-field" value={form.makingChargeValue} onChange={e => setForm({...form, makingChargeValue: Number(e.target.value)})} /></div>
              <div><label className="label">Location</label><input className="input-field" value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Showcase A1" /></div>
              <div><label className="label">Purchase Date</label><input type="date" className="input-field" value={form.purchaseDate} onChange={e => setForm({...form, purchaseDate: e.target.value})} /></div>
              <div>
                <label className="label">Hallmark (from master)</label>
                <select className="input-field" value="" onChange={e => {
                  const h = hallmarkMaster.find((x: any) => x.id === e.target.value);
                  if (h) setForm({ ...form, purity: h.purity, hallmarkNumber: h.label, currentRate: getRateForPurity(h.purity) });
                }}>
                  <option value="">— select —</option>
                  {hallmarkMaster.map((h: any) => <option key={h.id} value={h.id}>{h.label} ({h.purity} · ₹{h.charge})</option>)}
                </select>
              </div>
              <div><label className="label">Hallmark Number</label><input className="input-field" value={form.hallmarkNumber || ''} onChange={e => setForm({...form, hallmarkNumber: e.target.value})} placeholder="HM-916-xxxx" /></div>
            </div>
            <p className="text-xs text-gray-400 mt-2">* Required fields. Barcode auto-generated.</p>
            <div className="flex justify-end gap-3 mt-3 pt-3 border-t">
              <button onClick={() => { setShowAdd(false); setEditingId(null); }} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!form.designCode || !form.netWeight || !form.currentRate) { toast.error('Fill required fields'); return; }
                if (editingId) updateMutation.mutate({ id: editingId, body: form });
                else createMutation.mutate(form);
              }} data-hotkey-save disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary">
                {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editingId ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowBulk(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-3 sm:p-4 modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-3">Bulk Material Import</h3>
            <p className="text-[13px] text-gray-500 mb-3">Paste JSON array of items. Each needs: designCode, metalType, purity, netWeight, currentRate</p>
            <textarea className="input-field font-mono text-xs h-48" value={bulkItems} onChange={e => setBulkItems(e.target.value)}
              placeholder='[{"designCode":"RING-002","metalType":"GOLD","purity":"22K","netWeight":10.5,"currentRate":70000},{"designCode":"EARRING-003","metalType":"GOLD","purity":"18K","netWeight":5.2,"currentRate":56000}]' />
            <div className="flex justify-end gap-3 mt-3 pt-3 border-t">
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 modal-panel" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center">
                  <Diamond className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-base leading-tight">{detail.designCode || detail.product?.name || 'Item'}</h3>
                  <p className="font-mono text-xs text-primary-700">{detail.barcode}</p>
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              {/* Left summary */}
              <div className="p-6 border-r border-gray-100 bg-gray-50/50 md:rounded-l-2xl">
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Status</p>
                    <span className={'badge ' + (detail.status === 'IN_STOCK' ? 'badge-success' : detail.status === 'SOLD' ? 'badge-danger' : detail.status === 'RESERVED' ? 'badge-info' : 'badge-warning')}>{detail.status?.replace(/_/g, ' ')}</span>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Metal / Purity</p>
                    <p className="font-semibold">{detail.metalType} · {detail.purity}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-[11px] uppercase tracking-wide text-gray-400">Net</p><p className="font-semibold">{detail.netWeight} g</p></div>
                    <div><p className="text-[11px] uppercase tracking-wide text-gray-400">Gross</p><p className="font-semibold">{detail.grossWeight} g</p></div>
                  </div>
                  <div className="flex items-center justify-between bg-primary-50 rounded-xl px-3 py-3">
                    <span className="text-[13px] text-primary-700">Value at rate</span>
                    <span className="font-bold text-primary-900">₹{(detail.netWeight * detail.currentRate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Current rate</p>
                    <p className="font-semibold">₹{detail.currentRate?.toLocaleString('en-IN')}/g</p>
                  </div>
                </div>
              </div>

              {/* Right details */}
              <div className="col-span-2 p-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-[13px]">
                  {[
                    ['Category', detail.category || '—'],
                    ['Sub category', detail.subCategory || '—'],
                    ['Ornament', detail.ornament ? `${detail.ornament}${detail.ornamentGender ? ` (${detail.ornamentGender})` : ''}` : '—'],
                    ['Stone weight', (detail.stoneWeight ?? 0) + ' g'],
                    ['Quantity', String(detail.quantity)],
                    ['Size / Color', `${detail.size || '—'} / ${detail.color || '—'}`],
                    ['Purchase rate', '₹' + (detail.purchaseRate || 0).toLocaleString('en-IN')],
                    ['Making charge', detail.makingChargeType === 'PERCENTAGE' ? detail.makingChargeValue + '%' : detail.makingChargeType === 'PER_GRAM' ? '₹' + detail.makingChargeValue + '/g' : '₹' + detail.makingChargeValue],
                    ['Hallmark no.', detail.hallmarkNumber || '—'],
                    ['Certificate no.', detail.certificateNumber || '—'],
                    ['HSN', detail.hsnCode],
                    ['Location', detail.location || '—'],
                    ['SKU', detail.sku || '—'],
                    ['Purchase date', detail.purchaseDate ? new Date(detail.purchaseDate).toLocaleDateString('en-IN') : '—'],
                  ].map(([label, value]: any) => (
                    <div key={label} className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
                      <p className="font-medium truncate">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-3 py-3 border-t border-gray-100">
              <button onClick={() => { openEditItem(detail); setDetail(null); }} className="btn-secondary text-[13px]">
                <Pencil className="w-4 h-4" /> Edit Item
              </button>
              <button onClick={() => setDetail(null)} className="btn-secondary text-[13px]">
                <X className="w-4 h-4" /> Close
              </button>
              <button onClick={() => window.open('/print/barcodes?codes=' + encodeURIComponent(detail.barcode), '_blank')} className="btn-primary text-[13px]">
                <Printer className="w-4 h-4" /> Print Barcode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


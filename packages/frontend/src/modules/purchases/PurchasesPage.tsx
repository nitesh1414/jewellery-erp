import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Plus, Search, Truck, Trash2, Package, Eye, Pencil, X, Gem, Scale } from 'lucide-react';

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
  otherWeight: number;
  netWeight: number;
  rate: number;
  quantity: number;
  makingChargeType: string;
  makingChargeValue: number;
  hallmarkNumber: string;
  certificateNumber: string;
  metalLedgerAccountId: string;
}

const emptyItem = (): PurchaseItem => ({
  id: 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
  designCode: '', metalType: 'GOLD', purity: '22K', category: '', subCategory: '',
  ornament: '', ornamentGender: '', hsnCode: '7113',
  grossWeight: 0, stoneWeight: 0, otherWeight: 0, netWeight: 0, rate: 0, quantity: 1,
  makingChargeType: 'PERCENTAGE', makingChargeValue: 10,
  hallmarkNumber: '', certificateNumber: '',
  metalLedgerAccountId: '',
});

const round3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
/** Grams without trailing zeros: 15, 12.5, 10.25 … */
const fmtG = (n: any) => String(Math.round((Number(n) || 0) * 1000) / 1000);
/** Net Weight = Weight (gross) − Stone Weight (− other weight). */
const calcNet = (gross: number, stone: number, other: number = 0) => round3(Math.max(0, (Number(gross) || 0) - (Number(stone) || 0) - (Number(other) || 0)));

type EntryType = 'METAL' | 'ORNAMENT';

export default function PurchasesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [entryType, setEntryType] = useState<EntryType>('ORNAMENT');
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
  // Ornament master filtered by the metal ledger picked on the line, with the
  // stock held in that metal + purity (from inventory stock).
  const { data: ornamentOptions } = useQuery({
    queryKey: ['ornaments-with-stock', itemForm.metalLedgerAccountId || '', itemForm.metalType, itemForm.purity],
    queryFn: () => api.getOrnamentsWithStock({
      isActive: 'true',
      metalLedgerAccountId: itemForm.metalLedgerAccountId || undefined,
      metalType: itemForm.metalType,
      purity: itemForm.purity,
    }),
    staleTime: 30000,
  });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.getAccounts(), staleTime: 60000 });
  const hallmarkMaster: any[] = settings?.allHallmarks || [];
  // Rate for a purity from the DB rate schedule (used to auto-fill the item rate).
  const getRateForPurity = (purity: string): number => {
    const rows: any[] = (rateMaster as any) || [];
    const exact = rows.find((r: any) => (r.purity || '').toUpperCase() === (purity || '').toUpperCase());
    return exact ? Number(exact.rate) || 0 : 0;
  };
  const activeAccounts = ((accounts as any) || []).filter((a: any) => a.isActive !== false && !['INCOME', 'SALES', 'REVENUE'].includes(a.type));
  // Metal / material ledgers — metal purchases credit these, ornament purchases
  // deduct the net weight (gross − stone − other) from the one selected on the line.
  const metalAccounts: any[] = ((accounts as any) || []).filter((a: any) => a.isActive !== false && a.type === 'METAL');
  const ornaments = (ornamentsData?.items || []).map((o: any) => o);
  const ornamentList: any[] = (ornamentOptions as any) || [];
  const ornamentStockLabel = (o: any) => {
    const pieces = Number(o.stockPieces ?? o.totalPieces) || 0;
    const weight = Number(o.stockWeight ?? o.totalWeight) || 0;
    return pieces || weight ? ` · ${pieces} pc${pieces === 1 ? '' : 's'} · ${weight.toFixed(3)} g` : ' · no stock';
  };
  /** Pick the metal ledger for the line: aligns metal + purity and filters the ornament master. */
  const pickLineMetalLedger = (accountId: string) => {
    const account = metalAccounts.find((a: any) => a.id === accountId);
    const purity = account?.purity || itemForm.purity;
    setItemForm({
      ...itemForm,
      metalLedgerAccountId: accountId,
      metalType: account?.metalType || itemForm.metalType,
      purity,
      rate: purity ? getRateForPurity(purity) : itemForm.rate,
      ornament: accountId ? '' : itemForm.ornament,
    });
  };

  /** Ledger that would be used automatically for a metal + purity. */
  const autoMetalAccount = (metalType: string, purity: string) =>
    metalAccounts.find((a: any) =>
      (a.metalType || '').toUpperCase() === (metalType || '').toUpperCase() &&
      (a.purity || '') === (purity || '')) ||
    metalAccounts.find((a: any) => (a.name || '').toUpperCase() === `${metalType} ${purity}`.trim().toUpperCase());

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createPurchase(b),
    onSuccess: () => {
      toast.success(
        entryType === 'METAL'
          ? 'Metal purchase saved! Weight added to the metal ledger.'
          : 'Purchase created! Items added to inventory with barcodes.',
      );
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['jewellery'] });
      qc.invalidateQueries({ queryKey: ['inv-summary'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
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
      qc.invalidateQueries({ queryKey: ['accounts'] });
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
      setEntryType((full.entryType || 'ORNAMENT').toUpperCase() === 'METAL' ? 'METAL' : 'ORNAMENT');
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
        metalLedgerAccountId: i.metalLedgerAccountId || '',
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
    setEntryType('ORNAMENT');
    setForm({ supplierId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().split('T')[0], paidAmount: 0, paymentMode: 'CASH', accountId: '', notes: '', location: '' });
  };

  // Ctrl/Cmd+A → new purchase
  useAppShortcut('app:add', () => { resetForm(); setShowCreate(true); });

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  // Item line value
  // Net weight of the line being keyed in — this is what leaves the metal ledger
  const netWeightOfForm = calcNet(itemForm.grossWeight, itemForm.stoneWeight, itemForm.otherWeight);
  const itemValue = (i: any) => (i.netWeight || 0) * (i.rate || 0) + (i.makingCharges || 0) + (i.stoneCharges || 0) + (i.otherCharges || 0);
  const totalItemsWeight = items.reduce((s, i) => s + (i.netWeight || 0), 0);
  const totalItemsGross = items.reduce((s, i) => s + (i.grossWeight || 0), 0);
  const totalItemsAmount = items.reduce((s, i) => s + itemValue(i), 0);
  const totalAmount = totalItemsAmount;
  const balanceAmount = Math.max(0, totalAmount - (form.paidAmount || 0));

  const isMetalEntry = entryType === 'METAL';

  const addItem = () => {
    if (isMetalEntry) {
      if (!itemForm.grossWeight) {
        toast.error('Enter the weight in grams');
        return;
      }
      setItems([...items, { ...itemForm, netWeight: itemForm.grossWeight, quantity: 1 }]);
    } else {
      if (!itemForm.designCode || !itemForm.netWeight) {
        toast.error('Fill design code and net weight');
        return;
      }
      setItems([...items, { ...itemForm }]);
    }
    setItemForm({ ...emptyItem(), metalType: itemForm.metalType, purity: itemForm.purity, rate: itemForm.rate, metalLedgerAccountId: itemForm.metalLedgerAccountId });
  };

  const updateLine = (idx: number, patch: any) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const save = () => {
    if (!form.supplierId) { toast.error('Select a supplier'); return; }
    if (items.length === 0) { toast.error('Add at least one item'); return; }
    const body = {
      ...form,
      entryType,
      items: items.map(({ id, ...rest }) => rest),
    };
    if (editingId) updateMutation.mutate({ id: editingId, body });
    else createMutation.mutate(body);
  };

  const metalAccountName = (id: string) => metalAccounts.find((a: any) => a.id === id)?.name || '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="page-title">Purchases</h1><p className="text-gray-500 text-sm mt-1">Metal (bullion) purchases add weight to a metal ledger — ornament purchases add items to inventory and deduct their net weight (gross − stone − other) from it</p></div>
        <button onClick={() => { resetForm(); setShowCreate(true); }} className="btn-primary"><Plus className="w-4 h-4" /> New Purchase</button>
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Search by invoice number..." className="input-field pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Purchase List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="table-wrap">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Invoice No</th><th className="table-header">Type</th><th className="table-header">Supplier</th><th className="table-header">Date</th>
            <th className="table-header">Metal</th><th className="table-header text-right">Weight</th>
            <th className="table-header text-right">Amount</th><th className="table-header text-right">Paid</th><th className="table-header text-right">Balance</th>
            <th className="table-header text-right">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={10} className="text-center py-12 text-gray-400">Loading...</td></tr> :
             data?.items?.length === 0 ? <tr><td colSpan={10} className="text-center py-12 text-gray-400">No purchases found</td></tr> :
             data?.items?.map((p: any) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell font-medium">{p.invoiceNumber}</td>
                <td className="table-cell">
                  <span className={'badge text-[10px] ' + ((p.entryType || 'ORNAMENT') === 'METAL' ? 'bg-amber-100 text-amber-800' : 'bg-primary-50 text-primary-700')}>
                    {(p.entryType || 'ORNAMENT') === 'METAL' ? 'Metal' : 'Ornament'}
                  </span>
                </td>
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
        </div>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 p-4 sm:p-6 max-h-[90vh] overflow-y-auto modal-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">Purchase {viewing.invoiceNumber}</h3>
                <span className={'badge text-[10px] ' + ((viewing.entryType || 'ORNAMENT') === 'METAL' ? 'bg-amber-100 text-amber-800' : 'bg-primary-50 text-primary-700')}>
                  {(viewing.entryType || 'ORNAMENT') === 'METAL' ? 'Metal purchase' : 'Ornament purchase'}
                </span>
              </div>
              <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
              <div><p className="text-xs text-gray-400">Supplier</p><p className="font-medium">{viewing.supplier?.name || '—'}</p></div>
              <div><p className="text-xs text-gray-400">Invoice Date</p><p className="font-medium">{new Date(viewing.invoiceDate).toLocaleDateString('en-IN')}</p></div>
              <div><p className="text-xs text-gray-400">Total</p><p className="font-medium">{fm(viewing.totalAmount)}</p></div>
              <div><p className="text-xs text-gray-400">Paid / Balance</p><p className="font-medium text-green-600">{fm(viewing.paidAmount)}</p><p className="text-red-600">{viewing.balanceAmount > 0 ? fm(viewing.balanceAmount) : 'Settled'}</p></div>
            </div>
            <div className="border rounded-xl overflow-hidden mb-4">
              <div className="table-wrap">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2 text-gray-500">Design</th>
                  <th className="text-left px-3 py-2 text-gray-500">Metal</th>
                  <th className="text-left px-3 py-2 text-gray-500">Purity</th>
                  <th className="text-left px-3 py-2 text-gray-500">Metal ledger</th>
                  <th className="text-right px-3 py-2 text-gray-500">Gross</th>
                  <th className="text-right px-3 py-2 text-gray-500">Net</th>
                  <th className="text-right px-3 py-2 text-gray-500">Rate</th>
                  <th className="text-right px-3 py-2 text-gray-500">Value</th>
                </tr></thead>
                <tbody>
                  {(viewing.items || []).map((i: any, idx: number) => (
                    <tr key={idx} className="border-b border-gray-50">
                      <td className="px-3 py-2 font-medium">{i.designCode}{i.ornament ? ` · ${i.ornament}` : ''}</td>
                      <td className="px-3 py-2">{i.metalType}</td>
                      <td className="px-3 py-2">{i.purity}</td>
                      <td className="px-3 py-2 text-xs">{metalAccountName(i.metalLedgerAccountId) || '—'}</td>
                      <td className="px-3 py-2 text-right">{i.grossWeight?.toFixed?.(3) ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{i.netWeight?.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right">{fm(i.rate)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fm((i.netWeight || 0) * (i.rate || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 p-4 sm:p-6 max-h-[92vh] overflow-y-auto modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingId ? 'Edit Purchase' : 'New Purchase'} — Material Entry (multiple metals)</h3>

            {/* Purchase type: raw metal (bullion) or finished ornament */}
            <div className="mb-5">
              <label className="label">What are you purchasing?</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setEntryType('METAL'); setItemForm({ ...emptyItem(), rate: getRateForPurity(itemForm.purity) }); setItems([]); }}
                  className={'text-left border rounded-xl p-3 transition-all ' + (isMetalEntry ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-gray-200 hover:border-gray-300')}
                >
                  <div className="flex items-center gap-2 font-semibold text-sm"><Gem className="w-4 h-4 text-amber-600" /> Metal / Bullion</div>
                  <p className="text-[11px] text-gray-500 mt-1">Raw metal (coin, bar, scrap). The weight is <strong>added</strong> to the metal ledger of that metal + purity — no inventory item is created.</p>
                </button>
                <button
                  type="button"
                  onClick={() => { setEntryType('ORNAMENT'); setItemForm(emptyItem()); setItems([]); }}
                  className={'text-left border rounded-xl p-3 transition-all ' + (!isMetalEntry ? 'border-primary-400 bg-primary-50 ring-2 ring-primary-200' : 'border-gray-200 hover:border-gray-300')}
                >
                  <div className="flex items-center gap-2 font-semibold text-sm"><Package className="w-4 h-4 text-primary-600" /> Ornament / Jewellery</div>
                  <p className="text-[11px] text-gray-500 mt-1">Readymade pieces. Each line is barcoded into inventory and its <strong>net weight (gross − stone − other) is deducted</strong> from the metal ledger you select.</p>
                </button>
              </div>
            </div>

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
              {!isMetalEntry && (
                <div><label className="label">Storage Location</label>
                  <input className="input-field" value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Showcase A1" /></div>
              )}
              <div><label className="label">Notes</label>
                <input className="input-field" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Any note" /></div>
            </div>

            {/* Item Entry */}
            <div className="border rounded-xl p-4 mb-4 bg-gray-50">
              <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                {isMetalEntry ? <><Gem className="w-4 h-4 text-amber-600" /> Metal line</> : <><Plus className="w-4 h-4" /> Ornament line</>}
              </h4>

              {isMetalEntry ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="label">Metal</label>
                    <select className="input-field text-xs" value={itemForm.metalType}
                      onChange={e => {
                        const metalType = e.target.value;
                        setItemForm({ ...itemForm, metalType, metalLedgerAccountId: autoMetalAccount(metalType, itemForm.purity)?.id || '' });
                      }}>
                      {(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Purity</label>
                    <select className="input-field text-xs" value={itemForm.purity}
                      onChange={e => {
                        const purity = e.target.value;
                        setItemForm({ ...itemForm, purity, rate: getRateForPurity(purity), metalLedgerAccountId: autoMetalAccount(itemForm.metalType, purity)?.id || '' });
                      }}>
                      {(settings?.allPurities || ['24K', '22K', '18K', 'SILVER_999', 'SILVER_925']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Weight (g) *</label>
                    <input type="number" step="0.001" className="input-field text-xs" value={itemForm.grossWeight || ''} onChange={e => setItemForm({...itemForm, grossWeight: Number(e.target.value)})} placeholder="0.000" />
                  </div>
                  <div>
                    <label className="label">Rate / g (₹)</label>
                    <input type="number" className="input-field text-xs" value={itemForm.rate || ''} onChange={e => setItemForm({...itemForm, rate: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="label">Metal ledger</label>
                    <select className="input-field text-xs" value={itemForm.metalLedgerAccountId} onChange={e => setItemForm({...itemForm, metalLedgerAccountId: e.target.value})}>
                      <option value="">Auto — {autoMetalAccount(itemForm.metalType, itemForm.purity)?.name || `${itemForm.metalType} ${itemForm.purity} (will be created)`}</option>
                      {metalAccounts.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.name} · {(Number(a.grams) || 0).toFixed(3)} g</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Description (optional)</label>
                    <input className="input-field text-xs" value={itemForm.designCode} onChange={e => setItemForm({...itemForm, designCode: e.target.value})} placeholder="Gold bar 24K / coin / scrap" />
                  </div>
                  <div className="md:col-span-3 flex items-end">
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 w-full">
                      Value <strong>{fm((itemForm.grossWeight || 0) * (itemForm.rate || 0))}</strong> — on save {(itemForm.grossWeight || 0).toFixed(3)} g is added to{' '}
                      <strong>{metalAccountName(itemForm.metalLedgerAccountId) || autoMetalAccount(itemForm.metalType, itemForm.purity)?.name || `${itemForm.metalType} ${itemForm.purity}`}</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div className="md:col-span-2"><label className="label">Design Code *</label>
                      <input className="input-field text-xs" value={itemForm.designCode} onChange={e => setItemForm({...itemForm, designCode: e.target.value})} placeholder="RING-001" /></div>
                    <div>
                      <label className="label">Metal</label>
                      <select className="input-field text-xs" value={itemForm.metalType}
                        onChange={e => {
                          const metalType = e.target.value;
                          setItemForm({ ...itemForm, metalType, metalLedgerAccountId: autoMetalAccount(metalType, itemForm.purity)?.id || '' });
                        }}>
                        {(settings?.allMetals || ['GOLD', 'SILVER']).map((m: string) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Purity</label>
                      <select className="input-field text-xs" value={itemForm.purity} onChange={e => { const purity = e.target.value; setItemForm({...itemForm, purity, rate: getRateForPurity(purity), metalLedgerAccountId: autoMetalAccount(itemForm.metalType, purity)?.id || ''}); }}>
                        {(settings?.allPurities || ['24K', '22K', '18K', 'SILVER_999', 'SILVER_925']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}
                      </select>
                    </div>
                    <div><label className="label">HSN Code</label>
                      <input className="input-field text-xs" value={itemForm.hsnCode} onChange={e => setItemForm({...itemForm, hsnCode: e.target.value})} /></div>
                    <div><label className="label">Category</label>
                      <input className="input-field text-xs" value={itemForm.category} onChange={e => setItemForm({...itemForm, category: e.target.value})} placeholder="Ring" /></div>
                    <div><label className="label">Sub Category</label>
                      <input className="input-field text-xs" value={itemForm.subCategory} onChange={e => setItemForm({...itemForm, subCategory: e.target.value})} /></div>
                    <div>
                      <label className="label">Ornament (master)</label>
                      <select className="input-field text-xs" value={itemForm.ornament} onChange={e => {
                        const o = ornamentList.find((x: any) => x.name === e.target.value);
                        setItemForm({ ...itemForm, ornament: e.target.value, ornamentGender: o?.gender || '' });
                      }}>
                        <option value="">— none —</option>
                        {ornamentList.map((o: any) => (
                          <option key={o.id} value={o.name}>
                            {o.name}{o.gender === 'MALE' ? ' (Male)' : o.gender === 'FEMALE' ? ' (Female)' : ' (Unisex)'}{ornamentStockLabel(o)}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-400 mt-0.5">Stock from inventory for {itemForm.metalType} {itemForm.purity}</p>
                    </div>
                    <div>
                      <label className="label">Ornament For</label>
                      <select className="input-field text-xs" value={itemForm.ornamentGender} onChange={e => setItemForm({...itemForm, ornamentGender: e.target.value})}>
                        <option value="">—</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="UNISEX">Unisex</option>
                      </select>
                    </div>
                    <div><label className="label">Gross (g)</label>
                      <input type="number" step="0.001" className="input-field text-xs" value={itemForm.grossWeight || ''} onChange={e => {
                        const grossWeight = Number(e.target.value);
                        setItemForm({ ...itemForm, grossWeight, netWeight: calcNet(grossWeight, itemForm.stoneWeight) });
                      }} /></div>
                    <div><label className="label">Stone (g)</label>
                      <input type="number" step="0.001" className="input-field text-xs" value={itemForm.stoneWeight || ''} onChange={e => {
                        const stoneWeight = Number(e.target.value);
                        setItemForm({ ...itemForm, stoneWeight, netWeight: calcNet(itemForm.grossWeight, stoneWeight) });
                      }} /></div>
                    <div>
                      <label className="label">Net (g) <span className="text-gray-400">auto</span></label>
                      <input type="number" step="0.001" className="input-field text-xs bg-gray-100" value={itemForm.netWeight || ''} readOnly
                        title="Net Weight = Gross Weight − Stone Weight" />
                      <p className="text-[10px] text-gray-400 mt-0.5">Gross − stone</p>
                    </div>
                    <div><label className="label">Rate/g (₹) *</label>
                      <input type="number" className="input-field text-xs" value={itemForm.rate || ''} onChange={e => setItemForm({...itemForm, rate: Number(e.target.value)})} /></div>
                    <div><label className="label">Qty</label>
                      <input type="number" className="input-field text-xs" value={itemForm.quantity || 1} onChange={e => setItemForm({...itemForm, quantity: Number(e.target.value)})} /></div>
                    <div>
                      <label className="label">Metal ledger</label>
                      <select className="input-field text-xs" value={itemForm.metalLedgerAccountId} onChange={e => pickLineMetalLedger(e.target.value)}>
                        <option value="">{autoMetalAccount(itemForm.metalType, itemForm.purity) ? `Auto — ${autoMetalAccount(itemForm.metalType, itemForm.purity)?.name}` : '— no deduction —'}</option>
                        {metalAccounts.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.name} · {(Number(a.grams) || 0).toFixed(3)} g</option>
                        ))}
                      </select>
                    </div>
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
                  {!autoMetalAccount(itemForm.metalType, itemForm.purity) && metalAccounts.length === 0 && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                      No metal ledger exists yet — create one in <strong>Ledger → Accounts → Add Account → Metal / Material</strong> to track metal issued for ornaments.
                    </p>
                  )}
                  <p className="text-[11px] text-gray-500 mt-3">
                    Saving deducts the <strong>net weight ({netWeightOfForm.toFixed(3)} g)</strong> — gross {fmtG(itemForm.grossWeight)} − stone {fmtG(itemForm.stoneWeight)} − other {fmtG(itemForm.otherWeight)} — from{' '}
                    <strong>{metalAccountName(itemForm.metalLedgerAccountId) || autoMetalAccount(itemForm.metalType, itemForm.purity)?.name || 'no ledger'}</strong>.
                  </p>
                </>
              )}
              <button onClick={addItem} className="btn-secondary mt-3 text-xs"><Plus className="w-3 h-3" /> Add {isMetalEntry ? 'Metal' : 'Item'} to Purchase</button>
            </div>

            {items.length > 0 && (
              <div className="mb-4">
                <div className="table-wrap">
                <table className="w-full text-sm">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 text-gray-500">Design</th>
                    <th className="text-left py-2 text-gray-500">Metal</th>
                    <th className="text-left py-2 text-gray-500">Purity</th>
                    <th className="text-left py-2 text-gray-500">Metal ledger</th>
                    <th className="text-right py-2 text-gray-500">Gross</th>
                    <th className="text-right py-2 text-gray-500">Net</th>
                    <th className="text-right py-2 text-gray-500">Rate</th>
                    <th className="text-right py-2 text-gray-500">Value</th>
                    <th></th>
                  </tr></thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={item.id} className="border-b border-gray-50">
                        <td className="py-2 font-medium">{item.designCode || '—'}</td>
                        <td className="py-2">{item.metalType}</td>
                        <td className="py-2">{item.purity}</td>
                        <td className="py-2 text-xs">{metalAccountName(item.metalLedgerAccountId) || autoMetalAccount(item.metalType, item.purity)?.name || '—'}</td>
                        <td className="py-2 text-right">{item.grossWeight?.toFixed?.(3)}</td>
                        <td className="py-2 text-right">{item.netWeight?.toFixed?.(3)}</td>
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
                </div>
                <div className="flex justify-between items-center mt-3 p-3 bg-green-50 rounded-lg">
                  <span className="font-medium text-green-800 flex items-center gap-3">
                    <span>Total Weight: <strong>{totalItemsWeight.toFixed(3)} g</strong></span>
                    {!isMetalEntry && <span className="text-green-700/80">Gross: <strong>{totalItemsGross.toFixed(3)} g</strong></span>}
                    {isMetalEntry && <span className="text-amber-700 flex items-center gap-1"><Scale className="w-3.5 h-3.5" /> added to metal ledger</span>}
                  </span>
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
                {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editingId ? 'Update Purchase' : isMetalEntry ? 'Save Metal Purchase' : 'Create Purchase & Add to Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

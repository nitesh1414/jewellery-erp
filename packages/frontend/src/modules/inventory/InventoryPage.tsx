import { humanize } from '../../utils/format';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { Package, Filter, AlertTriangle, TrendingUp, RotateCcw, ArrowRight, Search, Gem, Layers } from 'lucide-react';
import { puritiesForMetal, formatPurity, formatGrams, metalKey } from '../../utils/metalPurity';

export default function InventoryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'balance' | 'transactions' | 'valuation' | 'alerts'>('balance');
  const [txPage, setTxPage] = useState(1);
  const [txType, setTxType] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ jewelleryItemId: '', adjustmentType: 'WEIGHT', newWeight: 0, newQuantity: 0, newRate: 0, newStatus: '', newLocation: '', reason: '' });

  const { data: summary } = useQuery({ queryKey: ['inv-summary'], queryFn: () => api.getInventorySummary() });
  const { data: stock } = useQuery({ queryKey: ['inv-stock'], queryFn: () => api.getInventoryStock() });
  const { data: metalStock } = useQuery({ queryKey: ['inv-metal-stock'], queryFn: () => api.getInventoryMetalStock() });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });
  const { data: transactions } = useQuery({ queryKey: ['inv-tx', txPage, txType], queryFn: () => api.getStockTransactions({ page: txPage, limit: 20, transactionType: txType }) });
  const { data: valuation } = useQuery({ queryKey: ['inv-valuation'], queryFn: () => api.get('/inventory/valuation') });
  const { data: alerts } = useQuery({ queryKey: ['inv-alerts'], queryFn: () => api.getLowStockAlerts() });

  const adjustMutation = useMutation({
    mutationFn: (b: any) => api.post('/inventory/adjust', b),
    onSuccess: () => { toast.success('Stock adjusted!'); qc.invalidateQueries(); setShowAdjust(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  // Every metal + purity with the stock available in grams (metals/purities that
  // hold nothing are listed too, so the sheet is complete).
  const stockByKey = new Map<string, any>(
    (stock?.stock || []).map((s: any) => [metalKey(s.metalType, s.purity), s]),
  );
  const metalsInUse = new Set<string>([
    ...(stock?.stock || []).map((s: any) => String(s.metalType || '').toUpperCase()),
    ...((metalStock?.items || []) as any[]).map((m: any) => String(m.metalType || '').toUpperCase()),
  ]);
  const allMetals: string[] = Array.from(new Set([
    ...((settings?.allMetals || []) as string[]).map((m: string) => m.toUpperCase()),
    ...metalsInUse,
  ])).filter(Boolean).sort();
  const allPurities: string[] = (settings?.allPurities || []) as string[];

  const allPurityRows = allMetals.flatMap((metal) => {
    const used = Array.from(new Set([
      ...(stock?.stock || []).filter((s: any) => String(s.metalType || '').toUpperCase() === metal).map((s: any) => s.purity),
      ...((metalStock?.items || []) as any[]).filter((m: any) => String(m.metalType || '').toUpperCase() === metal).map((m: any) => m.purity),
    ]));
    return puritiesForMetal(metal, allPurities, used).map((purity) => {
      const row = stockByKey.get(metalKey(metal, purity));
      return {
        key: metalKey(metal, purity),
        metal,
        purity,
        metalGrams: Number(row?.metalWeight || 0),
        ornamentGrams: Number(row?.ornamentWeight || 0),
        total: Number(row?.totalWeight || 0),
      };
    });
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="page-title">Inventory</h1><p className="text-gray-500 text-sm mt-1">Stock ledger, balances, and movement tracking</p></div>
        <button onClick={() => setShowAdjust(true)} className="btn-primary"><RotateCcw className="w-4 h-4" /> Adjust Stock</button>
      </div>

      {/* Summary Cards */}
      <div className="grid stat-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="stat-card"><p className="stat-label">Total Pieces</p><p className="stat-value">{summary?.totalPieces || 0}</p></div>
        <div className="stat-card"><p className="stat-label">Gold Stock</p><p className="stat-value">{(summary?.totalGoldWeight || 0).toFixed(2)}g</p></div>
        <div className="stat-card"><p className="stat-label">Silver Stock</p><p className="stat-value">{(summary?.totalSilverWeight || 0).toFixed(2)}g</p></div>
        <div className="stat-card"><p className="stat-label">Stock Value</p><p className="stat-value">{fm(summary?.totalValue)}</p></div>
        <div className="stat-card"><p className="stat-label">Est. Profit</p><p className="stat-value text-green-600">{fm(summary?.estimatedProfit)}</p></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit max-w-full overflow-x-auto">
        {(['balance', 'transactions', 'valuation', 'alerts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={'px-4 py-2 text-sm font-medium rounded-md transition-all ' + (tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
            {t === 'balance' ? 'Stock Balance' : t === 'transactions' ? 'Transactions' : t === 'valuation' ? 'Valuation' : 'Low Stock'}
          </button>
        ))}
      </div>

      {/* Stock Balance Tab */}
      {tab === 'balance' && (
        <div className="space-y-4">
          {/* Metal & purity stock at a glance (all metals, including empty ones) */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title flex items-center gap-2"><Gem className="w-4 h-4 text-amber-600" /> Metal &amp; purity stock</h3>
              <span className="text-xs text-gray-400">Stock available in grams — metal ledger + ornaments</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
              {allPurityRows.map((row) => (
                <div key={row.key}
                  className={'rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ' + (row.total > 0 ? 'bg-amber-50/50 border-amber-200' : 'bg-gray-50 border-gray-200')}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.metal.replace(/_/g, ' ')}</p>
                    <p className="text-[11px] text-gray-500 truncate">{formatPurity(row.purity)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={'text-sm font-bold ' + (row.total > 0 ? 'text-amber-800' : 'text-gray-400')}>{formatGrams(row.total)} g</p>
                    {(row.metalGrams > 0 || row.ornamentGrams > 0) && (
                      <p className="text-[10px] text-gray-500">
                        {row.metalGrams > 0 ? `metal ${formatGrams(row.metalGrams)}` : ''}
                        {row.metalGrams > 0 && row.ornamentGrams > 0 ? ' · ' : ''}
                        {row.ornamentGrams > 0 ? `orn ${formatGrams(row.ornamentGrams)}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {allPurityRows.length === 0 && (
                <p className="text-sm text-gray-400 col-span-full">Add metals &amp; purities in Settings to see the full stock list.</p>
              )}
            </div>
          </div>

          {/* Combined stock table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center gap-2 text-sm text-gray-600">
              <Layers className="w-4 h-4 text-gray-400" />
              Metal / material stock comes from the metal ledger accounts, ornament stock from jewellery items in stock.
            </div>
            <div className="table-wrap">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50">
                <th className="table-header">Metal</th><th className="table-header">Purity</th>
                <th className="table-header">Source</th>
                <th className="table-header text-right">Metal / material (g)</th>
                <th className="table-header text-right">Ornament (g)</th>
                <th className="table-header text-right">Available (g)</th>
                <th className="table-header text-right">Pieces</th>
                <th className="table-header text-right">Current Value</th>
              </tr></thead>
              <tbody>
                {stock?.stock?.map((s: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-medium">
                      <span className={'badge ' + (s.metalType === 'GOLD' ? 'badge-warning' : 'badge-gray')}>{s.metalType}</span>
                    </td>
                    <td className="table-cell">{formatPurity(s.purity)}</td>
                    <td className="table-cell text-xs text-gray-500">
                      {s.ledgerAccountName ? (
                        <span className="inline-flex items-center gap-1"><Gem className="w-3 h-3 text-amber-500" /> {s.ledgerAccountName}</span>
                      ) : '—'}
                    </td>
                    <td className="table-cell text-right">{s.metalWeight ? formatGrams(s.metalWeight) : '—'}</td>
                    <td className="table-cell text-right">{s.ornamentWeight ? formatGrams(s.ornamentWeight) : '—'}</td>
                    <td className="table-cell text-right font-bold">{formatGrams(s.totalWeight)}</td>
                    <td className="table-cell text-right">{s.pieceCount || '—'}</td>
                    <td className="table-cell text-right">{fm(s.totalValue)}</td>
                  </tr>
                ))}
                {(!stock?.stock || stock.stock.length === 0) && (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">No stock yet — add metal ledgers or purchase stock</td></tr>
                )}
                {stock?.grandTotal && (
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={3} className="table-cell">Total</td>
                    <td className="table-cell text-right">{formatGrams(stock.grandTotal.metalWeight || 0)}</td>
                    <td className="table-cell text-right">{formatGrams(stock.grandTotal.ornamentWeight || 0)}</td>
                    <td className="table-cell text-right">{formatGrams(stock.grandTotal.totalWeight || 0)}</td>
                    <td className="table-cell text-right">{stock.grandTotal.totalPieces}</td>
                    <td className="table-cell text-right">{fm(stock.grandTotal.totalValue)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {tab === 'transactions' && (
        <div>
          <div className="flex gap-3 mb-4">
            <select className="input-field w-48" value={txType} onChange={e => { setTxType(e.target.value); setTxPage(1); }}>
              <option value="">All Types</option>
              <option value="PURCHASE">Purchase</option>
              <option value="SALE">Sale</option>
              <option value="SALE_RETURN">Sale Return</option>
              <option value="TRANSFER">Transfer</option>
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="MANUFACTURING_ISSUE">Mfg Issue</option>
              <option value="MANUFACTURING_RETURN">Mfg Return</option>
            </select>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="table-wrap">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50">
                <th className="table-header">Date</th><th className="table-header">Type</th><th className="table-header">Metal</th>
                <th className="table-header">Purity</th><th className="table-header text-right">Weight</th>
                <th className="table-header text-right">Qty</th><th className="table-header text-right">Value</th>
                <th className="table-header">Reference</th><th className="table-header">Notes</th>
              </tr></thead>
              <tbody>
                {transactions?.items?.map((tx: any) => (
                  <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell text-sm">{new Date(tx.createdAt).toLocaleString('en-IN')}</td>
                    <td className="table-cell">
                      <span className={'badge ' + (tx.transactionType === 'PURCHASE' ? 'badge-success' : tx.transactionType === 'SALE' ? 'badge-danger' : tx.transactionType === 'TRANSFER' ? 'badge-info' : 'badge-gray')}>
                        {humanize(tx.transactionType)}
                      </span>
                    </td>
                    <td className="table-cell">{tx.metalType}</td>
                    <td className="table-cell">{tx.purity}</td>
                    <td className={'table-cell text-right font-medium ' + (tx.weight >= 0 ? 'text-green-600' : 'text-red-600')}>
                      {tx.weight > 0 ? '+' : ''}{tx.weight?.toFixed(3)}
                    </td>
                    <td className="table-cell text-right">{tx.quantity}</td>
                    <td className="table-cell text-right">{fm(tx.value)}</td>
                    <td className="table-cell text-xs text-gray-500">{tx.reference || '—'}</td>
                    <td className="table-cell text-xs text-gray-400 max-w-xs truncate">{tx.notes || '—'}</td>
                  </tr>
                ))}
                {(!transactions?.items || transactions.items.length === 0) && (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">No transactions found</td></tr>
                )}
              </tbody>
            </table>
            </div>
            {transactions && transactions.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-gray-500">Page {txPage} of {transactions.totalPages}</span>
                <div className="flex flex-wrap gap-2">
                  <button disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)} className="btn-secondary text-sm py-1">Prev</button>
                  <button disabled={txPage >= transactions.totalPages} onClick={() => setTxPage(p => p + 1)} className="btn-secondary text-sm py-1">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Valuation Tab */}
      {tab === 'valuation' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card col-span-2">
            <h3 className="section-title mb-4">Stock Valuation Summary</h3>
            <div className="space-y-4">
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg"><span>Total Items</span><span className="font-bold">{valuation?.totalItems || 0}</span></div>
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg"><span>Total Weight</span><span className="font-bold">{(valuation?.totalWeight || 0).toFixed(3)} g</span></div>
              <div className="flex justify-between p-3 bg-green-50 rounded-lg"><span>Current Value</span><span className="font-bold text-green-700">{fm(valuation?.totalCurrentValue)}</span></div>
              <div className="flex justify-between p-3 bg-orange-50 rounded-lg"><span>Purchase Value</span><span className="font-bold text-orange-700">{fm(valuation?.totalPurchaseValue)}</span></div>
              <div className="flex justify-between p-3 bg-blue-50 rounded-lg"><span>Unrealized P&L</span><span className={'font-bold ' + ((valuation?.unrealizedProfit || 0) >= 0 ? 'text-green-700' : 'text-red-700')}>{fm(valuation?.unrealizedProfit)}</span></div>
            </div>
          </div>
          <div className="card">
            <h3 className="section-title mb-4">By Metal</h3>
            {valuation?.byMetal && Object.entries(valuation.byMetal).map(([metal, v]: [string, any]) => (
              <div key={metal} className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="font-semibold text-gray-900">{metal}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="flex justify-between"><span>Weight</span><span>{v.weight.toFixed(3)} g</span></p>
                  <p className="flex justify-between"><span>Value</span><span>{fm(v.value)}</span></p>
                  <p className="flex justify-between"><span>Items</span><span>{v.count}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Low Stock Alerts */}
      {tab === 'alerts' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-orange-50 border-b border-orange-200 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <span className="font-medium text-orange-800">{alerts?.totalItems || 0} items with low stock (≤ {alerts?.threshold || 2})</span>
          </div>
          <div className="table-wrap">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="table-header">Barcode</th><th className="table-header">Design</th><th className="table-header">Purity</th>
              <th className="table-header text-right">Qty</th><th className="table-header text-right">Weight</th><th className="table-header text-right">Value</th>
            </tr></thead>
            <tbody>
              {alerts?.alerts?.map((a: any) => (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-cell font-mono text-xs">{a.barcode}</td>
                  <td className="table-cell font-medium">{a.designCode}</td>
                  <td className="table-cell">{a.purity}</td>
                  <td className="table-cell text-right">
                    <span className="badge-danger">{a.currentQuantity}</span>
                  </td>
                  <td className="table-cell text-right">{a.netWeight?.toFixed(3)}</td>
                  <td className="table-cell text-right">{fm(a.value)}</td>
                </tr>
              ))}
              {(!alerts?.alerts || alerts.alerts.length === 0) && (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">No low stock alerts</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjust && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAdjust(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-4 sm:p-5 modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Adjust Stock</h3>
            <div className="space-y-4">
              <div><label className="label">Jewellery Item Barcode or ID</label>
                <input className="input-field" placeholder="Scan barcode..." value={adjustForm.jewelleryItemId}
                  onChange={e => setAdjustForm({...adjustForm, jewelleryItemId: e.target.value})} /></div>
              <div><label className="label">Adjustment Type</label>
                <select className="input-field" value={adjustForm.adjustmentType}
                  onChange={e => setAdjustForm({...adjustForm, adjustmentType: e.target.value})}>
                  <option value="WEIGHT">Weight</option><option value="QUANTITY">Quantity</option>
                  <option value="VALUE">Rate/Value</option><option value="STATUS">Status</option>
                  <option value="LOCATION">Location</option>
                </select></div>
              {adjustForm.adjustmentType === 'WEIGHT' && (
                <div><label className="label">New Net Weight (g)</label>
                  <input type="number" step="0.001" className="input-field" value={adjustForm.newWeight || ''}
                    onChange={e => setAdjustForm({...adjustForm, newWeight: Number(e.target.value)})} /></div>
              )}
              {adjustForm.adjustmentType === 'QUANTITY' && (
                <div><label className="label">New Quantity</label>
                  <input type="number" className="input-field" value={adjustForm.newQuantity || ''}
                    onChange={e => setAdjustForm({...adjustForm, newQuantity: Number(e.target.value)})} /></div>
              )}
              {adjustForm.adjustmentType === 'VALUE' && (
                <div><label className="label">New Rate/g (₹)</label>
                  <input type="number" className="input-field" value={adjustForm.newRate || ''}
                    onChange={e => setAdjustForm({...adjustForm, newRate: Number(e.target.value)})} /></div>
              )}
              {adjustForm.adjustmentType === 'STATUS' && (
                <div><label className="label">New Status</label>
                  <select className="input-field" value={adjustForm.newStatus}
                    onChange={e => setAdjustForm({...adjustForm, newStatus: e.target.value})}>
                    <option value="">Select...</option>
                    <option value="IN_STOCK">In Stock</option><option value="RESERVED">Reserved</option>
                    <option value="IN_REPAIR">In Repair</option><option value="IN_MANUFACTURING">In Manufacturing</option>
                    <option value="MELTED">Melted</option><option value="SCRAPPED">Scrapped</option>
                  </select></div>
              )}
              <div><label className="label">Reason *</label>
                <input className="input-field" placeholder="Required..." value={adjustForm.reason}
                  onChange={e => setAdjustForm({...adjustForm, reason: e.target.value})} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
              <button onClick={() => setShowAdjust(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!adjustForm.reason) { toast.error('Reason is required'); return; }
                adjustMutation.mutate(adjustForm);
              }} disabled={adjustMutation.isPending} className="btn-primary">
                {adjustMutation.isPending ? 'Adjusting...' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
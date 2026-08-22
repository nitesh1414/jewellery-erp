import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { Package, Filter, AlertTriangle, TrendingUp, RotateCcw, ArrowRight, Search } from 'lucide-react';

export default function InventoryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'balance' | 'transactions' | 'valuation' | 'alerts'>('balance');
  const [txPage, setTxPage] = useState(1);
  const [txType, setTxType] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ jewelleryItemId: '', adjustmentType: 'WEIGHT', newWeight: 0, newQuantity: 0, newRate: 0, newStatus: '', newLocation: '', reason: '' });

  const { data: summary } = useQuery({ queryKey: ['inv-summary'], queryFn: () => api.getInventorySummary() });
  const { data: stock } = useQuery({ queryKey: ['inv-stock'], queryFn: () => api.getInventoryStock() });
  const { data: transactions } = useQuery({ queryKey: ['inv-tx', txPage, txType], queryFn: () => api.getStockTransactions({ page: txPage, limit: 20, transactionType: txType }) });
  const { data: valuation } = useQuery({ queryKey: ['inv-valuation'], queryFn: () => api.get('/inventory/valuation') });
  const { data: alerts } = useQuery({ queryKey: ['inv-alerts'], queryFn: () => api.getLowStockAlerts() });

  const adjustMutation = useMutation({
    mutationFn: (b: any) => api.post('/inventory/adjust', b),
    onSuccess: () => { toast.success('Stock adjusted!'); qc.invalidateQueries(); setShowAdjust(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Inventory</h1><p className="text-gray-500 text-sm mt-1">Stock ledger, balances, and movement tracking</p></div>
        <button onClick={() => setShowAdjust(true)} className="btn-primary"><RotateCcw className="w-4 h-4" /> Adjust Stock</button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="stat-card"><p className="stat-label">Total Pieces</p><p className="stat-value">{summary?.totalPieces || 0}</p></div>
        <div className="stat-card"><p className="stat-label">Gold Stock</p><p className="stat-value">{(summary?.totalGoldWeight || 0).toFixed(2)}g</p></div>
        <div className="stat-card"><p className="stat-label">Silver Stock</p><p className="stat-value">{(summary?.totalSilverWeight || 0).toFixed(2)}g</p></div>
        <div className="stat-card"><p className="stat-label">Stock Value</p><p className="stat-value">{fm(summary?.totalValue)}</p></div>
        <div className="stat-card"><p className="stat-label">Est. Profit</p><p className="stat-value text-green-600">{fm(summary?.estimatedProfit)}</p></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {(['balance', 'transactions', 'valuation', 'alerts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={'px-4 py-2 text-sm font-medium rounded-md transition-all ' + (tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
            {t === 'balance' ? 'Stock Balance' : t === 'transactions' ? 'Transactions' : t === 'valuation' ? 'Valuation' : 'Low Stock'}
          </button>
        ))}
      </div>

      {/* Stock Balance Tab */}
      {tab === 'balance' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="table-header">Metal</th><th className="table-header">Purity</th>
              <th className="table-header text-right">Weight (g)</th><th className="table-header text-right">Pieces</th>
              <th className="table-header text-right">Current Value</th><th className="table-header text-right">Purchase Value</th>
            </tr></thead>
            <tbody>
              {stock?.stock?.map((s: any, i: number) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-cell font-medium">
                    <span className={'badge ' + (s.metalType === 'GOLD' ? 'badge-warning' : 'badge-gray')}>{s.metalType}</span>
                  </td>
                  <td className="table-cell">{s.purity}</td>
                  <td className="table-cell text-right font-medium">{s.totalWeight.toFixed(3)}</td>
                  <td className="table-cell text-right">{s.pieceCount}</td>
                  <td className="table-cell text-right">{fm(s.totalValue)}</td>
                  <td className="table-cell text-right text-gray-500">{fm(s.totalPurchaseValue)}</td>
                </tr>
              ))}
              {stock?.grandTotal && (
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={2} className="table-cell">Total</td>
                  <td className="table-cell text-right">{stock.grandTotal.totalWeight.toFixed(3)} g</td>
                  <td className="table-cell text-right">{stock.grandTotal.totalPieces}</td>
                  <td className="table-cell text-right">{fm(stock.grandTotal.totalValue)}</td>
                  <td className="table-cell text-right">{fm(stock.grandTotal.totalPurchaseValue)}</td>
                </tr>
              )}
            </tbody>
          </table>
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
                        {tx.transactionType}
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
            {transactions && transactions.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-gray-500">Page {txPage} of {transactions.totalPages}</span>
                <div className="flex gap-2">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
      )}

      {/* Adjust Stock Modal */}
      {showAdjust && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAdjust(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
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
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
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
import { humanize } from '../../utils/format';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, Printer, FileText, MessageCircle, HandCoins, CheckCircle, X, Pencil, ArrowRightCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BillsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [payBill, setPayBill] = useState<any>(null);
  const [payForm, setPayForm] = useState({ amount: 0, paymentMode: 'CASH', reference: '', accountId: '' });

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.getAccounts(), staleTime: 60000 });
  const activeAccounts = (Array.isArray(accounts) ? (accounts as any[]) : []).filter((a: any) => a.isActive !== false && !['INCOME', 'SALES', 'REVENUE'].includes(a.type));
  const [viewBill, setViewBill] = useState<any>(null);
  const [thermalFor, setThermalFor] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tab, setTab] = useState<'ALL' | 'BILLS' | 'ESTIMATES'>('ALL');
  const [confirmingEstimate, setConfirmingEstimate] = useState<any>(null);
  // the settlement proposed on the estimate — carried into the real bill
  const [proposed, setProposed] = useState<{ payments: any[]; urd: any[] }>({ payments: [], urd: [] });
  const [confirmForm, setConfirmForm] = useState({ billType: 'GST', amount: 0, paymentMode: 'CASH' });

  const { data, isLoading } = useQuery({
    queryKey: ['bills', search, status, tab, startDate, endDate, page],
    queryFn: () => api.getSales({
      search,
      status,
      billType: tab === 'BILLS' ? 'GST' : tab === 'ESTIMATES' ? 'ESTIMATE' : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page, limit: 20,
    }),
  });

  const confirmEstimateMutation = useMutation({
    mutationFn: ({ id, body }: any) => api.put('/sales/' + id + '/confirm', body),
    onSuccess: (d: any) => {
      toast.success('Estimate confirmed — bill ' + d.billNumber + ' generated!');
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setConfirmingEstimate(null);
      window.open('/print/sale/' + d.id + '?format=A4_GST&auto=1', '_blank');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  /** Open the confirm dialog and load what the estimate proposed. */
  const openConfirm = async (bill: any) => {
    setConfirmingEstimate(bill);
    setConfirmForm({ billType: 'GST', amount: 0, paymentMode: 'CASH' });
    setProposed({ payments: [], urd: [] });
    try {
      const full: any = await api.getSale(bill.id);
      const payments = (full?.payments || []).filter((p: any) => p.isProposed !== false);
      const urd = (full?.urdTransactions || []).filter((u: any) => u.status === 'PROPOSED');
      setProposed({ payments, urd });
      const already = payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
        + urd.reduce((s: number, u: any) => s + (Number(u.finalValue) || 0), 0);
      setConfirmForm({ billType: 'GST', amount: Math.max(0, Math.round(((Number(full?.netAmount) || bill.netAmount) - already) * 100) / 100), paymentMode: 'CASH' });
    } catch {
      setConfirmForm({ billType: 'GST', amount: bill.netAmount, paymentMode: 'CASH' });
    }
  };

  const payMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.addSalePayment(id, body),
    onSuccess: (d: any) => {
      toast.success(d.settled ? 'Bill fully settled!' : 'Payment received. Balance ₹' + (d.balanceAmount || 0).toLocaleString('en-IN'));
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setPayBill(null);
      setPayForm({ amount: 0, paymentMode: 'CASH', reference: '', accountId: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      DRAFT: 'badge-gray', CONFIRMED: 'badge-info', FINALIZED: 'badge-success',
      CANCELLED: 'badge-danger', RETURNED: 'badge-warning', ESTIMATE: 'badge-warning', CONVERTED: 'badge-success',
    };
    return map[status] || 'badge-gray';
  };

  const handlePrint = (bill: any) => {
    const printFormat = bill.billType === 'ESTIMATE' ? 'ESTIMATE' : 'A4_GST';
    navigate('/print/sale/' + bill.id + '?format=' + printFormat + '&auto=1');
  };

  const handleWhatsApp = (bill: any) => {
    if (!bill.customerMobile) { toast.error('Customer has no mobile number'); return; }
    const billText =
      'Shri Jewellers%0A' +
      'Tax Invoice: ' + bill.billNumber + '%0A' +
      'Date: ' + new Date(bill.billDate).toLocaleDateString('en-IN') + '%0A' +
      'Amount: Rs.' + (bill.netAmount || 0).toLocaleString('en-IN') + '%0A' +
      (bill.balanceAmount > 0 ? 'Balance due: Rs.' + bill.balanceAmount.toLocaleString('en-IN') + '%0A' : '') +
      'Thank you for your purchase!';
    const mobile = bill.customerMobile.replace(/\D/g, '');
    window.open('https://wa.me/91' + mobile + '?text=' + billText, '_blank');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Bills</h1>
        </div>
        <button data-hotkey-add onClick={() => navigate('/billing')} className="btn-primary">
          <FileText className="w-4 h-4" /> New Bill
        </button>
      </div>

      {/* Bills / Estimated Bills tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit max-w-full overflow-x-auto">
        {([['ALL', 'All Bills'], ['BILLS', 'Bills'], ['ESTIMATES', 'Estimated Bills']] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setStatus(''); setPage(1); }}
            className={'px-3 py-2 text-[13px] font-medium rounded-md transition-all ' + (tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input data-search-input type="text" placeholder="Search bill / estimate no, customer, mobile…" className="input-field pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input-field flex-1 min-w-[150px] sm:flex-none sm:w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="ESTIMATE">Estimate (pending)</option>
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="FINALIZED">Finalized</option>
          <option value="CONVERTED">Converted to bill</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <input
          type="date"
          className="input-field flex-1 min-w-[140px] sm:flex-none sm:w-36"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
          title="From date"
        />
        <span className="text-gray-400 text-[13px]">to</span>
        <input
          type="date"
          className="input-field flex-1 min-w-[140px] sm:flex-none sm:w-36"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
          title="To date"
        />
        {(startDate || endDate) && (
          <button onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }} className="btn-ghost text-red-500 text-[13px]" title="Clear dates">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <button
          onClick={() => setStatus(status === 'PART_PAID' ? '' : 'PART_PAID')}
          className={'btn-secondary text-[13px] ' + (status === 'PART_PAID' ? '!bg-orange-50 !border-orange-300 !text-orange-700' : '')}
        >
          <HandCoins className="w-4 h-4" /> Part-Paid Only
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="table-wrap">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="table-header">Bill No.</th>
              <th className="table-header">Date</th>
              <th className="table-header">Customer</th>
              <th className="table-header">Type</th>
              <th className="table-header text-right">Amount</th>
              <th className="table-header text-right">Paid</th>
              <th className="table-header text-right">Balance</th>
              <th className="table-header">Status</th>
              <th className="table-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : data?.items?.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">No bills found</td></tr>
            ) : (
              data?.items?.map((bill: any) => {
                const isPartPaid = bill.balanceAmount > 0 && bill.paidAmount > 0;
                const isUnpaid = bill.balanceAmount > 0 && bill.paidAmount === 0;
                return (
                  <tr key={bill.id} className={'border-b border-gray-50 hover:bg-gray-50 ' + (isPartPaid ? 'bg-orange-50/30' : '')}>
                    <td className="table-cell font-medium">{bill.billNumber}</td>
                    <td className="table-cell">{new Date(bill.billDate).toLocaleDateString('en-IN')}</td>
                    <td className="table-cell">
                      <p className="font-medium">{bill.customerName}</p>
                      {bill.customerMobile && <p className="text-xs text-gray-400">{bill.customerMobile}</p>}
                    </td>
                    <td className="table-cell">
                      <span className={'badge ' + (bill.billType === 'GST' ? 'badge-info' : 'badge-gray')}>{bill.billType}</span>
                    </td>
                    <td className="table-cell text-right font-medium">₹{bill.netAmount?.toLocaleString('en-IN')}</td>
                    <td className="table-cell text-right text-green-600">₹{bill.paidAmount?.toLocaleString('en-IN')}</td>
                    <td className="table-cell text-right">
                      {bill.balanceAmount > 0 ? (
                        <span className={isPartPaid ? 'text-orange-600 font-medium' : 'text-red-600 font-medium'}>₹{bill.balanceAmount?.toLocaleString('en-IN')}</span>
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500 inline" />
                      )}
                    </td>
                    <td className="table-cell">
                      {isPartPaid ? <span className="badge-warning">PART PAID</span> : <span className={getStatusBadge(bill.status)}>{humanize(bill.status)}</span>}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        {bill.billType === 'ESTIMATE' && bill.status === 'ESTIMATE' && (
                          <>
                            <button onClick={() => navigate('/billing?estimate=' + bill.id)} className="btn-ghost p-2 text-amber-600" title="Edit estimated bill">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openConfirm(bill)}
                              className="btn-ghost p-2 text-green-600" title="Confirm → generate bill">
                              <ArrowRightCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {bill.billType !== 'ESTIMATE' && bill.balanceAmount > 0 && (
                          <button onClick={() => { setPayBill(bill); setPayForm({ amount: bill.balanceAmount, paymentMode: 'CASH', reference: '', accountId: '' }); }} className="btn-ghost p-2 text-green-600" title="Receive payment">
                            <HandCoins className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => handlePrint(bill)} className="btn-ghost p-2 text-primary-600" title="Print A4 Invoice">
                          <Printer className="w-4 h-4" />
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setThermalFor(thermalFor === bill.id ? null : bill.id)}
                            className="btn-ghost p-2 text-purple-600" title="Thermal receipt">
                            <FileText className="w-4 h-4" />
                          </button>
                          {thermalFor === bill.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setThermalFor(null)} />
                              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
                                <p className="px-3 py-1 text-[11px] uppercase tracking-wide text-gray-400">Thermal roll</p>
                                {[['80 mm — standard POS', 'THERMAL'], ['76 mm — 3-inch roll', 'THERMAL_76'], ['58 mm — mini printer', 'THERMAL_58']].map(([label, fmt]) => (
                                  <button key={fmt}
                                    onClick={() => { setThermalFor(null); navigate('/print/sale/' + bill.id + '?format=' + fmt + '&auto=1'); }}
                                    className="w-full text-left px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50">
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        {bill.customerMobile && (
                          <button onClick={() => handleWhatsApp(bill)} className="btn-ghost p-2 text-green-600" title="WhatsApp">
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => setViewBill(bill)} className="btn-ghost p-2 text-primary-600" title="View details">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-3 border-t border-gray-100">
            <span className="text-[13px] text-gray-500">Page {page} of {data.totalPages}</span>
            <div className="flex flex-wrap gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-[13px] py-1">Previous</button>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-[13px] py-1">Next</button>
            </div>
          </div>
        )}
      </div>


      {/* Bill Detail Modal */}
      {viewBill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3" onClick={() => setViewBill(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 p-3 sm:p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold">{viewBill.billNumber}</h2>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  {new Date(viewBill.billDate).toLocaleString('en-IN')} · {viewBill.billType}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={'badge ' + getStatusBadge(viewBill.status)}>{viewBill.status}</span>
                <button onClick={() => setViewBill(null)} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Customer */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-3 mb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-blue-900">{viewBill.customerName}</p>
                  <p className="text-xs text-blue-700">
                    {viewBill.customerMobile}{viewBill.customerGstin ? ' · GSTIN ' + viewBill.customerGstin : ''}
                  </p>
                </div>
                <div className="text-right text-[13px]">
                  <p className="text-blue-800">₹{(viewBill.netAmount || 0).toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>

            {/* Items */}
            <h3 className="text-[13px] font-semibold text-gray-700 mb-2">Items</h3>
            <div className="overflow-x-auto rounded-lg border mb-3">
              <div className="table-wrap">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50">
                  <th className="table-header">#</th><th className="table-header">Item</th><th className="table-header">Purity</th>
                  <th className="table-header text-right">Net Wt</th><th className="table-header text-right">Rate/g</th>
                  <th className="table-header text-right">Making</th><th className="table-header text-right">Total</th>
                </tr></thead>
                <tbody>
                  {(viewBill.items || []).map((item: any, idx: number) => (
                    <tr key={idx} className="border-b border-gray-50">
                      <td className="table-cell text-gray-400">{idx + 1}</td>
                      <td className="table-cell">
                        <p className="font-medium text-[13px]">{item.particular}</p>
                        {item.barcode && <p className="text-xs text-gray-400">#{item.barcode}</p>}
                      </td>
                      <td className="table-cell">{item.purity}</td>
                      <td className="table-cell text-right">{item.netWeight?.toFixed(3)}</td>
                      <td className="table-cell text-right">₹{item.ratePerGram?.toLocaleString('en-IN')}</td>
                      <td className="table-cell text-right">{item.makingCharges ? '₹' + item.makingCharges.toLocaleString('en-IN') : '-'}</td>
                      <td className="table-cell text-right font-semibold">₹{item.totalAmount?.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {/* Payments */}
            {(viewBill.payments || []).length > 0 && (
              <>
                <h3 className="text-[13px] font-semibold text-gray-700 mb-2">Payments</h3>
                <div className="rounded-lg border mb-3 overflow-hidden">
                  <div className="table-wrap">
                  <table className="w-full">
                    <thead><tr className="border-b bg-gray-50">
                      <th className="table-header">Mode</th><th className="table-header text-right">Amount</th><th className="table-header">Reference</th><th className="table-header">Date</th>
                    </tr></thead>
                    <tbody>
                      {(viewBill.payments || []).map((p: any, idx: number) => (
                        <tr key={idx} className="border-b border-gray-50">
                          <td className="table-cell"><span className="badge-info">{p.paymentMode}</span></td>
                          <td className="table-cell text-right font-medium">₹{p.amount?.toLocaleString('en-IN')}</td>
                          <td className="table-cell text-[13px] text-gray-500">{p.reference || '—'}</td>
                          <td className="table-cell text-[13px]">{new Date(p.date).toLocaleDateString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </>
            )}

            {/* Notes / Remark */}
            {viewBill.narration && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-3 mb-3">
                <p className="text-xs font-semibold text-yellow-800 uppercase mb-1">Notes / Remark</p>
                <p className="text-[13px] text-yellow-900">{viewBill.narration}</p>
              </div>
            )}

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full sm:w-80 space-y-1.5 text-[13px]">
                <div className="flex justify-between"><span className="text-gray-500">Gross Amount</span><span>₹{(viewBill.grossAmount || 0).toLocaleString('en-IN')}</span></div>
                {viewBill.discount > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="text-red-600">−₹{viewBill.discount.toLocaleString('en-IN')}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Taxable</span><span>₹{(viewBill.taxableAmount || 0).toLocaleString('en-IN')}</span></div>
                {viewBill.cgst > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><span>₹{viewBill.cgst.toLocaleString('en-IN')}</span></div>}
                {viewBill.sgst > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><span>₹{viewBill.sgst.toLocaleString('en-IN')}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Round Off</span><span>{viewBill.roundOff || 0}</span></div>
                <div className="flex justify-between font-bold text-sm border-t pt-2"><span>Net Amount</span><span>₹{(viewBill.netAmount || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between text-green-600 font-medium"><span>Paid</span><span>₹{(viewBill.paidAmount || 0).toLocaleString('en-IN')}</span></div>
                {viewBill.balanceAmount > 0 && (
                  <div className="flex justify-between text-red-600 font-semibold"><span>Balance Due</span><span>₹{viewBill.balanceAmount.toLocaleString('en-IN')}</span></div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-3 pt-3 border-t">
              <button onClick={() => handlePrint(viewBill)} className="btn-secondary text-[13px]"><Printer className="w-4 h-4" /> Print</button>
              {viewBill.balanceAmount > 0 && (
                <button onClick={() => { setPayBill(viewBill); setPayForm({ amount: viewBill.balanceAmount, paymentMode: 'CASH', reference: '', accountId: '' }); setViewBill(null); }} className="btn-primary text-[13px]">
                  <HandCoins className="w-4 h-4" /> Receive Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Receive Payment Modal */}
      {payBill && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setPayBill(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-3 sm:p-4 modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">Receive Payment</h3>
            <p className="text-[13px] text-gray-500 mb-3">
              {payBill.billNumber} · {payBill.customerName}<br/>
              Total: ₹{payBill.netAmount?.toLocaleString('en-IN')} · Paid: ₹{payBill.paidAmount?.toLocaleString('en-IN')} · <strong className="text-red-600">Balance: ₹{payBill.balanceAmount?.toLocaleString('en-IN')}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Amount Received (₹) *</label>
                <input type="number" className="input-field" value={payForm.amount || ''} onChange={e => setPayForm({...payForm, amount: Number(e.target.value)})} autoFocus />
                <p className="text-xs text-gray-400 mt-1">Enter full or partial amount (half payment supported)</p>
              </div>
              <div>
                <label className="label">Payment Mode</label>
                <select className="input-field" value={payForm.paymentMode} onChange={e => setPayForm({...payForm, paymentMode: e.target.value})}>
                  <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="DEBIT_CARD">Debit Card</option>
                  <option value="CREDIT_CARD">Credit Card</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div><label className="label">Reference</label><input className="input-field" value={payForm.reference} onChange={e => setPayForm({...payForm, reference: e.target.value})} placeholder="Optional" /></div>
              <div><label className="label">Receive Into (Cash / Bank Ledger)</label>
                <select className="input-field" value={payForm.accountId} onChange={e => setPayForm({...payForm, accountId: e.target.value})}>
                  <option value="">— no ledger —</option>
                  {activeAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Amount is credited to this account in the ledger.</p></div>
            </div>
            <div className="flex justify-end gap-3 mt-3 pt-3 border-t">
              <button onClick={() => setPayBill(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (payForm.amount <= 0) { toast.error('Enter amount'); return; }
                if (payForm.amount > payBill.balanceAmount) { toast.error('Amount exceeds balance'); return; }
                payMutation.mutate({ id: payBill.id, body: payForm });
              }} disabled={payMutation.isPending} className="btn-primary">
                <HandCoins className="w-4 h-4" /> {payMutation.isPending ? 'Recording...' : 'Receive Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    
      {/* Confirm Estimate → Bill modal */}
      {confirmingEstimate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setConfirmingEstimate(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-3 sm:p-4 modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">Confirm Estimated Bill</h3>
            <p className="text-[13px] text-gray-500 mb-3">
              {confirmingEstimate.billNumber} · {confirmingEstimate.customerName} · ₹{confirmingEstimate.netAmount?.toLocaleString('en-IN')}
            </p>
            <div className="space-y-3">
              {(proposed.payments.length > 0 || proposed.urd.length > 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
                  <p className="font-semibold text-amber-800">Proposed on the estimate — carried into the bill</p>
                  {proposed.payments.map((p: any, i: number) => (
                    <div key={'p' + i} className="flex justify-between text-amber-900">
                      <span>{humanize(p.paymentMode)}</span><span className="font-medium">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                  {proposed.urd.map((u: any, i: number) => (
                    <div key={'u' + i} className="flex justify-between text-amber-900">
                      <span>Old gold · {u.netWeight} g {u.purity}</span>
                      <span className="font-medium">₹{Number(u.finalValue).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label className="label">Generate as</label>
                <div className="flex gap-2">
                  {['GST', 'NON_GST'].map((t) => (
                    <button key={t} onClick={() => setConfirmForm({ ...confirmForm, billType: t })}
                      className={'flex-1 py-2 text-[13px] rounded-lg border transition-all ' + (confirmForm.billType === t ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-gray-200 text-gray-500')}>
                      {t === 'GST' ? 'GST Bill' : 'Non-GST Bill'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Payment received now (₹)</label>
                  <input type="number" className="input-field" value={confirmForm.amount || ''} onChange={(e) => setConfirmForm({ ...confirmForm, amount: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">Mode</label>
                  <select className="input-field" value={confirmForm.paymentMode} onChange={(e) => setConfirmForm({ ...confirmForm, paymentMode: e.target.value })}>
                    {['CASH', 'UPI', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'CHEQUE'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400">Whatever the estimate proposed is carried over; add what you collect now on top. Leave it at 0 to generate the bill with the balance still due. Stock, metal ledger and the customer ledger are updated now — they were not touched by the estimate.</p>
            </div>
            <div className="flex justify-end gap-3 mt-3 pt-3 border-t">
              <button onClick={() => setConfirmingEstimate(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={() =>
                  confirmEstimateMutation.mutate({
                    id: confirmingEstimate.id,
                    body: {
                      billType: confirmForm.billType,
                      payments: [
                        ...proposed.payments.map((p: any) => ({ amount: Number(p.amount) || 0, paymentMode: p.paymentMode || 'CASH', reference: p.reference || '' })),
                        ...(confirmForm.amount > 0 ? [{ amount: confirmForm.amount, paymentMode: confirmForm.paymentMode }] : []),
                      ],
                      urdEntries: proposed.urd.map((u: any) => ({
                        metalType: u.metalType, purity: u.purity,
                        grossWeight: u.grossWeight, stoneWeight: u.stoneWeight, netWeight: u.netWeight,
                        rate: u.rate, value: u.value, deduction: u.deduction, meltingLoss: u.meltingLoss,
                        finalValue: u.finalValue, notes: u.notes,
                      })),
                    },
                  })
                }
                className="btn-primary" disabled={confirmEstimateMutation.isPending}>
                {confirmEstimateMutation.isPending ? 'Generating…' : 'Confirm & Generate Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


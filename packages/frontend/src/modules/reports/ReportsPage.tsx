import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import {
  Download, FileText, TrendingUp, Package, Briefcase, Scale,
  Users, HandCoins, FileBarChart, LayoutGrid, Landmark,
} from 'lucide-react';

const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmt2 = (n: number) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ReportTab = 'sales' | 'gst' | 'ca' | 'custom' | 'ledger' | 'collection' | 'inventory' | 'jobwork';

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('sales');
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(1)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // GST segregation
  const { data: gstSales } = useQuery({
    queryKey: ['report-gst', startDate, endDate],
    queryFn: () => api.getSalesReport({ startDate, endDate, billType: 'GST' }),
  });
  const { data: ngSales } = useQuery({
    queryKey: ['report-ng', startDate, endDate],
    queryFn: () => api.getSalesReport({ startDate, endDate, billType: 'NON_GST' }),
  });
  const { data: salesReport } = useQuery({
    queryKey: ['report-sales-all', startDate, endDate],
    queryFn: () => api.getSalesReport({ startDate, endDate }),
  });
  const { data: hsnReport } = useQuery({
    queryKey: ['report-hsn', startDate, endDate],
    queryFn: () => api.getHsnSummary({ startDate, endDate }),
  });
  const { data: inventoryReport } = useQuery({ queryKey: ['report-inventory'], queryFn: () => api.getInventoryReport() });
  const { data: jobReport } = useQuery({ queryKey: ['report-jobwork'], queryFn: () => api.getJobWorkReport() });
  const { data: customers } = useQuery({ queryKey: ['report-customers'], queryFn: () => api.getCustomers({ limit: 100 }) });
  const { data: payments } = useQuery({ queryKey: ['report-payments', startDate, endDate], queryFn: () => api.getPayments({ limit: 100 }) });

  // Custom report state
  const [customEntity, setCustomEntity] = useState<'sales' | 'customers' | 'payments'>('sales');

  const exportCSV = (rows: any[], filename: string) => {
    if (!rows || rows.length === 0) { alert('No data to export'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename + '.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { key: ReportTab; label: string; icon: any }[] = [
    { key: 'sales', label: 'Sales Register', icon: TrendingUp },
    { key: 'gst', label: 'GST / Non-GST', icon: Scale },
    { key: 'ca', label: 'GST (for CA)', icon: Landmark },
    { key: 'custom', label: 'Custom Report', icon: LayoutGrid },
    { key: 'ledger', label: 'Ledgers', icon: Users },
    { key: 'collection', label: 'Collection', icon: HandCoins },
    { key: 'inventory', label: 'Inventory', icon: Package },
    { key: 'jobwork', label: 'Job Work', icon: Briefcase },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="page-title">Reports Center</h1>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <input type="date" className="input-field flex-1 min-w-[140px] sm:flex-none sm:w-40" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <span className="text-gray-400">to</span>
        <input type="date" className="input-field flex-1 min-w-[140px] sm:flex-none sm:w-40" value={endDate} onChange={e => setEndDate(e.target.value)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit flex-wrap">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={'px-3 py-2 text-[13px] font-medium rounded-md transition-all flex items-center gap-2 ' + (tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ============ SALES REGISTER ============ */}
      {tab === 'sales' && (
        <div className="space-y-3">
          {salesReport?.summary && (
            <div className="grid stat-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="stat-card"><p className="stat-label">Total Bills</p><p className="stat-value">{salesReport.summary.totalSales}</p></div>
              <div className="stat-card"><p className="stat-label">Total Sales</p><p className="stat-value">{fm(salesReport.summary.totalAmount)}</p></div>
              <div className="stat-card"><p className="stat-label">Tax</p><p className="stat-value">{fm(salesReport.summary.totalTax)}</p></div>
              <div className="stat-card"><p className="stat-label">Collection</p><p className="stat-value text-green-600">{fm(salesReport.summary.totalCollection)}</p></div>
              <div className="stat-card"><p className="stat-label">Outstanding</p><p className="stat-value text-red-600">{fm(salesReport.summary.totalOutstanding)}</p></div>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={() => exportCSV(salesReport?.sales, 'sales-register-' + startDate + '-' + endDate)} className="btn-secondary text-[13px]">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="table-wrap">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50">
                <th className="table-header">Bill No.</th><th className="table-header">Date</th><th className="table-header">Customer</th>
                <th className="table-header">Type</th><th className="table-header text-right">Amount</th><th className="table-header text-right">Tax</th>
                <th className="table-header text-right">Paid</th><th className="table-header text-right">Balance</th><th className="table-header">Status</th>
              </tr></thead>
              <tbody>
                {salesReport?.sales?.map((s: any) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-medium">{s.billNumber}</td>
                    <td className="table-cell text-[13px]">{new Date(s.billDate).toLocaleDateString('en-IN')}</td>
                    <td className="table-cell">{s.customerName}</td>
                    <td className="table-cell"><span className={'badge ' + (s.billType === 'GST' ? 'badge-info' : 'badge-gray')}>{s.billType}</span></td>
                    <td className="table-cell text-right font-medium">{fm(s.netAmount)}</td>
                    <td className="table-cell text-right">{fm(s.totalTax)}</td>
                    <td className="table-cell text-right text-green-600">{fm(s.paidAmount)}</td>
                    <td className="table-cell text-right text-red-600">{s.balanceAmount > 0 ? fm(s.balanceAmount) : '—'}</td>
                    <td className="table-cell"><span className={'badge ' + (s.status === 'FINALIZED' || s.status === 'CONFIRMED' ? 'badge-success' : s.status === 'CANCELLED' ? 'badge-danger' : 'badge-gray')}>{s.status}</span></td>
                  </tr>
                ))}
                {(!salesReport?.sales || salesReport.sales.length === 0) && <tr><td colSpan={9} className="text-center py-12 text-gray-400">No sales in selected period</td></tr>}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ============ GST / NON-GST SEGREGATION ============ */}
      {tab === 'gst' && (
        <div className="space-y-3">
          {/* Comparison summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card">
              <h3 className="section-title mb-3 text-blue-700">GST Bills</h3>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between"><span>Bills</span><span className="font-bold">{gstSales?.summary?.totalSales || 0}</span></div>
                <div className="flex justify-between"><span>Taxable Value</span><span className="font-bold">{fm(gstSales?.summary?.totalAmount)}</span></div>
                <div className="flex justify-between"><span>CGST</span><span>{fm(gstSales?.summary?.totalCgst)}</span></div>
                <div className="flex justify-between"><span>SGST</span><span>{fm(gstSales?.summary?.totalSgst)}</span></div>
                <div className="flex justify-between border-t pt-2"><span>Total Tax</span><span className="font-bold text-blue-700">{fm(gstSales?.summary?.totalTax)}</span></div>
              </div>
            </div>
            <div className="card">
              <h3 className="section-title mb-3 text-gray-600">Non-GST Bills</h3>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between"><span>Bills</span><span className="font-bold">{ngSales?.summary?.totalSales || 0}</span></div>
                <div className="flex justify-between"><span>Total Value</span><span className="font-bold">{fm(ngSales?.summary?.totalAmount)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>—</span></div>
                <div className="flex justify-between"><span>Collection</span><span>{fm(ngSales?.summary?.totalCollection)}</span></div>
                <div className="flex justify-between border-t pt-2"><span>Outstanding</span><span className="font-bold text-red-600">{fm(ngSales?.summary?.totalOutstanding)}</span></div>
              </div>
            </div>
            <div className="card bg-gray-50">
              <h3 className="section-title mb-3">Combined</h3>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between"><span>Total Bills</span><span className="font-bold">{(gstSales?.summary?.totalSales || 0) + (ngSales?.summary?.totalSales || 0)}</span></div>
                <div className="flex justify-between"><span>Total Sales</span><span className="font-bold">{fm((gstSales?.summary?.totalAmount || 0) + (ngSales?.summary?.totalAmount || 0))}</span></div>
                <div className="flex justify-between"><span>Total Collection</span><span className="font-bold text-green-600">{fm((gstSales?.summary?.totalCollection || 0) + (ngSales?.summary?.totalCollection || 0))}</span></div>
                <div className="flex justify-between"><span>Total Outstanding</span><span className="font-bold text-red-600">{fm((gstSales?.summary?.totalOutstanding || 0) + (ngSales?.summary?.totalOutstanding || 0))}</span></div>
              </div>
            </div>
          </div>

          {/* HSN Summary */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="section-title">HSN-wise GST Summary</h3>
              <button onClick={() => exportCSV(hsnReport, 'hsn-summary')} className="btn-secondary text-[13px]"><Download className="w-4 h-4" /> Export</button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="table-wrap">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50">
                  <th className="table-header">HSN Code</th><th className="table-header text-right">Taxable</th>
                  <th className="table-header text-right">CGST</th><th className="table-header text-right">SGST</th>
                  <th className="table-header text-right">Total Tax</th><th className="table-header text-right">Items</th>
                </tr></thead>
                <tbody>
                  {hsnReport?.map((h: any) => (
                    <tr key={h.hsnCode} className="border-b border-gray-50">
                      <td className="table-cell font-medium">{h.hsnCode}</td>
                      <td className="table-cell text-right">{fm(h.totalAmount)}</td>
                      <td className="table-cell text-right">{fm(h.totalCgst)}</td>
                      <td className="table-cell text-right">{fm(h.totalSgst)}</td>
                      <td className="table-cell text-right font-medium">{fm(h.totalTax)}</td>
                      <td className="table-cell text-right">{h.count}</td>
                    </tr>
                  ))}
                  {(!hsnReport || hsnReport.length === 0) && <tr><td colSpan={6} className="text-center py-12 text-gray-400">No HSN data</td></tr>}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ============ GST REPORT FOR CA (GSTR-1 style) ============ */}
      {tab === 'ca' && (
        <div className="space-y-3">
          {/* Period & summary */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title">GST Summary — {new Date(startDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => {
                  const rows = (salesReport?.sales || []).map((s: any) => ({
                    'Invoice No': s.billNumber,
                    'Invoice Date': new Date(s.billDate).toLocaleDateString('en-IN'),
                    'GSTIN of Recipient': s.customerGstin || '',
                    'Recipient Name': s.customerName,
                    'Invoice Type': s.customerGstin ? 'B2B' : 'B2C',
                    'Invoice Value': (s.netAmount || 0).toFixed(2),
                    'Taxable Value': (s.taxableAmount || 0).toFixed(2),
                    'CGST': (s.cgst || 0).toFixed(2),
                    'SGST': (s.sgst || 0).toFixed(2),
                    'IGST': (s.igst || 0).toFixed(2),
                    'Total Tax': (s.totalTax || 0).toFixed(2),
                  }));
                  exportCSV(rows, 'GST-return-' + startDate + '-to-' + endDate);
                }} className="btn-secondary text-[13px]"><Download className="w-4 h-4" /> Export GST CSV (for CA)</button>
                <button onClick={() => window.print()} className="btn-secondary text-[13px]"><FileText className="w-4 h-4" /> Print</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="p-3 bg-blue-50 rounded-xl">
                <p className="text-xs text-blue-700">Taxable Value</p>
                <p className="text-lg font-bold text-blue-800 mt-1">{fm(salesReport?.summary?.totalAmount)}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl">
                <p className="text-xs text-green-700">CGST Collected</p>
                <p className="text-lg font-bold text-green-800 mt-1">{fm(salesReport?.summary?.totalCgst)}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl">
                <p className="text-xs text-green-700">SGST Collected</p>
                <p className="text-lg font-bold text-green-800 mt-1">{fm(salesReport?.summary?.totalSgst)}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-xl">
                <p className="text-xs text-purple-700">IGST Collected</p>
                <p className="text-lg font-bold text-purple-800 mt-1">{fm(salesReport?.summary?.totalIgst)}</p>
              </div>
              <div className="p-3 bg-gray-800 rounded-xl text-white">
                <p className="text-xs text-gray-300">Total GST Payable</p>
                <p className="text-lg font-bold mt-1">{fm(salesReport?.summary?.totalTax)}</p>
              </div>
            </div>
          </div>

          {/* B2B / B2C split */}
          <div className="grid stat-grid grid-cols-3 gap-3">
            <div className="stat-card">
              <p className="stat-label">B2B Invoices (with GSTIN)</p>
              <p className="stat-value text-blue-700">{(salesReport?.sales || []).filter((s: any) => s.customerGstin).length}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">B2C Invoices (no GSTIN)</p>
              <p className="stat-value">{(salesReport?.sales || []).filter((s: any) => !s.customerGstin).length}</p>
            </div>
            <div className="stat-card">
              <p className="stat-label">Cancelled / Returns</p>
              <p className="stat-value text-red-600">{(salesReport?.sales || []).filter((s: any) => s.status === 'CANCELLED').length}</p>
            </div>
          </div>

          {/* Invoice-wise GSTR-1 table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-3 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-gray-700">Invoice-wise Taxable Supplies (GSTR-1)</h3>
              <span className="text-xs text-gray-400">{salesReport?.sales?.length || 0} invoices</span>
            </div>
            <div className="overflow-x-auto">
              <div className="table-wrap">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="table-header">Invoice No</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Recipient</th>
                    <th className="table-header">GSTIN</th>
                    <th className="table-header">Type</th>
                    <th className="table-header text-right">Invoice Value</th>
                    <th className="table-header text-right">Taxable</th>
                    <th className="table-header text-right">CGST</th>
                    <th className="table-header text-right">SGST</th>
                    <th className="table-header text-right">IGST</th>
                  </tr>
                </thead>
                <tbody>
                  {(salesReport?.sales || []).map((s: any) => (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell font-medium">{s.billNumber}</td>
                      <td className="table-cell text-[13px] whitespace-nowrap">{new Date(s.billDate).toLocaleDateString('en-IN')}</td>
                      <td className="table-cell">{s.customerName}</td>
                      <td className="table-cell font-mono text-xs">{s.customerGstin || '—'}</td>
                      <td className="table-cell">
                        {s.customerGstin
                          ? <span className="badge-info">B2B</span>
                          : <span className="badge-gray">B2C</span>}
                      </td>
                      <td className="table-cell text-right">{fmt2(s.netAmount)}</td>
                      <td className="table-cell text-right">{fmt2(s.taxableAmount)}</td>
                      <td className="table-cell text-right">{fmt2(s.cgst)}</td>
                      <td className="table-cell text-right">{fmt2(s.sgst)}</td>
                      <td className="table-cell text-right">{fmt2(s.igst)}</td>
                    </tr>
                  ))}
                  {(!salesReport?.sales || salesReport.sales.length === 0) && (
                    <tr><td colSpan={10} className="text-center py-12 text-gray-400">No sales in selected period</td></tr>
                  )}
                </tbody>
                {salesReport?.sales?.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={5} className="table-header">Total</td>
                      <td className="table-cell text-right">{fmt2(salesReport?.sales?.reduce((s: number, x: any) => s + (x.netAmount || 0), 0))}</td>
                      <td className="table-cell text-right">{fmt2(salesReport?.sales?.reduce((s: number, x: any) => s + (x.taxableAmount || 0), 0))}</td>
                      <td className="table-cell text-right">{fmt2(salesReport?.sales?.reduce((s: number, x: any) => s + (x.cgst || 0), 0))}</td>
                      <td className="table-cell text-right">{fmt2(salesReport?.sales?.reduce((s: number, x: any) => s + (x.sgst || 0), 0))}</td>
                      <td className="table-cell text-right">{fmt2(salesReport?.sales?.reduce((s: number, x: any) => s + (x.igst || 0), 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
              </div>
            </div>
          </div>

          {/* HSN summary */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-3 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-700">HSN-wise Summary (for GSTR-1 Table 12)</h3>
            </div>
            <div className="table-wrap">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50">
                <th className="table-header">HSN</th><th className="table-header text-right">UQC</th>
                <th className="table-header text-right">Total Qty</th><th className="table-header text-right">Taxable Value</th>
                <th className="table-header text-right">CGST</th><th className="table-header text-right">SGST</th><th className="table-header text-right">Total Tax</th>
              </tr></thead>
              <tbody>
                {(hsnReport || []).map((h: any) => (
                  <tr key={h.hsnCode} className="border-b border-gray-50">
                    <td className="table-cell font-medium">{h.hsnCode}</td>
                    <td className="table-cell text-right">NOS</td>
                    <td className="table-cell text-right">{h.count}</td>
                    <td className="table-cell text-right">{fmt2(h.totalAmount)}</td>
                    <td className="table-cell text-right">{fmt2(h.totalCgst)}</td>
                    <td className="table-cell text-right">{fmt2(h.totalSgst)}</td>
                    <td className="table-cell text-right font-medium">{fmt2(h.totalTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            💡 This report is formatted for your Chartered Accountant: invoice-wise B2B/B2C classification, GSTINs, and HSN summary — matching GSTR-1 layout. Export CSV opens directly in Excel.
          </p>
        </div>
      )}

      {/* ============ CUSTOM REPORT BUILDER ============ */}
      {tab === 'custom' && (
        <div className="space-y-3">
          <div className="card">
            <h3 className="section-title mb-3">Custom Report Builder</h3>
            <div className="flex items-center gap-3">
              <div>
                <label className="label">Report On</label>
                <select className="input-field w-48" value={customEntity} onChange={e => setCustomEntity(e.target.value as any)}>
                  <option value="sales">Sales / Bills</option>
                  <option value="customers">Customers</option>
                  <option value="payments">Payments</option>
                </select>
              </div>
              <div>
                <label className="label">Date Range</label>
                <div className="flex items-center gap-2">
                  <input type="date" className="input-field flex-1 min-w-[130px] sm:flex-none sm:w-36" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  <span>to</span>
                  <input type="date" className="input-field flex-1 min-w-[130px] sm:flex-none sm:w-36" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
              <div className="self-end">
                <button
                  onClick={() => {
                    if (customEntity === 'sales') exportCSV(salesReport?.sales, 'custom-sales-report');
                    else if (customEntity === 'customers') exportCSV(customers?.items, 'custom-customers-report');
                    else exportCSV(payments?.items, 'custom-payments-report');
                  }}
                  className="btn-primary"
                >
                  <Download className="w-4 h-4" /> Generate & Export
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">Exports the full filtered dataset to CSV. Open in Excel for further pivoting.</p>
          </div>

          {/* Live preview */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {customEntity === 'sales' && (
              <div className="table-wrap">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50">
                  <th className="table-header">Bill</th><th className="table-header">Date</th><th className="table-header">Customer</th>
                  <th className="table-header">Type</th><th className="table-header text-right">Amount</th><th className="table-header text-right">Paid</th><th className="table-header text-right">Balance</th>
                </tr></thead>
                <tbody>
                  {(salesReport?.sales || []).slice(0, 15).map((s: any) => (
                    <tr key={s.id} className="border-b border-gray-50">
                      <td className="table-cell font-medium">{s.billNumber}</td><td className="table-cell text-[13px]">{new Date(s.billDate).toLocaleDateString('en-IN')}</td>
                      <td className="table-cell">{s.customerName}</td><td className="table-cell">{s.billType}</td>
                      <td className="table-cell text-right">{fm(s.netAmount)}</td><td className="table-cell text-right">{fm(s.paidAmount)}</td>
                      <td className="table-cell text-right">{fm(s.balanceAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
            {customEntity === 'customers' && (
              <div className="table-wrap">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50">
                  <th className="table-header">Customer ID</th><th className="table-header">Name</th><th className="table-header">Mobile</th>
                  <th className="table-header">City</th><th className="table-header">GSTIN</th><th className="table-header">Registered</th>
                </tr></thead>
                <tbody>
                  {(customers?.items || []).map((c: any) => (
                    <tr key={c.id} className="border-b border-gray-50">
                      <td className="table-cell font-mono text-xs">{c.customerId}</td><td className="table-cell font-medium">{c.name}</td>
                      <td className="table-cell">{c.mobile || '—'}</td><td className="table-cell">{c.city || '—'}</td>
                      <td className="table-cell">{c.gstin || '—'}</td>
                      <td className="table-cell text-[13px]">{new Date(c.registrationDate).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
            {customEntity === 'payments' && (
              <div className="table-wrap">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50">
                  <th className="table-header">Transaction</th><th className="table-header">Type</th><th className="table-header text-right">Amount</th>
                  <th className="table-header">Mode</th><th className="table-header">Reference</th><th className="table-header">Date</th>
                </tr></thead>
                <tbody>
                  {(payments?.items || []).slice(0, 15).map((p: any) => (
                    <tr key={p.id} className="border-b border-gray-50">
                      <td className="table-cell font-mono text-xs">{p.transactionId}</td>
                      <td className="table-cell">{p.customerId ? 'Receipt' : p.supplierId ? 'Payment' : '—'}</td>
                      <td className="table-cell text-right font-medium">{fm(p.amount)}</td>
                      <td className="table-cell"><span className="badge-info">{p.paymentMode}</span></td>
                      <td className="table-cell">{p.reference || '—'}</td>
                      <td className="table-cell text-[13px]">{new Date(p.date).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ LEDGERS ============ */}
      {tab === 'ledger' && (
        <div className="space-y-3">
          <div className="grid stat-grid grid-cols-3 gap-3">
            <div className="stat-card"><p className="stat-label">Customers</p><p className="stat-value">{customers?.total || 0}</p></div>
            <div className="stat-card"><p className="stat-label">Total Outstanding (Sales)</p><p className="stat-value text-red-600">{fm(salesReport?.summary?.totalOutstanding)}</p></div>
            <div className="stat-card"><p className="stat-label">Total Collection</p><p className="stat-value text-green-600">{fm(salesReport?.summary?.totalCollection)}</p></div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title">Customer Ledger</h3>
              <button onClick={() => exportCSV(customers?.items, 'customer-ledger')} className="btn-secondary text-[13px]"><Download className="w-4 h-4" /> Export</button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="table-wrap">
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50">
                  <th className="table-header">Customer</th><th className="table-header">ID</th><th className="table-header">Mobile</th>
                  <th className="table-header text-right">Total Bills</th><th className="table-header text-right">Balance</th>
                </tr></thead>
                <tbody>
                  {(salesReport?.sales || []).reduce((acc: any[], s: any) => {
                    const found = acc.find(a => a.customerId === s.customerId);
                    if (found) { found.bills += 1; found.total += s.netAmount; found.balance += s.balanceAmount; }
                    else acc.push({ customerId: s.customerId, customerName: s.customerName, bills: 1, total: s.netAmount, balance: s.balanceAmount });
                    return acc;
                  }, []).map((row: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="table-cell font-medium">{row.customerName}</td>
                      <td className="table-cell text-xs text-gray-400">{row.customerId || 'Walk-in'}</td>
                      <td className="table-cell">{salesReport?.sales?.find((s: any) => s.customerId === row.customerId)?.customerMobile || '—'}</td>
                      <td className="table-cell text-right">{row.bills}</td>
                      <td className="table-cell text-right"><span className={row.balance > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>{row.balance > 0 ? fm(row.balance) : 'Settled'}</span></td>
                    </tr>
                  ))}
                  {(!salesReport?.sales || salesReport.sales.length === 0) && <tr><td colSpan={5} className="text-center py-12 text-gray-400">No sales to show ledger</td></tr>}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ COLLECTION ============ */}
      {tab === 'collection' && (
        <div className="space-y-3">
          <div className="grid stat-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="stat-card"><p className="stat-label">Cash</p><p className="stat-value">{fm((payments?.items || []).filter((p: any) => p.paymentMode === 'CASH').reduce((s: number, p: any) => s + p.amount, 0))}</p></div>
            <div className="stat-card"><p className="stat-label">UPI</p><p className="stat-value">{fm((payments?.items || []).filter((p: any) => p.paymentMode === 'UPI').reduce((s: number, p: any) => s + p.amount, 0))}</p></div>
            <div className="stat-card"><p className="stat-label">Cards</p><p className="stat-value">{fm((payments?.items || []).filter((p: any) => ['DEBIT_CARD', 'CREDIT_CARD'].includes(p.paymentMode)).reduce((s: number, p: any) => s + p.amount, 0))}</p></div>
            <div className="stat-card"><p className="stat-label">Bank / Cheque</p><p className="stat-value">{fm((payments?.items || []).filter((p: any) => ['BANK_TRANSFER', 'CHEQUE'].includes(p.paymentMode)).reduce((s: number, p: any) => s + p.amount, 0))}</p></div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="table-wrap">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50">
                <th className="table-header">Transaction</th><th className="table-header">Type</th><th className="table-header text-right">Amount</th>
                <th className="table-header">Mode</th><th className="table-header">Reference</th><th className="table-header">Date</th>
              </tr></thead>
              <tbody>
                {(payments?.items || []).map((p: any) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-mono text-xs">{p.transactionId}</td>
                    <td className="table-cell">{p.customerId ? 'Receipt' : p.supplierId ? 'Payment out' : '—'}</td>
                    <td className="table-cell text-right font-medium">{fm(p.amount)}</td>
                    <td className="table-cell"><span className="badge-info">{p.paymentMode}</span></td>
                    <td className="table-cell">{p.reference || '—'}</td>
                    <td className="table-cell text-[13px]">{new Date(p.date).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
                {(!payments?.items || payments.items.length === 0) && <tr><td colSpan={6} className="text-center py-12 text-gray-400">No payments recorded</td></tr>}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ============ INVENTORY ============ */}
      {tab === 'inventory' && (
        <div className="space-y-3">
          {inventoryReport && (
            <div className="grid stat-grid grid-cols-3 gap-3">
              <div className="stat-card"><p className="stat-label">Total Items</p><p className="stat-value">{inventoryReport.totalItems}</p></div>
              <div className="stat-card"><p className="stat-label">Total Weight</p><p className="stat-value">{(inventoryReport.totalWeight || 0).toFixed(3)}g</p></div>
              <div className="stat-card"><p className="stat-label">Stock Value</p><p className="stat-value">{fm(inventoryReport.totalValue)}</p></div>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={() => exportCSV(inventoryReport?.byMetal, 'inventory-report')} className="btn-secondary text-[13px]"><Download className="w-4 h-4" /> Export</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="table-wrap">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50">
                <th className="table-header">Metal</th><th className="table-header text-right">Weight (g)</th>
                <th className="table-header text-right">Value</th><th className="table-header text-right">Count</th>
              </tr></thead>
              <tbody>
                {inventoryReport?.byMetal?.map((m: any) => (
                  <tr key={m.metal} className="border-b border-gray-50">
                    <td className="table-cell font-medium">{m.metal}</td>
                    <td className="table-cell text-right">{(m.weight || 0).toFixed(3)}</td>
                    <td className="table-cell text-right">{fm(m.value)}</td>
                    <td className="table-cell text-right">{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ============ JOB WORK ============ */}
      {tab === 'jobwork' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => exportCSV(jobReport, 'job-work-report')} className="btn-secondary text-[13px]"><Download className="w-4 h-4" /> Export</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="table-wrap">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50">
                <th className="table-header">Job No.</th><th className="table-header">Customer</th><th className="table-header">Product</th>
                <th className="table-header">Purity</th><th className="table-header">Delivery</th>
                <th className="table-header text-right">Est.</th><th className="table-header text-right">Advance</th><th className="table-header text-right">Balance</th><th className="table-header">Status</th>
              </tr></thead>
              <tbody>
                {jobReport?.map((j: any) => (
                  <tr key={j.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-medium">{j.jobNumber}</td>
                    <td className="table-cell">{j.customerName}</td>
                    <td className="table-cell">{j.productDescription}</td>
                    <td className="table-cell">{j.purity}</td>
                    <td className="table-cell text-[13px]">{new Date(j.expectedDelivery).toLocaleDateString('en-IN')}</td>
                    <td className="table-cell text-right">{fm(j.estimatedAmount)}</td>
                    <td className="table-cell text-right text-green-600">{fm(j.advanceAmount)}</td>
                    <td className="table-cell text-right text-red-600">{fm(j.balanceAmount)}</td>
                    <td className="table-cell"><span className={'badge ' + (j.status === 'DELIVERED' || j.status === 'READY' ? 'badge-success' : j.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-info')}>{j.status}</span></td>
                  </tr>
                ))}
                {(!jobReport || jobReport.length === 0) && <tr><td colSpan={9} className="text-center py-12 text-gray-400">No job orders</td></tr>}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

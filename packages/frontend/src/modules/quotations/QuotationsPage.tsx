import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { Plus, Search, Link2, Copy, Trash2, ExternalLink, Tag, CheckCircle, XCircle, Printer } from 'lucide-react';

export default function QuotationsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [quoteLink, setQuoteLink] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['quotations', search, status, page],
    queryFn: () => api.getQuotations({ search, status, page, limit: 20 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteQuotation(id),
    onSuccess: () => { toast.success('Quotation deleted'); qc.invalidateQueries({ queryKey: ['quotations'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: any) => api.updateQuotationStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotations'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const isDesktop = !!(window as any).desktopBridge?.isDesktop;
  const quoteUrl = (token: string) => `${window.location.origin}/q/${token}`;

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied!');
    } catch {
      toast.error(url);
    }
  };

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Quotations</h1>
          <p className="text-gray-500 text-sm mt-1">Estimated bills with a shareable link your customer can open anywhere — no login needed</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Quotation</button>
          <button onClick={() => { window.location.hash = ''; window.location.assign('/billing'); }} className="btn-secondary"><Tag className="w-4 h-4" /> Build from Billing cart</button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input-field pl-10" placeholder="Search quote no / customer…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input-field w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="CONVERTED">Converted</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Quote No</th><th className="table-header">Customer</th>
            <th className="table-header text-right">Items</th><th className="table-header text-right">Net Amount</th>
            <th className="table-header">Valid Until</th><th className="table-header">Status</th><th className="table-header">Link</th><th className="table-header"></th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading…</td></tr> :
              data?.items?.length === 0 ? <tr><td colSpan={8} className="text-center py-12 text-gray-400">No quotations yet — create one from the billing screen (“Save as Quotation”) or here</td></tr> :
              data?.items?.map((q: any) => (
                <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-cell font-mono text-xs font-medium text-primary-700">{q.quoteNumber}</td>
                  <td className="table-cell">
                    <p className="font-medium">{q.customerName}</p>
                    {q.customerMobile && <p className="text-xs text-gray-400">{q.customerMobile}</p>}
                  </td>
                  <td className="table-cell text-right">{JSON.parse(q.items || '[]').length}</td>
                  <td className="table-cell text-right font-medium">{fm(q.netAmount)}</td>
                  <td className="table-cell text-xs">{q.validUntil ? new Date(q.validUntil).toLocaleDateString('en-IN') : 'No expiry'}</td>
                  <td className="table-cell">
                    <select
                      className="text-xs border rounded p-1"
                      value={q.status}
                      onChange={(e) => statusMutation.mutate({ id: q.id, status: e.target.value })}>
                      {['ACTIVE', 'ACCEPTED', 'CONVERTED', 'EXPIRED'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      <button onClick={() => copyLink(quoteUrl(q.token))} className="p-1.5 text-gray-400 hover:text-primary-600" title="Copy customer link"><Copy className="w-4 h-4" /></button>
                      <a href={quoteUrl(q.token)} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-primary-600" title="Open quote page"><ExternalLink className="w-4 h-4" /></a>
                    </div>
                  </td>
                  <td className="table-cell">
                    <button onClick={() => { if (confirm('Delete quotation ' + q.quoteNumber + '?')) deleteMutation.mutate(q.id); }} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {data?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-500">Page {page} of {data.totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary text-sm py-1">Prev</button>
              <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="btn-secondary text-sm py-1">Next</button>
            </div>
          </div>
        )}
      </div>

      {showCreate && <CreateQuotationModal onClose={() => setShowCreate(false)} onCreated={(url) => { setShowCreate(false); setQuoteLink(url); qc.invalidateQueries({ queryKey: ['quotations'] }); }} />}

      {quoteLink && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center gap-2 text-green-600 mb-2"><CheckCircle className="w-5 h-5" /><h3 className="font-semibold">Quotation created!</h3></div>
            {isDesktop ? (
              <p className="text-sm text-gray-500 mb-3">
                You're in the desktop app — open the quote and use <strong>Print / Save as PDF</strong> to share it.
                <span className="block text-xs text-amber-700 mt-1">Links only work while this app is running on this PC.</span>
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3">Share this link with your customer (WhatsApp / SMS / email). It opens the quotation page without any login:</p>
                <div className="bg-gray-50 border rounded-lg px-3 py-2 font-mono text-xs break-all">{quoteLink}</div>
              </>
            )}
            <div className="flex justify-end gap-2 mt-4">
              {!isDesktop && <button onClick={() => copyLink(quoteLink)} className="btn-secondary"><Copy className="w-4 h-4" /> Copy link</button>}
              <a href={quoteLink} target="_blank" rel="noreferrer" className="btn-primary"><ExternalLink className="w-4 h-4" /> Open → Print / PDF</a>
            </div>
            <button onClick={() => setQuoteLink(null)} className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-3">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateQuotationModal({ onClose, onCreated }: { onClose: () => void; onCreated: (url: string) => void }) {
  const [customer, setCustomer] = useState({ customerName: '', customerMobile: '' });
  const [items, setItems] = useState<any[]>([{ particular: '', purity: '22K', netWeight: 0, ratePerGram: 0, makingCharges: 0, hallMarkAmount: 0, quantity: 1 }]);
  const [discount, setDiscount] = useState(0);
  const [validDays, setValidDays] = useState(15);
  const [notes, setNotes] = useState('');
  const [isGst, setIsGst] = useState(true);

  const createMutation = useMutation({
    mutationFn: (body: any) => api.createQuotation(body),
    onSuccess: (q: any) => {
      onCreated(`${window.location.origin}/q/${q.token}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const calcItem = (it: any) => {
    const metal = (it.netWeight || 0) * (it.ratePerGram || 0);
    const total = metal + (it.makingCharges || 0) + (it.hallMarkAmount || 0) - (it.discount || 0);
    return { metal, total: Math.round(total * 100) / 100 };
  };
  const gross = items.reduce((s, it) => s + calcItem(it).total, 0);
  const net = Math.max(0, gross - (discount || 0));
  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN');

  const setItem = (i: number, patch: any) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-2" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">New Quotation (Estimated Bill)</h3>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <div><label className="label">Customer Name *</label><input className="input-field" value={customer.customerName} onChange={(e) => setCustomer({ ...customer, customerName: e.target.value })} /></div>
          <div><label className="label">Mobile</label><input className="input-field" value={customer.customerMobile} onChange={(e) => setCustomer({ ...customer, customerMobile: e.target.value })} /></div>
          <div><label className="label">Valid for (days)</label><input type="number" className="input-field" value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} /></div>
          <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isGst} onChange={(e) => setIsGst(e.target.checked)} /> GST quote</label></div>
        </div>

        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead><tr className="bg-gray-50 text-left text-xs text-gray-500">
            <th className="px-2 py-2">Particular</th><th className="px-2 py-2 w-20">Purity</th>
            <th className="px-2 py-2 w-24">Net Wt</th><th className="px-2 py-2 w-24">Rate/g</th>
            <th className="px-2 py-2 w-24">Making</th><th className="px-2 py-2 w-24">Hallmark</th><th className="px-2 py-2 w-24 text-right">Total</th>
          </tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1.5"><input className="input-field !py-1" value={it.particular} onChange={(e) => setItem(i, { particular: e.target.value })} placeholder="Gold Ring 22K" /></td>
                <td className="px-2 py-1.5"><input className="input-field !py-1" value={it.purity} onChange={(e) => setItem(i, { purity: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input type="number" step="0.001" className="input-field !py-1" value={it.netWeight || ''} onChange={(e) => setItem(i, { netWeight: Number(e.target.value) })} /></td>
                <td className="px-2 py-1.5"><input type="number" className="input-field !py-1" value={it.ratePerGram || ''} onChange={(e) => setItem(i, { ratePerGram: Number(e.target.value) })} /></td>
                <td className="px-2 py-1.5"><input type="number" className="input-field !py-1" value={it.makingCharges || ''} onChange={(e) => setItem(i, { makingCharges: Number(e.target.value) })} /></td>
                <td className="px-2 py-1.5"><input type="number" className="input-field !py-1" value={it.hallMarkAmount || ''} onChange={(e) => setItem(i, { hallMarkAmount: Number(e.target.value) })} /></td>
                <td className="px-2 py-1.5 text-right font-medium">{fm(calcItem(it).total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => setItems((prev) => [...prev, { particular: '', purity: '22K', netWeight: 0, ratePerGram: 0, makingCharges: 0, hallMarkAmount: 0, quantity: 1 }])} className="btn-secondary text-xs mt-2"><Plus className="w-3 h-3" /> Add row</button>

        <div className="grid grid-cols-3 gap-4 mt-4 items-end">
          <div><label className="label">Discount (₹)</label><input type="number" className="input-field" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
          <div><label className="label">Notes</label><input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Rates as on today…" /></div>
          <div className="bg-primary-50 rounded-xl p-3 text-right">
            <p className="text-xs text-primary-600">Estimated total{isGst ? ' (incl. GST)' : ''}</p>
            <p className="text-xl font-bold text-primary-900">{fm(net)}</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => {
              const valid = items.filter((it) => it.particular?.trim());
              if (!customer.customerName.trim()) { toast.error('Customer name required'); return; }
              if (valid.length === 0) { toast.error('Add at least one item'); return; }
              createMutation.mutate({
                ...customer,
                isGst,
                discount,
                notes,
                validUntil: new Date(Date.now() + validDays * 86400000).toISOString(),
                items: valid.map((it) => ({ ...it, metalValue: Math.round((it.netWeight || 0) * (it.ratePerGram || 0) * 100) / 100, totalAmount: calcItem(it).total })),
              });
            }}
            className="btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create & Get Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

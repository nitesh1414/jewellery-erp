import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Printer, Tag, CheckCircle, AlertTriangle } from 'lucide-react';

/**
 * PUBLIC quotation view — customers open the shareable link (/q/:token)
 * without logging in. Works on the web deployment and inside the desktop app
 * (the local backend serves the same SPA).
 */
export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`/api/quotations/public/${token}`)
      .then((res) => setQuote(res.data))
      .catch((e) => setError(e.response?.data?.message || 'Quotation not found'))
      .finally(() => setLoading(false));
  }, [token]);

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center max-w-md">
          <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold mb-2">Quotation unavailable</h1>
          <p className="text-sm text-gray-500">{error}. Please contact the shop for a new link.</p>
        </div>
      </div>
    );
  }

  const expired = quote.isExpired && quote.status === 'ACTIVE';
  const shop = quote.shop || {};

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto">
        {/* toolbar (hidden when printing) */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Tag className="w-4 h-4" /> Quotation <span className="font-mono font-semibold text-gray-900">{quote.quoteNumber}</span>
          </div>
          <button onClick={() => window.print()} className="btn-primary text-sm"><Printer className="w-4 h-4" /> Print / Save PDF</button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 print:border-0 print:shadow-none print:p-0">
          {/* header */}
          <div className="flex justify-between items-start border-b pb-5 mb-5">
            <div className="flex items-center gap-3">
              {shop.logo && <img src={shop.logo} alt="logo" className="w-14 h-14 rounded-lg object-contain border border-gray-100" />}
              <div>
                <h1 className="text-xl font-bold text-gray-900">{shop.shopName || 'Jewellery Shop'}</h1>
              {shop.shopAddress && <p className="text-xs text-gray-500 mt-0.5">{shop.shopAddress}{shop.shopCity ? ', ' + shop.shopCity : ''}</p>}
              {shop.shopPhone && <p className="text-xs text-gray-500">Phone: {shop.shopPhone}</p>}
                {shop.shopGstin && quote.isGst && <p className="text-xs text-gray-500">GSTIN: {shop.shopGstin}</p>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-primary-700 uppercase tracking-wide">Quotation / Estimate</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(quote.createdAt).toLocaleString('en-IN')}</p>
              {quote.validUntil && (
                <p className={'text-xs mt-1 ' + (expired ? 'text-red-600 font-medium' : 'text-gray-500')}>
                  Valid until {new Date(quote.validUntil).toLocaleDateString('en-IN')}
                </p>
              )}
            </div>
          </div>

          {/* status banner */}
          {quote.status === 'ACCEPTED' && (
            <div className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-lg px-3 py-2 text-sm mb-4"><CheckCircle className="w-4 h-4" /> This quotation has been accepted.</div>
          )}
          {expired && (
            <div className="flex items-center gap-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg px-3 py-2 text-sm mb-4"><AlertTriangle className="w-4 h-4" /> This quotation has expired — please ask for refreshed rates.</div>
          )}

          {/* customer */}
          <div className="mb-5">
            <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-1">Prepared for</p>
            <p className="font-medium">{quote.customerName}</p>
            {quote.customerMobile && <p className="text-sm text-gray-500">{quote.customerMobile}</p>}
          </div>

          {/* items */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 text-left text-xs uppercase text-gray-400">
                <th className="py-2">#</th>
                <th className="py-2">Particular</th>
                <th className="py-2">Purity</th>
                <th className="py-2 text-right">Net Wt (g)</th>
                <th className="py-2 text-right">Rate/g</th>
                <th className="py-2 text-right">Making</th>
                <th className="py-2 text-right">Hallmark</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.items?.map((it: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 text-gray-400">{i + 1}</td>
                  <td className="py-2 font-medium">{it.particular}</td>
                  <td className="py-2">{it.purity || '—'}</td>
                  <td className="py-2 text-right">{it.netWeight ? it.netWeight.toFixed(3) : '—'}</td>
                  <td className="py-2 text-right">{it.ratePerGram ? fm(it.ratePerGram) : '—'}</td>
                  <td className="py-2 text-right">{it.makingCharges ? fm(it.makingCharges) : '—'}</td>
                  <td className="py-2 text-right">{it.hallMarkAmount ? fm(it.hallMarkAmount) : '—'}</td>
                  <td className="py-2 text-right font-semibold">{fm(it.totalAmount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* totals */}
          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Gross</span><span>{fm(quote.grossAmount)}</span></div>
              {quote.discount > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="text-red-600">- {fm(quote.discount)}</span></div>}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Estimated Total</span><span>{fm(quote.netAmount)}</span>
              </div>
              {quote.isGst && <p className="text-[11px] text-gray-400 text-right">Inclusive of GST @ 3%</p>}
            </div>
          </div>

          {quote.notes && <p className="text-xs text-gray-500 mt-4 border-t pt-3">Note: {quote.notes}</p>}

          <p className="text-[11px] text-gray-400 mt-6 text-center border-t pt-4">
            This is an estimate, not a tax invoice. Gold rate fluctuates daily — final billing weight & rate apply.
            <br />Prices valid {quote.validUntil ? `until ${new Date(quote.validUntil).toLocaleDateString('en-IN')}` : 'same day'}.
          </p>
        </div>
      </div>
    </div>
  );
}

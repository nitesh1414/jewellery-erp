import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ArrowLeft, Phone, Mail, MapPin, IndianRupee, Receipt } from 'lucide-react';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.getCustomer(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (!customer) return <div className="text-center py-12 text-gray-500">Customer not found</div>;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/customers')} className="btn-ghost">
        <ArrowLeft className="w-4 h-4" /> Back to Customers
      </button>

      <div className="card">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-2xl font-bold">
              {customer.name?.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              <p className="text-sm text-gray-500">{customer.customerId}</p>
              <div className="flex gap-4 mt-2 text-sm text-gray-600">
                {customer.mobile && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{customer.mobile}</span>}
                {customer.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{customer.email}</span>}
                {customer.city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{customer.city}</span>}
              </div>
            </div>
          </div>
          {customer.gstin && <span className="badge-info">GST: {customer.gstin}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ledger */}
        <div className="card">
          <h2 className="section-title mb-4">Ledger</h2>
          <div className="overflow-auto max-h-80">
            <div className="table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b"><th className="text-left py-2 text-gray-500 font-medium">Date</th><th className="text-left py-2 text-gray-500 font-medium">Description</th><th className="text-right py-2 text-gray-500 font-medium">Debit</th><th className="text-right py-2 text-gray-500 font-medium">Credit</th><th className="text-right py-2 text-gray-500 font-medium">Balance</th></tr>
              </thead>
              <tbody>
                {customer.ledgerEntries?.map((entry: any) => (
                  <tr key={entry.id} className="border-b border-gray-50">
                    <td className="py-2">{new Date(entry.date).toLocaleDateString('en-IN')}</td>
                    <td className="py-2">{entry.description || entry.transactionType}</td>
                    <td className="py-2 text-right text-red-600">{entry.debit > 0 ? `₹${entry.debit.toLocaleString('en-IN')}` : '-'}</td>
                    <td className="py-2 text-right text-green-600">{entry.credit > 0 ? `₹${entry.credit.toLocaleString('en-IN')}` : '-'}</td>
                    <td className="py-2 text-right font-medium">₹{entry.balance?.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {(!customer.ledgerEntries || customer.ledgerEntries.length === 0) && (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400">No ledger entries</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        {/* Recent Bills */}
        <div className="card">
          <h2 className="section-title mb-4">Recent Bills</h2>
          <div className="overflow-auto max-h-80">
            <div className="table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b"><th className="text-left py-2 text-gray-500 font-medium">Bill No.</th><th className="text-left py-2 text-gray-500 font-medium">Date</th><th className="text-right py-2 text-gray-500 font-medium">Amount</th><th className="text-right py-2 text-gray-500 font-medium">Status</th></tr>
              </thead>
              <tbody>
                {customer.sales?.map((sale: any) => (
                  <tr key={sale.id} className="border-b border-gray-50">
                    <td className="py-2 font-medium">{sale.billNumber}</td>
                    <td className="py-2">{new Date(sale.billDate).toLocaleDateString('en-IN')}</td>
                    <td className="py-2 text-right">₹{sale.netAmount?.toLocaleString('en-IN')}</td>
                    <td className="py-2 text-right"><span className={`badge ${sale.status === 'FINALIZED' ? 'badge-success' : 'badge-gray'}`}>{sale.status}</span></td>
                  </tr>
                ))}
                {(!customer.sales || customer.sales.length === 0) && (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-400">No bills yet</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
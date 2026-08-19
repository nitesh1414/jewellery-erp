import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ChevronLeft, Printer } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/format';

export default function CustomerPrintPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.getCustomer(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  if (!customer) return <div className="p-8">Customer not found</div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="no-print sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <button onClick={() => navigate(`/customers/${id}`)} className="btn-ghost">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button onClick={() => window.print()} className="btn-primary">
            <Printer className="w-4 h-4" /> Print Statement
          </button>
        </div>
      </div>

      <div className="print-invoice max-w-3xl mx-auto my-6 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold mb-2 text-center">Customer Statement</h1>
        <p className="text-center text-sm text-gray-500 mb-6">As of {new Date().toLocaleDateString('en-IN')}</p>

        <div className="mb-6 border-b pb-4">
          <h2 className="text-xl font-bold">{customer.name}</h2>
          <p className="text-sm text-gray-600">ID: {customer.customerId}</p>
          {customer.mobile && <p className="text-sm">📱 {customer.mobile}</p>}
          {customer.address && <p className="text-sm">{customer.address}, {customer.city}</p>}
          {customer.gstin && <p className="text-sm">GSTIN: {customer.gstin}</p>}
        </div>

        <h3 className="font-semibold mb-3">Ledger Entries</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2 text-left">Date</th>
              <th className="border p-2 text-left">Description</th>
              <th className="border p-2 text-right">Debit</th>
              <th className="border p-2 text-right">Credit</th>
              <th className="border p-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {customer.ledgerEntries?.map((e: any) => (
              <tr key={e.id}>
                <td className="border p-2">{formatDate(e.date)}</td>
                <td className="border p-2">{e.description || e.transactionType}</td>
                <td className="border p-2 text-right text-red-600">{e.debit > 0 ? formatCurrency(e.debit) : '-'}</td>
                <td className="border p-2 text-right text-green-600">{e.credit > 0 ? formatCurrency(e.credit) : '-'}</td>
                <td className="border p-2 text-right font-semibold">{formatCurrency(Math.abs(e.balance))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-gray-400 mt-8 text-center">Generated on {new Date().toLocaleString('en-IN')}</p>
      </div>
    </div>
  );
}
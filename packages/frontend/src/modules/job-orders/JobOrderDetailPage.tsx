import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ArrowLeft } from 'lucide-react';

export default function JobOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['job-order', id],
    queryFn: () => api.getJobOrder(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  if (!data) {
    return <div className="text-center py-12 text-gray-500">Job order not found</div>;
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/job-orders')} className="btn-ghost">
        <ArrowLeft className="w-4 h-4" /> Back to Job Orders
      </button>

      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{data.jobNumber}</h1>
            <p className="text-gray-500 mt-1">{data.productDescription}</p>
          </div>
          <span className={`badge ${data.status === 'READY' || data.status === 'DELIVERED' ? 'badge-success' : data.status === 'ASSIGNED' ? 'badge-info' : 'badge-warning'}`}>
            {data.status}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 pt-6 border-t">
          <div>
            <p className="text-sm text-gray-500">Customer</p>
            <p className="font-medium">{data.customerName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Purity / Metal</p>
            <p className="font-medium">{data.purity} - {data.metalType}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Expected Weight</p>
            <p className="font-medium">{data.expectedWeight}g</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Expected Delivery</p>
            <p className="font-medium">{new Date(data.expectedDelivery).toLocaleDateString('en-IN')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Estimated Amount</p>
            <p className="font-medium">₹{data.estimatedAmount?.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Advance</p>
            <p className="font-medium text-green-600">₹{data.advanceAmount?.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Balance</p>
            <p className="font-medium text-red-600">₹{data.balanceAmount?.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      {/* Assignments */}
      {data.assignments && data.assignments.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4">Assignments</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b"><th className="text-left py-2 text-gray-500">Employee</th><th className="text-left py-2 text-gray-500">Due Date</th><th className="text-left py-2 text-gray-500">Status</th></tr></thead>
            <tbody>
              {data.assignments.map((a: any) => (
                <tr key={a.id} className="border-b border-gray-50">
                  <td className="py-2">{a.employeeName}</td>
                  <td className="py-2">{new Date(a.dueDate).toLocaleDateString('en-IN')}</td>
                  <td className="py-2"><span className="badge-info">{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
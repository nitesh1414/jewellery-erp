import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { InvoicePrint, InvoiceFormat } from '../../components/invoice/InvoicePrint';
import { ChevronLeft, Printer, Download, FileText, Receipt, Tag } from 'lucide-react';

export default function SalePrintPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialFormat = (params.get('format') as InvoiceFormat) || 'A4_GST';
  const [format, setFormat] = useState<InvoiceFormat>(initialFormat);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: bill, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: () => api.getSale(id!),
    enabled: !!id,
  });

  const { data: shop } = useQuery({ queryKey: ['shop'], queryFn: () => api.getSettings() });

  useEffect(() => {
    // Auto-trigger print when ?auto=1 in URL
    if (params.get('auto') === '1' && bill) {
      setTimeout(() => handlePrint(), 800);
    }
  }, [bill]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    // Browsers can save PDF from print dialog
    window.print();
  };

  const formats: { key: InvoiceFormat; label: string; icon: any; desc: string }[] = [
    { key: 'A4_GST', label: 'A4 Tax Invoice', icon: FileText, desc: 'GST-compliant A4 invoice' },
    { key: 'THERMAL', label: 'Thermal Receipt', icon: Receipt, desc: 'Compact 80mm thermal' },
    { key: 'ESTIMATE', label: 'Estimate / Quote', icon: Tag, desc: 'Non-binding estimate' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Bill not found</p>
          <button onClick={() => navigate('/bills')} className="btn-primary">Back to Bills</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Toolbar - hidden when printing */}
      <div className="no-print sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <button onClick={() => navigate('/bills')} className="btn-ghost">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          {/* Format selector */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {formats.map(f => (
              <button
                key={f.key}
                onClick={() => setFormat(f.key)}
                className={'px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2 ' + (format === f.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700')}
              >
                <f.icon className="w-3.5 h-3.5" />
                {f.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleDownloadPDF} className="btn-secondary">
              <Download className="w-4 h-4" /> Save as PDF
            </button>
            <button onClick={handlePrint} className="btn-primary">
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>
      </div>

      {/* Bill info bar */}
      <div className="no-print max-w-7xl mx-auto px-6 py-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 flex items-center gap-4 text-sm">
          <strong className="text-blue-800">Bill {bill.billNumber}</strong>
          <span className="text-blue-600">|</span>
          <span className="text-blue-700">{bill.customerName}</span>
          <span className="text-blue-600">|</span>
          <span className="text-blue-700">₹{(bill.netAmount || 0).toLocaleString('en-IN')}</span>
          <span className="text-blue-600">|</span>
          <span className="text-blue-700 text-xs">{formats.find(f => f.key === format)?.desc}</span>
        </div>
      </div>

      {/* Invoice Content - only this area prints */}
      <div className="py-6">
        <div className="print-invoice" ref={printRef}>
          <InvoicePrint bill={bill} shop={shop || { shopName: 'Jewellery Shop' }} format={format} />
        </div>
      </div>
    </div>
  );
}
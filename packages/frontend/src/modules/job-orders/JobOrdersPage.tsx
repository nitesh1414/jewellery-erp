import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import {
  Search, Plus, Briefcase, Clock, CheckCircle, AlertCircle,
  User, Calendar, HandCoins, FileText, ChevronRight,
} from 'lucide-react';

export default function JobOrdersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [showAdvance, setShowAdvance] = useState(false);
  const [showBill, setShowBill] = useState(false);
  const [form, setForm] = useState({ customerName: '', customerMobile: '', productDescription: '', purity: '22K', metalType: 'GOLD', expectedWeight: 0, expectedDelivery: '', estimatedAmount: 0, advanceAmount: 0, notes: '' });

  // Advance modal state
  const [advanceForm, setAdvanceForm] = useState({ amount: 0, paymentMode: 'CASH', reference: '' });
  // Final bill modal state
  const [billForm, setBillForm] = useState({ netWeight: 0, ratePerGram: 0, makingChargeType: 'PERCENTAGE', makingChargeValue: 10, hsnCode: '7113', billType: 'GST', discount: 0 });

  const { data } = useQuery({ queryKey: ['job-orders', search, status, page], queryFn: () => api.getJobOrders({ search, status, page, limit: 20 }) });
  const { data: jobDetail } = useQuery({ queryKey: ['job-order', selectedJob?.id], queryFn: () => api.getJobOrder(selectedJob.id), enabled: !!selectedJob });
  const { data: stats } = useQuery({ queryKey: ['job-stats'], queryFn: () => api.getJobOrderStats() });

  const createMutation = useMutation({
    mutationFn: (b: any) => api.createJobOrder(b),
    onSuccess: () => { toast.success('Job order created!'); qc.invalidateQueries({ queryKey: ['job-orders'] }); setShowCreate(false); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.addJobAdvance(id, body),
    onSuccess: (d: any) => {
      toast.success('Advance recorded for ' + d.jobNumber);
      qc.invalidateQueries({ queryKey: ['job-orders'] });
      qc.invalidateQueries({ queryKey: ['job-order', selectedJob?.id] });
      setShowAdvance(false);
      setAdvanceForm({ amount: 0, paymentMode: 'CASH', reference: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const finalBillMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.generateJobFinalBill(id, body),
    onSuccess: (d: any) => {
      toast.success('Final bill ' + d.billNumber + ' generated!');
      qc.invalidateQueries({ queryKey: ['job-orders'] });
      qc.invalidateQueries({ queryKey: ['job-order', selectedJob?.id] });
      setShowBill(false);
      // Open the bill for printing
      window.open('/print/sale/' + d.id + '?format=A4_GST', '_blank');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const statusColors: Record<string, string> = {
    ASSIGNED: 'badge-info', ACCEPTED: 'badge-info', IN_PROGRESS: 'badge-warning',
    QUALITY_CHECK: 'badge-warning', READY: 'badge-success', DELIVERED: 'badge-success', CANCELLED: 'badge-danger',
  };

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN');
  const fmt = (n: number) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  // Compute estimated final bill preview
  const billPreview = (() => {
    if (!billForm.netWeight || !billForm.ratePerGram) return null;
    const mv = billForm.netWeight * billForm.ratePerGram;
    let mk = 0;
    if (billForm.makingChargeType === 'PERCENTAGE') mk = mv * (billForm.makingChargeValue / 100);
    else if (billForm.makingChargeType === 'PER_GRAM') mk = billForm.netWeight * billForm.makingChargeValue;
    else mk = billForm.makingChargeValue;
    const taxable = mv + mk - (billForm.discount || 0);
    const cgst = billForm.billType === 'GST' ? taxable * 0.015 : 0;
    const sgst = billForm.billType === 'GST' ? taxable * 0.015 : 0;
    const net = taxable + cgst + sgst;
    return { mv, mk, taxable, cgst, sgst, net, balance: Math.max(0, net - (selectedJob?.advanceAmount || 0)) };
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Job Orders</h1><p className="text-gray-500 text-sm mt-1">Custom jewellery — token, advance & final bill on delivery</p></div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4" /> New Job Order</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="stat-card"><p className="stat-label">Total Jobs</p><p className="stat-value">{stats?.total || 0}</p></div>
        <div className="stat-card"><p className="stat-label">In Progress</p><p className="stat-value text-orange-600">{stats?.active || 0}</p></div>
        <div className="stat-card"><p className="stat-label">Ready</p><p className="stat-value text-green-600">{stats?.ready || 0}</p></div>
        <div className="stat-card"><p className="stat-label">Total Advance</p><p className="stat-value">{fm(stats?.totalAdvance)}</p></div>
        <div className="stat-card"><p className="stat-label">Balance Due</p><p className="stat-value text-red-600">{fm(stats?.totalBalance)}</p></div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="text" placeholder="Search job number or customer..." className="input-field pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
        <select className="input-field w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1); setSelectedJob(null); }}>
          <option value="">All Status</option>
          <option value="ASSIGNED">Assigned</option><option value="ACCEPTED">Accepted</option><option value="IN_PROGRESS">In Progress</option>
          <option value="QUALITY_CHECK">Quality Check</option><option value="READY">Ready</option><option value="DELIVERED">Delivered</option><option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job list */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden divide-y">
            {data?.items?.map((j: any) => (
              <div key={j.id} onClick={() => setSelectedJob(j)}
                className={'p-4 cursor-pointer hover:bg-gray-50 transition-colors ' + (selectedJob?.id === j.id ? 'bg-primary-50 border-l-4 border-l-primary-500' : '')}>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">{j.jobNumber}</p>
                  <span className={'badge ' + (statusColors[j.status] || 'badge-gray')}>{j.status}</span>
                </div>
                <p className="text-sm text-gray-700">{j.customerName}</p>
                <p className="text-xs text-gray-400 mt-1">{j.productDescription}</p>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className={j.advanceAmount > 0 ? 'text-green-600' : 'text-gray-400'}>Adv: {fm(j.advanceAmount)}</span>
                  <span className="text-gray-500">Due: {fm(j.balanceAmount)}</span>
                </div>
              </div>
            ))}
            {(!data?.items || data.items.length === 0) && <p className="text-center py-8 text-gray-400">No job orders</p>}
          </div>
          {data && data.totalPages > 1 && (
            <div className="flex justify-between mt-3">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm py-1">Prev</button>
              <span className="text-sm text-gray-500">{page}/{data.totalPages}</span>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm py-1">Next</button>
            </div>
          )}
        </div>

        {/* Job detail */}
        <div className="lg:col-span-2">
          {selectedJob ? (
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold">{selectedJob.jobNumber}</h2>
                    <p className="text-gray-500">{selectedJob.productDescription}</p>
                    <p className="text-xs text-gray-400 mt-1">Token: {selectedJob.jobNumber} · Created {new Date(selectedJob.createdAt).toLocaleDateString('en-IN')}</p>
                  </div>
                  <span className={'badge text-sm ' + (statusColors[selectedJob.status] || 'badge-gray')}>{selectedJob.status}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><p className="text-xs text-gray-500">Customer</p><p className="font-medium">{selectedJob.customerName}</p></div>
                  <div><p className="text-xs text-gray-500">Purity</p><p className="font-medium">{selectedJob.purity}</p></div>
                  <div><p className="text-xs text-gray-500">Expected Weight</p><p className="font-medium">{selectedJob.expectedWeight}g</p></div>
                  <div><p className="text-xs text-gray-500">Delivery</p><p className="font-medium">{new Date(selectedJob.expectedDelivery).toLocaleDateString('en-IN')}</p></div>
                  <div><p className="text-xs text-gray-500">Estimated</p><p className="font-medium">{fm(selectedJob.estimatedAmount)}</p></div>
                  <div><p className="text-xs text-gray-500">Advance</p><p className="font-medium text-green-600">{fm(selectedJob.advanceAmount)}</p></div>
                  <div><p className="text-xs text-gray-500">Balance Due</p><p className="font-medium text-red-600">{fm(selectedJob.balanceAmount)}</p></div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                  <button onClick={() => setShowAdvance(true)} className="btn-secondary text-sm">
                    <HandCoins className="w-4 h-4" /> Add Advance
                  </button>
                  {['READY', 'DELIVERED'].includes(selectedJob.status) && (
                    <button onClick={() => setShowBill(true)} className="btn-primary text-sm">
                      <FileText className="w-4 h-4" /> Generate Final Bill
                    </button>
                  )}
                  {!['READY', 'DELIVERED'].includes(selectedJob.status) && (
                    <span className="text-xs text-gray-400 self-center ml-1">Final bill available when job is <strong>READY</strong></span>
                  )}
                </div>
              </div>

              {/* Assignments */}
              {jobDetail?.assignments?.length > 0 && (
                <div className="card">
                  <h3 className="section-title mb-3">Assignments</h3>
                  {jobDetail.assignments.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-2">
                      <div className="flex items-center gap-3">
                        <User className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-sm">{a.employeeName}</p>
                          <p className="text-xs text-gray-400">Due: {new Date(a.dueDate).toLocaleDateString('en-IN')}</p>
                        </div>
                      </div>
                      <span className={'badge ' + (statusColors[a.status] || 'badge-gray')}>{a.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Materials */}
              {jobDetail?.materials?.length > 0 && (
                <div className="card">
                  <h3 className="section-title mb-3">Material Issued</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-2 text-gray-500">Metal</th><th className="text-left py-2 text-gray-500">Purity</th><th className="text-right py-2 text-gray-500">Weight</th><th className="text-right py-2 text-gray-500">Date</th></tr></thead>
                    <tbody>
                      {jobDetail.materials.map((m: any) => (
                        <tr key={m.id} className="border-b border-gray-50">
                          <td className="py-2">{m.metalType}</td>
                          <td className="py-2">{m.purity}</td>
                          <td className="py-2 text-right font-medium">{m.weight}g</td>
                          <td className="py-2 text-right">{new Date(m.issuedDate).toLocaleDateString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="card flex items-center justify-center py-16 text-gray-400">
              <div className="text-center"><Briefcase className="w-12 h-12 mx-auto mb-3" /><p className="text-lg font-medium">Select a job order</p><p className="text-sm mt-1">Then take advance / generate final bill</p></div>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">New Job Order — issues a Token Number</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Customer Name *</label><input className="input-field" value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} /></div>
              <div><label className="label">Mobile</label><input className="input-field" value={form.customerMobile} onChange={e => setForm({...form, customerMobile: e.target.value})} /></div>
              <div><label className="label">Product Description *</label><input className="input-field" value={form.productDescription} onChange={e => setForm({...form, productDescription: e.target.value})} placeholder="Gold Ring with diamond" /></div>
              <div><label className="label">Metal</label><select className="input-field" value={form.metalType} onChange={e => setForm({...form, metalType: e.target.value})}><option value="GOLD">Gold</option><option value="SILVER">Silver</option></select></div>
              <div><label className="label">Purity</label><select className="input-field" value={form.purity} onChange={e => setForm({...form, purity: e.target.value})}><option value="24K">24K</option><option value="22K">22K</option><option value="18K">18K</option></select></div>
              <div><label className="label">Expected Weight (g)</label><input type="number" step="0.01" className="input-field" value={form.expectedWeight || ''} onChange={e => setForm({...form, expectedWeight: Number(e.target.value)})} /></div>
              <div><label className="label">Expected Delivery *</label><input type="date" className="input-field" value={form.expectedDelivery} onChange={e => setForm({...form, expectedDelivery: e.target.value})} /></div>
              <div><label className="label">Estimated Amount (₹)</label><input type="number" className="input-field" value={form.estimatedAmount || ''} onChange={e => setForm({...form, estimatedAmount: Number(e.target.value)})} /></div>
              <div><label className="label">Advance / Token Money (₹)</label><input type="number" className="input-field" value={form.advanceAmount || ''} onChange={e => setForm({...form, advanceAmount: Number(e.target.value)})} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!form.customerName || !form.productDescription || !form.expectedDelivery) { toast.error('Fill required fields'); return; }
                createMutation.mutate(form);
              }} disabled={createMutation.isPending} className="btn-primary">Create & Issue Token</button>
            </div>
          </div>
        </div>
      )}

      {/* Advance Modal */}
      {showAdvance && selectedJob && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAdvance(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Add Advance</h3>
            <p className="text-sm text-gray-500 mb-4">{selectedJob.jobNumber} · {selectedJob.customerName}</p>
            <div className="space-y-3">
              <div>
                <label className="label">Amount (₹) *</label>
                <input type="number" className="input-field" value={advanceForm.amount || ''} onChange={e => setAdvanceForm({...advanceForm, amount: Number(e.target.value)})} autoFocus />
                <p className="text-xs text-gray-400 mt-1">Balance due after this: {fm(Math.max(0, selectedJob.balanceAmount - advanceForm.amount))}</p>
              </div>
              <div>
                <label className="label">Payment Mode</label>
                <select className="input-field" value={advanceForm.paymentMode} onChange={e => setAdvanceForm({...advanceForm, paymentMode: e.target.value})}>
                  <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="DEBIT_CARD">Debit Card</option>
                  <option value="CREDIT_CARD">Credit Card</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div><label className="label">Reference</label><input className="input-field" value={advanceForm.reference} onChange={e => setAdvanceForm({...advanceForm, reference: e.target.value})} placeholder="Optional" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowAdvance(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (advanceForm.amount <= 0) { toast.error('Enter amount'); return; }
                advanceMutation.mutate({ id: selectedJob.id, body: advanceForm });
              }} disabled={advanceMutation.isPending} className="btn-primary">
                <HandCoins className="w-4 h-4" /> Record Advance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Final Bill Modal */}
      {showBill && selectedJob && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowBill(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Generate Final Bill</h3>
            <p className="text-sm text-gray-500 mb-4">{selectedJob.jobNumber} · {selectedJob.productDescription} · Advance paid: {fm(selectedJob.advanceAmount)}</p>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Net Weight (g) *</label><input type="number" step="0.001" className="input-field" value={billForm.netWeight || ''} onChange={e => setBillForm({...billForm, netWeight: Number(e.target.value)})} /></div>
              <div><label className="label">Rate / g (₹) *</label><input type="number" className="input-field" value={billForm.ratePerGram || ''} onChange={e => setBillForm({...billForm, ratePerGram: Number(e.target.value)})} /></div>
              <div><label className="label">Making Type</label><select className="input-field" value={billForm.makingChargeType} onChange={e => setBillForm({...billForm, makingChargeType: e.target.value})}><option value="PERCENTAGE">%</option><option value="PER_GRAM">/g</option><option value="FIXED_AMOUNT">Fixed</option></select></div>
              <div><label className="label">Making Value</label><input type="number" className="input-field" value={billForm.makingChargeValue} onChange={e => setBillForm({...billForm, makingChargeValue: Number(e.target.value)})} /></div>
              <div><label className="label">HSN</label><input className="input-field" value={billForm.hsnCode} onChange={e => setBillForm({...billForm, hsnCode: e.target.value})} /></div>
              <div><label className="label">Bill Type</label><select className="input-field" value={billForm.billType} onChange={e => setBillForm({...billForm, billType: e.target.value})}><option value="GST">GST</option><option value="NON_GST">Non-GST</option></select></div>
              <div><label className="label">Discount (₹)</label><input type="number" className="input-field" value={billForm.discount || ''} onChange={e => setBillForm({...billForm, discount: Number(e.target.value)})} /></div>
            </div>

            {billPreview && (
              <div className="mt-4 p-4 bg-gray-50 rounded-xl space-y-1.5 text-sm">
                <div className="flex justify-between"><span>Metal Value</span><span>{fm(billPreview.mv)}</span></div>
                <div className="flex justify-between"><span>Making</span><span>{fm(billPreview.mk)}</span></div>
                {billForm.discount > 0 && <div className="flex justify-between"><span>Discount</span><span className="text-red-600">-{fm(billForm.discount)}</span></div>}
                {billForm.billType === 'GST' && <>
                  <div className="flex justify-between"><span>CGST 1.5%</span><span>{fm(billPreview.cgst)}</span></div>
                  <div className="flex justify-between"><span>SGST 1.5%</span><span>{fm(billPreview.sgst)}</span></div>
                </>}
                <div className="flex justify-between font-bold border-t pt-2"><span>Bill Total</span><span>{fm(billPreview.net)}</span></div>
                <div className="flex justify-between text-green-600"><span>Advance (paid)</span><span>-{fm(selectedJob.advanceAmount)}</span></div>
                <div className="flex justify-between font-semibold text-red-600"><span>Balance Payable</span><span>{fm(billPreview.balance)}</span></div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowBill(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!billForm.netWeight || !billForm.ratePerGram) { toast.error('Enter weight and rate'); return; }
                finalBillMutation.mutate({ id: selectedJob.id, body: billForm });
              }} disabled={finalBillMutation.isPending} className="btn-primary">
                <FileText className="w-4 h-4" /> {finalBillMutation.isPending ? 'Generating...' : 'Generate Final Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

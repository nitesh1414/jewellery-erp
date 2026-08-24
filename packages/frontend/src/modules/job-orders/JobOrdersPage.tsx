import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import {
  Search, Plus, Briefcase, Clock, CheckCircle, AlertCircle,
  User, Calendar, HandCoins, FileText, ChevronRight, HardHat, UserPlus, X, History,
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
  const [form, setForm] = useState<any>({ customerId: '', customerName: '', customerMobile: '', productDescription: '', purity: '22K', metalType: 'GOLD', expectedWeight: 0, expectedDelivery: '', estimatedAmount: 0, advanceAmount: 0, notes: '', assignEmployeeId: '', assignDueDate: '' });
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '', address: '', city: '' });

  // Advance modal state
  const [advanceForm, setAdvanceForm] = useState({ amount: 0, paymentMode: 'CASH', reference: '', accountId: '' });
  // Assign worker modal state
  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({ employeeId: '', dueDate: '', notes: '' });
  // Status-change modal (records action date + notes for the job log)
  const [showStatus, setShowStatus] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: '', date: '', notes: '' });

  const assignMutation = useMutation({
    mutationFn: ({ id, body }: any) => api.post(`/job-orders/${id}/assign`, body),
    onSuccess: () => {
      toast.success('Worker assigned — job moved to ASSIGNED');
      qc.invalidateQueries({ queryKey: ['job-orders'] });
      qc.invalidateQueries({ queryKey: ['job-order', selectedJob?.id] });
      setShowAssign(false);
      setAssignForm({ employeeId: '', dueDate: '', notes: '' });
      setSelectedJob(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });
  // Final bill modal state
  const [billForm, setBillForm] = useState({ netWeight: 0, ratePerGram: 0, makingChargeType: 'PERCENTAGE', makingChargeValue: 10, hsnCode: '7113', billType: 'GST', discount: 0 });

  const { data } = useQuery({ queryKey: ['job-orders', search, status, page], queryFn: () => api.getJobOrders({ search, status, page, limit: 20 }) });
  const { data: jobDetail } = useQuery({ queryKey: ['job-order', selectedJob?.id], queryFn: () => api.getJobOrder(selectedJob.id), enabled: !!selectedJob });
  const { data: stats } = useQuery({ queryKey: ['job-stats'], queryFn: () => api.getJobOrderStats() });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });
  const { data: workersData } = useQuery({ queryKey: ['workers'], queryFn: () => api.getWorkers({ isActive: 'true' }), staleTime: 60000 });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.getAccounts(), staleTime: 60000 });
  const activeAccounts = ((accounts as any) || []).filter((a: any) => a.isActive !== false && !['INCOME', 'SALES', 'REVENUE'].includes(a.type));
  const workers = workersData || [];
  const { data: customerResults } = useQuery({
    queryKey: ['job-customers', customerSearch],
    queryFn: () => api.getCustomers({ search: customerSearch, limit: 8 }),
    enabled: showCustomerList && customerSearch.trim().length >= 2,
  });

  const newCustomerMutation = useMutation({
    mutationFn: (body: any) => api.createCustomer(body),
    onSuccess: (c: any) => {
      toast.success('Customer added!');
      setForm((f: any) => ({ ...f, customerId: c.id, customerName: c.name, customerMobile: c.mobile || '' }));
      setShowNewCustomer(false);
      setShowCustomerList(false);
      setNewCustomer({ name: '', mobile: '', address: '', city: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, date, notes }: any) => api.put(`/job-orders/${id}/status`, { status, date, notes }),
    onSuccess: () => {
      toast.success('Status updated');
      qc.invalidateQueries({ queryKey: ['job-orders'] });
      qc.invalidateQueries({ queryKey: ['job-order', selectedJob?.id] });
      qc.invalidateQueries({ queryKey: ['job-stats'] });
      setShowStatus(false);
      setStatusForm({ status: '', date: '', notes: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

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
      setAdvanceForm({ amount: 0, paymentMode: 'CASH', reference: '', accountId: '' });
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
    CREATED: 'badge-gray', ASSIGNED: 'badge-info', ACCEPTED: 'badge-info', IN_PROGRESS: 'badge-warning',
    QUALITY_CHECK: 'badge-warning', READY: 'badge-success', DELIVERED: 'badge-success', CANCELLED: 'badge-danger',
  };
  const JOB_FLOW: Record<string, string[]> = {
    CREATED: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
    ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['READY', 'CANCELLED'],
    QUALITY_CHECK: ['READY'],
    READY: ['DELIVERED', 'IN_PROGRESS'],
    DELIVERED: [],
    CANCELLED: ['CREATED'],
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
          <option value="CREATED">Created</option><option value="ASSIGNED">Assigned</option><option value="IN_PROGRESS">In Progress</option>
          <option value="READY">Ready</option><option value="DELIVERED">Delivered</option><option value="CANCELLED">Cancelled</option>
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

                {/* Status flow — update job status in one click */}
                {(JOB_FLOW[selectedJob.status] || []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Update status:</span>
                    {(JOB_FLOW[selectedJob.status] || []).map((st: string) => (
                      <button
                        key={st}
                        onClick={() => { setStatusForm({ status: st, date: new Date().toISOString().split('T')[0], notes: '' }); setShowStatus(true); }}
                        className={'text-xs px-3 py-1.5 rounded-lg border transition-all ' + (st === 'CANCELLED'
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : st === 'DELIVERED' || st === 'READY'
                            ? 'border-green-200 text-green-700 hover:bg-green-50 font-medium'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50')}
                      >
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                  <button onClick={() => setShowAdvance(true)} className="btn-secondary text-sm">
                    <HandCoins className="w-4 h-4" /> Add Advance
                  </button>
                  {selectedJob.status === 'CREATED' && (
                    <button onClick={() => setShowAssign(true)} className="btn-secondary text-sm">
                      <HardHat className="w-4 h-4" /> Assign Worker
                    </button>
                  )}
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

              {/* Action log / status history */}
              <div className="card">
                <h3 className="section-title mb-3 flex items-center gap-2"><History className="w-4 h-4 text-primary-600" /> Action Log</h3>
                {(jobDetail?.statusHistory?.length || 0) === 0 ? (
                  <p className="text-sm text-gray-400">No actions recorded yet.</p>
                ) : (
                  <ol className="relative border-l border-gray-200 ml-2 space-y-4">
                    {jobDetail.statusHistory.map((h: any) => (
                      <li key={h.id} className="ml-6 relative">
                        <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-primary-500 ring-4 ring-primary-100"></span>
                        <p className="text-sm font-medium text-gray-800">
                          <span className="badge badge-info">{h.toStatus?.replace(/_/g, ' ')}</span>
                          {h.fromStatus ? <span className="text-gray-400 text-xs"> from {h.fromStatus.replace(/_/g, ' ')}</span> : null}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {h.actionDate ? new Date(h.actionDate).toLocaleString('en-IN') : new Date(h.createdAt).toLocaleString('en-IN')}
                          {h.changedBy ? ' · by ' + (h.changedBy === 'system' ? 'System' : h.changedBy) : ''}
                        </p>
                        {h.notes && <p className="text-xs text-gray-600 mt-1">{h.notes}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 p-6 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">New Job Order — issues a Token Number</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 relative">
                <label className="label">Customer *</label>
                <div className="flex gap-2">
                  <input
                    className="input-field"
                    placeholder="Type name / mobile to search database…"
                    value={form.customerName}
                    onChange={(e) => { setForm({ ...form, customerName: e.target.value, customerId: '' }); setCustomerSearch(e.target.value); setShowCustomerList(true); }}
                    onFocus={() => setShowCustomerList(true)}
                  />
                  <button type="button" onClick={() => { setNewCustomer({ name: form.customerName, mobile: form.customerMobile, address: '', city: '' }); setShowNewCustomer(true); }} className="btn-secondary whitespace-nowrap text-xs">
                    <UserPlus className="w-4 h-4" /> Add New Customer
                  </button>
                </div>
                {form.customerId && <p className="text-xs text-green-600 mt-1">✓ Existing customer selected from database</p>}
                {showCustomerList && !form.customerId && customerSearch?.trim().length >= 2 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border rounded-xl shadow-lg overflow-hidden">
                    {(customerResults?.items || []).length === 0 && (
                      <button onClick={() => { setNewCustomer({ name: customerSearch, mobile: '', address: '', city: '' }); setShowNewCustomer(true); setShowCustomerList(false); }}
                        className="w-full text-left px-4 py-3 text-primary-600 font-medium border-t border-gray-100">
                        + Add “{customerSearch}” as new customer
                      </button>
                    )}
                    {(customerResults?.items || []).map((c: any) => (
                      <button key={c.id}
                        onClick={() => { setForm({ ...form, customerId: c.id, customerName: c.name, customerMobile: c.mobile || '' }); setShowCustomerList(false); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 flex justify-between items-center">
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-gray-400">{c.mobile || ''} {c.city ? '· ' + c.city : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div><label className="label">Mobile</label><input className="input-field" value={form.customerMobile} onChange={e => setForm({...form, customerMobile: e.target.value})} /></div>
              <div><label className="label">Product Description *</label><input className="input-field" value={form.productDescription} onChange={e => setForm({...form, productDescription: e.target.value})} placeholder="Gold Ring with diamond" /></div>
              <div><label className="label">Metal</label><select className="input-field" value={form.metalType} onChange={e => setForm({...form, metalType: e.target.value})}>{(settings?.allMetals || ['GOLD','SILVER']).map((m: string) => <option key={m} value={m}>{m}</option>)}</select></div>
              <div><label className="label">Purity</label><select className="input-field" value={form.purity} onChange={e => setForm({...form, purity: e.target.value})}>{(settings?.allPurities || ['24K','22K','18K']).map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}</select></div>
              <div><label className="label">Expected Weight (g)</label><input type="number" step="0.01" className="input-field" value={form.expectedWeight || ''} onChange={e => setForm({...form, expectedWeight: Number(e.target.value)})} /></div>
              <div><label className="label">Expected Delivery *</label><input type="date" className="input-field" value={form.expectedDelivery} onChange={e => setForm({...form, expectedDelivery: e.target.value})} /></div>
              <div><label className="label">Estimated Amount (₹)</label><input type="number" className="input-field" value={form.estimatedAmount || ''} onChange={e => setForm({...form, estimatedAmount: Number(e.target.value)})} /></div>
              <div><label className="label">Advance / Token Money (₹)</label><input type="number" className="input-field" value={form.advanceAmount || ''} onChange={e => setForm({...form, advanceAmount: Number(e.target.value)})} /></div>
              <div className="col-span-2 border-t pt-3 mt-1">
                <label className="label flex items-center gap-1.5"><HardHat className="w-3.5 h-3.5" /> Assign to Worker (optional — sets status to ASSIGNED)</label>
                <div className="grid grid-cols-2 gap-3">
                  <select className="input-field" value={form.assignEmployeeId} onChange={e => setForm({...form, assignEmployeeId: e.target.value})}>
                    <option value="">— assign later (status: CREATED) —</option>
                    {workers.map((w: any) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.role.replace('_', ' ')}{w.mobile ? ' · ' + w.mobile : ''})</option>
                    ))}
                  </select>
                  <input type="date" className="input-field" value={form.assignDueDate} onChange={e => setForm({...form, assignDueDate: e.target.value})} title="Worker due date" />
                </div>
                {workers.length === 0 && <p className="text-xs text-orange-500 mt-1">No workers yet — add them in Workers master.</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => {
                if (!form.customerName || !form.productDescription || !form.expectedDelivery) { toast.error('Fill required fields'); return; }
                createMutation.mutate({
                  ...form,
                  assignTo: form.assignEmployeeId ? { employeeId: form.assignEmployeeId, dueDate: form.assignDueDate || form.expectedDelivery } : undefined,
                });
              }} disabled={createMutation.isPending} className="btn-primary">{form.assignEmployeeId ? 'Create & Assign' : 'Create & Issue Token'}</button>
            </div>
          </div>
        </div>
      )}

      {/* New Customer Modal (prompted when customer not in DB) */}
      {showNewCustomer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowNewCustomer(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add New Customer</h3>
              <button onClick={() => setShowNewCustomer(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Name *</label><input className="input-field" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} autoFocus /></div>
              <div><label className="label">Mobile</label><input className="input-field" value={newCustomer.mobile} onChange={(e) => setNewCustomer({ ...newCustomer, mobile: e.target.value })} /></div>
              <div><label className="label">City</label><input className="input-field" value={newCustomer.city} onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">Address</label><input className="input-field" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowNewCustomer(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => { if (!newCustomer.name.trim()) { toast.error('Name required'); return; } newCustomerMutation.mutate(newCustomer); }}
                className="btn-primary" disabled={newCustomerMutation.isPending}>
                {newCustomerMutation.isPending ? 'Adding…' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Worker Modal */}
      {showAssign && selectedJob && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAssign(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Assign Worker</h3>
            <p className="text-sm text-gray-500 mb-4">{selectedJob.jobNumber} · {selectedJob.customerName}</p>
            <div className="space-y-3">
              <div>
                <label className="label">Worker *</label>
                <select className="input-field" value={assignForm.employeeId} onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}>
                  <option value="">— select worker —</option>
                  {workers.map((w: any) => <option key={w.id} value={w.id}>{w.name} ({w.role.replace('_', ' ')})</option>)}
                </select>
              </div>
              <div><label className="label">Due Date *</label><input type="date" className="input-field" value={assignForm.dueDate} onChange={(e) => setAssignForm({ ...assignForm, dueDate: e.target.value })} /></div>
              <div><label className="label">Notes</label><input className="input-field" value={assignForm.notes} onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowAssign(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => {
                  if (!assignForm.employeeId || !assignForm.dueDate) { toast.error('Select worker and due date'); return; }
                  assignMutation.mutate({ id: selectedJob.id, body: assignForm });
                }}
                className="btn-primary" disabled={assignMutation.isPending}>
                {assignMutation.isPending ? 'Assigning…' : 'Assign'}
              </button>
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
              <div><label className="label">Into Account (Cash/Bank)</label>
                <select className="input-field" value={advanceForm.accountId} onChange={e => setAdvanceForm({...advanceForm, accountId: e.target.value})}>
                  <option value="">— no ledger —</option>
                  {activeAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Amount is credited to this account in the ledger.</p></div>
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

      {/* Update Status (action) Modal — records action date + note into the log */}
      {showStatus && selectedJob && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowStatus(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Mark {statusForm.status.replace(/_/g, ' ')}</h3>
            <p className="text-sm text-gray-500 mb-4">{selectedJob.jobNumber} · {selectedJob.customerName}</p>
            <div className="space-y-3">
              <div><label className="label">Action Date *</label><input type="date" className="input-field" value={statusForm.date} onChange={e => setStatusForm({...statusForm, date: e.target.value})} /></div>
              <div><label className="label">Notes / Remark (recorded in log)</label><textarea className="input-field text-xs" rows={3} value={statusForm.notes} onChange={e => setStatusForm({...statusForm, notes: e.target.value})} placeholder="e.g. Ready for delivery, delivered to customer…" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowStatus(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => {
                  if (!statusForm.date) { toast.error('Select the action date'); return; }
                  statusMutation.mutate({ id: selectedJob.id, status: statusForm.status, date: statusForm.date, notes: statusForm.notes });
                }}
                disabled={statusMutation.isPending} className="btn-primary">
                {statusMutation.isPending ? 'Updating…' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

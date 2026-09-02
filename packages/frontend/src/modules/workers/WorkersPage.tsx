import { confirmAction } from '../../components/ConfirmDialog';
import { humanize } from '../../utils/format';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Plus, Search, HardHat, IndianRupee, Wallet, Pencil, Trash2, X } from 'lucide-react';

const ROLES = ['GOLDSMITH', 'WORKER', 'POLISHER', 'STONE_SETTER', 'DESIGNER', 'SALESMAN', 'ACCOUNTANT', 'MANAGER'];

export default function WorkersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [showPay, setShowPay] = useState(false);

  // Ctrl/Cmd+A → add worker
  useAppShortcut('app:add', () => { setEditing(null); setForm({ name: '', mobile: '', role: 'GOLDSMITH', designation: '', salary: 0, employeeCode: '' }); setShowAdd(true); });
  const [form, setForm] = useState({ name: '', mobile: '', role: 'GOLDSMITH', designation: '', salary: 0, employeeCode: '' });
  const [payForm, setPayForm] = useState({ type: 'PAYMENT', amount: 0, periodMonth: '', paymentMode: 'CASH', reference: '', notes: '' });

  const { data: workers, isLoading } = useQuery({ queryKey: ['workers', search], queryFn: () => api.getWorkers({ search }) });
  const { data: workerDetail } = useQuery({
    queryKey: ['worker', selected?.id],
    queryFn: () => api.getWorker(selected.id),
    enabled: !!selected,
  });
  const { data: payments } = useQuery({
    queryKey: ['worker-payments', selected?.id],
    queryFn: () => api.getWorkerPayments({ employeeId: selected?.id, limit: 25 }),
    enabled: !!selected,
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => (editing ? api.updateWorker(editing.id, body) : api.createWorker(body)),
    onSuccess: () => {
      toast.success(editing ? 'Worker updated!' : 'Worker added!');
      qc.invalidateQueries({ queryKey: ['workers'] });
      setShowAdd(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWorker(id),
    onSuccess: (d: any) => {
      toast.success(d.deactivated ? d.message : 'Worker deleted');
      qc.invalidateQueries({ queryKey: ['workers'] });
      if (selected) setSelected(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const payMutation = useMutation({
    mutationFn: ({ id, body }: any) => api.addWorkerPayment(id, body),
    onSuccess: () => {
      toast.success('Payment recorded!');
      qc.invalidateQueries({ queryKey: ['worker'] });
      qc.invalidateQueries({ queryKey: ['worker-payments'] });
      setShowPay(false);
      setPayForm({ type: 'PAYMENT', amount: 0, periodMonth: '', paymentMode: 'CASH', reference: '', notes: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const fm = (n: number) => '₹' + (n || 0).toLocaleString('en-IN');

  const openEdit = (w: any) => {
    setEditing(w);
    setForm({ name: w.name, mobile: w.mobile || '', role: w.role, designation: w.designation || '', salary: w.salary || 0, employeeCode: w.employeeCode });
    setShowAdd(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="page-title">Workers</h1><p className="text-gray-500 text-sm mt-1">Worker master — karigars, goldsmiths & staff with salary / payment tracking</p></div>
        <button onClick={() => { setEditing(null); setForm({ name: '', mobile: '', role: 'GOLDSMITH', designation: '', salary: 0, employeeCode: '' }); setShowAdd(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Worker
        </button>
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className="input-field pl-10" placeholder="Search name, code, mobile…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workers list */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="table-wrap">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="table-header">Worker</th><th className="table-header">Role</th>
              <th className="table-header text-right">Salary</th><th className="table-header text-right">Paid</th><th className="table-header"></th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={5} className="text-center py-10 text-gray-400">Loading…</td></tr> :
                workers?.length === 0 ? <tr><td colSpan={5} className="text-center py-10 text-gray-400">No workers yet</td></tr> :
                workers?.map((w: any) => (
                  <tr key={w.id} onClick={() => setSelected(w)} className={'border-b border-gray-50 hover:bg-gray-50 cursor-pointer ' + (selected?.id === w.id ? 'bg-primary-50' : '')}>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <span className={'w-8 h-8 rounded-full flex items-center justify-center ' + (w.isActive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400')}><HardHat className="w-4 h-4" /></span>
                        <div>
                          <p className="font-medium">{w.name}</p>
                          <p className="text-xs text-gray-400">{w.employeeCode}{w.mobile ? ' · ' + w.mobile : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell text-xs">{humanize(w.role)}{!w.isActive && <span className="badge badge-gray ml-1">inactive</span>}</td>
                    <td className="table-cell text-right">{w.salary ? fm(w.salary) : '—'}</td>
                    <td className="table-cell text-right text-xs text-gray-500">{w._count?.payments ? w._count.payments + ' payments' : '—'}</td>
                    <td className="table-cell">
                      <div className="flex gap-1 justify-end">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(w); }} className="p-1 text-gray-400 hover:text-primary-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={async (e) => { e.stopPropagation(); if (await confirmAction({ title: `Delete worker “${w.name}”?`, message: 'A worker with job work or payments is deactivated instead, so the history stays.', danger: true, confirmLabel: 'Delete' })) deleteMutation.mutate(w.id); }} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Worker detail — payments */}
        <div>
          {!selected ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-10 text-center text-gray-400">
              <Wallet className="w-8 h-8 mx-auto mb-3 opacity-40" />
              Select a worker to see salary & payment history
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{workerDetail?.name || selected.name}</h3>
                    <p className="text-xs text-gray-400">{workerDetail?.employeeCode} · {humanize(workerDetail?.role)} {workerDetail?.designation ? '· ' + workerDetail.designation : ''}</p>
                  </div>
                  <button onClick={() => setShowPay(true)} className="btn-primary text-xs"><IndianRupee className="w-3.5 h-3.5" /> Record Payment</button>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100 text-sm">
                  <div><p className="text-xs text-gray-400">Salary</p><p className="font-semibold">{fm(workerDetail?.salary || 0)}</p></div>
                  <div><p className="text-xs text-gray-400">Salary paid</p><p className="font-semibold text-green-600">{fm(workerDetail?.totalSalary || 0)}</p></div>
                  <div><p className="text-xs text-gray-400">Advances</p><p className="font-semibold text-orange-600">{fm(workerDetail?.totalAdvance || 0)}</p></div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 text-sm font-medium">Payment history ({payments?.total || 0}) — Total {fm(payments?.totalAmount || 0)}</div>
                <div className="table-wrap">
                <table className="w-full">
                  <thead><tr className="border-b bg-gray-50">
                    <th className="table-header">Date</th><th className="table-header">Type</th>
                    <th className="table-header">Month</th><th className="table-header">Mode</th><th className="table-header text-right">Amount</th>
                  </tr></thead>
                  <tbody>
                    {payments?.items?.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No payments yet</td></tr>}
                    {payments?.items?.map((p: any) => (
                      <tr key={p.id} className="border-b border-gray-50">
                        <td className="table-cell text-xs">{new Date(p.date).toLocaleDateString('en-IN')}</td>
                        <td className="table-cell"><span className={'badge ' + (p.type === 'SALARY' ? 'badge-success' : p.type === 'ADVANCE' ? 'badge-warning' : 'badge-info')}>{p.type}</span></td>
                        <td className="table-cell text-xs">{p.periodMonth || '—'}</td>
                        <td className="table-cell text-xs">{p.paymentMode}</td>
                        <td className="table-cell text-right font-medium">{fm(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit worker modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => { setShowAdd(false); setEditing(null); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-4 sm:p-6 modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Edit Worker' : 'Add Worker'}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Name *</label><input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
              <div><label className="label">Mobile</label><input className="input-field" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="98765 43210" /></div>
              <div>
                <label className="label">Role</label>
                <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div><label className="label">Designation</label><input className="input-field" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Senior Karigar" /></div>
              <div><label className="label">Monthly Salary (₹)</label><input type="number" className="input-field" value={form.salary || ''} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} /></div>
              {editing && <div><label className="label">Employee Code</label><input className="input-field" value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} /></div>}
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => { setShowAdd(false); setEditing(null); }} className="btn-secondary">Cancel</button>
              <button onClick={() => { if (!form.name.trim()) { toast.error('Name required'); return; } saveMutation.mutate(form); }} className="btn-primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : editing ? 'Update Worker' : 'Add Worker'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPay && selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowPay(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-4 sm:p-6 modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Payment — {selected.name}</h3>
              <button onClick={() => setShowPay(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Type</label>
                <div className="flex gap-2">
                  {[['SALARY', 'Salary'], ['PAYMENT', 'Payment (per job)'], ['ADVANCE', 'Advance']].map(([v, l]) => (
                    <button key={v} onClick={() => setPayForm({ ...payForm, type: v })}
                      className={'flex-1 py-2 text-xs rounded-lg border transition-all ' + (payForm.type === v ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-gray-200 text-gray-500')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Amount (₹) *</label><input type="number" className="input-field" value={payForm.amount || ''} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} autoFocus /></div>
                {payForm.type === 'SALARY' && (
                  <div><label className="label">Salary Month</label><input type="month" className="input-field" value={payForm.periodMonth} onChange={(e) => setPayForm({ ...payForm, periodMonth: e.target.value })} /></div>
                )}
                <div>
                  <label className="label">Mode</label>
                  <select className="input-field" value={payForm.paymentMode} onChange={(e) => setPayForm({ ...payForm, paymentMode: e.target.value })}>
                    {['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div><label className="label">Reference</label><input className="input-field" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="UPI / cheque no" /></div>
              </div>
              <div><label className="label">Notes</label><input className="input-field" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowPay(false)} className="btn-secondary">Cancel</button>
              <button onClick={() => { if (!payForm.amount) { toast.error('Enter amount'); return; } payMutation.mutate({ id: selected.id, body: payForm }); }} className="btn-primary" disabled={payMutation.isPending}>
                {payMutation.isPending ? 'Saving…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

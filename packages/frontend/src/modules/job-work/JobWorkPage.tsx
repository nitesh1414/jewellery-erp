import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import {
  Plus, Search, Eye, Pencil, X, Trash2, Play, PackageCheck, Ban, Printer,
  HardHat, Scale, Gem, ArrowLeftRight, Clock, CheckCircle2, IndianRupee,
} from 'lucide-react';

/**
 * JOB WORK — OUT → IN
 *
 * OUT: metal (grams) and other material are handed to a worker (karigar).
 *      The metal is taken out of its metal ledger the moment it is issued.
 * IN : the finished ornaments come back — every received line becomes a
 *      jewellery item with its own barcode, the wastage / scrap the worker
 *      returns is credited back into the metal ledger and the labour charges
 *      become payable to the worker.
 */

const TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'GIVEN', label: 'Given' },
  { key: 'IN_PROCESS', label: 'In process' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_LABEL: Record<string, string> = {
  GIVEN: 'Given to worker',
  IN_PROCESS: 'In process',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_BADGE: Record<string, string> = {
  GIVEN: 'badge-info',
  IN_PROCESS: 'badge-warning',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-gray',
};

const METALS = ['GOLD', 'SILVER', 'PLATINUM', 'COPPER', 'BRASS', 'OTHER'];
const PURITIES = ['24K', '22K', '20K', '18K', '14K', '9K', 'SILVER_999', 'SILVER_925', 'SILVER_835'];
const MAKING_TYPES = ['PERCENTAGE', 'PER_GRAM', 'FIXED'];

const fm = (n: any) => '\u20b9' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fm0 = (n: any) => '\u20b9' + Math.round(Number(n) || 0).toLocaleString('en-IN');
/** Grams without trailing zeros: 15, 12.5, 10.25 … */
const g3 = (n: any) => String(Math.round((Number(n) || 0) * 1000) / 1000);
const round3 = (n: any) => Math.round((Number(n) || 0) * 1000) / 1000;
const calcNet = (gross: any, stone: any, other: any) =>
  round3(Math.max(0, (Number(gross) || 0) - (Number(stone) || 0) - (Number(other) || 0)));
const d = (v: any) => (v ? new Date(v).toLocaleDateString('en-IN') : '\u2014');

const uid = () => Math.random().toString(36).slice(2, 9);

interface MaterialLine {
  key: string;
  id?: string;
  kind: 'METAL' | 'OTHER';
  metalType: string;
  purity: string;
  weight: number;
  quantity: number;
  rate: number;
  value: number;
  name: string;
  metalLedgerAccountId: string;
  notes: string;
}

interface OrnamentLine {
  key: string;
  id?: string;
  ornament: string;
  category: string;
  metalType: string;
  purity: string;
  quantity: number;
  expectedWeight: number;
  currentRate: number;
  makingChargeType: string;
  makingChargeValue: number;
  labourCharge: number;
  huid: string;
  hsnCode: string;
  size: string;
  notes: string;
}

const emptyMaterial = (metalType = 'GOLD', purity = '22K'): MaterialLine => ({
  key: uid(), kind: 'METAL', metalType, purity, weight: 0, quantity: 1, rate: 0, value: 0,
  name: '', metalLedgerAccountId: '', notes: '',
});

const emptyOrnament = (metalType = 'GOLD', purity = '22K'): OrnamentLine => ({
  key: uid(), ornament: '', category: '', metalType, purity, quantity: 1, expectedWeight: 0,
  currentRate: 0, makingChargeType: 'PERCENTAGE', makingChargeValue: 10, labourCharge: 0,
  huid: '', hsnCode: '7113', size: '', notes: '',
});

export default function JobWorkPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [receiving, setReceiving] = useState<any>(null);

  // ---------------------------------------------------------------- queries
  const { data, isLoading } = useQuery({
    queryKey: ['job-works', search, status, page],
    queryFn: () => api.getJobWorks({ search, status, page, limit: 20 }),
  });
  const { data: stats } = useQuery({ queryKey: ['job-work-stats'], queryFn: () => api.getJobWorkStats() });
  const { data: workers } = useQuery({ queryKey: ['workers-all'], queryFn: () => api.getWorkers({ limit: 200 }), staleTime: 60000 });
  const { data: metalAccounts } = useQuery({ queryKey: ['metal-accounts'], queryFn: () => api.getMetalAccounts(), staleTime: 30000 });
  const { data: rates } = useQuery({ queryKey: ['rates'], queryFn: () => api.getRates(), staleTime: 300000 });
  const { data: ornamentMaster } = useQuery({ queryKey: ['ornaments-jw'], queryFn: () => api.getOrnaments({ isActive: 'true' }), staleTime: 60000 });

  const workerList: any[] = useMemo(() => (workers as any) || [], [workers]);
  const accounts: any[] = useMemo(() => (metalAccounts as any) || [], [metalAccounts]);
  const rateRows: any[] = useMemo(() => (rates as any) || [], [rates]);
  const ornamentNames: string[] = useMemo(() => {
    const rows: any[] = (ornamentMaster as any)?.items || (ornamentMaster as any) || [];
    return Array.from(new Set(rows.map((o: any) => o?.name).filter(Boolean)));
  }, [ornamentMaster]);

  const rateFor = (metalType: string, purity: string): number => {
    const row = rateRows.find(
      (r: any) =>
        (r.purity || '').toUpperCase() === (purity || '').toUpperCase() &&
        (!r.metalType || !metalType || (r.metalType || '').toUpperCase() === metalType.toUpperCase()),
    );
    return row ? Number(row.rate) || 0 : 0;
  };
  const accountFor = (metalType: string, purity: string) =>
    accounts.find(
      (a: any) =>
        (a.metalType || '').toUpperCase() === (metalType || '').toUpperCase() &&
        (a.purity || '').toUpperCase() === (purity || '').toUpperCase(),
    );

  // -------------------------------------------------------------- mutations
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['job-works'] });
    qc.invalidateQueries({ queryKey: ['job-work-stats'] });
    qc.invalidateQueries({ queryKey: ['metal-accounts'] });
    qc.invalidateQueries({ queryKey: ['accounts'] });
    qc.invalidateQueries({ queryKey: ['jewellery'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const createMut = useMutation({
    mutationFn: (body: any) => api.createJobWork(body),
    onSuccess: (res: any) => {
      toast.success(`Job work ${res.jobNumber} issued`);
      setShowCreate(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not save the job work'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: any) => api.updateJobWork(id, body),
    onSuccess: () => { toast.success('Job work updated'); setShowCreate(false); setEditing(null); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not update the job work'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status: next }: any) => api.updateJobWorkStatus(id, { status: next }),
    onSuccess: (_r: any, v: any) => {
      toast.success(`Marked ${STATUS_LABEL[v.status] || v.status}`);
      setViewing(null); invalidate();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not change the status'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteJobWork(id),
    onSuccess: () => { toast.success('Job work deleted'); setViewing(null); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not delete the job work'),
  });

  useAppShortcut('app:add', () => { setEditing(null); resetForm(); setShowCreate(true); });

  // ------------------------------------------------------- create / edit form
  const [form, setForm] = useState<any>({
    workerId: '', workerName: '', workerMobile: '',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: '', notes: '',
  });
  const [materials, setMaterials] = useState<MaterialLine[]>([emptyMaterial()]);
  const [ornaments, setOrnaments] = useState<OrnamentLine[]>([emptyOrnament()]);

  function resetForm() {
    setForm({
      workerId: '', workerName: '', workerMobile: '',
      issueDate: new Date().toISOString().split('T')[0], dueDate: '', notes: '',
    });
    setMaterials([emptyMaterial()]);
    setOrnaments([emptyOrnament()]);
  }

  const openEdit = (job: any) => {
    setEditing(job);
    setForm({
      workerId: job.workerId || '',
      workerName: job.workerName || '',
      workerMobile: job.workerMobile || '',
      issueDate: job.issueDate ? new Date(job.issueDate).toISOString().split('T')[0] : '',
      dueDate: job.dueDate ? new Date(job.dueDate).toISOString().split('T')[0] : '',
      notes: job.notes || '',
    });
    setMaterials(
      job.materials?.length
        ? job.materials.map((m: any) => ({
          key: uid(), id: m.id, kind: String(m.kind || 'METAL').toUpperCase() === 'OTHER' ? 'OTHER' : 'METAL',
          metalType: m.metalType || 'GOLD', purity: m.purity || '22K',
          weight: Number(m.weight) || 0, quantity: Number(m.quantity) || 1,
          rate: Number(m.rate) || 0, value: Number(m.value) || 0,
          name: m.name || '', metalLedgerAccountId: m.metalLedgerAccountId || '', notes: m.notes || '',
        }))
        : [emptyMaterial()],
    );
    setOrnaments(
      job.items?.filter((i: any) => i.status !== 'RECEIVED').length
        ? job.items.filter((i: any) => i.status !== 'RECEIVED').map((i: any) => ({
          key: uid(), id: i.id, ornament: i.ornament || '', category: i.category || '',
          metalType: i.metalType || 'GOLD', purity: i.purity || '22K',
          quantity: Number(i.quantity) || 1, expectedWeight: Number(i.expectedWeight) || 0,
          currentRate: Number(i.currentRate) || 0,
          makingChargeType: i.makingChargeType || 'PERCENTAGE',
          makingChargeValue: Number(i.makingChargeValue) || 0,
          labourCharge: Number(i.labourCharge) || 0,
          huid: i.huid || '', hsnCode: i.hsnCode || '7113', size: i.size || '', notes: i.notes || '',
        }))
        : [emptyOrnament()],
    );
    setShowCreate(true);
  };

  const setMaterial = (key: string, patch: Partial<MaterialLine>) =>
    setMaterials((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setOrnament = (key: string, patch: Partial<OrnamentLine>) =>
    setOrnaments((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const metalGrams = materials
    .filter((m) => m.kind === 'METAL')
    .reduce((s, m) => s + (Number(m.weight) || 0), 0);
  const materialValue = materials.reduce(
    (s, m) => s + (Number(m.value) || (m.kind === 'METAL' ? (Number(m.weight) || 0) * (Number(m.rate) || 0) : (Number(m.quantity) || 0) * (Number(m.rate) || 0))),
    0,
  );
  const expectedGrams = ornaments.reduce((s, o) => s + (Number(o.expectedWeight) || 0) * (Number(o.quantity) || 1), 0);

  const submitCreate = () => {
    const workerName = form.workerName || workerList.find((w: any) => w.id === form.workerId)?.name || '';
    if (!workerName) return toast.error('Select or enter a worker');
    const mats = materials.filter((m) => (m.kind === 'METAL' ? Number(m.weight) > 0 : Number(m.quantity) > 0 || Number(m.value) > 0));
    if (!mats.length) return toast.error('Add the metal / material you are giving');
    for (const m of mats) {
      if (m.kind === 'METAL' && !(Number(m.weight) > 0)) return toast.error('Enter the weight of every metal line');
    }
    const items = ornaments.filter((o) => o.ornament || o.category || Number(o.expectedWeight) > 0);
    if (!items.length) return toast.error('Add at least one ornament to be made');

    const payload = {
      workerId: form.workerId || undefined,
      workerName,
      workerMobile: form.workerMobile || undefined,
      issueDate: form.issueDate || undefined,
      dueDate: form.dueDate || undefined,
      notes: form.notes || undefined,
      materials: mats.map((m) => ({
        id: m.id,
        kind: m.kind,
        metalType: m.kind === 'METAL' ? m.metalType : undefined,
        purity: m.kind === 'METAL' ? m.purity : undefined,
        name: m.kind === 'OTHER' ? m.name : undefined,
        weight: m.kind === 'METAL' ? Number(m.weight) : 0,
        quantity: m.kind === 'OTHER' ? Number(m.quantity) || 1 : 1,
        rate: Number(m.rate) || 0,
        value: Number(m.value) || (m.kind === 'METAL' ? (Number(m.weight) || 0) * (Number(m.rate) || 0) : (Number(m.quantity) || 0) * (Number(m.rate) || 0)),
        metalLedgerAccountId: m.metalLedgerAccountId || undefined,
        notes: m.notes || undefined,
      })),
      items: items.map((o) => ({
        id: o.id,
        ornament: o.ornament || undefined,
        category: o.category || undefined,
        metalType: o.metalType,
        purity: o.purity,
        quantity: Number(o.quantity) || 1,
        expectedWeight: Number(o.expectedWeight) || 0,
        currentRate: Number(o.currentRate) || 0,
        makingChargeType: o.makingChargeType,
        makingChargeValue: Number(o.makingChargeValue) || 0,
        huid: o.huid || undefined,
        hsnCode: o.hsnCode || undefined,
        size: o.size || undefined,
        notes: o.notes || undefined,
      })),
    };
    if (editing) updateMut.mutate({ id: editing.id, body: { ...payload, replaceItems: true } });
    else createMut.mutate(payload);
  };

  const rows: any[] = data?.items || [];

  return (
    <div>
      {/* ------------------------------------------------------------ header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Job Work</h1>
          <p className="text-sm text-gray-500">
            OUT — metal &amp; material issued to a worker · IN — finished ornaments received with barcodes
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { setEditing(null); resetForm(); setShowCreate(true); }}
        >
          <Plus className="w-4 h-4" /> New Job Work (OUT)
        </button>
      </div>

      {/* ------------------------------------------------------------- stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatCard label="Given to worker" value={stats?.given ?? 0} icon={<HardHat className="w-4 h-4" />} tone="text-blue-600" />
        <StatCard label="In process" value={stats?.inProcess ?? 0} icon={<Clock className="w-4 h-4" />} tone="text-amber-600" />
        <StatCard label="Completed" value={stats?.completed ?? 0} icon={<CheckCircle2 className="w-4 h-4" />} tone="text-green-600" />
        <StatCard label="Metal with workers" value={`${g3(stats?.metalOutGrams)} g`} icon={<Scale className="w-4 h-4" />} tone="text-gray-800" hint={fm0(stats?.metalOutValue)} />
        <StatCard label="Wages payable" value={fm0(stats?.wagesPayable)} icon={<IndianRupee className="w-4 h-4" />} tone="text-orange-600" hint={`${stats?.overdue ?? 0} overdue`} />
      </div>

      {/* ----------------------------------------------------------- filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input-field !pl-9 w-72"
            placeholder="Search job no, worker…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setStatus(t.key); setPage(1); }}
              className={'px-3 py-1.5 text-sm rounded-md ' + (status === t.key ? 'bg-white shadow font-medium' : 'text-gray-500 hover:text-gray-700')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="table-header">Job No</th>
              <th className="table-header">Worker</th>
              <th className="table-header">Issued</th>
              <th className="table-header">Due</th>
              <th className="table-header text-right">Metal out</th>
              <th className="table-header">Ornaments</th>
              <th className="table-header text-right">Wages</th>
              <th className="table-header">Status</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="text-center py-10 text-gray-400">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                No job work yet — click <b>New Job Work (OUT)</b> to hand metal to a worker
              </td></tr>
            )}
            {rows.map((j: any) => {
              const received = j.items?.filter((i: any) => i.status === 'RECEIVED').length || 0;
              const total = j.items?.length || 0;
              return (
                <tr key={j.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-cell font-medium cursor-pointer" onClick={() => setViewing(j)}>{j.jobNumber}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"><HardHat className="w-3.5 h-3.5" /></span>
                      <div>
                        <p className="text-sm">{j.workerName}</p>
                        <p className="text-xs text-gray-400">{j.workerMobile || j.worker?.role?.replace('_', ' ') || ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell text-sm">{d(j.issueDate)}</td>
                  <td className="table-cell text-sm">
                    {j.dueDate ? (
                      <span className={new Date(j.dueDate) < new Date() && j.status !== 'COMPLETED' && j.status !== 'CANCELLED' ? 'text-red-600 font-medium' : ''}>
                        {d(j.dueDate)}
                      </span>
                    ) : '\u2014'}
                  </td>
                  <td className="table-cell text-right">{g3(j.totalIssuedWeight)} g<span className="block text-xs text-gray-400">{fm0(j.totalIssuedValue)}</span></td>
                  <td className="table-cell text-sm">
                    {received}/{total}
                    <span className="block text-xs text-gray-400">{g3(j.totalReceivedWeight)} g received</span>
                  </td>
                  <td className="table-cell text-right">{Number(j.wages) ? fm0(j.wages) : '\u2014'}</td>
                  <td className="table-cell"><span className={'badge ' + (STATUS_BADGE[j.status] || 'badge-gray')}>{STATUS_LABEL[j.status] || j.status}</span></td>
                  <td className="table-cell">
                    <div className="flex gap-1 justify-end">
                      <IconBtn title="View" onClick={() => setViewing(j)}><Eye className="w-4 h-4" /></IconBtn>
                      {j.status === 'GIVEN' && (
                        <IconBtn title="Start work" onClick={() => statusMut.mutate({ id: j.id, status: 'IN_PROCESS' })}><Play className="w-4 h-4" /></IconBtn>
                      )}
                      {(j.status === 'GIVEN' || j.status === 'IN_PROCESS') && (
                        <>
                          <IconBtn title="Edit" onClick={() => openEdit(j)}><Pencil className="w-4 h-4" /></IconBtn>
                          <IconBtn title="Receive finished ornaments (IN)" onClick={() => setReceiving(j)} className="text-green-600 hover:text-green-700"><PackageCheck className="w-4 h-4" /></IconBtn>
                          <IconBtn title="Cancel & return metal" onClick={() => { if (confirm(`Cancel ${j.jobNumber}? The issued metal goes back to the metal ledger.`)) statusMut.mutate({ id: j.id, status: 'CANCELLED' }); }} className="hover:text-red-600"><Ban className="w-4 h-4" /></IconBtn>
                        </>
                      )}
                      <IconBtn title="Delete" onClick={() => { if (confirm(`Delete ${j.jobNumber}?`)) deleteMut.mutate(j.id); }} className="hover:text-red-600"><Trash2 className="w-4 h-4" /></IconBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data?.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-gray-500">{data.total} job work(s)</span>
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn-secondary text-sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {/* --------------------------------------------- create / edit (OUT) */}
      {showCreate && (
        <Modal onClose={() => { setShowCreate(false); setEditing(null); }} wide>
          <h3 className="text-lg font-semibold mb-1">{editing ? `Edit ${editing.jobNumber}` : 'New Job Work — OUT'}</h3>
          <p className="text-xs text-gray-500 mb-4">
            Metal given here is <b>debited from its metal ledger</b> as soon as you save. When the finished ornaments
            come back, use <b>Receive</b> to add them to stock with barcodes.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Worker</label>
              <select
                className="input-field"
                value={form.workerId}
                onChange={(e) => {
                  const w = workerList.find((x: any) => x.id === e.target.value);
                  setForm({ ...form, workerId: e.target.value, workerName: w?.name || form.workerName, workerMobile: w?.mobile || form.workerMobile });
                }}
              >
                <option value="">— select worker —</option>
                {workerList.map((w: any) => <option key={w.id} value={w.id}>{w.name}{w.role ? ' · ' + w.role.replace('_', ' ') : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Worker name *</label>
              <input className="input-field" value={form.workerName} onChange={(e) => setForm({ ...form, workerName: e.target.value })} placeholder="Karigar name" />
            </div>
            <div>
              <label className="label">Mobile</label>
              <input className="input-field" value={form.workerMobile} onChange={(e) => setForm({ ...form, workerMobile: e.target.value })} />
            </div>
            <div>
              <label className="label">Issue date</label>
              <input type="date" className="input-field" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Due date</label>
              <input type="date" className="input-field" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          {/* material issued */}
          <SectionTitle
            title="Material given to the worker"
            action={<button className="text-xs text-primary-600 font-medium" onClick={() => setMaterials((r) => [...r, emptyMaterial(materials[materials.length - 1]?.metalType, materials[materials.length - 1]?.purity)])}>+ Add line</button>}
          />
          <div className="space-y-2">
            {materials.map((m, idx) => {
              const acc = m.metalLedgerAccountId ? accounts.find((a: any) => a.id === m.metalLedgerAccountId) : accountFor(m.metalType, m.purity);
              return (
                <div key={m.key} className="grid grid-cols-12 gap-2 items-end border border-gray-100 rounded-lg p-2">
                  <div className="col-span-2">
                    <label className="label">Type</label>
                    <select className="input-field" value={m.kind} onChange={(e) => setMaterial(m.key, { kind: e.target.value as any })}>
                      <option value="METAL">Metal</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  {m.kind === 'METAL' ? (
                    <>
                      <div className="col-span-2">
                        <label className="label">Metal</label>
                        <select className="input-field" value={m.metalType} onChange={(e) => setMaterial(m.key, { metalType: e.target.value, rate: rateFor(e.target.value, m.purity) })}>
                          {METALS.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="label">Purity</label>
                        <select
                          className="input-field"
                          value={m.purity}
                          onChange={(e) => setMaterial(m.key, { purity: e.target.value, rate: rateFor(m.metalType, e.target.value), metalLedgerAccountId: accountFor(m.metalType, e.target.value)?.id || '' })}
                        >
                          {PURITIES.map((x) => <option key={x} value={x}>{x.replace('SILVER_', '')}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="label">Weight (g)</label>
                        <input
                          type="number" step="0.001" className="input-field"
                          value={m.weight || ''}
                          onChange={(e) => setMaterial(m.key, { weight: Number(e.target.value), value: Math.round(Number(e.target.value) * (Number(m.rate) || 0) * 100) / 100 })}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-span-2">
                        <label className="label">Material</label>
                        <input className="input-field" value={m.name} onChange={(e) => setMaterial(m.key, { name: e.target.value })} placeholder="Stones, polish…" />
                      </div>
                      <div className="col-span-2">
                        <label className="label">Qty</label>
                        <input
                          type="number" step="1" className="input-field" value={m.quantity || ''}
                          onChange={(e) => setMaterial(m.key, { quantity: Number(e.target.value), value: Math.round(Number(e.target.value) * (Number(m.rate) || 0) * 100) / 100 })}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="label">Rate</label>
                        <input type="number" className="input-field" value={m.rate || ''} onChange={(e) => setMaterial(m.key, { rate: Number(e.target.value) })} />
                      </div>
                    </>
                  )}
                  {m.kind === 'METAL' && (
                    <div className="col-span-2">
                      <label className="label">Rate / g</label>
                      <input
                        type="number" className="input-field" value={m.rate || ''}
                        onChange={(e) => setMaterial(m.key, { rate: Number(e.target.value), value: Math.round((Number(m.weight) || 0) * Number(e.target.value) * 100) / 100 })}
                      />
                    </div>
                  )}
                  <div className="col-span-2">
                    <label className="label">Value ₹</label>
                    <input
                      type="number" className="input-field" value={m.value || ''}
                      onChange={(e) => setMaterial(m.key, { value: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Metal ledger</label>
                    <select
                      className="input-field"
                      value={m.metalLedgerAccountId || acc?.id || ''}
                      disabled={m.kind !== 'METAL'}
                      onChange={(e) => setMaterial(m.key, { metalLedgerAccountId: e.target.value })}
                    >
                      <option value="">auto ({m.metalType} {m.purity})</option>
                      {accounts.map((a: any) => (
                        <option key={a.id} value={a.id}>{a.name} — {g3(a.grams)} g</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1 flex justify-center pb-2">
                    <button
                      className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                      disabled={materials.length === 1}
                      onClick={() => setMaterials((r) => r.filter((x) => x.key !== m.key))}
                    ><Trash2 className="w-4 h-4" /></button>
                  </div>
                  {m.kind === 'METAL' && (
                    <div className="col-span-12 -mt-1 text-xs text-gray-500">
                      Available in {acc?.name || `${m.metalType} ${m.purity}`}: <b>{g3(acc?.grams)} g</b>
                      {Number(m.weight) > Number(acc?.grams || 0) && <span className="text-red-600"> · more than the ledger holds</span>}
                      {idx === materials.length - 1 && ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-6 text-sm mt-2 text-gray-600">
            <span>Metal out: <b>{g3(metalGrams)} g</b></span>
            <span>Material value: <b>{fm0(materialValue)}</b></span>
          </div>

          {/* ornaments to be made */}
          <SectionTitle
            title="Ornaments to be made"
            action={<button className="text-xs text-primary-600 font-medium" onClick={() => setOrnaments((r) => [...r, emptyOrnament(ornaments[ornaments.length - 1]?.metalType, ornaments[ornaments.length - 1]?.purity)])}>+ Add line</button>}
          />
          <div className="space-y-2">
            {ornaments.map((o) => (
              <div key={o.key} className="grid grid-cols-12 gap-2 items-end border border-gray-100 rounded-lg p-2">
                <div className="col-span-3">
                  <label className="label">Ornament</label>
                  <input className="input-field" list="jw-ornaments" value={o.ornament} onChange={(e) => setOrnament(o.key, { ornament: e.target.value })} placeholder="Ring, Chain…" />
                  <datalist id="jw-ornaments">
                    {ornamentNames.map((n) => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <div className="col-span-2">
                  <label className="label">Metal</label>
                  <select className="input-field" value={o.metalType} onChange={(e) => setOrnament(o.key, { metalType: e.target.value, currentRate: rateFor(e.target.value, o.purity) })}>
                    {METALS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">Purity</label>
                  <select className="input-field" value={o.purity} onChange={(e) => setOrnament(o.key, { purity: e.target.value, currentRate: rateFor(o.metalType, e.target.value) })}>
                    {PURITIES.map((x) => <option key={x} value={x}>{x.replace('SILVER_', '')}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="label">Qty</label>
                  <input type="number" className="input-field" value={o.quantity || ''} onChange={(e) => setOrnament(o.key, { quantity: Number(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <label className="label">Expected wt (g)</label>
                  <input type="number" step="0.001" className="input-field" value={o.expectedWeight || ''} onChange={(e) => setOrnament(o.key, { expectedWeight: Number(e.target.value) })} />
                </div>
                <div className="col-span-1">
                  <label className="label">Rate/g</label>
                  <input type="number" className="input-field" value={o.currentRate || ''} onChange={(e) => setOrnament(o.key, { currentRate: Number(e.target.value) })} />
                </div>
                <div className="col-span-1 flex justify-center pb-2">
                  <button
                    className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                    disabled={ornaments.length === 1}
                    onClick={() => setOrnaments((r) => r.filter((x) => x.key !== o.key))}
                  ><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end text-sm mt-2 text-gray-600">
            <span>Expected weight: <b>{g3(expectedGrams)} g</b></span>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button className="btn-secondary" onClick={() => { setShowCreate(false); setEditing(null); }}>Cancel</button>
            <button
              className="btn-primary"
              disabled={createMut.isPending || updateMut.isPending}
              onClick={submitCreate}
            >
              {createMut.isPending || updateMut.isPending ? 'Saving…' : editing ? 'Save changes' : 'Issue to worker'}
            </button>
          </div>
        </Modal>
      )}

      {/* ---------------------------------------------- receive (job work IN) */}
      {receiving && (
        <ReceiveModal
          job={receiving}
          rateFor={rateFor}
          onClose={() => setReceiving(null)}
          onDone={(created: any[]) => {
            setReceiving(null);
            invalidate();
            if (created?.length) {
              toast.success(
                `${created.length} ornament(s) added to stock — barcodes ${created.map((c) => c.barcode).join(', ')}`,
                { duration: 6000 },
              );
              if (confirm('Print the barcode tags for the received ornaments?')) {
                navigate(`/print/barcodes?codes=${created.map((c) => c.barcode).join(',')}&size=220x120`);
              }
            }
          }}
        />
      )}

      {/* ------------------------------------------------------------ detail */}
      {viewing && (
        <Modal onClose={() => setViewing(null)} wide>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold">{viewing.jobNumber}</h3>
              <p className="text-xs text-gray-500">
                {viewing.workerName}{viewing.workerMobile ? ' · ' + viewing.workerMobile : ''} · issued {d(viewing.issueDate)}
                {viewing.dueDate ? ' · due ' + d(viewing.dueDate) : ''}
              </p>
            </div>
            <span className={'badge ' + (STATUS_BADGE[viewing.status] || 'badge-gray')}>{STATUS_LABEL[viewing.status] || viewing.status}</span>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
            <Kpi label="Metal issued" value={`${g3(viewing.totalIssuedWeight)} g`} hint={fm0(viewing.totalIssuedValue)} />
            <Kpi label="Received (net)" value={`${g3(viewing.totalReceivedWeight)} g`} />
            <Kpi label="Scrap returned" value={`${g3(viewing.returnWeight)} g`} />
            <Kpi label="Wages" value={fm0(viewing.wages)} hint={Number(viewing.wagesPaid) ? `${fm0(viewing.wagesPaid)} paid` : 'payable'} />
          </div>

          <h4 className="font-medium text-sm mb-2">Material given</h4>
          <table className="w-full text-sm mb-4">
            <thead><tr className="border-b bg-gray-50">
              <th className="table-header">Material</th><th className="table-header text-right">Weight / Qty</th>
              <th className="table-header text-right">Rate</th><th className="table-header text-right">Value</th>
            </tr></thead>
            <tbody>
              {(viewing.materials || []).map((m: any) => (
                <tr key={m.id} className="border-b border-gray-50">
                  <td className="table-cell">{m.kind === 'METAL' ? `${m.metalType} ${m.purity}` : (m.name || 'Other material')}</td>
                  <td className="table-cell text-right">{m.kind === 'METAL' ? g3(m.weight) + ' g' : g3(m.quantity) + ' pcs'}</td>
                  <td className="table-cell text-right">{Number(m.rate) ? fm(m.rate) : '\u2014'}</td>
                  <td className="table-cell text-right">{fm(m.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 className="font-medium text-sm mb-2">Ornaments</h4>
          <table className="w-full text-sm mb-4">
            <thead><tr className="border-b bg-gray-50">
              <th className="table-header">Ornament</th><th className="table-header">Metal</th>
              <th className="table-header text-right">Expected</th><th className="table-header text-right">Received (net)</th>
              <th className="table-header">Barcode</th><th className="table-header">Status</th>
            </tr></thead>
            <tbody>
              {(viewing.items || []).map((i: any) => (
                <tr key={i.id} className="border-b border-gray-50">
                  <td className="table-cell">{i.ornament || i.category || '\u2014'}</td>
                  <td className="table-cell text-xs">{i.metalType} {i.purity}</td>
                  <td className="table-cell text-right">{g3(i.expectedWeight)} g</td>
                  <td className="table-cell text-right">{i.status === 'RECEIVED' ? g3(i.netWeight) + ' g' : '\u2014'}</td>
                  <td className="table-cell">
                    {i.barcode
                      ? <button className="text-primary-600 hover:underline text-xs" onClick={() => navigate(`/print/barcodes?codes=${i.barcode}&size=220x120`)}>{i.barcode}</button>
                      : '\u2014'}
                  </td>
                  <td className="table-cell"><span className={'badge ' + (i.status === 'RECEIVED' ? 'badge-success' : 'badge-gray')}>{i.status === 'RECEIVED' ? 'Received' : 'Pending'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          {!!viewing.history?.length && (
            <>
              <h4 className="font-medium text-sm mb-2">Status history</h4>
              <ul className="text-sm space-y-1 mb-4">
                {viewing.history.map((h: any) => (
                  <li key={h.id} className="flex gap-2 text-gray-600">
                    <span className="text-gray-400 w-24 shrink-0">{new Date(h.createdAt).toLocaleString('en-IN')}</span>
                    <span>
                      {h.fromStatus ? `${STATUS_LABEL[h.fromStatus] || h.fromStatus} → ` : ''}
                      <b>{STATUS_LABEL[h.toStatus] || h.toStatus}</b>
                      {h.notes ? <span className="text-gray-400"> · {h.notes}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="flex justify-between gap-2">
            <div className="flex gap-2">
              {viewing.status === 'GIVEN' && (
                <button className="btn-secondary text-sm" onClick={() => statusMut.mutate({ id: viewing.id, status: 'IN_PROCESS' })}><Play className="w-4 h-4" /> Start</button>
              )}
              {(viewing.status === 'GIVEN' || viewing.status === 'IN_PROCESS') && (
                <button className="btn-primary text-sm" onClick={() => { const j = viewing; setViewing(null); setReceiving(j); }}><PackageCheck className="w-4 h-4" /> Receive</button>
              )}
            </div>
            <button className="btn-secondary text-sm" onClick={() => setViewing(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ===================================================================== helpers

function StatCard({ label, value, icon, tone, hint }: { label: string; value: any; icon: any; tone: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{label}</p>
        <span className={tone}>{icon}</span>
      </div>
      <p className={'text-xl font-bold mt-1 ' + tone}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold">{value}</p>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function IconBtn({ children, onClick, title, className = '' }: any) {
  return (
    <button title={title} onClick={onClick} className={'p-1 text-gray-400 hover:text-primary-600 ' + className}>
      {children}
    </button>
  );
}

function SectionTitle({ title, action }: { title: string; action?: any }) {
  return (
    <div className="flex items-center justify-between mt-5 mb-2">
      <h4 className="font-medium text-sm">{title}</h4>
      {action}
    </div>
  );
}

function Modal({ children, onClose, wide }: any) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center z-50 overflow-y-auto py-8" onClick={onClose}>
      <div
        className={'bg-white rounded-2xl shadow-xl w-full mx-4 p-6 ' + (wide ? 'max-w-5xl' : 'max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/** Job work IN — receive the finished ornaments. */
function ReceiveModal({
  job, rateFor, onClose, onDone,
}: { job: any; rateFor: (m: string, p: string) => number; onClose: () => void; onDone: (created: any[]) => void }) {
  const pending = (job.items || []).filter((i: any) => i.status !== 'RECEIVED');

  const [lines, setLines] = useState<any[]>(
    pending.map((i: any) => ({
      id: i.id,
      ornament: i.ornament || '',
      metalType: i.metalType || 'GOLD',
      purity: i.purity || '22K',
      quantity: i.quantity || 1,
      grossWeight: Number(i.expectedWeight) || 0,
      stoneWeight: 0,
      otherWeight: 0,
      netWeight: Number(i.expectedWeight) || 0,
      currentRate: Number(i.currentRate) || rateFor(i.metalType, i.purity) || 0,
      makingChargeType: i.makingChargeType || 'PERCENTAGE',
      makingChargeValue: Number(i.makingChargeValue) || 0,
      labourCharge: Number(i.labourCharge) || 0,
      huid: i.huid || '',
      hsnCode: i.hsnCode || '7113',
      receive: true,
    })),
  );
  const [returnWeight, setReturnWeight] = useState(0);
  const [returnPurity, setReturnPurity] = useState(job.materials?.find((m: any) => m.kind === 'METAL')?.purity || '22K');
  const [returnMetal, setReturnMetal] = useState(job.materials?.find((m: any) => m.kind === 'METAL')?.metalType || 'GOLD');
  const [wages, setWages] = useState(Number(job.wages) || 0);
  const [wagesPaid, setWagesPaid] = useState(0);
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState(job.notes || '');

  const setLine = (id: string, patch: any) =>
    setLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const chosen = lines.filter((l) => l.receive);
  const receivedGrams = chosen.reduce((s, l) => s + (Number(l.netWeight) || 0), 0);
  const issuedGrams = Number(job.totalIssuedWeight) || 0;
  const wastage = round3(Math.max(0, issuedGrams - receivedGrams - (Number(returnWeight) || 0)));

  const mut = useMutation({
    mutationFn: (body: any) => api.receiveJobWork(job.id, body),
    onSuccess: (res: any) => onDone(res.receivedItems || []),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not receive the job work'),
  });

  const submit = () => {
    if (!chosen.length) return toast.error('Tick at least one ornament to receive');
    for (const l of chosen) {
      if (!(Number(l.grossWeight) > 0)) return toast.error('Enter the gross weight of every ornament you receive');
    }
    mut.mutate({
      items: chosen.map((l) => ({
        id: l.id,
        ornament: l.ornament,
        metalType: l.metalType,
        purity: l.purity,
        quantity: Number(l.quantity) || 1,
        grossWeight: Number(l.grossWeight) || 0,
        stoneWeight: Number(l.stoneWeight) || 0,
        otherWeight: Number(l.otherWeight) || 0,
        netWeight: Number(l.netWeight) || calcNet(l.grossWeight, l.stoneWeight, l.otherWeight),
        currentRate: Number(l.currentRate) || 0,
        makingChargeType: l.makingChargeType,
        makingChargeValue: Number(l.makingChargeValue) || 0,
        labourCharge: Number(l.labourCharge) || 0,
        huid: l.huid || undefined,
        hsnCode: l.hsnCode || undefined,
      })),
      returnWeight: Number(returnWeight) || 0,
      returnMetalType: returnMetal,
      returnPurity,
      returnRate: rateFor(returnMetal, returnPurity),
      wages: Number(wages) || 0,
      wagesPaid: Number(wagesPaid) || 0,
      paymentMode,
      reference: reference || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Modal onClose={onClose} wide>
      <h3 className="text-lg font-semibold mb-1">Job Work IN — {job.jobNumber}</h3>
      <p className="text-xs text-gray-500 mb-4">
        Every ornament you receive becomes a jewellery item with its own barcode. Scrap / wastage returned is
        credited back into the metal ledger.
      </p>

      {pending.length === 0 && (
        <div className="text-center py-8 text-gray-400">All ornaments of this job work are already received.</div>
      )}

      <div className="space-y-3">
        {lines.map((l) => (
          <div key={l.id} className={'border rounded-lg p-3 ' + (l.receive ? 'border-primary-200 bg-primary-50/30' : 'border-gray-200')}>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={l.receive} onChange={(e) => setLine(l.id, { receive: e.target.checked })} />
                {l.ornament || 'Ornament'} <span className="text-xs text-gray-400">({l.metalType} {l.purity})</span>
              </label>
              <span className="text-xs text-gray-400">expected {g3(job.items.find((i: any) => i.id === l.id)?.expectedWeight)} g</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              <div>
                <label className="label">Gross wt (g)</label>
                <input
                  type="number" step="0.001" className="input-field" value={l.grossWeight || ''}
                  onChange={(e) => setLine(l.id, { grossWeight: Number(e.target.value), netWeight: calcNet(e.target.value, l.stoneWeight, l.otherWeight) })}
                />
              </div>
              <div>
                <label className="label">Stone wt</label>
                <input
                  type="number" step="0.001" className="input-field" value={l.stoneWeight || ''}
                  onChange={(e) => setLine(l.id, { stoneWeight: Number(e.target.value), netWeight: calcNet(l.grossWeight, e.target.value, l.otherWeight) })}
                />
              </div>
              <div>
                <label className="label">Other wt</label>
                <input
                  type="number" step="0.001" className="input-field" value={l.otherWeight || ''}
                  onChange={(e) => setLine(l.id, { otherWeight: Number(e.target.value), netWeight: calcNet(l.grossWeight, l.stoneWeight, e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Net wt (g)</label>
                <input
                  type="number" step="0.001" className="input-field bg-gray-50" value={l.netWeight || ''}
                  onChange={(e) => setLine(l.id, { netWeight: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Rate / g</label>
                <input type="number" className="input-field" value={l.currentRate || ''} onChange={(e) => setLine(l.id, { currentRate: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">HUID</label>
                <input className="input-field" value={l.huid || ''} onChange={(e) => setLine(l.id, { huid: e.target.value })} />
              </div>
              <div>
                <label className="label">Making type</label>
                <select className="input-field" value={l.makingChargeType} onChange={(e) => setLine(l.id, { makingChargeType: e.target.value })}>
                  {MAKING_TYPES.map((t) => <option key={t} value={t}>{t === 'PERCENTAGE' ? '%' : t === 'PER_GRAM' ? '₹/g' : 'Fixed ₹'}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Making</label>
                <input type="number" className="input-field" value={l.makingChargeValue || ''} onChange={(e) => setLine(l.id, { makingChargeValue: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Labour ₹</label>
                <input type="number" className="input-field" value={l.labourCharge || ''} onChange={(e) => setLine(l.id, { labourCharge: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">HSN</label>
                <input className="input-field" value={l.hsnCode || ''} onChange={(e) => setLine(l.id, { hsnCode: e.target.value })} />
              </div>
              <div>
                <label className="label">Qty</label>
                <input type="number" className="input-field" value={l.quantity || ''} onChange={(e) => setLine(l.id, { quantity: Number(e.target.value) })} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* metal balance */}
      <div className="grid grid-cols-4 gap-3 mt-5">
        <Kpi label="Metal issued" value={`${g3(issuedGrams)} g`} />
        <Kpi label="Received (net)" value={`${g3(receivedGrams)} g`} />
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Scrap / wastage returned</p>
          <div className="flex gap-1 mt-1">
            <select className="input-field !py-1 text-xs" value={returnMetal} onChange={(e) => setReturnMetal(e.target.value)}>
              {METALS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="input-field !py-1 text-xs" value={returnPurity} onChange={(e) => setReturnPurity(e.target.value)}>
              {PURITIES.map((p) => <option key={p} value={p}>{p.replace('SILVER_', '')}</option>)}
            </select>
          </div>
          <input
            type="number" step="0.001" className="input-field !py-1 mt-1 text-sm" placeholder="grams"
            value={returnWeight || ''} onChange={(e) => setReturnWeight(Number(e.target.value))}
          />
          <p className="text-xs text-gray-400 mt-1">credited back to the metal ledger</p>
        </div>
        <Kpi label="Wastage (loss)" value={`${g3(wastage)} g`} hint="issued − received − returned" />
      </div>

      {/* wages */}
      <div className="grid grid-cols-5 gap-3 mt-3">
        <div>
          <label className="label">Labour / wages ₹</label>
          <input type="number" className="input-field" value={wages || ''} onChange={(e) => setWages(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Paid now ₹</label>
          <input type="number" className="input-field" value={wagesPaid || ''} onChange={(e) => setWagesPaid(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Mode</label>
          <select className="input-field" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
            {['CASH', 'ONLINE', 'UPI', 'BANK_TRANSFER', 'CHEQUE'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Reference</label>
          <input className="input-field" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Wages left unpaid stay payable to {job.workerName} and show under <b>Wages payable</b>.
      </p>

      <div className="flex justify-end gap-2 mt-5">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={mut.isPending || pending.length === 0} onClick={submit}>
          <PackageCheck className="w-4 h-4" /> {mut.isPending ? 'Receiving…' : 'Receive & create barcodes'}
        </button>
      </div>
    </Modal>
  );
}

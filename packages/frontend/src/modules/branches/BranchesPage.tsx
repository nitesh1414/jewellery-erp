import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Plus, Edit2, MapPin, Phone } from 'lucide-react';

export default function BranchesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', code: '', address: '', city: '', state: '', pin: '', phone: '', isPrimary: false });

  const { data: branches, isLoading } = useQuery({ queryKey: ['branches'], queryFn: () => api.get<any>('/branches') });
  const createMut = useMutation({
    mutationFn: (b: any) => api.post('/branches', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); resetForm(); setShowForm(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: any) => api.put('/branches/' + id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); resetForm(); setEditing(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete('/branches/' + id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });

  function resetForm() { setForm({ name: '', code: '', address: '', city: '', state: '', pin: '', phone: '', isPrimary: false }); setEditing(null); }

  // Ctrl/Cmd+A → add branch
  useAppShortcut('app:add', () => { resetForm(); setShowForm(true); });
  function openEdit(b: any) { setEditing(b); setForm({ name: b.name, code: b.code, address: b.address || '', city: b.city || '', state: b.state || '', pin: b.pin || '', phone: b.phone || '', isPrimary: b.isPrimary }); }
  function submit() {
    if (!form.name) return;
    if (editing) updateMut.mutate({ id: editing.id, body: form });
    else createMut.mutate(form);
  }

  const list: any[] = (branches as any) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Branches</h1><p className="text-gray-500 text-sm mt-1">Run multiple shops from one software</p></div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}><Plus className="w-4 h-4" /> Add Branch</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <div className="col-span-full text-center py-12 text-gray-400">Loading…</div>}
        {!isLoading && list.length === 0 && (
          <div className="col-span-full card text-center py-12">
            <MapPin className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500">No branches yet. Add your primary branch to get started.</p>
          </div>
        )}
        {list.map((b) => (
          <div key={b.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{b.name}</p>
                <p className="text-xs text-gray-500">{b.code}{b.isPrimary ? ' • PRIMARY' : ''}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className={'badge ' + (b.isActive ? 'badge-success' : 'badge-gray')}>{b.isActive ? 'Active' : 'Inactive'}</span>
                <button onClick={() => openEdit(b)} className="btn-ghost p-1 text-primary-600"><Edit2 className="w-3.5 h-3.5" /></button>
                {!b.isPrimary && <button onClick={() => confirm('Deactivate ' + b.name + '?') && deleteMut.mutate(b.id)} className="btn-ghost p-1 text-red-500"><MapPin className="w-3.5 h-3.5" /></button>}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t text-sm space-y-1 text-gray-600">
              {b.address && <p className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{b.address}, {b.city}{b.state ? ', ' + b.state : ''}{b.pin ? ' - ' + b.pin : ''}</p>}
              {b.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{b.phone}</p>}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Edit Branch' : 'New Branch'}</h3>
            <div className="space-y-3">
              <div><label className="label">Branch Name *</label><input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main Branch" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Code</label><input className="input-field" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MAIN" /></div>
                <div><label className="label">Phone</label><input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div><label className="label">Address</label><input className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">City</label><input className="input-field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div><label className="label">State</label><input className="input-field" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
                <div><label className="label">PIN</label><input className="input-field" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></div>
              </div>
              <label className="flex items-center gap-2 mt-3">
                <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} />
                <span className="text-sm">Mark as primary branch</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
              <button className="btn-primary" onClick={submit}>
                {editing ? 'Update Branch' : 'Create Branch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

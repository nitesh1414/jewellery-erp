import { confirmAction } from '../../components/ConfirmDialog';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Plus, Shield, Pencil, Trash2, X, Check, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';

export default function RolesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', permissions: [] as string[] });

  const { data: roles, isLoading } = useQuery({ queryKey: ['roles'], queryFn: () => api.getRoles() });
  const { data: catalog } = useQuery({ queryKey: ['roles-catalog'], queryFn: () => api.getPermissionCatalog() });
  const modules = (catalog as any) || [];

  const createMut = useMutation({
    mutationFn: (b: any) => api.createRole(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setShowForm(false); setEditing(null); toast.success('Role created'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: any) => api.updateRole(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setShowForm(false); setEditing(null); toast.success('Role updated'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteRole(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Role deleted'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  function openEdit(r: any) {
    setEditing(r);
    setForm({ name: r.name, description: r.description || '', permissions: [...(r.permissions || [])] });
    setShowForm(true);
  }
  function openNew() {
    setEditing(null);
    setForm({ name: '', description: '', permissions: [] });
    setShowForm(true);
  }

  // Ctrl/Cmd+A → new custom role
  useAppShortcut('app:add', () => openNew());

  function hasPerm(name: string) { return form.permissions.includes(name); }
  function togglePerm(name: string) {
    setForm((f) => ({
      ...f,
      permissions: hasPerm(name) ? f.permissions.filter((p) => p !== name) : [...f.permissions, name],
    }));
  }

  function save() {
    if (!form.name.trim()) { toast.error('Role name required'); return; }
    if (editing) updateMut.mutate({ id: editing.id, body: form });
    else createMut.mutate(form);
  }

  const roleList: any[] = (roles as any) || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="page-title">Roles & Access</h1><p className="text-gray-500 text-sm mt-1">Define which tabs/modules each role can view (read) or edit (write). Create custom roles too.</p></div>
        <button className="btn-primary" onClick={openNew}><Plus className="w-4 h-4" /> New Custom Role</button>
      </div>

      {/* Roles list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="table-wrap">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Role</th><th className="table-header">Type</th><th className="table-header">Modules</th><th className="table-header">Description</th><th className="table-header text-right">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center py-12 text-gray-400">Loading…</td></tr>}
            {!isLoading && roleList.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-gray-400">No roles found</td></tr>}
            {roleList.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell font-medium"><span className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-primary-600" />{r.name}</span></td>
                <td className="table-cell"><span className={'badge ' + (r.isSystem ? 'badge-info' : 'badge-warning')}>{r.isSystem ? 'System' : 'Custom'}</span></td>
                <td className="table-cell text-xs text-gray-500">{[...new Set((r.permissions || []).map((p: string) => p.split('_')[0]))].join(', ') || '—'}</td>
                <td className="table-cell text-sm text-gray-500">{r.description || '—'}</td>
                <td className="table-cell text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(r)} className="btn-ghost p-1 text-amber-600" title="Edit access"><Pencil className="w-3.5 h-3.5" /></button>
                    {!r.isSystem && (
                      <button onClick={async () => { if (await confirmAction({ title: 'Delete role ' + r.name + '?', danger: true, confirmLabel: 'Delete' })) deleteMut.mutate(r.id); }} className="btn-ghost p-1 text-red-500" title="Delete role"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Role form modal — permission matrix */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 p-4 sm:p-6 max-h-[90vh] overflow-y-auto modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editing ? 'Edit Role Access' : 'New Custom Role'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div><label className="label">Role Name *</label><input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={editing?.isSystem} placeholder="e.g. SHOWROOM_MANAGER" /></div>
              <div><label className="label">Description</label><input className="input-field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>

            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-medium text-gray-700">Module Access</h4>
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={() => setForm((f: any) => ({ ...f, permissions: modules.flatMap((m: any) => m.permissions.map((p: any) => p.name)) }))} className="text-primary-600 hover:text-primary-700">Grant all</button>
                <button type="button" onClick={() => setForm((f: any) => ({ ...f, permissions: [] }))} className="text-gray-500 hover:text-gray-700">Clear all</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {modules.map((m: any) => (
                <div key={m.module} className="border rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{m.label}</p>
                  <div className="space-y-1.5">
                    {m.permissions.map((p: any) => (
                      <label key={p.name} className="flex items-center justify-between cursor-pointer text-sm">
                        <span className="text-gray-700">{p.label}</span>
                        <span className="flex items-center gap-1.5">
                          {p.action === 'read' ? <span className="badge-info">Read</span> : <span className="badge-warning">Write</span>}
                          <input type="checkbox" checked={hasPerm(p.name)} onChange={() => togglePerm(p.name)} className="accent-primary-600" />
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                <Save className="w-4 h-4" /> {editing ? 'Save Access' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

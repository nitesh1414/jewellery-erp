import { confirmAction } from '../../components/ConfirmDialog';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Plus, Edit2, Power, X } from 'lucide-react';

const DEFAULT_ROLES = ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'SALESMAN', 'CASHIER', 'INVENTORY_MANAGER', 'GOLDSMITH', 'KARIGAR', 'JOB_WORKER'];

export default function UsersPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', email: '', password: '', role: 'SALESMAN', branchId: '', branchIds: [] as string[] });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', search, roleFilter],
    queryFn: () => api.get<any>('/users' + buildQuery(search, roleFilter)),
  });
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => api.get<any>('/branches') });
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api.get<any>('/roles') });
  const roleNames = [...new Set([...DEFAULT_ROLES, ...((roles as any) || []).map((r: any) => r.name)])];
  const createMut = useMutation({
    mutationFn: (b: any) => api.post('/users', b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); resetForm(); setShowForm(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: any) => api.put('/users/' + id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); resetForm(); setEditing(null); setShowForm(false); },
  });
  const deactivateMut = useMutation({
    mutationFn: (id: string) => api.delete('/users/' + id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  function resetForm() { setForm({ name: '', email: '', password: '', role: 'SALESMAN', branchId: '', branchIds: [] as string[] }); setEditing(null); }

  // Ctrl/Cmd+A → add user
  useAppShortcut('app:add', () => { resetForm(); setShowForm(true); });
  function openEdit(u: any) {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      branchId: u.branchId || '',
      branchIds: (u.branchIds || []).filter(Boolean),
    });
    setShowForm(true);
  }
  function submit() {
    if (!form.name || !form.email) return;
    const body = { ...form, password: form.password || undefined };
    if (editing) updateMut.mutate({ id: editing.id, body });
    else createMut.mutate(body);
  }

  function toggleBranch(bid: string) {
    setForm((f: any) => {
      const has = f.branchIds.includes(bid);
      return { ...f, branchIds: has ? f.branchIds.filter((x: string) => x !== bid) : [...f.branchIds, bid] };
    });
  }

  const list: any[] = (users as any) || [];
  const brList: any[] = (branches as any) || [];

  const branchName = (id?: string) => brList.find((b) => b.id === id)?.name || '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="page-title">User Management</h1><p className="text-gray-500 text-sm mt-1">Create operators — assign a role & one or more branch access</p></div>
        <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}><Plus className="w-4 h-4" /> Add User</button>
      </div>

      <div className="flex gap-2">
        <input className="input-field max-w-xs" placeholder="Search by name / email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input-field w-48" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="table-wrap">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">User</th><th className="table-header">Email</th><th className="table-header">Role</th>
            <th className="table-header">Branch</th><th className="table-header">Branches</th><th className="table-header">Status</th><th className="table-header">Last login</th><th className="table-header">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading…</td></tr>}
            {!isLoading && list.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-gray-400">No users</td></tr>}
            {list.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{u.name && u.name.charAt(0).toUpperCase()}</div>
                    <span className="font-medium">{u.name}</span>
                  </div>
                </td>
                <td className="table-cell text-sm">{u.email}</td>
                <td className="table-cell"><span className="badge-info">{u.role}</span></td>
                <td className="table-cell text-sm">{branchName(u.branchId)}</td>
                <td className="table-cell text-xs">
                  {(u.branchIds || []).length > 1
                    ? `${(u.branchIds || []).length} branches`
                    : (u.branchIds || []).length === 1 ? branchName(u.branchIds[0]) : '—'}
                </td>
                <td className="table-cell">
                  <span className={'badge ' + (u.isActive ? 'badge-success' : 'badge-danger')}>{u.isActive ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="table-cell text-xs text-gray-500">{u.lastLogin ? new Date(u.lastLogin).toLocaleString('en-IN') : '—'}</td>
                <td className="table-cell text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(u)} className="btn-ghost p-1 text-primary-600" title="Edit user"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={async () => { if (await confirmAction({ title: (u.isActive ? 'Deactivate ' : 'Reactivate ') + u.name + '?', danger: u.isActive, confirmLabel: u.isActive ? 'Deactivate' : 'Reactivate' })) deactivateMut.mutate(u.id); }} className={'btn-ghost p-1 ' + (u.isActive ? 'text-red-500' : 'text-green-600')}><Power className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-4 sm:p-6 max-h-[90vh] overflow-y-auto modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editing ? 'Edit User' : 'New User'}</h3>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Full Name *</label><input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="label">Email *</label><input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><label className="label">Password {editing ? '(leave blank to keep)' : '*'}</label><input type="password" className="input-field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
                <div>
                  <label className="label">Role *</label>
                  <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Primary Branch</label>
                <select className="input-field" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">No branch</option>
                  {brList.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Branch Access <span className="text-gray-400">(multi-branch — tick all branches this user may operate in)</span></label>
                <div className="grid grid-cols-2 gap-2 border rounded-xl p-3 max-h-40 overflow-y-auto">
                  {brList.map((b: any) => (
                    <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.branchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} className="accent-primary-600" />
                      <span className={b.id === form.branchId ? 'font-semibold text-primary-700' : ''}>{b.name} ({b.code})</span>
                    </label>
                  ))}
                  {brList.length === 0 && <p className="text-xs text-gray-400">No branches yet. Add a branch first.</p>}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">The branch selector in the top bar only lists the branches ticked here.</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">Invite the user to login with their email and the password you set.</p>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
              <button className="btn-primary" onClick={submit}>{editing ? 'Update User' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildQuery(search: string, roleFilter: string) {
  const p: string[] = [];
  if (search) p.push('search=' + encodeURIComponent(search));
  if (roleFilter) p.push('role=' + encodeURIComponent(roleFilter));
  return p.length ? '?' + p.join('&') : '';
}

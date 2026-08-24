import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Plus, Search, Pencil, Trash2, User, Heart, Users } from 'lucide-react';

const GENDERS = [
  { value: 'MALE', label: 'Male Ornament', icon: User, tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'FEMALE', label: 'Female Ornament', icon: Heart, tone: 'bg-pink-50 text-pink-700 border-pink-200' },
  { value: 'UNISEX', label: 'Unisex', icon: Users, tone: 'bg-gray-50 text-gray-600 border-gray-200' },
];

export default function OrnamentMasterPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  // Ctrl/Cmd+A → add ornament
  useAppShortcut('app:add', () => { setEditing(null); setForm({ name: '', gender: 'FEMALE', category: '', notes: '' }); setShowAdd(true); });
  const [form, setForm] = useState({ name: '', gender: 'FEMALE', category: '', notes: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['ornaments', search, genderFilter],
    queryFn: () => api.getOrnaments({ search, gender: genderFilter }),
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => (editing ? api.updateOrnament(editing.id, body) : api.createOrnament(body)),
    onSuccess: () => {
      toast.success(editing ? 'Ornament updated!' : 'Ornament added!');
      qc.invalidateQueries({ queryKey: ['ornaments'] });
      setShowAdd(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteOrnament(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['ornaments'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const items = data?.items || [];
  const byGender = (g: string) => items.filter((o: any) => o.gender === g);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Ledger Master — Ornaments</h1>
          <p className="text-gray-500 text-sm mt-1">Master list of ornaments classified as male / female / unisex. Used in item entry, inventory and job work.</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name: '', gender: 'FEMALE', category: '', notes: '' }); setShowAdd(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Ornament
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input-field pl-10" placeholder="Search ornament or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input-field w-40" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
          <option value="">All (male + female + unisex)</option>
          <option value="MALE">Male ornaments</option>
          <option value="FEMALE">Female ornaments</option>
          <option value="UNISEX">Unisex</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {GENDERS.map((g) => (
            <div key={g.value} className={'rounded-xl border p-4 ' + g.tone}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-semibold">
                  <g.icon className="w-4 h-4" /> {g.label}
                </div>
                <span className="text-xs opacity-70">{byGender(g.value).length} items</span>
              </div>
              <div className="space-y-2">
                {byGender(g.value).length === 0 && <p className="text-xs opacity-60 py-4 text-center">Nothing here yet — add one</p>}
                {byGender(g.value).map((o: any) => (
                  <div key={o.id} className="bg-white rounded-lg border border-black/5 px-3 py-2 flex items-center justify-between group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{o.name}</p>
                      <p className="text-[11px] text-gray-400">{o.category || '—'}{!o.isActive ? ' · inactive' : ''}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditing(o); setForm({ name: o.name, gender: o.gender, category: o.category || '', notes: o.notes || '' }); setShowAdd(true); }}
                        className="p-1 text-gray-400 hover:text-primary-600"><Pencil className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={() => { if (confirm(`Delete "${o.name}"?`)) deleteMutation.mutate(o.id); }}
                        className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => { setShowAdd(false); setEditing(null); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Edit Ornament' : 'Add Ornament'}</h3>
            <div className="space-y-4">
              <div><label className="label">Ornament Name *</label><input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ladies Ring" autoFocus /></div>
              <div>
                <label className="label">Classification</label>
                <div className="grid grid-cols-3 gap-2">
                  {GENDERS.map((g) => (
                    <button key={g.value} onClick={() => setForm({ ...form, gender: g.value })}
                      className={'py-2.5 text-xs rounded-lg border transition-all flex flex-col items-center gap-1 ' + (form.gender === g.value ? 'border-primary-500 bg-primary-50 text-primary-700 font-semibold' : 'border-gray-200 text-gray-500')}>
                      <g.icon className="w-4 h-4" /> {g.label.replace(' Ornament', '')}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="label">Category</label><input className="input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ring / Bangle / Chain…" /></div>
              <div><label className="label">Notes</label><input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => { setShowAdd(false); setEditing(null); }} className="btn-secondary">Cancel</button>
              <button onClick={() => { if (!form.name.trim()) { toast.error('Name required'); return; } saveMutation.mutate(form); }} className="btn-primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : editing ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

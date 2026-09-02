import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import { Search, Plus, Phone, Edit2, Trash2, ChevronLeft, ChevronRight, Users as UsersIcon } from 'lucide-react';

export default function CustomersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [form, setForm] = useState({ name: '', mobile: '', email: '', address: '', city: '', state: '', gstin: '', notes: '' });
  const limit = 25;

  const [city, setCity] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page, city],
    queryFn: () => api.getCustomers({ search, page, limit, city: city || undefined }),
    placeholderData: keepPreviousData,
  });

  // cities that customers actually live in
  const { data: citiesData } = useQuery({
    queryKey: ['customers', 'cities'],
    queryFn: () => api.getCustomerCities(),
    staleTime: 300000,
  });
  const cities: string[] = Array.isArray(citiesData) ? citiesData : [];

  const createMutation = useMutation({
    mutationFn: (body: any) => api.createCustomer(body),
    onSuccess: () => { toast.success('Customer created'); qc.invalidateQueries({ queryKey: ['customers'] }); setShowAdd(false); resetForm(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  // Inline edit save
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.put('/customers/' + id, body),
    onSuccess: () => { toast.success('Customer updated'); qc.invalidateQueries({ queryKey: ['customers'] }); setEditingCustomer(null); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const resetForm = () => setForm({ name: '', mobile: '', email: '', address: '', city: '', state: '', gstin: '', notes: '' });

  // Ctrl/Cmd+A → add customer
  useAppShortcut('app:add', () => { setEditingCustomer(null); resetForm(); setShowAdd(true); });

  // Search debounce
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  const customers = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            <UsersIcon className="w-3 h-3 inline mr-1" />
            {total.toLocaleString('en-IN')} registered
            {searchInput && <span className="text-orange-600 ml-2">· filtered to "{searchInput}"</span>}
            {city && <span className="text-orange-600 ml-2">· {city}</span>}
          </p>
        </div>
        <button onClick={() => { setEditingCustomer(null); resetForm(); setShowAdd(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, mobile, ID, GSTIN..."
            className="input-field pl-10"
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); setPage(1); }}
            autoFocus
          />
        </div>
        <select
          className="input-field w-32 sm:w-40"
          value={city}
          onChange={e => { setCity(e.target.value); setPage(1); }}
        >
          <option value="">All Cities</option>
          {cities.map((c: string) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Compact table — handles large datasets */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="table-wrap">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-24">ID</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Customer</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Mobile</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">City</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">GSTIN</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 w-32">Outstanding</th>
              <th className="px-3 py-2.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                <UsersIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p>No customers found</p>
                {searchInput && <p className="text-xs mt-1">Try a different search term</p>}
              </td></tr>
            ) : (
              customers.map((c: any) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{c.customerId}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-sm text-gray-900">{c.name}</p>
                    {c.email && <p className="text-[11px] text-gray-400 truncate max-w-xs">{c.email}</p>}
                  </td>
                  <td className="px-3 py-2 text-sm">{c.mobile || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{c.city || '—'}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{c.gstin || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {c.outstanding > 0 ? (
                      <span className="text-xs font-semibold text-red-600">₹{c.outstanding.toLocaleString('en-IN')}</span>
                    ) : (
                      <span className="text-[11px] text-green-600 font-medium">Settled</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => navigate('/customers/' + c.id)} className="btn-ghost p-1 text-xs">
                        View
                      </button>
                      <button onClick={() => {
                        setEditingCustomer(c);
                        setForm({ name: c.name, mobile: c.mobile || '', email: c.email || '', address: c.address || '', city: c.city || '', state: c.state || '', gstin: c.gstin || '', notes: c.notes || '' });
                        setShowAdd(true);
                      }} className="btn-ghost p-1 text-primary-600" title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        {/* Pagination footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm bg-gray-50">
          <span className="text-gray-600">
            Showing <strong className="text-gray-900">{customers.length}</strong> of <strong className="text-gray-900">{total.toLocaleString('en-IN')}</strong> · page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <select className="input-field py-1 w-20 text-xs" value={limit} disabled>
              <option value={25}>25/pg</option>
            </select>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary py-1 text-xs">
              <ChevronLeft className="w-3 h-3" /> Prev
            </button>
            <span className="text-xs px-2 py-1 bg-white rounded border font-medium">{page}</span>
            <span className="text-xs text-gray-400">/ {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary py-1 text-xs">
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-4 sm:p-6 max-h-[90vh] overflow-y-auto modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h3>
            <div className="space-y-3">
              <div><label className="label">Name *</label><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Mobile</label><input className="input-field" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} /></div>
                <div><label className="label">Email</label><input className="input-field" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div><label className="label">Address</label><input className="input-field" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">City</label><input className="input-field" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                <div><label className="label">State</label><input className="input-field" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></div>
              </div>
              <div><label className="label">GSTIN</label><input className="input-field" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} /></div>
              <div><label className="label">Notes</label><textarea className="input-field" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => { setShowAdd(false); setEditingCustomer(null); }} className="btn-secondary">Cancel</button>
              <button
                onClick={() => {
                  if (!form.name) { toast.error('Name required'); return; }
                  if (editingCustomer) {
                    updateMutation.mutate({ id: editingCustomer.id, body: form });
                  } else {
                    createMutation.mutate(form);
                  }
                }}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="btn-primary"
              >
                {editingCustomer ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

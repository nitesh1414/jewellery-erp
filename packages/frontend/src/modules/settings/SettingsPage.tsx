import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Save, Building, Receipt, Percent, Diamond, Plus, X, Gem, Tag, BadgeCheck, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'shop' | 'invoice' | 'tax' | 'metals' | 'purities' | 'hallmark' | 'rates'>('shop');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });
  const { data: rates } = useQuery({ queryKey: ['rates'], queryFn: () => api.getRates() });

  const updateMutation = useMutation({
    mutationFn: (b: any) => api.updateSettings(b),
    onSuccess: () => { toast.success('Settings saved!'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const addMetalMutation = useMutation({
    mutationFn: (metal: string) => api.post('/settings/metals', { metal }),
    onSuccess: () => { toast.success('Metal added'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const removeMetalMutation = useMutation({
    mutationFn: (metal: string) => api.delete('/settings/metals/' + encodeURIComponent(metal)),
    onSuccess: () => { toast.success('Metal removed'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const addPurityMutation = useMutation({
    mutationFn: (purity: string) => api.post('/settings/purities', { purity }),
    onSuccess: () => { toast.success('Purity added'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const addHallmarkMutation = useMutation({
    mutationFn: (body: any) => api.addHallmark(body),
    onSuccess: () => { toast.success('Hallmark entry added!'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateHallmarkMutation = useMutation({
    mutationFn: ({ id, body }: any) => api.updateHallmark(id, body),
    onSuccess: () => { toast.success('Hallmark updated!'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const deleteHallmarkMutation = useMutation({
    mutationFn: (id: string) => api.deleteHallmark(id),
    onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const removePurityMutation = useMutation({
    mutationFn: (purity: string) => api.delete('/settings/purities/' + encodeURIComponent(purity)),
    onSuccess: () => { toast.success('Purity removed'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateRateMutation = useMutation({
    mutationFn: ({ id, rate }: { id: string; rate: number }) => api.updateRate(id, Number(rate)),
    onSuccess: () => { toast.success('Rate updated'); qc.invalidateQueries({ queryKey: ['rates'] }); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  });

  // Local form state for shop/tax/invoice
  const [shopForm, setShopForm] = useState<any>(null);
  const [taxForm, setTaxForm] = useState<any>(null);
  const [invoiceForm, setInvoiceForm] = useState<any>(null);

  useEffect(() => {
    if (!settings) return;
    setShopForm({
      shopName: settings.shopName, shopAddress: settings.shopAddress,
      shopCity: settings.shopCity, shopState: settings.shopState,
      shopPin: settings.shopPin, shopPhone: settings.shopPhone,
      shopEmail: settings.shopEmail, shopGstin: settings.shopGstin,
    });
    setTaxForm({
      defaultGstRate: settings.defaultGstRate,
      defaultCgstRate: settings.defaultCgstRate,
      defaultSgstRate: settings.defaultSgstRate,
    });
    setInvoiceForm({
      invoicePrefix: settings.invoicePrefix, nextBillNumber: settings.nextBillNumber,
      weightPrecision: settings.weightPrecision, amountPrecision: settings.amountPrecision,
    });
  }, [settings]);

  const [newMetal, setNewMetal] = useState('');
  const [newPurity, setNewPurity] = useState('');

  const isDefault = (list: string[], item: string) => list?.includes(item);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Shop, invoice, taxes, metals, purities, hallmarks & rates</p>
        </div>
        <button
          onClick={() => updateMutation.mutate({ ...shopForm, ...taxForm, ...invoiceForm })}
          disabled={updateMutation.isPending || !shopForm}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Save className="w-4 h-4" /> Save All
        </button>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-full overflow-x-auto no-scrollbar">
        {([
          ['shop', 'Shop Profile', Building],
          ['invoice', 'Invoice', Receipt],
          ['tax', 'Tax', Percent],
          ['metals', 'Metals', Diamond],
          ['hallmark', 'Hallmark', BadgeCheck],
          ['purities', 'Purities', Tag],
          ['rates', 'Rate Schedule', Gem],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={'px-3 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ' + (tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      <div className="max-w-4xl">
        {/* Shop Profile */}
        {tab === 'shop' && shopForm && (
          <div className="card space-y-4">
            <h3 className="section-title">Shop Profile</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2"><label className="label">Shop Name</label><input className="input-field" value={shopForm.shopName || ''} onChange={e => setShopForm({ ...shopForm, shopName: e.target.value })} /></div>
              <div className="col-span-1 sm:col-span-2"><label className="label">Address</label><input className="input-field" value={shopForm.shopAddress || ''} onChange={e => setShopForm({ ...shopForm, shopAddress: e.target.value })} /></div>
              <div><label className="label">City</label><input className="input-field" value={shopForm.shopCity || ''} onChange={e => setShopForm({ ...shopForm, shopCity: e.target.value })} /></div>
              <div><label className="label">State</label><input className="input-field" value={shopForm.shopState || ''} onChange={e => setShopForm({ ...shopForm, shopState: e.target.value })} /></div>
              <div><label className="label">Pincode</label><input className="input-field" value={shopForm.shopPin || ''} onChange={e => setShopForm({ ...shopForm, shopPin: e.target.value })} /></div>
              <div><label className="label">Phone</label><input className="input-field" value={shopForm.shopPhone || ''} onChange={e => setShopForm({ ...shopForm, shopPhone: e.target.value })} /></div>
              <div><label className="label">Email</label><input className="input-field" value={shopForm.shopEmail || ''} onChange={e => setShopForm({ ...shopForm, shopEmail: e.target.value })} /></div>
              <div><label className="label">GSTIN</label><input className="input-field" value={shopForm.shopGstin || ''} onChange={e => setShopForm({ ...shopForm, shopGstin: e.target.value })} /></div>
              <div className="col-span-1 sm:col-span-2 border-t pt-4">
                <label className="label">Shop Logo (shown in header, prints & quotations)</label>
                <div className="flex items-center gap-4">
                  {shopForm.logo ? (
                    <img src={shopForm.logo} alt="logo" className="w-14 h-14 rounded-lg border object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg border border-dashed flex items-center justify-center text-gray-300 text-xs">None</div>
                  )}
                  <div className="flex gap-2">
                    <label className="btn-secondary cursor-pointer">
                      <Upload className="w-4 h-4" /> Upload
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 300 * 1024) { toast.error('Logo must be under 300 KB'); return; }
                        const reader = new FileReader();
                        reader.onload = () => setShopForm({ ...shopForm, logo: reader.result as string });
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                    {shopForm.logo && <button className="btn-ghost text-red-500 text-sm" onClick={() => setShopForm({ ...shopForm, logo: '' })}>Remove</button>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Invoice */}
        {tab === 'invoice' && invoiceForm && (
          <div className="card space-y-4">
            <h3 className="section-title">Invoice Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Invoice Prefix</label><input className="input-field" value={invoiceForm.invoicePrefix || ''} onChange={e => setInvoiceForm({ ...invoiceForm, invoicePrefix: e.target.value })} /></div>
              <div><label className="label">Next Bill Number</label><input type="number" className="input-field" value={invoiceForm.nextBillNumber || 1} onChange={e => setInvoiceForm({ ...invoiceForm, nextBillNumber: Number(e.target.value) })} /></div>
              <div><label className="label">Weight Precision (decimals)</label>
                <select className="input-field" value={invoiceForm.weightPrecision} onChange={e => setInvoiceForm({ ...invoiceForm, weightPrecision: Number(e.target.value) })}>
                  <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
                </select></div>
              <div><label className="label">Amount Precision</label>
                <select className="input-field" value={invoiceForm.amountPrecision} onChange={e => setInvoiceForm({ ...invoiceForm, amountPrecision: Number(e.target.value) })}>
                  <option value={2}>2 (standard)</option><option value={0}>0 (whole numbers)</option>
                </select></div>
            </div>
            <p className="text-xs text-gray-400">Example: {invoiceForm.invoicePrefix || 'GST'}-2026-{String(invoiceForm.nextBillNumber || 1).padStart(6, '0')}</p>
          </div>
        )}

        {/* Tax */}
        {tab === 'tax' && taxForm && (
          <div className="card space-y-4">
            <h3 className="section-title">Tax Configuration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><label className="label">Total GST %</label><input type="number" step="0.1" className="input-field" value={taxForm.defaultGstRate} onChange={e => setTaxForm({ ...taxForm, defaultGstRate: Number(e.target.value) })} /></div>
              <div><label className="label">CGST %</label><input type="number" step="0.1" className="input-field" value={taxForm.defaultCgstRate} onChange={e => setTaxForm({ ...taxForm, defaultCgstRate: Number(e.target.value) })} /></div>
              <div><label className="label">SGST %</label><input type="number" step="0.1" className="input-field" value={taxForm.defaultSgstRate} onChange={e => setTaxForm({ ...taxForm, defaultSgstRate: Number(e.target.value) })} /></div>
            </div>
          </div>
        )}

        {/* Metals */}
        {tab === 'hallmark' && settings && (
          <HallmarksTab
            hallmarks={settings.allHallmarks || []}
            hallmarkCharge={settings.hallmarkCharge ?? 45}
            defaultPurities={settings.allPurities || []}
            onAdd={(body: any) => addHallmarkMutation.mutate(body)}
            onUpdate={(id: string, body: any) => updateHallmarkMutation.mutate({ id, body })}
            onDelete={(id: string) => confirm('Delete this hallmark entry?') && deleteHallmarkMutation.mutate(id)}
            onSaveDefaultCharge={(charge: number) => updateMutation.mutate({ hallmarkCharge: charge })}
          />
        )}
        {tab === 'metals' && (
          <MetalsTab
            metals={settings?.allMetals || []}
            defaultMetals={settings?.defaultMetals || []}
            newMetal={newMetal}
            setNewMetal={setNewMetal}
            onAdd={(m: string) => { setNewMetal(''); addMetalMutation.mutate(m); }}
            onRemove={(m: string) => removeMetalMutation.mutate(m)}
          />
        )}

        {/* Purities */}
        {tab === 'purities' && (
          <PuritiesTab
            purities={settings?.allPurities || []}
            defaultPurities={settings?.defaultPurities || []}
            newPurity={newPurity}
            setNewPurity={setNewPurity}
            onAdd={(p: string) => { setNewPurity(''); addPurityMutation.mutate(p); }}
            onRemove={(p: string) => removePurityMutation.mutate(p)}
          />
        )}

        {/* Rates */}
        {tab === 'rates' && (
          <RatesTab rates={rates || []} onUpdate={(id: string, rate: number) => updateRateMutation.mutate({ id, rate })} />
        )}
      </div>
    </div>
  );
}

function MetalsTab({ metals, defaultMetals, newMetal, setNewMetal, onAdd, onRemove }: any) {
  return (
    <div className="card space-y-4">
      <h3 className="section-title">Metal Catalog</h3>
      <p className="text-sm text-gray-500">Default metals (Gold, Silver, Platinum, etc.) are always available. Add custom metals below.</p>

      <div className="flex gap-2">
        <input
          className="input-field flex-1"
          placeholder="e.g. WHITE_GOLD or ROSE_GOLD"
          value={newMetal}
          onChange={e => setNewMetal(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
          onKeyDown={e => { if (e.key === 'Enter' && newMetal.trim()) onAdd(newMetal.trim()); }}
        />
        <button
          onClick={() => newMetal.trim() && onAdd(newMetal.trim())}
          disabled={!newMetal.trim()}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Add Metal
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 flex flex-wrap gap-2">
        {metals.map((m: string) => (
          <div key={m} className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md border ' + (defaultMetals?.includes(m) ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-white border-blue-200 text-blue-700')}>
            <span className="text-sm font-medium">{m}</span>
            {!defaultMetals?.includes(m) && (
              <button onClick={() => confirm('Remove metal "' + m + '"?') && onRemove(m)} className="text-red-500 hover:text-red-700">
                <X className="w-3 h-3" />
              </button>
            )}
            {defaultMetals?.includes(m) && <span className="text-[10px] uppercase font-bold text-yellow-600">DEF</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function PuritiesTab({ purities, defaultPurities, newPurity, setNewPurity, onAdd, onRemove }: any) {
  return (
    <div className="card space-y-4">
      <h3 className="section-title">Purity Catalog</h3>
      <p className="text-sm text-gray-500">Default purity levels (24K, 22K, 18K, etc.) are always available. Add custom purity grades below.</p>

      <div className="flex gap-2">
        <input
          className="input-field flex-1"
          placeholder="e.g. 21K or 925_AG or 14K_HV"
          value={newPurity}
          onChange={e => setNewPurity(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
          onKeyDown={e => { if (e.key === 'Enter' && newPurity.trim()) onAdd(newPurity.trim()); }}
        />
        <button
          onClick={() => newPurity.trim() && onAdd(newPurity.trim())}
          disabled={!newPurity.trim()}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Add Purity
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 flex flex-wrap gap-2">
        {purities.map((p: string) => (
          <div key={p} className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md border ' + (defaultPurities?.includes(p) ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-white border-blue-200 text-blue-700')}>
            <span className="text-sm font-medium">{p}</span>
            {!defaultPurities?.includes(p) && (
              <button onClick={() => confirm('Remove purity "' + p + '"?') && onRemove(p)} className="text-red-500 hover:text-red-700">
                <X className="w-3 h-3" />
              </button>
            )}
            {defaultPurities?.includes(p) && <span className="text-[10px] uppercase font-bold text-yellow-600">DEF</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RatesTab({ rates, onUpdate }: any) {
  const [rateEdits, setRateEdits] = useState<Record<string, number>>({});

  return (
    <div className="card space-y-4">
      <h3 className="section-title">Daily Rate Schedule</h3>
      <p className="text-sm text-gray-500">Edit gold/silver rates per purity. Used by Billing and Inventory.</p>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Metal</th>
            <th className="table-header">Purity</th>
            <th className="table-header text-right">Rate (₹ / gram)</th>
            <th className="table-header text-right">Effective</th>
            <th className="table-header"></th>
          </tr></thead>
          <tbody>
            {(rates || []).map((r: any) => (
              <tr key={r.id} className="border-b border-gray-50">
                <td className="table-cell font-medium">{r.metalType}</td>
                <td className="table-cell">{r.purity}</td>
                <td className="table-cell text-right">
                  <input
                    type="number"
                    className="input-field text-right w-32"
                    value={rateEdits[r.id] ?? r.rate}
                    onChange={e => setRateEdits({ ...rateEdits, [r.id]: Number(e.target.value) })}
                  />
                </td>
                <td className="table-cell text-right text-xs text-gray-500">
                  {new Date(r.effectiveDate).toLocaleDateString('en-IN')}
                </td>
                <td className="table-cell text-right">
                  <button
                    onClick={() => { onUpdate(r.id, rateEdits[r.id] ?? r.rate); setRateEdits(prev => { const c = { ...prev }; delete c[r.id]; return c; }); }}
                    className="btn-primary text-xs"
                  >
                    <Save className="w-3.5 h-3.5" /> Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/* ==================== HALLMARK MASTER TAB ==================== */
function HallmarksTab({ hallmarks, hallmarkCharge, defaultPurities, onAdd, onUpdate, onDelete, onSaveDefaultCharge }: any) {
  const [label, setLabel] = useState('');
  const [purity, setPurity] = useState('22K');
  const [charge, setCharge] = useState(45);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCharge, setEditCharge] = useState(0);
  const [defaultChargeInput, setDefaultChargeInput] = useState(hallmarkCharge);

  return (
    <div className="card p-6 space-y-5">
      <div>
        <p className="text-sm text-gray-500">
          Hallmark master used while billing — each entry maps a purity to a default hallmark charge. The charge is
          pre-filled on bill lines when an item carries a hallmark number.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-end gap-3">
        <div className="flex-1">
          <label className="label">Default hallmark charge (₹ per item)</label>
          <input type="number" className="input-field max-w-[160px]" value={defaultChargeInput} onChange={(e) => setDefaultChargeInput(Number(e.target.value))} />
        </div>
        <button className="btn-primary" onClick={() => onSaveDefaultCharge(defaultChargeInput)}>Save default</button>
      </div>

      <div className="border-t pt-5">
        <label className="label">Add / update hallmark entry</label>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end">
          <div><input className="input-field" placeholder="Label — e.g. Hallmark 22K (916)" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div>
            <select className="input-field" value={purity} onChange={(e) => setPurity(e.target.value)}>
              {defaultPurities.map((p: string) => <option key={p} value={p}>{p.replace('SILVER_', 'Silver ')}</option>)}
            </select>
          </div>
          <div><input type="number" className="input-field" placeholder="Charge ₹" value={charge || ''} onChange={(e) => setCharge(Number(e.target.value))} /></div>
          <button className="btn-primary" onClick={() => { if (!label.trim()) return; onAdd({ label, purity, charge }); setLabel(''); }}>Add entry</button>
        </div>
      </div>

      <div className="border-t pt-5">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="table-header">Label</th><th className="table-header">Purity</th>
            <th className="table-header text-right">Charge (₹)</th><th className="table-header"></th>
          </tr></thead>
          <tbody>
            {hallmarks.map((h: any) => (
              <tr key={h.id} className="border-b border-gray-50">
                <td className="table-cell font-medium">{h.label}</td>
                <td className="table-cell">{h.purity}</td>
                <td className="table-cell text-right">
                  {editingId === h.id ? (
                    <div className="flex gap-1 justify-end">
                      <input type="number" className="input-field !py-1 w-24 text-right" value={editCharge || ''} onChange={(e) => setEditCharge(Number(e.target.value))} autoFocus />
                      <button className="btn-primary !py-1 !px-2 text-xs" onClick={() => { onUpdate(h.id, { charge: editCharge }); setEditingId(null); }}>Save</button>
                      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => setEditingId(null)}>✕</button>
                    </div>
                  ) : (
                    <button onDoubleClick={() => { setEditingId(h.id); setEditCharge(h.charge); }} className="hover:bg-gray-50 px-2 rounded" title="Double-click to edit">₹{h.charge}</button>
                  )}
                </td>
                <td className="table-cell text-right">
                  <button
                    onClick={() => { if (confirm(`Delete hallmark entry "${h.label}"?`)) onDelete(h.id); }}
                    className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-2">Tip: double-click a charge to edit it inline. Entries marked as default can be edited but not deleted.</p>
      </div>
    </div>
  );
}

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import {
  Barcode, Plus, Printer, Search, Link, Unlink,
  Download, RefreshCw, Tag, CheckCircle, XCircle,
} from 'lucide-react';

export default function BarcodesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateCount, setGenerateCount] = useState(10);
  const [generatePrefix, setGeneratePrefix] = useState('G');
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [assignBarcode, setAssignBarcode] = useState('');
  const [assignItemBarcode, setAssignItemBarcode] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // Barcode list
  const { data, isLoading } = useQuery({
    queryKey: ['barcodes', search, page],
    queryFn: () => api.getBarcodes({ search, page, limit: 20 }),
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['barcodes-stats'],
    queryFn: () => api.get('/barcodes/stats'),
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: (body: any) => api.generateBarcodes(body.count),
    onSuccess: (data: any) => {
      toast.success(`Generated ${data.barcodes?.length || data.count} barcodes!`);
      queryClient.invalidateQueries({ queryKey: ['barcodes'] });
      queryClient.invalidateQueries({ queryKey: ['barcodes-stats'] });
      setShowGenerate(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error'),
  });

  const assignMutation = useMutation({
    mutationFn: ({ barcodeId, jewelleryItemId }: { barcodeId: string; jewelleryItemId: string }) =>
      api.post(`/barcodes/${barcodeId}/assign`, { jewelleryItemId }),
    onSuccess: () => {
      toast.success('Barcode assigned!');
      queryClient.invalidateQueries({ queryKey: ['barcodes'] });
      setShowAssign(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Error'),
  });

  const handleScan = async (barcode: string) => {
    if (!barcode.trim()) return;
    try {
      const result = await api.get(`/barcodes/scan/${barcode.trim()}`);
      setScanResult(result);
      toast.success(`Found: ${result.item?.designCode || result.barcode?.barcode || barcode}`);
    } catch {
      toast.error('Barcode not found in system');
      setScanResult(null);
    }
    setScanInput('');
    scanRef.current?.focus();
  };

  const printStickers = async (ids: string[]) => {
    if (!ids.length) { toast.error('Nothing to print'); return; }
    try { await api.post('/barcodes/batch/print', { barcodeIds: ids }); } catch { /* tracking only */ }
    window.open('/print/barcodes?ids=' + ids.join(','), '_blank');
  };

  const handlePrint = async (barcodeId: string) => {
    try {
      await api.post(`/barcodes/${barcodeId}/print`, {});
    } catch { /* tracking only */ }
    printStickers([barcodeId]);
  };

  const handleBatchPrint = async () => {
    if (!data?.items?.length) { toast.error('No barcodes on this page'); return; }
    printStickers(data.items.map((i: any) => i.id));
  };

  const handlePrintUnassigned = async () => {
    const res = await api.getBarcodes({ limit: 500 });
    const unassigned = (res.items || []).filter((b: any) => !b.jewelleryItemId).map((b: any) => b.id);
    if (!unassigned.length) { toast.error('No unassigned barcodes'); return; }
    printStickers(unassigned);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Barcode Management</h1>
          <p className="text-gray-500 text-sm mt-1">Generate, assign, and print barcodes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowGenerate(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Generate Barcodes
          </button>
          <button onClick={handleBatchPrint} className="btn-secondary">
            <Printer className="w-4 h-4" /> Print This Page
          </button>
          <button onClick={handlePrintUnassigned} className="btn-secondary">
            <Printer className="w-4 h-4" /> Print Unassigned
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="stat-label">Total Barcodes</p>
          <p className="stat-value">{stats?.total || 0}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Assigned</p>
          <p className="stat-value text-green-600">{stats?.assigned || 0}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Unassigned</p>
          <p className="stat-value text-orange-600">{stats?.unassigned || 0}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Printed Today</p>
          <p className="stat-value">{stats?.printedToday || 0}</p>
        </div>
      </div>

      {/* Barcode Scanner */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-500" />
            <input
              ref={scanRef}
              type="text"
              placeholder="Scan barcode here..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan(scanInput)}
              className="input-field pl-10 font-mono text-lg"
              autoFocus
            />
          </div>
          <button onClick={() => handleScan(scanInput)} className="btn-primary">
            <Search className="w-4 h-4" /> Lookup
          </button>
        </div>

        {scanResult && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-green-800">
                  {scanResult.type === 'ASSIGNED' ? '✓ Assigned Item' : 
                   scanResult.type === 'JEWELLERY_ITEM' ? '✓ Jewellery Item' : '⚠ Barcode Only'}
                </p>
                {(scanResult.item || scanResult.barcode) && (
                  <div className="mt-2 text-sm text-green-700 space-y-1">
                    <p>Barcode: <strong>{(scanResult.item?.barcode || scanResult.barcode?.barcode)}</strong></p>
                    {scanResult.item?.designCode && <p>Item: <strong>{scanResult.item.designCode}</strong></p>}
                    {scanResult.item?.purity && <p>Purity: <strong>{scanResult.item.purity}</strong></p>}
                    {scanResult.item?.netWeight && <p>Weight: <strong>{scanResult.item.netWeight}g</strong></p>}
                    {scanResult.item?.status && (
                      <p>Status: <span className={`badge ${
                        scanResult.item.status === 'IN_STOCK' ? 'badge-success' : 'badge-warning'
                      }`}>{scanResult.item.status}</span></p>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setScanResult(null)} className="btn-ghost">Clear</button>
            </div>
          </div>
        )}
      </div>

      {/* Filter & Search */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search barcode..."
            className="input-field pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Barcode Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="table-wrap">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="table-header">Barcode</th>
              <th className="table-header">Status</th>
              <th className="table-header">Assigned To</th>
              <th className="table-header">Created</th>
              <th className="table-header text-right">Printed</th>
              <th className="table-header text-right">Last Printed</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : data?.items?.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">No barcodes found. Generate some!</td></tr>
            ) : (
              data?.items?.map((b: any) => (
                <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-cell font-mono font-bold text-primary-700">{b.barcode}</td>
                  <td className="table-cell">
                    {b.isAssigned ? (
                      <span className="badge-success">Assigned</span>
                    ) : (
                      <span className="badge-gray">Unassigned</span>
                    )}
                  </td>
                  <td className="table-cell">
                    {b.jewelleryItem ? (
                      <div>
                        <p className="text-sm font-medium">{b.jewelleryItem.designCode}</p>
                        <p className="text-xs text-gray-400">{b.jewelleryItem.purity}</p>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="table-cell text-sm">{new Date(b.createdAt).toLocaleDateString('en-IN')}</td>
                  <td className="table-cell text-right">{b.printedCount}</td>
                  <td className="table-cell text-right text-sm">
                    {b.lastPrintedAt ? new Date(b.lastPrintedAt).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handlePrint(b.id)} className="btn-ghost p-1.5" title="Print barcode">
                        <Printer className="w-4 h-4" />
                      </button>
                      {!b.isAssigned && (
                        <button onClick={() => { setShowAssign(b.id); setAssignBarcode(b.barcode); }} className="btn-ghost p-1.5" title="Assign to item">
                          <Link className="w-4 h-4" />
                        </button>
                      )}
                      {b.isAssigned && (
                        <button onClick={() => api.post(`/barcodes/${b.id}/unassign`, {}).then(() => {
                          toast.success('Unassigned');
                          queryClient.invalidateQueries({ queryKey: ['barcodes'] });
                        })} className="btn-ghost p-1.5 text-red-500" title="Unassign">
                          <Unlink className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-gray-500">Page {page} of {data.totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm py-1">Prev</button>
              <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm py-1">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowGenerate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Generate Barcodes</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Prefix</label>
                <select className="input-field" value={generatePrefix} onChange={e => setGeneratePrefix(e.target.value)}>
                  <option value="G">G - Gold</option>
                  <option value="S">S - Silver</option>
                  <option value="P">P - Platinum</option>
                  <option value="R">R - Repair</option>
                </select>
              </div>
              <div>
                <label className="label">Number of Barcodes</label>
                <input
                  type="number"
                  className="input-field"
                  value={generateCount}
                  onChange={e => setGenerateCount(Math.min(500, Math.max(1, Number(e.target.value))))}
                  min={1}
                  max={500}
                />
                <p className="text-xs text-gray-400 mt-1">Max 500 at a time</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p>Next sequence: <strong>{generatePrefix}{(stats?.total || 0) + 1}</strong></p>
                <p className="text-gray-500 mt-1">
                  Will generate: <strong>{generatePrefix}{String((stats?.total || 0) + 1).padStart(8, '0')}</strong> to{' '}
                  <strong>{generatePrefix}{String((stats?.total || 0) + generateCount).padStart(8, '0')}</strong>
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowGenerate(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => generateMutation.mutate({ count: generateCount, prefix: generatePrefix })}
                disabled={generateMutation.isPending}
                className="btn-primary"
              >
                {generateMutation.isPending ? 'Generating...' : `Generate ${generateCount} Barcodes`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAssign(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Assign Barcode: {assignBarcode}</h3>
            <div>
              <label className="label">Jewellery Item Barcode</label>
              <input
                className="input-field font-mono"
                placeholder="Scan or enter item barcode"
                value={assignItemBarcode}
                onChange={e => setAssignItemBarcode(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && assignItemBarcode.trim()) {
                    try {
                      const item = await api.getJewelleryByBarcode(assignItemBarcode.trim());
                      assignMutation.mutate({ barcodeId: showAssign!, jewelleryItemId: item.id });
                    } catch {
                      toast.error('Item not found');
                    }
                  }
                }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowAssign(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
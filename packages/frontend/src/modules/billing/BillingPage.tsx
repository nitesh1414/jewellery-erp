import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import {
  Search, Scan, Plus, Trash2, Save, X, User,
  CreditCard, Diamond, Package, ShoppingCart, UserPlus,
} from 'lucide-react';

interface BillItem {
  id: string;
  jewelleryItemId?: string;
  barcode?: string;
  particular: string;
  hsnCode: string;
  purity: string;
  quantity: number;
  grossWeight: number;
  netWeight: number;
  ratePerGram: number;
  metalValue: number;
  makingCharges: number;
  chargeDetails: any[];
  hallMarkAmount: number;
  discount: number;
  urd: number;
  urdDocNumber?: string;
  cgst: number;
  sgst: number;
  totalAmount: number;
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);

  const [customer, setCustomer] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '', address: '', city: '', gstin: '' });

  const [billType, setBillType] = useState<'GST' | 'NON_GST'>('GST');
  const [items, setItems] = useState<BillItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('FIXED');
  const [narration, setNarration] = useState('');
  const [payments, setPayments] = useState<{ amount: number; mode: string; reference: string }[]>([]);
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentReference, setPaymentReference] = useState('');
  const [showManualItem, setShowManualItem] = useState(false);
  const [showInventorySelect, setShowInventorySelect] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');

  const [manualItem, setManualItem] = useState({
    particular: '', hsnCode: '7113', purity: '22K',
    grossWeight: 0, netWeight: 0, ratePerGram: 0,
    quantity: 1, makingChargeType: 'PERCENTAGE', makingChargeValue: 10,
  });

  const resetManualItem = () => setManualItem({ particular: '', hsnCode: '7113', purity: '22K', grossWeight: 0, netWeight: 0, ratePerGram: 0, quantity: 1, makingChargeType: 'PERCENTAGE', makingChargeValue: 10 });

  const handleNewBill = () => {
    setItems([]); setCustomer(null); setCustomerSearch('');
    setPayments([]); setDiscount(0); setShowPaymentPanel(false);
    barcodeInputRef.current?.focus();
  };

  // === KEYBOARD SHORTCUTS (Tally-style) ===
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag);
      if (inInput && e.key !== 'Escape') return;

      switch (e.key) {
        case 'F2': e.preventDefault(); handleNewBill(); break;
        case 'F3': e.preventDefault(); customerInputRef.current?.focus(); break;
        case 'F4': e.preventDefault(); barcodeInputRef.current?.focus(); break;
        case 'F5': e.preventDefault(); setShowManualItem(true); break;
        case 'F6': e.preventDefault(); setShowPaymentPanel(p => !p); break;
        case 'F7': e.preventDefault(); handleFinalizeBill(); break;
        case 'F9': e.preventDefault(); setShowInventorySelect(true); break;
        case 'Escape':
          e.preventDefault();
          if (showManualItem) setShowManualItem(false);
          else if (showInventorySelect) setShowInventorySelect(false);
          else if (showNewCustomer) setShowNewCustomer(false);
          else if (showPaymentPanel) setShowPaymentPanel(false);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  useEffect(() => { barcodeInputRef.current?.focus(); }, []);

  // === DATA QUERIES ===
  const { data: customerResults } = useQuery({
    queryKey: ['customer-search', customerSearch],
    queryFn: () => api.getCustomers({ search: customerSearch, limit: 5 }),
    enabled: customerSearch.length >= 1,
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-select', inventorySearch],
    queryFn: () => api.getJewelleryItems({ search: inventorySearch, status: 'IN_STOCK', limit: 20 }),
    enabled: showInventorySelect,
  });

  // === CALCULATION ===
  const calculateItem = (item: any) => {
    const metalValue = Math.round(item.netWeight * item.ratePerGram * item.quantity * 100) / 100;
    let makingCharges = item.makingCharges || 0;
    if (item.chargeDetails?.length > 0) {
      makingCharges = 0;
      for (const charge of item.chargeDetails) {
        if (charge.calculationType === 'PERCENTAGE') makingCharges += metalValue * (charge.value / 100);
        else if (charge.calculationType === 'PER_GRAM') makingCharges += item.netWeight * charge.value;
        else makingCharges += charge.value;
      }
      makingCharges = Math.round(makingCharges * 100) / 100;
    }
    const discount = item.discount || 0;
    const urd = item.urd || 0;
    const taxableAmount = Math.round((metalValue + makingCharges - discount - urd) * 100) / 100;
    const gstRate = billType === 'GST' ? 3 : 0;
    const halfRate = gstRate / 2;
    const cgst = Math.round(taxableAmount * (halfRate / 100) * 100) / 100;
    const sgst = Math.round(taxableAmount * (halfRate / 100) * 100) / 100;
    const totalAmount = Math.round((taxableAmount + cgst + sgst) * 100) / 100;
    return { metalValue, makingCharges, hallMarkAmount: 0, cgst, sgst, igst: 0, totalAmount };
  };

  const addItemToBill = (item: any) => {
    const calculated = calculateItem(item);
    setItems(prev => [...prev, { ...item, id: 'item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4), ...calculated }]);
  };

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({
    netWeight: 0, grossWeight: 0, ratePerGram: 0,
    makingChargeType: 'PERCENTAGE', makingChargeValue: 0,
    discount: 0, urd: 0, gstIncluded: true, purity: '22K',
  });

  const updateEditedItem = (itemId: string) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const merged = { ...it, ...editForm };
      const calc = calculateItem(merged);
      return { ...merged, ...calc };
    }));
    setEditingItemId(null);
    toast.success('Item updated');
  };

  const toggleItemGst = (itemId: string) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const toggled = { ...it, gstIncluded: it.gstIncluded === undefined ? false : !it.gstIncluded };
      if (!toggled.gstIncluded) {
        return { ...toggled, cgst: 0, sgst: 0, totalAmount: Math.round((toggled.netWeight * toggled.ratePerGram * toggled.quantity + toggled.makingCharges - toggled.discount - toggled.urd || 0) * 100) / 100 };
      }
      const calc = calculateItem(toggled);
      return { ...toggled, ...calc };
    }));
  };

  const handleBarcodeLookup = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return;
    try {
      const item = await api.getJewelleryByBarcode(barcode.trim());
      if (item.status !== 'IN_STOCK') {
        toast.error('Item not available (status: ' + item.status + ')');
        setBarcodeInput(''); barcodeInputRef.current?.focus(); return;
      }
      addItemToBill({
        jewelleryItemId: item.id, barcode: item.barcode,
        particular: item.designCode + ' - ' + item.purity, hsnCode: item.hsnCode, purity: item.purity,
        quantity: 1, grossWeight: item.grossWeight, netWeight: item.netWeight,
        ratePerGram: item.currentRate, metalValue: item.netWeight * item.currentRate,
        makingCharges: 0,
        chargeDetails: [{ type: 'MAKING', calculationType: item.makingChargeType, value: item.makingChargeValue, amount: 0 }],
        hallMarkAmount: 0, discount: 0, urd: 0, cgst: 0, sgst: 0, totalAmount: 0,
      });
      setBarcodeInput('');
      toast.success('Added: ' + item.designCode);
    } catch (err: any) {
      if (err.response?.status === 404) toast.error('Barcode not found. Manual (F5)');
      else toast.error('Error looking up barcode');
    }
    barcodeInputRef.current?.focus();
  }, []);

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  // === TOTALS ===
  const totals = items.reduce((acc, item) => ({
    subtotal: acc.subtotal + item.metalValue + item.makingCharges,
    totalCgst: acc.totalCgst + (item.cgst || 0),
    totalSgst: acc.totalSgst + (item.sgst || 0),
    totalAmount: acc.totalAmount + item.totalAmount,
  }), { subtotal: 0, totalCgst: 0, totalSgst: 0, totalAmount: 0 });

  const discountAmount = discountType === 'PERCENTAGE'
    ? Math.round(totals.subtotal * (discount / 100) * 100) / 100 : discount;
  const taxableAmount = Math.round((totals.subtotal - discountAmount) * 100) / 100;
  const totalTax = Math.round((totals.totalCgst + totals.totalSgst) * 100) / 100;
  const netAmountBeforeRound = Math.round((taxableAmount + totalTax) * 100) / 100;
  const roundOff = Math.round(Math.round(netAmountBeforeRound) - netAmountBeforeRound);
  const netAmount = Math.round((netAmountBeforeRound + roundOff) * 100) / 100;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balanceAmount = Math.round((netAmount - totalPaid) * 100) / 100;

  // === CREATE SALE ===
  const createSaleMutation = useMutation({
    mutationFn: (data: any) => api.createSale(data),
    onSuccess: (data: any) => {
      toast.success('Bill ' + data.billNumber + ' created!');
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const billId = data.id;
      handleNewBill();
      window.open('/print/sale/' + billId + '?format=A4_GST&auto=1', '_blank');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create bill'),
  });

  const handleFinalizeBill = () => {
    if (items.length === 0) { toast.error('Add at least one item'); return; }
    const billData = {
      billType,
      customerId: customer?.id,
      customerName: customer?.name || 'Walk-in Customer',
      customerMobile: customer?.mobile || '',
      customerGstin: billType === 'GST' ? customer?.gstin || '' : '',
      customerAddress: customer?.address || '',
      items: items.map(item => ({
        jewelleryItemId: item.jewelleryItemId, barcode: item.barcode,
        particular: item.particular, hsnCode: item.hsnCode, purity: item.purity,
        quantity: item.quantity, grossWeight: item.grossWeight, netWeight: item.netWeight,
        ratePerGram: item.ratePerGram, metalValue: item.metalValue,
        makingCharges: item.makingCharges, chargeDetails: item.chargeDetails,
        discount: item.discount, urd: item.urd, urdDocNumber: item.urdDocNumber,
      })),
      discount: discountAmount, discountType, isGst: billType === 'GST',
      narration,
      payments: payments.map(p => ({ amount: p.amount, paymentMode: p.mode, reference: p.reference })),
    };
    createSaleMutation.mutate(billData);
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.name) { toast.error('Customer name required'); return; }
    try {
      const created = await api.createCustomer({ ...newCustomer });
      setCustomer(created);
      setCustomerSearch(created.name);
      setShowNewCustomer(false);
      toast.success('Customer created & selected!');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error creating customer');
    }
  };

  const fm = (n: number) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-3 pb-6 lg:pb-4 print:hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0 flex-wrap gap-2">
        <div>
          <h1 className="page-title">Billing / POS</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            <kbd className="bg-gray-100 px-1 rounded text-[10px]">F2</kbd> New Bill ·
            <kbd className="bg-gray-100 px-1 rounded text-[10px]">F3</kbd> Customer ·
            <kbd className="bg-gray-100 px-1 rounded text-[10px]">F4</kbd> Scan ·
            <kbd className="bg-gray-100 px-1 rounded text-[10px]">F5</kbd> Manual ·
            <kbd className="bg-gray-100 px-1 rounded text-[10px]">F6</kbd> Payment ·
            <kbd className="bg-gray-100 px-1 rounded text-[10px]">F7</kbd> Save ·
            <kbd className="bg-gray-100 px-1 rounded text-[10px]">F9</kbd> Inventory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setBillType('GST')}
              className={'px-4 py-1.5 text-sm font-medium rounded-md transition-all ' + (billType === 'GST' ? 'bg-white shadow text-gray-900' : 'text-gray-500')}>GST</button>
            <button onClick={() => setBillType('NON_GST')}
              className={'px-4 py-1.5 text-sm font-medium rounded-md transition-all ' + (billType === 'NON_GST' ? 'bg-white shadow text-gray-900' : 'text-gray-500')}>Non-GST</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
        {/* LEFT */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Customer + Barcode row */}
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <div className="flex-1 relative">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
                <User className="w-4 h-4 text-gray-400" />
                <input ref={customerInputRef} type="text" className="flex-1 text-sm outline-none bg-transparent"
                  placeholder="Search customer (F3)..."
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustomerResults(true); if (!e.target.value) setCustomer(null); }}
                  onFocus={() => setShowCustomerResults(true)} />
                {customer && (
                  <button onClick={() => { setCustomer(null); setCustomerSearch(''); }} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" /></button>
                )}
              </div>

              {showCustomerResults && customerSearch.length >= 1 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                  {customerResults?.items?.map((c: any) => (
                    <button key={c.id} onClick={() => { setCustomer(c); setCustomerSearch(c.name + ' - ' + (c.mobile || '')); setShowCustomerResults(false); }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.mobile} | {c.city || ''}</p>
                      </div>
                      {c.outstanding > 0 && <span className="text-xs text-red-600 font-medium">₹{fm(c.outstanding)}</span>}
                    </button>
                  ))}
                  <button onClick={() => { setShowCustomerResults(false); setShowNewCustomer(true); }}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 text-blue-600 font-medium flex items-center gap-2 border-t border-gray-100">
                    <UserPlus className="w-4 h-4" /> Add New Customer &quot;{customerSearch}&quot;
                  </button>
                </div>
              )}
            </div>

            <div className="relative sm:w-64">
              <div className="flex items-center gap-2 bg-white border-2 border-primary-200 rounded-xl px-4 py-2.5 shadow-sm focus-within:border-primary-500">
                <Scan className="w-5 h-5 text-primary-500" />
                <input ref={barcodeInputRef} type="text" className="flex-1 text-sm outline-none bg-transparent font-mono"
                  placeholder="Scan barcode (F4)..." value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleBarcodeLookup(barcodeInput); }} />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowManualItem(true)} className="btn-secondary whitespace-nowrap" title="Manual Item (F5)">
                <Plus className="w-4 h-4" /> Manual
              </button>
              <button onClick={() => setShowInventorySelect(true)} className="btn-secondary whitespace-nowrap" title="From Inventory (F9)">
                <Package className="w-4 h-4" /> Inventory
              </button>
            </div>
          </div>

          {/* Customer bar */}
          {customer && (
            <div className="shrink-0 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 flex items-center gap-4 text-sm">
              <span className="font-medium text-blue-800">{customer.name}</span>
              <span className="text-blue-400">|</span>
              <span className="text-blue-700">{customer.mobile}</span>
              {customer.gstin && <><span className="text-blue-400">|</span><span className="text-blue-600">GST: {customer.gstin}</span></>}
              {customer.outstanding > 0 && <><span className="text-blue-400">|</span><span className="text-red-600 font-medium">Due: ₹{fm(customer.outstanding)}</span></>}
            </div>
          )}

          {/* Items table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            {items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 min-h-[300px] py-10">
                <ShoppingCart className="w-12 h-12" />
                <p className="text-lg font-medium">Empty Bill</p>
                <p className="text-sm">
                  Scan barcode <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">F4</kbd> |
                  Manual item <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">F5</kbd> |
                  From inventory <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">F9</kbd>
                </p>
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-100 sticky top-0 bg-white">
                    <th className="table-header">#</th><th className="table-header">Item</th><th className="table-header">Purity</th>
                    <th className="table-header text-right">Gross</th><th className="table-header text-right">Net Wt</th>
                    <th className="table-header text-right">Rate/g</th><th className="table-header text-right">Metal Value</th>
                    <th className="table-header text-right">Making</th><th className="table-header text-right">CGST</th>
                    <th className="table-header text-right">SGST</th><th className="table-header text-right">Total</th><th></th>
                  </tr></thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="table-cell text-gray-400">{idx + 1}</td>
                        <td className="table-cell"><p className="text-sm font-medium">{item.particular}</p>{item.barcode && <p className="text-xs text-gray-400">#{item.barcode}</p>}</td>
                        <td className="table-cell">{item.purity}</td>
                        <td className="table-cell text-right">{item.grossWeight.toFixed(3)}</td>
                        <td className="table-cell text-right font-medium">{item.netWeight.toFixed(3)}</td>
                        <td className="table-cell text-right">₹{fm(item.ratePerGram)}</td>
                        <td className="table-cell text-right">₹{fm(item.metalValue)}</td>
                        <td className="table-cell text-right">{item.makingCharges ? '₹' + fm(item.makingCharges) : '-'}</td>
                        <td className="table-cell text-right text-green-600">{item.cgst ? '₹' + item.cgst.toFixed(2) : '-'}</td>
                        <td className="table-cell text-right text-green-600">{item.sgst ? '₹' + item.sgst.toFixed(2) : '-'}</td>
                        <td className="table-cell text-right font-semibold">₹{fm(item.totalAmount)}</td>
                        <td className="table-cell text-right"><button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Single cohesive card (summary + payment + actions) — sticky on desktop */}
        <div className="w-full lg:sticky lg:top-20 space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bill Summary & Payment</h3>
              <span className="text-xs text-gray-400">{items.length} item{items.length === 1 ? '' : 's'}</span>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Weight</p>
                  <p className="font-medium text-gray-900">{items.reduce((s, i) => s + i.netWeight, 0).toFixed(3)} g</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Subtotal</p>
                  <p className="font-medium text-gray-900">₹{fm(totals.subtotal)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{discountType === 'PERCENTAGE' ? '%' : '₹'}</span>
                  <input type="number" placeholder="Discount" className="input-field text-sm py-1.5 pl-6 w-full" value={discount || ''}
                    onChange={e => setDiscount(Number(e.target.value) || 0)} />
                </div>
                <select value={discountType} onChange={e => setDiscountType(e.target.value as any)} className="input-field py-1.5 w-20 text-sm">
                  <option value="FIXED">₹</option><option value="PERCENTAGE">%</option>
                </select>
              </div>
              {discount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Discount</span><span className="font-medium text-red-600">-₹{fm(discountAmount)}</span></div>}

              <div>
                <label className="label !text-xs text-gray-500 mb-1">Notes / Remark</label>
                <textarea className="input-field text-xs py-1.5 resize-none w-full" rows={2}
                  value={narration} onChange={e => setNarration(e.target.value)}
                  placeholder="Optional bill note..." />
              </div>

              <div className="text-sm space-y-1.5 border-t border-gray-100 pt-3">
                <div className="flex justify-between"><span className="text-gray-500">Taxable</span><span>₹{fm(taxableAmount)}</span></div>
                {billType === 'GST' && <>
                  <div className="flex justify-between"><span className="text-gray-500">CGST (1.5%)</span><span className="text-green-600">₹{totals.totalCgst.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">SGST (1.5%)</span><span className="text-green-600">₹{totals.totalSgst.toFixed(2)}</span></div>
                </>}
                <div className="flex justify-between"><span className="text-gray-500">Round Off</span><span>{roundOff.toFixed(2)}</span></div>
              </div>

              <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-3 -mx-1">
                <div className="flex justify-between text-base font-bold text-primary-900">
                  <span>Net Amount</span><span>₹{fm(netAmount)}</span>
                </div>
                {totalPaid > 0 && <div className="flex justify-between text-sm text-green-700 font-medium mt-1"><span>Paid</span><span>₹{fm(totalPaid)}</span></div>}
                {balanceAmount > 0 && <div className="flex justify-between text-sm text-red-600 font-medium mt-1"><span>Balance</span><span>₹{fm(balanceAmount)}</span></div>}
              </div>

              {/* Payment inline - no separate scroll */}
              {showPaymentPanel && (
                <div className="border-t border-dashed border-gray-200 pt-3 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Receive Payment</p>
                    <span className="text-xs text-gray-400">Due: <strong className="text-red-600">₹{fm(balanceAmount)}</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                      <input type="number" className="input-field text-sm py-1.5 pl-6 w-full" placeholder="Amount received"
                        value={paymentAmount || ''} onChange={e => setPaymentAmount(Number(e.target.value) || 0)} autoFocus />
                    </div>
                    <button onClick={() => setPaymentAmount(balanceAmount)} className="btn-secondary text-xs px-2 py-1 whitespace-nowrap">Full</button>
                  </div>
                  <input type="text" className="input-field text-xs py-1.5 w-full" placeholder="Reference (UPI ID / cheque no)" value={paymentReference} onChange={e => setPaymentReference(e.target.value)} />

                  {payments.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {payments.map((p, i) => (
                        <div key={i} className="flex items-center justify-between bg-green-50 border border-green-200 rounded px-3 py-1.5 text-xs">
                          <span className="font-medium text-green-800">{p.mode}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-green-900">₹{fm(p.amount)}</span>
                            <button onClick={() => setPayments(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700"><X className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-1.5">
                    {['CASH', 'UPI', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'CHEQUE'].map(mode => (
                      <button key={mode} onClick={() => {
                        const remaining = netAmount - totalPaid;
                        if (remaining <= 0) { toast.error('Already fully paid'); return; }
                        const amt = paymentAmount > 0 ? paymentAmount : remaining;
                        if (amt > remaining) { toast.error('Amount exceeds balance'); return; }
                        if (amt <= 0) { toast.error('Enter amount'); return; }
                        setPayments(prev => [...prev, { amount: amt, mode, reference: paymentReference }]);
                        setPaymentAmount(0);
                        setPaymentReference('');
                      }} className="text-xs py-1.5 px-1 rounded border border-gray-200 text-gray-600 hover:border-gray-300">
                        {mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  {totalPaid > 0 && totalPaid < netAmount && (
                    <p className="text-[11px] text-orange-600 bg-orange-50 rounded px-2 py-1">⚠ Part payment — ₹{fm(balanceAmount)} will become outstanding</p>
                  )}
                </div>
              )}

              {/* Bottom action row */}
              <div className="space-y-2 pt-3 border-t">
                {!showPaymentPanel && (
                  <button onClick={() => setShowPaymentPanel(true)} className="btn-secondary w-full py-2 text-sm" title="Payment (F6)">
                    <CreditCard className="w-4 h-4" /> Add Payment
                  </button>
                )}
                {showPaymentPanel && (
                  <button onClick={() => setShowPaymentPanel(false)} className="btn-ghost w-full text-xs py-1 text-gray-500">Hide</button>
                )}
                <div className="flex gap-2">
                  <button onClick={handleFinalizeBill} disabled={items.length === 0 || createSaleMutation.isPending} className="btn-primary flex-1 py-3 text-base">
                    {createSaleMutation.isPending ? 'Saving...' : <><Save className="w-4 h-4" /> {balanceAmount <= 0 ? 'Finalize & Save' : 'Save Bill'}</>}
                  </button>
                  <button onClick={handleNewBill} className="btn-secondary" title="New Bill (F2)"><X className="w-4 h-4" /></button>
                </div>
                {payments.length > 0 && <button onClick={() => setPayments([])} className="btn-ghost w-full text-xs py-1 text-red-500">Clear payments</button>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Item Modal */}
      {showManualItem && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowManualItem(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Add Manual Item <span className="text-xs text-gray-400 font-normal">(F5)</span></h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Particular</label><input className="input-field" value={manualItem.particular} onChange={e => setManualItem({ ...manualItem, particular: e.target.value })} placeholder="Gold Ring" autoFocus /></div>
              <div><label className="label">HSN</label><input className="input-field" value={manualItem.hsnCode} onChange={e => setManualItem({ ...manualItem, hsnCode: e.target.value })} /></div>
              <div><label className="label">Purity</label>
                <select className="input-field" value={manualItem.purity} onChange={e => setManualItem({ ...manualItem, purity: e.target.value })}>
                  <option value="24K">24K</option><option value="22K">22K</option><option value="18K">18K</option><option value="SILVER_925">Silver 925</option>
                </select></div>
              <div><label className="label">Gross Wt (g)</label><input type="number" step="0.001" className="input-field" value={manualItem.grossWeight || ''} onChange={e => setManualItem({ ...manualItem, grossWeight: Number(e.target.value) })} /></div>
              <div><label className="label">Net Wt (g) *</label><input type="number" step="0.001" className="input-field" value={manualItem.netWeight || ''} onChange={e => setManualItem({ ...manualItem, netWeight: Number(e.target.value) })} /></div>
              <div><label className="label">Rate/g *</label><input type="number" className="input-field" value={manualItem.ratePerGram || ''} onChange={e => setManualItem({ ...manualItem, ratePerGram: Number(e.target.value) })} /></div>
              <div><label className="label">Making Type</label>
                <select className="input-field" value={manualItem.makingChargeType} onChange={e => setManualItem({ ...manualItem, makingChargeType: e.target.value })}>
                  <option value="PERCENTAGE">%</option><option value="PER_GRAM">/g</option><option value="FIXED_AMOUNT">Fixed</option>
                </select></div>
              <div><label className="label">Making Value</label><input type="number" className="input-field" value={manualItem.makingChargeValue} onChange={e => setManualItem({ ...manualItem, makingChargeValue: Number(e.target.value) })} /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowManualItem(false)} className="btn-secondary">Cancel (Esc)</button>
              <button onClick={() => {
                if (!manualItem.particular || !manualItem.netWeight || !manualItem.ratePerGram) { toast.error('Fill required fields'); return; }
                addItemToBill({ ...manualItem, chargeDetails: [{ type: 'MAKING', calculationType: manualItem.makingChargeType, value: manualItem.makingChargeValue, amount: 0 }], makingCharges: 0, discount: 0, urd: 0 });
                setShowManualItem(false);
                resetManualItem();
                barcodeInputRef.current?.focus();
              }} className="btn-primary"><Plus className="w-4 h-4" /> Add to Bill</button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Select Modal */}
      {showInventorySelect && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowInventorySelect(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Select from Inventory <span className="text-xs text-gray-400 font-normal">(F9)</span></h3>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search by barcode, design, SKU..." className="input-field pl-10" value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {inventoryItems?.items?.map((item: any) => (
                <div key={item.id} onClick={() => {
                  if (item.status !== 'IN_STOCK') { toast.error('Item not available'); return; }
                  addItemToBill({
                    jewelleryItemId: item.id, barcode: item.barcode,
                    particular: item.designCode + ' - ' + item.purity, hsnCode: item.hsnCode, purity: item.purity,
                    quantity: 1, grossWeight: item.grossWeight, netWeight: item.netWeight,
                    ratePerGram: item.currentRate, metalValue: item.netWeight * item.currentRate,
                    makingCharges: 0, chargeDetails: [{ type: 'MAKING', calculationType: item.makingChargeType, value: item.makingChargeValue, amount: 0 }],
                    hallMarkAmount: 0, discount: 0, urd: 0, cgst: 0, sgst: 0, totalAmount: 0,
                  });
                  setShowInventorySelect(false);
                  toast.success('Added: ' + item.designCode);
                  barcodeInputRef.current?.focus();
                }} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-primary-200 hover:bg-primary-50 cursor-pointer transition-all">
                  <div className="flex items-center gap-3">
                    <Diamond className="w-5 h-5 text-gray-300" />
                    <div>
                      <p className="font-medium text-sm">{item.designCode}</p>
                      <p className="text-xs text-gray-400">#{item.barcode} | {item.purity}</p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">₹{fm(item.currentRate)}/g</p>
                    <p className="text-xs text-gray-400">{item.netWeight}g</p>
                  </div>
                </div>
              ))}
              {(!inventoryItems?.items || inventoryItems.items.length === 0) && (
                <p className="text-center py-8 text-gray-400">No items found in inventory</p>
              )}
            </div>
            <div className="flex justify-end mt-4 pt-3 border-t">
              <button onClick={() => setShowInventorySelect(false)} className="btn-secondary">Close (Esc)</button>
            </div>
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowNewCustomer(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">New Customer</h3>
            <div className="space-y-3">
              <div><label className="label">Name *</label><input className="input-field" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Customer name" autoFocus /></div>
              <div><label className="label">Mobile</label><input className="input-field" value={newCustomer.mobile} onChange={e => setNewCustomer({ ...newCustomer, mobile: e.target.value })} placeholder="Mobile number" /></div>
              <div><label className="label">Address</label><input className="input-field" value={newCustomer.address} onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">City</label><input className="input-field" value={newCustomer.city} onChange={e => setNewCustomer({ ...newCustomer, city: e.target.value })} /></div>
                <div><label className="label">GSTIN</label><input className="input-field" value={newCustomer.gstin} onChange={e => setNewCustomer({ ...newCustomer, gstin: e.target.value })} /></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowNewCustomer(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCreateCustomer} className="btn-primary"><UserPlus className="w-4 h-4" /> Save & Select</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Line Modal */}
      {editingItemId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditingItemId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Edit Line — change rate, making, URD, GST</h3>
            <p className="text-xs text-gray-500 mb-4">Override gold rate, making charge, URD value, or exclude GST for this line only</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Purity</label>
                <select className="input-field" value={editForm.purity} onChange={e => setEditForm({ ...editForm, purity: e.target.value })}>
                  <option value="24K">24K</option><option value="22K">22K</option><option value="20K">20K</option>
                  <option value="18K">18K</option><option value="14K">14K</option><option value="10K">10K</option>
                  <option value="SILVER_999">Silver 999</option><option value="SILVER_925">Silver 925</option>
                </select></div>
              <div><label className="label">Rate / g (₹)</label><input type="number" className="input-field" value={editForm.ratePerGram} onChange={e => setEditForm({ ...editForm, ratePerGram: Number(e.target.value) })} /></div>
              <div><label className="label">Gross Wt (g)</label><input type="number" step="0.001" className="input-field" value={editForm.grossWeight} onChange={e => setEditForm({ ...editForm, grossWeight: Number(e.target.value) })} /></div>
              <div><label className="label">Net Wt (g)</label><input type="number" step="0.001" className="input-field" value={editForm.netWeight} onChange={e => setEditForm({ ...editForm, netWeight: Number(e.target.value) })} /></div>
              <div><label className="label">Making Type</label>
                <select className="input-field" value={editForm.makingChargeType} onChange={e => setEditForm({ ...editForm, makingChargeType: e.target.value })}>
                  <option value="PERCENTAGE">% of metal</option>
                  <option value="PER_GRAM">₹/gram</option>
                  <option value="FIXED_AMOUNT">Fixed ₹</option>
                </select></div>
              <div><label className="label">Making Value</label><input type="number" step="0.01" className="input-field" value={editForm.makingChargeValue} onChange={e => setEditForm({ ...editForm, makingChargeValue: Number(e.target.value) })} /></div>
              <div><label className="label">Discount on line (₹)</label><input type="number" className="input-field" value={editForm.discount} onChange={e => setEditForm({ ...editForm, discount: Number(e.target.value) })} /></div>
              <div><label className="label">URD Value (₹)</label><input type="number" className="input-field" value={editForm.urd} onChange={e => setEditForm({ ...editForm, urd: Number(e.target.value) })} /></div>
              <div className="col-span-2 flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.gstIncluded} onChange={e => setEditForm({ ...editForm, gstIncluded: e.target.checked })} />
                  <span className="text-sm font-medium">Include GST on this line</span>
                </label>
                <span className="text-xs text-gray-500 ml-auto">Uncheck to exclude GST for this item (e.g. URD/old gold)</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setEditingItemId(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => updateEditedItem(editingItemId)} className="btn-primary"><Save className="w-4 h-4" /> Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
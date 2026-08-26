import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { useAppShortcut } from '../../hooks/useAppShortcut';
import {
  Search, Scan, Plus, Trash2, Save, X, User,
  CreditCard, Diamond, Package, ShoppingCart, UserPlus, Pencil, Receipt,
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
  hallmarkNumber?: string;
  gstIncluded?: boolean;
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
  const discountInputRef = useRef<HTMLInputElement>(null);

  const [customer, setCustomer] = useState<any>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '', address: '', city: '', gstin: '' });

  const [billType, setBillType] = useState<'GST' | 'NON_GST'>('GST');
  const [billKind, setBillKind] = useState<'BILL' | 'ESTIMATE'>('BILL'); // tab 1: bills, tab 2: estimated bills
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<BillItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('FIXED');
  const [narration, setNarration] = useState('');
  const [payments, setPayments] = useState<{ amount: number; mode: string; reference: string; accountId?: string }[]>([]);
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [showManualItem, setShowManualItem] = useState(false);
  const [showInventorySelect, setShowInventorySelect] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [scanFlash, setScanFlash] = useState(false);
  const [showConfirmBill, setShowConfirmBill] = useState(false);

  const [manualItem, setManualItem] = useState<any>({
    particular: '', hsnCode: '7113', purity: '22K',
    grossWeight: 0, netWeight: 0, ratePerGram: 0,
    quantity: 1, makingChargeType: 'PERCENTAGE', makingChargeValue: 10,
    stoneWeight: 0, hallmarkNumber: '', hallmarkCharge: 0,
  });

  const resetManualItem = () => setManualItem({ particular: '', hsnCode: '7113', purity: '22K', grossWeight: 0, stoneWeight: 0, netWeight: 0, ratePerGram: 0, quantity: 1, makingChargeType: 'PERCENTAGE', makingChargeValue: 10, hallmarkNumber: '', hallmarkCharge: 0 });

  const handleNewBill = () => {
    setItems([]); setCustomer(null); setCustomerSearch('');
    setPayments([]); setDiscount(0); setShowPaymentPanel(false);
    setEditingEstimateId(null);
    if (window.location.search.includes('estimate=')) window.history.replaceState({}, '', '/billing');
    barcodeInputRef.current?.focus();
  };

  // === KEYBOARD SHORTCUTS (Tally-style) ===
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag);
      // Ctrl/Cmd+Enter saves/finalizes anywhere on the billing screen.
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleFinalizeBill();
        return;
      }
      // Function keys (F2–F9) & Escape must work even while an input is
      // focused (e.g. the barcode box), like in Tally/Busy billing software.
      if (inInput && e.key !== 'Escape' && !/^F[0-9]+$/.test(e.key)) return;

      switch (e.key) {
        case 'F2': e.preventDefault(); handleNewBill(); break;
        case 'F3': e.preventDefault(); customerInputRef.current?.focus(); break;
        case 'F4': e.preventDefault(); barcodeInputRef.current?.focus(); break;
        case 'F5': e.preventDefault(); setShowManualItem(true); break;
        case 'F6': e.preventDefault(); setShowPaymentPanel(p => !p); break;
        case 'F7': e.preventDefault(); handleFinalizeBill(); break;
        case 'F8': e.preventDefault(); discountInputRef.current?.focus(); break;
        case 'F9': e.preventDefault(); setShowInventorySelect(true); break;
        case 'Escape':
          e.preventDefault();
          if (showManualItem) setShowManualItem(false);
          else if (showInventorySelect) setShowInventorySelect(false);
          else if (showNewCustomer) setShowNewCustomer(false);
          else if (showPaymentPanel) setShowPaymentPanel(false);
          else if (showConfirmBill) setShowConfirmBill(false);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  useEffect(() => { barcodeInputRef.current?.focus(); }, []);

  // Global shortcuts: Ctrl/Cmd+A = add manual item, Ctrl/Cmd+N = new bill
  useAppShortcut('app:add', () => setShowManualItem(true));
  useAppShortcut('app:new', () => handleNewBill());

  // Press Enter to confirm the bill (like standard billing software).
  useEffect(() => {
    if (!showConfirmBill) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleFinalizeBill();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConfirmBill]);

  // === DATA QUERIES ===
  const { data: customerResults } = useQuery({
    queryKey: ['customer-search', customerSearch],
    queryFn: () => api.getCustomers({ search: customerSearch, limit: 5 }),
    enabled: customerSearch.length >= 1,
  });

  // Debounce the inventory search so a request happens only after typing pauses.
  const [inventorySearchDebounced, setInventorySearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setInventorySearchDebounced(inventorySearch), 250);
    return () => clearTimeout(t);
  }, [inventorySearch]);
  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-select', inventorySearchDebounced],
    queryFn: () => api.getJewelleryItems({ search: inventorySearchDebounced, status: 'IN_STOCK', limit: 30 }),
    enabled: showInventorySelect,
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: () => api.getAccounts(), staleTime: 60000 });
  const activeAccounts = ((accounts as any) || []).filter((a: any) => a.isActive !== false && !['INCOME', 'SALES', 'REVENUE'].includes(a.type));
  const { data: rateMaster } = useQuery({ queryKey: ['rates'], queryFn: () => api.getRates(), staleTime: 300000 });

  // Load an estimated bill for editing (/billing?estimate=<id>)
  useEffect(() => {
    const estId = searchParams.get('estimate');
    if (!estId) return;
    api.getSale(estId)
      .then((sale: any) => {
        if (!sale || sale.billType !== 'ESTIMATE') {
          toast.error('This bill is not an estimated bill');
          return;
        }
        if (sale.status !== 'ESTIMATE') {
          toast.error('Estimate already ' + sale.status.toLowerCase() + ' — not editable');
          return;
        }
        setBillKind('ESTIMATE');
        setEditingEstimateId(sale.id);
        setBillType(sale.isGst ? 'GST' : 'NON_GST');
        setCustomer(sale.customerId ? { id: sale.customerId, name: sale.customerName, mobile: sale.customerMobile } : { name: sale.customerName, mobile: sale.customerMobile });
        setCustomerSearch(sale.customerName || '');
        setDiscount(sale.discount || 0);
        setNarration(sale.narration || '');
        setItems(
          (sale.items || []).map((it: any, idx: number) => ({
            id: 'item-' + Date.now() + '-' + idx,
            jewelleryItemId: it.jewelleryItemId || undefined,
            barcode: it.barcode || undefined,
            particular: it.particular,
            hsnCode: it.hsnCode,
            purity: it.purity,
            quantity: it.quantity,
            grossWeight: it.grossWeight,
            netWeight: it.netWeight,
            ratePerGram: it.ratePerGram,
            metalValue: it.metalValue,
            makingCharges: it.makingCharges,
            chargeDetails: typeof it.chargeDetails === 'string' ? JSON.parse(it.chargeDetails || '[]') : it.chargeDetails || [],
            hallMarkAmount: it.hallMarkAmount || 0,
            hallmarkNumber: it.hallmarkNumber || '',
            discount: it.discount || 0,
            urd: it.urd || 0,
            cgst: it.cgst || 0,
            sgst: it.sgst || 0,
            totalAmount: it.totalAmount || 0,
          })),
        );
        toast.success('Editing estimate ' + sale.billNumber + ' — changes save back to the same estimate');
      })
      .catch(() => toast.error('Estimate not found'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
    const hallMarkAmount = (item.chargeDetails || []).filter((c: any) => c.type === 'HALLMARK').reduce((s2: number, c: any) => s2 + (c.amount || c.value || 0), 0);
    const discount = item.discount || 0;
    const urd = item.urd || 0;
    // GST rate comes from admin-configured settings (DB), never hard-coded.
    // A line can opt out of GST (e.g. URD/old gold) via item.gstIncluded = false.
    const taxableAmount = Math.round((metalValue + makingCharges - discount - urd) * 100) / 100;
    const gstRate = (billType === 'GST' && item.gstIncluded !== false) ? Number(settings?.defaultGstRate ?? 3) : 0;
    const halfRate = gstRate / 2;
    const cgst = Math.round(taxableAmount * (halfRate / 100) * 100) / 100;
    const sgst = Math.round(taxableAmount * (halfRate / 100) * 100) / 100;
    const totalAmount = Math.round((taxableAmount + cgst + sgst) * 100) / 100;
    return { metalValue, makingCharges, hallMarkAmount: Math.round(hallMarkAmount * 100) / 100, cgst, sgst, igst: 0, totalAmount };
  };

  // rebuild chargeDetails with the current hallmark number/charge
  const applyHallmarkToCharges = (item: any, hallmarkNumber: string, hallmarkCharge: number) => {
    const others = (item.chargeDetails || []).filter((c: any) => c.type !== 'HALLMARK');
    if (hallmarkCharge && hallmarkCharge > 0) {
      return [...others, { type: 'HALLMARK', label: 'Hallmark' + (hallmarkNumber ? ' ' + hallmarkNumber : '') + ' (' + (item.purity || '') + ')', calculationType: 'FIXED_AMOUNT', value: Number(hallmarkCharge) }];
    }
    return others;
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
    hallmarkNumber: '', hallmarkCharge: 0,
  });

  const updateEditedItem = (itemId: string) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const merged = { ...it, ...editForm, chargeDetails: applyHallmarkToCharges(it, editForm.hallmarkNumber || '', editForm.hallmarkCharge || 0) };
      merged.hallmarkNumber = editForm.hallmarkNumber || '';
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
        makingCharges: 0, hallmarkNumber: item.hallmarkNumber || '',
        chargeDetails: [
          { type: 'MAKING', calculationType: item.makingChargeType, value: item.makingChargeValue, amount: 0 },
          ...(item.hallmarkNumber ? [{ type: 'HALLMARK', label: 'Hallmark ' + item.hallmarkNumber + ' (' + item.purity + ')', calculationType: 'FIXED_AMOUNT', value: Number(settings?.hallmarkCharge ?? 45) }] : []),
        ],
        hallMarkAmount: 0, discount: 0, urd: 0, cgst: 0, sgst: 0, totalAmount: 0,
      });
      setBarcodeInput('');
      // Flash the scan box so the operator sees the barcode was accepted.
      setScanFlash(true);
      setTimeout(() => setScanFlash(false), 350);
      toast.success('Added: ' + item.designCode);
    } catch (err: any) {
      if (err.response?.status === 404) toast.error('Barcode not found. Manual (F5)');
      else toast.error('Error looking up barcode');
    }
    barcodeInputRef.current?.focus();
  }, []);

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const openEditItem = (item: any) => {
    const hallmarkCharge = (item.chargeDetails || []).find((c: any) => c.type === 'HALLMARK');
    setEditForm({
      netWeight: item.netWeight, grossWeight: item.grossWeight, ratePerGram: item.ratePerGram,
      makingChargeType: (item.chargeDetails || []).find((c: any) => c.type === 'MAKING')?.calculationType || 'PERCENTAGE',
      makingChargeValue: (item.chargeDetails || []).find((c: any) => c.type === 'MAKING')?.value ?? item.makingCharges ?? 0,
      discount: item.discount || 0, urd: item.urd || 0, gstIncluded: item.gstIncluded !== false, purity: item.purity,
      hallmarkNumber: item.hallmarkNumber || '', hallmarkCharge: hallmarkCharge ? (hallmarkCharge.value || hallmarkCharge.amount || 0) : 0,
    });
    setEditingItemId(item.id);
  };

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
    mutationFn: ({ data, kind, estimateId }: { data: any; kind: string; estimateId?: string }) =>
      kind === 'ESTIMATE' && estimateId ? api.put('/sales/' + estimateId, data) : api.createSale(data),
    onSuccess: (data: any, vars: any) => {
      if (vars.kind === 'ESTIMATE') {
        toast.success((vars.estimateId ? 'Estimated bill ' + data.billNumber + ' updated!' : 'Estimated bill ' + data.billNumber + ' saved!') + ' — confirm it from Bills → Estimated Bills when final');
        queryClient.invalidateQueries({ queryKey: ['bills'] });
        window.open('/print/sale/' + data.id + '?format=ESTIMATE&auto=1', '_blank');
        handleNewBill();
        setBillKind('BILL');
        return;
      }
      toast.success('Bill ' + data.billNumber + ' created!');
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const billId = data.id;
      handleNewBill();
      window.open('/print/sale/' + billId + '?format=A4_GST&auto=1', '_blank');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save'),
  });

  const handleFinalizeBill = () => {
    if (items.length === 0) { toast.error('Add at least one item'); return; }
    const billData = {
      billType: billKind === 'ESTIMATE' ? 'ESTIMATE' : billType,
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
        hallmarkNumber: item.hallmarkNumber || undefined, hallMarkAmount: item.hallMarkAmount || 0,
        discount: item.discount, urd: item.urd, urdDocNumber: item.urdDocNumber,
        gstIncluded: item.gstIncluded !== false,
      })),
      discount: discountAmount, discountType, isGst: billType === 'GST',
      narration,
      payments: billKind === 'ESTIMATE' ? [] : payments.map(p => ({ amount: p.amount, paymentMode: p.mode, reference: p.reference, accountId: p.accountId })),
    };
    createSaleMutation.mutate({ data: billData, kind: billKind, estimateId: editingEstimateId || undefined });
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

  // Admin-managed rate for a given purity (from DB rate master, never static).
  const getRateForPurity = (purity: string): number => {
    const rows: any[] = (rateMaster as any) || [];
    const exact = rows.find((r: any) => (r.purity || '').toUpperCase() === (purity || '').toUpperCase());
    return exact ? Number(exact.rate) || 0 : 0;
  };

  // Hallmark master entries (from database/settings) used to populate the
  // hallmark dropdown in the item forms.
  const hallmarkMaster: any[] = settings?.allHallmarks || [];

  // Apply a hallmark master entry: sets purity, the hallmark reference and the
  // charge for the given line form ('manual' or 'edit').
  const applyHallmarkFromMaster = (id: string, form: 'manual' | 'edit') => {
    const entry = hallmarkMaster.find((h: any) => h.id === id);
    if (!entry) return;
    const patch = { purity: entry.purity, hallmarkNumber: entry.label, hallmarkCharge: Number(entry.charge) || 0 };
    if (form === 'manual') setManualItem((prev: any) => ({ ...prev, ...patch }));
    else setEditForm((prev: any) => ({ ...prev, ...patch }));
  };

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
            <kbd className="bg-gray-100 px-1 rounded text-[10px]">F8</kbd> Discount ·
            <kbd className="bg-gray-100 px-1 rounded text-[10px]">F9</kbd> Inventory
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {editingEstimateId && billKind === 'ESTIMATE' && (
            <span className="badge badge-warning">✏ Editing estimate — save updates it</span>
          )}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setBillKind('BILL')}
              className={'px-4 py-1.5 text-sm font-medium rounded-md transition-all ' + (billKind === 'BILL' ? 'bg-white shadow text-gray-900' : 'text-gray-500')}>Bill</button>
            <button onClick={() => { setBillKind('ESTIMATE'); setPayments([]); setShowPaymentPanel(false); }}
              className={'px-4 py-1.5 text-sm font-medium rounded-md transition-all ' + (billKind === 'ESTIMATE' ? 'bg-white shadow text-amber-700' : 'text-gray-500')}>Estimated Bill</button>
          </div>
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

            <div className="relative sm:w-72">
              <div className={'flex items-center gap-2 bg-white border-2 rounded-xl px-4 py-2.5 shadow-sm transition-colors ' + (scanFlash ? 'border-green-500 bg-green-50' : 'border-primary-200 focus-within:border-primary-500')}>
                <Scan className="w-5 h-5 text-primary-500" />
                <input ref={barcodeInputRef} type="text" className="flex-1 text-sm outline-none bg-transparent font-mono"
                  placeholder="Scan barcode (F4)..." value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBarcodeLookup(barcodeInput); } }} />
                <button onClick={() => handleBarcodeLookup(barcodeInput)} className="text-xs text-primary-600 hover:text-primary-700 font-medium whitespace-nowrap">Scan</button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Point a barcode scanner here — it adds the item automatically.</p>
            </div>

            <div className="flex gap-2 shrink-0">
              <button onClick={() => setShowManualItem(true)} title="Manual Item (F5)"
                className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-all whitespace-nowrap">
                <Plus className="w-4 h-4 text-primary-500" /> Manual
              </button>
              <button onClick={() => setShowInventorySelect(true)} title="From Inventory (F9)"
                className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-primary-300 hover:text-primary-700 transition-all whitespace-nowrap">
                <Package className="w-4 h-4 text-primary-500" /> Inventory
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
                        <td className="table-cell">
                          <p className="text-sm font-medium">{item.particular}</p>
                          {item.barcode && <p className="text-xs text-gray-400">#{item.barcode}</p>}
                          {item.hallmarkNumber && <p className="text-[10px] text-amber-700">HM: {item.hallmarkNumber} · {item.purity}</p>}
                        </td>
                        <td className="table-cell">{item.purity}</td>
                        <td className="table-cell text-right">{item.grossWeight.toFixed(3)}</td>
                        <td className="table-cell text-right font-medium">{item.netWeight.toFixed(3)}</td>
                        <td className="table-cell text-right">₹{fm(item.ratePerGram)}</td>
                        <td className="table-cell text-right">₹{fm(item.metalValue)}</td>
                        <td className="table-cell text-right">
                          {item.makingCharges ? '₹' + fm(item.makingCharges) : '-'}
                          {item.hallMarkAmount > 0 && <p className="text-[10px] text-amber-700">+HM ₹{fm(item.hallMarkAmount)}</p>}
                        </td>
                        <td className="table-cell text-right text-green-600">{item.cgst ? '₹' + item.cgst.toFixed(2) : '-'}</td>
                        <td className="table-cell text-right text-green-600">{item.sgst ? '₹' + item.sgst.toFixed(2) : '-'}</td>
                        <td className="table-cell text-right font-semibold">₹{fm(item.totalAmount)}</td>
                        <td className="table-cell text-right whitespace-nowrap">
                          <button onClick={() => openEditItem(item)} className="text-gray-400 hover:text-primary-600 p-1" title="Edit line (hallmark, rate, making…)"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                        </td>
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
                  <input ref={discountInputRef} type="number" placeholder="Discount" className="input-field text-sm py-1.5 pl-6 w-full" value={discount || ''}
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
                  <select className="input-field text-xs py-1.5 w-full" value={paymentAccount} onChange={e => setPaymentAccount(e.target.value)}>
                    <option value="">Receive into — no ledger —</option>
                    {activeAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                  </select>

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
                        setPayments(prev => [...prev, { amount: amt, mode, reference: paymentReference, accountId: paymentAccount || undefined }]);
                        setPaymentAmount(0);
                        setPaymentReference('');
                        setPaymentAccount('');
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
                {billKind !== 'ESTIMATE' && !showPaymentPanel && (
                  <button onClick={() => setShowPaymentPanel(true)} className="btn-secondary w-full py-2 text-sm" title="Payment (F6)">
                    <CreditCard className="w-4 h-4" /> Add Payment
                  </button>
                )}
                {billKind === 'ESTIMATE' && (
                  <p className="text-xs text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-2">
                    Estimated bill — payments are taken when it is confirmed into a bill
                  </p>
                )}
                {showPaymentPanel && (
                  <button onClick={() => setShowPaymentPanel(false)} className="btn-ghost w-full text-xs py-1 text-gray-500">Hide</button>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { if (items.length === 0) { toast.error('Add at least one item'); return; } setShowConfirmBill(true); }} disabled={items.length === 0 || createSaleMutation.isPending}
                    className={'flex-1 py-3 text-base inline-flex items-center justify-center gap-2 ' + (billKind === 'ESTIMATE' ? 'bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors' : 'btn-primary')}>
                    {createSaleMutation.isPending ? 'Saving...' : <><Save className="w-4 h-4" /> {billKind === 'ESTIMATE' ? 'Save Estimated Bill' : (balanceAmount <= 0 ? 'Finalize & Save' : 'Save Bill')}</>}
                  </button>
                  <button onClick={handleNewBill} className="btn-secondary" title="New Bill (F2)"><X className="w-4 h-4" /></button>
                </div>
                {billKind !== 'ESTIMATE' && <p className="text-[10px] text-gray-400 text-center">Review the bill below, then confirm to generate it.</p>}
                {payments.length > 0 && <button onClick={() => setPayments([])} className="btn-ghost w-full text-xs py-1 text-red-500">Clear payments</button>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Generate Bill Confirmation Modal */}
      {showConfirmBill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowConfirmBill(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center"><Receipt className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-lg font-semibold leading-tight">{billKind === 'ESTIMATE' ? 'Save Estimated Bill' : 'Confirm & Generate Bill'}</h3>
                  <p className="text-xs text-gray-400">{items.length} item{items.length === 1 ? '' : 's'}{customer?.name ? ` · ${customer.name}` : ''}</p>
                </div>
              </div>
              <button onClick={() => setShowConfirmBill(false)} className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Body: items + totals side by side */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-0 flex-1 min-h-0">
              <div className="overflow-y-auto px-6 py-4 border-r border-gray-100">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-gray-500"><th className="text-left py-2 font-medium">Item</th><th className="text-right py-2 font-medium">Wt</th><th className="text-right py-2 font-medium">Amount</th></tr></thead>
                  <tbody>
                    {items.map((it: any, idx: number) => (
                      <tr key={idx} className="border-b border-gray-50">
                        <td className="py-2.5">{it.particular}<span className="block text-[11px] text-gray-400">{it.purity}{it.barcode ? ` · #${it.barcode}` : ''}</span></td>
                        <td className="py-2.5 text-right">{it.netWeight?.toFixed(3)}g</td>
                        <td className="py-2.5 text-right font-medium">₹{fm(it.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="p-6 bg-gray-50/50 space-y-2 text-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bill Summary</p>
                <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-medium">₹{fm(totals.subtotal)}</span></div>
                {discountAmount > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>-₹{fm(discountAmount)}</span></div>}
                <div className="flex justify-between"><span className="text-gray-600">Taxable</span><span className="font-medium">₹{fm(taxableAmount)}</span></div>
                {billType === 'GST' && <>
                  <div className="flex justify-between text-green-700"><span>CGST ({(Number(settings?.defaultCgstRate ?? 1.5)).toFixed(1)}%)</span><span>₹{totals.totalCgst.toFixed(2)}</span></div>
                  <div className="flex justify-between text-green-700"><span>SGST ({(Number(settings?.defaultSgstRate ?? 1.5)).toFixed(1)}%)</span><span>₹{totals.totalSgst.toFixed(2)}</span></div>
                </>}
                <div className="flex justify-between text-gray-500"><span>Round Off</span><span>{roundOff.toFixed(2)}</span></div>
                <div className="flex justify-between items-center bg-primary-600 rounded-xl px-4 py-3 text-white mt-2">
                  <span className="font-semibold">Net Amount</span><span className="text-lg font-bold">₹{fm(netAmount)}</span>
                </div>
                {totalPaid > 0 && <div className="flex justify-between text-green-700 font-medium"><span>Paid</span><span>₹{fm(totalPaid)}</span></div>}
                {balanceAmount > 0 && <div className="flex justify-between text-red-600 font-medium"><span>Balance</span><span>₹{fm(balanceAmount)}</span></div>}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-400 max-w-sm">{billKind === 'ESTIMATE' ? 'Saved as an estimate — stock & GST are applied when you confirm it into a bill.' : 'A bill number is generated and stock/ledger are updated. The invoice opens for printing.'}</span>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setShowConfirmBill(false)} className="btn-secondary text-sm">Back</button>
                <button onClick={() => { setShowConfirmBill(false); handleFinalizeBill(); }} disabled={createSaleMutation.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
                  <Save className="w-4 h-4" /> {createSaleMutation.isPending ? 'Saving...' : billKind === 'ESTIMATE' ? 'Save Estimate' : 'Generate & Print'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Item Modal */}
      {showManualItem && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowManualItem(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Add Manual Item <span className="text-xs text-gray-400 font-normal">(F5)</span></h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Particular</label><input className="input-field" value={manualItem.particular} onChange={e => setManualItem({ ...manualItem, particular: e.target.value })} placeholder="Gold Ring" autoFocus /></div>
              <div><label className="label">HSN</label><input className="input-field" value={manualItem.hsnCode} onChange={e => setManualItem({ ...manualItem, hsnCode: e.target.value })} /></div>
              <div><label className="label">Purity</label>
                <select className="input-field" value={manualItem.purity} onChange={e => {
                  const purity = e.target.value;
                  const autoRate = getRateForPurity(purity);
                  setManualItem((prev: any) => ({ ...prev, purity, ratePerGram: autoRate }));
                }}>
                  {(settings?.allPurities || ['24K', '22K', '18K', 'SILVER_925']).map((pr: string) => <option key={pr} value={pr}>{pr.replace('SILVER_', 'Silver ')}</option>)}
                </select></div>
              <div><label className="label">Gross Wt (g)</label><input type="number" step="0.001" className="input-field" value={manualItem.grossWeight || ''} onChange={e => setManualItem({ ...manualItem, grossWeight: Number(e.target.value) })} /></div>
              <div><label className="label">Stone Wt (g)</label><input type="number" step="0.001" className="input-field" value={manualItem.stoneWeight || ''} onChange={e => setManualItem({ ...manualItem, stoneWeight: Number(e.target.value) })} placeholder="0" /></div>
              <div><label className="label">Net Wt (g) *</label><input type="number" step="0.001" className="input-field" value={manualItem.netWeight || ''} onChange={e => setManualItem({ ...manualItem, netWeight: Number(e.target.value) })} /></div>
              <div><label className="label">Rate/g *</label><input type="number" className="input-field" value={manualItem.ratePerGram || ''} onChange={e => setManualItem({ ...manualItem, ratePerGram: Number(e.target.value) })} /></div>
              <div><label className="label">Making Type</label>
                <select className="input-field" value={manualItem.makingChargeType} onChange={e => setManualItem({ ...manualItem, makingChargeType: e.target.value })}>
                  <option value="PERCENTAGE">%</option><option value="PER_GRAM">/g</option><option value="FIXED_AMOUNT">Fixed</option>
                </select></div>
              <div><label className="label">Making Value</label><input type="number" className="input-field" value={manualItem.makingChargeValue} onChange={e => setManualItem({ ...manualItem, makingChargeValue: Number(e.target.value) })} /></div>
              <div className="col-span-2 border rounded-lg p-3 bg-amber-50/50">
                <p className="label !text-[10px] !mb-2">Hallmark (populated from database master)</p>
                <select
                  className="input-field mb-2"
                  value=""
                  onChange={e => { if (e.target.value) applyHallmarkFromMaster(e.target.value, 'manual'); }}
                >
                  <option value="">— Select hallmark from master —</option>
                  {hallmarkMaster.map((h: any) => (
                    <option key={h.id} value={h.id}>{h.label} ({h.purity} · ₹{h.charge})</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input className="input-field" placeholder="Hallmark number (optional)" value={manualItem.hallmarkNumber} onChange={e => setManualItem({ ...manualItem, hallmarkNumber: e.target.value })} />
                  <div className="flex gap-2">
                    <input type="number" className="input-field" placeholder="Charge ₹" value={manualItem.hallmarkCharge || ''} onChange={e => setManualItem({ ...manualItem, hallmarkCharge: Number(e.target.value) })} />
                    <button type="button" className="btn-ghost text-xs px-2 border rounded-lg whitespace-nowrap" onClick={() => setManualItem({ ...manualItem, hallmarkCharge: Number(settings?.hallmarkCharge ?? 45) })}>Default</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setShowManualItem(false)} className="btn-secondary">Cancel (Esc)</button>
              <button onClick={() => {
                if (!manualItem.particular || !manualItem.netWeight || !manualItem.ratePerGram) { toast.error('Fill required fields'); return; }
                addItemToBill({
                  ...manualItem,
                  hallmarkNumber: manualItem.hallmarkNumber || '',
                  chargeDetails: [
                    { type: 'MAKING', calculationType: manualItem.makingChargeType, value: manualItem.makingChargeValue, amount: 0 },
                    ...(manualItem.hallmarkCharge > 0 ? [{ type: 'HALLMARK', label: 'Hallmark ' + (manualItem.hallmarkNumber || '') + ' (' + manualItem.purity + ')', calculationType: 'FIXED_AMOUNT', value: Number(manualItem.hallmarkCharge) }] : []),
                  ],
                  makingCharges: 0, discount: 0, urd: 0,
                });
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-3">
              <h3 className="text-lg font-semibold">Select from Inventory <span className="text-xs text-gray-400 font-normal">(F9)</span></h3>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Search by barcode, design, SKU..." className="input-field pl-10" value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-6">
              <div className="space-y-2 pb-2">
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
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-gray-100">
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
                <select className="input-field" value={editForm.purity} onChange={e => {
                  const purity = e.target.value;
                  const autoRate = getRateForPurity(purity);
                  setEditForm((prev: any) => ({ ...prev, purity, ratePerGram: autoRate }));
                }}>
                  {(settings?.allPurities || ['24K', '22K', '18K', 'SILVER_925']).map((pr: string) => <option key={pr} value={pr}>{pr.replace('SILVER_', 'Silver ')}</option>)}
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
              <div className="col-span-2 border rounded-lg p-3 bg-amber-50/50">
                <p className="label !text-[10px] !mb-2">Hallmark (populated from database master)</p>
                <select
                  className="input-field mb-2"
                  value=""
                  onChange={e => { if (e.target.value) applyHallmarkFromMaster(e.target.value, 'edit'); }}
                >
                  <option value="">— Select hallmark from master —</option>
                  {hallmarkMaster.map((h: any) => (
                    <option key={h.id} value={h.id}>{h.label} ({h.purity} · ₹{h.charge})</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label !text-[10px]">Hallmark Number</label>
                    <input className="input-field" placeholder="HM-916-xxxx (optional)" value={editForm.hallmarkNumber || ''} onChange={e => setEditForm({ ...editForm, hallmarkNumber: e.target.value })} /></div>
                  <div><label className="label !text-[10px]">Hallmark Charge (₹)</label>
                    <div className="flex gap-2">
                      <input type="number" className="input-field" value={editForm.hallmarkCharge || ''} onChange={e => setEditForm({ ...editForm, hallmarkCharge: Number(e.target.value) })} placeholder="0" />
                      <button type="button" className="btn-ghost text-xs px-2 border rounded-lg whitespace-nowrap"
                        onClick={() => setEditForm({ ...editForm, hallmarkCharge: Number(settings?.hallmarkCharge ?? 45) })}>
                        Use default
                      </button>
                    </div>
                  </div>
                </div>
              </div>
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
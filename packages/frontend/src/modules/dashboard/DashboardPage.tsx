import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, IndianRupee, Receipt, Users, Diamond,
  Package, Briefcase, AlertTriangle, ShoppingCart, Plus,
  Scan, UserPlus, ShoppingBag, CircleDollarSign, Barcode,
  ArrowUpRight, Clock, CheckCircle, AlertCircle, Wallet, Building,
} from 'lucide-react';
import { fmtAdaptive, fmtWeight, fmtMoneyFull, fmtCount } from '../../utils/format';

function StatCard({ label, value, subValue, icon: Icon, color, subtitle, onClick, accent }: any) {
  return (
    <div
      onClick={onClick}
      className="stat-card cursor-pointer relative overflow-hidden group hover:shadow-md hover:border-primary-200 transition-all"
      role={onClick ? 'button' : undefined}
      title={label}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center shadow-sm`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {onClick && <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 transition-colors" />}
      </div>
      {/* Adaptive currency: ₹250K → ₹2.50L, ₹2.5Cr → ₹2.50Cr */}
      <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
      {subValue && <p className="text-[11px] text-gray-400 mt-0.5">{subValue}</p>}
      <p className="text-xs font-medium text-gray-500 mt-1">{label}</p>
      {subtitle && <p className="text-[11px] text-gray-400 mt-1 truncate">{subtitle}</p>}
      {accent && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.getDashboard(),
    refetchInterval: 60000,
  });

  const { data: rates } = useQuery({
    queryKey: ['dash-rates'],
    queryFn: () => api.get('/rates'),
  });

  const { data: accounts } = useQuery({
    queryKey: ['dash-accounts'],
    queryFn: () => api.get('/ledger/accounts'),
    refetchInterval: 90000,
  });

  const cashPosition = (() => {
    const list: any[] = (accounts as any) || [];
    let cash = 0, bank = 0, other = 0;
    for (const a of list) {
      const b = Number(a.currentBalance) || 0;
      if (a.type === 'CASH') cash += b;
      else if (a.type === 'BANK') bank += b;
      else other += b;
    }
    return { cash, bank, other, total: cash + bank + other };
  })();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const { today, inventory, jobs, customerOutstanding, customerCount, lowStockItems } = dashboard || {
    today: {}, inventory: {}, jobs: {}, customerOutstanding: 0, customerCount: 0, lowStockItems: 0,
  };

  const goldRate22K = (rates || []).find((r: any) => r.metalType === 'GOLD' && r.purity === '22K');
  const goldRate24K = (rates || []).find((r: any) => r.metalType === 'GOLD' && r.purity === '24K');
  const goldRate18K = (rates || []).find((r: any) => r.metalType === 'GOLD' && r.purity === '18K');
  const silverRate = (rates || []).find((r: any) => r.metalType === 'SILVER');

  const quickActions = [
    { label: 'New Bill', icon: ShoppingCart, color: 'bg-blue-600', action: () => navigate('/billing') },
    { label: 'Scan Barcode', icon: Scan, color: 'bg-green-600', action: () => navigate('/billing') },
    { label: 'Add Customer', icon: UserPlus, color: 'bg-purple-600', action: () => navigate('/customers') },
    { label: 'New Purchase', icon: ShoppingBag, color: 'bg-orange-600', action: () => navigate('/purchases') },
    { label: 'New Job Order', icon: Briefcase, color: 'bg-teal-600', action: () => navigate('/job-orders') },
    { label: 'Receive Payment', icon: CircleDollarSign, color: 'bg-indigo-600', action: () => navigate('/payments') },
    { label: 'Generate Barcode', icon: Barcode, color: 'bg-rose-600', action: () => navigate('/barcodes') },
    { label: 'Daily Rates', icon: Diamond, color: 'bg-yellow-600', action: () => navigate('/settings') },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-gray-500 mt-1">Your jewellery business at a glance — click any card to drill in</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock className="w-4 h-4" />
          <span>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {quickActions.map((action, i) => (
            <button
              key={i}
              onClick={action.action}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white border border-gray-200 hover:shadow-md hover:border-primary-200 transition-all group"
            >
              <div className={`w-9 h-9 rounded-lg ${action.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <action.icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs font-medium text-gray-600 text-center leading-tight">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Today's Business */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Today's Business</h2>
          <button onClick={() => navigate('/bills')} className="text-xs text-primary-600 hover:text-primary-700 font-medium">View all bills →</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Today's Sales"
            value={fmtAdaptive(today.sales)}
            subValue={fmtMoneyFull(today.sales)}
            icon={TrendingUp}
            color="bg-green-600"
            subtitle={`${today.bills || 0} bills`}
            onClick={() => navigate('/bills')}
          />
          <StatCard
            label="Collection"
            value={fmtAdaptive(today.collection)}
            subValue={fmtMoneyFull(today.collection)}
            icon={IndianRupee}
            color="bg-blue-600"
            onClick={() => navigate('/payments')}
          />
          <StatCard
            label="Outstanding"
            value={fmtAdaptive(today.outstanding)}
            subValue={fmtMoneyFull(today.outstanding)}
            icon={Receipt}
            color="bg-orange-600"
            accent={today.outstanding > 0}
            onClick={() => navigate('/bills?status=PART_PAID')}
          />
          <StatCard
            label="Bills Today"
            value={today.bills || 0}
            icon={Receipt}
            color="bg-purple-600"
            onClick={() => navigate('/bills')}
          />
          <StatCard
            label="GST Collected"
            value={fmtAdaptive(today.gstCollected)}
            subValue={fmtMoneyFull(today.gstCollected)}
            icon={Diamond}
            color="bg-indigo-600"
            onClick={() => navigate('/reports')}
          />
          <StatCard
            label="Customers"
            value={fmtCount(customerCount)}
            icon={Users}
            color="bg-pink-600"
            onClick={() => navigate('/customers')}
          />
        </div>
      </div>

      {/* Live Gold & Silver Rates */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Daily Rates</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {goldRate24K && (
            <div onClick={() => navigate('/settings')} className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all">
              <p className="text-xs text-yellow-700 font-medium">GOLD 24K</p>
              <p className="text-2xl font-bold text-yellow-900 mt-1">{fmtMoneyFull(goldRate24K.rate)}</p>
              <p className="text-[10px] text-yellow-600 mt-1">per gram</p>
            </div>
          )}
          {goldRate22K && (
            <div onClick={() => navigate('/settings')} className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all">
              <p className="text-xs text-yellow-700 font-medium">GOLD 22K</p>
              <p className="text-2xl font-bold text-yellow-900 mt-1">{fmtMoneyFull(goldRate22K.rate)}</p>
              <p className="text-[10px] text-yellow-600 mt-1">per gram</p>
            </div>
          )}
          {goldRate18K && (
            <div onClick={() => navigate('/settings')} className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all">
              <p className="text-xs text-yellow-700 font-medium">GOLD 18K</p>
              <p className="text-2xl font-bold text-yellow-900 mt-1">{fmtMoneyFull(goldRate18K.rate)}</p>
              <p className="text-[10px] text-yellow-600 mt-1">per gram</p>
            </div>
          )}
          {silverRate && (
            <div onClick={() => navigate('/settings')} className="bg-gradient-to-br from-gray-50 to-slate-50 border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all">
              <p className="text-xs text-gray-700 font-medium">SILVER</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmtMoneyFull(silverRate.rate)}</p>
              <p className="text-[10px] text-gray-600 mt-1">per gram · {silverRate.purity}</p>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">📝 Manage rates in <button onClick={() => navigate('/settings')} className="text-primary-600 underline">Settings → Rates</button></p>
      </div>

      {/* Inventory & Jobs & Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Inventory */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title flex items-center gap-2"><Package className="w-4 h-4" />Inventory</h3>
            <button onClick={() => navigate('/inventory')} className="text-xs text-primary-600 hover:text-primary-700 font-medium">View</button>
          </div>
          <div className="space-y-3">
            <div onClick={() => navigate('/jewellery')} className="flex items-center justify-between p-2 hover:bg-yellow-50 rounded cursor-pointer -mx-2 px-2">
              <div className="flex items-center gap-2">
                <Diamond className="w-3.5 h-3.5 text-yellow-500" />
                <span className="text-sm text-gray-600">Gold</span>
              </div>
              <span className="text-sm font-semibold">{fmtWeight(inventory.goldStock)} g</span>
            </div>
            <div onClick={() => navigate('/jewellery')} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer -mx-2 px-2">
              <div className="flex items-center gap-2">
                <Diamond className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-600">Silver</span>
              </div>
              <span className="text-sm font-semibold">{fmtWeight(inventory.silverStock)} g</span>
            </div>
            <div onClick={() => navigate('/inventory')} className="flex items-center justify-between p-2 -mx-2 px-2">
              <span className="text-sm text-gray-600">Pieces</span>
              <span className="text-sm font-semibold">{inventory.totalPieces || 0}</span>
            </div>
            <div onClick={() => navigate('/inventory')} className="flex items-center justify-between pt-3 border-t">
              <span className="text-sm font-medium text-gray-700">Stock Value</span>
              <span className="text-sm font-bold text-gray-900">{fmtAdaptive(inventory.stockValue || 0)}</span>
            </div>
          </div>
        </div>

        {/* Job Work */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title flex items-center gap-2"><Briefcase className="w-4 h-4" />Job Work</h3>
            <button onClick={() => navigate('/job-orders')} className="text-xs text-primary-600 hover:text-primary-700 font-medium">View</button>
          </div>
          <div className="space-y-3">
            <div onClick={() => navigate('/job-orders?status=ASSIGNED')} className="flex items-center justify-between p-2 hover:bg-blue-50 rounded cursor-pointer -mx-2 px-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-sm text-gray-600">Pending</span>
              </div>
              <span className="badge-info">{jobs.pending || 0}</span>
            </div>
            <div onClick={() => navigate('/job-orders?status=IN_PROGRESS')} className="flex items-center justify-between p-2 hover:bg-yellow-50 rounded cursor-pointer -mx-2 px-2">
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-yellow-500" />
                <span className="text-sm text-gray-600">In Progress</span>
              </div>
              <span className="badge-warning">{jobs.inProgress || 0}</span>
            </div>
            <div onClick={() => navigate('/job-orders?status=READY')} className="flex items-center justify-between p-2 hover:bg-green-50 rounded cursor-pointer -mx-2 px-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                <span className="text-sm text-gray-600">Ready</span>
              </div>
              <span className="badge-success">{jobs.ready || 0}</span>
            </div>
            <div onClick={() => navigate('/job-orders')} className="flex items-center justify-between pt-3 border-t">
              <span className="text-sm font-medium text-gray-700">Delayed</span>
              <span className="badge-danger">{jobs.delayed || 0}</span>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="card">
          <h3 className="section-title flex items-center gap-2 mb-4"><AlertTriangle className="w-4 h-4" />Alerts</h3>
          <div className="space-y-3">
            <div onClick={() => navigate('/inventory?lowStock')} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span className="text-sm text-gray-700">Low Stock</span>
              </div>
              <span className="text-sm font-semibold text-orange-700">{lowStockItems || 0}</span>
            </div>
            <div onClick={() => navigate('/bills?status=PART_PAID')} className="flex items-center justify-between p-3 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 transition-colors">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-red-500" />
                <span className="text-sm text-gray-700">Receivables</span>
              </div>
              <span className="text-sm font-semibold text-red-700">{fmtAdaptive(customerOutstanding)}</span>
            </div>
          </div>
        </div>

        {/* Customers */}
        <div className="card">
          <h3 className="section-title flex items-center gap-2 mb-4"><Users className="w-4 h-4" />Customers</h3>
          <div onClick={() => navigate('/customers')} className="flex flex-col items-center justify-center py-6 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="text-5xl font-bold text-primary-700">{fmtCount(customerCount)}</div>
            <p className="text-sm text-gray-500 mt-2">Total Registered</p>
            <button className="mt-3 text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">View All <ArrowUpRight className="w-3 h-3" /></button>
          </div>
        </div>
      </div>

      {/* Cash & Bank position */}
      <div className="card border-primary-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary-600" /> Cash & Bank Position
          </h3>
          <button onClick={() => navigate('/ledger/accounts')} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Manage Accounts →</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-xs text-green-700 font-medium">Cash on Hand</p>
            <p className="text-2xl font-bold text-green-900 mt-1">{cashPosition.cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-green-600 mt-1">Liquid money · counters & tills</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-700 font-medium">Bank</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{cashPosition.bank.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-blue-600 mt-1">Across all bank accounts</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-700 font-medium">Other (Card / Wallet)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{cashPosition.other.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-gray-500 mt-1">Receivables & wallet</p>
          </div>
          <div className="p-4 bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-300 font-medium">Total Liquidity</p>
            <p className="text-2xl font-bold text-white mt-1">₹{cashPosition.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-gray-400 mt-1">Across all accounts</p>
          </div>
        </div>
      </div>
    </div>
  );
}

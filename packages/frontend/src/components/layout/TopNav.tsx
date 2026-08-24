import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { useBranchStore } from '../../stores/branchStore';
import { api } from '../../services/api';
import { BranchSelector } from './BranchSelector';
import {
  LayoutDashboard, ShoppingCart, Receipt, Users, Diamond, Package, Barcode,
  ShoppingBag, Truck, Briefcase, Gem, Wrench, FileBarChart, Settings, LogOut,
  Bell, ChevronDown, Search, HandCoins, Clock, Wallet, CreditCard,
  Building, Users as UsersIcon,
} from 'lucide-react';

interface MenuItem {
  to?: string;
  label: string;
  icon?: any;
  submenu?: { to: string; label: string; icon: any }[];
}

const menuItems: MenuItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    label: 'Sales',
    icon: ShoppingCart,
    submenu: [
      { to: '/billing', label: 'Billing / POS', icon: ShoppingCart },
      { to: '/bills', label: 'Bills List', icon: Receipt },
      { to: '/payments', label: 'Payments', icon: HandCoins },
      { to: '/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    label: 'Inventory',
    icon: Package,
    submenu: [
      { to: '/jewellery', label: 'Jewellery Items', icon: Diamond },
      { to: '/inventory', label: 'Stock', icon: Package },
      { to: '/barcodes', label: 'Barcodes', icon: Barcode },
      { to: '/purchases', label: 'Purchases', icon: ShoppingBag },
      { to: '/suppliers', label: 'Suppliers', icon: Truck },
    ],
  },
  {
    label: 'Accounts',
    icon: Wallet,
    submenu: [
      { to: '/ledger/accounts', label: 'Ledger Accounts', icon: Wallet },
      { to: '/ledger/entries', label: 'Credit / Debit Entries', icon: CreditCard },
      { to: '/expenses', label: 'Expenses', icon: ShoppingBag },
      { to: '/income', label: 'Income (Non-Sale)', icon: CreditCard },
    ],
  },
  {
    label: 'Job Work',
    icon: Briefcase,
    submenu: [
      { to: '/job-orders', label: 'Job Orders', icon: Briefcase },
      { to: '/urd', label: 'URD / Old Gold', icon: Gem },
      { to: '/reports', label: 'Repairs', icon: Wrench },
    ],
  },
  {
    label: 'Admin',
    icon: Building,
    submenu: [
      { to: '/branches', label: 'Branches', icon: Building },
      { to: '/users', label: 'Users', icon: Users },
      { to: '/reports', label: 'Reports Center', icon: FileBarChart },
    ],
  },
];

export function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const clearBranch = useBranchStore((s) => s.clearBranch);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showUser, setShowUser] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // company details from Settings (shop name + logo shown everywhere)
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings(), staleTime: 60000 });
  // live date-time in the header bar (updates every second, no separate bar)
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const navRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // Live today ticker
  const { data: summary } = useQuery({
    queryKey: ['topbar-today'],
    queryFn: () => api.get('/sales/today'),
    refetchInterval: 60000,
  });
  const { data: rates } = useQuery({
    queryKey: ['topbar-rates'],
    queryFn: () => api.get('/rates'),
    refetchInterval: 300000,
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications?limit=20'),
    refetchInterval: 30000,
  });
  const notifUnread = (notifications as any)?.unread || 0;

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setShowUser(false);
        setShowNotif(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setOpenMenu(null);
    setShowUser(false);
  }, [location.pathname]);



  const handleLogout = () => {
    clearBranch();
    logout();
    navigate('/login');
  };

  const isMenuActive = (item: MenuItem) => {
    if (item.to) return location.pathname === item.to || location.pathname === item.to + '/';
    if (item.submenu) return item.submenu.some(s => location.pathname.startsWith(s.to));
    return false;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const q = searchQuery.trim();
    if (/^JOB-\d+/i.test(q)) navigate(`/job-orders`);
    else if (/^GST-\d+/i.test(q) || /^NG-\d+/i.test(q)) navigate(`/bills?search=${q}`);
    else if (/^G\d{8,}/i.test(q)) navigate(`/jewellery?search=${q}`);
    else navigate(`/bills?search=${q}`);
    setSearchQuery('');
  };

  const fmt = (n: number) => '₹' + (n || 0).toLocaleString('en-IN');
  const goldRate = (rates || []).find((r: any) => r.metalType === 'GOLD' && r.purity === '22K');
  const silverRate = (rates || []).find((r: any) => r.metalType === 'SILVER');

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm z-30 sticky top-0" ref={navRef}>
      {/* Main navigation bar */}
      <div className="h-14 px-4 flex items-center justify-between">
        {/* Left: Logo + Main menu */}
        <div className="flex items-center gap-6 flex-1 min-w-0">
          <NavLink to="/dashboard" className="flex items-center gap-2 flex-shrink-0 pr-4 border-r border-gray-100 h-14">
            {settings?.logo ? (
              <img src={settings.logo} alt={settings.shopName || 'logo'} className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <Diamond className="w-4 h-4 text-white" />
              </div>
            )}
            <div className="hidden sm:block max-w-[160px]">
              <h1 className="text-sm font-bold text-gray-900 leading-tight truncate">{settings?.shopName || 'Jewellery Shop'}</h1>
              <p className="text-[10px] text-gray-500 leading-tight">ERP & POS</p>
            </div>
          </NavLink>

          {/* Quick search */}
          <form onSubmit={handleSearch} className="hidden md:flex items-center gap-1 flex-1 max-w-xs">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search bill # / barcode / job #..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </form>

          {/* Main menu items */}
          <nav className="hidden lg:flex items-center gap-1 flex-1">
            {menuItems.map((item, idx) => {
              const isActive = isMenuActive(item);
              if (item.to) {
                return (
                  <NavLink
                    key={idx}
                    to={item.to}
                    className={'px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ' +
                      (isActive ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}
                  >
                    {item.icon && <item.icon className="w-4 h-4" />}
                    {item.label}
                  </NavLink>
                );
              }
              // Submenu dropdown
              const menuKey = item.label;
              const isOpen = openMenu === menuKey;
              return (
                <div key={idx} className="relative">
                  <button
                    onClick={() => setOpenMenu(isOpen ? null : menuKey)}
                    onMouseEnter={() => setOpenMenu(menuKey)}
                    className={'px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ' +
                      (isActive || isOpen ? 'text-primary-700 bg-primary-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}
                  >
                    {item.icon && <item.icon className="w-4 h-4" />}
                    {item.label}
                    <ChevronDown className={'w-3 h-3 transition-transform ' + (isOpen ? 'rotate-180' : '')} />
                  </button>
                  {isOpen && (
                    <div
                      className="absolute top-full left-0 mt-1 min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
                      onMouseLeave={() => setOpenMenu(null)}
                    >
                      {item.submenu?.map((sub, subIdx) => {
                        const SubIcon = sub.icon;
                        const subActive = location.pathname === sub.to;
                        return (
                          <NavLink
                            key={subIdx}
                            to={sub.to}
                            className={'flex items-center gap-2 px-3 py-2 text-sm transition-colors ' +
                              (subActive ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50')}
                          >
                            <SubIcon className="w-4 h-4 text-gray-400" />
                            {sub.label}
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Right: Live date-time + Notifications + User */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Live date & time (single navbar — no separate bar) */}
          <div className="hidden sm:flex flex-col items-end leading-tight pr-2 border-r border-gray-100" title="Live date & time">
            <span className="text-[11px] font-medium text-gray-700 tabular-nums">
              {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <span className="text-[11px] text-gray-500 tabular-nums flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          {/* Branch selector (multi-branch) */}
          <BranchSelector />

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setShowNotif(!showNotif); setShowUser(false); }}
              className="relative p-2 rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-900"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {notifUnread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {notifUnread > 9 ? '9+' : notifUnread}
                </span>
              )}
            </button>
            {showNotif && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                  <span className="text-sm font-semibold">Notifications</span>
                  <button onClick={() => api.put('/notifications/read-all').then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))} className="text-xs text-primary-600 hover:text-primary-700">
                    Mark all read
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications?.items?.length === 0 && (
                    <div className="px-3 py-8 text-center text-gray-400 text-sm">No notifications</div>
                  )}
                  {notifications?.items?.map((n: any) => (
                    <div key={n.id} className={'px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 cursor-pointer ' + (n.status === 'UNREAD' ? 'bg-blue-50/50' : '')}
                      onClick={() => { api.put('/notifications/' + n.id + '/read'); qc.invalidateQueries({ queryKey: ['notifications'] }); }}>
                      <p className="text-sm font-medium text-gray-800">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          {user && (
            <div className="relative">
              <button
                onClick={() => { setShowUser(!showUser); setShowNotif(false); }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100"
              >
                <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                  {user.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-medium text-gray-900 leading-tight">{user.name}</p>
                  <p className="text-[10px] text-gray-500 leading-tight capitalize">{user.role?.replace('_', ' ')}</p>
                </div>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              {showUser && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <button onClick={() => navigate('/settings')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Settings className="w-4 h-4" /> Settings
                  </button>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100">
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </header>
  );
}

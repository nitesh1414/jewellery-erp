import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  LayoutDashboard, ShoppingCart, Users, Package, Barcode,
  Briefcase, ShoppingBag, Truck, HandCoins,
  FileBarChart, Settings, LogOut, Diamond, ChevronLeft, ChevronRight,
  Receipt, CircleDollarSign, Gem, HardHat, BookOpen,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: null },
  { to: '/billing', label: 'Billing / POS', icon: ShoppingCart, permission: 'BILLING_CREATE' },
  { to: '/bills', label: 'Bills', icon: Receipt, permission: 'BILLING_VIEW' },
  { to: '/customers', label: 'Customers', icon: Users, permission: 'CUSTOMERS_VIEW' },
  { to: '/jewellery', label: 'Jewellery', icon: Diamond, permission: 'INVENTORY_VIEW' },
  { to: '/inventory', label: 'Inventory', icon: Package, permission: 'INVENTORY_VIEW' },
  { to: '/barcodes', label: 'Barcodes', icon: Barcode, permission: 'INVENTORY_VIEW' },
  { to: '/purchases', label: 'Purchases', icon: ShoppingBag, permission: null },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, permission: null },
  { to: '/job-orders', label: 'Job Orders', icon: Briefcase, permission: 'JOB_WORK_VIEW' },
  { to: '/workers', label: 'Workers', icon: HardHat, permission: null },
  { to: '/urd', label: 'URD / Old Gold', icon: Gem, permission: null },
  { to: '/payments', label: 'Payments', icon: CircleDollarSign, permission: null },
  { to: '/ledger/master', label: 'Ledger Master', icon: BookOpen, permission: null },
  { to: '/reports', label: 'Reports', icon: FileBarChart, permission: 'REPORTS_VIEW' },
  { to: '/settings', label: 'Settings', icon: Settings, permission: 'SETTINGS_MANAGE' },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, logout } = useAuthStore();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const filteredItems = navItems.filter(item => {
    if (!item.permission) return true;
    return user?.permissions?.includes(item.permission) || user?.role === 'SUPER_ADMIN' || user?.role === 'OWNER';
  });

  return (
    <>
      <aside
        className={`${collapsed ? 'w-16' : 'w-60'} flex-shrink-0 flex flex-col bg-white border-r border-gray-200 transition-[width] duration-200 ease-in-out relative`}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 min-w-0 w-full">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
              <Diamond className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold text-gray-900 truncate">Jewellery ERP</h1>
                <p className="text-xs text-gray-500 truncate">POS System</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.to) && item.to !== '/dashboard'
              ? location.pathname.startsWith(item.to)
              : location.pathname === item.to;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User & Logout */}
        <div className="border-t border-gray-200 p-4 overflow-hidden">
          {!collapsed && user && (
            <div className="mb-3 px-1">
              <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate capitalize">{user.role.replace('_', ' ')}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Floating toggle handle — always visible, sits on the sidebar edge */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute top-[60px] z-40 flex items-center justify-center w-6 h-10 rounded-r-lg bg-white border border-l-0 border-gray-200 shadow-sm text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors cursor-pointer"
        style={{ left: collapsed ? '56px' : '232px' }}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </>
  );
}

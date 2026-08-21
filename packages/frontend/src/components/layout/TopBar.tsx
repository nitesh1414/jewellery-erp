import { useNavigate } from 'react-router-dom';
import { Search, Bell, Plus, ChevronDown, KeyRound } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';

export function TopBar() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchQuery, setSearchQuery] = useState('');
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  // Subscription chip — only rendered inside the Electron desktop app
  // (window.desktopBridge is exposed by the desktop shell's preload script).
  const [licenseChip, setLicenseChip] = useState<{ days: number | null; plan: string } | null>(null);

  useEffect(() => {
    const bridge = (window as any).desktopBridge;
    if (!bridge?.getLicenseStatus) return;
    bridge
      .getLicenseStatus()
      .then((s: any) => {
        if (s?.valid && s.license) {
          setLicenseChip({ days: s.license.daysRemaining ?? null, plan: s.license.planType });
        }
      })
      .catch(() => undefined);
  }, []);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowQuickMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const quickActions = [
    { label: 'New Bill', action: () => navigate('/billing'), icon: '🧾' },
    { label: 'Add Customer', action: () => navigate('/customers'), icon: '👤' },
    { label: 'New Purchase', action: () => navigate('/purchases'), icon: '📦' },
    { label: 'New Job Order', action: () => navigate('/job-orders'), icon: '🔧' },
    { label: 'Receive Payment', action: () => navigate('/payments'), icon: '💰' },
    { label: 'Generate Barcode', action: () => navigate('/barcodes'), icon: '🏷️' },
  ];

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4 flex-1">
        {/* Search */}
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search bills, barcodes, customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                // Global search - navigate to search results
                navigate(`/bills?search=${encodeURIComponent(searchQuery.trim())}`);
                setSearchQuery('');
              }
            }}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {licenseChip && (
          <span
            className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              licenseChip.days !== null && licenseChip.days <= 15
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}
            title={`Subscription: ${licenseChip.plan}`}
          >
            <KeyRound size={12} />
            {licenseChip.days === null ? 'Lifetime license' : `License: ${licenseChip.days}d left`}
          </span>
        )}
        {/* Quick Actions */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowQuickMenu(!showQuickMenu)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Quick Actions</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showQuickMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
              {quickActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => { action.action(); setShowQuickMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-lg">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900 leading-tight">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.branchId ? 'Main Branch' : 'Head Office'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
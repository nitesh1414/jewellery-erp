import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { KeyRound, LayoutDashboard, LogOut, Gem } from 'lucide-react';
import { setToken } from '../api';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/subscriptions', label: 'Subscriptions', icon: KeyRound },
];

export default function Layout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-gray-900 text-gray-200 flex flex-col">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-gray-800">
          <span className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
            <Gem size={16} className="text-white" />
          </span>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">License Admin</div>
            <div className="text-[11px] text-gray-400">Jewellery ERP Cloud</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-gray-800 text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                }`
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => {
            setToken(null);
            navigate('/login');
          }}
          className="m-3 flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ShoppingCart, UserPlus, ShoppingBag, FileText, Briefcase, Hammer, X } from 'lucide-react';

const actions = [
  { label: 'New Bill', icon: ShoppingCart, path: '/billing', color: 'bg-blue-600' },
  { label: 'Add Customer', icon: UserPlus, path: '/customers', color: 'bg-purple-600' },
  { label: 'New Purchase', icon: ShoppingBag, path: '/purchases', color: 'bg-orange-600' },
  { label: 'Job Work Out', icon: Hammer, path: '/job-work', color: 'bg-emerald-600' },
  { label: 'New Estimate', icon: FileText, path: '/billing', color: 'bg-indigo-600' },
];

export function QuickActionFAB() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Keyboard: Alt+N to open quick action
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'n') { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <>
      {/* Floating Action Button (legacy-style bottom-right) */}
      <button
        onClick={() => setOpen(!open)}
        title="Quick Actions (Alt+N)"
        className={'fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg transition-all flex items-center justify-center text-white ' +
          (open ? 'bg-red-600 hover:bg-red-700 rotate-45' : 'bg-primary-600 hover:bg-primary-700')}
      >
        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>

      {/* Quick actions menu */}
      {open && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setOpen(false)} />
          <div className="fixed bottom-24 right-6 z-40 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 w-56">
            <div className="px-3 py-2 border-b border-gray-100 mb-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quick Actions</p>
              <p className="text-[10px] text-gray-400">Press <kbd className="bg-gray-100 px-1 rounded">Alt+N</kbd> · <kbd className="bg-gray-100 px-1 rounded">Esc</kbd> to close</p>
            </div>
            {actions.map((a, i) => {
              const Icon = a.icon;
              return (
                <button
                  key={i}
                  onClick={() => { navigate(a.path); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <div className={'w-7 h-7 rounded-md flex items-center justify-center text-white ' + a.color}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {a.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

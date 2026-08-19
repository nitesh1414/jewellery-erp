import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { TopNav } from './TopNav';
import { QuickActionFAB } from '../QuickActionFAB';
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp';
import { useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../services/api';

// Scroll to top on route change (legacy software behavior)
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

// First-time install: if setup not completed and user is on app routes, redirect to /setup.
function SetupRedirect() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (!isAuth) return;
    // Skip check on the setup page itself, login, or print views.
    if (pathname.startsWith('/setup') || pathname.startsWith('/login') || pathname.startsWith('/print')) return;
    api.get('/settings/setup/status')
      .then((s: any) => {
        if (s && s.setupCompleted === false) {
          navigate('/setup', { replace: true });
        }
      })
      .catch(() => null);
  }, [pathname, isAuth, navigate]);
  return null;
}

export function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-[#faf9f7]">
      <TopNav />
      <ScrollToTop />
      <SetupRedirect />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
      <QuickActionFAB />
      <KeyboardShortcutsHelp />
    </div>
  );
}

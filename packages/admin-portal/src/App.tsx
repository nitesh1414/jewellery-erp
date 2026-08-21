import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './api';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import SubscriptionDetailPage from './pages/SubscriptionDetailPage';

function Protected({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Navigate to="/subscriptions" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="subscriptions/:id" element={<SubscriptionDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/subscriptions" replace />} />
      </Routes>
    </HashRouter>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { AppLayout } from '../../components/layout/AppLayout';
import LoginPage from '../../modules/auth/LoginPage';
import DashboardPage from '../../modules/dashboard/DashboardPage';
import BillingPage from '../../modules/billing/BillingPage';
import CustomersPage from '../../modules/customers/CustomersPage';
import CustomerDetailPage from '../../modules/customers/CustomerDetailPage';
import InventoryPage from '../../modules/inventory/InventoryPage';
import JewelleryPage from '../../modules/jewellery/JewelleryPage';
import BarcodesPage from '../../modules/barcodes/BarcodesPage';
import JobOrdersPage from '../../modules/job-orders/JobOrdersPage';
import JobOrderDetailPage from '../../modules/job-orders/JobOrderDetailPage';
import ReportsPage from '../../modules/reports/ReportsPage';
import PurchasesPage from '../../modules/purchases/PurchasesPage';
import SuppliersPage from '../../modules/suppliers/SuppliersPage';
import UrdPage from '../../modules/urd/UrdPage';
import PaymentsPage from '../../modules/payments/PaymentsPage';
import SettingsPage from '../../modules/settings/SettingsPage';
import BillsPage from '../../modules/billing/BillsPage';
import SalePrintPage from '../../modules/billing/SalePrintPage';
import CustomerPrintPage from '../../modules/customers/CustomerPrintPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Tauri runtime detection — switch backend URL
const apiBase = window.location.protocol === 'tauri:' ? 'http://127.0.0.1:3001' : '/api';

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage apiBase={apiBase} />} />

      <Route path="/print/sale/:id" element={<ProtectedRoute><SalePrintPage /></ProtectedRoute>} />
      <Route path="/print/customer/:id" element={<ProtectedRoute><CustomerPrintPage /></ProtectedRoute>} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage apiBase={apiBase} />} />
        <Route path="billing" element={<BillingPage apiBase={apiBase} />} />
        <Route path="bills" element={<BillsPage apiBase={apiBase} />} />
        <Route path="customers" element={<CustomersPage apiBase={apiBase} />} />
        <Route path="customers/:id" element={<CustomerDetailPage apiBase={apiBase} />} />
        <Route path="inventory" element={<InventoryPage apiBase={apiBase} />} />
        <Route path="jewellery" element={<JewelleryPage apiBase={apiBase} />} />
        <Route path="barcodes" element={<BarcodesPage apiBase={apiBase} />} />
        <Route path="job-orders" element={<JobOrdersPage apiBase={apiBase} />} />
        <Route path="job-orders/:id" element={<JobOrderDetailPage apiBase={apiBase} />} />
        <Route path="purchases" element={<PurchasesPage apiBase={apiBase} />} />
        <Route path="suppliers" element={<SuppliersPage apiBase={apiBase} />} />
        <Route path="urd" element={<UrdPage apiBase={apiBase} />} />
        <Route path="payments" element={<PaymentsPage apiBase={apiBase} />} />
        <Route path="reports" element={<ReportsPage apiBase={apiBase} />} />
        <Route path="settings" element={<SettingsPage apiBase={apiBase} />} />
      </Route>
    </Routes>
  );
}

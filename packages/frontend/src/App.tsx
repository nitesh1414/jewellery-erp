import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AppLayout } from './components/layout/AppLayout';
import LoginPage from './modules/auth/LoginPage';
import SetupWizardPage from './modules/setup/SetupWizardPage';
import DashboardPage from './modules/dashboard/DashboardPage';
import BillingPage from './modules/billing/BillingPage';
import CustomersPage from './modules/customers/CustomersPage';
import CustomerDetailPage from './modules/customers/CustomerDetailPage';
import InventoryPage from './modules/inventory/InventoryPage';
import JewelleryPage from './modules/jewellery/JewelleryPage';
import BarcodesPage from './modules/barcodes/BarcodesPage';
import JobOrdersPage from './modules/job-orders/JobOrdersPage';
import JobOrderDetailPage from './modules/job-orders/JobOrderDetailPage';
import ReportsPage from './modules/reports/ReportsPage';
import PurchasesPage from './modules/purchases/PurchasesPage';
import SuppliersPage from './modules/suppliers/SuppliersPage';
import UrdPage from './modules/urd/UrdPage';
import PaymentsPage from './modules/payments/PaymentsPage';
import SettingsPage from './modules/settings/SettingsPage';
import BillsPage from './modules/billing/BillsPage';
import SalePrintPage from './modules/billing/SalePrintPage';
import CustomerPrintPage from './modules/customers/CustomerPrintPage';
import AccountsPage from './modules/ledger/AccountsPage';
import EntriesPage from './modules/ledger/EntriesPage';
import ExpensesPage from './modules/expenses/ExpensesPage';
import IncomePage from './modules/income/IncomePage';
import UsersPage from './modules/users/UsersPage';
import BranchesPage from './modules/branches/BranchesPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />

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
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="bills" element={<BillsPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="jewellery" element={<JewelleryPage />} />
        <Route path="barcodes" element={<BarcodesPage />} />
        <Route path="job-orders" element={<JobOrdersPage />} />
        <Route path="job-orders/:id" element={<JobOrderDetailPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="urd" element={<UrdPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="ledger/accounts" element={<AccountsPage />} />
        <Route path="ledger/entries" element={<EntriesPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="income" element={<IncomePage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="setup" element={<SetupWizardPage />} />
      </Route>
    </Routes>
  );
}

import axios, { AxiosInstance } from 'axios';
import { getActiveBranchId } from '../stores/branchStore';

const API_BASE = '/api';

class ApiService {
  private client: AxiosInstance;
  private refreshPromise: Promise<any> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // Multi-branch support: scope the request to the active branch.
      const branchId = getActiveBranchId();
      if (branchId) {
        config.headers['x-branch-id'] = branchId;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) throw new Error('No refresh token');

            if (!this.refreshPromise) {
              this.refreshPromise = this.client.post('/auth/refresh', { refreshToken });
            }

            const { data } = await this.refreshPromise;
            localStorage.setItem('accessToken', data.accessToken);
            this.refreshPromise = null;

            originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
            return this.client(originalRequest);
          } catch {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Generic helpers
  async get<T = any>(url: string, params?: any): Promise<T> {
    const { data } = await this.client.get(url, { params });
    return data;
  }

  async post<T = any>(url: string, body?: any): Promise<T> {
    const { data } = await this.client.post(url, body);
    return data;
  }

  async put<T = any>(url: string, body?: any): Promise<T> {
    const { data } = await this.client.put(url, body);
    return data;
  }

  async delete<T = any>(url: string, params?: any): Promise<T> {
    const { data } = await this.client.delete(url, { params });
    return data;
  }

  // Auth
  async login(email: string, password: string, branchId?: string) {
    const { data } = await this.client.post('/auth/login', { email, password, branchId });
    return data;
  }

  // Dashboard
  async getDashboard() {
    const { data } = await this.client.get('/dashboard');
    return data;
  }

  // Customers
  async getCustomers(params?: any) {
    const { data } = await this.client.get('/customers', { params });
    return data;
  }

  async createCustomer(body: any) {
    const { data } = await this.client.post('/customers', body);
    return data;
  }

  async getCustomer(id: string) {
    const { data } = await this.client.get(`/customers/${id}`);
    return data;
  }

  async updateCustomer(id: string, body: any) {
    const { data } = await this.client.put(`/customers/${id}`, body);
    return data;
  }

  async deleteCustomer(id: string) {
    const { data } = await this.client.delete(`/customers/${id}`);
    return data;
  }

  // Customer Ledger
  async getCustomerLedger(customerId: string, params?: any) {
    const { data } = await this.client.get(`/customers/${customerId}/ledger`, { params });
    return data;
  }
  // Sales / Billing
  async getSales(params?: any) {
    const { data } = await this.client.get('/sales', { params });
    return data;
  }

  async getSale(id: string) {
    const { data } = await this.client.get(`/sales/${id}`);
    return data;
  }

  async createSale(body: any) {
    const { data } = await this.client.post('/sales', body);
    return data;
  }

  async cancelSale(id: string, reason: string) {
    const { data } = await this.client.post(`/sales/${id}/cancel`, { reason });
    return data;
  }

  async getTodaySales() {
    const { data } = await this.client.get('/sales/today');
    return data;
  }

  // Jewellery Items
  async getJewelleryItems(params?: any) {
    const { data } = await this.client.get('/jewellery', { params });
    return data;
  }

  async getJewelleryByBarcode(barcode: string) {
    const { data } = await this.client.get(`/jewellery/barcode/${barcode}`);
    return data;
  }

  async createJewelleryItem(body: any) {
    const { data } = await this.client.post('/jewellery', body);
    return data;
  }

  // Inventory
  async getInventorySummary() {
    const { data } = await this.client.get('/inventory/summary');
    return data;
  }

  async getInventoryStock() {
    const { data } = await this.client.get('/inventory/stock');
    return data;
  }

  async getStockTransactions(params?: any) {
    const { data } = await this.client.get('/inventory/transactions', { params });
    return data;
  }

  async getLowStockAlerts() {
    const { data } = await this.client.get('/inventory/low-stock');
    return data;
  }

  // Barcodes
  async getBarcodes(params?: any) {
    const { data } = await this.client.get('/barcodes', { params });
    return data;
  }

  async generateBarcodes(count: number) {
    const { data } = await this.client.post('/barcodes/generate', { count });
    return data;
  }

  // Purchases
  async getPurchases(params?: any) {
    const { data } = await this.client.get('/purchases', { params });
    return data;
  }

  async getPurchase(id: string) {
    const { data } = await this.client.get('/purchases/' + id);
    return data;
  }

  async createPurchase(body: any) {
    const { data } = await this.client.post('/purchases', body);
    return data;
  }

  async updatePurchase(id: string, body: any) {
    const { data } = await this.client.put('/purchases/' + id, body);
    return data;
  }

  // Job Orders
  async getJobOrders(params?: any) {
    const { data } = await this.client.get('/job-orders', { params });
    return data;
  }

  async addJobAdvance(id: string, body: { amount: number; paymentMode?: string; reference?: string }) {
    const { data } = await this.client.post(`/job-orders/${id}/advance`, body);
    return data;
  }

  async generateJobFinalBill(id: string, body: any) {
    const { data } = await this.client.post(`/job-orders/${id}/final-bill`, body);
    return data;
  }

  async addSalePayment(id: string, body: { amount: number; paymentMode: string; reference?: string }) {
    const { data } = await this.client.post(`/sales/${id}/payment`, body);
    return data;
  }


  async getJobOrderStats() {
    const { data } = await this.client.get('/job-orders/stats/overview');
    return data;
  }

  async getJobOrder(id: string) {
    const { data } = await this.client.get(`/job-orders/${id}`);
    return data;
  }

  async createJobOrder(body: any) {
    const { data } = await this.client.post('/job-orders', body);
    return data;
  }

  async getMyJobs() {
    const { data } = await this.client.get('/job-orders/my-jobs');
    return data;
  }

  // Suppliers
  async getSuppliers(params?: any) {
    const { data } = await this.client.get('/suppliers', { params });
    return data;
  }

  async createSupplier(body: any) {
    const { data } = await this.client.post('/suppliers', body);
    return data;
  }

  // URD
  async getUrdTransactions(params?: any) {
    const { data } = await this.client.get('/urd', { params });
    return data;
  }

  async getUrd(id: string) {
    const { data } = await this.client.get('/urd/' + id);
    return data;
  }

  async createUrd(body: any) {
    const { data } = await this.client.post('/urd', body);
    return data;
  }

  async updateUrd(id: string, body: any) {
    const { data } = await this.client.put('/urd/' + id, body);
    return data;
  }

  // Payments
  async getPayments(params?: any) {
    const { data } = await this.client.get('/payments', { params });
    return data;
  }

  async createPayment(body: any) {
    const { data } = await this.client.post('/payments', body);
    return data;
  }

  // Rates
  async getRates() {
    const { data } = await this.client.get('/rates');
    return data;
  }

  async updateRate(id: string, rate: number) {
    const { data } = await this.client.put(`/rates/${id}`, { rate });
    return data;
  }

  // Reports
  async getSalesReport(params?: any) {
    const { data } = await this.client.get('/reports/sales', { params });
    return data;
  }

  async getHsnSummary(params?: any) {
    const { data } = await this.client.get('/reports/hsn', { params });
    return data;
  }

  async getInventoryReport() {
    const { data } = await this.client.get('/reports/inventory');
    return data;
  }

  async getJobWorkReport(params?: any) {
    const { data } = await this.client.get('/reports/job-work', { params });
    return data;
  }

  // Settings
  async getSettings() {
    const { data } = await this.client.get('/settings');
    return data;
  }

  async updateSettings(body: any) {
    const { data } = await this.client.put('/settings', body);
    return data;
  }

  // Profile
  async getProfile() {
    const { data } = await this.client.get('/auth/profile');
    return data;
  }

  // ====== Ledger Accounts (cash/bank) ======
  async getAccounts() {
    const { data } = await this.client.get('/ledger/accounts');
    return data;
  }

  async createAccount(body: any) {
    const { data } = await this.client.post('/ledger/accounts', body);
    return data;
  }

  async updateAccount(id: string, body: any) {
    const { data } = await this.client.put('/ledger/accounts/' + id, body);
    return data;
  }

  async deleteAccount(id: string) {
    const { data } = await this.client.delete('/ledger/accounts/' + id);
    return data;
  }

  // ====== Credit / Debit Entries ======
  async getEntries(params?: any) {
    const { data } = await this.client.get('/ledger/entries', { params });
    return data;
  }

  async createEntry(body: any) {
    const { data } = await this.client.post('/ledger/entries', body);
    return data;
  }

  async deleteEntry(id: string) {
    const { data } = await this.client.delete('/ledger/entries/' + id);
    return data;
  }

  // ====== Expenses ======
  async getExpenses(params?: any) {
    const { data } = await this.client.get('/ledger/expenses', { params });
    return data;
  }

  async createExpense(body: any) {
    const { data } = await this.client.post('/ledger/expenses', body);
    return data;
  }

  async deleteExpense(id: string) {
    const { data } = await this.client.delete('/ledger/expenses/' + id);
    return data;
  }

  // ====== Income (Non-Sale) ======
  async getIncome(params?: any) {
    const { data } = await this.client.get('/ledger/income', { params });
    return data;
  }

  async createIncome(body: any) {
    const { data } = await this.client.post('/ledger/income', body);
    return data;
  }

  async deleteIncome(id: string) {
    const { data } = await this.client.delete('/ledger/income/' + id);
    return data;
  }

  // ====== Users ======
  async getUsers(params?: any) {
    const { data } = await this.client.get('/users', { params });
    return data;
  }

  async createUser(body: any) {
    const { data } = await this.client.post('/users', body);
    return data;
  }

  async updateUser(id: string, body: any) {
    const { data } = await this.client.put('/users/' + id, body);
    return data;
  }

  async deleteUser(id: string) {
    const { data } = await this.client.delete('/users/' + id);
    return data;
  }

  // ====== Roles & Permissions ======
  async getRoles() {
    const { data } = await this.client.get('/roles');
    return data;
  }

  async getRole(id: string) {
    const { data } = await this.client.get('/roles/' + id);
    return data;
  }

  async getPermissionCatalog() {
    const { data } = await this.client.get('/roles/catalog');
    return data;
  }

  async createRole(body: any) {
    const { data } = await this.client.post('/roles', body);
    return data;
  }

  async updateRole(id: string, body: any) {
    const { data } = await this.client.put('/roles/' + id, body);
    return data;
  }

  async deleteRole(id: string) {
    const { data } = await this.client.delete('/roles/' + id);
    return data;
  }

  // ====== Branches ======
  async getBranches() {
    const { data } = await this.client.get('/branches');
    return data;
  }

  async createBranch(body: any) {
    const { data } = await this.client.post('/branches', body);
    return data;
  }

  async updateBranch(id: string, body: any) {
    const { data } = await this.client.put('/branches/' + id, body);
    return data;
  }

  async deleteBranch(id: string) {
    const { data } = await this.client.delete('/branches/' + id);
    return data;
  }

  // ====== Workers (employees) master + payments ======
  async getWorkers(params?: any) {
    const { data } = await this.client.get('/employees', { params });
    return data;
  }

  async getWorker(id: string) {
    const { data } = await this.client.get('/employees/' + id);
    return data;
  }

  async createWorker(body: any) {
    const { data } = await this.client.post('/employees', body);
    return data;
  }

  async updateWorker(id: string, body: any) {
    const { data } = await this.client.put('/employees/' + id, body);
    return data;
  }

  async deleteWorker(id: string) {
    const { data } = await this.client.delete('/employees/' + id);
    return data;
  }

  async addWorkerPayment(id: string, body: any) {
    const { data } = await this.client.post(`/employees/${id}/payments`, body);
    return data;
  }

  async getWorkerPayments(params?: any) {
    const { data } = await this.client.get('/employees/payments', { params });
    return data;
  }

  // ====== Ornament (ledger) master ======
  async getOrnaments(params?: any) {
    const { data } = await this.client.get('/ornaments', { params });
    return data;
  }

  async createOrnament(body: any) {
    const { data } = await this.client.post('/ornaments', body);
    return data;
  }

  async updateOrnament(id: string, body: any) {
    const { data } = await this.client.put('/ornaments/' + id, body);
    return data;
  }

  async deleteOrnament(id: string) {
    const { data } = await this.client.delete('/ornaments/' + id);
    return data;
  }

  // ====== Settings: hallmarks ======
  async addHallmark(body: any) {
    const { data } = await this.client.post('/settings/hallmarks', body);
    return data;
  }

  async updateHallmark(id: string, body: any) {
    const { data } = await this.client.put(`/settings/hallmarks/${id}`, body);
    return data;
  }

  async deleteHallmark(id: string) {
    const { data } = await this.client.delete(`/settings/hallmarks/${id}`);
    return data;
  }

  // ====== Setup wizard ======
  async getSetupStatus() {
    const { data } = await this.client.get('/settings/setup/status');
    return data;
  }

  async completeSetup(body: any) {
    const { data } = await this.client.post('/settings/setup/complete', body);
    return data;
  }

  async seedDefaultAccounts(body: any) {
    const { data } = await this.client.post('/settings/setup/seed-accounts', body);
    return data;
  }
}

export const api = new ApiService();
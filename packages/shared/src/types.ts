// ============================
// SHARED TYPES — Jewellery ERP
// ============================

import {
  MetalType,
  Purity,
  JewelleryStatus,
  MakingChargeType,
  ChargeType,
  BillType,
  BillStatus,
  PaymentMode,
  TransactionType,
  JobStatus,
  RepairStatus,
  NotificationType,
  NotificationChannel,
} from './enums';

// --- Auth ---
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
  branchId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  branchId?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId: string;
  branchId?: string;
  permissions: string[];
}

// --- Organization ---
export interface Organization {
  id: string;
  name: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pin?: string;
  phone?: string;
  email?: string;
  logo?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Branch ---
export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  pin?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Customer ---
export interface Customer {
  id: string;
  organizationId: string;
  branchId?: string;
  customerId: string;
  name: string;
  mobile?: string;
  alternateMobile?: string;
  address?: string;
  city?: string;
  state?: string;
  pin?: string;
  gstin?: string;
  email?: string;
  notes?: string;
  isActive: boolean;
  registrationDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerLedgerEntry {
  id: string;
  customerId: string;
  transactionType: string;
  transactionId: string;
  transactionNo: string;
  date: string;
  debit: number;
  credit: number;
  balance: number;
  description?: string;
  createdAt: string;
}

export interface CustomerAdvance {
  id: string;
  customerId: string;
  amount: number;
  balance: number;
  paymentMode: PaymentMode;
  reference: string;
  notes?: string;
  date: string;
  employeeId?: string;
  createdAt: string;
}

// --- Supplier ---
export interface Supplier {
  id: string;
  organizationId: string;
  branchId?: string;
  name: string;
  mobile?: string;
  address?: string;
  gstin?: string;
  contact?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierLedgerEntry {
  id: string;
  supplierId: string;
  transactionType: string;
  transactionId: string;
  date: string;
  debit: number;
  credit: number;
  balance: number;
  description?: string;
}

// --- Product ---
export interface Product {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  categoryId?: string;
  subCategoryId?: string;
  designCode: string;
  metalType: MetalType;
  purity: Purity;
  hsnCode: string;
  defaultMakingChargeType?: MakingChargeType;
  defaultMakingChargeValue?: number;
  image?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  organizationId: string;
  name: string;
  parentId?: string;
  isActive: boolean;
}

// --- Jewellery Item ---
export interface JewelleryItem {
  id: string;
  organizationId: string;
  branchId: string;
  barcode: string;
  sku: string;
  productId: string;
  category?: string;
  subCategory?: string;
  designCode: string;
  metalType: MetalType;
  purity: Purity;
  grossWeight: number;
  stoneWeight: number;
  otherWeight: number;
  netWeight: number;
  quantity: number;
  size?: string;
  color?: string;
  brand?: string;
  purchaseRate: number;
  currentRate: number;
  makingChargeType: MakingChargeType;
  makingChargeValue: number;
  hallmarkNumber?: string;
  certificateNumber?: string;
  hsnCode: string;
  status: JewelleryStatus;
  location?: string;
  supplierId?: string;
  purchaseId?: string;
  purchaseDate?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Barcode ---
export interface Barcode {
  id: string;
  organizationId: string;
  branchId: string;
  barcode: string;
  jewelleryItemId?: string;
  isAssigned: boolean;
  isActive: boolean;
  printedCount: number;
  lastPrintedAt?: string;
  createdAt: string;
}

// --- Rate ---
export interface RateMaster {
  id: string;
  organizationId: string;
  metalType: MetalType;
  purity: Purity;
  rate: number;
  effectiveDate: string;
  createdAt: string;
}

export interface RateHistory {
  id: string;
  rateMasterId: string;
  metalType: MetalType;
  purity: Purity;
  rate: number;
  effectiveDate: string;
  changedAt: string;
}

// --- Sale / Bill ---
export interface Sale {
  id: string;
  organizationId: string;
  branchId: string;
  billNumber: string;
  billType: BillType;
  status: BillStatus;
  customerId?: string;
  customerName: string;
  customerMobile?: string;
  customerGstin?: string;
  customerAddress?: string;
  billDate: string;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  discount: number;
  discountType: string;
  urdDeduction: number;
  roundOff: number;
  grossAmount: number;
  netAmount: number;
  paidAmount: number;
  balanceAmount: number;
  paymentMode?: PaymentMode;
  salesmanId?: string;
  narration?: string;
  electronicReference?: string;
  isGst: boolean;
  createdAt: string;
  updatedAt: string;
  items: SaleItem[];
  payments: SalePayment[];
}

export interface SaleItem {
  id: string;
  saleId: string;
  jewelleryItemId?: string;
  barcode?: string;
  particular: string;
  hsnCode: string;
  purity: Purity;
  quantity: number;
  grossWeight: number;
  netWeight: number;
  ratePerGram: number;
  metalValue: number;
  makingCharges: number;
  chargeDetails: ChargeDetail[];
  hallMarkAmount: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  urd: number;
  urdDocNumber?: string;
  totalAmount: number;
  sortOrder: number;
}

export interface ChargeDetail {
  type: ChargeType;
  calculationType: MakingChargeType;
  value: number;
  amount: number;
}

export interface SalePayment {
  id: string;
  saleId: string;
  amount: number;
  paymentMode: PaymentMode;
  reference?: string;
  date: string;
  employeeId?: string;
  notes?: string;
}

// --- Purchase ---
export interface Purchase {
  id: string;
  organizationId: string;
  branchId: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  metalType: MetalType;
  purity: Purity;
  grossWeight: number;
  netWeight: number;
  quantity: number;
  rate: number;
  amount: number;
  makingCharges: number;
  stoneCharges: number;
  otherCharges: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  notes?: string;
  createdAt: string;
}

// --- URD / Old Metal ---
export interface UrdTransaction {
  id: string;
  organizationId: string;
  branchId: string;
  urdNumber: string;
  customerId?: string;
  customerName: string;
  metalType: MetalType;
  purity: Purity;
  grossWeight: number;
  stoneWeight: number;
  netWeight: number;
  rate: number;
  value: number;
  deduction: number;
  meltingLoss: number;
  finalValue: number;
  paymentMode?: PaymentMode;
  referenceBillId?: string;
  notes?: string;
  status: string;
  createdAt: string;
}

// --- Job Order ---
export interface JobOrder {
  id: string;
  organizationId: string;
  branchId: string;
  jobNumber: string;
  customerId?: string;
  customerName: string;
  customerMobile?: string;
  productDescription: string;
  purity: Purity;
  metalType: MetalType;
  expectedWeight: number;
  expectedDelivery: string;
  estimatedAmount: number;
  advanceAmount: number;
  balanceAmount: number;
  status: JobStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  assignments: JobAssignment[];
}

export interface JobAssignment {
  id: string;
  jobOrderId: string;
  employeeId: string;
  employeeName: string;
  assignedAt: string;
  dueDate: string;
  status: JobStatus;
  notes?: string;
}

export interface JobMaterialIssue {
  id: string;
  jobOrderId: string;
  jobAssignmentId: string;
  employeeId: string;
  metalType: MetalType;
  purity: Purity;
  weight: number;
  quantity: number;
  issuedDate: string;
  issuedById: string;
  notes?: string;
}

export interface JobMaterialReturn {
  id: string;
  jobOrderId: string;
  jobAssignmentId: string;
  materialIssueId: string;
  weight: number;
  difference: number;
  wastage: number;
  approvedWastage: number;
  excessWastage: number;
  returnDate: string;
  notes?: string;
}

// --- Payment ---
export interface Payment {
  id: string;
  organizationId: string;
  branchId: string;
  transactionId: string;
  customerId?: string;
  supplierId?: string;
  amount: number;
  paymentMode: PaymentMode;
  reference?: string;
  date: string;
  employeeId?: string;
  relatedTransactionId?: string;
  relatedTransactionType?: string;
  notes?: string;
  createdAt: string;
}

// --- Tax ---
export interface HsnCode {
  id: string;
  code: string;
  description: string;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  isActive: boolean;
}

// --- Notification ---
export interface Notification {
  id: string;
  organizationId: string;
  branchId?: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  message: string;
  recipientId?: string;
  recipientMobile?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  error?: string;
  createdAt: string;
}

// --- Settings ---
export interface ShopSettings {
  id: string;
  organizationId: string;
  shopName: string;
  shopAddress?: string;
  shopCity?: string;
  shopState?: string;
  shopPin?: string;
  shopPhone?: string;
  shopEmail?: string;
  shopGstin?: string;
  logo?: string;
  invoicePrefix: string;
  invoiceSuffix: string;
  nextBillNumber: number;
  defaultGstRate: number;
  defaultCgstRate: number;
  defaultSgstRate: number;
  weightPrecision: number;
  amountPrecision: number;
  currency: string;
  timezone: string;
}

// --- Audit Log ---
export interface AuditLog {
  id: string;
  organizationId: string;
  branchId?: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

// --- Employee ---
export interface Employee {
  id: string;
  organizationId: string;
  branchId?: string;
  employeeCode: string;
  name: string;
  mobile?: string;
  email?: string;
  role: string;
  department?: string;
  designation?: string;
  salary?: number;
  isActive: boolean;
  joinedAt: string;
  userId?: string;
  createdAt: string;
}

// --- Repair ---
export interface Repair {
  id: string;
  organizationId: string;
  branchId: string;
  repairId: string;
  customerId?: string;
  customerName: string;
  jewelleryItemId?: string;
  barcode?: string;
  problem: string;
  receivedDate: string;
  expectedDate?: string;
  assignedEmployeeId?: string;
  estimatedCharge: number;
  advance: number;
  status: RepairStatus;
  deliveryDate?: string;
  notes?: string;
  createdAt: string;
}
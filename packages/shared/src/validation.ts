import { z } from 'zod';
import { MetalType, Purity, MakingChargeType, ChargeType, BillType, PaymentMode, JobStatus } from './enums';

// --- Customer ---
export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  mobile: z.string().regex(/^[0-9]{10}$/, 'Invalid mobile number').optional().or(z.literal('')),
  alternateMobile: z.string().regex(/^[0-9]{10}$/, 'Invalid mobile number').optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(100).optional().or(z.literal('')),
  pin: z.string().max(10).optional().or(z.literal('')),
  gstin: z.string().max(15).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

// --- Sale Item ---
export const saleItemSchema = z.object({
  jewelleryItemId: z.string().optional(),
  barcode: z.string().optional(),
  particular: z.string().min(1, 'Item description required'),
  hsnCode: z.string().min(4, 'HSN code required'),
  purity: z.nativeEnum(Purity),
  quantity: z.number().positive(),
  grossWeight: z.number().nonnegative(),
  netWeight: z.number().nonnegative(),
  ratePerGram: z.number().nonnegative(),
  metalValue: z.number().nonnegative(),
  makingCharges: z.number().nonnegative().default(0),
  chargeDetails: z.array(z.object({
    type: z.nativeEnum(ChargeType),
    calculationType: z.nativeEnum(MakingChargeType),
    value: z.number().nonnegative(),
    amount: z.number().nonnegative(),
  })).default([]),
  hallMarkAmount: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  urd: z.number().nonnegative().default(0),
  urdDocNumber: z.string().optional().or(z.literal('')),
  sortOrder: z.number().int().nonnegative().default(0),
});

// --- Sale ---
export const createSaleSchema = z.object({
  billType: z.nativeEnum(BillType),
  customerId: z.string().optional(),
  customerName: z.string().min(1, 'Customer name required'),
  customerMobile: z.string().optional().or(z.literal('')),
  customerGstin: z.string().optional().or(z.literal('')),
  customerAddress: z.string().optional().or(z.literal('')),
  billDate: z.string().optional(),
  items: z.array(saleItemSchema).min(1, 'At least one item required'),
  discount: z.number().nonnegative().default(0),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).default('FIXED'),
  urdDeduction: z.number().nonnegative().default(0),
  payments: z.array(z.object({
    amount: z.number().positive(),
    paymentMode: z.nativeEnum(PaymentMode),
    reference: z.string().optional().or(z.literal('')),
  })).optional(),
  salesmanId: z.string().optional(),
  narration: z.string().max(500).optional().or(z.literal('')),
  electronicReference: z.string().optional().or(z.literal('')),
  isGst: z.boolean().default(true),
});

// --- Purchase ---
export const createPurchaseSchema = z.object({
  supplierId: z.string().min(1, 'Supplier required'),
  invoiceNumber: z.string().min(1, 'Invoice number required'),
  invoiceDate: z.string().min(1, 'Invoice date required'),
  metalType: z.nativeEnum(MetalType),
  purity: z.nativeEnum(Purity),
  grossWeight: z.number().nonnegative(),
  netWeight: z.number().nonnegative(),
  quantity: z.number().nonnegative().default(1),
  rate: z.number().nonnegative(),
  makingCharges: z.number().nonnegative().default(0),
  stoneCharges: z.number().nonnegative().default(0),
  otherCharges: z.number().nonnegative().default(0),
  cgst: z.number().nonnegative().default(0),
  sgst: z.number().nonnegative().default(0),
  igst: z.number().nonnegative().default(0),
  paidAmount: z.number().nonnegative().default(0),
  notes: z.string().max(500).optional().or(z.literal('')),
});

// --- Job Order ---
export const createJobOrderSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().min(1, 'Customer name required'),
  customerMobile: z.string().optional().or(z.literal('')),
  productDescription: z.string().min(1, 'Product description required'),
  purity: z.nativeEnum(Purity),
  metalType: z.nativeEnum(MetalType),
  expectedWeight: z.number().nonnegative(),
  expectedDelivery: z.string().min(1, 'Expected delivery date required'),
  estimatedAmount: z.number().nonnegative(),
  advanceAmount: z.number().nonnegative().default(0),
  notes: z.string().max(500).optional().or(z.literal('')),
});

// --- URD ---
export const createUrdSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().min(1, 'Customer name required'),
  metalType: z.nativeEnum(MetalType),
  purity: z.nativeEnum(Purity),
  grossWeight: z.number().positive(),
  stoneWeight: z.number().nonnegative().default(0),
  netWeight: z.number().positive(),
  rate: z.number().positive(),
  deduction: z.number().nonnegative().default(0),
  meltingLoss: z.number().nonnegative().default(0),
  paymentMode: z.nativeEnum(PaymentMode).optional(),
  referenceBillId: z.string().optional(),
  notes: z.string().max(500).optional().or(z.literal('')),
});

// --- Payment ---
export const createPaymentSchema = z.object({
  customerId: z.string().optional(),
  supplierId: z.string().optional(),
  amount: z.number().positive(),
  paymentMode: z.nativeEnum(PaymentMode),
  reference: z.string().optional().or(z.literal('')),
  date: z.string().optional(),
  relatedTransactionId: z.string().optional(),
  relatedTransactionType: z.string().optional(),
  notes: z.string().max(500).optional().or(z.literal('')),
});

// --- Employee ---
export const createEmployeeSchema = z.object({
  employeeCode: z.string().min(1, 'Employee code required'),
  name: z.string().min(1, 'Name required'),
  mobile: z.string().regex(/^[0-9]{10}$/, 'Invalid mobile').optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  role: z.string().min(1, 'Role required'),
  department: z.string().optional().or(z.literal('')),
  designation: z.string().optional().or(z.literal('')),
  salary: z.number().nonnegative().optional(),
  joinedAt: z.string().optional(),
});

// --- User ---
export const createUserSchema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.string().min(1, 'Role required'),
  branchId: z.string().optional(),
  employeeId: z.string().optional(),
});

// --- Login ---
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  branchId: z.string().optional(),
});

// --- Settings ---
export const updateSettingsSchema = z.object({
  shopName: z.string().min(1).optional(),
  shopAddress: z.string().optional(),
  shopCity: z.string().optional(),
  shopState: z.string().optional(),
  shopPin: z.string().optional(),
  shopPhone: z.string().optional(),
  shopEmail: z.string().optional(),
  shopGstin: z.string().optional(),
  invoicePrefix: z.string().optional(),
  defaultGstRate: z.number().nonnegative().optional(),
  weightPrecision: z.number().int().min(0).max(6).optional(),
  amountPrecision: z.number().int().min(0).max(6).optional(),
});
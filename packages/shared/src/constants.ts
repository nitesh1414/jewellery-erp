// ============================
// CONSTANTS — Jewellery ERP
// ============================

export const DEFAULT_PRECISION = {
  WEIGHT: 3,
  AMOUNT: 2,
  RATE: 2,
  QUANTITY: 0,
} as const;

export const DEFAULT_GST_RATES = {
  CGST: 1.5, // 1.5% each (3% total) for jewellery
  SGST: 1.5,
  IGST: 3,
  JEWELLERY_GST_RATE: 3,
} as const;

export const HSN_JEWELLERY = '7113';
export const HSN_SILVER = '7106';
export const HSN_GOLD = '7108';

export const DEFAULT_MAKING_CHARGE_PERCENTAGE = 10;

export const BILL_PREFIXES = {
  GST: 'GST',
  NON_GST: 'NG',
  ESTIMATE: 'EST',
  PROFORMA: 'PRO',
  JOB: 'JOB',
  URD: 'URD',
  PURCHASE: 'PUR',
  REPAIR: 'REP',
} as const;

export const KEYBOARD_SHORTCUTS = {
  NEW_BILL: 'F2',
  CUSTOMER_SEARCH: 'F3',
  BARCODE: 'F4',
  MANUAL_ITEM: 'F5',
  PAYMENT: 'F6',
  SAVE: 'F7',
  PRINT: 'F8',
  CANCEL: 'Escape',
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  REPORT_PAGE_SIZE: 50,
} as const;

export const SYNC = {
  BATCH_SIZE: 50,
  MAX_RETRIES: 5,
  RETRY_DELAY_MS: 1000,
} as const;

export const WEIGHT_UNITS = ['g', 'kg', 'mg', 'oz', 'tola'] as const;
export const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€' } as const;

export const ERROR_MESSAGES = {
  BARCODE_NOT_FOUND: 'Barcode not found in inventory',
  ITEM_ALREADY_SOLD: 'This jewellery item has already been sold',
  INSUFFICIENT_STOCK: 'Insufficient stock available',
  DUPLICATE_INVOICE: 'Invoice number already exists',
  PAYMENT_MISMATCH: 'Payment amount does not match bill total',
  INVALID_GSTIN: 'Invalid GSTIN format',
  INVALID_HSN: 'Invalid HSN code',
  UNAUTHORIZED: 'You are not authorized to perform this action',
  NETWORK_UNAVAILABLE: 'Network connection unavailable',
  SYNC_CONFLICT: 'Sync conflict detected - manual resolution required',
  CUSTOMER_NOT_FOUND: 'Customer not found',
  ITEM_NOT_FOUND: 'Item not found in inventory',
  CANNOT_EDIT_FINALIZED: 'Cannot edit a finalized bill',
  CANNOT_CANCEL_FINALIZED: 'Cannot cancel a finalized bill without return processing',
  INVALID_PAYMENT: 'Invalid payment details',
} as const;
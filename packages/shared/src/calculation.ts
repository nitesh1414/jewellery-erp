// ============================
// BILLING CALCULATION ENGINE
// ============================

import { MakingChargeType, ChargeType } from './enums';

export interface ChargeConfig {
  type: ChargeType;
  calculationType: MakingChargeType;
  value: number;
}

export interface BillItemInput {
  netWeight: number;
  ratePerGram: number;
  quantity: number;
  charges: ChargeConfig[];
  discount: number; // amount
  urd: number;
  isGst: boolean;
  gstRate: number; // e.g. 3% => 3
}

export interface CalculatedBillItem {
  metalValue: number;
  chargeAmounts: { type: ChargeType; amount: number }[];
  totalCharges: number;
  hallMarkAmount: number;
  discount: number;
  urd: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
}

export interface CalculatedBill {
  items: CalculatedBillItem[];
  subtotal: number;
  totalDiscount: number;
  totalUrd: number;
  taxableAmount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTax: number;
  roundOff: number;
  netAmount: number;
}

/**
 * Calculate charge amount based on type
 */
export function calculateChargeAmount(
  metalValue: number,
  netWeight: number,
  charge: ChargeConfig
): number {
  switch (charge.calculationType) {
    case MakingChargeType.PERCENTAGE:
      return roundMoney(metalValue * (charge.value / 100));
    case MakingChargeType.PER_GRAM:
      return roundMoney(netWeight * charge.value);
    case MakingChargeType.FIXED_AMOUNT:
      return charge.value;
    default:
      return 0;
  }
}

/**
 * Calculate a single bill item
 */
export function calculateBillItem(
  input: BillItemInput
): CalculatedBillItem {
  const { netWeight, ratePerGram, quantity, charges, discount, urd, isGst, gstRate } = input;

  // Metal value
  const metalValue = roundMoney(netWeight * ratePerGram * quantity);

  // Calculate each charge
  const chargeAmounts = charges.map(c => ({
    type: c.type,
    amount: calculateChargeAmount(metalValue, netWeight, c),
  }));

  const totalCharges = roundMoney(chargeAmounts.reduce((sum, c) => sum + c.amount, 0));

  // Hallmark charge (extracted from charges or separate)
  const hallMarkAmount = roundMoney(
    chargeAmounts
      .filter(c => c.type === ChargeType.HALLMARK)
      .reduce((sum, c) => sum + c.amount, 0)
  );

  // Subtotal before tax
  const taxableAmount = roundMoney(metalValue + totalCharges - discount - urd);

  // GST calculation
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (isGst && gstRate > 0) {
    const halfRate = gstRate / 2;
    cgst = roundMoney(taxableAmount * (halfRate / 100));
    sgst = roundMoney(taxableAmount * (halfRate / 100));
  }

  const totalTax = roundMoney(cgst + sgst + igst);
  const totalAmount = roundMoney(taxableAmount + totalTax);

  return {
    metalValue,
    chargeAmounts,
    totalCharges,
    hallMarkAmount,
    discount,
    urd,
    taxableAmount,
    cgst,
    sgst,
    igst,
    totalTax,
    totalAmount,
  };
}

/**
 * Calculate complete bill
 */
export function calculateBill(
  items: BillItemInput[]
): CalculatedBill {
  const calculatedItems = items.map(item => calculateBillItem(item));

  const subtotal = roundMoney(calculatedItems.reduce((s, i) => s + i.metalValue + i.totalCharges, 0));
  const totalDiscount = roundMoney(calculatedItems.reduce((s, i) => s + i.discount, 0));
  const totalUrd = roundMoney(calculatedItems.reduce((s, i) => s + i.urd, 0));
  const taxableAmount = roundMoney(calculatedItems.reduce((s, i) => s + i.taxableAmount, 0));
  const totalCgst = roundMoney(calculatedItems.reduce((s, i) => s + i.cgst, 0));
  const totalSgst = roundMoney(calculatedItems.reduce((s, i) => s + i.sgst, 0));
  const totalIgst = roundMoney(calculatedItems.reduce((s, i) => s + i.igst, 0));
  const totalTax = roundMoney(totalCgst + totalSgst + totalIgst);

  const netAmountBeforeRound = roundMoney(taxableAmount + totalTax);
  const roundOff = roundMoney(Math.round(netAmountBeforeRound) - netAmountBeforeRound);
  const netAmount = roundMoney(netAmountBeforeRound + roundOff);

  return {
    items: calculatedItems,
    subtotal,
    totalDiscount,
    totalUrd,
    taxableAmount,
    totalCgst,
    totalSgst,
    totalIgst,
    totalTax,
    roundOff,
    netAmount,
  };
}

/**
 * Round to 2 decimal places (money precision)
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Round weight to configured precision
 */
export function roundWeight(value: number, precision: number = 3): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Calculate URD value
 */
export function calculateUrdValue(
  netWeight: number,
  rate: number,
  deduction: number,
  meltingLoss: number
): { grossValue: number; netValue: number; finalValue: number } {
  const grossValue = roundMoney(netWeight * rate);
  const netValue = roundMoney(grossValue - deduction);
  const finalValue = roundMoney(netValue * (1 - meltingLoss / 100));
  return { grossValue, netValue, finalValue };
}

/**
 * Calculate wastage
 */
export function calculateWastage(
  issuedWeight: number,
  returnedWeight: number,
  approvedWastagePercent: number
): { difference: number; wastage: number; approvedWastage: number; excessWastage: number } {
  const difference = roundWeight(issuedWeight - returnedWeight);
  const wastage = difference;
  const approvedWastage = roundWeight(issuedWeight * (approvedWastagePercent / 100));
  const excessWastage = roundWeight(Math.max(0, wastage - approvedWastage));
  return { difference, wastage, approvedWastage, excessWastage };
}

/**
 * Validate GSTIN format
 */
export function isValidGstin(gstin: string): boolean {
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(gstin);
}

/**
 * Validate HSN format
 */
export function isValidHsn(hsn: string): boolean {
  return /^[0-9]{4,8}$/.test(hsn);
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = '₹'): string {
  return `${currency} ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format weight
 */
export function formatWeight(weight: number, unit: string = 'g'): string {
  return `${weight.toFixed(3)} ${unit}`;
}

/**
 * Generate bill number
 */
export function generateBillNumber(
  prefix: string,
  sequence: number,
  year: number = new Date().getFullYear()
): string {
  return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Generate job number
 */
export function generateJobNumber(sequence: number, year: number = new Date().getFullYear()): string {
  return `JOB-${year}-${String(sequence).padStart(5, '0')}`;
}

/**
 * Generate URD number
 */
export function generateUrdNumber(sequence: number, year: number = new Date().getFullYear()): string {
  return `URD-${year}-${String(sequence).padStart(5, '0')}`;
}
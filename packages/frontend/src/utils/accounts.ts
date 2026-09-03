/**
 * Which ledger accounts money can actually move through.
 *
 * `LedgerAccount.type` is a free-form string:
 *   CASH | BANK | CARD | WALLET | CHEQUE | METAL | OTHER
 *
 * A **METAL** account is a *stock* ledger measured in grams — it tracks how
 * much gold/silver the shop holds, not how much money. Posting a rupee payment
 * to it is always a mistake, so it must never appear in a payment dropdown.
 * INCOME / SALES / REVENUE / EXPENSE are P&L heads, not wallets either.
 *
 * Unknown or custom types (OTHER, anything a shop invents) stay visible — an
 * account the business really uses must never be silently hidden.
 */
export const NON_PAYMENT_ACCOUNT_TYPES = ['METAL', 'INCOME', 'SALES', 'REVENUE', 'EXPENSE'];

/** True when money can be received into / paid out of this ledger account. */
export function isPaymentAccount(account: any): boolean {
  const type = String(account?.type ?? '').toUpperCase();
  return !NON_PAYMENT_ACCOUNT_TYPES.includes(type);
}

/** Money accounts (cash, bank, cards, wallets, cheques) that are active. */
export function paymentAccounts(accounts: any): any[] {
  const list = Array.isArray(accounts) ? (accounts as any[]) : [];
  return list.filter((a: any) => a.isActive !== false && isPaymentAccount(a));
}

import { BadRequestException } from '@nestjs/common';

/**
 * Which ledger accounts money is allowed to move through.
 *
 * `LedgerAccount.type` is a free-text column:
 *   CASH | BANK | CARD | WALLET | CHEQUE | METAL | OTHER
 *
 * A **METAL** account is a *stock* ledger measured in grams — it records how
 * much gold or silver the shop holds, not how much money. Posting a rupee
 * payment into it is always a mistake, so it is rejected here as well as being
 * hidden from the billing / purchase payment dropdowns.
 * INCOME / SALES / REVENUE / EXPENSE are P&L heads, not wallets either.
 *
 * Unknown types (OTHER, anything a shop invents) stay allowed — we must never
 * reject an account the business genuinely uses.
 */
export const NON_PAYMENT_ACCOUNT_TYPES = ['METAL', 'INCOME', 'SALES', 'REVENUE', 'EXPENSE'];

export const isMoneyAccountType = (type: unknown): boolean =>
  !NON_PAYMENT_ACCOUNT_TYPES.includes(String(type ?? '').toUpperCase());

/**
 * Throws when any of `accountIds` names a ledger that cannot hold money.
 *
 * Always call this **before** opening a transaction so the request fails
 * cleanly instead of half-writing a bill or a purchase.
 */
export async function assertMoneyAccounts(
  prisma: any,
  organizationId: string,
  accountIds: (string | null | undefined)[],
): Promise<void> {
  const ids = Array.from(new Set((accountIds || []).filter(Boolean) as string[]));
  if (ids.length === 0) return;

  const found: { id: string; name: string; type: string }[] = await prisma.ledgerAccount.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, name: true, type: true },
  });

  const bad = found.filter((a) => !isMoneyAccountType(a.type));
  if (bad.length > 0) {
    const first = bad[0];
    throw new BadRequestException(
      `Payments can only be recorded against a cash / bank ledger. "${first.name}" is a ${first.type} account.`,
    );
  }
}

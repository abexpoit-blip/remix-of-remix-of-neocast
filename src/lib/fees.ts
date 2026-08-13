export type DepositFeeMode = "add" | "deduct";

const money = (value: number) => Math.round(value * 100) / 100;

/**
 * Calculates a deposit without hiding where the fee is applied.
 * add: the requested amount is credited and the fee is added to the invoice.
 * deduct: the requested amount is charged and the fee is removed before crediting.
 */
export function calculateDepositFee(
  requested: number,
  percent: number,
  flat: number,
  mode: DepositFeeMode,
) {
  const safeRequested = Math.max(0, money(requested));
  const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
  const safeFlat = Math.max(0, Number(flat) || 0);
  const fee = money((safeRequested * safePercent) / 100 + safeFlat);
  const charged = mode === "add" ? money(safeRequested + fee) : safeRequested;
  const credit = mode === "deduct" ? money(Math.max(0, safeRequested - fee)) : safeRequested;
  return { requested: safeRequested, percent: safePercent, flat: money(safeFlat), fee, charged, credit, mode };
}

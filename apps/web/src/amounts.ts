export const UNIT = 10_000_000n;
/**
 * Canonical form of a typed amount: surrounding whitespace removed and a
 * single comma accepted as the decimal mark when there is no dot ("12,5").
 * "1,000"-style input is left unchanged because it reads as a thousands
 * separator in some locales and as a decimal mark in others.
 */
export function normalizeAmountInput(raw: string) {
  const input = raw.trim();
  if (input.includes(".") || input.split(",").length !== 2) return input;
  return /^[1-9]\d{0,2},\d{3}$/.test(input) ? input : input.replace(",", ".");
}
export function parseAmount(raw: string) {
  const input = normalizeAmountInput(raw);
  if (/^[1-9]\d{0,2},\d{3}$/.test(input))
    throw new Error(
      `“${input}” is ambiguous. Use a dot for decimals (for example 1.5) and no thousands separator.`,
    );
  if (!/^\d{1,7}(\.\d{1,7})?$/.test(input))
    throw new Error("Use a positive amount with at most seven decimal places.");
  const [whole, fraction = ""] = input.split(".");
  const value = BigInt(whole) * UNIT + BigInt(fraction.padEnd(7, "0"));
  if (value <= 0n || value > 1_000_000n * UNIT)
    throw new Error("Enter an amount between 0.0000001 and 1,000,000.");
  return value;
}
export function format(value: bigint | undefined, digits = 2) {
  if (value === undefined) return "—";
  const neg = value < 0n;
  const v = neg ? -value : value;
  const whole = (v / UNIT).toLocaleString("en-US");
  return `${neg ? "-" : ""}${whole}${digits ? "." + (v % UNIT).toString().padStart(7, "0").slice(0, digits) : ""}`;
}

export function minimumOutput(quote: bigint) {
  if (quote < 0n) throw new Error("Negative quote");
  return (quote * 995n + 999n) / 1000n;
}
export function maximumPayment(quote: bigint) {
  if (quote < 0n) throw new Error("Negative quote");
  return (quote * 1005n) / 1000n;
}

// Pool rule mirrored from contracts/pool-v3 (MIN_CLAIM and `slice`): a
// position must open with, and keep after a partial exit, at least 0.01
// backing unit of fixed claim. scripts/amounts.test.mjs binds both copies.
export const MIN_CLAIM = 100_000n;
export function exitClaimSlice(
  claim: bigint,
  shares: bigint,
  closing: bigint,
  backing: boolean,
) {
  if (closing >= shares) return claim;
  const scaled = claim * closing;
  return backing ? scaled / shares : (scaled + shares - 1n) / shares;
}
export function exitLeavesDust(
  claim: bigint,
  shares: bigint,
  closing: bigint,
  backing: boolean,
) {
  return (
    closing < shares &&
    claim - exitClaimSlice(claim, shares, closing, backing) < MIN_CLAIM
  );
}

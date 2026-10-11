export const UNIT = 10_000_000n;
export function parseAmount(input: string) {
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

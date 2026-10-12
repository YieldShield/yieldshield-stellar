// Pure error classification shared by the network layer and the interface.
// No SDK imports: the main bundle and node tests can load it directly.
type HttpLike = { response?: { status?: number; data?: unknown } } | null;

export const httpStatus = (e: unknown) =>
  (e as HttpLike)?.response?.status;

/** Horizon reports an account that has never been funded as HTTP 404. */
export const isNotFound = (e: unknown) => httpStatus(e) === 404;

export const message = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

/**
 * A read or transaction touches archived contract storage. The opaque
 * preamble (from simulation) is what a restore transaction needs.
 */
export function restoreRequired(text: string, preamble: unknown) {
  return Object.assign(new Error(text), { restorePreamble: preamble });
}
export const restorePreambleOf = (e: unknown): unknown =>
  e && typeof e === "object" && "restorePreamble" in e
    ? (e as { restorePreamble: unknown }).restorePreamble
    : undefined;

// Stellar Asset Contract (token) error codes, as surfaced by every contract
// that moves TESTUSD.
const TOKEN_ERRORS: Record<string, string> = {
  "6": "The receiving account does not exist on Stellar Testnet.",
  "9": "The token allowance is too low for this amount.",
  "10": "Your token balance is too low for this amount.",
  "11": "This account is not authorized to hold the asset.",
  "13": "A required TESTUSD trustline is missing. Add the trustline first.",
};
// The demo contracts reject with assertions, whose messages are not kept in
// release Wasm, so failures are explained by what each action checks.
const ACTION_CHECKS: Record<string, string> = {
  protect: "Admissions may have closed, free backing may be too low, or the claim moved below your minimum.",
  exit: "The 60-second exit delay may not have passed, the pool may have matured, or the payout moved below your minimum.",
  buy: "The price may have moved above your maximum payment, or exchange inventory changed.",
  sell: "Proceeds may have moved below your minimum, or exchange backing inventory changed.",
  deposit: "The amount may exceed your balance, or the output moved below your minimum.",
  redeem: "The amount may exceed your receipts, or the output moved below your minimum.",
  provide: "Holder liabilities may be open, the pool may be closing, or your share amount moved below the minimum.",
  withdraw: "Your notice may not have matured, holder liabilities may be open, or the output moved below your minimum.",
  notice: "The amount may exceed your provider shares.",
  cancel_notice: "There may be no pending notice to cancel.",
  claim: "This wallet may already have claimed, or the faucet is empty.",
  claim_bond: "The bond stays locked until pool maturity, or it was already refunded.",
  settle: "The position may not have matured yet, or it is already closed.",
  create: "The vault may not be approved, the registry may be full, or your TESTUSD cannot cover the 10 TESTUSD bond.",
  transfer_position: "The position may be closed, or the recipient is invalid.",
  claim_backing: "There may be no credit to claim, or the destination lacks a trustline.",
  claim_rewards: "There may be no gain-fee receipts to claim.",
  claim_inventory: "There may be no acquired receipts to claim.",
};
const GENERIC = /escalating error|caught (panic|error)|VM call trapped|^\s*$/i;

/** First informative diagnostic message in a simulation error, shortened. */
function firstDiagnostic(raw: string) {
  for (const line of raw.split("\n")) {
    const data = line.match(/data:\s*\[?\s*"([^"]+)"/);
    if (data && !GENERIC.test(data[1]))
      return data[1].length > 100 ? `${data[1].slice(0, 99)}…` : data[1];
  }
  return "";
}

/**
 * Turns a simulation HostError (several lines of diagnostic events) into one
 * short sentence plus, at most, the first informative diagnostic message.
 */
export function explainSimulationError(raw: string, method = "") {
  const code = raw.match(/Error\((\w+),\s*([^)]*)\)/);
  const [type, value] = code ? [code[1], code[2].replace("#", "").trim()] : ["", ""];
  let sentence: string;
  if (type === "Contract" && TOKEN_ERRORS[value]) sentence = TOKEN_ERRORS[value];
  else if (type === "Auth")
    sentence = "Authorization failed. Reconnect the wallet that owns this position and review again.";
  else if (type === "Storage" && value === "MissingValue")
    sentence = "Required contract data is missing. The testnet may have reset, or the record does not exist.";
  else if (type === "Budget")
    sentence = "The action exceeds the network's resource limits.";
  else if (type === "WasmVm" || type === "Contract")
    sentence = `The contract rejected this action. ${ACTION_CHECKS[method] || "A limit, deadline or balance check failed."}`;
  else sentence = "The network could not simulate this action. Try again shortly.";
  const detail = firstDiagnostic(raw);
  return detail ? `${sentence} (${detail})` : sentence;
}

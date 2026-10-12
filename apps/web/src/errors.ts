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
/**
 * A configured contract instance no longer exists: Stellar Testnet was most
 * likely reset, and the demo has to be redeployed.
 */
export function testnetReset(id: string) {
  return Object.assign(
    new Error(
      `Contract ${id.slice(0, 6)}…${id.slice(-5)} no longer exists on Stellar Testnet. The testnet may have reset; this demo must be redeployed before it can be used.`,
    ),
    { testnetReset: true },
  );
}
export const isTestnetReset = (e: unknown) =>
  !!e && typeof e === "object" && "testnetReset" in e;
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
  preview_buy: "The amount may be outside the exchange's limits or inventory.",
  preview_sell: "The amount may be outside the exchange's limits or inventory.",
  preview_deposit: "The amount may be outside the vault's limits.",
  preview_redeem: "The amount may exceed the vault's receipt supply.",
  preview_exit: "The amount may exceed this position.",
  preview_provide: "The amount may be outside the pool's limits.",
  preview_withdraw: "The amount may exceed the pool's provider shares.",
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
    sentence = `The contract rejected this ${method.startsWith("preview_") ? "request" : "action"}. ${ACTION_CHECKS[method] || "A limit, deadline or balance check failed."}`;
  else sentence = "The network could not simulate this action. Try again shortly.";
  const detail = firstDiagnostic(raw);
  return detail ? `${sentence} (${detail})` : sentence;
}

const RESULT_CODES: Record<string, string> = {
  op_low_reserve:
    "The wallet needs more test XLM for the trustline reserve. Fund it with Friendbot, then try again.",
  op_no_issuer:
    "The TESTUSD issuer account does not exist. The testnet may have reset.",
  op_invalid_limit: "The trustline limit is below the current balance.",
  tx_bad_seq:
    "The wallet sent another transaction in the meantime. Review the action again.",
  tx_insufficient_balance:
    "The wallet does not have enough test XLM for the network fee.",
  tx_insufficient_fee:
    "The network fee was too low during a fee surge. Review the action again.",
  tx_too_late: "The transaction expired before it reached the network. Review the action again.",
  tx_no_source_account:
    "The wallet is not funded on Stellar Testnet yet. Fund it with Friendbot first.",
};

/**
 * Horizon answers HTTP 400 with result codes when it definitively rejected a
 * classic transaction. Returns a short reason with the codes, or undefined
 * when the outcome is unknown (network error, timeout, 5xx).
 */
export function explainHorizonRejection(e: unknown) {
  if (httpStatus(e) !== 400) return undefined;
  const data = (e as { response: { data?: unknown } }).response.data as
    | { extras?: { result_codes?: { transaction?: string; operations?: string[] } } }
    | undefined;
  const codes = data?.extras?.result_codes;
  if (!codes?.transaction) return undefined;
  const all = [codes.transaction, ...(codes.operations ?? [])];
  const reason =
    all.map((code) => RESULT_CODES[code]).find(Boolean) ||
    "The network rejected the transaction.";
  return `${reason} (result codes: ${all.join(", ")})`;
}

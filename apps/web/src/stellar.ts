import {
  Account,
  Asset,
  Contract,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import {
  getNetwork,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import manifest from "../../../config/testnet.json";
export const config = manifest as typeof manifest & {
  vault: string;
  pool: string;
  faucet: string;
};
import { UNIT } from "./amounts";
import { explainSimulationError, isNotFound, restoreRequired } from "./errors";
import { pollUntil } from "./polling";
export { UNIT, parseAmount, format, minimumOutput } from "./amounts";
const server = new rpc.Server(config.rpcUrl);
const horizon = new Horizon.Server(config.horizonUrl);
export type PoolState = {
  active: number;
  backer: string;
  backing: string;
  vault: string;
  liquidity: bigint;
  reserved: bigint;
  earned: bigint;
  next_id: bigint;
};
export type Position = {
  owner: string;
  shares: bigint;
  claim: bigint;
  reserved: bigint;
  opened: bigint;
  closed: boolean;
  id: bigint;
};
export const amountSc = (v: bigint) => nativeToScVal(v, { type: "i128" });
export const addressSc = (v: string) => nativeToScVal(v, { type: "address" });
function timeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
export async function connect() {
  const available = await timeout(
    isConnected(),
    4000,
    "Freighter did not respond. Install or unlock the browser extension, then try again.",
  );
  if (!available.isConnected)
    throw new Error(
      "Freighter is not available. Install the browser extension, then try again.",
    );
  const result = await timeout(
    requestAccess(),
    30000,
    "Wallet connection timed out. Open Freighter, approve this site, and try again.",
  );
  if (result.error || !result.address)
    throw new Error(
      result.error?.message ||
        "Install Freighter and authorize this site to continue.",
    );
  await checkNetwork();
  return result.address;
}
async function checkNetwork() {
  const network = await timeout(
    getNetwork(),
    5000,
    "Freighter did not respond. Unlock it and try again.",
  );
  if (network.networkPassphrase !== Networks.TESTNET)
    throw new Error(
      "Switch Freighter to Stellar Testnet. Real-fund networks are disabled.",
    );
}
// Read-only simulations need no real source account. Like the SDK contract
// client, use a fixed placeholder so reads never depend on looking up (or on
// the existence of) any account.
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export async function view(id: string, method: string, args: xdr.ScVal[] = []) {
  if (!id) throw new Error("Deployment is not configured.");
  const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(id).call(method, ...args))
    .setTimeout(120)
    .build();
  const result = await server.simulateTransaction(tx);
  // A restore preamble means the value was simulated as if archived entries
  // were live; using it would hide that every write will fail until restored.
  if (rpc.Api.isSimulationRestore(result))
    throw restoreRequired(
      `Unable to read ${method}: contract storage is archived – restore needed.`,
      result.restorePreamble,
    );
  if (!rpc.Api.isSimulationSuccess(result) || !result.result)
    throw new Error(
      `Unable to read ${method}. The testnet may have reset or contract storage may need restoration.`,
    );
  return scValToNative(result.result.retval);
}
export async function readPool() {
  const [state, nav, assets, supply] = await Promise.all([
    view(config.pool, "state"),
    view(config.vault, "nav"),
    view(config.vault, "total_assets"),
    view(config.vault, "total_supply"),
  ]);
  return {
    state: state as PoolState,
    nav: nav as bigint,
    assets: assets as bigint,
    supply: supply as bigint,
    readAt: Date.now(),
  };
}
export async function readFunding(address: string) {
  const [account, claimed] = await Promise.all([
    // A brand-new wallet has no account until Friendbot funds it; Horizon
    // answers 404. That is an onboarding state, not a read failure.
    horizon.loadAccount(address).catch((e: unknown) => {
      if (isNotFound(e)) return null;
      throw e;
    }),
    view(config.faucet, "claimed", [addressSc(address)]),
  ]);
  const backing = account?.balances.find(
    (b) =>
      "asset_code" in b &&
      b.asset_code === "TESTUSD" &&
      b.asset_issuer === config.issuer,
  );
  return {
    funded: !!account,
    claimed: claimed as boolean,
    trusted: !!backing,
    backing: backing ? BigInt(backing.balance.replace(".", "")) : 0n,
  };
}
const FRIENDBOT = "https://friendbot.stellar.org";
/** Funds a new Testnet account with valueless XLM from the official Friendbot. */
export async function fundWithFriendbot(address: string) {
  let response: Response;
  try {
    response = await fetch(`${FRIENDBOT}/?addr=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(
      "Friendbot did not respond. Try again shortly, or open Friendbot in a new tab.",
    );
  }
  if (response.ok) return;
  const body = await response.text().catch(() => "");
  // Funding twice is harmless: the account then already exists.
  if (/already|op_already_exists/i.test(body)) return;
  throw new Error(
    "Friendbot could not fund this wallet right now. Try again shortly, or open Friendbot in a new tab.",
  );
}
export async function readWallet(address: string) {
  const [base, shares] = await Promise.all([
    readFunding(address),
    view(config.vault, "balance", [addressSc(address)]),
  ]);
  return { ...base, shares: shares as bigint };
}
function savedIds(address: string): string[] {
  try {
    const data: unknown = JSON.parse(
      localStorage.getItem(`ys-stellar-v1:${config.pool}:${address}`) || "[]",
    );
    return Array.isArray(data)
      ? data
          .filter((v): v is string => typeof v === "string" && /^\d+$/.test(v))
          .slice(-100)
      : [];
  } catch {
    return [];
  }
}
export async function readPositions(address: string, next: bigint) {
  const stored = savedIds(address);
  const start = next > 30n ? next - 30n : 1n;
  const ids = new Set<string>(stored);
  for (let i = start; i < next; i++) ids.add(i.toString());
  const positions = await Promise.all(
    [...ids].map(async (id) => {
      try {
        return {
          ...(await view(config.pool, "position", [
            nativeToScVal(BigInt(id), { type: "u64" }),
          ])),
          id: BigInt(id),
        } as Position;
      } catch {
        return null;
      }
    }),
  );
  return positions.filter((p): p is Position => !!p && p.owner === address);
}
export async function readPosition(id: string) {
  if (!/^\d+$/.test(id)) throw new Error("Enter a position number.");
  return {
    ...(await view(config.pool, "position", [
      nativeToScVal(BigInt(id), { type: "u64" }),
    ])),
    id: BigInt(id),
  } as Position;
}
export function remember(address: string, id: bigint) {
  const name = `ys-stellar-v1:${config.pool}:${address}`;
  const previous = savedIds(address);
  try {
    localStorage.setItem(
      name,
      JSON.stringify([...new Set([...previous, String(id)])].slice(-100)),
    );
  } catch {
    /* Wallet owners can still restore by position ID if local storage is unavailable. */
  }
}
async function signAndSend(
  tx: ReturnType<TransactionBuilder["build"]>,
  address: string,
  soroban: boolean,
  onSubmitted?: (hash: string) => void,
) {
  await checkNetwork();
  if (BigInt(tx.fee) > UNIT)
    throw new Error("Estimated fee exceeds the demo limit of 1 test XLM.");
  const signed = await timeout(
    signTransaction(tx.toXDR(), {
      networkPassphrase: Networks.TESTNET,
      address,
    }),
    90000,
    "Wallet signing timed out. Check Freighter and the explorer before retrying.",
  );
  if (signed.error || !signed.signedTxXdr)
    throw new Error(signed.error?.message || "Transaction was not signed.");
  if (signed.signerAddress && signed.signerAddress !== address)
    throw new Error("Wallet account changed. Reconnect before continuing.");
  const submitted = TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    Networks.TESTNET,
  );
  const knownHash = Array.from(submitted.hash(), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  onSubmitted?.(knownHash);
  if (!soroban) {
    try {
      const r = await horizon.submitTransaction(submitted);
      return { hash: r.hash, value: null };
    } catch {
      throw new Error(
        `Submission status unknown: ${knownHash}. Check the explorer before trying again.`,
      );
    }
  }
  let result: Awaited<ReturnType<typeof server.sendTransaction>>;
  try {
    result = await server.sendTransaction(submitted);
  } catch {
    throw new Error(
      `Submission status unknown: ${knownHash}. Check the explorer before trying again.`,
    );
  }
  if (result.status === "TRY_AGAIN_LATER")
    throw new Error(
      `The RPC did not enqueue this transaction (${knownHash}). Check its status before retrying.`,
    );
  if (result.status === "ERROR")
    throw new Error(
      `The testnet rejected this transaction: ${knownHash}. No success is assumed.`,
    );
  // Keep asking until shortly after the transaction's time bounds expire:
  // after that it can no longer be included. A failed status request is an
  // RPC blip, not an outcome, so it is retried with backoff.
  const maxTime =
    "timeBounds" in submitted ? Number(submitted.timeBounds?.maxTime || 0) : 0;
  const deadline = Math.min(
    Date.now() + 180_000,
    Math.max(Date.now() + 30_000, maxTime * 1000 + 15_000),
  );
  const { value: confirmation, error } = await pollUntil(
    () => server.getTransaction(result.hash),
    (c) => c.status !== "NOT_FOUND",
    { deadline },
  );
  if (confirmation?.status === "SUCCESS")
    return {
      hash: result.hash,
      value: confirmation.returnValue
        ? scValToNative(confirmation.returnValue)
        : null,
    };
  if (confirmation?.status === "FAILED")
    throw new Error(`Transaction failed on chain: ${result.hash}`);
  if (error)
    throw new Error(
      `Confirmation unavailable: ${knownHash}. The transaction may have completed; check the explorer before trying again.`,
    );
  throw new Error(
    `Still pending: ${result.hash}. Check the explorer before trying again.`,
  );
}
type RestorePreamble = rpc.Api.SimulateTransactionRestoreResponse["restorePreamble"];
/**
 * Restores archived contract storage named by a simulation's restore
 * preamble, signed by the connected wallet, and waits for a successful
 * ledger receipt. Restoration only renews existing entries.
 */
export async function restore(
  address: string,
  preamble: unknown,
  onSubmitted?: (hash: string) => void,
) {
  await checkNetwork();
  const { transactionData, minResourceFee } = preamble as RestorePreamble;
  const tx = new TransactionBuilder(await server.getAccount(address), {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .setSorobanData(transactionData.setResourceFee(minResourceFee).build())
    .addOperation(Operation.restoreFootprint({}))
    .setTimeout(120)
    .build();
  return signAndSend(tx, address, true, onSubmitted);
}
/**
 * Simulates the exact reviewed invocation as the connected wallet, so a
 * review fails early with a short explanation instead of at signing time.
 * Reports whether archived storage will have to be restored first.
 */
export async function preflight(
  address: string,
  id: string,
  method: string,
  args: xdr.ScVal[],
) {
  // Simulation does not check the sequence number.
  const tx = new TransactionBuilder(new Account(address, "0"), {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(id).call(method, ...args))
    .setTimeout(120)
    .build();
  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationRestore(simulation)) return { restore: true };
  if (!rpc.Api.isSimulationSuccess(simulation))
    throw new Error(explainSimulationError(simulation.error, method));
  return { restore: false };
}
export async function transact(
  address: string,
  id: string,
  method: string,
  args: xdr.ScVal[],
  onSubmitted?: (hash: string) => void,
  onRestore?: () => void,
) {
  await checkNetwork();
  const operation = new Contract(id).call(method, ...args);
  const build = async () =>
    new TransactionBuilder(await server.getAccount(address), {
      fee: "100000",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(operation)
      .setTimeout(120)
      .build();
  let tx = await build();
  let simulation = await server.simulateTransaction(tx);
  // Archived entries make the invocation fail on chain even though the
  // simulation succeeds, so restore them first (one extra signature), then
  // simulate again from the account's new sequence number.
  if (rpc.Api.isSimulationRestore(simulation)) {
    onRestore?.();
    await restore(address, simulation.restorePreamble);
    tx = await build();
    simulation = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationRestore(simulation))
      throw new Error(
        "Contract storage is still archived after the restore. Review the action again.",
      );
  }
  if (!rpc.Api.isSimulationSuccess(simulation))
    throw new Error(explainSimulationError(simulation.error, method));
  return signAndSend(
    rpc.assembleTransaction(tx, simulation).build(),
    address,
    true,
    onSubmitted,
  );
}
export async function trust(
  address: string,
  onSubmitted?: (hash: string) => void,
) {
  await checkNetwork();
  const source = await horizon.loadAccount(address);
  const tx = new TransactionBuilder(source, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset("TESTUSD", config.issuer),
        limit: "1000000000",
      }),
    )
    .setTimeout(120)
    .build();
  return signAndSend(tx, address, false, onSubmitted);
}
export const idSc = (id: bigint) => nativeToScVal(id, { type: "u64" });
export const boolSc = (v: boolean) => nativeToScVal(v, { type: "bool" });

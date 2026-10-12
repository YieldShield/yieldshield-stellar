// Storage lifetime (TTL) policy for every deployed contract instance and Wasm
// code entry. extend-testnet.mjs renews with it; verify-v3-deployment.mjs reads
// back with it, so renewal and verification share one threshold.
import { Contract, xdr } from "@stellar/stellar-sdk";

export const LEDGERS_PER_DAY = 17_280; // ~5-second ledgers
// Renewed entries live this many ledgers past the current one (~58 days),
// capped by the network maximum.
export const EXTEND_TO = 1_000_000;
// Entries with fewer remaining ledgers are renewed (~40 days: a 30-day pool
// term plus the 7-day maximum withdrawal notice, with margin).
export const RENEW_BELOW = 700_000;
// Verification fails below this (~14 days): renewal is overdue.
export const MIN_REMAINING = 14 * LEDGERS_PER_DAY;
// Extension and restoration are permissionless; this disposable alias only
// pays the test-XLM fees.
export const SIGNER = "ys-stellar-sponsor";
export const SAC = "stellar_asset";

/**
 * Every instance and code entry the public application depends on: the v3
 * factory, vaults, exchanges and all registry pools, plus the legacy vault,
 * pool, shared faucet and TESTUSD asset contract. A factory and pools that a
 * --fresh-pools deployment replaced (`markets.previous`) keep holding user
 * positions, so they stay covered. Duplicates are dropped.
 */
export function ttlTargets({
  markets,
  legacy,
  registryPools = [],
  previousPools = [],
}) {
  const instances = [];
  const seen = new Set();
  const add = (kind, id, hash) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    instances.push({ kind, id, hash });
  };
  const rows = markets.markets ?? [];
  add("factory", markets.factory, markets.factoryWasmHash);
  for (const m of rows) add(`vault-${m.key}`, m.vault, markets.vaultWasmHash);
  for (const m of rows)
    add(`market-${m.key}`, m.exchange, markets.marketWasmHash);
  for (const id of [...rows.map((m) => m.pool), ...registryPools])
    add(`pool-${id.slice(0, 8)}`, id, markets.poolWasmHash);
  const previous = markets.previous;
  if (previous) {
    add("previous-factory", previous.factory, previous.factoryWasmHash);
    for (const id of [...Object.values(previous.pools ?? {}), ...previousPools])
      add(`previous-pool-${id.slice(0, 8)}`, id, previous.poolWasmHash);
  }
  add("legacy-vault", legacy.vault, legacy.vaultWasmHash);
  add("legacy-pool", legacy.pool, legacy.poolWasmHash);
  add("faucet", legacy.faucet, legacy.faucetWasmHash);
  add("testusd-sac", legacy.backing, SAC);
  // Backing contracts outside the known set still need a live instance.
  for (const m of rows) add(`backing-${m.key}`, m.backing, undefined);
  return { instances, codes: codeTargets(instances) };
}

export function codeTargets(instances, discovered = []) {
  const hashes = [
    ...instances.map((i) => i.hash),
    ...discovered,
  ].filter((h) => h && h !== SAC);
  return [...new Set(hashes)].map((hash) => ({
    kind: `code-${hash.slice(0, 12)}`,
    hash,
  }));
}

export const instanceKey = (id) => new Contract(id).getFootprint();
export const codeKey = (hash) =>
  xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash, "hex") }),
  );

/** Wasm hash (hex) of a contract instance entry, or "stellar_asset". */
export function executableOf(entry) {
  const executable = JSON.parse(JSON.stringify(entry.val)).contract_data.val
    .contract_instance.executable;
  return executable === SAC ? SAC : executable.wasm;
}

async function readKeys(server, rows) {
  const found = new Map();
  let latestLedger = 0;
  // getLedgerEntries accepts at most 200 keys per request.
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const r = await server.getLedgerEntries(...batch.map((row) => row.key));
    latestLedger = Math.max(latestLedger, r.latestLedger);
    for (const e of r.entries) found.set(e.key.toXDR("base64"), e);
  }
  return {
    latestLedger,
    rows: rows.map((row) => {
      const e = found.get(row.key.toXDR("base64"));
      return {
        ...row,
        liveUntilLedger: e?.liveUntilLedgerSeq ?? null,
        ...(e && row.type === "instance" ? { executable: executableOf(e) } : {}),
      };
    }),
  };
}

/**
 * Reads the live-until ledger of every instance, then of every expected or
 * discovered code entry. A missing row has liveUntilLedger null.
 */
export async function readLifetimes(server, { instances }) {
  const first = await readKeys(
    server,
    instances.map((t) => ({ ...t, type: "instance", key: instanceKey(t.id) })),
  );
  const discovered = first.rows
    .map((r) => r.executable)
    .filter((h) => h && h !== SAC);
  const codes = codeTargets(instances, discovered);
  const second = await readKeys(
    server,
    codes.map((c) => ({ ...c, type: "code", key: codeKey(c.hash) })),
  );
  return {
    latestLedger: Math.max(first.latestLedger, second.latestLedger),
    rows: [...first.rows, ...second.rows],
  };
}

/** ok | extend (below threshold) | restore (archived) | missing (no entry). */
export function planRenewal(rows, latestLedger, renewBelow = RENEW_BELOW) {
  return rows.map((row) => {
    if (row.liveUntilLedger == null)
      return { ...row, remaining: null, action: "missing" };
    const remaining = row.liveUntilLedger - latestLedger;
    return {
      ...row,
      remaining,
      action: remaining < 0 ? "restore" : remaining < renewBelow ? "extend" : "ok",
    };
  });
}

export function renewalArgs(row, extendTo = EXTEND_TO) {
  return [
    "contract",
    row.action === "restore" ? "restore" : "extend",
    ...(row.type === "code" ? ["--wasm-hash", row.hash] : ["--id", row.id]),
    "--ledgers-to-extend",
    String(extendTo),
    "--network",
    "testnet",
    "--source-account",
    SIGNER,
  ];
}

/**
 * Date-stamped evidence label naming the contract (or code hash), so records
 * of different deployments never collide, and never overwriting an earlier
 * record. `dir` is the evidence directory under docs/evidence.
 */
export function evidenceLabel(date, row, exists = () => false, dir = "ttl") {
  const id = row.id?.slice(0, 8);
  const name = id && !row.kind.includes(id) ? `${row.kind}-${id}` : row.kind;
  const base = `${dir}/${date}/${row.action}-${name}`;
  let label = base;
  for (let n = 2; exists(label); n++) label = `${base}-${n}`;
  return label;
}

const summarize = (rows) =>
  rows.map(({ key, ...row }) => row);

/**
 * Threshold-based, idempotent renewal: entries below `renewBelow` are
 * extended, archived entries are restored, healthy entries are left alone, so
 * running it again immediately does nothing. `run(args, label)` performs one
 * CLI call and records its evidence; it is only called when broadcasting.
 */
export async function renewLifetimes({
  server,
  targets,
  run,
  broadcast = false,
  date = new Date().toISOString().slice(0, 10),
  exists = () => false,
  dir = "ttl",
  renewBelow = RENEW_BELOW,
  extendTo = EXTEND_TO,
}) {
  const before = await readLifetimes(server, targets);
  const planned = planRenewal(before.rows, before.latestLedger, renewBelow);
  const actions = [];
  for (const row of planned) {
    if (row.action !== "extend" && row.action !== "restore") continue;
    const label = evidenceLabel(date, row, exists, dir);
    if (broadcast) run(renewalArgs(row, extendTo), label);
    actions.push({ kind: row.kind, action: row.action, label });
  }
  const after =
    broadcast && actions.length ? await readLifetimes(server, targets) : before;
  const final = planRenewal(after.rows, after.latestLedger, renewBelow);
  return {
    date,
    broadcast,
    renewBelow,
    extendTo,
    latestLedger: after.latestLedger,
    actions,
    before: summarize(planned),
    after: summarize(final),
    missing: final.filter((r) => r.action === "missing").map((r) => r.kind),
    overdue: final
      .filter((r) => r.remaining != null && r.remaining < MIN_REMAINING)
      .map((r) => r.kind),
  };
}

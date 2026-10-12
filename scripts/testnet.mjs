import fs from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  Account,
  Asset,
  Contract,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
} from "@stellar/stellar-sdk";
export const NETWORK = Networks.TESTNET;
export const RPC = "https://soroban-testnet.stellar.org";
export const server = new rpc.Server(RPC);
export const horizon = new Horizon.Server(
  "https://horizon-testnet.stellar.org",
);
const cli = process.env.STELLAR_CLI || "/tmp/yieldshield-stellar-tools/stellar";
const cfg = ".secrets/stellar";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const stringify = (obj) =>
  JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) +
  "\n";
export function readJson(p, fallback = {}) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback;
}
export function save(p, v) {
  fs.mkdirSync(p.substring(0, p.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(p, stringify(v));
}
export function address(name) {
  return execFileSync(
    cli,
    ["keys", "address", `ys-stellar-${name}`, "--config-dir", cfg],
    { encoding: "utf8" },
  ).trim();
}
export function key(name) {
  return Keypair.fromSecret(
    execFileSync(
      cli,
      ["keys", "secret", `ys-stellar-${name}`, "--config-dir", cfg],
      { encoding: "utf8" },
    ).trim(),
  );
}
export function cliRun(args, label) {
  const r = spawnSync(cli, ["--config-dir", cfg, ...args], {
    encoding: "utf8",
  });
  save(`docs/evidence/${label}.json`, {
    args,
    stdout: r.stdout,
    stderr: r.stderr,
    status: r.status,
  });
  if (r.status !== 0)
    throw new Error(`Stellar CLI failed: ${label}; see evidence`);
  return r.stdout.trim();
}
export const scAddress = (value) => nativeToScVal(value, { type: "address" });
export const scAmount = (value) =>
  nativeToScVal(BigInt(value), { type: "i128" });
export async function assertTestnet() {
  const net = await server.getNetwork();
  if (net.passphrase !== NETWORK) throw new Error("Refusing non-testnet RPC");
}
export async function confirm(tx, keypair) {
  tx.sign(keypair);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR")
    throw new Error(`Submission rejected ${sent.errorResult?.toXDR("base64")}`);
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const r = await server.getTransaction(sent.hash);
    if (r.status === "SUCCESS")
      return {
        hash: sent.hash,
        ledger: r.ledger,
        returnValue: r.returnValue ? scValToNative(r.returnValue) : null,
      };
    if (r.status === "FAILED")
      throw new Error(`Transaction failed ${sent.hash}`);
  }
  throw new Error(`Transaction pending ${sent.hash}; inspect before retrying`);
}
export async function invoke(name, id, method, args = []) {
  await assertTestnet();
  const k = key(name);
  const acct = await server.getAccount(k.publicKey());
  const tx = new TransactionBuilder(acct, {
    fee: "100000",
    networkPassphrase: NETWORK,
  })
    .addOperation(new Contract(id).call(method, ...args))
    .setTimeout(120)
    .build();
  const prepared = await server.prepareTransaction(tx);
  return confirm(prepared, k);
}
// Read-only simulations need no real source account (the SDK contract client
// uses the same placeholder), so readbacks need neither signer keys nor a
// funded sponsor.
export const NULL_ACCOUNT =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
export async function view(id, method, args = []) {
  const acct = new Account(NULL_ACCOUNT, "0");
  const tx = new TransactionBuilder(acct, {
    fee: "100",
    networkPassphrase: NETWORK,
  })
    .addOperation(new Contract(id).call(method, ...args))
    .setTimeout(120)
    .build();
  const result = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(result) || !result.result)
    throw new Error(`Read ${method} failed`);
  return scValToNative(result.result.retval);
}
// Every pool the factory registered. Paged factories list 25 per read;
// factories deployed before paging return them all from state().pools.
export async function registryPools(factory) {
  const s = await view(factory, "state");
  if (Array.isArray(s.pools)) return s.pools;
  const pools = [];
  for (let start = 0; start < s.count; start += 25) {
    const page = await view(factory, "pools", [
      nativeToScVal(start, { type: "u32" }),
      nativeToScVal(25, { type: "u32" }),
    ]);
    if (!page.length) throw new Error("Registry page unexpectedly empty");
    pools.push(...page.map((l) => l.pool));
  }
  return pools;
}
export async function trust(name, issuer) {
  const k = key(name);
  const acct = await horizon.loadAccount(k.publicKey());
  if (
    acct.balances.some(
      (b) => b.asset_code === "TESTUSD" && b.asset_issuer === issuer,
    )
  )
    return { existing: true };
  const tx = new TransactionBuilder(acct, {
    fee: "100",
    networkPassphrase: NETWORK,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset("TESTUSD", issuer),
        limit: "1000000000",
      }),
    )
    .setTimeout(120)
    .build();
  tx.sign(k);
  const r = await horizon.submitTransaction(tx);
  return { hash: r.hash, ledger: r.ledger };
}
export function sha(path) {
  return createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

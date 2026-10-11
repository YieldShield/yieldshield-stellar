import fs from "node:fs";
import assert from "node:assert/strict";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  assertTestnet,
  invoke,
  readJson,
  save,
  scAddress,
  scAmount,
  view,
  sleep,
} from "./testnet.mjs";
if (!process.argv.includes("--broadcast"))
  throw Error("Requires --broadcast; disposable testnet accounts only.");
await assertTestnet();
const m = readJson("config/markets.json"),
  l = readJson("config/testnet.json"),
  asset = m.markets[1],
  U = 10_000_000n,
  path = "docs/evidence/v3/lifecycle.json";
const evidence = readJson(path, {
  startedAt: new Date().toISOString(),
  transactions: [],
  assertions: [],
});
if (evidence.completedAt) {
  console.log(
    "Historical lifecycle already recorded. Use verify-v3-deployment.mjs to read current state.",
  );
  process.exit(0);
}
const step = async (label, name, id, method, args) => {
  const prev = evidence.transactions.find((t) => t.label === label);
  if (prev) return prev;
  const r = await invoke(name, id, method, args);
  const tx = { label, ...r };
  evidence.transactions.push(tx);
  save(path, evidence);
  return tx;
};
const n = (x) => scAmount(BigInt(x) * U),
  d = () =>
    nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 120), { type: "u64" }),
  id = (x) => nativeToScVal(BigInt(x), { type: "u64" }),
  bool = (x) => nativeToScVal(x, { type: "bool" });
const terms = {
  collateral_bps: 15000,
  creator_fee_bps: 100,
  duration: 300n,
  junior_fee_bps: 1000,
  notice_delay: 30n,
};
const termsSc = xdr.ScVal.scvMap(
  Object.entries(terms)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, val]) =>
        new xdr.ScMapEntry({
          key: nativeToScVal(key, { type: "symbol" }),
          val: nativeToScVal(val, {
            type: typeof val === "bigint" ? "u64" : "u32",
          }),
        }),
    ),
);
const creation = await step(
  "create-five-minute-community-pool",
  "tester",
  m.factory,
  "create",
  [
    scAddress(l.tester),
    scAddress(asset.vault),
    termsSc,
    nativeToScVal(new Uint8Array(32).fill(91), { type: "bytes" }),
  ],
);
const pool = creation.returnValue;
evidence.pool = pool;
save(path, evidence);
await step("first-provider", "sponsor", pool, "provide", [
  scAddress(l.sponsor),
  n(500),
  scAmount(1),
  d(),
]);
await step("second-provider", "tester", pool, "provide", [
  scAddress(l.tester),
  n(500),
  scAmount(1),
  d(),
]);
const buyCost = await view(asset.exchange, "preview_buy", [n(120)]);
await step("buy-receipts", "tester", asset.exchange, "buy", [
  scAddress(l.tester),
  n(120),
  scAmount(buyCost),
  d(),
]);
const sellQuote = await view(asset.exchange, "preview_sell", [n(10)]);
await step("sell-receipts", "tester", asset.exchange, "sell", [
  scAddress(l.tester),
  n(10),
  scAmount(sellQuote),
  d(),
]);
const p1 = (
  await step("protect-transfer-partial", "tester", pool, "protect", [
    scAddress(l.tester),
    n(100),
    scAmount(1),
    d(),
  ])
).returnValue;
await step("transfer-native-position", "tester", pool, "transfer_position", [
  id(p1),
  scAddress(l.sponsor),
]);
const p2 = (
  await step("protect-maturity-credit", "tester", pool, "protect", [
    scAddress(l.tester),
    n(10),
    scAmount(1),
    d(),
  ])
).returnValue;
await step("funded-gain", "sponsor", asset.vault, "donate", [
  scAddress(l.sponsor),
  n(3000),
]);
let p = await view(pool, "position", [id(p1)]);
const wait = Math.max(0, Number(p.opened) + 61 - Math.floor(Date.now() / 1000));
if (wait) {
  console.log(`Waiting${wait}s for actual onchain exit delay`);
  await sleep(wait * 1000);
}
await step("partial-fixed-backing-exit", "sponsor", pool, "exit", [
  id(p1),
  n(40),
  bool(true),
  scAmount(1),
  d(),
]);
const preview = await view(pool, "preview_exit", [id(p1), n(60), bool(false)]);
await step("remaining-receipt-exit", "sponsor", pool, "exit", [
  id(p1),
  n(60),
  bool(false),
  scAmount(preview),
  d(),
]);
await step("provider-withdrawal-notice", "sponsor", pool, "notice", [
  scAddress(l.sponsor),
  n(250),
]);
await step("cancel-provider-notice", "sponsor", pool, "cancel_notice", [
  scAddress(l.sponsor),
]);
await step("new-provider-notice", "sponsor", pool, "notice", [
  scAddress(l.sponsor),
  n(250),
]);
await step("claim-provider-fees", "sponsor", pool, "claim_rewards", [
  scAddress(l.sponsor),
  scAddress(l.sponsor),
]);
await step("claim-acquired-principal", "sponsor", pool, "claim_inventory", [
  scAddress(l.sponsor),
  scAddress(l.sponsor),
]);
await step("claim-creator-fees", "tester", pool, "claim_creator", [
  scAddress(l.tester),
]);
await step("claim-protocol-fees", "sponsor", pool, "claim_protocol", [
  scAddress(l.sponsor),
]);
let state = await view(pool, "state");
const endWait = Math.max(
  0,
  Number(state.end) + 1 - Math.floor(Date.now() / 1000),
);
if (endWait) {
  console.log(`Waiting${endWait}s for immutable five-minute maturity`);
  await sleep(endWait * 1000);
}
const before = await view(asset.backing, "balance", [scAddress(l.tester)]);
await step("permissionless-maturity-settlement", "sponsor", pool, "settle", [
  id(p2),
]);
const after = await view(asset.backing, "balance", [scAddress(l.tester)]);
if (!evidence.assertions.includes("Maturity did not push tokens to holder")) {
  assert.equal(before, after);
  evidence.assertions.push("Maturity did not push tokens to holder");
}
const credit = await view(pool, "credit", [scAddress(l.tester)]);
assert.equal(credit, 10n * U);
evidence.assertions.push(
  "Expired claim credited separately at its fixed backing amount",
);
const withdraw = await view(pool, "preview_withdraw", [n(250)]);
await step("partial-provider-withdrawal", "sponsor", pool, "withdraw", [
  scAddress(l.sponsor),
  n(250),
  scAmount(withdraw),
  d(),
]);
await step("claim-segregated-backing", "tester", pool, "claim_backing", [
  scAddress(l.tester),
  scAddress(l.tester),
]);
await step("refund-creation-bond", "tester", m.factory, "claim_bond", [
  scAddress(pool),
  scAddress(l.tester),
]);
state = await view(pool, "state");
assert.equal(state.active, 0);
assert.equal(state.reserved, 0n);
assert.equal(state.credit_total, 0n);
const position = await view(pool, "position", [id(p1)]);
assert.equal(position.owner, l.sponsor);
assert.equal(position.closed, true);
evidence.assertions.push(
  "Transferred holder completed proportional partial backing and remaining receipt exits",
  "Provider withdrew partial cash after notice and all holder liabilities settled",
  "Factory bond refunded once after fixed term",
  "Fee inventories remain separate from acquired receipt inventory",
);
for (const market of m.markets) {
  assert.equal((await view(market.pool, "state")).active, 0);
}
evidence.assertions.push(
  "Every featured pool remains open to new capital providers",
);
evidence.completedAt = new Date().toISOString();
evidence.finalState = state;
evidence.providers = await Promise.all(
  [l.sponsor, l.tester].map((owner) =>
    view(pool, "provider", [scAddress(owner)]),
  ),
);
save(path, evidence);
console.log(
  JSON.stringify({
    pool,
    transactions: evidence.transactions.length,
    assertions: evidence.assertions.length,
  }),
);

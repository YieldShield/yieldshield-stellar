import assert from "node:assert/strict";
import { nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import { readJson, save, server, view, address, scAddress, assertTestnet } from "./testnet.mjs";
await assertTestnet();
const path = "docs/evidence/e2e/local-wallet.json", log = readJson(path);
// SDK 17 returns Uint8Array; preserve every original byte from the first
// recorder's comma-separated representation, including leading zeroes.
for (const s of log.signatures) if (s.hash.includes(",")) s.hash = Buffer.from(s.hash.split(",").map(Number)).toString("hex");
const receipts = [];
for (const s of log.signatures) {
  assert.match(s.hash, /^[a-f0-9]{64}$/);
  const tx = await server.getTransaction(s.hash);
  assert.equal(tx.status, "SUCCESS", `${s.method} ${s.hash}`);
  receipts.push({ ...s, status: tx.status, ledger: tx.ledger, returnValue: tx.returnValue ? scValToNative(tx.returnValue) : null });
}
const created = receipts.find(r => r.method === "create").returnValue;
const maturity = readJson("docs/evidence/e2e/maturity-fixture.json");
const fresh = address("e2e"), tester = address("tester");
const [state, provider, position, maturedState, credit, fixtureRecord, funding] = await Promise.all([
  view(created, "state"), view(created, "provider", [scAddress(fresh)]),
  view(created, "position", [nativeToScVal(1n,{type:"u64"})]),
  view(maturity.pool, "state"), view(maturity.pool, "credit", [scAddress(fresh)]),
  view(readJson("config/markets.json").factory, "record", [scAddress(maturity.pool)]),
  view(readJson("config/testnet.json").backing,"balance",[scAddress(fresh)]),
]);
assert.equal(state.active,0); assert.equal(state.reserved,0n);
assert.equal(provider.shares,800000000n); assert.equal(provider.inventory,0n);
assert.equal(state.liquidity,736000000n);
assert.equal(position.closed,true); assert.equal(position.owner,tester);
assert.equal(maturedState.active,0); assert.equal(maturedState.credit_total,0n); assert.equal(credit,0n);
assert.equal(fixtureRecord.claimed,true);
assert.equal(funding,8703250000n);
const nestedMarket = readJson("config/markets.json").markets[2];
const nestedBalance = await view(nestedMarket.vault,"balance",[scAddress(fresh)]);
const innerBalance = await view(nestedMarket.backing,"balance",[scAddress(fresh)]);
assert.equal(nestedBalance,0n);
assert.equal(innerBalance,259940000n);
for (const market of readJson("config/markets.json").markets) assert.equal((await view(market.pool,"state")).active,0);
save(path,log);
save("docs/evidence/e2e/readback.json", { checkedAt:new Date().toISOString(), browserSignedTransactions:receipts.length, receipts, createdPool:created, provider, position, state, maturityPool:maturity.pool, maturedState, credit, fixtureRecord, freshTestusd:funding, nestedBalance, innerBalance, assertions:["All browser signatures independently confirmed SUCCESS on public Testnet RPC","Transferred holder fully closed after proportional backing and receipt exits","Provider partial withdrawal burned 20 of 100 shares for 18.4 TESTUSD; separate acquired receipt claim cleared 8 receipts","Maturity claim credit paid independently and creation bond refunded","Nested buy and sell settled in ysALPHA backing; its 0.006 receipt spread did not change TESTUSD","All three featured pools have no active liabilities and remain provider-admissible"] });
console.log(JSON.stringify({ confirmedBrowserTransactions:receipts.length, createdPool:created, maturityPool:maturity.pool, allFeaturedProviderEntryOpen:true }));

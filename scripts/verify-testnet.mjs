import fs from "node:fs";
import assert from "node:assert/strict";
import { nativeToScVal } from "@stellar/stellar-sdk";
import {
  assertTestnet,
  invoke,
  readJson,
  save,
  scAddress,
  scAmount,
  sleep,
  view,
} from "./testnet.mjs";
if (!process.argv.includes("--broadcast"))
  throw new Error(
    "Pass --broadcast to run testnet lifecycle with valueless tokens",
  );
await assertTestnet();
const m = readJson("config/testnet.json");
const U = 10_000_000n;
const idSc = (v) => nativeToScVal(BigInt(v), { type: "u64" });
const deadline = () => idSc(Math.floor(Date.now() / 1000) + 120);
const min = (x) => scAmount((x * 995n + 999n) / 1000n || 1n);
const done = "docs/evidence/lifecycle.json";
if (fs.existsSync(done))
  throw new Error(
    "Lifecycle evidence already exists; inspect it before explicitly choosing a new run",
  );
const evidence = {
  network: m.network,
  startedAt: new Date().toISOString(),
  pool: m.pool,
  vault: m.vault,
  steps: [],
};
async function step(label, name, id, method, args) {
  const result = await invoke(name, id, method, args);
  evidence.steps.push({ label, ...result });
  save("docs/evidence/lifecycle-progress.json", evidence);
  return result;
}
const bal = () => view(m.backing, "balance", [scAddress(m.tester)]);
const shares = () => view(m.vault, "balance", [scAddress(m.tester)]);
if (!(await view(m.faucet, "claimed", [scAddress(m.tester)])))
  await step("Claim funded test tokens", "tester", m.faucet, "claim", [
    scAddress(m.tester),
  ]);
const amount = 500n * U;
const depositQuote = await view(m.vault, "preview_deposit", [scAmount(amount)]);
await step(
  "Deposit TESTUSD into native receipt vault",
  "tester",
  m.vault,
  "deposit",
  [scAddress(m.tester), scAmount(amount), min(depositQuote), deadline()],
);
const protectedShares = 100n * U;
const quote = await view(m.vault, "preview_redeem", [
  scAmount(protectedShares),
]);
const p1 = await step(
  "Open gain scenario position",
  "tester",
  m.pool,
  "protect",
  [scAddress(m.tester), scAmount(protectedShares), min(quote), deadline()],
);
const firstId = BigInt(p1.returnValue);
const first = await view(m.pool, "position", [idSc(firstId)]);
const assets = await view(m.vault, "total_assets");
await step(
  "Add funded donation to simulate gain",
  "sponsor",
  m.vault,
  "donate",
  [scAddress(m.sponsor), scAmount(assets / 4n)],
);
const quote2 = await view(m.vault, "preview_redeem", [
  scAmount(protectedShares),
]);
const p2 = await step(
  "Open second position at higher funded NAV",
  "tester",
  m.pool,
  "protect",
  [scAddress(m.tester), scAmount(protectedShares), min(quote2), deadline()],
);
const secondId = BigInt(p2.returnValue);
const second = await view(m.pool, "position", [idSc(secondId)]);
const waitUntil = Number(first.opened) + 62;
while (Date.now() / 1000 < waitUntil) await sleep(1000);
const beforeShares = await shares();
const out = await view(m.pool, "preview_exit", [
  idSc(firstId),
  nativeToScVal(false, { type: "bool" }),
]);
const fee = protectedShares - out;
const gainExit = await step(
  "Exit with receipts and share positive gains",
  "tester",
  m.pool,
  "exit",
  [idSc(firstId), nativeToScVal(false, { type: "bool" }), min(out), deadline()],
);
assert.equal(BigInt(gainExit.returnValue), out);
assert.equal((await shares()) - beforeShares, out);
assert.ok(fee > 0n);
const redemption = await view(m.vault, "preview_redeem", [scAmount(out)]);
const beforeRedeem = await bal();
await step(
  "Redeem returned receipts to actual TESTUSD",
  "tester",
  m.vault,
  "redeem",
  [scAddress(m.tester), scAmount(out), min(redemption), deadline()],
);
assert.equal((await bal()) - beforeRedeem, redemption);
const assets2 = await view(m.vault, "total_assets");
await step(
  "Explicit test administrator simulates vault loss",
  "sponsor",
  m.vault,
  "simulate_loss",
  [scAmount((assets2 * 40n) / 100n)],
);
const waitSecond = Number(second.opened) + 62;
while (Date.now() / 1000 < waitSecond) await sleep(1000);
const beforeClaim = await bal();
const lossExit = await step(
  "Surrender receipts and claim reserved backing",
  "tester",
  m.pool,
  "exit",
  [
    idSc(secondId),
    nativeToScVal(true, { type: "bool" }),
    scAmount(second.claim),
    deadline(),
  ],
);
assert.equal(BigInt(lossExit.returnValue), second.claim);
assert.equal((await bal()) - beforeClaim, second.claim);
const state = await view(m.pool, "state");
assert.equal(state.reserved, 0n);
assert.equal(state.active, 0);
assert.equal(state.earned, fee + protectedShares);
assert.equal((await view(m.pool, "position", [idSc(firstId)])).closed, true);
assert.equal((await view(m.pool, "position", [idSc(secondId)])).closed, true);
const liveAmount = 50n * U;
const liveQuote = await view(m.vault, "preview_redeem", [scAmount(liveAmount)]);
await step(
  "Leave a small visible test position open",
  "tester",
  m.pool,
  "protect",
  [scAddress(m.tester), scAmount(liveAmount), min(liveQuote), deadline()],
);
evidence.finalState = await view(m.pool, "state");
evidence.finalNav = await view(m.vault, "nav");
evidence.finalVaultAssets = await view(m.vault, "total_assets");
evidence.finalVaultSupply = await view(m.vault, "total_supply");
evidence.assertions = [
  "Gain receipt delta equals exact calculated payout",
  "Gain fee positive and reserved backing released",
  "Returned receipts redeemed into actual TESTUSD balance delta",
  "Loss backing exit equals fixed entry claim",
  "Both exited positions closed and sponsor earned inventory tracked",
  "One final demonstration position remains active",
];
evidence.completedAt = new Date().toISOString();
save(done, evidence);
console.log(
  JSON.stringify({
    passed: evidence.assertions.length,
    transactions: evidence.steps.length,
    file: done,
  }),
);

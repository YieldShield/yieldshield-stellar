// Exercises apps/web/src/stellar.ts against a fake RPC/Horizon/Friendbot and a
// fake Freighter, through the real Stellar SDK.
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Keypair, Networks, nativeToScVal } from "@stellar/stellar-sdk";
import { fakeNetwork } from "./fake-network.mjs";

const temp = mkdtempSync(resolve("node_modules/.stellar-network-test-"));
const output = await build({
  entryPoints: ["apps/web/src/stellar.ts"], bundle: true, format: "esm",
  platform: "node", packages: "external", write: false,
  plugins: [{ name: "fake-freighter", setup(b) {
    b.onResolve({ filter: /^@stellar\/freighter-api$/ }, () => ({ path: "freighter", namespace: "fake" }));
    b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({ contents: `
      export const isConnected = async () => ({ isConnected: true });
      export const requestAccess = async () => ({ address: globalThis.wallet.address });
      export const getNetwork = async () => ({ networkPassphrase: ${JSON.stringify(Networks.TESTNET)} });
      export const signTransaction = async (xdr, opts) => {
        globalThis.wallet.signed.push(xdr);
        return { signedTxXdr: xdr, signerAddress: opts.address };
      };
    ` }));
  } }],
});
const modulePath = join(temp, "stellar.mjs");
writeFileSync(modulePath, output.outputFiles[0].text);
const originalFetch = globalThis.fetch;
// Run the app's polling delays 100x faster; long timeouts stay as they are.
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms = 0, ...args) =>
  originalSetTimeout(fn, ms >= 10_000 ? ms : Math.ceil(ms / 100), ...args);
const api = await import(pathToFileURL(modulePath).href);
const config = JSON.parse(readFileSync("config/testnet.json", "utf8"));
after(() => {
  rmSync(temp, { recursive: true, force: true });
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  delete globalThis.wallet;
});
let net, user;
beforeEach(() => {
  net = fakeNetwork();
  net.simulate = ({ method }) => ({
    retval: method === "claimed" ? nativeToScVal(false) : nativeToScVal(1n, { type: "i128" }),
  });
  globalThis.fetch = net.fetch;
  user = Keypair.random().publicKey();
  globalThis.wallet = { address: user, signed: [] };
});

test("a wallet Friendbot has not funded yet reads as unfunded instead of failing", async () => {
  const funding = await api.readFunding(user);
  assert.deepEqual(funding, { funded: false, claimed: false, trusted: false, backing: 0n });
  net.accounts.add(user);
  net.trustlines.set(user, { asset_issuer: config.issuer, balance: "12.5000000" });
  assert.deepEqual(await api.readFunding(user), { funded: true, claimed: false, trusted: true, backing: 125_000_000n });
});

test("a Horizon blip is retried once; a persistent outage is still a read failure", async () => {
  net.accounts.add(user);
  net.unavailable.horizon = 1;
  assert.equal((await api.readFunding(user)).funded, true);
  net.unavailable.horizon = 2;
  await assert.rejects(api.readFunding(user));
});

test("Friendbot funding accepts an already funded account and reports outages", async () => {
  await api.fundWithFriendbot(user);
  assert.ok(net.log.includes(`friendbot ${user}`));
  net.friendbot = () => [400, { detail: "createAccountAlreadyExist", extras: { result_codes: { operations: ["op_already_exists"] } } }];
  await api.fundWithFriendbot(user);
  net.friendbot = () => [500, "error"];
  await assert.rejects(api.fundWithFriendbot(user), /Friendbot could not fund this wallet/);
});

const pool = JSON.parse(readFileSync("config/markets.json", "utf8")).markets[0].pool;

test("reads of archived storage ask for a restore instead of using simulated values", async () => {
  net.simulate = () => ({ retval: nativeToScVal(5n, { type: "i128" }), restore: true });
  const failure = await api.view(pool, "state").catch((e) => e);
  assert.match(failure.message, /archived – restore needed/);
  assert.equal(failure.restorePreamble.minResourceFee, "200000");
});

test("a transaction on archived storage restores it first, then re-simulates and sends", async () => {
  net.accounts.add(user);
  let restored = false;
  net.simulate = ({ method }) => ({ retval: nativeToScVal(1n, { type: "i128" }), restore: method === "deposit" && !restored });
  net.send = (call) => {
    if (call.type === "restoreFootprint") restored = true;
    return { status: "PENDING" };
  };
  const notices = [], hashes = [];
  const result = await api.transact(user, pool, "deposit", [], (h) => hashes.push(h), () => notices.push("restore"));
  assert.deepEqual(net.sent.map((s) => s.method || s.type), ["restoreFootprint", "deposit"]);
  assert.equal(globalThis.wallet.signed.length, 2, "restore and invocation are signed separately");
  assert.deepEqual(notices, ["restore"]);
  assert.deepEqual(hashes, [result.hash], "only the reviewed invocation consumes the review");
  assert.equal(BigInt(net.sent[0].fee), 100_000n + 200_000n, "restore pays the preamble's minimum resource fee");
  assert.equal(net.log.filter((l) => l.startsWith("simulate deposit")).length, 2);
});

test("restore() renews a read's archived footprint with the connected wallet", async () => {
  net.accounts.add(user);
  net.simulate = () => ({ retval: nativeToScVal(5n, { type: "i128" }), restore: true });
  const failure = await api.view(pool, "state").catch((e) => e);
  const r = await api.restore(user, failure.restorePreamble);
  assert.match(r.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(net.sent.map((s) => [s.type, s.source]), [["restoreFootprint", user]]);
});

const hostError = `HostError: Error(Contract, #10)\n\nEvent log (newest first):\n   0: [Diagnostic Event] data:"escalating error to panic"\n   1: [Diagnostic Event] data:["balance is not sufficient to spend", 0, 1000000000]`;

test("preflight simulates the reviewed call as the wallet and explains failures", async () => {
  net.simulate = () => ({ error: hostError });
  await assert.rejects(
    api.preflight(user, pool, "deposit", []),
    { message: "Your token balance is too low for this amount. (balance is not sufficient to spend)" },
  );
  assert.ok(net.log.includes(`simulate deposit source=${user}`));
  assert.ok(!net.log.includes("rpc getLedgerEntries"), "no account lookup is needed to simulate");
  net.simulate = () => ({ retval: nativeToScVal(1n, { type: "i128" }), restore: true });
  assert.deepEqual(await api.preflight(user, pool, "deposit", []), { restore: true });
});

test("a failing invocation never reaches the wallet and reports a short reason", async () => {
  net.accounts.add(user);
  net.simulate = () => ({ error: hostError });
  await assert.rejects(api.transact(user, pool, "deposit", []), /^Error: Your token balance is too low/);
  assert.equal(globalThis.wallet.signed.length, 0);
});

test("a failed confirmation request is retried instead of ending the wait", async () => {
  net.accounts.add(user);
  net.unavailable.getTransaction = 2;
  net.transaction = (_hash, attempt) => (attempt < 2 ? "NOT_FOUND" : "SUCCESS");
  const r = await api.transact(user, pool, "deposit", []);
  assert.match(r.hash, /^[0-9a-f]{64}$/);
  assert.equal(net.log.filter((l) => l === "rpc getTransaction").length, 4);
});

test("reads simulate from the SDK null account without any account lookup", async () => {
  assert.equal(await api.view(pool, "nav"), 1n);
  assert.deepEqual(net.log, ["rpc simulateTransaction", "simulate nav source=GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"]);
  assert.ok(!net.accounts.has(config.sponsor), "the sponsor account is not needed");
});

test("a read of a contract that no longer exists reports a testnet reset", async () => {
  net.contracts = new Set();
  net.simulate = () => ({ error: "HostError: Error(Storage, MissingValue)\n 0: [Diagnostic Event] data:[\"trying to get non-existing value for contract instance\"]" });
  const failure = await api.view(pool, "state").catch((e) => e);
  assert.match(failure.message, /no longer exists on Stellar Testnet\. The testnet may have reset/);
  assert.equal(failure.testnetReset, true);
});

test("other read failures of an existing contract are explained, not called a reset", async () => {
  net.simulate = () => ({ error: "HostError: Error(WasmVm, InvalidAction)" });
  const failure = await api.view(pool, "preview_buy").catch((e) => e);
  assert.equal(failure.message, "Unable to read preview_buy. The contract rejected this request. The amount may be outside the exchange's limits or inventory.");
  assert.equal(failure.testnetReset, undefined);
});

test("one failed read request is retried once before the read fails", async () => {
  net.unavailable.simulateTransaction = 1;
  assert.equal(await api.view(pool, "nav"), 1n);
  assert.equal(net.log.filter((l) => l === "rpc simulateTransaction").length, 2);
  net.unavailable.simulateTransaction = 2;
  await assert.rejects(api.view(pool, "nav"));
});

test("trustline submission reports Horizon result codes and keeps timeouts unknown", async () => {
  net.accounts.add(user);
  net.submit = () => [400, { type: "https://stellar.org/horizon-errors/transaction_failed", status: 400, extras: { result_codes: { transaction: "tx_failed", operations: ["op_low_reserve"] } } }];
  await assert.rejects(api.trust(user), /^Error: The testnet rejected this transaction \([0-9a-f]{64}\)\. The wallet needs more test XLM for the trustline reserve.*\(result codes: tx_failed, op_low_reserve\)$/);
  net.submit = () => [504, { status: 504, title: "Timeout" }];
  await assert.rejects(api.trust(user), /Submission status unknown/);
  net.submit = () => [200, { hash: "trust-hash", ledger: 1 }];
  assert.equal((await api.trust(user)).hash, "trust-hash");
});

test("the trustline fee follows surge pricing within the demo cap", async () => {
  net.accounts.add(user);
  await api.trust(user);
  assert.equal(net.submitted.at(-1).fee, "10000", "at least 10,000 stroops without a surge");
  net.feeStats = () => [200, { fee_charged: { p95: "60000" } }];
  await api.trust(user);
  assert.equal(net.submitted.at(-1).fee, "120000");
  net.feeStats = () => [200, { fee_charged: { p95: "900000000" } }];
  await api.trust(user);
  assert.equal(net.submitted.at(-1).fee, "10000000", "never above 1 test XLM");
  net.feeStats = () => [503, "down"];
  await api.trust(user);
  assert.equal(net.submitted.at(-1).fee, "10000");
});

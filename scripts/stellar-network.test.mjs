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
const api = await import(pathToFileURL(modulePath).href);
const config = JSON.parse(readFileSync("config/testnet.json", "utf8"));
after(() => {
  rmSync(temp, { recursive: true, force: true });
  globalThis.fetch = originalFetch;
  delete globalThis.wallet;
});
let net, user;
beforeEach(() => {
  net = fakeNetwork();
  net.accounts.add(config.sponsor);
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

test("Horizon outages are still reported as read failures", async () => {
  net.unavailable.horizon = 1;
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

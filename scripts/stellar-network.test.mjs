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

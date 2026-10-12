import { after, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.location = { href: "http://localhost/trade", origin: "http://localhost" };
globalThis.HTMLElement = class {};
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.window = { addEventListener() {}, removeEventListener() {}, scrollTo() {} };
// Every network-facing function of ./v3 delegates to the current test's fake.
const exported = [
  "markets", "connect", "readMarket", "readAccount", "view", "transact",
  "trust", "fundWithFriendbot",
];
const temp = mkdtempSync(resolve("node_modules/.app-refresh-test-"));
const result = await build({
  entryPoints: ["apps/web/src/main.tsx"], bundle: true, format: "esm",
  platform: "node", packages: "external", write: false,
  plugins: [{ name: "test-browser-entry", setup(b) {
    b.onLoad({ filter: /\/main\.tsx$/ }, ({ path }) => ({
      contents: readFileSync(path, "utf8").split('createRoot(document.getElementById("root")!')[0],
      loader: "tsx", resolveDir: resolve("apps/web/src"),
    }));
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    b.onResolve({ filter: /^\.\/Legacy$/ }, () => ({ path: "legacy", namespace: "legacy" }));
    b.onLoad({ filter: /.*/, namespace: "legacy" }, () => ({ contents: "export default function Legacy(){ return null; }" }));
    b.onResolve({ filter: /^\.\/v3$/ }, () => ({ path: "mock-api", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `
      ${exported.map((name) => `export const ${name}=(...args)=>globalThis.testApi.${name}(...args);`).join("\n")}
      export const amountSc=x=>x, addressSc=x=>x, idSc=x=>x;
      export const deployment={markets:[]};
    ` }));
  } }],
});
const path = join(temp, "app.mjs");
writeFileSync(path, result.outputFiles[0].text);
const { App } = await import(pathToFileURL(path).href);
after(() => {
  rmSync(temp, { recursive: true, force: true });
  for (const key of ["IS_REACT_ACT_ENVIRONMENT", "location", "HTMLElement", "document", "window", "testApi"]) delete globalThis[key];
});
const U = 10_000_000n;
const market = { pool: "pool", vault: "vault", backing: "backing", exchange: "exchange", symbol: "ysALPHA", backingSymbol: "TESTUSD", name: "Alpha" };
const data = { state: { end: 9999999999n, liquidity: 1000n*U, reserved: 0n, total_lp: 1000n*U, terms: { collateral_bps: 15000, junior_fee_bps: 1000, creator_fee_bps: 100 } }, nav: U, inventory: { backing: 1000n*U, receipts: 1000n*U }, readAt: 0 };
const wallet = { shares: 10n*U, backing: 100n*U, testusd: 100n*U, funded: true, trusted: true, claimed: true, provider: {}, positions: [] };
const text = r => JSON.stringify(r.toJSON());
const findButton = (r, label) => r.root.findAllByType("button").find(b => [b.props.children].flat().join("").includes(label));
async function start(overrides = {}) {
  globalThis.testApi = {
    markets: async () => [market], connect: async () => "wallet-A",
    readMarket: async () => data, readAccount: async () => wallet,
    view: async (_, method) => method === "inventory" ? data.inventory : 100n*U,
    ...overrides,
  };
  let r;
  await act(async () => { r = create(React.createElement(App)); });
  mounted.push(r);
  await act(async () => findButton(r, "Connect Freighter").props.onClick());
  return r;
}
// Unmount even after a failed assertion so the 20-second refresh timer stops.
const mounted = [];
afterEach(async () => {
  for (const r of mounted.splice(0)) await act(async () => r.unmount());
});

test("an unfunded wallet keeps pool terms and actions readable and offers Friendbot", async () => {
  let funded = false, friendbot = [];
  const r = await start({
    readAccount: async () => ({ ...wallet, shares: 0n, backing: 0n, testusd: 0n, trusted: false, claimed: false, funded }),
    fundWithFriendbot: async (address) => { friendbot.push(address); funded = true; },
  });
  assert.match(text(r), /150%/, "pool terms remain visible");
  assert.match(text(r), /not funded on Stellar Testnet yet/);
  assert.doesNotMatch(text(r), /Not Found/);
  assert.equal(findButton(r, "Review buy").props.disabled, false);
  const link = r.root.findAllByType("a").find((a) => a.props.href?.startsWith("https://friendbot.stellar.org/?addr="));
  assert.equal(link.props.href, "https://friendbot.stellar.org/?addr=wallet-A");
  await act(async () => findButton(r, "Review buy").props.onClick());
  assert.match(text(r), /Fund it with test XLM from Friendbot, then review again/);
  assert.equal(findButton(r, "Confirm in Freighter"), undefined, "unfunded wallets cannot reach signing");
  await act(async () => findButton(r, "Fund with Friendbot").props.onClick());
  assert.deepEqual(friendbot, ["wallet-A"]);
  assert.match(text(r), /Wallet funded with valueless test XLM/);
  assert.doesNotMatch(text(r), /not funded on Stellar Testnet yet/);
});

test("a failed wallet read reports the wallet only and keeps public pool data", async () => {
  const r = await start({ readAccount: async () => { throw new Error("Bad Gateway"); } });
  assert.match(text(r), /150%/);
  assert.match(text(r), /Wallet balances could not be read\. Bad Gateway/);
  assert.equal(findButton(r, "Review buy").props.disabled, false);
});

import { after, test } from "node:test";
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
const temp = mkdtempSync(resolve("node_modules/.transaction-recovery-test-"));
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
      export const markets=(...args)=>globalThis.testApi.markets(...args);
      export const connect=(...args)=>globalThis.testApi.connect(...args);
      export const readMarket=(...args)=>globalThis.testApi.readMarket(...args);
      export const readAccount=(...args)=>globalThis.testApi.readAccount(...args);
      export const view=(...args)=>globalThis.testApi.view(...args);
      export const transact=(...args)=>globalThis.testApi.transact(...args);
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
const data = { state: { end: 9999999999n, liquidity: 1000n*U, reserved: 0n, total_lp: 1000n*U, terms: { collateral_bps: 15000, junior_fee_bps: 1000, creator_fee_bps: 100 } }, nav: U, inventory: { backing: 1000n*U, receipts: 1000n*U } };
const wallet = { shares: 10n*U, backing: 100n*U, provider: {}, positions: [] };
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
  await act(async () => findButton(r, "Connect Freighter").props.onClick());
  await act(async () => findButton(r, "Review buy").props.onClick());
  assert.ok(findButton(r, "Confirm in Freighter"));
  return r;
}

test("a broadcast review is consumed when confirmation is unavailable", async () => {
  let submissions = 0;
  const r = await start({ transact: async (_owner, _contract, _method, _args, submitted) => {
    submissions++;
    submitted("known-transaction-hash");
    throw new Error("Confirmation unavailable; check the explorer before retrying.");
  } });
  await act(async () => findButton(r, "Confirm in Freighter").props.onClick());
  assert.equal(submissions, 1);
  assert.equal(findButton(r, "Confirm in Freighter"), undefined);
  assert.match(text(r), /known-transaction-hash/);
  assert.match(text(r), /Confirmation unavailable/);
  assert.ok(findButton(r, "Review buy"), "a new deliberate review remains available");
  await act(async () => r.unmount());
});

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
const temp = mkdtempSync(resolve("node_modules/.fresh-wallet-test-"));
const result = await build({
  entryPoints: ["apps/web/src/v3.ts"], bundle: true, format: "esm", platform: "node", packages: "external", write: false,
  plugins: [{ name: "funding-boundary", setup(b) {
    b.onResolve({ filter: /^\.\/stellar$/ }, () => ({ path: "stellar", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `
      export const config={backing:"TESTUSD"};
      export const readFunding=async()=>({backing:0n,trusted:false,claimed:false});
      export const addressSc=x=>x;
      export const view=(...args)=>globalThis.testView(...args);
    ` }));
  } }],
});
const path = join(temp, "api.mjs");
writeFileSync(path, result.outputFiles[0].text);
const { readAccount } = await import(pathToFileURL(path).href);
after(() => { rmSync(temp, { recursive: true, force: true }); delete globalThis.testView; });
test("fresh direct wallet reads without an unavailable SAC trustline", async () => {
  globalThis.testView = async (contract, method) => {
    if (contract === "TESTUSD") throw Error("Missing trustline");
    if (method === "positions") return [];
    if (method === "provider") return { shares: 0n };
    return 0n;
  };
  const wallet = await readAccount({ backing: "TESTUSD", vault: "vault", pool: "pool" }, "fresh");
  assert.equal(wallet.trusted, false);
  assert.equal(wallet.testusd, 0n);
  assert.equal(wallet.backing, 0n);
});
test("nested backing still reads its distinct receipt balance", async () => {
  globalThis.testView = async (contract, method) => {
    if (contract === "inner-vault" && method === "balance") return 125n;
    if (method === "positions") return [];
    if (method === "provider") return { shares: 0n };
    return 0n;
  };
  const wallet = await readAccount({ backing: "inner-vault", vault: "vault", pool: "pool" }, "fresh");
  assert.equal(wallet.backing, 125n);
  assert.equal(wallet.testusd, 0n);
});

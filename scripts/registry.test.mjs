import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { StrKey } from "@stellar/stellar-sdk";
const temp = mkdtempSync(resolve("node_modules/.registry-test-"));
const result = await build({
  entryPoints: ["apps/web/src/v3.ts"], bundle: true, format: "esm", platform: "node", packages: "external", write: false,
  plugins: [{ name: "registry-boundary", setup(b) {
    b.onResolve({ filter: /^\.\/stellar$/ }, () => ({ path: "stellar", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `
      export const config={backing:"TESTUSD"};
      export const addressSc=x=>x, idSc=x=>x;
      export const view=(...args)=>globalThis.testView(...args);
    ` }));
  } }],
});
const path = join(temp, "api.mjs");
writeFileSync(path, result.outputFiles[0].text);
const api = await import(pathToFileURL(path).href);
after(() => { rmSync(temp, { recursive: true, force: true }); delete globalThis.testView; });
const catalog = JSON.parse(readFileSync("config/markets.json", "utf8"));
const factory = catalog.factory;
const featured = catalog.markets.map((m) => m.pool);
const [alpha, beta] = catalog.markets;
const pool = (n) => StrKey.encodeContract(Buffer.alloc(32, n + 1));
const listing = (n, vault = alpha.vault, creator = "G-creator") => ({ pool: pool(n), creator, vault, end: 1n });
const u32 = (v) => v.u32;
function registry({ count, live, all, limits = { max_live: 50, max_per_creator: 5 } }) {
  const calls = [];
  globalThis.testView = async (id, method, args = []) => {
    calls.push([id, method, ...args.map(u32)]);
    assert.equal(id, factory);
    if (method === "state") return { count, ...limits };
    if (method === "live_pools") return live;
    if (method === "pools") {
      const [start, limit] = args.map(u32);
      return all.slice(start, Math.min(start + Math.min(limit, 25), count));
    }
    throw Error(`unexpected ${method}`);
  };
  return calls;
}

test("paged registry lists featured, unmatured and newest pools with bounded reads", async () => {
  const all = [
    ...catalog.markets.map((m) => ({ pool: m.pool, creator: "sponsor", vault: m.vault, end: 9n })),
    ...Array.from({ length: 40 }, (_, i) => listing(i, i % 2 ? beta.vault : alpha.vault)),
  ];
  // An old long-term pool is still unmatured but outside the newest page.
  const calls = registry({ count: all.length, live: [all[0], all[3], all[42]], all });
  const markets = await api.markets();
  assert.deepEqual(calls, [
    [factory, "state"],
    [factory, "live_pools"],
    [factory, "pools", all.length - 25, 25],
  ]);
  assert.deepEqual(markets.slice(0, 3).map((m) => m.pool), featured);
  assert.equal(markets[3].pool, pool(39), "live pools first, newest first");
  assert.equal(markets[4].pool, pool(0), "old unmatured pool kept");
  assert.equal(markets.length, 3 + 1 + 25, "deduplicated and bounded");
  assert.equal(new Set(markets.map((m) => m.pool)).size, markets.length);
  const nested = markets.find((m) => m.pool === pool(39));
  assert.equal(nested.vault, beta.vault);
  assert.equal(nested.name, `Community pool · ${beta.symbol}`);
  registry({ count: 1, live: [listing(1, "unknown-vault")], all: [] });
  await assert.rejects(api.markets(), /unsupported vault/);
});

test("factories without paging still list every registered pool", async () => {
  const reads = [];
  globalThis.testView = async (id, method) => {
    reads.push([id, method]);
    if (id === factory) return { pools: [...featured, pool(7)] };
    return { vault: alpha.vault };
  };
  const markets = await api.markets();
  assert.deepEqual(markets.map((m) => m.pool), [...featured, pool(7)]);
  assert.deepEqual(reads, [[factory, "state"], [pool(7), "state"]]);
  assert.equal(await api.creationLimit("G-anyone"), "");
});

test("creation review explains the factory's live pool limits", async () => {
  const mine = Array.from({ length: 5 }, (_, i) => listing(i, alpha.vault, "G-me"));
  registry({ count: 5, live: mine, all: mine });
  assert.match(await api.creationLimit("G-me"), /Each wallet can have 5 unmatured pools/);
  assert.equal(await api.creationLimit("G-other"), "");
  const full = Array.from({ length: 50 }, (_, i) => listing(i, alpha.vault, `G-${i}`));
  registry({ count: 50, live: full, all: full });
  assert.match(await api.creationLimit("G-other"), /already has 50 unmatured pools/);
});

test("linked pools outside the listing need a factory record", async () => {
  globalThis.testView = async (id, method, args) => {
    assert.deepEqual([id, method], [factory, "record"]);
    if (args[0] === pool(1)) return { vault: beta.vault };
    throw Error("unregistered pool");
  };
  const found = await api.registeredMarket(pool(1));
  assert.equal(found.pool, pool(1));
  assert.equal(found.vault, beta.vault);
  assert.equal(await api.registeredMarket(pool(2)), null);
  assert.equal(await api.registeredMarket("not-a-contract"), null);
  assert.equal((await api.registeredMarket(featured[0])).name, alpha.name);
});

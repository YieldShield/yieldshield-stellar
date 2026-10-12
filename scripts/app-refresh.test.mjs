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
// Capture the App's 20-second refresh so tests can run it on demand.
const intervals = [];
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms, ...args) => {
  intervals.push(fn);
  return realSetInterval(fn, ms, ...args);
};
// Every network-facing function of ./v3 delegates to the current test's fake.
const exported = [
  "markets", "connect", "readMarket", "readAccount", "view", "transact",
  "trust", "fundWithFriendbot", "restore", "preflight",
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
  globalThis.setInterval = realSetInterval;
  rmSync(temp, { recursive: true, force: true });
  for (const key of ["IS_REACT_ACT_ENVIRONMENT", "location", "HTMLElement", "document", "window", "testApi"]) delete globalThis[key];
});
const U = 10_000_000n;
const market = { pool: "pool", vault: "vault", backing: "backing", exchange: "exchange", symbol: "ysALPHA", backingSymbol: "TESTUSD", name: "Alpha" };
const data = { state: { end: 9999999999n, liquidity: 1000n*U, reserved: 0n, total_lp: 1000n*U, terms: { collateral_bps: 15000, junior_fee_bps: 1000, creator_fee_bps: 100 } }, nav: U, inventory: { backing: 1000n*U, receipts: 1000n*U }, readAt: 0 };
const wallet = { shares: 10n*U, backing: 100n*U, testusd: 100n*U, funded: true, trusted: true, claimed: true, provider: {}, positions: [] };
const text = r => JSON.stringify(r.toJSON());
const findButton = (r, label) => r.root.findAllByType("button").find(b => [b.props.children].flat().join("").includes(label));
async function start(overrides = {}, options = {}) {
  globalThis.testApi = {
    markets: async () => [market], connect: async () => "wallet-A",
    readMarket: async () => data, readAccount: async () => wallet,
    view: async (_, method) => method === "inventory" ? data.inventory : 100n*U,
    preflight: async () => ({ restore: false }),
    ...overrides,
  };
  let r;
  await act(async () => { r = create(React.createElement(App), options); });
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

test("archived pool storage offers a restore and reloads after it", async () => {
  let archived = true;
  const restores = [];
  const preamble = { minResourceFee: "200000" };
  const r = await start({
    readMarket: async () => {
      if (archived) throw Object.assign(new Error("Unable to read state: contract storage is archived – restore needed."), { restorePreamble: preamble });
      return data;
    },
    restore: async (address, given) => { restores.push([address, given]); archived = false; return { hash: "restore-hash" }; },
  });
  assert.match(text(r), /archived – restore needed/);
  assert.doesNotMatch(text(r), /Pool data could not be read/);
  await act(async () => findButton(r, "Restore archived storage").props.onClick());
  assert.deepEqual(restores, [["wallet-A", preamble]]);
  assert.match(text(r), /Archived contract storage restored/);
  assert.match(text(r), /restore-hash/);
  assert.doesNotMatch(text(r), /restore needed/);
  assert.match(text(r), /150%/);
});

test("review simulates the exact invocation and shows contract failures before signing", async () => {
  const simulated = [];
  const r = await start({
    preflight: async (...args) => {
      simulated.push(args);
      throw new Error("Your token balance is too low for this amount. (balance is not sufficient to spend)");
    },
  });
  await act(async () => findButton(r, "Review buy").props.onClick());
  assert.equal(simulated.length, 1);
  const [owner, contract, method, args] = simulated[0];
  assert.deepEqual([owner, contract, method], ["wallet-A", "exchange", "buy"]);
  assert.equal(args.length, 4, "the reviewed arguments, including limits and deadline, are simulated");
  assert.match(text(r), /Your token balance is too low for this amount\. \(balance is not sufficient to spend\)/);
  assert.doesNotMatch(text(r), /HostError/);
  assert.equal(findButton(r, "Confirm in Freighter"), undefined);
});

test("a review that needs archived storage says so before signing", async () => {
  const r = await start({ preflight: async () => ({ restore: true }) });
  await act(async () => findButton(r, "Review buy").props.onClick());
  assert.ok(findButton(r, "Confirm in Freighter"));
  assert.match(text(r), /Restored first: one extra Freighter signature/);
});

test("known balances stop a review before any simulation", async () => {
  let simulated = 0;
  const r = await start({
    readAccount: async () => ({ ...wallet, backing: 50n * U }),
    preflight: async () => { simulated++; return { restore: false }; },
  });
  await act(async () => findButton(r, "Review buy").props.onClick());
  assert.match(text(r), /This needs 100\.0000000 TESTUSD, but your wallet has 50\.0000000 TESTUSD/);
  assert.equal(simulated, 0);
  assert.equal(findButton(r, "Confirm in Freighter"), undefined);
});

test("a buy's signed maximum payment never exceeds the known wallet balance", async () => {
  let reviewed;
  const r = await start({
    readAccount: async () => ({ ...wallet, backing: 1002n * U / 10n }),
    preflight: async (_owner, _contract, _method, args) => { reviewed = args; return { restore: false }; },
  });
  await act(async () => findButton(r, "Review buy").props.onClick());
  assert.equal(reviewed[2], 1002n * U / 10n, "maximum payment capped at 100.2 instead of 100.5");
  assert.match(text(r), /Maximum payment.*100\.2000000/);
});

test("a reset testnet is reported as a reset, not as a connection problem", async () => {
  globalThis.testApi = {
    markets: async () => { throw Object.assign(new Error("Contract CA7DG5…3NTJR no longer exists on Stellar Testnet. The testnet may have reset; this demo must be redeployed before it can be used."), { testnetReset: true }); },
  };
  let r;
  await act(async () => { r = create(React.createElement(App)); });
  mounted.push(r);
  assert.match(text(r), /The testnet may have reset; this demo must be redeployed/);
  assert.doesNotMatch(text(r), /Check your connection/);
});

test("a failed background refresh keeps the last values marked stale and the open review", async () => {
  let failing = false;
  const r = await start({
    readMarket: async () => {
      if (failing) throw new Error("socket hang up");
      return { ...data, readAt: Date.now() };
    },
  });
  await act(async () => findButton(r, "Review buy").props.onClick());
  assert.ok(findButton(r, "Confirm in Freighter"));
  failing = true;
  await act(async () => intervals.at(-1)());
  assert.match(text(r), /Pool data could not be read\. socket hang up/);
  assert.match(text(r), /Stale: showing the last values read successfully at/);
  assert.match(text(r), /150%/, "last good pool terms stay visible");
  assert.match(text(r), /100\.0000000/, "last good wallet balances stay visible");
  assert.ok(findButton(r, "Confirm in Freighter"), "the open review survives a failed background read");
  failing = false;
  await act(async () => intervals.at(-1)());
  assert.doesNotMatch(text(r), /Stale:|could not be read/);
});

test("focus moves to the transaction result once the review is consumed", async () => {
  const focused = [];
  const createNodeMock = (element) => ({
    focus: () => focused.push(String(element.props.className || element.type)),
  });
  const r = await start({
    transact: async (_owner, _contract, _method, _args, submitted) => {
      submitted("hash-1");
      focused.push("-- broadcast");
      return { hash: "hash-1", value: null };
    },
  }, { createNodeMock });
  await act(async () => findButton(r, "Review buy").props.onClick());
  assert.equal(focused.at(-1), "review", "the review receives focus when it opens");
  await act(async () => findButton(r, "Confirm in Freighter").props.onClick());
  assert.equal(findButton(r, "Confirm in Freighter"), undefined);
  assert.match(focused.at(-1), /^feedback/, "focus lands on the result, not <body>");
  const feedback = r.root.findAll((n) => n.props.role === "status" && n.props.tabIndex === -1);
  assert.equal(feedback.length, 1, "the feedback region is focusable");
  assert.match(text(r), /confirmed on Stellar Testnet/);
});

test("an archived registry keeps its restore action after a wallet connects", async () => {
  const restores = [];
  let archived = true;
  globalThis.testApi = {
    markets: async () => {
      if (archived) throw Object.assign(new Error("Unable to read state: contract storage is archived – restore needed."), { restorePreamble: { registry: true } });
      return [market];
    },
    connect: async () => "wallet-A",
    readMarket: async () => data, readAccount: async () => wallet,
    restore: async (address, preamble) => { restores.push([address, preamble]); archived = false; return { hash: "restore-hash" }; },
  };
  let r;
  await act(async () => { r = create(React.createElement(App)); });
  mounted.push(r);
  assert.match(text(r), /market registry is archived/);
  await act(async () => findButton(r, "Connect Freighter").props.onClick());
  await act(async () => findButton(r, "Restore archived storage").props.onClick());
  assert.deepEqual(restores, [["wallet-A", { registry: true }]]);
  assert.match(text(r), /150%/, "markets load after the restore");
  assert.doesNotMatch(text(r), /restore needed|registry is archived/);
});

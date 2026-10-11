import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.location = { href: "http://localhost/provide" };
const temp = mkdtempSync(resolve("node_modules/.ui-refresh-test-"));
const output = await build({
  stdin: {
    contents:
      'export {PositionPage,Portfolio} from "./apps/web/src/PortfolioPages.tsx"; export {Activity} from "./apps/web/src/ManagementPages.tsx"; export {Provide} from "./apps/web/src/ProtectionPages.tsx"; export {Assets} from "./apps/web/src/TradingPages.tsx";',
    resolveDir: resolve("."),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  write: false,
});
const modulePath = join(temp, "components.mjs");
writeFileSync(modulePath, output.outputFiles[0].text);
const { PositionPage, Portfolio, Activity, Provide, Assets } = await import(
  pathToFileURL(modulePath).href
);
after(() => {
  rmSync(temp, { recursive: true, force: true });
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  delete globalThis.location;
});
const U = 10_000_000n;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const market = {
  pool: "pool-one",
  vault: "vault-one",
  backing: "backing",
  exchange: "exchange",
  symbol: "ysALPHA",
  name: "Reserve Alpha",
  backingSymbol: "TESTUSD",
  description: "Test market",
};
const position = {
  id: 1n,
  owner: "wallet-A",
  shares: 100n * U,
  claim: 100n * U,
  reserved: 150n * U,
  opened: 1n,
  closed: false,
};
const wallet = {
  positions: [],
  provider: {
    shares: 0n,
    rewards: 0n,
    inventory: 0n,
    notice_shares: 0n,
    notice_at: 0n,
  },
  credit: 10n * U,
  shares: 100n * U,
  backing: 100n * U,
  testusd: 100n * U,
  trusted: true,
  claimed: true,
};
const data = {
  state: {
    end: 9999999999n,
    liquidity: 1000n * U,
    reserved: 0n,
    terms: {
      collateral_bps: 15000,
      junior_fee_bps: 1000,
      creator_fee_bps: 100,
    },
  },
  nav: U,
  assets: 1000n * U,
  supply: 1000n * U,
  readAt: Date.now(),
};
function context(overrides = {}) {
  return {
    api: {
      view: async () => position,
      idSc: (v) => v,
      addressSc: (v) => v,
      amountSc: (v) => v,
      boolSc: (v) => v,
    },
    address: "wallet-A",
    market,
    data,
    wallet,
    busy: false,
    href: (p) => p,
    clear: () => {},
    review: async () => {},
    ...overrides,
  };
}
const text = (renderer) => JSON.stringify(renderer.toJSON());
const amountInput = (renderer) =>
  renderer.root.findByProps({
    "aria-label": "Receipts to close (partial or full)",
  });
const button = (renderer, label) =>
  renderer.root.findAllByType("button").find((b) => b.props.children === label);
async function mount(component, props) {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(component, props));
  });
  return renderer;
}
async function unmount(renderer) {
  await act(async () => renderer.unmount());
}

test("nested backing acquisition names its destination and keeps the exact provider return draft", async () => {
  const nested = { ...market, pool: "nested-pool", vault: "nested-vault", symbol: "ysNEST", backing: market.vault, backingSymbol: market.symbol, name: "Receipt Reserve" };
  const returnUrl = "/provide?amount=12.3456789&pool=nested-pool";
  globalThis.location.href = `http://localhost/assets?pool=pool-one&returnTo=${encodeURIComponent(returnUrl)}`;
  const props = context({ address: "", wallet: undefined, api: { ...context().api, deployment: { markets: [market, nested] } } });
  const r = await mount(Assets, props);
  const returnLink = r.root.findAllByType("a").find((a) => a.props.href === returnUrl);
  assert.ok(returnLink, "return retains exact original pool and seven-decimal amount");
  assert.match(text(r), /Acquire.*ysALPHA.*backing for.*Receipt Reserve.*then return to.*Provide/);
  assert.equal(r.root.findByProps({ label: "Backing to deposit" }).props.suffix, market.backingSymbol);
  await act(async () => r.update(React.createElement(Assets, { ...props, market: { ...market, vault: "other-vault" } })));
  assert.doesNotMatch(text(r), /Acquire.*ysALPHA.*backing for.*Receipt Reserve/, "guidance must disappear if selected vault no longer supplies that backing");
  await unmount(r);
  globalThis.location.href = "http://localhost/provide";
});

test("Provide keeps public terms visible and shows personal balances and separate claims only after connection", async () => {
  let reviewed;
  const api = { ...context().api, deployment: { markets: [market] } };
  const props = context({
    api,
    wallet: { ...wallet, provider: { ...wallet.provider, shares: 100n * U, rewards: 3n * U, inventory: 5n * U } },
    review: async (make) => { reviewed = await make(api); },
  });
  const r = await mount(Provide, { ...props, address: "", wallet: undefined });
  assert.match(text(r), /Connect your wallet to view provider balances and claims/);
  assert.match(text(r), /Deposits and withdrawals pause while holders are protected/);
  assert.match(text(r), /lower-value receipts/);
  assert.match(text(r), /Pool terms/);
  assert.match(text(r), /Settlement queue/);
  assert.equal(r.root.findAllByProps({ "aria-label": "Backing to provide" }).length, 1);
  assert.equal(button(r, "Review fee claim"), undefined);
  assert.equal(button(r, "Review inventory claim"), undefined);
  assert.doesNotMatch(text(r), /Your LP shares/);
  await act(async () => r.update(React.createElement(Provide, props)));
  assert.match(text(r), /Your LP shares/);
  assert.match(text(r), /separate from principal/);
  assert.match(text(r), /recovered principal, not yield/);
  assert.equal(button(r, "Review fee claim").props.disabled, false);
  assert.equal(button(r, "Review inventory claim").props.disabled, false);
  await act(async () => button(r, "Review fee claim").props.onClick());
  assert.equal(reviewed.method, "claim_rewards");
  assert.deepEqual(reviewed.lines, [["Amount", "3.0000000 ysALPHA"]]);
  await act(async () => button(r, "Review inventory claim").props.onClick());
  assert.equal(reviewed.method, "claim_inventory");
  assert.deepEqual(reviewed.lines, [["Amount", "5.0000000 ysALPHA"]]);
  assert.deepEqual(reviewed.args, ["wallet-A", "wallet-A"]);
  await unmount(r);
});

test("background position refresh retains the mounted input and dirty partial-exit draft", async () => {
  let next;
  const api = {
    ...context().api,
    view: () => (next ? next.promise : Promise.resolve(position)),
  };
  let props = context({ api, id: "1" });
  const r = await mount(PositionPage, props);
  const input = amountInput(r);
  await act(async () =>
    input.props.onChange({ target: { value: "12.2500001" } }),
  );
  next = deferred();
  await act(async () =>
    r.update(
      React.createElement(PositionPage, { ...props, wallet: { ...wallet } }),
    ),
  );
  assert.equal(
    amountInput(r),
    input,
    "background read must not unmount the input",
  );
  assert.equal(input.props.value, "12.2500001");
  assert.match(text(r), /Refreshing position details/);
  await act(async () => next.resolve({ ...position, shares: 80n * U }));
  assert.equal(amountInput(r), input);
  assert.equal(
    input.props.value,
    "12.2500001",
    "new chain balances must not replace edited amount",
  );
  next = undefined;
  await act(async () =>
    r.update(
      React.createElement(PositionPage, { ...props, address: "wallet-B" }),
    ),
  );
  assert.equal(
    amountInput(r).props.value,
    "100.0000000",
    "account change must reinitialize the draft",
  );
  await unmount(r);
});

test("transfer and credit destinations remain independent and reset on position identity change", async () => {
  let reviewed;
  const props = context({
    id: "1",
    review: async (make) => {
      reviewed = await make(props.api);
    },
  });
  const r = await mount(PositionPage, props);
  let inputs = r.root.findAllByType("input");
  const transfer = inputs.find((i) => i.props.placeholder === "G… or C…");
  const credit = inputs.find((i) => i.props.placeholder === "wallet-A");
  await act(async () =>
    transfer.props.onChange({ target: { value: "wallet-new-owner" } }),
  );
  assert.equal(credit.props.value, "");
  await act(async () => button(r, "Review backing claim").props.onClick());
  assert.deepEqual(reviewed.args, ["wallet-A", "wallet-A"]);
  await act(async () =>
    credit.props.onChange({ target: { value: "wallet-credit-destination" } }),
  );
  await act(async () => button(r, "Review ownership transfer").props.onClick());
  assert.deepEqual(reviewed.args, [1n, "wallet-new-owner"]);
  await act(async () =>
    r.update(React.createElement(PositionPage, { ...props, id: "2" })),
  );
  inputs = r.root.findAllByType("input");
  assert.equal(
    inputs.find((i) => i.props.placeholder === "G… or C…").props.value,
    "",
  );
  assert.equal(
    inputs.find((i) => i.props.placeholder === "wallet-A").props.value,
    "",
  );
  await unmount(r);
});

test("invalid position IDs show recovery instead of silently rendering the intentional credit route", async () => {
  let calls = 0;
  const api = {
    ...context().api,
    view: async () => {
      calls++;
      return position;
    },
  };
  const props = context({ api, id: "not-a-number" });
  const r = await mount(PositionPage, props);
  assert.match(text(r), /Invalid position link/);
  assert.doesNotMatch(text(r), /Maturity backing credit/);
  assert.equal(calls, 0);
  await act(async () =>
    r.update(React.createElement(PositionPage, { ...props, id: "credit" })),
  );
  assert.match(text(r), /Maturity backing credit/);
  assert.doesNotMatch(text(r), /Invalid position link/);
  assert.equal(calls, 0);
  await act(async () =>
    r.update(
      React.createElement(PositionPage, {
        ...props,
        id: "18446744073709551616",
      }),
    ),
  );
  assert.match(text(r), /Invalid position link/);
  assert.equal(calls, 0);
  await unmount(r);
});

test("portfolio retains same-wallet rows through refresh and counts receipt-only entitlements", async () => {
  let next;
  const onlyRewards = {
    ...wallet,
    credit: 0n,
    provider: { ...wallet.provider, rewards: U },
  };
  const api = {
    ...context().api,
    readAccount: () => (next ? next.promise : Promise.resolve(onlyRewards)),
  };
  const props = context({ api, markets: [market] });
  const r = await mount(Portfolio, props);
  assert.match(text(r), /Gain fees/);
  assert.doesNotMatch(text(r), /No positions found/);
  const row = r.root.findByProps({ className: "position-row" });
  next = deferred();
  await act(async () =>
    r.update(
      React.createElement(Portfolio, { ...props, wallet: { ...wallet } }),
    ),
  );
  assert.equal(r.root.findByProps({ className: "position-row" }), row);
  assert.match(text(r), /Refreshing your portfolio/);
  await act(async () => next.reject(new Error("read outage")));
  assert.equal(r.root.findByProps({ className: "position-row" }), row);
  assert.match(text(r), /Previous values may be out of date/);
  assert.doesNotMatch(text(r), /No positions found/);
  next = deferred();
  await act(async () =>
    r.update(React.createElement(Portfolio, { ...props, address: "wallet-B" })),
  );
  assert.equal(
    r.root.findAllByProps({ className: "position-row" }).length,
    0,
    "old wallet rows must not remain on account change",
  );
  await unmount(r);
});

test("activity distinguishes pending, empty, stale and changed-pool reads", async () => {
  let next = deferred();
  const api = { ...context().api, events: () => next.promise };
  const props = context({ api });
  const r = await mount(Activity, props);
  assert.match(text(r), /Reading recent events/);
  assert.doesNotMatch(text(r), /No events returned/);
  await act(async () =>
    next.resolve([
      {
        id: "event-one",
        hash: "tx-one",
        ledger: 10,
        time: "now",
        topic: "protect",
      },
    ]),
  );
  const row = r.root.findByProps({ className: "position-row" });
  next = deferred();
  await act(async () =>
    r.update(
      React.createElement(Activity, { ...props, wallet: { ...wallet } }),
    ),
  );
  assert.equal(r.root.findByProps({ className: "position-row" }), row);
  assert.match(text(r), /Refreshing recent events/);
  await act(async () => next.reject(new Error("outage")));
  assert.equal(r.root.findByProps({ className: "position-row" }), row);
  assert.match(text(r), /last successful read/);
  assert.doesNotMatch(text(r), /No events returned/);
  next = deferred();
  await act(async () =>
    r.update(
      React.createElement(Activity, {
        ...props,
        market: { ...market, pool: "pool-two" },
      }),
    ),
  );
  assert.equal(r.root.findAllByProps({ className: "position-row" }).length, 0);
  assert.doesNotMatch(text(r), /No events returned/);
  await act(async () => next.resolve([]));
  assert.match(text(r), /No events returned/);
  await unmount(r);
});

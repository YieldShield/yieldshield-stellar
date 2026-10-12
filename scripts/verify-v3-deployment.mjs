// Read-only readback of the v3 deployment recorded in config/markets.json
// (and the legacy contracts it shares). Evidence goes to that deployment's
// evidence directory. `--extend` first renews whatever is below the TTL
// threshold (same policy as `node scripts/extend-testnet.mjs --broadcast`).
import fs from "node:fs";
import assert from "node:assert/strict";
import {
  assertTestnet,
  cliRun,
  readJson,
  save,
  server,
  view,
  scAddress,
  registryPools,
} from "./testnet.mjs";
import {
  MIN_REMAINING,
  RENEW_BELOW,
  planRenewal,
  readLifetimes,
  renewLifetimes,
  ttlTargets,
} from "./ttl.mjs";
await assertTestnet();
const m = readJson("config/markets.json"),
  l = readJson("config/testnet.json"),
  evidence = m.evidence || "v3";
const registry = await view(m.factory, "state");
const registered = await registryPools(m.factory);
const previousPools = m.previous?.factory
  ? await registryPools(m.previous.factory)
  : [];
const targets = ttlTargets({
  markets: m,
  legacy: l,
  registryPools: registered,
  previousPools,
});
const renewal = process.argv.includes("--extend")
  ? await renewLifetimes({
      server,
      targets,
      run: cliRun,
      broadcast: true,
      dir: `${evidence}/ttl`,
      exists: (label) => fs.existsSync(`docs/evidence/${label}.json`),
    })
  : undefined;
const lifetimes = await readLifetimes(server, targets);
const rows = planRenewal(lifetimes.rows, lifetimes.latestLedger);
for (const row of rows) {
  assert.ok(
    row.liveUntilLedger != null,
    `${row.kind} is missing on chain: the testnet may have reset or the entry was evicted`,
  );
  if (row.type === "instance" && row.hash)
    assert.equal(row.executable, row.hash, `${row.kind} executable`);
  assert.ok(
    row.remaining >= MIN_REMAINING,
    `${row.kind} has ${row.remaining} ledgers left; renewal is overdue (node scripts/extend-testnet.mjs --broadcast)`,
  );
}
const fields = ({ kind, id, hash, liveUntilLedger, remaining, action }) => ({
  kind,
  ...(id ? { id } : {}),
  ...(hash ? { hash } : {}),
  latestLedger: lifetimes.latestLedger,
  liveUntilLedger,
  remaining,
  renewalDue: action !== "ok",
});
const records = rows.filter((r) => r.type === "instance").map(fields);
const codes = rows.filter((r) => r.type === "code").map(fields);
const pools = [];
for (const id of registered) {
  const s = await view(id, "state"),
    cash = await view(s.backing, "balance", [scAddress(id)]),
    receipts = await view(s.vault, "balance", [scAddress(id)]);
  assert.ok(s.liquidity >= s.reserved);
  assert.ok(cash >= s.liquidity + s.credit_total);
  assert.ok(
    receipts >=
      s.reward_balance +
        s.inventory_balance +
        s.creator_rewards +
        s.protocol_rewards,
  );
  pools.push({ id, state: s, cash, receipts });
}
// Provider deposits require no open holder liabilities and an open admission
// window (pool-v3 `provide`). Holders protecting receipts is normal use, so
// this is reported, not asserted.
const now = Math.floor(Date.now() / 1000);
const featured = [];
for (const row of m.markets) {
  assert.ok(registered.includes(row.pool), `${row.key} pool is registered`);
  const state = pools.find((p) => p.id === row.pool).state;
  assert.equal(await view(row.vault, "asset"), row.backing);
  assert.equal(await view(row.vault, "symbol"), row.symbol);
  const market = await view(row.exchange, "state");
  assert.equal(market.backing, row.backing);
  assert.equal(market.vault, row.vault);
  assert.equal(market.fee_bps, 30);
  featured.push({
    key: row.key,
    pool: row.pool,
    active: state.active,
    end: state.end,
    providerEntryOpen: state.active === 0 && now + 60 < Number(state.end),
  });
}
save(`docs/evidence/${evidence}/deployment-check.json`, {
  at: new Date().toISOString(),
  ttlPolicy: { renewBelow: RENEW_BELOW, minRemaining: MIN_REMAINING },
  renewal,
  records,
  codes,
  registry,
  registered,
  pools,
  featured,
});
console.log(
  JSON.stringify({
    verifiedContracts: records.length,
    verifiedCode: codes.length,
    pools: pools.length,
    lowestRemainingLedgers: Math.min(...rows.map((r) => r.remaining)),
    renewalDue: rows.filter((r) => r.action !== "ok").map((r) => r.kind),
    providerEntryOpen: Object.fromEntries(
      featured.map((f) => [f.key, f.providerEntryOpen]),
    ),
    allFeaturedProviderEntryOpen: featured.every((f) => f.providerEntryOpen),
  }),
);

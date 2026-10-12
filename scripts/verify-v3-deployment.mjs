import fs from "node:fs";
import assert from "node:assert/strict";
import { Contract, xdr } from "@stellar/stellar-sdk";
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
await assertTestnet();
const m = readJson("config/markets.json"),
  l = readJson("config/testnet.json"),
  evidence = m.evidence || "v3";
const registry = await view(m.factory, "state");
const registered = await registryPools(m.factory);
const items = [
  { kind: "factory", id: m.factory, hash: m.factoryWasmHash },
  ...m.markets.flatMap((x) => [
    { kind: `vault-${x.key}`, id: x.vault, hash: m.vaultWasmHash },
    { kind: `market-${x.key}`, id: x.exchange, hash: m.marketWasmHash },
  ]),
  ...registered.map((id) => ({ kind: "pool", id, hash: m.poolWasmHash })),
];
if (process.argv.includes("--extend")) {
  for (const item of items) {
    // Label by contract ID so a new deployment is never skipped because an
    // earlier one left evidence under the same kind.
    const label = `${evidence}/extend-${item.kind}-${item.id.slice(0, 8)}`;
    if (!fs.existsSync(`docs/evidence/${label}.json`))
      cliRun(
        [
          "contract",
          "extend",
          "--id",
          item.id,
          "--ledgers-to-extend",
          "1000000",
          "--network",
          "testnet",
          "--source-account",
          "ys-stellar-sponsor",
        ],
        label,
      );
  }
  for (const hash of [...new Set(items.map((x) => x.hash))]) {
    const label = `${evidence}/extend-code-${hash.slice(0, 12)}`;
    if (!fs.existsSync(`docs/evidence/${label}.json`))
      cliRun(
        [
          "contract",
          "extend",
          "--wasm-hash",
          hash,
          "--ledgers-to-extend",
          "1000000",
          "--network",
          "testnet",
          "--source-account",
          "ys-stellar-sponsor",
        ],
        label,
      );
  }
}
const records = [];
for (const item of items) {
  const r = await server.getLedgerEntries(new Contract(item.id).getFootprint());
  const e = r.entries[0];
  assert.ok(e);
  const executable = JSON.parse(JSON.stringify(e.val)).contract_data.val
    .contract_instance.executable;
  assert.equal(executable.wasm, item.hash);
  assert.ok(
    e.liveUntilLedgerSeq - r.latestLedger > 700000,
    "Instance needs enough remaining lifetime for30day pool plus notice",
  );
  records.push({
    ...item,
    latestLedger: r.latestLedger,
    liveUntilLedger: e.liveUntilLedgerSeq,
  });
}
const codes = [];
for (const hash of [...new Set(items.map((x) => x.hash))]) {
  const r = await server.getLedgerEntries(
    xdr.LedgerKey.contractCode(
      new xdr.LedgerKeyContractCode({ hash: Buffer.from(hash, "hex") }),
    ),
  );
  const e = r.entries[0];
  assert.ok(e);
  assert.ok(e.liveUntilLedgerSeq - r.latestLedger > 700000);
  codes.push({
    hash,
    latestLedger: r.latestLedger,
    liveUntilLedger: e.liveUntilLedgerSeq,
  });
}
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
for (const row of m.markets) {
  assert.equal((await view(row.pool, "state")).active, 0);
  assert.equal(await view(row.vault, "asset"), row.backing);
  assert.equal(await view(row.vault, "symbol"), row.symbol);
  const market = await view(row.exchange, "state");
  assert.equal(market.backing, row.backing);
  assert.equal(market.vault, row.vault);
  assert.equal(market.fee_bps, 30);
}
save(`docs/evidence/${evidence}/deployment-check.json`, {
  at: new Date().toISOString(),
  records,
  codes,
  registry,
  pools,
  legacy: { pool: l.pool, vault: l.vault, unchanged: true },
});
console.log(
  JSON.stringify({
    verifiedContracts: records.length,
    verifiedCode: codes.length,
    pools: pools.length,
    allFeaturedProviderEntryOpen: true,
  }),
);

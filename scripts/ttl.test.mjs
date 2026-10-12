import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Contract, xdr } from "@stellar/stellar-sdk";
import {
  EXTEND_TO,
  MIN_REMAINING,
  RENEW_BELOW,
  SIGNER,
  evidenceLabel,
  planRenewal,
  renewLifetimes,
  ttlTargets,
} from "./ttl.mjs";

const markets = JSON.parse(readFileSync("config/markets.json", "utf8"));
const legacy = JSON.parse(readFileSync("config/testnet.json", "utf8"));
const community = "CAMJLANK4LOSOYAHVRBW5I75NZAD3RQC2KM5LQRTPV4UZZYRBYZ2HBSF";
const registryPools = [...markets.markets.map((m) => m.pool), community];

function instanceEntry(id, hash) {
  const executable =
    hash === "stellar_asset"
      ? xdr.ContractExecutable.contractExecutableStellarAsset()
      : xdr.ContractExecutable.contractExecutableWasm(Buffer.from(hash, "hex"));
  return xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: xdr.ExtensionPoint.v0(),
      contract: new Contract(id).address().toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
      val: xdr.ScVal.scvContractInstance(
        new xdr.ScContractInstance({ executable, storage: null }),
      ),
    }),
  );
}

// A fake RPC holding live-until ledgers by key; `extend` mimics the CLI.
function network(latestLedger, liveUntil) {
  const ledger = new Map();
  const targets = ttlTargets({ markets, legacy, registryPools });
  for (const t of targets.instances)
    ledger.set(new Contract(t.id).getFootprint().toXDR("base64"), {
      val: instanceEntry(t.id, t.hash || markets.vaultWasmHash),
      liveUntilLedgerSeq: liveUntil(t.kind),
    });
  for (const c of targets.codes)
    ledger.set(
      xdr.LedgerKey.contractCode(
        new xdr.LedgerKeyContractCode({ hash: Buffer.from(c.hash, "hex") }),
      ).toXDR("base64"),
      { val: null, liveUntilLedgerSeq: liveUntil(c.kind) },
    );
  const calls = [];
  return {
    targets,
    calls,
    ledger,
    server: {
      async getLedgerEntries(...keys) {
        assert.ok(keys.length <= 200);
        return {
          latestLedger,
          entries: keys.flatMap((key) => {
            const e = ledger.get(key.toXDR("base64"));
            return e?.liveUntilLedgerSeq == null ? [] : [{ key, ...e }];
          }),
        };
      },
    },
    run(args, label) {
      calls.push({ args, label });
      const key =
        args[2] === "--wasm-hash"
          ? xdr.LedgerKey.contractCode(
              new xdr.LedgerKeyContractCode({ hash: Buffer.from(args[3], "hex") }),
            )
          : new Contract(args[3]).getFootprint();
      ledger.get(key.toXDR("base64")).liveUntilLedgerSeq =
        latestLedger + Number(args[args.indexOf("--ledgers-to-extend") + 1]);
    },
  };
}

test("renewal targets cover every v3 and legacy instance plus their Wasm code", () => {
  const { instances, codes } = ttlTargets({ markets, legacy, registryPools });
  const ids = instances.map((i) => i.id);
  for (const id of [
    markets.factory,
    ...markets.markets.flatMap((m) => [m.vault, m.exchange, m.pool]),
    community,
    legacy.vault,
    legacy.pool,
    legacy.faucet,
    legacy.backing,
  ])
    assert.ok(ids.includes(id), `${id} is renewed`);
  assert.equal(new Set(ids).size, ids.length, "no duplicate instances");
  // Contracts deployed from the same Wasm (e.g. legacy and v3 vaults from one
  // build) share a single code entry.
  assert.deepEqual(
    codes.map((c) => c.hash).sort(),
    [
      ...new Set([
        markets.factoryWasmHash,
        markets.vaultWasmHash,
        markets.marketWasmHash,
        markets.poolWasmHash,
        legacy.vaultWasmHash,
        legacy.poolWasmHash,
        legacy.faucetWasmHash,
      ]),
    ].sort(),
  );
  assert.equal(
    instances.find((i) => i.id === legacy.backing).hash,
    "stellar_asset",
    "the asset contract has an instance but no Wasm code entry",
  );
});

test("plan extends only below the threshold and restores archived entries", () => {
  const rows = [
    { kind: "fresh", liveUntilLedger: 100 + RENEW_BELOW },
    { kind: "due", liveUntilLedger: 100 + RENEW_BELOW - 1 },
    { kind: "archived", liveUntilLedger: 99 },
    { kind: "gone", liveUntilLedger: null },
  ];
  assert.deepEqual(
    planRenewal(rows, 100).map((r) => [r.kind, r.action]),
    [
      ["fresh", "ok"],
      ["due", "extend"],
      ["archived", "restore"],
      ["gone", "missing"],
    ],
  );
});

test("evidence labels name the contract, so different deployments never collide", () => {
  assert.equal(
    evidenceLabel("2026-12-01", { action: "extend", kind: "factory", id: markets.factory }, undefined, "v3.1/ttl"),
    `v3.1/ttl/2026-12-01/extend-factory-${markets.factory.slice(0, 8)}`,
  );
  assert.equal(
    evidenceLabel("2026-12-01", { action: "extend", kind: "pool-CAMJLANK", id: community }),
    "ttl/2026-12-01/extend-pool-CAMJLANK",
  );
});

test("a factory and pools replaced by --fresh-pools stay covered", () => {
  const replaced = {
    ...markets,
    factory: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    factoryWasmHash: "11".repeat(32),
    poolWasmHash: "22".repeat(32),
    markets: markets.markets.map((m, i) => ({ ...m, pool: ["CAS3J7GYLGXMF6TDJBBYYSE3HQ6BZSSEUQZ3EBZDVUNGBUPKT5TBNNOX", "CBQHNAXSI55GX2GLF3IXHL6O3EPUSCPUA3VIRN22U2CQAXK7I3EVKRRR", "CCJZ5DGASBWQXR5MV2SJZSU3U7NJPJYF3TXUXSRGYWF5HDDBVDGYVUFE"][i] })),
    previous: {
      factory: markets.factory,
      factoryWasmHash: markets.factoryWasmHash,
      poolWasmHash: markets.poolWasmHash,
      pools: Object.fromEntries(markets.markets.map((m) => [m.key, m.pool])),
    },
  };
  const { instances, codes } = ttlTargets({ markets: replaced, legacy, registryPools: [], previousPools: [community] });
  const ids = instances.map((i) => i.id);
  for (const id of [replaced.factory, ...replaced.markets.map((m) => m.pool), markets.factory, ...markets.markets.map((m) => m.pool), community])
    assert.ok(ids.includes(id), `${id} is renewed`);
  assert.equal(instances.find((i) => i.id === markets.factory).kind, "previous-factory");
  assert.equal(instances.find((i) => i.id === community).hash, markets.poolWasmHash);
  const hashes = codes.map((c) => c.hash);
  for (const hash of [replaced.factoryWasmHash, replaced.poolWasmHash, markets.factoryWasmHash, markets.poolWasmHash])
    assert.ok(hashes.includes(hash), `code ${hash.slice(0, 6)} is renewed`);
});

test("evidence labels are date-stamped and never overwrite an earlier record", () => {
  const row = { action: "extend", kind: "factory" };
  assert.equal(evidenceLabel("2026-12-01", row), "ttl/2026-12-01/extend-factory");
  const taken = new Set(["ttl/2026-12-01/extend-factory", "ttl/2026-12-01/extend-factory-2"]);
  assert.equal(
    evidenceLabel("2026-12-01", row, (l) => taken.has(l)),
    "ttl/2026-12-01/extend-factory-3",
  );
});

test("broadcast renewal extends committed-evidence entries once and is idempotent", async () => {
  const latest = 6_000_000;
  // The original deployment's entries all expire near ledger 6,144,082.
  const net = network(latest, (kind) =>
    kind === "faucet" ? latest + 2 * RENEW_BELOW : 6_144_082,
  );
  const first = await renewLifetimes({
    server: net.server,
    targets: net.targets,
    run: net.run,
    broadcast: true,
    date: "2026-12-01",
  });
  const renewed = first.actions.map((a) => a.kind);
  assert.ok(renewed.includes("factory"));
  assert.ok(renewed.includes("pool-CAMJLANK"), "community registry pools are renewed");
  assert.ok(renewed.includes("testusd-sac"));
  assert.ok(renewed.includes(`code-${markets.poolWasmHash.slice(0, 12)}`));
  assert.ok(!renewed.includes("faucet"), "healthy entries are left alone");
  assert.equal(first.actions.length, net.calls.length);
  for (const { args, label } of net.calls) {
    assert.match(label, /^ttl\/2026-12-01\/extend-/);
    assert.equal(args[args.indexOf("--source-account") + 1], SIGNER);
    assert.equal(args[args.indexOf("--ledgers-to-extend") + 1], String(EXTEND_TO));
    assert.equal(args[args.indexOf("--network") + 1], "testnet");
  }
  assert.ok(first.after.every((r) => r.action === "ok"));
  assert.deepEqual(first.overdue, []);
  const again = await renewLifetimes({
    server: net.server,
    targets: net.targets,
    run: net.run,
    broadcast: true,
    date: "2026-12-01",
  });
  assert.deepEqual(again.actions, [], "a second run does nothing");
});

test("read-only plan reports overdue, archived and missing entries without broadcasting", async () => {
  const latest = 7_000_000;
  const net = network(latest, (kind) =>
    kind === "factory" ? null : kind === "faucet" ? latest - 1 : latest + MIN_REMAINING - 1,
  );
  const report = await renewLifetimes({
    server: net.server,
    targets: net.targets,
    run: net.run,
    broadcast: false,
    date: "2026-12-20",
  });
  assert.equal(net.calls.length, 0);
  assert.deepEqual(report.missing, ["factory"]);
  assert.ok(report.overdue.includes("pool-CAMJLANK"));
  const faucet = report.actions.find((a) => a.kind === "faucet");
  assert.equal(faucet.action, "restore");
  assert.equal(faucet.label, `ttl/2026-12-20/restore-faucet-${legacy.faucet.slice(0, 8)}`);
});

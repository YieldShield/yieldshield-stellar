// Valueless Stellar Testnet deployment of the V3 markets.
//
// Initial mode (historical): deploys vaults, exchanges, the factory and the
// featured pools, recording evidence under docs/evidence/v3. It refuses to
// run once config/markets.json records a factory, because every step would
// be skipped on the strength of old evidence files and IDs.
//
// --fresh-pools --tag <name>: deploys a new pool Wasm, a new factory and new
// featured pools that reuse the vaults and exchanges recorded in
// config/markets.json. Evidence goes to docs/evidence/<name>; an existing
// directory requires --resume, which reuses only that run's own confirmed
// steps. IDs and Wasm hashes are written to config/markets.json only after
// an onchain readback and operator confirmation (or --yes).
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Contract, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  address,
  assertTestnet,
  cliRun,
  invoke,
  readJson,
  save,
  scAddress,
  scAmount,
  server,
  sha,
  view,
} from "./testnet.mjs";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!flag("--broadcast"))
  throw Error("Requires --broadcast; valueless Stellar Testnet only.");
const legacy = readJson("config/testnet.json"),
  path = "config/markets.json",
  m = readJson(path);
const U = 10_000_000n;
const vaultWasm = "target/wasm32v1-none/release/yieldshield_vault.wasm",
  poolWasm = "target/wasm32v1-none/release/yieldshield_pool_v3.wasm",
  marketWasm = "target/wasm32v1-none/release/yieldshield_market.wasm",
  factoryWasm = "target/wasm32v1-none/release/yieldshield_factory.wasm";
// pool-v3 accepts terms of 300 seconds to 30 days; featured pools use the
// maximum so they stay open as long as the contracts allow.
const MAX_TERM = 2_592_000;
const SEED = 10_000n * U;
const amount = (v) => scAmount(BigInt(v) * U);
const deadline = () =>
  nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 120), { type: "u64" });
function terms(duration) {
  const t = {
    collateral_bps: 15000,
    creator_fee_bps: 100,
    duration: BigInt(duration),
    junior_fee_bps: 1000,
    notice_delay: 30n,
  };
  return xdr.ScVal.scvMap(
    Object.entries(t)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, val]) =>
          new xdr.ScMapEntry({
            key: nativeToScVal(key, { type: "symbol" }),
            val: nativeToScVal(val, {
              type: typeof val === "bigint" ? "u64" : "u32",
            }),
          }),
      ),
  );
}
if (flag("--fresh-pools")) {
  await freshPools();
  process.exit(0);
}
if (m.factory)
  throw Error(
    "config/markets.json already records a factory, so the initial mode would skip every step. Use --fresh-pools --tag <name>.",
  );
await assertTestnet();
m.revision = "native-public-pools-v3";
m.createdAt ||= new Date().toISOString();
m.markets ||= [];
const step = async (name, fn) => {
  const p = `docs/evidence/v3/${name}.json`;
  if (fs.existsSync(p)) return readJson(p);
  const r = await fn();
  save(p, r);
  return r;
};
const deploy = async (name, wasm, params) => {
  const r = await step(`deploy-${name}`, async () => {
    const out = cliRun(
      [
        "contract",
        "deploy",
        "--wasm",
        wasm,
        "--optimize=false",
        "--network",
        "testnet",
        "--source-account",
        "ys-stellar-sponsor",
        "--",
        ...params,
      ],
      `v3/cli-deploy-${name}`,
    );
    const id = out.match(/C[A-Z2-7]{55}/g)?.at(-1);
    if (!id) throw Error("Missing deployed contract ID");
    return { id, wasmHash: sha(wasm) };
  });
  return r.id;
};
const descriptors = [
  [
    "alpha",
    "ysALPHA",
    "Reserve Alpha",
    "TESTUSD",
    "Independent funded TESTUSD vault. Direct redemption into project test dollars.",
  ],
  [
    "beta",
    "ysBETA",
    "Reserve Beta",
    "TESTUSD",
    "A second independently funded TESTUSD vault, with its own balances and market inventory.",
  ],
  [
    "nested",
    "ysNEST",
    "Receipt Reserve",
    "ysALPHA",
    "Nested vault backed by Alpha receipts. Fixed claims are receipt units, not a fixed dollar value.",
  ],
];
for (const [key, symbol, name, backingSymbol, description] of descriptors) {
  let row = m.markets.find((x) => x.key === key);
  if (!row) {
    row = {
      key,
      symbol,
      name,
      backingSymbol,
      description,
      pool: "",
      vault: "",
      backing: "",
      exchange: "",
    };
    m.markets.push(row);
  }
  row.backing = key === "nested" ? m.markets[0].vault : legacy.backing;
  if (!row.vault) {
    row.vault = await deploy(`vault-${key}`, vaultWasm, [
      "--asset",
      row.backing,
      "--admin",
      legacy.sponsor,
    ]);
    save(path, m);
  }
  await step(`metadata-${key}`, () =>
    invoke("sponsor", row.vault, "set_metadata", [
      nativeToScVal(`YieldShield ${name} Test Receipt`, { type: "string" }),
      nativeToScVal(symbol, { type: "string" }),
    ]),
  );
  if (!row.exchange) {
    row.exchange = await deploy(`exchange-${key}`, marketWasm, [
      "--backing",
      row.backing,
      "--vault",
      row.vault,
      "--operator",
      legacy.sponsor,
      "--fee_bps",
      "30",
    ]);
    save(path, m);
  }
}
if (!m.poolWasmHash) {
  m.poolWasmHash = (
    await step("install-pool", async () => {
      const out = cliRun(
        [
          "contract",
          "upload",
          "--wasm",
          poolWasm,
          "--network",
          "testnet",
          "--source-account",
          "ys-stellar-sponsor",
        ],
        "v3/cli-install-pool",
      );
      const hash = out.match(/[a-f0-9]{64}/g)?.at(-1);
      if (!hash) throw Error("Missing wasm hash");
      return { hash };
    })
  ).hash;
  save(path, m);
}
if (!m.factory) {
  m.factory = await deploy(
    "factory",
    factoryWasm,
    [
      "--admin",
      legacy.sponsor,
      "--backing",
      legacy.backing,
      "--wasm",
      m.poolWasmHash,
      "--vaults",
      JSON.stringify(m.markets.map((x) => x.vault)),
    ],
  );
  save(path, m);
}
await step("mint-sponsor", () =>
  invoke("issuer", legacy.backing, "mint", [
    scAddress(legacy.sponsor),
    amount(500000),
  ]),
);
await step("mint-tester", () =>
  invoke("issuer", legacy.backing, "mint", [
    scAddress(legacy.tester),
    amount(5000),
  ]),
);
for (const [rowIndex, row] of m.markets.entries()) {
  await step(`seed-vault-${row.key}`, () =>
    invoke("sponsor", row.vault, "deposit", [
      scAddress(legacy.sponsor),
      amount(row.key === "alpha" ? 100000 : 30000),
      scAmount(1),
      deadline(),
    ]),
  );
  if (!row.pool) {
    const r = await step(`create-pool-${row.key}`, () =>
      invoke("sponsor", m.factory, "create", [
        scAddress(legacy.sponsor),
        scAddress(row.vault),
        terms(MAX_TERM),
        nativeToScVal(new Uint8Array(32).fill(rowIndex + 11), {
          type: "bytes",
        }),
      ]),
    );
    row.pool = r.returnValue;
    save(path, m);
  }
  await step(`seed-pool-${row.key}`, () =>
    invoke("sponsor", row.pool, "provide", [
      scAddress(legacy.sponsor),
      amount(10000),
      scAmount(1),
      deadline(),
    ]),
  );
  await step(`seed-market-${row.key}`, () =>
    invoke("sponsor", row.exchange, "fund", [
      scAddress(legacy.sponsor),
      amount(10000),
      amount(10000),
    ]),
  );
}
m.vaultWasmHash = sha(vaultWasm);
m.marketWasmHash = sha(marketWasm);
m.factoryWasmHash = sha(factoryWasm);
m.poolWasmHash = sha(poolWasm);
save(path, m);
save("docs/evidence/v3/deployed-state.json", {
  at: new Date().toISOString(),
  registry: await view(m.factory, "state"),
  markets: await Promise.all(
    m.markets.map(async (row) => ({
      ...row,
      state: await view(row.pool, "state"),
      name: await view(row.vault, "name"),
      symbol: await view(row.vault, "symbol"),
      inventory: await view(row.exchange, "inventory"),
    })),
  ),
});
console.log(
  JSON.stringify({
    factory: m.factory,
    markets: m.markets.map((x) => ({ name: x.name, pool: x.pool })),
  }),
);

async function freshPools() {
  const tag = option("--tag");
  if (!tag || !/^[a-z0-9][a-z0-9.-]{0,31}$/.test(tag) || tag === "v3")
    throw Error(
      "--fresh-pools needs --tag <name> naming a new evidence directory, e.g. --tag v3.1",
    );
  const dir = `docs/evidence/${tag}`,
    runPath = `${dir}/run.json`,
    resume = flag("--resume");
  if (fs.existsSync(dir) && !resume)
    throw Error(`${dir} exists. Pass --resume to continue that run, or choose a new --tag.`);
  if (!fs.existsSync(dir) && resume)
    throw Error(`${dir} does not exist; there is no run to resume.`);
  const rows = ["alpha", "beta", "nested"].map((key) => {
    const row = m.markets.find((x) => x.key === key);
    if (!row?.vault || !row?.exchange || !row?.backing)
      throw Error(`config/markets.json has no ${key} vault and exchange to reuse.`);
    return row;
  });
  for (const file of [poolWasm, factoryWasm])
    if (!fs.existsSync(file)) throw Error(`Missing ${file}; run stellar contract build.`);
  const hashes = { pool: sha(poolWasm), factory: sha(factoryWasm) };
  const run = readJson(runPath, {
    tag,
    startedAt: new Date().toISOString(),
    hashes,
    replaces: {
      revision: m.revision,
      factory: m.factory,
      poolWasmHash: m.poolWasmHash,
      factoryWasmHash: m.factoryWasmHash,
      pools: Object.fromEntries(rows.map((r) => [r.key, r.pool])),
    },
    steps: {},
  });
  if (run.hashes.pool !== hashes.pool || run.hashes.factory !== hashes.factory)
    throw Error("Local Wasm changed since this run started; start a new --tag.");
  if (run.recordedAt) {
    console.log(`Run ${tag} was recorded in ${path} at ${run.recordedAt}.`);
    return;
  }
  await assertTestnet();
  const sponsor = legacy.sponsor;
  assert.equal(address("sponsor"), sponsor, "Sponsor identity differs from config");
  save(runPath, run);
  // Each step runs once per run and is recorded with its result. Resuming
  // reuses only this run's confirmed steps, never evidence from older runs.
  const step = async (name, fn) => {
    if (run.steps[name]) {
      console.log(`Reusing confirmed step ${name} from ${runPath}`);
      return run.steps[name];
    }
    console.log(`Running ${name}`);
    const result = await fn();
    run.steps[name] = { at: new Date().toISOString(), ...result };
    save(runPath, run);
    return run.steps[name];
  };
  const salt = (key) =>
    nativeToScVal(createHash("sha256").update(`yieldshield:${tag}:${key}`).digest(), {
      type: "bytes",
    });

  const poolHash = (
    await step("install-pool", async () => {
      const out = cliRun(
        ["contract", "upload", "--wasm", poolWasm, "--network", "testnet",
          "--source-account", "ys-stellar-sponsor"],
        `${tag}/cli-install-pool`,
      );
      const hash = out.match(/[a-f0-9]{64}/g)?.at(-1);
      if (hash !== hashes.pool)
        throw Error(`Uploaded pool hash ${hash} differs from local ${hashes.pool}`);
      return { hash };
    })
  ).hash;
  const factory = (
    await step("deploy-factory", async () => {
      const out = cliRun(
        ["contract", "deploy", "--wasm", factoryWasm, "--optimize=false",
          "--network", "testnet", "--source-account", "ys-stellar-sponsor", "--",
          "--admin", sponsor, "--backing", legacy.backing, "--wasm", poolHash,
          "--vaults", JSON.stringify(rows.map((r) => r.vault))],
        `${tag}/cli-deploy-factory`,
      );
      const id = out.match(/C[A-Z2-7]{55}/g)?.at(-1);
      if (!id) throw Error("Missing deployed factory ID");
      return { id, wasmHash: hashes.factory };
    })
  ).id;

  // Alpha and Beta are seeded with TESTUSD, the nested pool with ysALPHA
  // receipts; each creation escrows a 10 TESTUSD bond.
  const alpha = rows[0];
  const balance = async (token) =>
    BigInt(await view(token, "balance", [scAddress(sponsor)]));
  await step("fund-sponsor", async () => {
    const receipts = await balance(alpha.vault);
    let deposit = 0n;
    if (receipts < SEED) {
      const [assets, supply] = await Promise.all([
        view(alpha.vault, "total_assets"),
        view(alpha.vault, "total_supply"),
      ]);
      const short = SEED - receipts;
      deposit = (short * (BigInt(assets) + 1n) + BigInt(supply)) / (BigInt(supply) + 1n) + 1n;
    }
    const needed = 2n * SEED + 3n * 10n * U + deposit;
    const cash = await balance(legacy.backing);
    const minted =
      cash < needed
        ? await invoke("issuer", legacy.backing, "mint", [
            scAddress(sponsor),
            scAmount(needed - cash),
          ])
        : null;
    const deposited = deposit
      ? await invoke("sponsor", alpha.vault, "deposit", [
          scAddress(sponsor),
          scAmount(deposit),
          scAmount(SEED - receipts),
          deadline(),
        ])
      : null;
    return { receipts, cash, needed, deposit, minted, deposited };
  });
  const pools = {};
  for (const row of rows) {
    pools[row.key] = (
      await step(`create-pool-${row.key}`, () =>
        invoke("sponsor", factory, "create", [
          scAddress(sponsor),
          scAddress(row.vault),
          terms(MAX_TERM),
          salt(row.key),
        ]),
      )
    ).returnValue;
    await step(`seed-pool-${row.key}`, () =>
      invoke("sponsor", pools[row.key], "provide", [
        scAddress(sponsor),
        scAmount(SEED),
        scAmount(1),
        deadline(),
      ]),
    );
  }

  // Read everything back from the network before recording anything.
  const executable = async (id) => {
    const r = await server.getLedgerEntries(new Contract(id).getFootprint());
    assert.ok(r.entries[0], `Missing instance ${id}`);
    return JSON.parse(JSON.stringify(r.entries[0].val)).contract_data.val
      .contract_instance.executable.wasm;
  };
  const registry = await view(factory, "state");
  assert.equal(await executable(factory), hashes.factory);
  assert.equal(Buffer.from(registry.wasm).toString("hex"), poolHash);
  assert.equal(registry.admin, sponsor);
  assert.equal(registry.backing, legacy.backing);
  assert.deepEqual(registry.vaults, rows.map((r) => r.vault));
  const live = (await view(factory, "live_pools")).map((l) => l.pool);
  const pooled = [];
  for (const row of rows) {
    const id = pools[row.key];
    const s = await view(id, "state");
    assert.equal(await executable(id), poolHash);
    assert.ok(live.includes(id), `${row.key} pool is not live`);
    assert.equal(s.vault, row.vault);
    assert.equal(s.backing, row.backing);
    assert.equal(s.creator, sponsor);
    assert.equal(s.protocol, sponsor);
    assert.equal(BigInt(s.terms.duration), BigInt(MAX_TERM));
    assert.ok(BigInt(s.liquidity) >= SEED, `${row.key} pool is not seeded`);
    assert.equal(s.active, 0);
    const record = await view(factory, "record", [scAddress(id)]);
    assert.equal(record.claimed, false);
    pooled.push({ key: row.key, pool: id, state: s, record });
  }
  save(`${dir}/deployed-state.json`, {
    at: new Date().toISOString(),
    factory,
    factoryWasmHash: hashes.factory,
    poolWasmHash: poolHash,
    registry,
    live,
    pools: pooled,
  });
  console.log(
    JSON.stringify(
      {
        factory,
        factoryWasmHash: hashes.factory,
        poolWasmHash: poolHash,
        pools,
        maturity: new Date(Number(pooled[0].state.end) * 1000).toISOString(),
        replaces: run.replaces,
      },
      null,
      2,
    ),
  );
  if (!flag("--yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `Record this factory and these pools in ${path}? [y/N] `,
    );
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log(`Not recorded. Re-run with --tag ${tag} --resume to record later.`);
      return;
    }
  }
  const current = readJson(path);
  assert.equal(current.factory, run.replaces.factory, `${path} changed during the run`);
  current.previous = { ...run.replaces, evidence: current.evidence || "v3" };
  current.revision = `native-public-pools-${tag}`;
  current.factory = factory;
  current.factoryWasmHash = hashes.factory;
  current.poolWasmHash = poolHash;
  current.evidence = tag;
  for (const row of current.markets) row.pool = pools[row.key];
  save(path, current);
  run.recordedAt = new Date().toISOString();
  save(runPath, run);
  console.log(`Recorded ${tag} in ${path}. Vault and exchange IDs and hashes are unchanged.`);
}

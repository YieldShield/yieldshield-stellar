import fs from "node:fs";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  address,
  assertTestnet,
  cliRun,
  invoke,
  readJson,
  save,
  scAddress,
  scAmount,
  sha,
  view,
} from "./testnet.mjs";
if (!process.argv.includes("--broadcast"))
  throw Error("Requires --broadcast; valueless Stellar Testnet only.");
await assertTestnet();
const legacy = readJson("config/testnet.json"),
  path = "config/markets.json",
  m = readJson(path);
const U = 10_000_000n;
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
const amount = (v) => scAmount(BigInt(v) * U);
const deadline = () =>
  nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 120), { type: "u64" });
const vaultWasm = "target/wasm32v1-none/release/yieldshield_vault.wasm",
  poolWasm = "target/wasm32v1-none/release/yieldshield_pool_v3.wasm",
  marketWasm = "target/wasm32v1-none/release/yieldshield_market.wasm";
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
          "install",
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
    "target/wasm32v1-none/release/yieldshield_factory.wasm",
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
        terms(2592000),
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
m.factoryWasmHash = sha(
  "target/wasm32v1-none/release/yieldshield_factory.wasm",
);
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

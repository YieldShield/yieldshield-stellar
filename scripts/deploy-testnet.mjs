import fs from "node:fs";
import { Asset, Networks, nativeToScVal } from "@stellar/stellar-sdk";
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
  trust,
  RPC,
} from "./testnet.mjs";
if (!process.argv.includes("--broadcast"))
  throw new Error("Pass --broadcast to deploy using disposable testnet keys");
await assertTestnet();
const path = "config/testnet.json";
const m = readJson(path, {
  network: "Stellar Testnet",
  networkPassphrase: Networks.TESTNET,
  rpcUrl: RPC,
  horizonUrl: "https://horizon-testnet.stellar.org",
  assetCode: "TESTUSD",
  decimals: 7,
  createdAt: new Date().toISOString(),
});
m.issuer = address("issuer");
m.sponsor = address("sponsor");
m.tester = address("tester");
save(path, m);
if (!m.backing) {
  const id = new Asset("TESTUSD", m.issuer).contractId(Networks.TESTNET);
  cliRun(
    [
      "contract",
      "asset",
      "deploy",
      "--asset",
      `TESTUSD:${m.issuer}`,
      "--network",
      "testnet",
      "--source-account",
      "ys-stellar-issuer",
    ],
    "deploy-backing",
  );
  m.backing = id;
  save(path, m);
}
for (const name of ["sponsor", "tester"])
  save(`docs/evidence/trustline-${name}.json`, await trust(name, m.issuer));
for (const name of ["vault", "pool", "faucet"]) {
  if (m[name]) continue;
  const wasm = `target/wasm32v1-none/release/yieldshield_${name}.wasm`;
  const extra =
    name === "vault"
      ? ["--asset", m.backing, "--admin", m.sponsor]
      : name === "pool"
        ? ["--backer", m.sponsor, "--backing", m.backing, "--vault", m.vault]
        : ["--asset", m.backing];
  const output = cliRun(
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
      ...extra,
    ],
    `deploy-${name}`,
  );
  const match = output.match(/C[A-Z2-7]{55}/g);
  if (!match) throw new Error(`No contract ID in ${name} deployment`);
  m[name] = match.at(-1);
  m[`${name}WasmHash`] = sha(wasm);
  save(path, m);
}
for (const [step, target, amount] of [
  ["mint-sponsor", m.sponsor, 100_000n * 10_000_000n],
  ["mint-faucet", m.faucet, 1_000_000n * 10_000_000n],
]) {
  const file = `docs/evidence/${step}.json`;
  if (!fs.existsSync(file))
    save(
      file,
      await invoke("issuer", m.backing, "mint", [
        scAddress(target),
        scAmount(amount),
      ]),
    );
}
if (!fs.existsSync("docs/evidence/seed-reserve.json"))
  save(
    "docs/evidence/seed-reserve.json",
    await invoke("sponsor", m.pool, "fund", [scAmount(50_000n * 10_000_000n)]),
  );
if (!fs.existsSync("docs/evidence/seed-vault.json"))
  save(
    "docs/evidence/seed-vault.json",
    await invoke("sponsor", m.vault, "deposit", [
      scAddress(m.sponsor),
      scAmount(10_000n * 10_000_000n),
      scAmount(9_950n * 10_000_000n),
      nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 120), {
        type: "u64",
      }),
    ]),
  );
console.log(
  JSON.stringify({
    network: m.network,
    vault: m.vault,
    pool: m.pool,
    faucet: m.faucet,
    backing: m.backing,
  }),
);

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
  server,
  sleep,
  RPC,
} from "./testnet.mjs";
import {
  archiveDeployment,
  missingContracts,
  planRedeploy,
} from "./redeploy.mjs";
if (!process.argv.includes("--broadcast"))
  throw new Error("Pass --broadcast to deploy using disposable testnet keys");
await assertTestnet();
const path = "config/testnet.json";
const defaults = () => ({
  network: "Stellar Testnet",
  networkPassphrase: Networks.TESTNET,
  rpcUrl: RPC,
  horizonUrl: "https://horizon-testnet.stellar.org",
  assetCode: "TESTUSD",
  decimals: 7,
  createdAt: new Date().toISOString(),
});
let m = readJson(path, defaults());
// Recorded IDs and evidence are only trusted while the contracts exist: after
// a testnet reset they would make every step a silent no-op.
const plan = planRedeploy({
  missing: await missingContracts(server, m),
  fresh: process.argv.includes("--fresh"),
});
if (plan.action === "abort") throw new Error(plan.message);
if (plan.action === "fresh") {
  const { target, moved } = archiveDeployment({ manifestPath: path });
  console.log(`Archived ${moved.length} files of the vanished deployment to ${target}.`);
  m = { ...defaults(), ...(m.revision ? { revision: m.revision } : {}) };
}
m.issuer = address("issuer");
m.sponsor = address("sponsor");
m.tester = address("tester");
save(path, m);
// Disposable accounts also vanish in a reset; Friendbot recreates them.
for (const name of ["issuer", "sponsor", "tester"]) {
  const exists = await server.getAccount(m[name]).then(() => true, () => false);
  if (exists) continue;
  const r = await fetch(`https://friendbot.stellar.org/?addr=${m[name]}`);
  if (!r.ok) throw new Error(`Friendbot could not fund the ${name} account`);
  save(`docs/evidence/fund-${name}.json`, { account: m[name], status: r.status });
  await sleep(6000);
}
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

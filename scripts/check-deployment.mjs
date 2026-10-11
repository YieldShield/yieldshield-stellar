import assert from "node:assert/strict";
import { Contract } from "@stellar/stellar-sdk";
import {
  assertTestnet,
  server,
  readJson,
  save,
  view,
  scAddress,
} from "./testnet.mjs";
await assertTestnet();
const m = readJson("config/testnet.json");
const records = [];
for (const name of ["pool", "vault", "faucet", "backing"]) {
  const result = await server.getLedgerEntries(
    new Contract(m[name]).getFootprint(),
  );
  const entry = result.entries[0];
  assert.ok(entry, `Missing${name}`);
  const raw = JSON.parse(JSON.stringify(entry.val));
  const executable = raw.contract_data.val.contract_instance.executable;
  if (name === "backing") assert.equal(executable, "stellar_asset");
  else assert.equal(executable.wasm, m[`${name}WasmHash`]);
  records.push({
    name,
    id: m[name],
    executable,
    latestLedger: result.latestLedger,
    liveUntilLedger: entry.liveUntilLedgerSeq,
  });
}
const state = await view(m.pool, "state");
assert.equal(state.backing, m.backing);
assert.equal(state.vault, m.vault);
assert.equal(state.backer, m.sponsor);
assert.ok(state.liquidity >= state.reserved);
const backingBalance = await view(m.backing, "balance", [scAddress(m.pool)]);
assert.ok(backingBalance >= state.liquidity);
const out = {
  verifiedAt: new Date().toISOString(),
  network: m.network,
  records,
  state,
  backingBalance,
  nav: await view(m.vault, "nav"),
  vaultAssets: await view(m.vault, "total_assets"),
  vaultSupply: await view(m.vault, "total_supply"),
};
save("docs/evidence/deployment-check.json", out);
console.log(
  "Verified actual contract Wasm hashes, SAC provenance, configuration and backing balances.",
);

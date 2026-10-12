// Renews storage lifetimes for every contract instance and Wasm code entry the
// public application uses (v3 factory, vaults, exchanges, all registry pools,
// any factory and pools a --fresh-pools deployment replaced, and the legacy
// vault, pool, faucet and TESTUSD asset contract).
//
//   node scripts/extend-testnet.mjs              read-only plan and health check
//   node scripts/extend-testnet.mjs --broadcast  extend/restore what is due
//
// Only entries below the renewal threshold are touched, so the command is safe
// to repeat on a schedule. See docs/OPERATIONS.md for cadence and thresholds.
import fs from "node:fs";
import {
  assertTestnet,
  cliRun,
  readJson,
  registryPools,
  save,
  server,
} from "./testnet.mjs";
import { renewLifetimes, ttlTargets, SIGNER } from "./ttl.mjs";

const broadcast = process.argv.includes("--broadcast");
await assertTestnet();
const markets = readJson("config/markets.json");
const legacy = readJson("config/testnet.json");
// Every registered pool, through the paged registry where the factory has one.
const registryErrors = [];
async function pools(factory, label) {
  if (!factory) return [];
  try {
    return await registryPools(factory);
  } catch (e) {
    registryErrors.push(`${label} registry unreadable (${e.message}); its community pools were not checked.`);
    return [];
  }
}
const report = await renewLifetimes({
  server,
  targets: ttlTargets({
    markets,
    legacy,
    registryPools: await pools(markets.factory, "Factory"),
    previousPools: await pools(markets.previous?.factory, "Previous factory"),
  }),
  run: cliRun,
  broadcast,
  exists: (label) => fs.existsSync(`docs/evidence/${label}.json`),
});
if (broadcast && report.actions.length)
  save(`docs/evidence/ttl/${report.date}/summary.json`, {
    at: new Date().toISOString(),
    signer: SIGNER,
    ...report,
  });
console.log(
  JSON.stringify(
    {
      mode: broadcast ? "broadcast" : "read-only",
      latestLedger: report.latestLedger,
      entries: report.after.length,
      [broadcast ? "renewed" : "wouldRenew"]: report.actions.map(
        (a) => `${a.action} ${a.kind}`,
      ),
      due: report.after.filter((r) => r.action !== "ok").map((r) => r.kind),
      missing: report.missing,
      overdue: report.overdue,
      lowestRemaining: Math.min(
        ...report.after.map((r) => r.remaining ?? -Infinity),
      ),
      registryErrors: registryErrors.length ? registryErrors : undefined,
    },
    null,
    2,
  ),
);
if (report.missing.length)
  console.error(
    "Missing entries cannot be extended. Try `stellar contract restore`; if the contract no longer exists the testnet has reset and the demo must be redeployed (docs/OPERATIONS.md).",
  );
if (report.missing.length || report.overdue.length || registryErrors.length)
  process.exitCode = 1;

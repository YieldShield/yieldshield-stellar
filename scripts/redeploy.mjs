// Testnet-reset handling for deploy-testnet.mjs. A deployment step is only
// skipped when its recorded contract still exists on chain; a reset (or any
// vanished contract) is reported instead of silently doing nothing.
import fs from "node:fs";
import { instanceKey } from "./ttl.mjs";

export const CONTRACTS = ["backing", "vault", "pool", "faucet"];
// Top-level evidence describing the legacy deployment (deploy-testnet.mjs,
// extend-testnet.mjs before date-stamped renewal, verify-testnet.mjs and
// check-deployment.mjs). v3 and E2E evidence live in subdirectories.
const EVIDENCE =
  /^((deploy|mint|seed|trustline|fund|extend)-[a-z-]+|lifecycle|deployment-check)\.json$/;

/** Names of configured contracts whose instance no longer exists. */
export async function missingContracts(server, manifest) {
  const configured = CONTRACTS.filter((name) => manifest[name]);
  if (!configured.length) return [];
  const keys = configured.map((name) => instanceKey(manifest[name]));
  const r = await server.getLedgerEntries(...keys);
  const found = new Set(r.entries.map((e) => e.key.toXDR("base64")));
  return configured.filter((_, i) => !found.has(keys[i].toXDR("base64")));
}

/**
 * continue: every recorded contract exists (or none is recorded yet), so
 *   finish any missing steps;
 * fresh: --fresh after contracts vanished, so archive and deploy a new set;
 * abort: contracts vanished without --fresh, or --fresh with nothing missing.
 */
export function planRedeploy({ missing, fresh }) {
  if (!missing.length && !fresh) return { action: "continue" };
  if (!missing.length)
    return {
      action: "abort",
      message:
        "--fresh refused: every contract in config/testnet.json still exists on Stellar Testnet. Nothing needs redeploying.",
    };
  if (!fresh)
    return {
      action: "abort",
      message: `config/testnet.json lists ${missing.join(", ")}, but ${missing.length === 1 ? "it does" : "they do"} not exist on Stellar Testnet; the testnet has probably been reset. Re-run with --broadcast --fresh to archive the old manifest and evidence and deploy a new set.`,
    };
  return { action: "fresh" };
}

/** Moves the manifest and deployment evidence to docs/evidence/archive-<date>/. */
export function archiveDeployment({
  manifestPath = "config/testnet.json",
  evidenceDir = "docs/evidence",
  date = new Date().toISOString().slice(0, 10),
} = {}) {
  let target = `${evidenceDir}/archive-${date}`;
  for (let n = 2; fs.existsSync(target); n++)
    target = `${evidenceDir}/archive-${date}-${n}`;
  fs.mkdirSync(target, { recursive: true });
  const moved = [];
  if (fs.existsSync(manifestPath)) {
    fs.renameSync(manifestPath, `${target}/manifest.json`);
    moved.push("manifest.json");
  }
  for (const file of fs.readdirSync(evidenceDir))
    if (EVIDENCE.test(file)) {
      fs.renameSync(`${evidenceDir}/${file}`, `${target}/${file}`);
      moved.push(file);
    }
  return { target, moved };
}

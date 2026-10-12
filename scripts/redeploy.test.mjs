import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { archiveDeployment, missingContracts, planRedeploy } from "./redeploy.mjs";

const manifest = JSON.parse(readFileSync("config/testnet.json", "utf8"));
const rpc = (existing) => ({
  async getLedgerEntries(...keys) {
    return { latestLedger: 1, entries: keys.filter((_, i) => existing[i]).map((key) => ({ key })) };
  },
});

test("recorded contracts are checked on chain before a deployment step is skipped", async () => {
  assert.deepEqual(await missingContracts(rpc([true, true, true, true]), manifest), []);
  assert.deepEqual(await missingContracts(rpc([false, false, false, false]), manifest), ["backing", "vault", "pool", "faucet"]);
  assert.deepEqual(await missingContracts(rpc([]), {}), [], "a first deployment has nothing to check");
});

test("a reset aborts with guidance unless --fresh, and --fresh needs a reset", () => {
  assert.deepEqual(planRedeploy({ missing: [], fresh: false }), { action: "continue" });
  const reset = planRedeploy({ missing: ["vault", "pool"], fresh: false });
  assert.equal(reset.action, "abort");
  assert.match(reset.message, /lists vault, pool, but they do not exist on Stellar Testnet.*--fresh/);
  assert.deepEqual(planRedeploy({ missing: ["vault"], fresh: true }), { action: "fresh" });
  const healthy = planRedeploy({ missing: [], fresh: true });
  assert.equal(healthy.action, "abort");
  assert.match(healthy.message, /still exists/);
});

test("--fresh archives the vanished manifest and its evidence, leaving other records", () => {
  const dir = mkdtempSync(resolve("node_modules/.redeploy-test-"));
  try {
    const evidence = join(dir, "evidence");
    mkdirSync(join(evidence, "v3"), { recursive: true });
    for (const file of ["deploy-vault.json", "mint-sponsor.json", "seed-reserve.json", "trustline-tester.json", "extend-pool-code.json", "lifecycle.json", "deployment-check.json", "mobile.png", "v3/checks.json"])
      writeFileSync(join(evidence, file), "{}");
    writeFileSync(join(dir, "testnet.json"), "{}");
    const first = archiveDeployment({ manifestPath: join(dir, "testnet.json"), evidenceDir: evidence, date: "2026-12-24" });
    assert.equal(first.target, join(evidence, "archive-2026-12-24"));
    assert.deepEqual(first.moved.sort(), ["deploy-vault.json", "deployment-check.json", "extend-pool-code.json", "lifecycle.json", "manifest.json", "mint-sponsor.json", "seed-reserve.json", "trustline-tester.json"]);
    assert.ok(!existsSync(join(dir, "testnet.json")));
    assert.deepEqual(readdirSync(evidence).sort(), ["archive-2026-12-24", "mobile.png", "v3"]);
    const second = archiveDeployment({ manifestPath: join(dir, "testnet.json"), evidenceDir: evidence, date: "2026-12-24" });
    assert.equal(second.target, join(evidence, "archive-2026-12-24-2"), "earlier archives are never overwritten");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

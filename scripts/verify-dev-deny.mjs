import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { createServer } from "vite";
const probe = ".secrets/e2e-harmless-access-probe.txt";
mkdirSync(".secrets", { recursive: true });
writeFileSync(probe, "harmless-access-probe");
const server = await createServer({ envFile: false, server: { host: "127.0.0.1", port: 5194, strictPort: true } });
try {
  await server.listen();
  for (const port of [5193, 5194]) {
    for (const path of [`/${probe}`, `/@fs/${process.cwd()}/${probe}`]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 403);
      assert.equal((await response.text()).includes("harmless-access-probe</"), false);
    }
  }
  console.log("Both local servers deny normal and /@fs access to harmless .secrets probe (4 checks).");
} finally { await server.close(); unlinkSync(probe); }

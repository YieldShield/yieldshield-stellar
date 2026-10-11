import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { Networks } from "@stellar/stellar-sdk";
import { key, readJson, view, assertTestnet, save } from "./testnet.mjs";
import { validateTestSignature } from "./e2e-wallet-policy.mjs";

if (!process.argv.includes("--local-test-signing"))
  throw Error("Explicit --local-test-signing required; disposable testnet identities only.");
await assertTestnet();
const origin = "http://127.0.0.1:5193", token = randomBytes(32).toString("hex");
const keys = [key("tester"), key("sponsor"), key("e2e")];
const accounts = keys.map(k => k.publicKey());
const legacy = readJson("config/testnet.json"), catalog = readJson("config/markets.json");
const contracts = new Map([
  [catalog.factory, ["create", "claim_bond"]],
  [legacy.faucet, ["claim"]],
  ...catalog.markets.flatMap(m => [[m.vault, ["deposit", "redeem"]], [m.exchange, ["buy", "sell"]]]),
]);
const poolMethods = ["provide", "notice", "cancel_notice", "withdraw", "claim_rewards", "claim_inventory", "protect", "exit", "transfer_position", "settle", "claim_backing", "claim_creator", "claim_protocol"];
const evidence = "docs/evidence/e2e/local-wallet.json";
const log = readJson(evidence, { startedAt: new Date().toISOString(), adapter: "localhost-only disposable signer; real Freighter extension is not exercised", signatures: [] });
const client = fs.readFileSync("scripts/e2e-wallet-client.js", "utf8").replace("__CONFIG__", JSON.stringify({ token, accounts, passphrase: Networks.TESTNET }));
const server = await createServer({
  configFile: false, envFile: false, plugins: [react(), {
    name: "isolated-local-test-wallet",
    transformIndexHtml: () => [{ tag: "script", attrs: { type: "module", src: "/__e2e/client.js" }, injectTo: "head-prepend" }],
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__e2e/")) return next();
        res.setHeader("Cache-Control", "no-store");
        try {
          if (req.headers.host !== "127.0.0.1:5193") throw Error("Localhost host required");
          if (req.url === "/__e2e/client.js" && req.method === "GET") {
            res.setHeader("Content-Type", "text/javascript"); res.end(client); return;
          }
          if (req.url !== "/__e2e/sign" || req.method !== "POST" || req.headers.origin !== origin || req.headers["x-e2e-token"] !== token)
            throw Error("Same-origin authenticated local request required");
          let body = "";
          for await (const chunk of req) { body += chunk; if (body.length > 100_000) throw Error("Request too large"); }
          const request = JSON.parse(body);
          const registry = await view(catalog.factory, "state");
          for (const pool of registry.pools) contracts.set(pool, poolMethods);
          const { tx, record } = validateTestSignature(request, { accounts, contracts, issuer: legacy.issuer });
          const signer = keys.find(k => k.publicKey() === tx.source);
          tx.sign(signer);
          log.signatures.push({ at: new Date().toISOString(), ...record, hash: Buffer.from(tx.hash()).toString("hex") });
          save(evidence, log); // Public identity/hash only; never keys or signed XDR.
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ signedTransaction: tx.toXDR(), signerAddress: signer.publicKey() }));
        } catch (e) {
          res.statusCode = 400; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : "Test signature denied" }));
        }
      });
    },
  }], server: { host: "127.0.0.1", port: 5193, strictPort: true,
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.secrets/**", "**/.stellar/**", "**/.vercel/**", "**/docs/grants/**"] },
  },
});
await server.listen();
console.log(`Isolated test wallet at ${origin}; only existing disposable Testnet identities can sign.`);

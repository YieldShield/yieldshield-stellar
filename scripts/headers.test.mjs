import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const testnet = JSON.parse(readFileSync("config/testnet.json", "utf8"));
const headersFor = (path) =>
  Object.fromEntries(
    vercel.headers
      .filter((rule) => new RegExp(`^${rule.source}$`).test(path))
      .flatMap((rule) => rule.headers.map((h) => [h.key, h.value])),
  );
const directives = (csp) =>
  Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

test("every page is served with a strict CSP that still reaches the Testnet services", () => {
  const page = headersFor("/protect");
  const csp = directives(page["Content-Security-Policy"]);
  assert.deepEqual(csp["default-src"], ["'self'"]);
  assert.deepEqual(csp["script-src"], ["'self'"], "no inline or eval script");
  assert.deepEqual(csp["style-src"], ["'self'"]);
  assert.deepEqual(csp["frame-ancestors"], ["'none'"]);
  assert.deepEqual(csp["object-src"], ["'none'"]);
  assert.deepEqual(csp["base-uri"], ["'none'"]);
  for (const url of [testnet.rpcUrl, testnet.horizonUrl, "https://friendbot.stellar.org"])
    assert.ok(csp["connect-src"].includes(new URL(url).origin), `${url} is reachable`);
  assert.equal(page["X-Content-Type-Options"], "nosniff");
  assert.equal(page["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(page["Permissions-Policy"], /camera=\(\)/);
  assert.equal(page["Cache-Control"], undefined, "HTML is not cached as immutable");
});

test("hashed assets are immutable and the SPA rewrite is unchanged", () => {
  assert.equal(headersFor("/assets/index-abc123.js")["Cache-Control"], "public, max-age=31536000, immutable");
  assert.ok(headersFor("/assets/index-abc123.js")["Content-Security-Policy"]);
  const rewrite = new RegExp(`^${vercel.rewrites[0].source}$`);
  assert.equal(vercel.rewrites[0].destination, "/index.html");
  for (const path of ["/", "/protect", "/markets/CA5F", "/legacy"]) assert.ok(rewrite.test(path), path);
  for (const path of ["/assets/index.js", "/favicon.ico", "/favicon.svg", "/apple-touch-icon.png"])
    assert.ok(!rewrite.test(path), path);
});

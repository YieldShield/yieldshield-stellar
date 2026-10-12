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
  for (const path of ["/assets/index.js", "/favicon.ico", "/favicon.svg", "/apple-touch-icon.png", "/og.jpg"])
    assert.ok(!rewrite.test(path), path);
});

test("social previews and the canonical link point to the published site and image", () => {
  const html = readFileSync("index.html", "utf8");
  const meta = (attr, name) => html.match(new RegExp(`${attr}="${name}"\\s+content="([^"]+)"`))?.[1];
  assert.match(html, /<link rel="canonical" href="https:\/\/stellar\.yieldshield\.ai\/" \/>/);
  for (const [attr, name] of [["property", "og:image"], ["name", "twitter:image"]])
    assert.equal(meta(attr, name), "https://stellar.yieldshield.ai/og.jpg", name);
  assert.equal(meta("name", "twitter:card"), "summary_large_image");
  assert.ok(meta("property", "og:title") && meta("property", "og:description"));
  const jpg = readFileSync("public/og.jpg");
  assert.deepEqual([jpg[0], jpg[1]], [0xff, 0xd8], "JPEG start-of-image marker");
  assert.ok(jpg.length < 150_000, "preview image stays small");
  // Dimensions from the first start-of-frame segment.
  let at = 2;
  while (at < jpg.length && !(jpg[at] === 0xff && jpg[at + 1] >= 0xc0 && jpg[at + 1] <= 0xc2))
    at += 2 + jpg.readUInt16BE(at + 2);
  assert.deepEqual([jpg.readUInt16BE(at + 7), jpg.readUInt16BE(at + 5)], [1280, 640]);
  assert.equal(meta("property", "og:image:width"), "1280");
  assert.equal(meta("property", "og:image:height"), "640");
});

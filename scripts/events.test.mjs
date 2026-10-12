import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { nativeToScVal } from "@stellar/stellar-sdk";
import { LATEST, fakeNetwork } from "./fake-network.mjs";

const temp = mkdtempSync(resolve("node_modules/.events-test-"));
const output = await build({
  entryPoints: ["apps/web/src/v3.ts"], bundle: true, format: "esm",
  platform: "node", packages: "external", write: false,
  plugins: [{ name: "no-wallet", setup(b) {
    b.onResolve({ filter: /^@stellar\/freighter-api$/ }, () => ({ path: "freighter", namespace: "fake" }));
    b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({ contents: "export const isConnected=0, requestAccess=0, getNetwork=0, signTransaction=0;" }));
  } }],
});
const modulePath = join(temp, "v3.mjs");
writeFileSync(modulePath, output.outputFiles[0].text);
const originalFetch = globalThis.fetch;
const { events } = await import(pathToFileURL(modulePath).href);
after(() => {
  rmSync(temp, { recursive: true, force: true });
  globalThis.fetch = originalFetch;
});
const pool = "CA5FTBNDTT6NF53PFY3FWD43Z2XHA4K6CAGCGSYGHTXSHO5MZIS5TKHT";

// RPC getEvents semantics: matches in ascending order, `limit` per page, and
// a cursor to continue after the last returned event.
function history(count) {
  const all = Array.from({ length: count }, (_, i) => ({
    type: "contract",
    ledger: LATEST - count + i,
    ledgerClosedAt: `t${i}`,
    contractId: pool,
    id: `event-${i}`,
    inSuccessfulContractCall: true,
    txHash: `hash-${i}`,
    topic: [nativeToScVal(`topic${i}`, { type: "symbol" }).toXDR("base64")],
    value: nativeToScVal(i, { type: "u32" }).toXDR("base64"),
  }));
  const requests = [];
  return {
    requests,
    respond(params) {
      requests.push(params);
      const from = params.pagination?.cursor ? Number(params.pagination.cursor) : 0;
      const limit = params.pagination?.limit ?? 100;
      const page = all.slice(from, from + limit);
      return { events: page, cursor: String(from + page.length) };
    },
  };
}

test("activity shows the newest 50 events, newest first, by paging forward", async () => {
  const net = fakeNetwork();
  const h = history(130);
  net.events = h.respond;
  globalThis.fetch = net.fetch;
  const rows = await events(pool);
  assert.equal(rows.length, 50);
  assert.equal(rows[0].id, "event-129", "newest event first");
  assert.equal(rows[49].id, "event-80");
  assert.equal(h.requests.length, 2, "paged once with the cursor");
  assert.equal(h.requests[0].startLedger, LATEST - 17280);
  assert.equal(h.requests[1].pagination.cursor, "100");
  assert.equal(h.requests[1].startLedger, undefined, "cursor requests carry no start ledger");
  const markets = JSON.parse(readFileSync("config/markets.json", "utf8"));
  for (const request of h.requests) {
    assert.deepEqual(request.filters[0].contractIds, [pool]);
    assert.deepEqual(request.filters[1].contractIds, [markets.factory], "factory events about this pool are kept on every page");
  }
});

test("the start ledger never precedes the RPC's retained history and paging is bounded", async () => {
  const net = fakeNetwork();
  net.oldestLedger = LATEST - 1000;
  const h = history(5000);
  net.events = h.respond;
  globalThis.fetch = net.fetch;
  const rows = await events(pool);
  assert.equal(h.requests[0].startLedger, LATEST - 1000);
  assert.equal(h.requests.length, 10, "at most ten pages");
  assert.equal(rows[0].id, "event-999");
  assert.equal(rows.length, 50);
});

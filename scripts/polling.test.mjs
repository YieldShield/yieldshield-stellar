import { test } from "node:test";
import assert from "node:assert/strict";
import { pollUntil } from "../apps/web/src/polling.ts";

function clock() {
  let time = 0;
  const waits = [];
  return { waits, now: () => time, sleep: async (ms) => { waits.push(ms); time += ms; } };
}

test("confirmation polling retries failed requests with backoff and continues", async () => {
  const c = clock();
  const answers = [new Error("503"), new Error("503"), "NOT_FOUND", "SUCCESS"];
  const r = await pollUntil(
    async () => { const a = answers.shift(); if (a instanceof Error) throw a; return a; },
    (s) => s !== "NOT_FOUND",
    { deadline: 60_000, now: c.now, sleep: c.sleep },
  );
  assert.deepEqual(r, { value: "SUCCESS", timedOut: false });
  assert.deepEqual(c.waits, [1500, 3000, 6000, 1500], "backoff doubles, then resets after a response");
});

test("polling stops at the deadline and reports the last failure", async () => {
  const c = clock();
  const r = await pollUntil(
    async () => { throw new Error("RPC down"); },
    () => true,
    { deadline: 20_000, now: c.now, sleep: c.sleep },
  );
  assert.equal(r.timedOut, true);
  assert.equal(r.error.message, "RPC down");
  assert.equal(c.now(), 20_000, "no request waits past the deadline");
  assert.ok(Math.max(...c.waits) <= 8000, "backoff is capped");
});

test("a pending transaction is reported as still pending, not failed", async () => {
  const c = clock();
  const r = await pollUntil(async () => "NOT_FOUND", (s) => s !== "NOT_FOUND", { deadline: 5_000, now: c.now, sleep: c.sleep });
  assert.deepEqual(r, { value: "NOT_FOUND", error: undefined, timedOut: true });
});

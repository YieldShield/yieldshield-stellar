import { test } from "node:test";
import assert from "node:assert/strict";
import { isNotFound, message } from "../apps/web/src/errors.ts";

test("only an HTTP 404 account lookup is treated as an unfunded wallet", () => {
  assert.equal(isNotFound({ response: { status: 404 } }), true);
  for (const e of [{ response: { status: 502 } }, new Error("Network Error"), null, undefined])
    assert.equal(isNotFound(e), false);
  assert.equal(message(new Error("boom")), "boom");
  assert.equal(message("text"), "text");
});

import { explainSimulationError } from "../apps/web/src/errors.ts";
const tokenFailure = `HostError: Error(Contract, #10)

Event log (newest first):
   0: [Diagnostic Event] contract:CA5F..., topics:[error, Error(Contract, #10)], data:"escalating error to panic"
   1: [Diagnostic Event] contract:CA5F..., topics:[error, Error(Contract, #10)], data:["balance is not sufficient to spend", 0, 1000000000]
   2: [Diagnostic Event] topics:[fn_call, CA5F..., transfer], data:[GABC..., CA5F..., 1000000000]`;
const panic = `HostError: Error(WasmVm, InvalidAction)

Event log (newest first):
   0: [Diagnostic Event] contract:CBMS..., topics:[error, Error(WasmVm, InvalidAction)], data:["VM call trapped: UnreachableCodeReached", exit]
   1: [Diagnostic Event] topics:[fn_call, CBMS..., exit], data:[7, 1000000, true, 990000, 1760000000]`;

test("simulation failures become one short sentence with at most one diagnostic", () => {
  assert.equal(
    explainSimulationError(tokenFailure, "deposit"),
    "Your token balance is too low for this amount. (balance is not sufficient to spend)",
  );
  const exit = explainSimulationError(panic, "exit");
  assert.equal(exit, "The contract rejected this action. The 60-second exit delay may not have passed, the pool may have matured, or the payout moved below your minimum.");
  assert.doesNotMatch(exit, /HostError|Diagnostic|\n/);
  assert.match(explainSimulationError("HostError: Error(Contract, #13)", "claim"), /trustline is missing/);
  assert.match(explainSimulationError("HostError: Error(Auth, InvalidAction)", "exit"), /Authorization failed/);
  assert.match(explainSimulationError("HostError: Error(Storage, MissingValue)"), /testnet may have reset/);
  assert.match(explainSimulationError("HostError: Error(WasmVm, InvalidAction)", "unknown"), /limit, deadline or balance check failed/);
  assert.equal(explainSimulationError("socket hang up"), "The network could not simulate this action. Try again shortly.");
  const long = `HostError: Error(Contract, #10)\n 1: [Diagnostic Event] data:["${"x".repeat(300)}"]`;
  assert.ok(explainSimulationError(long).length < 160, "diagnostic detail is shortened");
});

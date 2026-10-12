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

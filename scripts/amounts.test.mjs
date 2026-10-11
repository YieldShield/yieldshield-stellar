import { test } from "node:test";
import assert from "node:assert/strict";
import { Asset, Networks, StrKey } from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";
test("manifest is testnet only and TESTUSD SAC matches explicit issuer", () => {
  const m = JSON.parse(readFileSync("config/testnet.json", "utf8"));
  assert.equal(m.networkPassphrase, Networks.TESTNET);
  assert.equal(
    m.backing,
    new Asset("TESTUSD", m.issuer).contractId(Networks.TESTNET),
  );
  for (const key of ["pool", "vault", "faucet", "backing"])
    assert.ok(StrKey.isValidContract(m[key]));
  assert.ok(m.rpcUrl.includes("testnet"));
  assert.ok(m.horizonUrl.includes("testnet"));
});

import { parseAmount, format, minimumOutput } from "../apps/web/src/amounts.ts";
test("wallet amount parser preserves stroops and rejects lossy input", () => {
  assert.equal(parseAmount("1000.0000001"), 10000000001n);
  for (const value of [
    "0",
    "-1",
    "1e3",
    "1.00000001",
    "1000000.0000001",
    "abc",
  ])
    assert.throws(() => parseAmount(value));
  assert.equal(format(10005000000n), "1,000.50");
});
test("signed output minimum never allows more than 0.5 percent loss including dust", () => {
  for (let q = 1n; q <= 10000n; q++) {
    const min = minimumOutput(q);
    assert.ok(min * 1000n >= q * 995n);
    assert.ok(min <= q);
  }
  assert.equal(minimumOutput(0n), 0n);
  assert.equal(minimumOutput(2n), 2n);
  assert.equal(minimumOutput(199n), 199n);
});

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

import {
  parseAmount,
  format,
  minimumOutput,
  maximumPayment,
  MIN_CLAIM,
  exitClaimSlice,
  exitLeavesDust,
} from "../apps/web/src/amounts.ts";
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

test("maximum payment never permits more than0.5 percent excess including dust", () => {
  for (let q = 1n; q <= 10000n; q++) {
    const max = maximumPayment(q);
    assert.ok(max * 1000n <= q * 1005n);
    assert.ok(max >= q);
  }
  assert.equal(maximumPayment(1n), 1n);
});

test("minimum claim and exit claim rounding mirror the pool contract", () => {
  const source = readFileSync("contracts/pool-v3/src/lib.rs", "utf8");
  const rust = source.match(/pub const MIN_CLAIM: i128 = ([\d_]+);/);
  assert.ok(rust, "pool contract declares MIN_CLAIM");
  assert.equal(BigInt(rust[1].replaceAll("_", "")), MIN_CLAIM);
  assert.equal(format(MIN_CLAIM), "0.01");
  // Cases shared with the pool's Rust tests.
  assert.equal(exitClaimSlice(200_000n, 400_000n, 1n, false), 1n);
  assert.equal(exitClaimSlice(200_000n, 400_000n, 1n, true), 0n);
  assert.equal(exitClaimSlice(123_457n, 999n, 999n, false), 123_457n);
  for (const backing of [true, false]) {
    const both = 2n * MIN_CLAIM;
    assert.equal(exitLeavesDust(both, both, MIN_CLAIM + 1n, backing), true);
    assert.equal(exitLeavesDust(both, both, MIN_CLAIM, backing), false);
    assert.equal(exitLeavesDust(both, both, both, backing), false);
  }
  assert.equal(exitLeavesDust(MIN_CLAIM, MIN_CLAIM, 1n, false), true);
  for (let shares = 1n; shares <= 60n; shares++)
    for (let closing = 1n; closing < shares; closing++) {
      const claim = MIN_CLAIM + shares * 7n + 3n;
      const receipt = claim - exitClaimSlice(claim, shares, closing, false);
      const paid = exitClaimSlice(claim, shares, closing, true);
      assert.ok(receipt * shares <= claim * (shares - closing));
      assert.ok(paid * shares <= claim * closing);
    }
});

import { normalizeAmountInput } from "../apps/web/src/amounts.ts";
test("amounts accept surrounding whitespace and a single decimal comma", () => {
  assert.equal(parseAmount(" 12.5\t"), 125_000_000n);
  assert.equal(parseAmount("12,5"), 125_000_000n);
  assert.equal(parseAmount(" 0,125 "), 1_250_000n);
  assert.equal(parseAmount("1000,0000001"), 10_000_000_001n);
  assert.equal(parseAmount("12,50"), 125_000_000n);
  for (const value of ["1,000", "12,500", "1,000.5", "1,2,3", "1 000", ",5", "5,"])
    assert.throws(() => parseAmount(value), value);
  assert.throws(() => parseAmount("1,000"), /ambiguous/);
  assert.equal(normalizeAmountInput(" 12,5 "), "12.5");
  assert.equal(normalizeAmountInput("1,000"), "1,000", "ambiguous input is left for the user to fix");
  assert.equal(normalizeAmountInput("1.5"), "1.5");
});

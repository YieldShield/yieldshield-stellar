import { test } from "node:test";
import assert from "node:assert/strict";
import { Account, Asset, Contract, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { validateTestSignature } from "./e2e-wallet-policy.mjs";
const account = Keypair.random().publicKey(), issuer = Keypair.random().publicKey();
const contract = "CA5FTBNDTT6NF53PFY3FWD43Z2XHA4K6CAGCGSYGHTXSHO5MZIS5TKHT";
const allowed = { accounts: [account], issuer, contracts: new Map([[contract, ["provide"]]]) };
function request(operation, options = {}) {
  const tx = new TransactionBuilder(new Account(options.source || account, "1"), { fee: options.fee || "100000", networkPassphrase: Networks.TESTNET }).addOperation(operation).setTimeout(options.timeout || 120).build();
  return { transactionXdr: tx.toXDR(), networkPassphrase: Networks.TESTNET, accountToSign: account };
}
test("local signing allows only bounded known Testnet contract calls", () => {
  const r = request(new Contract(contract).call("provide"));
  assert.equal(validateTestSignature(r, allowed).record.method, "provide");
  assert.throws(() => validateTestSignature({ ...r, networkPassphrase: Networks.PUBLIC }, allowed), /Testnet only/);
  assert.throws(() => validateTestSignature({ ...r, accountToSign: issuer }, allowed), /mismatched/);
  assert.throws(() => validateTestSignature(request(new Contract(contract).call("admin")), allowed), /not allowed/);
  assert.throws(() => validateTestSignature(request(new Contract(contract).call("provide"), { fee: "10000001" }), allowed), /Fee exceeds/);
  assert.throws(() => validateTestSignature(request(new Contract(contract).call("provide"), { timeout: 600 }), allowed), /deadline/);
});
test("local signing permits only the project trustline and rejects money transfers", () => {
  const trust = Operation.changeTrust({ asset: new Asset("TESTUSD", issuer) });
  assert.equal(validateTestSignature(request(trust), allowed).record.method, "changeTrust");
  assert.throws(() => validateTestSignature(request(Operation.changeTrust({ asset: new Asset("USD", issuer) })), allowed), /Only the project/);
  assert.throws(() => validateTestSignature(request(Operation.payment({ destination: issuer, asset: Asset.native(), amount: "1" })), allowed), /Operation is not allowed/);
});

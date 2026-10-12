import { Address, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

// This policy is used only by the explicitly started localhost E2E server.
// The production application never imports it or exposes a signing endpoint.
export function validateTestSignature(request, allowed) {
  if (request.networkPassphrase !== Networks.TESTNET) throw Error("Testnet only");
  const tx = TransactionBuilder.fromXDR(request.transactionXdr, Networks.TESTNET);
  if (!(tx instanceof Transaction)) throw Error("Fee-bump transactions are not allowed");
  if (!allowed.accounts.includes(tx.source) || request.accountToSign !== tx.source)
    throw Error("Unknown or mismatched disposable test account");
  if (BigInt(tx.fee) > 10_000_000n) throw Error("Fee exceeds one test XLM");
  if (tx.operations.length !== 1) throw Error("Exactly one operation is required");
  const operation = tx.operations[0];
  if (operation.source && operation.source !== tx.source) throw Error("Alternate operation source");
  const until = Number(tx.timeBounds?.maxTime || 0);
  if (until <= Date.now() / 1000 || until > Date.now() / 1000 + 180)
    throw Error("Missing or excessive transaction deadline");
  let contract = "", method = "";
  if (operation.type === "changeTrust") {
    if (operation.line.code !== "TESTUSD" || operation.line.issuer !== allowed.issuer)
      throw Error("Only the project TESTUSD trustline is allowed");
    method = "changeTrust";
  } else if (operation.type === "invokeHostFunction" && operation.func.type === "hostFunctionTypeInvokeContract") {
    const call = operation.func.invokeContract;
    contract = Address.fromScAddress(call.contractAddress).toString();
    method = call.functionName.toString();
    if (!allowed.contracts.get(contract)?.includes(method)) throw Error("Contract method is not allowed");
  } else if (operation.type === "restoreFootprint") {
    // The app restores archived storage before an approved call; only data
    // of approved contracts (and contract code) may be renewed.
    const ext = tx.toEnvelope().value.tx.ext;
    const keys = ext.type === "sorobanData" ? ext.value.resources.footprint.readWrite : [];
    if (!keys.length) throw Error("Restore footprint is empty");
    for (const key of keys)
      if (key.type !== "contractCode" && !(key.type === "contractData" && allowed.contracts.has(Address.fromScAddress(key.value.contract).toString())))
        throw Error("Restore touches an unapproved contract");
    method = "restoreFootprint";
  } else throw Error("Operation is not allowed");
  return { tx, record: { source: tx.source, contract, method, hash: Buffer.from(tx.hash()).toString("hex") } };
}

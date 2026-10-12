// Test double for Soroban RPC, Horizon and Friendbot behind global fetch, used
// by node tests of apps/web/src/stellar.ts. Tests override the hooks below;
// every request is appended to `log`.
import {
  Address,
  Keypair,
  Networks,
  SorobanDataBuilder,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";

export const LATEST = 5_200_000;
const json = (status, body) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const hex = (bytes) => Buffer.from(bytes).toString("hex");

function accountEntry(id) {
  return xdr.LedgerEntryData.account(
    new xdr.AccountEntry({
      accountId: Keypair.fromPublicKey(id).xdrAccountId(),
      balance: 100_000_000_000n,
      seqNum: 100n,
      numSubEntries: 0,
      inflationDest: null,
      flags: 0,
      homeDomain: "",
      thresholds: Buffer.from([1, 0, 0, 0]),
      signers: [],
      ext: xdr.AccountEntryExt.v0(),
    }),
  );
}
function instanceEntry(id) {
  return xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: xdr.ExtensionPoint.v0(),
      contract: Address.fromString(id).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
      val: xdr.ScVal.scvContractInstance(
        new xdr.ScContractInstance({
          executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32)),
          storage: null,
        }),
      ),
    }),
  );
}
function successMeta(returnValue) {
  return xdr.TransactionMeta.v3(
    new xdr.TransactionMetaV3({
      ext: xdr.ExtensionPoint.v0(),
      txChangesBefore: [],
      operations: [],
      txChangesAfter: [],
      sorobanMeta: new xdr.SorobanTransactionMeta({
        ext: xdr.SorobanTransactionMetaExt.v0(),
        events: [],
        returnValue: returnValue ?? xdr.ScVal.scvVoid(),
        diagnosticEvents: [],
      }),
    }),
  ).toXDR("base64");
}
const resultXdr = (ok) =>
  new xdr.TransactionResult({
    feeCharged: 100n,
    result: ok
      ? xdr.TransactionResultResult.txSuccess([])
      : xdr.TransactionResultResult.txFailed([]),
    ext: xdr.TransactionResultExt.v0(),
  }).toXDR("base64");

export function describeTx(tx) {
  const op = tx.operations[0];
  if (op.type !== "invokeHostFunction") return { type: op.type, source: tx.source, fee: tx.fee };
  const call = op.func.invokeContract;
  return {
    type: op.type,
    source: tx.source,
    fee: tx.fee,
    contract: Address.fromScAddress(call.contractAddress).toString(),
    method: call.functionName.toString(),
    args: call.args,
  };
}

export function fakeNetwork() {
  const net = {
    log: [],
    sent: [],
    submitted: [],
    accounts: new Set(),
    trustlines: new Map(),
    // Contract ids that exist on chain; null means every contract exists.
    contracts: null,
    // Number of upcoming HTTP 503 responses per RPC method / Horizon / Friendbot.
    unavailable: {},
    /** ({contract, method, args, source}) => {retval} | {error} | {retval, restore: true} */
    simulate: () => ({ retval: nativeToScVal(1n, { type: "i128" }) }),
    send: () => ({ status: "PENDING" }),
    /** (hash, attempt) => "SUCCESS" | "FAILED" | "NOT_FOUND" */
    transaction: () => "SUCCESS",
    returnValue: () => xdr.ScVal.scvVoid(),
    submit: () => [200, { hash: "classic", ledger: 1 }],
    friendbot: () => [200, { hash: "funded" }],
    feeStats: () => [200, { last_ledger_base_fee: "100", fee_charged: { p90: "100", p95: "100", p99: "100" }, max_fee: { p90: "100", p95: "100" } }],
    events: () => ({ events: [], cursor: "" }),
    attempts: new Map(),
    oldestLedger: LATEST - 120_960,
  };
  const down = (key) => {
    if (!net.unavailable[key]) return false;
    net.unavailable[key]--;
    return true;
  };
  function rpc({ method, params, id }) {
    const ok = (result) => [200, { jsonrpc: "2.0", id, result }];
    net.log.push(`rpc ${method}`);
    if (down(method)) return [503, "upstream unavailable"];
    switch (method) {
      case "getNetwork":
        return ok({ passphrase: Networks.TESTNET, protocolVersion: 23 });
      case "getHealth":
        return ok({ status: "healthy", latestLedger: LATEST, oldestLedger: net.oldestLedger, ledgerRetentionWindow: LATEST - net.oldestLedger });
      case "getLedgerEntries": {
        const entries = params.keys.flatMap((k) => {
          const key = xdr.LedgerKey.fromXDR(k, "base64");
          if (key.type === "account") {
            const raw = key.value.accountId.value;
            const owner = StrKey.encodeEd25519PublicKey(Buffer.from(raw.value ?? raw));
            return net.accounts.has(owner)
              ? [{ key: k, xdr: accountEntry(owner).toXDR("base64"), lastModifiedLedgerSeq: 1 }]
              : [];
          }
          if (key.type === "contractData") {
            const contract = Address.fromScAddress(key.value.contract).toString();
            return !net.contracts || net.contracts.has(contract)
              ? [{ key: k, xdr: instanceEntry(contract).toXDR("base64"), lastModifiedLedgerSeq: 1, liveUntilLedgerSeq: LATEST + 1000 }]
              : [];
          }
          return [];
        });
        return ok({ entries, latestLedger: LATEST });
      }
      case "simulateTransaction": {
        const tx = TransactionBuilder.fromXDR(params.transaction, Networks.TESTNET);
        const call = describeTx(tx);
        net.log.push(`simulate ${call.method} source=${call.source}`);
        const r = net.simulate(call);
        if (r.error) return ok({ latestLedger: LATEST, error: r.error, events: [] });
        const data = new SorobanDataBuilder().setResourceFee(50_000).build().toXDR("base64");
        return ok({
          latestLedger: LATEST,
          minResourceFee: "50000",
          transactionData: data,
          results: [{ auth: [], xdr: r.retval.toXDR("base64") }],
          ...(r.restore
            ? { restorePreamble: { minResourceFee: "200000", transactionData: new SorobanDataBuilder().setResourceFee(200_000).build().toXDR("base64") } }
            : {}),
        });
      }
      case "sendTransaction": {
        const tx = TransactionBuilder.fromXDR(params.transaction, Networks.TESTNET);
        const hash = hex(tx.hash());
        const call = describeTx(tx);
        net.sent.push({ hash, ...call });
        net.log.push(`send ${call.method || call.type}`);
        return ok({ hash, latestLedger: LATEST, latestLedgerCloseTime: "0", ...net.send(call) });
      }
      case "getTransaction": {
        const attempt = (net.attempts.get(params.hash) || 0) + 1;
        net.attempts.set(params.hash, attempt);
        const status = net.transaction(params.hash, attempt);
        const base = { status, latestLedger: LATEST, latestLedgerCloseTime: "0", oldestLedger: 1, oldestLedgerCloseTime: "0" };
        if (status === "NOT_FOUND") return ok(base);
        const sent = net.sent.find((s) => s.hash === params.hash);
        return ok({
          ...base,
          ledger: LATEST,
          createdAt: "0",
          applicationOrder: 1,
          feeBump: false,
          envelopeXdr: sent?.envelope ?? "",
          resultXdr: resultXdr(status === "SUCCESS"),
          resultMetaXdr: successMeta(status === "SUCCESS" ? net.returnValue(sent) : undefined),
        });
      }
      case "getLatestLedger":
        return ok({ id: "x", protocolVersion: 23, sequence: LATEST });
      case "getEvents":
        net.log.push(`getEvents ${JSON.stringify(params)}`);
        return ok({ latestLedger: LATEST, oldestLedger: LATEST - 120_960, latestLedgerCloseTime: "0", oldestLedgerCloseTime: "0", ...net.events(params) });
      default:
        return [200, { jsonrpc: "2.0", id, error: { code: -32601, message: `fake: ${method}` } }];
    }
  }
  function horizonAccount(id) {
    const balances = [{ balance: "100.0000000", asset_type: "native" }];
    const line = net.trustlines.get(id);
    if (line) balances.push({ asset_type: "credit_alphanum12", asset_code: "TESTUSD", ...line });
    return { id, account_id: id, sequence: "100", subentry_count: 0, thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 }, flags: {}, balances, signers: [], data: {}, _links: {} };
  }
  net.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const body = init.body ? String(init.body) : "";
    let status, response;
    if (url.hostname === "soroban-testnet.stellar.org") {
      const request = JSON.parse(body);
      if (request.method === "sendTransaction") {
        // Keep the envelope so getTransaction can return it.
        const tx = TransactionBuilder.fromXDR(request.params.transaction, Networks.TESTNET);
        [status, response] = rpc(request);
        const sent = net.sent.find((s) => s.hash === hex(tx.hash()));
        if (sent) sent.envelope = request.params.transaction;
      } else [status, response] = rpc(request);
    } else if (url.hostname === "horizon-testnet.stellar.org") {
      net.log.push(`horizon ${init.method || "GET"} ${url.pathname}`);
      const account = url.pathname.match(/^\/accounts\/(G[A-Z2-7]{55})$/);
      if (down("horizon")) [status, response] = [503, { status: 503, title: "Service Unavailable" }];
      else if (account)
        [status, response] = net.accounts.has(account[1])
          ? [200, horizonAccount(account[1])]
          : [404, { type: "https://stellar.org/horizon-errors/not_found", title: "Resource Missing", status: 404 }];
      else if (url.pathname === "/transactions") {
        const tx = TransactionBuilder.fromXDR(new URLSearchParams(body).get("tx"), Networks.TESTNET);
        net.submitted.push(describeTx(tx));
        [status, response] = net.submit(tx);
      } else if (url.pathname === "/fee_stats") [status, response] = net.feeStats();
      else [status, response] = [404, {}];
    } else if (url.hostname === "friendbot.stellar.org") {
      net.log.push(`friendbot ${url.searchParams.get("addr")}`);
      [status, response] = down("friendbot") ? [503, "busy"] : net.friendbot(url.searchParams.get("addr"));
    } else throw new TypeError(`fake network: unexpected ${url}`);
    return json(status, response);
  };
  return net;
}

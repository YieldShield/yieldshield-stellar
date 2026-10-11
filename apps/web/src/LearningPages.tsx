import React, { useEffect, useState } from "react";
import type { Data, Market, Wallet, State } from "./v3";
import { format, parseAmount, minimumOutput, UNIT } from "./amounts";
import {
  type Api,
  type Quote,
  type Ctx,
  explorer,
  small,
  date,
  now,
  f,
  Amount,
  Stats,
  Context,
  ContractLink,
} from "./shared";
export function Learn(c: Ctx) {
  const [value, setValue] = useState("100");
  const [change, setChange] = useState("20");
  const initial = Number(value) || 0;
  const ending = Math.max(0, initial * (1 + (Number(change) || 0) / 100));
  const providerFee = (c.data?.state.terms.junior_fee_bps ?? 1000) / 10000,
    creatorFee = (c.data?.state.terms.creator_fee_bps ?? 100) / 10000;
  const gain = Math.max(0, ending - initial),
    fees = gain * (providerFee + creatorFee + 0.01);
  return (
    <>
      <div className="two-column">
        <section className="panel">
          <h2>One receipt. Two choices.</h2>
          <p>
            A holder locks a funded vault receipt. Its current redeemable value
            defines a fixed claim in the selected backing token. Separate
            provider capital reserves that obligation plus a buffer.
          </p>
          <ol>
            <li>
              <strong>Receipt exit:</strong> receive your receipt back, less
              fees on positive gain only.
            </li>
            <li>
              <strong>Backing exit:</strong> receive the fixed backing claim and
              surrender the receipt to providers.
            </li>
            <li>
              <strong>Maturity:</strong> anyone can close the remaining position
              into segregated backing credit.
            </li>
          </ol>
          <p>
            Partial exits reduce the remaining claim and reserve proportionally.
            Transfer moves the remaining position rights to a new owner.
          </p>
        </section>
        <section className="context-panel">
          <h2>Provider capital bears risk.</h2>
          <p>
            Providers purchase a proportional share of reserve cash. They
            receive a separate share of positive-gain fees and surrendered
            receipts. Acquired receipts may be worth less than the backing paid
            to a holder.
          </p>
          <p>
            Entry and cash withdrawal pause while any holder liability remains
            open. The fixed end date bounds admission. A withdrawal notice is
            also required; fee and acquired-inventory claims remain separate.
          </p>
        </section>
      </div>
      <section className="panel scenario">
        <p className="eyebrow">ILLUSTRATIVE SCENARIO / NO TRANSACTION</p>
        <h2>See each side of the outcome.</h2>
        <div className="form-grid">
          <label>
            Opening backing value
            <input
              type="number"
              min="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <label>
            Vault value change (%)
            <input
              type="range"
              min="-100"
              max="100"
              value={change}
              onChange={(e) => setChange(e.target.value)}
            />
            {change}%
          </label>
        </div>
        <Stats
          items={[
            ["Gross receipt value", ending.toFixed(2)],
            ["Holder receipt exit", (ending - fees).toFixed(2)],
            ["Fixed backing exit", initial.toFixed(2)],
            ["Total gain fees", fees.toFixed(2)],
          ]}
        />
        <p>
          If the holder takes backing, providers pay {initial.toFixed(2)} and
          acquire a receipt currently valued at {ending.toFixed(2)}: an
          illustrative {ending >= initial ? "surplus" : "shortfall"} of{" "}
          {Math.abs(ending - initial).toFixed(2)} before costs. This is not a
          return forecast. Exact contract rounding and live redemption value
          apply.
        </p>
      </section>
    </>
  );
}

export function Legal() {
  return (
    <section className="panel prose">
      <h2>Test assets only.</h2>
      <p>
        YieldShield Stellar is an unaudited research prototype. TESTUSD is
        issued for this demo and is not Circle USDC or redeemable for real
        currency. Vault receipts are backed by test assets; their values may be
        changed by funded donations or explicit admin loss simulation.
      </p>
      <h2>Defined claims have defined units.</h2>
      <p>
        A protected claim is denominated in the selected pool’s backing asset.
        For receipt-backed markets, a fixed receipt quantity does not guarantee
        a fiat value. Holders and providers remain exposed to contract defects,
        testnet resets, asset authorization and storage availability.
      </p>
      <h2>Participation and custody.</h2>
      <p>
        Transactions require your wallet authorization. Provider capital absorbs
        surrendered-receipt risk and may remain locked until holder liabilities
        settle and the withdrawal notice matures. Fees are charged on
        positive-gain receipt exits only. The exchange is operated with finite,
        withdrawable test inventory.
      </p>
      <p>
        No lending protocol, USDC issuer, price oracle or external investment
        strategy is integrated by implication. No XLM yield is offered. Grant
        applications remain separate from this prototype and no funding award is
        claimed.
      </p>
    </section>
  );
}

import React, { useEffect, useState, useId } from "react";
import type { Data, Market, Wallet, State } from "./v3";
import { format, parseAmount, minimumOutput, UNIT } from "./amounts";
export type Api = typeof import("./v3");

export type Quote = {
  title: string;
  lines: [string, string][];
  contract: string;
  method: string;
  args: Parameters<Api["transact"]>[3];
  deadline: number;
  follow?: string;
  special?: "trust";
};

export const explorer = "https://stellar.expert/explorer/testnet";

export const small = (s: string) => `${s.slice(0, 6)}…${s.slice(-5)}`;

export const date = (v: bigint | number) =>
  new Date(Number(v) * 1000).toLocaleString();

export const now = () => Math.floor(Date.now() / 1000);

export const f = (v: bigint | undefined) =>
  v === undefined ? "—" : format(v, 7);

export type Ctx = {
  api?: Api;
  address: string;
  market?: Market;
  data?: Data;
  wallet?: Wallet;
  busy: boolean;
  href: (p: string, m?: Market) => string;
  review: (make: (a: Api) => Promise<Quote> | Quote) => Promise<void>;
  clear: () => void;
};

export function Amount({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  suffix: string;
}) {
  const unitId = useId();
  return (
    <label className="amount-field">
      {label}
      <div>
        <input
          name={label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          aria-describedby={unitId}
        />
        <span id={unitId}>{suffix}</span>
      </div>
    </label>
  );
}

export function Stats({ items }: { items: [string, string][] }) {
  return (
    <div className="stats-row">
      {items.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}

export function Context({ market, data }: { market?: Market; data?: Data }) {
  return (
    <aside className="context-panel">
      <h2>Pool terms</h2>
      <p className="asset-pair">{market ? `${market.symbol} / ${market.backingSymbol}` : "Loading…"}</p>
      <dl>
        <dt>Free backing</dt>
        <dd>
          {data ? f(data.state.liquidity - data.state.reserved) : "—"}{" "}
          {market?.backingSymbol}
        </dd>
        <dt>Reserved backing</dt>
        <dd>{f(data?.state.reserved)}</dd>
        <dt>Pool ends</dt>
        <dd>{data ? date(data.state.end) : "—"}</dd>
        <dt>Collateral ratio</dt>
        <dd>{data ? `${data.state.terms.collateral_bps / 100}%` : "—"}</dd>
        <dt>Gain fees</dt>
        <dd>
          {data
            ? `${data.state.terms.junior_fee_bps / 100}% provider + ${data.state.terms.creator_fee_bps / 100}% creator + 1% protocol`
            : "—"}
        </dd>
      </dl>
      <p className="fine">
        Receipt exits pay fees only on gains. Backing exits surrender receipts.
        Claims are in {market?.backingSymbol || "backing tokens"}, not guaranteed dollars.
      </p>
      <details className="optional-details">
        <summary>How this vault is backed</summary>
        <p>{market?.description}</p>
      </details>
    </aside>
  );
}

export function ContractLink({ id }: { id?: string }) {
  return id ? (
    <a href={`${explorer}/contract/${id}`} target="_blank" rel="noreferrer">
      {small(id)} ↗
    </a>
  ) : (
    <>—</>
  );
}

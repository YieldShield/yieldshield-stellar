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
export function percent(input: string, max: number) {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(input))
    throw new Error("Use a percentage with at most two decimals.");
  const bps = Math.round(Number(input) * 100);
  if (bps > max) throw new Error("Percentage exceeds the allowed range.");
  return bps;
}

export function CreatePool(c: Ctx & { markets: Market[] }) {
  const [asset, setAsset] = useState("");
  const [collateral, setCollateral] = useState("150");
  const [junior, setJunior] = useState("10");
  const [creator, setCreator] = useState("1");
  const [duration, setDuration] = useState("604800");
  const [delay, setDelay] = useState("60");
  const unique = [...new Map(c.markets.map((m) => [m.vault, m])).values()];
  const selected = unique.find((m) => m.vault === asset) || unique[0];
  return (
    <div className="two-column">
      <section className="panel">
        <p className="eyebrow">PINNED NATIVE FACTORY</p>
        <h2>Choose the rules.</h2>
        <label>
          Asset / backing pair
          <select
            value={selected?.vault || ""}
            onChange={(e) => {
              setAsset(e.target.value);
              c.clear();
            }}
          >
            {unique.map((m) => (
              <option value={m.vault} key={m.vault}>
                {m.symbol} / {m.backingSymbol}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          {[
            ["Collateral ratio (%)", collateral, setCollateral],
            ["Provider gain fee (%)", junior, setJunior],
            ["Creator gain fee (%)", creator, setCreator],
          ].map(([label, value, setter]) => (
            <label key={String(label)}>
              {String(label)}
              <input
                type="number"
                value={String(value)}
                onChange={(e) => {
                  (setter as (v: string) => void)(e.target.value);
                  c.clear();
                }}
              />
            </label>
          ))}
          <label>
            Pool term
            <select
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
                c.clear();
              }}
            >
              <option value="86400">1 day</option>
              <option value="604800">7 days</option>
              <option value="2592000">30 days</option>
            </select>
          </label>
          <label>
            Withdrawal notice
            <select
              value={delay}
              onChange={(e) => {
                setDelay(e.target.value);
                c.clear();
              }}
            >
              <option value="60">1 minute</option>
              <option value="3600">1 hour</option>
              <option value="86400">1 day</option>
            </select>
          </label>
        </div>
        <p>
          Protocol gain fee: 1%. Creation bond: 10 TESTUSD, refundable to the
          creator after pool maturity. The native factory pins the
          implementation and approved vaults; it cannot turn an arbitrary token
          into a verified market.
        </p>
        <button
          disabled={!selected || c.busy}
          onClick={() =>
            c.review(async (a) => {
              const terms = {
                collateral_bps: percent(collateral, 30000),
                junior_fee_bps: percent(junior, 3000),
                creator_fee_bps: percent(creator, 500),
                duration: BigInt(duration),
                notice_delay: BigInt(delay),
              };
              if (
                terms.collateral_bps < 10000 ||
                terms.collateral_bps > 30000 ||
                terms.junior_fee_bps < 0 ||
                terms.junior_fee_bps > 3000 ||
                terms.creator_fee_bps < 0 ||
                terms.creator_fee_bps > 500
              )
                throw new Error(
                  "Collateral must be 100–300%, provider fee 0–30%, creator fee 0–5%.",
                );
              const limit = await a.creationLimit(c.address);
              if (limit) throw new Error(limit);
              return {
                title: "Create native protection pool",
                lines: [
                  ["Pair", `${selected!.symbol} / ${selected!.backingSymbol}`],
                  ["Collateral", `${collateral}%`],
                  [
                    "Gain fee split",
                    `${junior}% provider + ${creator}% creator +1% protocol`,
                  ],
                  ["Term", `${Number(duration) / 86400} days`],
                  ["Refundable bond", "10 TESTUSD"],
                ],
                contract: a.deployment.factory,
                method: "create",
                args: [
                  a.addressSc(c.address),
                  a.addressSc(selected!.vault),
                  a.termsSc(terms),
                  a.saltSc(),
                ],
                deadline: now() + 120,
              };
            })
          }
        >
          Review pool creation →
        </button>
      </section>
      <section className="context-panel">
        <h2>Your pool, on chain.</h2>
        <ol>
          <li>Approve the defined template, terms and refundable bond.</li>
          <li>The factory deploys and initializes the pool atomically.</li>
          <li>The registry makes it discoverable throughout this app.</li>
          <li>Providers supply backing before holders can open protection.</li>
        </ol>
        <p>
          All positions share the pool’s fixed maturity. Admissions close 60
          seconds earlier. A fresh pool is required for a new term.
        </p>
        <p>
          Available pairs are real, independently funded demo vaults.
          Receipt-backed collateral carries the underlying vault’s risks; it
          does not lock a dollar value.
        </p>
      </section>
    </div>
  );
}

export function Status(c: Ctx & { markets: Market[] }) {
  return (
    <>
      <Stats
        items={[
          ["Network", "Stellar Testnet"],
          ["Listed pools", String(c.markets.length)],
          [
            "Selected pool read",
            c.data
              ? new Date(c.data.readAt).toLocaleTimeString()
              : "Unavailable",
          ],
          ["Deployment", "Native Soroban V3"],
        ]}
      />
      <div className="two-column">
        <section className="panel">
          <h2>Verified addresses</h2>
          <dl>
            <dt>Factory</dt>
            <dd>
              <ContractLink id={c.api?.deployment.factory} />
            </dd>
            <dt>TESTUSD backing</dt>
            <dd>
              <ContractLink id={c.api?.config.backing} />
            </dd>
            <dt>Faucet</dt>
            <dd>
              <ContractLink id={c.api?.config.faucet} />
            </dd>
            {c.markets.map((m) => (
              <React.Fragment key={m.pool}>
                <dt>{m.name}</dt>
                <dd>
                  <ContractLink id={m.pool} />
                </dd>
              </React.Fragment>
            ))}
          </dl>
          <p>
            Contract data is read live. An unavailable read is never treated as
            a zero balance or proof of solvency.
          </p>
          <button className="quiet" onClick={() => location.reload()}>
            Refresh network reads
          </button>
        </section>
        <section className="context-panel">
          <h2>Operational boundaries</h2>
          <p>
            Stellar storage has finite lifetimes. Deployment extends code and
            instance lifetimes; state writes extend records. Simulated reads do
            not extend live storage. Testnet resets or archived state may
            interrupt access.
          </p>
          <p>
            Pool terms are capped at 30 days; withdrawal notices at 7 days.
            There is no promised service continuity, audited production release
            or real-money insurance.
          </p>
          <a href="/legacy">Access previous deployment →</a>
          <p>
            Legacy positions retain their original contract and exit interface.
            The current registry does not silently migrate ownership or
            balances.
          </p>
        </section>
      </div>
    </>
  );
}

export function AdminClaims(c: Ctx) {
  const [record, setRecord] = useState<{
    creator: string;
    end: bigint;
    bond: bigint;
    claimed: boolean;
  }>();
  useEffect(() => {
    setRecord(undefined);
    let alive = true;
    if (c.api && c.market)
      c.api
        .view(c.api.deployment.factory, "record", [
          c.api.addressSc(c.market.pool),
        ])
        .then((value) => {
          if (alive) setRecord(value);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [c.api, c.market?.pool, c.wallet]);
  const claim = (method: string, label: string, amount: bigint) =>
    c.review((a) => ({
      title: label,
      lines: [["Receipt amount", `${f(amount)} ${c.market!.symbol}`]],
      contract: c.market!.pool,
      method,
      args: [a.addressSc(c.address)],
      deadline: now() + 120,
    }));
  return (
    <section className="panel">
      <h2>Creator & protocol accounting</h2>
      <dl>
        <dt>Creator</dt>
        <dd>{c.data ? small(c.data.state.creator) : "—"}</dd>
        <dt>Creator fee inventory</dt>
        <dd>
          {f(c.data?.state.creator_rewards)} {c.market?.symbol}
        </dd>
        <dt>Protocol fee inventory</dt>
        <dd>
          {f(c.data?.state.protocol_rewards)} {c.market?.symbol}
        </dd>
        <dt>Creation bond</dt>
        <dd>
          {record
            ? `${f(record.bond)} TESTUSD · ${record.claimed ? "claimed" : now() >= Number(record.end) ? "refundable" : "locked until maturity"}`
            : "Reading…"}
        </dd>
      </dl>
      <div className="actions">
        <button
          disabled={
            c.busy ||
            c.address !== c.data?.state.creator ||
            !c.data?.state.creator_rewards
          }
          onClick={() =>
            claim(
              "claim_creator",
              "Claim creator gain fees",
              c.data!.state.creator_rewards,
            )
          }
        >
          Review creator claim
        </button>
        <button
          className="secondary"
          disabled={
            c.busy ||
            c.address !== c.data?.state.protocol ||
            !c.data?.state.protocol_rewards
          }
          onClick={() =>
            claim(
              "claim_protocol",
              "Claim protocol gain fees",
              c.data!.state.protocol_rewards,
            )
          }
        >
          Review protocol claim
        </button>
        <button
          className="quiet"
          disabled={
            c.busy ||
            !record ||
            record.claimed ||
            record.creator !== c.address ||
            now() < Number(record.end)
          }
          onClick={() =>
            c.review((a) => ({
              title: "Claim refundable creation bond",
              lines: [["Bond", `${f(record!.bond)} TESTUSD`]],
              contract: a.deployment.factory,
              method: "claim_bond",
              args: [a.addressSc(c.market!.pool), a.addressSc(c.address)],
              deadline: now() + 120,
            }))
          }
        >
          Review bond refund
        </button>
      </div>
      <p className="fine">
        Fees are separate receipt inventory and cannot draw from reserved
        backing. Only the designated recipient can authorize each claim.
      </p>
    </section>
  );
}

export function Activity(c: Ctx) {
  return <ActivityFeed key={c.market?.pool || ""} {...c} />;
}
function ActivityFeed(c: Ctx) {
  const [rows, setRows] = useState<Awaited<ReturnType<Api["events"]>>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!c.api || !c.market) return;
    setLoading(true);
    let alive = true;
    c.api
      .events(c.market.pool)
      .then((r) => {
        if (alive) {
          setRows(r);
          setError("");
        }
      })
      .catch(() => {
        if (alive)
          setError(
            "Recent contract events could not be refreshed. Any displayed events are from the last successful read. Use the contract explorer link below.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [c.api, c.market?.pool, c.wallet]);
  return (
    <section className="panel">
      <h2>Recent selected-pool events</h2>
      <p>
        Up to 50 events from the most recent 17,280 ledgers. This bounded RPC
        feed is not a full historical index.
      </p>
      {loading && (
        <p role="status">
          {rows.length ? "Refreshing recent events…" : "Reading recent events…"}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {rows.map((r) => (
        <div className="position-row" key={r.id}>
          <div>
            <strong>{r.topic}</strong>
            <p>
              Ledger {r.ledger} · {r.time}
            </p>
          </div>
          <a href={`${explorer}/tx/${r.hash}`} target="_blank" rel="noreferrer">
            Transaction ↗
          </a>
        </div>
      ))}
      {!rows.length && !error && !loading && (
        <p>No events returned in this recent window.</p>
      )}
      <ContractLink id={c.market?.pool} />
    </section>
  );
}

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
import { AdminClaims } from "./ManagementPages";
export function Home({ href }: { href: Ctx["href"] }) {
  return (
    <section className="home-hero">
      <div>
        <p className="eyebrow">THE STELLAR RESERVE MARKET</p>
        <h1>
          A defined exit.
          <br />
          <em>A different side of risk.</em>
        </h1>
        <p>
          Protect a funded vault receipt, or supply the backing that makes its
          exit possible. Choose a market, inspect its capacity, and take your
          side.
        </p>
        <div className="actions">
          <a className="button" href={href("/protect")}>
            Protect a position ↗
          </a>
          <a className="button secondary" href={href("/provide")}>
            Provide capital
          </a>
        </div>
        <a href="/how-it-works">Understand the mechanics →</a>
      </div>
      <div className="hero-diagram">
        <span>HOLDER</span>
        <div className="diagram-receipt">
          Vault receipts
          <br />
          <strong>Defined backing claim</strong>
        </div>
        <div className="diagram-line">↓ separately funded capacity ↓</div>
        <div className="diagram-capital">
          CAPITAL PROVIDERS
          <br />
          <strong>Risk + fee participation</strong>
        </div>
        <p>
          Fixed terms. Transparent reserves.
          <br />
          No promised return.
        </p>
      </div>
    </section>
  );
}

export function Markets({
  markets,
  api,
  href,
}: {
  markets: Market[];
  api?: Api;
  href: Ctx["href"];
}) {
  const [states, setStates] = useState<Record<string, Data>>({});
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const refreshCards = () =>
      Promise.all(
        markets.map(async (m) => {
          try {
            const d = await api.readMarket(m);
            if (alive) setStates((s) => ({ ...s, [m.pool]: d }));
          } catch {
            if (alive)
              setStates((s) => {
                const next = { ...s };
                delete next[m.pool];
                return next;
              });
          }
        }),
      );
    void refreshCards();
    const timer = setInterval(refreshCards, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [api, markets]);
  return (
    <>
      <p className="intro">
        Real contract addresses, real test inventory. Each receipt is redeemable
        against its own funded vault. Select the asset and backing pair that
        matches the position you want to test.
      </p>
      <div className="market-grid">
        {markets.map((m, i) => (
          <article className="market-card" key={m.pool}>
            <span className="market-number">
              {String(i + 1).padStart(2, "0")} / {m.backingSymbol} BACKED
            </span>
            <h2>{m.name}</h2>
            <p>{m.description}</p>
            <Stats
              items={[
                ["Receipt", m.symbol],
                [
                  "NAV",
                  states[m.pool]
                    ? `${f(states[m.pool].nav)} ${m.backingSymbol}`
                    : "Reading…",
                ],
                [
                  "Free capacity",
                  states[m.pool]
                    ? f(
                        states[m.pool].state.liquidity -
                          states[m.pool].state.reserved,
                      )
                    : "Unavailable",
                ],
              ]}
            />
            <div className="actions">
              <a className="button" href={href("/protect", m)}>
                Protect ↗
              </a>
              <a className="button secondary" href={href("/provide", m)}>
                Provide
              </a>
            </div>
            <a href={href(`/markets/${m.pool}`, m)}>Terms & pool details →</a>
          </article>
        ))}
      </div>
    </>
  );
}

export function PoolDetail(c: Ctx) {
  return (
    <>
      <Stats
        items={[
          [
            "Backing assets",
            `${f(c.data?.state.liquidity)} ${c.market?.backingSymbol || ""}`,
          ],
          ["Active holders", String(c.data?.state.active ?? "—")],
          ["Vault NAV", f(c.data?.nav)],
          ["Maturity credits", f(c.data?.state.credit_total)],
        ]}
      />
      <div className="two-column">
        <Context {...c} />
        <section className="panel">
          <h2>Choose your side.</h2>
          <p>
            Holders lock receipts for a defined backing claim. Providers supply
            cash and absorb the economics of surrendered receipts. New provider
            deposits and cash withdrawals pause while any holder liability is
            open.
          </p>
          <p>
            At maturity anyone can settle a holder position into a separate
            backing credit. Providers can then withdraw after their notice
            period; the holder claims their credit when ready.
          </p>
          <div className="actions">
            <a className="button" href={c.href("/protect")}>
              Protect
            </a>
            <a className="button secondary" href={c.href("/provide")}>
              Provide
            </a>
            <a href={c.href("/trade")}>Buy / sell</a>
          </div>
          <dl>
            <dt>Pool contract</dt>
            <dd>
              <ContractLink id={c.market?.pool} />
            </dd>
            <dt>Vault contract</dt>
            <dd>
              <ContractLink id={c.market?.vault} />
            </dd>
            <dt>Backing token</dt>
            <dd>
              <ContractLink id={c.market?.backing} />
            </dd>
          </dl>
        </section>
      </div>
      <AdminClaims {...c} />
    </>
  );
}

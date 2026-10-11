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
          Protect funded vault receipts, or provide the backing for their exit.
          Choose a market and your role.
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
        Choose a receipt and its backing. Each vault holds real, valueless test assets.
      </p>
      <div className="market-grid">
        {markets.map((m, i) => (
          <article className="market-card" key={m.pool}>
            <span className="market-number">
              {String(i + 1).padStart(2, "0")} / {m.backingSymbol} BACKED
            </span>
            <h2>{m.name}</h2>
            <p>{m.description}</p>
            {states[m.pool] && (
              <p className="fine">
                {now() >= Number(states[m.pool].state.end)
                  ? "Matured — settlement and claims only"
                  : now() + 60 >= Number(states[m.pool].state.end)
                    ? "Admissions closed — maturity approaching"
                    : `Term ends ${date(states[m.pool].state.end)}`}{" "}
                · Read {new Date(states[m.pool].readAt).toLocaleTimeString()}
              </p>
            )}
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
                  "Free backing",
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
            Holders lock receipts for a fixed backing claim. Providers fund
            that claim and risk receiving lower-value receipts. Provider deposits
            and withdrawals pause while holders are protected.
          </p>
          <p>
            At maturity, receipts become backing credit and remaining upside is
            forfeited. Holders claim separately; providers withdraw after notice
            once all positions are settled.
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

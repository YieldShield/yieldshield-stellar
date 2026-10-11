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
import { SettlementQueue } from "./PortfolioPages";
export function Protect(c: Ctx & { initial: string }) {
  const [n, set] = useState(c.initial);
  const m = c.market;
  return (
    <div className="two-column">
      <section className="panel">
        <p className="eyebrow">HOLDER / FIXED BACKING EXIT</p>
        <h2>Protect your vault receipts.</h2>
        <Amount
          label="Receipt amount"
          value={n}
          suffix={m?.symbol || "receipts"}
          onChange={(v) => {
            set(v);
            c.clear();
          }}
        />
        <p>
          Available: {f(c.wallet?.shares)} {m?.symbol}.{" "}
          <a href={c.href(`/trade?amount=${encodeURIComponent(n)}`)}>
            Buy receipts →
          </a>{" "}
          or{" "}
          <a
            href={c.href(
              `/assets?returnTo=${encodeURIComponent(c.href(`/protect?amount=${n}`))}`,
            )}
          >
            deposit into the vault
          </a>
          .
        </p>
        <button
          disabled={!m || c.busy}
          onClick={() =>
            c.review(async (a) => {
              const shares = parseAmount(n),
                claim = (await a.view(m!.vault, "preview_redeem", [
                  a.amountSc(shares),
                ])) as bigint;
              const d = await a.readMarket(m!);
              const reserve =
                (claim * BigInt(d.state.terms.collateral_bps) + 9999n) / 10000n;
              if (now() + 60 >= Number(d.state.end))
                throw new Error(
                  "This pool has closed admissions. Create or select a newer pool.",
                );
              if (reserve > d.state.liquidity - d.state.reserved)
                throw new Error(
                  "This position exceeds currently free backing capacity.",
                );
              if (!claim)
                throw new Error(
                  "This receipt has no positive redemption value.",
                );
              const end = now() + 120;
              return {
                title: "Open protected position",
                lines: [
                  ["Lock receipts", `${f(shares)} ${m!.symbol}`],
                  ["Expected fixed claim", `${f(claim)} ${m!.backingSymbol}`],
                  ["Minimum claim", f(minimumOutput(claim))],
                  ["Reserve required", f(reserve)],
                  ["Pool maturity", date(d.state.end)],
                  [
                    "At maturity",
                    "Remaining receipts are surrendered for fixed backing; remaining upside is forfeited.",
                  ],
                  ["Earliest voluntary exit", "60 seconds after opening"],
                ],
                contract: m!.pool,
                method: "protect",
                args: [
                  a.addressSc(c.address),
                  a.amountSc(shares),
                  a.amountSc(minimumOutput(claim)),
                  a.idSc(BigInt(end)),
                ],
                deadline: end,
              };
            })
          }
        >
          Review protection →
        </button>
        <p className="fine">
          Before maturity, choose a partial or full receipt exit or fixed
          backing exit. At maturity, the remaining position settles into backing
          credit. No payout is available beyond the contract’s funded
          obligations.
        </p>
      </section>
      <Context {...c} />
    </div>
  );
}

export function Provide(c: Ctx) {
  const [n, set] = useState(
    new URL(location.href).searchParams.get("amount") || "500",
  );
  const [mode, setMode] = useState("deposit");
  const p = c.wallet?.provider;
  const m = c.market;
  const submit = () =>
    c.review(async (a) => {
      const amount = parseAmount(n),
        end = now() + 120;
      const base = { contract: m!.pool, deadline: end };
      if (mode === "notice")
        return {
          ...base,
          title: "Request provider withdrawal",
          lines: [
            ["LP shares", f(amount)],
            [
              "Notice duration",
              `${Number(c.data!.state.terms.notice_delay)} seconds`,
            ],
            ["Liquidity condition", "All holder liabilities must be settled"],
          ],
          method: "notice",
          args: [a.addressSc(c.address), a.amountSc(amount)],
        };
      const deposit = mode === "deposit";
      const fresh = await a.readMarket(m!);
      if (fresh.state.active)
        throw new Error(
          "Provider cash actions are locked while holder liabilities remain open.",
        );
      if (deposit && now() + 60 >= Number(fresh.state.end))
        throw new Error(
          "This pool has closed deposits. Choose or create a newer pool.",
        );
      if (!deposit) {
        const current = (await a.view(m!.pool, "provider", [
          a.addressSc(c.address),
        ])) as import("./v3").Provider;
        if (amount > current.notice_shares || now() < Number(current.notice_at))
          throw new Error(
            "Request a sufficient withdrawal notice and wait for it to mature.",
          );
      }
      const output = (await a.view(
        m!.pool,
        deposit ? "preview_provide" : "preview_withdraw",
        [a.amountSc(amount)],
      )) as bigint;
      if (deposit && output <= 0n)
        throw new Error("This deposit is too small to mint a provider share.");
      return {
        ...base,
        title: deposit
          ? "Provide backing capital"
          : "Withdraw provider backing",
        lines: [
          [
            deposit ? "Deposit" : "Burn LP shares",
            `${f(amount)} ${deposit ? m!.backingSymbol : "LP"}`,
          ],
          [deposit ? "Expected LP shares" : "Expected backing", f(output)],
          ["Minimum received", f(minimumOutput(output))],
          [
            "Provider risk",
            "Capital can be exchanged for lower-value receipts",
          ],
        ],
        method: deposit ? "provide" : "withdraw",
        args: [
          a.addressSc(c.address),
          a.amountSc(amount),
          a.amountSc(minimumOutput(output)),
          a.idSc(BigInt(end)),
        ],
      };
    });
  const action = (method: string, label: string, amount: bigint) =>
    c.review((a) => ({
      title: label,
      lines: [["Amount", `${f(amount)} ${m!.symbol}`]],
      contract: m!.pool,
      method,
      args: [a.addressSc(c.address), a.addressSc(c.address)],
      deadline: now() + 120,
    }));
  return (
    <>
      <Stats
        items={[
          ["Your LP shares", f(p?.shares)],
          ["Gain-fee receipts", f(p?.rewards)],
          ["Acquired receipts", f(p?.inventory)],
          ["Pending notice", f(p?.notice_shares)],
        ]}
      />
      <div className="two-column">
        <section className="panel">
          <p className="eyebrow">CAPITAL PROVIDER / PUBLIC PARTICIPATION</p>
          <h2>Back a defined claim.</h2>
          <p>
            New deposits and cash withdrawals freeze whenever any holder
            liability is open. Fee and acquired-inventory claims stay separate;
            cash withdrawal also requires a matured notice.
          </p>
          <a
            href={c.href(
              `/assets?returnTo=${encodeURIComponent(c.href(`/provide?amount=${n}`))}`,
              c.api?.deployment.markets.find((x) => x.vault === m?.backing) ||
                m,
            )}
          >
            Fund or acquire backing →
          </a>
          <div className="tabs">
            {[
              ["deposit", "Deposit"],
              ["notice", "Request exit"],
              ["withdraw", "Withdraw"],
            ].map(([v, t]) => (
              <button
                key={v}
                className={mode === v ? "selected" : "quiet"}
                aria-pressed={mode === v}
                onClick={() => {
                  setMode(v);
                  c.clear();
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <Amount
            label={
              mode === "deposit" ? "Backing to provide" : "Provider shares"
            }
            value={n}
            suffix={mode === "deposit" ? m?.backingSymbol || "backing" : "LP"}
            onChange={(v) => {
              set(v);
              c.clear();
            }}
          />
          <p>
            Deposits and cash withdrawals are{" "}
            {c.data?.state.active
              ? "currently locked because holder liabilities are open."
              : "available when the pool term permits."}{" "}
            LP shares price cash only; previously earned or acquired receipts
            stay with the providers who funded them.
          </p>
          <button
            disabled={
              !m ||
              c.busy ||
              (mode !== "notice" && !!c.data?.state.active) ||
              (mode === "deposit" &&
                !!c.data &&
                now() + 60 >= Number(c.data.state.end))
            }
            onClick={submit}
          >
            Review {mode === "notice" ? "withdrawal notice" : mode} →
          </button>
          {p && p.notice_shares > 0n && (
            <>
              <p>
                Notice matures {date(p.notice_at)}. Active positions must also
                close or settle before cash can leave.
              </p>
              <button
                className="quiet"
                disabled={c.busy}
                onClick={() =>
                  c.review((a) => ({
                    title: "Cancel withdrawal notice",
                    lines: [["Pending shares", f(p.notice_shares)]],
                    contract: m!.pool,
                    method: "cancel_notice",
                    args: [a.addressSc(c.address)],
                    deadline: now() + 120,
                  }))
                }
              >
                Cancel notice
              </button>
            </>
          )}
        </section>
        <Context {...c} />
      </div>
      <div className="two-column">
        <section className="panel">
          <h2>Gain-fee receipts</h2>
          <p>
            Fees from positive-gain receipt exits. These are distinct from
            principal recovered through backing exits.
          </p>
          <strong className="large-number">
            {f(p?.rewards)} {m?.symbol}
          </strong>
          <button
            disabled={!p?.rewards || c.busy}
            onClick={() =>
              action("claim_rewards", "Claim gain-fee receipts", p!.rewards)
            }
          >
            Review fee claim
          </button>
        </section>
        <section className="panel">
          <h2>Acquired receipt inventory</h2>
          <p>
            Your share of receipts surrendered by protected holders. Their value
            may be lower than the backing paid. Receipt inventory is not yield.
          </p>
          <strong className="large-number">
            {f(p?.inventory)} {m?.symbol}
          </strong>
          <button
            disabled={!p?.inventory || c.busy}
            onClick={() =>
              action("claim_inventory", "Claim acquired receipts", p!.inventory)
            }
          >
            Review inventory claim
          </button>
        </section>
      </div>
      <SettlementQueue {...c} />
    </>
  );
}

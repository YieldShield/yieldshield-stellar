import React, { useEffect, useState } from "react";
import type { Data, Market, Wallet, State } from "./v3";
import {
  format,
  parseAmount,
  minimumOutput,
  maximumPayment,
  UNIT,
} from "./amounts";
import {
  type Api,
  type Quote,
  type Ctx,
  explorer,
  friendbot,
  small,
  date,
  now,
  f,
  requireBalance,
  Amount,
  Stats,
  Context,
  ContractLink,
} from "./shared";
export function Trade(c: Ctx & { initial: string }) {
  const [n, set] = useState(c.initial);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const m = c.market;
  return (
    <div className="two-column">
      <section className="panel">
        <p className="eyebrow">EXCHANGE</p>
        <h2>{side === "buy" ? "Buy a receipt." : "Sell a receipt."}</h2>
        <a
          href={c.href(
            `/assets?returnTo=${encodeURIComponent(c.href(`/trade?amount=${n}`))}`,
            c.api?.deployment.markets.find((x) => x.vault === m?.backing) || m,
          )}
        >
          Fund or acquire backing →
        </a>
        <div className="tabs">
          {(["buy", "sell"] as const).map((s) => (
            <button
              className={side === s ? "selected" : "quiet"}
              aria-pressed={side === s}
              key={s}
              onClick={() => {
                setSide(s);
                c.clear();
              }}
            >
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        <Amount
          label={side === "buy" ? "Receipts to receive" : "Receipts to sell"}
          value={n}
          suffix={m?.symbol || "receipts"}
          onChange={(v) => {
            set(v);
            c.clear();
          }}
        />
        <Stats
          items={[
            [
              "Your backing",
              `${f(c.wallet?.backing)} ${m?.backingSymbol || ""}`,
            ],
            ["Your receipts", f(c.wallet?.shares)],
            ["Exchange receipts", f(c.data?.inventory?.receipts)],
            ["Exchange backing", f(c.data?.inventory?.backing)],
          ]}
        />
        <button
          disabled={!m?.exchange || c.busy}
          onClick={() =>
            c.review(async (a) => {
              const shares = parseAmount(n);
              if (side === "sell")
                requireBalance(c.wallet?.shares, shares, m!.symbol);
              const [q, inventory] = await Promise.all([
                a.view(m!.exchange, `preview_${side}`, [a.amountSc(shares)]),
                a.view(m!.exchange, "inventory"),
              ]);
              const amount = q as bigint;
              if (side === "buy" && inventory.receipts < shares)
                throw new Error(
                  "Exchange receipt inventory is insufficient. Deposit directly into the vault instead.",
                );
              if (side === "sell" && inventory.backing < amount)
                throw new Error(
                  "Exchange backing inventory is insufficient. Redeem directly from the vault instead.",
                );
              const balance = c.wallet?.backing;
              if (side === "buy")
                requireBalance(balance, amount, m!.backingSymbol);
              // The signed maximum never exceeds what the wallet holds.
              const limit =
                side === "buy"
                  ? balance !== undefined && balance < maximumPayment(amount)
                    ? balance
                    : maximumPayment(amount)
                  : minimumOutput(amount);
              const end = now() + 120;
              return {
                title:
                  side === "buy"
                    ? "Buy funded receipts"
                    : "Sell funded receipts",
                lines: [
                  ["Receipt amount", `${f(shares)} ${m!.symbol}`],
                  [
                    "Expected " + (side === "buy" ? "payment" : "proceeds"),
                    `${f(amount)} ${m!.backingSymbol}`,
                  ],
                  [
                    side === "buy" ? "Maximum payment" : "Minimum proceeds",
                    f(limit),
                  ],
                  ["Exchange fee", "0.3% of redemption value"],
                  ["Price tolerance", "0.5%"],
                ],
                contract: m!.exchange,
                method: side,
                args: [
                  a.addressSc(c.address),
                  a.amountSc(shares),
                  a.amountSc(limit),
                  a.idSc(BigInt(end)),
                ],
                deadline: end,
                follow:
                  side === "buy"
                    ? c.href(`/protect?amount=${encodeURIComponent(n)}`)
                    : undefined,
              };
            })
          }
        >
          Review {side} →
        </button>
        <p className="fine">
          Operator-managed inventory. Prices track vault redemption with a
          0.3% buy/sell fee. Your signed limit caps quote changes.
        </p>
      </section>
      <Context {...c} />
    </div>
  );
}

export function Assets(c: Ctx) {
  const rawReturn = new URL(location.href).searchParams.get("returnTo");
  const returnUrl =
    rawReturn?.startsWith("/") &&
    !rawReturn.startsWith("//") &&
    ["/trade", "/protect", "/provide"].includes(rawReturn.split("?")[0])
      ? rawReturn
      : c.href("/protect");
  const returnTarget = new URL(returnUrl, location.href);
  const returnLabel = { "/provide": "Provide", "/trade": "Trade", "/protect": "Protect" }[returnTarget.pathname];
  const returnMarket = c.api?.deployment.markets.find(
    (market) => market.pool === returnTarget.searchParams.get("pool"),
  );
  const [mode, setMode] = useState("deposit");
  const [n, set] = useState("100");
  return (
    <>
      <div className="two-column">
        <section className="panel">
          <a href={returnUrl}>← Return to {returnLabel}</a>
          {returnMarket && returnMarket.backing === c.market?.vault && (
            <p>Acquire {c.market.symbol} backing for {returnMarket.name}, then return to {returnLabel}.</p>
          )}
          <p className="eyebrow">01 / FUND YOUR TEST WALLET</p>
          <h2>Get ready on Stellar.</h2>
          <p>
            Use Freighter on Stellar Testnet. Friendbot provides test XLM for
            account reserves and transaction fees.
          </p>
          {c.address ? (
            <a
              className="button secondary"
              href={friendbot(c.address)}
              target="_blank"
              rel="noreferrer"
            >
              Fund test XLM ↗
            </a>
          ) : (
            <p>Connect your wallet first to generate the Friendbot link.</p>
          )}
          <p>
            Next, accept this project’s TESTUSD issuer and claim 1,000 valueless
            test units.
          </p>
          <dl>
            <dt>Test XLM account</dt>
            <dd>
              {!c.wallet
                ? "—"
                : c.wallet.funded
                  ? "Funded"
                  : "Not funded yet — use Friendbot first"}
            </dd>
            <dt>TESTUSD balance</dt>
            <dd>{f(c.wallet?.testusd)}</dd>
            <dt>Trustline</dt>
            <dd>{!c.wallet ? "—" : c.wallet.trusted ? "Ready" : "Not detected"}</dd>
          </dl>
          <div className="actions">
            <button
              disabled={c.busy || !!c.wallet?.trusted || c.wallet?.funded === false}
              onClick={() =>
                c.review((a) => ({
                  title: "Create TESTUSD trustline",
                  lines: [
                    ["Issuer", a.config.issuer],
                    ["Asset", "Project test asset; not Circle USDC"],
                  ],
                  contract: "",
                  method: "",
                  args: [],
                  deadline: now() + 120,
                  special: "trust",
                }))
              }
            >
              Review trustline
            </button>
            <button
              className="secondary"
              disabled={c.busy || !c.wallet?.trusted || !!c.wallet?.claimed}
              onClick={() =>
                c.review((a) => ({
                  title: "Claim test tokens",
                  lines: [
                    ["Receive", "1,000 TESTUSD"],
                    ["Limit", "One faucet claim per wallet record"],
                  ],
                  contract: a.config.faucet,
                  method: "claim",
                  args: [a.addressSc(c.address)],
                  deadline: now() + 120,
                }))
              }
            >
              {c.wallet?.claimed ? "Faucet claimed" : "Review faucet claim"}
            </button>
          </div>
        </section>
        <section className="panel">
          <p className="eyebrow">02 / CONVERT FUNDED VAULT ASSETS</p>
          <h2>Deposit or redeem.</h2>
          <div className="tabs">
            {["deposit", "redeem"].map((v) => (
              <button
                key={v}
                className={mode === v ? "selected" : "quiet"}
                aria-pressed={mode === v}
                onClick={() => {
                  setMode(v);
                  c.clear();
                }}
              >
                {v === "deposit" ? "Deposit" : "Redeem"}
              </button>
            ))}
          </div>
          <Amount
            label={
              mode === "deposit" ? "Backing to deposit" : "Receipts to redeem"
            }
            value={n}
            suffix={
              mode === "deposit"
                ? c.market?.backingSymbol || ""
                : c.market?.symbol || ""
            }
            onChange={(v) => {
              set(v);
              c.clear();
            }}
          />
          <p>
            Available:{" "}
            {f(mode === "deposit" ? c.wallet?.backing : c.wallet?.shares)}.
            These are direct vault conversions, separate from exchange buy/sell.
          </p>
          <button
            disabled={c.busy || !c.market}
            onClick={() =>
              c.review(async (a) => {
                const amount = parseAmount(n);
                if (mode === "deposit")
                  requireBalance(c.wallet?.backing, amount, c.market!.backingSymbol);
                else requireBalance(c.wallet?.shares, amount, c.market!.symbol);
                const output = (await a.view(c.market!.vault, `preview_${mode}`, [
                  a.amountSc(amount),
                ])) as bigint;
                const end = now() + 120;
                return {
                  title:
                    mode === "deposit"
                      ? "Deposit into native vault"
                      : "Redeem funded receipts",
                  lines: [
                    ["Input", f(amount)],
                    [
                      "Expected output",
                      `${f(output)} ${mode === "deposit" ? c.market!.symbol : c.market!.backingSymbol}`,
                    ],
                    ["Minimum output", f(minimumOutput(output))],
                  ],
                  contract: c.market!.vault,
                  method: mode,
                  args: [
                    a.addressSc(c.address),
                    a.amountSc(amount),
                    a.amountSc(minimumOutput(output)),
                    a.idSc(BigInt(end)),
                  ],
                  deadline: end,
                };
              })
            }
          >
            Review {mode} →
          </button>
          <p className="fine">
            Nested receipts require inner vault receipts as their backing.
            Acquire those first in the corresponding direct TESTUSD market. All
            demo vaults retain an admin-only loss simulation function; they are
            not real investment strategies.
          </p>
        </section>
      </div>
    </>
  );
}

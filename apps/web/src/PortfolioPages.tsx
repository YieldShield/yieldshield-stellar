import React, { useEffect, useRef, useState } from "react";
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
export function Portfolio(c: Ctx & { markets: Market[] }) {
  return <PortfolioAccount key={c.address} {...c} />;
}
function PortfolioAccount(c: Ctx & { markets: Market[] }) {
  const [rows, setRows] = useState<{ market: Market; wallet: Wallet }[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");
  useEffect(() => {
    if (!c.api || !c.address) return;
    let alive = true;
    setLoading(true);
    Promise.all(
      c.markets.map(async (market) => {
        try {
          return {
            market,
            wallet: await c.api!.readAccount(market, c.address),
          };
        } catch {
          return null;
        }
      }),
    ).then((found) => {
      if (!alive) return;
      setRows((previous) =>
        found.flatMap((row, index) =>
          row
            ? [row]
            : previous.filter(
                (old) => old.market.pool === c.markets[index].pool,
              ),
        ),
      );
      setWarning(
        found.some((row) => !row)
          ? "Some pools could not be refreshed. Previous values may be out of date; unavailable pools are not assumed empty."
          : "",
      );
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [c.api, c.address, c.markets, c.wallet]);
  return (
    <>
      {!c.address ? (
        <p className="empty">
          Connect Freighter to discover your holder positions and provider
          shares directly from the onchain registry.
        </p>
      ) : (
        <>
          {loading && (
            <p role="status">
              {rows.length
                ? "Refreshing your portfolio…"
                : "Reading all registered pools…"}
            </p>
          )}
          {warning && <p role="status">{warning}</p>}
          <div className="portfolio-list" aria-busy={loading}>
            {rows.flatMap(({ market, wallet }) =>
              wallet.positions.map((p) => (
                <article
                  className="position-row"
                  key={`${market.pool}-${p.id}`}
                >
                  <span className="badge">
                    {p.closed ? "CLOSED" : "HOLDER"}
                  </span>
                  <div>
                    <h2>Position #{String(p.id)}</h2>
                    <p>
                      {market.name} · {market.symbol}
                    </p>
                  </div>
                  <div>
                    <span>Receipts</span>
                    <strong>{f(p.shares)}</strong>
                  </div>
                  <div>
                    <span>Backing claim</span>
                    <strong>
                      {f(p.claim)} {market.backingSymbol}
                    </strong>
                  </div>
                  <a
                    className="button secondary"
                    href={c.href(`/positions/${p.id}`, market)}
                  >
                    View position →
                  </a>
                </article>
              )),
            )}
            {rows
              .filter(
                (r) =>
                  r.wallet.provider.shares > 0n ||
                  r.wallet.provider.inventory > 0n ||
                  r.wallet.provider.rewards > 0n,
              )
              .map(({ market, wallet }) => (
                <article className="position-row" key={market.pool}>
                  <span className="badge">PROVIDER</span>
                  <div>
                    <h2>{market.name}</h2>
                    <p>LP shares {f(wallet.provider.shares)}</p>
                  </div>
                  <div>
                    <span>Gain fees</span>
                    <strong>{f(wallet.provider.rewards)}</strong>
                  </div>
                  <div>
                    <span>Acquired inventory</span>
                    <strong>{f(wallet.provider.inventory)}</strong>
                  </div>
                  <a
                    className="button secondary"
                    href={c.href("/provide", market)}
                  >
                    Manage capital →
                  </a>
                </article>
              ))}
            {rows
              .filter((r) => r.wallet.credit > 0n)
              .map(({ market, wallet }) => (
                <article className="position-row" key={`credit-${market.pool}`}>
                  <span className="badge">CLAIMABLE</span>
                  <div>
                    <h2>
                      {f(wallet.credit)} {market.backingSymbol}
                    </h2>
                    <p>Segregated maturity backing credit.</p>
                  </div>
                  <a href={c.href("/positions/credit", market)}>
                    Claim backing →
                  </a>
                </article>
              ))}
          </div>
          {!loading &&
            !warning &&
            rows.every(
              (r) =>
                !r.wallet.positions.length &&
                !r.wallet.provider.shares &&
                !r.wallet.provider.rewards &&
                !r.wallet.provider.inventory &&
                !r.wallet.credit,
            ) && (
              <p className="empty">
                No positions found in the readable current pools.{" "}
                <a href={c.href("/protect")}>Open protection →</a>
              </p>
            )}
        </>
      )}
      <p className="fine">
        Positions are discovered from each registered contract, including
        user-created pools. Ownership changes are checked on chain. Previous
        single-sponsor positions remain accessible in the{" "}
        <a href="/legacy">legacy market</a>.
      </p>
    </>
  );
}

export function PositionPage(c: Ctx & { id: string }) {
  return (
    <PositionDetails
      key={`${c.market?.pool || ""}:${c.id}:${c.address}`}
      {...c}
    />
  );
}
function PositionDetails(c: Ctx & { id: string }) {
  const creditOnly = c.id === "credit";
  const validId =
    /^[1-9][0-9]{0,19}$/.test(c.id) &&
    BigInt(c.id) <= 18_446_744_073_709_551_615n;
  const [position, setPosition] =
    useState<Awaited<ReturnType<Api["readPosition"]>>>();
  const [amount, setAmount] = useState("");
  const amountDirty = useRef(false);
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(!creditOnly && validId);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!c.api || !c.market || !validId || creditOnly) return;
    let alive = true;
    setLoading(true);
    c.api
      .view(c.market.pool, "position", [c.api.idSc(BigInt(c.id))])
      .then((p) => {
        if (!alive) return;
        setPosition({ ...p, id: BigInt(c.id) });
        if (!amountDirty.current)
          setAmount(format(p.shares, 7).replaceAll(",", ""));
        setLoadError("");
      })
      .catch(() => {
        if (alive)
          setLoadError(
            "Position could not be refreshed. Displayed values may be out of date. Check this pool and position number before proceeding.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [c.api, c.market?.pool, c.id, c.wallet, validId, creditOnly]);
  const p = position;
  const actionUnavailable = c.busy || !!loadError;
  const expired = !!c.data && now() >= Number(c.data.state.end);
  const exit = (backing: boolean) =>
    c.review(async (a) => {
      const n = parseAmount(amount);
      if (!p || n > p.shares) throw new Error("Amount exceeds this position.");
      const output = (await a.view(c.market!.pool, "preview_exit", [
        a.idSc(p.id),
        a.amountSc(n),
        a.boolSc(backing),
      ])) as bigint;
      const end = now() + 120;
      return {
        title: backing ? "Exit to fixed backing" : "Exit to vault receipts",
        lines: [
          ["Position", `#${p.id}`],
          ["Position shares to close", f(n)],
          [
            "Expected payout",
            `${f(output)} ${backing ? c.market!.backingSymbol : c.market!.symbol}`,
          ],
          ["Minimum payout", f(minimumOutput(output))],
        ],
        contract: c.market!.pool,
        method: "exit",
        args: [
          a.idSc(p.id),
          a.amountSc(n),
          a.boolSc(backing),
          a.amountSc(minimumOutput(output)),
          a.idSc(BigInt(end)),
        ],
        deadline: end,
      };
    });
  return (
    <>
      <a href={c.href("/positions")}>← All positions</a>
      {loading && (
        <p role="status">
          {p ? "Refreshing position details…" : "Reading position details…"}
        </p>
      )}
      {loadError && <p role="alert">{loadError}</p>}
      {p && (
        <div className="two-column">
          <section className="panel">
            <p className="eyebrow">
              POSITION #{c.id} ·{" "}
              {p.closed ? "CLOSED" : expired ? "MATURED" : "OPEN"}
            </p>
            <h2>Your exit choices.</h2>
            <dl>
              <dt>Current owner</dt>
              <dd>{small(p.owner)}</dd>
              <dt>Remaining receipts</dt>
              <dd>
                {f(p.shares)} {c.market?.symbol}
              </dd>
              <dt>Remaining fixed claim</dt>
              <dd>
                {f(p.claim)} {c.market?.backingSymbol}
              </dd>
              <dt>Reserved capacity</dt>
              <dd>{f(p.reserved)}</dd>
              <dt>Voluntary exits unlock</dt>
              <dd>{date(p.opened + 60n)}</dd>
            </dl>
            {!p.closed &&
              (!expired ? (
                <>
                  <Amount
                    label="Receipts to close (partial or full)"
                    value={amount}
                    suffix={c.market?.symbol || ""}
                    onChange={(v) => {
                      amountDirty.current = true;
                      setAmount(v);
                      c.clear();
                    }}
                  />
                  <div className="actions">
                    <button
                      disabled={actionUnavailable || p.owner !== c.address}
                      onClick={() => exit(false)}
                    >
                      Review receipt exit
                    </button>
                    <button
                      className="secondary"
                      disabled={actionUnavailable || p.owner !== c.address}
                      onClick={() => exit(true)}
                    >
                      Review backing exit
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    Anyone can settle this matured position. The owner receives
                    a claimable backing credit, so a missing trustline cannot
                    block provider exits.
                  </p>
                  <button
                    disabled={actionUnavailable}
                    onClick={() =>
                      c.review((a) => ({
                        title: "Settle matured position",
                        lines: [
                          ["Credit recipient", small(p.owner)],
                          [
                            "Backing credit",
                            `${f(p.claim)} ${c.market!.backingSymbol}`,
                          ],
                        ],
                        contract: c.market!.pool,
                        method: "settle",
                        args: [a.idSc(p.id)],
                        deadline: now() + 120,
                      }))
                    }
                  >
                    Review settlement
                  </button>
                </>
              ))}
            {!p.closed && p.owner === c.address && (
              <div className="subsection">
                <h3>Transfer position ownership</h3>
                <label>
                  New Stellar address
                  <input
                    value={recipient}
                    onChange={(e) => {
                      setRecipient(e.target.value);
                      c.clear();
                    }}
                    placeholder="G… or C…"
                  />
                </label>
                <button
                  className="quiet"
                  disabled={actionUnavailable || !recipient}
                  onClick={() =>
                    c.review((a) => ({
                      title: "Transfer protected position",
                      lines: [
                        ["Position", `#${p.id}`],
                        ["New owner", recipient],
                        [
                          "Consequence",
                          "The new owner receives all remaining exit rights",
                        ],
                      ],
                      contract: c.market!.pool,
                      method: "transfer_position",
                      args: [a.idSc(p.id), a.addressSc(recipient)],
                      deadline: now() + 120,
                    }))
                  }
                >
                  Review ownership transfer
                </button>
              </div>
            )}
          </section>
          <Context {...c} />
        </div>
      )}
      <section className="panel">
        <h2>Maturity backing credit</h2>
        <p>
          {f(c.wallet?.credit)} {c.market?.backingSymbol} held separately for
          your wallet. A backing trustline must be eligible when claiming;
          choose an alternate eligible address if needed.
        </p>
        <label>
          Credit destination (defaults to connected wallet)
          <input
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              c.clear();
            }}
            placeholder={c.address || "G…"}
          />
        </label>
        <button
          disabled={!c.wallet?.credit || c.busy}
          onClick={() =>
            c.review((a) => ({
              title: "Claim maturity backing",
              lines: [
                ["Credit", `${f(c.wallet!.credit)} ${c.market!.backingSymbol}`],
                ["Destination", recipient || c.address],
              ],
              contract: c.market!.pool,
              method: "claim_backing",
              args: [
                a.addressSc(c.address),
                a.addressSc(recipient || c.address),
              ],
              deadline: now() + 120,
            }))
          }
        >
          Review backing claim
        </button>
      </section>
    </>
  );
}

export function SettlementQueue(c: Ctx) {
  const [page, setPage] = useState(0);
  const [positions, setPositions] = useState<
    { id: bigint; owner: string; claim: bigint; closed: boolean }[]
  >([]);
  const [error, setError] = useState("");
  const end = c.data?.state.end;
  const matured = !!end && now() >= Number(end);
  useEffect(() => {
    setPositions([]);
    setError("");
    if (!c.api || !c.market || !end || now() < Number(end)) return;
    let alive = true;
    const first = BigInt(page * 20 + 1);
    const ids = Array.from({ length: 20 }, (_, i) => first + BigInt(i)).filter(
      (id) => id < c.data!.state.next_id,
    );
    Promise.all(
      ids.map(async (id) => ({
        ...(await c.api!.view(c.market!.pool, "position", [c.api!.idSc(id)])),
        id,
      })),
    )
      .then((rows) => {
        if (alive) setPositions(rows);
      })
      .catch(() => {
        if (alive)
          setError(
            "The settlement page could not be read. Retry after the network recovers.",
          );
      });
    return () => {
      alive = false;
    };
  }, [c.api, c.market?.pool, c.data?.state.active, page, end, matured]);
  if (!end || now() < Number(end))
    return (
      <section className="panel">
        <h2>Settlement queue</h2>
        <p>
          This pool matures{" "}
          {end ? date(end) : "when its contract terms are available"}. At
          maturity, every remaining holder position can be settled here by any
          connected wallet.
        </p>
      </section>
    );
  return (
    <section className="panel">
      <h2>Settle expired liabilities</h2>
      <p>
        Settlement converts a holder’s position into a segregated backing
        credit, without requiring a transfer to their trustline. This releases
        the provider withdrawal lock once all positions are settled.
      </p>
      {error && <p role="alert">{error}</p>}
      {positions.map((p) => (
        <div className="position-row" key={String(p.id)}>
          <div>
            <h3>Position #{String(p.id)}</h3>
            <p>
              {small(p.owner)} · {f(p.claim)} {c.market?.backingSymbol}
            </p>
          </div>
          {p.closed ? (
            <span>Closed</span>
          ) : (
            <button
              disabled={c.busy}
              onClick={() =>
                c.review((a) => ({
                  title: "Settle expired holder liability",
                  lines: [
                    ["Position", String(p.id)],
                    [
                      "Backing credit",
                      `${f(p.claim)} ${c.market!.backingSymbol}`,
                    ],
                  ],
                  contract: c.market!.pool,
                  method: "settle",
                  args: [a.idSc(p.id)],
                  deadline: now() + 120,
                }))
              }
            >
              Review settlement
            </button>
          )}
        </div>
      ))}
      <div className="actions">
        <button
          className="quiet"
          disabled={!page}
          onClick={() => setPage((v) => v - 1)}
        >
          Previous20
        </button>
        <span>Page{page + 1}</span>
        <button
          className="quiet"
          disabled={BigInt((page + 1) * 20 + 1) >= c.data!.state.next_id}
          onClick={() => setPage((v) => v + 1)}
        >
          Next20
        </button>
      </div>
    </section>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import type { PoolState, Position } from "./stellar";
import manifest from "../../../config/testnet.json";
const explorer = "https://stellar.expert/explorer/testnet";
const small = (s: string) => `${s.slice(0, 6)}…${s.slice(-5)}`;
type Api = typeof import("./stellar");
function App() {
  const [api, setApi] = useState<Api>();
  const [address, setAddress] = useState("");
  const activeAddress = useRef("");
  const refreshSequence = useRef(0);
  const [data, setData] = useState<{
    state: PoolState;
    nav: bigint;
    assets: bigint;
    supply: bigint;
    readAt: number;
  }>();
  const [wallet, setWallet] = useState<{
    shares: bigint;
    backing: bigint;
    trusted: boolean;
    claimed: boolean;
  }>();
  const [positions, setPositions] = useState<Position[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const [amount, setAmount] = useState("100");
  const [mode, setMode] = useState<"deposit" | "protect" | "redeem">("deposit");
  const [lookup, setLookup] = useState("");
  const [clock, setClock] = useState(Date.now());
  const fmt = (v: bigint | undefined, d = 2) => api?.format(v, d) ?? "—";
  async function refresh(a = api, who = address) {
    if (!a) return;
    const sequence = ++refreshSequence.current;
    const result = await a.readPool();
    if (sequence !== refreshSequence.current) return;
    setData(result);
    if (who) {
      const [w, p] = await Promise.all([
        a.readWallet(who),
        a.readPositions(who, result.state.next_id),
      ]);
      if (who !== activeAddress.current || sequence !== refreshSequence.current)
        return;
      setWallet(w);
      setPositions(p);
    }
  }
  useEffect(() => {
    let alive = true;
    import("./stellar").then(async (a) => {
      if (!alive) return;
      setApi(a);
      try {
        await refresh(a, "");
      } catch (e) {
        setError((e as Error).message);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!api) return;
    const timer = setInterval(() => {
      refresh().catch((e) => setError((e as Error).message));
    }, 30000);
    return () => clearInterval(timer);
  }, [api, address]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    setMessage("");
    setHash("");
    try {
      await action();
      setMessage(`${label} complete.`);
    } catch (e) {
      setError(
        (e as Error).message ||
          "Action failed. Please retry after checking the transaction.",
      );
    } finally {
      setBusy("");
    }
  }
  async function connect() {
    if (!api) return;
    await run("Connect wallet", async () => {
      const who = await api.connect();
      activeAddress.current = who;
      setWallet(undefined);
      setPositions([]);
      setAddress(who);
      await refresh(api, who);
    });
  }
  async function tx(
    label: string,
    operation: () => Promise<{ hash: string; value: unknown }>,
  ) {
    setBusy(label);
    setError("");
    setMessage("");
    setHash("");
    try {
      const result = await operation();
      setHash(result.hash);
      setMessage(`${label} confirmed on chain.`);
      try {
        await refresh();
      } catch {
        setError(
          "Transaction confirmed on chain. Balance refresh is unavailable; use Refresh later. Do not repeat the transaction.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function transaction(
    id: string,
    method: string,
    args: Parameters<Api["transact"]>[3],
  ) {
    return api!.transact(address, id, method, args, setHash);
  }
  function deadline() {
    return api!.idSc(BigInt(Math.floor(Date.now() / 1000) + 120));
  }
  const min = (v: bigint) => api!.minimumOutput(v);
  async function submit() {
    if (!api || !address) return;
    await tx(
      mode === "deposit"
        ? "Deposit TESTUSD"
        : mode === "protect"
          ? "Protect receipts"
          : "Redeem receipts",
      async () => {
        const units = api.parseAmount(amount);
        if (mode === "deposit") {
          const preview = (await api.view(api.config.vault, "preview_deposit", [
            api.amountSc(units),
          ])) as bigint;
          return transaction(api.config.vault, "deposit", [
            api.addressSc(address),
            api.amountSc(units),
            api.amountSc(min(preview)),
            deadline(),
          ]);
        }
        if (mode === "redeem") {
          const preview = (await api.view(api.config.vault, "preview_redeem", [
            api.amountSc(units),
          ])) as bigint;
          return transaction(api.config.vault, "redeem", [
            api.addressSc(address),
            api.amountSc(units),
            api.amountSc(min(preview)),
            deadline(),
          ]);
        }
        const preview = (await api.view(api.config.vault, "preview_redeem", [
          api.amountSc(units),
        ])) as bigint;
        const result = await transaction(api.config.pool, "protect", [
          api.addressSc(address),
          api.amountSc(units),
          api.amountSc(min(preview)),
          deadline(),
        ]);
        api.remember(address, BigInt(result.value));
        return result;
      },
    );
  }
  async function exit(p: Position, backing: boolean) {
    if (!api) return;
    await tx(backing ? "Claim backing" : "Withdraw receipts", async () => {
      const output = (await api.view(api.config.pool, "preview_exit", [
        api.idSc(p.id),
        api.boolSc(backing),
      ])) as bigint;
      return transaction(api.config.pool, "exit", [
        api.idSc(p.id),
        api.boolSc(backing),
        api.amountSc(min(output)),
        deadline(),
      ]);
    });
  }
  const free = data ? data.state.liquidity - data.state.reserved : undefined;
  const ready = !!api && !busy;
  return (
    <>
      <div className="network">
        <span className="dot" />
        STELLAR TESTNET
        <span className="network-note">
          Experimental · valueless assets · AI-assisted build
        </span>
        <a href="#limits">Read the boundaries ↗</a>
      </div>
      <div className="shell">
        <header>
          <a className="brand" href="#">
            <span className="brand-mark">Y</span>yieldshield
            <span className="brand-chain">/ stellar</span>
          </a>
          <nav>
            <a href="#workspace">Workspace</a>
            <a href="#how">How it works</a>
            <button className="wallet" onClick={connect} disabled={!ready}>
              {address ? small(address) : "Connect Freighter"} <span>↗</span>
            </button>
          </nav>
        </header>
        <main>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">RESERVE LAB / 01</p>
              <h1>
                A reserve.
                <br />A choice.
                <br />
                <span>Your vault position.</span>
              </h1>
              <p className="lead">
                Explore vault risk with separately funded backing. Keep your
                receipts, or exchange the whole position for its recorded
                TESTUSD payout.
              </p>
              <a className="text-link" href="#workspace">
                Try the Stellar proof <span>↓</span>
              </a>
            </div>
            <div
              className="diagram"
              aria-label="TESTUSD funds vault receipts. Protection holds receipts and reserves a separate TESTUSD payout."
            >
              <div className="diagram-head">
                <span>NATIVE SOROBAN</span>
                <span>03 CONTRACTS</span>
              </div>
              <div className="flow">
                <div className="flow-label">Your funded position</div>
                <div className="vault-chip">
                  <div className="coin">y</div>
                  <div>
                    <strong>ysvUSD</strong>
                    <span>Demo vault receipts</span>
                  </div>
                </div>
                <div className="flow-arrow">↓</div>
                <div className="reserve-box">
                  <div className="shield-glyph">◇</div>
                  <div>
                    <strong>YieldShield reserve</strong>
                    <span>150% entry backing reserved</span>
                  </div>
                </div>
                <div className="fork">
                  <div>
                    ↙<strong>Keep receipts</strong>
                    <span>Less a share of gains</span>
                  </div>
                  <div>
                    ↘<strong>Claim TESTUSD</strong>
                    <span>Surrender all receipts</span>
                  </div>
                </div>
              </div>
              <div className="diagram-foot">
                <span>ONE POSITION</span>
                <strong>TWO EXITS</strong>
              </div>
            </div>
          </section>
          <section className="stats" aria-label="Live testnet metrics">
            <div>
              <span>Free test backing</span>
              <strong>
                {fmt(free)}
                <small>TESTUSD</small>
              </strong>
            </div>
            <div>
              <span>Reserved for positions</span>
              <strong>
                {fmt(data?.state.reserved)}
                <small>TESTUSD</small>
              </strong>
            </div>
            <div>
              <span>Vault value per receipt</span>
              <strong>
                {fmt(data?.nav, 4)}
                <small>TESTUSD</small>
              </strong>
            </div>
            <div>
              <span>Open positions</span>
              <strong>
                {data?.state.active ?? "—"}
                <small>
                  {data
                    ? clock - data.readAt < 90000
                      ? "LIVE TESTNET"
                      : "LAST KNOWN DATA"
                    : "CONNECTING"}
                </small>
              </strong>
            </div>
          </section>
          <section id="workspace" className="workspace">
            <div className="section-title">
              <p className="eyebrow">THE WORKSPACE</p>
              <h2>
                From test assets
                <br />
                to a protected position.
              </h2>
              <p>
                No wallet? Explore the live reserve above.
                <br />
                Connect Freighter on Testnet to try the flow.
              </p>
            </div>
            <div className="work-card">
              <div className="card-head">
                <h3>Your testnet wallet</h3>
                <span className="pill">NO REAL FUNDS</span>
              </div>
              {!address ? (
                <div className="empty">
                  <div className="outline-coin">↗</div>
                  <h4>A wallet is your starting point.</h4>
                  <p>
                    Use Freighter on Stellar Testnet. We never receive your
                    secret key.
                  </p>
                  <button
                    className="primary"
                    onClick={connect}
                    disabled={!ready}
                  >
                    Connect Freighter ↗
                  </button>
                  <a
                    href="https://www.freighter.app/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get Freighter
                  </a>
                </div>
              ) : (
                <>
                  <div className="balances">
                    <div>
                      <span>TESTUSD</span>
                      <strong>{fmt(wallet?.backing)}</strong>
                    </div>
                    <div>
                      <span>ysvUSD receipts</span>
                      <strong>{fmt(wallet?.shares, 4)}</strong>
                    </div>
                    <a
                      href={`${explorer}/account/${address}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {small(address)} ↗
                    </a>
                  </div>
                  <div className="setup">
                    <span>Start here</span>
                    <a
                      href={`https://friendbot.stellar.org/?addr=${address}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      1. Fund test XLM ↗
                    </a>
                    <button
                      disabled={!ready || wallet?.trusted}
                      onClick={() =>
                        tx("Add TESTUSD trustline", () =>
                          api!.trust(address, setHash),
                        )
                      }
                    >
                      {wallet?.trusted
                        ? "✓ Trustline ready"
                        : "2. Add TESTUSD trustline"}
                    </button>
                    <button
                      disabled={!ready || !wallet?.trusted || wallet?.claimed}
                      onClick={() =>
                        tx("Claim test tokens", () =>
                          transaction(api!.config.faucet, "claim", [
                            api!.addressSc(address),
                          ]),
                        )
                      }
                    >
                      {wallet?.claimed
                        ? "✓ Test tokens claimed"
                        : "3. Claim 1,000 TESTUSD"}
                    </button>
                  </div>
                  <div
                    className="tabs"
                    role="tablist"
                    aria-label="Wallet action"
                  >
                    {(["deposit", "protect", "redeem"] as const).map((m, i) => (
                      <button
                        key={m}
                        role="tab"
                        aria-selected={mode === m}
                        onClick={() => setMode(m)}
                      >
                        {i + 1}. {m[0].toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                  <label className="amount-label" htmlFor="amount">
                    {mode === "deposit"
                      ? "TESTUSD to deposit"
                      : "ysvUSD receipts"}
                  </label>
                  <div className="amount-input">
                    <input
                      id="amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      aria-describedby="action-detail"
                    />
                    <span>{mode === "deposit" ? "TESTUSD" : "ysvUSD"}</span>
                  </div>
                  <p id="action-detail" className="fine">
                    {mode === "deposit"
                      ? "Deposit funded test assets into the demo vault and receive transferable receipts."
                      : mode === "protect"
                        ? "Move receipts into protection. A fixed TESTUSD claim and a 50% reserve buffer are recorded at entry."
                        : "Redeem unprotected receipts for the vault’s available TESTUSD. Protected receipts must exit first."}{" "}
                    Signed transactions allow at most 0.5% less than the fresh
                    output quote and expire after two minutes.
                  </p>
                  <button
                    className="primary full"
                    disabled={!ready || !wallet?.trusted}
                    onClick={submit}
                  >
                    {busy ||
                      (mode === "deposit"
                        ? "Deposit into demo vault"
                        : mode === "protect"
                          ? "Create protected position"
                          : "Redeem vault receipts")}{" "}
                    <span>↗</span>
                  </button>
                </>
              )}
            </div>
          </section>
          {(error || message || busy || hash) && (
            <div
              className={`notice ${error ? "error" : ""}`}
              role="status"
              aria-live="polite"
            >
              {busy
                ? busy === "Connect wallet"
                  ? "Checking Freighter availability and requesting a wallet connection…"
                  : `${busy} in progress. Follow any Freighter prompt.`
                : error || message}
              {hash && (
                <a
                  href={`${explorer}/tx/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction status ↗
                </a>
              )}
            </div>
          )}
          <section className="positions">
            <div className="row">
              <h2>Your positions</h2>
              <button
                className="text-button"
                disabled={!ready}
                onClick={() => run("Refresh", () => refresh())}
              >
                Refresh ↻
              </button>
            </div>
            {!address ? (
              <p className="fine">
                Connect a wallet to load positions that belong to you.
              </p>
            ) : (
              <>
                <div className="lookup">
                  <label htmlFor="position-id">Find by ID</label>
                  <input
                    id="position-id"
                    placeholder="e.g. 1"
                    value={lookup}
                    onChange={(e) => setLookup(e.target.value)}
                    inputMode="numeric"
                  />
                  <button
                    disabled={!ready}
                    onClick={() =>
                      run("Find position", async () => {
                        const p = await api!.readPosition(lookup);
                        if (p.owner !== address)
                          throw new Error(
                            "This position belongs to another wallet.",
                          );
                        api!.remember(address, p.id);
                        setPositions((old) => [
                          ...old.filter((x) => x.id !== p.id),
                          p,
                        ]);
                      })
                    }
                  >
                    Load ↗
                  </button>
                </div>
                {!positions.length ? (
                  <p className="fine">
                    No positions found among your saved IDs or the latest 30
                    positions. Use an ID to recover an older position.
                  </p>
                ) : (
                  positions.map((p) => {
                    const delay = Math.max(
                      0,
                      Number(p.opened) + 60 - Math.floor(clock / 1000),
                    );
                    return (
                      <article className="position" key={String(p.id)}>
                        <div>
                          <span className="eyebrow">
                            POSITION {String(p.id)}
                          </span>
                          <strong>{fmt(p.shares, 4)} ysvUSD</strong>
                          <span>Recorded payout: {fmt(p.claim)} TESTUSD</span>
                        </div>
                        <div className="position-actions">
                          {p.closed ? (
                            <span className="pill">CLOSED</span>
                          ) : (
                            <>
                              <button
                                disabled={!ready || delay > 0}
                                onClick={() => exit(p, false)}
                              >
                                Keep receipts ↗
                              </button>
                              <button
                                className="dark"
                                disabled={
                                  !ready || delay > 0 || !wallet?.trusted
                                }
                                onClick={() => exit(p, true)}
                              >
                                Claim backing ↗
                              </button>
                              {delay > 0 && (
                                <span>Exit available in {delay}s</span>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </>
            )}
          </section>
          <section id="how" className="how">
            <p className="eyebrow">THE MECHANICS</p>
            <div className="steps">
              <article>
                <span>01 / FUND</span>
                <h3>
                  Real test balances.
                  <br />
                  Explicit token identity.
                </h3>
                <p>
                  TESTUSD has a named issuer and no dollar redemption. A deposit
                  funds the demo vault before receipts are issued.
                </p>
              </article>
              <article>
                <span>02 / RESERVE</span>
                <h3>
                  Separate backing.
                  <br />
                  Visible capacity.
                </h3>
                <p>
                  A single test sponsor funds the first-loss reserve. Each
                  position locks its payout plus a 50% buffer; reserved backing
                  cannot be withdrawn.
                </p>
              </article>
              <article>
                <span>03 / CHOOSE</span>
                <h3>
                  Two exits.
                  <br />
                  One clear tradeoff.
                </h3>
                <p>
                  After 60 seconds, take receipts back with 10% of positive
                  gains shared in receipts, or surrender the entire position for
                  recorded backing.
                </p>
              </article>
            </div>
          </section>
          <section id="limits" className="limits">
            <div>
              <p className="eyebrow">BUILT FOR REVIEW</p>
              <h2>
                A transparent proof,
                <br />
                with visible boundaries.
              </h2>
            </div>
            <div>
              <p>
                This demo uses funded test assets. Donations simulate gains. The
                vault administrator can deliberately remove TESTUSD to simulate
                a loss; there is no live investment strategy or market oracle.
              </p>
              <p>
                The reserve has one sponsor and no forced expiry. Sponsor
                backing stays reserved until a user exits. There is no recurring
                premium, promised return or risk-free protection. Native XLM is
                used only for network fees and account reserves.
              </p>
              <p>
                Contracts are unaudited and AI-assisted. Testnet resets and
                archived storage may interrupt access. Real USDC, lending
                adapters, independent security review and multiple reserve
                providers are future work.
              </p>
              <div className="source-links">
                <a
                  href="https://developers.stellar.org/docs/tokens/stellar-asset-contract"
                  target="_blank"
                  rel="noreferrer"
                >
                  Stellar asset standard ↗
                </a>
                <a
                  href={`${explorer}/account/${manifest.issuer}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  TESTUSD issuer ↗
                </a>
                {api && (
                  <>
                    <a
                      href={`${explorer}/contract/${api.config.pool}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Pool contract ↗
                    </a>
                    <a
                      href={`${explorer}/contract/${api.config.vault}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Vault contract ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          </section>
        </main>
        <footer>
          <a className="brand" href="#">
            <span className="brand-mark">Y</span>yieldshield
          </a>
          <span>STELLAR RESERVE LAB / TESTNET</span>
          <span>Hawig Ventures UG (haftungsbeschränkt)</span>
        </footer>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

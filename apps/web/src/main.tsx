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
import { Home, Markets, PoolDetail } from "./MarketPages";
import { Trade, Assets } from "./TradingPages";
import { Protect, Provide } from "./ProtectionPages";
import { Portfolio, PositionPage, SettlementQueue } from "./PortfolioPages";
import {
  percent,
  CreatePool,
  Status,
  AdminClaims,
  Activity,
} from "./ManagementPages";
import { Learn, Legal } from "./LearningPages";
import { Navigation } from "./Navigation";
import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import type { Data, Market, Wallet, State } from "./v3";
import { format, parseAmount, minimumOutput, UNIT } from "./amounts";
import "./style.css";
import "./routes.css";
const Legacy = lazy(() => import("./Legacy"));
function useRoute() {
  const [url, set] = useState(() => new URL(location.href));
  useEffect(() => {
    const pop = () => set(new URL(location.href));
    const click = (event: MouseEvent) => {
      const a = (event.target as Element).closest("a");
      if (
        !a ||
        a.target ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const next = new URL(a.href);
      if (
        next.origin !== location.origin ||
        a.hasAttribute("download") ||
        (next.pathname === location.pathname &&
          next.search === location.search &&
          next.hash)
      )
        return;
      event.preventDefault();
      history.pushState({}, "", next);
      set(next);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", pop);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("popstate", pop);
      document.removeEventListener("click", click);
    };
  }, []);
  return url;
}
export function App() {
  const url = useRoute();
  const [api, setApi] = useState<Api>();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryError, setRegistryError] = useState(false);
  const [registryAttempt, setRegistryAttempt] = useState(0);
  const [address, setAddress] = useState("");
  const [data, setData] = useState<Data>();
  const [wallet, setWallet] = useState<Wallet>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hash, setHash] = useState("");
  const [quote, setQuote] = useState<Quote>();
  const [follow, setFollow] = useState("");
  const version = useRef(0);
  const readVersion = useRef(0);
  const active = useRef({ address: "", pool: "" });
  const mainRef = useRef<HTMLElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const reviewTrigger = useRef<HTMLElement | null>(null);
  const path = url.pathname;
  const previousPath = useRef(path);
  useEffect(() => {
    document.title = `${path === "/" ? "Reserve Lab" : path === "/legacy" ? "Legacy market" : title(path)} | YieldShield Stellar`;
    if (previousPath.current !== path) {
      mainRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
      previousPath.current = path;
    }
  }, [path]);
  useEffect(() => {
    if (quote) reviewRef.current?.focus();
  }, [quote]);
  const selected = path.startsWith("/markets/")
    ? path.split("/")[2]
    : url.searchParams.get("pool");
  const market = selected
    ? markets.find((m) => m.pool === selected)
    : markets[0];
  const routeKey = url.pathname + url.search;
  active.current = { address, pool: market?.pool || "" };
  const href = (p: string, m = market) =>
    m ? `${p}${p.includes("?") ? "&" : "?"}pool=${m.pool}` : p;
  function clear() {
    version.current++;
    setQuote(undefined);
  }
  useEffect(() => {
    let live = true;
    setRegistryLoading(true);
    setRegistryError(false);
    import("./v3")
      .then((module) => {
        if (live) setApi(module);
        return module.markets();
      })
      .then((m) => {
        if (live) setMarkets(m);
      })
      .catch(() => { if (live) setRegistryError(true); })
      .finally(() => { if (live) setRegistryLoading(false); });
    return () => {
      live = false;
    };
  }, [registryAttempt]);
  useEffect(() => {
    clear();
    setError("");
  }, [routeKey, address]);
  async function refresh() {
    if (!api || !market) return;
    const requested = { address, pool: market.pool };
    const request = ++readVersion.current;
    const current = () =>
      request === readVersion.current &&
      active.current.pool === requested.pool &&
      active.current.address === requested.address;
    try {
      const [d, w] = await Promise.all([
        api.readMarket(market),
        address ? api.readAccount(market, address) : Promise.resolve(undefined),
      ]);
      if (!current()) return;
      setData(d);
      setWallet(w);
    } catch (e) {
      if (current()) {
        setData(undefined);
        setWallet(undefined);
        clear();
        throw e;
      }
    }
  }
  useEffect(() => {
    setData(undefined);
    setWallet(undefined);
    if (!api || !market) return;
    let live = true;
    const run = () =>
      refresh().catch((e) => {
        if (live) {
          setData(undefined);
          setWallet(undefined);
          clear();
          setError(String(e));
        }
      });
    void run();
    const timer = setInterval(run, 20000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api, market?.pool, address]);
  async function connect() {
    if (!api) return;
    setBusy("Connecting to Freighter…");
    setError("");
    clear();
    try {
      const a = await api.connect();
      setWallet(undefined);
      active.current.address = a;
      setAddress(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function review(make: (a: Api) => Promise<Quote> | Quote) {
    reviewTrigger.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (!api || !address) {
      setError("Connect Freighter to review this action.");
      return;
    }
    clear();
    const key = version.current;
    const owner = address;
    const pool = market?.pool;
    setBusy("Reviewing current onchain values…");
    setError("");
    setNotice("");
    try {
      const q = await make(api);
      if (
        key === version.current &&
        active.current.address === owner &&
        active.current.pool === pool
      )
        setQuote(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function confirm() {
    if (!api || !quote) return;
    const q = quote;
    setBusy("Confirm this transaction in Freighter…");
    setError("");
    setHash("");
    setFollow("");
    try {
      if (q.deadline < now())
        throw new Error("This review expired. Review the action again.");
      const r =
        q.special === "trust"
          ? await api.trust(address, submitted)
          : await api.transact(address, q.contract, q.method, q.args, submitted);
      setHash(r.hash);
      setNotice(`${q.title} confirmed on Stellar Testnet.`);
      setFollow(q.follow || "");
      setQuote(undefined);
      try {
        await refresh();
        if (q.method === "create") {
          setMarkets(await api.markets());
          setFollow(`/provide?pool=${r.value}`);
        }
      } catch {
        setNotice(
          `${q.title} confirmed. Balances are temporarily unavailable; do not repeat the transaction.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
    function submitted(transactionHash: string) {
      // Once broadcast can occur, this review must never authorize a second
      // transaction, including when RPC confirmation is unavailable.
      setHash(transactionHash);
      clear();
    }
  }
  const ctx: Ctx = {
    api,
    address,
    market,
    data,
    wallet,
    busy: !!busy || !address || !data,
    href,
    review,
    clear,
  };
  if (path === "/legacy")
    return (
      <Suspense fallback={<p>Opening legacy market…</p>}>
        <a className="legacy-return" href="/markets">
          ← Return to current markets
        </a>
        <Legacy />
      </Suspense>
    );
  return (
    <div className="v3">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="network-banner">
        STELLAR TESTNET{" "}
        <span>
          Valueless demo assets · Unaudited contracts · XLM pays network fees
          only
        </span>
      </div>
      <header className="app-header">
        <a className="brand" href="/">
          yieldshield<span>STELLAR / 03</span>
        </a>
        <Navigation path={path} routeKey={routeKey} href={href} />
        <button
          className="wallet-button"
          disabled={!api || !!busy}
          onClick={connect}
        >
          {address ? small(address) : "Connect Freighter"}
        </button>
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1} aria-label={path === "/" ? "Stellar Reserve Lab" : title(path)}>
        {path === "/" ? (
          <Home href={href} />
        ) : (
          <div className="page-heading">
            <p className="eyebrow">NATIVE SOROBAN · FUNDED TEST MARKETS</p>
            <h1>{title(path)}</h1>
          </div>
        )}
        {path !== "/" && market && (
          <div className="market-switch">
            <label>
              Selected pool
              <select
                value={market.pool}
                onChange={(e) => {
                  const next = new URL(location.href);
                  next.searchParams.set("pool", e.target.value);
                  if (path.startsWith("/markets/"))
                    next.pathname = `/markets/${e.target.value}`;
                  if (path.startsWith("/positions/"))
                    next.pathname = "/positions";
                  history.pushState({}, "", next);
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
              >
                {markets.map((m) => (
                  <option value={m.pool} key={m.pool}>
                    {m.name} · {small(m.pool)}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {market.symbol} / {market.backingSymbol}
            </span>
            <a href={href(`/markets/${market.pool}`)}>Pool details ↗</a>
          </div>
        )}
        {(error || notice || busy || hash) && (
          <div className={`feedback ${error ? "error" : ""}`} role="status">
            {busy && <p>{busy}</p>}
            {error && <p role="alert">{error}</p>}
            {notice && <p>{notice}</p>}
            {hash && (
              <a
                href={`${explorer}/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction status ↗
              </a>
            )}
            {follow && (
              <a href={follow}>
                {follow.startsWith("/provide")
                  ? "Fund your created pool →"
                  : "Continue to protection →"}
              </a>
            )}
          </div>
        )}
        {quote && (
          <section className="review" ref={reviewRef} tabIndex={-1} aria-labelledby="review-title">
            <div>
              <p className="eyebrow">REVIEW BEFORE SIGNING</p>
              <h2 id="review-title">{quote.title}</h2>
              <p>Wallet {small(address)} · Stellar Testnet</p>
              <dl>
                {quote.lines.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </React.Fragment>
                ))}
                <dt>Review expires</dt>
                <dd>{date(quote.deadline)}</dd>
              </dl>
            </div>
            <div>
              <p>
                {[
                  "buy",
                  "sell",
                  "provide",
                  "withdraw",
                  "protect",
                  "exit",
                  "deposit",
                  "redeem",
                ].includes(quote.method)
                  ? "This amount-sensitive method enforces the displayed output limit and transaction deadline on chain."
                  : "This action authorizes the specific contract method shown above; the review expiry is a browser safeguard."}{" "}
                Network fees are paid separately in test XLM.
              </p>
              <button disabled={!!busy} onClick={confirm}>
                Confirm in Freighter →
              </button>
              <button className="quiet" disabled={!!busy} onClick={() => {
                clear();
                reviewTrigger.current?.focus();
              }}>
                Cancel review
              </button>
            </div>
          </section>
        )}
        {selected && !market && markets.length > 0 && (
          <p className="feedback error">
            This pool is not registered.{" "}
            <a href="/markets">Choose a verified market</a>; no other pool has
            been selected.
          </p>
        )}
        {!address && (["/trade", "/protect", "/provide", "/positions", "/faucet", "/assets", "/create-pool"].includes(path) || path.startsWith("/positions/")) && (
          <p className="wallet-prompt">
            Connect Freighter to review transactions. Market terms remain
            available without a wallet.
          </p>
        )}
        {!["/", "/legal", "/how-it-works", "/account"].includes(path) && !markets.length && (
          <div className="feedback" role="status">
            {registryLoading ? (
              <p>Loading verified markets from Stellar Testnet…</p>
            ) : (
              <>
                <p>{registryError
                  ? "We couldn’t load the market registry. Check your connection and try again."
                  : "No markets are currently registered on Stellar Testnet."}</p>
                <button className="quiet" onClick={() => setRegistryAttempt((attempt) => attempt + 1)}>
                  Retry market loading
                </button>
              </>
            )}
          </div>
        )}
        {path === "/markets" && (
          <Markets markets={markets} api={api} href={href} />
        )}
        {path.startsWith("/markets/") && market && <PoolDetail {...ctx} />}
        {path === "/trade" && market && (
          <Trade {...ctx} initial={url.searchParams.get("amount") || "100"} />
        )}
        {path === "/protect" && market && (
          <Protect {...ctx} initial={url.searchParams.get("amount") || "100"} />
        )}
        {path === "/provide" && market && <Provide {...ctx} />}
        {path === "/positions" && <Portfolio {...ctx} markets={markets} />}
        {path.startsWith("/positions/") && market && (
          <PositionPage {...ctx} id={path.split("/")[2]} />
        )}
        {(path === "/faucet" || path === "/assets") && <Assets {...ctx} />}
        {path === "/create-pool" && <CreatePool {...ctx} markets={markets} />}
        {path === "/account" && (
          <section className="panel">
            <h2>Your connected account</h2>
            <p>{address || "No wallet connected"}</p>
            <p>
              Network: Stellar Testnet. Switching accounts clears wallet
              balances and transaction reviews.
            </p>
            <div className="actions">
              <button disabled={!!busy} onClick={connect}>
                Switch or reconnect wallet
              </button>
              <button
                className="secondary"
                disabled={!!busy || !address}
                onClick={() => {
                  clear();
                  setAddress("");
                  setWallet(undefined);
                  setHash("");
                  setNotice("Wallet disconnected from this page.");
                }}
              >
                Disconnect
              </button>
            </div>
            <a href="/faucet">Fund test assets →</a>
          </section>
        )}
        {path === "/activity" && market && <Activity {...ctx} />}
        {path === "/status" && <Status {...ctx} markets={markets} />}
        {(path === "/how-it-works" || path === "/learn/scenarios") && (
          <Learn {...ctx} />
        )}
        {path === "/legal" && <Legal />}
        {![
          "/",
          "/markets",
          "/trade",
          "/protect",
          "/provide",
          "/positions",
          "/faucet",
          "/assets",
          "/create-pool",
          "/activity",
          "/account",
          "/status",
          "/how-it-works",
          "/learn/scenarios",
          "/legal",
        ].includes(path) &&
          !path.startsWith("/positions/") &&
          !path.startsWith("/markets/") && (
            <p>
              Page not found. <a href="/markets">Explore markets →</a>
            </p>
          )}
      </main>
      <footer>
        <a className="brand" href="/">
          yieldshield
        </a>
        <div>
          <a href="/faucet">Test assets</a>
          <a href="/how-it-works">How it works</a>
          <a href="/learn/scenarios">Scenarios</a>
          <a href="/account">Account</a>
          <a href="/status">Network & contracts</a>
          <a href="/legal">Risks & terms</a>
        </div>
        <p>
          Hawig Ventures UG (haftungsbeschränkt) · Testnet research prototype
        </p>
      </footer>
    </div>
  );
}
function title(p: string) {
  return p.startsWith("/positions/")
    ? "Your protected position"
    : p.startsWith("/markets/")
      ? "Inside this pool"
      : (
          {
            "/markets": "Choose your market.",
            "/trade": "Buy. Sell. Then protect.",
            "/protect": "Keep a defined exit.",
            "/provide": "Put capacity to work.",
            "/positions": "Every position, in view.",
            "/faucet": "Start with test assets.",
            "/assets": "Your native test assets.",
            "/create-pool": "Build your own pool.",
            "/activity": "Follow the onchain activity.",
            "/account": "Your wallet, your control.",
            "/status": "Proof, not promises.",
            "/how-it-works": "Two roles. One funded pool.",
            "/learn/scenarios": "Explore the outcomes.",
            "/legal": "Know the boundaries.",
          } as Record<string, string>
        )[p] || "YieldShield";
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

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
import { isTestnetReset, message, restorePreambleOf } from "./errors";
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
  const [registryError, setRegistryError] = useState("");
  const [registryAttempt, setRegistryAttempt] = useState(0);
  const [unlisted, setUnlisted] = useState({ pool: "", checking: false });
  const [address, setAddress] = useState("");
  const [data, setData] = useState<Data>();
  const [wallet, setWallet] = useState<Wallet>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [lastGoodAt, setLastGoodAt] = useState<number>();
  const [archived, setArchived] = useState<{ text: string; preamble: unknown }>();
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
    // index.html names the home page as canonical; follow the current route.
    document
      .querySelector?.('link[rel="canonical"]')
      ?.setAttribute("href", `https://stellar.yieldshield.ai${path}`);
    if (previousPath.current !== path) {
      mainRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
      previousPath.current = path;
    }
  }, [path]);
  useEffect(() => {
    if (quote) reviewRef.current?.focus();
  }, [quote]);
  // After an action ends, the control that started it (Confirm, Fund,
  // Restore) is usually gone; move focus to the result instead of <body>.
  const feedbackRef = useRef<HTMLDivElement>(null);
  const focusFeedback = useRef(false);
  useEffect(() => {
    if (!focusFeedback.current) return;
    focusFeedback.current = false;
    feedbackRef.current?.focus();
  });
  function finish() {
    focusFeedback.current = true;
    setBusy("");
  }
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
    setRegistryError("");
    import("./v3")
      .then((module) => {
        if (live) setApi(module);
        return module.markets();
      })
      .then((m) => {
        if (live) setMarkets(m);
      })
      .catch((e) => {
        if (!live) return;
        // A reset testnet is reported as such, not as a connection problem.
        setRegistryError(
          isTestnetReset(e)
            ? message(e)
            : restorePreambleOf(e)
              ? "The market registry is archived. Restore it above to load the markets."
              : "We couldn’t load the market registry. Check your connection and try again.",
        );
        if (restorePreambleOf(e)) readFailed(e);
      })
      .finally(() => { if (live) setRegistryLoading(false); });
    return () => {
      live = false;
    };
  }, [registryAttempt]);
  // The registry listing is bounded; a linked pool outside it is accepted
  // only after the factory confirms it registered that pool.
  useEffect(() => {
    if (!api || !selected || registryLoading || markets.some((m) => m.pool === selected))
      return;
    let live = true;
    setUnlisted({ pool: selected, checking: true });
    api
      .registeredMarket(selected)
      .then((found) => {
        if (!live) return;
        if (found)
          setMarkets((list) =>
            list.some((m) => m.pool === found.pool) ? list : [...list, found],
          );
        setUnlisted({ pool: selected, checking: false });
      })
      .catch(() => {
        if (live) setUnlisted({ pool: selected, checking: false });
      });
    return () => {
      live = false;
    };
  }, [api, selected, registryLoading, markets]);
  useEffect(() => {
    clear();
    setError("");
  }, [routeKey, address]);
  // Market terms and wallet balances are read independently: a wallet read
  // failure (or a brand-new unfunded wallet) must not hide public pool data.
  // view() already retried each failed request once.
  // After a confirmed transaction (`strict`), any failed read clears both,
  // because previously displayed balances are known to be outdated.
  async function refresh(strict = false) {
    if (!api || !market) return;
    const requested = { address, pool: market.pool };
    const request = ++readVersion.current;
    const current = () =>
      request === readVersion.current &&
      active.current.pool === requested.pool &&
      active.current.address === requested.address;
    const [m, w] = await Promise.allSettled([
      api.readMarket(market),
      address ? api.readAccount(market, address) : Promise.resolve(undefined),
    ]);
    if (!current()) return;
    if (strict && (m.status === "rejected" || w.status === "rejected")) {
      setData(undefined);
      setWallet(undefined);
      clear();
      throw m.status === "rejected" ? m.reason : (w as PromiseRejectedResult).reason;
    }
    // A failed background read keeps the last good values, marked stale, and
    // leaves an open review alone: reviews re-read and simulate before
    // signing. Only a vanished deployment clears what is shown.
    if (m.status === "fulfilled") setData(m.value);
    else if (isTestnetReset(m.reason)) {
      setData(undefined);
      clear();
    }
    if (w.status === "fulfilled") setWallet(w.value);
    if (m.status === "fulfilled" && w.status === "fulfilled") setLastGoodAt(Date.now());
    // Archived storage keeps its own error so the restore action can use it.
    if (m.status === "rejected")
      throw restorePreambleOf(m.reason)
        ? m.reason
        : new Error(`Pool data could not be read. ${message(m.reason)}`);
    if (w.status === "rejected")
      throw restorePreambleOf(w.reason)
        ? w.reason
        : new Error(`Wallet balances could not be read. ${message(w.reason)}`);
  }
  function readOk() {
    setReadError("");
    setArchived(undefined);
  }
  function readFailed(e: unknown) {
    const preamble = restorePreambleOf(e);
    if (preamble) {
      setReadError("");
      setArchived({ text: message(e), preamble });
    } else setReadError(message(e));
  }
  useEffect(() => {
    setData(undefined);
    setWallet(undefined);
    setLastGoodAt(undefined);
    readOk();
    if (!api || !market) return;
    let live = true;
    const run = () =>
      refresh().then(
        () => {
          if (live) readOk();
        },
        (e) => {
          if (live) readFailed(e);
        },
      );
    void run();
    const timer = setInterval(run, 20000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api, market?.pool, address]);
  async function fund() {
    if (!api || !address) return;
    setBusy("Requesting test XLM from Friendbot…");
    setError("");
    setNotice("");
    try {
      await api.fundWithFriendbot(address);
      setNotice("Wallet funded with valueless test XLM. Next, add the TESTUSD trustline.");
      await refresh().then(readOk, readFailed);
    } catch (e) {
      setError(message(e));
    } finally {
      finish();
    }
  }
  async function restoreArchived() {
    if (!api || !address || !archived) return;
    setBusy("Confirm the storage restore in Freighter…");
    setError("");
    setNotice("");
    setHash("");
    try {
      const r = await api.restore(address, archived.preamble, setHash);
      setHash(r.hash);
      setArchived(undefined);
      setNotice("Archived contract storage restored on Stellar Testnet.");
      if (!markets.length) setRegistryAttempt((attempt) => attempt + 1);
      else await refresh().then(readOk, readFailed);
    } catch (e) {
      setError(message(e));
    } finally {
      finish();
    }
  }
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
    if (wallet?.funded === false) {
      setError(
        "This wallet is not funded on Stellar Testnet yet. Fund it with test XLM from Friendbot, then review again.",
      );
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
      let q = await make(api);
      // Simulate the exact invocation now, so contract failures surface in
      // the review rather than after the wallet signature.
      if (!q.special) {
        const check = await api.preflight(owner, q.contract, q.method, q.args);
        if (check.restore)
          q = {
            ...q,
            lines: [
              ...q.lines,
              ["Archived storage", "Restored first: one extra Freighter signature"],
            ],
          };
      }
      if (
        key === version.current &&
        active.current.address === owner &&
        active.current.pool === pool
      )
        setQuote(q);
    } catch (e) {
      if (restorePreambleOf(e)) readFailed(e);
      else setError(message(e));
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
          : await api.transact(
              address,
              q.contract,
              q.method,
              q.args,
              submitted,
              () =>
                setBusy(
                  "Archived contract storage must be restored first. Confirm the restore in Freighter, then the transaction.",
                ),
            );
      setHash(r.hash);
      setNotice(`${q.title} confirmed on Stellar Testnet.`);
      setFollow(q.follow || "");
      setQuote(undefined);
      try {
        await refresh(true);
        readOk();
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
      finish();
    }
    function submitted(transactionHash: string) {
      // Once broadcast can occur, this review must never authorize a second
      // transaction, including when RPC confirmation is unavailable.
      setHash(transactionHash);
      clear();
      focusFeedback.current = true;
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
          Valueless assets · Unaudited contracts · XLM for fees only
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
          <div
            className={`feedback ${error ? "error" : ""}`}
            role="status"
            ref={feedbackRef}
            tabIndex={-1}
          >
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
        {readError && (
          <div className="feedback error" role="status">
            <p>{readError}</p>
            {lastGoodAt && (data || wallet) && (
              <p>
                Stale: showing the last values read successfully at{" "}
                {new Date(lastGoodAt).toLocaleTimeString()}. Reviews re-read
                current values before signing.
              </p>
            )}
          </div>
        )}
        {archived && (
          <div className="feedback error" role="status">
            <p>
              {archived.text} Restoring renews the existing entries for a small
              test-XLM fee and one Freighter signature.
            </p>
            {address ? (
              <button
                className="secondary"
                disabled={!!busy}
                onClick={restoreArchived}
              >
                Restore archived storage
              </button>
            ) : (
              <p>Connect Freighter to restore it.</p>
            )}
          </div>
        )}
        {address && wallet?.funded === false && (
          <div className="feedback" role="status">
            <p>
              <strong>This wallet is not funded on Stellar Testnet yet.</strong>{" "}
              Friendbot sends free, valueless test XLM for fees and reserves.
              Pool data stays readable; transactions need a funded wallet.
            </p>
            <button className="secondary" disabled={!!busy} onClick={fund}>
              Fund with Friendbot
            </button>{" "}
            <a href={friendbot(address)} target="_blank" rel="noreferrer">
              Open Friendbot ↗
            </a>
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
                  ? "The contract enforces these amount limits and the transaction deadline."
                  : "Only this action is authorized. Review expiry is a browser safeguard."}{" "}
                Network fees are separate, in test XLM.
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
          <p className={unlisted.pool === selected && !unlisted.checking ? "feedback error" : "feedback"} role="status">
            {unlisted.pool === selected && !unlisted.checking
              ? "This pool is not registered, or the registry could not be read. "
              : "Checking this pool in the factory registry… "}
            <a href="/markets">Choose a verified market</a>; no other pool has
            been selected.
          </p>
        )}
        {!address && (["/trade", "/protect", "/positions", "/faucet", "/assets", "/create-pool"].includes(path) || path.startsWith("/positions/")) && (
          <p className="wallet-prompt">
            Connect Freighter to review a transaction.
          </p>
        )}
        {!["/", "/legal", "/how-it-works", "/account"].includes(path) && !markets.length && (
          <div className="feedback" role="status">
            {registryLoading ? (
              <p>Loading verified markets from Stellar Testnet…</p>
            ) : (
              <>
                <p>{registryError || "No markets are currently registered on Stellar Testnet."}</p>
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
          <a href="/learn/scenarios">Scenarios</a>
          <a href="/status">Status</a>
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
            "/trade": "Trade vault receipts.",
            "/protect": "Protect your receipts.",
            "/provide": "Provide backing.",
            "/positions": "Your portfolio.",
            "/faucet": "Start with test assets.",
            "/assets": "Fund your wallet.",
            "/create-pool": "Build your own pool.",
            "/activity": "Pool activity.",
            "/account": "Your wallet.",
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

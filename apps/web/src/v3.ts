import { StrKey, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import * as api from "./stellar";
import catalog from "../../../config/markets.json";
export * from "./stellar";
export type Market = {
  pool: string;
  vault: string;
  backing: string;
  exchange: string;
  symbol: string;
  name: string;
  backingSymbol: string;
  description: string;
};
export type Terms = {
  collateral_bps: number;
  junior_fee_bps: number;
  creator_fee_bps: number;
  duration: bigint;
  notice_delay: bigint;
};
export type State = {
  vault: string;
  backing: string;
  creator: string;
  protocol: string;
  terms: Terms;
  end: bigint;
  liquidity: bigint;
  reserved: bigint;
  total_lp: bigint;
  reward_balance: bigint;
  inventory_balance: bigint;
  creator_rewards: bigint;
  protocol_rewards: bigint;
  credit_total: bigint;
  active: number;
  next_id: bigint;
};
export type Provider = {
  shares: bigint;
  rewards: bigint;
  inventory: bigint;
  notice_shares: bigint;
  notice_at: bigint;
};
export type Data = {
  state: State;
  nav: bigint;
  assets: bigint;
  supply: bigint;
  inventory: { backing: bigint; receipts: bigint } | null;
  readAt: number;
};
export type Wallet = {
  shares: bigint;
  backing: bigint;
  testusd: bigint;
  trusted: boolean;
  claimed: boolean;
  provider: Provider;
  credit: bigint;
  positions: api.Position[];
};
export const deployment = catalog as {
  revision: string;
  factory: string;
  poolWasmHash: string;
  markets: Market[];
};
export type Listing = {
  pool: string;
  creator: string;
  vault: string;
  end: bigint;
};
export type Registry = {
  count: number;
  max_live: number;
  max_per_creator: number;
};
// Matches the factory's PAGE_LIMIT: the newest registrations shown besides
// unmatured pools, so matured pools stay reachable for settlement and claims.
export const RECENT_POOLS = 25;
const u32Sc = (v: number) => nativeToScVal(v, { type: "u32" });
function community(reference: Market, pool: string): Market {
  return { ...reference, pool, name: `Community pool · ${reference.symbol}` };
}
function referenceFor(vault: string) {
  const reference = deployment.markets.find((m) => m.vault === vault);
  if (!reference) throw new Error("Registry contains an unsupported vault.");
  return reference;
}
// Featured pools, then unmatured and recently registered community pools,
// newest first. The factory bounds both reads, so page load stays bounded.
export async function markets(): Promise<Market[]> {
  if (!deployment.factory) return deployment.markets;
  const registry = await api.view(deployment.factory, "state");
  if (Array.isArray(registry.pools)) return unpagedMarkets(registry.pools);
  const count = Number(registry.count);
  const [live, recent] = (await Promise.all([
    api.view(deployment.factory, "live_pools"),
    api.view(deployment.factory, "pools", [
      u32Sc(Math.max(0, count - RECENT_POOLS)),
      u32Sc(RECENT_POOLS),
    ]),
  ])) as [Listing[], Listing[]];
  const seen = new Set(deployment.markets.map((m) => m.pool));
  const listed = [...deployment.markets];
  for (const l of [...live.slice().reverse(), ...recent.slice().reverse()]) {
    if (seen.has(l.pool)) continue;
    seen.add(l.pool);
    listed.push(community(referenceFor(l.vault), l.pool));
  }
  return listed;
}
// Factories deployed before the paged registry return every pool in
// `state().pools` (capped at 200 by that contract).
async function unpagedMarkets(pools: string[]) {
  const known = new Map(deployment.markets.map((m) => [m.pool, m]));
  return Promise.all(
    pools.map(async (pool) => {
      if (known.has(pool)) return known.get(pool)!;
      const s = (await api.view(pool, "state")) as State;
      return community(referenceFor(s.vault), pool);
    }),
  );
}
// Resolves a linked pool outside the bounded listing. Only pools the
// factory registered (it alone writes records) for a known vault qualify.
export async function registeredMarket(pool: string): Promise<Market | null> {
  if (!deployment.factory || !StrKey.isValidContract(pool)) return null;
  const known = deployment.markets.find((m) => m.pool === pool);
  if (known) return known;
  let record: { vault: string };
  try {
    record = await api.view(deployment.factory, "record", [api.addressSc(pool)]);
  } catch {
    return null;
  }
  return community(referenceFor(record.vault), pool);
}
// Checks the factory's own creation limits so the review explains them
// instead of failing in transaction preparation.
export async function creationLimit(creator: string) {
  const registry = (await api.view(deployment.factory, "state")) as Registry;
  if (registry.max_live === undefined) return "";
  const live = (await api.view(deployment.factory, "live_pools")) as Listing[];
  if (live.length >= registry.max_live)
    return `The factory already has ${registry.max_live} unmatured pools. Create one after a pool matures.`;
  if (live.filter((l) => l.creator === creator).length >= registry.max_per_creator)
    return `Each wallet can have ${registry.max_per_creator} unmatured pools. Create another after one of yours matures.`;
  return "";
}
export async function readMarket(m: Market): Promise<Data> {
  const [state, nav, assets, supply, inventory] = await Promise.all([
    api.view(m.pool, "state"),
    api.view(m.vault, "nav"),
    api.view(m.vault, "total_assets"),
    api.view(m.vault, "total_supply"),
    m.exchange ? api.view(m.exchange, "inventory") : null,
  ]);
  return { state, nav, assets, supply, inventory, readAt: Date.now() };
}
export async function readAccount(m: Market, address: string): Promise<Wallet> {
  const base = await api.readFunding(address);
  const [shares, backing, provider, credit, ids] = await Promise.all([
    api.view(m.vault, "balance", [api.addressSc(address)]),
    // A classic SAC balance read fails before the account has its trustline.
    // Horizon already supplies the TESTUSD balance (zero if not trusted), so
    // onboarding must not depend on calling that unavailable token balance.
    m.backing === api.config.backing
      ? Promise.resolve(base.backing)
      : api.view(m.backing, "balance", [api.addressSc(address)]),
    api.view(m.pool, "provider", [api.addressSc(address)]),
    api.view(m.pool, "credit", [api.addressSc(address)]),
    api.view(m.pool, "positions", [api.addressSc(address)]),
  ]);
  const positions = (
    await Promise.all(
      (ids as bigint[]).map(
        async (id) =>
          ({
            ...(await api.view(m.pool, "position", [api.idSc(id)])),
            id,
          }) as Promise<api.Position>,
      ),
    )
  ).filter((p) => p.owner === address);
  return {
    ...base,
    testusd: base.backing,
    shares,
    backing,
    provider,
    credit,
    positions,
  };
}
export const termsSc = (t: {
  collateral_bps: number;
  junior_fee_bps: number;
  creator_fee_bps: number;
  duration: bigint;
  notice_delay: bigint;
}) =>
  xdr.ScVal.scvMap(
    Object.entries(t)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, val]) =>
          new xdr.ScMapEntry({
            key: nativeToScVal(key, { type: "symbol" }),
            val: nativeToScVal(val, {
              type: typeof val === "bigint" ? "u64" : "u32",
            }),
          }),
      ),
  );
export const saltSc = () =>
  nativeToScVal(crypto.getRandomValues(new Uint8Array(32)), { type: "bytes" });
export async function events(pool: string) {
  const server = new (await import("@stellar/stellar-sdk")).rpc.Server(
    api.config.rpcUrl,
  );
  const ledger = await server.getLatestLedger();
  const r = await server.getEvents({
    startLedger: Math.max(1, ledger.sequence - 17280),
    filters: [{ type: "contract", contractIds: [pool] }],
    limit: 50,
  });
  return r.events.map((e) => ({
    id: e.id,
    hash: e.txHash,
    ledger: e.ledger,
    time: e.ledgerClosedAt,
    topic: e.topic.map((t) => String(scValToNative(t))).join(" / "),
  }));
}

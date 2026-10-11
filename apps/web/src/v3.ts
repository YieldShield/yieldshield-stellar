import { nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
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
export async function markets(): Promise<Market[]> {
  if (!deployment.factory) return deployment.markets;
  const registry = await api.view(deployment.factory, "state");
  const listed = registry.pools as string[];
  const known = new Map(deployment.markets.map((m) => [m.pool, m]));
  return Promise.all(
    listed.map(async (pool) => {
      if (known.has(pool)) return known.get(pool)!;
      const s = (await api.view(pool, "state")) as State;
      const reference = deployment.markets.find((m) => m.vault === s.vault);
      if (!reference)
        throw new Error("Registry contains an unsupported vault.");
      return {
        ...reference,
        pool,
        name: `Community pool · ${reference.symbol}`,
      };
    }),
  );
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

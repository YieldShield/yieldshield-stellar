# Native feature rollout

This release adds three distinct funded receipt assets: ysALPHA and ysBETA redeem to project-issued TESTUSD; ysNEST redeems to ysALPHA. Each has a distinct onchain identity, independent vault balances, its own funded exchange inventory, and a default public-provider protection pool. A pinned factory creates additional pools for these exact asset/backing pairs with bounded collateral, gain-fee and time terms.

New routes include markets/detail, buy/sell, protection, public capital provision, all-pool portfolio, partial/full exits, native ownership transfer, maturity-credit claim, test funding and direct vault conversion, custom pool creation, creator/protocol/bond claims, a paginated settlement queue, bounded onchain activity, wallet account controls, status, explanatory scenarios and risk terms. Direct navigation is supported by SPA rewrites; pool selection is carried in the URL. Unknown explicit pool identities do not silently select another pool.

The first market implementation remains accessible at `/legacy`. Its manifest, contracts, balances, original evidence and exit flow are preserved. No automatic migration or transfer is implied.

The native design intentionally differs from EVM interfaces: provider ownership is address-bound; pools use a fixed expiry; LP cash entry/exit pauses while holder liabilities remain; receipt principal and fee receipts have separate claims; maturity creates a pull credit. The exchange is funded operator inventory with exact vault NAV quotes and0.3% spread, not an AMM or external asset price. TESTUSD is not Circle USDC. No real lending, RWA, XLM-yield or price-oracle integration is claimed.

All code and documentation were AI-assisted and reviewed through native tests, independent agent source review, actual disposable-account testnet transactions and browser verification. No production funds were used.

## Fixed pool and factory release

The first V3 factory and featured pools (created 11 October 2026, maturing 10 November 2026) cannot be upgraded or migrated. Rebuilt contracts change these rules ([pool and factory reference](../contracts/pool-v3/README.md)):

- Provider fee and receipt claims accrue from per-provider index snapshots, so their sum never exceeds the pool's balance and every claim stays payable.
- A position opens with, and a partial exit leaves, at least 0.01 backing unit of fixed claim. Partial receipt exits remove a rounded-up claim share.
- `positions(owner)` lists at most 100 open positions; transfers into a full index are not listed but never fail.
- The factory allows 50 unmatured pools at once and 5 per creator, keeps every pool in a paged registry, and lists unmatured pools separately. The app lists featured, unmatured and the 25 newest pools.
- Claims, notice cancellation and bond refunds emit events.

`node scripts/deploy-v3.mjs --broadcast --fresh-pools --tag v3.1` deploys the new pool Wasm, a new factory and 30-day featured pools that reuse the existing vaults and exchanges. It writes evidence to `docs/evidence/v3.1`, refuses an existing directory unless `--resume` continues that run, and records the new IDs and hashes in `config/markets.json` (the replaced ones under `previous`) only after an onchain readback and confirmation. `scripts/verify-v3-deployment.mjs` and `scripts/verify-v3.mjs` then use that evidence directory. The previous pools stay onchain and keep their own rules; the app no longer lists them, so their participants exit by direct contract invocation.

# Native feature rollout

This release adds three distinct funded receipt assets: ysALPHA and ysBETA redeem to project-issued TESTUSD; ysNEST redeems to ysALPHA. Each has a distinct onchain identity, independent vault balances, its own funded exchange inventory, and a default public-provider protection pool. A pinned factory creates additional pools for these exact asset/backing pairs with bounded collateral, gain-fee and time terms.

New routes include markets/detail, buy/sell, protection, public capital provision, all-pool portfolio, partial/full exits, native ownership transfer, maturity-credit claim, test funding and direct vault conversion, custom pool creation, creator/protocol/bond claims, a paginated settlement queue, bounded onchain activity, wallet account controls, status, explanatory scenarios and risk terms. Direct navigation is supported by SPA rewrites; pool selection is carried in the URL. Unknown explicit pool identities do not silently select another pool.

The first market implementation remains accessible at `/legacy`. Its manifest, contracts, balances, original evidence and exit flow are preserved. No automatic migration or transfer is implied.

The native design intentionally differs from EVM interfaces: provider ownership is address-bound; pools use a fixed expiry; LP cash entry/exit pauses while holder liabilities remain; receipt principal and fee receipts have separate claims; maturity creates a pull credit. The exchange is funded operator inventory with exact vault NAV quotes and0.3% spread, not an AMM or external asset price. TESTUSD is not Circle USDC. No real lending, RWA, XLM-yield or price-oracle integration is claimed.

All code and documentation were AI-assisted and reviewed through native tests, independent agent source review, actual disposable-account testnet transactions and browser verification. No production funds were used. Grant application files remain unchanged for user review. Root task owns website publication.

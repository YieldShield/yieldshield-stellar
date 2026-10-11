# Funded test receipt trading

Each market exchanges one seven-decimal native demo vault receipt against that vault's exact TESTUSD backing asset. It holds inventory; it cannot mint assets, borrow pool reserves or promise unlimited liquidity. Deploy a separate instance for each allowed vault. These are valueless test assets, not USDC or real investment products.

- `__constructor(backing, vault, operator, fee_bps)` verifies the underlying asset and decimals. The immutable spread is 0–500 basis points; the demo defaults to 30 (0.3%).
- `state()` returns the four constructor values. `inventory()` returns actual `backing` and `receipts` balances.
- `preview_buy(shares)` / `preview_sell(shares)` return total TESTUSD cost / proceeds. They use exact `vault.preview_redeem(shares)`, then round buy cost up after adding the spread and sale proceeds down after deducting it. A zero-valued or zero-output quote is rejected. These are receipt NAV trades, not spot-market oracle prices.
- `buy(owner, shares, max_pay, deadline)` purchases an exact receipt amount. `sell(owner, shares, min_out, deadline)` sells that amount. The authenticated owner authorizes positive limits, raw integer amounts and Unix-second deadlines. Execution reads fresh vault value and available inventory; price changes or depleted inventory revert atomically. A preview is not a reserved trade.
- `fund(owner, backing_amount, receipt_amount)` transfers authenticated donations, not LP shares. At least one quantity must be positive. **Only the operator controls inventory withdrawal, including donations and spread revenue**, using `withdraw(recipient, backing_amount, receipt_amount)`. This is a managed demonstration exchange, separate from the public protection pool providers.

Frontends must review the selected market, asset, direction, owner, amount, included fee and exact maximum payment/minimum proceeds before requesting authorization. A confirmed purchase leaves receipts unprotected; protection is a separate transaction. Inventory can be withdrawn by the operator, so a previously available quote can fail.

Tests exercise real buy/sell transfers and conservation, changed NAV, deadlines and limits, depleted inventory, missing trader assets, conservative rounding, zero NAV, authorization, mismatched backing, excessive fees and two distinct native markets.

# Legacy pool safety boundaries

These notes cover the original single-sponsor vault and pool (`contracts/vault`, `contracts/pool`), which the website still serves at `/legacy`. The public markets use the multi-provider pool and factory described in [pool-v3/README.md](pool-v3/README.md), and the funded exchange in [market/README.md](market/README.md).

This is a funded, valueless TESTUSD demonstrator. The vault administrator can simulate loss by removing test assets. There is one reserve sponsor, no production underwriting, no audit claim, and no XLM investment product.

## Quote protection

Vault `deposit(from, amount, min_shares, deadline)` and `redeem(from, shares, min_assets, deadline)` bind the caller's acceptable result. Pool `protect(owner, shares, min_claim, deadline)` and `exit(id, backing_exit, min_out, deadline)` do the same. Amounts are integer raw units; timestamps are Unix seconds. Deposit and protection minima must be positive. Exit/redeem minima may be zero when explicitly accepting a total-loss position. Expired or adverse quotes revert atomically.

Use `preview_deposit`, `preview_redeem`, and `preview_exit` immediately before preparing a transaction. A quote is not a guaranteed output. A minimum output and transaction deadline must still be authorized. The backing exit does not call the vault valuation function.

## Receipt conversion

With asset balance A and actual share supply S, deposits mint `floor(amount × (S + 1) / (A + 1))`; redemption returns `floor(shares × (A + 1) / (S + 1))`. One raw virtual asset and share reduce the initial-donation attack and preserve initial 1:1 amounts at seven decimals. They are not minted or withdrawable. Rounding may leave residual test assets. The virtual offset is not a substitute for minimum outputs, adequate initial liquidity, economic analysis, or independent review. Deposits into a nonempty but completely insolvent vault revert; existing holders can explicitly redeem at zero.

The pool records its backing claim using the exact receipt redemption preview, avoiding a second rounding through a per-share NAV. Its receipt-exit fee is 10% of positive redeemable-value gains, converted to receipts with integer rounding down. Fixed backing exits surrender all receipts. Capacity reserves the complete fixed claim plus a 50% buffer. The sponsor alone owns unreserved backing and earned/acquired receipts, so there is no multi-provider NAV trading.

Positions have no maximum maturity. A holder who never exits can reserve sponsor capital indefinitely; the 60-second minimum delay is not a sponsor withdrawal promise. Sponsor funds must be voluntarily committed on that basis. A future multi-provider design requires separate pricing, maturity and liquidity work.

## Events and tests

The receipt token publishes standard legacy SEP-41 transfer/approve/burn data shapes and mint notifications. Pool funding, opening, closing and sponsor withdrawals have indexed events. Tests cover changed quotes, expiry, donation rounding, zero assets, conservation of reserved funds, authorization and event shape. Mutations extend contract instances and written persistent records toward 1,000,000 ledgers when below 250,000, capped by the network maximum (roughly 58 days at five seconds per ledger). Position reads also extend that record. Deployment separately extends the installed code. Soroban storage can still require archival restoration; TTL extension is not permanent retention.

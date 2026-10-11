# Token integration decisions

Verified 11 October 2026. The active testnet application uses TESTUSD and its funded ysvUSD receipt only. The research catalog is not an activation list.

## Why this version is native to Stellar

`TESTUSD` is a classic issued asset with a Stellar Asset Contract. Wallets explicitly trust its named issuer. The new vault produces transferable Soroban receipts; the protection pool takes those receipts and reserves a separate TESTUSD balance for each recorded payout. XLM pays transaction fees and account reserves only. The release does not launch a protocol token or offer XLM interest/directional-XLM protection.

This provides an honest, reproducible accounting fixture without misrepresenting a third-party stablecoin, adding an unverified investment strategy, or implying that a receipt's ticker establishes redemption value.

## USDC: practical next underlying

Circle's [current address registry](https://developers.circle.com/stablecoins/usdc-contract-addresses) identifies Stellar mainnet issuer `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` and testnet issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, both for asset code `USDC`. `config/asset-research.json` records independently derived SAC addresses, Horizon issuer flags and whether the testnet executable was verified as the built-in SAC. This is not a claim of Circle partnership or approval.

Implementation sequence:

1. Derive the network-specific SAC from code plus issuer; verify the executable and asset metadata against Circle's registry. Do not treat mutable SAC admin identity alone as provenance.
2. Test issuer flags, trustline authorization/revocation, interrupted transfers and recipient eligibility. The same ticker from another issuer must fail asset selection.
3. Create a new immutable vault/pool deployment pinned to that SAC; never silently switch the existing TESTUSD pool's underlying.
4. Obtain official test USDC through supported channels and repeat minimum-output, funded redemption, trustline and loss-exit tests before any mainnet decision.
5. Keep independent backing outside the protected strategy. A backing reserve invested into the same credit risk would undermine the separation the product is trying to demonstrate.

## Blend: a wrapper, not an ERC-20-style bToken adapter

Blend's [protocol-token documentation](https://docs.blend.capital/tech-docs/core-contracts/lending-pool/protocol-tokens) makes its bTokens nontransferable internal accounting, scoped to one pool and reserve. A direct depositable bToken adapter would therefore be incorrect. A future wrapper must itself own a named USDC lending position and issue a separate, transferable receipt.

For a bounded lending wrapper, the proposed integration uses the pool's uncollateralized supply/withdraw request paths and does not borrow, collateralize or add leverage. [Blend's request model](https://docs.blend.capital/tech-docs/core-contracts/lending-pool/fund-management) supports atomic request submission and explicit authorizations. Its [lending documentation](https://docs.blend.capital/users/lending-borrowing/lending) makes withdrawals dependent on available liquidity.

Required adapter semantics include pool/reserve identity, USDC identity, current bRate/accounting value, available withdrawal liquidity, pool status, outstanding deficits and observed redemption amounts. Accrued bRate is not a guarantee of realizable NAV. On insufficient liquidity or inconsistent valuation the adapter must fail closed for new coverage; existing exit behavior needs a deliberately designed, audited resolution policy. Do not promise instant redemptions or cover unlimited strategy losses.

No Blend calls or third-party deposits are active in this release. Selecting an actual pool, threat-modeling its administrative and liquidation controls, and implementing a tested wrapper are future grant milestones.

## RWA assets and economics

Tokenized Treasury or receivable assets need a separate integration, not a symbol change. Confirm allowed holders, transfers to contracts, redemption schedule, NAV update policy, custody/issuer risks and observable failure states. A daily NAV cannot be treated as an executable withdrawal quote.

The prototype's donated gains and administrator-triggered loss are explicitly synthetic, while its asset balances and token transfers are real on testnet. A market-ready pool also needs reviewed premiums/fees, coverage terms and sponsor economics. The current fixed entry payout with no recurring premium is a demonstration, not a commercially proven underwriting model.

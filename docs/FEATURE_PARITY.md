# Stellar workflow parity

Comparison date: 11 October 2026. Reference: the working Base, BNB and current Monad applications, including their market, trading, protection, provider and position journeys. Public release identity and screenshots are recorded in [HOSTING.md](HOSTING.md).

## Implemented workflows

| Workflow | Stellar implementation |
|---|---|
| Discover and inspect markets | `/markets`, `/markets/:pool`; native factory registry, three funded asset/backing pairs, community pools and public terms |
| Protect a receipt | `/protect`; current redemption value, fixed backing claim, exact seven-decimal limits, maturity and fee review |
| Provide capital | `/provide`; public provider shares, withdrawal notice/cancel, partial backing withdrawal, separate fee and acquired-receipt claims |
| Manage positions | `/positions`, `/positions/:id`; all registered pools, on-chain ownership discovery, partial/full receipt or backing exits, transfer, maturity settlement and pull claims |
| Trade and convert | `/trade`, `/assets`; independently funded buy/sell inventory, 0.3% exchange fee, signed limits/deadlines, direct and nested vault deposit/redeem |
| Create a pool | `/create-pool`; approved vault pairs, bounded terms, atomic deployment, registry discovery and continuation to fund the created pool |
| Recover fees and bonds | Pool details; separate creator/protocol gain fees and matured factory bond refund; permissionless settlement queue on the provider page |
| Fund a journey | `/faucet`, `/assets`; Friendbot, exact TESTUSD issuer/trustline, token faucet and backing acquisition; role, pool and amount retained on return |
| Account and activity | `/account`, `/activity`; reconnect/disconnect and bounded native contract events with transaction links |
| Explain and inspect | `/status`, `/how-it-works`, `/learn/scenarios`, `/legal`; native identities, readiness/errors, scenarios and disclosed economics |
| Preserve earlier positions | `/legacy`; the earlier deployed vault and pool remain accessible independently of the new native markets |

The funded native pairs are `ysALPHA / TESTUSD`, `ysBETA / TESTUSD`, and `ysNEST / ysALPHA`. They have distinct on-chain vault, pool and exchange identities. XLM pays network fees and account reserves; it is not the vault yield asset. TESTUSD is a project test asset, not Circle USDC; none of these receipts represents a live Blend strategy.

## Deliberate native differences

- Pools use bounded fixed epochs. At maturity the remaining receipt is surrendered for the fixed backing claim, including any remaining upside. Provider entry and cash withdrawal freeze while holder liabilities remain.
- Permissionless settlement records backing credits independently of a recipient's ability to accept payment, allowing providers to release settled exposure without taking holder claims.
- Holder rights transfer through native contract methods. Provider shares remain address-bound accounting balances, not transferable junior NFTs.
- Partial exits use exited-slice gain-fee accounting and retain original timing. Acquired receipt principal and gain-fee rewards have separate accounting and claim controls.
- Creation locks a refundable 10 TESTUSD factory bond. It does not supply the pool's backing. The creator funds the new pool separately.
- The nested pair fixes a number of Alpha receipt units, not dollars. Both vault redemption layers and disclosed demo-admin powers matter to its value.
- Activity is a bounded RPC event view, not a complete historical indexer. Registry and ownership history have explicit demo bounds. Contract storage needs monitoring and eventual restoration/extension; testnet may reset.

## Verification boundary

Native deployment and signed transaction evidence is stored under `docs/evidence/v3/`. Featured markets are funded separately from the short-lived lifecycle proof pool, preserving usable provider entry in the featured markets.

Browser acceptance covered deployed market reads, dedicated protection/provider pages, buy/sell and conversion controls, account recovery without Freighter, exact funding return context, invalid-pool rejection, direct routes and desktop/mobile navigation. Scripted testnet signing is separate evidence; actual browser-extension signing is not claimed as tested.

Both grant applications remain held for user review. Existing application drafts describe the earlier release and must be reconciled with this expanded implementation before any future submission.

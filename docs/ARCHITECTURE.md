# YieldShield Stellar — native proof and funded integration plan

Research date: 11 October 2026. This is an unaudited testnet proof, not a mainnet launch.

## Product boundary

This independent Rust/Soroban implementation demonstrates funded TESTUSD vault-receipt exposure with two exits: return the remaining vault receipts, paying the junior reserve a share of positive gains, or surrender all vault receipts for a fixed, fully reserved TESTUSD payout. There is no recurring premium, native XLM yield, promised return, protocol token, or guarantee outside the contract's bounded backing assets.

The initial pool has one named first-loss reserve sponsor. This deliberate MVP boundary avoids representing a new multi-provider share-accounting system as production-ready. The sponsor supplies the pool's test backing and receives acquired vault receipts and gain-sharing fees. Public participants can create and exit protected positions. A later funded milestone introduces independently reviewed multi-provider accounting.

The pool protects a native Soroban vault receipt (ysvUSD) whose assets are YieldShield-issued TESTUSD. Backing uses the same explicitly YieldShield-issued classic TESTUSD asset and its SAC. TESTUSD has no dollar redemption, no relationship to Circle USDC and no real value. Both tokens use seven decimal places. New protection reserves 100% of the recorded claim plus a 50% buffer. The sponsor cannot remove reserved backing or users' vault receipts; free backing and earned/acquired receipts are tracked separately. There is a 60-second exit delay. There is no administrative pool asset sweep or upgrade entrypoint.

The vault accepts actual test assets and issues/redeems receipts against its current assets-per-share. Donations simulate gains by adding funded TESTUSD. An administrator-only `simulate_loss` transfers test assets out of this explicitly experimental vault to demonstrate loss; this is a disclosed testing control, not a production vault or real strategy. Pool entry quotes and gain-sharing read the vault's actual assets-per-share. TESTUSD is the unit of account, not a market USD oracle. This proves funded accounting and lifecycle behavior; it does not establish production strategy safety or economically sound protection pricing. The absence of premiums makes the proof intentionally unsuitable for real-asset protection underwriting. Native XLM is used only for transaction fees and account reserves.

## Native differences

Stellar classic assets are identified by code AND issuer. Wallets need an appropriate trustline before receiving issued backing. SAC interaction directly uses classic balances; no bridge is involved. XLM also pays account reserves and transaction fees, and the frontend explains that wallets need test XLM for these costs. Authorizations use Soroban `Address.require_auth` and Freighter transaction signing on the Test SDF Network only. Stored positions are persistent Soroban entries with explicit TTL renewal. State archival and permissionless restoration are operational concerns, not solved by pretending state never expires.

## Integration decision

| Candidate                           | Decision                                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native XLM                          | Transaction fees and account reserves only. No directional payoff or XLM-yield product.                                                                                                                                                        |
| YieldShield TESTUSD SAC             | Active demonstrator backing with named issuer and no redemption claim.                                                                                                                                                                         |
| Circle-issued USDC SAC              | Next integration candidate after verified-issuer research is followed by trustline/authorization tests and strategy/liquidity analysis. Do not create a fake USDC issuer.                                                                      |
| Blend lending positions             | Research milestone only. bTokens are nontransferable internal accounting, not SEP-41 depositable assets. Any future wrapper must own a pool-specific lending position and validate withdrawal liquidity; bRate is not proof of realizable NAV. |
| Tokenized Treasury/RWA assets       | Deferred: issuer permissions, transfer restrictions and redemption timelines must be supported; a USD label is not a redeemability proof.                                                                                                      |
| YieldShield governance/reward token | Not needed for this grant or proof. No token launch.                                                                                                                                                                                           |

## SCF proposal boundary

Recommend SCF Open Track interest screening first. Suggested future request: $60,000 over 12 weeks, subject to team capacity confirmation and program review. Today’s prototype is prior work, not a reimbursement request. Proposed future deliverables: $20k native reserve accounting and security hardening; $20k verified USDC and strategy valuation adapters plus failure tests; $20k accessible wallet/pilot tooling and open-source integration documentation. Independent audits belong to the separate Audit Bank rather than this budget. No legal, marketing, giveaway or speculative-token budget is included. All code and documents are AI-assisted and need human review before real assets. Source publication is planned following owner review; initial repository is private.

## Grant policy correction

The first research commit considered protected XLM exposure. Before implementation, official SCF rules §3 revealed restrictions on causing/incentivizing XLM short selling as well as XLM-yield promotion. The active design therefore uses non-XLM strategy risk and XLM solely for network costs. This is a documented scope correction, not an active legacy deployment.

## Primary sources

- [Stellar smart-contract setup](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup): Rust, wasm32v1-none and CLI.
- [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract): native asset, issuer provenance, trustlines and authorization.
- [Freighter integration](https://developers.stellar.org/docs/build/guides/freighter): wallet authorization and signing.
- [Stellar Community Fund awards](https://communityfund.stellar.org/awards): #46 screening invitation and November 8, 2026 final deadline; final eligibility remains organizer-controlled.

## Provenance

New native implementation, informed by the product behavior documented in YieldShield's existing Monad proof. No Solidity, private keys, environment files or vendor source are copied. The Stellar SDK and Freighter API are installed as normal dependencies. This software is AI-assisted and is not independently audited. The build ledger records separate implementation steps and test/deployment evidence.

- [SCF official rules §3](https://stellar.gitbook.io/scf-handbook/scf-awards/official-rules-for-submissions).
- [Blend protocol tokens](https://docs.blend.capital/tech-docs/core-contracts/lending-pool/protocol-tokens): nontransferable bTokens.

See [token integration decisions](TOKEN_INTEGRATION.md) for exact Circle issuers, SAC derivation evidence and the future nontransferable-Blend-position wrapper design.

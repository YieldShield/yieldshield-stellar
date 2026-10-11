# YieldShield Stellar — native proof and funded integration plan

Research date: 11 October 2026. This is an unaudited testnet proof, not a mainnet launch.

## Product boundary

This independent Rust/Soroban implementation demonstrates XLM exposure with two exits: return the remaining XLM, paying the junior reserve a share of positive gains, or surrender all XLM for a fixed, fully reserved TESTUSD payout. There is no recurring premium, native XLM yield, promised return, protocol token, or guarantee outside the contract's bounded backing assets.

The initial pool has one named first-loss reserve sponsor. This deliberate MVP boundary avoids representing a new multi-provider share-accounting system as production-ready. The sponsor supplies the pool's test backing and receives acquired XLM and gain-sharing fees. Public participants can create and exit protected positions. A later funded milestone introduces independently reviewed multi-provider accounting.

The pool holds the native XLM Stellar Asset Contract (SAC), not a wrapped token minted by YieldShield. Backing uses an explicitly YieldShield-issued TESTUSD classic asset and its SAC. It has no dollar redemption, no relationship to Circle USDC and no real value. Both tokens use seven decimal places. New protection reserves 100% of the recorded claim plus a 50% buffer. The sponsor cannot remove reserved backing or users' XLM; free backing and earned/acquired XLM are tracked separately. There is a 60-second exit delay. There is no administrative asset sweep, upgrade entrypoint, or production oracle claim.

A deterministic onchain demonstration price cycle is used for this test pool. It is not an external XLM price feed. The cycle is public and its phase follows ledger time; both entry quote and gain-sharing use that same price. The backing payout is fixed at entry and does not require the feed to stay available. This fixture proves accounting and lifecycle behavior; it does not establish commercially sound pricing or protect against adversarial trading. Real-price pools require an authenticated external oracle, freshness checks, update bounds, economic review and audit before activation.

## Native differences

Stellar classic assets are identified by code AND issuer. Wallets need an appropriate trustline before receiving issued backing. SAC interaction directly uses classic balances; no bridge is involved. XLM also pays account reserves and transaction fees, so the frontend reserves a wallet balance buffer. Authorizations use Soroban `Address.require_auth` and Freighter transaction signing on the Test SDF Network only. Stored positions are persistent Soroban entries with explicit TTL renewal. State archival and permissionless restoration are operational concerns, not solved by pretending state never expires.

## Integration decision

| Candidate | Decision |
| --- | --- |
| Native XLM SAC | Active testnet protected exposure; never marketed as earning interest or yield. |
| YieldShield TESTUSD SAC | Active demonstrator backing with named issuer and no redemption claim. |
| Circle-issued USDC SAC | Next integration candidate after independent issuer/network verification, trustline/authorization review, liquidity analysis and testing. Do not create a fake USDC issuer. |
| Blend lending receipt/positions | Research milestone only. Validate ownership, withdrawal liquidity, interest accrual and composability directly against protocol interfaces before promising an adapter. |
| Tokenized Treasury/RWA assets | Deferred: issuer permissions, transfer restrictions and redemption timelines must be supported; a USD label is not a redeemability proof. |
| YieldShield governance/reward token | Not needed for this grant or proof. No token launch. |

## SCF proposal boundary

Recommend SCF Open Track interest screening first. Suggested future request: $60,000 over 12 weeks, subject to team capacity confirmation and program review. Today’s prototype is prior work, not a reimbursement request. Proposed future deliverables: $20k native reserve accounting and security hardening; $20k verified USDC and external-oracle adapters plus failure tests; $20k accessible wallet/pilot tooling and open-source integration documentation. Independent audits belong to the separate Audit Bank rather than this budget. No legal, marketing, giveaway or speculative-token budget is included. All code and documents are AI-assisted and need human review before real assets. Source publication is planned following owner review; initial repository is private.

## Primary sources

- [Stellar smart-contract setup](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup): Rust, wasm32v1-none and CLI.
- [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract): native asset, issuer provenance, trustlines and authorization.
- [Freighter integration](https://developers.stellar.org/docs/build/guides/freighter): wallet authorization and signing.
- [Stellar Community Fund awards](https://communityfund.stellar.org/awards): #46 screening invitation and November 8, 2026 final deadline; final eligibility remains organizer-controlled.

## Provenance

New native implementation, informed by the product behavior documented in YieldShield's existing Monad proof. No Solidity, private keys, environment files or vendor source are copied. The Stellar SDK and Freighter API are installed as normal dependencies. This software is AI-assisted and is not independently audited. The build ledger records separate implementation steps and test/deployment evidence.

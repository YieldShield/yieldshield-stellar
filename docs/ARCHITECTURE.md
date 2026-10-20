# YieldShield Stellar — native proof and funded integration plan

Updated 20 October 2026 to describe the current multi-provider release. Initial integration research: 11 October 2026. This is an unaudited testnet proof, not a mainnet launch.

## Product boundary

This independent Rust/Soroban implementation demonstrates funded vault-receipt exposure with two exits: return the remaining vault receipts, paying fees on positive gains, or surrender receipts for a fixed claim in the selected backing asset. Both exits can be partial. There is no recurring premium, native XLM yield, promised return, protocol token, or guarantee outside the contract's bounded backing assets.

The current release has a permissionless factory and multi-provider pools. Providers hold address-bound shares of reserve cash and separately accrue gain-fee receipts and acquired receipt inventory. Provider cash entry and withdrawal pause while any holder position is open; withdrawal also requires notice. The factory pins permitted vaults and bounded terms, registers pools and escrows a refundable creation bond. This accounting is already implemented and must not be billed as new grant work. It remains unaudited. The initial single-sponsor design is available only through `/legacy`.

The featured ysALPHA and ysBETA vaults hold YieldShield-issued classic TESTUSD through its Stellar Asset Contract. The ysNEST vault holds ysALPHA receipts, so its pool's fixed claims are in ysALPHA units, not TESTUSD or dollars. TESTUSD has no dollar redemption, no relationship to Circle USDC and no real value. These assets use seven decimal places. Featured pools reserve 100% of the recorded claim plus a 50% buffer. Reserved backing, provider cash, fee receipts and acquired receipts are accounted for separately. There is a 60-second exit delay. At maturity, permissionless settlement creates segregated backing credit that the holder claims separately; the remaining receipts go to providers. There is no administrative pool asset sweep or upgrade entrypoint. See the [pool and factory specification](../contracts/pool-v3/README.md) for exact constraints.

The vault accepts actual test assets and issues/redeems receipts against its current assets-per-share. Donations simulate gains by adding funded TESTUSD. An administrator-only `simulate_loss` transfers test assets out of this explicitly experimental vault to demonstrate loss; this is a disclosed testing control, not a production vault or real strategy. Pool entry quotes and gain-sharing read the vault's actual assets-per-share. Each pool uses its backing token as the unit of account, not a market USD oracle. This proves funded accounting and lifecycle behavior; it does not establish production strategy safety or economically sound protection pricing. The absence of premiums makes the proof intentionally unsuitable for real-asset protection underwriting. Native XLM is used only for transaction fees and account reserves.

## Native differences

Stellar classic assets are identified by code AND issuer. Wallets need an appropriate trustline before receiving issued backing. SAC interaction directly uses classic balances; no bridge is involved. XLM also pays account reserves and transaction fees, and the frontend explains that wallets need test XLM for these costs. Authorizations use Soroban `Address.require_auth` and Freighter transaction signing on the Test SDF Network only. Stored positions are persistent Soroban entries with explicit TTL renewal. State archival and permissionless restoration are operational concerns, not solved by pretending state never expires.

## Integration decision

| Candidate                           | Decision                                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native XLM                          | Transaction fees and account reserves only. No directional payoff or XLM-yield product.                                                                                                                                                        |
| YieldShield TESTUSD SAC             | Active backing for Alpha and Beta; the nested market uses ysALPHA receipt backing. TESTUSD has a named issuer and no currency redemption claim.                                                                                                      |
| Circle-issued USDC SAC              | Next integration candidate after verified-issuer research is followed by trustline/authorization tests and strategy/liquidity analysis. Do not create a fake USDC issuer.                                                                      |
| Blend lending positions             | Proposed future integration; no Blend deposits are active. bTokens are nontransferable internal accounting, not SEP-41 depositable assets. A wrapper must own a pool-specific lending position and validate withdrawal liquidity; bRate is not proof of realizable NAV. |
| Tokenized Treasury/RWA assets       | Deferred: issuer permissions, transfer restrictions and redemption timelines must be supported; a USD label is not a redeemability proof.                                                                                                      |
| YieldShield governance/reward token | Not needed for this proof. No token launch.                                                                                                                                                                                           |

## Grant policy correction

The first research commit considered protected XLM exposure. Before implementation, official SCF rules §3 revealed restrictions on causing/incentivizing XLM short selling as well as XLM-yield promotion. The active design therefore uses non-XLM strategy risk and XLM solely for network costs. This is a documented scope correction, not an active legacy deployment.

## Primary sources

- [Stellar smart-contract setup](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup): Rust, wasm32v1-none and CLI.
- [Stellar Asset Contract](https://developers.stellar.org/docs/tokens/stellar-asset-contract): native asset, issuer provenance, trustlines and authorization.
- [Freighter integration](https://developers.stellar.org/docs/build/guides/freighter): wallet authorization and signing.
- [Stellar Community Fund awards](https://communityfund.stellar.org/awards): program information. The authenticated round selector gives 8 November 2026, while YieldShield's 19 October invitation gives 9 November EOD. Plan against the earlier date pending SCF confirmation of the cutoff and timezone. The invitation is not an award.

## Proposed USDC release architecture

This section describes future work for the SCF #46 proposal. No USDC or Blend integration is active in the current release. The selected lending version, pool contract, reserve and network-specific asset identities must be pinned and verified before submission; the design is not build-ready until those choices and the valuation rules below are resolved.

```text
Wallet -> reviewed and simulated Soroban transaction -> contract authorization
USDC SAC -> lending wrapper -> transferable Soroban receipt -> holder pool
Separately funded USDC reserve -----------------------------> holder pool
Holder pool -> receipt exit OR fixed USDC backing exit
Maturity -> segregated USDC credit + provider receipt inventory
Read-only monitoring -> reserves, credits, strategy state/liquidity and TTL
```

**Asset and strategy boundary.** A new immutable deployment pins Circle's USDC code/issuer/SAC for its network and one lending pool's USDC reserve. The wrapper owns an uncollateralized supply position and does not borrow, use collateral or add leverage. It issues transferable receipts rather than representing Blend's non-transferable bTokens as depositable tokens. Provider USDC remains outside that strategy. The TESTUSD stack and historical exits keep their existing asset identities.

**Valuation and admission.** The wrapper needs the vault-facing receipt functions used by the pool and a separate admission quote/eligibility check for the proposed pool release. Admission checks must establish reserve identity, conservative strategy value, current pool status, deficits and executable liquidity. Accounting bRate is an input, not a guaranteed redemption price. Use exact seven-decimal arithmetic, conservative rounding and minimum-output checks. No new protection is allowed when required inputs are unavailable or inconsistent.

**Exit independence.** The current pool reads `preview_redeem` when computing positive-gain receipt-exit fees (`contracts/pool-v3/src/lib.rs`, `outputs`). Reverting that read whenever withdrawal liquidity is short would block the receipt exit as well as admission. The new integration must distinguish accounting valuation, admission eligibility and executable redemption. A holder's backing exit must not require withdrawing from the strategy. Returning a receipt cannot promise immediate USDC redemption; providers can acquire impaired or illiquid receipts. The fee policy for unavailable valuation and the recognition of strategy losses must be explicitly specified and reviewed before implementation, rather than silently assuming stale NAV is valid.

**Controls and operations.** The proposed official release starts with one reviewed strategy and contract-enforced limits, with proposed ceilings of 10,000 USDC in aggregate outstanding holder claims and 1,000 USDC per position. These controls are future work, not existing prototype limits. Monitor cash versus liquidity and segregated credits, outstanding reserves, strategy liquidity/status, issuer restrictions and storage lifetime. Alerts have named owners and restoration/incident procedures. Monitoring does not authorize transfers or replace contract checks. Real wallet-extension flows must verify issuer identity, network, minimum output, transaction outcome and post-transaction balances.

**Release prerequisites.** Independent security and economic review, appropriate legal review, separately funded reserve capital, verified deployment identities and operational ownership are prerequisites for a capped mainnet launch. The strategy, supply-side pricing and loss/illiquidity policies are unresolved design gates, not claims of existing safety. Existing factory/provider accounting and renewal scripts are already built and are excluded from new grant billing. A fully liquid USDC vault is a different scope from a lending wrapper; changing to it requires a revised proposal or SCF-agreed milestone change.

## Provenance

New native implementation, informed by the product behavior documented in YieldShield's existing Monad proof. No Solidity, private keys, environment files or vendor source are copied. The Stellar SDK and Freighter API are installed as normal dependencies. This software is AI-assisted and is not independently audited. The build ledger records separate implementation steps and test/deployment evidence.

- [SCF official rules §3](https://stellar.gitbook.io/scf-handbook/scf-awards/official-rules-for-submissions).
- [Blend protocol tokens](https://docs.blend.capital/tech-docs/core-contracts/lending-pool/protocol-tokens): nontransferable bTokens.

See [token integration decisions](TOKEN_INTEGRATION.md) for exact Circle issuers, SAC derivation evidence and the future nontransferable-Blend-position wrapper design.

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

This section describes proposed future work for SCF #46. No USDC or Blend integration is active in the current release. The reference integration is **Blend Fixed v2.1, USDC reserve index 1**, identified below through public ledger reads on 20 October. This pins an engineering target; it is not a claim of partnership, investment suitability or production approval. Independent security, economic and legal review remain launch prerequisites.

```text
Wallet -> reviewed and simulated Soroban transaction -> contract authorization
USDC SAC -> lending wrapper -> transferable Soroban receipt -> holder pool
Separately funded USDC reserve -----------------------------> holder pool
Holder pool -> receipt exit OR fixed USDC backing exit
Maturity -> segregated USDC credit + provider receipt inventory
Read-only monitoring -> reserves, credits, strategy state/liquidity and TTL
```

**Asset and strategy boundary.** A new immutable deployment pins Circle's USDC code/issuer/SAC for its network and one lending pool's USDC reserve. The wrapper owns an uncollateralized supply position and does not borrow, use collateral or add leverage. It issues transferable receipts rather than representing Blend's non-transferable bTokens as depositable tokens. Provider USDC remains outside that strategy. The TESTUSD stack and historical exits keep their existing asset identities.

**Valuation and admission.** The wrapper exposes transferable receipt balances and transfers, `asset`, `deposit`, `redeem` and accounting `preview_redeem`, plus a separate coverage-admission quote used by a new pool release. Accounting assets are idle USDC plus the wrapper's uncollateralized bToken supply multiplied by the current reserve bRate, rounded down using Blend's 12-decimal rate scale. No BLND emissions or oracle USD price enters that figure. Proposed share math uses one raw virtual asset and one raw virtual share: mint `floor(observed_added_assets * (supply + 1) / (assets_before + 1))`, and preview redemption `floor(shares * (assets + 1) / (supply + 1))`. Both tokens retain seven decimals. Deposits require at least one USDC, checked integer math and a positive caller-specified minimum receipt output; adversarial donation and first-depositor cases must pass the tranche-1 tests. Redemption uses minimum USDC output and burns receipts only if the underlying withdrawal and payout succeed atomically. The wrapper never borrows, collateralizes deposits or uses flash loans.

The proposed admission rule accepts pool statuses 0/1 only, an enabled seven-decimal USDC reserve at the pinned index, matching asset/pool identities, current readable valuation, no recorded USDC liabilities in the pool backstop's positions, and sufficient current withdrawal capacity for the admitted receipt amount. Withdrawal capacity must account for Blend's utilization constraints and backstop credit; a raw token balance is not enough. Check these conditions within the protection transaction, then reserve separate USDC at 150% of the admitted claim. Unavailable or inconsistent inputs reject new protection. Current liquidity is not a promise of future redeemability, and these checks cannot eliminate credit losses or unrecorded deficits.

**Exit independence.** The current pool reads `preview_redeem` for positive-gain receipt-exit fees (`contracts/pool-v3/src/lib.rs`, `outputs`). The new pool must not use admission eligibility or executable liquidity to gate an existing holder's exit. Accounting valuation recognizes a reduction in bRate when Blend socializes a loss; it does not invent an earlier price for unresolved bad debt. If current accounting valuation cannot be read, the proposed failure policy returns the holder's receipt slice with zero gain fees and emits a valuation-unavailable event. It never substitutes stale NAV or creates a later fee debt. This deliberately gives up fees to preserve the receipt exit and needs independent review for fee-avoidance abuse. Backing exit and maturity settlement use the recorded claim and separately reserved USDC without any Blend withdrawal or valuation call. Transferring a wrapper receipt does not call Blend. Direct wrapper redemption may fail for short liquidity without burning shares; receipt holders and providers can therefore continue to own impaired or illiquid receipts.

**Controls and operations.** The first official USDC release is one wrapper and one protection pool, so its contract can enforce both a 10,000-USDC aggregate outstanding-claim ceiling and a 1,000-USDC position ceiling without cross-pool cap ambiguity. Additional official USDC pools are outside this first release and require a shared cap design before being listed. Other permissionless deployments are not represented as covered by the official release's aggregate ceiling. These controls are future work, not existing prototype limits. Monitor cash versus liquidity and segregated credits, outstanding reserves, strategy liquidity/status, issuer restrictions and storage lifetime. Release verification pins external code hashes; alerts flag identity/configuration changes. Real wallet flows must check issuer, network, minimum output, transaction result and balances. Monitoring does not authorize transfers or replace contract checks.

### Pinned reference deployment and reproducible evidence

At mainnet ledger **65041476**, Fixed v2.1 reported Active status 1 and an enabled USDC reserve. The older FixedV2 and YieldBloxV2 deployments both reported On-Ice status 3 and are excluded from this proposal's reference deployment. Status and liquidity are observations that must be rechecked before deployment, not guarantees.

| Identity | Selected value |
| --- | --- |
| Mainnet pool | `CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO` — Fixed v2.1 |
| Mainnet USDC | Code `USDC`, issuer `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| Mainnet SAC | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75`; built-in SAC executable verified |
| USDC reserve | Index `1`, seven decimals |
| Observed pool Wasm | `a41fc53d6753b6c04eb15b021c55052366a4c8e0e21bc72700f461264ec1350e` |
| v2.1 backstop | `CCS4AZ5ORM6VLLPJTJUFRNXWBMHOO3L5WHHRPL2ZMILE35ZDMQFHOQMJ`, per Blend's deployment registry |
| v2.1 factory | `CACUXRNBUFV7BFPKUDLVJFQI6H7EHHNSJPOFJSCWJCYUUYMORM6C63AL`, per Blend's deployment registry |
| Observed oracle | `CCVTVW2CVA7JLH4ROQGP3CU4T3EXVCK66AZGSM4MUQPXAI4QHCZPOATS` |
| Observed admin | `CDGQFAOSQXRZEEVAXL4CIWNJZJINYOHYRGFRUCWSNIMW2LBOVLUC3CPK` |
| Circle Testnet USDC | Issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`; SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

The [read-only evidence](evidence/scf46/blend-readiness-2026-10-20.json) records RPC networks, ledger numbers, pool/reserve settings and deployed executables. Discovery used Blend's official market UI; verification used unsigned public RPC simulations. No user wallet, deposit or mainnet transaction was used. The observed Wasm matches the published lending-pool artifact in Blend's Testnet manifest; this is an artifact-hash comparison, not a fresh reproducible-source build or a security audit.

**Test environment.** Blend's shared TestnetV2 pool `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` uses mock USDC `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU` at index 3. It does not contain Circle's Testnet SAC. Tranche 1 must implement an isolated Blend fixture with the pinned lending-pool artifact and an actual Circle Testnet-USDC reserve, recording all new IDs and configuration. Native adversarial fixtures cover short liquidity, bad debt/socialization, unreadable NAV, partial exits, fees, rounding, issuer restrictions and authorization failures. Mock assets may support adversarial fixtures but cannot satisfy the official test-USDC transfer journey. This is implementation of a specified fixture, not a research milestone or a claim that the new deployment already exists.

**Release prerequisites.** Independent security and economic review, appropriate legal review, separately funded reserve capital, verified deployment identities and operational ownership are prerequisites for a capped mainnet launch. The proposed failure policy and fee-only provider economics are not independently validated; publishing a design does not establish safety or commercial viability. Existing factory/provider accounting and renewal scripts are already built and excluded from new grant billing. A fully liquid USDC vault is a different scope from this lending wrapper and requires a revised proposal or SCF-agreed milestone change.

## Provenance

New native implementation, informed by the product behavior documented in YieldShield's existing Monad proof. No Solidity, private keys, environment files or vendor source are copied. The Stellar SDK and Freighter API are installed as normal dependencies. This software is AI-assisted and is not independently audited. The build ledger records separate implementation steps and test/deployment evidence.

- [SCF official rules §3](https://stellar.gitbook.io/scf-handbook/scf-awards/official-rules-for-submissions).
- [Blend protocol tokens](https://docs.blend.capital/tech-docs/core-contracts/lending-pool/protocol-tokens): nontransferable bTokens.

See [token integration decisions](TOKEN_INTEGRATION.md) for exact Circle issuers, SAC derivation evidence and the future nontransferable-Blend-position wrapper design.

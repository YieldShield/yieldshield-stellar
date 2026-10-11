# YieldShield Stellar

A native Soroban proof of split-risk protection for funded vault receipts. The demo pairs a transferable TESTUSD vault receipt with a separately funded TESTUSD reserve and two exit choices. Native XLM only pays transaction fees and account reserves.

**Testnet only.** TESTUSD is issued for this demonstration and is not Circle USDC. It has no monetary value or dollar redemption. This AI-assisted implementation is unaudited. It does not promise returns or real-asset protection.

## What is implemented

- Native Rust/Soroban vault, protection pool and prefunded test-token faucet.
- Actual test-asset deposit and redemption, with transferable seven-decimal receipts.
- A fixed backing claim reserved at entry with a 50% additional buffer.
- Receipt exit with 10% of positive realized gains paid to the reserve sponsor in receipts; or backing exit surrendering all receipts for the recorded TESTUSD amount.
- A 60-second exit delay, caller minimum-output bounds and transaction deadlines.
- Freighter connection, explicit TESTUSD trustline onboarding, live contract reads, deposit/protect/redeem/exit flows, transaction recovery links and position lookup.
- Native lifecycle/security regression tests and public testnet receipt verification.

The reserve has **one named sponsor**, who cannot withdraw backing reserved for open positions or receipts belonging to users. Positions have no forced expiry, so the sponsor accepts an indefinite reserve commitment until users exit. The vault's administrator can simulate loss by removing test assets. Gains are funded donations, not a live lending strategy. There is no recurring premium or protocol-token launch.

## Run

Use Node 24+, Rust 1.99 with `wasm32v1-none`, and Stellar CLI 28.1.0.

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run dev
cargo test --workspace
stellar contract build
```

The web build emits `dist` and requires no server or private environment variables. The current public issuer and contract IDs are in [config/testnet.json](config/testnet.json). [Operations](docs/OPERATIONS.md) explains wallet onboarding, testnet deployment, storage lifetime and evidence scripts. Do not copy signer files into a deployment.

## Research and grant scope

- [Architecture and policy decisions](docs/ARCHITECTURE.md)
- [Token integration: verified USDC issuers and future Blend wrapper](docs/TOKEN_INTEGRATION.md)
- [Native contract math and safety boundaries](contracts/README.md)
- [Release evidence and validation boundaries](docs/RELEASE.md)
- [Build ledger](docs/BUILD_LEDGER.md)
- [Testnet lifecycle evidence](docs/evidence/lifecycle.json)

SCF #46 interest screening and any later application concern **future work**: hardened reserve accounting, verified USDC/strategy adapters and pilot tooling. Today's proof is not a reimbursement request. Independent audit funding belongs to the separate Audit Bank. A public source release and license need owner review; the initial repository is private. No partnership, award, audited status, mainnet readiness or customer traction is claimed.

This project is a new native implementation informed by YieldShield's earlier EVM product behavior. It does not copy Solidity, signers, private environment files or vendor source. All code and documentation are AI-assisted and need human review before handling real assets.

# End-to-end verification

Date: 11 October 2026.

## Scope and environment

The test follows fresh-wallet funding, asset acquisition, protection, position management, capital provision, claims and market creation through the application, checking confirmed ledger results rather than treating a signature as success.

Signed browser transactions use the production application's Stellar SDK and Freighter API message boundary with a separate localhost-only test adapter. Disposable keys stay on the local server; signing is restricted to Testnet, known accounts, approved contracts/methods, the project TESTUSD trustline, a short deadline and a capped test-XLM fee. The browser profile has no Freighter extension. The adapter is absent from the production application. See [local test instructions](../scripts/E2E.md).

Actual Freighter extension installation, permission prompts and approval screens remain unverified. All assets and transaction fees in this test are valueless testnet units.

## Signed browser results

The completed CUA journey produced **23 browser-signed transactions independently confirmed SUCCESS on public Stellar Testnet**. [Signature records](evidence/e2e/local-wallet.json) contain only public identities, methods and hashes. [Final ledger readback](evidence/e2e/readback.json) verifies their results and account/contract state.

| Path | Observed result |
|---|---|
| Fresh-wallet onboarding | New Friendbot-funded account initially had no TESTUSD trustline; reviewed trustline creation and faucet claim succeeded. UI showed 1,000 TESTUSD and disabled a repeated claim. |
| Vault and exchange | Seven-decimal vault deposit/redemption; direct receipt buy/sell; rejected signature recovered without a transaction. |
| Nested exchange | Buy/sell used ysALPHA backing; the 0.006 receipt spread did not change TESTUSD. |
| Factory and provider | Pool creation, capital provision, notice/cancellation/new notice; partial withdrawal burned 20 of 100 shares for 18.4 TESTUSD. |
| Holder | Protect, transfer to the second wallet, proportional backing and receipt exits; transferred position closed with zero shares/reserves. |
| Separate claims | Acquired-principal claim cleared eight receipt units independently of the separate provider reward claim. |
| Maturity | Permissionless settlement created a two-TESTUSD credit without immediately changing the holder's balance. A separate browser claim paid that credit; the matured creation bond was refunded. |
| Network context | Wrong-network rejection blocked signing. Targeted regressions also verify changed wallet identity and expired reviews. |

The five-minute maturity fixture was prepared by **three native setup transactions**, separately recorded in [maturity-fixture.json](evidence/e2e/maturity-fixture.json). Its settlement, credit claim and bond refund were then performed through the browser. The setup transactions are not included in the 23 browser transactions. The [pre-claim readback](evidence/e2e/maturity-before-claim.json) proves credit segregation. Screenshots: [protection confirmed](evidence/e2e/protection-confirmed.png), [maturity claim confirmed](evidence/e2e/maturity-claim-confirmed.png).

## Public application checks

- Missing Freighter reports an actionable message and re-enables connection.
- Protection → nested vault funding → protection preserves the exact seven-decimal amount and selected nested market.
- An invalid position identifier displays a recovery action; returning to the portfolio works.
- After publishing, the custom domain served the expected production bundle, all three icon links, six registry pools and no test-wallet controls. Desktop and 390px phone views had no horizontal page overflow; screenshots and exact release identity are in [HOSTING.md](HOSTING.md).

## Recovery and onboarding fixes

Each fix is committed separately. The release consumes a transaction review once broadcast can occur, clears actionable balances when the latest refresh fails, and allows a new wallet without a TESTUSD trustline to load and create that trustline. Ordinary development and test servers also deny private repository directories; four harmless-fixture checks verify that boundary without requesting real key files.

| Commit | Fix |
|---|---|
| `c5049f9` | Consume the review when a known hash is available and broadcast can occur. |
| `dea2dad` | Clear actionable balances and quotes after the latest refresh fails. |
| `97be491` | Deny private files from ordinary and test development servers. |
| `b70976b` | Read fresh-wallet TESTUSD balances without requiring an existing trustline. |

Test-wallet setup, its receipt-hash recorder correction and evidence are separate commits from these application fixes.

## Final checks

- 17 JavaScript tests pass, including actual App-level confirmation/refresh recovery, fresh-wallet reads, signing-policy restrictions, wallet identity and expiry guards.
- All 52 native Rust contract tests and Wasm builds pass. Deployed code hashes are unchanged.
- TypeScript checking and the Vite production build pass.
- Native deployment readback checked 13 instances, four Wasm hashes and six registered pools. All three featured pools have no active liabilities and remain open to provider entry.
- Test signing is absent from production output. Private-file denial passes four harmless-fixture checks. No real identity files were requested.
- The earlier 22-transaction native scripted lifecycle remains historical evidence, separate from this browser run.

The final application source and production deployment are recorded in [HOSTING.md](HOSTING.md). Earlier native deployment and lifecycle evidence remains in [the V3 evidence directory](evidence/v3/).

Grant applications remain held for user review. This is functional verification, not a security audit.

## Fresh-user rerun, 12 October 2026

A new disposable wallet (`GD6HCGQU6SNFPOFQ5IBP4IP6DEGKKOD5J2KMV2XFLNTW3SUULASUXTML`) used the same localhost-only test-wallet harness against the then-current contracts (the original stack, archived later that day in `evidence/archive-2026-10-12`) on the featured Reserve Alpha market. The app's **Fund with Friendbot** button created the account (Friendbot transaction `b5ecbc967a2c0e0da76b19e13a90ee8dcdb918e964c438b9411b75da016a41fa`). Then **13 browser-signed transactions** confirmed SUCCESS on public Testnet:

| Step | Result |
|---|---|
| TESTUSD trustline, faucet claim | 1,000 TESTUSD; repeated claim disabled |
| Vault deposit, redemption | 300 TESTUSD → 300 ysALPHA; 20 ysALPHA → 20 TESTUSD |
| Provider deposit, notice, cancel | 200 TESTUSD → 200 LP shares; notice requested and cancelled |
| Protect | 100 ysALPHA → position #1 |
| After the 60-second delay | Partial receipt exit of 40 ysALPHA, then backing exit of the remaining 60 for 60 TESTUSD; position closed |
| Provider claims and withdrawal | Acquired-receipt claim of 1.1764705 ysALPHA (this provider's share of the 60 surrendered receipts); notice for all shares; withdrawal after the 30-second notice paid 198.8235294 TESTUSD |

Final balances reconcile to 778.8235294 TESTUSD and 221.1764705 ysALPHA. Reserve Alpha, Beta and Nested have no open liabilities and still accept providers. Gain-fee rewards stayed at zero because vault NAV did not change, so reward claims were not exercised. Maturity settlement, ownership transfer and the real Freighter extension were not exercised in this run either. Evidence: [signatures](evidence/e2e-2026-10-12/local-wallet.json), [UI log](evidence/e2e-2026-10-12/driver-log.json), [independent ledger readback](evidence/e2e-2026-10-12/readback.json), and [protection](evidence/e2e-2026-10-12/protection-confirmed.png) and [withdrawal](evidence/e2e-2026-10-12/provider-withdraw-confirmed.png) screenshots.

# Stellar testnet operations

This application has no server or custodial wallet. Frontend deployments publish only a static bundle; contract IDs and issuer identity are public. Never publish `.secrets`, `.stellar`, `.env*`, or `.vercel` contents. Do not use existing real-fund signers. Mainnet is deliberately unavailable in scripts and UI.

## Rebuild and verify

Use Node 24+ and a Rust 1.99 toolchain with `wasm32v1-none`, Stellar CLI 28.1.0 and pinned SDK 28.0.0. The toolchain used for this build lives in `/tmp/yieldshield-stellar-tools`; it does not change the user's shell profile.

```
npm ci --ignore-scripts
npm test
npm run build
stellar contract build
cargo test --workspace
```

On the isolated macOS toolchain used here, set `DYLD_LIBRARY_PATH=/private/tmp/yieldshield-stellar-tools/rustup/toolchains/stable-aarch64-apple-darwin/lib` if the Wasm linker cannot find `libLLVM.dylib`. This is a local toolchain issue, not a web runtime dependency.

Factory tests deploy the built pool Wasm, so run `stellar contract build` (or `sh scripts/check-native.sh`) before `cargo test --workspace` on a clean checkout and after every pool-v3 change. The SDK requires CLI build metadata/spec processing, so a bare `cargo build --target wasm32v1-none` is not equivalent. Web output is `dist`; preview with `npm run dev`. The Vite development server is loopback-only.

## Public wallet flow

1. Install Freighter; choose Stellar Testnet and connect.
2. Use official Friendbot to fund the wallet with valueless test XLM for fees and trustline reserves. For an unfunded wallet the app shows a **Fund with Friendbot** action; pool data stays readable before funding.
3. Add the displayed `TESTUSD:<issuer>` trustline. This asset is not Circle USDC.
4. Claim 1,000 TESTUSD from the prefunded native faucet once per wallet while its claim record exists.
5. Deposit TESTUSD into the demo vault; protect some receipts.
6. After the 60-second delay, withdraw receipts or surrender all of them for the fixed backing claim. Returned receipts can be redeemed for vault-held TESTUSD.

Every state-sensitive transaction includes caller-controlled minimum output and a two-minute deadline. The frontend uses a fresh onchain preview and a 0.5% output tolerance, and simulates the exact reviewed invocation before showing the review, so contract failures appear as a short explanation before signing; signing uses the testnet passphrase, checks the active wallet network, caps the estimated fee at one test XLM, and waits for a successful ledger receipt before reporting success, retrying failed status requests with backoff until the transaction can no longer be included. Browser-signing evidence remains a separate verification item from scripted signer evidence.

Position IDs are public, scoped by pool+wallet in versioned local storage, and never contain keys. The UI finds the latest 30 pool positions plus up to 100 locally remembered IDs. Older positions can be restored by ID. Contract storage can be archived, so restoration must precede normal reads after TTL expiry: the app reports "archived – restore needed" with a restore action, and reports a probable testnet reset when a configured contract no longer exists. A failed background read is retried once and otherwise leaves the last values on screen, marked stale. Instances and code still need the scheduled renewal below; this prototype does not claim permanent uptime.

## Deployment

Create dedicated disposable aliases `ys-stellar-issuer`, `ys-stellar-sponsor`, and `ys-stellar-tester` under `.secrets/stellar` with `stellar keys generate --network testnet --fund --config-dir .secrets/stellar`. This invokes the official testnet faucet. Do not log seeds or run key-export commands in a visible terminal.

`node scripts/deploy-testnet.mjs --broadcast` checks the remote passphrase, deploys the named TESTUSD SAC and three contracts, seeds valueless tokens, and records confirmed IDs and transaction evidence. It records each step before moving on; after ambiguous interruption inspect network state before retrying. Before skipping any step it checks that the contracts recorded in `config/testnet.json` still exist on chain. If they do not (typically a testnet reset), it stops and explains; `node scripts/deploy-testnet.mjs --broadcast --fresh` then moves the old manifest and its evidence to `docs/evidence/archive-<date>/`, re-funds missing disposable accounts through Friendbot and deploys a new set. `--fresh` refuses to run while the recorded contracts still exist. The v3 deployment is separate (`config/markets.json`). The deployment is not a generic idempotent production orchestrator. `STELLAR_CLI` may point to another installed CLI binary. Only public arguments and receipts appear in evidence; key aliases resolve secrets inside the signing process.

`node scripts/verify-testnet.mjs --broadcast` runs funded gain and loss scenarios against the active deployment, checks actual balance deltas, and leaves one small demonstration position open. The script refuses to silently overwrite completed lifecycle evidence. It intentionally calls the administrator-only loss simulator using only valueless TESTUSD.

Contract writes request a 1,000,000-ledger storage lifetime (roughly 58 days at five seconds per ledger), capped at the actual host maximum, and refresh entries when below the threshold. Contract instances and Wasm code are not refreshed by reads, so they need the scheduled renewal below. These measures do not protect against testnet resets or guarantee permanent data availability.

## Storage lifetime renewal

Without renewal, the instances and code deployed on 11 October 2026 expire around ledger 6,144,082 (early to mid December 2026). Renewal covers every entry the public application depends on: the v3 factory recorded in `config/markets.json`, three vaults, three exchanges and **every pool in the factory registry** (including community pools, read page by page from a paged registry), the factory and pools a `--fresh-pools` deployment replaced (`previous`, which still hold positions), the legacy vault and pool, the shared faucet, the TESTUSD asset contract, and the Wasm code of all of them.

| Setting | Value |
|---|---|
| Cadence | Weekly; never more than two weeks apart |
| Command | `node scripts/extend-testnet.mjs --broadcast` |
| Signer alias | `ys-stellar-sponsor` under `.secrets/stellar` (pays test-XLM fees only; extension is permissionless) |
| Renew when below | 700,000 ledgers (~40 days: the longest 30-day pool term plus the 7-day maximum notice, with margin) |
| Renew to | 1,000,000 ledgers (~58 days), capped at the network maximum |
| Overdue | Below 241,920 ledgers (~14 days); the read-only check and `verify-v3-deployment.mjs` fail |

1. Run `node scripts/extend-testnet.mjs` without flags. It reads every live-until ledger and prints what is due, archived or missing; it signs nothing and exits non-zero when an entry is missing or overdue, so it can serve as a scheduled health check.
2. Run `node scripts/extend-testnet.mjs --broadcast`. Only entries below the threshold are extended; archived entries are restored with `stellar contract restore`. Healthy entries are skipped, so an immediate second run does nothing.
3. Commit the new evidence: one CLI record per renewed entry under `docs/evidence/ttl/<date>/`, named by contract (for example `extend-factory-CA7DG5I2.json`), and `summary.json` with before/after lifetimes. Earlier records are never overwritten.
4. Run `node scripts/verify-v3-deployment.mjs` to read back hashes, lifetimes, solvency and provider-entry status into the deployment's evidence directory (`evidence` in `config/markets.json`, default `v3`). `--extend` performs step 2 first and records it under that directory's `ttl/<date>/`.

A **missing** entry cannot be extended. Try `stellar contract restore --id <contract> --network testnet --source-account ys-stellar-sponsor --config-dir .secrets/stellar`; if the contract no longer exists, the testnet has reset and the demo must be redeployed. Per-user contract data (balances, positions, provider records) is renewed by the contracts whenever it is written; data left untouched for about 58 days archives and must be restored before use. The web application detects archived storage: reads show "archived – restore needed" with a restore action, and a transaction that needs archived entries first asks the wallet to sign a `restoreFootprint` transaction, then re-simulates.

The initial experimental addresses are preserved under `docs/evidence/archive-initial` for provenance. The current deployment manifest is authoritative; initial addresses are not the supported public application.

## Risk and scope limits

The vault administrator can remove test assets. Positive NAV movements come from explicit donations, not an investment strategy. The pool has one named reserve sponsor, no recurring premium, no expiry and no forced exercise: its sponsor must accept that reserved backing may remain locked until protected users choose to exit. This model is not commercially validated for real assets. Native XLM only pays network fees/reserves. No protocol token, native-XLM yield or directional-XLM protection is offered.

Future production deployment needs formal economic design, independent audit, a real strategy with verified withdrawal semantics, issuer policy checks, price/valuation monitoring, storage-restoration operations and human-reviewed source publication. Grant funding proposals concern future work, not reimbursement for this prototype.

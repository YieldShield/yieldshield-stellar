# Stellar testnet operations

This application has no server or custodial wallet. Frontend deployments publish only a static bundle; contract IDs and issuer identity are public. Never publish `.secrets`, `.stellar`, `.env*`, or `.vercel` contents. Do not use existing real-fund signers. Mainnet is deliberately unavailable in scripts and UI.

## Rebuild and verify

Use Node 24+ and a Rust 1.99 toolchain with `wasm32v1-none`, Stellar CLI 28.1.0 and pinned SDK 28.0.0. The toolchain used for this build lives in `/tmp/yieldshield-stellar-tools`; it does not change the user's shell profile.

```
npm ci --ignore-scripts
npm test
npm run build
cargo test --workspace
stellar contract build
```

On the isolated macOS toolchain used here, set `DYLD_LIBRARY_PATH=/private/tmp/yieldshield-stellar-tools/rustup/toolchains/stable-aarch64-apple-darwin/lib` if the Wasm linker cannot find `libLLVM.dylib`. This is a local toolchain issue, not a web runtime dependency.

The SDK requires CLI build metadata/spec processing, so a bare `cargo build --target wasm32v1-none` is not equivalent. Web output is `dist`; preview with `npm run dev`. The Vite development server is loopback-only.

## Public wallet flow

1. Install Freighter; choose Stellar Testnet and connect.
2. Use official Friendbot to fund the wallet with valueless test XLM for fees and trustline reserves.
3. Add the displayed `TESTUSD:<issuer>` trustline. This asset is not Circle USDC.
4. Claim 1,000 TESTUSD from the prefunded native faucet once per wallet while its claim record exists.
5. Deposit TESTUSD into the demo vault; protect some receipts.
6. After the 60-second delay, withdraw receipts or surrender all of them for the fixed backing claim. Returned receipts can be redeemed for vault-held TESTUSD.

Every state-sensitive transaction includes caller-controlled minimum output and a two-minute deadline. The frontend uses a fresh onchain preview and a 0.5% output tolerance; signing uses the testnet passphrase, checks the active wallet network, caps the estimated fee at one test XLM, and waits for a successful ledger receipt before reporting success. Browser-signing evidence remains a separate verification item from scripted signer evidence.

Position IDs are public, scoped by pool+wallet in versioned local storage, and never contain keys. The UI finds the latest 30 pool positions plus up to 100 locally remembered IDs. Older positions can be restored by ID. Contract storage can be archived, so restoration must precede normal reads after TTL expiry. A live service must maintain and restore contract/storage TTLs and detect testnet resets; this prototype does not claim permanent uptime.

## Deployment

Create dedicated disposable aliases `ys-stellar-issuer`, `ys-stellar-sponsor`, and `ys-stellar-tester` under `.secrets/stellar` with `stellar keys generate --network testnet --fund --config-dir .secrets/stellar`. This invokes the official testnet faucet. Do not log seeds or run key-export commands in a visible terminal.

`node scripts/deploy-testnet.mjs --broadcast` checks the remote passphrase, deploys the named TESTUSD SAC and three contracts, seeds valueless tokens, and records confirmed IDs and transaction evidence. It records each step before moving on; after ambiguous interruption inspect network state before retrying. The deployment is not a generic idempotent production orchestrator. `STELLAR_CLI` may point to another installed CLI binary. Only public arguments and receipts appear in evidence; key aliases resolve secrets inside the signing process.

`node scripts/verify-testnet.mjs --broadcast` runs funded gain and loss scenarios against the active deployment, checks actual balance deltas, and leaves one small demonstration position open. The script refuses to silently overwrite completed lifecycle evidence. It intentionally calls the administrator-only loss simulator using only valueless TESTUSD.

Contract writes request a 1,000,000-ledger storage lifetime (roughly 58 days at five seconds per ledger), capped at the actual host maximum, and refresh entries when below the threshold. `node scripts/extend-testnet.mjs --broadcast` separately extends active deployed code and instances. These measures do not protect against testnet resets or guarantee permanent data availability.

The initial experimental addresses are preserved under `docs/evidence/archive-initial` for provenance. The current deployment manifest is authoritative; initial addresses are not the supported public application.

## Risk and scope limits

The vault administrator can remove test assets. Positive NAV movements come from explicit donations, not an investment strategy. The pool has one named reserve sponsor, no recurring premium, no expiry and no forced exercise: its sponsor must accept that reserved backing may remain locked until protected users choose to exit. This model is not commercially validated for real assets. Native XLM only pays network fees/reserves. No protocol token, native-XLM yield or directional-XLM protection is offered.

Future production deployment needs formal economic design, independent audit, a real strategy with verified withdrawal semantics, issuer policy checks, price/valuation monitoring, storage-restoration operations and human-reviewed source publication. Grant funding proposals concern future work, not reimbursement for this prototype.

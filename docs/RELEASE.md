# Stellar testnet release evidence

Verified lifecycle: 2026-10-11T17:56:25.051Z. This release uses only valueless test assets.

## Active deployment

- Web target: https://stellar.yieldshield.ai (hosting verification recorded by the release owner).
- TESTUSD issuer: [GBT2CT2NUF5X7W447ELA2PIHFQZ5VRJWJBP523JVXYCRCZFKJI3J5JIH](https://stellar.expert/explorer/testnet/account/GBT2CT2NUF5X7W447ELA2PIHFQZ5VRJWJBP523JVXYCRCZFKJI3J5JIH).
- backing: [CCVCEDIJL5FDPI6MJQG4DS55P5CF66IKJMFT7FDXMYAPVOW5I6ZWIL6D](https://stellar.expert/explorer/testnet/contract/CCVCEDIJL5FDPI6MJQG4DS55P5CF66IKJMFT7FDXMYAPVOW5I6ZWIL6D).
- vault: [CCGDPBGQIOVYUQCMGF6LWAZDQEVXA6YGDKQBIBPNQTB44UH3RKZ6W5IQ](https://stellar.expert/explorer/testnet/contract/CCGDPBGQIOVYUQCMGF6LWAZDQEVXA6YGDKQBIBPNQTB44UH3RKZ6W5IQ).
- pool: [CBTKPRFTGLW6TGTX2MU2QMOJKXX6DZQMVMEEVZTND2NJPQE7NIGZC7GT](https://stellar.expert/explorer/testnet/contract/CBTKPRFTGLW6TGTX2MU2QMOJKXX6DZQMVMEEVZTND2NJPQE7NIGZC7GT).
- faucet: [CDC4SYVLZS2TD5NC27YMMG2C4ZCQRRL3SUODPUCCT2MOSHDUI7EAJCYY](https://stellar.expert/explorer/testnet/contract/CDC4SYVLZS2TD5NC27YMMG2C4ZCQRRL3SUODPUCCT2MOSHDUI7EAJCYY).

The manifest is testnet-only; native XLM is limited to network costs. Actual deployed Wasm hashes and live storage ledgers are checked in [deployment-check.json](evidence/deployment-check.json).

## Verified journeys

- Claim funded test tokens: [ledger 5143538 transaction](https://stellar.expert/explorer/testnet/tx/e62b4b20eb19f79b479503b3232b2c4e2fac41716f78f7a0d239f0d73a371adf).
- Deposit TESTUSD into native receipt vault: [ledger 5143539 transaction](https://stellar.expert/explorer/testnet/tx/f3b962ab6e4ecfa095400a2d2242b927a435b5bd0f4d1efdae21ed2ef1dc598e).
- Open gain scenario position: [ledger 5143540 transaction](https://stellar.expert/explorer/testnet/tx/4bed74464c34b9491b871e9927c5fc0d4dc946c9895fdec0c0b633a1cf8405ad).
- Add funded donation to simulate gain: [ledger 5143541 transaction](https://stellar.expert/explorer/testnet/tx/353dff75da9ee41bd4951a0141e53a6935c1e7d05dbc4a0b4dacca7933cbde79).
- Open second position at higher funded NAV: [ledger 5143542 transaction](https://stellar.expert/explorer/testnet/tx/6d85e96dd5f17f2bca08fb4b1ab2bb7699d29ca19ee22cfb619854c27cef7864).
- Exit with receipts and share positive gains: [ledger 5143554 transaction](https://stellar.expert/explorer/testnet/tx/2d4511614b23b83e2743a5302ab413acc7c23fb1dec8018f880cf2af536860dd).
- Redeem returned receipts to actual TESTUSD: [ledger 5143555 transaction](https://stellar.expert/explorer/testnet/tx/9ea97def005f81bbc9c33f36a06456acad6ae370d2ec4d3298b05cda128bc1fb).
- Explicit test administrator simulates vault loss: [ledger 5143556 transaction](https://stellar.expert/explorer/testnet/tx/d0c48dc9f3c2004959ea54ed320372de54a1e311dcb95583e46af81e64d05107).
- Surrender receipts and claim reserved backing: [ledger 5143557 transaction](https://stellar.expert/explorer/testnet/tx/21b35b35197e10c7330ee3b3d7978e01e87d8d9289e2d16063c933e6f3850d1a).
- Leave a small visible test position open: [ledger 5143559 transaction](https://stellar.expert/explorer/testnet/tx/7eddfcd3c00824be4b006929ed90162b494e5a42da08573d72983a994aafc002).

The automated verifier asserts actual recipient balance deltas and exact onchain output previews. It confirms gains are shared in receipts, returned receipts redeem to funded TESTUSD, loss exits pay the fixed recorded backing claim, old positions close, and reserve inventory remains accounted for. Raw results: [lifecycle.json](evidence/lifecycle.json).

## Validation and boundaries

- 22 native Rust tests passed: funding, reservation limits, ownership and nested authorization, gain/loss/zero-NAV exits, delays, double-exit rejection, slippage/deadlines, donation inflation defense, token events and faucet limits.
- Three JavaScript tests passed: testnet/issuer-derived SAC identity, exact seven-decimal parsing, and minimum-output rounding for all quotes from 1 to 10,000 raw units.
- Production TypeScript/Vite build passed; dependency audit reported zero vulnerabilities. The Stellar SDK remains in a separate lazy-loaded bundle (~126 kB gzip).
- Desktop and 390-pixel browser inspection passed with no mobile overflow or JavaScript page errors. Absent-Freighter recovery was verified; the mobile screenshot was taken before final pool seeding.
- Wallet transaction signing through a human-installed Freighter extension has not been demonstrated in this environment. Scripted transactions use separate disposable identities and exercise the same native contract calls.
- No audit, mainnet assets, production lending strategy, real USDC integration, financial guarantee, grant award or end-user traction is claimed.
- Initial deployment records remain archived. Its unused reserve and vault seed were returned to the disposable sponsor before the corrected revision; its obsolete test faucet can still hold valueless tokens.

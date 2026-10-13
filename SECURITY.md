# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately, not in a public issue: use **Report a vulnerability** on this repository's Security tab (GitHub private vulnerability reporting), or email david@yieldshield.ai. Include the affected contract and function or page, steps to reproduce and the expected impact. Never send secret keys or seed phrases. This is unaudited testnet software that holds no assets of monetary value; there is no bug bounty.

## Scope and trust assumptions

- **Testnet only.** Scripts and the website refuse any network other than Stellar Testnet. TESTUSD is a project-issued test asset, not Circle USDC, with no monetary value or redemption.
- **Unaudited.** The contracts and website were written with substantial AI assistance and have not been independently audited.
- **Privileged keys.** The sponsor identity administers the demo vaults (including a test-only loss simulator that removes TESTUSD), operates the exchanges and receives protocol fees from the factory. The issuer identity mints TESTUSD. Neither can withdraw provider backing reserved in a pool. These are disposable testnet keys and must never hold real funds.
- **Storage lifetime.** Soroban storage expires unless renewed (`node scripts/extend-testnet.mjs --broadcast`); archived entries must be restored before use, and a testnet reset removes everything. See [docs/OPERATIONS.md](docs/OPERATIONS.md).

Contract-level safety boundaries are documented in [contracts/pool-v3/README.md](contracts/pool-v3/README.md), [contracts/market/README.md](contracts/market/README.md) and, for the legacy pool, [contracts/README.md](contracts/README.md).

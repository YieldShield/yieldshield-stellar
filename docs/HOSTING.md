# Public website release

Verified on 11 October 2026.

- Public website: https://stellar.yieldshield.ai
- Private source repository: https://github.com/YieldShield/yieldshield-stellar
- Branch: `codex/stellar-scf46`
- Published application commit: `72ac5371667c0f40db6adc017b9426a23f022afd`
- Vercel project: `yieldshield-stellar` (`prj_3q75ugtINazrFgxJZ9hZVu9kJN9r`)
- Vercel team: `team_B1gmlyua4FRgXZSs0859SCoQ`
- Deployment: `dpl_73Wwpm1P4eXN9baqKDpVcbKnuGhz`, verified `READY` with the expected commit and custom-domain alias.
- Immutable deployment: https://yieldshield-stellar-8f69hoqdd-noc2-6281s-projects.vercel.app

The production website is a static build. It contains public testnet identities and no signing keys or server credentials. Deployment exclusions keep `.secrets`, `.env*`, private grant records, build caches and dependencies out of the upload. Existing deployment protection was retained; the custom production domain is publicly accessible.

The public `/protect` page successfully read the new native registry and displayed Reserve Alpha with 10,000 TESTUSD free backing, no reserved backing, 150% collateral and its fixed November 10 maturity. Three separately funded featured markets are available: ysALPHA/TESTUSD, ysBETA/TESTUSD and ysNEST/ysALPHA. The fourth registered pool is the expired lifecycle test pool; it is labelled closed to new entries. Test liquidity is deliberately seeded and valueless, not financial traction. Native identities are in `config/markets.json`; the previous pool remains accessible at `/legacy` using `config/testnet.json`.

Public direct-route checks passed for protection, markets, trading, providers, positions, creation, activity, account, funding, assets, status, explanation, scenarios and legal pages. The phone view retains all seven primary navigation links in a scrollable row, with no page-width overflow at a 390px browser viewport (375px content area). Desktop and mobile evidence: [protection desktop](evidence/parity-protect-desktop.jpg), [protection mobile](evidence/parity-protect-mobile.jpg).

Verification for this application revision: 52 native contract tests, four exact-amount frontend tests, production build, 22 confirmed two-wallet testnet lifecycle transactions and seven final lifecycle assertions. Readback checked eleven native instances, four deployed Wasm hashes and four factory pools; all inspected instance/code lifetimes had more than 999,000 ledgers remaining after extension. Evidence is in [checks](evidence/v3/checks.json), [lifecycle](evidence/v3/lifecycle.json), and [deployment readback](evidence/v3/deployment-check.json). These checks are not a security audit. Actual Freighter browser-extension signing remains unverified; the signed native lifecycle used disposable testnet signers.

The implemented workflows and intentional differences from other chains are listed in [FEATURE_PARITY.md](FEATURE_PARITY.md). Earlier release evidence remains in [RELEASE.md](RELEASE.md) and Git history.

Application-source changes need a new website deployment. Later documentation and evidence commits do not change the published application. Grant submissions have their own status records under `docs/grants/` and are excluded from hosting uploads.

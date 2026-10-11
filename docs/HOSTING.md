# Public website release

Verified on 11 October 2026.

- Public website: https://stellar.yieldshield.ai
- Private source repository: https://github.com/YieldShield/yieldshield-stellar
- Branch: `codex/stellar-scf46`
- Published application commit: `1044b9c2d97621291e4f9d2eae0cfdde046bc6bd`
- Vercel project: `yieldshield-stellar` (`prj_3q75ugtINazrFgxJZ9hZVu9kJN9r`)
- Vercel team: `team_B1gmlyua4FRgXZSs0859SCoQ`
- Deployment: `dpl_BEFaHiL47QogkLa9dihJLXa6iNfk`, verified `READY` with the expected commit and custom-domain alias.
- Immutable deployment: https://yieldshield-stellar-3w0wbjczc-noc2-6281s-projects.vercel.app

The current release fixes transaction-review replay, stale actionable balances after failed refresh and fresh-wallet trustline onboarding. Development servers also deny private repository directories. Seventeen JavaScript tests, 52 native contract tests, production build and 23 browser-to-Testnet transactions pass. [E2E_REPORT.md](E2E_REPORT.md) records paths, receipts and limits. Earlier SVG/ICO/touch-icon, keyboard, mobile-navigation and draft-persistence evidence remains in [UI_REVIEW.md](UI_REVIEW.md).

Post-deployment browser verification loaded `/protect` with production bundle `/assets/index-B_3wQFxS.js`, SVG/ICO/touch-icon links and no local test-wallet controls. The native registry returned six pools. Desktop content width equalled its viewport; at 390px phone size the content stayed within 375px without horizontal page overflow. Evidence: [desktop](evidence/e2e/published-protect-desktop.jpg), [phone](evidence/e2e/published-protect-mobile.jpg).

The production website is a static build. It contains public testnet identities and no signing keys or server credentials. Deployment exclusions keep `.secrets`, `.env*`, private grant records, build caches and dependencies out of the upload. Existing deployment protection was retained; the custom production domain is publicly accessible.

The public `/protect` page successfully read the native registry and displayed Reserve Alpha with 10,000 TESTUSD free backing, no reserved backing, 150% collateral and its fixed November 10 maturity. Three separately funded featured markets are available: ysALPHA/TESTUSD, ysBETA/TESTUSD and ysNEST/ysALPHA. Three community test pools also appear, including the earlier expired lifecycle pool and the new browser-created and short-maturity fixtures. All featured pools remain open to provider entry. Test liquidity is deliberately seeded and valueless, not financial traction. Native identities are in `config/markets.json`; the previous pool remains accessible at `/legacy` using `config/testnet.json`.

Public direct-route checks passed for protection, markets, trading, providers, positions, creation, activity, account, funding, assets, status, explanation, scenarios and legal pages. The phone view retains all seven primary navigation links in a scrollable row, with no page-width overflow at a 390px browser viewport (375px content area). Desktop and mobile evidence: [protection desktop](evidence/parity-protect-desktop.jpg), [protection mobile](evidence/parity-protect-mobile.jpg).

Historical protocol verification from the preceding feature release remains in [checks](evidence/v3/checks.json), [the 22-transaction native lifecycle](evidence/v3/lifecycle.json), and [deployment readback](evidence/v3/deployment-check.json). The current pass rechecked 13 instances, four unchanged Wasm hashes and six factory pools; current evidence is in [E2E checks](evidence/e2e/checks.json), [23-transaction browser readback](evidence/e2e/readback.json), and [deployment readback](evidence/e2e/deployment-check.json). Browser transactions exercised the actual app/Freighter API through a restricted local Testnet signer; actual extension installation, consent and approval screens remain unverified. The test signer is stopped. These checks are not a security audit.

The implemented workflows and intentional differences from other chains are listed in [FEATURE_PARITY.md](FEATURE_PARITY.md). Earlier release evidence remains in [RELEASE.md](RELEASE.md) and Git history.

Application-source changes need a new website deployment. Later documentation and evidence commits do not change the published application. Grant submissions have their own status records under `docs/grants/` and are excluded from hosting uploads.

# Public website release

Published on 12 October 2026.

- Public website: https://stellar.yieldshield.ai
- Private source repository: https://github.com/YieldShield/yieldshield-stellar
- Branch: `codex/stellar-scf46`
- Published application commit: `7a2eee78cbbec69520d0859240c90bcc525eb7ac`
- Vercel project: `yieldshield-stellar` (`prj_3q75ugtINazrFgxJZ9hZVu9kJN9r`)
- Vercel team: `team_B1gmlyua4FRgXZSs0859SCoQ`
- Deployment: `dpl_DRXuGzKEtBRHwvXLAMQMQwtHaLUu`, `READY` with the expected commit and custom-domain alias. Vercel built it from the pushed GitHub commit; the preview of the same tree served the new CSP, framing, referrer, permissions and immutable-asset headers, and a local Chromium run of `dist/` under those headers showed zero CSP violations.
- Immutable deployment: https://yieldshield-stellar-7q9hcmyy5-noc2-6281s-projects.vercel.app
- Previous release: `0767fe5fe4bbb0b7f71747718e556b1bcf1d4e5c`, deployment `dpl_2hJhfXyLEaZvgRq6s9PbpkSfacan`.

This review release keeps unfunded wallets usable (Friendbot onboarding instead of an error), restores archived contract storage before reads and writes, simulates the reviewed transaction and explains failures, keeps polling through RPC blips, reads from the SDK null account, names testnet resets, keeps last good data when a read fails, reports trustline rejection codes with a surge-tolerant fee, shows the newest pool events, accepts a decimal comma, moves focus to the result, and adds security headers and link previews. Operations scripts now renew every v3 and legacy TTL by threshold and detect a testnet reset before skipping deployment steps. Checks: 82 JavaScript tests, 67 native contract tests and the production build; browser scenarios ran against mocked RPC/Horizon/Freighter because this environment cannot reach Stellar Testnet.

The same release contains pool-v3 and factory fixes (provider index snapshots, bounded wallet index, minimum claim, live-pool limits with a paged registry, claim events) and `deploy-v3.mjs --fresh-pools`. **These contract fixes are not yet on chain.** The deployed v3 factory and pools are immutable and still run the earlier code until they mature on 10 November 2026; the website keeps reading them through the compatible registry path until the owner deploys the new factory and pools and records them in `config/markets.json`.

The preceding E2E release (`1044b9c`) fixed transaction-review replay, stale actionable balances after failed refresh and fresh-wallet trustline onboarding. Development servers also deny private repository directories. Seventeen JavaScript tests, 52 native contract tests, production build and 23 browser-to-Testnet transactions pass. [E2E_REPORT.md](E2E_REPORT.md) records paths, receipts and limits. Earlier SVG/ICO/touch-icon, keyboard, mobile-navigation and draft-persistence evidence remains in [UI_REVIEW.md](UI_REVIEW.md).

The current release simplifies navigation to five primary text links plus More, provides a mobile Menu, shortens repeated copy, removes empty disconnected provider panels and repairs same-page keyboard focus. Twenty-three JavaScript tests and the production build pass. [UI_SIMPLIFICATION.md](UI_SIMPLIFICATION.md) records research, separate source commits, measured reductions and checks.

Post-deployment browser verification loaded `/protect` with production bundle `/assets/index-ph49ncFr.js`, SVG/ICO/touch-icon links and no local test-wallet controls. The native registry returned six pools and current contract terms. Desktop content width equalled its viewport; at 390px phone size the content stayed within 375px without horizontal overflow. The public nested Provide → Funding → Provide journey retained Receipt Reserve and the exact 12.3456789 amount, with explicit guidance for acquiring its ysALPHA backing. Evidence: [desktop](evidence/ui-simplification/published-desktop.jpg), [phone](evidence/ui-simplification/published-mobile.jpg).

The production website is a static build. It contains public testnet identities and no signing keys or server credentials. Deployment exclusions keep `.secrets`, `.env*`, private grant records, build caches and dependencies out of the upload. Existing deployment protection was retained; the custom production domain is publicly accessible.

The public `/protect` page successfully read the native registry and displayed Reserve Alpha with 10,000 TESTUSD free backing, no reserved backing, 150% collateral and its fixed November 10 maturity. Three separately funded featured markets are available: ysALPHA/TESTUSD, ysBETA/TESTUSD and ysNEST/ysALPHA. Three community test pools also appear, including the earlier expired lifecycle pool and the new browser-created and short-maturity fixtures. All featured pools remain open to provider entry. Test liquidity is deliberately seeded and valueless, not financial traction. Native identities are in `config/markets.json`; the previous pool remains accessible at `/legacy` using `config/testnet.json`.

Earlier feature-release direct-route checks passed for protection, markets, trading, providers, positions, creation, activity, account, funding, assets, status, explanation, scenarios and legal pages. That earlier release used seven navigation links; the current Menu replaces the scrollable row. Desktop and mobile evidence: [protection desktop](evidence/parity-protect-desktop.jpg), [protection mobile](evidence/parity-protect-mobile.jpg).

Historical protocol verification from the preceding feature release remains in [checks](evidence/archive-2026-10-12/v3/checks.json), [the 22-transaction native lifecycle](evidence/archive-2026-10-12/v3/lifecycle.json), and [deployment readback](evidence/archive-2026-10-12/v3/deployment-check.json) (original stack, archived). The preceding E2E pass rechecked 13 instances, four unchanged Wasm hashes and six factory pools; its evidence is in [E2E checks](evidence/e2e/checks.json), [23-transaction browser readback](evidence/e2e/readback.json), and [deployment readback](evidence/e2e/deployment-check.json). Browser transactions exercised the actual app/Freighter API through a restricted local Testnet signer; actual extension installation, consent and approval screens remain unverified. The test signer is stopped. These checks are not a security audit.

The implemented workflows and intentional differences from other chains are listed in [FEATURE_PARITY.md](FEATURE_PARITY.md). Earlier release evidence remains in [RELEASE.md](RELEASE.md) and Git history.

Application-source changes need a new website deployment. Later documentation and evidence commits do not change the published application. Grant submissions have their own status records under `docs/grants/` and are excluded from hosting uploads.

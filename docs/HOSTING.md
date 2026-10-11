# Public website release

Verified on 11 October 2026.

- Public website: https://stellar.yieldshield.ai
- Private source repository: https://github.com/YieldShield/yieldshield-stellar
- Branch: `codex/stellar-scf46`
- Published application commit: `0ba1cc6acb08d927d09bd8b0bceb5269181bf8f6`
- Vercel project: `yieldshield-stellar` (`prj_3q75ugtINazrFgxJZ9hZVu9kJN9r`)
- Vercel team: `team_B1gmlyua4FRgXZSs0859SCoQ`
- Deployment: `dpl_ErnPBryMTqELYwenvu1s1cDo186N`, verified `READY` with the expected commit and custom-domain alias.
- Immutable deployment: https://yieldshield-stellar-iumbx6o74-noc2-6281s-projects.vercel.app

The production website is a static build. It contains public testnet identities and no signing keys or server credentials. Deployment exclusions keep `.secrets`, `.env*`, private grant records, build caches and dependencies out of the upload. Existing deployment protection was retained; the custom production domain is publicly accessible.

The public page successfully read the final deployed contracts. At verification it displayed 49,818.75 TESTUSD free backing, 56.25 TESTUSD reserved, a 0.7500 TESTUSD vault receipt NAV and one live test position. These are deliberately seeded, valueless test assets following a simulated loss, not financial traction. Pool and vault explorer links matched `config/testnet.json`.

The public desktop screenshot is [public-desktop.jpg](evidence/public-desktop.jpg). Native transaction and storage evidence is recorded in [RELEASE.md](RELEASE.md). Website visibility does not constitute a security audit or proof of browser-extension signing; actual Freighter signing remains unverified in this environment.

Application-source changes need a new website deployment. Later documentation and evidence commits do not change the published application. Grant submissions have their own status records under `docs/grants/` and are excluded from hosting uploads.

# YieldShield Stellar SCF 46 application draft

Prepared 11 October 2026 for Hawig Ventures UG (haftungsbeschränkt). No application has been submitted. The initial interest form precedes screening and an invitation to the full proposal; the published SCF 46 full-proposal deadline is 8 November 2026. This document separates the initial form answers from the proposed future development budget.

## Initial interest form

### Project title

YieldShield Stellar

### Project description

YieldShield Stellar is a native Soroban prototype for explicit vault risk allocation. A holder deposits vault receipts and chooses either to reclaim them under gain-sharing terms or surrender them for fixed, separately reserved backing. A first-loss sponsor provides the backing and receives surrendered receipts and a share of gains. Collateral and exit rights are visible onchain.

The live testnet demo uses a funded vault and YieldShield-issued TESTUSD with no monetary value or dollar redemption. It is not Circle USDC. Funded donations simulate gains; a disclosed test-only control simulates losses. This proves accounting and authorization, not underwriting or guaranteed returns. XLM pays network costs only; no protocol token launch is planned.

The proposed phase develops reserve accounting, verified USDC handling, conservative strategy valuation, monitoring and integration documentation. The current one-sponsor model needs additional design before supporting independent collateral providers.

### Project category

Financial Protocols.

### Current traction

Live native Soroban prototype: https://stellar.yieldshield.ai. It includes a funded TESTUSD vault, protection pool, faucet and Freighter interface. 22 native tests, 3 JavaScript tests and 10 confirmed internal testnet transactions passed; six balance/state assertions cover deposits and both exits. Scripted signing is verified; Freighter extension signing remains unverified.

Pool evidence: https://stellar.expert/explorer/testnet/contract/CBTKPRFTGLW6TGTX2MU2QMOJKXX6DZQMVMEEVZTND2NJPQE7NIGZC7GT

Source: https://github.com/YieldShield/yieldshield-stellar (private). We plan to publish reviewed contracts, tests and deployment docs before the first funded release. Code and docs are substantially AI-assisted; no external audit is claimed.

We claim no verified external users, revenue or real-asset TVL. Internal test tokens and transactions are not adoption. David and Santiago confirm no investment or grants received. Prior Base, Monad and BNB prototypes are separate work and will not be billed to SCF.

### Website

https://stellar.yieldshield.ai

### Planned Stellar integration

Stellar materially powers the product: Rust/Soroban contracts custody test vault receipts, enforce holder authorization, reserve first-loss backing and execute both exits. A classic TESTUSD asset with an explicit issuer is accessed through its Stellar Asset Contract; wallets create the correct trustline before receiving it. Freighter signs on the Stellar test network, with transaction simulation and ledger results checked by the client. Persistent contract state needs explicit TTL management and restoration procedures.

The next phase will support verified Circle-issued USDC/SAC identities, authorization and issuer restrictions, and conservative valuation and redemption checks for a selected non-XLM strategy. Blend is a research candidate, not a partner or current integration: its bTokens are nontransferable internal accounting, so any future vault must own its Blend position and validate withdrawal liquidity. We will not treat bRate as proof of realizable NAV. No XLM payoff or XLM-yield promotion is part of this scope.

### Build track

Open track: for net-new protocols, primitives, etc.

### Submitter type

Entity — Hawig Ventures UG (haftungsbeschränkt), Germany.

### Contact email

david@yieldshield.ai

### Team description

YieldShield is built by two cofounders, David Hawig and Santiago Balaguer, through Hawig Ventures UG (haftungsbeschränkt), Germany. David is Founder and Managing Director and works full-time on YieldShield. He previously served as Director of Ecosystem at Web3 Foundation and has founded and exited two startups. His work combines ecosystem and business development with hands-on Solidity, React and AI tooling. LinkedIn: https://www.linkedin.com/in/david-hawig-206a44b1/

Santiago is Cofounder and Product Lead, with 15 years of product experience and five years in crypto. He focuses on making the protection mechanism understandable and usable. LinkedIn: https://www.linkedin.com/in/santiagobalaguer/

The Stellar contracts and accompanying documents were developed with substantial AI assistance. AI agents are development tools, not team members. The founding team remains responsible for reviewing the work, validating claims and arranging independent review before any real-asset launch.

### Target markets and jurisdictions

European Union. Proposed initial award-period scope: an EU-based independent testnet pilot with developers and prospective integrators. Public testnet access is not a real-asset product launch in every accessible country.

### Team base

European Union (the available form region). The applying company is based in Simmern, Germany. This identifies the entity's base and does not assert Santiago's residential address.

### Local financial infrastructure

Not sure yet.

The current testnet prototype uses only YieldShield-issued TESTUSD with no monetary value or redemption claim. The future development plan evaluates Circle-issued USDC as onchain backing; there is no proposed local banking, mobile money, payment processing or fiat on/off-ramp integration. We would welcome SCF guidance on whether the planned USDC/SAC integration should be classified as local financial infrastructure for this form. Our proposed initial independent testnet pilot is EU-based; any real-asset rollout remains conditional on appropriate jurisdictional review.

### Referral

No SDF or Stellar ecosystem collaborator is claimed for this submission.

## Future development proposal

Request: $60,000 equivalent in XLM for 12 weeks after acceptance, subject to program review. Budget estimate: 600 combined engineering, product and verification hours at a blended $100/hour. These are planning estimates, not a representation that hours have already been worked. Award funds support only additional Stellar-specific implementation; no reimbursement of this prototype, other-chain work, audits, legal fees, general marketing or giveaways.

| Deliverable | Additional work and acceptance evidence | Effort and budget |
| --- | --- | --- |
| Native reserve accounting, weeks 1–4 | Implement economically specified multi-provider reserve shares and bounded exits; adversarial cohort and liability tests; reproducible authorization/rounding/storage tests; publish the additional native contract source and architecture. | 200 hours, $20,000 |
| Asset and strategy hardening, weeks 5–8 | Integrate verified USDC/SAC handling; implement one selected non-XLM strategy adapter only after conservative valuation and redemption criteria are met; prove failure handling for impaired liquidity, issuer restrictions and stale state; deliver a threat model and monitoring plan. If no strategy meets the criteria, a fully liquid USDC-backed vault is the bounded fallback. | 200 hours, $20,000 |
| Mainnet integration release, weeks 9–12 | Publish a functional, tightly capped Stellar mainnet release with verified USDC identities, accessible wallet journeys, integration examples, monitoring, restoration and incident procedures; provide deployment/transaction evidence and resolve material pilot findings. Launch depends on separately funded legal, economic and independent security prerequisites. | 200 hours, $20,000 |

Proposed payment schedule follows SCF's 10/20/30/40 model: $6,000 at acceptance, then $12,000, $18,000 and $24,000 on the three accepted deliverables. These payment amounts differ from the effort allocation above. Each report is planned well within 90 days of the preceding payment. Mainnet deployment remains conditional on appropriate legal, economic and independent security review; audit funding would be sought separately, potentially through Audit Bank, and is not assumed awarded. SCF expects a functional mainnet destination: a testnet-only substitute requires SCF's explicit jurisdiction-specific approval before the full proposal. Unmet launch prerequisites are a blocker or an agreed scope/timing change, not completion of the final milestone.

Success targets are future goals: at least 10 independent testers, 30 completed testnet journeys spanning both exits and first-loss reserve behavior, and reproducible monitoring of all pilot deployments. No paid acquisition, recruitment incentives or giveaways are included in this Open Track budget; pilot observation is engineering QA. Test tokens and developer activity will never be reported as real TVL or organic adoption.

## Market comparison and open source

Stellar already has vault and asset-management projects, including Tezoro and Untangled. We do not claim to be the first or only risk product. YieldShield's proposed contribution is explicit separately funded loss-bearing capital, per-position reserved backing, holder-selected exit rights and observable settlement behavior. Production viability, pricing and demand remain to be validated.

The new repository is initially private: https://github.com/YieldShield/yieldshield-stellar. Our proposed open-source plan is to publish the native contracts, tests, architecture and reproducible deployment instructions before the first funded release, retaining upstream attribution and excluding credentials and private application records. Human review and dependency/license checks precede publication. Code and documentation are substantially AI-assisted; no independent external audit is claimed.

## Sources and review status

- Round and deadline: https://communityfund.stellar.org/awards/recxrSMYwAl8vcglg
- Initial intake: https://communityfund.stellar.org/
- Open Track: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/open-track
- Budget rules: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines
- Official submission terms: https://stellar.gitbook.io/scf-handbook/scf-awards/official-rules-for-submissions
- Submission criteria: https://stellar.gitbook.io/scf-handbook/scf-awards/submission-criteria
- Blend accounting: https://docs.blend.capital/tech-docs/core-contracts/lending-pool/protocol-tokens
- Comparison: https://communityfund.stellar.org/project/untangled-qcs and https://communityfund.stellar.org/submissions/recGl3bJHP5TkDOj7
- Founder roles and LinkedIn profiles: existing Base Batches 004 draft in the team's Drive, confirmed unchanged by David on 11 October 2026. No private Drive video or documents are submitted as public evidence.

Before interest submission: verify final deployment evidence and obtain the applicant's action-time confirmation of the official rules. Submission implies acceptance of eligibility, publicity and other terms; personal eligibility declarations must not be inferred from company location. The full #46 proposal requires an invitation after interest screening. Before that full proposal, freeze the funded architecture, validate the mainnet prerequisites and capacity estimate with the team, and resolve any jurisdiction-specific tranche changes with SCF; these are not presumed approved by the interest form.

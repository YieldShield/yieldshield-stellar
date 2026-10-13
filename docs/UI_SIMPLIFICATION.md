# Navigation and content simplification

Reviewed 11 October 2026. Scope: the Stellar application, preserving its editorial identity and all existing workflows.

## Research and decisions

- Clear text labels avoid ambiguity in navigation icons. Use familiar task names and keep decorative symbols out of navigation. [NN/g: Icon Usability](https://www.nngroup.com/articles/icon-usability/).
- Keep frequent actions visible and secondary tools behind a clearly labelled disclosure. Five primary links is a choice for this application's tasks, not a universal research rule. [NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
- Shorten repeated content before adding disclosures. Optional mechanics can sit in named details, while fees, maturity, surrender conditions and signed limits remain visible where they affect a decision. [GOV.UK: Details](https://design-system.service.gov.uk/components/details/).
- Use ordinary navigation links and disclosure buttons with expanded state, keyboard access, Escape dismissal and focus restoration. Avoid ARIA menu roles for ordinary site navigation. [W3C: Disclosure Navigation](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/).
- Review focus visibility, form labels, layout overflow and touch targets against the [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md).

## Baseline

The production app showed seven primary header destinations and horizontally scrolling phone navigation. Desktop page word counts were 240 for Protect, 258 for Trade and 347 for Provide. These measure `document.body.innerText` split on whitespace across the whole rendered page, including navigation, numerals, labels and footer, without a connected wallet and with Reserve Alpha selected. They are a density comparison, not a claim about user testing. [Baseline data](evidence/ui-simplification/baseline.json).

The existing contract and transaction verification remains documented in [E2E_REPORT.md](E2E_REPORT.md).

## Implementation and checks

Separate commits implement five primary text links (`b1e6baf`), shorter copy and optional background details (`4308d85`), correct focus after selecting the current page from a disclosure (`6868fd9`), and a concise disconnected provider view (`19bdb19`). More retains supporting tools; mobile uses an explicit Menu button. Account balances and claim panels appear after wallet connection, while provider terms, funding, the form and settlement queue stay visible.

Matched desktop counts after the changes are Protect **186** (23% fewer), Trade **189** (27% fewer) and Provide **215** (38% fewer). Menus and optional explanations were closed for both measurements. [After data](evidence/ui-simplification/after.json).

Twenty-three JavaScript tests and the production build pass, including connected/disconnected provider rendering and navigation regressions. Independent source review found no hidden essential terms or changed transaction logic. Browser checks verified desktop More opening, Tab navigation, Escape/focus restoration, optional-details keyboard access, and the 320px mobile Menu with no page overflow. Selecting the current route closes the menu and focuses main content. The selected pool, funding route and exact 12.3456789 provider draft survive a nested-backing acquisition round trip: acquiring ysALPHA deliberately opens Reserve Alpha, then returns to Receipt Reserve. A final separate copy fix (`9bc395a`) explains that acquisition and names the return destination; a regression covers the exact original pool, amount and input backing unit.

These are UI and navigation checks. Contract/signing evidence is from the preceding E2E release and was not rerun for this presentation-only change. Production deployment and screenshots are recorded in [HOSTING.md](HOSTING.md).

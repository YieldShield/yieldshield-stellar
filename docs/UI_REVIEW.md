# UI review — 11 October 2026

Published application: `8ed44f6bc2dab4815acd3de438186c80d3761b7b` at https://stellar.yieldshield.ai. Vercel deployment `dpl_EkhqKSzL7UtcwMTmku5UAApkn4rC` is READY; repository, branch, exact commit and custom-domain alias were verified. The later repository-banner merge and evidence commits contain no application changes.

## Fixes committed separately

- `29cb7af`: missing Stellar SVG favicon, conventional ICO and Apple touch icon; explicit static-asset routing.
- `7e934a0`: skip-to-content, route titles and focus, active navigation announcements, transaction review focus and return to its initiating control on cancellation.
- `bab1795`: distinct loading, unavailable and empty registry states with a retry action; removed irrelevant wallet prompts from informational pages.
- `d8bd052`: compact mobile brand/wallet header, 44px primary navigation targets and wrapping mode controls.
- `07c17cb`: named amount fields, announced token units and selected trading/conversion modes.
- `8f04493`: preserve portfolio rows during background refresh and include receipt/fee entitlements in the empty-state decision.
- `4819137`: preserve partial-exit draft and input identity across background position reads; reset drafts when account or position changes.
- `9671afb`: independent transfer and backing-credit destinations, with wallet-address autocorrection disabled.
- `947288d`: invalid position-link recovery while preserving the intentional backing-credit route.
- `b10aef1`: accurate activity loading, empty and stale-data states.
- `4098b6c`: readable activity and pagination labels.
- `017a961`, `8ed44f6`: five component regression cases and explicit test dependencies.

## Verification

- Production build passes; nine frontend tests pass (four exact-amount tests, five component regression cases).
- The regression cases exercise actual React components through pending/successful/failed refreshes, dirty partial exits, account and position changes, independent recipient review arguments, invalid IDs, receipt-only provider entitlements, and activity pool changes.
- Browser checks covered desktop and 320px/390px widths. Loaded protection, provider, market, creation and activity pages had no horizontal document overflow. The header retains accessible navigation through its horizontal row. Keyboard skip navigation, route focus/title, active navigation, amount units and toggle selection were checked.
- Entering `12.3456789` on Protect and following Buy receipts preserved the exact amount and selected pool on Trade.
- Public SVG, ICO and touch-icon requests each returned HTTP 200 with their correct image media type, not the application HTML. The public page declares all three assets. The final public browser console had no recorded errors.
- [Published desktop](evidence/ui-protect-desktop.jpg) and [published mobile](evidence/ui-protect-mobile.jpg) screenshots show the updated protection route.

The changes do not modify contracts or execute wallet transactions. Real Freighter browser-extension signing remains outside this UI verification; prior native lifecycle evidence is recorded separately in HOSTING.md.

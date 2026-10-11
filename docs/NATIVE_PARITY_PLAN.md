# Native Stellar feature parity

The V2 single-sponsor deployment remains available as a legacy market. V3 adds native holder ownership transfer, partial exits, permissionless provider shares, separate receipt rewards, withdrawal notices, fixed maturity and pull-credit settlement. This is Soroban ownership accounting, not an ERC-721 claim.

Every pool has an immutable end date and closes admissions 60 seconds earlier. Provider cash entry and withdrawal are blocked while any protected liability is outstanding. Anyone can settle expired positions into segregated backing credits without transferring to a potentially ineligible Stellar trustline. Credits are excluded from provider cash. Cash shares and historical receipt rewards are separate: providers checkpoint rewards before entry/withdrawal, so later entrants cannot acquire earlier rewards. Unallocated rounding dust stays in the pool rather than being treated as spendable cash.

The pinned factory admits only registered, TESTUSD-backed demo vaults. Pool creation is atomic and recorded on chain; a refundable TESTUSD creation bond is held until the pool end date. Catalog assets represent independently funded test vaults, not actual USDC or external investment strategies. The funded exchange offers real inventory-backed buy/sell transactions priced at test vault redemption value plus a disclosed spread, with onchain limits and deadlines.

Routes: /markets, /markets/:pool, /trade, /protect, /provide, /positions, /positions/:id, /faucet, /assets, /create-pool, /status, /how-it-works, /learn/scenarios, /legal, /legacy. Selected pool is carried in the URL. All transaction review state binds the wallet, pool, asset, amount, output limit and deadline. The existing wallet safety checks and transaction recovery hash remain.

No XLM yield, real stablecoin guarantees, oracle prices or production readiness claims are introduced. XLM is used only for test network fees/reserves. The current prototype is unaudited and uses valueless tokens. Grant documents remain unchanged pending user review.

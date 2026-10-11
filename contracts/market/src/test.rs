use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token,
};
use yieldshield_vault::{DemoVault, DemoVaultClient};
const U: i128 = 10_000_000;
struct Fixture {
    e: Env,
    operator: Address,
    owner: Address,
    backing: Address,
    vault: Address,
    market: Address,
}
impl Fixture {
    fn new() -> Self {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().with_mut(|l| l.timestamp = 1_000);
        let operator = Address::generate(&e);
        let owner = Address::generate(&e);
        let backing = e
            .register_stellar_asset_contract_v2(operator.clone())
            .address();
        let mint = token::StellarAssetClient::new(&e, &backing);
        mint.mint(&operator, &(10_000 * U));
        mint.mint(&owner, &(1_000 * U));
        let vault = e.register(DemoVault, (&backing, &operator));
        let v = DemoVaultClient::new(&e, &vault);
        v.deposit(&operator, &(1_000 * U), &(1_000 * U), &u64::MAX);
        v.deposit(&owner, &(100 * U), &(100 * U), &u64::MAX);
        let market = e.register(Market, (&backing, &vault, &operator, &30_u32));
        MarketClient::new(&e, &market).fund(&operator, &(1_000 * U), &(500 * U));
        Self {
            e,
            operator,
            owner,
            backing,
            vault,
            market,
        }
    }
    fn m(&self) -> MarketClient<'_> {
        MarketClient::new(&self.e, &self.market)
    }
    fn v(&self) -> DemoVaultClient<'_> {
        DemoVaultClient::new(&self.e, &self.vault)
    }
    fn cash(&self, who: &Address) -> i128 {
        token::Client::new(&self.e, &self.backing).balance(who)
    }
}
#[test]
fn real_buy_and_sell_conserve_tokens_and_charge_spread() {
    let f = Fixture::new();
    let cash = f.cash(&f.owner);
    let receipts = f.v().balance(&f.owner);
    assert_eq!(f.m().preview_buy(&(10 * U)), 100_300_000);
    assert_eq!(f.m().preview_sell(&(10 * U)), 99_700_000);
    let spent = f.m().buy(&f.owner, &(10 * U), &100_300_000, &1_120);
    assert_eq!(f.cash(&f.owner), cash - spent);
    assert_eq!(f.v().balance(&f.owner), receipts + 10 * U);
    let got = f.m().sell(&f.owner, &(10 * U), &99_700_000, &1_120);
    assert_eq!(f.cash(&f.owner), cash - 600_000);
    assert_eq!(f.v().balance(&f.owner), receipts);
    assert_eq!(f.m().inventory().backing, 1_000 * U + spent - got);
    assert_eq!(f.m().inventory().receipts, 500 * U);
}
#[test]
fn intervening_gain_rejects_reviewed_buy_atomically() {
    let f = Fixture::new();
    let q = f.m().preview_buy(&(10 * U));
    f.v().donate(&f.operator, &(100 * U));
    let cash = f.cash(&f.owner);
    let inventory = f.m().inventory();
    assert!(f.m().try_buy(&f.owner, &(10 * U), &q, &1_120).is_err());
    assert_eq!(f.cash(&f.owner), cash);
    assert_eq!(f.m().inventory().receipts, inventory.receipts);
    let fresh = f.m().preview_buy(&(10 * U));
    assert!(fresh > q);
    assert_eq!(f.m().buy(&f.owner, &(10 * U), &fresh, &1_120), fresh);
}
#[test]
fn intervening_loss_rejects_reviewed_sell_atomically() {
    let f = Fixture::new();
    let q = f.m().preview_sell(&(10 * U));
    f.v().simulate_loss(&(100 * U));
    let cash = f.cash(&f.owner);
    let shares = f.v().balance(&f.owner);
    assert!(f.m().try_sell(&f.owner, &(10 * U), &q, &1_120).is_err());
    assert_eq!(f.cash(&f.owner), cash);
    assert_eq!(f.v().balance(&f.owner), shares);
    let fresh = f.m().preview_sell(&(10 * U));
    assert!(fresh < q);
    assert_eq!(f.m().sell(&f.owner, &(10 * U), &fresh, &1_120), fresh);
}
#[test]
fn expired_deadlines_and_invalid_limits_fail_without_transfer() {
    let f = Fixture::new();
    let cash = f.cash(&f.owner);
    assert!(f.m().try_buy(&f.owner, &U, &(2 * U), &999).is_err());
    assert!(f.m().try_sell(&f.owner, &U, &1, &999).is_err());
    for n in [-1, 0] {
        assert!(f.m().try_buy(&f.owner, &U, &n, &1_120).is_err());
        assert!(f.m().try_sell(&f.owner, &U, &n, &1_120).is_err());
        assert!(f.m().try_preview_buy(&n).is_err());
        assert!(f.m().try_preview_sell(&n).is_err());
    }
    assert!(f.m().try_preview_buy(&(MAX_AMOUNT + 1)).is_err());
    assert_eq!(f.cash(&f.owner), cash);
}
#[test]
fn depleted_inventory_rejects_and_never_mints_receipts_or_backing() {
    let f = Fixture::new();
    let cash = f.cash(&f.owner);
    let shares = f.v().balance(&f.owner);
    let q = f.m().preview_buy(&(501 * U));
    assert!(f.m().try_buy(&f.owner, &(501 * U), &q, &1_120).is_err());
    f.m().withdraw(&f.operator, &(1_000 * U), &0);
    assert!(f.m().try_sell(&f.owner, &U, &1, &1_120).is_err());
    assert_eq!(f.cash(&f.owner), cash);
    assert_eq!(f.v().balance(&f.owner), shares);
    assert_eq!(f.m().inventory().backing, 0);
}
#[test]
fn insufficient_trader_assets_rolls_back_both_sides() {
    let f = Fixture::new();
    let q = f.m().preview_sell(&(101 * U));
    let cash = f.cash(&f.owner);
    assert!(f.m().try_sell(&f.owner, &(101 * U), &q, &1_120).is_err());
    let poor = Address::generate(&f.e);
    assert!(f.m().try_buy(&poor, &U, &(2 * U), &1_120).is_err());
    assert_eq!(f.cash(&f.owner), cash);
    assert_eq!(f.m().inventory().backing, 1_000 * U);
    assert_eq!(f.m().inventory().receipts, 500 * U);
}
#[test]
fn rounding_is_conservative_and_zero_value_cannot_buy_free_inventory() {
    let f = Fixture::new();
    assert_eq!(f.m().preview_buy(&1), 2);
    assert!(f.m().try_preview_sell(&1).is_err());
    let supply = f.v().total_supply();
    f.v().simulate_loss(&(1_100 * U));
    assert_eq!(f.v().preview_redeem(&supply), 0);
    assert!(f.m().try_preview_buy(&U).is_err());
    assert!(f.m().try_buy(&f.owner, &U, &U, &1_120).is_err());
    assert!(f.m().try_sell(&f.owner, &U, &1, &1_120).is_err());
}
#[test]
fn donations_are_not_lp_claims_and_only_operator_can_withdraw() {
    let f = Fixture::new();
    f.m().fund(&f.owner, &U, &U);
    assert_eq!(f.m().inventory().backing, 1_001 * U);
    assert_eq!(f.m().inventory().receipts, 501 * U);
    assert!(f.m().try_fund(&f.owner, &0, &0).is_err());
    assert!(f.m().try_fund(&f.owner, &-1, &U).is_err());
    f.e.mock_auths(&[]);
    assert!(f.m().try_withdraw(&f.owner, &U, &U).is_err());
    assert!(f.m().try_fund(&f.owner, &U, &0).is_err());
    assert!(f.m().try_buy(&f.owner, &U, &(2 * U), &1_120).is_err());
    assert!(f.m().try_sell(&f.owner, &U, &1, &1_120).is_err());
}
#[test]
#[should_panic(expected = "different backing asset")]
fn constructor_rejects_wrong_backing() {
    let f = Fixture::new();
    let other =
        f.e.register_stellar_asset_contract_v2(f.operator.clone())
            .address();
    f.e.register(Market, (&other, &f.vault, &f.operator, &30_u32));
}
#[test]
#[should_panic(expected = "fee exceeds 5 percent")]
fn constructor_rejects_excessive_fee() {
    let f = Fixture::new();
    f.e.register(Market, (&f.backing, &f.vault, &f.operator, &501_u32));
}
#[test]
fn two_vault_markets_use_independent_values_and_inventories() {
    let f = Fixture::new();
    let vault2 = f.e.register(DemoVault, (&f.backing, &f.operator));
    let v2 = DemoVaultClient::new(&f.e, &vault2);
    v2.deposit(&f.operator, &(100 * U), &(100 * U), &u64::MAX);
    v2.donate(&f.operator, &(100 * U));
    let market2 =
        f.e.register(Market, (&f.backing, &vault2, &f.operator, &0_u32));
    let m2 = MarketClient::new(&f.e, &market2);
    m2.fund(&f.operator, &(100 * U), &(50 * U));
    let q = m2.preview_buy(&U);
    assert_eq!(q, v2.preview_redeem(&U));
    assert!(q > f.m().preview_buy(&U));
    m2.buy(&f.owner, &U, &q, &1_120);
    assert_eq!(v2.balance(&f.owner), U);
    assert_eq!(f.m().inventory().receipts, 500 * U);
    assert_eq!(f.m().inventory().backing, 1_000 * U);
    assert_eq!(m2.inventory().receipts, 49 * U);
}

use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger},
    token, IntoVal, TryFromVal, Val, Vec,
};
use yieldshield_vault::{DemoVault, DemoVaultClient};
const U: i128 = 10_000_000;
struct Fixture {
    e: Env,
    admin: Address,
    owner: Address,
    backing: Address,
    vault: Address,
    pool: Address,
}
impl Fixture {
    fn new() -> Self {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().with_mut(|l| l.timestamp = 1000);
        let admin = Address::generate(&e);
        let owner = Address::generate(&e);
        let backing = e
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        token::StellarAssetClient::new(&e, &backing).mint(&admin, &(10_000 * U));
        token::StellarAssetClient::new(&e, &backing).mint(&owner, &(1_000 * U));
        let vault = e.register(DemoVault, (&backing, &admin));
        let pool = e.register(Pool, (&admin, &backing, &vault));
        DemoVaultClient::new(&e, &vault).deposit(&owner, &(100 * U), &1, &u64::MAX);
        PoolClient::new(&e, &pool).fund(&(1_000 * U));
        Self {
            e,
            admin,
            owner,
            backing,
            vault,
            pool,
        }
    }
    fn p(&self) -> PoolClient<'_> {
        PoolClient::new(&self.e, &self.pool)
    }
    fn v(&self) -> DemoVaultClient<'_> {
        DemoVaultClient::new(&self.e, &self.vault)
    }
    fn tick(&self) {
        self.e.ledger().with_mut(|l| l.timestamp += 61);
    }
}
#[test]
fn reserves_full_payout_and_buffer() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U), &1, &u64::MAX);
    let s = f.p().state();
    assert_eq!(id, 1);
    assert_eq!(s.reserved, 150 * U);
    assert_eq!(s.active, 1);
    assert_eq!(f.p().position(&id).claim, 100 * U);
}
#[test]
fn loss_then_backing_exit_and_sponsor_inventory() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U), &1, &u64::MAX);
    f.v().simulate_loss(&(40 * U));
    assert_eq!(f.v().nav(), 6_000_000);
    f.tick();
    let before = token::Client::new(&f.e, &f.backing).balance(&f.owner);
    assert_eq!(f.p().exit(&id, &true, &0, &u64::MAX), 100 * U);
    assert_eq!(
        token::Client::new(&f.e, &f.backing).balance(&f.owner) - before,
        100 * U
    );
    let s = f.p().state();
    assert_eq!(s.reserved, 0);
    assert_eq!(s.liquidity, 900 * U);
    assert_eq!(s.earned, 100 * U);
    f.p().withdraw_earned(&(100 * U));
    assert_eq!(f.v().redeem(&f.admin, &(100 * U), &0, &u64::MAX), 60 * U);
}
#[test]
fn realized_gain_fee_only() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U), &1, &u64::MAX);
    f.v().donate(&f.admin, &(25 * U));
    f.tick();
    let out = f.p().exit(&id, &false, &0, &u64::MAX);
    assert_eq!(out, 98 * U + 1);
    assert_eq!(f.p().state().earned, 2 * U - 1);
    assert_eq!(f.v().redeem(&f.owner, &out, &0, &u64::MAX), 122_5000001);
}
#[test]
fn no_gain_no_fee() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U), &1, &u64::MAX);
    f.tick();
    assert_eq!(f.p().exit(&id, &false, &0, &u64::MAX), 100 * U);
    assert_eq!(f.p().state().earned, 0);
}
#[test]
fn zero_nav_underlying_exit_remains_available() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U), &1, &u64::MAX);
    f.v().simulate_loss(&(100 * U));
    f.tick();
    assert_eq!(f.p().exit(&id, &false, &0, &u64::MAX), 100 * U);
}
#[test]
fn enforces_exit_delay() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U), &1, &u64::MAX);
    assert!(f.p().try_exit(&id, &true, &0, &u64::MAX).is_err());
}
#[test]
fn prevents_double_exit() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U), &1, &u64::MAX);
    f.tick();
    f.p().exit(&id, &true, &0, &u64::MAX);
    assert!(f.p().try_exit(&id, &true, &0, &u64::MAX).is_err());
}
#[test]
fn protects_reserved_backing_and_user_receipts() {
    let f = Fixture::new();
    f.p().protect(&f.owner, &(100 * U), &1, &u64::MAX);
    assert!(f.p().try_withdraw_reserve(&(851 * U)).is_err());
    assert!(f.p().try_withdraw_earned(&U).is_err());
    f.p().withdraw_reserve(&(850 * U));
    assert_eq!(f.p().state().liquidity, 150 * U);
}
#[test]
fn no_unfunded_claim() {
    let f = Fixture::new();
    f.p().withdraw_reserve(&(950 * U));
    assert!(f
        .p()
        .try_protect(&f.owner, &(100 * U), &1, &u64::MAX)
        .is_err());
    assert_eq!(f.p().state().active, 0);
}
#[test]
fn disallows_negative_and_dust() {
    let f = Fixture::new();
    assert!(f.p().try_protect(&f.owner, &-1, &1, &u64::MAX).is_err());
    assert!(f.p().try_fund(&0).is_err());
    f.v().simulate_loss(&(99 * U));
    assert!(f.p().try_protect(&f.owner, &1, &1, &u64::MAX).is_err());
}
#[test]
#[should_panic(expected = "different asset")]
fn rejects_wrong_backing_asset() {
    let f = Fixture::new();
    let other =
        f.e.register_stellar_asset_contract_v2(f.admin.clone())
            .address();
    let wrong = f.e.register(Pool, (&f.admin, &other, &f.vault));
    let _ = wrong;
}
#[test]
fn authorizes_owner_and_token_transfer() {
    let f = Fixture::new();
    f.p().protect(&f.owner, &(10 * U), &1, &u64::MAX);
    let auths = f.e.auths();
    assert_eq!(auths[0].0, f.owner);
    assert_eq!(
        auths[0].1.function,
        soroban_sdk::testutils::AuthorizedFunction::Contract((
            f.pool.clone(),
            soroban_sdk::Symbol::new(&f.e, "protect"),
            (f.owner.clone(), 10 * U, 1_i128, u64::MAX).into_val(&f.e)
        ))
    );
    assert!(!auths[0].1.sub_invocations.is_empty());
}
#[test]
fn unauthorized_calls_fail() {
    let f = Fixture::new();
    f.e.mock_auths(&[]);
    assert!(f.p().try_protect(&f.owner, &U, &1, &u64::MAX).is_err());
    assert!(f.p().try_withdraw_reserve(&U).is_err());
    assert!(f.v().try_simulate_loss(&U).is_err());
}
#[test]
fn vault_round_trip_and_transfer() {
    let f = Fixture::new();
    let other = Address::generate(&f.e);
    token::Client::new(&f.e, &f.vault).transfer(&f.owner, &other, &(30 * U));
    assert_eq!(f.v().redeem(&other, &(30 * U), &0, &u64::MAX), 30 * U);
    assert_eq!(f.v().total_supply(), 70 * U);
}

#[test]
fn deposit_quote_cannot_be_invalidated_by_donation() {
    let f = Fixture::new();
    let quote = f.v().preview_deposit(&(100 * U));
    assert_eq!(quote, 100 * U);
    f.v().donate(&f.admin, &(25 * U));
    let before = token::Client::new(&f.e, &f.backing).balance(&f.owner);
    assert!(f
        .v()
        .try_deposit(&f.owner, &(100 * U), &quote, &u64::MAX)
        .is_err());
    assert_eq!(
        token::Client::new(&f.e, &f.backing).balance(&f.owner),
        before
    );
    assert_eq!(f.v().total_supply(), 100 * U);
}

#[test]
fn withdrawal_and_claim_quotes_reject_intervening_loss() {
    let f = Fixture::new();
    let quote = f.v().preview_redeem(&(100 * U));
    assert_eq!(quote, 100 * U);
    f.v().simulate_loss(&(40 * U));
    assert!(f
        .v()
        .try_redeem(&f.owner, &(100 * U), &quote, &u64::MAX)
        .is_err());
    assert!(f
        .p()
        .try_protect(&f.owner, &(100 * U), &quote, &u64::MAX)
        .is_err());
    assert_eq!(f.p().state().active, 0);
    assert_eq!(f.v().balance(&f.owner), 100 * U);
    let current = f.v().preview_redeem(&(100 * U));
    let id = f.p().protect(&f.owner, &(100 * U), &current, &u64::MAX);
    assert_eq!(f.p().position(&id).claim, current);
    assert_eq!(current, 60 * U);
}

#[test]
fn receipt_exit_quote_rejects_intervening_gain_fee() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U), &1, &u64::MAX);
    let quote = f.p().preview_exit(&id, &false);
    assert_eq!(quote, 100 * U);
    f.v().donate(&f.admin, &(25 * U));
    f.tick();
    assert!(f.p().try_exit(&id, &false, &quote, &u64::MAX).is_err());
    assert!(!f.p().position(&id).closed);
    assert_eq!(f.p().state().reserved, 150 * U);
    let current = f.p().preview_exit(&id, &false);
    assert_eq!(f.p().exit(&id, &false, &current, &u64::MAX), current);
}

#[test]
fn deadlines_and_minima_are_enforced_without_mutation() {
    let f = Fixture::new();
    let expired = 999_u64;
    assert!(f.v().try_deposit(&f.owner, &U, &1, &expired).is_err());
    assert!(f.v().try_redeem(&f.owner, &U, &0, &expired).is_err());
    assert!(f.p().try_protect(&f.owner, &U, &1, &expired).is_err());
    assert!(f.v().try_deposit(&f.owner, &U, &0, &u64::MAX).is_err());
    assert!(f.p().try_protect(&f.owner, &U, &0, &u64::MAX).is_err());
    let id = f.p().protect(&f.owner, &U, &1, &1000);
    f.tick();
    assert!(f.p().try_exit(&id, &true, &0, &expired).is_err());
    assert!(f.p().try_exit(&id, &true, &-1, &u64::MAX).is_err());
    assert_eq!(f.p().state().active, 1);
    assert!(!f.p().position(&id).closed);
}

#[test]
fn virtual_liquidity_makes_seed_donation_attack_unprofitable() {
    let f = Fixture::new();
    let address = f.e.register(DemoVault, (&f.backing, &f.admin));
    let v = DemoVaultClient::new(&f.e, &address);
    v.deposit(&f.admin, &1, &1, &u64::MAX);
    let victim_quote = v.preview_deposit(&200);
    assert_eq!(victim_quote, 200);
    v.donate(&f.admin, &100);
    assert!(v
        .try_deposit(&f.owner, &200, &victim_quote, &u64::MAX)
        .is_err());
    // Even a victim explicitly accepting the lower quote cannot fund a profit
    // for this classic single-victim seed+donation attack.
    let revised_quote = v.preview_deposit(&200);
    assert_eq!(revised_quote, 3);
    v.deposit(&f.owner, &200, &revised_quote, &u64::MAX);
    let recovered = v.redeem(&f.admin, &1, &0, &u64::MAX);
    assert_eq!(recovered, 60);
    assert!(recovered < 101);
}

#[test]
fn zero_assets_and_full_redemption_never_create_unbacked_assets() {
    let f = Fixture::new();
    f.v().simulate_loss(&(100 * U));
    assert_eq!(f.v().preview_redeem(&(100 * U)), 0);
    assert!(f.v().try_deposit(&f.owner, &U, &1, &u64::MAX).is_err());
    assert_eq!(f.v().redeem(&f.owner, &(100 * U), &0, &u64::MAX), 0);
    assert_eq!(f.v().total_supply(), 0);
    assert_eq!(f.v().deposit(&f.owner, &U, &U, &u64::MAX), U);
    assert_eq!(f.v().redeem(&f.owner, &U, &U, &u64::MAX), U);
}

#[test]
fn token_and_pool_events_are_observable() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &U, &1, &u64::MAX);
    let expected_topics = soroban_sdk::vec![
        &f.e,
        symbol_short!("transfer").into_val(&f.e),
        f.owner.clone().into_val(&f.e),
        f.pool.clone().into_val(&f.e),
    ];
    assert!(has_event(
        &f.e,
        &f.vault,
        expected_topics,
        Some(U.into_val(&f.e))
    ));
    let protected_topics = soroban_sdk::vec![
        &f.e,
        symbol_short!("protect").into_val(&f.e),
        id.into_val(&f.e),
        f.owner.clone().into_val(&f.e),
    ];
    assert!(has_event(&f.e, &f.pool, protected_topics, None));
    f.v().approve(&f.owner, &f.admin, &U, &100);
    let approval_topics = soroban_sdk::vec![
        &f.e,
        symbol_short!("approve").into_val(&f.e),
        f.owner.clone().into_val(&f.e),
        f.admin.clone().into_val(&f.e),
    ];
    assert!(has_event(
        &f.e,
        &f.vault,
        approval_topics,
        Some((U, 100_u32).into_val(&f.e))
    ));
}

fn has_event(e: &Env, contract: &Address, topics: Vec<Val>, data: Option<Val>) -> bool {
    let expected_topics: soroban_sdk::xdr::VecM<soroban_sdk::xdr::ScVal> = topics.into();
    let expected_data = data.map(|v| soroban_sdk::xdr::ScVal::try_from_val(e, &v).unwrap());
    e.events()
        .all()
        .filter_by_contract(contract)
        .events()
        .iter()
        .any(|event| {
            let soroban_sdk::xdr::ContractEventBody::V0(body) = &event.body;
            body.topics == expected_topics
                && expected_data.as_ref().map_or(true, |d| d == &body.data)
        })
}

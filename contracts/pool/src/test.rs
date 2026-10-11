use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, IntoVal,
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
        DemoVaultClient::new(&e, &vault).deposit(&owner, &(100 * U));
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
    let id = f.p().protect(&f.owner, &(100 * U));
    let s = f.p().state();
    assert_eq!(id, 1);
    assert_eq!(s.reserved, 150 * U);
    assert_eq!(s.active, 1);
    assert_eq!(f.p().position(&id).claim, 100 * U);
}
#[test]
fn loss_then_backing_exit_and_sponsor_inventory() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U));
    f.v().simulate_loss(&(40 * U));
    assert_eq!(f.v().nav(), 6_000_000);
    f.tick();
    let before = token::Client::new(&f.e, &f.backing).balance(&f.owner);
    assert_eq!(f.p().exit(&id, &true), 100 * U);
    assert_eq!(
        token::Client::new(&f.e, &f.backing).balance(&f.owner) - before,
        100 * U
    );
    let s = f.p().state();
    assert_eq!(s.reserved, 0);
    assert_eq!(s.liquidity, 900 * U);
    assert_eq!(s.earned, 100 * U);
    f.p().withdraw_earned(&(100 * U));
    assert_eq!(f.v().redeem(&f.admin, &(100 * U)), 60 * U);
}
#[test]
fn realized_gain_fee_only() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U));
    f.v().donate(&f.admin, &(25 * U));
    f.tick();
    let out = f.p().exit(&id, &false);
    assert_eq!(out, 98 * U);
    assert_eq!(f.p().state().earned, 2 * U);
    assert_eq!(f.v().redeem(&f.owner, &out), 122_5000000);
}
#[test]
fn no_gain_no_fee() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U));
    f.tick();
    assert_eq!(f.p().exit(&id, &false), 100 * U);
    assert_eq!(f.p().state().earned, 0);
}
#[test]
fn zero_nav_underlying_exit_remains_available() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U));
    f.v().simulate_loss(&(100 * U));
    f.tick();
    assert_eq!(f.p().exit(&id, &false), 100 * U);
}
#[test]
fn enforces_exit_delay() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U));
    assert!(f.p().try_exit(&id, &true).is_err());
}
#[test]
fn prevents_double_exit() {
    let f = Fixture::new();
    let id = f.p().protect(&f.owner, &(100 * U));
    f.tick();
    f.p().exit(&id, &true);
    assert!(f.p().try_exit(&id, &true).is_err());
}
#[test]
fn protects_reserved_backing_and_user_receipts() {
    let f = Fixture::new();
    f.p().protect(&f.owner, &(100 * U));
    assert!(f.p().try_withdraw_reserve(&(851 * U)).is_err());
    assert!(f.p().try_withdraw_earned(&U).is_err());
    f.p().withdraw_reserve(&(850 * U));
    assert_eq!(f.p().state().liquidity, 150 * U);
}
#[test]
fn no_unfunded_claim() {
    let f = Fixture::new();
    f.p().withdraw_reserve(&(950 * U));
    assert!(f.p().try_protect(&f.owner, &(100 * U)).is_err());
    assert_eq!(f.p().state().active, 0);
}
#[test]
fn disallows_negative_and_dust() {
    let f = Fixture::new();
    assert!(f.p().try_protect(&f.owner, &-1).is_err());
    assert!(f.p().try_fund(&0).is_err());
    f.v().simulate_loss(&(99 * U));
    assert!(f.p().try_protect(&f.owner, &1).is_err());
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
    f.p().protect(&f.owner, &(10 * U));
    let auths = f.e.auths();
    assert_eq!(auths[0].0, f.owner);
    assert_eq!(
        auths[0].1.function,
        soroban_sdk::testutils::AuthorizedFunction::Contract((
            f.pool.clone(),
            soroban_sdk::Symbol::new(&f.e, "protect"),
            (f.owner.clone(), 10 * U).into_val(&f.e)
        ))
    );
    assert!(!auths[0].1.sub_invocations.is_empty());
}
#[test]
fn unauthorized_calls_fail() {
    let f = Fixture::new();
    f.e.mock_auths(&[]);
    assert!(f.p().try_protect(&f.owner, &U).is_err());
    assert!(f.p().try_withdraw_reserve(&U).is_err());
    assert!(f.v().try_simulate_loss(&U).is_err());
}
#[test]
fn vault_round_trip_and_transfer() {
    let f = Fixture::new();
    let other = Address::generate(&f.e);
    token::Client::new(&f.e, &f.vault).transfer(&f.owner, &other, &(30 * U));
    assert_eq!(f.v().redeem(&other, &(30 * U)), 30 * U);
    assert_eq!(f.v().total_supply(), 70 * U);
}

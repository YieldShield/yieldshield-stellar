use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token,
};
use yieldshield_vault::{DemoVault, DemoVaultClient};
const U: i128 = 10_000_000;
struct F {
    e: Env,
    a: Address,
    b: Address,
    h: Address,
    c: Address,
    v: Address,
    p: Address,
}
impl F {
    fn new() -> Self {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().with_mut(|l| l.timestamp = 1000);
        let a = Address::generate(&e);
        let b = Address::generate(&e);
        let h = Address::generate(&e);
        let c = e.register_stellar_asset_contract_v2(a.clone()).address();
        for x in [&a, &b, &h] {
            token::StellarAssetClient::new(&e, &c).mint(x, &(10000 * U));
        }
        let v = e.register(DemoVault, (&c, &a));
        DemoVaultClient::new(&e, &v).deposit(&h, &(1000 * U), &1, &u64::MAX);
        let p = e.register(
            PoolV3,
            (
                &a,
                &c,
                &v,
                &a,
                Terms {
                    collateral_bps: 15000,
                    junior_fee_bps: 1000,
                    creator_fee_bps: 100,
                    duration: 600,
                    notice_delay: 30,
                },
            ),
        );
        Self {
            e,
            a,
            b,
            h,
            c,
            v,
            p,
        }
    }
    fn p(&self) -> PoolV3Client<'_> {
        PoolV3Client::new(&self.e, &self.p)
    }
    fn v(&self) -> DemoVaultClient<'_> {
        DemoVaultClient::new(&self.e, &self.v)
    }
    fn time(&self, t: u64) {
        self.e.ledger().with_mut(|l| l.timestamp = t)
    }
    fn seed(&self) {
        self.p().provide(&self.a, &(1000 * U), &1, &u64::MAX);
        self.p().provide(&self.b, &(1000 * U), &1, &u64::MAX);
    }
}
#[test]
fn two_providers_partial_exit_transfer_and_rewards() {
    let f = F::new();
    f.seed();
    let id = f.p().protect(&f.h, &(100 * U), &1, &u64::MAX);
    f.time(1061);
    assert_eq!(
        f.p().exit(&id, &(40 * U), &true, &(40 * U), &u64::MAX),
        40 * U
    );
    assert_eq!(f.p().position(&id).reserved, 90 * U);
    f.p().transfer_position(&id, &f.b);
    assert_eq!(f.p().position(&id).owner, f.b);
    f.p().exit(&id, &(60 * U), &false, &(60 * U), &u64::MAX);
    assert!(f.p().position(&id).closed);
    assert_eq!(f.p().state().active, 0);
    assert_eq!(f.p().provider(&f.a).inventory, 20 * U);
    assert_eq!(f.p().provider(&f.b).inventory, 20 * U);
    f.p().claim_inventory(&f.a, &f.a);
    f.p().notice(&f.a, &(500 * U));
    f.time(1092);
    assert_eq!(f.p().withdraw(&f.a, &(500 * U), &0, &u64::MAX), 490 * U);
}
#[test]
fn maturity_creates_credit_without_recipient_transfer() {
    let f = F::new();
    f.seed();
    let id = f.p().protect(&f.h, &(100 * U), &1, &u64::MAX);
    let before = token::Client::new(&f.e, &f.c).balance(&f.h);
    f.time(1600);
    f.p().settle(&id);
    assert_eq!(token::Client::new(&f.e, &f.c).balance(&f.h), before);
    assert_eq!(f.p().credit(&f.h), 100 * U);
    let s = f.p().state();
    assert_eq!(s.credit_total, 100 * U);
    assert_eq!(s.liquidity, 1900 * U);
    assert_eq!(s.reserved, 0);
    assert_eq!(s.active, 0);
    f.p().notice(&f.a, &(1000 * U));
    f.time(1631);
    f.p().withdraw(&f.a, &(1000 * U), &0, &u64::MAX);
    assert_eq!(f.p().credit(&f.h), 100 * U);
    f.p().claim_backing(&f.h, &f.b);
    assert_eq!(f.p().credit(&f.h), 0);
    assert_eq!(f.p().state().credit_total, 0);
}
#[test]
fn new_provider_cannot_buy_old_rewards() {
    let f = F::new();
    f.p().provide(&f.a, &(1000 * U), &1, &u64::MAX);
    let id = f.p().protect(&f.h, &(100 * U), &1, &u64::MAX);
    f.time(1061);
    f.p().exit(&id, &(100 * U), &true, &0, &u64::MAX);
    let b = f.p().provide(&f.b, &(900 * U), &1, &u64::MAX);
    assert_eq!(b, 1000 * U);
    assert_eq!(f.p().provider(&f.a).inventory, 100 * U);
    assert_eq!(f.p().provider(&f.b).inventory, 0);
    assert_eq!(f.p().preview_withdraw(&b), 900 * U);
}
#[test]
fn late_provider_does_not_receive_creator_fee() {
    let f = F::new();
    f.seed();
    let id = f.p().protect(&f.h, &(100 * U), &1, &u64::MAX);
    f.v().donate(&f.a, &(1000 * U));
    f.time(1061);
    f.p().exit(&id, &(100 * U), &false, &0, &u64::MAX);
    let s = f.p().state();
    assert!(s.creator_rewards > 0);
    assert!(s.reward_balance > 0);
    assert_eq!(s.liquidity, 2000 * U);
    let n = f.p().claim_creator(&f.a);
    assert!(n > 0);
    assert_eq!(f.p().state().creator_rewards, 0);
}
#[test]
fn partial_rounding_keeps_remaining_floor_reserved() {
    let f = F::new();
    f.seed();
    let id = f.p().protect(&f.h, &101, &1, &u64::MAX);
    f.time(1061);
    for _ in 0..100 {
        f.p().exit(&id, &1, &true, &0, &u64::MAX);
        let p = f.p().position(&id);
        assert!(p.reserved >= p.claim);
    }
    f.p().exit(&id, &1, &true, &0, &u64::MAX);
    assert_eq!(f.p().state().reserved, 0);
}
#[test]
#[should_panic(expected = "liabilities outstanding")]
fn no_entry_while_active() {
    let f = F::new();
    f.seed();
    f.p().protect(&f.h, &(100 * U), &1, &u64::MAX);
    f.p().provide(&f.b, &U, &1, &u64::MAX);
}
#[test]
#[should_panic(expected = "liabilities outstanding")]
fn no_withdraw_while_active() {
    let f = F::new();
    f.seed();
    f.p().notice(&f.a, &U);
    f.p().protect(&f.h, &(100 * U), &1, &u64::MAX);
    f.time(1100);
    f.p().withdraw(&f.a, &U, &0, &u64::MAX);
}
#[test]
#[should_panic(expected = "position closed")]
fn no_double_settlement() {
    let f = F::new();
    f.seed();
    let id = f.p().protect(&f.h, &U, &1, &u64::MAX);
    f.time(1600);
    f.p().settle(&id);
    f.p().settle(&id);
}
#[test]
#[should_panic(expected = "position closed")]
fn no_closed_transfer() {
    let f = F::new();
    f.seed();
    let id = f.p().protect(&f.h, &U, &1, &u64::MAX);
    f.time(1600);
    f.p().settle(&id);
    f.p().transfer_position(&id, &f.b);
}
#[test]
#[should_panic(expected = "admissions closed")]
fn fixed_admission_cutoff() {
    let f = F::new();
    f.seed();
    f.time(1540);
    f.p().protect(&f.h, &U, &1, &u64::MAX);
}
#[test]
#[should_panic(expected = "deadline expired")]
fn expired_quote() {
    let f = F::new();
    f.p().provide(&f.a, &U, &1, &999);
}
#[test]
#[should_panic(expected = "share slippage")]
fn share_minimum_enforced() {
    let f = F::new();
    f.p().provide(&f.a, &U, &(U + 1), &u64::MAX);
}
#[test]
#[should_panic(expected = "output slippage")]
fn exit_minimum_enforced() {
    let f = F::new();
    f.seed();
    let id = f.p().protect(&f.h, &U, &1, &u64::MAX);
    f.time(1061);
    f.p().exit(&id, &U, &true, &(U + 1), &u64::MAX);
}
#[test]
fn nested_vault_backing_is_native_receipt() {
    let f = F::new();
    let outer = f.e.register(DemoVault, (&f.v, &f.a));
    DemoVaultClient::new(&f.e, &outer).deposit(&f.h, &(100 * U), &1, &u64::MAX);
    let p = f.e.register(
        PoolV3,
        (
            &f.a,
            &f.v,
            &outer,
            &f.a,
            Terms {
                collateral_bps: 15000,
                junior_fee_bps: 1000,
                creator_fee_bps: 0,
                duration: 600,
                notice_delay: 30,
            },
        ),
    );
    let p = PoolV3Client::new(&f.e, &p);
    p.provide(&f.h, &(500 * U), &1, &u64::MAX);
    let id = p.protect(&f.h, &(100 * U), &1, &u64::MAX);
    f.time(1061);
    assert_eq!(
        p.exit(&id, &(100 * U), &true, &(100 * U), &u64::MAX),
        100 * U
    );
}
#[test]
fn tiny_distributions_and_share_churn_conserve_receipts() {
    let f = F::new();
    f.p().provide(&f.a, &997, &1, &u64::MAX);
    f.p().provide(&f.b, &991, &1, &u64::MAX);
    let mut total_claimed = 0;
    let mut total_distributed = 0;
    for round in 0..4 {
        let id = f.p().protect(&f.h, &31, &1, &u64::MAX);
        f.time(1061 + round * 100);
        f.p().exit(&id, &31, &true, &0, &u64::MAX);
        total_distributed += 31;
        for owner in [&f.a, &f.b] {
            let pending = f.p().provider(owner).inventory;
            if pending > 0 {
                total_claimed += f.p().claim_inventory(owner, owner);
            }
        }
        f.p().notice(&f.a, &7);
        f.time(1092 + round * 100);
        f.p().withdraw(&f.a, &7, &0, &u64::MAX);
        f.p().provide(&f.a, &7, &1, &u64::MAX);
        assert!(total_claimed <= total_distributed);
        assert_eq!(
            f.p().state().inventory_balance,
            total_distributed - total_claimed
        );
    }
    assert!(
        total_distributed - total_claimed <= 8,
        "rounding dust bounded for this sequence"
    );
}
#[test]
fn cancel_notice_resets_withdrawal_allowance() {
    let f = F::new();
    f.seed();
    f.p().notice(&f.a, &U);
    f.p().cancel_notice(&f.a);
    assert_eq!(f.p().provider(&f.a).notice_shares, 0);
}
#[test]
fn fee_and_inventory_indices_conserve_under_churn() {
    let f = F::new();
    f.p().provide(&f.a, &(997 * U + 3), &1, &u64::MAX);
    f.p().provide(&f.b, &(991 * U + 7), &1, &u64::MAX);
    let mut fees_claimed = 0;
    let mut inventory_claimed = 0;
    let mut distributed_fees = 0;
    let mut distributed_inventory = 0;
    for round in 0..4 {
        let id = f.p().protect(&f.h, &(11 * U + 3), &1, &u64::MAX);
        f.v().donate(&f.a, &(10 * U + round as i128));
        f.time(1061 + round * 100);
        let previous = f.p().state();
        f.p().exit(&id, &(5 * U + 1), &true, &0, &u64::MAX);
        let left = f.p().position(&id).shares;
        f.p().exit(&id, &left, &false, &0, &u64::MAX);
        let current = f.p().state();
        distributed_fees += current.reward_balance - previous.reward_balance;
        distributed_inventory += current.inventory_balance - previous.inventory_balance;
        for o in [&f.a, &f.b] {
            if f.p().provider(o).rewards > 0 {
                fees_claimed += f.p().claim_rewards(o, o);
            }
            if f.p().provider(o).inventory > 0 {
                inventory_claimed += f.p().claim_inventory(o, o);
            }
        }
        f.p().notice(&f.a, &(7 * U + 1));
        f.time(1092 + round * 100);
        f.p().withdraw(&f.a, &(7 * U + 1), &0, &u64::MAX);
        f.p().provide(&f.a, &(7 * U + 1), &1, &u64::MAX);
        assert!(fees_claimed <= distributed_fees);
        assert!(inventory_claimed <= distributed_inventory);
        assert_eq!(
            f.p().state().reward_balance,
            distributed_fees - fees_claimed
        );
        assert_eq!(
            f.p().state().inventory_balance,
            distributed_inventory - inventory_claimed
        );
    }
    assert!(distributed_fees - fees_claimed <= 8);
    assert!(distributed_inventory - inventory_claimed <= 8);
}
// Provider claims are paid all-or-nothing, so the sum of per-provider
// entitlements must never exceed the pool's balance. Late entrants used to
// receive a rounded-down debt (floor(shares * index)), letting their next
// accrual round up and over-allocate the inventory by one raw unit.
#[test]
fn late_entrants_never_overallocate_acquired_inventory() {
    let f = F::new();
    let c3 = Address::generate(&f.e);
    token::StellarAssetClient::new(&f.e, &f.c).mint(&c3, &(10000 * U));
    f.p().provide(&f.a, &(1000 * U), &1, &u64::MAX);
    let id = f.p().protect(&f.h, &(100 * U), &1, &u64::MAX);
    f.time(1061);
    f.p().exit(&id, &(100 * U), &true, &0, &u64::MAX);
    f.p().provide(&f.b, &(500 * U), &1, &u64::MAX);
    f.p().provide(&c3, &(700 * U), &1, &u64::MAX);
    let id2 = f.p().protect(&f.h, &(100 * U + 6), &1, &u64::MAX);
    f.time(1130);
    f.p().exit(&id2, &(100 * U + 6), &true, &0, &u64::MAX);
    let s = f.p().state();
    assert_eq!(s.inventory_balance, 200 * U + 6);
    let owed: i128 = [&f.a, &f.b, &c3]
        .iter()
        .map(|o| f.p().provider(o).inventory)
        .sum();
    assert!(owed <= s.inventory_balance, "entitlements exceed balance");
    let mut claimed = 0;
    for o in [&f.a, &f.b, &c3] {
        claimed += f.p().claim_inventory(o, o);
    }
    assert_eq!(claimed, owed);
    assert!(f.p().state().inventory_balance <= 3, "only rounding dust remains");
}
#[test]
fn late_entrants_never_overallocate_fee_rewards() {
    let f = F::new();
    let c3 = Address::generate(&f.e);
    token::StellarAssetClient::new(&f.e, &f.c).mint(&c3, &(10000 * U));
    f.p().provide(&f.a, &(1000 * U), &1, &u64::MAX);
    let id = f.p().protect(&f.h, &(164 * U + 39), &1, &u64::MAX);
    f.v().donate(&f.a, &(55 * U + 90));
    f.time(1061);
    f.p().exit(&id, &(164 * U + 39), &false, &0, &u64::MAX);
    f.p().provide(&f.b, &(527 * U + 77), &1, &u64::MAX);
    f.p().provide(&c3, &(301 * U + 16), &1, &u64::MAX);
    let id2 = f.p().protect(&f.h, &(106 * U + 18), &1, &u64::MAX);
    f.v().donate(&f.a, &(280 * U + 92));
    f.time(1130);
    f.p().exit(&id2, &(106 * U + 18), &false, &0, &u64::MAX);
    let s = f.p().state();
    let owed: i128 = [&f.a, &f.b, &c3]
        .iter()
        .map(|o| f.p().provider(o).rewards)
        .sum();
    assert!(owed <= s.reward_balance, "entitlements exceed balance");
    let mut claimed = 0;
    for o in [&f.a, &f.b, &c3] {
        claimed += f.p().claim_rewards(o, o);
    }
    assert_eq!(claimed, owed);
    assert!(f.p().state().reward_balance <= 3, "only rounding dust remains");
}

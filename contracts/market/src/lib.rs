#![no_std]
use soroban_sdk::{
    contract, contractclient, contractevent, contractimpl, contracttype, token, Address, Env,
};

const BPS: i128 = 10_000;
const MAX_AMOUNT: i128 = 1_000_000_000_000_000_000;
#[contractclient(name = "VaultClient")]
pub trait Vault {
    fn asset(e: Env) -> Address;
    fn preview_redeem(e: Env, shares: i128) -> i128;
}
#[contracttype]
#[derive(Clone)]
enum Key {
    State,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct State {
    pub backing: Address,
    pub vault: Address,
    pub operator: Address,
    pub fee_bps: u32,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct Inventory {
    pub backing: i128,
    pub receipts: i128,
}
#[contractevent(topics = ["trade"])]
pub struct Traded {
    #[topic]
    pub owner: Address,
    pub buy: bool,
    pub shares: i128,
    pub base_value: i128,
    pub backing_amount: i128,
}
#[contractevent(topics = ["fund"])]
pub struct Funded {
    #[topic]
    pub owner: Address,
    pub backing_amount: i128,
    pub receipt_amount: i128,
}
#[contractevent(topics = ["withdraw"])]
pub struct Withdrawn {
    #[topic]
    pub recipient: Address,
    pub backing_amount: i128,
    pub receipt_amount: i128,
}
#[contract]
pub struct Market;
fn state(e: &Env) -> State {
    e.storage().instance().get(&Key::State).unwrap()
}
fn touch(e: &Env) {
    let target = e.storage().max_ttl().min(1_000_000);
    e.storage()
        .instance()
        .extend_ttl(target.min(250_000), target);
}
fn positive(value: i128) {
    assert!(value > 0 && value <= MAX_AMOUNT, "amount out of bounds");
}
fn amounts(backing: i128, receipts: i128) {
    assert!(
        backing >= 0 && backing <= MAX_AMOUNT && receipts >= 0 && receipts <= MAX_AMOUNT,
        "amount out of bounds"
    );
    assert!(backing > 0 || receipts > 0, "empty transfer");
}
fn quote(e: &Env, s: &State, shares: i128, buy: bool) -> (i128, i128) {
    positive(shares);
    // Exact redeemable quantity, not a second rounded per-share NAV.
    let base = VaultClient::new(e, &s.vault).preview_redeem(&shares);
    assert!(base > 0, "zero receipt value");
    let fee = i128::from(s.fee_bps);
    let output = if buy {
        base.checked_mul(BPS + fee)
            .unwrap()
            .checked_add(BPS - 1)
            .unwrap()
            / BPS
    } else {
        base.checked_mul(BPS - fee).unwrap() / BPS
    };
    assert!(output > 0, "quote rounds to zero");
    (base, output)
}
fn deadline(e: &Env, expires: u64) {
    assert!(e.ledger().timestamp() <= expires, "deadline expired");
}
fn transfer(e: &Env, asset: &Address, from: &Address, to: &Address, amount: i128) {
    if amount > 0 {
        token::Client::new(e, asset).transfer(from, to, &amount);
    }
}
#[contractimpl]
impl Market {
    pub fn __constructor(
        e: Env,
        backing: Address,
        vault: Address,
        operator: Address,
        fee_bps: u32,
    ) {
        assert!(fee_bps <= 500, "fee exceeds 5 percent");
        assert!(
            backing != vault && VaultClient::new(&e, &vault).asset() == backing,
            "different backing asset"
        );
        assert!(
            token::Client::new(&e, &backing).decimals() == 7
                && token::Client::new(&e, &vault).decimals() == 7,
            "seven decimals required"
        );
        e.storage().instance().set(
            &Key::State,
            &State {
                backing,
                vault,
                operator,
                fee_bps,
            },
        );
        touch(&e);
    }
    pub fn state(e: Env) -> State {
        state(&e)
    }
    pub fn inventory(e: Env) -> Inventory {
        let s = state(&e);
        let here = e.current_contract_address();
        Inventory {
            backing: token::Client::new(&e, &s.backing).balance(&here),
            receipts: token::Client::new(&e, &s.vault).balance(&here),
        }
    }
    pub fn preview_buy(e: Env, shares: i128) -> i128 {
        quote(&e, &state(&e), shares, true).1
    }
    pub fn preview_sell(e: Env, shares: i128) -> i128 {
        quote(&e, &state(&e), shares, false).1
    }
    pub fn buy(e: Env, owner: Address, shares: i128, max_pay: i128, deadline: u64) -> i128 {
        owner.require_auth();
        crate::deadline(&e, deadline);
        positive(max_pay);
        let s = state(&e);
        let (base_value, cost) = quote(&e, &s, shares, true);
        assert!(cost <= max_pay, "maximum payment exceeded");
        assert!(
            Self::inventory(e.clone()).receipts >= shares,
            "insufficient receipt inventory"
        );
        let here = e.current_contract_address();
        touch(&e);
        transfer(&e, &s.backing, &owner, &here, cost);
        transfer(&e, &s.vault, &here, &owner, shares);
        Traded {
            owner,
            buy: true,
            shares,
            base_value,
            backing_amount: cost,
        }
        .publish(&e);
        cost
    }
    pub fn sell(e: Env, owner: Address, shares: i128, min_out: i128, deadline: u64) -> i128 {
        owner.require_auth();
        crate::deadline(&e, deadline);
        positive(min_out);
        let s = state(&e);
        let (base_value, proceeds) = quote(&e, &s, shares, false);
        assert!(proceeds >= min_out, "minimum proceeds not met");
        assert!(
            Self::inventory(e.clone()).backing >= proceeds,
            "insufficient backing inventory"
        );
        let here = e.current_contract_address();
        touch(&e);
        transfer(&e, &s.vault, &owner, &here, shares);
        transfer(&e, &s.backing, &here, &owner, proceeds);
        Traded {
            owner,
            buy: false,
            shares,
            base_value,
            backing_amount: proceeds,
        }
        .publish(&e);
        proceeds
    }
    /// Authenticated donations create inventory, not a provider share or withdrawal claim.
    pub fn fund(e: Env, owner: Address, backing_amount: i128, receipt_amount: i128) {
        owner.require_auth();
        amounts(backing_amount, receipt_amount);
        let s = state(&e);
        let here = e.current_contract_address();
        touch(&e);
        transfer(&e, &s.backing, &owner, &here, backing_amount);
        transfer(&e, &s.vault, &owner, &here, receipt_amount);
        Funded {
            owner,
            backing_amount,
            receipt_amount,
        }
        .publish(&e);
    }
    /// Inventory is operator managed and separate from every protection pool reserve.
    pub fn withdraw(e: Env, recipient: Address, backing_amount: i128, receipt_amount: i128) {
        let s = state(&e);
        s.operator.require_auth();
        amounts(backing_amount, receipt_amount);
        let held = Self::inventory(e.clone());
        assert!(
            held.backing >= backing_amount && held.receipts >= receipt_amount,
            "insufficient inventory"
        );
        let here = e.current_contract_address();
        touch(&e);
        transfer(&e, &s.backing, &here, &recipient, backing_amount);
        transfer(&e, &s.vault, &here, &recipient, receipt_amount);
        Withdrawn {
            recipient,
            backing_amount,
            receipt_amount,
        }
        .publish(&e);
    }
}
#[cfg(test)]
mod test;

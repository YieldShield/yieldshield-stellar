#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, String};
const UNIT: i128 = 10_000_000;
#[contracttype]
#[derive(Clone)]
enum Key {
    Asset,
    Admin,
    Supply,
    Balance(Address),
    Allowance(Address, Address),
}
#[contracttype]
#[derive(Clone)]
struct Allowance {
    amount: i128,
    expires: u32,
}
#[contract]
pub struct DemoVault;
fn touch(e: &Env) {
    e.storage().instance().extend_ttl(10_000, 50_000);
}
fn balance(e: &Env, a: &Address) -> i128 {
    e.storage()
        .persistent()
        .get(&Key::Balance(a.clone()))
        .unwrap_or(0)
}
fn put_balance(e: &Env, a: &Address, v: i128) {
    let k = Key::Balance(a.clone());
    e.storage().persistent().set(&k, &v);
    e.storage().persistent().extend_ttl(&k, 10_000, 50_000);
}
fn supply(e: &Env) -> i128 {
    e.storage().instance().get(&Key::Supply).unwrap_or(0)
}
fn positive(v: i128) {
    assert!(
        v > 0 && v <= 1_000_000_000_000_000_000,
        "amount out of bounds"
    );
}
fn move_shares(e: &Env, from: &Address, to: &Address, amount: i128) {
    assert!(amount >= 0, "negative amount");
    assert!(balance(e, from) >= amount, "insufficient shares");
    put_balance(e, from, balance(e, from) - amount);
    put_balance(e, to, balance(e, to) + amount);
}
fn spend_allowance(e: &Env, from: &Address, spender: &Address, amount: i128) {
    assert!(amount >= 0);
    let k = Key::Allowance(from.clone(), spender.clone());
    let mut a: Allowance = e.storage().persistent().get(&k).unwrap();
    assert!(
        a.expires >= e.ledger().sequence() && a.amount >= amount,
        "allowance"
    );
    a.amount -= amount;
    e.storage().persistent().set(&k, &a);
}
#[contractimpl]
impl DemoVault {
    pub fn __constructor(e: Env, asset: Address, admin: Address) {
        e.storage().instance().set(&Key::Asset, &asset);
        e.storage().instance().set(&Key::Admin, &admin);
        touch(&e);
    }
    pub fn asset(e: Env) -> Address {
        e.storage().instance().get(&Key::Asset).unwrap()
    }
    pub fn total_supply(e: Env) -> i128 {
        supply(&e)
    }
    pub fn total_assets(e: Env) -> i128 {
        token::Client::new(&e, &Self::asset(e.clone())).balance(&e.current_contract_address())
    }
    pub fn nav(e: Env) -> i128 {
        let s = supply(&e);
        if s == 0 {
            UNIT
        } else {
            Self::total_assets(e).checked_mul(UNIT).unwrap() / s
        }
    }
    pub fn deposit(e: Env, from: Address, amount: i128) -> i128 {
        from.require_auth();
        positive(amount);
        touch(&e);
        let total = supply(&e);
        let assets = Self::total_assets(e.clone());
        let shares = if total == 0 {
            amount
        } else {
            assert!(assets > 0, "insolvent demo vault");
            amount.checked_mul(total).unwrap() / assets
        };
        assert!(shares > 0, "dust deposit");
        token::Client::new(&e, &Self::asset(e.clone())).transfer(
            &from,
            &e.current_contract_address(),
            &amount,
        );
        put_balance(&e, &from, balance(&e, &from) + shares);
        e.storage().instance().set(&Key::Supply, &(total + shares));
        shares
    }
    pub fn redeem(e: Env, from: Address, shares: i128) -> i128 {
        from.require_auth();
        positive(shares);
        touch(&e);
        assert!(balance(&e, &from) >= shares, "insufficient shares");
        let total = supply(&e);
        let amount = shares.checked_mul(Self::total_assets(e.clone())).unwrap() / total;
        put_balance(&e, &from, balance(&e, &from) - shares);
        e.storage().instance().set(&Key::Supply, &(total - shares));
        token::Client::new(&e, &Self::asset(e.clone())).transfer(
            &e.current_contract_address(),
            &from,
            &amount,
        );
        amount
    }
    pub fn donate(e: Env, from: Address, amount: i128) {
        from.require_auth();
        positive(amount);
        assert!(supply(&e) > 0, "seed vault first");
        touch(&e);
        token::Client::new(&e, &Self::asset(e.clone())).transfer(
            &from,
            &e.current_contract_address(),
            &amount,
        );
    }
    // Test fixture only: grants use no real funds and the admin can remove TESTUSD.
    pub fn simulate_loss(e: Env, amount: i128) {
        let admin: Address = e.storage().instance().get(&Key::Admin).unwrap();
        admin.require_auth();
        positive(amount);
        touch(&e);
        token::Client::new(&e, &Self::asset(e.clone())).transfer(
            &e.current_contract_address(),
            &admin,
            &amount,
        );
    }
    pub fn balance(e: Env, id: Address) -> i128 {
        balance(&e, &id)
    }
    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        touch(&e);
        move_shares(&e, &from, &to, amount);
    }
    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 {
        let a: Option<Allowance> = e.storage().persistent().get(&Key::Allowance(from, spender));
        a.filter(|x| x.expires >= e.ledger().sequence())
            .map(|x| x.amount)
            .unwrap_or(0)
    }
    pub fn approve(e: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        assert!(amount >= 0 && (amount == 0 || expiration_ledger >= e.ledger().sequence()));
        let k = Key::Allowance(from, spender);
        e.storage().persistent().set(
            &k,
            &Allowance {
                amount,
                expires: expiration_ledger,
            },
        );
        e.storage().persistent().extend_ttl(&k, 10_000, 50_000);
        touch(&e);
    }
    pub fn transfer_from(e: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&e, &from, &spender, amount);
        move_shares(&e, &from, &to, amount);
        touch(&e);
    }
    pub fn burn(e: Env, from: Address, amount: i128) {
        from.require_auth();
        assert!(amount >= 0 && balance(&e, &from) >= amount);
        put_balance(&e, &from, balance(&e, &from) - amount);
        e.storage()
            .instance()
            .set(&Key::Supply, &(supply(&e) - amount));
        touch(&e);
    }
    pub fn burn_from(e: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&e, &from, &spender, amount);
        assert!(balance(&e, &from) >= amount);
        put_balance(&e, &from, balance(&e, &from) - amount);
        e.storage()
            .instance()
            .set(&Key::Supply, &(supply(&e) - amount));
        touch(&e);
    }
    pub fn decimals(_e: Env) -> u32 {
        7
    }
    pub fn name(e: Env) -> String {
        String::from_str(&e, "YieldShield TESTUSD Demo Vault")
    }
    pub fn symbol(e: Env) -> String {
        String::from_str(&e, "ysvUSD")
    }
}

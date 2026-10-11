#![no_std]
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, token, Address, Env, String,
};
const UNIT: i128 = 10_000_000;
// One indivisible virtual asset/share captures part of unsolicited donations.
// Caller minimum outputs remain mandatory: virtual liquidity is not a price oracle.
const VIRTUAL: i128 = 1;
#[contractevent(topics = ["transfer"], data_format = "single-value")]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
}
#[contractevent(topics = ["approve"], data_format = "vec")]
pub struct Approval {
    #[topic]
    pub from: Address,
    #[topic]
    pub spender: Address,
    pub amount: i128,
    pub live_until_ledger: u32,
}
#[contractevent(topics = ["mint"], data_format = "single-value")]
pub struct Mint {
    #[topic]
    pub to: Address,
    pub amount: i128,
}
#[contractevent(topics = ["burn"], data_format = "single-value")]
pub struct Burn {
    #[topic]
    pub from: Address,
    pub amount: i128,
}
#[contractevent(topics = ["donate"], data_format = "single-value")]
pub struct Donation {
    #[topic]
    pub from: Address,
    pub amount: i128,
}
#[contractevent(topics = ["sim_loss"], data_format = "single-value")]
pub struct SimulatedLoss {
    #[topic]
    pub admin: Address,
    pub amount: i128,
}
// Keep the public demo available through the grant review period without
// exceeding the network-configured maximum lifetime.
fn ttl(e: &Env) -> u32 {
    e.storage().max_ttl().min(1_000_000)
}
#[contracttype]
#[derive(Clone)]
enum Key {
    Asset,
    Admin,
    Supply,
    Name,
    Symbol,
    Minted,
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
    e.storage()
        .instance()
        .extend_ttl(ttl(e).min(250_000), ttl(e));
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
    e.storage()
        .persistent()
        .extend_ttl(&k, ttl(e).min(250_000), ttl(e));
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
fn deadline(e: &Env, expires: u64) {
    assert!(e.ledger().timestamp() <= expires, "deadline expired");
}
fn move_shares(e: &Env, from: &Address, to: &Address, amount: i128) {
    assert!(amount >= 0, "negative amount");
    assert!(balance(e, from) >= amount, "insufficient shares");
    put_balance(e, from, balance(e, from) - amount);
    put_balance(e, to, balance(e, to) + amount);
    Transfer {
        from: from.clone(),
        to: to.clone(),
        amount,
    }
    .publish(e);
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
        let assets = Self::total_assets(e.clone());
        let total = supply(&e);
        if assets == 0 && total > 0 {
            return 0;
        }
        (assets + VIRTUAL).checked_mul(UNIT).unwrap() / (total + VIRTUAL)
    }
    pub fn preview_deposit(e: Env, amount: i128) -> i128 {
        positive(amount);
        let total = supply(&e);
        let assets = Self::total_assets(e.clone());
        assert!(total == 0 || assets > 0, "insolvent demo vault");
        amount.checked_mul(total + VIRTUAL).unwrap() / (assets + VIRTUAL)
    }
    pub fn preview_redeem(e: Env, shares: i128) -> i128 {
        positive(shares);
        let total = supply(&e);
        assert!(shares <= total, "shares exceed supply");
        shares
            .checked_mul(Self::total_assets(e.clone()) + VIRTUAL)
            .unwrap()
            / (total + VIRTUAL)
    }
    pub fn deposit(e: Env, from: Address, amount: i128, min_shares: i128, deadline: u64) -> i128 {
        from.require_auth();
        crate::deadline(&e, deadline);
        assert!(min_shares > 0, "minimum shares required");
        let shares = Self::preview_deposit(e.clone(), amount);
        assert!(shares > 0 && shares >= min_shares, "share slippage");
        touch(&e);
        let total = supply(&e);
        token::Client::new(&e, &Self::asset(e.clone())).transfer(
            &from,
            &e.current_contract_address(),
            &amount,
        );
        put_balance(&e, &from, balance(&e, &from) + shares);
        e.storage().instance().set(&Key::Supply, &(total + shares));
        e.storage().instance().set(&Key::Minted, &true);
        Mint {
            to: from,
            amount: shares,
        }
        .publish(&e);
        shares
    }
    pub fn redeem(e: Env, from: Address, shares: i128, min_assets: i128, deadline: u64) -> i128 {
        from.require_auth();
        crate::deadline(&e, deadline);
        assert!(min_assets >= 0, "negative minimum");
        positive(shares);
        touch(&e);
        assert!(balance(&e, &from) >= shares, "insufficient shares");
        let total = supply(&e);
        let amount = Self::preview_redeem(e.clone(), shares);
        assert!(amount >= min_assets, "asset slippage");
        put_balance(&e, &from, balance(&e, &from) - shares);
        e.storage().instance().set(&Key::Supply, &(total - shares));
        token::Client::new(&e, &Self::asset(e.clone())).transfer(
            &e.current_contract_address(),
            &from,
            &amount,
        );
        Burn {
            from,
            amount: shares,
        }
        .publish(&e);
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
        Donation { from, amount }.publish(&e);
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
        SimulatedLoss { admin, amount }.publish(&e);
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
        let k = Key::Allowance(from.clone(), spender.clone());
        e.storage().persistent().set(
            &k,
            &Allowance {
                amount,
                expires: expiration_ledger,
            },
        );
        e.storage()
            .persistent()
            .extend_ttl(&k, ttl(&e).min(250_000), ttl(&e));
        touch(&e);
        Approval {
            from,
            spender,
            amount,
            live_until_ledger: expiration_ledger,
        }
        .publish(&e);
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
        Burn { from, amount }.publish(&e);
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
        Burn { from, amount }.publish(&e);
    }
    pub fn decimals(_e: Env) -> u32 {
        7
    }
    pub fn set_metadata(e: Env, name: String, symbol: String) {
        let admin: Address = e.storage().instance().get(&Key::Admin).unwrap();
        admin.require_auth();
        assert!(
            !e.storage().instance().has(&Key::Minted) && !e.storage().instance().has(&Key::Name),
            "metadata locked"
        );
        assert!(
            name.len() > 0 && name.len() <= 64 && symbol.len() > 0 && symbol.len() <= 12,
            "metadata length"
        );
        e.storage().instance().set(&Key::Name, &name);
        e.storage().instance().set(&Key::Symbol, &symbol);
        touch(&e);
    }
    pub fn name(e: Env) -> String {
        e.storage()
            .instance()
            .get(&Key::Name)
            .unwrap_or(String::from_str(&e, "YieldShield TESTUSD Demo Vault"))
    }
    pub fn symbol(e: Env) -> String {
        e.storage()
            .instance()
            .get(&Key::Symbol)
            .unwrap_or(String::from_str(&e, "ysvUSD"))
    }
}
#[cfg(test)]
mod metadata_tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    #[test]
    fn metadata_is_named_once_before_deposit() {
        let e = Env::default();
        e.mock_all_auths();
        let admin = Address::generate(&e);
        let asset = e
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let id = e.register(DemoVault, (&asset, &admin));
        let c = DemoVaultClient::new(&e, &id);
        let name = String::from_str(&e, "TEST Reserve Alpha");
        let symbol = String::from_str(&e, "ysALPHA");
        c.set_metadata(&name, &symbol);
        assert_eq!(c.name(), name);
        assert_eq!(c.symbol(), symbol);
        assert!(c.try_set_metadata(&name, &symbol).is_err());
    }
}

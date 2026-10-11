#![no_std]
use soroban_sdk::{
    contract, contractclient, contractevent, contractimpl, contracttype, token, Address, Env,
};
#[contractclient(name = "VaultClient")]
pub trait Vault {
    fn preview_redeem(e: Env, shares: i128) -> i128;
    fn asset(e: Env) -> Address;
}
#[contractevent(topics = ["protect"])]
pub struct Protected {
    #[topic]
    pub id: u64,
    #[topic]
    pub owner: Address,
    pub shares: i128,
    pub claim: i128,
    pub reserved: i128,
}
#[contractevent(topics = ["exit"])]
pub struct Exited {
    #[topic]
    pub id: u64,
    #[topic]
    pub owner: Address,
    pub backing_exit: bool,
    pub payout: i128,
}
#[contractevent(topics = ["fund"], data_format = "single-value")]
pub struct Funded {
    #[topic]
    pub backer: Address,
    pub amount: i128,
}
#[contractevent(topics = ["reserve_out"], data_format = "single-value")]
pub struct ReserveWithdrawn {
    #[topic]
    pub backer: Address,
    pub amount: i128,
}
#[contractevent(topics = ["earned_out"], data_format = "single-value")]
pub struct EarnedWithdrawn {
    #[topic]
    pub backer: Address,
    pub shares: i128,
}
// Keep the public demo available through the grant review period without
// exceeding the network-configured maximum lifetime.
fn ttl(e: &Env) -> u32 {
    e.storage().max_ttl().min(1_000_000)
}
#[contracttype]
#[derive(Clone)]
enum Key {
    State,
    Position(u64),
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct State {
    pub backing: Address,
    pub vault: Address,
    pub backer: Address,
    pub liquidity: i128,
    pub reserved: i128,
    pub earned: i128,
    pub next_id: u64,
    pub active: u32,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct Position {
    pub owner: Address,
    pub shares: i128,
    pub claim: i128,
    pub reserved: i128,
    pub opened: u64,
    pub closed: bool,
}
#[contract]
pub struct Pool;
fn state(e: &Env) -> State {
    e.storage().instance().get(&Key::State).unwrap()
}
fn save(e: &Env, s: &State) {
    e.storage().instance().set(&Key::State, s);
    e.storage()
        .instance()
        .extend_ttl(ttl(e).min(250_000), ttl(e));
}
fn position(e: &Env, id: u64) -> Position {
    let k = Key::Position(id);
    let p = e.storage().persistent().get(&k).expect("unknown position");
    e.storage()
        .persistent()
        .extend_ttl(&k, ttl(e).min(250_000), ttl(e));
    p
}
fn save_position(e: &Env, id: u64, p: &Position) {
    let k = Key::Position(id);
    e.storage().persistent().set(&k, p);
    e.storage()
        .persistent()
        .extend_ttl(&k, ttl(e).min(250_000), ttl(e));
}
fn positive(amount: i128) {
    assert!(
        amount > 0 && amount <= 1_000_000_000_000_000_000,
        "amount out of bounds"
    );
}
fn check_deadline(e: &Env, deadline: u64) {
    assert!(e.ledger().timestamp() <= deadline, "deadline expired");
}
fn receipt_payout(e: &Env, s: &State, p: &Position) -> i128 {
    let value = VaultClient::new(e, &s.vault).preview_redeem(&p.shares);
    let gain = if value > p.claim { value - p.claim } else { 0 };
    let fee = if value > 0 {
        gain.checked_mul(p.shares).unwrap() / value / 10
    } else {
        0
    };
    p.shares - fee
}
#[contractimpl]
impl Pool {
    pub fn __constructor(e: Env, backer: Address, backing: Address, vault: Address) {
        assert!(
            VaultClient::new(&e, &vault).asset() == backing,
            "different asset"
        );
        save(
            &e,
            &State {
                backer,
                backing,
                vault,
                liquidity: 0,
                reserved: 0,
                earned: 0,
                next_id: 1,
                active: 0,
            },
        );
    }
    pub fn state(e: Env) -> State {
        state(&e)
    }
    pub fn position(e: Env, id: u64) -> Position {
        position(&e, id)
    }
    pub fn fund(e: Env, amount: i128) {
        let mut s = state(&e);
        s.backer.require_auth();
        positive(amount);
        token::Client::new(&e, &s.backing).transfer(
            &s.backer,
            &e.current_contract_address(),
            &amount,
        );
        s.liquidity += amount;
        save(&e, &s);
        Funded {
            backer: s.backer,
            amount,
        }
        .publish(&e);
    }
    pub fn protect(e: Env, owner: Address, shares: i128, min_claim: i128, deadline: u64) -> u64 {
        owner.require_auth();
        check_deadline(&e, deadline);
        assert!(min_claim > 0, "minimum claim required");
        positive(shares);
        let mut s = state(&e);
        let claim = VaultClient::new(&e, &s.vault).preview_redeem(&shares);
        assert!(claim > 0 && claim >= min_claim, "claim slippage");
        let reserve = (claim.checked_mul(3).unwrap() + 1) / 2;
        assert!(
            s.liquidity - s.reserved >= reserve,
            "insufficient free reserve"
        );
        let id = s.next_id;
        s.next_id += 1;
        s.active += 1;
        s.reserved += reserve;
        save(&e, &s);
        save_position(
            &e,
            id,
            &Position {
                owner: owner.clone(),
                shares,
                claim,
                reserved: reserve,
                opened: e.ledger().timestamp(),
                closed: false,
            },
        );
        token::Client::new(&e, &s.vault).transfer(&owner, &e.current_contract_address(), &shares);
        Protected {
            id,
            owner,
            shares,
            claim,
            reserved: reserve,
        }
        .publish(&e);
        id
    }
    pub fn preview_exit(e: Env, id: u64, backing_exit: bool) -> i128 {
        let p = position(&e, id);
        assert!(!p.closed, "position closed");
        if backing_exit {
            p.claim
        } else {
            receipt_payout(&e, &state(&e), &p)
        }
    }
    // backing_exit=true surrenders all receipts for the fixed test backing payout.
    pub fn exit(e: Env, id: u64, backing_exit: bool, min_out: i128, deadline: u64) -> i128 {
        check_deadline(&e, deadline);
        assert!(min_out >= 0, "negative minimum");
        let mut p = position(&e, id);
        p.owner.require_auth();
        assert!(!p.closed, "position closed");
        assert!(e.ledger().timestamp() >= p.opened + 60, "exit delay");
        let mut s = state(&e);
        p.closed = true;
        s.reserved -= p.reserved;
        s.active -= 1;
        let payout;
        if backing_exit {
            payout = p.claim;
            assert!(payout >= min_out, "exit slippage");
            s.liquidity -= payout;
            s.earned += p.shares;
            save(&e, &s);
            save_position(&e, id, &p);
            token::Client::new(&e, &s.backing).transfer(
                &e.current_contract_address(),
                &p.owner,
                &payout,
            );
        } else {
            payout = receipt_payout(&e, &s, &p);
            assert!(payout >= min_out, "exit slippage");
            s.earned += p.shares - payout;
            save(&e, &s);
            save_position(&e, id, &p);
            token::Client::new(&e, &s.vault).transfer(
                &e.current_contract_address(),
                &p.owner,
                &payout,
            );
        }
        Exited {
            id,
            owner: p.owner,
            backing_exit,
            payout,
        }
        .publish(&e);
        payout
    }
    pub fn withdraw_reserve(e: Env, amount: i128) {
        let mut s = state(&e);
        s.backer.require_auth();
        positive(amount);
        assert!(amount <= s.liquidity - s.reserved, "backing is reserved");
        s.liquidity -= amount;
        save(&e, &s);
        token::Client::new(&e, &s.backing).transfer(
            &e.current_contract_address(),
            &s.backer,
            &amount,
        );
        ReserveWithdrawn {
            backer: s.backer,
            amount,
        }
        .publish(&e);
    }
    pub fn withdraw_earned(e: Env, shares: i128) {
        let mut s = state(&e);
        s.backer.require_auth();
        positive(shares);
        assert!(shares <= s.earned, "shares belong to protected users");
        s.earned -= shares;
        save(&e, &s);
        token::Client::new(&e, &s.vault).transfer(
            &e.current_contract_address(),
            &s.backer,
            &shares,
        );
        EarnedWithdrawn {
            backer: s.backer,
            shares,
        }
        .publish(&e);
    }
}
#[cfg(test)]
mod test;

#![no_std]
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, symbol_short, token, Address, Env, Vec,
};
const SCALE: i128 = 1_000_000_000_000;
/// Smallest fixed claim a position may open with or keep after a partial
/// exit: 0.01 backing unit at seven decimals. Any open position pauses
/// provider entry and cash withdrawal, so dust positions are rejected.
pub const MIN_CLAIM: i128 = 100_000;
#[contractclient(name = "VaultClient")]
pub trait Vault {
    fn asset(e: Env) -> Address;
    fn preview_redeem(e: Env, shares: i128) -> i128;
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct Terms {
    pub collateral_bps: u32,
    pub junior_fee_bps: u32,
    pub creator_fee_bps: u32,
    pub duration: u64,
    pub notice_delay: u64,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct State {
    pub backing: Address,
    pub vault: Address,
    pub creator: Address,
    pub terms: Terms,
    pub end: u64,
    pub liquidity: i128,
    pub reserved: i128,
    pub total_lp: i128,
    pub reward_index: i128,
    pub reward_balance: i128,
    pub inventory_index: i128,
    pub inventory_balance: i128,
    pub protocol: Address,
    pub protocol_rewards: i128,
    pub creator_rewards: i128,
    pub credit_total: i128,
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
#[contracttype]
#[derive(Clone, Debug, Default)]
pub struct Provider {
    pub shares: i128,
    /// Fee `reward_index` at this provider's last checkpoint.
    pub debt: i128,
    pub rewards: i128,
    /// `inventory_index` at this provider's last checkpoint.
    pub inventory_debt: i128,
    pub inventory: i128,
    pub notice_shares: i128,
    pub notice_at: u64,
}
#[contracttype]
#[derive(Clone)]
enum Key {
    State,
    Position(u64),
    Provider(Address),
    Credit(Address),
    Ids(Address),
}
#[contract]
pub struct PoolV3;
fn ttl(e: &Env) -> u32 {
    e.storage().max_ttl().min(1_000_000)
}
fn state(e: &Env) -> State {
    e.storage().instance().get(&Key::State).unwrap()
}
fn save(e: &Env, s: &State) {
    e.storage().instance().set(&Key::State, s);
    e.storage()
        .instance()
        .extend_ttl(ttl(e).min(250_000), ttl(e));
}
fn put<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(e: &Env, k: &Key, v: &T) {
    e.storage().persistent().set(k, v);
    e.storage()
        .persistent()
        .extend_ttl(k, ttl(e).min(250_000), ttl(e));
}
fn position(e: &Env, id: u64) -> Position {
    let k = Key::Position(id);
    let p = e.storage().persistent().get(&k).expect("unknown position");
    e.storage()
        .persistent()
        .extend_ttl(&k, ttl(e).min(250_000), ttl(e));
    p
}
fn provider(e: &Env, owner: &Address, s: &State) -> Provider {
    let mut p: Provider = e
        .storage()
        .persistent()
        .get(&Key::Provider(owner.clone()))
        .unwrap_or_default();
    // Accrue only the index growth since this provider's snapshot, rounded
    // down once per interval. Shares are constant between checkpoints, so the
    // sum over providers never exceeds what was distributed. Storing
    // floor(shares * index) instead lets a later accrual round up.
    p.rewards += accrued(p.shares, s.reward_index, p.debt);
    p.debt = s.reward_index;
    p.inventory += accrued(p.shares, s.inventory_index, p.inventory_debt);
    p.inventory_debt = s.inventory_index;
    p
}
fn accrued(shares: i128, index: i128, snapshot: i128) -> i128 {
    shares.checked_mul(index - snapshot).unwrap() / SCALE
}
fn positive(v: i128) {
    assert!(
        v > 0 && v <= 1_000_000_000_000_000_000,
        "amount out of bounds"
    );
}
fn deadline(e: &Env, t: u64) {
    assert!(e.ledger().timestamp() <= t, "deadline expired");
}
fn credit(e: &Env, o: &Address) -> i128 {
    e.storage()
        .persistent()
        .get(&Key::Credit(o.clone()))
        .unwrap_or(0)
}
// The per-wallet position index is a bounded discovery aid, not ownership.
// It holds only open positions the wallet owns. Anyone can transfer a
// position to any wallet without consent, so a full index skips new ids
// instead of rejecting the protect or transfer. Positions stay readable by id.
const MAX_WALLET_IDS: u32 = 100;
fn index(e: &Env, o: &Address, id: u64) {
    let k = Key::Ids(o.clone());
    let mut ids: Vec<u64> = e.storage().persistent().get(&k).unwrap_or(Vec::new(e));
    if ids.len() < MAX_WALLET_IDS && !ids.contains(id) {
        ids.push_back(id);
        put(e, &k, &ids);
    }
}
fn unindex(e: &Env, o: &Address, id: u64) {
    let k = Key::Ids(o.clone());
    let Some(mut ids) = e.storage().persistent().get::<_, Vec<u64>>(&k) else {
        return;
    };
    if let Some(i) = ids.first_index_of(id) {
        ids.remove(i);
        if ids.is_empty() {
            e.storage().persistent().remove(&k);
        } else {
            put(e, &k, &ids);
        }
    }
}
fn distribute(s: &mut State, receipts: i128, inventory: bool) {
    if receipts > 0 {
        assert!(s.total_lp > 0, "no providers");
        let delta = receipts.checked_mul(SCALE).unwrap() / s.total_lp;
        if inventory {
            s.inventory_index += delta;
            s.inventory_balance += receipts;
        } else {
            s.reward_index += delta;
            s.reward_balance += receipts;
        }
    }
}
// Claim and reserve removed when `shares` of a position close. A full exit
// removes everything. A partial backing exit pays a floored claim slice, so
// rounding favours providers. A partial receipt exit removes a ceiled claim
// slice, so the remaining fixed claim never exceeds the remaining receipts'
// proportional share. The released reserve is floored in both cases, which
// keeps the remaining reserve at least the remaining claim.
fn slice(p: &Position, shares: i128, backing: bool) -> (i128, i128) {
    positive(shares);
    assert!(shares <= p.shares && !p.closed, "invalid position shares");
    if shares == p.shares {
        return (p.claim, p.reserved);
    }
    let scaled = p.claim.checked_mul(shares).unwrap();
    let claim = if backing {
        scaled / p.shares
    } else {
        (scaled + p.shares - 1) / p.shares
    };
    assert!(p.claim - claim >= MIN_CLAIM, "remaining claim below minimum");
    (claim, p.reserved.checked_mul(shares).unwrap() / p.shares)
}
fn outputs(
    e: &Env,
    s: &State,
    p: &Position,
    shares: i128,
    backing: bool,
) -> (i128, i128, i128, i128) {
    let (claim, _) = slice(p, shares, backing);
    if backing {
        return (claim, shares, 0, 0);
    }
    let value = VaultClient::new(e, &s.vault).preview_redeem(&shares);
    let gain = (value - claim).max(0);
    let fee_base = if value > 0 {
        gain.checked_mul(shares).unwrap() / value
    } else {
        0
    };
    let junior = fee_base
        .checked_mul(s.terms.junior_fee_bps as i128)
        .unwrap()
        / 10_000;
    let creator = fee_base
        .checked_mul(s.terms.creator_fee_bps as i128)
        .unwrap()
        / 10_000;
    {
        let protocol = fee_base / 100;
        (
            shares - junior - creator - protocol,
            junior,
            creator,
            protocol,
        )
    }
}
#[contractimpl]
impl PoolV3 {
    pub fn __constructor(
        e: Env,
        creator: Address,
        backing: Address,
        vault: Address,
        protocol: Address,
        terms: Terms,
    ) {
        assert!(
            VaultClient::new(&e, &vault).asset() == backing,
            "asset mismatch"
        );
        assert!(
            terms.collateral_bps >= 10_000 && terms.collateral_bps <= 30_000,
            "collateral bounds"
        );
        assert!(
            terms.junior_fee_bps <= 3000 && terms.creator_fee_bps <= 500,
            "fee bounds"
        );
        assert!(
            terms.duration >= 300 && terms.duration <= 2_592_000,
            "term bounds"
        );
        assert!(
            terms.notice_delay >= 30 && terms.notice_delay <= 604_800,
            "notice bounds"
        );
        let end = e.ledger().timestamp().checked_add(terms.duration).unwrap();
        save(
            &e,
            &State {
                backing,
                vault,
                creator,
                terms,
                end,
                liquidity: 0,
                reserved: 0,
                total_lp: 0,
                reward_index: 0,
                reward_balance: 0,
                inventory_index: 0,
                inventory_balance: 0,
                protocol,
                protocol_rewards: 0,
                creator_rewards: 0,
                credit_total: 0,
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
    pub fn provider(e: Env, owner: Address) -> Provider {
        provider(&e, &owner, &state(&e))
    }
    pub fn credit(e: Env, owner: Address) -> i128 {
        credit(&e, &owner)
    }
    /// Open positions indexed for `owner`, at most 100. Best effort: ids
    /// beyond the bound are not listed but remain readable via `position`.
    pub fn positions(e: Env, owner: Address) -> Vec<u64> {
        e.storage()
            .persistent()
            .get(&Key::Ids(owner))
            .unwrap_or(Vec::new(&e))
    }
    pub fn preview_provide(e: Env, amount: i128) -> i128 {
        positive(amount);
        let s = state(&e);
        if s.total_lp == 0 {
            amount
        } else {
            assert!(s.liquidity > 0, "cash exhausted");
            amount.checked_mul(s.total_lp).unwrap() / s.liquidity
        }
    }
    pub fn provide(e: Env, owner: Address, amount: i128, min_shares: i128, expires: u64) -> i128 {
        owner.require_auth();
        deadline(&e, expires);
        positive(amount);
        assert!(min_shares > 0, "minimum required");
        let mut s = state(&e);
        assert!(s.active == 0, "liabilities outstanding");
        assert!(e.ledger().timestamp() + 60 < s.end, "pool closing");
        let minted = Self::preview_provide(e.clone(), amount);
        assert!(minted >= min_shares, "share slippage");
        let mut p = provider(&e, &owner, &s);
        // provider() checkpointed both snapshots at the current indices, so
        // new shares start accruing from now.
        p.shares += minted;
        s.total_lp += minted;
        s.liquidity += amount;
        put(&e, &Key::Provider(owner.clone()), &p);
        save(&e, &s);
        token::Client::new(&e, &s.backing).transfer(&owner, &e.current_contract_address(), &amount);
        e.events()
            .publish((symbol_short!("provide"), owner), (amount, minted));
        minted
    }
    pub fn notice(e: Env, owner: Address, shares: i128) {
        owner.require_auth();
        positive(shares);
        let s = state(&e);
        let mut p = provider(&e, &owner, &s);
        assert!(shares <= p.shares, "not enough shares");
        p.notice_shares = shares;
        p.notice_at = e.ledger().timestamp() + s.terms.notice_delay;
        put(&e, &Key::Provider(owner.clone()), &p);
        e.events()
            .publish((symbol_short!("notice"), owner), (shares, p.notice_at));
    }
    pub fn cancel_notice(e: Env, owner: Address) {
        owner.require_auth();
        let mut p = provider(&e, &owner, &state(&e));
        p.notice_shares = 0;
        p.notice_at = 0;
        put(&e, &Key::Provider(owner), &p);
    }
    pub fn preview_withdraw(e: Env, shares: i128) -> i128 {
        positive(shares);
        let s = state(&e);
        assert!(shares <= s.total_lp, "not enough supply");
        shares.checked_mul(s.liquidity).unwrap() / s.total_lp
    }
    pub fn withdraw(e: Env, owner: Address, shares: i128, min_assets: i128, expires: u64) -> i128 {
        owner.require_auth();
        deadline(&e, expires);
        positive(shares);
        assert!(min_assets >= 0, "negative minimum");
        let mut s = state(&e);
        assert!(s.active == 0, "liabilities outstanding");
        let mut p = provider(&e, &owner, &s);
        assert!(
            shares <= p.shares
                && shares <= p.notice_shares
                && e.ledger().timestamp() >= p.notice_at,
            "notice not ready"
        );
        let assets = Self::preview_withdraw(e.clone(), shares);
        assert!(assets >= min_assets, "asset slippage");
        p.shares -= shares;
        p.notice_shares -= shares;
        s.total_lp -= shares;
        s.liquidity -= assets;
        put(&e, &Key::Provider(owner.clone()), &p);
        save(&e, &s);
        if assets > 0 {
            token::Client::new(&e, &s.backing).transfer(
                &e.current_contract_address(),
                &owner,
                &assets,
            );
        }
        e.events()
            .publish((symbol_short!("withdraw"), owner), (shares, assets));
        assets
    }
    pub fn claim_rewards(e: Env, owner: Address, to: Address) -> i128 {
        owner.require_auth();
        let mut s = state(&e);
        let mut p = provider(&e, &owner, &s);
        let n = p.rewards;
        positive(n);
        assert!(n <= s.reward_balance, "reward balance");
        p.rewards = 0;
        s.reward_balance -= n;
        put(&e, &Key::Provider(owner.clone()), &p);
        save(&e, &s);
        token::Client::new(&e, &s.vault).transfer(&e.current_contract_address(), &to, &n);
        n
    }
    pub fn claim_inventory(e: Env, owner: Address, to: Address) -> i128 {
        owner.require_auth();
        let mut s = state(&e);
        let mut p = provider(&e, &owner, &s);
        let n = p.inventory;
        positive(n);
        assert!(n <= s.inventory_balance, "inventory balance");
        p.inventory = 0;
        s.inventory_balance -= n;
        put(&e, &Key::Provider(owner), &p);
        save(&e, &s);
        token::Client::new(&e, &s.vault).transfer(&e.current_contract_address(), &to, &n);
        n
    }
    pub fn claim_protocol(e: Env, to: Address) -> i128 {
        let mut s = state(&e);
        s.protocol.require_auth();
        let n = s.protocol_rewards;
        positive(n);
        s.protocol_rewards = 0;
        save(&e, &s);
        token::Client::new(&e, &s.vault).transfer(&e.current_contract_address(), &to, &n);
        n
    }
    pub fn claim_creator(e: Env, to: Address) -> i128 {
        let mut s = state(&e);
        s.creator.require_auth();
        let n = s.creator_rewards;
        positive(n);
        s.creator_rewards = 0;
        save(&e, &s);
        token::Client::new(&e, &s.vault).transfer(&e.current_contract_address(), &to, &n);
        n
    }
    pub fn protect(e: Env, owner: Address, shares: i128, min_claim: i128, expires: u64) -> u64 {
        owner.require_auth();
        deadline(&e, expires);
        positive(shares);
        assert!(min_claim > 0, "minimum required");
        let mut s = state(&e);
        assert!(e.ledger().timestamp() + 60 < s.end, "admissions closed");
        let claim = VaultClient::new(&e, &s.vault).preview_redeem(&shares);
        assert!(claim >= min_claim, "claim slippage");
        assert!(claim >= MIN_CLAIM, "claim below minimum");
        let reserved = (claim.checked_mul(s.terms.collateral_bps as i128).unwrap() + 9999) / 10_000;
        assert!(
            s.total_lp > 0 && s.liquidity - s.reserved >= reserved,
            "capacity exceeded"
        );
        let id = s.next_id;
        s.next_id += 1;
        s.active += 1;
        s.reserved += reserved;
        save(&e, &s);
        put(
            &e,
            &Key::Position(id),
            &Position {
                owner: owner.clone(),
                shares,
                claim,
                reserved,
                opened: e.ledger().timestamp(),
                closed: false,
            },
        );
        index(&e, &owner, id);
        token::Client::new(&e, &s.vault).transfer(&owner, &e.current_contract_address(), &shares);
        e.events().publish(
            (symbol_short!("protect"), id, owner),
            (shares, claim, reserved),
        );
        id
    }
    pub fn preview_exit(e: Env, id: u64, shares: i128, backing_exit: bool) -> i128 {
        outputs(&e, &state(&e), &position(&e, id), shares, backing_exit).0
    }
    pub fn exit(
        e: Env,
        id: u64,
        shares: i128,
        backing_exit: bool,
        min_out: i128,
        expires: u64,
    ) -> i128 {
        deadline(&e, expires);
        assert!(min_out >= 0, "negative minimum");
        let mut s = state(&e);
        let mut p = position(&e, id);
        p.owner.require_auth();
        assert!(e.ledger().timestamp() >= p.opened + 60, "exit delay");
        assert!(e.ledger().timestamp() < s.end, "settle expired position");
        let (claim, reserved) = slice(&p, shares, backing_exit);
        let (out, junior, creator, protocol) = outputs(&e, &s, &p, shares, backing_exit);
        assert!(out >= min_out, "output slippage");
        p.shares -= shares;
        p.claim -= claim;
        p.reserved -= reserved;
        s.reserved -= reserved;
        if p.shares == 0 {
            p.closed = true;
            s.active -= 1;
            unindex(&e, &p.owner, id);
        }
        if backing_exit {
            s.liquidity -= out;
        }
        distribute(&mut s, junior, backing_exit);
        s.creator_rewards += creator;
        s.protocol_rewards += protocol;
        put(&e, &Key::Position(id), &p);
        save(&e, &s);
        let asset = if backing_exit { s.backing } else { s.vault };
        token::Client::new(&e, &asset).transfer(&e.current_contract_address(), &p.owner, &out);
        e.events().publish(
            (symbol_short!("exit"), id, p.owner),
            (shares, backing_exit, out),
        );
        out
    }
    pub fn transfer_position(e: Env, id: u64, to: Address) {
        let mut p = position(&e, id);
        p.owner.require_auth();
        assert!(!p.closed, "position closed");
        assert!(to != e.current_contract_address(), "invalid recipient");
        let from = p.owner.clone();
        p.owner = to.clone();
        put(&e, &Key::Position(id), &p);
        unindex(&e, &from, id);
        index(&e, &to, id);
        e.events()
            .publish((symbol_short!("transfer"), id), (from, to));
    }
    pub fn settle(e: Env, id: u64) -> i128 {
        let mut s = state(&e);
        assert!(e.ledger().timestamp() >= s.end, "not expired");
        let mut p = position(&e, id);
        assert!(!p.closed, "position closed");
        s.liquidity -= p.claim;
        s.reserved -= p.reserved;
        s.active -= 1;
        s.credit_total += p.claim;
        distribute(&mut s, p.shares, true);
        p.closed = true;
        unindex(&e, &p.owner, id);
        let n = credit(&e, &p.owner) + p.claim;
        put(&e, &Key::Credit(p.owner.clone()), &n);
        put(&e, &Key::Position(id), &p);
        save(&e, &s);
        e.events()
            .publish((symbol_short!("settle"), id, p.owner), p.claim);
        p.claim
    }
    pub fn claim_backing(e: Env, owner: Address, to: Address) -> i128 {
        owner.require_auth();
        let mut s = state(&e);
        let n = credit(&e, &owner);
        positive(n);
        put(&e, &Key::Credit(owner.clone()), &0i128);
        s.credit_total -= n;
        save(&e, &s);
        token::Client::new(&e, &s.backing).transfer(&e.current_contract_address(), &to, &n);
        e.events().publish((symbol_short!("claim"), owner, to), n);
        n
    }
}
#[cfg(test)]
mod test;

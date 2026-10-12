#![no_std]
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, Symbol, Vec,
};
#[soroban_sdk::contractclient(name="VaultClient")]
pub trait Vault { fn asset(e:Env)->Address; }
#[contracttype]
#[derive(Clone,Debug)]
pub struct Terms {pub collateral_bps:u32,pub junior_fee_bps:u32,pub creator_fee_bps:u32,pub duration:u64,pub notice_delay:u64}
/// Unmatured pools allowed at once across all creators. Creation reopens as
/// pools mature, so filling the registry can only delay, never disable, it.
pub const MAX_LIVE_POOLS: u32 = 50;
/// Unmatured pools one creator may hold at once.
pub const MAX_LIVE_PER_CREATOR: u32 = 5;
/// Largest page returned by `pools`.
pub const PAGE_LIMIT: u32 = 25;
#[contracttype]
#[derive(Clone)]
enum Key {
    State,
    Pool(Address),
    Listing(u32),
    Live,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct State {
    pub admin: Address,
    pub backing: Address,
    pub wasm: BytesN<32>,
    pub vaults: Vec<Address>,
    pub bond: i128,
    /// Pools ever created; `pools(start, limit)` pages through them.
    pub count: u32,
    pub max_live: u32,
    pub max_per_creator: u32,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct Record {
    pub creator: Address,
    pub vault: Address,
    pub end: u64,
    pub bond: i128,
    pub claimed: bool,
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct Listing {
    pub pool: Address,
    pub creator: Address,
    pub vault: Address,
    pub end: u64,
}
#[contract]
pub struct Factory;
fn ttl(e: &Env) -> u32 {
    e.storage().max_ttl().min(1_000_000)
}
fn state(e: &Env) -> State {
    e.storage().instance().get(&Key::State).unwrap()
}
fn put<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(e: &Env, k: &Key, v: &T) {
    e.storage().persistent().set(k, v);
    e.storage()
        .persistent()
        .extend_ttl(k, ttl(e).min(250_000), ttl(e));
}
// Unmatured pools. Kept in instance storage, bounded by MAX_LIVE_POOLS and
// pruned on every create, so the registry read on page load stays small and
// lives as long as the factory instance.
fn live(e: &Env) -> Vec<Listing> {
    let now = e.ledger().timestamp();
    let mut out = Vec::new(e);
    let stored: Vec<Listing> = e
        .storage()
        .instance()
        .get(&Key::Live)
        .unwrap_or(Vec::new(e));
    for l in stored.iter() {
        if l.end > now {
            out.push_back(l);
        }
    }
    out
}
#[contractimpl]
impl Factory {
    pub fn __constructor(
        e: Env,
        admin: Address,
        backing: Address,
        wasm: BytesN<32>,
        vaults: Vec<Address>,
    ) {
        assert!(vaults.len() > 0 && vaults.len() <= 16, "vault bounds");
        for v in vaults.iter() {
            let _ = VaultClient::new(&e, &v).asset();
        }
        e.storage().instance().set(
            &Key::State,
            &State {
                admin,
                backing,
                wasm,
                vaults,
                bond: 100_000_000,
                count: 0,
                max_live: MAX_LIVE_POOLS,
                max_per_creator: MAX_LIVE_PER_CREATOR,
            },
        );
    }
    pub fn state(e: Env) -> State {
        state(&e)
    }
    pub fn record(e: Env, pool: Address) -> Record {
        e.storage()
            .persistent()
            .get(&Key::Pool(pool))
            .expect("unregistered pool")
    }
    /// Registered pools in creation order, at most PAGE_LIMIT per call.
    pub fn pools(e: Env, start: u32, limit: u32) -> Vec<Listing> {
        let end = start
            .saturating_add(limit.min(PAGE_LIMIT))
            .min(state(&e).count);
        let mut out = Vec::new(&e);
        for i in start..end {
            out.push_back(e.storage().persistent().get(&Key::Listing(i)).unwrap());
        }
        out
    }
    /// Pools that have not matured, at most MAX_LIVE_POOLS.
    pub fn live_pools(e: Env) -> Vec<Listing> {
        live(&e)
    }
    pub fn create(
        e: Env,
        creator: Address,
        vault: Address,
        terms: Terms,
        salt: BytesN<32>,
    ) -> Address {
        creator.require_auth();
        let mut s = state(&e);
        assert!(s.vaults.contains(&vault), "unregistered vault");
        let mut live = live(&e);
        assert!(live.len() < s.max_live, "live pool limit");
        let mut mine = 0;
        for l in live.iter() {
            if l.creator == creator {
                mine += 1;
            }
        }
        assert!(mine < s.max_per_creator, "creator pool limit");
        token::Client::new(&e, &s.backing).transfer(
            &creator,
            &e.current_contract_address(),
            &s.bond,
        );
        let id = e
            .deployer()
            .with_current_contract(e.crypto().sha256(&(creator.clone(), salt).to_xdr(&e)))
            .deploy_v2(
                s.wasm.clone(),
                (
                    creator.clone(),
                    VaultClient::new(&e, &vault).asset(),
                    vault.clone(),
                    s.admin.clone(),
                    terms.clone(),
                ),
            );
        let end = e.ledger().timestamp() + terms.duration;
        let rec = Record {
            creator: creator.clone(),
            vault: vault.clone(),
            end,
            bond: s.bond,
            claimed: false,
        };
        put(&e, &Key::Pool(id.clone()), &rec);
        let listing = Listing {
            pool: id.clone(),
            creator: creator.clone(),
            vault,
            end,
        };
        put(&e, &Key::Listing(s.count), &listing);
        s.count += 1;
        live.push_back(listing);
        e.storage().instance().set(&Key::Live, &live);
        e.storage().instance().set(&Key::State, &s);
        e.storage()
            .instance()
            .extend_ttl(ttl(&e).min(250_000), ttl(&e));
        e.events()
            .publish((symbol_short!("created"), id.clone(), creator), rec);
        id
    }
    pub fn claim_bond(e: Env, pool: Address, to: Address) -> i128 {
        let mut r = Self::record(e.clone(), pool.clone());
        r.creator.require_auth();
        assert!(!r.claimed && e.ledger().timestamp() >= r.end, "bond locked");
        r.claimed = true;
        e.storage().persistent().set(&Key::Pool(pool.clone()), &r);
        token::Client::new(&e, &state(&e).backing).transfer(
            &e.current_contract_address(),
            &to,
            &r.bond,
        );
        e.events().publish(
            (Symbol::new(&e, "claim_bond"), pool, r.creator),
            (to, r.bond),
        );
        r.bond
    }
}
#[cfg(test)]
extern crate std;
#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        vec,
    };
    use yieldshield_pool_v3::PoolV3Client;
    use yieldshield_vault::DemoVault;
    fn terms() -> Terms {
        Terms {
            collateral_bps: 15000,
            junior_fee_bps: 1000,
            creator_fee_bps: 100,
            duration: 300,
            notice_delay: 30,
        }
    }
    #[test]
    fn atomic_creation_registry_namespace_and_bond() {
        let e = Env::default();
        e.mock_all_auths();
        let admin = Address::generate(&e);
        let other = Address::generate(&e);
        let backing = e
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let t = token::StellarAssetClient::new(&e, &backing);
        t.mint(&admin, &1_000_000_000);
        t.mint(&other, &1_000_000_000);
        let vault = e.register(DemoVault, (&backing, &admin));
        let nested = e.register(DemoVault, (&vault, &admin));
        let wasm = e.deployer().upload_contract_wasm(
            &include_bytes!("../../../target/wasm32v1-none/release/yieldshield_pool_v3.wasm")[..],
        );
        let id = e.register(
            Factory,
            (
                &admin,
                &backing,
                &wasm,
                vec![&e, vault.clone(), nested.clone()],
            ),
        );
        let c = FactoryClient::new(&e, &id);
        let salt = BytesN::from_array(&e, &[7; 32]);
        let p = c.create(&admin, &vault, &terms(), &salt);
        let p2 = c.create(&other, &vault, &terms(), &salt);
        assert_ne!(p, p2);
        assert_eq!(c.state().count, 2);
        assert_eq!(PoolV3Client::new(&e, &p).state().creator, admin);
        let n = c.create(&other, &nested, &terms(), &BytesN::from_array(&e, &[8; 32]));
        assert_eq!(PoolV3Client::new(&e, &n).state().backing, vault);
        assert!(c.try_claim_bond(&p, &admin).is_err());
        e.ledger().with_mut(|l| l.timestamp = 301);
        assert_eq!(c.claim_bond(&p, &admin), 100_000_000);
        assert!(c.try_claim_bond(&p, &admin).is_err());
        let before = token::Client::new(&e, &backing).balance(&admin);
        let mut invalid = terms();
        invalid.collateral_bps = 1;
        assert!(c
            .try_create(&admin, &vault, &invalid, &BytesN::from_array(&e, &[9; 32]))
            .is_err());
        assert_eq!(token::Client::new(&e, &backing).balance(&admin), before);
        assert_eq!(c.state().count, 3);
    }
    struct Fx {
        e: Env,
        backing: Address,
        vault: Address,
        id: Address,
    }
    impl Fx {
        fn new() -> Self {
            let e = Env::default();
            e.mock_all_auths();
            let admin = Address::generate(&e);
            let backing = e
                .register_stellar_asset_contract_v2(admin.clone())
                .address();
            let vault = e.register(DemoVault, (&backing, &admin));
            let wasm = e.deployer().upload_contract_wasm(
                &include_bytes!("../../../target/wasm32v1-none/release/yieldshield_pool_v3.wasm")
                    [..],
            );
            let id = e.register(Factory, (&admin, &backing, &wasm, vec![&e, vault.clone()]));
            Self {
                e,
                backing,
                vault,
                id,
            }
        }
        fn c(&self) -> FactoryClient<'_> {
            FactoryClient::new(&self.e, &self.id)
        }
        fn funded(&self) -> Address {
            let a = Address::generate(&self.e);
            token::StellarAssetClient::new(&self.e, &self.backing).mint(&a, &1_000_000_000);
            a
        }
        fn create(&self, creator: &Address, n: u32) -> Address {
            self.create_for(creator, n, 300)
        }
        fn create_for(&self, creator: &Address, n: u32, duration: u64) -> Address {
            let mut t = terms();
            t.duration = duration;
            self.c()
                .create(creator, &self.vault, &t, &self.salt(n))
        }
        fn salt(&self, n: u32) -> BytesN<32> {
            let mut salt = [0u8; 32];
            salt[..4].copy_from_slice(&n.to_be_bytes());
            BytesN::from_array(&self.e, &salt)
        }
        fn later(&self, seconds: u64) {
            self.e.ledger().with_mut(|l| l.timestamp += seconds);
        }
    }
    // Matured pools whose bonds were refunded used to fill a never-pruned
    // 200-entry registry, so a griefer could disable creation forever at zero
    // net cost. Only unmatured pools may count toward a creation limit.
    #[test]
    fn matured_pools_never_block_creation() {
        let f = Fx::new();
        let creators: std::vec::Vec<Address> = (0..40).map(|_| f.funded()).collect();
        let mut n = 0;
        for _ in 0..5 {
            let mut pools = std::vec::Vec::new();
            for creator in &creators {
                pools.push((f.create(creator, n), creator.clone()));
                n += 1;
            }
            f.later(301);
            for (pool, creator) in &pools {
                assert_eq!(f.c().claim_bond(pool, creator), 100_000_000);
            }
        }
        let honest = f.funded();
        f.create(&honest, n);
        assert_eq!(
            token::Client::new(&f.e, &f.backing).balance(&creators[0]),
            1_000_000_000
        );
        assert_eq!(f.c().state().count, 201);
        assert_eq!(f.c().live_pools().len(), 1);
    }
    #[test]
    fn live_and_creator_limits_lift_at_maturity() {
        let f = Fx::new();
        let first = f.funded();
        let mut n = 0;
        for _ in 0..MAX_LIVE_PER_CREATOR {
            f.create(&first, n);
            n += 1;
        }
        let blocked = f.c().try_create(&first, &f.vault, &terms(), &f.salt(n));
        assert!(blocked.is_err(), "creator limit");
        while f.c().live_pools().len() < MAX_LIVE_POOLS {
            let other = f.funded();
            for _ in 0..MAX_LIVE_PER_CREATOR.min(MAX_LIVE_POOLS - f.c().live_pools().len()) {
                f.create(&other, n);
                n += 1;
            }
        }
        let late = f.funded();
        assert!(f.c().try_create(&late, &f.vault, &terms(), &f.salt(n)).is_err());
        f.later(301);
        assert_eq!(f.c().live_pools().len(), 0);
        f.create(&late, n);
        f.create(&first, n + 1);
        assert_eq!(f.c().live_pools().len(), 2);
        assert_eq!(f.c().state().count, MAX_LIVE_POOLS + 2);
    }
    #[test]
    #[should_panic(expected = "creator pool limit")]
    fn creator_limit_message() {
        let f = Fx::new();
        let creator = f.funded();
        for n in 0..=MAX_LIVE_PER_CREATOR {
            f.create(&creator, n);
        }
    }
    #[test]
    #[should_panic(expected = "live pool limit")]
    fn live_limit_message() {
        let f = Fx::new();
        for n in 0..=MAX_LIVE_POOLS {
            f.create(&f.funded(), n);
        }
    }
    #[test]
    fn bond_refund_emits_event() {
        use soroban_sdk::{testutils::Events as _, IntoVal, Symbol};
        let f = Fx::new();
        let creator = f.funded();
        let to = f.funded();
        let pool = f.create(&creator, 1);
        f.later(300);
        f.c().claim_bond(&pool, &to);
        assert_eq!(
            f.e.events().all().filter_by_contract(&f.id),
            vec![
                &f.e,
                (
                    f.id.clone(),
                    (Symbol::new(&f.e, "claim_bond"), pool, creator).into_val(&f.e),
                    (to, 100_000_000i128).into_val(&f.e)
                )
            ]
        );
    }
    #[test]
    fn registry_pages_are_bounded_and_ordered() {
        let f = Fx::new();
        let mut created = std::vec::Vec::new();
        for n in 0..30u32 {
            let creator = f.funded();
            let duration = if n % 2 == 0 { 300 } else { 900 };
            created.push((f.create_for(&creator, n, duration), creator, duration));
        }
        let first = f.c().pools(&0, &100);
        assert_eq!(first.len(), PAGE_LIMIT);
        let rest = f.c().pools(&PAGE_LIMIT, &PAGE_LIMIT);
        assert_eq!(rest.len(), 30 - PAGE_LIMIT);
        for (i, l) in first.iter().chain(rest.iter()).enumerate() {
            let (pool, creator, duration) = &created[i];
            assert_eq!(&l.pool, pool);
            assert_eq!(&l.creator, creator);
            assert_eq!(l.vault, f.vault);
            assert_eq!(l.end, *duration);
            assert_eq!(f.c().record(pool).end, l.end);
        }
        assert_eq!(f.c().pools(&28, &5).len(), 2);
        assert_eq!(f.c().pools(&30, &5).len(), 0);
        assert_eq!(f.c().pools(&u32::MAX, &u32::MAX).len(), 0);
        assert_eq!(f.c().live_pools().len(), 30);
        f.later(300);
        let live = f.c().live_pools();
        assert_eq!(live.len(), 15);
        assert!(live.iter().all(|l| l.end == 900));
        assert_eq!(f.c().pools(&0, &PAGE_LIMIT).len(), PAGE_LIMIT);
    }
}

#![no_std]
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, Vec,
};
#[soroban_sdk::contractclient(name="VaultClient")]
pub trait Vault { fn asset(e:Env)->Address; }
#[contracttype]
#[derive(Clone,Debug)]
pub struct Terms {pub collateral_bps:u32,pub junior_fee_bps:u32,pub creator_fee_bps:u32,pub duration:u64,pub notice_delay:u64}
#[contracttype]
#[derive(Clone)]
enum Key {
    State,
    Pool(Address),
}
#[contracttype]
#[derive(Clone, Debug)]
pub struct State {
    pub admin: Address,
    pub backing: Address,
    pub wasm: BytesN<32>,
    pub vaults: Vec<Address>,
    pub pools: Vec<Address>,
    pub bond: i128,
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
#[contract]
pub struct Factory;
fn state(e: &Env) -> State {
    e.storage().instance().get(&Key::State).unwrap()
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
                pools: Vec::new(&e),
                bond: 100_000_000,
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
        assert!(s.pools.len() < 200, "registry full");
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
        let rec = Record {
            creator: creator.clone(),
            vault,
            end: e.ledger().timestamp() + terms.duration,
            bond: s.bond,
            claimed: false,
        };
        let k = Key::Pool(id.clone());
        e.storage().persistent().set(&k, &rec);
        let ttl = e.storage().max_ttl().min(1_000_000);
        e.storage()
            .persistent()
            .extend_ttl(&k, ttl.min(250_000), ttl);
        s.pools.push_back(id.clone());
        e.storage().instance().set(&Key::State, &s);
        e.storage().instance().extend_ttl(ttl.min(250_000), ttl);
        e.events()
            .publish((symbol_short!("created"), id.clone(), creator), rec);
        id
    }
    pub fn claim_bond(e: Env, pool: Address, to: Address) -> i128 {
        let mut r = Self::record(e.clone(), pool.clone());
        r.creator.require_auth();
        assert!(!r.claimed && e.ledger().timestamp() >= r.end, "bond locked");
        r.claimed = true;
        e.storage().persistent().set(&Key::Pool(pool), &r);
        token::Client::new(&e, &state(&e).backing).transfer(
            &e.current_contract_address(),
            &to,
            &r.bond,
        );
        r.bond
    }
}
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
        assert_eq!(c.state().pools.len(), 2);
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
        assert_eq!(c.state().pools.len(), 3);
    }
}

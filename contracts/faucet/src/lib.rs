#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};
// Keep the public demo available through the grant review period without
// exceeding the network-configured maximum lifetime.
fn ttl(e: &Env) -> u32 {
    e.storage().max_ttl().min(1_000_000)
}
#[contracttype]
#[derive(Clone)]
enum Key {
    Asset,
    Claimed(Address),
}
#[contract]
pub struct Faucet;
#[contractimpl]
impl Faucet {
    pub fn __constructor(e: Env, asset: Address) {
        e.storage().instance().set(&Key::Asset, &asset);
        e.storage()
            .instance()
            .extend_ttl(ttl(&e).min(250_000), ttl(&e));
    }
    pub fn claimed(e: Env, to: Address) -> bool {
        e.storage()
            .persistent()
            .get(&Key::Claimed(to))
            .unwrap_or(false)
    }
    pub fn claim(e: Env, to: Address) {
        to.require_auth();
        let key = Key::Claimed(to.clone());
        assert!(!Self::claimed(e.clone(), to.clone()), "already claimed");
        e.storage().persistent().set(&key, &true);
        e.storage()
            .persistent()
            .extend_ttl(&key, ttl(&e).min(250_000), ttl(&e));
        e.storage()
            .instance()
            .extend_ttl(ttl(&e).min(250_000), ttl(&e));
        let asset: Address = e.storage().instance().get(&Key::Asset).unwrap();
        token::Client::new(&e, &asset).transfer(
            &e.current_contract_address(),
            &to,
            &10_000_000_000_i128,
        );
    }
}
#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    #[test]
    fn funded_claim_once_and_authorization() {
        let e = Env::default();
        e.mock_all_auths();
        let admin = Address::generate(&e);
        let user = Address::generate(&e);
        let asset = e.register_stellar_asset_contract_v2(admin).address();
        let faucet = e.register(Faucet, (&asset,));
        token::StellarAssetClient::new(&e, &asset).mint(&faucet, &20_000_000_000);
        let c = FaucetClient::new(&e, &faucet);
        c.claim(&user);
        assert_eq!(
            token::Client::new(&e, &asset).balance(&user),
            10_000_000_000
        );
        assert!(c.try_claim(&user).is_err());
        e.mock_auths(&[]);
        let other = Address::generate(&e);
        assert!(c.try_claim(&other).is_err());
    }
}

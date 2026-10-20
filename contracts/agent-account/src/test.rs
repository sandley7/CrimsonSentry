#![cfg(test)]
extern crate std;

use super::{AccountError, AgentAccount, AgentAccountClient, Ceilings, Policy, Signature};
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    auth::{Context, ContractContext},
    testutils::{Address as _, Events, Ledger},
    token::StellarAssetClient,
    vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

const DAY: u64 = 86400;

struct Setup {
    env: Env,
    account: Address,
    client: AgentAccountClient<'static>,
    token: Address,
    shop: Address,
    recovery: Address,
    agent: SigningKey,
    owner_key: SigningKey,
}

fn policy(env: &Env, allowlist: &[Address]) -> Policy {
    let mut list = Vec::new(env);
    for a in allowlist {
        list.push_back(a.clone());
    }
    Policy {
        min_amount: 1,
        tx_limit: 100,
        daily_limit: 250,
        max_payments_per_day: 5,
        allowlist: list,
    }
}

fn ceilings() -> Ceilings {
    Ceilings {
        max_tx_limit: 200,
        max_daily_limit: 500,
    }
}

fn pubkey(env: &Env, k: &SigningKey) -> BytesN<32> {
    BytesN::from_array(env, &k.verifying_key().to_bytes())
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let owner = Address::generate(&env);
    let shop = Address::generate(&env);
    let recovery = Address::generate(&env);
    let agent = SigningKey::from_bytes(&[1u8; 32]);
    let owner_key = SigningKey::from_bytes(&[2u8; 32]);

    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let account = env.register(
        AgentAccount,
        (
            owner,
            pubkey(&env, &owner_key),
            pubkey(&env, &agent),
            sac.address(),
            policy(&env, core::slice::from_ref(&shop)),
            recovery.clone(),
            ceilings(),
        ),
    );
    StellarAssetClient::new(&env, &sac.address()).mint(&account, &1_000);
    let client = AgentAccountClient::new(&env, &account);

    Setup {
        env,
        account,
        client,
        token: sac.address(),
        shop,
        recovery,
        agent,
        owner_key,
    }
}

/// The auth context the host passes for `token.transfer(from, to, amount)`.
fn transfer_ctx(s: &Setup, from: &Address, to: &Address, amount: i128) -> Context {
    Context::Contract(ContractContext {
        contract: s.token.clone(),
        fn_name: Symbol::new(&s.env, "transfer"),
        args: (from.clone(), to.clone(), amount).into_val(&s.env),
    })
}

fn payload(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn agent_sig(s: &Setup, payload: &BytesN<32>) -> Signature {
    Signature::Agent(BytesN::from_array(
        &s.env,
        &s.agent.sign(&payload.to_array()).to_bytes(),
    ))
}

fn owner_sig(s: &Setup, payload: &BytesN<32>) -> Signature {
    Signature::Owner(BytesN::from_array(
        &s.env,
        &s.owner_key.sign(&payload.to_array()).to_bytes(),
    ))
}

/// `__check_auth` as the host calls it, with the agent's signature.
fn check(
    s: &Setup,
    contexts: &Vec<Context>,
) -> Result<(), Result<AccountError, soroban_sdk::InvokeError>> {
    let p = payload(&s.env, 7);
    s.env.try_invoke_contract_check_auth::<AccountError>(
        &s.account,
        &p,
        agent_sig(s, &p).into_val(&s.env),
        contexts,
    )
}

fn pay_ok(s: &Setup, amount: i128) {
    let ctxs = vec![&s.env, transfer_ctx(s, &s.account, &s.shop, amount)];
    assert_eq!(check(s, &ctxs), Ok(()));
}

fn pay_err(s: &Setup, to: &Address, amount: i128, e: AccountError) {
    let ctxs = vec![&s.env, transfer_ctx(s, &s.account, to, amount)];
    assert_eq!(check(s, &ctxs), Err(Ok(e)));
}

// ---------------------------------------------------------------------------
// The agent key
// ---------------------------------------------------------------------------

#[test]
fn agent_transfer_within_policy_is_authorized() {
    let s = setup();
    pay_ok(&s, 50);
    let st = s.client.get_status();
    assert_eq!(st.spent_last_24h, 50);
    assert_eq!(st.payments_last_24h, 1);
    assert_eq!(st.remaining_last_24h, 200);
}

#[test]
fn transfer_to_a_stranger_is_rejected() {
    let s = setup();
    let stranger = Address::generate(&s.env);
    pay_err(&s, &stranger, 10, AccountError::NotAllowlisted);
}

#[test]
fn per_payment_minimum_and_maximum() {
    let s = setup();
    pay_err(&s, &s.shop, 150, AccountError::OverTxLimit);
    s.client.set_policy(&Policy {
        min_amount: 5,
        ..policy(&s.env, core::slice::from_ref(&s.shop))
    });
    pay_err(&s, &s.shop, 4, AccountError::UnderMinAmount);
    pay_ok(&s, 5);
}

#[test]
fn zero_and_negative_amounts_are_rejected() {
    let s = setup();
    pay_err(&s, &s.shop, 0, AccountError::InvalidAmount);
    pay_err(&s, &s.shop, -10, AccountError::InvalidAmount);
}

/// The window is enforced across separate authorizations, which is what makes
/// the "parallel payments" attack fail here too.
#[test]
fn rolling_daily_limit_accumulates_across_authorizations() {
    let s = setup();
    pay_ok(&s, 100);
    pay_ok(&s, 100);
    pay_err(&s, &s.shop, 100, AccountError::OverDailyLimit);
}

#[test]
fn a_rejected_authorization_does_not_consume_quota() {
    let s = setup();
    pay_err(&s, &s.shop, 150, AccountError::OverTxLimit);
    assert_eq!(s.client.get_status().payments_last_24h, 0);
}

#[test]
fn payment_count_is_limited() {
    let s = setup();
    for _ in 0..5 {
        pay_ok(&s, 1);
    }
    pay_err(&s, &s.shop, 1, AccountError::TooManyPayments);
}

#[test]
fn quota_returns_after_24_hours() {
    let s = setup();
    pay_ok(&s, 100);
    pay_ok(&s, 100);
    s.env.ledger().with_mut(|l| l.timestamp += DAY + 1);
    pay_ok(&s, 100);
}

#[test]
fn one_authorization_with_several_transfers_counts_all_of_them() {
    let s = setup();
    let ctxs = vec![
        &s.env,
        transfer_ctx(&s, &s.account, &s.shop, 100),
        transfer_ctx(&s, &s.account, &s.shop, 100),
        transfer_ctx(&s, &s.account, &s.shop, 100),
    ];
    assert_eq!(check(&s, &ctxs), Err(Ok(AccountError::OverDailyLimit)));
    // nothing of that rejected batch was recorded
    assert_eq!(s.client.get_status().payments_last_24h, 0);
}

#[test]
fn pause_blocks_the_agent_and_unpause_restores_it() {
    let s = setup();
    s.client.pause();
    pay_err(&s, &s.shop, 10, AccountError::Paused);
    s.client.unpause();
    pay_ok(&s, 10);
}

// ---------------------------------------------------------------------------
// What the agent key can never authorize
// ---------------------------------------------------------------------------

#[test]
fn the_agent_cannot_move_funds_it_does_not_own() {
    let s = setup();
    let other = Address::generate(&s.env);
    let ctxs = vec![&s.env, transfer_ctx(&s, &other, &s.shop, 10)];
    assert_eq!(check(&s, &ctxs), Err(Ok(AccountError::WrongSource)));
}

#[test]
fn the_agent_cannot_call_other_functions_or_other_contracts() {
    let s = setup();
    // approve() would let a spender drain the account later
    let approve = Context::Contract(ContractContext {
        contract: s.token.clone(),
        fn_name: Symbol::new(&s.env, "approve"),
        args: (s.account.clone(), s.shop.clone(), 1_000i128, 1_000u32).into_val(&s.env),
    });
    assert_eq!(
        check(&s, &vec![&s.env, approve]),
        Err(Ok(AccountError::UnsupportedCall))
    );

    // a transfer-shaped call on some other contract
    let elsewhere = Context::Contract(ContractContext {
        contract: Address::generate(&s.env),
        fn_name: Symbol::new(&s.env, "transfer"),
        args: (s.account.clone(), s.shop.clone(), 10i128).into_val(&s.env),
    });
    assert_eq!(
        check(&s, &vec![&s.env, elsewhere]),
        Err(Ok(AccountError::UnsupportedCall))
    );

    // malformed arguments
    let bad = Context::Contract(ContractContext {
        contract: s.token.clone(),
        fn_name: Symbol::new(&s.env, "transfer"),
        args: (s.account.clone(), s.shop.clone()).into_val(&s.env),
    });
    assert_eq!(
        check(&s, &vec![&s.env, bad]),
        Err(Ok(AccountError::UnsupportedCall))
    );
}

#[test]
fn a_bad_signature_is_not_authorized() {
    let s = setup();
    let ctxs = vec![&s.env, transfer_ctx(&s, &s.account, &s.shop, 10)];
    let p = payload(&s.env, 7);
    // signed over a different payload
    let wrong = agent_sig(&s, &payload(&s.env, 8));
    let res = s.env.try_invoke_contract_check_auth::<AccountError>(
        &s.account,
        &p,
        wrong.into_val(&s.env),
        &ctxs,
    );
    assert!(res.is_err());
    assert_eq!(s.client.get_status().payments_last_24h, 0);
}

#[test]
fn the_owner_key_signature_does_not_pass_as_the_agent() {
    let s = setup();
    let ctxs = vec![&s.env, transfer_ctx(&s, &s.account, &s.shop, 10)];
    let p = payload(&s.env, 7);
    // an Agent-tagged signature made with the owner key
    let forged = Signature::Agent(BytesN::from_array(
        &s.env,
        &s.owner_key.sign(&p.to_array()).to_bytes(),
    ));
    let res = s.env.try_invoke_contract_check_auth::<AccountError>(
        &s.account,
        &p,
        forged.into_val(&s.env),
        &ctxs,
    );
    assert!(res.is_err());
}

// ---------------------------------------------------------------------------
// The owner key
// ---------------------------------------------------------------------------

fn owner_check(
    s: &Setup,
    contexts: &Vec<Context>,
) -> Result<(), Result<AccountError, soroban_sdk::InvokeError>> {
    let p = payload(&s.env, 9);
    s.env.try_invoke_contract_check_auth::<AccountError>(
        &s.account,
        &p,
        owner_sig(s, &p).into_val(&s.env),
        contexts,
    )
}

#[test]
fn the_owner_can_move_funds_only_to_the_recovery_address_even_when_paused() {
    let s = setup();
    s.client.pause();
    let to_recovery = vec![&s.env, transfer_ctx(&s, &s.account, &s.recovery, 900)];
    assert_eq!(owner_check(&s, &to_recovery), Ok(()));

    let thief = Address::generate(&s.env);
    let to_thief = vec![&s.env, transfer_ctx(&s, &s.account, &thief, 900)];
    assert_eq!(
        owner_check(&s, &to_thief),
        Err(Ok(AccountError::NotRecovery))
    );
    // not even to the shop the agent may pay
    let to_shop = vec![&s.env, transfer_ctx(&s, &s.account, &s.shop, 1)];
    assert_eq!(
        owner_check(&s, &to_shop),
        Err(Ok(AccountError::NotRecovery))
    );
}

#[test]
fn the_owner_key_cannot_call_other_functions_either() {
    let s = setup();
    let approve = Context::Contract(ContractContext {
        contract: s.token.clone(),
        fn_name: Symbol::new(&s.env, "approve"),
        args: (s.account.clone(), s.recovery.clone(), 1i128, 1u32).into_val(&s.env),
    });
    assert_eq!(
        owner_check(&s, &vec![&s.env, approve]),
        Err(Ok(AccountError::UnsupportedCall))
    );
}

// ---------------------------------------------------------------------------
// Admin: policy, ceilings and key rotation
// ---------------------------------------------------------------------------

#[test]
fn set_policy_cannot_go_past_the_ceilings() {
    let s = setup();
    let ok = policy(&s.env, core::slice::from_ref(&s.shop));
    assert!(s
        .client
        .try_set_policy(&Policy {
            tx_limit: 201,
            daily_limit: 400,
            ..ok.clone()
        })
        .is_err());
    assert!(s
        .client
        .try_set_policy(&Policy {
            tx_limit: 200,
            daily_limit: 500,
            ..ok
        })
        .is_ok());
}

#[test]
fn rotating_the_agent_key_locks_the_old_one_out() {
    let s = setup();
    let new_agent = SigningKey::from_bytes(&[3u8; 32]);
    s.client.set_agent_key(&pubkey(&s.env, &new_agent));
    let ctxs = vec![&s.env, transfer_ctx(&s, &s.account, &s.shop, 10)];
    assert!(check(&s, &ctxs).is_err());

    let p = payload(&s.env, 7);
    let sig = Signature::Agent(BytesN::from_array(
        &s.env,
        &new_agent.sign(&p.to_array()).to_bytes(),
    ));
    assert_eq!(
        s.env.try_invoke_contract_check_auth::<AccountError>(
            &s.account,
            &p,
            sig.into_val(&s.env),
            &ctxs
        ),
        Ok(())
    );
}

#[test]
fn admin_functions_need_the_owner_signature() {
    let s = setup();
    s.env.set_auths(&[]);
    assert!(s.client.try_pause().is_err());
    assert!(s.client.try_unpause().is_err());
    assert!(s
        .client
        .try_set_policy(&policy(&s.env, core::slice::from_ref(&s.shop)))
        .is_err());
    assert!(s
        .client
        .try_set_agent_key(&pubkey(&s.env, &SigningKey::from_bytes(&[4u8; 32])))
        .is_err());
}

/// Scout does not recognise `#[contractevent]`, so prove here that every admin change emits one.
#[test]
fn every_admin_change_emits_an_event() {
    let s = setup();
    let events = |s: &Setup| {
        s.env
            .events()
            .all()
            .filter_by_contract(&s.account)
            .events()
            .len()
    };
    s.client
        .set_policy(&policy(&s.env, core::slice::from_ref(&s.shop)));
    assert_eq!(events(&s), 1);
    s.client.pause();
    assert_eq!(events(&s), 1);
    s.client.unpause();
    assert_eq!(events(&s), 1);
    s.client
        .set_agent_key(&pubkey(&s.env, &SigningKey::from_bytes(&[3u8; 32])));
    assert_eq!(events(&s), 1);
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn constructor_rejects_a_policy_over_the_ceilings() {
    let env = Env::default();
    let shop = Address::generate(&env);
    env.register(
        AgentAccount,
        (
            Address::generate(&env),
            pubkey(&env, &SigningKey::from_bytes(&[2u8; 32])),
            pubkey(&env, &SigningKey::from_bytes(&[1u8; 32])),
            Address::generate(&env),
            Policy {
                tx_limit: 300,
                daily_limit: 400,
                ..policy(&env, core::slice::from_ref(&shop))
            },
            Address::generate(&env),
            ceilings(),
        ),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn constructor_rejects_the_same_key_for_owner_and_agent() {
    let env = Env::default();
    let shop = Address::generate(&env);
    let key = pubkey(&env, &SigningKey::from_bytes(&[1u8; 32]));
    env.register(
        AgentAccount,
        (
            Address::generate(&env),
            key.clone(),
            key,
            Address::generate(&env),
            policy(&env, core::slice::from_ref(&shop)),
            Address::generate(&env),
            ceilings(),
        ),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn constructor_rejects_the_owner_as_recovery() {
    let env = Env::default();
    let shop = Address::generate(&env);
    let owner = Address::generate(&env);
    env.register(
        AgentAccount,
        (
            owner.clone(),
            pubkey(&env, &SigningKey::from_bytes(&[2u8; 32])),
            pubkey(&env, &SigningKey::from_bytes(&[1u8; 32])),
            Address::generate(&env),
            policy(&env, core::slice::from_ref(&shop)),
            owner,
            ceilings(),
        ),
    );
}

#![no_std]
// The constructor takes eight arguments on purpose: it fixes owner, both keys,
// token, policy, recovery address and ceilings in one atomic step. Grouping them
// into a struct would not make the deployment safer, only harder to read.
#![allow(clippy::too_many_arguments)]

//! CrimsonSentry agent account: architecture B (prototype).
//!
//! The vault (`policy-vault`) holds the money and the agent calls `pay`. Here
//! the agent's own wallet is this contract: it holds the tokens and decides, in
//! `__check_auth`, whether a signature is enough to authorize a call. That is
//! what x402 and MPP need, because they sign a token `transfer` from the
//! payer's account instead of calling a vault.
//!
//! Two signers:
//!
//! * the **agent key** can only authorize `transfer(from = this account, to, amount)`
//!   of the configured token, and only if the policy allows it: allowlist,
//!   minimum, per-payment limit, rolling 24h limit, payments per 24h, and not
//!   paused. Anything else (another function, another contract, creating
//!   contracts) is rejected, so the key cannot approve spenders or call
//!   arbitrary contracts;
//! * the **owner key** can only authorize a `transfer` to the recovery address
//!   fixed at deploy time, even while paused.
//!
//! The policy, ceilings and recovery address work as in the vault v2. Admin
//! functions (`set_policy`, `pause`, `unpause`, `set_agent_key`) need the owner
//! address's own authorization, as in the vault.
//!
//! Status: prototype for testnet. Not audited, and not yet exercised against an
//! x402 facilitator: see docs/ARCHITECTURE-B.md.

use soroban_sdk::{
    auth::{Context, ContractContext, CustomAccountInterface},
    contract, contracterror, contractevent, contractimpl, contracttype,
    crypto::Hash,
    panic_with_error, token, Address, Bytes, BytesN, Env, IntoVal, Symbol, TryFromVal, Val, Vec,
};

#[cfg(test)]
mod test;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    OwnerKey,
    AgentKey,
    Token,
    Policy,
    Ceilings,
    Recovery,
    Paused,
    /// Payments inside the current rolling 24h window.
    SpendLog,
}

/// Same numbers as the vault where the meaning is the same.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AccountError {
    NotAllowlisted = 1,
    OverTxLimit = 2,
    OverDailyLimit = 3,
    ArithmeticOverflow = 4,
    InvalidAmount = 5,
    InvalidPolicy = 6,
    Paused = 7,
    TooManyPayments = 8,
    NotInitialized = 9,
    UnderMinAmount = 12,
    InvalidRecovery = 13,
    PolicyOverCeiling = 14,
    /// The auth context is not a `transfer` of the configured token.
    UnsupportedCall = 15,
    /// `transfer` whose `from` is not this account.
    WrongSource = 16,
    /// The owner key tried to move funds anywhere but the recovery address.
    NotRecovery = 17,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Policy {
    pub min_amount: i128,
    pub tx_limit: i128,
    pub daily_limit: i128,
    pub max_payments_per_day: u32,
    pub allowlist: Vec<Address>,
}

/// Upper bounds fixed at deploy time: `set_policy` can never exceed them.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Ceilings {
    pub max_tx_limit: i128,
    pub max_daily_limit: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Spend {
    pub at: u64,
    pub amount: i128,
}

/// What travels in the auth entry's signature field.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Signature {
    Agent(BytesN<64>),
    Owner(BytesN<64>),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Status {
    pub owner: Address,
    pub token: Address,
    pub recovery: Address,
    pub ceilings: Ceilings,
    pub policy: Policy,
    pub paused: bool,
    pub balance: i128,
    pub spent_last_24h: i128,
    pub payments_last_24h: u32,
    pub remaining_last_24h: i128,
}

/// Admin changes emit events so a monitor can watch the account without reading its storage.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PolicyUpdated {
    pub policy: Policy,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PausedChanged {
    pub paused: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentKeyRotated {
    pub old_key: BytesN<32>,
    pub new_key: BytesN<32>,
}

const DAY_IN_LEDGERS: u32 = 17280;
const BUMP_AMOUNT: u32 = DAY_IN_LEDGERS * 30;
const BUMP_THRESHOLD: u32 = DAY_IN_LEDGERS * 7;
const WINDOW_SECONDS: u64 = 86400;
const MAX_ALLOWLIST: u32 = 32;
const MAX_PAYMENTS_CAP: u32 = 100;

#[contract]
pub struct AgentAccount;

#[contractimpl]
impl AgentAccount {
    /// `owner` administers the account (and must authorize admin calls);
    /// `owner_key` is the ed25519 key whose signature may move funds to
    /// `recovery`; `agent_key` is the ed25519 key the policy governs.
    pub fn __constructor(
        env: Env,
        owner: Address,
        owner_key: BytesN<32>,
        agent_key: BytesN<32>,
        token: Address,
        policy: Policy,
        recovery: Address,
        ceilings: Ceilings,
    ) {
        if ceilings.max_tx_limit <= 0 || ceilings.max_tx_limit > ceilings.max_daily_limit {
            panic_with_error!(&env, AccountError::InvalidPolicy);
        }
        if owner_key == agent_key || recovery == owner || recovery == env.current_contract_address()
        {
            panic_with_error!(&env, AccountError::InvalidRecovery);
        }
        validate_policy(&env, &policy, &ceilings);

        let s = env.storage().instance();
        s.set(&DataKey::Owner, &owner);
        s.set(&DataKey::OwnerKey, &owner_key);
        s.set(&DataKey::AgentKey, &agent_key);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::Policy, &policy);
        s.set(&DataKey::Recovery, &recovery);
        s.set(&DataKey::Ceilings, &ceilings);
        s.set(&DataKey::Paused, &false);
        bump(&env);
    }

    pub fn set_policy(env: Env, policy: Policy) {
        require_owner(&env);
        let ceilings: Ceilings = read(&env, &DataKey::Ceilings);
        validate_policy(&env, &policy, &ceilings);
        env.storage().instance().set(&DataKey::Policy, &policy);
        PolicyUpdated { policy }.publish(&env);
        bump(&env);
    }

    pub fn pause(env: Env) {
        require_owner(&env);
        env.storage().instance().set(&DataKey::Paused, &true);
        PausedChanged { paused: true }.publish(&env);
        bump(&env);
    }

    pub fn unpause(env: Env) {
        require_owner(&env);
        env.storage().instance().set(&DataKey::Paused, &false);
        PausedChanged { paused: false }.publish(&env);
        bump(&env);
    }

    /// Rotates a compromised agent key.
    pub fn set_agent_key(env: Env, new_key: BytesN<32>) {
        require_owner(&env);
        let owner_key: BytesN<32> = read(&env, &DataKey::OwnerKey);
        if new_key == owner_key {
            panic_with_error!(&env, AccountError::InvalidPolicy);
        }
        let old_key: BytesN<32> = read(&env, &DataKey::AgentKey);
        env.storage().instance().set(&DataKey::AgentKey, &new_key);
        AgentKeyRotated { old_key, new_key }.publish(&env);
        bump(&env);
    }

    pub fn get_status(env: Env) -> Status {
        bump(&env);
        let policy: Policy = read(&env, &DataKey::Policy);
        let (log, spent) = window(&env, env.ledger().timestamp());
        let token_id: Address = read(&env, &DataKey::Token);
        Status {
            owner: read(&env, &DataKey::Owner),
            token: token_id.clone(),
            recovery: read(&env, &DataKey::Recovery),
            ceilings: read(&env, &DataKey::Ceilings),
            paused: read(&env, &DataKey::Paused),
            balance: token::TokenClient::new(&env, &token_id)
                .balance(&env.current_contract_address()),
            spent_last_24h: spent,
            payments_last_24h: log.len(),
            remaining_last_24h: policy.daily_limit.checked_sub(spent).unwrap_or(0).max(0),
            policy,
        }
    }
}

#[contractimpl]
impl CustomAccountInterface for AgentAccount {
    type Signature = Signature;
    type Error = AccountError;

    /// Called by the host whenever this account's address is asked to
    /// authorize something. Replay protection is the host's: the nonce and
    /// expiration are part of `signature_payload`.
    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: Signature,
        auth_contexts: Vec<Context>,
    ) -> Result<(), AccountError> {
        let token_id: Address = read_or_err(&env, &DataKey::Token)?;
        let message = Bytes::from_array(&env, &signature_payload.to_array());

        match signature {
            Signature::Agent(sig) => {
                let key: BytesN<32> = read_or_err(&env, &DataKey::AgentKey)?;
                env.crypto().ed25519_verify(&key, &message, &sig);
                authorize_agent(&env, &token_id, &auth_contexts)
            }
            Signature::Owner(sig) => {
                let key: BytesN<32> = read_or_err(&env, &DataKey::OwnerKey)?;
                env.crypto().ed25519_verify(&key, &message, &sig);
                authorize_owner(&env, &token_id, &auth_contexts)
            }
        }
    }
}

// ----------------------------------------------------------------------
// Authorization
// ----------------------------------------------------------------------

/// A `transfer(from, to, amount)` of the configured token, or `None` for any
/// other call. Muxed destinations do not decode as `Address`, so they are
/// refused too: the policy fails closed.
fn parse_transfer(
    env: &Env,
    token_id: &Address,
    c: &ContractContext,
) -> Option<(Address, Address, i128)> {
    if &c.contract != token_id || c.fn_name != Symbol::new(env, "transfer") || c.args.len() != 3 {
        return None;
    }
    let from = Address::try_from_val(env, &c.args.get(0)?).ok()?;
    let to = Address::try_from_val(env, &c.args.get(1)?).ok()?;
    let amount = i128::try_from_val(env, &c.args.get(2)?).ok()?;
    Some((from, to, amount))
}

fn authorize_agent(
    env: &Env,
    token_id: &Address,
    contexts: &Vec<Context>,
) -> Result<(), AccountError> {
    if read::<bool>(env, &DataKey::Paused) {
        return Err(AccountError::Paused);
    }
    let policy: Policy = read_or_err(env, &DataKey::Policy)?;
    let now = env.ledger().timestamp();
    let (mut log, mut spent) = window(env, now);

    for ctx in contexts.iter() {
        let Context::Contract(call) = ctx else {
            return Err(AccountError::UnsupportedCall);
        };
        let (from, to, amount) =
            parse_transfer(env, token_id, &call).ok_or(AccountError::UnsupportedCall)?;
        if from != env.current_contract_address() {
            return Err(AccountError::WrongSource);
        }
        if amount <= 0 {
            return Err(AccountError::InvalidAmount);
        }
        if !policy.allowlist.contains(&to) {
            return Err(AccountError::NotAllowlisted);
        }
        if amount < policy.min_amount {
            return Err(AccountError::UnderMinAmount);
        }
        if amount > policy.tx_limit {
            return Err(AccountError::OverTxLimit);
        }
        if log.len() >= policy.max_payments_per_day {
            return Err(AccountError::TooManyPayments);
        }
        spent = spent
            .checked_add(amount)
            .ok_or(AccountError::ArithmeticOverflow)?;
        if spent > policy.daily_limit {
            return Err(AccountError::OverDailyLimit);
        }
        log.push_back(Spend { at: now, amount });
    }

    env.storage().persistent().set(&DataKey::SpendLog, &log);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::SpendLog, BUMP_THRESHOLD, BUMP_AMOUNT);
    Ok(())
}

/// The owner key moves funds only to the recovery address, even when paused.
fn authorize_owner(
    env: &Env,
    token_id: &Address,
    contexts: &Vec<Context>,
) -> Result<(), AccountError> {
    let recovery: Address = read_or_err(env, &DataKey::Recovery)?;
    for ctx in contexts.iter() {
        let Context::Contract(call) = ctx else {
            return Err(AccountError::UnsupportedCall);
        };
        let (from, to, amount) =
            parse_transfer(env, token_id, &call).ok_or(AccountError::UnsupportedCall)?;
        if from != env.current_contract_address() {
            return Err(AccountError::WrongSource);
        }
        if amount <= 0 {
            return Err(AccountError::InvalidAmount);
        }
        if to != recovery {
            return Err(AccountError::NotRecovery);
        }
    }
    Ok(())
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

fn read<T: TryFromVal<Env, Val> + IntoVal<Env, Val>>(env: &Env, key: &DataKey) -> T {
    match env.storage().instance().get(key) {
        Some(v) => v,
        None => panic_with_error!(env, AccountError::NotInitialized),
    }
}

fn read_or_err<T: TryFromVal<Env, Val> + IntoVal<Env, Val>>(
    env: &Env,
    key: &DataKey,
) -> Result<T, AccountError> {
    env.storage()
        .instance()
        .get(key)
        .ok_or(AccountError::NotInitialized)
}

fn require_owner(env: &Env) {
    let owner: Address = read(env, &DataKey::Owner);
    owner.require_auth();
}

fn bump(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
}

/// Payments still inside the rolling 24h window and their total.
fn window(env: &Env, now: u64) -> (Vec<Spend>, i128) {
    let log: Vec<Spend> = env
        .storage()
        .persistent()
        .get(&DataKey::SpendLog)
        .unwrap_or(Vec::new(env));
    let mut first_fresh = log.len();
    let mut spent: i128 = 0;
    for (i, s) in log.iter().enumerate() {
        if now < s.at.saturating_add(WINDOW_SECONDS) {
            if first_fresh == log.len() {
                first_fresh = i as u32;
            }
            spent = match spent.checked_add(s.amount) {
                Some(v) => v,
                None => panic_with_error!(env, AccountError::ArithmeticOverflow),
            };
        }
    }
    (log.slice(first_fresh..), spent)
}

fn validate_policy(env: &Env, policy: &Policy, ceilings: &Ceilings) {
    let valid = policy.min_amount > 0
        && policy.min_amount <= policy.tx_limit
        && policy.tx_limit > 0
        && policy.daily_limit > 0
        && policy.tx_limit <= policy.daily_limit
        && policy.max_payments_per_day > 0
        && policy.max_payments_per_day <= MAX_PAYMENTS_CAP
        && policy.allowlist.len() <= MAX_ALLOWLIST
        && !policy.allowlist.contains(env.current_contract_address());
    if !valid {
        panic_with_error!(env, AccountError::InvalidPolicy);
    }
    if policy.tx_limit > ceilings.max_tx_limit || policy.daily_limit > ceilings.max_daily_limit {
        panic_with_error!(env, AccountError::PolicyOverCeiling);
    }
}

#![no_std]

//! CrimsonSentry Policy Vault.
//!
//! An AI agent never pays from its own wallet: funds live in this contract and
//! every payment goes through `pay`, which enforces an on-chain policy
//! (allowlist, per-transaction limit, rolling 24h limit, payment-rate limit).
//! Any violation panics with a typed error and reverts the whole transaction.
//! The owner keeps a kill switch (`pause`), can rotate the agent and owner
//! keys through controlled transitions, and can recover the funds (`withdraw`).

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, IntoVal, TryFromVal, Val, Vec,
};

#[cfg(test)]
mod test;

/// Storage keys. Each variant is its own slot — never reuse a key for two
/// different pieces of data (storage key collision is HIGH severity per the
/// pre-deploy checklist).
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    Agent,
    Token,
    Policy,
    Paused,
    /// Payments made inside the current rolling 24h window.
    SpendLog,
    /// New owner awaiting acceptance by its own address.
    PendingOwner,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaultError {
    NotAllowlisted = 1,
    OverTxLimit = 2,
    OverDailyLimit = 3,
    ArithmeticOverflow = 4,
    InvalidAmount = 5,
    InvalidPolicy = 6,
    Paused = 7,
    TooManyPayments = 8,
    NotInitialized = 9,
    InvalidOwner = 10,
    NoPendingOwner = 11,
}

/// The rules the agent must respect. Stored as a single entry so a policy
/// update is atomic.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Policy {
    /// Max amount of a single payment.
    pub tx_limit: i128,
    /// Max total spent in any rolling 24h window (not a calendar day, so the
    /// agent cannot double-spend across midnight).
    pub daily_limit: i128,
    /// Max number of payments in any rolling 24h window. Stops a runaway or
    /// hijacked agent from draining the vault with many small payments.
    pub max_payments_per_day: u32,
    /// The only destinations the agent may pay.
    pub allowlist: Vec<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Spend {
    pub at: u64,
    pub amount: i128,
}

/// Everything the CLI scanner / dashboard needs, in one read-only call.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Status {
    pub owner: Address,
    pub agent: Address,
    pub token: Address,
    pub paused: bool,
    pub policy: Policy,
    pub balance: i128,
    pub spent_last_24h: i128,
    pub payments_last_24h: u32,
    pub remaining_last_24h: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Paid {
    #[topic]
    pub to: Address,
    pub amount: i128,
    pub spent_last_24h: i128,
}

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
pub struct AgentRotated {
    pub old_agent: Address,
    pub new_agent: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnerChangeProposed {
    pub current_owner: Address,
    pub proposed_owner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnerRotated {
    pub old_owner: Address,
    pub new_owner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnerChangeCancelled {
    pub owner: Address,
    pub proposed_owner: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Withdrawn {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

// Ledger bump constants, assuming ~5s ledgers (~17280 ledgers/day).
const DAY_IN_LEDGERS: u32 = 17280;
const BUMP_AMOUNT: u32 = DAY_IN_LEDGERS * 30; // extend ~30 days out
const BUMP_THRESHOLD: u32 = DAY_IN_LEDGERS * 7; // extend once within 7 days of expiry
const WINDOW_SECONDS: u64 = 86400;

/// Hard caps that keep every loop in the contract bounded (DoS protection):
/// both the allowlist scan and the spend-log scan are O(cap).
const MAX_ALLOWLIST: u32 = 32;
const MAX_PAYMENTS_CAP: u32 = 100;

#[contract]
pub struct PolicyVault;

#[contractimpl]
impl PolicyVault {
    /// Deploy-time setup. Runs once, at instantiation — there is deliberately
    /// no `initialize()` function (re-initialization is a CRITICAL vuln from
    /// the pre-deploy checklist); the constructor makes it structurally
    /// impossible.
    pub fn __constructor(env: Env, owner: Address, agent: Address, token: Address, policy: Policy) {
        validate_policy(&env, &policy, &owner, &agent, None);

        let storage = env.storage().instance();
        storage.set(&DataKey::Owner, &owner);
        storage.set(&DataKey::Agent, &agent);
        storage.set(&DataKey::Token, &token);
        storage.set(&DataKey::Policy, &policy);
        storage.set(&DataKey::Paused, &false);
        bump_instance(&env);
    }

    // ------------------------------------------------------------------
    // Agent
    // ------------------------------------------------------------------

    /// Agent-only: attempt a payment. If it violates any rule this panics,
    /// which reverts the whole transaction. That revert, with its hash on
    /// Stellar Expert, is the demo the judges want to see.
    pub fn pay(env: Env, destino: Address, monto: i128) {
        let agent: Address = read(&env, &DataKey::Agent);
        agent.require_auth();

        if monto <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }
        if read::<bool>(&env, &DataKey::Paused) {
            panic_with_error!(&env, VaultError::Paused);
        }

        let policy: Policy = read(&env, &DataKey::Policy);

        // Rule 1: destination must be on the allowlist.
        if !policy.allowlist.contains(&destino) {
            panic_with_error!(&env, VaultError::NotAllowlisted);
        }

        // Rule 2: per-transaction limit.
        if monto > policy.tx_limit {
            panic_with_error!(&env, VaultError::OverTxLimit);
        }

        // Rules 3 and 4: rolling 24h amount and payment-count limits.
        let now = env.ledger().timestamp();
        let (mut log, spent) = window(&env, now);

        if log.len() >= policy.max_payments_per_day {
            panic_with_error!(&env, VaultError::TooManyPayments);
        }

        let new_spent = match spent.checked_add(monto) {
            Some(v) => v,
            None => panic_with_error!(&env, VaultError::ArithmeticOverflow),
        };
        if new_spent > policy.daily_limit {
            panic_with_error!(&env, VaultError::OverDailyLimit);
        }

        log.push_back(Spend {
            at: now,
            amount: monto,
        });
        env.storage().persistent().set(&DataKey::SpendLog, &log);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::SpendLog, BUMP_THRESHOLD, BUMP_AMOUNT);

        // All rules passed: pay from the vault's own balance. The vault acting
        // as itself IS the authorization for the token transfer; only the
        // agent's require_auth above gates entry into this function.
        token_client(&env).transfer(&env.current_contract_address(), &destino, &monto);

        Paid {
            to: destino,
            amount: monto,
            spent_last_24h: new_spent,
        }
        .publish(&env);
        bump_instance(&env);
    }

    // ------------------------------------------------------------------
    // Owner
    // ------------------------------------------------------------------

    /// Owner-only: replace the whole policy atomically.
    pub fn set_policy(env: Env, policy: Policy) {
        require_owner(&env);
        let owner: Address = read(&env, &DataKey::Owner);
        let agent: Address = read(&env, &DataKey::Agent);
        let pending_owner: Option<Address> = env.storage().instance().get(&DataKey::PendingOwner);
        validate_policy(&env, &policy, &owner, &agent, pending_owner.as_ref());

        env.storage().instance().set(&DataKey::Policy, &policy);
        PolicyUpdated { policy }.publish(&env);
        bump_instance(&env);
    }

    /// Owner-only kill switch: blocks every `pay` until `unpause`.
    pub fn pause(env: Env) {
        set_paused(&env, true);
    }

    pub fn unpause(env: Env) {
        set_paused(&env, false);
    }

    /// Solo el dueño puede rotar la clave; la dirección nueva también debe
    /// conservar la separación de roles y quedar fuera de la allowlist.
    pub fn set_agent(env: Env, new_agent: Address) {
        require_owner(&env);

        let old_agent: Address = read(&env, &DataKey::Agent);
        let owner: Address = read(&env, &DataKey::Owner);
        let policy: Policy = read(&env, &DataKey::Policy);
        let pending_owner: Option<Address> = env.storage().instance().get(&DataKey::PendingOwner);
        if new_agent == owner
            || pending_owner.as_ref() == Some(&new_agent)
            || policy.allowlist.contains(&new_agent)
        {
            panic_with_error!(&env, VaultError::InvalidPolicy);
        }
        env.storage().instance().set(&DataKey::Agent, &new_agent);
        AgentRotated {
            old_agent,
            new_agent,
        }
        .publish(&env);
        bump_instance(&env);
    }

    /// El dueño actual propone el cambio; la nueva dirección debe aceptarlo.
    pub fn propose_owner(env: Env, new_owner: Address) {
        require_owner(&env);

        let owner: Address = read(&env, &DataKey::Owner);
        let agent: Address = read(&env, &DataKey::Agent);
        let policy: Policy = read(&env, &DataKey::Policy);
        if new_owner == owner || new_owner == agent || policy.allowlist.contains(&new_owner) {
            panic_with_error!(&env, VaultError::InvalidOwner);
        }

        env.storage()
            .instance()
            .set(&DataKey::PendingOwner, &new_owner);
        OwnerChangeProposed {
            current_owner: owner,
            proposed_owner: new_owner,
        }
        .publish(&env);
        bump_instance(&env);
    }

    /// Solo la dirección propuesta puede aceptar y obtener el control.
    pub fn accept_owner(env: Env) {
        let pending_owner: Address = match env.storage().instance().get(&DataKey::PendingOwner) {
            Some(owner) => owner,
            None => panic_with_error!(&env, VaultError::NoPendingOwner),
        };
        pending_owner.require_auth();

        let old_owner: Address = read(&env, &DataKey::Owner);
        let agent: Address = read(&env, &DataKey::Agent);
        let policy: Policy = read(&env, &DataKey::Policy);
        if pending_owner == agent || policy.allowlist.contains(&pending_owner) {
            panic_with_error!(&env, VaultError::InvalidOwner);
        }

        let storage = env.storage().instance();
        storage.set(&DataKey::Owner, &pending_owner);
        storage.remove(&DataKey::PendingOwner);
        OwnerRotated {
            old_owner,
            new_owner: pending_owner,
        }
        .publish(&env);
        bump_instance(&env);
    }

    /// El dueño actual puede cancelar una propuesta antes de que se acepte.
    pub fn cancel_owner_change(env: Env) {
        require_owner(&env);
        let pending_owner: Address = match env.storage().instance().get(&DataKey::PendingOwner) {
            Some(owner) => owner,
            None => panic_with_error!(&env, VaultError::NoPendingOwner),
        };
        let owner: Address = read(&env, &DataKey::Owner);

        env.storage().instance().remove(&DataKey::PendingOwner);
        OwnerChangeCancelled {
            owner,
            proposed_owner: pending_owner,
        }
        .publish(&env);
        bump_instance(&env);
    }

    /// Owner-only: recover funds. Works even while paused and ignores the
    /// agent policy — the owner must always be able to get the money out.
    pub fn withdraw(env: Env, to: Address, amount: i128) {
        require_owner(&env);
        if amount <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }

        token_client(&env).transfer(&env.current_contract_address(), &to, &amount);
        Withdrawn { to, amount }.publish(&env);
        bump_instance(&env);
    }

    // ------------------------------------------------------------------
    // Read-only
    // ------------------------------------------------------------------

    pub fn get_policy(env: Env) -> Policy {
        bump_instance(&env);
        read(&env, &DataKey::Policy)
    }

    /// Devuelve la propuesta pendiente para que clientes puedan verificarla.
    pub fn get_pending_owner(env: Env) -> Option<Address> {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::PendingOwner)
    }

    /// Full snapshot for the scanner / dashboard.
    pub fn get_status(env: Env) -> Status {
        bump_instance(&env);

        let policy: Policy = read(&env, &DataKey::Policy);
        let (log, spent) = window(&env, env.ledger().timestamp());
        let remaining = policy.daily_limit.checked_sub(spent).unwrap_or(0).max(0);

        Status {
            owner: read(&env, &DataKey::Owner),
            agent: read(&env, &DataKey::Agent),
            token: read(&env, &DataKey::Token),
            paused: read(&env, &DataKey::Paused),
            balance: token_client(&env).balance(&env.current_contract_address()),
            spent_last_24h: spent,
            payments_last_24h: log.len(),
            remaining_last_24h: remaining,
            policy,
        }
    }
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/// Reads a value set by the constructor. The constructor always runs first,
/// so a miss means corrupted state: fail with a typed error, never `unwrap`.
fn read<T: TryFromVal<Env, Val> + IntoVal<Env, Val>>(env: &Env, key: &DataKey) -> T {
    match env.storage().instance().get(key) {
        Some(v) => v,
        None => panic_with_error!(env, VaultError::NotInitialized),
    }
}

fn require_owner(env: &Env) {
    let owner: Address = read(env, &DataKey::Owner);
    owner.require_auth();
}

fn set_paused(env: &Env, paused: bool) {
    require_owner(env);
    env.storage().instance().set(&DataKey::Paused, &paused);
    PausedChanged { paused }.publish(env);
    bump_instance(env);
}

fn token_client(env: &Env) -> token::TokenClient<'_> {
    let token_id: Address = read(env, &DataKey::Token);
    token::TokenClient::new(env, &token_id)
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
}

/// Returns the payments still inside the rolling 24h window and their total.
/// Older entries are dropped, so the log never grows beyond
/// `max_payments_per_day` (itself capped at `MAX_PAYMENTS_CAP`).
///
/// The log is append-only and ledger timestamps never decrease, so it is
/// sorted by time: the fresh entries are always a suffix and can be sliced
/// off without building a new vector.
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
                None => panic_with_error!(env, VaultError::ArithmeticOverflow),
            };
        }
    }
    (log.slice(first_fresh..), spent)
}

fn validate_policy(
    env: &Env,
    policy: &Policy,
    owner: &Address,
    agent: &Address,
    pending_owner: Option<&Address>,
) {
    // Tercio, tu Claude la cagó aquí xd, pero ya la arreglé: evita convertir al agente o al dueño en destino pagable.
    let valid = policy.tx_limit > 0
        && policy.daily_limit > 0
        && policy.tx_limit <= policy.daily_limit
        && policy.max_payments_per_day > 0
        && policy.max_payments_per_day <= MAX_PAYMENTS_CAP
        && policy.allowlist.len() <= MAX_ALLOWLIST
        // No permitimos destinos que evadan los roles o quemen cuota sin mover fondos.
        && !policy.allowlist.contains(env.current_contract_address())
        && owner != agent
        && !policy.allowlist.contains(owner)
        && !policy.allowlist.contains(agent)
        && pending_owner.is_none_or(|candidate| !policy.allowlist.contains(candidate));
    if !valid {
        panic_with_error!(env, VaultError::InvalidPolicy);
    }
}

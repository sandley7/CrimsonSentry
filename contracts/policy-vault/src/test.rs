#![cfg(test)]
extern crate std;

use super::{Policy, PolicyVault, PolicyVaultClient, VaultError};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, InvokeError, Vec,
};

const HOUR: u64 = 3600;
const DAY: u64 = 86400;

struct Setup<'a> {
    env: Env,
    owner: Address,
    agent: Address,
    recipient_ok: Address,
    token: TokenClient<'a>,
    vault: PolicyVaultClient<'a>,
}

fn policy(env: &Env, allowlist: &[Address]) -> Policy {
    let mut list = Vec::new(env);
    for a in allowlist {
        list.push_back(a.clone());
    }
    Policy {
        tx_limit: 100,
        daily_limit: 250,
        max_payments_per_day: 5,
        allowlist: list,
    }
}

/// Deploys a test SAC token, funds a fresh vault with 1,000 units and sets
/// the policy: tx_limit = 100, daily_limit = 250 (rolling 24h),
/// max 5 payments / 24h, allowlist = [recipient_ok].
fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let recipient_ok = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(token_admin);
    let token = TokenClient::new(&env, &sac.address());

    let vault_id = env.register(
        PolicyVault,
        (
            owner.clone(),
            agent.clone(),
            sac.address(),
            policy(&env, core::slice::from_ref(&recipient_ok)),
        ),
    );
    let vault = PolicyVaultClient::new(&env, &vault_id);

    StellarAssetClient::new(&env, &sac.address()).mint(&vault_id, &1_000);

    Setup {
        env,
        owner,
        agent,
        recipient_ok,
        token,
        vault,
    }
}

/// What a `try_*` call returns when the contract reverts with `e`.
fn fail(e: VaultError) -> Result<soroban_sdk::Error, InvokeError> {
    Ok(e.into())
}

fn advance(env: &Env, seconds: u64) {
    env.ledger().with_mut(|l| l.timestamp += seconds);
}

// ---------------------------------------------------------------------------
// The four scenarios from the original plan
// ---------------------------------------------------------------------------

#[test]
fn payment_within_policy_succeeds() {
    let s = setup();
    s.vault.pay(&s.recipient_ok, &50);
    assert_eq!(s.token.balance(&s.recipient_ok), 50);
    assert_eq!(s.token.balance(&s.vault.address), 950);
}

#[test]
fn payment_to_non_allowlisted_address_reverts() {
    let s = setup();
    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.vault.try_pay(&stranger, &10),
        Err(fail(VaultError::NotAllowlisted))
    );
    assert_eq!(s.token.balance(&stranger), 0);
}

#[test]
fn payment_over_tx_limit_reverts() {
    let s = setup();
    assert_eq!(
        s.vault.try_pay(&s.recipient_ok, &150),
        Err(fail(VaultError::OverTxLimit))
    );
}

#[test]
fn payment_over_daily_limit_reverts() {
    let s = setup();
    s.vault.pay(&s.recipient_ok, &100);
    s.vault.pay(&s.recipient_ok, &100);
    assert_eq!(
        s.vault.try_pay(&s.recipient_ok, &100),
        Err(fail(VaultError::OverDailyLimit))
    );
    assert_eq!(s.token.balance(&s.recipient_ok), 200);
}

// ---------------------------------------------------------------------------
// Fixes over the original design
// ---------------------------------------------------------------------------

#[test]
fn zero_and_negative_amounts_are_rejected() {
    let s = setup();
    assert_eq!(
        s.vault.try_pay(&s.recipient_ok, &0),
        Err(fail(VaultError::InvalidAmount))
    );
    assert_eq!(
        s.vault.try_pay(&s.recipient_ok, &-100),
        Err(fail(VaultError::InvalidAmount))
    );
}

/// With a calendar-day bucket the agent could spend 250 at 23:59 and another
/// 250 at 00:01. The rolling window blocks that.
#[test]
fn midnight_boundary_cannot_double_the_daily_limit() {
    let s = setup();
    // Put the ledger 2 minutes before a calendar-day boundary.
    let t = s.env.ledger().timestamp();
    s.env.ledger().set_timestamp(t - (t % DAY) + DAY - 120);

    s.vault.pay(&s.recipient_ok, &100);
    s.vault.pay(&s.recipient_ok, &100);
    advance(&s.env, 240); // now 2 minutes past midnight
    assert_eq!(
        s.vault.try_pay(&s.recipient_ok, &100),
        Err(fail(VaultError::OverDailyLimit))
    );
}

#[test]
fn rolling_window_frees_quota_after_24h() {
    let s = setup();
    s.vault.pay(&s.recipient_ok, &100);
    advance(&s.env, 12 * HOUR);
    s.vault.pay(&s.recipient_ok, &100);

    // 23h after the first payment both still count: 200 + 100 > 250.
    advance(&s.env, 11 * HOUR);
    assert_eq!(
        s.vault.try_pay(&s.recipient_ok, &100),
        Err(fail(VaultError::OverDailyLimit))
    );

    // Just past 24h the first payment leaves the window: 100 + 100 <= 250.
    advance(&s.env, HOUR);
    s.vault.pay(&s.recipient_ok, &100);
    assert_eq!(s.vault.get_status().spent_last_24h, 200);
}

#[test]
fn payment_rate_limit_stops_many_small_payments() {
    let s = setup();
    for _ in 0..5 {
        s.vault.pay(&s.recipient_ok, &1);
    }
    assert_eq!(
        s.vault.try_pay(&s.recipient_ok, &1),
        Err(fail(VaultError::TooManyPayments))
    );
}

/// Lowering the cap below the payments already made in the window blocks
/// the agent right away, instead of waiting for the window to roll.
#[test]
fn lowering_the_payment_cap_blocks_further_payments() {
    let s = setup();
    for _ in 0..3 {
        s.vault.pay(&s.recipient_ok, &1);
    }
    s.vault.set_policy(&Policy {
        max_payments_per_day: 2,
        ..policy(&s.env, core::slice::from_ref(&s.recipient_ok))
    });
    assert_eq!(
        s.vault.try_pay(&s.recipient_ok, &1),
        Err(fail(VaultError::TooManyPayments))
    );
}

#[test]
fn pause_blocks_the_agent_and_unpause_restores_it() {
    let s = setup();
    s.vault.pause();
    assert_eq!(
        s.vault.try_pay(&s.recipient_ok, &10),
        Err(fail(VaultError::Paused))
    );
    s.vault.unpause();
    s.vault.pay(&s.recipient_ok, &10);
    assert_eq!(s.token.balance(&s.recipient_ok), 10);
}

#[test]
fn owner_can_withdraw_everything_even_while_paused() {
    let s = setup();
    s.vault.pause();
    s.vault.withdraw(&s.owner, &1_000);
    assert_eq!(s.token.balance(&s.owner), 1_000);
    assert_eq!(s.token.balance(&s.vault.address), 0);
}

#[test]
fn rotated_agent_key_is_the_only_one_that_can_pay() {
    let s = setup();
    let new_agent = Address::generate(&s.env);
    s.vault.set_agent(&new_agent);

    s.vault.pay(&s.recipient_ok, &10);
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, new_agent);
    assert_eq!(s.vault.get_status().agent, new_agent);
}

#[test]
fn agent_cannot_be_rotated_to_owner_or_allowlisted_destination() {
    let s = setup();
    assert_eq!(
        s.vault.try_set_agent(&s.owner),
        Err(fail(VaultError::InvalidPolicy))
    );
    assert_eq!(
        s.vault.try_set_agent(&s.recipient_ok),
        Err(fail(VaultError::InvalidPolicy))
    );
    assert_eq!(s.vault.get_status().agent, s.agent);
}

#[test]
fn owner_rotation_requires_proposal_and_acceptance_by_new_owner() {
    let s = setup();
    let new_owner = Address::generate(&s.env);

    s.vault.propose_owner(&new_owner);
    assert_eq!(s.env.auths()[0].0, s.owner);
    assert_eq!(s.vault.get_status().owner, s.owner);
    assert_eq!(s.vault.get_pending_owner(), Some(new_owner.clone()));

    s.vault.accept_owner();
    assert_eq!(s.env.auths()[0].0, new_owner);
    assert_eq!(s.vault.get_status().owner, new_owner);
    assert_eq!(s.vault.get_pending_owner(), None);
    s.env.set_auths(&[]);
    assert!(s.vault.try_pause().is_err());
}

#[test]
fn owner_rotation_rejects_existing_roles_and_payment_destinations() {
    let s = setup();
    for invalid in [&s.owner, &s.agent, &s.recipient_ok] {
        assert_eq!(
            s.vault.try_propose_owner(invalid),
            Err(fail(VaultError::InvalidOwner))
        );
    }
    assert_eq!(s.vault.get_pending_owner(), None);
}

#[test]
fn pending_owner_cannot_become_agent_or_payment_destination() {
    let s = setup();
    let proposed = Address::generate(&s.env);
    s.vault.propose_owner(&proposed);

    assert_eq!(
        s.vault.try_set_agent(&proposed),
        Err(fail(VaultError::InvalidPolicy))
    );
    let invalid_policy = policy(&s.env, core::slice::from_ref(&proposed));
    assert_eq!(
        s.vault.try_set_policy(&invalid_policy),
        Err(fail(VaultError::InvalidPolicy))
    );
}

#[test]
fn owner_can_cancel_a_proposal_and_missing_proposals_return_typed_errors() {
    let s = setup();
    assert_eq!(
        s.vault.try_accept_owner(),
        Err(fail(VaultError::NoPendingOwner))
    );
    assert_eq!(
        s.vault.try_cancel_owner_change(),
        Err(fail(VaultError::NoPendingOwner))
    );

    let proposed = Address::generate(&s.env);
    s.vault.propose_owner(&proposed);
    s.vault.cancel_owner_change();
    assert_eq!(s.vault.get_status().owner, s.owner);
    assert_eq!(s.vault.get_pending_owner(), None);
    assert_eq!(
        s.vault.try_accept_owner(),
        Err(fail(VaultError::NoPendingOwner))
    );
}

// ---------------------------------------------------------------------------
// Authorization: the right key signs each privileged call
// ---------------------------------------------------------------------------

#[test]
fn pay_requires_the_agent_signature() {
    let s = setup();
    s.vault.pay(&s.recipient_ok, &10);
    assert_eq!(s.env.auths()[0].0, s.agent);
}

#[test]
fn owner_functions_require_the_owner_signature() {
    let s = setup();
    s.vault
        .set_policy(&policy(&s.env, core::slice::from_ref(&s.recipient_ok)));
    assert_eq!(s.env.auths()[0].0, s.owner);
    s.vault.pause();
    assert_eq!(s.env.auths()[0].0, s.owner);
    s.vault.unpause();
    assert_eq!(s.env.auths()[0].0, s.owner);
    s.vault.set_agent(&s.agent);
    assert_eq!(s.env.auths()[0].0, s.owner);
    let proposed = Address::generate(&s.env);
    s.vault.propose_owner(&proposed);
    assert_eq!(s.env.auths()[0].0, s.owner);
    s.vault.cancel_owner_change();
    assert_eq!(s.env.auths()[0].0, s.owner);
    s.vault.withdraw(&s.owner, &1);
    assert_eq!(s.env.auths()[0].0, s.owner);
}

#[test]
fn nothing_works_without_signatures() {
    let s = setup();
    s.env.set_auths(&[]);
    assert!(s.vault.try_pay(&s.recipient_ok, &10).is_err());
    assert!(s.vault.try_pause().is_err());
    assert!(s.vault.try_unpause().is_err());
    assert!(s.vault.try_set_policy(&policy(&s.env, &[])).is_err());
    assert!(s.vault.try_propose_owner(&s.agent).is_err());
    assert!(s.vault.try_accept_owner().is_err());
    assert!(s.vault.try_cancel_owner_change().is_err());
    assert!(s.vault.try_withdraw(&s.agent, &1_000).is_err());
    assert!(s.vault.try_set_agent(&s.agent).is_err());
    assert_eq!(s.token.balance(&s.vault.address), 1_000);
}

// ---------------------------------------------------------------------------
// Policy validation
// ---------------------------------------------------------------------------

#[test]
fn set_policy_rejects_invalid_policies() {
    let s = setup();
    let ok = policy(&s.env, core::slice::from_ref(&s.recipient_ok));

    let bad = [
        Policy {
            tx_limit: 0,
            ..ok.clone()
        },
        Policy {
            daily_limit: -1,
            ..ok.clone()
        },
        Policy {
            tx_limit: 300,
            ..ok.clone()
        }, // tx_limit > daily_limit
        Policy {
            max_payments_per_day: 0,
            ..ok.clone()
        },
        Policy {
            max_payments_per_day: 101,
            ..ok.clone()
        },
        policy(&s.env, core::slice::from_ref(&s.vault.address)), // vault paying itself
        policy(&s.env, core::slice::from_ref(&s.owner)),         // vault paying its owner
        policy(&s.env, core::slice::from_ref(&s.agent)),         // vault paying its agent
    ];
    for p in bad.iter() {
        assert_eq!(
            s.vault.try_set_policy(p),
            Err(fail(VaultError::InvalidPolicy))
        );
    }

    let mut huge = Vec::new(&s.env);
    for _ in 0..33 {
        huge.push_back(Address::generate(&s.env));
    }
    assert_eq!(
        s.vault.try_set_policy(&Policy {
            allowlist: huge,
            ..ok.clone()
        }),
        Err(fail(VaultError::InvalidPolicy))
    );

    assert_eq!(s.vault.get_policy(), ok);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn constructor_rejects_owner_and_agent_with_the_same_address() {
    let env = Env::default();
    let party = Address::generate(&env);
    let shop = Address::generate(&env);
    env.register(
        PolicyVault,
        (
            party.clone(),
            party.clone(),
            Address::generate(&env),
            policy(&env, core::slice::from_ref(&shop)),
        ),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn constructor_rejects_invalid_policy() {
    let env = Env::default();
    let a = Address::generate(&env);
    let bad = Policy {
        tx_limit: 500,
        daily_limit: 100,
        max_payments_per_day: 5,
        allowlist: Vec::new(&env),
    };
    env.register(PolicyVault, (a.clone(), a.clone(), a, bad));
}

#[test]
fn status_reports_what_the_scanner_needs() {
    let s = setup();
    s.vault.pay(&s.recipient_ok, &100);
    s.vault.pay(&s.recipient_ok, &40);

    let st = s.vault.get_status();
    assert_eq!(st.owner, s.owner);
    assert_eq!(st.agent, s.agent);
    assert_eq!(st.token, s.token.address);
    assert!(!st.paused);
    assert_eq!(st.balance, 860);
    assert_eq!(st.spent_last_24h, 140);
    assert_eq!(st.payments_last_24h, 2);
    assert_eq!(st.remaining_last_24h, 110);
}

/// Scout's `storage-change-events` detector does not recognise the
/// `#[contractevent]` style, so prove here that every state change emits one.
#[test]
fn every_state_change_emits_an_event() {
    let s = setup();
    let vault_events = |s: &Setup| {
        s.env
            .events()
            .all()
            .filter_by_contract(&s.vault.address)
            .events()
            .len()
    };

    s.vault.pay(&s.recipient_ok, &10);
    assert_eq!(vault_events(&s), 1);
    s.vault
        .set_policy(&policy(&s.env, core::slice::from_ref(&s.recipient_ok)));
    assert_eq!(vault_events(&s), 1);
    s.vault.pause();
    assert_eq!(vault_events(&s), 1);
    s.vault.unpause();
    assert_eq!(vault_events(&s), 1);
    s.vault.set_agent(&s.agent);
    assert_eq!(vault_events(&s), 1);
    let proposed = Address::generate(&s.env);
    s.vault.propose_owner(&proposed);
    assert_eq!(vault_events(&s), 1);
    s.vault.cancel_owner_change();
    assert_eq!(vault_events(&s), 1);
    s.vault.propose_owner(&proposed);
    s.vault.accept_owner();
    assert_eq!(vault_events(&s), 1);
    s.vault.withdraw(&proposed, &1);
    assert_eq!(vault_events(&s), 1);
}

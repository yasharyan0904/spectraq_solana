// `mock_callback_signal` — admin-or-agent manual override for the demo path
// (MOCK_MPC=true). Behaves like the real Arcium callback but skips the BLS
// signature check and accepts an arbitrary signal from the caller.
//
// Authorization model: either the vault.admin OR the vault.agent may sign.
// In the mock-mpc demo flow the agent computes the MA crossover signal
// off-chain in TypeScript and stamps it into vault state directly — the
// agent already controls execute_trade / settle_pnl, so giving it the
// signal-write capability under the same feature flag does not widen the
// trust surface.
//
// Compiled out of the binary unless the `mock-mpc` feature is enabled, so
// production builds physically cannot expose this instruction.

#![cfg(feature = "mock-mpc")]

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::SignalReceived;
use crate::state::{SignalState, VaultState};

#[derive(Accounts)]
pub struct MockCallbackSignal<'info> {
    /// Either vault.admin or vault.agent. Validated in the handler so the
    /// constraint on the account struct stays tight (one signer).
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.admin.as_ref()],
        bump = vault_state.bump,
    )]
    pub vault_state: Box<Account<'info, VaultState>>,
}

pub fn mock_callback_signal_handler(
    ctx: Context<MockCallbackSignal>,
    signal: i8,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault_state;
    let signer_key = ctx.accounts.authority.key();
    require!(
        signer_key == vault.admin || signer_key == vault.agent,
        VaultError::Unauthorized
    );

    require!(
        signal == -1 || signal == 0 || signal == 1,
        VaultError::InvalidSignalState
    );

    // Synthesize a deterministic computation_id from the slot. Mock callbacks
    // do not have a real Arcium computation_id, but the vault schema keeps
    // [u8;32] for forward compat with the real path.
    let slot = Clock::get()?.slot;
    let mut computation_id = [0u8; 32];
    computation_id[..8].copy_from_slice(&slot.to_le_bytes());

    vault.last_signal = signal;
    vault.last_signal_slot = slot;
    vault.signal_state = SignalState::Ready;
    vault.pending_computation = None;

    emit!(SignalReceived {
        vault: vault.key(),
        computation_id,
        signal,
        slot,
    });
    Ok(())
}

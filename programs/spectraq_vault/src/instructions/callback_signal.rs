// Accounts struct for the Arcium callback. The actual callback function lives
// in lib.rs inside `mod spectraq_vault` because the `#[arcium_callback]` macro
// expansion references `validate_callback_ixs`, which is generated as a
// non-pub helper by `#[arcium_program]` and is therefore only in scope inside
// that module.
//
// `#[callback_accounts]` auto-generates `ComputeMaSignalV3Output` from the
// circuit's ABI in `build/compute_ma_signal_v3.arcis` — pascal-case of the
// circuit name plus `Output`. The generated struct is `{ field_0: bool }`.
// We map `true` → `1` and `false` → `0` for vault.last_signal.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::constants::*;
use crate::errors::{ErrorCode, VaultError};
use crate::events::SignalReceived;
use crate::state::{SignalState, VaultState};
use crate::{ID, ID_CONST};

#[callback_accounts("compute_ma_signal_v3")]
#[derive(Accounts)]
pub struct ComputeMaSignalV3Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        address = derive_comp_def_pda!(crate::COMP_DEF_OFFSET_COMPUTE_MA_SIGNAL)
    )]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, address constraints applied by the Arcium
    /// program at callback dispatch time.
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    /// CHECK: instructions_sysvar, address-checked here.
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,

    /// Vault PDA — passed in via `extra_accs` from `request_signal_computation`.
    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.admin.as_ref()],
        bump = vault_state.bump,
    )]
    pub vault_state: Box<Account<'info, VaultState>>,
}

/// Body of the Arcium callback. Verifies the cluster's BLS signature on the
/// output, then commits the plaintext signal to vault state.
pub fn apply_signal(
    ctx: Context<ComputeMaSignalV3Callback>,
    output: SignedComputationOutputs<ComputeMaSignalV3Output>,
) -> Result<()> {
    let signal_bool = match output
        .verify_output(&ctx.accounts.cluster_account, &ctx.accounts.computation_account)
    {
        Ok(ComputeMaSignalV3Output { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // Map the cluster's revealed bool → i8 for the existing vault schema.
    // v1 is long-only: true = trade (1), false = no trade (0). -1 is reserved.
    let signal_i8: i8 = if signal_bool { 1 } else { 0 };

    let vault = &mut ctx.accounts.vault_state;
    require!(
        vault.signal_state == SignalState::Pending,
        VaultError::InvalidSignalState
    );

    let computation_id = vault
        .pending_computation
        .ok_or(VaultError::InvalidSignalState)?;
    let slot = Clock::get()?.slot;

    vault.last_signal = signal_i8;
    vault.last_signal_slot = slot;
    vault.signal_state = SignalState::Ready;
    vault.pending_computation = None;

    emit!(SignalReceived {
        vault: vault.key(),
        computation_id,
        signal: signal_i8,
        slot,
    });
    Ok(())
}

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::PnlSettled;
use crate::state::VaultState;

#[derive(Accounts)]
pub struct SettlePnl<'info> {
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.admin.as_ref()],
        bump = vault_state.bump,
        constraint = vault_state.agent == agent.key() @ VaultError::Unauthorized,
        has_one = usdc_mint @ VaultError::MintMismatch,
        has_one = sol_mint @ VaultError::MintMismatch,
        has_one = usdc_vault @ VaultError::VaultAccountMismatch,
        has_one = sol_vault @ VaultError::VaultAccountMismatch,
    )]
    pub vault_state: Account<'info, VaultState>,

    pub usdc_mint: Account<'info, Mint>,
    pub sol_mint: Account<'info, Mint>,

    pub usdc_vault: Account<'info, TokenAccount>,
    pub sol_vault: Account<'info, TokenAccount>,
}

/// Reconciles cached `usdc_balance` / `sol_balance` against the actual
/// vault ATAs and emits a PnlSettled event with both before/after values.
pub fn settle_pnl_handler(ctx: Context<SettlePnl>) -> Result<()> {
    let actual_usdc = ctx.accounts.usdc_vault.amount;
    let actual_sol = ctx.accounts.sol_vault.amount;

    let vault = &mut ctx.accounts.vault_state;
    let before_usdc = vault.usdc_balance;
    let before_sol = vault.sol_balance;

    vault.usdc_balance = actual_usdc;
    vault.sol_balance = actual_sol;

    emit!(PnlSettled {
        vault: vault.key(),
        usdc_balance_before: before_usdc,
        sol_balance_before: before_sol,
        usdc_balance_after: actual_usdc,
        sol_balance_after: actual_sol,
        slot: Clock::get()?.slot,
    });
    Ok(())
}

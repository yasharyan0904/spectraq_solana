use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::VaultInitialized;
use crate::state::{SignalState, VaultState};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Stored verbatim into VaultState; agent need not sign init.
    pub agent: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,
    pub sol_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [VAULT_SEED, admin.key().as_ref()],
        bump,
        space = 8 + VaultState::INIT_SPACE,
    )]
    pub vault_state: Account<'info, VaultState>,

    #[account(
        init,
        payer = admin,
        seeds = [SHARE_MINT_SEED, vault_state.key().as_ref()],
        bump,
        mint::decimals = 6,
        mint::authority = vault_state,
    )]
    pub share_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_state,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = sol_mint,
        associated_token::authority = vault_state,
    )]
    pub sol_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_vault_handler(
    ctx: Context<InitializeVault>,
    sol_usd_feed_id: [u8; 32],
) -> Result<()> {
    require_keys_neq!(
        ctx.accounts.admin.key(),
        ctx.accounts.agent.key(),
        VaultError::AgentEqualsAdmin
    );

    let vault = &mut ctx.accounts.vault_state;
    vault.admin = ctx.accounts.admin.key();
    vault.agent = ctx.accounts.agent.key();
    vault.usdc_mint = ctx.accounts.usdc_mint.key();
    vault.sol_mint = ctx.accounts.sol_mint.key();
    vault.share_mint = ctx.accounts.share_mint.key();
    vault.usdc_vault = ctx.accounts.usdc_vault.key();
    vault.sol_vault = ctx.accounts.sol_vault.key();
    vault.sol_usd_feed_id = sol_usd_feed_id;
    vault.total_shares = 0;
    vault.usdc_balance = 0;
    vault.sol_balance = 0;
    vault.last_signal = 0;
    vault.last_signal_slot = 0;
    vault.signal_state = SignalState::Idle;
    vault.pending_computation = None;
    vault.bump = ctx.bumps.vault_state;
    vault.reserved = [0u8; 32];

    emit!(VaultInitialized {
        vault: vault.key(),
        admin: vault.admin,
        agent: vault.agent,
        share_mint: vault.share_mint,
    });
    Ok(())
}

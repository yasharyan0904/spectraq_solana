use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::WithdrawEvent;
use crate::state::{UserPosition, VaultState};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.admin.as_ref()],
        bump = vault_state.bump,
        has_one = usdc_mint @ VaultError::MintMismatch,
        has_one = sol_mint @ VaultError::MintMismatch,
        has_one = share_mint @ VaultError::MintMismatch,
        has_one = usdc_vault @ VaultError::VaultAccountMismatch,
        has_one = sol_vault @ VaultError::VaultAccountMismatch,
    )]
    pub vault_state: Box<Account<'info, VaultState>>,

    pub usdc_mint: Box<Account<'info, Mint>>,
    pub sol_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub share_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub sol_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_usdc_account.mint == usdc_mint.key() @ VaultError::MintMismatch,
        constraint = user_usdc_account.owner == user.key() @ VaultError::Unauthorized,
    )]
    pub user_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_sol_account.mint == sol_mint.key() @ VaultError::MintMismatch,
        constraint = user_sol_account.owner == user.key() @ VaultError::Unauthorized,
    )]
    pub user_sol_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_share_account.mint == share_mint.key() @ VaultError::MintMismatch,
        constraint = user_share_account.owner == user.key() @ VaultError::Unauthorized,
    )]
    pub user_share_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [POSITION_SEED, vault_state.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == user.key() @ VaultError::Unauthorized,
    )]
    pub user_position: Box<Account<'info, UserPosition>>,

    pub token_program: Program<'info, Token>,
}

/// Withdrawal is unconditionally permitted regardless of `signal_state`,
/// `pending_computation`, or any agent activity. This is the non-custodial
/// guarantee.
pub fn withdraw_handler(ctx: Context<Withdraw>, shares_to_burn: u64) -> Result<()> {
    require!(shares_to_burn > 0, VaultError::ZeroShares);

    let vault_key = ctx.accounts.vault_state.key();
    let vault_total_shares = ctx.accounts.vault_state.total_shares;
    let vault_usdc_balance = ctx.accounts.vault_state.usdc_balance;
    let vault_sol_balance = ctx.accounts.vault_state.sol_balance;
    require!(vault_total_shares > 0, VaultError::ZeroShares);

    let pos_shares = ctx.accounts.user_position.shares;
    require!(pos_shares >= shares_to_burn, VaultError::InsufficientShares);

    // proportional shares of each underlying.
    let usdc_to_send: u64 = (shares_to_burn as u128)
        .checked_mul(vault_usdc_balance as u128)
        .and_then(|p| p.checked_div(vault_total_shares as u128))
        .and_then(|x| u64::try_from(x).ok())
        .ok_or(VaultError::MathOverflow)?;

    let sol_to_send: u64 = (shares_to_burn as u128)
        .checked_mul(vault_sol_balance as u128)
        .and_then(|p| p.checked_div(vault_total_shares as u128))
        .and_then(|x| u64::try_from(x).ok())
        .ok_or(VaultError::MathOverflow)?;

    // Burn user's share tokens (not authority-signed; user is the authority
    // on their own share ATA).
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.share_mint.to_account_info(),
                from: ctx.accounts.user_share_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        shares_to_burn,
    )?;

    // Transfer USDC and SOL out, signed by the vault PDA.
    let admin_key = ctx.accounts.vault_state.admin;
    let bump = ctx.accounts.vault_state.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, admin_key.as_ref(), &[bump]]];

    if usdc_to_send > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.usdc_vault.to_account_info(),
                    to: ctx.accounts.user_usdc_account.to_account_info(),
                    authority: ctx.accounts.vault_state.to_account_info(),
                },
                signer_seeds,
            ),
            usdc_to_send,
        )?;
    }

    if sol_to_send > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.sol_vault.to_account_info(),
                    to: ctx.accounts.user_sol_account.to_account_info(),
                    authority: ctx.accounts.vault_state.to_account_info(),
                },
                signer_seeds,
            ),
            sol_to_send,
        )?;
    }

    let vault = &mut ctx.accounts.vault_state;
    vault.usdc_balance = vault
        .usdc_balance
        .checked_sub(usdc_to_send)
        .ok_or(VaultError::MathOverflow)?;
    vault.sol_balance = vault
        .sol_balance
        .checked_sub(sol_to_send)
        .ok_or(VaultError::MathOverflow)?;
    vault.total_shares = vault
        .total_shares
        .checked_sub(shares_to_burn)
        .ok_or(VaultError::MathOverflow)?;

    let pos = &mut ctx.accounts.user_position;
    pos.shares = pos
        .shares
        .checked_sub(shares_to_burn)
        .ok_or(VaultError::MathOverflow)?;

    emit!(WithdrawEvent {
        vault: vault_key,
        user: ctx.accounts.user.key(),
        shares_burned: shares_to_burn,
        usdc_returned: usdc_to_send,
        sol_returned: sol_to_send,
        total_shares_after: vault.total_shares,
    });
    Ok(())
}

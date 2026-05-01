use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::{AssetKind, Deposit};
use crate::oracle::compute_nav_e6;
use crate::state::{UserPosition, VaultState};

#[derive(Accounts)]
pub struct DepositUsdc<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.admin.as_ref()],
        bump = vault_state.bump,
        has_one = usdc_mint @ VaultError::MintMismatch,
        has_one = share_mint @ VaultError::MintMismatch,
        has_one = usdc_vault @ VaultError::VaultAccountMismatch,
    )]
    pub vault_state: Box<Account<'info, VaultState>>,

    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub share_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_state,
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_usdc_account.mint == usdc_mint.key() @ VaultError::MintMismatch,
        constraint = user_usdc_account.owner == user.key() @ VaultError::Unauthorized,
    )]
    pub user_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = share_mint,
        associated_token::authority = user,
    )]
    pub user_share_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [POSITION_SEED, vault_state.key().as_ref(), user.key().as_ref()],
        bump,
        space = 8 + UserPosition::INIT_SPACE,
    )]
    pub user_position: Box<Account<'info, UserPosition>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// `sol_usdc_price_e6` is unused when `sol_balance == 0` (first/USDC-only
/// state) but must always pass the sanity bounds. Pyth replaces this in
/// prompt 4.
pub fn deposit_usdc_handler(
    ctx: Context<DepositUsdc>,
    amount: u64,
    sol_usdc_price_e6: u64,
) -> Result<()> {
    require!(amount > 0, VaultError::ZeroAmount);
    require!(
        sol_usdc_price_e6 > MIN_SOL_USDC_PRICE_E6
            && sol_usdc_price_e6 < MAX_SOL_USDC_PRICE_E6,
        VaultError::PriceOutOfBounds
    );

    let vault_key = ctx.accounts.vault_state.key();

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_usdc_account.to_account_info(),
                to: ctx.accounts.usdc_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault_state;

    let shares_to_mint: u64 = if vault.total_shares == 0 {
        // First deposit: 1 USDC = 1 share at the same 1e6 fixed-point scale.
        amount
    } else {
        let nav_e6: u128 = compute_nav_e6(
            vault.usdc_balance,
            vault.sol_balance,
            sol_usdc_price_e6,
        )?;
        require!(nav_e6 > 0, VaultError::MathOverflow);

        (amount as u128)
            .checked_mul(vault.total_shares as u128)
            .and_then(|p| p.checked_div(nav_e6))
            .and_then(|s| u64::try_from(s).ok())
            .ok_or(VaultError::MathOverflow)?
    };
    require!(shares_to_mint > 0, VaultError::ZeroShares);

    let admin_key = vault.admin;
    let bump = vault.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, admin_key.as_ref(), &[bump]]];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.user_share_account.to_account_info(),
                authority: vault.to_account_info(),
            },
            signer_seeds,
        ),
        shares_to_mint,
    )?;

    vault.usdc_balance = vault
        .usdc_balance
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;
    vault.total_shares = vault
        .total_shares
        .checked_add(shares_to_mint)
        .ok_or(VaultError::MathOverflow)?;

    let pos = &mut ctx.accounts.user_position;
    if pos.owner == Pubkey::default() {
        pos.owner = ctx.accounts.user.key();
        pos.bump = ctx.bumps.user_position;
    }
    pos.shares = pos
        .shares
        .checked_add(shares_to_mint)
        .ok_or(VaultError::MathOverflow)?;
    pos.cumulative_deposits_usdc = pos
        .cumulative_deposits_usdc
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;
    pos.last_deposit_slot = Clock::get()?.slot;

    emit!(Deposit {
        vault: vault_key,
        user: ctx.accounts.user.key(),
        asset: AssetKind::Usdc,
        amount,
        usdc_value_e6: amount,
        shares_minted: shares_to_mint,
        total_shares_after: vault.total_shares,
    });
    Ok(())
}


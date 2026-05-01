use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::{AssetKind, Deposit};
use crate::oracle::{compute_nav_e6, get_price_e6, DEFAULT_MAX_AGE_SECONDS};
use crate::state::{UserPosition, VaultState};

#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.admin.as_ref()],
        bump = vault_state.bump,
        has_one = sol_mint @ VaultError::MintMismatch,
        has_one = share_mint @ VaultError::MintMismatch,
        has_one = sol_vault @ VaultError::VaultAccountMismatch,
    )]
    pub vault_state: Box<Account<'info, VaultState>>,

    pub sol_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub share_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = sol_mint,
        associated_token::authority = vault_state,
    )]
    pub sol_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_sol_account.mint == sol_mint.key() @ VaultError::MintMismatch,
        constraint = user_sol_account.owner == user.key() @ VaultError::Unauthorized,
    )]
    pub user_sol_account: Box<Account<'info, TokenAccount>>,

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

    /// Verified Pyth `PriceUpdateV2` for the SOL/USD feed. Caller is
    /// responsible for posting a fresh update via `@pythnetwork/pyth-solana-receiver`
    /// (or any compatible client) before calling this instruction. The
    /// handler validates the feed id against `vault.sol_usd_feed_id` and
    /// rejects updates older than `DEFAULT_MAX_AGE_SECONDS`.
    pub price_update: Box<Account<'info, PriceUpdateV2>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn deposit_sol_handler(
    ctx: Context<DepositSol>,
    amount_lamports: u64,
) -> Result<()> {
    require!(amount_lamports > 0, VaultError::ZeroAmount);

    // Read SOL/USD from Pyth — validates feed id, age (≤60s), confidence
    // (<1%), and bounds (10–1000 USDC/SOL). Errors are typed (PriceStale /
    // InvalidPythFeed / PriceConfidenceTooWide / PriceOutOfBounds).
    let sol_usd_feed_id = ctx.accounts.vault_state.sol_usd_feed_id;
    let sol_usdc_price_e6 = get_price_e6(
        &ctx.accounts.price_update,
        DEFAULT_MAX_AGE_SECONDS,
        &sol_usd_feed_id,
    )?;

    let vault_key = ctx.accounts.vault_state.key();

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_sol_account.to_account_info(),
                to: ctx.accounts.sol_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount_lamports,
    )?;

    // USDC value of this deposit, in e6 units.
    let usdc_value_e6_u128: u128 = (amount_lamports as u128)
        .checked_mul(sol_usdc_price_e6 as u128)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(LAMPORTS_PER_SOL_U128)
        .ok_or(VaultError::MathOverflow)?;
    let usdc_value_e6: u64 =
        u64::try_from(usdc_value_e6_u128).map_err(|_| VaultError::MathOverflow)?;

    let vault = &mut ctx.accounts.vault_state;

    let shares_to_mint: u64 = if vault.total_shares == 0 {
        // First deposit but it's SOL: initialize the share supply at the
        // USDC-equivalent value of the deposit (1 USDC = 1 share, e6 scale).
        usdc_value_e6
    } else {
        // NAV is taken at the *pre-deposit* state (vault.usdc_balance and
        // vault.sol_balance still reflect the pre-transfer cache).
        let nav_e6_pre = compute_nav_e6(
            vault.usdc_balance,
            vault.sol_balance,
            sol_usdc_price_e6,
        )?;
        require!(nav_e6_pre > 0, VaultError::MathOverflow);

        usdc_value_e6_u128
            .checked_mul(vault.total_shares as u128)
            .and_then(|p| p.checked_div(nav_e6_pre))
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

    vault.sol_balance = vault
        .sol_balance
        .checked_add(amount_lamports)
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
        .checked_add(usdc_value_e6)
        .ok_or(VaultError::MathOverflow)?;
    pos.last_deposit_slot = Clock::get()?.slot;

    emit!(Deposit {
        vault: vault_key,
        user: ctx.accounts.user.key(),
        asset: AssetKind::Sol,
        amount: amount_lamports,
        usdc_value_e6,
        shares_minted: shares_to_mint,
        total_shares_after: vault.total_shares,
    });
    Ok(())
}

// `execute_trade` — agent submits a Raydium CPMM swap route to rotate the
// vault between USDC and wSOL after the MA crossover signal turns Ready.
//
// We previously routed through Jupiter v6, but Jupiter's aggregator does
// not index liquidity for the devnet USDC mint, so the live demo never
// landed a real swap. Raydium CPMM lets us point at a specific pool we
// register at boot (RAYDIUM_USDC_SOL_POOL) which has real on-chain depth.
// The vault stays DEX-agnostic — invariants below are checked irrespective
// of which DEX program the route bytes target.
//
// Trust model:
//   1. Agent authorizes the call (signer == vault.agent).
//   2. Direction must match `vault.last_signal` (no opportunistic trades).
//   3. Trade size cap: amount_in ≤ 30 % of the *live* source-ATA balance
//      (read on-chain, not from the cached `vault.usdc_balance` —
//      cached state could lag a previous failed settle).
//   4. Slippage cap: `min_amount_out ≥ pyth_expected_out × 95 %`. The agent
//      cannot set a min_amount_out far below the oracle (sandwich defense).
//   5. **Destination check**: walks `remaining_accounts[destination_ata_index]`
//      and requires it equal the vault's own ATA for the OUTPUT mint.
//      Without this, a malicious agent could route the swap to its own ATA.
//   6. Realized check: vault output-ATA balance must increase by ≥
//      min_amount_out post-CPI. If the DEX "succeeds" but routes the funds
//      elsewhere (it shouldn't, given check #5, but belt + braces) we fail.
//   7. Each trade consumes the signal — `signal_state` flips back to Idle.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::associated_token::{get_associated_token_address, AssociatedToken};
use anchor_spl::token::{Mint, Token, TokenAccount};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::TradeExecuted;
use crate::oracle::{get_price_e6, DEFAULT_MAX_AGE_SECONDS};
use crate::state::{SignalState, TradeDirection, VaultState};

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    pub agent: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.admin.as_ref()],
        bump = vault_state.bump,
        has_one = usdc_mint @ VaultError::MintMismatch,
        has_one = sol_mint @ VaultError::MintMismatch,
        has_one = usdc_vault @ VaultError::VaultAccountMismatch,
        has_one = sol_vault @ VaultError::VaultAccountMismatch,
        constraint = vault_state.agent == agent.key() @ VaultError::Unauthorized,
    )]
    pub vault_state: Box<Account<'info, VaultState>>,

    pub usdc_mint: Box<Account<'info, Mint>>,
    pub sol_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub sol_vault: Box<Account<'info, TokenAccount>>,

    /// Pyth SOL/USD push account. Used to derive the slippage floor —
    /// `min_amount_out` must be ≥ 95 % of the oracle-derived expected output.
    pub price_update: Box<Account<'info, PriceUpdateV2>>,

    /// Raydium CPMM program (devnet). Address-pinned to
    /// `RAYDIUM_CPMM_PROGRAM_ID`.
    /// CHECK: program id is the validation; no Anchor type for it.
    #[account(address = RAYDIUM_CPMM_PROGRAM_ID @ VaultError::InvalidDexProgram)]
    pub dex_program: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn execute_trade_handler(
    ctx: Context<ExecuteTrade>,
    direction: TradeDirection,
    amount: u64,
    min_amount_out: u64,
    dex_route_data: Vec<u8>,
    destination_ata_index: u8,
) -> Result<()> {
    require!(amount > 0, VaultError::ZeroAmount);
    require!(min_amount_out > 0, VaultError::ZeroAmount);

    let vault = &ctx.accounts.vault_state;
    require!(
        vault.signal_state == SignalState::Ready,
        VaultError::InvalidSignalState
    );

    // Direction ↔ signal match.
    match direction {
        TradeDirection::UsdcToSol => {
            require!(vault.last_signal == 1, VaultError::SignalDirectionMismatch);
        }
        TradeDirection::SolToUsdc => {
            require!(vault.last_signal == -1, VaultError::SignalDirectionMismatch);
        }
    }

    // ----- 1. Trade-size cap (use *live* ATA balance, not cached) ---------
    let (live_source_balance, source_ata_key, dest_ata_key, dest_mint_key) = match direction {
        TradeDirection::UsdcToSol => (
            ctx.accounts.usdc_vault.amount,
            ctx.accounts.usdc_vault.key(),
            ctx.accounts.sol_vault.key(),
            ctx.accounts.sol_mint.key(),
        ),
        TradeDirection::SolToUsdc => (
            ctx.accounts.sol_vault.amount,
            ctx.accounts.sol_vault.key(),
            ctx.accounts.usdc_vault.key(),
            ctx.accounts.usdc_mint.key(),
        ),
    };
    let amount_scaled = (amount as u128)
        .checked_mul(BPS_DENOM as u128)
        .ok_or(VaultError::MathOverflow)?;
    let cap_scaled = (live_source_balance as u128)
        .checked_mul(MAX_TRADE_SIZE_BPS as u128)
        .ok_or(VaultError::MathOverflow)?;
    require!(amount_scaled <= cap_scaled, VaultError::TradeSizeExceeded);

    // ----- 2. Pyth-derived slippage floor ---------------------------------
    let sol_usd_e6 = get_price_e6(
        &ctx.accounts.price_update,
        DEFAULT_MAX_AGE_SECONDS,
        &ctx.accounts.vault_state.sol_usd_feed_id,
    )?;
    // expected_out:
    //   UsdcToSol: amount (e6 USDC) → lamports.   exp = amount × 1e9 / price_e6
    //   SolToUsdc: amount (lamports) → e6 USDC.   exp = amount × price_e6 / 1e9
    let expected_out_u128: u128 = match direction {
        TradeDirection::UsdcToSol => (amount as u128)
            .checked_mul(LAMPORTS_PER_SOL_U128)
            .ok_or(VaultError::MathOverflow)?
            / (sol_usd_e6 as u128),
        TradeDirection::SolToUsdc => (amount as u128)
            .checked_mul(sol_usd_e6 as u128)
            .ok_or(VaultError::MathOverflow)?
            / LAMPORTS_PER_SOL_U128,
    };
    // floor = expected × (10000 - MAX_SLIPPAGE_BPS) / 10000
    let floor_u128 = expected_out_u128
        .checked_mul((BPS_DENOM - MAX_SLIPPAGE_BPS) as u128)
        .ok_or(VaultError::MathOverflow)?
        / (BPS_DENOM as u128);
    require!(
        (min_amount_out as u128) >= floor_u128,
        VaultError::SlippageExceeded
    );

    // ----- 3. Destination ATA check ---------------------------------------
    let idx = destination_ata_index as usize;
    require!(
        idx < ctx.remaining_accounts.len(),
        VaultError::InvalidDestinationIndex
    );
    // Compute the ATA the vault PDA *should* own for the output mint.
    let expected_dest =
        get_associated_token_address(&ctx.accounts.vault_state.key(), &dest_mint_key);
    require!(
        expected_dest == dest_ata_key,
        VaultError::VaultAccountMismatch
    );
    let claimed_dest = ctx.remaining_accounts[idx].key();
    require!(
        claimed_dest == expected_dest,
        VaultError::InvalidSwapDestination
    );

    // Capture pre-swap balances on the OUTPUT side so we can verify the
    // vault really did receive ≥ min_amount_out.
    let (pre_dest_balance, _pre_source_balance) = match direction {
        TradeDirection::UsdcToSol => (ctx.accounts.sol_vault.amount, ctx.accounts.usdc_vault.amount),
        TradeDirection::SolToUsdc => (ctx.accounts.usdc_vault.amount, ctx.accounts.sol_vault.amount),
    };
    let _ = source_ata_key; // referenced only for documentation symmetry

    // ----- 4. Build & invoke the DEX CPI ----------------------------------
    // Reconstruct AccountMeta from each AccountInfo's flags. The agent
    // pre-builds the swap ix off-chain via Raydium SDK V2 and passes the
    // raw bytes + accounts through. We sign as the vault PDA via
    // invoke_signed, since the swap targets the vault's own ATAs.
    // The agent passes the vault PDA in remaining_accounts with
    // is_signer=false (so the outer tx doesn't require its signature —
    // PDAs cannot sign at the tx level). Inside the inner CPI we flip the
    // signer flag back on for the vault PDA only, so invoke_signed can
    // satisfy it via the vault seeds. Every other account passes through
    // unchanged.
    let vault_key = ctx.accounts.vault_state.key();
    let ix_accounts: Vec<AccountMeta> = ctx
        .remaining_accounts
        .iter()
        .map(|a| AccountMeta {
            pubkey: *a.key,
            is_signer: a.is_signer || *a.key == vault_key,
            is_writable: a.is_writable,
        })
        .collect();
    let ix = Instruction {
        program_id: ctx.accounts.dex_program.key(),
        accounts: ix_accounts,
        data: dex_route_data,
    };
    let admin_key = ctx.accounts.vault_state.admin;
    let bump = ctx.accounts.vault_state.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, admin_key.as_ref(), &[bump]]];
    invoke_signed(&ix, ctx.remaining_accounts, signer_seeds)
        .map_err(|_| VaultError::DexCpiFailed)?;

    // ----- 5. Verify realized output --------------------------------------
    // Reload the destination token account to read post-swap balance.
    let post_dest_balance = match direction {
        TradeDirection::UsdcToSol => {
            ctx.accounts.sol_vault.reload()?;
            ctx.accounts.sol_vault.amount
        }
        TradeDirection::SolToUsdc => {
            ctx.accounts.usdc_vault.reload()?;
            ctx.accounts.usdc_vault.amount
        }
    };
    let realized_out = post_dest_balance
        .checked_sub(pre_dest_balance)
        .ok_or(VaultError::MathOverflow)?;
    require!(
        realized_out >= min_amount_out,
        VaultError::SwapOutputBelowMinimum
    );

    // Reload the source side too so cached balances are honest.
    match direction {
        TradeDirection::UsdcToSol => {
            ctx.accounts.usdc_vault.reload()?;
        }
        TradeDirection::SolToUsdc => {
            ctx.accounts.sol_vault.reload()?;
        }
    }

    // ----- 6. Commit cached balances + clear signal -----------------------
    let usdc_after = ctx.accounts.usdc_vault.amount;
    let sol_after = ctx.accounts.sol_vault.amount;
    let vault = &mut ctx.accounts.vault_state;
    vault.usdc_balance = usdc_after;
    vault.sol_balance = sol_after;
    vault.signal_state = SignalState::Idle;

    emit!(TradeExecuted {
        vault: vault.key(),
        agent: ctx.accounts.agent.key(),
        direction_is_usdc_to_sol: matches!(direction, TradeDirection::UsdcToSol),
        amount_in: amount,
        amount_out: realized_out,
        usdc_balance_after: usdc_after,
        sol_balance_after: sol_after,
    });
    Ok(())
}

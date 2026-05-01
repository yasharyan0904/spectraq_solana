use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub admin: Pubkey,
    pub agent: Pubkey,
    pub usdc_mint: Pubkey,
    pub sol_mint: Pubkey,
    pub share_mint: Pubkey,
    pub usdc_vault: Pubkey,
    pub sol_vault: Pubkey,
    /// Pyth feed id for SOL/USD (32 bytes, e.g.
    /// `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`).
    /// Stored once at init; deposit_sol enforces the price account matches it.
    pub sol_usd_feed_id: [u8; 32],
    pub total_shares: u64,
    pub usdc_balance: u64,
    pub sol_balance: u64,
    pub last_signal: i8,
    pub last_signal_slot: u64,
    pub signal_state: SignalState,
    pub pending_computation: Option<[u8; 32]>,
    pub bump: u8,
    /// 32 bytes were consumed by `sol_usd_feed_id`. Remaining 32 bytes
    /// preserved for forward-compat (e.g. fee config in v2).
    pub reserved: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    pub owner: Pubkey,
    pub shares: u64,
    pub cumulative_deposits_usdc: u64,
    pub last_deposit_slot: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SignalState {
    Idle,
    Pending,
    Ready,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum TradeDirection {
    UsdcToSol,
    SolToUsdc,
}

// ---------------------------------------------------------------------------
// Mode 2 scaffold — basket vault (SOL + JUP + PYTH + JTO).
// Tracked in ROADMAP.md (item: "Mode 2 — basket vault"). Layout sketched
// here so we can migrate without a state-account rewrite later.
// ---------------------------------------------------------------------------

#[cfg(feature = "mode-2")]
#[account]
#[derive(InitSpace)]
pub struct BasketState {
    /// Parent vault that owns this basket account.
    pub vault: Pubkey,
    /// Pyth feed ids for the four basket assets, in canonical order:
    /// 0=SOL, 1=JUP, 2=PYTH, 3=JTO.
    pub feed_ids: [[u8; 32]; 4],
    /// Lamport / token balances per asset (indexes match feed_ids).
    pub balances: [u64; 4],
    /// Last NAV snapshot in USDC e6.
    pub last_nav_e6: u64,
    /// Slot of last NAV refresh.
    pub last_nav_slot: u64,
    pub bump: u8,
    pub reserved: [u8; 64],
}

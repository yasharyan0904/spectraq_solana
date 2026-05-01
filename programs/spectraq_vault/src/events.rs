use anchor_lang::prelude::*;

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub agent: Pubkey,
    pub share_mint: Pubkey,
}

#[event]
pub struct Deposit {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub asset: AssetKind,
    pub amount: u64,
    pub usdc_value_e6: u64,
    pub shares_minted: u64,
    pub total_shares_after: u64,
}

#[event]
pub struct WithdrawEvent {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub shares_burned: u64,
    pub usdc_returned: u64,
    pub sol_returned: u64,
    pub total_shares_after: u64,
}

#[event]
pub struct SignalRequested {
    pub vault: Pubkey,
    pub agent: Pubkey,
    pub computation_id: [u8; 32],
    pub slot: u64,
}

#[event]
pub struct SignalReceived {
    pub vault: Pubkey,
    pub computation_id: [u8; 32],
    pub signal: i8,
    pub slot: u64,
}

#[event]
pub struct TradeExecuted {
    pub vault: Pubkey,
    pub agent: Pubkey,
    pub direction_is_usdc_to_sol: bool,
    pub amount_in: u64,
    pub amount_out: u64,
    pub usdc_balance_after: u64,
    pub sol_balance_after: u64,
}

#[event]
pub struct PnlSettled {
    pub vault: Pubkey,
    pub usdc_balance_before: u64,
    pub sol_balance_before: u64,
    pub usdc_balance_after: u64,
    pub sol_balance_after: u64,
    pub slot: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum AssetKind {
    Usdc,
    Sol,
}

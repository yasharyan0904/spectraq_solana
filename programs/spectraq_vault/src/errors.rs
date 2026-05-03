use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Caller not authorized for this instruction")]
    Unauthorized,
    #[msg("Amount must be non-zero")]
    ZeroAmount,
    #[msg("Share amount must be non-zero")]
    ZeroShares,
    #[msg("User has fewer shares than requested")]
    InsufficientShares,
    #[msg("Signal state does not permit this action")]
    InvalidSignalState,
    #[msg("Trade size exceeds MAX_TRADE_SIZE_BPS of source balance")]
    TradeSizeExceeded,
    #[msg("Provided SOL/USDC price is outside the sanity bounds")]
    PriceOutOfBounds,
    #[msg("Trade direction does not match the latest signal")]
    SignalDirectionMismatch,
    #[msg("agent and admin must be different keys at vault initialization")]
    AgentEqualsAdmin,
    #[msg("Token mint passed does not match the one stored in VaultState")]
    MintMismatch,
    #[msg("Token vault passed does not match the ATA stored in VaultState")]
    VaultAccountMismatch,
    #[msg("Vault state cache is out of sync with the on-chain ATA balance")]
    BalanceDesync,
    #[msg("Provided computation_id does not match pending_computation")]
    ComputationIdMismatch,
    #[msg("This instruction is not implemented yet")]
    Unimplemented,
    #[msg("Pyth price update is older than max_age_seconds")]
    PriceStale,
    #[msg("Pyth price account does not match the configured SOL/USD feed id")]
    InvalidPythFeed,
    #[msg("Failed to read Pyth price update (deserialize/verify error)")]
    PythReadError,
    #[msg("Pyth price confidence interval exceeds 1% of price")]
    PriceConfidenceTooWide,
    #[msg("DEX swap destination ATA does not equal the vault's own ATA")]
    InvalidSwapDestination,
    #[msg("min_amount_out is below the oracle-derived slippage floor (5%)")]
    SlippageExceeded,
    #[msg("DEX swap CPI failed (pool empty, route invalid, slippage breached, etc.)")]
    DexCpiFailed,
    #[msg("destination_ata_index is out of bounds for remaining_accounts")]
    InvalidDestinationIndex,
    #[msg("DEX program account does not match the configured CPMM program id")]
    InvalidDexProgram,
    #[msg("Vault did not receive the expected output token amount post-swap")]
    SwapOutputBelowMinimum,
}

/// Errors that the Arcium account-context macros (`#[callback_accounts]`,
/// `#[queue_computation_accounts]`) reference by the literal path
/// `ErrorCode::*`. Keep them here so the macros find them.
#[error_code]
pub enum ErrorCode {
    #[msg("Arcium MXE cluster has not been set on this MXE account")]
    ClusterNotSet,
    #[msg("Arcium computation aborted or returned an invalid signature")]
    AbortedComputation,
}

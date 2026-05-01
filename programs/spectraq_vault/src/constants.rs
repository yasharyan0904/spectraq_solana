use anchor_lang::prelude::*;

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const SHARE_MINT_SEED: &[u8] = b"share_mint";

#[constant]
pub const POSITION_SEED: &[u8] = b"position";

/// Structural cap on a single trade: at most 30% of the source ATA balance.
#[constant]
pub const MAX_TRADE_SIZE_BPS: u64 = 3_000;

#[constant]
pub const BPS_DENOM: u64 = 10_000;

/// 1e9 = lamports per SOL. Used to convert SOL → USDC e6 NAV.
pub const LAMPORTS_PER_SOL_U128: u128 = 1_000_000_000;

/// Sanity bounds for the SOL/USDC price (e6 fixed point) passed in by the
/// admin/agent in `deposit_sol`. 10 < price < 1000. Pyth replaces this in
/// prompt 4.
pub const MIN_SOL_USDC_PRICE_E6: u64 = 10_000_000;
pub const MAX_SOL_USDC_PRICE_E6: u64 = 1_000_000_000;

/// Jupiter v6 program id. Vault's `execute_trade` validates the
/// `jupiter_program` account passed in matches this constant before
/// invoke_signed-ing the swap.
#[constant]
pub const JUPITER_V6_PROGRAM_ID: Pubkey =
    anchor_lang::prelude::Pubkey::new_from_array([
        // base58: JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
        0x04, 0x79, 0xd5, 0x5b, 0xf2, 0x31, 0xc0, 0x6e,
        0xee, 0x74, 0xc5, 0x6e, 0xce, 0x68, 0x15, 0x07,
        0xfd, 0xb1, 0xb2, 0xde, 0xa3, 0xf4, 0x8e, 0x51,
        0x02, 0xb1, 0xcd, 0xa2, 0x56, 0xbc, 0x13, 0x8f,
    ]);

/// Maximum allowed slippage versus the Pyth-derived expected output, in bps.
/// Prevents the agent from setting min_amount_out far below the oracle price
/// (sandwich/MEV defense). 500 bps = 5%.
#[constant]
pub const MAX_SLIPPAGE_BPS: u64 = 500;

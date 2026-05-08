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

/// Raydium CPMM (Constant Product MM) program id on Solana devnet. Vault's
/// `execute_trade` validates the `dex_program` account passed in matches
/// this constant before invoke_signed-ing the swap. Switched from Jupiter
/// v6 (devnet has no aggregator liquidity for our USDC mint) to a
/// dedicated Raydium CPMM pool we register at boot.
#[constant]
pub const RAYDIUM_CPMM_PROGRAM_ID: Pubkey =
    anchor_lang::prelude::Pubkey::new_from_array([
        // base58: DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb (devnet)
        0xb8, 0x98, 0x99, 0x79, 0x2d, 0xca, 0x52, 0x34,
        0x79, 0x6f, 0xe7, 0x74, 0x62, 0xb0, 0x31, 0xdf,
        0x46, 0x3f, 0x5f, 0xfe, 0xae, 0x36, 0x7c, 0x5c,
        0x0f, 0xfb, 0x24, 0x6e, 0x1c, 0xb7, 0xce, 0x0c,
    ]);

/// Maximum allowed slippage versus the Pyth-derived expected output, in bps.
/// Prevents the agent from setting min_amount_out far below the oracle price
/// (sandwich/MEV defense).
///
/// 1000 bps = 10% (devnet). The mainnet target is 500 bps (5%) — devnet's
/// Raydium CPMM pools are thin enough that fee config + price impact
/// already eats ~5–7% on every swap, so a tight 5% floor combined with
/// Raydium's own slippage check leaves no value of `min_amount_out` that
/// satisfies both. 10% lets devnet trades land while still providing
/// meaningful sandwich/MEV protection. Tighten back to 500 on mainnet.
#[constant]
pub const MAX_SLIPPAGE_BPS: u64 = 1000;

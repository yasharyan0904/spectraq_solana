// SpectraQ — Pyth Push Oracle integration.
//
// Replaces the placeholder `sol_usdc_price_e6: u64` argument from prompts 0–3
// with a verified Pyth `PriceUpdateV2` account read. Callers post a fresh
// VAA via the Pyth Solana Receiver (off-chain, e.g. `@pythnetwork/pyth-solana-receiver`)
// before invoking `deposit_sol`.
//
// Why a tight wrapper around the SDK rather than calling
// `get_price_no_older_than` directly inside the instruction handler:
//   1. The SDK returns price as `i64` with a separate exponent — we need
//      USDC e6 (positive u64) for the share-minting math. Conversion logic
//      lives here so it's unit-tested independently.
//   2. Confidence-interval validation (`conf / price < 1%`) is project-wide
//      policy. Centralizing it here prevents drift across deposit_sol /
//      withdraw / settle_pnl.
//   3. Bounds check (10–1000 USDC/SOL) prevents catastrophic share-mint bugs
//      if Pyth returns a zero or absurd price during a feed outage.

use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{FeedId, Price, PriceUpdateV2};

use crate::errors::VaultError;

/// Sanity bounds for the SOL/USD price expressed as USDC e6 per SOL.
/// Tightens the error surface against feed glitches; matches the bounds the
/// prompt-1 caller-supplied price was checked against.
pub const PRICE_BOUNDS_SOL_USD: (u64, u64) = (10_000_000, 1_000_000_000);

/// Confidence interval cap: `conf` must be < 1% of `price`. Tracks Pyth's
/// own recommendation — wider intervals usually signal a feed outage or
/// thin liquidity.
const MAX_CONF_BPS: u128 = 100; // 1.00% in basis points
const BPS_DENOM: u128 = 10_000;

/// Default freshness window for the SOL/USD price. Anchor side reads this
/// from `.env` (`PYTH_MAX_AGE_SECONDS`) so it can be tightened post-deploy
/// without a program redeploy. 60 s matches Pyth's published cadence target.
pub const DEFAULT_MAX_AGE_SECONDS: u64 = 60;

/// Read a verified Pyth price update, validate it, and normalize to USDC e6.
///
/// Steps:
///   1. `get_price_no_older_than` — feed id match + age + Full verification.
///   2. Confidence-interval check (`conf / price ≤ 1%`).
///   3. Convert `(price, exponent)` to e6 fixed-point.
///   4. Bounds-check against `PRICE_BOUNDS_SOL_USD`.
///
/// Returns USDC e6 per asset (e.g. 150_000_000 for $150/SOL).
pub fn get_price_e6(
    price_update: &Account<PriceUpdateV2>,
    max_age_seconds: u64,
    feed_id: &FeedId,
) -> Result<u64> {
    let clock = Clock::get()?;
    let price = price_update
        .get_price_no_older_than(&clock, max_age_seconds, feed_id)
        .map_err(|e| match e as u32 {
            // PriceTooOld is the most common transient case — surface a
            // dedicated error code so callers can distinguish staleness
            // from "wrong feed" / "low verification".
            10000 => error!(VaultError::PriceStale),
            10002 => error!(VaultError::InvalidPythFeed), // MismatchedFeedId
            _ => error!(VaultError::PythReadError),
        })?;
    normalize_to_e6(&price)
}

/// Pure normalization + validation. Split out from `get_price_e6` so unit
/// tests can drive the math without a real `Account<PriceUpdateV2>`.
pub fn normalize_to_e6(price: &Price) -> Result<u64> {
    require!(price.price > 0, VaultError::PriceOutOfBounds);
    let price_u128 = price.price as u128;

    // Confidence check: `conf / price <= 1%`  ⇔  `conf * 10000 <= price * 100`.
    let conf = price.conf as u128;
    require!(
        conf
            .checked_mul(BPS_DENOM)
            .ok_or(VaultError::MathOverflow)?
            <= price_u128
                .checked_mul(MAX_CONF_BPS)
                .ok_or(VaultError::MathOverflow)?,
        VaultError::PriceConfidenceTooWide
    );

    // Pyth quotes price as `mantissa * 10^exponent`. SOL/USD typically has
    // `exponent = -8` (e.g. `15_000_000_000 * 10^-8 = 150.0`). We want
    // USDC e6 (`exponent = -6`).
    //   - exponent <= -6: divide by 10^(|exp| - 6).
    //   - exponent  > -6: multiply by 10^(6 + exp). Larger exponents shouldn't
    //     occur for crypto-asset feeds, but we cover the case for safety.
    let e6_value = if price.exponent <= -6 {
        let scale_pow = (-price.exponent - 6) as u32;
        let divisor = 10u128
            .checked_pow(scale_pow)
            .ok_or(VaultError::MathOverflow)?;
        price_u128 / divisor
    } else {
        let scale_pow = (price.exponent + 6) as u32;
        let multiplier = 10u128
            .checked_pow(scale_pow)
            .ok_or(VaultError::MathOverflow)?;
        price_u128
            .checked_mul(multiplier)
            .ok_or(VaultError::MathOverflow)?
    };

    let e6: u64 = e6_value.try_into().map_err(|_| VaultError::MathOverflow)?;
    require!(
        e6 >= PRICE_BOUNDS_SOL_USD.0 && e6 <= PRICE_BOUNDS_SOL_USD.1,
        VaultError::PriceOutOfBounds
    );
    Ok(e6)
}

/// Net asset value in USDC e6.
///   nav = usdc_balance + (sol_balance * sol_usd_price_e6) / 1_000_000_000
///
/// `sol_balance` is lamports (9 decimals); `sol_usd_price_e6` is USDC e6
/// per *whole* SOL. Division by 1e9 brings lamports → SOL, then the
/// product lands in USDC e6.
pub fn compute_nav_e6(
    usdc_balance: u64,
    sol_balance_lamports: u64,
    sol_usd_price_e6: u64,
) -> Result<u128> {
    let sol_value_e6 = (sol_balance_lamports as u128)
        .checked_mul(sol_usd_price_e6 as u128)
        .ok_or(VaultError::MathOverflow)?
        / 1_000_000_000u128;
    Ok((usdc_balance as u128)
        .checked_add(sol_value_e6)
        .ok_or(VaultError::MathOverflow)?)
}

// ---------------------------------------------------------------------------
// Mode 2 scaffold — multi-asset NAV. Kept off the default build path so we
// don't pay for the extra account reads / loop overhead in Mode 1.
// Tracked in ROADMAP.md (item: "Mode 2 — basket vault").
// ---------------------------------------------------------------------------
#[cfg(feature = "mode-2")]
pub fn mode2_compute_nav_e6(
    usdc_balance: u64,
    asset_balances: &[u64; 4],
    asset_prices_e6: &[u64; 4],
    asset_decimals: &[u8; 4],
) -> Result<u128> {
    let mut nav: u128 = usdc_balance as u128;
    for i in 0..4 {
        let denom = 10u128
            .checked_pow(asset_decimals[i] as u32)
            .ok_or(VaultError::MathOverflow)?;
        let value_e6 = (asset_balances[i] as u128)
            .checked_mul(asset_prices_e6[i] as u128)
            .ok_or(VaultError::MathOverflow)?
            / denom;
        nav = nav.checked_add(value_e6).ok_or(VaultError::MathOverflow)?;
    }
    Ok(nav)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pyth_solana_receiver_sdk::price_update::Price;

    /// Sanity-check the hand-encoded `RAYDIUM_CPMM_PROGRAM_ID` byte array
    /// matches the canonical base58 string. If someone re-derives the
    /// constant in the future this test catches a typo immediately.
    #[test]
    fn raydium_cpmm_program_id_decodes_to_canonical_b58() {
        use crate::constants::RAYDIUM_CPMM_PROGRAM_ID;
        assert_eq!(
            RAYDIUM_CPMM_PROGRAM_ID.to_string(),
            "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"
        );
    }

    fn mk_price(price: i64, conf: u64, exponent: i32) -> Price {
        Price {
            price,
            conf,
            exponent,
            publish_time: 0,
        }
    }

    #[test]
    fn normalize_sol_at_150_usdc_returns_150e6() {
        // Pyth typically reports SOL/USD with exponent = -8.
        // 15_000_000_000 * 10^-8 = 150.0 USD → 150_000_000 USDC e6.
        let p = mk_price(15_000_000_000, 1_000_000, -8);
        assert_eq!(normalize_to_e6(&p).unwrap(), 150_000_000);
    }

    #[test]
    fn normalize_exponent_minus6_returns_price_unchanged() {
        let p = mk_price(150_000_000, 100_000, -6);
        assert_eq!(normalize_to_e6(&p).unwrap(), 150_000_000);
    }

    #[test]
    fn out_of_bounds_low_rejects() {
        // $5/SOL — below the 10 USDC floor.
        let p = mk_price(500_000_000, 100, -8);
        let err = normalize_to_e6(&p).unwrap_err();
        assert!(format!("{err:?}").contains("PriceOutOfBounds"));
    }

    #[test]
    fn out_of_bounds_high_rejects() {
        // $5000/SOL — above the 1000 USDC ceiling.
        let p = mk_price(500_000_000_000, 1_000_000, -8);
        let err = normalize_to_e6(&p).unwrap_err();
        assert!(format!("{err:?}").contains("PriceOutOfBounds"));
    }

    #[test]
    fn negative_or_zero_price_rejects() {
        let p = mk_price(0, 0, -8);
        assert!(normalize_to_e6(&p).is_err());
        let p = mk_price(-1, 0, -8);
        assert!(normalize_to_e6(&p).is_err());
    }

    #[test]
    fn confidence_above_one_percent_rejects() {
        // 1.01% confidence — should reject.
        // price = 15_000_000_000 (= $150 at exp=-8)
        // 1.01% of price = 151_500_000
        let p = mk_price(15_000_000_000, 151_500_000, -8);
        let err = normalize_to_e6(&p).unwrap_err();
        assert!(format!("{err:?}").contains("PriceConfidenceTooWide"));
    }

    #[test]
    fn confidence_at_one_percent_passes() {
        // Exactly 1.00% — accepted (boundary inclusive).
        let p = mk_price(15_000_000_000, 150_000_000, -8);
        assert_eq!(normalize_to_e6(&p).unwrap(), 150_000_000);
    }

    #[test]
    fn nav_one_sol_at_150_plus_50_usdc() {
        // 1 SOL = 1_000_000_000 lamports; price 150e6; usdc 50e6.
        let nav = compute_nav_e6(50_000_000, 1_000_000_000, 150_000_000).unwrap();
        assert_eq!(nav, 200_000_000);
    }

    #[test]
    fn nav_zero_sol_returns_usdc() {
        let nav = compute_nav_e6(123_456_789, 0, 150_000_000).unwrap();
        assert_eq!(nav, 123_456_789);
    }

    #[test]
    fn nav_zero_usdc_with_half_sol() {
        // 0.5 SOL at $200 = $100 = 100e6 USDC e6.
        let nav = compute_nav_e6(0, 500_000_000, 200_000_000).unwrap();
        assert_eq!(nav, 100_000_000);
    }
}

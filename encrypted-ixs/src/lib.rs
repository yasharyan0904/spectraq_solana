// SpectraQ — Arcis MPC circuit (compute_ma_signal).
//
// Arcis hard constraints honored here:
//   - Loop bounds are compile-time `const` literals (FAST_N, SLOW_N, WINDOW).
//   - No `Vec` / dynamic arrays; only fixed-size `[u64; 50]`.
//   - Both branches of every `if` execute in MPC; cost both sides.
//   - Division avoided via cross-multiplication: comparing `fast_avg > slow_avg`
//     becomes `fast_sum * SLOW_N > slow_sum * FAST_N`.
//
// Output: a plaintext `i8` (revealed in MPC). v1 is long-only — values
// returned are 0 (no signal) or +1 (cross). -1 is reserved.

use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    // ---- compile-time constants -------------------------------------------------
    // Arcis loop bounds MUST be const, so although `StrategyParams.fast_n` /
    // `slow_n` exist on-wire (forward compat), the circuit honors only these.
    const WINDOW: usize = 50; // length of the encrypted price window
    const FAST_N: usize = 10;
    const SLOW_N: usize = 30;

    /// Encrypted strategy parameters (MXE-owned).
    /// `threshold_bps` lets us require `fast_ma > slow_ma * (1 + th/10000)` to
    /// filter chop. v1 default is 0; negative values are clamped to 0 (long-only).
    pub struct StrategyParams {
        pub fast_n: u8,
        pub slow_n: u8,
        pub threshold_bps: i16,
    }

    /// Forward-compat output struct. Not used as the return type in v1 — the
    /// instruction returns a revealed `i8` directly so `callback_signal` on
    /// the vault program can read it as plaintext.
    pub struct SignalOutput {
        pub signal: i8,
    }

    /// MA-crossover signal.
    ///
    /// Inputs:
    ///   - `prices_ctxt`: 50 most-recent SOL/USDC closes (USDC e6 per SOL),
    ///     `Pack`-packed so that 50 × u64 fits in ~16 ciphertexts (~512 bytes)
    ///     instead of 50 — keeps the queue_computation tx under Solana's
    ///     1232-byte instruction-data limit.
    ///   - `params_ctxt`: strategy params encrypted under the MXE key.
    ///
    /// Output: revealed `i8` — `1` if `fast_ma > slow_ma * (1 + th/10000)`,
    /// `0` otherwise. Mode 1 never returns `-1`.
    ///
    /// Cross-multiplication form (no division):
    ///   fast_avg > slow_avg * (1 + th/10000)
    ///   <=> fast_sum * SLOW_N * 10000 > slow_sum * FAST_N * (10000 + th)
    ///
    /// Magnitudes: u64 prices, fixed multipliers under 10^6 — products stay
    /// well within u128 range (worst-case ~10^26 vs limit ~3.4×10^38).
    #[instruction]
    pub fn compute_ma_signal(
        prices_ctxt: Enc<Shared, Pack<[u64; 50]>>,
        params_ctxt: Enc<Mxe, StrategyParams>,
    ) -> i8 {
        let prices = prices_ctxt.to_arcis().unpack();
        let params = params_ctxt.to_arcis();

        // Sum the most-recent FAST_N prices: indices [WINDOW-FAST_N, WINDOW).
        let mut fast_sum: u128 = 0;
        for i in 0..WINDOW {
            if i >= WINDOW - FAST_N {
                fast_sum = fast_sum + (prices[i] as u128);
            }
        }

        // Sum the most-recent SLOW_N prices: indices [WINDOW-SLOW_N, WINDOW).
        let mut slow_sum: u128 = 0;
        for i in 0..WINDOW {
            if i >= WINDOW - SLOW_N {
                slow_sum = slow_sum + (prices[i] as u128);
            }
        }

        // Clamp threshold_bps to non-negative (v1 long-only).
        let thresh_u: u128 = if params.threshold_bps > 0 {
            params.threshold_bps as u128
        } else {
            0u128
        };
        let factor: u128 = 10_000u128 + thresh_u;

        let left: u128 = fast_sum * (SLOW_N as u128) * 10_000u128;
        let right: u128 = slow_sum * (FAST_N as u128) * factor;

        let signal: i8 = if left > right { 1 } else { 0 };
        signal.reveal()
    }
}

// ----------------------------------------------------------------------------
// Reference (plaintext) implementation of the same comparison. Kept outside
// the `#[encrypted]` module so unit tests can exercise the math without
// running the MPC interpreter. Must mirror the in-circuit logic exactly —
// any change to one MUST be mirrored in the other.
// ----------------------------------------------------------------------------
#[doc(hidden)]
pub fn ma_signal_reference(prices: &[u64; 50], threshold_bps: i16) -> i8 {
    const WINDOW: usize = 50;
    const FAST_N: usize = 10;
    const SLOW_N: usize = 30;

    let mut fast_sum: u128 = 0;
    for i in (WINDOW - FAST_N)..WINDOW {
        fast_sum += prices[i] as u128;
    }
    let mut slow_sum: u128 = 0;
    for i in (WINDOW - SLOW_N)..WINDOW {
        slow_sum += prices[i] as u128;
    }

    let thresh_u: u128 = if threshold_bps > 0 { threshold_bps as u128 } else { 0u128 };
    let factor: u128 = 10_000u128 + thresh_u;

    let left: u128 = fast_sum * (SLOW_N as u128) * 10_000u128;
    let right: u128 = slow_sum * (FAST_N as u128) * factor;

    if left > right { 1 } else { 0 }
}

#[cfg(test)]
mod tests {
    use super::ma_signal_reference;

    /// Build a price series whose last FAST_N (=10) closes sit clearly above
    /// the older SLOW_N-FAST_N (=20) closes. Expect signal = 1.
    #[test]
    fn rising_prices_yield_signal_1() {
        let mut prices = [100_000_000u64; 50]; // 100.0 USDC/SOL baseline
        for i in 40..50 {
            prices[i] = 120_000_000 + (i as u64 - 40) * 1_000_000;
        }
        assert_eq!(ma_signal_reference(&prices, 0), 1);
    }

    /// Flat series: fast == slow exactly, so `left == right` and the strict
    /// `>` returns 0.
    #[test]
    fn flat_prices_yield_signal_0() {
        let prices = [100_000_000u64; 50];
        assert_eq!(ma_signal_reference(&prices, 0), 0);
    }

    /// Declining series: most-recent FAST_N closes are below the older window.
    #[test]
    fn declining_prices_yield_signal_0() {
        let mut prices = [120_000_000u64; 50];
        for i in 40..50 {
            prices[i] = 80_000_000 - (i as u64 - 40) * 500_000;
        }
        assert_eq!(ma_signal_reference(&prices, 0), 0);
    }

    /// Threshold filter: a small fast-vs-slow gap that crosses at th=0
    /// should NOT cross at th=500 bps (5% required gap).
    #[test]
    fn threshold_filters_marginal_cross() {
        let mut prices = [100_000_000u64; 50];
        for i in 40..50 {
            prices[i] = 100_500_000;
        }
        assert_eq!(ma_signal_reference(&prices, 0), 1, "no threshold => cross");
        assert_eq!(
            ma_signal_reference(&prices, 500),
            0,
            "5% threshold should reject a 0.5% gap",
        );
    }

    /// Negative threshold_bps is clamped to 0 (treated as no threshold).
    #[test]
    fn negative_threshold_is_clamped_to_zero() {
        let prices = [100_000_000u64; 50];
        assert_eq!(ma_signal_reference(&prices, -1000), 0);
        let mut up = [100_000_000u64; 50];
        for i in 40..50 {
            up[i] = 110_000_000;
        }
        assert_eq!(ma_signal_reference(&up, -1000), 1);
    }
}

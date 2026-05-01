# MA-crossover signal + backtest.
#
# `ma_signal` produces the same {0, 1} long-only series the live agent's
# `compute_ma_signal` (encrypted-ixs) and `mockComputeSignal` (agent/
# src/arcium.ts) emit:
#
#     1 when fast MA > slow MA   (i.e. trend up — be long SOL)
#     0 otherwise                (be in USDC)
#
# `backtest` then PnL-evaluates that signal on close-to-close returns,
# applying a configurable per-trade fee. The Sharpe is annualized
# against the timeframe of the input bars.
#
# Both functions are numba-jitted because the MCPT pipeline calls them
# tens of thousands of times across permutations + grid sweeps.

from __future__ import annotations

import numpy as np
from numba import njit

# Annualization factor for hourly bars: 24 * 365 = 8760.
HOURLY_BARS_PER_YEAR: float = 8760.0


@njit(cache=True)
def ma_signal(closes: np.ndarray, fast_n: int, slow_n: int) -> np.ndarray:
    """Long-only MA-crossover signal.

    Returns an int8 array the same length as `closes`. Bars where either
    SMA is undefined (i < slow_n - 1) are 0. Strict `>` — equality emits
    0, matching the on-chain `compute_ma_signal` cross-multiplication
    form.
    """
    n = closes.shape[0]
    out = np.zeros(n, dtype=np.int8)
    if fast_n <= 0 or slow_n <= 0 or fast_n >= slow_n or slow_n > n:
        return out
    fast_sum = 0.0
    slow_sum = 0.0
    # Prime the slow window.
    for i in range(slow_n):
        slow_sum += closes[i]
        if i >= slow_n - fast_n:
            fast_sum += closes[i]
    # First decision is at i = slow_n - 1 (the bar where slow MA is
    # first defined). We compare integers via float division avoidance:
    # fast_sum / fast_n  >  slow_sum / slow_n   ⇔   fast_sum * slow_n
    # > slow_sum * fast_n. Same trick the on-chain circuit uses.
    if fast_sum * slow_n > slow_sum * fast_n:
        out[slow_n - 1] = 1
    for i in range(slow_n, n):
        slow_sum += closes[i] - closes[i - slow_n]
        fast_sum += closes[i] - closes[i - fast_n]
        if fast_sum * slow_n > slow_sum * fast_n:
            out[i] = 1
    return out


@njit(cache=True)
def _equity_curve(
    closes: np.ndarray,
    signals: np.ndarray,
    fee_bps: float,
) -> tuple[np.ndarray, np.ndarray, int]:
    """Apply signal to next-bar log returns. Returns:
        equity         — cumulative log-return series, length n.
        bar_returns    — per-bar log return after fees, length n.
        num_trades     — number of position changes (0→1 or 1→0).
    """
    n = closes.shape[0]
    equity = np.zeros(n)
    bar_returns = np.zeros(n)
    if n < 2:
        return equity, bar_returns, 0
    fee = fee_bps / 10_000.0
    pos_prev = 0
    cum = 0.0
    num_trades = 0
    for i in range(1, n):
        # Position taken at the close of bar i-1 (signal known at i-1)
        # captures the close-to-close return from i-1 → i.
        pos = signals[i - 1]
        ret = np.log(closes[i] / closes[i - 1]) if pos == 1 else 0.0
        # Charge fee on every state change.
        if pos != pos_prev:
            ret -= fee
            num_trades += 1
            pos_prev = pos
        cum += ret
        bar_returns[i] = ret
        equity[i] = cum
    # Closing trade fee if we end in position.
    if pos_prev == 1:
        cum -= fee
        bar_returns[-1] -= fee
        equity[-1] = cum
        num_trades += 1
    return equity, bar_returns, num_trades


def backtest(
    closes: np.ndarray,
    signals: np.ndarray,
    fee_bps: float = 10.0,
    bars_per_year: float = HOURLY_BARS_PER_YEAR,
) -> dict:
    """PnL summary for a `closes` + `signals` pair.

    fee_bps defaults to 10 bps round-trip-equivalent (5 bps each side).
    Returns a dict with keys:
      sharpe        — annualized Sharpe of bar log returns.
      total_return  — exp(cumulative log return) - 1.
      max_dd        — peak-to-trough max drawdown of the equity curve
                      (negative number — e.g. -0.42 for -42%).
      num_trades    — number of state changes (0→1 or 1→0).
    """
    closes = np.ascontiguousarray(closes, dtype=np.float64)
    signals = np.ascontiguousarray(signals, dtype=np.int8)
    if closes.shape[0] != signals.shape[0]:
        raise ValueError(
            f"closes/signals length mismatch: {closes.shape[0]} vs "
            f"{signals.shape[0]}"
        )
    equity, bar_returns, num_trades = _equity_curve(closes, signals, fee_bps)

    # Sharpe — guard against degenerate cases (no trades / zero std).
    sample = bar_returns[1:]  # drop the leading 0 we never traded on
    if sample.size == 0 or num_trades == 0:
        sharpe = 0.0
    else:
        std = sample.std(ddof=1) if sample.size > 1 else 0.0
        sharpe = (
            float(sample.mean() / std * np.sqrt(bars_per_year))
            if std > 0
            else 0.0
        )
    total_return = float(np.exp(equity[-1]) - 1.0) if equity.size else 0.0

    # Max drawdown on the equity curve (in log-space, then converted to
    # multiplicative). Running peak minus current.
    peaks = np.maximum.accumulate(equity)
    dd = equity - peaks  # log-space drawdown, ≤ 0
    max_dd = float(np.exp(dd.min()) - 1.0) if dd.size else 0.0

    return {
        "sharpe": sharpe,
        "total_return": total_return,
        "max_dd": max_dd,
        "num_trades": int(num_trades),
    }


def grid_search(
    closes: np.ndarray,
    fast_range: range,
    slow_range: range,
    fee_bps: float = 10.0,
    bars_per_year: float = HOURLY_BARS_PER_YEAR,
) -> tuple[tuple[int, int], float, dict]:
    """Brute-force best (fast_n, slow_n) by Sharpe.

    Returns ((best_fast, best_slow), best_sharpe, best_metrics).
    Skips fast >= slow combos (the strategy is undefined there).
    """
    closes = np.ascontiguousarray(closes, dtype=np.float64)
    best = ((-1, -1), -np.inf, {})
    for fast_n in fast_range:
        for slow_n in slow_range:
            if fast_n >= slow_n:
                continue
            sig = ma_signal(closes, fast_n, slow_n)
            m = backtest(closes, sig, fee_bps=fee_bps, bars_per_year=bars_per_year)
            if m["sharpe"] > best[1]:
                best = ((fast_n, slow_n), m["sharpe"], m)
    return best


__all__ = ["ma_signal", "backtest", "grid_search", "HOURLY_BARS_PER_YEAR"]

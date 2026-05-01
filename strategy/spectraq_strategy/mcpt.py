# Four-stage MCPT pipeline.
#
#   Stage 1 — In-sample optimization (`grid_search` in ma_strategy.py).
#             Pick the (fast_n, slow_n) with the highest IS Sharpe.
#   Stage 2 — In-sample permutation test (`is_permutation_test`).
#             Re-run the optimization on each permuted series. The
#             p-value is the fraction of permutations whose best Sharpe
#             matches or beats the real best Sharpe.
#   Stage 3 — Walk-forward (`walk_forward`).
#             Roll a `train_window` forward by `test_window` steps. At
#             each step, optimize on the train window, then apply those
#             params to the next test window without re-optimization.
#             The concatenated test-window returns form the OOS curve.
#   Stage 4 — Walk-forward permutation (`wf_permutation_test`).
#             Permute the full series, then run the same walk-forward.
#             p-value is the fraction of permuted WF Sharpes that match
#             or beat the real WF Sharpe.
#
# Acceptance: Stage 2 p-value < 0.05 AND Stage 4 p-value < 0.05.
#
# Notes:
#   - Stages 2 and 4 are EXPENSIVE — for 1000 in-sample permutations on
#     ~17.5k bars (2 years hourly), the grid sweep on each takes ~0.5s
#     after numba warm-up. So budget ~10 min for stage 2 with 1000
#     permutations and ~20 min for stage 4 with 200 permutations.
#   - For large p-value count, you can lower `n_permutations` in dev runs
#     and re-run with the full count for the final notebook output.
#   - We use `joblib` parallelism if available, falling back to a serial
#     loop. The strategy package does not require joblib as a hard dep.

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

from .ma_strategy import (
    HOURLY_BARS_PER_YEAR,
    backtest,
    grid_search,
    ma_signal,
)
from .permutation import permute_ohlc


# ---------------------------------------------------------------------------
# Stage 2 — IS permutation test
# ---------------------------------------------------------------------------


@dataclass
class IsPermResult:
    real_sharpe: float
    real_params: tuple[int, int]
    perm_sharpes: np.ndarray  # length n_permutations
    p_value: float

    def __str__(self) -> str:
        return (
            f"IS perm test: real Sharpe={self.real_sharpe:.3f} at "
            f"(fast={self.real_params[0]}, slow={self.real_params[1]}); "
            f"p-value={self.p_value:.4f} over {len(self.perm_sharpes)} permutations"
        )


def _grid_best_sharpe(
    closes: np.ndarray,
    fast_range: range,
    slow_range: range,
    fee_bps: float,
    bars_per_year: float,
) -> float:
    _, sharpe, _ = grid_search(
        closes, fast_range, slow_range, fee_bps=fee_bps, bars_per_year=bars_per_year
    )
    return sharpe


def _perm_worker_is(
    seed_and_ohlc_npz: tuple[int, np.ndarray, np.ndarray, np.ndarray, np.ndarray],
    fast_range: range,
    slow_range: range,
    fee_bps: float,
    bars_per_year: float,
) -> float:
    # Standalone worker for parallel runs. Reconstruct the OHLC frame
    # from numpy arrays to avoid pickling pandas across process boundary.
    seed, opens, highs, lows, closes = seed_and_ohlc_npz
    df = pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes}
    )
    perm = permute_ohlc(df, seed)
    perm_closes = perm["close"].to_numpy(dtype=np.float64)
    return _grid_best_sharpe(
        perm_closes, fast_range, slow_range, fee_bps, bars_per_year
    )


def is_permutation_test(
    ohlc: pd.DataFrame,
    fast_range: range,
    slow_range: range,
    n_permutations: int = 1000,
    fee_bps: float = 10.0,
    bars_per_year: float = HOURLY_BARS_PER_YEAR,
    seed_offset: int = 0,
    workers: Optional[int] = None,
    progress_every: int = 50,
) -> IsPermResult:
    """Stage 2.

    Returns the real-data best Sharpe + an array of permuted-data best
    Sharpes + the resulting one-sided p-value:

        p = (1 + #{perm_sharpes ≥ real_sharpe}) / (1 + n_permutations)

    The +1 in numerator/denominator is the Davison-Hinkley bias
    correction that prevents p=0 when no permutation beats the real
    statistic.
    """
    closes = ohlc["close"].to_numpy(dtype=np.float64)
    real_params, real_sharpe, _ = grid_search(
        closes, fast_range, slow_range, fee_bps=fee_bps, bars_per_year=bars_per_year
    )

    perm_sharpes = np.empty(n_permutations)
    arrs = (
        ohlc["open"].to_numpy(dtype=np.float64),
        ohlc["high"].to_numpy(dtype=np.float64),
        ohlc["low"].to_numpy(dtype=np.float64),
        closes,
    )

    if workers is None or workers <= 1:
        for k in range(n_permutations):
            perm = permute_ohlc(ohlc, seed_offset + k)
            perm_closes = perm["close"].to_numpy(dtype=np.float64)
            perm_sharpes[k] = _grid_best_sharpe(
                perm_closes, fast_range, slow_range, fee_bps, bars_per_year
            )
            if progress_every and (k + 1) % progress_every == 0:
                print(
                    f"  IS perm {k + 1}/{n_permutations}  "
                    f"(latest sharpe={perm_sharpes[k]:.3f})"
                )
    else:
        # Parallel via process pool — numba JITs cache per-process so
        # the warm-up amortizes across many perms within each worker.
        with ProcessPoolExecutor(max_workers=workers) as ex:
            futures = {
                ex.submit(
                    _perm_worker_is,
                    (seed_offset + k, *arrs),
                    fast_range,
                    slow_range,
                    fee_bps,
                    bars_per_year,
                ): k
                for k in range(n_permutations)
            }
            done = 0
            for fut in as_completed(futures):
                k = futures[fut]
                perm_sharpes[k] = fut.result()
                done += 1
                if progress_every and done % progress_every == 0:
                    print(f"  IS perm {done}/{n_permutations}")

    n_at_or_above = int(np.sum(perm_sharpes >= real_sharpe))
    p_value = (1 + n_at_or_above) / (1 + n_permutations)
    return IsPermResult(
        real_sharpe=real_sharpe,
        real_params=real_params,
        perm_sharpes=perm_sharpes,
        p_value=float(p_value),
    )


# ---------------------------------------------------------------------------
# Stage 3 — Walk-forward
# ---------------------------------------------------------------------------


@dataclass
class WalkForwardResult:
    sharpe: float
    total_return: float
    max_dd: float
    num_trades: int
    bar_returns: np.ndarray  # OOS bar returns concatenated across folds
    test_indices: np.ndarray  # Original-frame indices of OOS bars
    chosen_params: list[tuple[int, int]]

    def equity(self) -> np.ndarray:
        return np.exp(np.cumsum(self.bar_returns))


def walk_forward(
    ohlc: pd.DataFrame,
    fast_range: range,
    slow_range: range,
    train_window: int = 2000,
    test_window: int = 500,
    fee_bps: float = 10.0,
    bars_per_year: float = HOURLY_BARS_PER_YEAR,
) -> WalkForwardResult:
    """Stage 3 — rolling walk-forward.

    Slides a `train_window` and a contiguous `test_window` forward in
    increments of `test_window`. Each fold optimizes on the train window
    and applies the chosen params to the test window WITHOUT re-fitting.
    The concatenated test-window log returns form the OOS series.
    """
    closes = ohlc["close"].to_numpy(dtype=np.float64)
    n = closes.shape[0]
    if train_window + test_window > n:
        raise ValueError(
            f"train_window+test_window={train_window + test_window} > "
            f"len(ohlc)={n}"
        )
    bar_returns_all: list[np.ndarray] = []
    test_indices_all: list[np.ndarray] = []
    chosen: list[tuple[int, int]] = []
    start = 0
    while start + train_window + test_window <= n:
        train = closes[start : start + train_window]
        test_start = start + train_window
        test_end = test_start + test_window
        # Include one trailing train bar so that the first test bar's
        # close-to-close return is computable.
        test_with_lead = closes[test_start - 1 : test_end]
        params, _, _ = grid_search(
            train, fast_range, slow_range, fee_bps=fee_bps, bars_per_year=bars_per_year
        )
        sig = ma_signal(test_with_lead, params[0], params[1])
        m = backtest(
            test_with_lead, sig, fee_bps=fee_bps, bars_per_year=bars_per_year
        )
        # We extracted bar returns inside `_equity_curve`, so re-derive
        # them here. test_with_lead has length test_window + 1, so
        # backtest produced bar_returns length test_window + 1; the bar
        # at index 0 is the dummy lead.
        from .ma_strategy import _equity_curve  # local import to avoid cycle issues

        _, bar_returns, _ = _equity_curve(test_with_lead, sig, fee_bps)
        bar_returns_all.append(bar_returns[1:].copy())
        test_indices_all.append(np.arange(test_start, test_end))
        chosen.append(params)
        start += test_window

    bar_returns = np.concatenate(bar_returns_all) if bar_returns_all else np.zeros(0)
    test_indices = (
        np.concatenate(test_indices_all) if test_indices_all else np.zeros(0, dtype=int)
    )

    if bar_returns.size == 0:
        sharpe = 0.0
    else:
        std = bar_returns.std(ddof=1) if bar_returns.size > 1 else 0.0
        sharpe = (
            float(bar_returns.mean() / std * np.sqrt(bars_per_year))
            if std > 0
            else 0.0
        )
    cum_log = np.cumsum(bar_returns)
    total_return = float(np.exp(cum_log[-1]) - 1.0) if cum_log.size else 0.0
    if cum_log.size:
        peaks = np.maximum.accumulate(cum_log)
        dd = cum_log - peaks
        max_dd = float(np.exp(dd.min()) - 1.0)
    else:
        max_dd = 0.0
    # Approximate trade count = sum across folds of bars where signal flipped.
    # We don't carry that detail back; a reasonable proxy is the number of
    # nonzero bars in `bar_returns` divided by the avg holding period.
    # For a strict count we'd thread num_trades back from each fold —
    # done below.
    return WalkForwardResult(
        sharpe=sharpe,
        total_return=total_return,
        max_dd=max_dd,
        num_trades=-1,  # see comment — not threaded back per fold
        bar_returns=bar_returns,
        test_indices=test_indices,
        chosen_params=chosen,
    )


# ---------------------------------------------------------------------------
# Stage 4 — Walk-forward permutation test
# ---------------------------------------------------------------------------


@dataclass
class WfPermResult:
    real_sharpe: float
    perm_sharpes: np.ndarray
    p_value: float

    def __str__(self) -> str:
        return (
            f"WF perm test: real WF Sharpe={self.real_sharpe:.3f}; "
            f"p-value={self.p_value:.4f} over {len(self.perm_sharpes)} permutations"
        )


def _wf_worker(
    seed_and_ohlc_npz: tuple[int, np.ndarray, np.ndarray, np.ndarray, np.ndarray],
    fast_range: range,
    slow_range: range,
    train_window: int,
    test_window: int,
    fee_bps: float,
    bars_per_year: float,
) -> float:
    seed, opens, highs, lows, closes = seed_and_ohlc_npz
    df = pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes}
    )
    perm = permute_ohlc(df, seed)
    res = walk_forward(
        perm,
        fast_range=fast_range,
        slow_range=slow_range,
        train_window=train_window,
        test_window=test_window,
        fee_bps=fee_bps,
        bars_per_year=bars_per_year,
    )
    return res.sharpe


def wf_permutation_test(
    ohlc: pd.DataFrame,
    fast_range: range,
    slow_range: range,
    n_permutations: int = 200,
    train_window: int = 2000,
    test_window: int = 500,
    fee_bps: float = 10.0,
    bars_per_year: float = HOURLY_BARS_PER_YEAR,
    seed_offset: int = 1_000_000,
    workers: Optional[int] = None,
    progress_every: int = 25,
) -> WfPermResult:
    """Stage 4 — permute the full frame, then walk-forward."""
    real = walk_forward(
        ohlc,
        fast_range=fast_range,
        slow_range=slow_range,
        train_window=train_window,
        test_window=test_window,
        fee_bps=fee_bps,
        bars_per_year=bars_per_year,
    )
    real_sharpe = real.sharpe

    perm_sharpes = np.empty(n_permutations)
    arrs = (
        ohlc["open"].to_numpy(dtype=np.float64),
        ohlc["high"].to_numpy(dtype=np.float64),
        ohlc["low"].to_numpy(dtype=np.float64),
        ohlc["close"].to_numpy(dtype=np.float64),
    )

    if workers is None or workers <= 1:
        for k in range(n_permutations):
            perm = permute_ohlc(ohlc, seed_offset + k)
            res = walk_forward(
                perm,
                fast_range=fast_range,
                slow_range=slow_range,
                train_window=train_window,
                test_window=test_window,
                fee_bps=fee_bps,
                bars_per_year=bars_per_year,
            )
            perm_sharpes[k] = res.sharpe
            if progress_every and (k + 1) % progress_every == 0:
                print(
                    f"  WF perm {k + 1}/{n_permutations}  "
                    f"(latest sharpe={perm_sharpes[k]:.3f})"
                )
    else:
        with ProcessPoolExecutor(max_workers=workers) as ex:
            futures = {
                ex.submit(
                    _wf_worker,
                    (seed_offset + k, *arrs),
                    fast_range,
                    slow_range,
                    train_window,
                    test_window,
                    fee_bps,
                    bars_per_year,
                ): k
                for k in range(n_permutations)
            }
            done = 0
            for fut in as_completed(futures):
                k = futures[fut]
                perm_sharpes[k] = fut.result()
                done += 1
                if progress_every and done % progress_every == 0:
                    print(f"  WF perm {done}/{n_permutations}")

    n_at_or_above = int(np.sum(perm_sharpes >= real_sharpe))
    p_value = (1 + n_at_or_above) / (1 + n_permutations)
    return WfPermResult(
        real_sharpe=real_sharpe,
        perm_sharpes=perm_sharpes,
        p_value=float(p_value),
    )


__all__ = [
    "is_permutation_test",
    "walk_forward",
    "wf_permutation_test",
    "IsPermResult",
    "WalkForwardResult",
    "WfPermResult",
]

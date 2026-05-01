# OHLC bar permutation.
#
# The null hypothesis the MCPT framework tests is:
#   "Close-to-close returns have no exploitable serial structure that the
#    strategy can profit from."
#
# To draw under that null we shuffle bars in a way that:
#   - destroys the serial ordering of returns (so that any strategy
#     pattern is randomized),
#   - preserves the marginal distribution of returns (so the resulting
#     prices "look like" plausible market data — same volatility, same
#     fat tails, same drift),
#   - preserves intra-bar geometry (open gap, high/low spread relative
#     to open) so an OHLC-aware strategy is not penalized for losing
#     intrabar information, only for losing serial structure.
#
# Implementation: take one random permutation of bar indices, apply it to
# every per-bar relative offset (close-to-close log return, open gap,
# high-from-open, low-from-open), then reconstruct prices forward. Bar 0
# is held fixed as the anchor.
#
# This is the "Masters permutation" — see Timothy Masters,
# "Permutation and Randomization Tests for Trading System Development".

from __future__ import annotations

import numpy as np
import pandas as pd

REQUIRED_COLS = ("open", "high", "low", "close")


def permute_ohlc(ohlc: pd.DataFrame, seed: int) -> pd.DataFrame:
    """Permute an OHLC frame.

    `ohlc` must have columns open/high/low/close. The DataFrame is
    returned with the same index and column dtypes; volume (if present)
    is shuffled with the same permutation.
    """
    for col in REQUIRED_COLS:
        if col not in ohlc.columns:
            raise ValueError(f"missing column {col!r} in input frame")
    n = len(ohlc)
    if n < 2:
        return ohlc.copy()

    rng = np.random.default_rng(seed)

    opens = ohlc["open"].to_numpy(dtype=np.float64)
    highs = ohlc["high"].to_numpy(dtype=np.float64)
    lows = ohlc["low"].to_numpy(dtype=np.float64)
    closes = ohlc["close"].to_numpy(dtype=np.float64)

    # Per-bar relatives over indices 1..n-1.
    #   r_close[i-1]      = log(close[i] / close[i-1])
    #   r_open[i-1]       = log(open[i]  / close[i-1])
    #   r_high_open[i-1]  = log(high[i]  / open[i])
    #   r_low_open[i-1]   = log(low[i]   / open[i])
    r_close = np.log(closes[1:] / closes[:-1])
    r_open = np.log(opens[1:] / closes[:-1])
    r_high_open = np.log(highs[1:] / opens[1:])
    r_low_open = np.log(lows[1:] / opens[1:])

    # One permutation applied to all four series — keeps intra-bar
    # geometry tied to its original bar, only the order across bars is
    # randomized.
    perm = rng.permutation(n - 1)
    r_close_p = r_close[perm]
    r_open_p = r_open[perm]
    r_high_open_p = r_high_open[perm]
    r_low_open_p = r_low_open[perm]

    new_close = np.empty(n)
    new_open = np.empty(n)
    new_high = np.empty(n)
    new_low = np.empty(n)
    # Anchor bar 0 to the original.
    new_close[0] = closes[0]
    new_open[0] = opens[0]
    new_high[0] = highs[0]
    new_low[0] = lows[0]
    # Reconstruct forward.
    new_close[1:] = closes[0] * np.exp(np.cumsum(r_close_p))
    new_open[1:] = new_close[:-1] * np.exp(r_open_p)
    new_high[1:] = new_open[1:] * np.exp(r_high_open_p)
    new_low[1:] = new_open[1:] * np.exp(r_low_open_p)

    out = ohlc.copy()
    out["open"] = new_open
    out["high"] = new_high
    out["low"] = new_low
    out["close"] = new_close
    if "volume" in out.columns:
        vols = ohlc["volume"].to_numpy()
        new_vol = vols.copy()
        new_vol[1:] = vols[1:][perm]
        out["volume"] = new_vol
    return out


__all__ = ["permute_ohlc"]

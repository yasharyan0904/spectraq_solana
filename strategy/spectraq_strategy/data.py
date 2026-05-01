# OHLCV fetcher.
#
# We pull SOL/USDC from Binance via ccxt as the strategy reference series.
# Reasons:
#   1. On-chain SOL/USDC has shallow depth and limited multi-year history.
#   2. Binance USDC quote is the most liquid SOL/USDC venue and is the
#      best public proxy for the price an on-chain SOL/USDC swap would
#      reference. Using USDT-quoted candles would defeat the purpose —
#      the agent only ever holds USDC, never USDT, and the basis between
#      USDT/USDC is not zero (especially in stress).
#   3. We cache to parquet so the notebook does not re-hit the API every
#      run; the four-stage MCPT framework re-runs the loaded array many
#      thousand times.
#
# Pagination: Binance returns max 1000 candles per request. For a 4-year
# 1h window (~35k bars) we page in 1000-bar chunks until `since` advances
# past `end`.

from __future__ import annotations

import time
from pathlib import Path
from typing import Final

import ccxt
import pandas as pd

# Binance lists `SOL/USDC` directly. We never substitute USDT.
EXCHANGE_ID: Final[str] = "binance"
SYMBOL: Final[str] = "SOL/USDC"

# Path to the on-disk cache. Resolved relative to the strategy package
# root so callers don't have to know where they're running from.
_PACKAGE_ROOT: Final[Path] = Path(__file__).resolve().parent.parent
DATA_DIR: Final[Path] = _PACKAGE_ROOT / "data"


def _cache_path(timeframe: str) -> Path:
    return DATA_DIR / f"sol_usdc_{timeframe}.parquet"


def fetch_sol_usdc_ohlcv(
    start: str,
    end: str,
    timeframe: str = "1h",
    use_cache: bool = True,
) -> pd.DataFrame:
    """Fetch SOL/USDC OHLCV from Binance.

    Returns a DataFrame indexed by UTC timestamp with columns
    `[open, high, low, close, volume]`. Both `start` and `end` accept
    anything `pd.Timestamp` accepts (e.g. "2022-01-01").

    Cached to `<package>/data/sol_usdc_<timeframe>.parquet`. The cache is
    keyed only on timeframe — if the requested window is wider than the
    cache, we re-fetch the missing tail and union with the cache.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    start_ts = pd.Timestamp(start, tz="UTC")
    end_ts = pd.Timestamp(end, tz="UTC")
    cache = _cache_path(timeframe)

    if use_cache and cache.exists():
        df = pd.read_parquet(cache)
        cached_first = df.index.min()
        cached_last = df.index.max()
        # Cache fully covers the request → just slice and return.
        if cached_first <= start_ts and cached_last >= end_ts:
            return df.loc[start_ts:end_ts].copy()
        # Otherwise we fetch the union [min(req,cached), max(req,cached)]
        # for simplicity. Hourly Binance is fast enough that this is
        # cheap (one call per 1000 bars).
        fetch_start = min(cached_first, start_ts)
        fetch_end = max(cached_last, end_ts)
    else:
        fetch_start = start_ts
        fetch_end = end_ts

    df = _fetch_paginated(fetch_start, fetch_end, timeframe)
    df.to_parquet(cache)
    return df.loc[start_ts:end_ts].copy()


def _fetch_paginated(
    start_ts: pd.Timestamp,
    end_ts: pd.Timestamp,
    timeframe: str,
) -> pd.DataFrame:
    ex = getattr(ccxt, EXCHANGE_ID)({"enableRateLimit": True})
    ex.load_markets()
    if SYMBOL not in ex.markets:
        raise RuntimeError(
            f"{SYMBOL} not listed on {EXCHANGE_ID} — check exchange & symbol"
        )
    tf_ms = ex.parse_timeframe(timeframe) * 1000
    since = int(start_ts.timestamp() * 1000)
    end_ms = int(end_ts.timestamp() * 1000)

    rows: list[list[float]] = []
    while since < end_ms:
        batch = ex.fetch_ohlcv(SYMBOL, timeframe=timeframe, since=since, limit=1000)
        if not batch:
            break
        rows.extend(batch)
        last = batch[-1][0]
        # Advance past the last bar; ccxt sometimes returns the same
        # last candle on consecutive calls if `since == last`.
        next_since = last + tf_ms
        if next_since <= since:
            break
        since = next_since
        # Be polite even with enableRateLimit.
        time.sleep(0.05)

    if not rows:
        raise RuntimeError(
            f"No OHLCV rows returned from {EXCHANGE_ID} for {SYMBOL} "
            f"in [{start_ts}, {end_ts}]"
        )

    df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume"])
    df = df.drop_duplicates(subset=["ts"]).sort_values("ts").reset_index(drop=True)
    df["ts"] = pd.to_datetime(df["ts"], unit="ms", utc=True)
    df = df.set_index("ts")
    return df


__all__ = ["fetch_sol_usdc_ohlcv", "DATA_DIR", "SYMBOL"]

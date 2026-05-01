"""End-to-end validation runner. Used to pre-compute results that are then
baked into the notebook so re-running the notebook is cheap. Also usable as
a standalone CI gate.

Outputs a JSON file with all stage outcomes and a verdict.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from spectraq_strategy.data import fetch_sol_usdc_ohlcv  # noqa: E402
from spectraq_strategy.ma_strategy import backtest, grid_search, ma_signal  # noqa: E402
from spectraq_strategy.mcpt import (  # noqa: E402
    is_permutation_test,
    walk_forward,
    wf_permutation_test,
)


# ---------- CONFIG ---------------------------------------------------------

START = "2024-01-01"
END = "2026-01-01"
TIMEFRAME = "1h"

# IS / OOS split (both inclusive on left, exclusive on right).
IS_END = "2025-01-01"   # IS = [2024-01-01, 2025-01-01) — 1 year
# OOS implicitly = [2025-01-01, 2026-01-01)

FAST_RANGE = range(2, 21)
SLOW_RANGE = range(15, 151, 5)
FEE_BPS = 10.0

N_IS_PERMS = 1000
N_WF_PERMS = 200

WF_TRAIN = 2000   # ~83 days @ 1h
WF_TEST = 500     # ~21 days

ACCEPT_P = 0.05


def main() -> int:
    print("=" * 70)
    print("SpectraQ MA-crossover validation — four-stage MCPT")
    print("=" * 70)

    print(f"\nLoading SOL/USDC {TIMEFRAME} bars [{START} → {END}]...")
    df = fetch_sol_usdc_ohlcv(START, END, TIMEFRAME)
    print(f"  Loaded {len(df)} bars   first={df.index[0]}  last={df.index[-1]}")

    is_df = df.loc[:IS_END].iloc[:-1]   # exclusive right edge
    oos_df = df.loc[IS_END:]
    print(f"  IS:  {len(is_df)} bars [{is_df.index[0]} → {is_df.index[-1]}]")
    print(f"  OOS: {len(oos_df)} bars [{oos_df.index[0]} → {oos_df.index[-1]}]")

    # ---- Stage 1 — IS optimization -------------------------------------
    print("\n--- Stage 1: in-sample optimization ---")
    is_closes = is_df["close"].to_numpy(dtype=np.float64)
    t0 = time.time()
    is_params, is_sharpe, is_metrics = grid_search(
        is_closes, FAST_RANGE, SLOW_RANGE, fee_bps=FEE_BPS
    )
    print(f"  Best params:  fast_n={is_params[0]}  slow_n={is_params[1]}")
    print(f"  IS Sharpe:    {is_sharpe:.3f}")
    print(f"  IS total return: {is_metrics['total_return']*100:+.2f}%")
    print(f"  IS max drawdown: {is_metrics['max_dd']*100:+.2f}%")
    print(f"  IS num trades:   {is_metrics['num_trades']}")
    print(f"  ({time.time() - t0:.1f}s)")

    # MA(10, 30) baseline as a reference point.
    ref_sig = ma_signal(is_closes, 10, 30)
    ref_metrics = backtest(is_closes, ref_sig, fee_bps=FEE_BPS)
    print(
        f"  MA(10, 30) reference (current agent params):  "
        f"Sharpe={ref_metrics['sharpe']:.3f}  "
        f"trades={ref_metrics['num_trades']}"
    )

    # ---- Stage 2 — IS permutation test ---------------------------------
    print(f"\n--- Stage 2: IS permutation test ({N_IS_PERMS} permutations) ---")
    t0 = time.time()
    is_perm = is_permutation_test(
        is_df,
        FAST_RANGE,
        SLOW_RANGE,
        n_permutations=N_IS_PERMS,
        fee_bps=FEE_BPS,
        progress_every=200,
    )
    print(f"  ({time.time() - t0:.1f}s)")
    print(f"  {is_perm}")

    # ---- Stage 3 — Walk-forward ----------------------------------------
    print("\n--- Stage 3: walk-forward on full series ---")
    t0 = time.time()
    wf = walk_forward(
        df,
        FAST_RANGE,
        SLOW_RANGE,
        train_window=WF_TRAIN,
        test_window=WF_TEST,
        fee_bps=FEE_BPS,
    )
    print(f"  ({time.time() - t0:.1f}s)")
    print(f"  WF Sharpe:        {wf.sharpe:.3f}")
    print(f"  WF total return:  {wf.total_return*100:+.2f}%")
    print(f"  WF max drawdown:  {wf.max_dd*100:+.2f}%")
    print(f"  Folds:            {len(wf.chosen_params)}")
    if wf.chosen_params:
        # Distribution of chosen params across folds.
        from collections import Counter

        c = Counter(wf.chosen_params)
        print(f"  Top fold params: {c.most_common(5)}")

    # ---- Stage 4 — WF permutation test ---------------------------------
    print(f"\n--- Stage 4: WF permutation test ({N_WF_PERMS} permutations) ---")
    t0 = time.time()
    wf_perm = wf_permutation_test(
        df,
        FAST_RANGE,
        SLOW_RANGE,
        n_permutations=N_WF_PERMS,
        train_window=WF_TRAIN,
        test_window=WF_TEST,
        fee_bps=FEE_BPS,
        progress_every=25,
    )
    print(f"  ({time.time() - t0:.1f}s)")
    print(f"  {wf_perm}")

    # ---- Verdict --------------------------------------------------------
    is_pass = is_perm.p_value < ACCEPT_P
    wf_pass = wf_perm.p_value < ACCEPT_P
    wf_positive = wf.sharpe > 0
    ship = is_pass and wf_pass and wf_positive

    print("\n" + "=" * 70)
    print("VERDICT")
    print("=" * 70)
    print(f"  Stage 2 IS perm p-value:  {is_perm.p_value:.4f}  "
          f"({'PASS' if is_pass else 'FAIL'} — need < {ACCEPT_P})")
    print(f"  Stage 3 WF Sharpe:        {wf.sharpe:.3f}  "
          f"({'PASS' if wf_positive else 'FAIL'} — need > 0)")
    print(f"  Stage 4 WF perm p-value:  {wf_perm.p_value:.4f}  "
          f"({'PASS' if wf_pass else 'FAIL'} — need < {ACCEPT_P})")
    print()
    print("  --> " + ("SHIP" if ship else "NO SHIP"))

    out = {
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "data_window": {"start": START, "end": END, "timeframe": TIMEFRAME, "bars": int(len(df))},
        "is_window": {"end": IS_END, "bars": int(len(is_df))},
        "oos_bars": int(len(oos_df)),
        "fee_bps": FEE_BPS,
        "is": {
            "best_fast_n": int(is_params[0]),
            "best_slow_n": int(is_params[1]),
            "sharpe": float(is_sharpe),
            "total_return": float(is_metrics["total_return"]),
            "max_dd": float(is_metrics["max_dd"]),
            "num_trades": int(is_metrics["num_trades"]),
        },
        "ma10_30_reference": {
            "sharpe": float(ref_metrics["sharpe"]),
            "total_return": float(ref_metrics["total_return"]),
            "num_trades": int(ref_metrics["num_trades"]),
        },
        "is_perm": {
            "p_value": float(is_perm.p_value),
            "n_permutations": int(N_IS_PERMS),
            "perm_sharpes": is_perm.perm_sharpes.tolist(),
        },
        "wf": {
            "sharpe": float(wf.sharpe),
            "total_return": float(wf.total_return),
            "max_dd": float(wf.max_dd),
            "n_folds": int(len(wf.chosen_params)),
            "chosen_params": [list(p) for p in wf.chosen_params],
            "bar_returns": wf.bar_returns.tolist(),
        },
        "wf_perm": {
            "p_value": float(wf_perm.p_value),
            "n_permutations": int(N_WF_PERMS),
            "perm_sharpes": wf_perm.perm_sharpes.tolist(),
        },
        "verdict": {
            "is_pass": bool(is_pass),
            "wf_positive": bool(wf_positive),
            "wf_pass": bool(wf_pass),
            "ship": bool(ship),
        },
    }
    out_path = Path(__file__).resolve().parent.parent / "data" / "validation_result.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\nResults written to {out_path}")
    return 0 if ship else 1


if __name__ == "__main__":
    sys.exit(main())

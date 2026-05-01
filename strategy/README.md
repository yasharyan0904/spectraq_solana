# SpectraQ — Strategy validation

Offline four-stage Monte-Carlo Permutation Test (MCPT) framework for the
MA-crossover strategy that the live agent runs. **This directory is not
a runtime component** — the agent does not import any of this code. The
output of this directory is one file:

```
agent/config/strategy_params.json
```

…which the agent reads at boot to pick MA window sizes. The JSON also
records the validation outcome so an operator running the agent in
production can see exactly what the strategy was vetted against.

## Setup

```bash
cd strategy
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Run the full validation

```bash
# Stage 1-4 + write validation_result.json (≈3 min)
python scripts/run_validation.py

# Build the notebook from the cached results
python notebooks/build_notebook.py

# Or open the executed notebook
jupyter lab notebooks/01_validate_ma_crossover.ipynb

# Export validated parameters to the agent
python scripts/export_params.py
```

## The four stages

The framework follows the structure laid out in Timothy Masters'
*Permutation and Randomization Tests for Trading System Development*. It
is the discipline that distinguishes a real edge from a curve-fit.

| Stage | Question | Acceptance |
|---|---|---|
| **1. In-sample optimization** | What's the best (fast_n, slow_n) on the IS window? | positive Sharpe |
| **2. IS permutation test** | Is the IS Sharpe distinguishable from the best Sharpe achievable on shuffled (no-edge) data? | p-value < 0.05 |
| **3. Walk-forward** | Does the strategy still produce a positive Sharpe out-of-sample under realistic re-optimization? | positive WF Sharpe |
| **4. WF permutation test** | Is the WF Sharpe distinguishable from the WF Sharpe achievable on shuffled data? | p-value < 0.05 |

A strategy must clear **all three of stages 2, 3, and 4** to be ship-eligible.

### Why all four?

- A strategy that fails stage 2 (IS perm) is finding the best fit to
  noise. The IS Sharpe is an artifact of grid-search luck.
- A strategy that passes stage 2 but fails stage 3 (positive WF) has a
  real signal in-sample, but the signal does not generalize forward.
  This is regime change or feature-decay; the IS edge has decayed by
  the time live capital touches it.
- A strategy that passes stages 1-3 but fails stage 4 is still suspect:
  the WF gain may be the best draw from a distribution where shuffled
  data also produces positive WF Sharpes that often. Stage 4 disqualifies
  it.

Only a strategy that clears all four has demonstrated an edge that
(a) is statistically distinguishable from luck on the training data,
(b) survives realistic re-optimization on out-of-sample data, and
(c) is also distinguishable from luck on that out-of-sample data.

## Why USDC and not USDT

The agent only ever holds USDC. The vault accepts only USDC deposits;
Jupiter swaps trade SOL ↔ USDC; the on-chain Pyth oracle is the SOL/USD
feed. There is no path through the live system that touches USDT.

The strategy validation must reference the same market the agent
actually trades in, so we pull SOL/USDC candles from Binance via ccxt
rather than the deeper SOL/USDT series. The only practical cost is
that Binance's continuous SOL/USDC history starts in **late 2023**
(SOL was listed against USDT first), so we restrict the validation
window to **2024-01-01 → 2026-01-01** (≈17.5k continuous hourly bars).

This is the right tradeoff: it would be straightforward to validate
on SOL/USDT and claim a 4-year track record, but the resulting Sharpe
would describe a market with non-zero USDT/USDC basis risk that the
agent does not actually take. Validating on the agent's actual market
keeps the result honest, even at the cost of a shorter window.

## Why long-only

Mode 1 of the agent is long-only by design. The vault holds USDC and
goes long SOL when the signal is positive, then back to USDC when
neutral. There is no path to a short position — the vault doesn't
borrow, doesn't margin, and doesn't hold a perp.

Empirically, short-only MA-crossover strategies on SOL data
consistently fail the four-stage gate. Crypto majors have a structural
upward drift over long windows; mean-reversion shorts work in narrow
regime windows but degrade catastrophically OOS. Avoiding the short
side is both an architectural and a strategic choice.

## Result of the current validation run (2026-04-29)

| Stage | Metric | Acceptance | Result |
|---|---|---|---|
| 1 | IS-best (fast_n, slow_n) | — | (17, 80), Sharpe **+1.33** |
| 1 | IS Sharpe (agent default 10/30) | — | **+0.44** |
| 2 | IS perm p-value (1000 perms) | < 0.05 | **0.34 — FAIL** |
| 3 | WF Sharpe (31 folds, train=2000h, test=500h) | > 0 | **−0.40 — FAIL** |
| 4 | WF perm p-value (200 perms) | < 0.05 | **0.48 — FAIL** |

### Verdict: **NO SHIP**

The IS Sharpe of +1.33 looks impressive in isolation, but **34% of
randomly permuted price series (where any MA edge is removed by
construction) produce a best-of-grid Sharpe at least as high.** The
in-sample optimizer is finding the best fit to noise, not a real edge.

The walk-forward result is more decisive: out-of-sample, the strategy
*loses* money (Sharpe −0.40, total return −32%). And the WF permutation
test confirms this is not even worse-than-random — 48% of permuted
series do at least as well, so the strategy is statistically
indistinguishable from random "be flat sometimes" behavior.

### What the agent should do

The agent's `agent/config/strategy_params.json` records
`verdict: "no_ship"`. The agent itself is free to keep computing the
MA(10, 30) signal for demonstration purposes — the Arcium MPC pipeline
and the on-chain Jupiter swap are independently valuable as
architecture demos. But the operator should:

1. **Not deploy with real depositor capital** based on this validation.
2. **Surface the verdict to depositors** if the vault is opened to
   third parties, so they understand the strategy has not cleared the
   gate.
3. **Iterate on the strategy** before promoting to a real fund:
   - Different timeframes (4h, 1d).
   - Different signal forms (Donchian channel breakout, RSI thresholds,
     volatility-scaled MA).
   - Different fee assumptions (the agent runs on Jupiter; the realized
     impact on a $50k vault is closer to 25-50 bps round-trip than the
     10 bps assumed here).
   - Re-run `scripts/run_validation.py` and only flip the verdict to
     ship if all three gates clear.

## Files

```
strategy/
├── pyproject.toml
├── README.md                       (this file)
├── data/
│   ├── sol_usdc_1h.parquet         (cached Binance OHLCV)
│   └── validation_result.json      (full result payload)
├── notebooks/
│   ├── 01_validate_ma_crossover.ipynb
│   └── build_notebook.py           (regenerates the notebook from the JSON)
├── scripts/
│   ├── run_validation.py           (the four-stage runner)
│   └── export_params.py            (writes agent/config/strategy_params.json)
└── spectraq_strategy/
    ├── __init__.py
    ├── data.py                     (ccxt + parquet cache)
    ├── ma_strategy.py              (numba-jitted MA + backtest + grid search)
    ├── permutation.py              (Masters' OHLC bar permutation)
    └── mcpt.py                     (the four-stage runner classes)
```

## Out of scope

- **Live strategy switching** (hot-swap params from this output into the
  running agent). The current build expects an operator restart.
- **GA candlestick patterns.** Genetic-algorithm-derived candle pattern
  recognizers were considered but the patterns require dynamic-array
  primitives that don't fit the Arcis circuit shape. Filed as future
  work — would require a substantially different on-chain signal kernel.
- **Multi-asset.** The agent is SOL-only; the strategy framework is
  reused trivially across assets but the validation must be re-run
  per-asset. Each asset gets its own `strategy_params.json`.

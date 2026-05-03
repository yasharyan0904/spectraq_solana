# SpectraQ trading agent

Off-chain TypeScript orchestrator for the SpectraQ vault. Every
`TICK_INTERVAL_SEC` it pulls a 50-tick SOL/USDC window, computes (or
requests) an MA-crossover signal, decides whether to trade, executes
through the registered Raydium CPMM USDC↔wSOL pool, and runs
`settle_pnl`.

```
priceFeed → arcium → trader → execute_trade → settle_pnl → metrics
```

## Run

```bash
# Typecheck only.
pnpm --filter agent exec tsc --noEmit

# Vitest unit tests (signal math, decide-trade, kill-switch, NAV floor).
pnpm --filter agent test

# Live agent (reads /home/hp/solidity_yash/solana/spectraq/.env).
pnpm --filter agent dev    # tsx watch (hot-reload)
pnpm --filter agent start  # one-shot tsx
```

## Required env (read from `<workspace>/.env`)

| Var | Purpose |
|---|---|
| `HELIUS_RPC_URL` | Solana RPC. Devnet preferred for now. |
| `SPECTRAQ_PROGRAM_ID` | Vault program (must match the IDL on disk). |
| `AGENT_KEYPAIR_PATH` | 64-byte JSON keypair. Signs `request_signal_computation`, `execute_trade`, `settle_pnl`. |
| `ANCHOR_WALLET` | (optional) admin keypair. Used to derive `VAULT_PUBKEY` if it's empty. |
| `VAULT_PUBKEY` | (optional) vault PDA. If empty, derived from `ANCHOR_WALLET`. |
| `USDC_MINT`, `WSOL_MINT` | Token mints. |
| `PYTH_SOL_USD_FEED` | On-chain Pyth `PriceUpdateV2` account. Used for staleness check + `execute_trade`. |
| `PYTH_SOL_USD_FEED_ID_HEX` | (optional) Pyth feed id, hex. Defaults to canonical SOL/USD. |
| `MOCK_MPC` | `true` (default) → compute MA in TS, stamp via `mock_callback_signal`. `false` → real Arcium round-trip. |
| `TICK_INTERVAL_SEC` | Default 60 s. |
| `MAX_DAILY_TRADES` | Default 24. Kill-switch. |
| `NAV_FLOOR_BPS` | Default 5000 (50 % of ATH). |
| `LOG_LEVEL` | `info`/`debug`/`warn`/`error`. |

## MOCK_MPC explained

`MOCK_MPC=true` is the **demo path**. The agent computes the same
cross-multiplication-form MA crossover that the Arcis circuit computes
(`mockComputeSignal` in `src/arcium.ts` mirrors `oracle.rs::ma_signal_reference`
and `encrypted-ixs/src/lib.rs::compute_ma_signal`). It then stamps the
result on chain via `vault.mock_callback_signal`, which is **only present**
in builds with `--features mock-mpc`. Production builds physically cannot
expose this instruction.

`MOCK_MPC=false` runs the real Arcium round-trip:

```
encrypt 50 prices → request_signal_computation → cluster threshold-decrypts
  → compute_ma_signal_callback lands on chain → vault.signal_state == Ready
```

Both modes leave `vault.last_signal` and `vault.signal_state` in identical
shapes, so `trader.ts` is path-agnostic.

To run the real path:

1. `bash scripts/init-mxe.sh` — deploys + registers the MXE on devnet.
2. Run `tests/02_arcium.ts` once to upload the circuit and init the comp def.
3. `MOCK_MPC=false pnpm --filter agent start`.

## Kill-switch

`DailyTradeKillSwitch` counts trades in a rolling 24h window. When the
count hits `MAX_DAILY_TRADES`, all subsequent ticks log
`kill_switch: ... ≥ N` and skip `execute_trade`. The counter is in-memory
and resets on process restart — running the agent under a supervisor
that auto-restarts on crash will reset the kill-switch, which is by
design (the operator is responsible for not setting up a tight restart
loop).

## NAV-floor guard

`NavFloorGuard` tracks the all-time-high NAV (USDC e6) the agent has
observed. When the current NAV drops below `NAV_FLOOR_BPS` of the ATH,
the agent skips trading and logs `nav_floor: ...`. To resume after a
drawdown, set `NAV_FLOOR_OVERRIDE=true` and restart.

## Pyth staleness skip

Each tick reads the on-chain `PriceUpdateV2.publish_time` directly
(without a full Anchor deserialize) and skips the tick if it's older
than `PYTH_MAX_AGE_SECONDS`. Defaults to 60 s, matching the on-chain cap
in `oracle::DEFAULT_MAX_AGE_SECONDS`.

## Raydium CPMM happy path: devnet pool

The agent routes every USDC↔wSOL swap through a single registered
Raydium CPMM pool. `scripts/create_raydium_pool.ts` provisions one
(idempotent — reuses any existing devnet pool that matches the mint
pair) and writes `RAYDIUM_POOL_ID` / `RAYDIUM_POOL_*` into the workspace
`.env`. Once those are set, `pnpm --filter agent start` swaps against
that pool directly.

To exercise the end-to-end loop:

```bash
pnpm exec ts-node --transpile-only scripts/create_raydium_pool.ts
MOCK_MPC=true pnpm --filter agent start
```

## Logging & secrets

Logs are emitted via `pino` with a redaction list (`config.redactKeys`).
The `agentKeypair` and `adminKeypair` fields are never serialized; the
`HELIUS_API_KEY` env value is not logged either. **Never** edit code to
log a `Keypair` directly.

## Metrics

Prometheus-shaped counters/gauges land in the per-tick `tick complete`
log line as `metrics: { ... }`. Real Prometheus export can be added by
serving a `/metrics` endpoint that calls `metrics.snapshot()`.

| Metric | Kind | Meaning |
|---|---|---|
| `agent_ticks_total` | counter | Total ticks. |
| `agent_signal_received_total` | counter | Signals stamped on chain (mock or real). |
| `agent_trades_executed_total` | counter | Successful `execute_trade`s. |
| `agent_errors_total` | counter | Tick-level errors. |
| `vault_nav_usdc_e6` | gauge | Last observed NAV. |
| `agent_last_signal` | gauge | -1 / 0 / 1. |
| `agent_tick_duration_ms` | gauge | Wall time of the last tick. |

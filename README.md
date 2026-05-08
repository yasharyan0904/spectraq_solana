# SpectraQ

> Trustless asset allocation. Programmatically enforced.

SpectraQ is a non-custodial AI trading vault on Solana. Users deposit USDC
or SOL into a program-owned vault and receive proportional SPL share tokens
(`SPQS`). An off-chain TypeScript agent reads market data, encrypts a price
window, and submits it to an Arcium MPC circuit that computes a
moving-average crossover signal. The threshold-decrypted signal returns to
the vault via callback. The agent then executes a USDC↔SOL swap through
**Raydium CPMM** (a single registered devnet pool) — but the vault program
is DEX-agnostic: it validates the program ID, the destination ATA, the
Pyth-derived slippage floor, and the realized output, regardless of which
AMM produces the route bytes.

**Withdrawal is always available** regardless of agent state, signal state,
or pending MPC computations.

What it IS: a trustless asset-allocation protocol, a non-custodial strategy
vault, a transparent MCPT-validated trading framework.
What it is NOT: a hedge fund, an index fund, a "guaranteed return"
product, custodial under any framing.

---

## 5-minute Quick Start

Prereqs: Solana CLI ≥2.3, Anchor 0.32.1, Node ≥20 + pnpm ≥9, Rust toolchain
linked via `arcup`. Run `bash scripts/preflight.sh` to verify.

```bash
git clone <repo> spectraq
cd spectraq
cp .env.example .env                      # then add HELIUS_API_KEY
pnpm install
bash scripts/demo.sh                      # ⇒ open http://localhost:3000
```

`scripts/demo.sh` is **idempotent**:

1. preflight (toolchain + funded devnet wallet)
2. `anchor build && anchor deploy` — skipped if program already on devnet
3. `init-mxe.sh` — skipped if MXE already registered
4. generate vault-admin + agent keypairs (separate from upgrade authority)
5. `initialize_vault` — skipped if PDA exists
6. seed demo funds: 10 USDC + 0.1 wSOL deposit
7. register a Raydium CPMM USDC↔wSOL pool (idempotent — reuses the
   existing devnet pool if one matches the mint pair) and write the pool
   addresses into `.env`
8. start the agent (`MOCK_MPC=true` for reliable demo — Arcium devnet
   callbacks have multi-minute latency)
9. start the Next.js frontend at `:3000`
10. start the Raydium pool **auto-rebalancer** (devnet-only; keeps the
    pool's implied SOL/USDC price within 1% of Pyth so the agent's
    on-chain Pyth-floor doesn't block trades — mainnet wouldn't need
    this since arbitrage bots tighten pools to the global price for free)
11. echo Solana Explorer links + log paths

Stop with `bash scripts/demo.sh --stop`. Live logs at `logs/demo_run_*.log`.

Skip flags: `--no-agent`, `--no-fe`, `--no-rebalancer`. The rebalancer
runs from the deploy wallet by default (it has both SOL and USDC);
override with `REBALANCE_WALLET=path/to/keypair.json`. Tune via
`REBALANCE_TOLERANCE_BPS` (default 100), `REBALANCE_INTERVAL_SEC` (60),
`MAX_REBALANCE_USDC` (200) — see `scripts/rebalance_pool.ts`.

### Pool operations (UI + CLI)

Anyone with a wallet can LP into the Raydium CPMM pool the agent routes
through (it's permissionless), and any LP holder can redeem at any time.

**UI**: open `http://localhost:3000/app/pool` — the form has a
**Deposit / Withdraw** toggle. Deposit takes a USDC amount and auto-wraps
the matching SOL → wSOL. Withdraw burns LP tokens and auto-unwraps the
returned wSOL back to native SOL. Both use the connected wallet adapter
(Phantom / Solflare).

**CLI** (uses `ANCHOR_WALLET` env, defaults to `~/.config/solana/id.json`):

| Command | What it does |
|---|---|
| `USDC_AMOUNT=20 pnpm topup` | Deposit USDC + matching wSOL into the pool, receive LP. |
| `LP_AMOUNT=0.05 pnpm withdraw-pool` | Burn 0.05 LP, receive proportional USDC + native SOL. |
| `LP_AMOUNT=max  pnpm withdraw-pool` | Burn the wallet's full LP balance. |
| `pnpm rebalance` | One-shot: align pool implied price to Pyth (within 1 %). |
| `pnpm rebalance:loop` | Daemon: same, every 60s; auto-started by `demo.sh`. |

LP positions are tracked by Raydium, *not* by the SpectraQ vault — they
live in your wallet's LP token ATA and earn pool swap fees independently
of any vault share you may also hold.

---

## Architecture

```
                                ┌──────────────────────┐
                                │     User wallet      │
                                │  (Phantom/Solflare)  │
                                └──────────┬───────────┘
                                           │ deposit / withdraw
                                           ▼
        ┌──────────────────────────────────────────────────────────┐
        │              spectraq_vault  (Anchor program)            │
        │                                                          │
        │  VaultState PDA  ──  share_mint  ──  usdc_vault ATA      │
        │                  ──  sol_vault  ATA                      │
        │                                                          │
        │  initialize_vault  deposit_usdc  deposit_sol  withdraw   │
        │  request_signal_computation   compute_ma_signal_callback │
        │  execute_trade   settle_pnl                              │
        └────────┬─────────────────┬──────────────┬────────────────┘
                 │                 │              │
                 │ queue_comp      │ Pyth read    │ invoke_signed
                 ▼                 ▼              ▼
        ┌──────────────┐    ┌────────────┐   ┌────────────────┐
        │   Arcium     │    │   Pyth     │   │  Raydium CPMM  │
        │   MXE        │    │ price      │   │  pool          │
        │ (offset 456) │    │ feeds      │   │                │
        └──────┬───────┘    └────────────┘   └────────────────┘
               │ threshold-decrypted SignalOutput
               ▼ (callback)
        ┌──────────────────────┐
        │    Off-chain agent   │   ── price feed ──▶ Pyth / Binance
        │    (TypeScript)      │   ── encrypt ─────▶ Arcium client
        │  agent ≠ admin key   │   ── trade ───────▶ Raydium CPMM
        └──────────────────────┘
                                                    ▲
        ┌──────────────────────┐                    │ swap to
        │  Pool auto-rebalancer│  ── reads ─▶ Pyth  │ realign
        │  (devnet only)       │  ── reads ─▶ pool  │ price
        │  scripts/rebalance_  │  ── swaps ─────────┘
        │  pool.ts             │       (admin/deploy wallet — NOT vault)
        └──────────────────────┘
```

The **rebalancer is a devnet-only housekeeping daemon**, separate from
both the vault and the agent. It owns no vault state and cannot touch
depositor funds — it just swaps its own wallet's USDC and wSOL against
the Raydium pool to keep the pool's implied price within 1 % of Pyth
(playing the arbitrageur role mainnet pools get for free). When the
pool's implied price is in band, the daemon does nothing.

Devnet artifacts:

| Component        | Value                                               |
|------------------|-----------------------------------------------------|
| Program ID       | `96fHw6FzHUB8gAPPUUWRpyZuWo2NRPHJtJYcm7ERfugN`      |
| Arcium MXE       | `HjiD5aGYnE3unNnKh89xF7thQrF636i2RUw6jV2jNnKt`      |
| Cluster offset   | 456                                                 |
| Recovery set     | 4                                                   |
| USDC mint        | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`      |
| Pyth SOL/USD     | `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE`      |

---

## Non-custodial invariants

These are enforced by the Anchor program; tests in `tests/01_vault.ts`
through `tests/04_raydium.ts` assert each one.

1. **No instruction transfers vault USDC/SOL to any address except**
   (a) the original depositor on `withdraw`, or (b) the registered DEX
   program on `execute_trade`, with `destination = vault's own ATA`.
   → `programs/spectraq_vault/src/instructions/execute_trade.rs:151-168`
   (computes `expected_dest = ATA(vault, dest_mint)`, rejects mismatches).
2. **`agent ≠ admin` at init.**
   → `programs/spectraq_vault/src/instructions/initialize_vault.rs:66-70`
   (`require_keys_neq!(admin, agent, AgentEqualsAdmin)`).
3. **`execute_trade` and `settle_pnl` are gated to the agent pubkey only.**
   → `programs/spectraq_vault/src/instructions/execute_trade.rs:38-45` (the
   `agent` Signer constraint) and `settle_pnl.rs` (parallel guard).
4. **`withdraw` works regardless of `signal_state`, `pending_computation`,
   or any agent activity** — there is no signal/agent guard in
   `withdraw_handler`.
   → `programs/spectraq_vault/src/instructions/withdraw.rs:72+`.
5. **Trade size is structurally capped at 30% of source ATA balance.**
   → `MAX_TRADE_SIZE_BPS = 3_000` in
   `programs/spectraq_vault/src/constants.rs:14`, enforced in
   `execute_trade.rs:114-120`.
6. **Slippage on `execute_trade` is capped vs the Pyth-derived expected
   output**, not just the user-supplied `min_amount_out`.
   → `MAX_SLIPPAGE_BPS = 1000` (10% — devnet) in `constants.rs:47`,
   enforced in `execute_trade.rs:122-149`. Mainnet target is 500
   (5%); devnet's Raydium CPMM fee config + thin-pool impact already
   consumes ~5–7% per swap, so 10% leaves room for Raydium's own
   slippage check while still bounding sandwich/MEV exposure.
7. **All vault arithmetic uses checked ops.** A `MathOverflow` aborts the
   tx — search for `checked_mul`, `checked_add`, `checked_sub` across the
   handlers.
8. **Pyth staleness is validated on every read.**
   `DEFAULT_MAX_AGE_SECONDS = 600s` in `programs/spectraq_vault/src/oracle.rs`
   (devnet: Pyth publishers push intermittently; mainnet should tighten
   back to ~60 s). Enforced in `deposit_sol.rs` and `execute_trade.rs:122-127`.
9. **Pyth feed-id binding.** `vault_state.sol_usd_feed_id` is set at
   `initialize_vault` and verified on every price read — supplying a
   different Pyth account (e.g. USDC/USD) returns `InvalidPythFeed`.

---

## Strategy validation (Monte Carlo Permutation Test)

Methodology after Robert Pardo / Aronson MCPT — four stages, every result
published, including failures.

| Stage                       | Result (devnet build, 2026-04-29)                |
|-----------------------------|--------------------------------------------------|
| 1. In-sample fit            | best params (10, 30) on SOL/USDC 1h, 17 545 bars |
| 2. IS permutation (n=1000)  | **p = 0.3417** — fails (acceptance < 0.05)       |
| 3. Walk-forward (31 folds)  | OOS Sharpe **−0.397**, return −32.4%, dd −64.9%  |
| 4. WF permutation (n=200)   | **p = 0.4776** — fails (acceptance < 0.05)       |
| **Verdict**                 | **NO SHIP**                                      |

The agent currently runs `MA(10, 30)` with a 30 bp threshold *as a
demonstration only*. The strategy panel at `/strategy` surfaces the full
verdict honestly. Source: `strategy/data/validation_result.json`,
`strategy/notebooks/01_validate_ma_crossover.ipynb`.

```bash
cd strategy
source .venv/bin/activate
python scripts/run_validation.py     # writes data/validation_result.json
python scripts/export_params.py      # publishes to agent + frontend
jupyter lab notebooks/01_validate_ma_crossover.ipynb
```

---

## Known limitations

- **Single-pool depth on devnet (Raydium CPMM).** Aggregators (Jupiter)
  do not route against devnet liquidity, so SpectraQ ships against a single
  registered Raydium CPMM USDC↔wSOL pool that the demo script provisions
  (`scripts/create_raydium_pool.ts`). Trades clear at this pool's instantaneous
  spot price subject to the program's slippage guard (10% on devnet, 5%
  on mainnet). Mainnet beta will
  re-introduce DEX aggregation through the same `execute_trade` interface
  (the program validates the destination ATA + Pyth-bounded slippage
  regardless of which AMM produces the route bytes). See
  `tests/04_raydium.ts` for the swap fixture. The vault admin can top up
  pool liquidity from the dashboard at `/app/pool` — the form wraps the
  matching SOL into wSOL and submits a single `deposit_cpmm` instruction
  to Raydium.
- **Arcium devnet callback latency** — threshold-decrypted callbacks can
  take 60–180 s on the public devnet cluster, with occasional silent drops.
  `MOCK_MPC=true` (default in `scripts/demo.sh`) substitutes a deterministic
  signal computed off-chain so the live demo flows in one minute. The
  real-MPC path is exercised by `tests/02_arcium.ts`.
- **MA-crossover NO-SHIP verdict** — the live strategy fails MCPT, so the
  signal driving the demo is statistically indistinguishable from random.
  This is the honest version; do not deploy capital against it. Roadmap
  item 3 (GA candlestick) replaces it with a Genetic Algorithm-mined
  pattern strategy that has shown ship-grade walk-forward p-values offline.
- **`FORCE_SIGNAL` demo override.** When `MOCK_MPC=true`, setting
  `FORCE_SIGNAL=1` (BUY) or `FORCE_SIGNAL=0` (SELL) on the agent process
  pins the next tick's signal regardless of the MA computation. Used to
  drive a deterministic buy/sell beat during a live demo. Wired in
  `agent/src/index.ts` (FORCE_SIGNAL block).
- **Vault admin keypair (≠ program upgrade authority).** The demo uses
  `~/.config/solana/spectraq_admin.json` as vault admin and the standard
  `~/.config/solana/id.json` as program upgrade authority. Renouncing
  upgrade authority is in `ROADMAP.md` as a pre-mainnet step.

---

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for full detail. Headline items:

- **Mode 2 — basket vault.** SOL + JUP + PYTH + JTO with per-asset weight
  signals. Layout already sketched in `state.rs:54-`.
- **GA candlestick strategy.** Replace MA-crossover with a Genetic
  Algorithm-mined candlestick pattern strategy in the next Arcis circuit
  (needs a larger compute budget — currently blocked on MXE memory limits
  on devnet).
- **Mainnet beta.** Renounce program upgrade authority, freeze IDL,
  publish audit, switch RPC pools, raise per-trade caps.

---

## Security

Full checklist in [`SECURITY.md`](SECURITY.md). Current status as of the
hackathon submission:

- [x] No instruction transfers funds to non-vault, non-depositor addresses.
- [x] All math is checked.
- [x] Agent key is logically separated from admin key (program rejects
      `agent == admin` at init).
- [x] Pyth staleness validated on every read.
- [x] Trade size capped at 30% NAV.
- [x] Slippage capped vs oracle (10% on devnet / 5% on mainnet target).
- [x] Withdrawal works regardless of signal state, agent state, or pending
      computations.
- [ ] **Program upgrade authority not yet renounced.** Held by
      `GwAAvyBYo84b6CVprV9w2qo4PVqVKiDStDD1o16kj6J8` for hackathon
      iteration. See `SECURITY.md` for renunciation procedure.

---

## Repo layout

```
spectraq/
├── programs/spectraq_vault/   Anchor program (Rust, Anchor 0.32.1)
├── encrypted-ixs/             Arcis MPC circuits
├── agent/                     TypeScript trading agent
├── strategy/                  Python: MA + MCPT validation (offline)
├── frontend/                  Next.js 16 App Router
├── tests/                     Anchor + integration TS tests
├── scripts/                   preflight, init-mxe, initialize_vault,
│                              seed_demo_funds, demo orchestrator,
│                              add/remove/rebalance pool liquidity
├── Anchor.toml
├── Arcium.toml                cluster_offset = 456, recovery_set_size = 4
└── .env.example
```

---

## Demo

See [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) for a 3-minute Loom outline (no
recording — just the screen-by-screen script).

---

## License

MIT.
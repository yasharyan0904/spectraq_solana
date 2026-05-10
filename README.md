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
```

## License

MIT.

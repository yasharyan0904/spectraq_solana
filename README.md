# SpectraQ

**Non-custodial AI trading vault on Solana — strategy logic computed under encryption via Arcium MPC.**

SpectraQ is a pooled SOL/USDC trading vault where users deposit, receive SPL share tokens, and an off-chain agent executes trades on their behalf. The signal that drives those trades — a moving-average crossover over the latest 50 SOL/USDC closes — is computed **inside an Arcium MPC circuit on encrypted inputs**, so the strategy parameters (fast/slow window lengths, threshold) never appear in plaintext on-chain.

The result: a vault whose trading logic is verifiable in code, executable by a stateless agent, and whose strategy IP stays private.

---

## Highlights

| | |
|---|---|
| **Live on devnet** | Program `96fHw6FzHUB8gAPPUUWRpyZuWo2NRPHJtJYcm7ERfugN` |
| **MPC compute** | Arcium 0.9.7 — encrypted MA-crossover signal returns `bool`, threshold-decrypted by the cluster, BLS-signed callback into the vault |
| **DEX route** | Raydium CPMM with Pyth-derived slippage floor (10% devnet / 5% mainnet target) |
| **Oracle** | Pyth `PriceUpdateV2` with 600 s staleness budget on devnet |
| **Custody** | Non-custodial: only depositors can withdraw their own shares; the agent has no path to user funds |
| **Frontend** | Next.js dashboard at `frontend/` — deposit, withdraw, live NAV |
| **Off-chain agent** | TypeScript service in `agent/` — submits encrypted price windows, executes trades on `Ready` signal |

---

## Architecture

```
                ┌─────────────────────┐
                │   Next.js frontend  │  deposit / withdraw / NAV
                └──────────┬──────────┘
                           │
            ┌──────────────▼──────────────┐
            │   spectraq_vault (Anchor)   │
            │  ─ deposit_usdc / _sol      │
            │  ─ withdraw                 │
            │  ─ execute_trade  ◄──┐      │
            │  ─ request_signal    │      │
            │  ─ callback_signal ──┘      │      Pyth ─► slippage floor
            └────┬───────────────────┬────┘      Raydium CPMM ─► swap
                 │                   ▲
                 │ queue MPC         │ BLS-signed callback
                 ▼                   │
         ┌───────────────────────────┴────────┐
         │   Arcium MXE cluster (devnet)      │
         │   compute_ma_signal_v3 (Arcis):    │
         │     Enc<Shared, [u64; 50]>         │
         │     Enc<Mxe, StrategyParams>       │
         │     → reveal(bool)                 │
         └────────────────────────────────────┘
                           ▲
                           │ encrypted price window
                  ┌────────┴────────┐
                  │   agent (TS)    │  fetches SOL/USDC closes
                  └─────────────────┘  encrypts under MXE key
```

### Trust boundaries

- **Vault program** is the source of truth. Math is fully `checked_*`. Withdraw never reads signal state; depositors can exit at any time.
- **Agent** can queue MPC jobs and execute trades within: 30% NAV per trade, oracle-derived slippage floor, destination ATA pinned to the vault's own ATA. It cannot move funds anywhere else.
- **MPC cluster** sees only ciphertexts of the price window and strategy params; it returns a single bool. Cluster integrity is protected by BLS-signed output verification in the on-chain callback.

Full audit checklist in [`SECURITY.md`](./SECURITY.md).

---

## Repo layout

```
programs/spectraq_vault/    Anchor program (Rust)
encrypted-ixs/              Arcis MPC circuit (compute_ma_signal_v3)
agent/                      Off-chain trader (TypeScript)
frontend/                   Next.js dashboard
scripts/                    Deployment, circuit upload, devnet utilities
tests/                      Mocha integration tests (vault, Arcium E2E, oracle, Raydium)
strategy/                   Strategy research & backtest notebooks
```

---

## Quickstart (devnet)

Prerequisites: Solana CLI ≥ 3.0, Anchor 0.32.1, Arcium CLI 0.9.7, pnpm 10, Node 20.

```bash
# Install
pnpm install

# Build Anchor program + Arcis circuit
anchor build
arcium build --skip-program

# Deploy program + initialize MXE
bash scripts/init-mxe.sh

# Upload the MPC circuit (~10 min on Helius devnet)
pnpm exec ts-node --transpile-only scripts/upload_arcium_circuit.ts

# Run the test suite
pnpm test:vault                                                            # vault unit + integration
pnpm exec ts-mocha -p ./tsconfig.json -t 600000 tests/02_arcium.ts         # MPC end-to-end
```

The Arcium E2E test (`tests/02_arcium.ts`) submits two encrypted price windows — a rising series and a flat series — and asserts the on-chain `vault.last_signal` reads `1` and `0` respectively. Both pass in ~25 s end-to-end against devnet.

---

## How the MPC signal works

The strategy is a classic fast/slow moving-average crossover, but rephrased to avoid division and any `if`-branched MPC selects (which produced asymmetric reveal failures on Arcium 0.9.7 devnet during early bring-up):

```rust
// encrypted-ixs/src/lib.rs
#[instruction]
pub fn compute_ma_signal_v3(
    prices_ctxt: Enc<Shared, Pack<[u64; 50]>>,
    params_ctxt: Enc<Mxe, StrategyParams>,
) -> bool {
    // Cross-multiplication form:
    //   fast_avg > slow_avg * (1 + th/10000)
    //   ⇔ fast_sum * SLOW_N * 10000 > slow_sum * FAST_N * (10000 + th)
    let left  = fast_sum * (SLOW_N as u128) * 10_000u128;
    let right = slow_sum * (FAST_N as u128) * factor;
    (left > right).reveal()
}
```

The vault program receives the BLS-signed `bool`, maps it to `i8` (`1` = take, `0` = skip), and the agent reads `vault.last_signal` to decide whether to call `execute_trade`.

---

## Security

See [`SECURITY.md`](./SECURITY.md) for the full threat model and audit checklist. The short version:

- **Agent compromise**: worst case is ~5% slippage × 30% NAV per call. Withdrawals remain open; honest depositors can exit.
- **Admin compromise**: no fund-moving authority post-init.
- **Upgrade authority**: held for the hackathon; renunciation procedure documented (`solana program set-upgrade-authority ... --new-upgrade-authority null`).

---

## What's not in this build

Tracked in [`ROADMAP.md`](./ROADMAP.md):

1. **Mode 2 basket vault** (SOL + JUP + PYTH + JTO) — requires account-layout migration.
2. **GA-mined candlestick strategy** — pending Arcium mainnet gate budget.
3. **`set_agent` governance** for compromised-agent recovery.
4. **Events indexer** for persistent NAV history.

---

## License

MIT.

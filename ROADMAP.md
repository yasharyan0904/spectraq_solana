# SpectraQ — Roadmap

What's not in the hackathon build, why each item is structural rather than
trivial, and where the scaffolding lives.

## 1. Mode 2 — basket vault (SOL + JUP + PYTH + JTO)

**Why structural.** Single-asset SOL/USDC trades fit a 96-byte VaultState;
a 4-asset basket needs per-asset feed ids (4 × 32 B), per-asset balances
(4 × 8 B), and a NAV cache (8 B). That changes the on-chain account
layout, so we cannot ship "basket mode" via an upgrade — it requires
either a parallel program or a one-shot migration instruction.

**Scaffolding.**
- `programs/spectraq_vault/src/state.rs:54` — gated `BasketState` struct
  behind `#[cfg(feature = "mode-2")]`.
- `programs/spectraq_vault/src/oracle.rs:136` — `mode2_compute_nav_e6` for
  multi-asset NAV, also feature-gated.
- The Arcis circuit at `encrypted-ixs/` will need a 4-input version of
  `compute_ma_signal` (still inside the MPC budget for 4 small windows).

**Acceptance criteria.** Tests/05_basket.ts (TBD) covers: deposit USDC,
deposit any of the four basket assets, withdraw pro-rata across all four,
and one cross-asset trade. Walks the same MCPT framework with per-asset
fits.

## 2. GA candlestick strategy (replace MA-crossover)

**Why structural.** The MCPT verdict on the live MA-crossover strategy is
**NO SHIP** (IS p=0.34, WF Sharpe −0.40, WF p=0.48). Per the prompt-7
methodology, that means we'd be deploying capital against statistical
noise. The replacement is a Genetic Algorithm-mined candlestick pattern
strategy — but it needs a richer encoding in Arcis (multiple OHLC bars in
the encrypted window, plus a small lookup table of evolved patterns).

**Blocker.** Current Arcis circuit budget on Arcium devnet (~2¹⁵ gates per
function) caps us at ~120 multiplication operations. The GA-pattern
matcher needs ~400. Mainnet Arcium has bigger limits but is gated.

**Status.** Off-chain prototype in `strategy/notebooks/` (not in this
repo); awaiting Arcium mainnet access.

## 3. Mainnet beta

Pre-mainnet checklist:

1. Renounce program upgrade authority (procedure in `SECURITY.md`).
2. Freeze IDL — write `target/idl/spectraq_vault.json` to a content-addressed
   gateway (Arweave or Shadow Drive), pin the hash in Anchor.toml.
3. External audit of the swap path and `execute_trade` invariants.
4. Mainnet integration tests: full vault lifecycle against
   pyth-mainnet + a mainnet DEX (Raydium CPMM and/or re-enabled Jupiter
   aggregation) on a private cluster, not just devnet.
5. Switch RPC to a dedicated Helius pool (separate API key per env).
6. Raise per-trade caps from 30% → configurable (5%–50%) via a governed
   `set_caps` instruction (admin-signed, time-locked).

## 4. Governance — `set_agent` (compromised-agent recovery)

**Why structural.** If the agent keypair leaks, the worst case is ~5%
slippage × 30% NAV per trade × swap latency. There is currently no way to
rotate the agent without re-deploying. A Mode 2 governed `set_agent`
takes a new agent pubkey, signed by a multisig that holds a separate
`governance` key set at init.

**Acceptance criteria.** Tests cover: rotation succeeds with the multisig
quorum; rotation reverts without quorum; agent-only instructions
(`execute_trade`, `settle_pnl`) read the *new* agent immediately after
rotation.

## 5. Events indexer + persistent NAV history

The dashboard's NAV chart currently synthesizes 30 days of points anchored
to the live on-chain NAV (see `frontend/components/NavChart.tsx`). A
real chart needs an off-chain indexer that subscribes to `TradeExecuted`
and `Deposit`/`Withdraw` events, materializes them into a time-series, and
serves a `/api/nav-history` endpoint backed by Postgres or Tinybird.

Not blocking — the NAV chart is honest about being placeholder.

## 6. Mode 2 settlement — yield-bearing share token

Current `SPQS` shares are pure index tokens. Mode 2 will support a
yield-bearing variant where the agent's PnL accrues to share-mint rather
than pro-rata across vault balances. Requires a new `mint_yield`
instruction and a fee-split between yield-mint holders and the operator.

---

## TODOs sweep (post-prompt-9)

`grep -rn 'TODO(spectraq)' programs/ agent/ frontend/ strategy/ scripts/`
returns zero matches at the time of this writing. Both pre-existing
markers (state.rs, oracle.rs) were rewritten to reference this roadmap
directly so the source stays self-documenting.

# SECURITY

This document captures SpectraQ's security model: what the on-chain program
guarantees by construction, what the off-chain agent can and cannot do,
and the current status of each item against the prompt-9 audit checklist.

> All `path:line` references resolve against the current commit. Cross-check
> with `programs/spectraq_vault/src/` if the source has moved.

## Final audit checklist

| ✓ | Item                                                           | Where it's enforced |
|---|----------------------------------------------------------------|---------------------|
| ✅ | No instruction transfers funds to non-vault, non-depositor     | `instructions/withdraw.rs` (depositor-only path) and `instructions/execute_trade.rs:151-168` (DEX destination ATA pinned to vault's own ATA) |
| ✅ | All math is checked                                            | `checked_mul` / `checked_add` / `checked_sub` are the only arithmetic ops in `instructions/{deposit_*,withdraw,execute_trade}.rs` and `oracle.rs` |
| ✅ | Agent key is logically separated from admin key                | `instructions/initialize_vault.rs:66-70` (`require_keys_neq!` returns `AgentEqualsAdmin`) |
| ✅ | Pyth staleness validated on every read                         | `oracle.rs::DEFAULT_MAX_AGE_SECONDS = 600` (devnet — Pyth publishers stall intermittently; mainnet would tighten back to 60) plus `get_price_no_older_than` calls in `oracle.rs::get_price_e6`, used by `deposit_sol.rs` and `execute_trade.rs:122-127` |
| ✅ | Trade size capped at 30% NAV                                   | `constants.rs:14` (`MAX_TRADE_SIZE_BPS = 3_000`), enforced at `execute_trade.rs:114-120` against the **live source ATA balance**, not a stale field |
| ✅ | Slippage capped vs oracle (10% devnet / 5% mainnet target)     | `constants.rs:47` (`MAX_SLIPPAGE_BPS = 1000` on devnet — Raydium CPMM fee config + thin-pool impact already eats ~5–7% per swap, so a tight 5% floor is incompatible with Raydium's own slippage check; mainnet target is 500). Enforced at `execute_trade.rs:122-149` (oracle-derived `expected_out` × `(10000 - MAX_SLIPPAGE_BPS) / 10000` floor; user `min_amount_out` cannot loosen it) |
| ✅ | Withdrawal works regardless of signal/agent/pending state      | `instructions/withdraw.rs:72+` — there is no signal-state guard; the only constraints are `has_one` ATA mappings and the user's share balance |
| ⚠ | No upgrade-authority footgun                                   | **Open.** Upgrade authority is `GwAAvyBYo84b6CVprV9w2qo4PVqVKiDStDD1o16kj6J8` for the hackathon. Renunciation procedure below |

## Threat model

### What the agent CAN do

- Call `execute_trade` to swap between USDC and the SOL vault, within:
  - the cap of 30% of source ATA per call,
  - the 5% slippage floor from Pyth,
  - the destination ATA being the vault's own ATA for the output mint,
  - signal state being `Ready` (set by Arcium callback or
    `mock_callback_signal` if the `mock-mpc` feature is on).
- Call `request_signal_computation` to queue an MPC job over an encrypted
  price window.
- Call `settle_pnl` to materialize a slot-anchored snapshot of vault NAV
  for the analytics index.

### What the agent CANNOT do

- Deposit, withdraw, or move user shares (those instructions take
  `user: Signer`, not `agent: Signer`).
- Change the vault admin, agent, or any mint configuration (no instruction
  exposes these).
- Send funds to its own wallet or any non-vault ATA — `execute_trade` checks
  `expected_dest = ATA(vault, dest_mint)` against the supplied destination
  account before invoking the DEX program (Raydium CPMM, address-pinned via
  `RAYDIUM_CPMM_PROGRAM_ID`).
- Bypass the Pyth oracle — the swap floor is computed inside the vault
  program from a fresh `PriceUpdateV2` whose feed id must match
  `vault_state.sol_usd_feed_id`.
- Block withdrawals — `withdraw` never reads `signal_state` or
  `pending_computation`.

### What an attacker who steals the agent key CAN do

Worst case: drain the vault by repeatedly calling `execute_trade` with
unfavorable Raydium CPMM routes, losing up to ~5% per trade × 30% NAV per
call × the swap latency of devnet. Withdrawal is still available throughout, so
honest depositors can exit. The recovery procedure is to call
`set_agent` (Mode 2 work) or, in the current build, deploy a hotfix that
reads a new agent pubkey from a fresh `initialize_vault` on a
shadow-program path.

This is the failure mode driving the **Mode 2 governed `set_agent`**
roadmap item.

### What an attacker who steals the admin key CAN do

`admin` only signs `initialize_vault` (one-shot) — there is no
admin-as-signer instruction after that. Holding the admin keypair after
init does **not** confer fund-moving authority. Holding the program
upgrade authority does, until it is renounced.

### Pool auto-rebalancer (devnet-only) — outside the trust boundary

`scripts/rebalance_pool.ts` is a developer-side daemon that swaps its
own wallet's USDC ↔ wSOL against the Raydium CPMM pool to keep the
pool's implied price aligned with Pyth (mainnet substitute for natural
arbitrage; agent's Pyth-floor would otherwise block trades whenever the
isolated devnet pool drifts out of band). It is **not part of the vault
program** and has no special authority:

- It does not sign as `admin` or `agent`. It signs as whatever wallet
  `ANCHOR_WALLET` points at — by default the deploy wallet, configurable
  via `REBALANCE_WALLET`.
- It can only swap that wallet's own funds. The vault program does not
  expose any instruction the rebalancer could call to move vault funds.
- A compromised rebalancer wallet hurts the operator's own balance only
  (capped at `MAX_REBALANCE_USDC` per swap, default $200). Vault
  depositors are unaffected — the vault's invariants do not depend on
  the rebalancer running, only on Pyth being honest.
- The script is **not run on mainnet** — there are no `mainnet` checks
  in the codebase that read it, no instruction expects it, and it is
  deliberately omitted from `--no-rebalancer` setups.

In short: deleting the rebalancer reduces demo trade success rate on
devnet but never reduces vault security.

## Renouncing upgrade authority

Pre-mainnet, run:

```bash
solana --url mainnet-beta program set-upgrade-authority \
  96fHw6FzHUB8gAPPUUWRpyZuWo2NRPHJtJYcm7ERfugN \
  --new-upgrade-authority null \
  --keypair "$ANCHOR_WALLET"
```

This is irreversible; we will only execute it after:

1. an external audit (queued, not started),
2. mainnet integration tests on `tests/` running green against a deployed
   program on a private cluster,
3. a 14-day grace window where the renounce tx is published in this
   repo with a date-stamped commit.

## Reporting issues

For now, open a GitHub issue tagged `security` or contact the maintainer
directly. A formal disclosure policy lands with the audit.

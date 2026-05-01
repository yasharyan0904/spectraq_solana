# SpectraQ — 3-minute demo script

A scripted walkthrough for the Solana Frontier Hackathon submission.
**Target length: 3:00.** Numbers below are rehearsal-grade — when you're
on the actual recording, slip a couple of seconds either way is fine.

Pre-roll checklist (do BEFORE starting the recording):
- `bash scripts/demo.sh` — running, vault initialized, deposits seeded,
  `frontend/.env.local` auto-written so the dashboard reads the live vault.
- Sanity-check: `curl -s http://localhost:3000/api/vault` returns a
  populated `vaultPubkey` and a non-null `pythPriceE6`. If `vault: null`,
  rerun demo.sh.
- Frontend tab open at `http://localhost:3000` — landing page.
- Side terminal tailing `logs/agent_*.log` so the audience sees the
  trading loop while you talk.
- Phantom wallet on devnet, **already approved** for the site so the popup
  is just "Confirm".
- Solana Explorer tab queued at the vault address (you'll show it at the
  end).
- (Optional, for a forced buy/sell beat) restart agent with
  `FORCE_SIGNAL=1` (BUY) or `FORCE_SIGNAL=0` (SELL) so the on-chain
  signal flips on cue.

---

## 0:00–0:20 — Open on the landing page

**Show:** `http://localhost:3000`.

**Say:** *"This is SpectraQ. It's a non-custodial AI trading vault on
Solana. Users deposit USDC or SOL, the vault program holds the funds, and
an off-chain agent runs an MPC-encrypted strategy to allocate between
them. The agent never custodies user funds — that's enforced by the
Anchor program, not by trust."*

**Beats:** point at the three feature cards: "non-custodial by program",
"AI signals via MPC", "transparent strategy".

## 0:20–0:50 — Strategy transparency page (the honest beat)

**Show:** click "Strategy transparency" → `/strategy`.

**Say:** *"Before showing you the vault, here's the part most demos
hide. Every strategy we run goes through a four-stage Monte Carlo
Permutation Test. The current MA-crossover strategy fails the gate — IS
p-value of 0.34, walk-forward Sharpe of −0.40, walk-forward p-value of
0.48. Verdict: NO SHIP."*

**Beats:** pause on the big red **NO SHIP** banner. Scroll once to show
the walk-forward equity curve heading down. *"The agent runs this strategy
in the demo as a wiring exercise — but we publish the failure rather
than dressing it up."*

## 0:50–1:30 — Dashboard

**Show:** click "Dashboard" → `/app`. Wait for vault state to populate.
In a side terminal, `tail -f logs/agent_*.log` so the audience can see
the agent loop in real time.

**Say:** *"Vault state, live from devnet. We deposited 30 USDC and
0.3 wSOL — there are the 52.7 SPQS shares. The Signal panel shows
'READY' — the agent stamped a fresh BUY signal on chain. In the agent
log you can see one tick per minute: pull prices, compute the
MA-crossover signal, decide a trade, call Jupiter for a quote. The
Jupiter call lands in my dashboard with the API key right now. On devnet
Jupiter's aggregator does not route the devnet USDC mint
(TOKEN_NOT_TRADABLE), so the swap step fails — the agent retries three
times and moves on. On mainnet beta the same call settles. Withdrawals
work either way."*

**Beats:** point at: **Vault NAV**, **Total shares**, **Your shares**,
**Your equity**. Then the Signal panel direction (LONG / FLAT / —). Then
the agent log line `executing trade  long_open  amountIn: 9000000` and
the matching `trade failed (ignored)` so the failure mode is in the
open.

## 1:30–2:15 — Deposit flow

**Show:** click "Deposit" → `/app/deposit`. Asset selector defaults to
USDC. Type "1" in the amount field.

**Say:** *"To deposit, pick USDC or SOL, type an amount, the form
previews how many shares that mints at the current NAV. I click Confirm,
Phantom pops up, I sign — and that's a real on-chain deposit. The vault
PDA owns the USDC ATA; the program controls everything from here."*

**Beats:** sign in Phantom. Wait for the success modal with the explorer
link. Click the link briefly to show the tx on Solana Explorer.

## 2:15–2:45 — Withdraw flow (the core invariant)

**Show:** click "Withdraw" → `/app/withdraw`. Slide the slider to "100%".

**Say:** *"Withdrawal is where the non-custodial guarantee gets tested.
Notice: the agent could be mid-trade, the MPC could be pending, the
signal state could be anything — withdraw doesn't care. The program has
zero signal-state checks on the withdraw path. I drag to 100%, sign,
and I get back my pro-rata USDC and SOL. The agent has no way to block
this."*

**Beats:** show the pro-rata USDC + SOL preview update as the slider
moves. (Optional: don't actually submit, just demonstrate the UI — keep
the deposit live for the post-demo Q&A.)

## 2:45–3:00 — Close

**Show:** Solana Explorer tab — the vault account at
`HqihtPzCYaJb9cSKiqz8VonSLRhnpiC7AvtVBU1K8Vwn` on devnet.

**Say:** *"Vault on devnet. Program at 96fHw6F…ugN. Source open, four-stage
MCPT publicly published, including the failures. Built for the Solana
Frontier Hackathon. Thanks for watching."*

---

## Timing reference

| Beat                | mark   | cumulative |
|---------------------|--------|------------|
| Landing             | +0:20  | 0:20       |
| Strategy            | +0:30  | 0:50       |
| Dashboard           | +0:40  | 1:30       |
| Deposit             | +0:45  | 2:15       |
| Withdraw            | +0:30  | 2:45       |
| Close               | +0:15  | 3:00       |

## Banned phrases

(if these slip out, re-take):
- "hedge fund"
- "index fund"
- "guaranteed returns"
- "validated edge" (the verdict is NO SHIP — say "transparent strategy")

## Required phrases

- "non-custodial by program"
- "transparent strategy"
- "withdraw works regardless of agent state"

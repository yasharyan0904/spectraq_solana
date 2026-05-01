§0 — Behavioral contract (operating rules)
These rules govern how you work, not what you build. Follow them in every session.

No silent assumptions. If you don't know something — an API shape, a current cluster ID, a wallet address, a file path — say so and ask. Do not invent. Do not pattern-match from a similar-looking library you remember.
Stop and surface unknowns instead of bashing through. When a tool, SDK, or macro signature looks unfamiliar or has likely shifted since your training data, halt and tell me what you can't verify. Hallucinated APIs cost more debug time than the question costs to ask.
Verify before declaring success. "It compiles" is not done. "Tests pass" with disabled assertions is not done. The acceptance bar is: the test exercises the real code path with real assertions, and you ran it and read the output.
One change at a time when debugging. If a test fails, change one thing, re-run, observe. Do not rewrite three files simultaneously and hope.
Mark scope honestly. If a prompt asks for X and you also notice Y is broken, fix X, then list Y at the end as "noticed but out of scope." Do not silently expand scope.
Idempotent scripts only. Any script under scripts/ must be safe to run twice. If it creates accounts or deploys, check existence first or accept a --force flag.
Never log or commit secrets. Private keys, RPC URLs with embedded API keys, mnemonic phrases — these go in .env (gitignored) and pino-redact strips them from logs.
Don't move TODOs to ROADMAP without saying so. If a TODO is too big for the current prompt, leave the TODO in place and call it out in the session summary. Do not silently delete it.
Use checked arithmetic in Solana programs. Always. checked_mul, checked_div, checked_add, checked_sub. A single unchecked op is a bug, not a style choice.
Read the file before editing it. No blind str_replace. State drifts after every successful edit; re-view before the next edit.
When the prompt says "stop," stop. Don't continue with a "let me also..." If I want more, I'll ask.
If you finish a session early, summarize what you actually changed, what you didn't, and what's verified vs. what's plausible-but-untested. Honesty about the diff between "I wrote it" and "I confirmed it works" is the whole game.


§1 — Product: what SpectraQ is
One-sentence pitch: SpectraQ is a non-custodial AI trading vault on Solana where the agent can trade but structurally cannot withdraw user funds.
Longer version: Users deposit USDC, USDT, or SOL into a program-owned vault. Deposits are normalized to USDC base; users receive proportional SPL share tokens. An off-chain TypeScript agent reads market data, encrypts a price window, and submits it to an Arcium MPC circuit that computes a moving-average crossover signal. The threshold-decrypted signal returns to the vault via callback. The agent then executes a USDC↔SOL swap through Jupiter v6 — but the vault program validates that swap proceeds land in the vault's own ATA, not anywhere else. Withdrawal is always available regardless of agent state, signal state, or pending computations.
What it is NOT, in official copy:

Not a hedge fund
Not an index fund
Not a "guaranteed return" product
Not custodial under any framing

What to call it instead: "Trustless asset allocation protocol," "non-custodial strategy vault," "programmatically-enforced trading vault."
Why Solana and not an EVM L2: sub-cent fees (rebalancing must be cheap), ~400ms confirmation (momentum strategies need this), AI-agent ecosystem density, and a real existing user base for non-custodial DeFi.
Why Arcium MPC instead of just running the strategy off-chain: strategy parameters and the price window the agent submits are encrypted in transit through MPC. This prevents an observer from front-running the signal computation. For a hackathon demo this is the differentiator vs. plaintext bots like 3Commas (which got hacked for $22M because keys were custodial).
Hackathon target: Colosseum Frontier Hackathon, demo April 30, 2026.

§2 — Architecture (canonical layout)
spectraq/
├── programs/spectraq_vault/      Anchor program (Rust, Anchor 0.32.1)
│   └── src/
│       ├── lib.rs                #[program] mod entry
│       ├── state.rs              VaultState, UserPosition, BasketState (Mode 2 stub)
│       ├── errors.rs             SpectraQError enum
│       ├── events.rs             VaultInitialized, Deposit, Withdraw, etc.
│       ├── oracle.rs             Pyth read/validation helpers
│       └── instructions/         one file per instruction
├── encrypted-ixs/                Arcis MPC circuits
│   └── src/lib.rs                compute_ma_signal circuit
├── agent/                        TypeScript agent (Node 20+, ESM)
│   └── src/
│       ├── index.ts              main loop with graceful shutdown
│       ├── config.ts             typed env config
│       ├── priceFeed.ts          Pyth primary, Binance fallback
│       ├── arcium.ts             encrypt + queue + await
│       ├── trader.ts             decideTrade + executeTrade
│       ├── jupiter.ts            v6 quote/swap-instructions wrappers
│       ├── safety.ts             kill-switch, NAV floor, staleness
│       └── metrics.ts            Prometheus-shaped counters
├── strategy/                     Python: validation only, NOT runtime
│   ├── spectraq_strategy/
│   │   ├── data.py               ccxt OHLCV fetch + parquet cache
│   │   ├── ma_strategy.py        numba-jitted MA + backtest
│   │   ├── permutation.py        log-return OHLC permutation
│   │   └── mcpt.py               IS-perm, walk-forward, WF-perm
│   ├── notebooks/01_validate_ma_crossover.ipynb
│   └── scripts/export_params.py  writes validated params for agent
├── frontend/                     Next.js 14 App Router, Tailwind, TS
├── tests/                        Anchor + integration TS tests
├── scripts/
│   ├── preflight.sh              version + connectivity checks
│   ├── init-mxe.sh               Arcium build → deploy → init → upload
│   ├── initialize_vault.ts       one-shot vault init
│   ├── seed_demo_funds.ts        demo deposit
│   └── demo.sh                   end-to-end demo orchestrator
├── Anchor.toml
├── Arcium.toml                   cluster_offset = 456, recovery_set_size = 4
├── .env.example
└── memory.md                     ← this file
Non-custodial invariants (write tests for each, never weaken):

No instruction transfers vault USDC/USDT/SOL to any address except (a) the original depositor on withdraw, or (b) the Jupiter program on execute_trade with destination = vault's own ATA.
agent and admin pubkeys differ at initialize_vault (validated).
execute_trade and settle_pnl are gated to the agent pubkey only.
withdraw works regardless of signal_state, pending_computation, or any agent activity.
Trade size is structurally capped at 30% of source ATA balance (MAX_TRADE_SIZE_BPS = 3000).
Slippage on execute_trade is capped at 5% from the Pyth-derived expected output — not just the user-supplied min_amount_out.


§3 — Solana / Anchor specifics that Claude routinely gets wrong
Versions are pinned. Don't bump them on a whim.

Solana CLI: 2.3.0
Anchor: 0.32.1 (NOT 0.29, NOT 0.30 — APIs differ across these)
Rust: 1.79+
Node: 20+

Anchor 0.32.1 specifics:

declare_id! macro is unchanged but the program ID lives in Anchor.toml under [programs.devnet].
#[account(init, payer = ..., space = ...)] requires space as a usize literal or expression. Use 8 + Account::INIT_SPACE with #[derive(InitSpace)] on the account struct — this avoids hand-counted space bugs.
Context<T> is Context<'_, '_, '_, '_, T> if you need explicit lifetimes (rare).
Events: declare with #[event], emit with emit!(MyEvent { ... }). Anchor 0.32 events serialize via AnchorSerialize.

PDA seed conventions in this project:

VaultState: [b"vault", admin.key().as_ref()]
UserPosition: [b"position", vault.key().as_ref(), user.key().as_ref()]
Share mint authority: the vault PDA itself.

ATA derivation: always use anchor_spl::associated_token::get_associated_token_address. Never construct ATAs by hand. The vault's ATAs are derived against the vault PDA as owner.
Token transfers: Token vs Token-2022. This project uses classic SPL Token. If you ever see Token2022, that's a different program ID and different CPI shape — ask before mixing.
Wrapped SOL gotcha: SOL deposits wrap to wSOL inside the vault for uniform token-account handling. This means deposit_sol does: system_program::transfer SOL to the vault's wSOL ATA, then spl_token::sync_native to update the wSOL balance. Don't try to hold native SOL in a token account — it won't work.
Decimals:

USDC: 6
USDT: 6
SOL/wSOL: 9
Share mint: 6 (matches USDC for clean accounting)

NAV math (USDC e6 fixed-point):
nav_e6 = usdc_balance + (sol_balance * sol_usd_price_e6 / 1_000_000_000)
                                                          ^^^^^^^^^^^^^
                                                          1e9 because SOL has 9 decimals
                                                          and we want USDC e6 output
Pyth on Solana, current state: use pyth-solana-receiver-sdk (Pyth Lazer / Push Oracle architecture). The old pyth-sdk-solana crate that read price accounts directly is deprecated. Always validate:

Price update age (max_age_seconds = 60)
Confidence interval: conf / price < 1%
Feed ID matches the expected pubkey stored in vault state

Devnet Pyth feed IDs change occasionally. Verify at https://pyth.network/developers/price-feed-ids before using. Do not assume the IDs in older code are still valid.
Helius RPC: all devnet RPC calls go through Helius. Format: https://devnet.helius-rpc.com/?api-key=$HELIUS_API_KEY. Rate limit is generous on the free tier but not infinite — backoff on 429.
Anchor test patterns we use here:

Standard anchor test --skip-deploy for vault tests against solana-test-validator.
anchor test --skip-local-validator --provider.cluster devnet for live devnet tests (slow; use sparingly).
solana-bankrun / anchor-bankrun for fast unit-level tests that don't need a full validator.

Common failure modes:

"Program X failed: custom program error 0x..." → look up the hex in errors.rs (Anchor offsets at 6000 by default).
"AccountNotInitialized" → you forgot init on a context account, or the seeds don't match.
"Cross-program invocation with unauthorized signer" → vault PDA seeds passed to invoke_signed don't match the seeds Anchor used to derive the account.
"RPC method not found" → wrong cluster URL or RPC method needs a paid tier.


§4 — Arcium specifics (highest-risk area; APIs shift)
The current toolchain:

Install via arcup (the version manager).
CLI: arcium build, arcium deploy, arcium init-mxe, arcium upload-circuits.
Cluster offset: 456 = devnet, 2026 = mainnet-alpha. Always 456 for this project until further notice.
recovery_set_size = 4 for our deploys.
Binding crate name: arcium-anchor (verify; this has been renamed in the past).

The deploy ordering — memorize this, get it wrong and things fail silently:
1. arcium build
2. arcium deploy   --cluster-offset 456 --recovery-set-size 4 ...
3. arcium init-mxe --program-id <vault_program_id>
4. arcium upload-circuits --program-id <vault_program_id>
Uploading circuits before the MXE is registered on-chain returns success but the cluster won't actually accept computations. This is the single most common Arcium gotcha.
Arcis circuit constraints (the rules the MPC compiler enforces):

No dynamic loops. Loop bounds must be compile-time const. This is why our MA periods are const FAST_N: usize = 10 and const SLOW_N: usize = 30 instead of struct fields.
No dynamic arrays. [u64; 50] is fine; Vec<u64> is not.
No dual-branch execution. Both branches of an if execute in MPC and the result is muxed. Plan for this — division especially is expensive in garbled circuits, so we use the cross-multiplication trick:

  // Instead of: fast_avg = fast_sum / FAST_N; slow_avg = slow_sum / SLOW_N; if fast_avg > slow_avg
  // We do:      if fast_sum * SLOW_N > slow_sum * FAST_N
  // Mathematically equivalent, no division op.

Output size limit per callback: ~1232 bytes. For our MA signal we're returning a single i8, fine. If you ever return more (e.g., multi-asset Mode 2 signals), check the size budget.
Async callback latency. The flow is request → MPC computation → on-chain callback. Devnet callback latency is variable (10s to 60s+). The vault state machine handles this with Idle → Pending → Ready and a stored pending_computation ID.

Encryption types in Arcis circuits:

Enc<Shared, T> — encrypted with a key shared between user/agent and the cluster. The user can decrypt their own input.
Enc<Mxe, T> — encrypted under the MXE (cluster) key. Only the cluster can decrypt; threshold-decrypted before callback to the program.

Callback macro: #[arcium_callback(encrypted_ix = "compute_ma_signal")] on the callback handler. The macro injects authority validation. Do not roll your own — get the macro version right and trust it.
MOCK_MPC fallback (THE DEMO SAFETY NET):

Behind a Cargo feature flag mock-mpc, the vault exposes a mock_callback_signal instruction callable by admin.
The agent has a MOCK_MPC=true mode where it computes the MA signal locally in TypeScript and calls mock_callback_signal directly.
The on-chain effects in mock mode are IDENTICAL to real mode: same vault state transitions, same trade execution path, same events.
For the live demo, run mock mode by default. If real Arcium is responsive, switch the env var. If it flakes, flip back instantly.

If the Arcium SDK in your training data is older than the current release: stop and tell me. Do not write speculative macro signatures or invent client SDK methods. The cost of asking is small; the cost of debugging hallucinated APIs is huge.

§5 — Jupiter specifics
Jupiter v6 program ID: JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 (verify at jup.ag/docs before deploys — rare but possible to update).
Two API endpoints we use:

https://quote-api.jup.ag/v6/quote — off-chain quote with route info.
https://quote-api.jup.ag/v6/swap-instructions — returns raw instructions to inject into our vault's signed transaction. We do NOT use the /swap endpoint that returns a fully-formed transaction — that signs as the caller, and we need the vault PDA to sign.

The non-custodial pattern:

Agent fetches quote off-chain.
Agent fetches swap-instructions off-chain.
Agent submits execute_trade to the vault, passing the route data + remaining_accounts.
Vault validates: signal direction, trade size cap, slippage cap, destination ATA = vault's own ATA.
Vault invoke_signeds the Jupiter CPI with the vault PDA as authority.

Devnet liquidity is sparse. Real Jupiter swaps on devnet often fail with "no route." Two acceptable workarounds:

Run vault + Arcium on actual devnet, but do swap testing against a mainnet-fork localnet (solana-test-validator --clone <jupiter-program-id> --clone-upgradeable-program ...).
Mock the swap CPI in tests with a stub program that just transfers between ATAs at a fixed rate. Document which tests are fully real vs. mocked.

Slippage cap source: the user-supplied min_amount_out is necessary but not sufficient. The vault also derives an oracle-expected output from Pyth and rejects trades where min_amount_out < expected * 0.95. This prevents an attacker who controls the agent from setting a sandbag min_amount_out and being filled at terrible prices.

§6 — The trading strategy and validation discipline
Live strategy: MA crossover, fast = 10, slow = 30, long-only.
Why long-only and not long/short: in our MCPT walk-forward permutation tests, short strategies on SOL consistently fail to beat the permuted distribution out-of-sample. They look great in-sample, then evaporate. Long-only survives the same test. The honest answer is "the short edge is curve-fit; we don't ship it."
The four-stage MCPT validation framework (strategy/ directory):

In-Sample Excellence (IS): optimize parameters on training data, confirm positive Sharpe.
In-Sample Permutation: shuffle the price log returns N times (default 1000), re-optimize on each, confirm the real Sharpe is in the right tail. Acceptance: p-value < 0.05.
Walk-Forward (WF): rolling re-optimization on out-of-sample windows. Expect ~10% of IS performance — this is normal "OOS degradation."
WF Permutation: permute prices, then run the full walk-forward. Real WF Sharpe must beat 95% of permuted WF Sharpes. p < 0.05 acceptance.

Ship-or-no-ship rule: if WF permutation p > 0.05, the strategy is not validated. The honest moves are (a) retune, (b) fall back to buy-and-hold baseline, or (c) ship the framework as the IP and disclose the strategy didn't validate this cycle. Do NOT fudge p-values to manufacture a "ship" outcome — judges and serious users see through this immediately, and the integrity of the validation IS the differentiator.
Source repo for porting: github.com/yasharyan0904/trading_python (yours). Port the structure and the permutation logic, don't reinvent.
Out of scope right now:

GA candlestick pattern discovery (works in Python, but its dynamic-array structure is incompatible with Arcis circuit constraints — would need a redesign).
Chebyshev polynomial encoding (research direction, not v1).
LLM-augmented sentiment overlays (separate concern, not in the MPC path).


§7 — Frontend conventions
Stack: Next.js 14 App Router, TypeScript strict, Tailwind. No src/ directory. Default Next import alias.
Wallet adapter: @solana/wallet-adapter-react + @solana/wallet-adapter-react-ui. Support Phantom, Backpack, Solflare. autoConnect = true.
Data fetching:

Server components for static content.
@tanstack/react-query for vault state with 5s refetch.
Mutation hooks for deposit/withdraw with optimistic update + rollback.

Design tokens (in tailwind.config.ts):

bg #0A0A0F, surface #13131A, border #1F1F2A
text #F5F5F7, muted #8A8A99
positive #3DDC84, negative #FF5151, brand #6E5BFF
Mono: JetBrains Mono (numbers); UI: Inter

Copy rules — banned words: "hedge fund," "index fund," "guaranteed," "passive income." Use: "trustless asset allocation," "non-custodial vault," "validated edge," "transparent strategy."
Mobile floor: 380px width must be usable.

§8 — Environment, secrets, and what lives where
.env keys (all required):

HELIUS_API_KEY — devnet RPC
ANCHOR_WALLET — path to admin keypair (default ~/.config/solana/id.json)
AGENT_KEYPAIR_PATH — path to agent keypair (DIFFERENT FROM ADMIN)
VAULT_PUBKEY — populated after initialize_vault
MOCK_MPC — true for hackathon demo default, false for real Arcium path
TICK_INTERVAL_SEC — agent loop interval (default 60)
MAX_DAILY_TRADES — kill-switch threshold (default 24)

Never committed: .env, any *.json keypair file, anything under target/deploy/*-keypair.json (the program-id keypairs themselves should be committed once the program ID stabilizes, but the upgrade authority keypair never is).
.gitignore essentials: .env, node_modules/, target/, .anchor/, *.log, strategy/data/, frontend/.next/.

§9 — Session etiquette (how I want you to talk to me)

Be direct. I prefer a sharp "this won't work because X" over a hedged "we might consider whether perhaps."
Don't pad. No "Great question!" No "Let me walk you through this comprehensive solution." Just the work.
Ask one question at a time when blocked. Three-question dumps slow me down.
When you finish, give me three lines: what changed, what's verified, what's still open. That's the session summary I want.
If a prompt looks too big for one session, say so up front and propose a split. Don't half-finish silently.
Code blocks for code, prose for everything else. No bullet-point dump unless it's a real list.
I'm comfortable with technical depth — don't over-explain Solana, Rust, or TypeScript fundamentals. Explain Arcium quirks, project-specific decisions, and anything where my context might be wrong.




# SpectraQ — Claude Code CLI Prompt Series

**Goal:** Build SpectraQ end-to-end on Solana devnet — Anchor vault + Arcium MPC + Jupiter API + Next.js frontend — with trading logic ported from `yasharyan0904/trading_python` (MA crossover with MCPT validation discipline).

**How to use this document:** Each section is one Claude Code session. Copy the entire prompt block into Claude Code at your project root. Don't try to compress — Claude Code does best with explicit specs. Run prompts in order; each one builds on the previous one's output.

**Tech baseline assumed in every prompt:**
- Solana CLI 2.3.0, Anchor 0.32.1, Rust 1.79+
- Arcium toolchain (latest via `arcup`), cluster offset 456 (devnet)
- Node 20+, pnpm preferred (npm fine), TypeScript strict mode
- Helius RPC for devnet — store key in `.env` as `HELIUS_API_KEY`
- Wallet: `~/.config/solana/id.json` (your devnet keypair)

**Critical naming convention:** Program is `spectraq_vault`. Mode 1 only for the live demo (USDC/USDT/SOL deposits → SOL trading via MA crossover signals). Mode 2 (multi-asset basket) is scaffolded but uses simulated Jupiter swaps.

**Repo structure target:**
```
spectraq/
├── programs/spectraq_vault/      ← Anchor program (Rust)
├── encrypted-ixs/                ← Arcis MPC circuits (Rust)
├── agent/                        ← TypeScript trading agent
├── strategy/                     ← Python: MA + MCPT validation
├── frontend/                     ← Next.js 14 App Router
├── tests/                        ← Anchor + integration tests
├── scripts/                      ← deploy.sh, faucet.sh, init-mxe.sh
├── Anchor.toml
├── Arcium.toml
└── .env.example
```

---

## Prompt 0 — Repo scaffold & environment sanity check

```
You are setting up the SpectraQ monorepo. This is prompt 0 of a 9-prompt build series — your only job here is scaffolding and verification, not application logic.

CONTEXT:
- SpectraQ is a non-custodial AI trading vault on Solana. Users deposit USDC/USDT/SOL → vault converts to USDC base → AI agent runs MA crossover strategy → trades SOL via Jupiter. Strategy signals computed inside Arcium MPC for front-running resistance.
- Target: Solana devnet, Arcium devnet (cluster offset 456), Jupiter v6 API.
- The non-custodial guarantee is structural: agent pubkey can only call execute_trade and settle_pnl — never withdraw to arbitrary addresses.

TASKS:
1. Create the monorepo directory structure shown below. Use `pnpm` workspaces.
2. Initialize each subproject with its config file ONLY (no application code yet).
3. Write a comprehensive `.env.example` covering all keys we'll need across the build.
4. Write a `scripts/preflight.sh` that verifies: solana --version (>=2.3.0), anchor --version (==0.32.1), arcium --version present, node --version (>=20), rustc, docker running, devnet wallet has >2 SOL, Helius RPC reachable.
5. Write the root `README.md` with the build phases (we'll fill it in as we go), the architecture diagram in ASCII, and the non-custodial invariants list.
6. Write `Anchor.toml` configured for devnet with Helius RPC URL templated from .env.
7. Write `Arcium.toml` with cluster_offset = 456, recovery_set_size = 4.
8. Initialize `programs/spectraq_vault/Cargo.toml` and `encrypted-ixs/Cargo.toml` as empty Anchor/Arcis crates respectively.
9. Initialize `agent/package.json` (TypeScript, ESM, deps: @solana/web3.js, @coral-xyz/anchor, @arcium-hq/client, axios, dotenv, pino).
10. Initialize `frontend/` with `pnpm create next-app` flags: App Router, TypeScript, Tailwind, ESLint, no src dir, default import alias.
11. Initialize `strategy/` with a Python venv, `pyproject.toml`, deps: pandas, numpy, ccxt, matplotlib, numba (we'll port MCPT logic here in prompt 7).

OUTPUT FORMAT:
- Show me the full directory tree after creation (`tree -L 3 -I node_modules`).
- Run `bash scripts/preflight.sh` and paste the output. If anything fails, STOP and tell me which tool is missing — do not try to install it yourself.
- DO NOT write any application logic. Vault, circuit, agent, frontend pages — all empty placeholders only.

CONSTRAINTS:
- No silent assumptions. If you don't know my Helius API key, leave it as a placeholder in .env.example with a comment.
- Use Anchor 0.32.1 EXACTLY — do not bump versions.
- Mark every TODO with `// TODO(spectraq):` so I can grep them later.
```

---

## Prompt 1 — Anchor vault program (Mode 1: shared pool with SPL share tokens)

```
You are implementing the Anchor vault program for SpectraQ. This is the core non-custodial primitive — get this right and everything else follows.

CONTEXT FROM PROMPT 0:
- Repo scaffold exists. `programs/spectraq_vault/Cargo.toml` initialized.
- Anchor 0.32.1, Solana 2.3.0, devnet target.
- Mode 1 is the live demo: pooled multi-asset deposits (USDC, USDT, SOL) all convert to USDC base on deposit; users receive proportional SPL share tokens; agent trades SOL/USDC via MA crossover.

ACCOUNTS TO MODEL:
1. `VaultState` (PDA, seeds = [b"vault", admin.key().as_ref()]):
   - admin: Pubkey
   - agent: Pubkey  ← only this key can execute_trade / settle_pnl
   - usdc_mint: Pubkey
   - sol_mint: Pubkey (Wrapped SOL)
   - share_mint: Pubkey  ← SPL mint for shares; mint authority = vault PDA
   - usdc_vault: Pubkey  ← ATA owned by vault PDA
   - sol_vault: Pubkey   ← ATA owned by vault PDA
   - total_shares: u64
   - usdc_balance: u64   ← cached for quick NAV; reconciled on every state change
   - sol_balance: u64    ← cached
   - last_signal: i8     ← -1 short, 0 flat, 1 long (Mode 1 is long-only per MCPT findings, but field allows future)
   - last_signal_slot: u64
   - signal_state: SignalState  ← enum: Idle, Pending, Ready
   - pending_computation: Option<[u8; 32]>  ← Arcium computation ID
   - bump: u8
   - reserved: [u8; 64]
2. `UserPosition` (PDA, seeds = [b"position", vault.key().as_ref(), user.key().as_ref()]):
   - owner: Pubkey
   - shares: u64                   ← redundant with SPL share token balance, kept for cheap reads
   - cumulative_deposits_usdc: u64 ← for "your cost basis" UI
   - last_deposit_slot: u64
   - bump: u8

INSTRUCTIONS TO IMPLEMENT:
1. `initialize_vault(admin, agent)`: creates VaultState, share_mint (6 decimals to match USDC), and ATAs.
2. `deposit_usdc(amount)`: transfers USDC from user → usdc_vault; mints shares to user proportional to NAV. First deposit is 1:1 (1 USDC = 1 share, scaled by 1e6).
3. `deposit_sol(amount_lamports)`: wraps SOL; FOR PROMPT 1, just credit shares against an oracle SOL/USDC price PASSED IN as an instruction arg `sol_usdc_price_e6` (we'll wire Pyth in prompt 4 — leave a `// TODO(spectraq): replace with Pyth CPI` comment). Validate the price is within sane bounds (10 < price < 1000).
4. `deposit_usdt(amount)`: TODO stub that returns a `Unimplemented` error for now — assumes 1:1 with USDC, we'll add the swap CPI in prompt 5.
5. `withdraw(shares_to_burn)`: burns shares; transfers proportional USDC + SOL to user. The math: user gets `shares_to_burn / total_shares` of each underlying balance. Withdrawal is ALWAYS allowed regardless of signal state — this is the non-custodial guarantee.
6. `request_signal_computation(price_window: [u64; 50])`: only callable by `agent`; flips signal_state to Pending; stores a placeholder computation_id (we'll wire real Arcium queue_computation in prompt 3). Emit `SignalRequested` event.
7. `callback_signal(computation_id, signal: i8)`: ONLY callable by Arcium callback authority (for now, gate on agent — prompt 3 replaces with Arcium auth). Updates last_signal, last_signal_slot, signal_state = Ready.
8. `execute_trade(direction: TradeDirection, amount: u64, min_amount_out: u64)`: only `agent`; CPI to Jupiter is a stub for now (use a placeholder `// TODO(spectraq): Jupiter CPI in prompt 5`). For prompt 1, just decrement source balance and increment dest by `min_amount_out` to simulate. Validate signal_state == Ready and last_signal direction matches the trade. CRUCIAL: validate `amount <= 30% of source balance` (MAX_TRADE_SIZE_BPS = 3000) — this is a structural risk limit.
9. `settle_pnl()`: only `agent`; reconciles usdc_balance and sol_balance against actual ATA balances; emits `PnlSettled` event with realized P&L.

NON-NEGOTIABLE INVARIANTS (write tests for each):
- No instruction transfers USDC/SOL/USDT to any address except (a) the depositor on withdraw, or (b) Jupiter program on execute_trade. Period.
- agent != admin enforcement at initialize_vault (different keys required).
- All math uses checked_mul/checked_div/checked_add/checked_sub. Define a `MathOverflow` error.
- Every state-changing instruction emits an event.

ERROR ENUM: include MathOverflow, Unauthorized, ZeroAmount, ZeroShares, InsufficientShares, InvalidSignalState, TradeSizeExceeded, PriceOutOfBounds, Unimplemented.

EVENTS: VaultInitialized, Deposit, Withdraw, SignalRequested, SignalReceived, TradeExecuted, PnlSettled.

DELIVERABLES:
1. `programs/spectraq_vault/src/lib.rs` (program entrypoint with #[program] mod)
2. `programs/spectraq_vault/src/state.rs` (account structs)
3. `programs/spectraq_vault/src/errors.rs`
4. `programs/spectraq_vault/src/events.rs`
5. `programs/spectraq_vault/src/instructions/` — one file per instruction
6. `tests/01_vault.ts` — Anchor test covering: init → deposit USDC → deposit SOL → request signal → callback → execute trade → settle → withdraw. Use anchor-bankrun if installed, otherwise standard anchor test.

Run `anchor build` and `anchor test --skip-deploy` at the end. Paste full output. If a test fails, debug and fix — do not move on with broken tests.

OUT OF SCOPE for this prompt: Arcium integration, Jupiter CPI, Pyth, frontend, agent. Pure Anchor program + tests only.
```

---

## Prompt 2 — Arcis MPC circuit (MA Crossover signal)

```
You are implementing the Arcis circuit that computes the MA crossover trading signal inside Arcium MPC. This circuit is the privacy core of SpectraQ — strategy parameters and price windows are encrypted, and only the threshold-decrypted signal (-1, 0, or +1) ever returns to the Solana program.

CONTEXT FROM PROMPTS 0-1:
- `encrypted-ixs/` exists with empty Cargo.toml.
- The vault program has `request_signal_computation(price_window: [u64; 50])` and `callback_signal(computation_id, signal: i8)`. We will wire them to Arcium in prompt 3.
- Strategy: MA Crossover with FAST_N=10, SLOW_N=30 (long-only, per MCPT validation findings — short strategies fail OOS permutation tests). Signal: +1 if fast_ma > slow_ma, 0 otherwise. -1 reserved but never returned in Mode 1.

ARCIS CONSTRAINTS — READ CAREFULLY:
- No dynamic loops or dynamic-sized arrays. All loops must be over compile-time constants.
- No dual-branch execution: every branch of a conditional must execute in MPC, then select via mux. This means we use the cross-multiplication trick (avoid division entirely): `fast_sum * SLOW_N > slow_sum * FAST_N` is equivalent to `fast_avg > slow_avg`.
- Output size limit per callback: ~1232 bytes. We're returning a single i8 signal — well within limit, but keep the struct minimal.
- Async callback latency: the vault program must handle a "Pending" state between request and callback. Already done in prompt 1.

CIRCUIT INPUTS:
- `prices: Enc<Shared, [u64; 50]>` — last 50 closing prices (USDC e6 per SOL), encrypted with the user/agent shared key. We use 50 because SLOW_N=30 + 20 lookback buffer for future expansion.
- `params: Enc<Mxe, StrategyParams>` — encrypted strategy parameters: { fast_n: u8, slow_n: u8, threshold_bps: i16 }. Threshold lets us require fast_ma > slow_ma * (1 + threshold_bps/10000) to filter chop. Default 0 for v1.

CIRCUIT OUTPUT: `Enc<Mxe, SignalOutput>` where SignalOutput = { signal: i8 } encrypted under MXE key, then threshold-decrypted by the cluster before callback. The vault program receives plaintext i8.

DELIVERABLES:
1. `encrypted-ixs/Cargo.toml` — proper arcis dependency.
2. `encrypted-ixs/src/lib.rs`:
   - `#[encrypted_ixs] mod` block.
   - `pub struct StrategyParams { fast_n: u8, slow_n: u8, threshold_bps: i16 }` derive Encryptable.
   - `pub struct SignalOutput { signal: i8 }` derive Encryptable.
   - `#[circuit] pub fn compute_ma_signal(prices: Enc<Shared, [u64; 50]>, params: Enc<Mxe, StrategyParams>) -> Enc<Mxe, SignalOutput>`.
   - Implementation:
     a. Decrypt prices into a fixed-size MPC array.
     b. Compute fast_sum = sum of last 10 prices.
     c. Compute slow_sum = sum of last 30 prices.
     d. Apply threshold: `effective_slow = slow_sum * FAST_N * (10000 + threshold_bps) / 10000`. Use saturating arithmetic.
     e. signal = if `fast_sum * SLOW_N > effective_slow` then 1 else 0.
     f. Encrypt and return SignalOutput { signal }.
   - HARDCODE `FAST_N = 10` and `SLOW_N = 30` as `const` for the loop bounds. The struct fields exist for forward compat but are not yet honored at the loop level (loop bounds must be const). Add a doc comment explaining this constraint.
3. A unit test in `encrypted-ixs/tests/test_signal.rs` (or wherever Arcis tests live in current toolchain — check `arcium --help` and Arcis docs) that:
   - Constructs a price series with rising prices (last 10 > earlier 20) → expects signal = 1.
   - Constructs a flat / declining series → expects signal = 0.
4. `arcium build` must succeed. Paste full output.

CRITICAL: After building, run `arcium build` and confirm the circuit binary appears in the build output directory. Note the exact path — we need it in prompt 3 for upload.

OUT OF SCOPE: actually deploying the circuit (prompt 3), wiring vault callback (prompt 3), Python validation (prompt 7).

If you hit Arcis compiler errors about dynamic types or dual-branch execution, STOP and explain the error — do not silently work around it with patterns that won't compile in MPC.
```

---

## Prompt 3 — Wire vault ↔ Arcium (MXE registration, queue_computation, callback)

```
You are wiring the Anchor vault program to Arcium so that `request_signal_computation` actually queues an MPC job and `callback_signal` is gated on the Arcium callback authority.

CONTEXT FROM PROMPTS 0-2:
- Vault program with placeholder Arcium logic (prompt 1).
- Arcis circuit `compute_ma_signal` built (prompt 2).
- Arcium CLI installed, devnet cluster offset 456.

WHAT NEEDS TO HAPPEN:
1. Update `programs/spectraq_vault/Cargo.toml` to depend on `arcium-anchor` (or whatever the current Anchor-Arcium binding crate is — check Arcium docs).
2. In `lib.rs`, declare the computation definition:
   - `#[init_computation_definition_accounts("compute_ma_signal", ...)]` style derive on a new context struct `InitMaSignalCompDef`.
   - New instruction `init_ma_signal_comp_def(ctx: Context<InitMaSignalCompDef>)` that registers the circuit's computation definition account on-chain.
3. Modify `request_signal_computation`:
   - Accept the encrypted price ciphertext + nonce + params ciphertext as instruction args (whatever shape `queue_computation` requires).
   - Build the `queue_computation` CPI with the appropriate accounts (cluster account, MXE account, computation_definition_account, fee payer, etc.).
   - Store the returned computation_id in `vault.pending_computation`.
   - Set vault.signal_state = Pending.
4. Modify `callback_signal`:
   - Annotate with `#[arcium_callback(encrypted_ix = "compute_ma_signal")]`.
   - Validate ctx.accounts.callback_authority is the legitimate Arcium callback PDA (the macro should handle this — confirm in current Arcium docs).
   - Decode the threshold-decrypted SignalOutput from callback data.
   - Update vault.last_signal, vault.last_signal_slot, vault.signal_state = Ready.
   - Clear vault.pending_computation.
   - Emit SignalReceived event.
5. Write `scripts/init-mxe.sh`:
   - `arcium build`
   - `arcium deploy --cluster-offset 456 --recovery-set-size 4 --keypair-path ~/.config/solana/id.json --rpc-url $HELIUS_RPC_URL`
   - `arcium init-mxe --program-id <vault_program_id>` (read from `target/deploy/spectraq_vault-keypair.json`)
   - `arcium upload-circuits --program-id <vault_program_id>`
   - Echo the MXE account address at the end.
6. Write a TypeScript integration test `tests/02_arcium.ts` that:
   - Initializes vault.
   - Calls `init_ma_signal_comp_def`.
   - Encrypts a synthetic rising price series using the Arcium client SDK.
   - Calls `request_signal_computation` with the ciphertext.
   - Polls until signal_state == Ready (with a 60s timeout — Arcium devnet callback latency is variable).
   - Asserts last_signal == 1.
   - Repeats with a flat price series, asserts last_signal == 0.

CRITICAL ORDERING — write this in the README and as a comment in init-mxe.sh:
```
arcium build → arcium deploy → arcium init-mxe → arcium upload-circuits
```
Uploading circuits before MXE registration fails silently. This is the #1 gotcha.

FALLBACK FOR DEV/DEMO: Add a `MOCK_MPC=true` env flag in the agent (we'll use it in prompt 6) — when set, the agent computes the MA signal locally in TypeScript and calls callback_signal directly with the signal. This is the hackathon safety net. Add a corresponding admin-only `mock_callback_signal` instruction GUARDED by `cfg!(feature = "mock-mpc")` so it does not exist in production builds. Add the feature flag to Cargo.toml.

DELIVERABLES:
1. Updated `lib.rs` with real Arcium CPI.
2. `scripts/init-mxe.sh` (with set -e and clear progress messages).
3. `tests/02_arcium.ts`.
4. `mock_callback_signal` instruction behind `mock-mpc` feature.
5. Run `anchor build --features mock-mpc` and confirm both feature combinations compile.
6. Run `bash scripts/init-mxe.sh` against devnet and paste output. If `arcium deploy` fails, paste the exact error — DO NOT retry blindly.

If at any point Arcium SDK shapes have changed from your training data, STOP and tell me which API is unfamiliar. We'll resolve it before continuing.
```

---

## Prompt 4 — Pyth oracle integration & USDC base accounting

```
You are wiring Pyth Network oracles into the vault to replace the placeholder `sol_usdc_price_e6` argument from prompt 1.

CONTEXT FROM PROMPTS 0-3:
- Vault accepts SOL deposits with a price arg passed in by the caller — fragile and trust-requiring.
- Mode 1 needs Pyth's SOL/USD feed for accurate share minting on SOL deposits.
- Mode 2 (we'll scaffold here) needs Pyth feeds for SOL, JUP, PYTH, JTO to compute basket NAV.

DEVNET PYTH FEEDS (verify on https://pyth.network/developers/price-feed-ids before using — these change occasionally):
- SOL/USD on Solana devnet: `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE` (or current — check)
- USDC/USD: `5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7` (or current)
- USDT/USD: `38xoQ4oeJCBrcVvca2cGk7iV1dAfrmTR1kmhSCJQ8Jto` (or current)

Use the `pyth-solana-receiver-sdk` crate for the Pyth Lazer / Push Oracle architecture (current as of 2026 — verify the exact crate name with `cargo search pyth`).

TASKS:
1. Add Pyth dependency to `programs/spectraq_vault/Cargo.toml`.
2. Create `programs/spectraq_vault/src/oracle.rs` with:
   - `pub fn get_price_e6(price_account: &AccountInfo, max_age_seconds: u64) -> Result<u64>`: reads Pyth price update, validates age, validates confidence interval (`conf / price < 1%`), normalizes to e6 fixed point. Reject prices older than `max_age_seconds` (default 60).
   - `pub const PRICE_BOUNDS_SOL_USD: (u64, u64) = (10_000_000, 1_000_000_000);` (10 USDC to 1000 USDC per SOL — sanity bounds).
3. Modify `deposit_sol` to accept a Pyth price account instead of a price argument:
   - Validate the price account address matches the SOL/USD feed (store the expected feed ID in VaultState).
   - Call `get_price_e6` with max_age = 60s.
   - Compute USDC-equivalent value of the SOL deposit and mint shares accordingly.
4. Add `sol_usd_pyth_feed: Pubkey` to VaultState. Initialize it in `initialize_vault`.
5. Add `compute_nav_e6()` helper:
   - NAV = usdc_balance + (sol_balance * sol_usd_price_e6 / 1_000_000_000) [accounting for SOL having 9 decimals vs USDC 6].
   - This is called inside `deposit_sol`, `withdraw`, and `settle_pnl`.
6. Mode 2 scaffolding — add (but DO NOT activate yet) a `BasketState` account and a `mode2_compute_nav` view function that reads multiple Pyth feeds. Mark it `// TODO(spectraq): activate in v2` and add a feature flag `mode-2`.

TESTS (`tests/03_oracle.ts`):
- Mock a Pyth account (use `pyth-solana-receiver-sdk` test utilities or write a minimal mock) at $150/SOL → deposit 1 SOL → assert ~150 shares minted.
- Stale price (>60s old) → assert `PriceStale` error.
- Out-of-bounds price ($5000/SOL) → assert `PriceOutOfBounds`.
- Wrong feed account → assert `InvalidPythFeed`.

DELIVERABLES:
1. `programs/spectraq_vault/src/oracle.rs`.
2. Updated `state.rs`, `instructions/initialize_vault.rs`, `instructions/deposit_sol.rs`.
3. New errors: PriceStale, PriceOutOfBounds, InvalidPythFeed, PythReadError.
4. `tests/03_oracle.ts` passing.
5. `anchor build && anchor test --skip-deploy` clean.

OUT OF SCOPE: Mode 2 activation, Jupiter swap on USDT deposits (prompt 5).

If `pyth-solana-receiver-sdk` API has shifted, STOP and report. Do not invent function signatures.
```

---

## Prompt 5 — Jupiter integration (deposit conversion + execute_trade real CPI)

```
You are replacing the simulated swap stubs with real Jupiter v6 swap CPIs. Two integration points:
1. USDT deposit → swap to USDC inside the deposit instruction (Mode 1: USDC base).
2. execute_trade → real Jupiter swap of USDC↔SOL based on the MA signal.

CONTEXT FROM PROMPTS 0-4:
- Vault has working Pyth-based NAV.
- `execute_trade` and `deposit_usdt` are stubs.
- Jupiter v6 supports both API-first (off-chain quote, on-chain swap) and pure on-chain CPI. We use the API-first pattern: agent fetches quote off-chain, builds the swap transaction, and the vault validates+executes.

JUPITER ARCHITECTURE FOR NON-CUSTODIAL VAULTS:
- The agent calls `https://quote-api.jup.ag/v6/quote` to get a route.
- Agent calls `https://quote-api.jup.ag/v6/swap-instructions` (NOT the full transaction endpoint — we need raw instructions to inject into our vault PDA's signed transaction).
- Vault program has an `execute_trade` instruction that:
  - Validates direction matches signal.
  - Validates trade size <= 30% NAV.
  - Validates min_amount_out is reasonable (within X% of an oracle-derived expected_amount_out).
  - Invokes Jupiter via remaining_accounts CPI pattern.

CRITICAL SECURITY: The vault PDA signs the swap. The destination of the swap output MUST be the vault's own ATA — never an arbitrary address. Validate this in the instruction by deriving the expected destination ATA and comparing to the Jupiter instruction's account list.

TASKS:
1. Add Jupiter program ID constant: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` (verify on Jupiter docs — IDs sometimes update).
2. Modify `execute_trade` in `programs/spectraq_vault/src/instructions/execute_trade.rs`:
   - Args: direction (Long/Short/Flat), amount_in, min_amount_out, jupiter_route_data: Vec<u8>, AND remaining_accounts containing all Jupiter route accounts.
   - Validate signal_state == Ready.
   - Validate direction matches last_signal.
   - Validate amount_in <= 30% of source ATA balance (read directly from token account, not cached).
   - Validate min_amount_out >= expected_oracle_amount * 95 / 100 (5% slippage cap derived from Pyth — NOT user-supplied alone).
   - Derive expected destination ATA (vault PDA's USDC or SOL ATA depending on direction).
   - Walk through remaining_accounts and confirm the destination_token_account passed to Jupiter equals the expected vault ATA. If not, FAIL.
   - Invoke Jupiter via `solana_program::program::invoke_signed` with the vault PDA's seeds.
   - Read both ATA balances after the swap. Compute realized P&L and emit TradeExecuted event.
3. Modify `deposit_usdt`:
   - Accept Jupiter route accounts via remaining_accounts.
   - Swap the deposited USDT → USDC into the vault's USDC ATA.
   - Mint shares based on USDC received (NOT the USDT amount — slippage-realistic).
4. Build `agent/src/jupiter.ts`:
   - `getQuote(inputMint, outputMint, amount, slippageBps)` → calls Jupiter v6 quote API.
   - `getSwapInstructions(quote, userPublicKey)` → calls v6 swap-instructions API.
   - `parseRouteAccounts(swapInstructions)` → returns the AccountMeta[] for remaining_accounts.
   - Use the shared types from `@jup-ag/api` package if it's still maintained, otherwise fetch and parse the OpenAPI spec yourself.
5. Tests `tests/04_jupiter.ts`:
   - Use a Jupiter swap simulator OR run against actual devnet (Jupiter v6 has limited devnet liquidity — note this in the test). If devnet liquidity is insufficient, write the test as a localnet fork using `solana-test-validator --clone <jupiter program> --clone-upgradeable-program <jupiter>`.
   - Test: deposit USDT → assert USDC balance increases proportionally.
   - Test: signal = 1 (long) → execute_trade USDC→SOL → assert sol_balance increases.
   - Test: malicious destination ATA → assert InvalidSwapDestination error.
   - Test: amount > 30% → assert TradeSizeExceeded.

DELIVERABLES:
1. Updated execute_trade and deposit_usdt instructions.
2. `agent/src/jupiter.ts`.
3. `tests/04_jupiter.ts`.
4. New errors: InvalidSwapDestination, SlippageExceeded, JupiterCpiFailed.
5. `anchor build && anchor test` clean (or documented localnet workaround if devnet liquidity blocks).

NOTE ON DEVNET LIQUIDITY: Jupiter on devnet is sparse. Document clearly in the README that the demo will run against mainnet-fork localnet for the swap path, while the vault and Arcium components run on actual devnet. This is a normal hackathon trade-off.
```

---

## Prompt 6 — Trading agent (TypeScript orchestrator with MOCK_MPC fallback)

```
You are building the off-chain TypeScript agent that orchestrates the full trade loop: fetch prices → encrypt → submit to Arcium (or compute locally if MOCK_MPC=true) → wait for signal → execute Jupiter trade → settle P&L.

CONTEXT FROM PROMPTS 0-5:
- Vault, Arcis circuit, Pyth, Jupiter all wired.
- agent/ package initialized in prompt 0.
- Mode 1 is SOL/USDC trading on the MA crossover signal.

AGENT ARCHITECTURE:
```
┌─────────────────────────────────────────────────┐
│              agent/src/index.ts                  │
│                  main loop                       │
│                                                  │
│  every TICK_INTERVAL (default 60s):             │
│    1. priceFeed.getRecentPrices(50) ────────────┼──→ Helius RPC (Pyth) or Binance fallback
│    2. arcium.requestSignal(prices) ─────────────┼──→ vault.request_signal_computation
│    3. await signalState == Ready                │
│    4. if signal != lastSignal:                  │
│         jupiter.executeTrade(direction) ────────┼──→ vault.execute_trade
│    5. vault.settle_pnl()                        │
│    6. log + emit metrics                        │
└─────────────────────────────────────────────────┘
```

DELIVERABLES — create these files:
1. `agent/src/config.ts`: typed config from env. Required: HELIUS_API_KEY, AGENT_KEYPAIR_PATH, VAULT_PUBKEY, MOCK_MPC (bool), TICK_INTERVAL_SEC, MAX_DAILY_TRADES (default 24, kill-switch).
2. `agent/src/priceFeed.ts`:
   - Primary source: Pyth price account history (read recent updates from Helius). 
   - Fallback: Binance public REST `/api/v3/klines` for SOLUSDT 1m candles.
   - Returns a `number[]` of 50 close prices in USDC e6 fixed point. ALWAYS validates length == 50, no NaN, monotonic timestamps.
3. `agent/src/arcium.ts`:
   - `requestSignal(prices: number[]): Promise<{ computationId: string }>`: encrypts price array using Arcium client SDK (current API), calls vault.request_signal_computation.
   - `awaitSignal(timeoutMs: number): Promise<-1 | 0 | 1>`: polls vault.signal_state until Ready, returns last_signal.
   - `mockComputeSignal(prices: number[]): -1 | 0 | 1`: pure TypeScript MA crossover (FAST_N=10, SLOW_N=30, long-only). Used when MOCK_MPC=true; calls vault.mock_callback_signal directly.
4. `agent/src/trader.ts`:
   - `decideTrade(signal: number, currentPosition: 'usdc' | 'sol'): TradeAction | null`. Returns null if signal already matches position (no churn).
   - `executeTrade(action: TradeAction)`: calls jupiter.getQuote → getSwapInstructions → vault.execute_trade. Handles failures with exponential backoff, max 3 retries, then circuit-breaker.
5. `agent/src/index.ts`: main loop with graceful shutdown (SIGINT/SIGTERM), structured logging via pino, per-tick metrics emission.
6. `agent/src/metrics.ts`: Prometheus-compatible counter/gauge stubs (signal_received_total, trades_executed_total, vault_nav_usdc, agent_errors_total). For the hackathon, just log them; we can wire to Grafana later.
7. `agent/src/safety.ts`:
   - Kill-switch: if more than MAX_DAILY_TRADES in 24h, refuse new trades.
   - NAV floor: if vault NAV < 50% of all-time-high, log WARN and refuse new trades (manual override env var to resume).
   - Pyth staleness: if price age > 60s, skip the tick.
8. `agent/test/agent.test.ts`: vitest tests for `mockComputeSignal` (rising series → 1, flat → 0, declining → 0) and `decideTrade` (no-churn behavior).
9. `agent/README.md`: how to run, env vars, the kill-switch behavior, MOCK_MPC explanation.

RUN TWO MODES TO VERIFY:
A. MOCK_MPC=true: agent should compute signal in TS, submit mock callback, execute trade. End-to-end loop with no Arcium dependency.
B. MOCK_MPC=false: agent submits to real Arcium, waits for callback, executes trade.

Both modes should produce IDENTICAL on-chain effects on the vault (same trades, same NAV updates). The only difference is who computes the signal.

After implementing, run mode A end-to-end on devnet for 5 ticks (5 minutes) and paste the structured logs. If mode B works on devnet, run that too — but mode A is the must-have for demo reliability.

CRITICAL: NEVER log private keys. NEVER write the agent keypair to disk in any temp/log file. Use `pino-redact` to strip secret-looking strings from logs.
```

---

## Prompt 7 — Python strategy & MCPT validation suite (port from trading_python)

```
You are porting the trading_python repo's MA crossover strategy and MCPT validation pipeline into the SpectraQ `strategy/` directory. The output of this prompt is NOT used at runtime — it's the offline validation that justifies the live strategy parameters. Without MCPT validation, the strategy is curve-fit and shouldn't ship.

CONTEXT FROM PROMPTS 0-6:
- `strategy/` directory exists with Python venv (prompt 0).
- The agent runs MA(10, 30) long-only. We need to PROVE this strategy survives the four-stage MCPT framework before claiming it's a real edge in the demo.
- Reference repo: github.com/yasharyan0904/trading_python (your own — port the structure, don't reinvent).

THE FOUR-STAGE MCPT FRAMEWORK (port from your existing repo):
1. **In-Sample Excellence (IS)**: optimize MA params on training data. Confirm the best params produce a positive Sharpe.
2. **In-Sample Permutation Test**: shuffle the price series many times (default 1000), re-optimize on each shuffle, confirm the real Sharpe lies in the right tail of the permuted distribution. p-value < 0.05 is acceptance.
3. **Walk-Forward (WF)**: rolling re-optimization on out-of-sample windows. Confirm OOS Sharpe is positive (expect ~10% of IS — the famous "OOS degradation").
4. **Walk-Forward Permutation**: permute, then walk-forward. The real WF Sharpe must beat 95% of permuted WF Sharpes.

DELIVERABLES:
1. `strategy/spectraq_strategy/data.py`:
   - `fetch_sol_usdc_ohlcv(start: str, end: str, timeframe: str = "1h") -> pd.DataFrame` using ccxt against Binance (proxy for SOL/USDC behavior, much deeper history than on-chain).
   - Cache to `strategy/data/sol_usdc_1h.parquet`.
2. `strategy/spectraq_strategy/ma_strategy.py`:
   - `def ma_signal(closes: np.ndarray, fast_n: int, slow_n: int) -> np.ndarray`: returns array of {0, 1} (long-only). Numba-jitted for speed.
   - `def backtest(closes: np.ndarray, signals: np.ndarray, fee_bps: float = 10.0) -> dict`: returns sharpe, total_return, max_dd, num_trades.
3. `strategy/spectraq_strategy/permutation.py`:
   - `def permute_ohlc(ohlc: pd.DataFrame, seed: int) -> pd.DataFrame`: log-return permutation that preserves OHLC structure (shuffle log returns, reconstruct close, regenerate OHLC with original noise). Port the exact implementation from your trading_python repo if present.
4. `strategy/spectraq_strategy/mcpt.py`:
   - `def is_permutation_test(ohlc, fast_range, slow_range, n_permutations=1000)`: returns p-value, real Sharpe, permuted Sharpe distribution.
   - `def walk_forward(ohlc, train_window=2000, test_window=500, fast_range, slow_range)`: returns concatenated OOS equity curve.
   - `def wf_permutation_test(ohlc, n_permutations=200, **wf_params)`: returns p-value.
5. `strategy/notebooks/01_validate_ma_crossover.ipynb`: runs all four stages on SOL/USDC 1h data from 2022-01-01 to 2026-01-01. Splits IS = 2022-2024, OOS = 2024-2026. Outputs:
   - Best (fast_n, slow_n) on IS.
   - IS Sharpe + p-value.
   - WF equity curve plot.
   - WF p-value.
   - Final verdict: SHIP / NO SHIP.
6. `strategy/scripts/export_params.py`: writes the validated params to `agent/config/strategy_params.json` so the agent can read them. JSON shape: `{ "fast_n": 10, "slow_n": 30, "validation": { "is_pvalue": ..., "wf_pvalue": ..., "is_sharpe": ..., "wf_sharpe": ..., "validated_at": "ISO-8601" } }`.
7. `strategy/README.md`: explains the four-stage framework, the curve-fitting risks, and why short strategies were rejected (port the explanation from your prior MCPT findings — long-only survives, short-only consistently fails OOS).

RUN THE NOTEBOOK END-TO-END and paste:
- The IS-best (fast_n, slow_n).
- All four p-values.
- The verdict.
- A note on what to do if WF p-value > 0.05 (fall back to a simpler buy-and-hold baseline OR retune; the README must address this).

EXPECT: with 4 years of SOL data, MA(10, 30) long-only is plausible but not guaranteed to pass WF permutation. If it fails, BE HONEST in the verdict — do not fudge p-values to reach a "ship" outcome. The integrity of the validation IS the differentiator.

OUT OF SCOPE: live strategy switching, GA candlestick patterns (those have dynamic-array constraints incompatible with Arcis circuits — keep as future work).
```

---

## Prompt 8 — Next.js frontend (dashboard + deposit/withdraw + trade history)

```
You are building the Next.js 14 App Router frontend for SpectraQ, inspired by the design language at spectraq.org. This is the user-facing surface — make it feel like a serious DeFi product, not a hackathon submission.

CONTEXT FROM PROMPTS 0-7:
- frontend/ scaffolded with Next.js 14, App Router, Tailwind, TypeScript (prompt 0).
- Vault is live on devnet with full deposit/withdraw/trade lifecycle.
- Strategy params validated in prompt 7 (read from `agent/config/strategy_params.json`).

DESIGN INSPIRATION: spectraq.org. Dark theme, monospace accent fonts for numbers, sharp typography, generous whitespace. Avoid neumorphism, avoid glassmorphism overuse. Think Linear meets Bloomberg Terminal.

PAGES & ROUTES:
1. `/` — Landing page:
   - Hero: tagline "Trustless asset allocation. Programmatically enforced."
   - Three cards: "Non-custodial by program," "AI signals via MPC," "Audited validation suite."
   - "Launch app" CTA → /app.
2. `/app` — Main dashboard (wallet-connected):
   - Top bar: vault NAV (USDC), 24h change, total shares, "your shares" + "your equity."
   - Center: NAV chart (last 30 days) using recharts. Pull from on-chain events via Helius webhooks OR poll for the demo.
   - Signal panel: current signal (LONG / FLAT), last computed slot, "Pending" pulse during MPC compute.
   - Position breakdown: USDC balance, SOL balance (USD value).
   - Recent trades table: timestamp, direction, size, P&L, tx link.
3. `/app/deposit` — Deposit flow:
   - Asset selector: USDC / USDT / SOL (radio cards).
   - Amount input with max button.
   - Live preview: "You will receive ~X shares" computed against current NAV.
   - "Approve and deposit" button — handles ATA creation, approval, deposit instruction.
   - Transaction status modal: pending → confirmed → success with tx link.
4. `/app/withdraw` — Withdraw flow:
   - "Your shares: X" display.
   - Slider 0–100% of shares to burn.
   - Live preview: "You will receive ~A USDC and ~B SOL".
   - "Withdraw" button.
5. `/strategy` — Public strategy transparency page:
   - Read `strategy_params.json` (commit it to the frontend public dir or expose via API route).
   - Display the four MCPT p-values, the validation date, the IS/OOS Sharpe.
   - Equity curve from the validation backtest (ship the PNG from prompt 7 to /public/strategy/wf_equity.png).
6. `/api/vault` — Server route:
   - Returns vault state (NAV, total shares, current signal) cached for 5s.
   - Reads via @coral-xyz/anchor from devnet using server-only RPC URL.
7. `/api/trades?limit=N` — server route returning recent TradeExecuted events.

WALLET INTEGRATION:
- Use `@solana/wallet-adapter-react` + `@solana/wallet-adapter-react-ui`.
- Support: Phantom, Backpack, Solflare. Default to autoConnect = true.
- WalletContext in `app/providers.tsx` (client component) wrapping the entire tree.

STATE MANAGEMENT:
- Server components for static content.
- `@tanstack/react-query` for vault state with 5s refetch.
- Mutation hooks for deposit/withdraw/trade calls — optimistic updates with rollback on tx failure.

DESIGN TOKENS (commit these to `tailwind.config.ts`):
- Background: `#0A0A0F` (near-black with cool tint)
- Surface: `#13131A`
- Border: `#1F1F2A`
- Primary text: `#F5F5F7`
- Muted text: `#8A8A99`
- Accent (positive): `#3DDC84`
- Accent (negative): `#FF5151`
- Brand: a single blue-violet, e.g. `#6E5BFF`
- Mono font: JetBrains Mono for numbers, Inter for UI text.

DELIVERABLES:
1. All routes above implemented.
2. `frontend/lib/anchor.ts`: program client setup, IDL imported from `target/idl/spectraq_vault.json`.
3. `frontend/lib/hooks/useVaultState.ts`, `useUserPosition.ts`, `useDeposit.ts`, `useWithdraw.ts`.
4. `frontend/components/`: NavChart, SignalPanel, PositionBreakdown, TradesTable, DepositForm, WithdrawForm, TxStatusModal.
5. Mobile responsiveness: works at 380px width minimum.
6. Run `pnpm build` and confirm clean build.
7. Run `pnpm dev` and screenshot the dashboard with the wallet connected — paste the path of the screenshot file.

COPY GUIDELINES (from prior memory — do NOT use):
- "Hedge fund" — banned. Use "trustless asset allocation protocol."
- "Index fund" — banned. Use "strategy vault" or "non-custodial vault."
- "Guaranteed returns" — never.
- DO use: "non-custodial by program," "validated edge," "transparent strategy."

OUT OF SCOPE: admin panel, multi-vault selector, leaderboard, social features. Single vault, single user perspective.
```

---

## Prompt 9 — End-to-end devnet demo & README polish

```
You are doing the final integration pass. Everything is built; this prompt's job is to wire it all together for a clean live demo and produce documentation a hackathon judge can follow in 5 minutes.

CONTEXT: prompts 0-8 complete. Vault, Arcium circuit + integration, Pyth, Jupiter, agent, Python validation, frontend all individually working.

TASKS:
1. Write `scripts/demo.sh`:
   ```
   #!/usr/bin/env bash
   set -euo pipefail
   # 1. Preflight (calls scripts/preflight.sh)
   # 2. anchor build && anchor deploy --provider.cluster devnet
   # 3. bash scripts/init-mxe.sh
   # 4. ts-node scripts/initialize_vault.ts  (reads admin/agent keys, calls initialize_vault)
   # 5. ts-node scripts/seed_demo_funds.ts   (deposits 100 USDC + 1 SOL from a demo user keypair)
   # 6. Start agent: MOCK_MPC=true pnpm --filter agent start &
   # 7. Start frontend: pnpm --filter frontend dev &
   # 8. Echo the URLs and the vault pubkey.
   ```
2. Write `scripts/initialize_vault.ts` and `scripts/seed_demo_funds.ts`.
3. Update root `README.md`:
   - Architecture diagram (ASCII or mermaid — both ok).
   - 5-minute Quick Start: clone → bash scripts/demo.sh → open localhost:3000.
   - The non-custodial invariant list (with code references).
   - The four-stage MCPT validation summary with p-values from prompt 7.
   - Known limitations: Jupiter devnet liquidity, Arcium devnet callback latency, MOCK_MPC for reliable demo.
   - Roadmap: Mode 2 (basket), GA candlestick (with bigger Arcis circuit budget), mainnet beta.
4. Record a 3-minute Loom-script (text outline only — you don't actually record): exactly which screens to show, in what order, what to say at each step. Save as `DEMO_SCRIPT.md`.
5. Run `bash scripts/demo.sh` end-to-end on devnet and capture:
   - Full stdout to `logs/demo_run_$(date +%s).log`.
   - Screenshot the frontend after a trade has executed.
   - The Solana Explorer link to the vault account.
   - The Solana Explorer link to one TradeExecuted transaction.
6. Polish: ensure every TODO(spectraq) is either resolved or moved to ROADMAP.md with justification.
7. Final security checklist (paste in README under SECURITY.md):
   - [ ] No instruction transfers funds to non-vault, non-depositor addresses.
   - [ ] All math is checked.
   - [ ] Agent key is logically separated from admin key.
   - [ ] Pyth staleness validated on every read.
   - [ ] Trade size capped at 30% NAV.
   - [ ] Slippage capped at 5% from oracle.
   - [ ] Withdrawal works regardless of signal state, agent state, or pending computations.
   - [ ] No upgrade authority footgun: document who holds program upgrade authority and how to renounce.

Confirm everything works by running the demo script start-to-finish. If MOCK_MPC=true gets you to a clean demo and MOCK_MPC=false has flakes due to Arcium devnet latency, that's acceptable — document it explicitly.

PASTE: the final demo log, the explorer link, and the screenshot path.
```

---

## How to actually run this in Claude Code

1. **One prompt = one Claude Code session.** Don't try to chain. Each prompt is sized to fit in a long context window with room for the agent to read existing files, write new ones, and run tests.

2. **Always start each session with:** `cd ~/spectraq` then paste the prompt. Claude Code will discover the existing files via its own tools.

3. **Don't skip prompt 0.** The preflight check catches the "wrong Anchor version" / "Docker not running" failures that waste 90 minutes of debugging downstream.

4. **Prompts 2 and 3 are the highest-risk.** Arcium SDK shapes change between versions. If Claude Code's training data is older than the current Arcium release, it'll write wrong macro signatures. The instruction "STOP and tell me which API is unfamiliar" is your circuit breaker — don't let it bash through with hallucinated APIs.

5. **MOCK_MPC=true is your demo insurance.** Build mode A first (prompt 6), get a clean end-to-end run on devnet with mocked signals, THEN attempt mode B with real Arcium. If real Arcium flakes during the live demo, flip the env var and ship.

6. **Prompt 7 is the integrity gate.** If the four-stage MCPT comes back with WF p > 0.05, the honest move is to disclose it and either retune or pivot to "validated framework" as the IP rather than claiming a live edge. Judges respect that more than dressed-up curve-fits.

7. **Frontend (prompt 8) can be done in parallel** with prompts 5-6 if you have a teammate. The IDL it imports stabilizes after prompt 4.


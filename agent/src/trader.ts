// Trader module — bridges signal → vault.execute_trade.
//
//   decideTrade  : pure function. Returns null when the signal already
//                  matches the current vault position (no-churn).
//   executeTrade : Raydium CPMM quote → swap ix → execute_trade CPI.
//                  Wraps everything in exponential-backoff retries with a
//                  3-attempt circuit-breaker; raises a typed error on
//                  permanent failure so the main loop can warn-and-skip.
//
// `min_amount_out` derivation — the program enforces *two* checks the
// agent must satisfy simultaneously:
//   (a) on-chain Pyth floor in execute_trade.rs:154,
//         min_amount_out >= pyth_expected_out × (1 − MAX_SLIPPAGE_BPS/10000)
//   (b) Raydium's own swap_base_input,
//         realized_out >= min_amount_out
// Setting `min_amount_out = quote × (1 − slip)` alone fails (a) whenever
// the pool drifts even mildly off Pyth. So we read the on-chain Pyth
// price ourselves, compute the same floor the program will apply, and
// clamp `min_amount_out = max(quote × (1 − slip), pyth_floor)`. If the
// pool can't deliver the floor, Raydium fails (b) which is the *correct*
// outcome (don't trade against a stale pool).
//
// Position model:
//   - "usdc": the vault is currently mostly USDC (e6 balance > 0,
//             sol balance ≈ 0).
//   - "sol":  the vault is currently mostly SOL (lamports balance > 0,
//             usdc balance ≈ 0).
//   - "split": the vault is mid-rebalance (both balances non-trivial).
//             We treat split as USDC-leaning for trade-decision purposes
//             so the next signal=1 is suppressed and the next signal=0
//             completes the unwind.
//
// We deliberately do NOT use the cached `vault_state.usdc_balance` —
// instead we read live ATA balances via getTokenAccountBalance. The vault
// program does the same on-chain (live cap on amount_in).

import { setTimeout as delay } from "node:timers/promises";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import anchor from "@coral-xyz/anchor";
import { quoteAndBuildSwap, type RaydiumPoolConfig } from "./raydium.js";
import type { Signal } from "./arcium.js";

const { BN } = anchor;

// Mirrors `MAX_SLIPPAGE_BPS` in programs/spectraq_vault/src/constants.rs
// (devnet = 1000bps / 10%; mainnet target = 500bps). Used to compute the
// same floor the on-chain program applies to min_amount_out.
const ONCHAIN_MAX_SLIPPAGE_BPS = 1000n;
const LAMPORTS_PER_SOL_U128 = 1_000_000_000n;

// PriceUpdateV2 layout (see safety.ts for the full breakdown):
//   8 disc + 32 write_authority + 1 verify_level + 32 feed_id = 73
//   price (i64 LE) at 73, conf at 81, exponent (i32 LE) at 89.
const PRICE_UPDATE_PRICE_OFFSET = 73;
const PRICE_UPDATE_EXPONENT_OFFSET = 89;

/**
 * Read the SOL/USD price from a Pyth `PriceUpdateV2` account and return it
 * in USDC e6 fixed point — same scale the on-chain program uses in
 * `oracle::get_price_e6`. Throws if the price is non-positive (the agent
 * caller treats this as a skip).
 */
async function readPythSolUsdE6(
  connection: Connection,
  feedAccount: PublicKey,
): Promise<bigint> {
  const acc = await connection.getAccountInfo(feedAccount, "confirmed");
  if (!acc) throw new Error(`pyth feed account ${feedAccount.toBase58()} not found`);
  if (acc.data.length < PRICE_UPDATE_EXPONENT_OFFSET + 4) {
    throw new Error(`pyth feed account too small: ${acc.data.length} bytes`);
  }
  const buf = Buffer.from(acc.data);
  const priceLo = BigInt(buf.readUInt32LE(PRICE_UPDATE_PRICE_OFFSET));
  const priceHi = BigInt(buf.readInt32LE(PRICE_UPDATE_PRICE_OFFSET + 4));
  const price = (priceHi << 32n) | priceLo;
  const exponent = buf.readInt32LE(PRICE_UPDATE_EXPONENT_OFFSET);
  // result_e6 = price × 10^(exponent + 6).
  const shift = exponent + 6;
  const e6 = shift >= 0
    ? price * 10n ** BigInt(shift)
    : price / 10n ** BigInt(-shift);
  if (e6 <= 0n) throw new Error(`pyth price non-positive: ${e6}`);
  return e6;
}

export type Position = "usdc" | "sol" | "split";

export interface TradeAction {
  /** Vault-state enum payload, e.g. `{ usdcToSol: {} }`. */
  direction: { usdcToSol: {} } | { solToUsdc: {} };
  /** Atomic units (e6 USDC or lamports). */
  amountIn: bigint;
  /** Slippage bps the agent applies to the off-chain CPMM quote when
   * computing min_amount_out. The on-chain Pyth slippage cap is the
   * ultimate safety net (5%). */
  slippageBps: number;
  /** Human label for logs. */
  label: string;
}

export interface TraderDeps {
  program: anchor.Program<any>;
  connection: Connection;
  agent: Keypair;
  vaultPda: PublicKey;
  usdcMint: PublicKey;
  wsolMint: PublicKey;
  pythSolUsdFeed: PublicKey;
  /** Raydium CPMM pool the agent routes every swap through. */
  raydiumPool: RaydiumPoolConfig;
}

// ---------------------------------------------------------------------------
// decideTrade
// ---------------------------------------------------------------------------

/**
 * Decide what (if anything) to trade given the freshly-stamped signal and
 * the current vault balances. Returns null on no-churn.
 *
 * Mode 1 long-only mapping (tristate {-1, 0, 1} matches on-chain
 * `vault.last_signal: i8` and execute_trade.rs:99-104):
 *   signal=1  + usdcE6 > 0       → swap 30% USDC → SOL (taper long).
 *   signal=-1 + solLamports > 0  → swap 30% SOL  → USDC (taper flat).
 *   signal=0                     → hold (no trade).
 *   no source-side balance       → null (nothing to swap).
 *
 * `amountIn` defaults to `TRADE_SIZE_BPS` of the source-side balance.
 * The vault program enforces a 30% structural cap (`MAX_TRADE_SIZE_BPS`);
 * the agent voluntarily uses a smaller fraction (10%) so CPMM price
 * impact + slippage stays under the on-chain Pyth 5% floor on devnet's
 * thin pool. Override via `amountInOverride` to taper differently.
 *
 * The classifier returned by readVaultBalances is informational only
 * (logging/metrics); we drive the decision off live balances so a 50/50
 * split doesn't lock the agent into permanent no-churn.
 */
export function decideTrade(
  signal: Signal,
  _position: Position,
  balances: { usdcE6: bigint; solLamports: bigint },
  opts: { slippageBps?: number; amountInOverride?: bigint } = {},
): TradeAction | null {
  // Slippage tolerance on the off-chain CPMM quote — defines the lower
  // bound of `min_amount_out` *relative to the Raydium quote*. We then
  // separately clamp `min_amount_out` up to the on-chain Pyth floor
  // (executeTrade below). 700bps absorbs the ~5% CurveCalculator-vs-
  // on-chain delivery drift on devnet (Raydium's devnet AmmConfig has
  // creator/fund fee fields that diverge from `getCpmmConfigs()` mainnet
  // values, so our off-chain quote routinely overshoots reality by a
  // few %). The Pyth floor still bites when the pool is mispriced, so
  // a wide quote-relative tolerance does NOT relax the oracle defense.
  // Mainnet tightens this back to ~100bps.
  const slippageBps = opts.slippageBps ?? 700;
  // Voluntary cap below the on-chain MAX_TRADE_SIZE_BPS=3000 (30%).
  // Smaller trades take more ticks to taper but reliably land under the
  // Pyth floor on the thin devnet pool.
  const tenPct = (x: bigint) => (x * 1000n) / 10_000n;

  if (signal === 1) {
    const amountIn = opts.amountInOverride ?? tenPct(balances.usdcE6);
    if (amountIn <= 0n) return null;
    return {
      direction: { usdcToSol: {} },
      amountIn,
      slippageBps,
      label: "long_open",
    };
  }
  if (signal === -1) {
    const amountIn = opts.amountInOverride ?? tenPct(balances.solLamports);
    if (amountIn <= 0n) return null;
    return {
      direction: { solToUsdc: {} },
      amountIn,
      slippageBps,
      label: "long_close",
    };
  }
  return null; // signal === 0 → hold
}

// ---------------------------------------------------------------------------
// Position / balance helpers
// ---------------------------------------------------------------------------

export async function readVaultBalances(
  deps: TraderDeps,
): Promise<{ usdcE6: bigint; solLamports: bigint; position: Position }> {
  const usdcAta = getAssociatedTokenAddressSync(deps.usdcMint, deps.vaultPda, true);
  const solAta = getAssociatedTokenAddressSync(deps.wsolMint, deps.vaultPda, true);
  const [usdcAcc, solAcc] = await Promise.all([
    getAccount(deps.connection, usdcAta).catch(() => null),
    getAccount(deps.connection, solAta).catch(() => null),
  ]);
  const usdcE6 = usdcAcc ? BigInt(usdcAcc.amount.toString()) : 0n;
  const solLamports = solAcc ? BigInt(solAcc.amount.toString()) : 0n;

  // Crude "is the vault mostly USDC vs SOL" classifier. Convert SOL to
  // USDC at a flat $100 reference (exact value doesn't matter — we only
  // need a coarse split/usdc/sol classifier). Both sides expressed in e6
  // USDC units so the comparison is apples-to-apples.
  // solInUsdcE6 = solLamports * 100 USD/SOL * 1e6 e6/USD / 1e9 lamports/SOL
  //             = solLamports / 10
  const solInUsdcE6Ref = solLamports / 10n;
  let position: Position;
  if (usdcE6 > solInUsdcE6Ref * 10n) position = "usdc";
  else if (solInUsdcE6Ref > usdcE6 * 10n) position = "sol";
  else position = "split";

  return { usdcE6, solLamports, position };
}

// ---------------------------------------------------------------------------
// executeTrade
// ---------------------------------------------------------------------------

export class TradeError extends Error {
  constructor(msg: string, public readonly cause?: unknown) {
    super(msg);
  }
}

interface ExecuteOptions {
  /** Max attempts before giving up. Default 3. */
  maxRetries?: number;
  /** Initial backoff in ms. Doubles each retry. Default 1500. */
  baseBackoffMs?: number;
}

/**
 * Quote → build → submit. Three attempts with exponential backoff. Throws
 * `TradeError` on permanent failure (caller surfaces it, runs the kill-
 * switch, and continues to the next tick).
 */
export async function executeTrade(
  deps: TraderDeps,
  action: TradeAction,
  opts: ExecuteOptions = {},
): Promise<{ signature: string; realizedOut: bigint }> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseBackoff = opts.baseBackoffMs ?? 1500;

  // Map direction → (inputMint, outputMint, expectedDestAta)
  const directionIsUsdcToSol = (action.direction as any).usdcToSol !== undefined;
  const inputMint = directionIsUsdcToSol ? deps.usdcMint : deps.wsolMint;
  const outputMint = directionIsUsdcToSol ? deps.wsolMint : deps.usdcMint;
  const expectedDestAta = getAssociatedTokenAddressSync(
    outputMint,
    deps.vaultPda,
    true,
  );

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Re-quote on each retry — pool reserves shift between ticks.
      const route = await quoteAndBuildSwap({
        connection: deps.connection,
        pool: deps.raydiumPool,
        inputMint,
        outputMint,
        amount: action.amountIn,
        slippageBps: action.slippageBps,
        vaultPda: deps.vaultPda,
        expectedDestinationAta: expectedDestAta,
      });

      // Conservative min_amount_out — must satisfy *both* checks:
      //   (a) on-chain Pyth floor: min_amount_out ≥ pyth_expected × 0.90
      //   (b) Raydium swap:        realized_out ≥ min_amount_out
      // We clamp at the floor so (a) always passes; if Raydium can't
      // deliver the floor, it'll reject (b) and we record a normal trade
      // failure rather than a SlippageExceeded that needs investigation.
      const outAmountQuoted = BigInt(route.quote.outAmount);
      const slippedQuote =
        (outAmountQuoted * BigInt(10_000 - action.slippageBps)) / 10_000n;
      const solUsdE6 = await readPythSolUsdE6(deps.connection, deps.pythSolUsdFeed);
      const expectedPythOut = directionIsUsdcToSol
        ? (action.amountIn * LAMPORTS_PER_SOL_U128) / solUsdE6
        : (action.amountIn * solUsdE6) / LAMPORTS_PER_SOL_U128;
      // floor = expected × (10000 - MAX_SLIPPAGE_BPS) / 10000
      const pythFloor =
        (expectedPythOut * (10_000n - ONCHAIN_MAX_SLIPPAGE_BPS)) / 10_000n;
      // +1 lamport/e6 buffer against integer-rounding off-by-one.
      const minAmountOut =
        slippedQuote > pythFloor + 1n ? slippedQuote : pythFloor + 1n;

      const sig = await (deps.program.methods as any)
        .executeTrade(
          action.direction,
          new BN(action.amountIn.toString()),
          new BN(minAmountOut.toString()),
          Buffer.from(route.dexRouteData),
          route.destinationAtaIndex,
        )
        .accounts({
          agent: deps.agent.publicKey,
          vaultState: deps.vaultPda,
          usdcMint: deps.usdcMint,
          solMint: deps.wsolMint,
          usdcVault: getAssociatedTokenAddressSync(deps.usdcMint, deps.vaultPda, true),
          solVault: getAssociatedTokenAddressSync(deps.wsolMint, deps.vaultPda, true),
          priceUpdate: deps.pythSolUsdFeed,
          dexProgram: deps.raydiumPool.programId,
        })
        .remainingAccounts(
          route.remainingAccounts.map((m) => ({
            pubkey: m.pubkey,
            isSigner: m.isSigner,
            isWritable: m.isWritable,
          })),
        )
        .signers([deps.agent])
        .rpc({ skipPreflight: false, commitment: "confirmed" });

      // Compute realized out from the post-tx vault balances. Cheaper than
      // parsing Anchor logs and works in either direction.
      const post = await readVaultBalances(deps);
      const realizedOut = directionIsUsdcToSol ? post.solLamports : post.usdcE6;
      return { signature: sig, realizedOut };
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries - 1) {
        await delay(baseBackoff * 2 ** attempt);
      }
    }
  }
  throw new TradeError(
    `executeTrade failed after ${maxRetries} attempts (${action.label})`,
    lastErr,
  );
}

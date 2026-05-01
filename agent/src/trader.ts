// Trader module — bridges signal → vault.execute_trade.
//
//   decideTrade  : pure function. Returns null when the signal already
//                  matches the current vault position (no-churn).
//   executeTrade : Jupiter quote → swap-instructions → execute_trade CPI.
//                  Wraps everything in exponential-backoff retries with a
//                  3-attempt circuit-breaker; raises a typed error on
//                  permanent failure so the main loop can warn-and-skip.
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
import { quoteAndBuildSwap } from "./jupiter.js";
import type { Signal } from "./arcium.js";

const { BN } = anchor;

export type Position = "usdc" | "sol" | "split";

export interface TradeAction {
  /** Vault-state enum payload, e.g. `{ usdcToSol: {} }`. */
  direction: { usdcToSol: {} } | { solToUsdc: {} };
  /** Atomic units (e6 USDC or lamports). */
  amountIn: bigint;
  /** Slippage bps the vault enforces; we still send the Jupiter quote with
   * a slightly looser bound so it can route through low-liquidity pools. */
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
  jupiterProgramId: PublicKey;
}

// ---------------------------------------------------------------------------
// decideTrade
// ---------------------------------------------------------------------------

/**
 * Decide what (if anything) to trade given the freshly-stamped signal and
 * the current vault position. Returns null on no-churn.
 *
 * Mode 1 long-only mapping:
 *   signal=1  + position=usdc → swap USDC → SOL (go long).
 *   signal=0  + position=sol  → swap SOL  → USDC (close long).
 *   signal=1  + position=sol  → null (already long).
 *   signal=0  + position=usdc → null (already flat).
 *   signal=-1 ANY              → null (Mode 1 never returns -1; defensive).
 *
 * `amountIn` defaults to 30 % of the source-side balance — exactly the
 * structural cap the vault enforces. Override via `amountInOverride` if
 * you want a smaller trade (e.g. running multiple legs to taper in).
 */
export function decideTrade(
  signal: Signal,
  position: Position,
  balances: { usdcE6: bigint; solLamports: bigint },
  opts: { slippageBps?: number; amountInOverride?: bigint } = {},
): TradeAction | null {
  if (signal === -1) return null; // Mode 1 long-only

  const slippageBps = opts.slippageBps ?? 50;
  const thirty = (x: bigint) => (x * 3000n) / 10_000n;

  if (signal === 1 && position === "usdc") {
    const amountIn = opts.amountInOverride ?? thirty(balances.usdcE6);
    if (amountIn <= 0n) return null;
    return {
      direction: { usdcToSol: {} },
      amountIn,
      slippageBps,
      label: "long_open",
    };
  }
  if (signal === 0 && position === "sol") {
    const amountIn = opts.amountInOverride ?? thirty(balances.solLamports);
    if (amountIn <= 0n) return null;
    return {
      direction: { solToUsdc: {} },
      amountIn,
      slippageBps,
      label: "long_close",
    };
  }
  // split-position handling: behave like usdc for signal=1 (suppress) and
  // sol for signal=0 (continue unwind).
  if (signal === 1 && position === "split") return null;
  if (signal === 0 && position === "split") {
    const amountIn = opts.amountInOverride ?? thirty(balances.solLamports);
    if (amountIn <= 0n) return null;
    return {
      direction: { solToUsdc: {} },
      amountIn,
      slippageBps,
      label: "long_close_split",
    };
  }
  return null;
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
  // need a coarse split/usdc/sol classifier).
  const solInUsdcRef = (solLamports * 100n) / 1_000_000_000n; // 100 USD/SOL
  let position: Position;
  if (usdcE6 > solInUsdcRef * 10n) position = "usdc";
  else if (solInUsdcRef > usdcE6 * 10n) position = "sol";
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
      // Re-quote on each retry — Jupiter routes are time-sensitive.
      const route = await quoteAndBuildSwap({
        inputMint,
        outputMint,
        amount: action.amountIn,
        slippageBps: action.slippageBps,
        vaultPda: deps.vaultPda,
        expectedDestinationAta: expectedDestAta,
      });

      // Conservative min_amount_out: route.quote.outAmount × (1 − slippage).
      const outAmountQuoted = BigInt(route.quote.outAmount);
      const minAmountOut =
        (outAmountQuoted * BigInt(10_000 - action.slippageBps)) / 10_000n;

      const sig = await (deps.program.methods as any)
        .executeTrade(
          action.direction,
          new BN(action.amountIn.toString()),
          new BN(minAmountOut.toString()),
          Buffer.from(route.jupiterRouteData),
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
          jupiterProgram: deps.jupiterProgramId,
        })
        .remainingAccounts(
          route.remainingAccounts.map((m) => ({
            pubkey: m.pubkey,
            isSigner: m.isSigner,
            isWritable: m.isWritable,
          })),
        )
        .signers([deps.agent])
        .rpc({ skipPreflight: true, commitment: "confirmed" });

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

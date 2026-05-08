// Auto-rebalancer: keeps the Raydium CPMM pool's implied SOL/USDC price
// in sync with Pyth so the agent's `execute_trade` Pyth-floor check
// (programs/spectraq_vault/src/instructions/execute_trade.rs:154) does
// not block trades on devnet.
//
// On mainnet this happens for free — arbitrage bots tighten any pool to
// the global price within seconds. Devnet has no arbitrageurs, so we run
// our own from the admin wallet.
//
// What the script does each tick:
//   1. Read current pool reserves via /api/raydium-pool.
//   2. Read live SOL/USD from the Pyth `PriceUpdateV2` account on chain.
//   3. Compute the constant-product target reserves:
//        target_sol  = sqrt(k / pyth_price)
//        target_usdc = sqrt(k * pyth_price)
//      where k = sol_reserve * usdc_reserve.
//   4. If |pool_price − pyth_price| / pyth_price < TOLERANCE_BPS, do nothing.
//   5. Otherwise swap from the admin wallet against the pool (USDC→SOL or
//      SOL→USDC depending on which side is heavy) for the amount that
//      lands implied price ≈ Pyth, capped by MAX_REBALANCE_USDC_E6.
//
// Modes:
//   one-shot (default):  REBALANCE_LOOP=false — run once and exit.
//   daemon:              REBALANCE_LOOP=true  — loop every INTERVAL_SEC.
//
// Usage:
//   ANCHOR_WALLET=~/.config/solana/spectraq_admin.json \
//     pnpm exec ts-node --transpile-only scripts/rebalance_pool.ts
//   ANCHOR_WALLET=… REBALANCE_LOOP=true INTERVAL_SEC=30 \
//     pnpm exec ts-node --transpile-only scripts/rebalance_pool.ts

import * as fs from "node:fs";
import * as path from "node:path";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { makeSwapCpmmBaseInInstruction } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import dotenv from "dotenv";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

// ---- config -----------------------------------------------------------------

const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const WSOL_MINT = NATIVE_MINT;
const PYTH_FEED = new PublicKey(
  process.env.PYTH_SOL_USD_FEED || "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
);

const TOLERANCE_BPS = Number(process.env.REBALANCE_TOLERANCE_BPS || "100"); // 1%
const MAX_REBALANCE_USDC_HUMAN = Number(
  process.env.MAX_REBALANCE_USDC || "200",
); // safety bound: never swap >$200 in a single tx
const MAX_REBALANCE_USDC_E6 = BigInt(
  Math.round(MAX_REBALANCE_USDC_HUMAN * 1_000_000),
);
const SWAP_SLIPPAGE_BPS = 1000; // 10% buffer on amountOutMin. The simple
                                // xy/(y+Δy) we use off-chain ignores Raydium's
                                // creator/fund fees and the devnet AmmConfig
                                // diverges from `getCpmmConfigs()` mainnet
                                // values by ~5%, so the on-chain delivery
                                // routinely lands a few % below our estimate.
                                // The rebalance pushes the pool *toward* Pyth
                                // so we always get a structurally favorable
                                // fill — a wide tolerance here is safe.
const LOOP = (process.env.REBALANCE_LOOP || "false").toLowerCase() === "true";
const INTERVAL_SEC = Number(process.env.INTERVAL_SEC || "60");

// PriceUpdateV2 layout — see agent/src/safety.ts and trader.ts.
const PRICE_OFFSET = 73;
const EXPONENT_OFFSET = 89;

// ---- types ------------------------------------------------------------------

interface PoolView {
  programId: string;
  poolId: string;
  poolAuth: string | null;
  mintA: string;
  mintB: string;
  vaultA: string;
  vaultB: string;
  wsolReserve: string;
  usdcReserve: string;
}

// ---- helpers ----------------------------------------------------------------

function loadKeypair(absPath: string): Keypair {
  const raw = fs.readFileSync(absPath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

async function fetchPool(): Promise<PoolView> {
  const res = await fetch("http://localhost:3000/api/raydium-pool");
  const body = (await res.json()) as { pool?: PoolView; errored?: string };
  if (!body.pool) {
    throw new Error(
      `/api/raydium-pool returned no pool: ${body.errored ?? "unknown"}`,
    );
  }
  if (!body.pool.poolAuth) throw new Error("pool view missing poolAuth");
  return body.pool;
}

async function fetchPythSolUsdE6(connection: Connection): Promise<bigint> {
  const acc = await connection.getAccountInfo(PYTH_FEED, "confirmed");
  if (!acc) throw new Error(`Pyth feed ${PYTH_FEED.toBase58()} not found`);
  const buf = Buffer.from(acc.data);
  const priceLo = BigInt(buf.readUInt32LE(PRICE_OFFSET));
  const priceHi = BigInt(buf.readInt32LE(PRICE_OFFSET + 4));
  const price = (priceHi << 32n) | priceLo;
  const exponent = buf.readInt32LE(EXPONENT_OFFSET);
  const shift = exponent + 6;
  const e6 =
    shift >= 0 ? price * 10n ** BigInt(shift) : price / 10n ** BigInt(-shift);
  if (e6 <= 0n) throw new Error(`Pyth price non-positive: ${e6}`);
  return e6;
}

interface RebalancePlan {
  /** "buy_sol" — swap USDC→SOL (pool is SOL-heavy, price below Pyth).
   *  "sell_sol" — swap SOL→USDC (pool is USDC-heavy, price above Pyth). */
  direction: "buy_sol" | "sell_sol";
  /** Atomic amount of input token (USDC e6 OR SOL lamports). */
  amountIn: bigint;
  /** Pre-rebalance pool implied price (USDC per SOL, e6). */
  poolPriceE6: bigint;
  /** Pyth target price (USDC per SOL, e6). */
  pythPriceE6: bigint;
  /** Pre-rebalance gap in bps. */
  gapBps: number;
  /** Was the planned amount clipped by MAX_REBALANCE_USDC? */
  clipped: boolean;
}

function planRebalance(
  wsolReserveLamports: bigint,
  usdcReserveE6: bigint,
  pythE6: bigint,
): RebalancePlan | null {
  // Convert to floating point for the sqrt math. Precision lost here is
  // immaterial — we cap the swap at 200 USDC anyway, and the on-chain
  // CPMM does its own exact math via the swap ix.
  const x = Number(wsolReserveLamports) / 1e9; // SOL units
  const y = Number(usdcReserveE6) / 1e6; // USDC units
  const k = x * y;
  const pythPrice = Number(pythE6) / 1e6;
  const poolPrice = y / x;

  const gap = (poolPrice - pythPrice) / pythPrice; // signed
  const gapBps = Math.round(Math.abs(gap) * 10_000);
  const poolPriceE6 = BigInt(Math.round(poolPrice * 1e6));

  if (gapBps < TOLERANCE_BPS) return null; // already in band

  if (poolPrice < pythPrice) {
    // Pool SOL-heavy → buy SOL out (USDC in).
    const targetY = Math.sqrt(k * pythPrice);
    let usdcIn = targetY - y;
    let clipped = false;
    let usdcInE6 = BigInt(Math.round(usdcIn * 1e6));
    if (usdcInE6 > MAX_REBALANCE_USDC_E6) {
      usdcInE6 = MAX_REBALANCE_USDC_E6;
      clipped = true;
    }
    return {
      direction: "buy_sol",
      amountIn: usdcInE6,
      poolPriceE6,
      pythPriceE6: pythE6,
      gapBps,
      clipped,
    };
  } else {
    // Pool USDC-heavy → sell SOL into pool.
    const targetX = Math.sqrt(k / pythPrice);
    let solIn = targetX - x;
    let solInLamports = BigInt(Math.round(solIn * 1e9));
    // Cap the SOL side using the equivalent USDC value at Pyth price.
    const equivUsdcE6 = (solInLamports * pythE6) / 1_000_000_000n;
    let clipped = false;
    if (equivUsdcE6 > MAX_REBALANCE_USDC_E6) {
      solInLamports = (MAX_REBALANCE_USDC_E6 * 1_000_000_000n) / pythE6;
      clipped = true;
    }
    return {
      direction: "sell_sol",
      amountIn: solInLamports,
      poolPriceE6,
      pythPriceE6: pythE6,
      gapBps,
      clipped,
    };
  }
}

async function executeRebalance(
  connection: Connection,
  owner: Keypair,
  pool: PoolView,
  plan: RebalancePlan,
): Promise<string> {
  const programId = new PublicKey(pool.programId);
  const authority = new PublicKey(pool.poolAuth!);
  const poolId = new PublicKey(pool.poolId);
  const mintA = new PublicKey(pool.mintA);
  const mintB = new PublicKey(pool.mintB);
  const vaultA = new PublicKey(pool.vaultA);
  const vaultB = new PublicKey(pool.vaultB);
  const configId = new PublicKey(
    process.env.RAYDIUM_USDC_SOL_CONFIG_ID ||
      "5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy",
  );
  const observation = new PublicKey(
    process.env.RAYDIUM_USDC_SOL_OBSERVATION ||
      "CvAn1Ux7rgyNt5WJSZ7GSHm8h8LpJ9kZBxZ6qh1m3tM",
  );

  const inputMint = plan.direction === "buy_sol" ? USDC_MINT : WSOL_MINT;
  const outputMint = plan.direction === "buy_sol" ? WSOL_MINT : USDC_MINT;
  const inputIsA = inputMint.equals(mintA);
  const inputVault = inputIsA ? vaultA : vaultB;
  const outputVault = inputIsA ? vaultB : vaultA;

  const userInput = getAssociatedTokenAddressSync(inputMint, owner.publicKey);
  const userOutput = getAssociatedTokenAddressSync(outputMint, owner.publicKey);

  // Off-chain CPMM sanity-check: how much output do we expect? Use simple
  // constant-product formula minus 0.25% Raydium fee.
  const xLam = BigInt(pool.wsolReserve);
  const yE6 = BigInt(pool.usdcReserve);
  const FEE_NUM = 9975n;
  const FEE_DEN = 10000n;
  let expectedOut: bigint;
  if (plan.direction === "buy_sol") {
    // amount in is USDC e6
    const amountInAfterFee = (plan.amountIn * FEE_NUM) / FEE_DEN;
    expectedOut =
      (xLam * amountInAfterFee) / (yE6 + amountInAfterFee); // SOL lamports
  } else {
    const amountInAfterFee = (plan.amountIn * FEE_NUM) / FEE_DEN;
    expectedOut =
      (yE6 * amountInAfterFee) / (xLam + amountInAfterFee); // USDC e6
  }
  const minOut =
    (expectedOut * BigInt(10_000 - SWAP_SLIPPAGE_BPS)) / 10_000n;

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));

  // Idempotent ATA creates for both sides + LP not needed here.
  for (const [ata, mint] of [
    [userInput, inputMint] as const,
    [userOutput, outputMint] as const,
  ]) {
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        owner.publicKey,
        ata,
        owner.publicKey,
        mint,
      ),
    );
  }

  // If swapping SOL→USDC, we need to wrap SOL → wSOL first.
  if (plan.direction === "sell_sol") {
    let currentWsol = 0n;
    try {
      const acc = await getAccount(connection, userInput);
      currentWsol = BigInt(acc.amount.toString());
    } catch {
      /* ATA fresh */
    }
    if (currentWsol < plan.amountIn) {
      const lamportsToWrap = plan.amountIn - currentWsol;
      tx.add(
        SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: userInput,
          lamports: Number(lamportsToWrap),
        }),
      );
      tx.add(createSyncNativeInstruction(userInput, TOKEN_PROGRAM_ID));
    }
  }

  tx.add(
    makeSwapCpmmBaseInInstruction(
      programId,
      owner.publicKey,
      authority,
      configId,
      poolId,
      userInput,
      userOutput,
      inputVault,
      outputVault,
      TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      inputMint,
      outputMint,
      observation,
      new BN(plan.amountIn.toString()),
      new BN(minOut.toString()),
    ),
  );

  // If we just *received* wSOL (buy_sol), unwrap it back to native SOL so
  // the admin wallet's SOL balance reflects the rebalance instead of a
  // dust-y wSOL ATA.
  if (plan.direction === "buy_sol") {
    tx.add(
      createCloseAccountInstruction(
        userOutput,
        owner.publicKey,
        owner.publicKey,
      ),
    );
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = owner.publicKey;
  tx.sign(owner);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

async function rebalanceOnce(
  connection: Connection,
  owner: Keypair,
): Promise<void> {
  const pool = await fetchPool();
  const pythE6 = await fetchPythSolUsdE6(connection);
  const plan = planRebalance(
    BigInt(pool.wsolReserve),
    BigInt(pool.usdcReserve),
    pythE6,
  );
  const poolSol = Number(pool.wsolReserve) / 1e9;
  const poolUsdc = Number(pool.usdcReserve) / 1e6;
  const poolPrice = poolUsdc / poolSol;
  const pythPrice = Number(pythE6) / 1e6;

  console.log(
    `[${new Date().toISOString()}] pool=${poolSol.toFixed(4)} SOL / ${poolUsdc.toFixed(2)} USDC (implied $${poolPrice.toFixed(2)}) | pyth=$${pythPrice.toFixed(2)}`,
  );

  if (!plan) {
    console.log("  in-band — no rebalance needed");
    return;
  }

  const sizeHuman =
    plan.direction === "buy_sol"
      ? `${(Number(plan.amountIn) / 1e6).toFixed(2)} USDC → SOL`
      : `${(Number(plan.amountIn) / 1e9).toFixed(4)} SOL → USDC`;
  console.log(
    `  gap ${plan.gapBps}bps → swap ${sizeHuman}${plan.clipped ? " (clipped to MAX_REBALANCE_USDC)" : ""}`,
  );

  try {
    const sig = await executeRebalance(connection, owner, pool, plan);
    console.log(
      `  ✓ tx ${sig} https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    );
  } catch (e) {
    console.error(`  ✗ rebalance failed: ${(e as Error).message}`);
  }
}

async function main(): Promise<void> {
  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME!, ".config", "solana", "id.json");
  const owner = loadKeypair(walletPath);
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("─── Raydium pool auto-rebalancer ───");
  console.log("admin wallet:", owner.publicKey.toBase58());
  console.log("rpc         :", RPC_URL);
  console.log("tolerance   :", `${TOLERANCE_BPS}bps`);
  console.log("max swap    :", `$${MAX_REBALANCE_USDC_HUMAN} per tx`);
  console.log(
    "mode        :",
    LOOP ? `loop (every ${INTERVAL_SEC}s)` : "one-shot",
  );

  if (!LOOP) {
    await rebalanceOnce(connection, owner);
    return;
  }

  let stop = false;
  process.on("SIGINT", () => {
    console.log("\nstopping (SIGINT) — finishing current iteration");
    stop = true;
  });
  process.on("SIGTERM", () => {
    stop = true;
  });

  while (!stop) {
    try {
      await rebalanceOnce(connection, owner);
    } catch (e) {
      console.error(`tick error: ${(e as Error).message}`);
    }
    if (stop) break;
    await new Promise((r) => setTimeout(r, INTERVAL_SEC * 1000));
  }
}

main().catch((e) => {
  console.error("\nfatal:", e);
  process.exit(1);
});

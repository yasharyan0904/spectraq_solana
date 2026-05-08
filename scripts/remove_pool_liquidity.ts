// One-shot helper: burn LP tokens and reclaim proportional USDC + wSOL
// from the Raydium CPMM pool. Mirror of `scripts/add_pool_liquidity.ts`.
// Closes the wSOL ATA at the end so the unwrapped native SOL lands
// directly in the wallet.
//
// Usage:
//   LP_AMOUNT=0.05 ANCHOR_WALLET=~/.config/solana/id.json \
//     pnpm exec ts-node --transpile-only scripts/remove_pool_liquidity.ts
//
//   LP_AMOUNT=max ANCHOR_WALLET=~/.config/solana/id.json \
//     pnpm exec ts-node --transpile-only scripts/remove_pool_liquidity.ts
//
// `LP_AMOUNT` is in *human* LP units (LP-mint decimals applied for you).
// Pass `max` to burn the entire LP balance held by the wallet.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import { makeWithdrawCpmmInInstruction } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import dotenv from "dotenv";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const WSOL_MINT = NATIVE_MINT;
const SLIPPAGE_BPS = 100; // 1 % floor on min-A / min-B (delivery vs estimate).

const LP_AMOUNT_RAW = process.env.LP_AMOUNT?.trim();
if (!LP_AMOUNT_RAW) {
  console.error(
    'LP_AMOUNT must be set (e.g. LP_AMOUNT=0.05, or LP_AMOUNT=max for full balance)',
  );
  process.exit(1);
}

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
  lpMint: string | null;
  lpSupply: string | null;
  lpDecimals: number | null;
}

async function fetchPool(): Promise<PoolView> {
  const res = await fetch("http://localhost:3000/api/raydium-pool");
  const body = (await res.json()) as { pool?: PoolView; errored?: string };
  if (!body.pool) {
    throw new Error(
      `/api/raydium-pool returned no pool: ${body.errored ?? "unknown"}`,
    );
  }
  if (!body.pool.lpMint || !body.pool.lpSupply || !body.pool.poolAuth) {
    throw new Error("pool view missing lpMint / lpSupply / poolAuth");
  }
  return body.pool;
}

function loadKeypair(absPath: string): Keypair {
  const raw = fs.readFileSync(absPath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

async function main(): Promise<void> {
  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME!, ".config", "solana", "id.json");
  const owner = loadKeypair(walletPath);
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("─── Raydium CPMM liquidity withdraw ───");
  console.log("payer       :", owner.publicKey.toBase58());

  const pool = await fetchPool();
  const lpMint = new PublicKey(pool.lpMint!);
  const userLpAta = getAssociatedTokenAddressSync(lpMint, owner.publicKey);
  const lpDecimals = pool.lpDecimals ?? 9;
  const lpScale = 10n ** BigInt(lpDecimals);

  // Resolve "max" against live wallet balance.
  let lpAmountRaw: bigint;
  if (LP_AMOUNT_RAW.toLowerCase() === "max") {
    let balance = 0n;
    try {
      const acc = await getAccount(connection, userLpAta);
      balance = BigInt(acc.amount.toString());
    } catch {
      throw new Error(
        `wallet has no LP ATA for mint ${lpMint.toBase58()} — nothing to withdraw`,
      );
    }
    if (balance === 0n) {
      throw new Error("wallet LP balance is 0 — nothing to withdraw");
    }
    lpAmountRaw = balance;
    console.log(
      "lp burn     :",
      `max (${(Number(balance) / Number(lpScale)).toFixed(6)} LP)`,
    );
  } else {
    const human = Number(LP_AMOUNT_RAW);
    if (!Number.isFinite(human) || human <= 0) {
      throw new Error(`LP_AMOUNT must be a positive number (got ${LP_AMOUNT_RAW})`);
    }
    lpAmountRaw = BigInt(Math.round(human * Number(lpScale)));
    console.log(
      "lp burn     :",
      `${human} LP (${lpAmountRaw} raw, lpDecimals=${lpDecimals})`,
    );
  }

  const usdcReserve = BigInt(pool.usdcReserve);
  const wsolReserve = BigInt(pool.wsolReserve);
  const lpSupply = BigInt(pool.lpSupply!);
  if (usdcReserve === 0n || wsolReserve === 0n || lpSupply === 0n) {
    throw new Error("pool reserves are empty — nothing to withdraw");
  }
  if (lpAmountRaw > lpSupply) {
    throw new Error(`LP amount ${lpAmountRaw} exceeds pool LP supply ${lpSupply}`);
  }

  const wsolEstimate = (lpAmountRaw * wsolReserve) / lpSupply;
  const usdcEstimate = (lpAmountRaw * usdcReserve) / lpSupply;
  const floor = (n: bigint) =>
    (n * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
  const minWsol = floor(wsolEstimate);
  const minUsdc = floor(usdcEstimate);

  console.log(
    "estimate    :",
    `${(Number(wsolEstimate) / 1e9).toFixed(6)} wSOL + ${(Number(usdcEstimate) / 1e6).toFixed(2)} USDC`,
  );
  console.log(
    "min-out     :",
    `${(Number(minWsol) / 1e9).toFixed(6)} wSOL + ${(Number(minUsdc) / 1e6).toFixed(2)} USDC (1 % slippage)`,
  );

  const programId = new PublicKey(pool.programId);
  const authority = new PublicKey(pool.poolAuth!);
  const poolId = new PublicKey(pool.poolId);
  const mintA = new PublicKey(pool.mintA);
  const mintB = new PublicKey(pool.mintB);
  const vaultA = new PublicKey(pool.vaultA);
  const vaultB = new PublicKey(pool.vaultB);

  const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, owner.publicKey);
  const userWsolAta = getAssociatedTokenAddressSync(WSOL_MINT, owner.publicKey);

  const aIsWsol = pool.mintA === WSOL_MINT.toBase58();
  const userVaultA = aIsWsol ? userWsolAta : userUsdcAta;
  const userVaultB = aIsWsol ? userUsdcAta : userWsolAta;
  const minA = aIsWsol ? minWsol : minUsdc;
  const minB = aIsWsol ? minUsdc : minWsol;

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));

  for (const [ata, mint] of [
    [userUsdcAta, USDC_MINT] as const,
    [userWsolAta, WSOL_MINT] as const,
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

  tx.add(
    makeWithdrawCpmmInInstruction(
      programId,
      owner.publicKey,
      authority,
      poolId,
      userLpAta,
      userVaultA,
      userVaultB,
      vaultA,
      vaultB,
      mintA,
      mintB,
      lpMint,
      new BN(lpAmountRaw.toString()),
      new BN(minA.toString()),
      new BN(minB.toString()),
    ),
  );

  // Close the wSOL ATA so the unwrapped native SOL flows back to the
  // wallet's gas-side balance. Skip if the ATA didn't pre-exist (we'd be
  // closing one we just created — Raydium will have credited it during
  // the withdraw, so this still does the right thing).
  tx.add(
    createCloseAccountInstruction(userWsolAta, owner.publicKey, owner.publicKey),
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = owner.publicKey;
  tx.sign(owner);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });
  console.log("tx sent     :", sig);
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  console.log(
    "✓ withdrawn — explorer:",
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  );
}

main().catch((e) => {
  console.error("\nfatal:", e);
  process.exit(1);
});

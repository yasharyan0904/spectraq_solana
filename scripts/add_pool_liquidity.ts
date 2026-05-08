// One-shot helper: deposit USDC + matching wSOL liquidity into the Raydium
// CPMM pool the agent routes trades through. Mirrors the logic of the
// `/app/pool` form (frontend/lib/hooks/useAddRaydiumLiquidity.ts) but signs
// from a local keypair instead of a browser wallet.
//
// Usage:
//   USDC_AMOUNT=20 ANCHOR_WALLET=~/.config/solana/id.json \
//     pnpm exec ts-node --transpile-only scripts/add_pool_liquidity.ts
//
// Reads pool state via the running frontend (http://localhost:3000) so we
// don't have to re-derive vaultA/vaultB/lpMint from scratch.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
} from "@solana/spl-token";
import { makeDepositCpmmInInstruction } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import dotenv from "dotenv";

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const WSOL_MINT = NATIVE_MINT;
const SLIPPAGE_BPS = 100; // 1 % buffer on max-A / max-B.

const USDC_AMOUNT_HUMAN = Number(process.env.USDC_AMOUNT || "20");
if (!Number.isFinite(USDC_AMOUNT_HUMAN) || USDC_AMOUNT_HUMAN <= 0) {
  console.error(`USDC_AMOUNT must be a positive number (got ${process.env.USDC_AMOUNT})`);
  process.exit(1);
}
const USDC_E6 = BigInt(Math.round(USDC_AMOUNT_HUMAN * 1_000_000));

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
}

async function fetchPool(): Promise<PoolView> {
  const res = await fetch("http://localhost:3000/api/raydium-pool");
  const body = (await res.json()) as { pool?: PoolView; errored?: string };
  if (!body.pool) {
    throw new Error(`/api/raydium-pool returned no pool: ${body.errored ?? "unknown"}`);
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

  console.log("─── Raydium CPMM liquidity top-up ───");
  console.log("payer       :", owner.publicKey.toBase58());
  console.log("usdc deposit:", `${USDC_AMOUNT_HUMAN} USDC (${USDC_E6} e6)`);

  const pool = await fetchPool();
  const usdcReserve = BigInt(pool.usdcReserve);
  const wsolReserve = BigInt(pool.wsolReserve);
  const lpSupply = BigInt(pool.lpSupply!);
  if (usdcReserve === 0n || wsolReserve === 0n || lpSupply === 0n) {
    throw new Error("pool reserves are empty — cannot price deposit");
  }

  const wsolAmount = (USDC_E6 * wsolReserve) / usdcReserve;
  const lpAmount = (USDC_E6 * lpSupply) / usdcReserve;
  const buffer = (n: bigint) => (n * BigInt(10_000 + SLIPPAGE_BPS)) / 10_000n;
  const amountMaxWsol = buffer(wsolAmount);
  const amountMaxUsdc = buffer(USDC_E6);

  console.log("matching wSOL:", `${Number(wsolAmount) / 1e9} wSOL (${wsolAmount} lamports)`);
  console.log("LP minted   :", `${Number(lpAmount) / 1e9} (${lpAmount} raw)`);
  console.log(
    "pool ratio  :",
    `${Number(wsolReserve) / 1e9} wSOL / ${Number(usdcReserve) / 1e6} USDC`,
  );

  const programId = new PublicKey(pool.programId);
  const authority = new PublicKey(pool.poolAuth!);
  const poolId = new PublicKey(pool.poolId);
  const lpMint = new PublicKey(pool.lpMint!);
  const mintA = new PublicKey(pool.mintA);
  const mintB = new PublicKey(pool.mintB);
  const vaultA = new PublicKey(pool.vaultA);
  const vaultB = new PublicKey(pool.vaultB);

  const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, owner.publicKey);
  const userWsolAta = getAssociatedTokenAddressSync(WSOL_MINT, owner.publicKey);
  const userLpAta = getAssociatedTokenAddressSync(lpMint, owner.publicKey);

  const aIsWsol = pool.mintA === WSOL_MINT.toBase58();
  const userVaultA = aIsWsol ? userWsolAta : userUsdcAta;
  const userVaultB = aIsWsol ? userUsdcAta : userWsolAta;

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));

  for (const [ata, mint] of [
    [userUsdcAta, USDC_MINT] as const,
    [userWsolAta, WSOL_MINT] as const,
    [userLpAta, lpMint] as const,
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

  let currentWsol = 0n;
  try {
    const acc = await getAccount(connection, userWsolAta);
    currentWsol = BigInt(acc.amount.toString());
  } catch {
    /* ATA does not exist yet — balance is 0 after the create above */
  }
  if (currentWsol < wsolAmount) {
    const lamportsToWrap = wsolAmount - currentWsol;
    console.log("wrapping    :", `${Number(lamportsToWrap) / 1e9} SOL → wSOL`);
    tx.add(
      SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: userWsolAta,
        lamports: Number(lamportsToWrap),
      }),
    );
    tx.add(createSyncNativeInstruction(userWsolAta, TOKEN_PROGRAM_ID));
  }

  tx.add(
    makeDepositCpmmInInstruction(
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
      new BN(lpAmount.toString()),
      new BN(amountMaxWsol.toString()),
      new BN(amountMaxUsdc.toString()),
    ),
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
    "✓ deposited — explorer:",
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  );
}

main().catch((e) => {
  console.error("\nfatal:", e);
  process.exit(1);
});

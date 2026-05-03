// GET /api/raydium-pool — live reserves of the Raydium CPMM pool the agent
// routes every USDC↔wSOL swap through. Reads the two SPL token-account
// vaults that hold the pool's mintA / mintB reserves.

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

import { serverRpcUrl } from "@/lib/env";

// CpmmPoolInfoLayout (Raydium SDK V2) — only the fields we surface to the
// frontend. Offsets from `src/raydium/cpmm/layout.ts`:
//     0  blob(8)            discriminator
//     8  configId       (32)
//    40  poolCreator    (32)
//    72  vaultA         (32)
//   104  vaultB         (32)
//   136  mintLp         (32)
//   168  mintA          (32)
//   200  mintB          (32)
//   232  mintProgramA   (32)
//   264  mintProgramB   (32)
//   296  observationId  (32)
//   328  bump           (1)
//   329  status         (1)
//   330  lpDecimals     (1)
//   331  mintDecimalA   (1)
//   332  mintDecimalB   (1)
//   333  lpAmount       (u64 LE)
function parsePoolMintLp(data: Buffer): { mintLp: string; lpDecimals: number; lpSupply: string } {
  const mintLp = new PublicKey(data.subarray(136, 136 + 32)).toBase58();
  const lpDecimals = data.readUInt8(330);
  const lpSupply = data.readBigUInt64LE(333).toString();
  return { mintLp, lpDecimals, lpSupply };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WSOL_MINT_STR = "So11111111111111111111111111111111111111112";

interface Cache {
  payload: unknown;
  fetchedAt: number;
}
let cache: Cache | null = null;
const CACHE_MS = 10_000;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) {
    return NextResponse.json(cache.payload);
  }

  const need = (k: string): string | null => process.env[k] ?? null;
  const poolId = need("RAYDIUM_USDC_SOL_POOL");
  const vaultA = need("RAYDIUM_USDC_SOL_VAULT_A");
  const vaultB = need("RAYDIUM_USDC_SOL_VAULT_B");
  const mintA = need("RAYDIUM_USDC_SOL_MINT_A");
  const mintB = need("RAYDIUM_USDC_SOL_MINT_B");
  const programId = need("RAYDIUM_CPMM_PROGRAM_ID");

  if (!poolId || !vaultA || !vaultB || !mintA || !mintB || !programId) {
    const payload = {
      pool: null,
      fetchedAt: now,
      errored: "Raydium pool not configured (RAYDIUM_USDC_SOL_* env vars missing)",
    };
    return NextResponse.json(payload, { status: 200 });
  }

  try {
    const connection = new Connection(serverRpcUrl(), "confirmed");
    const poolAuth = process.env.RAYDIUM_CPMM_POOL_AUTH ?? null;
    const [aBal, bBal, poolAccount] = await Promise.all([
      connection.getTokenAccountBalance(new PublicKey(vaultA)),
      connection.getTokenAccountBalance(new PublicKey(vaultB)),
      connection.getAccountInfo(new PublicKey(poolId)),
    ]);

    // Map to (wsol, usdc) regardless of which side is mintA.
    const aIsWsol = mintA === WSOL_MINT_STR;
    const wsolReserve = aIsWsol ? aBal.value.amount : bBal.value.amount;
    const wsolDecimals = aIsWsol ? aBal.value.decimals : bBal.value.decimals;
    const usdcReserve = aIsWsol ? bBal.value.amount : aBal.value.amount;
    const usdcDecimals = aIsWsol ? bBal.value.decimals : aBal.value.decimals;

    let lp: { mintLp: string; lpDecimals: number; lpSupply: string } | null = null;
    if (poolAccount?.data && poolAccount.data.length >= 341) {
      try {
        lp = parsePoolMintLp(poolAccount.data);
      } catch {
        lp = null;
      }
    }

    const payload = {
      pool: {
        programId,
        poolId,
        poolAuth,
        mintA,
        mintB,
        vaultA,
        vaultB,
        wsolReserve,
        wsolDecimals,
        usdcReserve,
        usdcDecimals,
        lpMint: lp?.mintLp ?? null,
        lpDecimals: lp?.lpDecimals ?? null,
        lpSupply: lp?.lpSupply ?? null,
      },
      fetchedAt: now,
    };
    cache = { payload, fetchedAt: now };
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      {
        pool: null,
        fetchedAt: now,
        errored: e instanceof Error ? e.message : String(e),
      },
      { status: 200 },
    );
  }
}

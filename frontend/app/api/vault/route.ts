// GET /api/vault — server-side read of the on-chain vault state.
//
// Cached for 5 seconds in memory so a packed dashboard doesn't hammer
// the RPC. The client refetches every 5s, so this is the natural
// upstream cadence.

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

import { readonlyProgram } from "@/lib/anchor";
import { serverRpcUrl, USDC_MINT, WSOL_MINT } from "@/lib/env";
import { vaultPda } from "@/lib/pdas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CacheEntry {
  payload: unknown;
  fetchedAt: number;
}
let cache: CacheEntry | null = null;
const CACHE_MS = 5_000;

// PriceUpdateV2 layout (verified against devnet, 134 bytes):
//   8 disc + 32 write_authority + 1 verification_level + 32 feed_id +
//   8 price + 8 conf + 4 exponent + 8 publish_time + 8 prev_publish_time +
//   8 ema_price + 8 ema_conf + 8 posted_slot
const PRICE_OFFSET = 8 + 32 + 1 + 32; // = 73 (i64 LE price)
const EXPONENT_OFFSET = PRICE_OFFSET + 8 + 8; // = 89 (i32 LE)
const PRICE_UPDATE_PUBLISH_OFFSET = EXPONENT_OFFSET + 4; // = 93 (i64 LE)

async function readPythPriceE6(
  connection: Connection,
  feed: PublicKey,
): Promise<{ priceE6: bigint | null; publishTime: number | null }> {
  try {
    const acc = await connection.getAccountInfo(feed, "confirmed");
    if (!acc || acc.data.length < PRICE_UPDATE_PUBLISH_OFFSET + 8) {
      return { priceE6: null, publishTime: null };
    }
    const buf = Buffer.from(acc.data);
    // i64 LE price
    const priceLo = buf.readUInt32LE(PRICE_OFFSET);
    const priceHi = buf.readInt32LE(PRICE_OFFSET + 4);
    const priceRaw = BigInt(priceHi) * BigInt(4_294_967_296) + BigInt(priceLo);
    const exponent = buf.readInt32LE(EXPONENT_OFFSET);
    const publishLo = buf.readUInt32LE(PRICE_UPDATE_PUBLISH_OFFSET);
    const publishHi = buf.readInt32LE(PRICE_UPDATE_PUBLISH_OFFSET + 4);
    const publishTime = publishHi * 0x1_0000_0000 + publishLo;
    // Convert to USDC e6: priceRaw * 10^(exponent + 6).
    const exp = exponent + 6;
    let priceE6: bigint;
    if (exp >= 0) priceE6 = priceRaw * 10n ** BigInt(exp);
    else priceE6 = priceRaw / 10n ** BigInt(-exp);
    return { priceE6, publishTime };
  } catch {
    return { priceE6: null, publishTime: null };
  }
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) {
    return NextResponse.json(cache.payload);
  }

  try {
    const connection = new Connection(serverRpcUrl(), "confirmed");
    const program = readonlyProgram(connection);
    const vault = vaultPda();

    let vaultStateRaw: Record<string, unknown> | null = null;
    try {
      vaultStateRaw = (await (program.account as Record<string, { fetch: (a: PublicKey) => Promise<unknown> }>)
        .vaultState.fetch(vault)) as Record<string, unknown>;
    } catch {
      vaultStateRaw = null;
    }

    if (!vaultStateRaw) {
      const payload = {
        vault: null,
        fetchedAt: now,
        errored: "vault state account not found on this cluster",
      };
      cache = { payload, fetchedAt: now };
      return NextResponse.json(payload);
    }

    // Pyth feed — env-overridable, defaults to canonical SOL/USD on devnet.
    const pythFeedAddr = new PublicKey(
      process.env.PYTH_SOL_USD_FEED ??
        process.env.NEXT_PUBLIC_PYTH_SOL_USD_FEED ??
        "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
    );
    const { priceE6 } = await readPythPriceE6(connection, pythFeedAddr);

    const usdcBalance = BigInt(
      (vaultStateRaw.usdcBalance as { toString(): string }).toString(),
    );
    const solBalance = BigInt(
      (vaultStateRaw.solBalance as { toString(): string }).toString(),
    );
    const totalShares = BigInt(
      (vaultStateRaw.totalShares as { toString(): string }).toString(),
    );
    const lastSignal = Number(vaultStateRaw.lastSignal);
    const lastSignalSlot = BigInt(
      (vaultStateRaw.lastSignalSlot as { toString(): string }).toString(),
    );

    // SignalState enum ({ idle: {} } | { pending: {} } | { ready: {} })
    let signalState: "idle" | "pending" | "ready" = "idle";
    const ss = vaultStateRaw.signalState as Record<string, unknown> | undefined;
    if (ss) {
      if ("pending" in ss) signalState = "pending";
      else if ("ready" in ss) signalState = "ready";
    }

    const navUsdcE6 =
      priceE6 != null ? usdcBalance + (solBalance * priceE6) / 1_000_000_000n : usdcBalance;

    // No real history — placeholder.
    const nav24hChange = null;

    const payload = {
      vault: {
        vaultPubkey: vault.toBase58(),
        usdcMint: USDC_MINT.toBase58(),
        solMint: WSOL_MINT.toBase58(),
        totalShares: totalShares.toString(),
        usdcBalance: usdcBalance.toString(),
        solBalance: solBalance.toString(),
        lastSignal,
        lastSignalSlot: lastSignalSlot.toString(),
        signalState,
        pythPriceE6: priceE6 ? priceE6.toString() : null,
        navUsdcE6: navUsdcE6.toString(),
        nav24hChange,
      },
      fetchedAt: now,
    };
    cache = { payload, fetchedAt: now };
    return NextResponse.json(payload);
  } catch (e) {
    const payload = {
      vault: null,
      fetchedAt: now,
      errored: e instanceof Error ? e.message : String(e),
    };
    return NextResponse.json(payload, { status: 200 });
  }
}

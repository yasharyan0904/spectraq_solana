// GET /api/trades?limit=N — recent TradeExecuted events for the vault.
//
// Strategy:
//   1. Pull the last `limit*3` confirmed signatures touching the program.
//   2. For each signature, fetch the parsed transaction with logs.
//   3. Use Anchor's BorshEventCoder to decode `TradeExecuted` events.
//
// Falls back to an empty list on any RPC failure rather than 500-ing —
// the UI shows "no trades yet" which is the right empty state.

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

import { IDL, PROGRAM_ID } from "@/lib/anchor";
import { serverRpcUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TradeRow {
  signature: string;
  blockTime: number;
  directionIsUsdcToSol: boolean;
  amountIn: string;
  amountOut: string;
  usdcBalanceAfter: string;
  solBalanceAfter: string;
}

let cache: { payload: { trades: TradeRow[]; fetchedAt: number }; ts: number } | null = null;
const CACHE_MS = 15_000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);
  const now = Date.now();

  if (cache && now - cache.ts < CACHE_MS) {
    return NextResponse.json(cache.payload);
  }

  try {
    const connection = new Connection(serverRpcUrl(), "confirmed");
    const sigs = await connection.getSignaturesForAddress(
      new PublicKey(PROGRAM_ID),
      { limit: Math.min(limit * 3, 100) },
      "confirmed",
    );
    const coder = new anchor.BorshEventCoder(IDL);
    const trades: TradeRow[] = [];

    for (const s of sigs) {
      if (trades.length >= limit) break;
      if (!s.blockTime) continue;
      try {
        const tx = await connection.getTransaction(s.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        const logs = tx?.meta?.logMessages ?? [];
        for (const line of logs) {
          if (!line.startsWith("Program data:")) continue;
          const data = line.replace("Program data: ", "").trim();
          let evt: unknown;
          try {
            evt = coder.decode(data);
          } catch {
            continue;
          }
          if (!evt || typeof evt !== "object") continue;
          const e = evt as { name?: string; data?: Record<string, unknown> };
          if (e.name !== "tradeExecuted" && e.name !== "TradeExecuted") continue;
          const d = (e.data ?? {}) as Record<string, { toString(): string } | boolean | undefined>;
          // Anchor's BorshEventCoder may return snake_case OR camelCase
          // depending on the IDL spec version — accept both.
          const pick = (camel: string, snake: string) =>
            (d[camel] ?? d[snake]) as { toString(): string } | undefined;
          trades.push({
            signature: s.signature,
            blockTime: s.blockTime,
            directionIsUsdcToSol: Boolean(d.directionIsUsdcToSol ?? d.direction_is_usdc_to_sol),
            amountIn: pick("amountIn", "amount_in")?.toString() ?? "0",
            amountOut: pick("amountOut", "amount_out")?.toString() ?? "0",
            usdcBalanceAfter:
              pick("usdcBalanceAfter", "usdc_balance_after")?.toString() ?? "0",
            solBalanceAfter:
              pick("solBalanceAfter", "sol_balance_after")?.toString() ?? "0",
          });
          break;
        }
      } catch {
        // Skip individual tx fetch failures.
      }
    }

    const payload = { trades, fetchedAt: now };
    cache = { payload, ts: now };
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { trades: [], fetchedAt: now, errored: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}

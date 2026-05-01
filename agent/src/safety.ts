// Runtime safety guards for the agent.
//
//   1. Daily-trade kill-switch: refuse if more than `maxDailyTrades` have
//      executed in the rolling 24h window. Counter is in-memory only —
//      crash-restart resets it. Conservative default: a fresh process
//      starts allowed-to-trade.
//   2. NAV-floor guard: refuse trading when current NAV (USDC e6) is below
//      `navFloorBps` of the all-time-high we've observed. Defaults to
//      5000 bps (50 %). The ATH cache is in-memory; on restart we seed it
//      from the first NAV we observe (so a fresh process doesn't fail-open
//      after a drawdown unless the operator restarts pre-drawdown).
//   3. Pyth staleness: skip the tick if the on-chain SOL/USD price is
//      older than `pythMaxAgeSeconds`.
//
// Each guard exposes:
//   - a stateful checker that returns `{ ok: boolean; reason?: string }`
//   - the side-effect updaters used by the main loop.

import { Connection, PublicKey } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Daily-trade kill-switch
// ---------------------------------------------------------------------------

export class DailyTradeKillSwitch {
  private timestampsMs: number[] = [];

  constructor(private readonly maxDaily: number) {}

  /** Record that a trade just executed. */
  recordTrade(now: number = Date.now()): void {
    this.timestampsMs.push(now);
    this.prune(now);
  }

  /** Should the next trade be allowed? */
  check(now: number = Date.now()): { ok: boolean; reason?: string } {
    this.prune(now);
    if (this.timestampsMs.length >= this.maxDaily) {
      return {
        ok: false,
        reason: `kill_switch: ${this.timestampsMs.length} trades in last 24h ≥ ${this.maxDaily}`,
      };
    }
    return { ok: true };
  }

  /** Number of trades in the last 24h (for metrics). */
  count(now: number = Date.now()): number {
    this.prune(now);
    return this.timestampsMs.length;
  }

  private prune(now: number): void {
    const cutoff = now - 24 * 60 * 60 * 1000;
    this.timestampsMs = this.timestampsMs.filter((t) => t >= cutoff);
  }
}

// ---------------------------------------------------------------------------
// NAV floor
// ---------------------------------------------------------------------------

/**
 * `floorBps` is the *minimum* fraction of ATH (in bps) the NAV must hold.
 * `floorBps = 5000` → halt when NAV < 50 % of ATH.
 *
 * `manualOverride=true` short-circuits the check (set via env when the
 * operator decides to resume trading after a drawdown).
 */
export class NavFloorGuard {
  private athE6: bigint = 0n;

  constructor(
    private readonly floorBps: number,
    private readonly manualOverride: boolean = false,
  ) {}

  recordNav(navE6: bigint): void {
    if (navE6 > this.athE6) this.athE6 = navE6;
  }

  check(navE6: bigint): { ok: boolean; reason?: string } {
    if (this.manualOverride) return { ok: true };
    if (this.athE6 === 0n) return { ok: true }; // first observation
    const floor = (this.athE6 * BigInt(this.floorBps)) / 10_000n;
    if (navE6 < floor) {
      return {
        ok: false,
        reason: `nav_floor: nav=${navE6.toString()} < floor=${floor.toString()} (ath=${this.athE6.toString()}, floorBps=${this.floorBps})`,
      };
    }
    return { ok: true };
  }

  ath(): bigint {
    return this.athE6;
  }
}

// ---------------------------------------------------------------------------
// Pyth staleness
// ---------------------------------------------------------------------------

/**
 * Reads the Pyth `PriceUpdateV2` account header (no full deserialize) and
 * returns the publish_time. Verified against the live SOL/USD account on
 * devnet (134-byte buffer). The actual layout is:
 *
 *   8  bytes — Anchor discriminator
 *   32 bytes — write_authority
 *   1  byte  — verification_level enum tag (0=Partial(u8) / 1=Full)
 *   PriceFeedMessage:
 *     32  feed_id
 *     8   price (i64 LE)
 *     8   conf  (u64 LE)
 *     4   exponent (i32 LE)
 *     8   publish_time (i64 LE)        ← we want this
 *     8   prev_publish_time (i64 LE)
 *     8   ema_price (i64 LE)
 *     8   ema_conf (u64 LE)
 *   8  bytes — posted_slot
 *
 * publish_time offset = 8 + 32 + 1 + 32 + 8 + 8 + 4 = 93
 */
const PRICE_UPDATE_PUBLISH_TIME_OFFSET = 93;

export async function checkPythStaleness(
  connection: Connection,
  feedAccount: PublicKey,
  maxAgeSeconds: number,
  now: number = Math.floor(Date.now() / 1000),
): Promise<{ ok: boolean; reason?: string; ageSeconds?: number }> {
  const acc = await connection.getAccountInfo(feedAccount, "confirmed");
  if (!acc) {
    return { ok: false, reason: `pyth_stale: account ${feedAccount.toBase58()} not found` };
  }
  if (acc.data.length < PRICE_UPDATE_PUBLISH_TIME_OFFSET + 8) {
    return {
      ok: false,
      reason: `pyth_stale: account data too short (${acc.data.length} bytes)`,
    };
  }
  // i64 LE → number (safe up to 2^53; unix timestamps fit comfortably).
  const buf = Buffer.from(acc.data);
  const lo = buf.readUInt32LE(PRICE_UPDATE_PUBLISH_TIME_OFFSET);
  const hi = buf.readInt32LE(PRICE_UPDATE_PUBLISH_TIME_OFFSET + 4);
  const publishTime = hi * 0x1_0000_0000 + lo;
  const ageSeconds = now - publishTime;
  if (ageSeconds > maxAgeSeconds) {
    return {
      ok: false,
      reason: `pyth_stale: age=${ageSeconds}s > ${maxAgeSeconds}s`,
      ageSeconds,
    };
  }
  return { ok: true, ageSeconds };
}

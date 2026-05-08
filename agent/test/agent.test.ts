// Vitest unit tests for the agent's pure modules.
// Network-touching code paths (priceFeed.getRecentPrices, arcium.requestSignal,
// trader.executeTrade) are exercised by the integration tests in
// `tests/02_arcium.ts` / `tests/04_raydium.ts`. Here we verify only the
// deterministic logic — signal computation, decideTrade no-churn, and
// kill-switch / NAV-floor / window validation guards.

import { describe, expect, it } from "vitest";
import { mockComputeSignal } from "../src/arcium.js";
import { decideTrade } from "../src/trader.js";
import { DailyTradeKillSwitch, NavFloorGuard } from "../src/safety.js";
import { validateWindow } from "../src/priceFeed.js";

// ---------------------------------------------------------------------------
// mockComputeSignal — must mirror oracle.rs::ma_signal_reference
// ---------------------------------------------------------------------------

describe("mockComputeSignal", () => {
  const FAST_N = 10;
  const SLOW_N = 30;

  function rising(): bigint[] {
    const arr = new Array<bigint>(50).fill(100_000_000n);
    for (let i = 40; i < 50; i++) arr[i] = 120_000_000n + BigInt(i - 40) * 1_000_000n;
    return arr;
  }
  function flat(): bigint[] {
    return new Array<bigint>(50).fill(100_000_000n);
  }
  function declining(): bigint[] {
    const arr = new Array<bigint>(50).fill(120_000_000n);
    for (let i = 40; i < 50; i++) arr[i] = 80_000_000n - BigInt(i - 40) * 500_000n;
    return arr;
  }

  it("rising prices → 1", () => {
    expect(mockComputeSignal(rising(), FAST_N, SLOW_N, 0)).toBe(1);
  });
  it("flat prices → -1 (strict >)", () => {
    expect(mockComputeSignal(flat(), FAST_N, SLOW_N, 0)).toBe(-1);
  });
  it("declining prices → -1", () => {
    expect(mockComputeSignal(declining(), FAST_N, SLOW_N, 0)).toBe(-1);
  });
  it("threshold filters 0.5 % gap when th=500 bps", () => {
    const arr = new Array<bigint>(50).fill(100_000_000n);
    for (let i = 40; i < 50; i++) arr[i] = 100_500_000n;
    expect(mockComputeSignal(arr, FAST_N, SLOW_N, 0)).toBe(1);
    expect(mockComputeSignal(arr, FAST_N, SLOW_N, 500)).toBe(-1);
  });
  it("rejects wrong-length input", () => {
    expect(() => mockComputeSignal([1n, 2n, 3n], FAST_N, SLOW_N, 0)).toThrow();
  });
  it("rejects fast >= slow window sizes", () => {
    expect(() => mockComputeSignal(flat(), 30, 30, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// decideTrade — no-churn invariants
// ---------------------------------------------------------------------------

describe("decideTrade", () => {
  const balUsdcHeavy = { usdcE6: 100_000_000n, solLamports: 0n };
  const balSolHeavy = { usdcE6: 0n, solLamports: 1_000_000_000n };
  const balSplit = { usdcE6: 30_000_000n, solLamports: 300_000_000n };

  it("signal=1 + USDC available → opens long", () => {
    const a = decideTrade(1, "usdc", balUsdcHeavy);
    expect(a).not.toBeNull();
    expect((a!.direction as any).usdcToSol).toBeDefined();
    // 10 % of 100 USDC = 10 USDC.
    expect(a!.amountIn).toBe(10_000_000n);
    expect(a!.label).toBe("long_open");
  });
  it("signal=-1 + SOL available → closes long", () => {
    const a = decideTrade(-1, "sol", balSolHeavy);
    expect(a).not.toBeNull();
    expect((a!.direction as any).solToUsdc).toBeDefined();
    expect(a!.amountIn).toBe(100_000_000n);
    expect(a!.label).toBe("long_close");
  });
  it("signal=1 + only SOL → no churn (nothing to swap)", () => {
    expect(decideTrade(1, "sol", balSolHeavy)).toBeNull();
  });
  it("signal=-1 + only USDC → no churn (nothing to swap)", () => {
    expect(decideTrade(-1, "usdc", balUsdcHeavy)).toBeNull();
  });
  it("signal=1 + split → continues taper (still has USDC)", () => {
    const a = decideTrade(1, "split", balSplit);
    expect(a).not.toBeNull();
    expect((a!.direction as any).usdcToSol).toBeDefined();
  });
  it("signal=-1 + split → continues taper (still has SOL)", () => {
    const a = decideTrade(-1, "split", balSplit);
    expect(a).not.toBeNull();
    expect((a!.direction as any).solToUsdc).toBeDefined();
  });
  it("signal=0 → never trades (hold)", () => {
    expect(decideTrade(0, "sol", balSolHeavy)).toBeNull();
    expect(decideTrade(0, "usdc", balUsdcHeavy)).toBeNull();
    expect(decideTrade(0, "split", balSplit)).toBeNull();
  });
  it("zero source balance → null (no division by zero)", () => {
    expect(decideTrade(1, "usdc", { usdcE6: 0n, solLamports: 0n })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DailyTradeKillSwitch
// ---------------------------------------------------------------------------

describe("DailyTradeKillSwitch", () => {
  it("blocks after maxDaily trades", () => {
    const ks = new DailyTradeKillSwitch(2);
    expect(ks.check(1000).ok).toBe(true);
    ks.recordTrade(1000);
    expect(ks.check(2000).ok).toBe(true);
    ks.recordTrade(2000);
    expect(ks.check(3000).ok).toBe(false);
  });
  it("prunes after 24h", () => {
    const ks = new DailyTradeKillSwitch(2);
    ks.recordTrade(0);
    ks.recordTrade(1000);
    expect(ks.check(2000).ok).toBe(false);
    // Jump past the older + 24h boundary so both old timestamps are pruned.
    const farFuture = 24 * 60 * 60 * 1000 + 1001;
    expect(ks.check(farFuture).ok).toBe(true);
    expect(ks.count(farFuture)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// NavFloorGuard
// ---------------------------------------------------------------------------

describe("NavFloorGuard", () => {
  it("blocks below 50% of ATH", () => {
    const g = new NavFloorGuard(5000);
    g.recordNav(100n);
    expect(g.check(60n).ok).toBe(true); // 60 >= 50
    expect(g.check(49n).ok).toBe(false); // 49 < 50
  });
  it("first observation always passes (no ATH yet)", () => {
    const g = new NavFloorGuard(5000);
    expect(g.check(1n).ok).toBe(true);
  });
  it("manualOverride bypasses everything", () => {
    const g = new NavFloorGuard(5000, /* manualOverride= */ true);
    g.recordNav(1000n);
    expect(g.check(1n).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateWindow
// ---------------------------------------------------------------------------

describe("validateWindow", () => {
  function ticks(n: number): { closeE6: bigint; closeTimeSec: number }[] {
    return Array.from({ length: n }, (_, i) => ({
      closeE6: 100_000_000n,
      closeTimeSec: 1_700_000_000 + i * 60,
    }));
  }
  it("accepts a well-formed window", () => {
    expect(() => validateWindow(ticks(50))).not.toThrow();
  });
  it("rejects wrong length", () => {
    expect(() => validateWindow(ticks(49))).toThrow(/50 ticks/);
  });
  it("rejects non-positive close", () => {
    const t = ticks(50);
    t[10] = { ...t[10]!, closeE6: 0n };
    expect(() => validateWindow(t)).toThrow(/non-positive/);
  });
  it("rejects non-monotonic timestamps", () => {
    const t = ticks(50);
    t[20] = { ...t[20]!, closeTimeSec: t[10]!.closeTimeSec - 1 };
    expect(() => validateWindow(t)).toThrow(/non-monotonic/);
  });
});

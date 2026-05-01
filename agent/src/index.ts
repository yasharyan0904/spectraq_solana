// SpectraQ off-chain trading agent — main loop.
//
// PER-TICK FLOW (every TICK_INTERVAL_SEC):
//   1. priceFeed.getRecentPrices(50) — Binance primary, Pyth Hermes probe
//   2. safety.checkPythStaleness(on-chain feed) — skip tick if price > 60s
//   3. signal:
//        MOCK_MPC=true:  mockComputeSignal + stampMockSignal
//        MOCK_MPC=false: requestSignal → awaitSignal
//   4. readVaultBalances → decideTrade → executeTrade (with retries)
//   5. settle_pnl (always — keeps cached vault state honest)
//   6. emit metrics + structured log
//
// SIGINT/SIGTERM: drain in-flight tick, then exit. We do NOT abort an
// in-flight `executeTrade` mid-CPI — if that's interrupted the swap may
// or may not have landed; better to let the process finish the tick and
// observe state on the next start.

import * as path from "node:path";
import * as fs from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import anchor from "@coral-xyz/anchor";
import pino from "pino";

import { loadConfig, redactKeys, type AgentConfig } from "./config.js";
import {
  closesE6,
  getRecentPrices,
} from "./priceFeed.js";
import {
  awaitSignal,
  mockComputeSignal,
  requestSignal,
  stampMockSignal,
  type ArciumDeps,
  type Signal,
} from "./arcium.js";
import {
  decideTrade,
  executeTrade,
  readVaultBalances,
  type TraderDeps,
} from "./trader.js";
import {
  DailyTradeKillSwitch,
  NavFloorGuard,
  checkPythStaleness,
} from "./safety.js";
import {
  errorsTotal,
  lastSignalGauge,
  metrics,
  signalReceivedTotal,
  tickDurationMsGauge,
  ticksTotal,
  tradesExecutedTotal,
  vaultNavUsdcE6,
} from "./metrics.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function makeLogger(level: string) {
  return pino({
    level,
    redact: {
      paths: redactKeys,
      censor: "[REDACTED]",
    },
    formatters: { level: (label) => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : { target: "pino-pretty", options: { colorize: true } },
  });
}

function loadIdl(programId: PublicKey): anchor.Idl {
  const idlPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "target",
    "idl",
    "spectraq_vault.json",
  );
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8")) as anchor.Idl;
  // Ensure the IDL's address matches our config — guards against mixing a
  // local build with a deployed program id.
  const addr = (idl as any).address as string | undefined;
  if (addr && addr !== programId.toBase58()) {
    throw new Error(
      `IDL address ${addr} != configured program id ${programId.toBase58()}`,
    );
  }
  return idl;
}

// ---------------------------------------------------------------------------
// Per-tick worker
// ---------------------------------------------------------------------------

interface TickContext {
  cfg: AgentConfig;
  log: pino.Logger;
  connection: Connection;
  program: anchor.Program<any>;
  arcium: ArciumDeps;
  trader: TraderDeps;
  killSwitch: DailyTradeKillSwitch;
  navGuard: NavFloorGuard;
}

async function runOneTick(ctx: TickContext): Promise<void> {
  const tickStart = Date.now();
  ticksTotal.inc();
  const tickLog = ctx.log.child({ tick: ticksTotal.get() });

  try {
    // 1. Pyth on-chain staleness check.
    const stale = await checkPythStaleness(
      ctx.connection,
      ctx.cfg.pythSolUsdFeed,
      ctx.cfg.pythMaxAgeSeconds,
    );
    if (!stale.ok) {
      tickLog.warn({ reason: stale.reason }, "skip tick: pyth stale");
      return;
    }
    tickLog.debug({ ageSeconds: stale.ageSeconds }, "pyth fresh");

    // 2. Price window.
    const window = await getRecentPrices(
      ctx.cfg.pythSolUsdFeedIdHex,
      ctx.cfg.pythMaxAgeSeconds + 30,
    );
    const prices = closesE6(window);
    tickLog.debug(
      {
        source: window.source,
        firstE6: prices[0]!.toString(),
        lastE6: prices[49]!.toString(),
      },
      "price window",
    );

    // 3. Signal — mock or real.
    // FORCE_SIGNAL=1 / FORCE_SIGNAL=0 lets a demo operator pin the signal
    // for one or more ticks regardless of what the strategy says. Reads on
    // every tick so toggling it (without restarting the agent) takes effect
    // on the next tick. Only honored when MOCK_MPC=true.
    let signal: Signal;
    const forced = process.env.FORCE_SIGNAL;
    if (ctx.cfg.mockMpc && forced != null && (forced === "0" || forced === "1" || forced === "-1")) {
      signal = Number(forced) as Signal;
      tickLog.info({ signal, mode: "forced" }, "FORCE_SIGNAL override");
      await stampMockSignal(ctx.arcium, signal);
    } else if (ctx.cfg.mockMpc) {
      signal = mockComputeSignal(
        prices,
        ctx.cfg.strategyFastN,
        ctx.cfg.strategySlowN,
        ctx.cfg.strategyThresholdBps,
      );
      tickLog.info({ signal, mode: "mock" }, "computed signal locally");
      await stampMockSignal(ctx.arcium, signal);
    } else {
      const { computationOffset } = await requestSignal(ctx.arcium, prices);
      tickLog.info({ computationOffset: computationOffset.toString() }, "queued MPC");
      signal = await awaitSignal(ctx.arcium, 60_000);
      tickLog.info({ signal, mode: "real" }, "received signal from cluster");
    }
    signalReceivedTotal.inc();
    lastSignalGauge.set(signal);

    // 4. Decide + execute.
    const balances = await readVaultBalances(ctx.trader);
    tickLog.debug(
      {
        usdcE6: balances.usdcE6.toString(),
        solLamports: balances.solLamports.toString(),
        position: balances.position,
      },
      "vault balances",
    );

    // Compute NAV (USDC e6) for guards + metrics. Use the latest price tick
    // as the SOL valuation — we already validated the window.
    const lastPriceE6 = prices[49]!;
    const navE6 =
      balances.usdcE6 + (balances.solLamports * lastPriceE6) / 1_000_000_000n;
    ctx.navGuard.recordNav(navE6);
    vaultNavUsdcE6.set(Number(navE6));
    const navCheck = ctx.navGuard.check(navE6);
    if (!navCheck.ok) {
      tickLog.warn({ reason: navCheck.reason }, "skip trade: NAV floor breach");
      return;
    }
    const ks = ctx.killSwitch.check();
    if (!ks.ok) {
      tickLog.warn({ reason: ks.reason }, "skip trade: kill switch");
      return;
    }

    const action = decideTrade(signal, balances.position, balances);
    if (!action) {
      tickLog.info({ signal, position: balances.position }, "no-churn");
    } else {
      tickLog.info(
        { action: action.label, amountIn: action.amountIn.toString() },
        "executing trade",
      );
      try {
        const res = await executeTrade(ctx.trader, action);
        ctx.killSwitch.recordTrade();
        tradesExecutedTotal.inc();
        tickLog.info(
          { signature: res.signature, realizedOut: res.realizedOut.toString() },
          "trade landed",
        );
      } catch (e) {
        errorsTotal.inc();
        tickLog.error({ err: String(e) }, "trade failed (ignored)");
      }
    }

    // 5. Settle PnL — always run, even on no-churn, so the cached vault
    //    state stays honest.
    try {
      await (ctx.program.methods as any)
        .settlePnl()
        .accounts({
          agent: ctx.cfg.agentKeypair.publicKey,
          vaultState: ctx.cfg.vaultPubkey,
          usdcMint: ctx.cfg.usdcMint,
          solMint: ctx.cfg.wsolMint,
          usdcVault: getAssociatedTokenAddressSync(
            ctx.cfg.usdcMint,
            ctx.cfg.vaultPubkey,
            true,
          ),
          solVault: getAssociatedTokenAddressSync(
            ctx.cfg.wsolMint,
            ctx.cfg.vaultPubkey,
            true,
          ),
        })
        .signers([ctx.cfg.agentKeypair])
        .rpc({ commitment: "confirmed" });
    } catch (e) {
      // settle_pnl is informational; failures shouldn't crash the tick.
      tickLog.warn({ err: String(e) }, "settle_pnl failed (continuing)");
    }
  } catch (e) {
    errorsTotal.inc();
    tickLog.error({ err: String(e) }, "tick failed");
  } finally {
    tickDurationMsGauge.set(Date.now() - tickStart);
    tickLog.info({ metrics: metrics.snapshot() }, "tick complete");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const cfg = loadConfig();
  const log = makeLogger(cfg.logLevel);

  log.info(
    {
      cluster: cfg.cluster,
      programId: cfg.programId.toBase58(),
      vaultPubkey: cfg.vaultPubkey.toBase58(),
      agentPubkey: cfg.agentKeypair.publicKey.toBase58(),
      mockMpc: cfg.mockMpc,
      tickIntervalSec: cfg.tickIntervalSec,
    },
    "agent boot",
  );

  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(cfg.agentKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = loadIdl(cfg.programId);
  const program = new anchor.Program(idl, provider);

  const arcium: ArciumDeps = {
    program,
    connection,
    agent: cfg.agentKeypair,
    vaultPda: cfg.vaultPubkey,
    clusterOffset: cfg.arciumClusterOffset,
    strategy: {
      fastN: cfg.strategyFastN,
      slowN: cfg.strategySlowN,
      thresholdBps: cfg.strategyThresholdBps,
    },
  };
  const trader: TraderDeps = {
    program,
    connection,
    agent: cfg.agentKeypair,
    vaultPda: cfg.vaultPubkey,
    usdcMint: cfg.usdcMint,
    wsolMint: cfg.wsolMint,
    pythSolUsdFeed: cfg.pythSolUsdFeed,
    jupiterProgramId: cfg.jupiterProgramId,
  };
  const killSwitch = new DailyTradeKillSwitch(cfg.maxDailyTrades);
  const navGuard = new NavFloorGuard(
    cfg.navFloorBps,
    /* manualOverride= */ process.env.NAV_FLOOR_OVERRIDE === "true",
  );

  const ctx: TickContext = {
    cfg,
    log,
    connection,
    program,
    arcium,
    trader,
    killSwitch,
    navGuard,
  };

  let stop = false;
  let inFlight: Promise<void> | null = null;
  const onSignal = (sig: string) => {
    log.info({ sig }, "shutdown requested; draining in-flight tick");
    stop = true;
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  while (!stop) {
    inFlight = runOneTick(ctx);
    await inFlight;
    inFlight = null;
    if (stop) break;
    await new Promise((r) => setTimeout(r, cfg.tickIntervalSec * 1000));
  }
  if (inFlight) await inFlight;
  log.info("agent stopped cleanly");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("agent fatal:", e);
  process.exit(1);
});

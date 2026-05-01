// Typed config loader for the SpectraQ trading agent.
//
// Reads .env (workspace root) on import. Throws early on missing/invalid
// values so we never enter the main loop with half-set state.
//
// PUBLIC INVARIANTS:
//   - We never expose `agentKeypair` or `adminKeypair` raw — only as
//     `Keypair` instances that the rest of the agent passes around.
//   - `redactKeys` lists fields the pino logger MUST redact. Any new
//     secret-bearing field added here must also be added to `redactKeys`.

import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "..", "..");
dotenv.config({ path: path.join(WORKSPACE_ROOT, ".env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

function asInt(v: string, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`Env var ${name} must be a non-negative integer; got "${v}"`);
  }
  return n;
}

function loadKeypair(absPath: string): Keypair {
  const raw = fs.readFileSync(absPath, "utf8");
  const arr = JSON.parse(raw) as number[];
  if (!Array.isArray(arr) || arr.length !== 64) {
    throw new Error(`Keypair file ${absPath} is not a 64-byte secret-key JSON array`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export interface AgentConfig {
  rpcUrl: string;
  cluster: "devnet" | "mainnet-beta" | "localnet";
  programId: PublicKey;

  // Wallets — admin is optional; only required when running MOCK_MPC=true
  // and the agent process is the same machine as the deploy admin.
  agentKeypair: Keypair;
  adminKeypair?: Keypair;

  // Vault. If VAULT_PUBKEY is set we use it directly; otherwise we derive
  // the vault PDA from the admin pubkey (admin keypair must be loaded).
  vaultPubkey: PublicKey;

  // Mints
  usdcMint: PublicKey;
  wsolMint: PublicKey;

  // Oracle
  pythSolUsdFeed: PublicKey;
  pythSolUsdFeedIdHex: string;
  pythMaxAgeSeconds: number;

  // Arcium
  arciumClusterOffset: number;

  // Strategy
  strategyFastN: number;
  strategySlowN: number;
  strategyThresholdBps: number;

  // Runtime
  mockMpc: boolean;
  tickIntervalSec: number;
  maxDailyTrades: number;
  navFloorBps: number;
  logLevel: string;

  // Jupiter
  jupiterProgramId: PublicKey;
  jupiterQuoteApi: string;
  jupiterSwapInstructionsApi: string;
}

const SOL_USD_FEED_ID_HEX_DEFAULT =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

export function loadConfig(): AgentConfig {
  const programId = new PublicKey(required("SPECTRAQ_PROGRAM_ID"));
  const agentKeypair = loadKeypair(required("AGENT_KEYPAIR_PATH"));

  // Admin keypair is required when MOCK_MPC=true AND we plan to derive
  // the vault PDA from it (instead of using a literal VAULT_PUBKEY).
  const adminPath = process.env.ANCHOR_WALLET;
  const adminKeypair = adminPath ? loadKeypair(adminPath) : undefined;

  const vaultPubkeyRaw = process.env.VAULT_PUBKEY?.trim();
  const vaultPubkey = (() => {
    if (vaultPubkeyRaw) return new PublicKey(vaultPubkeyRaw);
    if (!adminKeypair) {
      throw new Error(
        "VAULT_PUBKEY not set and ANCHOR_WALLET (admin) not provided — " +
          "cannot derive vault PDA",
      );
    }
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), adminKeypair.publicKey.toBuffer()],
      programId,
    );
    return pda;
  })();

  const cluster = optional("SOLANA_CLUSTER", "devnet") as AgentConfig["cluster"];

  return {
    rpcUrl: required("HELIUS_RPC_URL"),
    cluster,
    programId,
    agentKeypair,
    adminKeypair,
    vaultPubkey,
    usdcMint: new PublicKey(required("USDC_MINT")),
    wsolMint: new PublicKey(required("WSOL_MINT")),
    pythSolUsdFeed: new PublicKey(required("PYTH_SOL_USD_FEED")),
    pythSolUsdFeedIdHex: optional(
      "PYTH_SOL_USD_FEED_ID_HEX",
      SOL_USD_FEED_ID_HEX_DEFAULT,
    ),
    pythMaxAgeSeconds: asInt(optional("PYTH_MAX_AGE_SECONDS", "60"), "PYTH_MAX_AGE_SECONDS"),
    arciumClusterOffset: asInt(
      optional("ARCIUM_CLUSTER_OFFSET", "456"),
      "ARCIUM_CLUSTER_OFFSET",
    ),
    strategyFastN: asInt(optional("STRATEGY_FAST_N", "10"), "STRATEGY_FAST_N"),
    strategySlowN: asInt(optional("STRATEGY_SLOW_N", "30"), "STRATEGY_SLOW_N"),
    strategyThresholdBps: asInt(
      optional("STRATEGY_THRESHOLD_BPS", "0"),
      "STRATEGY_THRESHOLD_BPS",
    ),
    mockMpc: optional("MOCK_MPC", "true").toLowerCase() === "true",
    tickIntervalSec: asInt(optional("TICK_INTERVAL_SEC", "60"), "TICK_INTERVAL_SEC"),
    maxDailyTrades: asInt(optional("MAX_DAILY_TRADES", "24"), "MAX_DAILY_TRADES"),
    navFloorBps: asInt(optional("NAV_FLOOR_BPS", "5000"), "NAV_FLOOR_BPS"),
    logLevel: optional("LOG_LEVEL", "info"),
    jupiterProgramId: new PublicKey(
      optional("JUPITER_PROGRAM_ID", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"),
    ),
    // Jupiter retired the public v6 host — Pro/Station with x-api-key is the
    // only live surface. JUPITER_API_KEY is required for routes to resolve.
    jupiterQuoteApi: optional(
      "JUPITER_QUOTE_API",
      "https://api.jup.ag/swap/v1/quote",
    ),
    jupiterSwapInstructionsApi: optional(
      "JUPITER_SWAP_INSTRUCTIONS_API",
      "https://api.jup.ag/swap/v1/swap-instructions",
    ),
  };
}

/**
 * Field paths for `pino-redact` style redaction. Anything containing
 * "secret", "key" (without "publicKey"), or "keypair" is filtered out of
 * structured logs.
 */
export const redactKeys: string[] = [
  "agentKeypair",
  "adminKeypair",
  "*.secretKey",
  "*.privateKey",
  "*.keypair",
  "JUPITER_API_KEY",
  "HELIUS_API_KEY",
];

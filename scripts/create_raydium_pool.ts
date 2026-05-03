// One-time helper: create a Raydium CPMM pool on Solana devnet seeded with
// USDC + wSOL liquidity. The pool ID gets appended to .env so the agent
// (and the on-chain `execute_trade`) can reference it on every subsequent
// run.
//
// Usage:
//   ANCHOR_WALLET=~/.config/solana/id.json \
//     pnpm exec ts-node --transpile-only scripts/create_raydium_pool.ts
//
// Idempotent: if RAYDIUM_USDC_SOL_POOL is already set in .env and the pool
// account exists on devnet, this script skips creation and exits 0.
//
// Funding source: ANCHOR_WALLET (i.e. the deploy authority). Default seed
// is 30 USDC + ~0.36 SOL, set via DEMO_POOL_USDC_AMOUNT (e6 atomic) and
// DEMO_POOL_SOL_AMOUNT (lamports). Pool ratio determines the initial
// price; we pick ~$84/SOL to roughly match market.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  Raydium,
  TxVersion,
  DEVNET_PROGRAM_ID,
  getPdaAmmConfigId,
  getCreatePoolKeys,
} from "@raydium-io/raydium-sdk-v2";
import {
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import dotenv from "dotenv";

const { BN } = anchor;

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const RPC_URL = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const WSOL_MINT = NATIVE_MINT;

// Defaults: 30 USDC (6 decimals = 30_000_000) + 0.36 SOL (lamports = 360_000_000)
// Initial price ≈ 30/0.36 ≈ $83/SOL — close to current market.
const POOL_USDC_AMOUNT = BigInt(
  process.env.DEMO_POOL_USDC_AMOUNT || "30000000",
);
const POOL_SOL_AMOUNT = BigInt(
  process.env.DEMO_POOL_SOL_AMOUNT || "360000000",
);

function loadKeypair(absPath: string): Keypair {
  const raw = fs.readFileSync(absPath, "utf8");
  const arr = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

function writeEnv(upserts: Record<string, string>): void {
  const envPath = path.join(ROOT, ".env");
  let content = fs.readFileSync(envPath, "utf8");
  for (const [k, v] of Object.entries(upserts)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, `${k}=${v}`);
    } else {
      content += `${content.endsWith("\n") ? "" : "\n"}${k}=${v}\n`;
    }
  }
  fs.writeFileSync(envPath, content);
}

async function main(): Promise<void> {
  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME!, ".config", "solana", "id.json");
  const owner = loadKeypair(walletPath);
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("─── Raydium CPMM pool registration (devnet) ───");
  console.log("payer       :", owner.publicKey.toBase58());
  console.log("USDC mint   :", USDC_MINT.toBase58());
  console.log("wSOL mint   :", WSOL_MINT.toBase58());

  // ─── Detect existing pool (canonical mint order) ───────────────────────
  // CPMM pool ID is a deterministic PDA derived from (configId, mintA, mintB)
  // where mints are in canonical sort order. Try both orderings; if either
  // address has a pool account, register it in .env and exit.
  const cpmmProgramId = DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM;
  const cpmmAuthority = DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_AUTH;
  const configId = getPdaAmmConfigId(cpmmProgramId, 0).publicKey;

  // Try wSOL=A USDC=B first since that's the order Raydium SDK actually
  // canonicalizes to for this mint pair on devnet (verified empirically).
  for (const [mA, mB] of [
    [WSOL_MINT, USDC_MINT] as const,
    [USDC_MINT, WSOL_MINT] as const,
  ]) {
    const keys = getCreatePoolKeys({
      programId: cpmmProgramId,
      configId,
      mintA: mA,
      mintB: mB,
    });
    const info = await connection.getAccountInfo(keys.poolId);
    if (info && info.owner.equals(cpmmProgramId)) {
      console.log("\n✓ pool already exists — registering");
      console.log("pool id     :", keys.poolId.toBase58());
      console.log("mint A      :", mA.toBase58());
      console.log("mint B      :", mB.toBase58());
      console.log("vault A     :", keys.vaultA.toBase58());
      console.log("vault B     :", keys.vaultB.toBase58());
      console.log("lp mint     :", keys.lpMint.toBase58());
      console.log("observation :", keys.observationId.toBase58());
      try {
        const aBal = await connection.getTokenAccountBalance(keys.vaultA);
        const bBal = await connection.getTokenAccountBalance(keys.vaultB);
        console.log(
          "reserves    :",
          `${aBal.value.uiAmountString} (A) / ${bBal.value.uiAmountString} (B)`,
        );
      } catch {
        /* ignore */
      }
      writeEnv({
        RAYDIUM_CPMM_PROGRAM_ID: cpmmProgramId.toBase58(),
        RAYDIUM_CPMM_POOL_AUTH: cpmmAuthority.toBase58(),
        RAYDIUM_USDC_SOL_POOL: keys.poolId.toBase58(),
        RAYDIUM_USDC_SOL_LP_MINT: keys.lpMint.toBase58(),
        RAYDIUM_USDC_SOL_VAULT_A: keys.vaultA.toBase58(),
        RAYDIUM_USDC_SOL_VAULT_B: keys.vaultB.toBase58(),
        RAYDIUM_USDC_SOL_CONFIG_ID: configId.toBase58(),
        RAYDIUM_USDC_SOL_OBSERVATION: keys.observationId.toBase58(),
        RAYDIUM_USDC_SOL_MINT_A: mA.toBase58(),
        RAYDIUM_USDC_SOL_MINT_B: mB.toBase58(),
      });
      console.log("\n✓ .env updated — no liquidity seeding required");
      return;
    }
  }

  console.log(
    "\nno existing pool found — proceeding to seed",
    `${Number(POOL_USDC_AMOUNT) / 1e6} USDC  +  ${Number(POOL_SOL_AMOUNT) / 1e9} SOL`,
  );

  // ─── Wrap SOL into wSOL ─────────────────────────────────────────────────
  // CPMM pool init expects an SPL token on both sides; native SOL must be
  // wrapped to the canonical wSOL mint first. We create the ATA and sync.
  const ownerWsolAta = getAssociatedTokenAddressSync(WSOL_MINT, owner.publicKey);
  const wsolAtaInfo = await connection.getAccountInfo(ownerWsolAta);
  const wrapInstructions: TransactionInstruction[] = [];
  if (!wsolAtaInfo) {
    wrapInstructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        owner.publicKey,
        ownerWsolAta,
        owner.publicKey,
        WSOL_MINT,
      ),
    );
  }
  const currentWsolBal = wsolAtaInfo
    ? BigInt(
        (
          await connection.getTokenAccountBalance(ownerWsolAta)
        ).value.amount,
      )
    : 0n;
  if (currentWsolBal < POOL_SOL_AMOUNT) {
    const need = POOL_SOL_AMOUNT - currentWsolBal;
    console.log(`  wrapping ${Number(need) / 1e9} SOL → wSOL`);
    wrapInstructions.push(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: ownerWsolAta,
        lamports: Number(need),
      }),
      createSyncNativeInstruction(ownerWsolAta),
    );
  }
  if (wrapInstructions.length > 0) {
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: owner.publicKey,
        recentBlockhash: blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
          ...wrapInstructions,
        ],
      }).compileToV0Message(),
    );
    tx.sign([owner]);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`  wrap tx: ${sig}`);
  }

  // ─── Initialize Raydium SDK V2 ──────────────────────────────────────────
  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: "devnet" as any,
    disableFeatureCheck: true,
    blockhashCommitment: "confirmed",
  });

  // ─── Choose a fee config ────────────────────────────────────────────────
  // getCpmmConfigs() returns the mainnet-published configs. On devnet we
  // remap the `id` field by deriving the equivalent PDA against the devnet
  // CREATE_CPMM_POOL_PROGRAM. Index 0 (lowest fee tier) is what we want.
  const allConfigs = await raydium.api.getCpmmConfigs();
  const feeConfigs = allConfigs.map((cfg) => {
    const devnetId = getPdaAmmConfigId(
      DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
      cfg.index,
    ).publicKey;
    return { ...cfg, id: devnetId.toBase58() };
  });
  const feeConfig = feeConfigs[0]!;
  console.log("fee config  :", feeConfig.id, ` (index=${feeConfig.index})`);

  // ─── Build & send createPool ────────────────────────────────────────────
  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
    mintA: {
      address: USDC_MINT.toBase58(),
      decimals: 6,
      programId: TOKEN_PROGRAM_ID.toBase58(),
    } as any,
    mintB: {
      address: WSOL_MINT.toBase58(),
      decimals: 9,
      programId: TOKEN_PROGRAM_ID.toBase58(),
    } as any,
    mintAAmount: new BN(POOL_USDC_AMOUNT.toString()),
    mintBAmount: new BN(POOL_SOL_AMOUNT.toString()),
    startTime: new BN(0),
    feeConfig,
    associatedOnly: false,
    ownerInfo: { useSOLBalance: true },
    txVersion: TxVersion.V0,
  });

  const { txId } = await execute({ sendAndConfirm: true });
  console.log("\n─── pool created ───");
  console.log("create tx   :", txId);
  console.log("pool id     :", extInfo.address.poolId.toBase58());
  console.log("config id   :", extInfo.address.configId.toBase58());
  console.log("authority   :", extInfo.address.authority.toBase58());
  console.log("lp mint     :", extInfo.address.lpMint.toBase58());
  console.log("vault A     :", extInfo.address.vaultA.toBase58());
  console.log("vault B     :", extInfo.address.vaultB.toBase58());
  console.log(
    "observation :",
    extInfo.address.observationId.toBase58(),
  );

  // ─── Persist to .env ────────────────────────────────────────────────────
  writeEnv({
    RAYDIUM_CPMM_PROGRAM_ID: cpmmProgramId.toBase58(),
    RAYDIUM_CPMM_POOL_AUTH: cpmmAuthority.toBase58(),
    RAYDIUM_USDC_SOL_POOL: extInfo.address.poolId.toBase58(),
    RAYDIUM_USDC_SOL_LP_MINT: extInfo.address.lpMint.toBase58(),
    RAYDIUM_USDC_SOL_VAULT_A: extInfo.address.vaultA.toBase58(),
    RAYDIUM_USDC_SOL_VAULT_B: extInfo.address.vaultB.toBase58(),
    RAYDIUM_USDC_SOL_CONFIG_ID: extInfo.address.configId.toBase58(),
    RAYDIUM_USDC_SOL_OBSERVATION: extInfo.address.observationId.toBase58(),
    RAYDIUM_USDC_SOL_MINT_A: extInfo.address.mintA.address,
    RAYDIUM_USDC_SOL_MINT_B: extInfo.address.mintB.address,
  });
  console.log("\n✓ .env updated");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("\nfatal:", e);
  process.exit(1);
});

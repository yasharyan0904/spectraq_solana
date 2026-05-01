// seed_demo_funds.ts — deposits demo capital into the SpectraQ vault.
//
// Reuses the admin wallet (loaded from ANCHOR_WALLET) as the demo
// depositor. The non-custodial guarantee is structural — agent != admin —
// so admin doubling as demo user does not weaken the invariant.
//
// What it does (idempotent):
//   1. Ensure the user's wSOL ATA exists; wrap WRAP_SOL_LAMPORTS lamports.
//   2. Deposit DEMO_USDC_AMOUNT_E6 USDC.
//   3. Deposit DEMO_SOL_AMOUNT_LAMPORTS wSOL using the live Pyth feed.
//
// Defaults: 10 USDC and 0.1 SOL — small enough for a demo wallet, large
// enough that share math is non-degenerate.

import * as fs from "node:fs";
import * as path from "node:path";

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const { AnchorProvider, Program, Wallet, BN } = anchor;

const ROOT = path.resolve(__dirname, "..");

function loadEnv() {
  for (const p of [".env", ".env.demo"]) {
    const file = path.join(ROOT, p);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] === undefined) {
        let v = m[2].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        v = v.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, k) => process.env[k] ?? "");
        process.env[m[1]] = v;
      }
    }
  }
}

function loadKeypair(p: string): Keypair {
  const expanded = p.replace(/^~/, process.env.HOME ?? "");
  const data = JSON.parse(fs.readFileSync(expanded, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

const VAULT_SEED = Buffer.from("vault");
const SHARE_MINT_SEED = Buffer.from("share_mint");
const POSITION_SEED = Buffer.from("position");

async function main() {
  loadEnv();

  const rpc = process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";
  const programId = new PublicKey(
    process.env.SPECTRAQ_PROGRAM_ID ??
      "96fHw6FzHUB8gAPPUUWRpyZuWo2NRPHJtJYcm7ERfugN",
  );
  const usdcMint = new PublicKey(
    process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  );
  const wsolMint = new PublicKey(
    process.env.WSOL_MINT ?? "So11111111111111111111111111111111111111112",
  );
  const pythFeed = new PublicKey(
    process.env.PYTH_SOL_USD_FEED ?? "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
  );

  const usdcAmount = BigInt(process.env.DEMO_USDC_AMOUNT_E6 ?? "10000000"); // 10 USDC
  const solLamports = BigInt(process.env.DEMO_SOL_AMOUNT_LAMPORTS ?? "100000000"); // 0.1 SOL
  // Caller-asserted SOL/USDC price for the deposit_usdc bounds check; only
  // used when sol_balance > 0. Pyth would replace this in a real client; for
  // the demo we pin to 100e6 which is comfortably inside MIN/MAX bounds.
  const usdcCallerPriceE6 = new BN(100_000_000);

  const adminPath = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  const admin = loadKeypair(adminPath);

  const connection = new Connection(rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(admin), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idlPath = path.join(ROOT, "target", "idl", "spectraq_vault.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  if (!idl.address) idl.address = programId.toBase58();
  const program = new Program(idl, provider);

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, admin.publicKey.toBuffer()],
    programId,
  );
  const [shareMintPda] = PublicKey.findProgramAddressSync(
    [SHARE_MINT_SEED, vaultPda.toBuffer()],
    programId,
  );
  const [userPositionPda] = PublicKey.findProgramAddressSync(
    [POSITION_SEED, vaultPda.toBuffer(), admin.publicKey.toBuffer()],
    programId,
  );
  const usdcVaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
  const solVaultAta = getAssociatedTokenAddressSync(wsolMint, vaultPda, true);
  const userUsdcAta = getAssociatedTokenAddressSync(usdcMint, admin.publicKey);
  const userWsolAta = getAssociatedTokenAddressSync(wsolMint, admin.publicKey);
  const userShareAta = getAssociatedTokenAddressSync(shareMintPda, admin.publicKey);

  console.log("[seed] depositor   :", admin.publicKey.toBase58());
  console.log("[seed] vault PDA   :", vaultPda.toBase58());

  // ── Preflight ────────────────────────────────────────────────────────────
  const vaultExists = await connection.getAccountInfo(vaultPda, "confirmed");
  if (!vaultExists) {
    console.error(
      "[seed] vault PDA not initialized — run scripts/initialize_vault.ts first.",
    );
    process.exit(1);
  }

  const userUsdc = await connection.getAccountInfo(userUsdcAta, "confirmed");
  if (!userUsdc) {
    console.error(
      `[seed] depositor has no USDC ATA at ${userUsdcAta.toBase58()}.\n` +
        `       Faucet devnet USDC at https://faucet.circle.com/ to ${admin.publicKey.toBase58()}, then re-run.`,
    );
    process.exit(1);
  }

  // ── 1. Wrap SOL → wSOL into the depositor's ATA ─────────────────────────
  console.log(`[seed] wrapping ${Number(solLamports) / 1e9} SOL into wSOL …`);
  const wrapTx = new Transaction();
  wrapTx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      admin.publicKey,
      userWsolAta,
      admin.publicKey,
      wsolMint,
    ),
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: userWsolAta,
      lamports: Number(solLamports),
    }),
    createSyncNativeInstruction(userWsolAta),
  );
  const wrapSig = await provider.sendAndConfirm(wrapTx, [admin]);
  console.log("[seed] wrap tx:", wrapSig);

  // ── 2. deposit_usdc ─────────────────────────────────────────────────────
  console.log(`[seed] depositing ${Number(usdcAmount) / 1e6} USDC …`);
  const usdcSig = await (program.methods as any)
    .depositUsdc(new BN(usdcAmount.toString()), usdcCallerPriceE6)
    .accounts({
      user: admin.publicKey,
      vaultState: vaultPda,
      usdcMint,
      shareMint: shareMintPda,
      usdcVault: usdcVaultAta,
      userUsdcAccount: userUsdcAta,
      userShareAccount: userShareAta,
      userPosition: userPositionPda,
    })
    .signers([admin])
    .rpc();
  console.log("[seed] deposit_usdc tx:", usdcSig);
  console.log(
    `[seed] explorer: https://explorer.solana.com/tx/${usdcSig}?cluster=devnet`,
  );

  // ── 3. deposit_sol (uses live Pyth push account) ────────────────────────
  console.log(`[seed] depositing ${Number(solLamports) / 1e9} wSOL …`);
  const solSig = await (program.methods as any)
    .depositSol(new BN(solLamports.toString()))
    .accounts({
      user: admin.publicKey,
      vaultState: vaultPda,
      solMint: wsolMint,
      shareMint: shareMintPda,
      solVault: solVaultAta,
      userSolAccount: userWsolAta,
      userShareAccount: userShareAta,
      userPosition: userPositionPda,
      priceUpdate: pythFeed,
    })
    .signers([admin])
    .rpc();
  console.log("[seed] deposit_sol tx:", solSig);
  console.log(
    `[seed] explorer: https://explorer.solana.com/tx/${solSig}?cluster=devnet`,
  );

  const vaultState: any = await (program.account as any).vaultState.fetch(vaultPda);
  console.log("[seed] post-deposit vault state:");
  console.log("        usdc_balance :", vaultState.usdcBalance.toString());
  console.log("        sol_balance  :", vaultState.solBalance.toString());
  console.log("        total_shares :", vaultState.totalShares.toString());
}

main().catch((e) => {
  console.error("[seed] FAILED:", e);
  process.exit(1);
});

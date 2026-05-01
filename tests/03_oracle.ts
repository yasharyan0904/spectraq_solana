import anchor from "@coral-xyz/anchor";
import type { Program, Wallet } from "@coral-xyz/anchor";
const { BN } = anchor;
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";

import type { SpectraqVault } from "../target/types/spectraq_vault";

// ============================================================================
// 03_oracle.ts — Pyth integration smoke tests for deposit_sol.
//
// Uses real devnet Pyth push-oracle accounts (continuously refreshed by the
// Pyth network). Each test spins up a fresh vault PDA so they are
// independent across re-runs.
//
// Coverage matrix:
//   - Happy path        → deposit 0.1 SOL with the live SOL/USD feed account.
//   - Wrong feed id     → init the vault with the SOL/USD feed id, then pass
//                         the USDC/USD push account to deposit_sol → expects
//                         InvalidPythFeed (MismatchedFeedId).
//
// PriceStale and PriceOutOfBounds are exercised in pure-Rust unit tests at
// programs/spectraq_vault/src/oracle.rs (we can't easily make a live Pyth
// account stale or out-of-bounds on devnet without bankrun).
// ============================================================================

const VAULT_SEED = Buffer.from("vault");
const SHARE_MINT_SEED = Buffer.from("share_mint");
const POSITION_SEED = Buffer.from("position");

const SOL_USD_FEED_ID_HEX =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const SOL_USD_FEED_ID: number[] = Array.from(
  Buffer.from(SOL_USD_FEED_ID_HEX, "hex"),
);
// Devnet Pyth push-oracle PDAs (shard 0, derived from feed_id).
const SOL_USD_PRICE_PDA = new PublicKey(
  "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
);
const USDC_USD_PRICE_PDA = new PublicKey(
  "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX",
);

describe("spectraq_vault — Pyth oracle (deposit_sol)", function () {
  this.timeout(120_000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SpectraqVault as Program<SpectraqVault>;
  const connection = provider.connection;

  const payer = (provider.wallet as Wallet).payer;
  const admin = Keypair.generate();
  const agent = Keypair.generate();
  const user = Keypair.generate();

  let usdcMint: PublicKey;
  let solMint: PublicKey;
  let userUsdcAta: PublicKey;
  let userSolAta: PublicKey;
  let vaultStatePda: PublicKey;
  let shareMintPda: PublicKey;
  let usdcVaultAta: PublicKey;
  let solVaultAta: PublicKey;
  let userPositionPda: PublicKey;
  let userShareAta: PublicKey;

  before(async () => {
    // Fund admin / agent / user.
    const fundTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: admin.publicKey,
        lamports: 0.5 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: user.publicKey,
        lamports: 0.5 * LAMPORTS_PER_SOL,
      }),
    );
    await provider.sendAndConfirm(fundTx, [payer]);

    // Local "USDC" + "SOL" mints. The vault treats sol_mint as opaque SPL.
    usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);
    solMint = await createMint(connection, admin, admin.publicKey, null, 9);
    userUsdcAta = (
      await getOrCreateAssociatedTokenAccount(connection, user, usdcMint, user.publicKey)
    ).address;
    userSolAta = (
      await getOrCreateAssociatedTokenAccount(connection, user, solMint, user.publicKey)
    ).address;
    await mintTo(connection, admin, usdcMint, userUsdcAta, admin, 200_000_000n); // 200 USDC
    await mintTo(connection, admin, solMint, userSolAta, admin, 1_000_000_000n); // 1 SOL

    [vaultStatePda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, admin.publicKey.toBuffer()],
      program.programId,
    );
    [shareMintPda] = PublicKey.findProgramAddressSync(
      [SHARE_MINT_SEED, vaultStatePda.toBuffer()],
      program.programId,
    );
    usdcVaultAta = getAssociatedTokenAddressSync(usdcMint, vaultStatePda, true);
    solVaultAta = getAssociatedTokenAddressSync(solMint, vaultStatePda, true);
    [userPositionPda] = PublicKey.findProgramAddressSync(
      [POSITION_SEED, vaultStatePda.toBuffer(), user.publicKey.toBuffer()],
      program.programId,
    );
    userShareAta = getAssociatedTokenAddressSync(shareMintPda, user.publicKey);

    // Initialize vault with the SOL/USD feed id.
    await program.methods
      .initializeVault(SOL_USD_FEED_ID as any)
      .accounts({
        admin: admin.publicKey,
        agent: agent.publicKey,
        usdcMint,
        solMint,
      } as any)
      .signers([admin])
      .rpc();

    // Seed with 100 USDC so deposit_sol uses the proportional-shares path.
    await program.methods
      .depositUsdc(new BN(100_000_000), new BN(100_000_000))
      .accounts({
        user: user.publicKey,
        vaultState: vaultStatePda,
        usdcMint,
        shareMint: shareMintPda,
        usdcVault: usdcVaultAta,
        userUsdcAccount: userUsdcAta,
        userShareAccount: userShareAta,
        userPosition: userPositionPda,
      } as any)
      .signers([user])
      .rpc();
  });

  it("happy path — deposit_sol uses live SOL/USD push oracle", async () => {
    const before = await program.account.vaultState.fetch(vaultStatePda);
    const sharesBefore = new BN(before.totalShares.toString());

    const amount = new BN(100_000_000); // 0.1 "SOL"
    await program.methods
      .depositSol(amount)
      .accounts({
        user: user.publicKey,
        vaultState: vaultStatePda,
        solMint,
        shareMint: shareMintPda,
        solVault: solVaultAta,
        userSolAccount: userSolAta,
        userShareAccount: userShareAta,
        userPosition: userPositionPda,
        priceUpdate: SOL_USD_PRICE_PDA,
      } as any)
      .signers([user])
      .rpc({ skipPreflight: true });

    const after = await program.account.vaultState.fetch(vaultStatePda);
    assert.equal(after.solBalance.toString(), amount.toString());

    // total_shares grew by ~ (amount * sol_price) / 1e9 expressed in USDC e6.
    // With SOL ≈ $100–250 in normal markets, expected new shares per 0.1 SOL
    // are between $10 and $25, i.e. 10_000_000…25_000_000 e6. Use loose
    // bounds to avoid flakiness on real-time price moves.
    const sharesDelta = new BN(after.totalShares.toString()).sub(sharesBefore);
    assert.isAbove(
      Number(sharesDelta.toString()),
      5_000_000,
      "expected at least $5 of new shares",
    );
    assert.isBelow(
      Number(sharesDelta.toString()),
      100_000_000,
      "expected at most $100 of new shares",
    );

    const solVault = await getAccount(connection, solVaultAta);
    assert.equal(solVault.amount.toString(), amount.toString());
  });

  it("rejects deposit_sol when the wrong Pyth feed account is supplied", async () => {
    // USDC/USD has a different feed id; the SDK's `get_price_no_older_than`
    // returns MismatchedFeedId, which the oracle wrapper maps to
    // VaultError::InvalidPythFeed.
    let threw = false;
    try {
      await program.methods
        .depositSol(new BN(100_000_000))
        .accounts({
          user: user.publicKey,
          vaultState: vaultStatePda,
          solMint,
          shareMint: shareMintPda,
          solVault: solVaultAta,
          userSolAccount: userSolAta,
          userShareAccount: userShareAta,
          userPosition: userPositionPda,
          priceUpdate: USDC_USD_PRICE_PDA,
        } as any)
        .signers([user])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /InvalidPythFeed/);
    }
    assert.isTrue(threw, "expected InvalidPythFeed");
  });
});

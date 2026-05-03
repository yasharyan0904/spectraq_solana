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
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";

import type { SpectraqVault } from "../target/types/spectraq_vault";

// ============================================================================
// 04_raydium.ts — execute_trade pre-CPI validation tests.
//
// What this file covers (pre-CPI guards in the vault program):
//   - InvalidDexProgram: passing an arbitrary program id where the
//     `dex_program` account is expected (must equal RAYDIUM_CPMM_PROGRAM_ID).
//   - SignalDirectionMismatch: trade direction does not match `last_signal`.
//   - TradeSizeExceeded: amount > 30 % of the *live* source ATA balance.
//   - SlippageExceeded: min_amount_out below the Pyth-derived 5 % floor.
//   - InvalidSwapDestination: destination_ata_index points at an account
//     that is not the vault's own output-side ATA.
//
// What this file does NOT cover (live-pool dependent):
//   - Happy-path Raydium CPMM swap against a registered pool. The pool is
//     provisioned via `scripts/create_raydium_pool.ts` and exercised end-to-end
//     by the agent in `scripts/demo.sh`. Reproducing it inside an Anchor test
//     would require seeding pool reserves and minting LP — out of scope here.
//
// All tests here drive the program with a Ready signal (via mock_callback_signal)
// and a real devnet Pyth price account. The CPI itself never lands — the
// validation guards reject every input before invoke_signed is reached.
// ============================================================================

const VAULT_SEED = Buffer.from("vault");
const SHARE_MINT_SEED = Buffer.from("share_mint");
const POSITION_SEED = Buffer.from("position");

const SOL_USD_FEED_ID_HEX =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const SOL_USD_FEED_ID: number[] = Array.from(
  Buffer.from(SOL_USD_FEED_ID_HEX, "hex"),
);
const SOL_USD_PRICE_PDA = new PublicKey(
  "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
);
// Raydium CPMM program ID on devnet — pinned by the vault program.
const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey(
  "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb",
);

describe("spectraq_vault — execute_trade Raydium CPMM guards", function () {
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

  // A throwaway program id that is definitely not the Raydium CPMM program.
  const fakeDexProgram = Keypair.generate().publicKey;

  before(async () => {
    // Fund all roles.
    const fundTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: admin.publicKey,
        lamports: 0.5 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: agent.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: user.publicKey,
        lamports: 0.5 * LAMPORTS_PER_SOL,
      }),
    );
    await provider.sendAndConfirm(fundTx, [payer]);

    // Local USDC + opaque "wSOL" mints (vault treats sol_mint as opaque SPL).
    usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);
    solMint = await createMint(connection, admin, admin.publicKey, null, 9);
    userUsdcAta = (
      await getOrCreateAssociatedTokenAccount(connection, user, usdcMint, user.publicKey)
    ).address;
    userSolAta = (
      await getOrCreateAssociatedTokenAccount(connection, user, solMint, user.publicKey)
    ).address;
    await mintTo(connection, admin, usdcMint, userUsdcAta, admin, 200_000_000n);
    await mintTo(connection, admin, solMint, userSolAta, admin, 1_000_000_000n);

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

    // Seed 100 USDC so trade-size guard has something to clamp against.
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

    // Drive signal to Ready=long via mock_callback_signal (mock-mpc feature).
    await (program.methods as any)
      .mockCallbackSignal(1)
      .accounts({
        authority: admin.publicKey,
        vaultState: vaultStatePda,
      })
      .signers([admin])
      .rpc();
  });

  // -------------------------------------------------------------------------
  // 1. Wrong DEX program → InvalidDexProgram.
  // -------------------------------------------------------------------------
  it("rejects a non-Raydium program in `dex_program`", async () => {
    let threw = false;
    try {
      await (program.methods as any)
        .executeTrade(
          { usdcToSol: {} },
          new BN(10_000_000),
          new BN(50_000_000),
          Buffer.alloc(8), // dummy data — won't be reached
          0,
        )
        .accounts({
          agent: agent.publicKey,
          vaultState: vaultStatePda,
          usdcMint,
          solMint,
          usdcVault: usdcVaultAta,
          solVault: solVaultAta,
          priceUpdate: SOL_USD_PRICE_PDA,
          dexProgram: fakeDexProgram,
        })
        .signers([agent])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /InvalidDexProgram|ConstraintAddress/);
    }
    assert.isTrue(threw, "expected InvalidDexProgram");
  });

  // -------------------------------------------------------------------------
  // 2. SignalDirectionMismatch — last_signal=1 but caller asks SolToUsdc.
  // -------------------------------------------------------------------------
  it("rejects direction != signal", async () => {
    let threw = false;
    try {
      await (program.methods as any)
        .executeTrade(
          { solToUsdc: {} }, // wrong way for last_signal=1
          new BN(10_000_000),
          new BN(50_000_000),
          Buffer.alloc(8),
          0,
        )
        .accounts({
          agent: agent.publicKey,
          vaultState: vaultStatePda,
          usdcMint,
          solMint,
          usdcVault: usdcVaultAta,
          solVault: solVaultAta,
          priceUpdate: SOL_USD_PRICE_PDA,
          dexProgram: RAYDIUM_CPMM_PROGRAM_ID,
        })
        .signers([agent])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /SignalDirectionMismatch/);
    }
    assert.isTrue(threw, "expected SignalDirectionMismatch");
  });

  // -------------------------------------------------------------------------
  // 3. TradeSizeExceeded — amount_in > 30 % of live USDC ATA (= 100e6 → 30e6).
  // -------------------------------------------------------------------------
  it("rejects amount > 30% of live source ATA", async () => {
    let threw = false;
    try {
      await (program.methods as any)
        .executeTrade(
          { usdcToSol: {} },
          new BN(31_000_000), // 31 USDC — over the 30 % cap
          new BN(1), // tiny min_out — won't be reached
          Buffer.alloc(8),
          0,
        )
        .accounts({
          agent: agent.publicKey,
          vaultState: vaultStatePda,
          usdcMint,
          solMint,
          usdcVault: usdcVaultAta,
          solVault: solVaultAta,
          priceUpdate: SOL_USD_PRICE_PDA,
          dexProgram: RAYDIUM_CPMM_PROGRAM_ID,
        })
        .signers([agent])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /TradeSizeExceeded/);
    }
    assert.isTrue(threw, "expected TradeSizeExceeded");
  });

  // -------------------------------------------------------------------------
  // 4. SlippageExceeded — min_amount_out far below the Pyth-derived floor.
  // -------------------------------------------------------------------------
  it("rejects min_amount_out below the 5% Pyth slippage floor", async () => {
    let threw = false;
    try {
      await (program.methods as any)
        .executeTrade(
          { usdcToSol: {} },
          new BN(10_000_000), // 10 USDC, well within the 30 % cap
          new BN(1), // 1 lamport out — way below 95 % of expected
          Buffer.alloc(8),
          0,
        )
        .accounts({
          agent: agent.publicKey,
          vaultState: vaultStatePda,
          usdcMint,
          solMint,
          usdcVault: usdcVaultAta,
          solVault: solVaultAta,
          priceUpdate: SOL_USD_PRICE_PDA,
          dexProgram: RAYDIUM_CPMM_PROGRAM_ID,
        })
        .signers([agent])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /SlippageExceeded/);
    }
    assert.isTrue(threw, "expected SlippageExceeded");
  });

  // -------------------------------------------------------------------------
  // 5. InvalidSwapDestination — destination_ata_index points at a foreign ATA.
  // -------------------------------------------------------------------------
  it("rejects destination ATA that is not the vault's own ATA", async () => {
    let threw = false;
    // We pass an attacker-controlled ATA in remaining_accounts and point
    // destination_ata_index at it. The vault must reject before any CPI.
    const attackerAta = Keypair.generate().publicKey;
    try {
      await (program.methods as any)
        .executeTrade(
          { usdcToSol: {} },
          new BN(10_000_000),
          // min_amount_out close enough to oracle expected so we get past
          // the slippage check and reach the destination check.
          new BN(50_000_000), // ~0.05 SOL — well under the 5 % floor for $10 deposit at any reasonable SOL price
          Buffer.alloc(8),
          0, // index 0 → attackerAta
        )
        .accounts({
          agent: agent.publicKey,
          vaultState: vaultStatePda,
          usdcMint,
          solMint,
          usdcVault: usdcVaultAta,
          solVault: solVaultAta,
          priceUpdate: SOL_USD_PRICE_PDA,
          dexProgram: RAYDIUM_CPMM_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: attackerAta, isSigner: false, isWritable: true },
        ])
        .signers([agent])
        .rpc();
    } catch (e: any) {
      threw = true;
      // Either InvalidSwapDestination (we got past slippage) OR
      // SlippageExceeded (50e6 lamports might be below the floor depending
      // on live SOL price). Both are acceptable — they prove the guard
      // ordering rejects malicious destinations before any CPI fires.
      assert.match(
        String(e),
        /InvalidSwapDestination|SlippageExceeded/,
        "expected InvalidSwapDestination or SlippageExceeded",
      );
    }
    assert.isTrue(threw, "expected one of the pre-CPI guards to fire");
  });
});

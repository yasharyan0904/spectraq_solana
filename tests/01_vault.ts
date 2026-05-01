import anchor from "@coral-xyz/anchor";
import type { Program, Wallet } from "@coral-xyz/anchor";
const { BN } = anchor;
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
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
// 01_vault.ts — full lifecycle test for the SpectraQ vault program (Mode 1).
//
// init → deposit USDC → deposit SOL → request signal → callback → execute
// trade → settle → withdraw, plus the structural invariants from prompt 1.
//
// Notes:
//   - "SOL" here is a fresh local SPL mint serving as a stand-in for wSOL.
//     Prompt 1 doesn't require real wSOL; the program treats sol_mint as an
//     opaque SPL token. Prompt 4/5 wire the real wSOL flow.
//   - The provider wallet acts as `admin`; `agent` and `user` are funded
//     from it via system transfers (no devnet airdrops).
// ============================================================================

const VAULT_SEED = Buffer.from("vault");
const SHARE_MINT_SEED = Buffer.from("share_mint");
const POSITION_SEED = Buffer.from("position");

const USDC_DECIMALS = 6;
const SOL_DECIMALS = 9;
const SOL_USDC_PRICE_E6 = new BN(100_000_000); // $100 / SOL — bounds-passing

// Pyth canonical feed id for SOL/USD (constant across networks). Stored in
// vault_state at init; deposit_sol enforces that the price account passed
// in matches this. Hex form, no 0x prefix.
const SOL_USD_FEED_ID_HEX =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const SOL_USD_FEED_ID: number[] = Array.from(Buffer.from(SOL_USD_FEED_ID_HEX, "hex"));
// Devnet PriceUpdateV2 push account for SOL/USD (Pyth shard 0). Used in the
// deposit_sol smoke test in tests/03_oracle.ts.
const SOL_USD_PRICE_PDA = new PublicKey(
  "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE",
);

describe("spectraq_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SpectraqVault as Program<SpectraqVault>;
  const connection = provider.connection;

  // Roles. admin is freshly generated each run so the [b"vault", admin]
  // PDA is unique → re-runs against the same deployed program do not
  // collide on `initialize_vault`. payer covers admin/agent/user from the
  // provider wallet.
  const payer = (provider.wallet as Wallet).payer;
  const admin = Keypair.generate();
  const agent = Keypair.generate();
  const user = Keypair.generate();

  // Mints + ATAs (resolved in `before`).
  let usdcMint: PublicKey;
  let solMint: PublicKey;

  let userUsdcAta: PublicKey;
  let userSolAta: PublicKey;

  // Vault PDAs / ATAs.
  let vaultStatePda: PublicKey;
  let vaultStateBump: number;
  let shareMintPda: PublicKey;
  let usdcVaultAta: PublicKey;
  let solVaultAta: PublicKey;
  let userPositionPda: PublicKey;
  let userShareAta: PublicKey;

  before(async () => {
    // Fund admin / agent / user from the provider wallet.
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
      })
    );
    await provider.sendAndConfirm(fundTx, [payer]);

    // Create local "USDC" and "SOL" mints. admin is the mint authority for
    // both so we can mint test balances to the user.
    usdcMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      USDC_DECIMALS
    );
    solMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      SOL_DECIMALS
    );

    // User token accounts + initial balances: 1000 USDC, 5 "SOL".
    userUsdcAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        user,
        usdcMint,
        user.publicKey
      )
    ).address;
    userSolAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        user,
        solMint,
        user.publicKey
      )
    ).address;
    await mintTo(connection, admin, usdcMint, userUsdcAta, admin, 1_000_000_000n); // 1000 USDC
    await mintTo(connection, admin, solMint, userSolAta, admin, 5_000_000_000n);   // 5 SOL

    // Derive vault PDAs.
    [vaultStatePda, vaultStateBump] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, admin.publicKey.toBuffer()],
      program.programId
    );
    [shareMintPda] = PublicKey.findProgramAddressSync(
      [SHARE_MINT_SEED, vaultStatePda.toBuffer()],
      program.programId
    );
    [userPositionPda] = PublicKey.findProgramAddressSync(
      [POSITION_SEED, vaultStatePda.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );
    usdcVaultAta = getAssociatedTokenAddressSync(usdcMint, vaultStatePda, true);
    solVaultAta = getAssociatedTokenAddressSync(solMint, vaultStatePda, true);
    userShareAta = getAssociatedTokenAddressSync(shareMintPda, user.publicKey);
  });

  it("rejects initialize_vault when agent == admin", async () => {
    let threw = false;
    try {
      await program.methods
        .initializeVault(SOL_USD_FEED_ID as any)
        .accounts({
          admin: admin.publicKey,
          agent: admin.publicKey, // <-- same key on purpose
          usdcMint,
          solMint,
        } as any)
        .signers([admin])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /AgentEqualsAdmin/);
    }
    assert.isTrue(threw, "expected AgentEqualsAdmin");
  });

  it("initialize_vault", async () => {
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

    const v = await program.account.vaultState.fetch(vaultStatePda);
    assert.ok(v.admin.equals(admin.publicKey));
    assert.ok(v.agent.equals(agent.publicKey));
    assert.ok(v.usdcMint.equals(usdcMint));
    assert.ok(v.solMint.equals(solMint));
    assert.ok(v.shareMint.equals(shareMintPda));
    assert.equal(v.totalShares.toString(), "0");
    assert.equal(v.usdcBalance.toString(), "0");
    assert.equal(v.solBalance.toString(), "0");
    assert.equal(v.lastSignal, 0);
    assert.deepEqual(v.signalState, { idle: {} });
    assert.isNull(v.pendingComputation);
  });

  it("deposit_usdc — first deposit mints 1:1 against USDC", async () => {
    const amount = new BN(100_000_000); // 100 USDC
    await program.methods
      .depositUsdc(amount, SOL_USDC_PRICE_E6)
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

    const v = await program.account.vaultState.fetch(vaultStatePda);
    assert.equal(v.usdcBalance.toString(), amount.toString());
    assert.equal(v.totalShares.toString(), amount.toString());

    const pos = await program.account.userPosition.fetch(userPositionPda);
    assert.ok(pos.owner.equals(user.publicKey));
    assert.equal(pos.shares.toString(), amount.toString());
    assert.equal(pos.cumulativeDepositsUsdc.toString(), amount.toString());

    const shareBal = await getAccount(connection, userShareAta);
    assert.equal(shareBal.amount.toString(), amount.toString());

    const usdcVault = await getAccount(connection, usdcVaultAta);
    assert.equal(usdcVault.amount.toString(), amount.toString());
  });

  it("deposit_sol — proportional shares against pre-deposit NAV (live Pyth)", async () => {
    // 1 "SOL" deposit (fake mint, treated as opaque SPL by the program).
    // Price comes from the real devnet Pyth SOL/USD push account.
    // Pre-deposit NAV = vault.usdc_balance = 100e6.
    // usdc_value_e6 = (1e9 * sol_price_e6) / 1e9 = sol_price_e6.
    // shares = (sol_price_e6 * 100e6) / 100e6 = sol_price_e6 (numerically).
    const amount = new BN(1_000_000_000);
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
      .rpc();

    const v = await program.account.vaultState.fetch(vaultStatePda);
    assert.equal(v.solBalance.toString(), amount.toString());
    // total_shares grew by sol_price_e6; can't pin to a fixed number with live
    // Pyth, but it must be > 100e6 (the pre-deposit total) and within bounds.
    assert.isAbove(Number(v.totalShares.toString()), 100_000_000);
    assert.isBelow(Number(v.totalShares.toString()), 1_100_000_000);

    const solVault = await getAccount(connection, solVaultAta);
    assert.equal(solVault.amount.toString(), amount.toString());
  });

  // PriceOutOfBounds and stale-price scenarios are exercised at the unit-test
  // level in `programs/spectraq_vault/src/oracle.rs` (Rust). Repeating them
  // here would require a mocked Pyth account, which we do not have access
  // to without bankrun — see tests/03_oracle.ts for the wrong-feed variant.

  // Prompt 3 swapped the prompt-1 stubs (request_signal_computation +
  // callback_signal with placeholder ids) for real Arcium CPIs. To keep the
  // lifecycle test self-contained without a deployed Arcium cluster, we use
  // the admin-only `mock_callback_signal` instruction (gated behind the
  // `mock-mpc` feature). Build with: cargo-build-sbf --features mock-mpc
  it("mock_callback_signal stamps Ready + last_signal=1 (admin signer)", async () => {
    await (program.methods as any)
      .mockCallbackSignal(1)
      .accounts({
        authority: admin.publicKey,
        vaultState: vaultStatePda,
      })
      .signers([admin])
      .rpc();

    const v = await program.account.vaultState.fetch(vaultStatePda);
    assert.deepEqual(v.signalState, { ready: {} });
    assert.equal(v.lastSignal, 1);
    assert.isNull(v.pendingComputation);
  });

  it("rejects mock_callback_signal when caller is neither admin nor agent", async () => {
    let threw = false;
    try {
      await (program.methods as any)
        .mockCallbackSignal(0)
        .accounts({
          authority: user.publicKey,
          vaultState: vaultStatePda,
        })
        .signers([user])
        .rpc();
    } catch (e: any) {
      threw = true;
      assert.match(String(e), /Unauthorized/);
    }
    assert.isTrue(threw, "expected Unauthorized");
  });

  // Prompt 5 swapped the simulated trade for a real Jupiter v6 CPI. The
  // happy-path swap and the negative-validation cases (TradeSizeExceeded,
  // SignalDirectionMismatch, InvalidSwapDestination, SlippageExceeded) all
  // require the Jupiter program + a route, so they live in tests/04_jupiter.ts.
  // Keeping them here would force every 01_vault.ts run to depend on either
  // mainnet-fork liquidity or live mainnet, which 01 deliberately avoids.

  it("settle_pnl — reconciles cached → actual ATA balances", async () => {
    // No real Jupiter swap in prompt 1, so settle_pnl resets cached to ATAs.
    const usdcAtaBefore = await getAccount(connection, usdcVaultAta);
    const solAtaBefore = await getAccount(connection, solVaultAta);

    await program.methods
      .settlePnl()
      .accounts({
        agent: agent.publicKey,
        vaultState: vaultStatePda,
        usdcMint,
        solMint,
        usdcVault: usdcVaultAta,
        solVault: solVaultAta,
      } as any)
      .signers([agent])
      .rpc();

    const v = await program.account.vaultState.fetch(vaultStatePda);
    assert.equal(v.usdcBalance.toString(), usdcAtaBefore.amount.toString());
    assert.equal(v.solBalance.toString(), solAtaBefore.amount.toString());
  });

  it("withdraw — burns half the user's shares, returns proportional underlying", async () => {
    const v0 = await program.account.vaultState.fetch(vaultStatePda);
    const pos0 = await program.account.userPosition.fetch(userPositionPda);
    const sharesToBurn = pos0.shares.div(new BN(2));

    const expectedUsdc = sharesToBurn
      .mul(v0.usdcBalance)
      .div(v0.totalShares);
    const expectedSol = sharesToBurn
      .mul(v0.solBalance)
      .div(v0.totalShares);

    const userUsdcBefore = (await getAccount(connection, userUsdcAta)).amount;
    const userSolBefore = (await getAccount(connection, userSolAta)).amount;

    await program.methods
      .withdraw(sharesToBurn)
      .accounts({
        user: user.publicKey,
        vaultState: vaultStatePda,
        usdcMint,
        solMint,
        shareMint: shareMintPda,
        usdcVault: usdcVaultAta,
        solVault: solVaultAta,
        userUsdcAccount: userUsdcAta,
        userSolAccount: userSolAta,
        userShareAccount: userShareAta,
        userPosition: userPositionPda,
      } as any)
      .signers([user])
      .rpc();

    const v1 = await program.account.vaultState.fetch(vaultStatePda);
    assert.equal(
      v1.totalShares.toString(),
      v0.totalShares.sub(sharesToBurn).toString()
    );
    assert.equal(
      v1.usdcBalance.toString(),
      v0.usdcBalance.sub(expectedUsdc).toString()
    );
    assert.equal(
      v1.solBalance.toString(),
      v0.solBalance.sub(expectedSol).toString()
    );

    const userUsdcAfter = (await getAccount(connection, userUsdcAta)).amount;
    const userSolAfter = (await getAccount(connection, userSolAta)).amount;
    assert.equal(
      (userUsdcAfter - userUsdcBefore).toString(),
      expectedUsdc.toString()
    );
    assert.equal(
      (userSolAfter - userSolBefore).toString(),
      expectedSol.toString()
    );
  });

  it("withdraw works regardless of signal_state (non-custodial guarantee)", async () => {
    // Re-stamp signal via the mock so the vault is in Ready (a non-Idle
    // state) and try to withdraw the rest. This is the same invariant as
    // before — non-Idle state must not block withdrawals.
    await (program.methods as any)
      .mockCallbackSignal(1)
      .accounts({
        authority: admin.publicKey,
        vaultState: vaultStatePda,
      })
      .signers([admin])
      .rpc();

    const vBefore = await program.account.vaultState.fetch(vaultStatePda);
    assert.deepEqual(vBefore.signalState, { ready: {} });

    const pos = await program.account.userPosition.fetch(userPositionPda);
    await program.methods
      .withdraw(pos.shares)
      .accounts({
        user: user.publicKey,
        vaultState: vaultStatePda,
        usdcMint,
        solMint,
        shareMint: shareMintPda,
        usdcVault: usdcVaultAta,
        solVault: solVaultAta,
        userUsdcAccount: userUsdcAta,
        userSolAccount: userSolAta,
        userShareAccount: userShareAta,
        userPosition: userPositionPda,
      } as any)
      .signers([user])
      .rpc();

    const vAfter = await program.account.vaultState.fetch(vaultStatePda);
    assert.equal(vAfter.totalShares.toString(), "0");

    const posAfter = await program.account.userPosition.fetch(userPositionPda);
    assert.equal(posAfter.shares.toString(), "0");
  });
});

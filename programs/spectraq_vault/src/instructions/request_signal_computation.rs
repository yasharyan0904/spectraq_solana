// `request_signal_computation` — agent submits an encrypted price window to
// the Arcium MPC cluster.
//
// Args (laid out to match the Arcis circuit's input ordering exactly):
//   - `computation_offset`: u64 the agent picks; must be unique per call.
//   - `pubkey`: agent's x25519 pubkey for the Shared cipher.
//   - `nonce_prices`: u128 nonce paired with `pubkey` for the Shared cipher.
//   - `prices_ciphertexts`: 17 × [u8; 32] — `Pack<[u64; 50]>` packed into the
//     17 BaseField ciphertexts the circuit's input layout expects.
//   - `nonce_params`: u128 nonce for the Mxe cipher protecting StrategyParams.
//   - `params_ciphertexts`: 3 × [u8; 32] — { fast_n: u8, slow_n: u8,
//     threshold_bps: i16 } encrypted under the MXE key.
//
// Side effects:
//   - vault.signal_state Idle → Pending.
//   - vault.pending_computation = LE(computation_offset) || zeroes (kept as a
//     [u8; 32] to preserve the prompt-1 schema; the callback validates it).
//   - Queues the MPC computation via the Arcium CPI; the MXE will call back
//     into `compute_ma_signal_callback` once threshold-decryption finishes.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::constants::*;
use crate::errors::{ErrorCode, VaultError};
use crate::events::SignalRequested;
use crate::state::{SignalState, VaultState};
use crate::{ArciumSignerAccount, ID, ID_CONST};

const PRICE_CT_LEN: usize = 17;
const PARAM_CT_LEN: usize = 3;

#[queue_computation_accounts("compute_ma_signal", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RequestSignalComputation<'info> {
    /// The agent funds rent for the Arcium signer PDA + computation account.
    /// We require `payer == vault.agent` so only the agent can queue.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault_state.admin.as_ref()],
        bump = vault_state.bump,
        constraint = vault_state.agent == payer.key() @ VaultError::Unauthorized,
    )]
    pub vault_state: Box<Account<'info, VaultState>>,

    // ---- Arcium plumbing (shapes mandated by `#[queue_computation_accounts]`) ----
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: mempool_account, checked by the Arcium program.
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub mempool_account: UncheckedAccount<'info>,
    /// CHECK: executing_pool, checked by the Arcium program.
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub executing_pool: UncheckedAccount<'info>,
    /// CHECK: computation_account, checked by the Arcium program.
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub computation_account: UncheckedAccount<'info>,
    #[account(
        address = derive_comp_def_pda!(crate::COMP_DEF_OFFSET_COMPUTE_MA_SIGNAL)
    )]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

pub fn request_signal_computation_handler(
    ctx: Context<RequestSignalComputation>,
    computation_offset: u64,
    pubkey: [u8; 32],
    nonce_prices: u128,
    prices_ciphertexts: [[u8; 32]; PRICE_CT_LEN],
    nonce_params: u128,
    params_ciphertexts: [[u8; 32]; PARAM_CT_LEN],
) -> Result<()> {
    {
        let vault = &ctx.accounts.vault_state;
        require!(
            vault.signal_state == SignalState::Idle,
            VaultError::InvalidSignalState
        );
    }

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    // Build the argument list in the exact order the circuit's ABI expects:
    //   Enc<Shared, Pack<[u64; 50]>> = pubkey | nonce | 17 ciphertexts
    //   Enc<Mxe, StrategyParams>     =        | nonce |  3 ciphertexts
    let mut builder = ArgBuilder::new()
        .x25519_pubkey(pubkey)
        .plaintext_u128(nonce_prices);
    for ct in prices_ciphertexts.iter() {
        builder = builder.encrypted_u64(*ct);
    }
    builder = builder.plaintext_u128(nonce_params);
    // StrategyParams { fast_n: u8, slow_n: u8, threshold_bps: i16 }
    builder = builder.encrypted_u8(params_ciphertexts[0]);
    builder = builder.encrypted_u8(params_ciphertexts[1]);
    builder = builder.encrypted_i16(params_ciphertexts[2]);
    let args = builder.build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![crate::ComputeMaSignalCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.vault_state.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    let slot = Clock::get()?.slot;
    let mut id = [0u8; 32];
    id[..8].copy_from_slice(&computation_offset.to_le_bytes());

    let vault = &mut ctx.accounts.vault_state;
    vault.signal_state = SignalState::Pending;
    vault.pending_computation = Some(id);

    emit!(SignalRequested {
        vault: vault.key(),
        agent: ctx.accounts.payer.key(),
        computation_id: id,
        slot,
    });
    Ok(())
}

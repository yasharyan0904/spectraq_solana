// Init the on-chain ComputationDefinitionAccount for the
// `compute_ma_signal_v3` circuit. Must run AFTER `arcium init-mxe` (the
// cluster's MXE registration) but BEFORE the first `request_signal_computation`
// call. Idempotent — subsequent calls fail with an account-already-exists
// error and the demo script swallows that.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

use crate::{ID, ID_CONST};

#[init_computation_definition_accounts("compute_ma_signal_v3", payer)]
#[derive(Accounts)]
pub struct InitMaSignalCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        address = derive_mxe_pda!()
    )]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: comp_def_account, checked by the Arcium program. Cannot check
    /// the address here because it's being initialized in this instruction.
    #[account(mut)]
    pub comp_def_account: UncheckedAccount<'info>,
    /// CHECK: address_lookup_table, checked by the Arcium program.
    #[account(
        mut,
        address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot)
    )]
    pub address_lookup_table: UncheckedAccount<'info>,
    /// CHECK: lut_program is the Address Lookup Table program.
    #[account(address = LUT_PROGRAM_ID)]
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

pub fn init_ma_signal_comp_def_handler(ctx: Context<InitMaSignalCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}

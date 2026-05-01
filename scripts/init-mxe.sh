#!/usr/bin/env bash
# init-mxe.sh — Deploy the SpectraQ vault program AND register its MXE on the
# Arcium devnet cluster (offset 456, recovery_set_size 4).
#
# CRITICAL ORDERING — Arcium's #1 gotcha:
#
#     arcium build  →  arcium deploy  →  arcium init-mxe  →  uploadCircuit
#
# `arcium deploy` deploys the Solana program AND initializes the MXE account
# in a single step on arcium 0.9.7. `arcium init-mxe` is only needed if you
# previously ran `arcium deploy --skip-init` or the init step was interrupted
# — pass `--resume` in that case. **Uploading circuits BEFORE the MXE is
# registered returns success but the cluster silently refuses computations.**
#
# The 0.9.7 CLI does not have an `arcium upload-circuits` subcommand. Circuit
# upload happens from the TypeScript client via `uploadCircuit(...)` from
# `@arcium-hq/client` — see tests/02_arcium.ts.
#
# Required env (load from .env or export inline):
#   ANCHOR_WALLET            : path to admin keypair (signs deploy + MXE init)
#   HELIUS_RPC_URL           : devnet RPC (Helius recommended; falls back to public)
#   SPECTRAQ_PROGRAM_ID      : vault program ID (read from target/deploy keypair)
#   ARCIUM_CLUSTER_OFFSET    : 456 for devnet
#   ARCIUM_RECOVERY_SET_SIZE : 4 (project standard)
#
# Usage:
#   bash scripts/init-mxe.sh             # full flow
#   bash scripts/init-mxe.sh --resume    # resume an interrupted deploy/init

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  # Load .env without leaking quotes / comments.
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

KEYPAIR="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
RPC_URL="${HELIUS_RPC_URL:-https://api.devnet.solana.com}"
CLUSTER_OFFSET="${ARCIUM_CLUSTER_OFFSET:-456}"
RECOVERY_SET_SIZE="${ARCIUM_RECOVERY_SET_SIZE:-4}"
PROGRAM_KEYPAIR="${PROGRAM_KEYPAIR:-target/deploy/spectraq_vault-keypair.json}"

RESUME_FLAG=""
if [[ "${1:-}" == "--resume" ]]; then
  RESUME_FLAG="--resume"
  echo "[init-mxe] resume mode enabled"
fi

echo "[init-mxe] root        : $ROOT"
echo "[init-mxe] keypair     : $KEYPAIR"
echo "[init-mxe] rpc         : $RPC_URL"
echo "[init-mxe] cluster_off : $CLUSTER_OFFSET"
echo "[init-mxe] recovery_n  : $RECOVERY_SET_SIZE"
echo

# ---------------------------------------------------------------------------
# 1. arcium build — produce the .arcis circuit binary if missing or stale.
# ---------------------------------------------------------------------------
echo "[init-mxe] (1/3) arcium build (--skip-program — vault built separately via cargo-build-sbf)"
arcium build --skip-program

if [[ ! -f build/compute_ma_signal.arcis ]]; then
  echo "[init-mxe] ERROR: build/compute_ma_signal.arcis missing after arcium build" >&2
  exit 1
fi
echo

# ---------------------------------------------------------------------------
# 2. arcium deploy — deploys the Solana program AND initializes the MXE
#    account in one step (set --skip-init to decouple).
# ---------------------------------------------------------------------------
echo "[init-mxe] (2/3) arcium deploy (program + MXE init)"
arcium deploy \
  --cluster-offset "$CLUSTER_OFFSET" \
  --recovery-set-size "$RECOVERY_SET_SIZE" \
  --keypair-path "$KEYPAIR" \
  --rpc-url "$RPC_URL" \
  --program-keypair "$PROGRAM_KEYPAIR" \
  --program-name spectraq_vault \
  $RESUME_FLAG
echo

# ---------------------------------------------------------------------------
# 3. Echo the program ID + MXE PDA so the user can stash them in .env.
#    Circuit upload itself happens from the TS test (tests/02_arcium.ts) via
#    `uploadCircuit(...)` from @arcium-hq/client.
# ---------------------------------------------------------------------------
PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KEYPAIR")"
echo "[init-mxe] (3/3) Done."
echo
echo "  program_id       = $PROGRAM_ID"
echo "  cluster_offset   = $CLUSTER_OFFSET"
echo "  recovery_set_n   = $RECOVERY_SET_SIZE"
echo
echo "Next: run \`anchor test --skip-deploy --provider.cluster devnet\` to push"
echo "the comp_def + circuit. tests/02_arcium.ts handles uploadCircuit()."

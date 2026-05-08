#!/usr/bin/env bash
# demo.sh — end-to-end SpectraQ devnet demo orchestrator.
#
# Runs the full pipeline a hackathon judge would care about:
#   1. preflight (toolchain + funded wallet)
#   2. anchor build + deploy (idempotent — skipped if program already on devnet)
#   3. init-mxe (idempotent — skipped if MXE already registered)
#   4. ensure agent keypair exists (≠ admin — program enforces it)
#   5. initialize_vault (idempotent — skipped if PDA exists)
#   6. seed demo funds (10 USDC + 0.1 SOL deposit)
#   7. register Raydium CPMM pool (idempotent — uses existing pool if any)
#   8. start agent in MOCK_MPC mode (Arcium devnet callbacks are flaky)
#   9. start frontend in dev mode
#  10. start Raydium pool auto-rebalancer (keeps pool implied price in
#      sync with Pyth so the on-chain Pyth-floor doesn't block trades —
#      devnet substitute for mainnet's natural arbitrage)
#  11. echo URLs + explorer links
#
# Logs go to logs/demo_run_<unix_ts>.log. Tail it for live status:
#   tail -f logs/demo_run_*.log
#
# Stop the demo with: bash scripts/demo.sh --stop
#
# Flags:
#   --rebuild         force `anchor build && anchor deploy` even if program exists
#   --reinit          force re-running scripts/init-mxe.sh
#   --no-agent        don't start the trading agent
#   --no-fe           don't start the frontend
#   --no-rebalancer   don't start the pool auto-rebalancer
#   --stop            kill any agent/frontend/rebalancer from previous runs

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
RUN_TS="$(date +%s)"
LOG_FILE="$LOG_DIR/demo_run_${RUN_TS}.log"

C_BLU=$'\033[34m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_RED=$'\033[31m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
hdr()  { printf "\n%s── %s ──%s\n" "$C_BLU" "$1" "$C_RST" | tee -a "$LOG_FILE"; }
log()  { printf "%s\n" "$1" | tee -a "$LOG_FILE"; }
ok()   { printf "%s✓%s %s\n" "$C_GRN" "$C_RST" "$1" | tee -a "$LOG_FILE"; }
warn() { printf "%s!%s %s\n" "$C_YEL" "$C_RST" "$1" | tee -a "$LOG_FILE"; }
err()  { printf "%s✗%s %s\n" "$C_RED" "$C_RST" "$1" | tee -a "$LOG_FILE"; }

PIDS_DIR="$ROOT/.demo-pids"
mkdir -p "$PIDS_DIR"

REBUILD=0; REINIT=0; START_AGENT=1; START_FE=1; START_REBALANCER=1; STOP=0
for arg in "$@"; do
  case "$arg" in
    --rebuild)        REBUILD=1 ;;
    --reinit)         REINIT=1 ;;
    --no-agent)       START_AGENT=0 ;;
    --no-fe)          START_FE=0 ;;
    --no-rebalancer)  START_REBALANCER=0 ;;
    --stop)           STOP=1 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) err "unknown flag: $arg"; exit 2 ;;
  esac
done

stop_pids() {
  for f in "$PIDS_DIR"/*.pid; do
    [[ -f "$f" ]] || continue
    pid="$(cat "$f")"
    name="$(basename "$f" .pid)"
    if kill -0 "$pid" 2>/dev/null; then
      log "  stopping $name (pid=$pid)"
      kill "$pid" 2>/dev/null || true
      sleep 0.5
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$f"
  done
  ok "stopped any running agent / frontend"
}

if [[ $STOP -eq 1 ]]; then
  hdr "Stopping previous demo processes"
  stop_pids
  exit 0
fi

# Anything from a previous run gets cleaned up before we boot the new one.
stop_pids >/dev/null 2>&1 || true

# ── Load .env so subsequent steps see HELIUS_RPC_URL etc. ───────────────────
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PROGRAM_ID="${SPECTRAQ_PROGRAM_ID:-96fHw6FzHUB8gAPPUUWRpyZuWo2NRPHJtJYcm7ERfugN}"
PUBLIC_DEVNET_RPC="https://api.devnet.solana.com"
RPC_URL="${HELIUS_RPC_URL:-$PUBLIC_DEVNET_RPC}"
# Heuristic + active probe: if HELIUS_RPC_URL still has the literal
# `${HELIUS_API_KEY}` placeholder, or if the key is rejected with HTTP 401
# (e.g. revoked), fall back to public devnet so the rest of the demo is
# usable. Skip the probe when the user is already on public devnet.
if [[ "$RPC_URL" == *'${HELIUS_API_KEY}'* ]]; then
  warn "HELIUS_RPC_URL still references unresolved \${HELIUS_API_KEY} — using public devnet"
  RPC_URL="$PUBLIC_DEVNET_RPC"
elif [[ "$RPC_URL" != "$PUBLIC_DEVNET_RPC" ]]; then
  PROBE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
    "$RPC_URL" 2>/dev/null || echo "000")
  if [[ "$PROBE_HTTP" == "401" || "$PROBE_HTTP" == "403" || "$PROBE_HTTP" == "000" ]]; then
    warn "HELIUS_RPC_URL probe returned $PROBE_HTTP — falling back to public devnet"
    RPC_URL="$PUBLIC_DEVNET_RPC"
  fi
fi
# Program upgrade authority (used by anchor deploy + init-mxe.sh).
DEPLOY_KEYPAIR="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
# Vault admin (separate identity so the upgrade authority isn't the same
# pubkey that holds vault control — gives one extra layer of separation).
ADMIN_KEYPAIR="${SPECTRAQ_ADMIN_KEYPAIR:-$HOME/.config/solana/spectraq_admin.json}"
AGENT_KEYPAIR="${AGENT_KEYPAIR_PATH:-$HOME/.config/solana/agent.json}"
MXE_PUBKEY="${ARCIUM_MXE_PUBKEY:-HjiD5aGYnE3unNnKh89xF7thQrF636i2RUw6jV2jNnKt}"

log "log file       : $LOG_FILE"
log "program id     : $PROGRAM_ID"
log "rpc            : $RPC_URL"
log "deploy keypair : $DEPLOY_KEYPAIR  (program upgrade authority)"
log "admin keypair  : $ADMIN_KEYPAIR  (vault admin)"
log "agent keypair  : $AGENT_KEYPAIR"

# ─── Step 1: preflight ─────────────────────────────────────────────────────
hdr "1/11 preflight"
if bash scripts/preflight.sh >>"$LOG_FILE" 2>&1; then
  ok "preflight passed"
else
  warn "preflight reported issues (see $LOG_FILE) — continuing"
fi

# ─── Step 2: anchor build + deploy (idempotent) ────────────────────────────
hdr "2/11 anchor build + deploy"
PROGRAM_ON_CHAIN=0
if solana --url "$RPC_URL" account "$PROGRAM_ID" >/dev/null 2>&1; then
  PROGRAM_ON_CHAIN=1
fi
if [[ $PROGRAM_ON_CHAIN -eq 1 && $REBUILD -eq 0 ]]; then
  ok "program $PROGRAM_ID already deployed on devnet — skipping (pass --rebuild to force)"
else
  log "running anchor build…"
  anchor build >>"$LOG_FILE" 2>&1 || { err "anchor build failed"; exit 1; }
  log "running anchor deploy --provider.cluster devnet…"
  anchor deploy --provider.cluster devnet >>"$LOG_FILE" 2>&1 || { err "anchor deploy failed"; exit 1; }
  ok "deployed"
fi

# ─── Step 3: init-mxe (idempotent) ────────────────────────────────────────
hdr "3/11 Arcium MXE registration"
MXE_EXISTS=0
if solana --url "$RPC_URL" account "$MXE_PUBKEY" >/dev/null 2>&1; then
  MXE_EXISTS=1
fi
if [[ $MXE_EXISTS -eq 1 && $REINIT -eq 0 ]]; then
  ok "MXE $MXE_PUBKEY already registered — skipping init-mxe (pass --reinit to force)"
else
  log "running scripts/init-mxe.sh…"
  if bash scripts/init-mxe.sh >>"$LOG_FILE" 2>&1; then
    ok "init-mxe completed"
  else
    err "init-mxe failed (check $LOG_FILE) — continuing; agent will run in MOCK_MPC mode"
  fi
fi

# ─── Step 4: ensure admin + agent keypairs ────────────────────────────────
hdr "4/11 vault admin + agent keypairs"
if [[ ! -f "$ADMIN_KEYPAIR" ]]; then
  log "generating vault admin keypair at $ADMIN_KEYPAIR"
  solana-keygen new --no-bip39-passphrase --silent --outfile "$ADMIN_KEYPAIR" >>"$LOG_FILE" 2>&1
fi
if [[ ! -f "$AGENT_KEYPAIR" ]]; then
  log "generating agent keypair at $AGENT_KEYPAIR"
  solana-keygen new --no-bip39-passphrase --silent --outfile "$AGENT_KEYPAIR" >>"$LOG_FILE" 2>&1
fi
ADMIN_PK="$(solana-keygen pubkey "$ADMIN_KEYPAIR")"
AGENT_PK="$(solana-keygen pubkey "$AGENT_KEYPAIR")"
DEPLOY_PK="$(solana-keygen pubkey "$DEPLOY_KEYPAIR")"
if [[ "$AGENT_PK" == "$ADMIN_PK" ]]; then
  err "agent and admin keys are equal — program will reject initialize_vault"
  exit 1
fi
# Fund admin from deploy keypair (admin needs SOL for rent + USDC for the
# demo deposit). 1.5 SOL covers vault PDA rent + share-mint rent + ATA
# inits + a wSOL deposit + tx fees, with margin.
ADMIN_BAL="$(solana --url "$RPC_URL" balance "$ADMIN_PK" 2>/dev/null | awk '{print $1}')"
ADMIN_BAL="${ADMIN_BAL:-0}"
if (( $(awk "BEGIN { print ($ADMIN_BAL < 1.5) }") )); then
  log "funding admin with 1.5 SOL for vault init + deposits"
  solana --url "$RPC_URL" -k "$DEPLOY_KEYPAIR" transfer "$ADMIN_PK" 1.5 --allow-unfunded-recipient >>"$LOG_FILE" 2>&1 || warn "admin funding failed — continuing"
fi
# Top up admin USDC if balance < 10 USDC (deposit amount).
USDC_AMOUNT_TO_TRANSFER="${DEMO_USDC_TOPUP:-30}"
ADMIN_USDC=$(spl-token --url "$RPC_URL" -p TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA --owner "$ADMIN_PK" balance 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU 2>/dev/null || echo "0")
if (( $(awk "BEGIN { print ($ADMIN_USDC < 10) }") )); then
  log "transferring $USDC_AMOUNT_TO_TRANSFER USDC from deploy wallet → admin"
  spl-token --url "$RPC_URL" --owner "$DEPLOY_KEYPAIR" transfer 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU "$USDC_AMOUNT_TO_TRANSFER" "$ADMIN_PK" --fund-recipient --allow-unfunded-recipient >>"$LOG_FILE" 2>&1 || warn "USDC top-up failed — continuing (faucet at https://faucet.circle.com/ if needed)"
fi
# Fund agent with a tx-fee buffer if empty.
AGENT_BAL="$(solana --url "$RPC_URL" balance "$AGENT_PK" 2>/dev/null | awk '{print $1}')"
AGENT_BAL="${AGENT_BAL:-0}"
if (( $(awk "BEGIN { print ($AGENT_BAL < 0.05) }") )); then
  log "funding agent with 0.05 SOL for tx fees"
  solana --url "$RPC_URL" -k "$DEPLOY_KEYPAIR" transfer "$AGENT_PK" 0.05 --allow-unfunded-recipient >>"$LOG_FILE" 2>&1 || warn "agent funding failed — continuing"
fi
ok "deploy authority: $DEPLOY_PK"
ok "vault admin    : $ADMIN_PK"
ok "agent          : $AGENT_PK"

# ─── Step 5: initialize_vault (idempotent) ────────────────────────────────
hdr "5/11 initialize_vault"
ANCHOR_WALLET="$ADMIN_KEYPAIR" AGENT_KEYPAIR_PATH="$AGENT_KEYPAIR" HELIUS_RPC_URL="$RPC_URL" \
  pnpm exec ts-node --transpile-only scripts/initialize_vault.ts 2>&1 | tee -a "$LOG_FILE" \
  || { err "initialize_vault failed"; exit 1; }

if [[ -f .env.demo ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.demo
  set +a
fi

# ─── Step 6: seed demo funds ──────────────────────────────────────────────
hdr "6/11 seed demo funds (10 USDC + 0.1 SOL)"
if ANCHOR_WALLET="$ADMIN_KEYPAIR" HELIUS_RPC_URL="$RPC_URL" pnpm exec ts-node --transpile-only scripts/seed_demo_funds.ts 2>&1 | tee -a "$LOG_FILE"; then
  ok "demo deposits complete"
else
  warn "seed step had issues (see $LOG_FILE) — continuing so the demo can still surface vault state"
fi

# ─── Step 7: register Raydium CPMM pool (idempotent) ──────────────────────
hdr "7/11 Raydium CPMM pool registration"
if ANCHOR_WALLET="$DEPLOY_KEYPAIR" HELIUS_RPC_URL="$RPC_URL" pnpm exec ts-node --transpile-only scripts/create_raydium_pool.ts 2>&1 | tee -a "$LOG_FILE"; then
  ok "Raydium pool wired in .env (RAYDIUM_USDC_SOL_POOL)"
  # Reload .env so subsequent steps see the freshly-written RAYDIUM_* vars.
  set -a; source .env; set +a
else
  err "Raydium pool registration failed — agent will not be able to swap"
  warn "continuing (vault deposit/withdraw still works) — see $LOG_FILE"
fi

# Wire frontend to the live vault + Raydium pool. Done AFTER step 7 so the
# RAYDIUM_* vars (just written by create_raydium_pool.ts) are populated.
# Without this, /api/vault shows "vault not found" and /api/raydium-pool
# returns errored: "Raydium pool not configured".
FE_ENV="$ROOT/frontend/.env.local"
{
  echo "# auto-generated by scripts/demo.sh — do not edit by hand"
  echo "NEXT_PUBLIC_SOLANA_RPC_URL=$RPC_URL"
  echo "NEXT_PUBLIC_SOLANA_CLUSTER=devnet"
  echo "NEXT_PUBLIC_SPECTRAQ_PROGRAM_ID=$PROGRAM_ID"
  echo "NEXT_PUBLIC_USDC_MINT=${USDC_MINT:-4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU}"
  echo "NEXT_PUBLIC_VAULT_ADMIN=${ADMIN_PUBKEY:-$ADMIN_PK}"
  echo "NEXT_PUBLIC_PYTH_SOL_USD_FEED=${PYTH_SOL_USD_FEED:-7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE}"
  echo "SOLANA_RPC_URL=$RPC_URL"
  echo "PYTH_SOL_USD_FEED=${PYTH_SOL_USD_FEED:-7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE}"
  # Raydium CPMM pool (server-side; consumed by /api/raydium-pool route).
  echo "RAYDIUM_CPMM_PROGRAM_ID=${RAYDIUM_CPMM_PROGRAM_ID:-DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb}"
  echo "RAYDIUM_CPMM_POOL_AUTH=${RAYDIUM_CPMM_POOL_AUTH:-}"
  echo "RAYDIUM_USDC_SOL_POOL=${RAYDIUM_USDC_SOL_POOL:-}"
  echo "RAYDIUM_USDC_SOL_LP_MINT=${RAYDIUM_USDC_SOL_LP_MINT:-}"
  echo "RAYDIUM_USDC_SOL_VAULT_A=${RAYDIUM_USDC_SOL_VAULT_A:-}"
  echo "RAYDIUM_USDC_SOL_VAULT_B=${RAYDIUM_USDC_SOL_VAULT_B:-}"
  echo "RAYDIUM_USDC_SOL_CONFIG_ID=${RAYDIUM_USDC_SOL_CONFIG_ID:-}"
  echo "RAYDIUM_USDC_SOL_OBSERVATION=${RAYDIUM_USDC_SOL_OBSERVATION:-}"
  echo "RAYDIUM_USDC_SOL_MINT_A=${RAYDIUM_USDC_SOL_MINT_A:-}"
  echo "RAYDIUM_USDC_SOL_MINT_B=${RAYDIUM_USDC_SOL_MINT_B:-}"
} > "$FE_ENV"
ok "wrote $FE_ENV (vault admin = ${ADMIN_PUBKEY:-$ADMIN_PK})"

# ─── Step 8: start agent (MOCK_MPC=true) ──────────────────────────────────
hdr "8/11 trading agent"
if [[ $START_AGENT -eq 1 ]]; then
  AGENT_LOG="$LOG_DIR/agent_${RUN_TS}.log"
  log "starting agent → $AGENT_LOG"
  # Pass the resolved $RPC_URL through so the agent uses the same probed/
  # fallback URL as the rest of the demo (avoids it inheriting a broken
  # HELIUS_RPC_URL from .env at process spawn time).
  ( cd "$ROOT" && MOCK_MPC=true HELIUS_RPC_URL="$RPC_URL" pnpm --filter agent start >"$AGENT_LOG" 2>&1 ) &
  AGENT_PID=$!
  echo "$AGENT_PID" >"$PIDS_DIR/agent.pid"
  ok "agent pid=$AGENT_PID  (MOCK_MPC=true, RPC=$RPC_URL)"
else
  warn "skipped (--no-agent)"
fi

# ─── Step 9: start frontend ───────────────────────────────────────────────
hdr "9/11 frontend"
if [[ $START_FE -eq 1 ]]; then
  FE_LOG="$LOG_DIR/frontend_${RUN_TS}.log"
  FE_PORT="${FE_PORT:-3000}"
  log "starting frontend on http://localhost:$FE_PORT → $FE_LOG"
  ( cd "$ROOT" && PORT="$FE_PORT" HOSTNAME=0.0.0.0 pnpm --filter frontend dev >"$FE_LOG" 2>&1 ) &
  FE_PID=$!
  echo "$FE_PID" >"$PIDS_DIR/frontend.pid"
  ok "frontend pid=$FE_PID"
else
  warn "skipped (--no-fe)"
fi

# ─── Step 10: pool auto-rebalancer ─────────────────────────────────────────
# Keeps the Raydium CPMM pool's implied SOL/USDC price within
# REBALANCE_TOLERANCE_BPS (default 1%) of Pyth, so the on-chain Pyth-floor
# in execute_trade.rs never blocks the agent. Devnet substitute for
# mainnet's natural arbitrage. Runs as a daemon polling every 60s; uses
# the funded deploy wallet (which has both SOL and USDC). The script is
# wallet-agnostic via ANCHOR_WALLET, so override if you want.
hdr "10/11 Raydium pool auto-rebalancer"
if [[ $START_REBALANCER -eq 1 ]]; then
  REB_LOG="$LOG_DIR/rebalancer_${RUN_TS}.log"
  log "starting rebalancer (loop, every ${REBALANCE_INTERVAL_SEC:-60}s) → $REB_LOG"
  ( cd "$ROOT" && \
      ANCHOR_WALLET="${REBALANCE_WALLET:-$DEPLOY_KEYPAIR}" \
      HELIUS_RPC_URL="$RPC_URL" \
      REBALANCE_LOOP=true \
      INTERVAL_SEC="${REBALANCE_INTERVAL_SEC:-60}" \
      REBALANCE_TOLERANCE_BPS="${REBALANCE_TOLERANCE_BPS:-100}" \
      MAX_REBALANCE_USDC="${MAX_REBALANCE_USDC:-200}" \
      pnpm exec ts-node --transpile-only scripts/rebalance_pool.ts \
      >"$REB_LOG" 2>&1 ) &
  REB_PID=$!
  echo "$REB_PID" >"$PIDS_DIR/rebalancer.pid"
  ok "rebalancer pid=$REB_PID  (wallet=${REBALANCE_WALLET:-$DEPLOY_KEYPAIR})"
else
  warn "skipped (--no-rebalancer)"
fi

# ─── Step 11: summary ─────────────────────────────────────────────────────
hdr "11/11 demo summary"
VAULT_PK="${VAULT_PUBKEY:-?}"
SHARE_MINT_PK="${SHARE_MINT_PUBKEY:-?}"
log ""
log "  ${C_GRN}program${C_RST}     https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
log "  ${C_GRN}vault${C_RST}       https://explorer.solana.com/address/$VAULT_PK?cluster=devnet"
log "  ${C_GRN}share mint${C_RST}  https://explorer.solana.com/address/$SHARE_MINT_PK?cluster=devnet"
log "  ${C_GRN}MXE${C_RST}         https://explorer.solana.com/address/$MXE_PUBKEY?cluster=devnet"
log ""
log "  ${C_GRN}frontend${C_RST}    http://localhost:${FE_PORT:-3000}"
log "  ${C_GRN}dashboard${C_RST}   http://localhost:${FE_PORT:-3000}/app"
log "  ${C_GRN}deposit${C_RST}     http://localhost:${FE_PORT:-3000}/app/deposit"
log "  ${C_GRN}withdraw${C_RST}    http://localhost:${FE_PORT:-3000}/app/withdraw"
log "  ${C_GRN}pool${C_RST}        http://localhost:${FE_PORT:-3000}/app/pool"
log "  ${C_GRN}strategy${C_RST}    http://localhost:${FE_PORT:-3000}/strategy"
log ""
log "  agent log      $LOG_DIR/agent_${RUN_TS}.log"
log "  frontend log   $LOG_DIR/frontend_${RUN_TS}.log"
log "  rebalancer log $LOG_DIR/rebalancer_${RUN_TS}.log"
log "  full log       $LOG_FILE"
log ""
log "  stop with: bash scripts/demo.sh --stop"
log ""
ok "demo running"

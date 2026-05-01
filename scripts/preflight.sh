#!/usr/bin/env bash
# SpectraQ — preflight: verify host has every tool we need, at the right
# versions, with a funded devnet wallet, and Helius reachable.
#
# Idempotent. Safe to run twice. Exits non-zero on any failure so CI can
# gate on it. Uses .env if present (for HELIUS_API_KEY), otherwise prompts
# the user where the missing env var is.

set -u   # unset variables are errors. NOT -e: we want to collect every
         # failure rather than bail on the first one.

# -----------------------------------------------------------------------------
# colors (only if stdout is a tty)
# -----------------------------------------------------------------------------
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'
  C_BLU=$'\033[34m'; C_DIM=$'\033[2m';  C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""; C_DIM=""; C_RST=""
fi

PASS=0; FAIL=0; WARN=0

ok()    { printf "  %s✓%s %s\n"  "$C_GRN" "$C_RST" "$1"; PASS=$((PASS+1)); }
fail()  { printf "  %s✗%s %s\n"  "$C_RED" "$C_RST" "$1"; FAIL=$((FAIL+1)); }
warn()  { printf "  %s!%s %s\n"  "$C_YEL" "$C_RST" "$1"; WARN=$((WARN+1)); }
hdr()   { printf "\n%s%s%s\n" "$C_BLU" "$1" "$C_RST"; }
detail(){ printf "    %s%s%s\n" "$C_DIM" "$1" "$C_RST"; }

# -----------------------------------------------------------------------------
# version comparison: returns 0 if $1 >= $2 (semver-ish)
# -----------------------------------------------------------------------------
ver_ge() {
  # strip any leading 'v'
  local a="${1#v}"
  local b="${2#v}"
  [[ "$(printf '%s\n%s\n' "$b" "$a" | sort -V | head -n1)" == "$b" ]]
}

# -----------------------------------------------------------------------------
# load .env if present (for HELIUS_API_KEY etc.)
# -----------------------------------------------------------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  detail "loaded $ENV_FILE"
else
  detail ".env not found — falling back to .env.example for HELIUS host"
fi

# -----------------------------------------------------------------------------
hdr "Toolchain"
# -----------------------------------------------------------------------------

# solana >= 2.3.0
if command -v solana >/dev/null 2>&1; then
  SOLANA_VER="$(solana --version | awk '{print $2}')"
  if ver_ge "$SOLANA_VER" "2.3.0"; then
    ok "solana $SOLANA_VER (>= 2.3.0)"
  else
    fail "solana $SOLANA_VER (need >= 2.3.0)"
  fi
else
  fail "solana CLI not found in PATH"
fi

# anchor == 0.32.1
if command -v anchor >/dev/null 2>&1; then
  ANCHOR_VER="$(anchor --version | awk '{print $2}')"
  if [[ "$ANCHOR_VER" == "0.32.1" ]]; then
    ok "anchor 0.32.1"
  else
    fail "anchor $ANCHOR_VER (need exactly 0.32.1)"
  fi
else
  fail "anchor CLI not found in PATH"
fi

# arcium present (any version)
if command -v arcium >/dev/null 2>&1; then
  ARCIUM_VER="$(arcium --version 2>&1 | head -1 | awk '{print $NF}')"
  ok "arcium $ARCIUM_VER"
else
  fail "arcium CLI not found in PATH (install via arcup)"
fi

# node >= 20
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node --version | sed 's/^v//')"
  if ver_ge "$NODE_VER" "20.0.0"; then
    ok "node $NODE_VER (>= 20)"
  else
    fail "node $NODE_VER (need >= 20)"
  fi
else
  fail "node not found in PATH"
fi

# pnpm >= 9
if command -v pnpm >/dev/null 2>&1; then
  PNPM_VER="$(pnpm --version)"
  if ver_ge "$PNPM_VER" "9.0.0"; then
    ok "pnpm $PNPM_VER (>= 9)"
  else
    warn "pnpm $PNPM_VER (recommend >= 9)"
  fi
else
  warn "pnpm not found (npm works but pnpm preferred)"
fi

# rustc present
if command -v rustc >/dev/null 2>&1; then
  RUSTC_VER="$(rustc --version | awk '{print $2}')"
  ok "rustc $RUSTC_VER"
else
  fail "rustc not found in PATH"
fi

# cargo present
if command -v cargo >/dev/null 2>&1; then
  ok "cargo $(cargo --version | awk '{print $2}')"
else
  fail "cargo not found in PATH"
fi

# python3 present (for strategy/)
if command -v python3 >/dev/null 2>&1; then
  PY_VER="$(python3 --version | awk '{print $2}')"
  if ver_ge "$PY_VER" "3.11.0"; then
    ok "python3 $PY_VER (>= 3.11)"
  else
    warn "python3 $PY_VER (strategy/ wants >= 3.11)"
  fi
else
  warn "python3 not found (only needed for offline strategy validation)"
fi

# docker daemon reachable
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    ok "docker daemon reachable"
  else
    fail "docker installed but daemon not reachable (is Docker Desktop running?)"
  fi
else
  fail "docker not found (required for the Arcium localnet flow)"
fi

# -----------------------------------------------------------------------------
hdr "Solana wallet (devnet)"
# -----------------------------------------------------------------------------

if command -v solana >/dev/null 2>&1; then
  CONFIG_OUT="$(solana config get 2>/dev/null)"
  KEYPAIR="$(printf '%s\n' "$CONFIG_OUT" | awk -F': ' '/Keypair Path/ {print $2}' | xargs)"
  CLUSTER_URL="$(printf '%s\n' "$CONFIG_OUT" | awk -F': ' '/RPC URL/ {print $2}' | xargs)"
  detail "keypair: ${KEYPAIR:-<unset>}"
  detail "rpc:     ${CLUSTER_URL:-<unset>}"

  if [[ -n "${KEYPAIR:-}" && -f "$KEYPAIR" ]]; then
    ADDR="$(solana address 2>/dev/null || echo '')"
    if [[ -n "$ADDR" ]]; then
      ok "wallet address $ADDR"
    else
      fail "could not derive wallet address from $KEYPAIR"
    fi

    # devnet balance
    BAL_RAW="$(solana balance --url devnet 2>/dev/null | head -1 | awk '{print $1}')"
    if [[ -n "$BAL_RAW" ]]; then
      # awk handles float comparison
      if awk "BEGIN{exit !($BAL_RAW > 2.0)}"; then
        ok "devnet balance $BAL_RAW SOL (> 2)"
      else
        fail "devnet balance $BAL_RAW SOL (need > 2 — run: solana airdrop 2 --url devnet)"
      fi
    else
      fail "could not read devnet balance (is the wallet initialized on devnet?)"
    fi
  else
    fail "keypair not found at: ${KEYPAIR:-<unset>}"
  fi
else
  fail "solana CLI missing — wallet checks skipped"
fi

# -----------------------------------------------------------------------------
hdr "Helius devnet RPC"
# -----------------------------------------------------------------------------

if [[ -z "${HELIUS_API_KEY:-}" || "${HELIUS_API_KEY}" == "PASTE_YOUR_HELIUS_DEVNET_API_KEY_HERE" ]]; then
  warn "HELIUS_API_KEY not set in .env — skipping Helius reachability check"
  detail "copy .env.example to .env and paste your devnet Helius API key"
else
  HELIUS_URL="${HELIUS_RPC_URL:-https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}}"
  HTTP_CODE="$(curl -sS -o /tmp/spectraq_helius.json -w '%{http_code}' \
      -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
      "$HELIUS_URL" || echo '000')"
  if [[ "$HTTP_CODE" == "200" ]] && grep -q '"result":"ok"' /tmp/spectraq_helius.json 2>/dev/null; then
    ok "Helius RPC reachable (200 / getHealth=ok)"
  else
    fail "Helius RPC returned HTTP $HTTP_CODE"
    [[ -f /tmp/spectraq_helius.json ]] && detail "$(head -c 240 /tmp/spectraq_helius.json)"
  fi
  rm -f /tmp/spectraq_helius.json
fi

# -----------------------------------------------------------------------------
hdr "Summary"
# -----------------------------------------------------------------------------

printf "  passed: %s%d%s   warned: %s%d%s   failed: %s%d%s\n" \
  "$C_GRN" "$PASS" "$C_RST" \
  "$C_YEL" "$WARN" "$C_RST" \
  "$C_RED" "$FAIL" "$C_RST"

if (( FAIL > 0 )); then
  printf "\n%spreflight failed.%s See ✗ items above.\n" "$C_RED" "$C_RST"
  exit 1
fi

printf "\n%spreflight ok.%s\n" "$C_GRN" "$C_RST"
exit 0

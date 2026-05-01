// SpectraQ — Jupiter v6 helpers for the trading agent.
//
// We deliberately avoid `@jup-ag/api` and `@pythnetwork/pyth-solana-receiver`
// because both pull in `jito-ts` → an old `@solana/web3.js` → a stale
// `rpc-websockets` resolution that conflicts with `@solana/web3.js@1.95.4`
// in this workspace. Direct fetch + a hand-written response shape is more
// stable across the npm graph and matches what the on-chain `execute_trade`
// instruction actually needs (raw account list + ix data + dest index).
//
// All endpoints default to the Pro/Station endpoint
// (`https://api.jup.ag/swap/v1/...`) because Jupiter retired the public
// v6 host (`quote-api.jup.ag`). `JUPITER_API_KEY` is required for routes
// to resolve; the helper sends it as `x-api-key`.
//
// Reference: https://station.jup.ag/docs/apis/swap-api

import {
  AccountMeta,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type SwapMode = "ExactIn" | "ExactOut";

export interface QuoteParams {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  /** 100 bps = 1 %. Defaults to 50 bps (0.5 %). */
  slippageBps?: number;
  swapMode?: SwapMode;
  /** Comma-separated DEX list to exclude. Used in tests/forks. */
  excludeDexes?: string[];
  /** When true, only direct (single-hop) routes are considered. */
  onlyDirectRoutes?: boolean;
}

/** Minimal QuoteResponse shape we actually consume. Jupiter returns more. */
export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  /** Worst-case output we'd accept given slippageBps. */
  otherAmountThreshold: string;
  swapMode: SwapMode;
  slippageBps: number;
  routePlan: unknown[];
  /** Whole response is opaque-passed back to swap-instructions. */
  [k: string]: unknown;
}

export interface SwapInstructionsParams {
  quote: QuoteResponse;
  userPublicKey: PublicKey;
  /** Defaults to true — vault PDA cannot create its own ATAs from the agent
   * tx, so the agent prepays / pre-creates them out of band. */
  wrapAndUnwrapSol?: boolean;
  /** Defaults to false. Vault never deposits SOL via the swap (it pre-wraps). */
  useSharedAccounts?: boolean;
  /** Optional CU-price override. */
  computeUnitPriceMicroLamports?: number;
  /** Optional fee account (Pyth/Pro tier). */
  feeAccount?: PublicKey;
  /** Optional. When set, Jupiter routes a portion of input as fees. */
  trackingAccount?: PublicKey;
}

export interface RawJupiterIx {
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string; // base64
}

export interface SwapInstructionsResponse {
  /** Always present — the actual route ix. */
  swapInstruction: RawJupiterIx;
  /** Setup ixs (e.g. ATA creations). Vault flow expects these to be empty
   * because the vault's ATAs were created at `initialize_vault`. */
  setupInstructions?: RawJupiterIx[];
  cleanupInstruction?: RawJupiterIx;
  /** Token-ledger ix used for ExactOut routes. */
  tokenLedgerInstruction?: RawJupiterIx;
  /** Prioritization-fee ix (CU price). Forwarded as-is. */
  computeBudgetInstructions?: RawJupiterIx[];
  addressLookupTableAddresses?: string[];
}

export interface ParsedRoute {
  /** Args expected by `execute_trade`. */
  jupiterRouteData: Buffer;
  destinationAtaIndex: number;
  /** Use as `remaining_accounts` when sending the vault ix. */
  remainingAccounts: AccountMeta[];
  /** ALTs from Jupiter (caller passes these to the v0 transaction builder). */
  addressLookupTableAddresses: PublicKey[];
}

// -----------------------------------------------------------------------------
// HTTP helpers (no axios — fetch is enough and ships in Node 20+).
// -----------------------------------------------------------------------------

const DEFAULT_QUOTE_URL =
  process.env.JUPITER_QUOTE_API ?? "https://api.jup.ag/swap/v1/quote";
const DEFAULT_SWAP_IX_URL =
  process.env.JUPITER_SWAP_INSTRUCTIONS_API ??
  "https://api.jup.ag/swap/v1/swap-instructions";

function authHeaders(): Record<string, string> {
  const key = process.env.JUPITER_API_KEY;
  return key ? { "x-api-key": key } : {};
}

async function jsonGet<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) {
    throw new Error(`Jupiter GET ${url} → ${r.status} ${await r.text()}`);
  }
  return (await r.json()) as T;
}

async function jsonPost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`Jupiter POST ${url} → ${r.status} ${await r.text()}`);
  }
  return (await r.json()) as T;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Fetch a Jupiter v6 quote for `amount` units of `inputMint` → `outputMint`.
 * `amount` is in atomic units (lamports for SOL, e6 for USDC).
 */
export async function getQuote(params: QuoteParams): Promise<QuoteResponse> {
  const qs = new URLSearchParams({
    inputMint: params.inputMint.toBase58(),
    outputMint: params.outputMint.toBase58(),
    amount: params.amount.toString(),
    slippageBps: String(params.slippageBps ?? 50),
    swapMode: params.swapMode ?? "ExactIn",
  });
  if (params.onlyDirectRoutes) qs.set("onlyDirectRoutes", "true");
  if (params.excludeDexes?.length)
    qs.set("excludeDexes", params.excludeDexes.join(","));
  return jsonGet<QuoteResponse>(`${DEFAULT_QUOTE_URL}?${qs.toString()}`);
}

/**
 * Build the swap instructions for a previously-fetched quote. `userPublicKey`
 * here is the **vault PDA** — Jupiter signs against this account, and our
 * vault program substitutes the signature via `invoke_signed` with the PDA's
 * seeds.
 */
export async function getSwapInstructions(
  params: SwapInstructionsParams,
): Promise<SwapInstructionsResponse> {
  const body = {
    quoteResponse: params.quote,
    userPublicKey: params.userPublicKey.toBase58(),
    wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
    useSharedAccounts: params.useSharedAccounts ?? false,
    feeAccount: params.feeAccount?.toBase58(),
    trackingAccount: params.trackingAccount?.toBase58(),
    computeUnitPriceMicroLamports: params.computeUnitPriceMicroLamports,
    asLegacyTransaction: false,
  };
  return jsonPost<SwapInstructionsResponse>(DEFAULT_SWAP_IX_URL, body);
}

/**
 * Parse the v6 swap-instructions response into the inputs `execute_trade`
 * expects: raw bytes, destination-ATA index, and the AccountMeta[] to pass
 * through as `remaining_accounts`.
 *
 * The destination ATA is the account at the index where Jupiter writes the
 * output token. Heuristic: it's the first writable, non-signer account
 * whose pubkey matches `expectedDestinationAta`. If not found we throw —
 * caller (the agent) should not submit the transaction, since the vault's
 * `InvalidSwapDestination` check would fail anyway.
 */
export function parseRouteAccounts(
  ix: RawJupiterIx,
  expectedDestinationAta: PublicKey,
): { jupiterRouteData: Buffer; destinationAtaIndex: number; accounts: AccountMeta[] } {
  const accounts: AccountMeta[] = ix.accounts.map((a) => ({
    pubkey: new PublicKey(a.pubkey),
    isSigner: a.isSigner,
    isWritable: a.isWritable,
  }));
  const destStr = expectedDestinationAta.toBase58();
  const destinationAtaIndex = accounts.findIndex(
    (a) => a.pubkey.toBase58() === destStr,
  );
  if (destinationAtaIndex < 0) {
    throw new Error(
      `parseRouteAccounts: expected destination ATA ${destStr} not present in Jupiter route accounts`,
    );
  }
  return {
    jupiterRouteData: Buffer.from(ix.data, "base64"),
    destinationAtaIndex,
    accounts,
  };
}

/**
 * High-level helper: quote + build + parse. Returns everything the vault
 * needs for one `execute_trade` invocation. The caller is responsible for
 * (a) verifying `quote.outAmount * (10000 - slippageBps) / 10000` clears
 * the on-chain slippage floor and (b) attaching `addressLookupTables` to
 * the v0 transaction.
 */
export async function quoteAndBuildSwap(
  args: {
    inputMint: PublicKey;
    outputMint: PublicKey;
    amount: bigint;
    slippageBps: number;
    vaultPda: PublicKey;
    expectedDestinationAta: PublicKey;
  },
): Promise<ParsedRoute & { quote: QuoteResponse; rawIx: RawJupiterIx }> {
  const quote = await getQuote({
    inputMint: args.inputMint,
    outputMint: args.outputMint,
    amount: args.amount,
    slippageBps: args.slippageBps,
  });
  const swap = await getSwapInstructions({
    quote,
    userPublicKey: args.vaultPda,
    // Vault PDA cannot create its own ATAs in the swap tx — they were
    // created at vault-init.
    wrapAndUnwrapSol: false,
    useSharedAccounts: false,
  });
  if (swap.setupInstructions?.length) {
    throw new Error(
      `quoteAndBuildSwap: Jupiter returned setupInstructions (${swap.setupInstructions.length}); ` +
        `vault ATAs must be pre-created.`,
    );
  }
  const parsed = parseRouteAccounts(swap.swapInstruction, args.expectedDestinationAta);
  return {
    quote,
    rawIx: swap.swapInstruction,
    jupiterRouteData: parsed.jupiterRouteData,
    destinationAtaIndex: parsed.destinationAtaIndex,
    remainingAccounts: parsed.accounts,
    addressLookupTableAddresses: (swap.addressLookupTableAddresses ?? []).map(
      (s) => new PublicKey(s),
    ),
  };
}

/**
 * Convenience: turn a RawJupiterIx into a `TransactionInstruction` (used
 * mostly for debugging / logging — `execute_trade` consumes the raw bytes
 * directly).
 */
export function toWeb3Ix(raw: RawJupiterIx): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(raw.programId),
    keys: raw.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(raw.data, "base64"),
  });
}

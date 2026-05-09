import Link from "next/link";
import { WithdrawForm } from "@/components/WithdrawForm";

export default function WithdrawPage() {
  return (
    <div className="mx-auto max-w-md py-4 md:py-8">

      {/* Header */}
      <div className="mb-6">
        <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
          MA Crossover Alpha · SpectraQ Labs
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Withdraw</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Burn SPQS shares for a pro-rata claim on vault USDC and SOL. The
          withdrawal instruction is signed by you — no agent approval required.
        </p>
      </div>

      {/* Guarantee callout */}
      <div
        className="mb-6 flex items-start gap-3 rounded-xl p-4"
        style={{
          background: "rgba(16, 217, 140, 0.05)",
          border: "1px solid rgba(16, 217, 140, 0.2)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-positive)" strokeWidth="2" className="mt-0.5 shrink-0">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <div>
          <p className="text-xs font-semibold text-[var(--color-positive)]">Non-custodial guarantee</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
            Withdrawals are enforced by the on-chain program, not the agent or admin.
            SOL is automatically unwrapped from wSOL back to native SOL in the same transaction.
          </p>
        </div>
      </div>

      <WithdrawForm />

      <p className="mt-4 text-center text-[11px] text-[var(--color-muted)]">
        Want to move to a different strategy?{" "}
        <Link href="/app/marketplace" className="text-[var(--color-brand)] hover:underline">
          Browse the marketplace →
        </Link>
      </p>
    </div>
  );
}

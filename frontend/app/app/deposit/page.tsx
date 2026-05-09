import Link from "next/link";
import { DepositForm } from "@/components/DepositForm";

export default function DepositPage() {
  return (
    <div className="mx-auto max-w-md py-4 md:py-8">

      {/* Header */}
      <div className="mb-6">
        <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
          MA Crossover Alpha · SpectraQ Labs
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Deposit</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Add USDC or SOL to the vault and receive shares (SPQS) at the live NAV.
          Redeem any time — withdrawals bypass the agent entirely.
        </p>
      </div>

      {/* Trust signals */}
      <div className="mb-6 grid grid-cols-3 gap-2">
        {[
          ["Non-custodial", "Only the vault PDA can move funds"],
          ["Arcium MPC", "Signal computed privately"],
          ["Instant exit", "No lockup, no timelock"],
        ].map(([title, body]) => (
          <div
            key={title}
            className="rounded-xl p-3 text-center"
            style={{
              background: "rgba(139,92,246,0.05)",
              border: "1px solid rgba(139,92,246,0.14)",
            }}
          >
            <p className="text-[11px] font-semibold text-[var(--color-text)]">{title}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-muted)]">{body}</p>
          </div>
        ))}
      </div>

      <DepositForm />

      <p className="mt-4 text-center text-[11px] text-[var(--color-muted)]">
        Looking for other strategies?{" "}
        <Link href="/app/marketplace" className="text-[var(--color-brand)] hover:underline">
          Browse the marketplace →
        </Link>
      </p>
    </div>
  );
}

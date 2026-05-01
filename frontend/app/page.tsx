import Link from "next/link";

import { Logo } from "@/components/Logo";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <Link
            href="/app"
            className="rounded-md bg-[var(--color-brand)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-brand-dim)]"
          >
            Launch app →
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-20 md:pt-32">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-8">
              <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
                Solana · Arcium MPC · Pyth · Jupiter
              </p>
              <h1 className="mt-5 text-4xl font-medium leading-[1.1] tracking-tight text-[var(--color-text)] md:text-6xl">
                Trustless asset allocation.
                <br />
                <span className="text-[var(--color-muted)]">
                  Programmatically enforced.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--color-muted)] md:text-lg">
                SpectraQ is a non-custodial vault where deposits, signal
                computation, and trade execution are all on-chain — and the
                strategy itself is published with the validation that
                justifies it.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/app"
                  className="rounded-md bg-[var(--color-brand)] px-5 py-3 text-sm font-medium text-white hover:bg-[var(--color-brand-dim)]"
                >
                  Launch app
                </Link>
                <Link
                  href="/strategy"
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 text-sm font-medium hover:border-[var(--color-muted)]"
                >
                  Strategy transparency →
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/30">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-px bg-[var(--color-border)] md:grid-cols-3">
            <FeatureCard
              kicker="01"
              title="Non-custodial by program"
              body="The vault PDA is the only address that can move funds, and only via instructions signed by the configured agent. There is no admin key that can drain it."
            />
            <FeatureCard
              kicker="02"
              title="AI signals via MPC"
              body="The MA crossover that drives rebalancing is computed inside the Arcium MPC cluster from threshold-encrypted prices. The agent never sees plaintext intermediate state."
            />
            <FeatureCard
              kicker="03"
              title="Transparent strategy"
              body="Every strategy parameter shipped to the agent is accompanied by published validation results: walk-forward, permutation tests, and verdict. Failed validations stay visible."
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-medium tracking-tight">
                Open architecture, closed inputs.
              </h2>
              <p className="mt-4 text-[var(--color-muted)]">
                The strategy logic is public. The price window each tick
                consumes is encrypted to the MPC cluster, decrypted only
                inside the secure computation, and forgotten before the
                signal lands on chain. No off-chain oracle has to be trusted
                with both the data and the decision.
              </p>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <code className="mono block whitespace-pre text-xs leading-relaxed text-[var(--color-muted)]">
                {`priceFeed
   ↓  (encrypted to MXE)
arcium  cluster
   ↓  (threshold-decrypted, computed,
       re-encrypted as plaintext signal)
vault.signal_state = Ready
   ↓
agent.execute_trade()
   ↓  (Jupiter v6 SOL ↔ USDC swap)
on-chain TradeExecuted event`}
              </code>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)] py-10 text-center text-[12px] text-[var(--color-muted)]">
        SpectraQ · devnet · prototype build
      </footer>
    </div>
  );
}

function FeatureCard({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-[var(--color-bg)] p-8">
      <div className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-brand)]">
        {kicker}
      </div>
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{body}</p>
    </div>
  );
}

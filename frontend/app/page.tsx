import Link from "next/link";

import { Logo } from "@/components/Logo";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col relative overflow-hidden">

      {/* Ambient background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="float-blob absolute -top-48 -left-48 h-[640px] w-[640px] rounded-full opacity-[0.18] blur-[130px]"
          style={{ background: "radial-gradient(circle, #8b5cf6 0%, #6d28d9 50%, transparent 75%)" }}
        />
        <div
          className="float-blob-slow absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full opacity-[0.13] blur-[110px]"
          style={{ background: "radial-gradient(circle, #22d3ee 0%, #0891b2 50%, transparent 75%)" }}
        />
        <div
          className="float-blob absolute -bottom-24 left-1/3 h-[420px] w-[420px] rounded-full opacity-[0.1] blur-[100px]"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }}
        />
      </div>

      {/* Header */}
      <header
        className="relative z-20 glass"
        style={{
          borderBottom: "1px solid transparent",
          backgroundImage:
            "linear-gradient(rgba(12, 12, 22, 0.8), rgba(12, 12, 22, 0.8)), linear-gradient(90deg, rgba(139,92,246,0.22), rgba(34,211,238,0.1), rgba(139,92,246,0.06))",
          backgroundOrigin: "border-box",
          backgroundClip: "padding-box, border-box",
        }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <Link
            href="/app"
            className="btn-glow rounded-md px-4 py-1.5 text-sm font-medium text-white transition-all hover:-translate-y-px"
            style={{
              background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              border: "1px solid rgba(196, 181, 253, 0.15)",
            }}
          >
            Launch app →
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-20 md:pt-36">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-8">

              {/* Tech badges */}
              <div className="flex flex-wrap items-center gap-2">
                {["Solana", "Arcium MPC", "Pyth", "Raydium CPMM"].map((tag) => (
                  <span key={tag} className="neon-tag">{tag}</span>
                ))}
              </div>

              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
                <span className="gradient-text">Trustless asset allocation.</span>
                <br />
                <span className="text-[var(--color-muted)]" style={{ fontWeight: 400 }}>
                  Programmatically enforced.
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-base leading-relaxed text-[var(--color-muted)] md:text-lg">
                SpectraQ is a non-custodial vault where deposits, signal
                computation, and trade execution are all on-chain — and the
                strategy itself is published with the validation that
                justifies it.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/app"
                  className="btn-glow rounded-lg px-6 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-px"
                  style={{
                    background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                    border: "1px solid rgba(196, 181, 253, 0.15)",
                  }}
                >
                  Launch app
                </Link>
                <Link
                  href="/strategy"
                  className="glass-light rounded-lg border px-6 py-3 text-sm font-medium transition-all hover:border-[rgba(139,92,246,0.3)] hover:text-[var(--color-text)]"
                  style={{
                    borderColor: "rgba(139, 92, 246, 0.18)",
                    color: "var(--color-muted)",
                  }}
                >
                  Strategy transparency →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Feature cards row ─────────────────────────────────────────── */}
        <section style={{ borderTop: "1px solid rgba(139, 92, 246, 0.1)" }}>
          <div
            className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-3"
            style={{ gap: "1px", background: "rgba(139, 92, 246, 0.08)" }}
          >
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

        {/* ── Architecture section ──────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Open architecture,{" "}
                <span className="gradient-text">closed inputs.</span>
              </h2>
              <p className="mt-4 leading-relaxed text-[var(--color-muted)]">
                The strategy logic is public. The price window each tick
                consumes is encrypted to the MPC cluster, decrypted only
                inside the secure computation, and forgotten before the
                signal lands on chain. No off-chain oracle has to be trusted
                with both the data and the decision.
              </p>
            </div>

            {/* Terminal-style code block */}
            <div
              className="glass card-glow rounded-xl"
              style={{ border: "1px solid rgba(139, 92, 246, 0.2)" }}
            >
              {/* Terminal header bar */}
              <div
                className="flex items-center gap-1.5 px-4 py-3 rounded-t-xl"
                style={{
                  borderBottom: "1px solid rgba(139, 92, 246, 0.12)",
                  background: "rgba(10, 10, 18, 0.5)",
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
                <span className="ml-2 mono text-[10px] text-[var(--color-muted)]">signal-flow.ts</span>
              </div>

              <code className="mono block whitespace-pre p-5 text-xs leading-[1.9]">
                <span style={{ color: "var(--color-muted)" }}>{"priceFeed\n"}</span>
                <span style={{ color: "#7070a0" }}>{"   ↓  "}</span>
                <span style={{ color: "rgba(34,211,238,0.7)" }}>{"(encrypted to MXE)\n"}</span>
                <span style={{ color: "var(--color-cyan)" }}>{"arcium"}</span>
                <span style={{ color: "var(--color-muted)" }}>{"  cluster\n"}</span>
                <span style={{ color: "#7070a0" }}>{"   ↓  "}</span>
                <span style={{ color: "rgba(34,211,238,0.6)" }}>{"(threshold-decrypted, computed,\n"}</span>
                <span style={{ color: "rgba(34,211,238,0.6)" }}>{"       re-encrypted as plaintext signal)\n"}</span>
                <span style={{ color: "var(--color-positive)" }}>{"vault.signal_state"}</span>
                <span style={{ color: "var(--color-muted)" }}>{" = "}</span>
                <span style={{ color: "#a78bfa" }}>{"Ready\n"}</span>
                <span style={{ color: "#7070a0" }}>{"   ↓\n"}</span>
                <span style={{ color: "var(--color-brand)" }}>{"agent"}</span>
                <span style={{ color: "var(--color-muted)" }}>{"."}</span>
                <span style={{ color: "var(--color-text)" }}>{"execute_trade()\n"}</span>
                <span style={{ color: "#7070a0" }}>{"   ↓  "}</span>
                <span style={{ color: "rgba(34,211,238,0.6)" }}>{"(Raydium CPMM SOL ↔ USDC swap)\n"}</span>
                <span style={{ color: "var(--color-positive)" }}>{"on-chain TradeExecuted event"}</span>
              </code>
            </div>
          </div>
        </section>
      </main>

      <footer
        className="relative z-10 py-10 text-center text-[12px]"
        style={{ borderTop: "1px solid rgba(139, 92, 246, 0.1)" }}
      >
        <span className="text-[var(--color-muted)]">SpectraQ · devnet · prototype build</span>
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
    <div
      className="glass card-glow p-8 transition-all"
      style={{ background: "rgba(10, 10, 16, 0.6)" }}
    >
      <div
        className="mono inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-[var(--color-brand)]"
        style={{
          background: "rgba(139, 92, 246, 0.1)",
          border: "1px solid rgba(139, 92, 246, 0.22)",
          boxShadow: "0 0 10px rgba(139, 92, 246, 0.15)",
        }}
      >
        {kicker}
      </div>
      <h3 className="mt-5 text-base font-semibold tracking-tight text-[var(--color-text)]">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">{body}</p>
    </div>
  );
}

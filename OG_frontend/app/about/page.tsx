import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — SpectraQ",
  description: "SpectraQ is building the quantitative finance infrastructure stack for the on-chain era — non-custodial, MPC-private, and Yellow Protocol-settled.",
};

const PRINCIPLES = [
  {
    number: "01",
    title: "Non-Custodial by Default",
    body: "Every product SpectraQ ships enforces non-custodial guarantees at the program level — not policy level. User funds sit in Anchor program PDAs; no entity, including SpectraQ, can access them outside of user-initiated instructions.",
    color: "#10d98c",
    cRgb: "16,217,140",
  },
  {
    number: "02",
    title: "Alpha Deserves Privacy",
    body: "Strategy logic is intellectual capital. We built SpectraQ's privacy layer on Arcium MPC so quants can deploy their edge on-chain without exposing it. Computation is verifiable. Inputs remain private.",
    color: "#8b5cf6",
    cRgb: "139,92,246",
  },
  {
    number: "03",
    title: "Settlement Shouldn't Require Trust",
    body: "Yellow Protocol's exchange is SpectraQ's second independent platform — an index-style pool product where users invest like S&P 500 or NIFTY 50. Entirely separate from Solana, governed by Yellow's own infrastructure.",
    color: "#f59e0b",
    cRgb: "245,158,11",
  },
  {
    number: "04",
    title: "Transparency Including Failures",
    body: "We publish complete Monte Carlo permutation test results — including strategy failures. The live MA-crossover strategy currently has a p-value of 0.34, and we say so on the strategy page. Honesty is the product.",
    color: "#22d3ee",
    cRgb: "34,211,238",
  },
  {
    number: "05",
    title: "Code is the Contract",
    body: "There are no terms of service clauses that override the Anchor program. If the code says withdrawal is always available, withdrawal is always available — regardless of agent state, signal state, or any pending computation.",
    color: "#a78bfa",
    cRgb: "167,139,250",
  },
  {
    number: "06",
    title: "Infrastructure, Not a Fund",
    body: "SpectraQ is not a hedge fund, index fund, or investment vehicle. We build the infrastructure. The quants who deploy vaults through our protocol make the investment decisions — and are fully accountable for them.",
    color: "#10d98c",
    cRgb: "16,217,140",
  },
];

const TIMELINE = [
  {
    date: "Q1 2026",
    event: "SpectraQ Protocol v1",
    note: "Anchor vault, Arcium MPC integration, Raydium CPMM execution — devnet launch.",
    done: true,
  },
  {
    date: "Q2 2026",
    event: "SpectraQuant Public Launch",
    note: "Full production devnet deploy. SpectraQuant.org live with vault marketplace.",
    done: true,
  },
  {
    date: "Q3 2026",
    event: "Yellow Protocol ClearanceEngine",
    note: "State channel settlement integration. 100+ venue liquidity access for vault trades.",
    done: false,
  },
  {
    date: "Q3 2026",
    event: "GA Candlestick Strategy",
    note: "Replace MA-crossover with Genetic Algorithm-mined pattern strategy. Walk-forward p < 0.05 required to ship.",
    done: false,
  },
  {
    date: "Q4 2026",
    event: "Mainnet Beta",
    note: "Renounce upgrade authority. Freeze IDL. Publish audit. Jupiter aggregation. Basket vault mode.",
    done: false,
  },
  {
    date: "2027",
    event: "SpectraQ API + Institutional Layer",
    note: "Programmatic vault management, REST/WebSocket API, institutional-grade SLA.",
    done: false,
  },
];

const INVARIANTS = [
  "No instruction transfers vault USDC/SOL to any address except the original depositor or the registered DEX program.",
  "Agent key is logically separated from admin key — the program rejects agent == admin at initialization.",
  "execute_trade and settle_pnl are gated to the agent pubkey only. The admin cannot execute trades.",
  "Withdrawal works regardless of signal state, pending computation, or any agent activity.",
  "Trade size is structurally capped at 30% of source ATA balance (MAX_TRADE_SIZE_BPS = 3,000).",
  "Slippage is capped vs the Pyth-derived expected output — not just the user-supplied minimum.",
  "All vault arithmetic uses checked operations. MathOverflow aborts the transaction.",
  "Pyth staleness is validated on every price read. Feeds older than the configured threshold revert.",
];

export default function AboutPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Ambient */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div
          className="float-blob absolute -top-32 left-1/3 h-[600px] w-[600px] rounded-full opacity-[0.12] blur-[140px]"
          style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 65%)" }}
        />
        <div
          className="float-blob-slow absolute bottom-1/4 right-0 h-[500px] w-[500px] rounded-full opacity-[0.09] blur-[130px]"
          style={{ background: "radial-gradient(circle, #22d3ee 0%, transparent 65%)" }}
        />
      </div>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-16 pt-24 md:pt-32">
        <div className="fade-in-up max-w-3xl">
          <span className="neon-tag">About</span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-6xl leading-tight">
            Finance infrastructure<br />
            <span className="gradient-text">deserves new primitives.</span>
          </h1>
          <p className="mt-6 text-lg text-[var(--color-muted)] leading-relaxed max-w-2xl">
            SpectraQ is building the quantitative finance infrastructure stack for the on-chain era —
            non-custodial by program, private by MPC, settled by Yellow Protocol, and transparent in every claim we make.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section
        className="relative z-10"
        style={{ borderTop: "1px solid rgba(139,92,246,0.1)", background: "rgba(6,6,9,0.5)" }}
      >
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--color-brand)] mb-4">Mission</p>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl leading-tight">
                Democratize institutional-grade<br />
                <span className="gradient-text">quantitative finance.</span>
              </h2>
              <p className="mt-5 text-[var(--color-muted)] leading-relaxed">
                Today, systematic trading is dominated by institutions with access to custodial clearing,
                private data feeds, and proprietary execution infrastructure. Independent quants with real
                edge have no equivalent tooling.
              </p>
              <p className="mt-4 text-[var(--color-muted)] leading-relaxed">
                SpectraQ changes that. A solo quant with a provable strategy can launch a production vault
                in minutes — with the same non-custodial guarantees, MPC-grade privacy, and institutional
                settlement access that no single on-chain protocol has combined before.
              </p>
              <p className="mt-4 text-[var(--color-muted)] leading-relaxed">
                Yellow Protocol is the settlement layer that makes this institutional-grade. SpectraQ is
                the application layer that makes it accessible.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: "v1", label: "Protocol Version", note: "Devnet · Solana", color: "#8b5cf6", cRgb: "139,92,246" },
                { value: "3", label: "Live Vaults", note: "SpectraQuant marketplace", color: "#10d98c", cRgb: "16,217,140" },
                { value: "L3", label: "Yellow Protocol", note: "State channel clearing", color: "#f59e0b", cRgb: "245,158,11" },
                { value: "8", label: "Program Invariants", note: "All program-enforced", color: "#22d3ee", cRgb: "34,211,238" },
                { value: "100%", label: "Non-Custodial", note: "No admin override possible", color: "#10d98c", cRgb: "16,217,140" },
                { value: "0", label: "Trust Required", note: "Code is the contract", color: "#a78bfa", cRgb: "167,139,250" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="glass rounded-xl p-5"
                  style={{ border: `1px solid rgba(${s.cRgb},0.18)` }}
                >
                  <p className="mono text-2xl font-bold stat-value" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[12px] font-medium mt-1">{s.label}</p>
                  <p className="text-[10px] text-[var(--color-muted-2)] mt-0.5">{s.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 text-center">
          <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--color-brand)]">Principles</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">What we stand for.</h2>
          <p className="mt-3 text-[var(--color-muted)] max-w-xl mx-auto text-sm">
            These aren&apos;t marketing commitments. They&apos;re enforced by the Anchor program, the Arcium circuit, and the Yellow Protocol channel design.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((p, idx) => (
            <div
              key={p.number}
              className={`glass card-glow rounded-2xl p-7 fade-in-up fade-in-up-d${(idx % 3) + 1}`}
              style={{ border: `1px solid rgba(${p.cRgb},0.18)` }}
            >
              <span className="mono text-[11px] font-semibold" style={{ color: `rgba(${p.cRgb},0.5)` }}>{p.number}</span>
              <h3 className="mt-2 text-[15px] font-semibold tracking-tight" style={{ color: p.color }}>{p.title}</h3>
              <p className="mt-3 text-sm text-[var(--color-muted)] leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Non-custodial invariants */}
      <section
        className="relative z-10"
        style={{ borderTop: "1px solid rgba(139,92,246,0.1)", background: "rgba(6,6,9,0.5)" }}
      >
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-2 items-start">
            <div>
              <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--color-positive)] mb-4">Program Invariants</p>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl leading-tight">
                Eight guarantees the<br />
                <span className="gradient-text">code enforces.</span>
              </h2>
              <p className="mt-5 text-[var(--color-muted)] leading-relaxed text-sm">
                These are not policy statements. Every invariant below is enforced by the Anchor program
                and verified in the test suite at{" "}
                <span className="mono text-[var(--color-brand)]">tests/01_vault.ts</span> through{" "}
                <span className="mono text-[var(--color-brand)]">tests/04_raydium.ts</span>.
              </p>
              <a
                href="https://spectraquant.org/strategy"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium transition-all hover:gap-3"
                style={{ color: "var(--color-positive)" }}
              >
                View strategy transparency page →
              </a>
            </div>

            <div className="space-y-3">
              {INVARIANTS.map((inv, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-xl px-4 py-3.5"
                  style={{ background: "rgba(16,217,140,0.04)", border: "1px solid rgba(16,217,140,0.12)" }}
                >
                  <span
                    className="mono shrink-0 text-[10px] font-bold mt-0.5"
                    style={{ color: "var(--color-positive)" }}
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[12px] text-[var(--color-muted)] leading-relaxed">{inv}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 text-center">
          <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--color-brand)]">Roadmap</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Where we&apos;re going.</h2>
        </div>

        <div className="relative max-w-3xl mx-auto">
          {/* Timeline line */}
          <div
            className="absolute left-8 top-0 bottom-0 w-px"
            style={{ background: "linear-gradient(180deg, rgba(139,92,246,0.4), rgba(34,211,238,0.15), transparent)" }}
          />

          <div className="space-y-8">
            {TIMELINE.map((item, idx) => (
              <div key={idx} className="relative flex items-start gap-6 pl-16">
                {/* Dot */}
                <div
                  className="absolute left-[26px] top-1.5 h-4 w-4 rounded-full border-2 flex items-center justify-center"
                  style={{
                    borderColor: item.done ? "var(--color-positive)" : "rgba(139,92,246,0.4)",
                    background: item.done ? "rgba(16,217,140,0.15)" : "rgba(6,6,9,0.8)",
                    boxShadow: item.done ? "0 0 12px rgba(16,217,140,0.3)" : "none",
                  }}
                >
                  {item.done && (
                    <span className="text-[8px]" style={{ color: "var(--color-positive)" }}>✓</span>
                  )}
                </div>

                <div
                  className="glass rounded-xl p-5 w-full card-glow"
                  style={{
                    border: item.done
                      ? "1px solid rgba(16,217,140,0.2)"
                      : "1px solid rgba(139,92,246,0.15)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <span
                        className="mono text-[10px] font-semibold"
                        style={{ color: item.done ? "var(--color-positive)" : "var(--color-muted)" }}
                      >
                        {item.date}
                      </span>
                      <h3 className="mt-1 font-semibold text-[14px]">{item.event}</h3>
                    </div>
                    {item.done && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                        style={{ background: "rgba(16,217,140,0.1)", border: "1px solid rgba(16,217,140,0.25)", color: "var(--color-positive)" }}
                      >
                        Shipped
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[12px] text-[var(--color-muted)] leading-relaxed">{item.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="relative z-10"
        style={{ borderTop: "1px solid rgba(139,92,246,0.1)", background: "rgba(6,6,9,0.5)" }}
      >
        <div className="mx-auto max-w-7xl px-6 py-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Build with us. Deploy today.
          </h2>
          <p className="mt-4 text-[var(--color-muted)] max-w-lg mx-auto">
            SpectraQuant is live on Solana devnet. Every vault, every trade, every signal is fully transparent.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="https://spectraquant.org"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-glow rounded-xl px-8 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                border: "1px solid rgba(196,181,253,0.15)",
              }}
            >
              Open Platform →
            </a>
            <Link
              href="/technology"
              className="glass-light rounded-xl border px-8 py-3.5 text-sm font-medium transition-all hover:border-[rgba(139,92,246,0.35)]"
              style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--color-muted)" }}
            >
              Explore the technology
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

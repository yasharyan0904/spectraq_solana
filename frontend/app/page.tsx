import Link from "next/link";
import { Logo } from "@/components/Logo";

const STATS = [
  { label: "Protocol TVL", value: "Live · Devnet", accent: "var(--color-positive)" },
  { label: "Active Vaults", value: "Coming Soon", accent: "var(--color-muted)" },
  { label: "Depositors", value: "Coming Soon", accent: "var(--color-muted)" },
  { label: "Strategies Launched", value: "Coming Soon", accent: "var(--color-muted)" },
  { label: "MPC Computations", value: "Coming Soon", accent: "var(--color-muted)" },
];

const VAULT_PREVIEWS = [
  {
    name: "MA Crossover Alpha",
    manager: "SpectraQ Labs",
    tag: "Trend Following",
    tvl: "$142,800",
    sharpe: "+1.34",
    ret30d: "+3.1%",
    dd: "−8.2%",
    live: true,
    encrypted: true,
    color: "#8b5cf6",
  },
  {
    name: "Vol-Adj Momentum",
    manager: "0x4af2…3b1c",
    tag: "Momentum",
    tvl: "$89,400",
    sharpe: "+2.10",
    ret30d: "+7.8%",
    dd: "−12.4%",
    live: true,
    encrypted: true,
    color: "#22d3ee",
  },
  {
    name: "Mean Rev Grid",
    manager: "0x9e71…fa02",
    tag: "Mean Reversion",
    tvl: "$54,200",
    sharpe: "+0.91",
    ret30d: "+1.9%",
    dd: "−6.7%",
    live: false,
    encrypted: true,
    color: "#10d98c",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col relative overflow-hidden">

      {/* Ambient background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="float-blob absolute -top-48 -left-48 h-[700px] w-[700px] rounded-full opacity-[0.20] blur-[140px]"
          style={{ background: "radial-gradient(circle, #8b5cf6 0%, #6d28d9 50%, transparent 75%)" }}
        />
        <div
          className="float-blob-slow absolute top-1/4 -right-40 h-[560px] w-[560px] rounded-full opacity-[0.14] blur-[120px]"
          style={{ background: "radial-gradient(circle, #22d3ee 0%, #0891b2 50%, transparent 75%)" }}
        />
        <div
          className="float-blob absolute bottom-0 left-1/3 h-[460px] w-[460px] rounded-full opacity-[0.10] blur-[110px]"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }}
        />
      </div>

      {/* ── Header ────────────────────────────────────────────────── */}
      <header
        className="relative z-20 glass"
        style={{
          borderBottom: "1px solid transparent",
          backgroundImage:
            "linear-gradient(rgba(12, 12, 22, 0.85), rgba(12, 12, 22, 0.85)), linear-gradient(90deg, rgba(139,92,246,0.25), rgba(34,211,238,0.12), rgba(139,92,246,0.08))",
          backgroundOrigin: "border-box",
          backgroundClip: "padding-box, border-box",
        }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-3">
            <Link
              href="/app/marketplace"
              className="hidden text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] md:block"
            >
              Marketplace
            </Link>
            <Link
              href="/strategy"
              className="hidden text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] md:block"
            >
              Transparency
            </Link>
            <Link
              href="/app/launch"
              className="hidden rounded-md border px-3 py-1.5 text-sm text-[var(--color-muted)] transition-all hover:border-[rgba(139,92,246,0.4)] hover:text-[var(--color-text)] md:block"
              style={{ borderColor: "rgba(139,92,246,0.2)" }}
            >
              Launch vault
            </Link>
            <Link
              href="/app"
              className="btn-glow rounded-md px-4 py-1.5 text-sm font-medium text-white transition-all hover:-translate-y-px"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                border: "1px solid rgba(196, 181, 253, 0.15)",
              }}
            >
              Open app →
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-24 md:pt-40">
          <div className="flex flex-col items-start">

            {/* Tech stack badges */}
            <div className="flex flex-wrap items-center gap-2">
              {["Solana", "Arcium MPC", "Pyth Oracle", "Raydium CPMM"].map((tag) => (
                <span key={tag} className="neon-tag">{tag}</span>
              ))}
              <span
                className="ml-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  background: "rgba(16, 217, 140, 0.1)",
                  border: "1px solid rgba(16, 217, 140, 0.3)",
                  color: "var(--color-positive)",
                }}
              >
                Frontier Colosseum 2026
              </span>
            </div>

            {/* Main headline */}
            <h1 className="mt-8 text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl lg:text-8xl">
              <span className="gradient-text">The Shopify</span>
              <br />
              <span className="gradient-text">for Quants.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[var(--color-muted)] md:text-xl">
              Launch a non-custodial trading vault on Solana in minutes.
              Your strategy runs inside{" "}
              <span className="text-[var(--color-cyan)]">Arcium MPC</span> — investors
              see verified on-chain performance. Your alpha stays{" "}
              <span className="text-[var(--color-text)]">completely private</span>.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/app/marketplace"
                className="btn-glow rounded-xl px-8 py-3.5 text-base font-semibold text-white transition-all hover:-translate-y-px"
                style={{
                  background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                  border: "1px solid rgba(196, 181, 253, 0.15)",
                }}
              >
                Browse strategies →
              </Link>
              <Link
                href="/app/launch"
                className="glass-light rounded-xl border px-8 py-3.5 text-base font-medium transition-all hover:border-[rgba(139,92,246,0.35)] hover:text-[var(--color-text)]"
                style={{
                  borderColor: "rgba(139, 92, 246, 0.2)",
                  color: "var(--color-muted)",
                }}
              >
                Launch your vault
              </Link>
            </div>
          </div>
        </section>

        {/* ── Stats ticker ─────────────────────────────────────────── */}
        <section
          style={{
            borderTop: "1px solid rgba(139, 92, 246, 0.12)",
            borderBottom: "1px solid rgba(139, 92, 246, 0.12)",
            background: "rgba(10, 10, 18, 0.5)",
          }}
        >
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex divide-x divide-[rgba(139,92,246,0.1)] overflow-x-auto">
              {STATS.map((s) => (
                <div key={s.label} className="flex min-w-[140px] flex-col items-center gap-0.5 px-8 py-5">
                  <span className="mono text-sm font-semibold" style={{ color: s.accent }}>{s.value}</span>
                  <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Two-audience pitch ─────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-24">
          <div className="mb-12 text-center">
            <p className="mono text-xs uppercase tracking-[0.25em] text-[var(--color-brand)]">Protocol</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Built for two sides of the market.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">

            {/* For Quants */}
            <div
              className="glass card-glow rounded-2xl p-8"
              style={{ border: "1px solid rgba(139, 92, 246, 0.2)" }}
            >
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(109,40,217,0.1))",
                  border: "1px solid rgba(139,92,246,0.3)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight">For Quants</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                Deploy your edge without giving it away. Arcium MPC ensures your strategy
                computation never touches plaintext outside the secure cluster.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Deploy on Solana in under 5 minutes",
                  "Strategy logic encrypted end-to-end via Arcium MXE",
                  "Attract capital with verifiable on-chain returns",
                  "Non-custodial — program handles all settlements",
                  "Monte Carlo validation framework included",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-[var(--color-muted)]">
                    <span className="mt-0.5 shrink-0 text-[var(--color-positive)]">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/app/launch"
                className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-brand)] hover:gap-2.5 transition-all"
              >
                Launch your vault →
              </Link>
            </div>

            {/* For Investors */}
            <div
              className="glass card-glow rounded-2xl p-8"
              style={{ border: "1px solid rgba(34, 211, 238, 0.15)" }}
            >
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  background: "linear-gradient(135deg, rgba(34,211,238,0.15), rgba(8,145,178,0.08))",
                  border: "1px solid rgba(34,211,238,0.25)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.8">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                </svg>
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight">For Investors</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                Browse a curated marketplace of verified trading vaults. Every position
                is on-chain, every return is verifiable, every withdrawal is instant.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Browse vaults ranked by Sharpe, drawdown, TVL",
                  "Strategy validation scores are public and reproducible",
                  "Withdraw any time — non-custodial guarantee in the program",
                  "Real-time NAV, signal state, and trade history on-chain",
                  "No fund manager trust required — code is the contract",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-[var(--color-muted)]">
                    <span className="mt-0.5 shrink-0 text-[var(--color-cyan)]">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/app/marketplace"
                className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-cyan)] hover:gap-2.5 transition-all"
                style={{ color: "var(--color-cyan)" }}
              >
                Explore marketplace →
              </Link>
            </div>
          </div>
        </section>

        {/* ── Marketplace preview ────────────────────────────────────── */}
        <section
          style={{
            borderTop: "1px solid rgba(139, 92, 246, 0.1)",
            background: "rgba(8, 8, 16, 0.4)",
          }}
        >
          <div className="mx-auto max-w-6xl px-4 py-20">
            <div className="mb-10 flex items-end justify-between">
              <div>
                <p className="mono text-xs uppercase tracking-[0.25em] text-[var(--color-brand)]">Marketplace</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                  Live strategy vaults.
                </h2>
              </div>
              <Link
                href="/app/marketplace"
                className="hidden text-sm font-medium text-[var(--color-brand)] opacity-80 hover:opacity-100 transition-opacity md:block"
              >
                View all →
              </Link>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {VAULT_PREVIEWS.map((v) => (
                <div
                  key={v.name}
                  className="glass card-glow relative rounded-2xl p-6 transition-all"
                  style={{ border: "1px solid rgba(139, 92, 246, 0.15)" }}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: v.live ? "var(--color-positive)" : "var(--color-muted)" }}
                        />
                        <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                          {v.live ? "live" : "testnet"}
                        </span>
                      </div>
                      <h3 className="mt-2 text-base font-semibold tracking-tight">{v.name}</h3>
                      <p className="mono text-xs text-[var(--color-muted)]">{v.manager}</p>
                    </div>
                    <span
                      className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        background: `rgba(${v.color === "#8b5cf6" ? "139,92,246" : v.color === "#22d3ee" ? "34,211,238" : "16,217,140"},0.1)`,
                        border: `1px solid ${v.color}33`,
                        color: v.color,
                      }}
                    >
                      {v.tag}
                    </span>
                  </div>

                  {/* Arcium badge */}
                  {v.encrypted && (
                    <div
                      className="mt-4 flex items-center gap-1.5 rounded-lg px-3 py-2"
                      style={{
                        background: "rgba(139,92,246,0.06)",
                        border: "1px solid rgba(139,92,246,0.14)",
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span className="mono text-[10px] text-[var(--color-brand)]">Strategy encrypted · Arcium MPC</span>
                    </div>
                  )}

                  {/* Metrics */}
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">TVL</p>
                      <p className="mono mt-1 text-sm font-semibold text-[var(--color-text)]">{v.tvl}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">Sharpe</p>
                      <p className="mono mt-1 text-sm font-semibold text-[var(--color-positive)]">{v.sharpe}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">30D</p>
                      <p className="mono mt-1 text-sm font-semibold text-[var(--color-positive)]">{v.ret30d}</p>
                    </div>
                  </div>

                  <Link
                    href="/app/marketplace"
                    className="mt-5 flex w-full items-center justify-center rounded-lg py-2 text-sm font-medium transition-all hover:-translate-y-px"
                    style={{
                      background: "rgba(139, 92, 246, 0.1)",
                      border: "1px solid rgba(139, 92, 246, 0.2)",
                      color: "var(--color-brand)",
                    }}
                  >
                    Deposit
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Architecture / MPC section ─────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-24">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
            <div className="flex flex-col justify-center">
              <p className="mono text-xs uppercase tracking-[0.25em] text-[var(--color-brand)]">Architecture</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                Open execution.{" "}
                <span className="gradient-text">Closed inputs.</span>
              </h2>
              <p className="mt-5 leading-relaxed text-[var(--color-muted)]">
                Strategy logic is visible on-chain. The price window each tick consumes is
                threshold-encrypted to the Arcium MXE cluster — decrypted only inside the
                secure computation, never exposed to any single node or the agent.
              </p>
              <p className="mt-4 leading-relaxed text-[var(--color-muted)]">
                The signal lands on-chain as a single integer. Trade execution flows through
                Raydium CPMM. Every step is verifiable. No off-chain oracle holds both the
                data and the decision.
              </p>
              <div className="mt-8 flex gap-4">
                <Link href="/app/arcium" className="text-sm font-medium text-[var(--color-brand)] hover:opacity-80 transition-opacity">
                  MPC internals →
                </Link>
                <Link href="/strategy" className="text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
                  Strategy validation →
                </Link>
              </div>
            </div>

            {/* Terminal */}
            <div
              className="glass card-glow rounded-2xl"
              style={{ border: "1px solid rgba(139, 92, 246, 0.22)" }}
            >
              <div
                className="flex items-center gap-1.5 px-4 py-3 rounded-t-2xl"
                style={{
                  borderBottom: "1px solid rgba(139, 92, 246, 0.12)",
                  background: "rgba(10, 10, 18, 0.5)",
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
                <span className="ml-2 mono text-[10px] text-[var(--color-muted)]">signal-pipeline.ts</span>
              </div>
              <code className="mono block whitespace-pre p-6 text-xs leading-[2.1]">
                <span style={{ color: "var(--color-muted)" }}>{"// Quant strategy → encrypted signal → trade\n"}</span>
                <span style={{ color: "var(--color-muted)" }}>{"priceFeed.window(50)\n"}</span>
                <span style={{ color: "#7070a0" }}>{"   ↓  "}</span>
                <span style={{ color: "rgba(34,211,238,0.75)" }}>{"encrypt(mxe.pubkey)\n"}</span>
                <span style={{ color: "var(--color-cyan)" }}>{"arcium"}</span>
                <span style={{ color: "var(--color-muted)" }}>{"  .computeSignal(encryptedWindow)\n"}</span>
                <span style={{ color: "#7070a0" }}>{"   ↓  "}</span>
                <span style={{ color: "rgba(34,211,238,0.6)" }}>{"// threshold-decrypted inside MXE\n"}</span>
                <span style={{ color: "#7070a0" }}>{"   ↓  "}</span>
                <span style={{ color: "rgba(34,211,238,0.6)" }}>{"// strategy logic runs private\n"}</span>
                <span style={{ color: "var(--color-positive)" }}>{"vault.signal_state"}</span>
                <span style={{ color: "var(--color-muted)" }}>{" = "}</span>
                <span style={{ color: "#a78bfa" }}>{"Ready  // on-chain\n"}</span>
                <span style={{ color: "#7070a0" }}>{"   ↓\n"}</span>
                <span style={{ color: "var(--color-brand)" }}>{"agent"}</span>
                <span style={{ color: "var(--color-muted)" }}>{"."}</span>
                <span style={{ color: "var(--color-text)" }}>{"executeTrade(signal)\n"}</span>
                <span style={{ color: "#7070a0" }}>{"   ↓  "}</span>
                <span style={{ color: "rgba(34,211,238,0.6)" }}>{"// Raydium CPMM SOL ↔ USDC\n"}</span>
                <span style={{ color: "var(--color-positive)" }}>{"TradeExecuted"}</span>
                <span style={{ color: "var(--color-muted)" }}>{" emitted on-chain ✓"}</span>
              </code>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ────────────────────────────────────────────── */}
        <section
          style={{
            borderTop: "1px solid rgba(139, 92, 246, 0.12)",
            background: "rgba(8,8,16,0.5)",
          }}
        >
          <div className="mx-auto max-w-6xl px-4 py-24 text-center">
            <p className="mono text-xs uppercase tracking-[0.25em] text-[var(--color-brand)]">Get started</p>
            <h2 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
              Your strategy deserves{" "}
              <span className="gradient-text">infrastructure.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--color-muted)]">
              Stop running alpha in spreadsheets. Deploy a production vault in minutes —
              non-custodial, MPC-private, on Solana.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link
                href="/app/launch"
                className="btn-glow rounded-xl px-8 py-4 text-base font-semibold text-white transition-all hover:-translate-y-px"
                style={{
                  background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                  border: "1px solid rgba(196, 181, 253, 0.15)",
                }}
              >
                Launch your vault →
              </Link>
              <Link
                href="/app"
                className="glass-light rounded-xl border px-8 py-4 text-base font-medium transition-all hover:border-[rgba(139,92,246,0.35)]"
                style={{
                  borderColor: "rgba(139, 92, 246, 0.2)",
                  color: "var(--color-muted)",
                }}
              >
                Open the app
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer
        className="relative z-10 py-10 text-center text-[12px]"
        style={{ borderTop: "1px solid rgba(139, 92, 246, 0.1)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-6 px-4 flex-wrap">
          <span className="text-[var(--color-muted)]">SpectraQ · Solana devnet</span>
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
            style={{
              background: "rgba(16, 217, 140, 0.08)",
              border: "1px solid rgba(16, 217, 140, 0.25)",
              color: "var(--color-positive)",
            }}
          >
            Frontier Colosseum 2026
          </span>
          <Link href="/strategy" className="text-[var(--color-muted)] hover:text-[var(--color-brand)] transition-colors">
            Strategy transparency
          </Link>
          <Link href="/app/arcium" className="text-[var(--color-muted)] hover:text-[var(--color-brand)] transition-colors">
            Arcium MPC
          </Link>
        </div>
      </footer>
    </div>
  );
}

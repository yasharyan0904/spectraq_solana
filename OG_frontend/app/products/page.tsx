import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Products — SpectraQ",
  description: "SpectraQ product suite: SpectraQuant vault platform, Yellow Protocol settlement engine, and institutional infrastructure.",
};

const PRODUCTS = [
  {
    status: "Live · Devnet",
    statusColor: "var(--color-positive)",
    tag: "Flagship",
    tagColor: "#8b5cf6",
    tagRgb: "139,92,246",
    name: "SpectraQuant",
    domain: "spectraquant.org",
    domainHref: "https://spectraquant.org",
    headline: "The Shopify for Quants.",
    description:
      "A non-custodial trading vault protocol on Solana. Quants deploy strategy vaults backed by Arcium MPC encryption. Investors browse a Sharpe-ranked marketplace and deposit with a non-custodial guarantee.",
    features: [
      { text: "Anchor program vault — program-owned PDAs, no custodian", icon: "🔒" },
      { text: "Strategy logic encrypted inside Arcium MXE cluster", icon: "🔐" },
      { text: "Sharpe, drawdown, TVL-ranked marketplace", icon: "📊" },
      { text: "Yellow Protocol state channel settlement routing", icon: "⚡" },
      { text: "Monte Carlo permutation test validation framework", icon: "📈" },
      { text: "Non-custodial withdrawal always available", icon: "✓" },
    ],
    cta: "Open Platform →",
    ctaHref: "https://spectraquant.org",
    secondaryCta: "View strategy transparency →",
    secondaryHref: "https://spectraquant.org/strategy",
    color: "#8b5cf6",
    cRgb: "139,92,246",
  },
  {
    status: "Coming Soon",
    statusColor: "var(--color-gold)",
    tag: "Yellow Exchange",
    tagColor: "#f59e0b",
    tagRgb: "245,158,11",
    name: "Yellow Index Pools",
    domain: "Yellow Protocol Exchange",
    domainHref: "/technology#yellow",
    headline: "Managed asset pools on Yellow Protocol's exchange.",
    description:
      "SpectraQ's second platform — entirely independent from Solana. On Yellow Protocol's own exchange, users deposit capital into structured trading pools that track systematic strategies: S&P 500 baskets, NIFTY 50 exposure, commodities, and more. Think of it like an index fund, built by quants, on Yellow's exchange.",
    features: [
      { text: "Yellow Protocol's independent exchange — no Solana connection", icon: "⬡" },
      { text: "S&P 500, NIFTY 50, and other index-style pools", icon: "📊" },
      { text: "Users deposit into collective managed vaults", icon: "🏦" },
      { text: "Pool rebalancing follows a defined systematic mandate", icon: "⚖️" },
      { text: "Transparent pool composition and rules, publicly disclosed", icon: "📋" },
      { text: "Built and operated by SpectraQ quants on Yellow's platform", icon: "⬡" },
    ],
    cta: "Learn about Yellow pools →",
    ctaHref: "/technology#yellow",
    secondaryCta: null,
    secondaryHref: null,
    color: "#f59e0b",
    cRgb: "245,158,11",
  },
  {
    status: "Planned · Mainnet",
    statusColor: "var(--color-muted)",
    tag: "Institutional",
    tagColor: "#22d3ee",
    tagRgb: "34,211,238",
    name: "SpectraQ API",
    domain: "api.spectraq.org",
    domainHref: "#",
    headline: "Programmatic vault infrastructure for institutions.",
    description:
      "A REST and WebSocket API layer giving institutions programmatic access to vault creation, strategy deployment, NAV streaming, and Arcium circuit management on Solana — without the UI.",
    features: [
      { text: "REST API for vault lifecycle management", icon: "🔧" },
      { text: "WebSocket streams: NAV, signals, trade events", icon: "📡" },
      { text: "Arcium MPC strategy deployment and circuit management", icon: "🔐" },
      { text: "Arcium MPC circuit deployment tooling", icon: "🔐" },
      { text: "Pyth oracle integration for custom feeds", icon: "Ψ" },
      { text: "Institutional-grade SLA and dedicated RPC", icon: "🏦" },
    ],
    cta: "Join the waitlist",
    ctaHref: "#",
    secondaryCta: null,
    secondaryHref: null,
    color: "#22d3ee",
    cRgb: "34,211,238",
  },
];

const COMPARISON = [
  { feature: "Custody of funds", spectraq: "None — program PDAs", trad: "Custodial fund structure" },
  { feature: "Strategy privacy", spectraq: "Arcium MPC encrypted", trad: "Trust-based NDAs" },
  { feature: "Return verification", spectraq: "On-chain, immutable", trad: "Auditor reports" },
  { feature: "Settlement", spectraq: "Yellow Protocol L3", trad: "T+2 broker clearing" },
  { feature: "Withdrawal", spectraq: "Instant, always open", trad: "Redemption windows" },
  { feature: "Minimum investment", spectraq: "No minimum", trad: "Accredited only" },
];

export default function ProductsPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Ambient */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div
          className="float-blob absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full opacity-[0.13] blur-[140px]"
          style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 65%)" }}
        />
        <div
          className="float-blob-slow absolute top-1/2 -right-40 h-[500px] w-[500px] rounded-full opacity-[0.10] blur-[120px]"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 65%)" }}
        />
      </div>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-16 pt-24 md:pt-32">
        <div className="fade-in-up max-w-3xl">
          <span className="neon-tag">Products</span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-6xl">
            Infrastructure for the{" "}
            <span className="gradient-text">on-chain quant era.</span>
          </h1>
          <p className="mt-5 text-lg text-[var(--color-muted)] leading-relaxed max-w-2xl">
            From the flagship SpectraQuant vault platform to institutional settlement via Yellow Protocol —
            every SpectraQ product is non-custodial, verifiable, and built for Solana.
          </p>
        </div>
      </section>

      {/* Products list */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="space-y-10">
          {PRODUCTS.map((p, idx) => (
            <div
              key={p.name}
              className={`glass card-glow rounded-2xl overflow-hidden fade-in-up fade-in-up-d${idx + 1}`}
              style={{ border: `1px solid rgba(${p.cRgb},0.2)` }}
            >
              <div className="grid lg:grid-cols-5">
                {/* Left info */}
                <div className="lg:col-span-3 p-8 md:p-10">
                  <div className="flex flex-wrap items-center gap-3 mb-5">
                    <span
                      className="rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        background: `rgba(${p.cRgb},0.1)`,
                        border: `1px solid rgba(${p.cRgb},0.25)`,
                        color: p.color,
                      }}
                    >
                      {p.tag}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                      style={{ color: p.statusColor, background: "rgba(16,16,28,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      {p.status}
                    </span>
                  </div>

                  <h2
                    className="text-3xl font-bold tracking-tight mb-1"
                    style={{ color: p.color }}
                  >
                    {p.name}
                  </h2>
                  <a
                    href={p.domainHref}
                    target={p.domainHref.startsWith("http") ? "_blank" : "_self"}
                    rel="noopener noreferrer"
                    className="mono text-[11px] transition-colors hover:opacity-80"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {p.domain} ↗
                  </a>

                  <p className="mt-4 text-xl font-medium tracking-tight">{p.headline}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)] max-w-xl">{p.description}</p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <a
                      href={p.ctaHref}
                      target={p.ctaHref.startsWith("http") ? "_blank" : "_self"}
                      rel="noopener noreferrer"
                      className="btn-glow rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
                      style={{
                        background: `linear-gradient(135deg, rgba(${p.cRgb},0.9), rgba(${p.cRgb},0.6))`,
                        border: `1px solid rgba(${p.cRgb},0.3)`,
                      }}
                    >
                      {p.cta}
                    </a>
                    {p.secondaryCta && p.secondaryHref && (
                      <a
                        href={p.secondaryHref}
                        target={p.secondaryHref.startsWith("http") ? "_blank" : "_self"}
                        rel="noopener noreferrer"
                        className="glass-light rounded-xl border px-6 py-2.5 text-sm font-medium transition-all"
                        style={{ borderColor: `rgba(${p.cRgb},0.2)`, color: "var(--color-muted)" }}
                      >
                        {p.secondaryCta}
                      </a>
                    )}
                  </div>
                </div>

                {/* Right features */}
                <div
                  className="lg:col-span-2 p-8 md:p-10"
                  style={{ borderLeft: `1px solid rgba(${p.cRgb},0.12)`, background: `rgba(${p.cRgb},0.03)` }}
                >
                  <p className="mono text-[9px] uppercase tracking-[0.22em] mb-5" style={{ color: p.color }}>Features</p>
                  <ul className="space-y-3.5">
                    {p.features.map((f) => (
                      <li key={f.text} className="flex items-start gap-3">
                        <span className="text-sm mt-0.5 shrink-0">{f.icon}</span>
                        <span className="text-[13px] text-[var(--color-muted)] leading-snug">{f.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section
        className="relative z-10"
        style={{ borderTop: "1px solid rgba(139,92,246,0.1)", background: "rgba(6,6,9,0.5)" }}
      >
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="mb-10 text-center">
            <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--color-brand)]">Why On-Chain</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              SpectraQ vs. Traditional Quant Funds
            </h2>
          </div>

          <div
            className="glass rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(139,92,246,0.18)" }}
          >
            {/* Header */}
            <div
              className="grid grid-cols-3 px-6 py-3"
              style={{ borderBottom: "1px solid rgba(139,92,246,0.12)", background: "rgba(10,10,18,0.5)" }}
            >
              <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]">Feature</span>
              <span className="mono text-[10px] uppercase tracking-wider text-center" style={{ color: "var(--color-brand)" }}>SpectraQ</span>
              <span className="mono text-[10px] uppercase tracking-wider text-center text-[var(--color-muted)]">Traditional</span>
            </div>

            {COMPARISON.map((row, idx) => (
              <div
                key={row.feature}
                className="grid grid-cols-3 items-center px-6 py-4"
                style={{
                  borderBottom: idx < COMPARISON.length - 1 ? "1px solid rgba(139,92,246,0.07)" : "none",
                  background: idx % 2 === 0 ? "transparent" : "rgba(139,92,246,0.02)",
                }}
              >
                <span className="text-sm text-[var(--color-muted)]">{row.feature}</span>
                <div className="flex justify-center">
                  <span
                    className="rounded-md px-2.5 py-1 text-[11px] font-medium text-center"
                    style={{ background: "rgba(16,217,140,0.08)", border: "1px solid rgba(16,217,140,0.2)", color: "var(--color-positive)" }}
                  >
                    {row.spectraq}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-muted-2)] text-center">{row.trad}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Ready to deploy your first vault?
        </h2>
        <p className="mt-4 text-[var(--color-muted)] max-w-lg mx-auto">
          SpectraQuant is live on Solana devnet. Launch a strategy vault in under five minutes.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a
            href="https://spectraquant.org/app/launch"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-glow rounded-xl px-8 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              border: "1px solid rgba(196,181,253,0.15)",
            }}
          >
            Launch your vault →
          </a>
          <Link
            href="/technology"
            className="glass-light rounded-xl border px-8 py-3.5 text-sm font-medium transition-all hover:border-[rgba(139,92,246,0.35)]"
            style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--color-muted)" }}
          >
            Read the technology docs
          </Link>
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Technology — SpectraQ",
  description: "Deep-dive on SpectraQ's technology stack: Solana with Arcium MPC vaults, Yellow Protocol exchange pools, and Pyth Oracle.",
};

const TECH_STACK = [
  {
    id: "solana",
    logo: "◎",
    name: "Solana",
    category: "Vault Execution Layer",
    color: "#9945ff",
    cRgb: "153,69,255",
    headline: "The fastest blockchain for production-grade private vaults.",
    body: [
      "Solana is the foundation of SpectraQ's vault platform (spectraquant.org). Its 65,000 TPS throughput and 400ms average block time allow vault agents to execute strategies at market speed, not settlement speed.",
      "The SpectraQ vault program is built with Anchor (0.32.1), using program-derived addresses (PDAs) to hold depositor USDC and SOL — no private key, no admin override, no custodian. Every action is an atomic on-chain instruction.",
      "Strategy logic runs inside Arcium's MXE cluster on top of Solana, keeping alpha completely private while all trade executions, NAV ticks, and signal states are verifiable on-chain. Pyth oracle feeds validate every trade for price staleness and slippage compliance.",
    ],
    specs: [
      { label: "Throughput", value: "65,000 TPS" },
      { label: "Block time", value: "400ms" },
      { label: "Finality", value: "~1s" },
      { label: "Tx cost", value: "< $0.001" },
      { label: "Framework", value: "Anchor 0.32.1" },
      { label: "Token standard", value: "SPL Token" },
    ],
  },
  {
    id: "yellow",
    logo: "⬡",
    name: "Yellow Protocol",
    category: "Exchange Pool Platform",
    color: "#f59e0b",
    cRgb: "245,158,11",
    headline: "An independent exchange where users invest in managed index pools.",
    body: [
      "Yellow Protocol is SpectraQ's second, entirely independent platform — separate from Solana in every way. It is Yellow's own exchange where users deposit capital into structured trading pools that track systematic strategies, similar to how someone would invest in an S&P 500 or NIFTY 50 index fund.",
      "On Yellow's exchange, SpectraQ operates managed vaults: users choose a pool, deposit funds, and the pool rebalances according to its mandate — whether that's a equity index basket, a commodity pool, or a volatility strategy. Unlike the Solana vault platform where users retain individual control, Yellow pools are collective investment vehicles.",
      "This product is in development. When live, it will give retail and institutional users access to systematic, quantitatively managed exposure on Yellow Protocol's exchange — with full transparency on pool composition, rebalancing rules, and historical performance.",
    ],
    specs: [
      { label: "Platform", value: "Yellow Exchange" },
      { label: "Product type", value: "Index Pools" },
      { label: "Examples", value: "S&P 500, NIFTY 50" },
      { label: "Relation to Solana", value: "None" },
      { label: "Status", value: "Coming Soon" },
      { label: "Model", value: "Managed pool" },
    ],
  },
  {
    id: "arcium",
    logo: "⬡",
    name: "Arcium MPC",
    category: "Strategy Privacy Layer (Solana)",
    color: "#8b5cf6",
    cRgb: "139,92,246",
    headline: "Threshold-encrypted computation for private strategy execution.",
    body: [
      "Arcium's Multi-Party Computation environment (MXE) allows SpectraQ to run strategy logic inside a threshold-encrypted secure cluster. Price windows consumed by the strategy are encrypted to the MXE's public key — no single node, no agent, no observer ever sees the plaintext inputs.",
      "The signal computation runs inside the MXE: data is threshold-decrypted inside the secure cluster, the strategy circuit (moving-average crossover, genetic algorithm pattern, or any future circuit) executes, and only the final signal — a single integer — is returned on-chain via a callback to the vault program.",
      "This means quants can deploy their edge on-chain without exposing it. Investors see only the on-chain signal state and realized trade history. The strategy logic is verifiable by the MPC cluster but never exposed to any external party, preserving the quant's competitive advantage entirely.",
    ],
    specs: [
      { label: "Cluster offset", value: "456" },
      { label: "Recovery set", value: "4 nodes" },
      { label: "Encryption", value: "Threshold MXE" },
      { label: "Signal output", value: "On-chain int" },
      { label: "MXE pubkey", value: "HjiD5…nKt" },
      { label: "Chain", value: "Solana" },
    ],
  },
  {
    id: "pyth",
    logo: "Ψ",
    name: "Pyth Oracle",
    category: "Price Feed Integrity (Solana)",
    color: "#22d3ee",
    cRgb: "34,211,238",
    headline: "Real-time institutional-grade price feeds that enforce trade integrity.",
    body: [
      "Every vault trade on the Solana platform is validated against a Pyth oracle price feed. The vault program reads the Pyth SOL/USD price on every execute_trade instruction and computes a Pyth-derived minimum output — if the realized slippage exceeds this bound, the trade reverts entirely.",
      "Pyth's sub-second update frequency and published confidence intervals allow the program to enforce tight price validity windows. Staleness is checked on every read — any feed older than the configured threshold causes the instruction to fail, preventing trades against stale prices.",
      "The Pyth feed address is bound to the vault at initialization and cannot be substituted at runtime. This means an attacker cannot pass a different feed to manipulate slippage calculations — the program verifies the feed pubkey matches vault_state.sol_usd_feed_id on every single price read.",
    ],
    specs: [
      { label: "Update frequency", value: "< 1s" },
      { label: "Feed binding", value: "At init" },
      { label: "Staleness (devnet)", value: "600s max" },
      { label: "Slippage cap", value: "10% devnet" },
      { label: "SOL/USD feed", value: "7UVim…iE" },
      { label: "Validation", value: "Every trade" },
    ],
  },
];

export default function TechnologyPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Ambient */}
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div
          className="float-blob absolute -top-32 right-1/4 h-[700px] w-[700px] rounded-full opacity-[0.12] blur-[150px]"
          style={{ background: "radial-gradient(circle, #8b5cf6 0%, transparent 65%)" }}
        />
        <div
          className="float-blob-slow absolute bottom-0 left-0 h-[500px] w-[500px] rounded-full opacity-[0.09] blur-[120px]"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 65%)" }}
        />
      </div>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-16 pt-24 md:pt-32">
        <div className="fade-in-up max-w-3xl">
          <span className="neon-tag">Technology</span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-6xl">
            Two platforms.{" "}
            <span className="gradient-text">Purpose-built stacks.</span>
          </h1>
          <p className="mt-5 text-lg text-[var(--color-muted)] leading-relaxed max-w-2xl">
            SpectraQ operates on two completely independent platforms: encrypted quant vaults on Solana,
            and managed index-style pools on Yellow Protocol&apos;s exchange. Each is built for its own mandate.
          </p>
        </div>

        {/* Two-platform split */}
        <div className="mt-12 fade-in-up fade-in-up-d2 grid gap-4 md:grid-cols-2 max-w-3xl">
          <div
            className="glass rounded-2xl p-6"
            style={{ border: "1px solid rgba(153,69,255,0.22)" }}
          >
            <p className="mono text-[9px] uppercase tracking-[0.22em] mb-3" style={{ color: "#9945ff" }}>Platform 1</p>
            <p className="font-semibold text-[15px]" style={{ color: "#9945ff" }}>SpectraQuant · Solana</p>
            <p className="text-[12px] text-[var(--color-muted)] mt-2 leading-relaxed">
              Non-custodial quant vaults with Arcium MPC strategy privacy and Pyth oracle-validated trade execution.
            </p>
            <div className="mt-3 space-y-1.5">
              {["Arcium MPC encryption", "Solana program PDAs", "Pyth oracle validation", "Raydium CPMM execution"].map(p => (
                <div key={p} className="flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
                  <span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#9945ff" }} />
                  {p}
                </div>
              ))}
            </div>
          </div>
          <div
            className="glass rounded-2xl p-6"
            style={{ border: "1px solid rgba(245,158,11,0.22)" }}
          >
            <p className="mono text-[9px] uppercase tracking-[0.22em] mb-3" style={{ color: "#f59e0b" }}>Platform 2</p>
            <p className="font-semibold text-[15px]" style={{ color: "#f59e0b" }}>Index Pools · Yellow Exchange</p>
            <p className="text-[12px] text-[var(--color-muted)] mt-2 leading-relaxed">
              Managed asset pools on Yellow Protocol&apos;s independent exchange — S&P 500, NIFTY 50, and other systematic strategies.
            </p>
            <div className="mt-3 space-y-1.5">
              {["Yellow Protocol exchange", "Index-style pools", "User deposits into pools", "Coming soon"].map(p => (
                <div key={p} className="flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
                  <span className="h-1 w-1 rounded-full shrink-0" style={{ background: "#f59e0b" }} />
                  {p}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tech deep-dives */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div className="space-y-20">
          {TECH_STACK.map((t, idx) => (
            <div
              key={t.id}
              id={t.id}
              className={`fade-in-up fade-in-up-d${(idx % 4) + 1}`}
            >
              {/* Section heading badge */}
              <div
                className="inline-flex items-center gap-3 rounded-xl px-4 py-2 mb-8"
                style={{ background: `rgba(${t.cRgb},0.07)`, border: `1px solid rgba(${t.cRgb},0.2)` }}
              >
                <span className="mono text-xl font-bold" style={{ color: t.color }}>{t.logo}</span>
                <div>
                  <p className="mono text-[9px] uppercase tracking-[0.2em] text-[var(--color-muted)]">{t.category}</p>
                  <p className="font-semibold text-[15px]" style={{ color: t.color }}>{t.name}</p>
                </div>
              </div>

              <div className="grid gap-10 lg:grid-cols-5 items-start">
                {/* Body — wider */}
                <div className="lg:col-span-3">
                  <h2 className="text-2xl font-semibold tracking-tight md:text-3xl leading-tight">{t.headline}</h2>
                  <div className="mt-5 space-y-4">
                    {t.body.map((para, pi) => (
                      <p key={pi} className="text-[var(--color-muted)] leading-relaxed text-sm">{para}</p>
                    ))}
                  </div>
                </div>

                {/* Specs — narrower */}
                <div className="lg:col-span-2">
                  <p className="mono text-[9px] uppercase tracking-[0.22em] mb-4" style={{ color: t.color }}>Specifications</p>
                  <div className="grid grid-cols-2 gap-3">
                    {t.specs.map((s) => (
                      <div
                        key={s.label}
                        className="rounded-xl p-3.5"
                        style={{ background: `rgba(${t.cRgb},0.05)`, border: `1px solid rgba(${t.cRgb},0.14)` }}
                      >
                        <p className="text-[9px] uppercase tracking-wider text-[var(--color-muted)] mb-1.5">{s.label}</p>
                        <p className="mono text-[13px] font-semibold" style={{ color: t.color }}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {idx < TECH_STACK.length - 1 && (
                <div className="divider-glow mt-20" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        className="relative z-10"
        style={{ borderTop: "1px solid rgba(139,92,246,0.1)", background: "rgba(6,6,9,0.5)" }}
      >
        <div className="mx-auto max-w-7xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Ready to explore the platform?</h2>
          <p className="mt-3 text-[var(--color-muted)] max-w-md mx-auto">
            SpectraQuant is live on Solana devnet. Yellow Protocol pools are coming soon.
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
              Open Solana Platform →
            </a>
            <Link
              href="/products"
              className="glass-light rounded-xl border px-8 py-3.5 text-sm font-medium transition-all hover:border-[rgba(139,92,246,0.35)]"
              style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--color-muted)" }}
            >
              View all products
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

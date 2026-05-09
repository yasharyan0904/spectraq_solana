import Link from "next/link";

const PILLARS = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.7">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "Non-Custodial",
    body: "Vault funds are held in Anchor program PDAs. No admin, no agent, no counterparty can withdraw depositor capital.",
    color: "#8b5cf6",
    colorRgb: "139,92,246",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.7">
        <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
    title: "MPC-Private",
    body: "Strategy logic runs inside Arcium's threshold-encrypted MXE cluster. Your alpha never touches plaintext outside the secure node set.",
    color: "#22d3ee",
    colorRgb: "34,211,238",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10d98c" strokeWidth="1.7">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    title: "Verifiable Returns",
    body: "Every NAV tick, every signal emission, every trade execution is emitted on-chain. Monte Carlo permutation testing validates strategy statistics.",
    color: "#10d98c",
    colorRgb: "16,217,140",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.7">
        <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: "Yellow Exchange Pools",
    body: "On Yellow Protocol's exchange, users deposit capital into managed trading pools — like S&P 500 or NIFTY 50 baskets — built and operated independently from the Solana vault platform.",
    color: "#f59e0b",
    colorRgb: "245,158,11",
  },
];

const STATS = [
  { label: "Blockchain", value: "Solana", note: "65,000 TPS · 400ms finality", color: "#9945ff" },
  { label: "Exchange", value: "Yellow Protocol", note: "Index-style asset pool trading", color: "#f59e0b" },
  { label: "Privacy", value: "Arcium MPC", note: "Threshold-encrypted circuits", color: "#8b5cf6" },
  { label: "Oracle", value: "Pyth Network", note: "Real-time price feeds", color: "#22d3ee" },
  { label: "Vault Type", value: "Non-Custodial", note: "Program-owned PDAs", color: "#10d98c" },
];

const YELLOW_NODES = [
  { label: "Broker A", x: "10%", y: "38%", color: "#a78bfa" },
  { label: "Broker B", x: "80%", y: "16%", color: "#22d3ee" },
  { label: "Broker C", x: "75%", y: "68%", color: "#10d98c" },
  { label: "SpectraQ", x: "42%", y: "50%", color: "#f59e0b", highlight: true },
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">

      {/* ── Ambient blobs ────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="float-blob absolute -top-56 -left-56 h-[820px] w-[820px] rounded-full opacity-[0.18] blur-[160px]"
          style={{ background: "radial-gradient(circle, #8b5cf6 0%, #6d28d9 45%, transparent 70%)" }}
        />
        <div
          className="float-blob-slow absolute top-1/3 -right-48 h-[640px] w-[640px] rounded-full opacity-[0.12] blur-[130px]"
          style={{ background: "radial-gradient(circle, #22d3ee 0%, #0891b2 45%, transparent 70%)" }}
        />
        <div
          className="float-blob-med absolute bottom-0 left-1/4 h-[500px] w-[500px] rounded-full opacity-[0.10] blur-[120px]"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 65%)" }}
        />
        <div
          className="float-blob-slow absolute -bottom-24 right-1/4 h-[400px] w-[400px] rounded-full opacity-[0.08] blur-[100px]"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }}
        />
      </div>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-20 pt-28 md:pt-44">
        <div className="max-w-4xl">

          <h1 className="fade-in-up fade-in-up-d1 text-[clamp(2.8rem,6vw,5.5rem)] font-bold leading-[1.03] tracking-tight">
            The Quantitative Finance<br />
            <span className="gradient-text">Stack for the</span>
            {" "}
            <span
              style={{
                background: "linear-gradient(135deg, #f59e0b 0%, #fcd34d 50%, #f59e0b 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              On-Chain Era.
            </span>
          </h1>

          <p className="fade-in-up fade-in-up-d2 mt-7 max-w-2xl text-[1.15rem] leading-relaxed text-[var(--color-muted)]">
            SpectraQ powers two independent platforms — non-custodial MPC-encrypted trading vaults on{" "}
            <span className="text-[var(--color-text)] font-medium">Solana</span>, and index-style managed asset pools on{" "}
            <span className="gradient-text-gold font-medium">Yellow Protocol</span>&apos;s exchange where users invest like S&P 500 or NIFTY 50.
          </p>

          <div className="fade-in-up fade-in-up-d3 mt-10 flex flex-wrap gap-4">
            <a
              href="https://spectraquant.org"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-glow rounded-xl px-8 py-3.5 text-base font-semibold text-white transition-all hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                border: "1px solid rgba(196,181,253,0.15)",
              }}
            >
              Open Platform →
            </a>
            <Link
              href="/products"
              className="glass-light rounded-xl border px-8 py-3.5 text-base font-medium transition-all hover:border-[rgba(139,92,246,0.35)] hover:text-[var(--color-text)]"
              style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--color-muted)" }}
            >
              View Products
            </Link>
            <Link
              href="/technology"
              className="glass-light rounded-xl border px-8 py-3.5 text-base font-medium transition-all hover:border-[rgba(245,158,11,0.35)] hover:text-[var(--color-gold)]"
              style={{ borderColor: "rgba(245,158,11,0.18)", color: "var(--color-muted)" }}
            >
              Technology
            </Link>
          </div>
        </div>

        {/* Floating metrics card */}
        <div
          className="fade-in-up fade-in-up-d4 mt-16 hidden lg:block absolute right-6 top-28 w-64 glass rounded-2xl p-5 scan-border"
          style={{ border: "1px solid rgba(139,92,246,0.22)" }}
        >
          <p className="mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-brand)] mb-3">Live · Devnet</p>
          <div className="space-y-3">
            {[
              { label: "Protocol TVL", value: "Active", color: "var(--color-positive)" },
              { label: "Vaults Running", value: "3 Live", color: "var(--color-text)" },
              { label: "Yellow Exchange", value: "Pools Live", color: "var(--color-gold)" },
              { label: "Computation", value: "Arcium MXE", color: "var(--color-brand)" },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--color-muted)]">{m.label}</span>
                <span className="mono text-[11px] font-semibold" style={{ color: m.color }}>{m.value}</span>
              </div>
            ))}
          </div>
          <div
            className="mt-4 rounded-lg px-3 py-2 flex items-center gap-2"
            style={{ background: "rgba(16,217,140,0.06)", border: "1px solid rgba(16,217,140,0.15)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full pulse-dot" style={{ background: "var(--color-positive)", animation: "badge-pulse 1.8s ease-out infinite" }} />
            <span className="text-[10px] text-[var(--color-positive)]">All systems operational</span>
          </div>
        </div>
      </section>

      {/* ── Ticker / Stats bar ─────────────────────────────────────────── */}
      <div
        className="relative z-10"
        style={{
          borderTop: "1px solid rgba(139,92,246,0.12)",
          borderBottom: "1px solid rgba(139,92,246,0.12)",
          background: "rgba(6,6,9,0.6)",
          overflow: "hidden",
        }}
      >
        <div className="flex ticker-track w-max">
          {[...STATS, ...STATS].map((s, i) => (
            <div
              key={i}
              className="flex shrink-0 items-center gap-4 px-10 py-4"
              style={{ borderRight: "1px solid rgba(139,92,246,0.08)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
              <span className="mono text-xs font-semibold" style={{ color: s.color }}>{s.value}</span>
              <span className="text-[11px] text-[var(--color-muted-2)]">{s.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Four Pillars ───────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 text-center">
          <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--color-brand)]">Protocol</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Four principles. Zero compromise.
          </h2>
          <p className="mt-3 text-[var(--color-muted)] max-w-xl mx-auto text-sm leading-relaxed">
            Every SpectraQ product is built on these invariants — enforced at the program level, not policy level.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, idx) => (
            <div
              key={p.title}
              className={`glass card-glow rounded-2xl p-6 fade-in-up fade-in-up-d${idx + 1}`}
              style={{ border: `1px solid rgba(${p.colorRgb},0.18)` }}
            >
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl mb-5"
                style={{
                  background: `rgba(${p.colorRgb},0.1)`,
                  border: `1px solid rgba(${p.colorRgb},0.25)`,
                  boxShadow: `0 0 20px rgba(${p.colorRgb},0.1)`,
                }}
              >
                {p.icon}
              </div>
              <h3 className="text-[15px] font-semibold tracking-tight mb-2" style={{ color: p.color }}>{p.title}</h3>
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Featured Product — SpectraQuant ───────────────────────────── */}
      <section
        className="relative z-10"
        style={{
          borderTop: "1px solid rgba(139,92,246,0.1)",
          background: "rgba(8,8,14,0.5)",
        }}
      >
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-12">
            <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--color-brand)]">Flagship Product</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              SpectraQuant — The Shopify for Quants.
            </h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-5">
            {/* Left — product description */}
            <div className="lg:col-span-2 flex flex-col justify-between">
              <div>
                <p className="text-[var(--color-muted)] leading-relaxed">
                  Launch a fully non-custodial trading vault on Solana in under five minutes.
                  Your strategy runs encrypted inside Arcium&apos;s MXE cluster — investors see
                  verified on-chain performance, your alpha stays completely private.
                </p>
                <ul className="mt-7 space-y-3">
                  {[
                    { text: "Non-custodial Anchor program vault", color: "var(--color-positive)" },
                    { text: "Strategy computation via Arcium MPC", color: "var(--color-brand)" },
                    { text: "Sharpe-ranked marketplace for investors", color: "var(--color-cyan)" },
                    { text: "Yellow Protocol settlement routing", color: "var(--color-gold)" },
                    { text: "Monte Carlo validated strategy statistics", color: "var(--color-positive)" },
                  ].map((item) => (
                    <li key={item.text} className="flex items-start gap-2.5 text-sm text-[var(--color-muted)]">
                      <span className="mt-0.5 shrink-0" style={{ color: item.color }}>✓</span>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="https://spectraquant.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 btn-glow inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
                  style={{
                    background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                    border: "1px solid rgba(196,181,253,0.15)",
                  }}
                >
                  Open spectraquant.org →
                </a>
              </div>
            </div>

            {/* Right — platform preview card */}
            <div className="lg:col-span-3">
              <div
                className="glass rounded-2xl scan-border"
                style={{ border: "1px solid rgba(139,92,246,0.22)" }}
              >
                {/* Terminal header */}
                <div
                  className="flex items-center justify-between px-5 py-3 rounded-t-2xl"
                  style={{ borderBottom: "1px solid rgba(139,92,246,0.12)", background: "rgba(6,6,9,0.5)" }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
                  </div>
                  <span className="mono text-[10px] text-[var(--color-muted)]">spectraquant.org/app</span>
                  <span
                    className="rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                    style={{ background: "rgba(16,217,140,0.1)", border: "1px solid rgba(16,217,140,0.25)", color: "var(--color-positive)" }}
                  >
                    Live
                  </span>
                </div>

                {/* Vault cards grid */}
                <div className="p-5 space-y-3">
                  {[
                    { name: "MA Crossover Alpha", tag: "Trend Following", tvl: "$142,800", sharpe: "+1.34", ret: "+3.1%", color: "#8b5cf6", cRgb: "139,92,246" },
                    { name: "Vol-Adj Momentum", tag: "Momentum", tvl: "$89,400", sharpe: "+2.10", ret: "+7.8%", color: "#22d3ee", cRgb: "34,211,238" },
                    { name: "Mean Rev Grid", tag: "Mean Reversion", tvl: "$54,200", sharpe: "+0.91", ret: "+1.9%", color: "#10d98c", cRgb: "16,217,140" },
                  ].map((v) => (
                    <div
                      key={v.name}
                      className="rounded-xl p-4 flex items-center justify-between"
                      style={{ background: `rgba(${v.cRgb},0.05)`, border: `1px solid rgba(${v.cRgb},0.15)` }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: `rgba(${v.cRgb},0.12)`, border: `1px solid rgba(${v.cRgb},0.25)` }}
                        >
                          <span className="mono text-[10px] font-bold" style={{ color: v.color }}>σ</span>
                        </div>
                        <div>
                          <p className="text-[13px] font-medium">{v.name}</p>
                          <p className="mono text-[10px] text-[var(--color-muted)]">{v.tag} · Arcium MPC</p>
                        </div>
                      </div>
                      <div className="flex gap-5">
                        <div className="text-right hidden sm:block">
                          <p className="text-[9px] uppercase tracking-wider text-[var(--color-muted)]">TVL</p>
                          <p className="mono text-[12px] font-semibold">{v.tvl}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] uppercase tracking-wider text-[var(--color-muted)]">30D</p>
                          <p className="mono text-[12px] font-semibold text-[var(--color-positive)]">{v.ret}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] uppercase tracking-wider text-[var(--color-muted)]">Sharpe</p>
                          <p className="mono text-[12px] font-semibold text-[var(--color-positive)]">{v.sharpe}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div
                    className="rounded-xl px-4 py-2.5 flex items-center justify-between"
                    style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.1)" }}
                  >
                    <span className="text-[11px] text-[var(--color-muted)]">+ 12 more vaults on marketplace</span>
                    <span className="mono text-[10px] text-[var(--color-brand)]">View all →</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Yellow Protocol Section ────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-14 lg:grid-cols-2 items-center">
          <div>
            <span className="neon-tag-gold">Yellow Protocol</span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl leading-tight">
              Managed asset pools on{" "}
              <span className="gradient-text-gold">Yellow&apos;s exchange.</span>
            </h2>
            <p className="mt-5 text-[var(--color-muted)] leading-relaxed">
              Yellow Protocol is an independent trading exchange — entirely separate from Solana.
              SpectraQ is building managed asset pool products on Yellow where users deposit
              capital into structured trading vaults that mirror index strategies like S&amp;P 500
              or NIFTY 50 baskets.
            </p>
            <p className="mt-4 text-[var(--color-muted)] leading-relaxed">
              Unlike the MPC-encrypted vaults on Solana, Yellow pool products are index-style:
              users pick a pool, deposit funds, and the pool rebalances according to its
              mandate. Simple, transparent exposure to systematic strategies — coming soon.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4">
              {[
                { label: "Pool Types", value: "Index", desc: "S&P 500, NIFTY 50-style strategies" },
                { label: "Platform", value: "Yellow", desc: "Yellow Protocol's own exchange" },
                { label: "Status", value: "Soon", desc: "Coming soon — independent of Solana" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl p-4"
                  style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)" }}
                >
                  <p
                    className="mono text-xl font-bold stat-value"
                    dangerouslySetInnerHTML={{ __html: s.value }}
                    style={{ color: "var(--color-gold)" }}
                  />
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mt-0.5">{s.label}</p>
                  <p className="text-[10px] text-[var(--color-muted-2)] mt-2 leading-tight">{s.desc}</p>
                </div>
              ))}
            </div>

            <Link
              href="/technology#yellow"
              className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium transition-all hover:gap-3"
              style={{ color: "var(--color-gold)" }}
            >
              How Yellow Protocol works →
            </Link>
          </div>

          {/* Network diagram */}
          <div
            className="glass rounded-2xl p-6 relative overflow-hidden"
            style={{ border: "1px solid rgba(245,158,11,0.2)", minHeight: "340px" }}
          >
            {/* Glow center */}
            <div
              className="absolute"
              style={{
                top: "45%", left: "45%",
                width: "120px", height: "120px",
                transform: "translate(-50%,-50%)",
                background: "radial-gradient(circle, rgba(245,158,11,0.25) 0%, transparent 70%)",
                filter: "blur(20px)",
              }}
            />

            <p className="mono text-[9px] uppercase tracking-[0.22em] text-[var(--color-muted)] mb-4">Yellow Protocol Exchange</p>

            {/* SVG network lines */}
            <svg className="absolute inset-0 w-full h-full" style={{ top: 0, left: 0 }}>
              {/* Lines from SpectraQ center to brokers */}
              <line x1="46%" y1="52%" x2="14%" y2="40%" stroke="rgba(245,158,11,0.25)" strokeWidth="1" strokeDasharray="4 3" />
              <line x1="46%" y1="52%" x2="80%" y2="20%" stroke="rgba(34,211,238,0.2)" strokeWidth="1" strokeDasharray="4 3" />
              <line x1="46%" y1="52%" x2="76%" y2="70%" stroke="rgba(16,217,140,0.2)" strokeWidth="1" strokeDasharray="4 3" />
              <line x1="46%" y1="52%" x2="22%" y2="74%" stroke="rgba(139,92,246,0.2)" strokeWidth="1" strokeDasharray="4 3" />
              <line x1="46%" y1="52%" x2="60%" y2="82%" stroke="rgba(34,211,238,0.15)" strokeWidth="1" strokeDasharray="4 3" />
              {/* Cross connections */}
              <line x1="14%" y1="40%" x2="22%" y2="74%" stroke="rgba(139,92,246,0.1)" strokeWidth="1" strokeDasharray="3 4" />
              <line x1="80%" y1="20%" x2="76%" y2="70%" stroke="rgba(34,211,238,0.1)" strokeWidth="1" strokeDasharray="3 4" />
            </svg>

            {/* SpectraQ node — center */}
            <div className="absolute" style={{ top: "44%", left: "40%", transform: "translate(-50%,-50%)" }}>
              <div
                className="relative flex h-14 w-14 items-center justify-center rounded-xl glow-ring"
                style={{
                  background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.1))",
                  border: "2px solid rgba(245,158,11,0.6)",
                  boxShadow: "0 0 24px rgba(245,158,11,0.35)",
                }}
              >
                <span className="mono text-[13px] font-bold" style={{ color: "var(--color-gold)" }}>σ</span>
              </div>
              <p className="mono text-[9px] text-center mt-1.5" style={{ color: "var(--color-gold)" }}>SpectraQ</p>
            </div>

            {/* Broker nodes */}
            {[
              { label: "S&P 500", x: "8%", y: "33%", color: "#a78bfa", cRgb: "167,139,250" },
              { label: "NIFTY 50", x: "74%", y: "12%", color: "#22d3ee", cRgb: "34,211,238" },
              { label: "NASDAQ", x: "69%", y: "63%", color: "#10d98c", cRgb: "16,217,140" },
              { label: "FTSE 100", x: "14%", y: "67%", color: "#a78bfa", cRgb: "167,139,250" },
              { label: "Gold Pool", x: "53%", y: "76%", color: "#f59e0b", cRgb: "245,158,11" },
            ].map((n) => (
              <div key={n.label} className="absolute" style={{ top: n.y, left: n.x, transform: "translate(-50%,-50%)" }}>
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{
                    background: `rgba(${n.cRgb},0.1)`,
                    border: `1px solid rgba(${n.cRgb},0.35)`,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={n.color} strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                </div>
                <p className="mono text-[8px] text-center mt-1" style={{ color: n.color }}>{n.label}</p>
              </div>
            ))}

            {/* Yellow clearinghouse label */}
            <div
              className="absolute bottom-4 right-4 rounded-lg px-3 py-1.5"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
            >
              <p className="mono text-[9px]" style={{ color: "var(--color-gold)" }}>Yellow Exchange</p>
              <p className="text-[8px] text-[var(--color-muted-2)]">Independent exchange · Index pool trading</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Solana + Architecture strip ────────────────────────────────── */}
      <section
        className="relative z-10"
        style={{
          borderTop: "1px solid rgba(139,92,246,0.1)",
          background: "rgba(6,6,9,0.55)",
        }}
      >
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="text-center mb-12">
            <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Technology</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Built on the fastest infrastructure in DeFi.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                logo: "◎",
                name: "Solana",
                tagline: "Speed + Programmability",
                points: ["65,000 TPS throughput", "400ms block finality", "Sub-cent transactions", "Anchor smart contracts"],
                color: "#9945ff",
                cRgb: "153,69,255",
              },
              {
                logo: "⬡",
                name: "Yellow Protocol",
                tagline: "Index Pool Exchange",
                points: ["Independent exchange platform", "S&P 500, NIFTY 50-style pools", "User deposits into managed vaults", "Separate from Solana ecosystem"],
                color: "#f59e0b",
                cRgb: "245,158,11",
              },
              {
                logo: "⬡",
                name: "Arcium MPC",
                tagline: "Strategy Privacy",
                points: ["Threshold-encrypted MXE", "Multi-party computation", "Verifiable execution", "Alpha stays private"],
                color: "#8b5cf6",
                cRgb: "139,92,246",
              },
              {
                logo: "Ψ",
                name: "Pyth Oracle",
                tagline: "Real-Time Price Feeds",
                points: ["Sub-second updates", "300+ trading pairs", "Confidence intervals", "On-chain staleness guard"],
                color: "#22d3ee",
                cRgb: "34,211,238",
              },
            ].map((t, idx) => (
              <div
                key={t.name}
                className={`glass card-glow rounded-2xl p-6 fade-in-up fade-in-up-d${idx + 1}`}
                style={{ border: `1px solid rgba(${t.cRgb},0.2)` }}
              >
                <div
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg mb-4"
                  style={{ background: `rgba(${t.cRgb},0.12)`, border: `1px solid rgba(${t.cRgb},0.3)` }}
                >
                  <span className="mono text-[13px] font-bold" style={{ color: t.color }}>{t.logo}</span>
                </div>
                <h3 className="font-semibold text-[15px] tracking-tight" style={{ color: t.color }}>{t.name}</h3>
                <p className="text-[11px] text-[var(--color-muted)] mb-4 mt-0.5">{t.tagline}</p>
                <ul className="space-y-2">
                  {t.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-[12px] text-[var(--color-muted)]">
                      <span className="shrink-0 h-1 w-1 rounded-full" style={{ background: t.color }} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/technology"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-brand)] hover:opacity-80 transition-opacity"
            >
              Full technology deep-dive →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Transparency / Audit strip ─────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-20">
        <div
          className="glass rounded-2xl p-10 md:p-14 text-center relative overflow-hidden scan-border"
          style={{ border: "1px solid rgba(34,211,238,0.2)" }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 50% 100%, rgba(34,211,238,0.06) 0%, transparent 70%)",
            }}
          />
          <span className="neon-tag-cyan">Fully Transparent</span>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
            Code is the contract.<br />
            <span className="gradient-text-cyan">Every claim is verifiable.</span>
          </h2>
          <p className="mt-5 max-w-xl mx-auto text-[var(--color-muted)] leading-relaxed">
            SpectraQ publishes complete strategy validation results including failures.
            The vault program is open-source and non-upgradeable on mainnet.
            No fund manager trust required — the Anchor program enforces every invariant.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="https://spectraquant.org/strategy"
              target="_blank"
              rel="noopener noreferrer"
              className="glass-light rounded-xl border px-6 py-2.5 text-sm font-medium transition-all hover:border-[rgba(34,211,238,0.35)]"
              style={{ borderColor: "rgba(34,211,238,0.2)", color: "var(--color-cyan)" }}
            >
              Strategy Transparency →
            </a>
            <a
              href="https://spectraquant.org/app/arcium"
              target="_blank"
              rel="noopener noreferrer"
              className="glass-light rounded-xl border px-6 py-2.5 text-sm font-medium transition-all hover:border-[rgba(139,92,246,0.35)]"
              style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--color-brand)" }}
            >
              MPC Internals →
            </a>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────────────────────────────────── */}
      <section
        className="relative z-10"
        style={{ borderTop: "1px solid rgba(139,92,246,0.1)", background: "rgba(6,6,9,0.5)" }}
      >
        <div className="mx-auto max-w-7xl px-6 py-28 text-center">
          <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--color-brand)]">Get Started</p>
          <h2 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            Your strategy deserves{" "}
            <span className="gradient-text">real infrastructure.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--color-muted)] leading-relaxed">
            Stop running alpha in spreadsheets. Deploy a production-grade non-custodial vault
            in under five minutes — MPC-private, Solana-fast, Yellow Protocol-settled.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href="https://spectraquant.org/app/launch"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-glow rounded-xl px-10 py-4 text-base font-semibold text-white transition-all hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                border: "1px solid rgba(196,181,253,0.15)",
              }}
            >
              Launch your vault →
            </a>
            <a
              href="https://spectraquant.org/app/marketplace"
              target="_blank"
              rel="noopener noreferrer"
              className="glass-light rounded-xl border px-10 py-4 text-base font-medium transition-all hover:border-[rgba(139,92,246,0.35)] hover:text-[var(--color-text)]"
              style={{ borderColor: "rgba(139,92,246,0.2)", color: "var(--color-muted)" }}
            >
              Browse strategies
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

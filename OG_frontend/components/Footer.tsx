import Link from "next/link";
import { Logo } from "./Logo";

const LINKS = {
  Products: [
    { label: "SpectraQuant Platform", href: "https://spectraquant.org" },
    { label: "Vault Marketplace", href: "https://spectraquant.org/app/marketplace" },
    { label: "Strategy Transparency", href: "https://spectraquant.org/strategy" },
    { label: "Launch a Vault", href: "https://spectraquant.org/app/launch" },
  ],
  Technology: [
    { label: "Architecture", href: "/technology" },
    { label: "Solana", href: "/technology#solana" },
    { label: "Yellow Protocol", href: "/technology#yellow" },
    { label: "Arcium MPC", href: "/technology#arcium" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Products", href: "/products" },
    { label: "Security", href: "https://spectraquant.org/security" },
  ],
};

export function Footer() {
  return (
    <footer
      className="relative z-10"
      style={{ borderTop: "1px solid rgba(139,92,246,0.12)" }}
    >
      <div className="mx-auto max-w-7xl px-6 pt-16 pb-10">
        <div className="grid gap-12 md:grid-cols-4">
          {/* Brand column */}
          <div className="col-span-1">
            <Logo size="md" />
            <p className="mt-5 text-sm leading-relaxed text-[var(--color-muted)] max-w-[220px]">
              Institutional-grade quantitative finance infrastructure on Solana and Yellow Protocol.
            </p>
            <div className="mt-6 flex gap-2 flex-wrap">
              {["Solana", "Yellow Protocol", "Arcium MPC"].map((tag) => (
                <span key={tag} className="neon-tag">{tag}</span>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([section, links]) => (
            <div key={section}>
              <p className="mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-brand)] mb-4">
                {section}
              </p>
              <ul className="space-y-3">
                {links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("http") ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="mt-14 flex flex-wrap items-center justify-between gap-4 pt-6"
          style={{ borderTop: "1px solid rgba(139,92,246,0.08)" }}
        >
          <span className="text-[11px] text-[var(--color-muted)]">
            © 2026 SpectraQ. All rights reserved. · Not financial advice.
          </span>
          <div className="flex items-center gap-4 flex-wrap">
            <a
              href="https://spectraquant.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-brand)]"
            >
              spectraquant.org ↗
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

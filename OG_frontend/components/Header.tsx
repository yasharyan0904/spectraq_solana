"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/technology", label: "Technology" },
  { href: "/about", label: "About" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header
      className="sticky top-0 z-50 glass"
      style={{
        borderBottom: "1px solid transparent",
        backgroundImage:
          "linear-gradient(rgba(6,6,9,0.92), rgba(6,6,9,0.92)), linear-gradient(90deg, rgba(139,92,246,0.3), rgba(34,211,238,0.12), rgba(139,92,246,0.08))",
        backgroundOrigin: "border-box",
        backgroundClip: "padding-box, border-box",
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
        <Logo />
        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-4 py-2 text-sm transition-all duration-200 ${
                  active
                    ? "text-[var(--color-text)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
                style={
                  active
                    ? {
                        background: "rgba(139,92,246,0.1)",
                        border: "1px solid rgba(139,92,246,0.22)",
                        boxShadow: "0 0 12px rgba(139,92,246,0.08)",
                      }
                    : { border: "1px solid transparent" }
                }
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="https://spectraquant.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] md:block"
          >
            Platform ↗
          </a>
          <a
            href="https://spectraquant.org"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-glow rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-px"
            style={{
              background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              border: "1px solid rgba(196,181,253,0.15)",
            }}
          >
            Open App →
          </a>
        </div>
      </div>
      {/* Mobile nav */}
      <nav style={{ borderTop: "1px solid rgba(139,92,246,0.1)" }} className="md:hidden">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 py-2">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-all ${
                  active ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"
                }`}
                style={
                  active
                    ? { background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.22)" }
                    : { border: "1px solid transparent" }
                }
              >
                {n.label}
              </Link>
            );
          })}
          <a
            href="https://spectraquant.org"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium"
            style={{
              background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
              color: "white",
            }}
          >
            Open App →
          </a>
        </div>
      </nav>
    </header>
  );
}

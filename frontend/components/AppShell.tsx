"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { ConnectButton } from "./ConnectButton";
import { Logo } from "./Logo";

const NAV = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/deposit", label: "Deposit" },
  { href: "/app/withdraw", label: "Withdraw" },
  { href: "/app/pool", label: "Pool" },
  { href: "/app/arcium", label: "Arcium" },
  { href: "/strategy", label: "Strategy" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen flex-col">
      {/* Glassmorphism header with gradient bottom border */}
      <header className="sticky top-0 z-30 glass" style={{
        borderBottom: "1px solid transparent",
        backgroundImage:
          "linear-gradient(rgba(12, 12, 22, 0.85), rgba(12, 12, 22, 0.85)), linear-gradient(90deg, rgba(139,92,246,0.25), rgba(34,211,238,0.12), rgba(139,92,246,0.08))",
        backgroundOrigin: "border-box",
        backgroundClip: "padding-box, border-box",
      }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-7">
            <Logo />
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => {
                const active = pathname === n.href;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`rounded-md px-3 py-1.5 text-sm transition-all duration-200 ${
                      active
                        ? "text-[var(--color-text)]"
                        : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                    }`}
                    style={active ? {
                      background: "rgba(139, 92, 246, 0.12)",
                      border: "1px solid rgba(139, 92, 246, 0.25)",
                      boxShadow: "0 0 12px rgba(139, 92, 246, 0.12)",
                    } : {
                      border: "1px solid transparent",
                    }}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <ConnectButton />
        </div>
        {/* Mobile nav */}
        <nav style={{ borderTop: "1px solid rgba(139, 92, 246, 0.1)" }} className="md:hidden">
          <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 py-2">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-all ${
                    active
                      ? "text-[var(--color-text)]"
                      : "text-[var(--color-muted)]"
                  }`}
                  style={active ? {
                    background: "rgba(139, 92, 246, 0.12)",
                    border: "1px solid rgba(139, 92, 246, 0.22)",
                  } : {
                    border: "1px solid transparent",
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-10">{children}</main>
      <footer className="border-t border-[var(--color-border)] py-6 text-center text-[11px]">
        <span className="text-[var(--color-muted)]">SpectraQ · non-custodial vault on Solana · </span>
        <a
          className="text-[var(--color-brand)] opacity-70 hover:opacity-100 transition-opacity"
          href="https://github.com/anza-xyz/agave"
          target="_blank"
          rel="noreferrer"
        >
          devnet
        </a>
      </footer>
    </div>
  );
}

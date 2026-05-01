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
  { href: "/strategy", label: "Strategy" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur">
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
                    className={`rounded-md px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
                        : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <ConnectButton />
        </div>
        <nav className="border-t border-[var(--color-border)] md:hidden">
          <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 py-2">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs ${
                    active
                      ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
                      : "text-[var(--color-muted)]"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-10">{children}</main>
      <footer className="border-t border-[var(--color-border)] py-6 text-center text-[11px] text-[var(--color-muted)]">
        SpectraQ · non-custodial vault on Solana ·{" "}
        <a className="hover:text-[var(--color-text)]" href="https://github.com/anza-xyz/agave" target="_blank" rel="noreferrer">
          devnet
        </a>
      </footer>
    </div>
  );
}

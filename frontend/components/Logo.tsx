import Link from "next/link";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7" : "h-8";
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <div
        className={`relative ${dim} aspect-square rounded-lg flex items-center justify-center`}
        style={{
          background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #6d28d9 100%)",
          boxShadow:
            "0 0 14px rgba(139, 92, 246, 0.6), 0 0 30px rgba(139, 92, 246, 0.18), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        <span className="mono text-[15px] font-bold text-white drop-shadow-sm">σ</span>
      </div>
      <span className="gradient-text-brand text-[15px] font-semibold tracking-tight transition-opacity group-hover:opacity-80">
        SpectraQ
      </span>
    </Link>
  );
}

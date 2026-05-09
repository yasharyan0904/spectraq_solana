import Link from "next/link";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const iconSize = size === "sm" ? "h-7" : size === "lg" ? "h-10" : "h-8";
  const textSize = size === "sm" ? "text-[13px]" : size === "lg" ? "text-[18px]" : "text-[15px]";
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <div
        className={`relative ${iconSize} aspect-square rounded-lg flex items-center justify-center shrink-0`}
        style={{
          background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #6d28d9 100%)",
          boxShadow:
            "0 0 14px rgba(139,92,246,0.55), 0 0 30px rgba(139,92,246,0.16), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        <span className="mono text-[15px] font-bold text-white drop-shadow-sm">σ</span>
      </div>
      <div className="flex flex-col leading-none">
        <span
          className={`${textSize} font-semibold tracking-tight transition-opacity group-hover:opacity-80`}
          style={{
            background: "linear-gradient(135deg, #c4b5fd 0%, #8b5cf6 60%, #6d28d9 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          SpectraQ
        </span>
        {size !== "sm" && (
          <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-[#7070a0] mt-0.5">
            Financial Infrastructure
          </span>
        )}
      </div>
    </Link>
  );
}

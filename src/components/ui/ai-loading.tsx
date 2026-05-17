export default function AiLoader({ label = "Summarizing…" }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="relative size-16 shrink-0"
    >
      {/* Glow ring */}
      <div
        aria-hidden="true"
        className="animate-glow pointer-events-none absolute -inset-1.5 rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, oklch(0.58 0.2 315) 40%, transparent), transparent 70%)",
        }}
      />

      {/* Star 1 — large, centre */}
      <div
        aria-hidden="true"
        className="ai-loader-star animate-spin-cw absolute left-2.5 top-2.5 size-11 origin-center"
        style={{
          background:
            "conic-gradient(from 0deg, #B374D4, oklch(0.58 0.2 315), #AF7BCC, #B374D4)",
        }}
      />

      {/* Star 2 — medium, top-right */}
      <div
        aria-hidden="true"
        className="ai-loader-star animate-spin-ccw absolute right-0 top-0 size-5 origin-center"
        style={{
          background:
            "conic-gradient(from 180deg, oklch(0.78 0.1 315), #9D4BC7, oklch(0.78 0.1 315))",
        }}
      />

      {/* Star 3 — small, bottom-left */}
      <div
        aria-hidden="true"
        className="ai-loader-star animate-spin-cw-s absolute bottom-0 left-0 size-3.5 origin-center bg-[#D8BBE9]"
      />
    </div>
  );
}

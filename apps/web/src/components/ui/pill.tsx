import type * as React from "react";

import { cn } from "@/lib/utils";

type PillProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "accent" | "success" | "warm";
};

const toneClasses = {
  default: "border-[var(--border-default)] bg-white/65 text-[var(--text-secondary)]",
  accent: "border-[var(--border-accent)] bg-[var(--accent-glow)] text-[var(--text-primary)]",
  success:
    "border-[color:rgba(15,159,110,0.2)] bg-[color:rgba(15,159,110,0.1)] text-[var(--accent-success)]",
  warm:
    "border-[color:rgba(194,112,23,0.2)] bg-[color:rgba(194,112,23,0.1)] text-[var(--accent-warm)]",
};

export function Pill({ className, tone = "default", ...props }: PillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] shadow-sm backdrop-blur",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

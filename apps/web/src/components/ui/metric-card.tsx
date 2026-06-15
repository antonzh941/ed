import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";

export function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-5 transition duration-200 hover:-translate-y-0.5 hover:bg-white/95">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>{label}</SectionLabel>
          <div className="mt-3 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {value}
          </div>
          {hint ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-glow)] text-[var(--accent-primary)]">
            {icon}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

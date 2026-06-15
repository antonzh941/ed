import type * as React from "react";

export function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-secondary)]">
      {children}
    </div>
  );
}

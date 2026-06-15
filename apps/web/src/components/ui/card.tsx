import type * as React from "react";

import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  elevated?: boolean;
};

export function Card({ className, elevated = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] backdrop-blur-xl",
        elevated && "bg-[var(--bg-elevated)] shadow-[var(--shadow-glow)]",
        className,
      )}
      {...props}
    />
  );
}

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

const baseFieldClass =
  "min-h-12 w-full rounded-2xl border border-[var(--border-default)] bg-white px-4 text-sm text-[var(--text-primary)] shadow-sm outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--border-accent)] focus:bg-white focus:ring-4 focus:ring-[var(--accent-glow)]";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseFieldClass, props.className)} {...props} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(`${baseFieldClass} py-3`, props.className)} {...props} />;
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(baseFieldClass, "appearance-none pr-10", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
    </div>
  );
}

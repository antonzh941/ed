"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[image:var(--gradient-primary)] text-white shadow-[var(--shadow-glow)] hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(109,93,246,0.26)]",
  secondary:
    "border border-[var(--border-default)] bg-white text-[var(--text-primary)] shadow-sm hover:-translate-y-0.5 hover:border-[var(--border-accent)] hover:bg-white",
  ghost: "text-[var(--text-secondary)] hover:bg-black/5 hover:text-[var(--text-primary)]",
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

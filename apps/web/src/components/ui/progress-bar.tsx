export function ProgressBar({
  value,
}: {
  value: number;
}) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/5">
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent-primary),var(--accent-secondary),var(--accent-success))] transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  COMPLETED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  RUNNING: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  PENDING: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  FAILED: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  critical: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  info: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide", tones[value] ?? tones.info, className)}><span className="size-1 rounded-full bg-current" />{value}</span>;
}

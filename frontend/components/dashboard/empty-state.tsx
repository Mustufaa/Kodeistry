import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="subtle-grid flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-background p-8 text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-xl border bg-card shadow-sm"><Icon className="size-5 text-violet-600 dark:text-violet-400" /></div>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

import { cn } from "@/lib/utils";
export function Skeleton({ className }: { className?: string }) { return <div aria-hidden="true" className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} />; }

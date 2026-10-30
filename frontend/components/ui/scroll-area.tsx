"use client";
import * as Scroll from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";
export function ScrollArea({ children, className, viewportRef, onScroll }: { children: React.ReactNode; className?: string; viewportRef?: React.Ref<HTMLDivElement>; onScroll?: React.UIEventHandler<HTMLDivElement> }) {
  return <Scroll.Root className={cn("relative overflow-hidden", className)}><Scroll.Viewport ref={viewportRef} onScroll={onScroll} className="h-full w-full rounded-[inherit] [&>div]:!block">{children}</Scroll.Viewport><Scroll.Scrollbar orientation="vertical" className="flex w-2 p-0.5"><Scroll.Thumb className="relative flex-1 rounded-full bg-muted-foreground/30" /></Scroll.Scrollbar><Scroll.Corner /></Scroll.Root>;
}

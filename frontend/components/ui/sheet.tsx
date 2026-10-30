"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetTitle = Dialog.Title;
export const SheetDescription = Dialog.Description;
export function SheetContent({ children, className, ...props }: React.ComponentProps<typeof Dialog.Content>) {
  const [size, setSize] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => setSize({ height: viewport.height, top: viewport.offsetTop });
    const frame = requestAnimationFrame(resize);
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => { cancelAnimationFrame(frame); viewport.removeEventListener("resize", resize); viewport.removeEventListener("scroll", resize); };
  }, []);
  return <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm" />
    <Dialog.Content className={cn("collaboration-sheet fixed inset-y-0 right-0 z-[71] flex h-dvh w-full max-w-full flex-col overflow-hidden border-l bg-background text-foreground shadow-2xl sm:w-[410px]", className)} {...props} style={{ height: size?.height, top: size?.top, ...props.style }}>
      {children}
      <Dialog.Close className="absolute right-4 top-4 rounded-lg p-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" aria-label="Close team chat"><X className="size-4" /></Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>;
}

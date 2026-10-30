"use client";
import * as Primitive from "@radix-ui/react-tooltip";
export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return <Primitive.Provider delayDuration={250}><Primitive.Root><Primitive.Trigger asChild>{children}</Primitive.Trigger><Primitive.Portal><Primitive.Content sideOffset={5} className="z-[90] rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow">{label}<Primitive.Arrow className="fill-popover" /></Primitive.Content></Primitive.Portal></Primitive.Root></Primitive.Provider>;
}

"use client";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
export function Avatar({ name, src }: { name: string; src?: string | null }) {
  return <AvatarPrimitive.Root className="relative flex size-7 shrink-0 overflow-hidden rounded-full bg-violet-500/15 text-[10px] text-violet-600 dark:text-violet-300"><AvatarPrimitive.Image src={src || undefined} alt="" className="size-full object-cover" /><AvatarPrimitive.Fallback className="grid size-full place-items-center">{name.split(/\s+/).map(p => p[0]).join("").slice(0, 2)}</AvatarPrimitive.Fallback></AvatarPrimitive.Root>;
}

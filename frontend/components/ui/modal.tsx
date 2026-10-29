"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFrame } from "@/components/ui/dialog-frame";

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <DialogFrame label={title} onClose={onClose} className="inset-0 w-[calc(100%_-_2rem)] max-w-md rounded-2xl p-5 sm:p-6">
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="min-w-0 break-words text-lg font-semibold">{title}</h2>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog"><X className="size-4" /></Button>
    </div>
    {children}
  </DialogFrame>;
}

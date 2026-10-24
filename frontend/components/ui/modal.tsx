"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Native dialog provides focus trapping, Escape, and focus restoration. */
export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={(event) => { event.preventDefault(); onClose(); }}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border bg-card p-6 text-foreground shadow-2xl backdrop:bg-black/60">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog"><X className="size-4" /></Button>
      </div>
      {children}
    </dialog>
  );
}

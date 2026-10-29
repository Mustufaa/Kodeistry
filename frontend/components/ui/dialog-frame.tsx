"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { cn } from "@/lib/utils";

/** Mount while open. Native modality supplies focus containment and restoration. */
export function DialogFrame({ children, label, onClose, className, closeAt }: {
  children: ReactNode; label: string; onClose: () => void; className?: string; closeAt?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useBodyScrollLock();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => {
    if (!closeAt) return;
    const media = window.matchMedia(closeAt);
    const change = () => { if (media.matches) onClose(); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [closeAt, onClose]);
  return <dialog ref={ref} aria-label={label}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}
    className={cn("dialog-frame fixed m-auto min-w-0 overflow-y-auto overscroll-contain border bg-card text-foreground shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm", className)}>
    {children}
  </dialog>;
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFrame } from "@/components/ui/dialog-frame";

export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  return <div className="md:hidden">
    <Button variant="outline" size="icon" aria-label="Open navigation" aria-expanded={open}
      onClick={() => setOpen(true)}><Menu className="size-5" /></Button>
    {open && <DialogFrame label="Mobile navigation" onClose={() => setOpen(false)} closeAt="(min-width: 768px)"
      className="inset-y-0 right-0 ml-auto mr-0 w-[min(90vw,340px)] max-w-none p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <strong>Kodeistry</strong><Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setOpen(false)}><X className="size-5" /></Button>
      </div>
      <nav aria-label="Mobile navigation" className="flex flex-col">
        {[
          ["/features/ai-code-review", "AI code review"], ["/features/github-integration", "GitHub integration"],
          ["/features/security-analysis", "Security analysis"], ["/how-it-works", "How it works"],
          ["/docs", "Docs"], ["/faq", "FAQ"], ["/login", "Sign in"], ["/register", "Get started"],
        ].map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)}
          className="flex min-h-11 items-center rounded-md px-3 py-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">{label}</Link>)}
      </nav>
    </DialogFrame>}
  </div>;
}

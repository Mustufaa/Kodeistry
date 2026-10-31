"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { getDashboardSummary } from "@/lib/api/dashboard";
import { claimTourInvitation, saveTutorialStatus, TOUR_EVENT } from "@/lib/api/onboarding";
import { KodyRobot } from "./kody-assistant";

const steps = [
  { target: "main", title: "Your dashboard", text: "Track connected repositories, recent reviews, and code quality from your overview." },
  { target: 'nav a[href="/repositories"]', title: "Repositories", text: "Open Repositories to browse your projects and start a code review." },
  { target: 'nav a[href="/reviews"]', title: "Reviews", text: "Open Reviews to follow pull request analysis and inspect the results." },
  { target: 'nav a[href="/findings"]', title: "Findings", text: "Use Findings to investigate issues and track their resolution." },
  { target: 'nav a[href="/analytics"]', title: "Analytics", text: "Explore trends in code quality. You can take this tour again from Help or by asking Kody." },
];

export function DashboardTour() {
  const { user, tenantId } = useCurrentTenant();
  return user ? <AccountTour key={user.id} tenantId={tenantId} /> : null;
}

function AccountTour({ tenantId }: { tenantId?: number }) {
  const pathname = usePathname();
  const dashboard = useQuery({ queryKey: ["dashboard", tenantId], queryFn: () => getDashboardSummary(tenantId!), enabled: pathname === "/dashboard" && !!tenantId });
  const [invitation, setInvitation] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const claim = useRef<ReturnType<typeof claimTourInvitation> | null>(null);
  const manual = useRef(false);
  const delivered = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (pathname !== "/dashboard" || !dashboard.isSuccess || manual.current) return;
    let active = true;
    claim.current ??= claimTourInvitation();
    void claim.current.then((result) => {
      if (active && !manual.current && !delivered.current && result.show_invitation === true) {
        delivered.current = true;
        setInvitation(true);
      }
    }).catch(() => { /* Fail closed: never infer eligibility from missing data. */ });
    return () => { active = false; };
  }, [pathname, dashboard.isSuccess]);

  useEffect(() => {
    const start = () => {
      manual.current = true;
      setInvitation(false);
      setBusy(true);
      void saveTutorialStatus("IN_PROGRESS").then(() => {
        if (mounted.current) setStep(0);
      }).catch(() => toast.error("Could not start the tour. Please try again.")).finally(() => { if (mounted.current) setBusy(false); });
    };
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, []);

  useEffect(() => {
    if (step === null && !invitation) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const target = step === null ? null : Array.from(document.querySelectorAll<HTMLElement>(steps[step].target)).find((node) => node.getClientRects().length > 0);
    target?.classList.add("kody-tour-highlight");
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return () => { target?.classList.remove("kody-tour-highlight"); previous?.focus(); };
  }, [step, invitation]);

  async function decide(accept: boolean) {
    setInvitation(false);
    setBusy(true);
    try {
      await saveTutorialStatus(accept ? "IN_PROGRESS" : "SKIPPED");
      if (accept && mounted.current) setStep(0);
    } catch { toast.error("Could not save your choice. Your invitation will not appear again.", { action: { label: "Retry saving", onClick: () => { void decide(accept); } } }); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function finish() {
    setBusy(true);
    try { await saveTutorialStatus("COMPLETED"); if (mounted.current) setStep(null); }
    catch { toast.error("Could not save completion. Please try again."); }
    finally { if (mounted.current) setBusy(false); }
  }

  if (!invitation && step === null) return null;
  return <div ref={panel} tabIndex={-1} role="dialog" aria-label={invitation ? "Welcome from Kody" : "Dashboard tutorial"} className="kody-tour-panel fixed bottom-6 right-4 z-[80] w-[min(360px,calc(100vw-2rem))] rounded-2xl border bg-card p-5 text-card-foreground shadow-2xl">
    <div className="kody-tour-welcome h-24 w-20"><KodyRobot /></div>
    {invitation ? <>
      <p className="my-4">Hey! 👋 I&apos;m Kody. Welcome to Kodeistry! Want me to show you around?</p>
      <div className="flex gap-3"><button disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground" onClick={() => void decide(true)}>Yes, show me!</button><button disabled={busy} className="rounded-lg border px-3 py-2" onClick={() => void decide(false)}>No, thanks</button></div>
    </> : step !== null ? <>
      <p className="text-xs text-muted-foreground">Step {step + 1} of {steps.length}</p>
      <h2 className="my-2 font-semibold">{steps[step].title}</h2><p aria-live="polite">{steps[step].text}</p>
      <div className="mt-4 flex gap-3">
        <button disabled={busy || step === 0} onClick={() => setStep(step - 1)}>Back</button>
        <button disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground" onClick={() => step === steps.length - 1 ? void finish() : setStep(step + 1)}>{step === steps.length - 1 ? "Finish" : "Next"}</button>
        <button disabled={busy} onClick={() => setStep(null)}>Close tour</button>
      </div>
    </> : null}
  </div>;
}

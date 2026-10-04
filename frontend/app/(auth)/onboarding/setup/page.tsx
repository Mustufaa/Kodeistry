"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthGuard } from "@/components/auth/auth-guard";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { getOnboardingStatus } from "@/lib/api/onboarding";

function SetupProgress() {
  const router = useRouter();
  const params = useSearchParams();
  const status = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => getOnboardingStatus(),
    refetchInterval: (query) => query.state.data?.next_step === "syncing" ? 1500 : false,
  });
  const data = status.data;
  const error = params.get("github_error") || (status.error instanceof Error ? status.error.message : "");
  const ready = data?.onboarding_complete === true;
  const steps = [
    { label: "GitHub account connected", done: true },
    { label: "Kodeistry GitHub App installed", done: data?.github.connected ?? false },
    { label: ready ? `${data.repositories.count} repositories synchronized` : "Synchronizing repositories", done: data?.repositories.synced ?? false, active: data?.next_step === "syncing" },
    { label: ready ? "Kodeistry is ready" : "Preparing reviewer", done: ready },
  ];

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <section className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-xl shadow-black/5 sm:p-10 dark:shadow-black/25">
        <BrandLogo href="/" ariaLabel="Kodeistry home" />
        <h1 className="mt-8 text-3xl font-semibold">Setting up Kodeistry</h1>
        <p className="mt-2 text-sm text-muted-foreground">These checks come directly from your GitHub installation.</p>

        <div className="mt-8 space-y-4">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
              {step.done ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> : step.active ? <LoaderCircle className="h-5 w-5 animate-spin text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground/60" />}
              <span className={step.done ? "text-foreground" : "text-muted-foreground"}>{step.label}</span>
            </div>
          ))}
        </div>

        {error && <div role="alert" className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error}</div>}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          {ready && <Button className="flex-1" onClick={() => router.replace("/dashboard")}>Continue to Dashboard</Button>}
          {!ready && <Button variant="outline" className="flex-1" onClick={() => status.refetch()} disabled={status.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${status.isFetching ? "animate-spin" : ""}`} />Check setup status</Button>}
          {error && <Button variant="outline" onClick={() => router.replace("/onboarding/github")}>Return to GitHub setup</Button>}
        </div>
      </section>
    </main>
  );
}

export default function SetupPage() {
  return <AuthGuard><Suspense><SetupProgress /></Suspense></AuthGuard>;
}

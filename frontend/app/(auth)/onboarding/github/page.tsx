"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { AuthGuard } from "@/components/auth/auth-guard";
import { BrandLogo } from "@/components/brand-logo";
import { GitHubMark } from "@/components/icons/github-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { getGithubInstallStartUrl } from "@/lib/api/github";
import { getOnboardingStatus } from "@/lib/api/onboarding";

function GitHubOnboarding() {
  const router = useRouter();
  const status = useQuery({ queryKey: ["onboarding-status"], queryFn: () => getOnboardingStatus() });
  const data = status.data;

  useEffect(() => {
    if (data?.next_step === "dashboard") router.replace("/dashboard");
    if (data?.next_step === "syncing") router.replace("/onboarding/setup");
  }, [data?.next_step, router]);

  if (!data) {
    return <main className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking GitHub...</main>;
  }

  return (
    <main className="relative min-h-screen bg-background px-5 py-10 text-foreground sm:py-16">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <div className="mx-auto w-full max-w-2xl">
        <BrandLogo href="/" ariaLabel="Kodeistry home" />
        <section className="mt-10 rounded-2xl border bg-card p-6 shadow-xl shadow-black/5 sm:p-10 dark:shadow-black/25">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">GitHub setup</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome to Kodeistry</h1>
          <p className="mt-3 text-muted-foreground">Connect your repositories to start reviewing pull requests.</p>

          <div className="mt-8 flex items-center gap-4 rounded-xl border bg-muted/35 p-4">
            <div
              role="img"
              aria-label={`${data.user.github_login ?? "GitHub"} avatar`}
              className="h-12 w-12 shrink-0 rounded-full bg-muted bg-cover bg-center"
              style={data.user.avatar_url ? { backgroundImage: `url(${data.user.avatar_url})` } : undefined}
            />
            <div className="min-w-0"><p className="text-xs text-muted-foreground">Signed in with GitHub</p><p className="truncate font-medium">@{data.user.github_login ?? "github-user"}</p></div>
            <CheckCircle2 className="ml-auto h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>

          <Button className="mt-8 w-full" size="lg" onClick={() => window.location.assign(getGithubInstallStartUrl())}>
            <GitHubMark className="mr-2 h-5 w-5" />Install Kodeistry GitHub App<ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="mt-4 text-center text-sm text-muted-foreground">Choose which repositories Kodeistry can access and review.</p>
        </section>
      </div>
    </main>
  );
}

export default function GitHubOnboardingPage() {
  return <AuthGuard><GitHubOnboarding /></AuthGuard>;
}

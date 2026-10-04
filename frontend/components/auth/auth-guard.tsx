"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { getOnboardingStatus } from "@/lib/api/onboarding";

export function AuthGuard({ children, requireOnboardingComplete = false }: { children: React.ReactNode; requireOnboardingComplete?: boolean }) {
  const router = useRouter();
  const userQuery = useQuery({ queryKey: ["current-user"], queryFn: getCurrentUser, retry: false, staleTime: 30_000 });
  const onboardingQuery = useQuery({ queryKey: ["onboarding-status"], queryFn: () => getOnboardingStatus(), enabled: userQuery.isSuccess && requireOnboardingComplete, retry: false });

  useEffect(() => {
    if (userQuery.error instanceof ApiError && userQuery.error.status === 401) {
      router.replace("/login");
      return;
    }
    if (requireOnboardingComplete && onboardingQuery.data && !onboardingQuery.data.onboarding_complete) {
      router.replace(onboardingQuery.data.next_step === "syncing" ? "/onboarding/setup" : "/onboarding/github");
    }
  }, [onboardingQuery.data, requireOnboardingComplete, router, userQuery.error]);

  if (userQuery.isError && !(userQuery.error instanceof ApiError && userQuery.error.status === 401)) {
    return <GuardMessage message="Unable to reach Kodeistry. Check the backend connection and try again." onRetry={() => userQuery.refetch()} />;
  }
  if (requireOnboardingComplete && onboardingQuery.isError) {
    return <GuardMessage message="Unable to verify your GitHub setup." onRetry={() => onboardingQuery.refetch()} />;
  }

  const loading = userQuery.isLoading || (requireOnboardingComplete && onboardingQuery.isLoading);
  const allowed = userQuery.isSuccess && (!requireOnboardingComplete || onboardingQuery.data?.onboarding_complete);
  if (loading || !allowed) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking your Kodeistry session...</div>;
  }
  return <>{children}</>;
}

function GuardMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center text-sm text-muted-foreground"><p>{message}</p><Button variant="outline" onClick={onRetry}>Try again</Button></div>;
}

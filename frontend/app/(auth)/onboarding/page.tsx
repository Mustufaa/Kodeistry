"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { AuthGuard } from "@/components/auth/auth-guard";
import { getOnboardingStatus } from "@/lib/api/onboarding";

function OnboardingRouter() {
  const router = useRouter();
  const status = useQuery({ queryKey: ["onboarding-status"], queryFn: () => getOnboardingStatus() });

  useEffect(() => {
    if (!status.data) return;
    if (status.data.next_step === "dashboard") router.replace("/dashboard");
    else if (status.data.next_step === "syncing") router.replace("/onboarding/setup");
    else router.replace("/onboarding/github");
  }, [router, status.data]);

  return <main className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparing GitHub setup...</main>;
}

export default function OnboardingPage() {
  return <AuthGuard><OnboardingRouter /></AuthGuard>;
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { KodeistryLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { verifyEmail } from "@/lib/api/auth";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailSkeleton />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";
  const [result, setResult] = useState<{ status: "success" | "error"; message: string } | null>(null);
  const waitingForEmail = !token && !!email;
  const status = result?.status ?? (waitingForEmail ? "waiting" : token ? "pending" : "error");
  const message = result?.message ?? (
    waitingForEmail
      ? `A verification link has been sent to ${email}. Please check your inbox and click the link to verify your account.`
      : "Verification token was not provided."
  );

  useEffect(() => {
    if (!token) return;

    verifyEmail(token)
      .then((response) => {
        setResult({ status: "success", message: response.message || "Email verified successfully." });
      })
      .catch((err) => {
        setResult({ status: "error", message: err instanceof Error ? err.message : "Unable to verify email." });
      });
  }, [token, email]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <KodeistryLogo className="mx-auto mb-4 size-12" />
          <h1 className="text-2xl font-semibold">Verify email</h1>
        </div>

        {status === "pending" && <p className="text-sm text-muted-foreground">Verifying your email...</p>}
        {status === "waiting" && (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">{message}</div>
            <Link href="/login">
              <Button variant="outline" className="w-full">Back to login</Button>
            </Link>
          </div>
        )}
        {status === "success" && (
          <div className="space-y-4">
            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-500">{message}</div>
            <Link href="/login">
              <Button className="w-full">Go to login</Button>
            </Link>
          </div>
        )}
        {status === "error" && (
          <div className="space-y-4">
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{message}</div>
            <Link href="/login">
              <Button variant="outline" className="w-full">Back to login</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function VerifyEmailSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <KodeistryLogo className="mx-auto mb-4 size-12" />
          <h1 className="text-2xl font-semibold">Verify email</h1>
        </div>
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}

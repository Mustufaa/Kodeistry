"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { KodeistryLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/lib/api/auth";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<PasswordResetFormSkeleton />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await resetPassword(token, newPassword);
      setMessage(response.message || "Password updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <KodeistryLogo className="mx-auto mb-4 size-12" />
          <h1 className="text-2xl font-semibold">Reset password</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm font-medium">New password</label>
            <div className="relative">
              <Input id="newPassword" type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" required />
              <button type="button" aria-label="Toggle password visibility" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</label>
            <Input id="confirmPassword" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
          </div>

          {error && <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
          {message && <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-500">{message}</div>}

          <Button type="submit" className="w-full" disabled={loading || !token}>{loading ? "Updating..." : "Reset password"}</Button>
        </form>

        <Link href="/login" className="mt-6 block text-center text-sm text-muted-foreground hover:text-foreground">Back to login</Link>
      </div>
    </div>
  );
}

function PasswordResetFormSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <KodeistryLogo className="mx-auto mb-4 size-12" />
          <h1 className="text-2xl font-semibold">Reset password</h1>
        </div>
        <div className="space-y-5 animate-pulse">
          <div className="h-10 rounded-md bg-muted" />
          <div className="h-10 rounded-md bg-muted" />
          <div className="h-10 rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}

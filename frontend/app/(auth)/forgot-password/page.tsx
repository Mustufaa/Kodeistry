"use client";

import Link from "next/link";
import { useState } from "react";

import { KodeistryLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "@/lib/api/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await forgotPassword(email);
      setSubmitted(true);
      setError("");
      console.log(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send reset link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <KodeistryLogo className="mx-auto mb-4 size-12" />
          <h1 className="text-2xl font-semibold">Forgot password</h1>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>

            {error && <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending..." : "Submit"}</Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-500">
              If the email is registered, a password reset link has been sent.
            </div>
            <Link href="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">Back to login</Link>
          </div>
        )}
      </div>
    </div>
  );
}

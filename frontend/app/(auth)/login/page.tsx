"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { GitHubMark } from "@/components/icons/github-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/api/auth";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api";

function LoginContent() {
  const params = useSearchParams();
  const error = params.get("github_error");
  const router = useRouter();
  const client = useQueryClient();
  const returnTo = params.get("return_to") === "/invite" ? "/invite" : "/onboarding";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNeedsVerification(false);
    setSubmitting(true);

    try {
      await login({ email: email.trim(), password });
      await client.cancelQueries(); client.clear();
      router.replace(returnTo);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to sign in. Please try again.");
      setNeedsVerification(err instanceof ApiError && err.status === 403);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl shadow-black/5 sm:p-9 dark:shadow-black/25">
        <Button asChild variant="outline" size="icon" className="mb-6">
          <Link href="/" aria-label="Back to landing"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <header className="text-center">
          {returnTo === "/invite" ? <p className="mb-4 text-sm text-muted-foreground">Sign in with the account that received your team invitation.</p> : null}
          <BrandLogo href="/" ariaLabel="Kodeistry home" />
          <h1 className="mt-9 text-3xl font-semibold tracking-tight">AI Code Reviews That Understand Your Codebase</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Sign in with GitHub or your email and password to continue reviewing pull requests.</p>
        </header>

        <Button
          size="lg"
          className="mt-8 w-full"
          onClick={() => window.location.assign(API_BASE + "/auth/github" + (returnTo === "/invite" ? "?return_to=/invite" : ""))}
        >
          <GitHubMark className="mr-2 h-5 w-5" />
          Continue with GitHub
        </Button>

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3 text-sm text-red-500 dark:text-red-300">{error}</p>}
        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-sm font-medium">Email</label>
            <Input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
          </div>
          <div className="space-y-2">
            <label htmlFor="login-password" className="text-sm font-medium">Password</label>
            <div className="relative">
              <Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" minLength={8} maxLength={64} className="pr-10" required />
              <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground hover:underline">Forgot password?</Link>
          </div>
          {formError && (
            <div role="alert" className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3 text-sm text-red-500 dark:text-red-300">
              <p>{formError}</p>
              {needsVerification && <Link href={"/verify-email?email=" + encodeURIComponent(email.trim())} className="mt-2 inline-block underline underline-offset-4">Check email verification</Link>}
            </div>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>{submitting ? "Signing in..." : "Sign in with email"}</Button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">Terms &amp; Conditions</Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy Policy</Link>.
        </p>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href={returnTo === "/invite" ? "/invite" : "/register"} className="font-medium text-foreground hover:underline hover:underline-offset-4">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginContent /></Suspense>;
}

"use client";

import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import styles from "@/components/auth/auth-card.module.css";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { GitHubMark } from "@/components/icons/github-mark";
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
    <AuthCard title="Welcome back" description="Sign in to continue reviewing GitHub pull requests.">
      {returnTo === "/invite" ? <p className="text-center text-xs text-muted-foreground">Use the account that received your team invitation.</p> : null}
      <Button
        className="w-full"
        onClick={() => window.location.assign(API_BASE + "/auth/github" + (returnTo === "/invite" ? "?return_to=/invite" : ""))}
      >
        <GitHubMark className="mr-2 h-5 w-5" />
        Continue with GitHub
      </Button>
      {error && <p role="alert" className={styles.alert + " border border-red-500/25 bg-red-500/[0.06] text-red-500 dark:text-red-300"}>{error}</p>}
      <div className={styles.divider + " text-muted-foreground"}>
        <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={handleEmailLogin} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="login-email">Email</label>
          <Input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
        </div>
        <div className={styles.field}>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="login-password">Password</label>
            <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" minLength={8} maxLength={64} className="pr-10" required />
            <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {formError && (
          <div role="alert" className={styles.alert + " border border-red-500/25 bg-red-500/[0.06] text-red-500 dark:text-red-300"}>
            <p>{formError}</p>
            {needsVerification && <Link href={"/verify-email?email=" + encodeURIComponent(email.trim())} className="mt-2 inline-block underline underline-offset-4">Check email verification</Link>}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Signing in..." : "Sign in with email"}</Button>
      </form>
      <p className={styles.legal + " text-muted-foreground"}>
        By continuing, you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">Terms &amp; Conditions</Link>
        {" "}and{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy Policy</Link>.
      </p>
      <p className={styles.switch + " text-muted-foreground"}>
        Don&apos;t have an account?{" "}
        <Link href={returnTo === "/invite" ? "/invite" : "/register"} className="font-medium text-foreground hover:underline hover:underline-offset-4">Register</Link>
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  return <Suspense><LoginContent /></Suspense>;
}

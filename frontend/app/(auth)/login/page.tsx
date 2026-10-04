"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { GitHubMark } from "@/components/icons/github-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api";

function GitHubLogin() {
  const params = useSearchParams();
  const error = params.get("github_error");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-12 text-foreground">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl shadow-black/5 sm:p-9 dark:shadow-black/25">
        <header className="text-center">
          <BrandLogo href="/" ariaLabel="Kodeistry home" />
          <h1 className="mt-9 text-3xl font-semibold tracking-tight">AI Code Reviews That Understand Your Codebase</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Connect GitHub once. Kodeistry will discover your repositories and review pull requests automatically.</p>
        </header>

        <Button
          size="lg"
          className="mt-8 w-full"
          onClick={() => window.location.assign(`${API_BASE}/auth/github`)}
        >
          <GitHubMark className="mr-2 h-5 w-5" />
          Continue with GitHub
        </Button>

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3 text-sm text-red-500 dark:text-red-300">{error}</p>}
        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">Terms &amp; Conditions</Link>
          {" "}and{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy Policy</Link>.
        </p>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-foreground hover:underline hover:underline-offset-4">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><GitHubLogin /></Suspense>;
}

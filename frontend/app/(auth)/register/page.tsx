"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { GitHubMark } from "@/components/icons/github-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { register } from "@/lib/api/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (score <= 1) return "Weak";
    if (score <= 2) return "Fair";
    if (score <= 3) return "Good";
    return "Strong";
  }, [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await register({ name, email, password });
      router.push("/verify-email?email=" + encodeURIComponent(email));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create account">
      <form onSubmit={handleSubmit} className="space-y-2">
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            window.location.assign((process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api") + "/auth/github");
          }}
        >
          <GitHubMark className="size-4" /> Continue with GitHub
        </Button>
        <div className="relative flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium">Name</label>
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" required />
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <div className="relative">
              <Input id="password" autoComplete="new-password" minLength={8} maxLength={64} className="pr-10" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</label>
            <Input id="confirmPassword" autoComplete="new-password" minLength={8} maxLength={64} type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
          </div>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">{password ? "Password strength: " + passwordStrength : "Use at least 8 characters."}</p>

        {error && <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating account..." : "Register"}</Button>
      </form>

      <p className="text-center text-xs leading-4 text-muted-foreground">
        By registering, you agree to our <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">Terms &amp; Conditions</Link> and{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy Policy</Link>.
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Already registered? <Link href="/login" className="font-medium text-foreground">Login</Link>
      </p>
    </AuthShell>
  );
}


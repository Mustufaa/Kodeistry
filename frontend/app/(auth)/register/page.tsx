"use client";

import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import styles from "@/components/auth/auth-card.module.css";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

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
    <AuthCard title="Create account">
      <form onSubmit={handleSubmit} className={styles.form}>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            window.location.href = `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api"}/auth/github`;
          }}
        >
          <GitHubMark className="mr-2 h-5 w-5" />
          Continue with GitHub
        </Button>
        <div className={styles.divider + " text-muted-foreground"}>
          <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
        </div>
        <div className={styles.identityFields}>
          <div className={styles.field}>
            <label htmlFor="name">Name</label>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </div>
        </div>
        <div className={styles.passwordFields}>
          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pr-10" required />
              <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm password</label>
            <Input id="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
          </div>
        </div>
        <p className={styles.strength + " text-muted-foreground"}>Password strength: {passwordStrength}</p>
        {error && <div role="alert" className={styles.alert + " border border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400"}>{error}</div>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating account..." : "Register"}</Button>
      </form>
      <p className={styles.legal + " text-muted-foreground"}>
        By registering, you agree to our <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">Terms &amp; Conditions</Link> and{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy Policy</Link>.
      </p>
      <p className={styles.switch + " text-muted-foreground"}>
        Already registered? <Link href="/login" className="font-medium text-foreground hover:underline">Login</Link>
      </p>
    </AuthCard>
  );
}

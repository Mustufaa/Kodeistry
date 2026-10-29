"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUser, logout } from "@/lib/api/auth";
import { ApiError, clearAuth } from "@/lib/api/client";
import { acceptInvitation, INVITATION_CONTEXT_KEY, previewInvitation, registerInvitee, type InvitationPreview } from "@/lib/api/team";
import type { CurrentUser } from "@/types/auth";

export default function InvitationPage() {
  const client = useQueryClient();
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const fragment = new URLSearchParams(window.location.hash.slice(1)).get("token");
        if (fragment) {
          sessionStorage.setItem(INVITATION_CONTEXT_KEY, fragment);
          window.history.replaceState(null, "", "/invite");
        }
        const saved = fragment || sessionStorage.getItem(INVITATION_CONTEXT_KEY) || "";
        if (!saved) throw new Error("Open the invitation link from your email to continue.");
        const [invitation, account] = await Promise.all([
          previewInvitation(saved),
          getCurrentUser().catch((err) => { if (err instanceof ApiError && err.status === 401) return null; throw err; }),
        ]);
        if (active) { setToken(saved); setPreview(invitation); setUser(account); }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load invitation.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function join(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError("");
    try {
      if (user) await acceptInvitation(token);
      else await registerInvitee(token, name.trim(), password);
      sessionStorage.removeItem(INVITATION_CONTEXT_KEY);
      clearAuth(); await client.cancelQueries(); client.clear();
      window.location.replace("/dashboard");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to join team."); setBusy(false); }
  }
  async function switchAccount() {
    setBusy(true); setError("");
    try {
      await logout(); await client.cancelQueries(); client.clear();
      window.location.assign("/login?return_to=/invite");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to sign out."); setBusy(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
    <div className="min-w-0 w-full max-w-md space-y-6 [overflow-wrap:anywhere] rounded-2xl border bg-card p-6 shadow-xl sm:p-9">
      <BrandLogo />
      {!preview ? <h1 className="text-2xl font-semibold">Team invitation</h1> : null}
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading invitation...</p> : null}
      {preview ? <>
        <div><h1 className="text-2xl font-semibold">Join {preview.team_name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">You are invited as {preview.role.toLowerCase()}. Expires {new Date(preview.expires_at).toLocaleDateString()}.</p></div>
        {user ? <div className="space-y-4">
          <p className="break-all text-sm">Signed in as <strong>{user.email}</strong>. This must be the verified account that received the invitation.</p>
          <Button className="w-full" disabled={busy} onClick={() => void join()}>{busy ? "Joining..." : "Accept invitation"}</Button>
          <Button className="w-full" variant="outline" disabled={busy} onClick={() => void switchAccount()}>Use a different account</Button>
        </div> : <>
          <Button asChild className="w-full"><Link href="/login?return_to=/invite">Sign in to an existing account</Link></Button>
          <div className="border-t pt-5"><h2 className="font-medium">New to Kodeistry?</h2><p className="mt-2 text-sm text-muted-foreground">Create an account for the email that received this invitation. This emailed link verifies that address.</p></div>
          <form onSubmit={join} className="space-y-4">
            <label className="grid gap-2 text-sm">Full name<Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" /></label>
            <label className="grid gap-2 text-sm">Password<Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={64} autoComplete="new-password" /></label>
            <p className="text-xs text-muted-foreground">Use 8-64 characters, up to 72 UTF-8 bytes.</p>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Joining..." : "Create account and join"}</Button>
          </form>
        </>}
      </> : null}
      {error ? <p role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm text-red-500">{error}</p> : null}
      {!loading && !preview ? <Button variant="outline" asChild><Link href="/login">Back to sign in</Link></Button> : null}
    </div>
  </main>;
}

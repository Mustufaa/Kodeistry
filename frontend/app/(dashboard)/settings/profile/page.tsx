"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { GitHubMark } from "@/components/icons/github-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, logout } from "@/lib/api/auth";

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { data: user, isLoading } = useQuery({ queryKey: ["current-user"], queryFn: getCurrentUser });

  async function handleLogout() {
    try { await logout(); } finally { router.replace("/login"); }
  }

  const initials = (user?.full_name || user?.github_login || "K").split(/[\s_-]+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <PageHeader eyebrow="Settings" title="Profile" description="Your Kodeistry identity and sign-in information." />
      <Card className="overflow-hidden">
        <div className="h-24 border-b bg-[radial-gradient(circle_at_top_left,rgba(139,120,255,0.18),transparent_48%)]" />
        <CardContent className="px-5 pb-6 sm:px-6">
          <div className="-mt-8 mb-6 flex items-end gap-4"><div className="grid size-16 place-items-center rounded-2xl border-4 border-card bg-violet-500/20 text-lg font-semibold text-violet-700 dark:text-violet-300">{initials}</div><div className="pb-1"><h2 className="font-semibold">{user?.full_name || "Kodeistry user"}</h2><p className="text-xs text-muted-foreground">{user?.github_login ? `@${user.github_login}` : "Developer account"}</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [UserRound, "Name", user?.full_name],
              [Mail, "Email", user?.email],
              [ShieldCheck, "Email status", user?.is_verified ? "Verified" : "Not verified"],
              [GitHubMark, "GitHub", user?.github_login ? `@${user.github_login}` : "Not connected"],
            ].map(([Icon, label, value]) => {
              const Symbol = Icon as typeof UserRound;
              return <div key={String(label)} className="flex items-center gap-3 rounded-xl border bg-background p-4"><Symbol className="size-4 text-muted-foreground" /><div><p className="text-[11px] text-muted-foreground">{String(label)}</p><p className="mt-0.5 text-sm font-medium">{isLoading ? "Loading?" : String(value ?? "Not available")}</p></div></div>;
            })}
          </div>
        </CardContent>
      </Card>
      <Card><CardHeader className="border-b"><CardTitle>Sign out</CardTitle></CardHeader><CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">End your current Kodeistry session on this device.</p><Button variant="outline" onClick={handleLogout}><LogOut className="size-4" />Sign out</Button></CardContent></Card>
    </div>
  );
}

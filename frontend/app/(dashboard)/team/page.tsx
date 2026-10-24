"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { getRepositories } from "@/lib/api/repositories";
import { getTenantMembers } from "@/lib/api/tenants";
import { getInvitations, inviteMember, assignMemberRepositories, removeMember, resendInvitation, revokeInvitation, updateMemberRole, type TeamRole } from "@/lib/api/team";
import type { TenantMember } from "@/types/tenant";

type Action = { kind: "role" | "remove" | "repositories"; member: TenantMember } | { kind: "revoke"; id: number; email: string };
const selectClass = "h-10 rounded-lg border bg-background px-3 text-sm";

export default function TeamMembersPage() {
  const { tenantId, currentTenant, user } = useCurrentTenant();
  const client = useQueryClient();
  const owner = currentTenant?.role === "OWNER";
  const manager = owner || currentTenant?.role === "ADMIN";
  const members = useQuery({ queryKey: ["team-members", tenantId], queryFn: () => getTenantMembers(tenantId!), enabled: !!tenantId && manager });
  const invitations = useQuery({ queryKey: ["team-invitations", tenantId], queryFn: () => getInvitations(tenantId!), enabled: !!tenantId && manager });
  const repositories = useQuery({ queryKey: ["repositories", tenantId], queryFn: () => getRepositories(tenantId!), enabled: !!tenantId && manager });
  const [selectedRepositories, setSelectedRepositories] = useState<number[]>([]);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("MEMBER");
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: async (work: () => Promise<unknown>) => work(),
    onSuccess: async () => {
      setInviting(false); setAction(null); setEmail(""); setRole("MEMBER"); setSelectedRepositories([]); setError("");
      toast.success("Team updated.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["team-members", tenantId] }),
        client.invalidateQueries({ queryKey: ["team-invitations", tenantId] }),
        client.invalidateQueries({ queryKey: ["tenants"] }),
        client.invalidateQueries({ queryKey: ["repository-access", tenantId] }),
      ]);
    },
    onError: (err) => { setError(err.message); toast.error(err.message); },
  });
  function send(event: FormEvent) {
    event.preventDefault(); setError("");
    mutation.mutate(async () => {
      await inviteMember(tenantId!, email.trim(), role, role === "MEMBER" ? selectedRepositories : []);
      toast.success("Invitation email sent.");
    });
  }
  function confirm() {
    if (!action || !tenantId) return;
    setError("");
    const selected = action;
    mutation.mutate(async () => {
      if (selected.kind === "revoke") await revokeInvitation(tenantId, selected.id);
      else if (selected.kind === "remove") await removeMember(tenantId, selected.member.user_id);
      else if (selected.kind === "repositories") await assignMemberRepositories(tenantId, selected.member.user_id, selectedRepositories);
      else await updateMemberRole(tenantId, selected.member.user_id, role);
      if (selected.kind !== "revoke" && selected.member.user_id === user?.id) {
        await client.cancelQueries(); client.clear(); window.location.assign("/onboarding");
      }
    });
  }
  const roles: TeamRole[] = owner ? ["MEMBER", "ADMIN", "OWNER"] : ["MEMBER"];
  const roleSelect = <label className="grid gap-2 text-sm">Role<select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>{roles.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>;
  const repositorySelect = <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Assigned repositories</legend>
    {repositories.isPending ? <p role="status">Loading repositories...</p> : repositories.isError ? <p role="alert">Could not load repositories. <Button type="button" variant="outline" onClick={() => void repositories.refetch()}>Retry</Button></p> :
      <div className="max-h-64 space-y-2 overflow-auto rounded-lg border p-3">{repositories.data?.length ? repositories.data.map((repository) =>
        <label key={repository.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedRepositories.includes(repository.id)} onChange={(event) => setSelectedRepositories((ids) => event.target.checked ? [...ids, repository.id] : ids.filter((id) => id !== repository.id))} />{repository.full_name}</label>
      ) : <p className="text-sm text-muted-foreground">No repositories connected.</p>}</div>}
    <p className="text-xs text-muted-foreground">{selectedRepositories.length} selected. Members have read-only access to these repositories. Leaving this empty grants no repository access.</p>
  </fieldset>;
  const date = (value: string) => new Date(value).toLocaleDateString();
  const loading = members.isPending || (manager && invitations.isPending);
  const failed = members.isError || (manager && invitations.isError);
  const close = () => { if (!mutation.isPending) { setInviting(false); setAction(null); setError(""); } };

  if (!manager) return <p role="alert">Only owners and admins can manage team members.</p>;

  return <div className="mx-auto max-w-5xl space-y-7">
    <PageHeader eyebrow="Team" title="Team Members" description={`Manage access to ${currentTenant?.name ?? "your team"}. Members can access only repositories explicitly assigned to them.`}
      actions={manager ? <Button onClick={() => { setInviting(true); setRole("MEMBER"); setSelectedRepositories([]); setError(""); }}><UserPlus className="size-4" />Invite member</Button> : undefined} />
    <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
      Owners manage team settings, roles, and GitHub connections. Admins manage repositories, reviews, and ordinary members. Members have read-only access to assigned repositories.
    </div>
    {loading ? <p role="status" className="animate-pulse text-sm text-muted-foreground">Loading your team...</p> : null}
    {failed ? <div role="alert" className="rounded-xl border border-red-500/30 p-4">Unable to load team details. <Button variant="ghost" onClick={() => { void members.refetch(); if (manager) void invitations.refetch(); }}>Try again</Button></div> : null}
    {!loading && !failed ? <>
      <section className="overflow-hidden rounded-xl border bg-card">
        <h2 className="flex items-center gap-2 border-b p-5 font-semibold"><Users className="size-4" />Members ({members.data?.length ?? 0})</h2>
        {!members.data?.length ? <p className="p-5 text-sm text-muted-foreground">No members to display.</p> :
          <ul className="divide-y">{members.data.map((member) => {
            const lastOwner = member.role === "OWNER" && members.data.filter((m) => m.role === "OWNER").length === 1;
            const canManage = (owner || (manager && member.role === "MEMBER")) && !lastOwner;
            return <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0"><p className="break-words font-medium">{member.full_name}{member.user_id === user?.id ? " (you)" : ""}</p>
                <p className="break-all text-sm text-muted-foreground">{member.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">Joined {date(member.joined_at)}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border bg-muted px-2.5 py-1 text-xs">{member.role}</span>
                {manager && member.role === "MEMBER" ? <Button size="sm" variant="outline" onClick={() => { setSelectedRepositories(member.repository_ids); setAction({ kind: "repositories", member }); setError(""); }}>Repositories ({member.repository_ids.length})</Button> : null}
                {lastOwner ? <span className="text-xs text-muted-foreground">Last owner</span> : null}
                {canManage && owner ? <Button size="sm" variant="outline" onClick={() => { setRole(member.role as TeamRole); setAction({ kind: "role", member }); setError(""); }}>Edit role</Button> : null}
                {canManage ? <Button size="sm" variant="ghost" onClick={() => { setAction({ kind: "remove", member }); setError(""); }}>Remove</Button> : null}
              </div>
            </li>;
          })}</ul>}
      </section>
      {manager ? <section className="overflow-hidden rounded-xl border bg-card">
        <h2 className="border-b p-5 font-semibold">Pending invitations ({invitations.data?.length ?? 0})</h2>
        {!invitations.data?.length ? <p className="p-5 text-sm text-muted-foreground">No pending invitations. Invite someone to review code with your team.</p> :
          <ul className="divide-y">{invitations.data.map((invitation) => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0"><p className="break-all text-sm font-medium">{invitation.email}</p><p className="mt-1 text-xs text-muted-foreground">{invitation.role} - Expires {new Date(invitation.expires_at).toLocaleString()}</p></div>
            {owner || invitation.role === "MEMBER" ? <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => { setError(""); mutation.mutate(async () => { await resendInvitation(tenantId!, invitation.id); toast.success("Invitation email resent. Previous link is invalid."); }); }}>Resend</Button>
              <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => { setAction({ kind: "revoke", id: invitation.id, email: invitation.email }); setError(""); }}>Revoke</Button>
            </div> : null}
          </li>)}</ul>}
      </section> : null}
    </> : null}
    {error && !inviting && !action ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
    {inviting ? <Modal title="Invite a team member" onClose={close}>
      <form onSubmit={send} className="space-y-4">
        <label className="grid gap-2 text-sm">Email<Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" /></label>
        {roleSelect}{role === "MEMBER" ? repositorySelect : null}<p className="text-xs text-muted-foreground">We will email a single-use invitation valid for 7 days. Members will see only the repositories selected above.</p>
        {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={mutation.isPending}>Cancel</Button><Button type="submit" disabled={mutation.isPending || (role === "MEMBER" && !repositories.isSuccess)}>{mutation.isPending ? "Sending..." : "Send invitation"}</Button></div>
      </form>
    </Modal> : null}
    {action ? <Modal title={action.kind === "repositories" ? "Assign repositories" : action.kind === "role" ? "Change member role" : action.kind === "remove" ? "Remove team member?" : "Revoke invitation?"} onClose={close}>
      <div className="space-y-4">
        <p className="break-words text-sm text-muted-foreground">{action.kind === "revoke" ? `The invitation for ${action.email} will stop working immediately.` : action.kind === "remove" ? `${action.member.full_name} will lose access to this team's repositories and reviews immediately.` : `Update permissions for ${action.member.full_name}. Members can access only assigned repositories.`}</p>
        {action.kind === "role" ? roleSelect : null}
        {action.kind === "repositories" ? repositorySelect : null}
        {error ? <p role="alert" className="text-sm text-red-500">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={close} disabled={mutation.isPending}>Cancel</Button><Button variant={action.kind === "role" || action.kind === "repositories" ? "default" : "destructive"} onClick={confirm} disabled={mutation.isPending || (action.kind === "repositories" && !repositories.isSuccess)}>{mutation.isPending ? "Saving..." : "Confirm"}</Button></div>
      </div>
    </Modal> : null}
  </div>;
}

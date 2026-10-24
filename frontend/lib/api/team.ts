import { apiRequest } from "./client";

export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";
export interface Invitation { id: number; email: string; role: TeamRole; expires_at: string; created_at: string; repository_ids: number[] }
export interface InvitationPreview { team_name: string; role: TeamRole; expires_at: string }
export const INVITATION_CONTEXT_KEY = "kodeistry_invitation";

export const getInvitations = (team: number) => apiRequest<Invitation[]>(`/tenants/${team}/invitations`);
export const inviteMember = (team: number, email: string, role: TeamRole, repository_ids: number[] = []) =>
  apiRequest<Invitation>(`/tenants/${team}/invitations`, { method: "POST", body: JSON.stringify({ email, role, repository_ids }) });
export const resendInvitation = (team: number, id: number) =>
  apiRequest<Invitation>(`/tenants/${team}/invitations/${id}/resend`, { method: "POST" });
export const revokeInvitation = (team: number, id: number) =>
  apiRequest<void>(`/tenants/${team}/invitations/${id}`, { method: "DELETE" });
export const updateMemberRole = (team: number, user: number, role: TeamRole) =>
  apiRequest<void>(`/tenants/${team}/members/${user}`, { method: "PATCH", body: JSON.stringify({ role }) });
export const removeMember = (team: number, user: number) =>
  apiRequest<void>(`/tenants/${team}/members/${user}`, { method: "DELETE" });
export const previewInvitation = (token: string) =>
  apiRequest<InvitationPreview>("/invitations/preview", { method: "POST", body: JSON.stringify({ token }) });
export const acceptInvitation = (token: string) =>
  apiRequest<{ tenant_id: number }>("/invitations/accept", { method: "POST", body: JSON.stringify({ token }) });
export const registerInvitee = (token: string, name: string, password: string) =>
  apiRequest<{ tenant_id: number }>("/invitations/register", { method: "POST", body: JSON.stringify({ token, name, password }) });

export const assignMemberRepositories = (team: number, user: number, repository_ids: number[]) =>
  apiRequest<void>("/tenants/" + team + "/members/" + user + "/repositories", { method: "PUT", body: JSON.stringify({ repository_ids }) });

import { apiRequest } from "./client";

export const TOUR_EVENT = "kodeistry-start-tour";
export function claimTourInvitation() {
  return apiRequest<{ show_invitation: boolean }>("/onboarding/tour/claim", { method: "POST", cache: "no-store" });
}
export function saveTutorialStatus(status: "IN_PROGRESS" | "SKIPPED" | "COMPLETED") {
  return apiRequest("/onboarding/tour/status", { method: "PUT", body: JSON.stringify({ status }) });
}

export interface OnboardingStatus {
  authenticated: true;
  user: {
    id: number;
    github_login?: string | null;
    avatar_url?: string | null;
  };
  workspace: { id: number; name: string };
  github: {
    connected: boolean;
    installation_id?: number | null;
    account_login?: string | null;
    account_type?: string | null;
  };
  repositories: { count: number; synced: boolean };
  onboarding_complete: boolean;
  next_step: "github_install" | "syncing" | "dashboard" | "error";
  error_code?: string | null;
}

export function getOnboardingStatus(tenantId?: number) {
  const query = tenantId ? `?tenant_id=${tenantId}` : "";
  return apiRequest<OnboardingStatus>(`/onboarding/status${query}`);
}

export function selectOnboardingWorkspace(tenantId: number) {
  return apiRequest<OnboardingStatus>("/onboarding/workspace", {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantId }),
  });
}

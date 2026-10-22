import { apiRequest } from "./client";
import type { FixAssistantResult, TrackingResult, TriageStatus } from "@/types/fix-workflow";

const path = (tenantId: number, findingId: number) => `/tenants/${tenantId}/findings/${findingId}`;

export const getFixAssistant = (tenantId: number, findingId: number) =>
  apiRequest<FixAssistantResult>(`${path(tenantId, findingId)}/fix-assistant`);
export const generateFixAssistant = (tenantId: number, findingId: number) =>
  apiRequest<FixAssistantResult>(`${path(tenantId, findingId)}/fix-assistant`, { method: "POST" });
export const getTracking = (tenantId: number, findingId: number) =>
  apiRequest<TrackingResult>(`${path(tenantId, findingId)}/tracking`);
export const recheckFinding = (tenantId: number, findingId: number) =>
  apiRequest<TrackingResult>(`${path(tenantId, findingId)}/recheck`, { method: "POST" });
export const triageFinding = (tenantId: number, findingId: number, status: TriageStatus, reason: string) =>
  apiRequest<TrackingResult>(`${path(tenantId, findingId)}/triage`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });


import { apiRequest } from "./client";
import type { ReviewRun } from "@/types/review";

export async function getReviews(tenantId: number) {
  return apiRequest<ReviewRun[]>(`/tenants/${tenantId}/reviews`);
}

export async function getReview(tenantId: number, reviewId: number) {
  return apiRequest<ReviewRun>(`/tenants/${tenantId}/reviews/${reviewId}`);
}

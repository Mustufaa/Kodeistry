import { apiRequest, clearAuth } from "./client";
import type { AuthToken, CurrentUser, LoginInput, RegisterInput } from "@/types/auth";

export async function login(payload: LoginInput) {
  const session = await apiRequest<AuthToken>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  clearAuth();
  return session;
}

export async function register(payload: RegisterInput) {
  return apiRequest<{ message: string; workspace?: unknown }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      password: payload.password,
    }),
  });
}

export async function forgotPassword(email: string) {
  return apiRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string) {
  return apiRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export async function verifyEmail(token: string) {
  return apiRequest<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`);
}

export async function getCurrentUser() {
  return apiRequest<CurrentUser>("/auth/me");
}

export async function logout() {
  try {
    return await apiRequest<void>("/auth/logout", { method: "POST" });
  } finally {
    clearAuth();
  }
}

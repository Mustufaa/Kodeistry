const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api";

export function apiUrl(path: string) { return `${API_BASE}${path}`; }

const isNgrokApi = [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.app", ".ngrok.io"]
  .some((suffix) => new URL(API_BASE).hostname.endsWith(suffix));

export function apiHeaders(initial?: HeadersInit) {
  const headers = new Headers(initial);
  if (isNgrokApi) headers.set("ngrok-skip-browser-warning", "true");
  return headers;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "ApiError"; this.status = status; }
}

let crossOriginCsrfToken = "";

function csrfCookie() {
  if (typeof document === "undefined") return "";
  const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("kodeistry_csrf="));
  return item ? decodeURIComponent(item.slice("kodeistry_csrf=".length)) : "";
}

async function csrfToken() {
  const cookieToken = csrfCookie();
  if (cookieToken) return cookieToken;
  if (crossOriginCsrfToken) return crossOriginCsrfToken;
  const response = await fetch(`${API_BASE}/auth/csrf`, { credentials: "include", headers: apiHeaders() });
  if (!response.ok) throw new ApiError("Unable to initialize a secure session.", response.status);
  const data = await response.json() as { csrf_token: string };
  crossOriginCsrfToken = data.csrf_token;
  return crossOriginCsrfToken;
}

const PUBLIC_AUTH_PATHS = new Set(["/auth/login", "/auth/register", "/auth/forgot-password", "/auth/reset-password", "/invitations/preview", "/invitations/register"]);

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = apiHeaders(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !PUBLIC_AUTH_PATHS.has(path)) {
    const csrf = await csrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, method, headers, credentials: "include" });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const data = await response.json(); message = data.detail ?? data.message ?? message; } catch { /* non-JSON response */ }
    if (typeof window !== "undefined" && path.startsWith("/tenants/") && response.status === 404) {
      window.dispatchEvent(new Event("kodeistry-permissions-refresh"));
    }
    if (typeof window !== "undefined" && path.startsWith("/tenants/") && [401, 403].includes(response.status)) {
      window.dispatchEvent(new Event("kodeistry-access-lost"));
    }
    throw new ApiError(typeof message === "string" ? message : "Check the form fields and try again.", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function setAuthToken(_token: string) { void _token; }
export function getAuthToken() { return null; }
export function clearAuth() { crossOriginCsrfToken = ""; }

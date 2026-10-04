export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface CurrentUser {
  id: number;
  full_name: string;
  email: string;
  is_verified: boolean;
  github_login?: string | null;
  github_avatar_url?: string | null;
  auth_provider: string;
  onboarding_tenant_id?: number | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

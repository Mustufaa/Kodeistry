export interface Tenant {
  id: number;
  name: string;
  slug: string;
  workspace_type: "PERSONAL" | "ORGANIZATION";
  role: "OWNER" | "ADMIN" | "MEMBER";
}

export interface TenantMember {
  user_id: number;
  full_name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joined_at: string;
  repository_ids: number[];
}

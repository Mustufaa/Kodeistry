export interface Tenant {
  id: number;
  name: string;
  slug: string;
  workspace_type: "PERSONAL" | "ORGANIZATION";
}

export interface TenantMember {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
}

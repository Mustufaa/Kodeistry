export interface RepositoryItem {
  id: number;
  tenant_id: number;
  github_installation_id: number;
  github_repository_id: number;
  owner: string;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url?: string | null;
  description?: string | null;
  language?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

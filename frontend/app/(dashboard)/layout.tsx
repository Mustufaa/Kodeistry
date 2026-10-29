import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/layout/app-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireOnboardingComplete>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}

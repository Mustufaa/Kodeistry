import Link from "next/link";
import { ArrowRight, GitBranch, Palette, Shield, UserCircle2 } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";

const items = [
  ["Profile", "/settings/profile", UserCircle2, "Review your account and GitHub identity."],
  ["Security", "/settings/security", Shield, "Password reset and account security."],
  ["GitHub", "/settings/integrations/github", GitBranch, "Manage repository access and synchronization."],
  ["Appearance", "/settings/appearance", Palette, "Choose your preferred interface theme."],
] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Account" title="Settings" description="Manage your Kodeistry account and connected developer tools." />
      <div className="grid gap-4 md:grid-cols-2">
        {items.map(([title, href, Icon, description]) => (
          <Link key={href} href={href} className="group flex items-start gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-violet-400/30 hover:bg-accent/45">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-background text-violet-600 dark:text-violet-400"><Icon className="size-[18px]" /></div>
            <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p></div>
            <ArrowRight className="mt-1 size-4 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  BarChart3,
  Bug,
  FolderGit2,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { BrandLogo, BrandMark } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { logout } from "@/lib/api/auth";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/repositories", label: "Repositories", icon: FolderGit2 },
  { href: "/reviews", label: "Reviews", icon: ShieldCheck },
  { href: "/findings", label: "Findings", icon: Bug },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings/integrations/github", label: "GitHub", icon: GitBranch },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useCurrentTenant();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCollapsed(window.localStorage.getItem("kodeistry_sidebar_collapsed") === "true");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      window.localStorage.setItem("kodeistry_sidebar_collapsed", String(!value));
      return !value;
    });
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

  const initials = (user?.full_name || user?.github_login || "K")
    .split(/[\s_-]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const currentLabel = navItems.find((item) => isActive(pathname, item.href))?.label ?? "Settings";

  const sidebar = (mobile = false) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center border-b px-4", collapsed && !mobile ? "justify-center px-2" : "justify-between")}>
        {collapsed && !mobile ? <BrandLogo compact /> : <BrandLogo />}
        {mobile ? (
          <Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <nav aria-label="Primary navigation" className="flex-1 space-y-1 px-3 py-5">
        {!collapsed || mobile ? <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">Product</p> : null}
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed && !mobile ? label : undefined}
              aria-current={active ? "page" : undefined}
              onClick={() => mobile && setMobileOpen(false)}
              className={cn(
                "group relative flex h-10 items-center rounded-lg text-sm font-medium transition-colors",
                collapsed && !mobile ? "justify-center px-0" : "gap-3 px-3",
                active ? "bg-violet-500/10 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-violet-400" /> : null}
              <Icon className={cn("size-[17px] shrink-0", active && "text-violet-600 dark:text-violet-400")} />
              {!collapsed || mobile ? label : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className={cn("mb-2 flex items-center", collapsed && !mobile ? "justify-center" : "justify-between px-1")}>
          {!collapsed || mobile ? <span className="text-xs text-muted-foreground">Theme</span> : null}
          <ThemeToggle />
        </div>
        <Link
          href="/settings"
          title={collapsed && !mobile ? "Settings" : undefined}
          className={cn("flex h-10 items-center rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground", collapsed && !mobile ? "justify-center" : "gap-3 px-3")}
        >
          <Settings className="size-[17px]" />
          {!collapsed || mobile ? "Settings" : null}
        </Link>
        <div className={cn("mt-2 flex items-center rounded-xl border bg-background/55 p-2", collapsed && !mobile ? "justify-center" : "gap-3")}>
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-xs font-semibold text-violet-700 dark:text-violet-300">{initials}</div>
          {!collapsed || mobile ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{user?.full_name || user?.github_login || "Kodeistry user"}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user?.email || "Signed in"}</p>
              </div>
              <button type="button" onClick={handleLogout} className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Sign out">
                <LogOut className="size-4" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className={cn("fixed inset-y-0 left-0 z-40 hidden border-r bg-sidebar transition-[width] duration-200 lg:block", collapsed ? "w-[72px]" : "w-64")}>
        {sidebar()}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="absolute -right-3 top-[78px] grid size-6 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
        </button>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[min(86vw,288px)] border-r bg-sidebar shadow-2xl">{sidebar(true)}</aside>
        </div>
      ) : null}

      <div className={cn("min-h-screen transition-[padding] duration-200", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <BrandMark className="size-8 lg:hidden" />
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <span className="text-muted-foreground">Kodeistry</span>
              <span className="text-muted-foreground/40">/</span>
              <span className="font-medium">{currentLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-violet-600 dark:text-violet-400" />
            AI code review
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1480px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

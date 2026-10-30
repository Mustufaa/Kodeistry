import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import styles from "./auth-shell.module.css";

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="auth-title">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/" aria-label="Back to home"><ArrowLeft className="size-4" /></Link>
          </Button>
          <BrandLogo href="/" ariaLabel="Kodeistry home" />
          <ThemeToggle />
        </div>
        <h1 id="auth-title" className="text-center text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </section>
    </main>
  );
}

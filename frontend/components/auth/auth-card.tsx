import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import styles from "./auth-card.module.css";

export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className={styles.page + " bg-background text-foreground"}>
      <div className={styles.card + " rounded-2xl border bg-card shadow-xl shadow-black/5 dark:shadow-black/25"}>
        <header className={styles.header}>
          <div className={styles.toolbar}>
            <Button asChild variant="outline" size="icon">
              <Link href="/" aria-label="Back to home"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <BrandLogo href="/" ariaLabel="Kodeistry home" />
            <ThemeToggle />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className={styles.description + " text-muted-foreground"}>{description}</p>}
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </main>
  );
}

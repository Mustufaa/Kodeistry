import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import styles from "@/app/landing-page.module.css";

export function SiteHeader() {
  return (
    <header className={styles.siteHeader}>
      <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        <BrandLogo compact href="/" ariaLabel="Kodeistry home" />
        <div className={"hidden items-center gap-6 text-sm text-muted-foreground md:flex " + styles.navLinks}>
          <Link href="/#product" className="hover:text-foreground">Product</Link>
          <Link href="/#features" className="hover:text-foreground">Features</Link>
          <Link href="/#security" className="hover:text-foreground">Security</Link>
          <a href="https://github.com/Mustufaa" target="_blank" rel="noopener noreferrer" aria-label="GitHub (opens in a new tab)" className="hover:text-foreground">GitHub</a>
          <Link href="/faq" className="hover:text-foreground">FAQ</Link>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <ThemeToggle />
          <Link href="/faq" className="inline-flex min-h-10 items-center px-1 text-sm text-muted-foreground hover:text-foreground md:hidden">FAQ</Link>
          <Link href="/login" className="inline-flex min-h-10 items-center px-2 text-sm font-medium text-foreground hover:text-primary">Login</Link>
          <Link href="/register" className={styles.headerCta}>Get Started</Link>
        </div>
      </nav>
    </header>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PublicLinks, PublicNavigation } from "@/components/marketing/public-navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbData } from "@/lib/seo";

type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalPageProps = {
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export function LegalPage({ title, description, lastUpdated, sections }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <JsonLd data={breadcrumbData(title === "Privacy Policy" ? "/privacy" : "/terms", title)} />
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <BrandLogo compact href="/" ariaLabel="Kodeistry home" />
          <div className="flex items-center gap-3">
            <ThemeToggle /><PublicNavigation />
            <Link href="/login" className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent">Sign in</Link>
          </div>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
        <div className="mt-8 grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">On this page</p>
            <nav className="mt-4 flex flex-col gap-2 border-l pl-4" aria-label={`${title} sections`}>
              {sections.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{section.title}</a>
              ))}
            </nav>
          </aside>
          <article className="min-w-0">
            <div className="border-b pb-8">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
              <h1 className="mt-3 break-words text-[clamp(1.875rem,5vw,3rem)] font-semibold tracking-tight">{title}</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{description}</p>
              <p className="mt-4 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
            </div>
            <div className="divide-y">
              {sections.map((section, index) => (
                <section key={section.id} id={section.id} className="scroll-mt-28 py-8">
                  <h2 className="text-xl font-semibold tracking-tight">{index + 1}. {section.title}</h2>
                  <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
                    {section.content}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 pt-8 text-sm text-muted-foreground sm:px-6 lg:px-8"><PublicLinks /></div>
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <span className="flex items-center gap-3">
            <BrandLogo compact href="/" ariaLabel="Kodeistry home" />
            <span aria-hidden="true" className="text-muted-foreground/40">·</span>
            <span>&copy; 2026</span>
          </span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms &amp; Conditions</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

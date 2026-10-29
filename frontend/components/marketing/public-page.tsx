import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PublicLinks, PublicNavigation } from "./public-navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbData } from "@/lib/seo";
import { publicPages, type PublicGuide } from "@/lib/public-content";

export function PublicPage({ path, title, summary, children }: { path: string; title: string; summary: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <BrandLogo compact href="/" ariaLabel="Kodeistry home" />
          <nav aria-label="Main navigation" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link href="/how-it-works">How it works</Link><Link href="/docs">Docs</Link><Link href="/faq">FAQ</Link>
          </nav>
          <div className="flex items-center gap-3"><ThemeToggle /><PublicNavigation /><Link href="/register" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">Get Started</Link></div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground"><ol className="flex flex-wrap gap-2"><li><Link href="/" className="underline underline-offset-4">Home</Link></li><li aria-hidden="true">/</li><li aria-current="page">{title}</li></ol></nav>
        <article className="max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground">{summary}</p>
          <div className="mt-10 space-y-10">{children}</div>
        </article>
      </main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-sm text-muted-foreground sm:px-6 lg:px-8">
          <PublicLinks />
          <div className="flex flex-wrap items-center gap-6"><BrandLogo href="/" ariaLabel="Kodeistry home" /><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms &amp; Conditions</Link></div>
        </div>
      </footer>
      <JsonLd data={breadcrumbData(path, title)} />
    </div>
  );
}
export function GuidePage({ guide }: { guide: PublicGuide }) {
  return (
    <PublicPage path={guide.path} title={guide.title} summary={guide.summary}>
      <nav aria-label="On this page" className="rounded-lg border bg-card p-5">
        <ul className="space-y-2 text-sm">{guide.sections.map((section) => <li key={section.id}><a className="underline underline-offset-4" href={"#" + section.id}>{section.title}</a></li>)}</ul>
      </nav>
      {guide.sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-28">
          <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
          {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-4 text-base leading-7 text-muted-foreground">{paragraph}</p>)}
          {section.steps && <ol className="mt-4 list-decimal space-y-3 pl-6 text-base leading-7 text-muted-foreground">{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
        </section>
      ))}
      {guide.sources && <section><h2 className="text-2xl font-semibold">Source references</h2><ul className="mt-4 space-y-3">{guide.sources.map((source) => <li key={source.href}><a className="underline underline-offset-4" href={source.href}>{source.label}</a></li>)}</ul></section>}
      <section><h2 className="text-2xl font-semibold">Continue reading</h2><ul className="mt-4 space-y-3">{guide.related.map((path) => <li key={path}><Link className="underline underline-offset-4" href={path}>{publicPages.find((page) => page.path === path)?.title ?? path}</Link></li>)}</ul></section>
    </PublicPage>
  );
}

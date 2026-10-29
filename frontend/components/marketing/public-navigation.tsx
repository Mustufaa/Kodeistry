import Link from "next/link";

export function PublicNavigation() {
  return (
    <details className="relative md:hidden">
      <summary className="cursor-pointer rounded-md border px-3 py-2 text-sm font-medium">Menu</summary>
      <nav aria-label="Mobile navigation" className="absolute right-0 top-full z-50 mt-2 flex w-60 flex-col rounded-lg border bg-background p-2 shadow-lg">
        {[
          ["/features/ai-code-review", "AI code review"],
          ["/features/github-integration", "GitHub integration"],
          ["/features/security-analysis", "Security analysis"],
          ["/how-it-works", "How it works"],
          ["/docs", "Docs"], ["/faq", "FAQ"], ["/login", "Sign in"],
        ].map(([href, label]) => <Link key={href} href={href} className="rounded-md px-3 py-3 text-sm hover:bg-accent">{label}</Link>)}
      </nav>
    </details>
  );
}
export function PublicLinks() {
  return (
    <nav aria-label="Product resources" className="flex flex-wrap gap-x-6 gap-y-3">
      <Link href="/features/ai-code-review" className="hover:text-foreground">AI code review</Link>
      <Link href="/features/github-integration" className="hover:text-foreground">GitHub integration</Link>
      <Link href="/features/security-analysis" className="hover:text-foreground">Security analysis</Link>
      <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
      <Link href="/docs" className="hover:text-foreground">Docs</Link>
      <Link href="/faq" className="hover:text-foreground">FAQ</Link>
    </nav>
  );
}

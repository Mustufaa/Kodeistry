import Link from "next/link";
import { MobileNavigation } from "./mobile-navigation";

export function PublicNavigation() { return <MobileNavigation />; }
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

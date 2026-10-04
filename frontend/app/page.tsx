import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle2, GitBranch, Lock, ShieldCheck, Sparkles, Zap } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const features = [
  { title: "Automated PR analysis", description: "Detect bugs, security issues, and quality flaws before merge.", icon: Sparkles },
  { title: "GitHub-native workflow", description: "Review code in the context of your repositories and pull requests.", icon: GitBranch },
  { title: "Actionable findings", description: "Every issue includes explanation, recommendation, and fix guidance.", icon: CheckCircle2 },
  { title: "Security-first", description: "Priority ranking surfaces critical vulnerabilities quickly.", icon: ShieldCheck },
  { title: "Developer velocity", description: "Keep teams moving with quicker, clearer review feedback.", icon: Zap },
  { title: "Private by default", description: "Secure review workflows designed for teams and organizations.", icon: Lock },
];

const steps = [
  "Connect your GitHub App installation and repository.",
  "Open or update a pull request to trigger automated review orchestration.",
  "Review prioritized findings with remediation guidance and code context.",
];

export default function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <BrandLogo href="/" ariaLabel="Kodeistry home" />

          <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#product" className="hover:text-foreground">Product</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#security" className="hover:text-foreground">Security</a>
            <a href="#github" className="hover:text-foreground">GitHub</a>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground md:inline-flex">Login</Link>
            <Link href="/register" className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">Get Started</Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> AI PR Review Platform
              </div>
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                AI-Powered Code Reviews for GitHub
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                Kodeistry automatically analyzes your pull requests, identifies security vulnerabilities, bugs, and code-quality issues, and delivers actionable feedback.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/register">
                  <Button size="lg" className="w-full sm:w-auto">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">View Dashboard</Button>
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="rounded-xl border bg-secondary p-4">
                <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
                  <span>PR Review: #243</span>
                  <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400">CRITICAL</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Repository</div>
                    <div className="mt-1 font-medium">acme/platform-api</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Findings</div>
                      <div className="mt-2 text-2xl font-semibold">18</div>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Security</div>
                      <div className="mt-2 text-2xl font-semibold">4</div>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <div className="text-xs text-muted-foreground">Quality</div>
                      <div className="mt-2 text-2xl font-semibold">12</div>
                    </div>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="mb-2 text-sm font-medium">High priority finding</div>
                    <p className="text-sm text-muted-foreground">Unvalidated user input is passed into the token verification flow and may lead to denial-of-service behavior.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="product" className="border-y bg-card/30">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="mb-8 max-w-2xl">
              <div className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Product</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">The AI review layer your team actually trusts</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                ["Review coverage", "Catch logic issues and edge cases across changed code before merge."],
                ["Security detection", "Prioritize auth, injection, and unsafe data flow regressions."],
                ["Team visibility", "Keep repos, PRs, and findings in one high-signal review workspace."],
              ].map(([title, description]) => (
                <div key={title} className="rounded-xl border bg-background p-6">
                  <div className="mb-4 h-10 w-10 rounded-md bg-secondary flex items-center justify-center text-sm font-semibold">✓</div>
                  <h3 className="text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-2xl">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Features</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Built for engineering teams</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {features.map(({ title, description, icon: Icon }) => (
              <div key={title} className="rounded-xl border bg-card p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="github" className="border-y bg-card/30">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <div className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">GitHub integration</div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">Connected to the review flow your developers already use</h2>
                <p className="mt-4 text-muted-foreground">Kodeistry plugs into GitHub App installation patterns and uses repository context, PR metadata, and review history to prioritize issues based on real code changes.</p>
              </div>
              <div className="flex items-center justify-center rounded-2xl border bg-background p-8">
                <div className="w-full space-y-4">
                  {[
                    ["GitHub App installation", "Connected"],
                    ["Repositories tracked", "12"],
                    ["Review runs", "84"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-2xl">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Security & quality</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Prioritize risk and reduce review debt</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              ["Critical issues", "Focus on exploitable defects and unsafe patterns before merge."],
              ["Code quality", "Highlight maintainability and logic problems with clear suggestions."],
              ["Review history", "Track how findings evolve across PRs and repositories over time."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-xl border bg-card p-6">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-2xl">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Workflow</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">How Kodeistry works</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step} className="rounded-xl border bg-card p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-secondary font-semibold">{index + 1}</div>
                <p className="text-sm text-muted-foreground">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t bg-card/30">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-16 text-center sm:px-6 lg:flex-row lg:text-left lg:px-8">
            <div>
              <div className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Ready to review smarter?</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Ship safer code with AI-assisted PR review</h2>
            </div>
            <Link href="/register">
              <Button size="lg">Get Started <ArrowUpRight className="ml-2 h-4 w-4" /></Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-8 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 border-t pt-6 sm:flex-row">
          <div>© 2026 Kodeistry</div>
          <div className="flex gap-6">
            <a href="#product" className="hover:text-foreground">Product</a>
            <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms &amp; Conditions</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

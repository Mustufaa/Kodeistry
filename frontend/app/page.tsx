import Link from "next/link";
import { Pixelify_Sans } from "next/font/google";
import { ArrowRight, ArrowUpRight, Mail, Sparkles } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { BentoFeatures } from "@/components/landing/bento-features";
import { CodeReviewAnimation } from "@/components/landing/code-review-animation";
import { RoboticBugLoader } from "@/components/landing/robotic-bug-loader";
import { MacWindow } from "@/components/landing/mac-window";
import styles from "./landing-page.module.css";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const pixelify = Pixelify_Sans({ variable: "--font-voxel", subsets: ["latin"], display: "swap", fallback: ["ui-monospace", "monospace"] });

const steps = [
  "Connect your GitHub App installation and repository.",
  "Open or update a pull request to trigger automated review orchestration.",
  "Review prioritized findings with remediation guidance and code context.",
];

export default function Page() {
  return (
    <div className={pixelify.variable + " " + styles.landing}>
      <header className={styles.siteHeader}>
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <BrandLogo compact href="/" ariaLabel="Kodeistry home" />

          <div className={"hidden items-center gap-8 text-sm text-muted-foreground md:flex " + styles.navLinks}>
            <a href="#product" className="hover:text-foreground">Product</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#security" className="hover:text-foreground">Security</a>
            <a href="#github" className="hover:text-foreground">GitHub</a>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground md:inline-flex">Login</Link>
            <Link href="/register" className={styles.headerCta}>Get Started</Link>
          </div>
        </nav>
      </header>

      <main>
        <section className={"mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 " + styles.hero}>
          <div className={"grid items-center gap-10 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] " + styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.heroBrand}>Kodeistry</p>
              <div className={styles.heroBadge}>
                <Sparkles className="h-3.5 w-3.5" /> AI PR Review Platform
              </div>
              <h1 className={styles.heroTitle}>
                <span className={styles.heroTitleAccent}>AI-Powered</span> Code Reviews for GitHub
              </h1>
              <p className={styles.heroDescription}>
                Kodeistry automatically analyzes your pull requests, identifies security vulnerabilities, bugs, and code-quality issues, and delivers actionable feedback.
              </p>

              <div className={styles.heroActions}>
                <Link href="/register" className={styles.primaryCta}>Get Started <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/dashboard" className={styles.secondaryCta}>View Dashboard</Link>
              </div>
            </div>

            <div data-bug-scan className={styles.heroPreviewTrack}>
              <CodeReviewAnimation />
            </div>
          </div>
        </section>

        <section id="product" className={styles.sectionBand}>
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="mb-8 max-w-2xl">
              <div className={styles.sectionEyebrow}>Product</div>
              <h2 className={styles.sectionHeading}>The AI review layer your team actually trusts</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                ["Review coverage", "Catch logic issues and edge cases across changed code before merge."],
                ["Security detection", "Prioritize auth, injection, and unsafe data flow regressions."],
                ["Team visibility", "Keep repos, PRs, and findings in one high-signal review workspace."],
              ].map(([title, description]) => (
                <div key={title} data-bug-card className={styles.voxelCard}>
                  <div className={styles.tileIcon}>✓</div>
                  <h3 className={styles.cardTitle}>{title}</h3>
                  <p className={styles.cardBody}>{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-6 max-w-2xl">
            <div className={styles.sectionEyebrow}>Features</div>
            <h2 className={styles.sectionHeading}>A clearer path from pull request to fix</h2>
            <p className="mt-4 text-muted-foreground">Review the change, understand the risk, and keep the whole team in the loop.</p>
          </div>
          <BentoFeatures />
        </section>
        <section id="github" className={styles.sectionBand}>
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <div className={styles.sectionEyebrow}>GitHub integration</div>
                <h2 className={styles.sectionHeading}>Connected to the review flow your developers already use</h2>
                <p className="mt-4 text-muted-foreground">Kodeistry plugs into GitHub App installation patterns and uses repository context, PR metadata, and review history to prioritize issues based on real code changes.</p>
              </div>
              <div data-bug-card className={styles.integrationPanel}>
                <div className="w-full">
                  <MacWindow title="GitHub App">
                    <div className="space-y-3">
                      <div className={styles.integrationRow}><span>Installation</span><span className={styles.integrationValue}>Connected</span></div>
                      <div className={styles.integrationRow}><span>Pull request</span><span className={styles.integrationValue}>Review queued</span></div>
                      <div className={styles.integrationRow}><span>Feedback</span><span className={styles.integrationValue}>Ready in GitHub</span></div>
                    </div>
                  </MacWindow>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-2xl">
            <div className={styles.sectionEyebrow}>Security & quality</div>
            <h2 className={styles.sectionHeading}>Prioritize risk and reduce review debt</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              ["Critical issues", "Focus on exploitable defects and unsafe patterns before merge."],
              ["Code quality", "Highlight maintainability and logic problems with clear suggestions."],
              ["Review history", "Track how findings evolve across PRs and repositories over time."],
            ].map(([title, description]) => (
              <div key={title} data-bug-card className={styles.voxelCard}>
                <h3 className={styles.cardTitle}>{title}</h3>
                <p className={styles.cardBody}>{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-2xl">
            <div className={styles.sectionEyebrow}>Workflow</div>
            <h2 className={styles.sectionHeading}>How Kodeistry works</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step} data-bug-card className={styles.voxelCard}>
                <div className={styles.stepNumber}>{index + 1}</div>
                <p className="text-sm text-muted-foreground">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.bottomBand}>
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-16 text-center sm:px-6 lg:flex-row lg:text-left lg:px-8">
            <div>
              <div className={styles.sectionEyebrow}>Ready to review smarter?</div>
              <h2 className={styles.sectionHeading}>Ship safer code with AI-assisted PR review</h2>
            </div>
            <Link href="/register" className={styles.primaryCta}>Get Started <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </section>
      </main>

      <footer className={"mx-auto max-w-7xl px-4 py-8 text-sm sm:px-6 lg:px-8 " + styles.siteFooter}>
        <div className="flex flex-col justify-between gap-4 border-t pt-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <BrandLogo compact href="/" ariaLabel="Kodeistry home" />
            <span aria-hidden="true" className="text-muted-foreground/40">·</span>
            <span>© 2026</span>
          </div>
          <div className={"flex flex-wrap items-center gap-x-6 gap-y-3 " + styles.footerLinks}>
            <a href="#product" className="hover:text-foreground">Product</a>
            <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms &amp; Conditions</Link>
            <a href="mailto:mohammadmustufa72@gmail.com" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <Mail className="size-4" aria-hidden="true" />
              Email
            </a>
            <a href="https://www.linkedin.com/in/mohdmustufa" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <svg className="size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146zM4.943 13.394V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.521-1.248-1.342-1.248S2.4 3.225 2.4 3.934c0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.174-.432.57-.879 1.236-.879.872 0 1.22.663 1.22 1.634v3.866h2.4V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.192V6.169h-2.4c.03.678 0 7.225 0 7.225h2.393z" />
              </svg>
              LinkedIn
            </a>
            <a href="https://github.com/Mustufaa" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <svg className="size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 4.85c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </footer>
      <RoboticBugLoader />
    </div>
  );
}

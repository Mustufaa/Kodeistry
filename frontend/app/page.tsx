import Link from "next/link";
import { Pixelify_Sans } from "next/font/google";
import { ArrowRight, Sparkles } from "lucide-react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { BentoFeatures } from "@/components/landing/bento-features";
import { CodeReviewAnimation } from "@/components/landing/code-review-animation";
import { RoboticBugLoader } from "@/components/landing/robotic-bug-loader";
import { MacWindow } from "@/components/landing/mac-window";
import styles from "./landing-page.module.css";
import { SiteHeader } from "@/components/marketing/site-header";

const pixelify = Pixelify_Sans({ variable: "--font-voxel", subsets: ["latin"], display: "swap", fallback: ["ui-monospace", "monospace"] });

const steps = [
  "Connect your GitHub App installation and repository.",
  "Open or update a pull request to trigger automated review orchestration.",
  "Review prioritized findings with remediation guidance and code context.",
];

export default function Page() {
  return (
    <div data-landing-page className={pixelify.variable + " " + styles.landing}>
      <SiteHeader />

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

        <section id="how-it-works" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
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

      </main>

      <SiteFooter animationControl={<RoboticBugLoader />} />
    </div>
  );
}

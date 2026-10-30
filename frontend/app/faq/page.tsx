import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";

import { SiteHeader } from "@/components/marketing/site-header";
import styles from "../landing-page.module.css";

export const metadata: Metadata = {
  title: "Frequently Asked Questions | Kodeistry",
  description: "Answers about Kodeistry accounts, GitHub integration, AI code reviews, and reviewing findings.",
};

const questions = [
  {
    question: "What is Kodeistry?",
    answer: "Kodeistry helps teams review GitHub pull requests with AI. It analyzes code changes for bugs, security issues, and code-quality problems, then presents findings with context and suggested fixes.",
  },
  {
    question: "How do I get started?",
    answer: "Create an account with GitHub or your email address. If you register with email, verify your address, then follow onboarding to connect GitHub and select a repository.",
  },
  {
    question: "Do I need a GitHub account?",
    answer: "You can register and sign in with an email address and password. To review GitHub pull requests, you also need to connect a GitHub account and install the Kodeistry GitHub App for the repositories you want to review.",
  },
  {
    question: "Can I connect a private repository?",
    answer: "Yes. Give the Kodeistry GitHub App access to the repository during installation. For organization repositories, an organization owner may need to approve the installation or repository access.",
  },
  {
    question: "When does a code review run?",
    answer: "Opening or updating a pull request in a connected repository triggers the review workflow. You can track reviews and inspect their findings in the Kodeistry dashboard.",
  },
  {
    question: "Does AI review replace a human reviewer?",
    answer: "No. AI findings are suggestions to help your team review changes. Check each finding against your code, requirements, and tests before applying a fix or merging a pull request.",
  },
  {
    question: "What if I cannot sign in?",
    answer: <>For email accounts, use <Link href="/forgot-password" className="text-foreground underline underline-offset-4">Forgot password</Link> to reset your password. If your email is not verified, follow the verification link after signing in. If you registered with GitHub, choose Continue with GitHub.</>,
  },
];

export default function FaqPage() {
  return (
    <div className={"min-h-screen " + styles.landing}>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to home
        </Link>
        <p className="mt-8 text-sm font-medium uppercase tracking-widest text-primary">Help & answers</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Frequently asked questions</h1>
        <p className="mt-4 text-muted-foreground">Getting started with Kodeistry, connecting GitHub, and making sense of your reviews.</p>
        <div className="mt-8 divide-y overflow-hidden rounded-xl border bg-card">
          {questions.map(({ question, answer }) => (
            <details key={question} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-medium [&::-webkit-details-marker]:hidden">
                {question}
                <Plus aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-45" />
              </summary>
              <div className="px-5 pb-5 text-sm leading-7 text-muted-foreground">{answer}</div>
            </details>
          ))}
        </div>
        <section className="mt-8 rounded-xl border bg-card p-6">
          <h2 className="text-xl font-semibold">Ready for your first review?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Connect your repository and bring your pull requests into one workspace.</p>
          <Link href="/register" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            Get Started <ArrowRight className="size-4" />
          </Link>
        </section>
        <footer className="mt-8 flex flex-wrap gap-x-6 gap-y-3 pb-16 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms & Conditions</Link>
          <a href="mailto:mohammadmustufa72@gmail.com" className="hover:text-foreground">Contact support</a>
        </footer>
      </main>
    </div>
  );
}

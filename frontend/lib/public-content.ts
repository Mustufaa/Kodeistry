export type PublicGuide = {
  path: string;
  title: string;
  description: string;
  summary: string;
  sections: { id: string; title: string; paragraphs: string[]; steps?: string[] }[];
  related: string[];
  sources?: { label: string; href: string }[];
};

// Public product facts only. Keep these aligned with the implemented flows;
// never populate this catalog from account, repository, or review API data.
export const guides: PublicGuide[] = [
  {
    path: "/features/ai-code-review",
    title: "AI Code Review for GitHub Pull Requests",
    description: "See how Kodeistry analyzes changed lines, organizes AI findings by severity, and delivers actionable pull request review feedback in GitHub.",
    summary: "Kodeistry is an AI code review tool for GitHub pull requests. It analyzes added lines from pull request diffs and produces findings about potential bugs, security risks, performance, and code quality.",
    sections: [
      { id: "analysis", title: "What the AI pull request reviewer analyzes", paragraphs: [
        "After a supported pull request event, Kodeistry fetches the changed-file patches from GitHub. It extracts added lines with their filenames and new line numbers and sends that input to the configured AI review service.",
        "This is change-focused analysis. Deleted lines, unchanged surrounding code, binary files, and files without an available patch are not analyzed in the same way. A review should not be treated as an audit of the entire repository."
      ] },
      { id: "findings", title: "From automated PR review to actionable findings", paragraphs: [
        "Findings include a file, line number, severity, category, and explanation. Depending on the result, they can also include a suggestion, why the issue matters, a recommended approach, and verification steps.",
        "The supported categories are security, bug, performance, quality, style, and testing. Severity ranges from informational to critical. These labels help developers prioritize inspection; they are model judgments, not proof of exploitability."
      ] },
      { id: "workflow", title: "Review feedback in GitHub and Kodeistry", paragraphs: [
        "Successful processing can publish inline GitHub review comments. Kodeistry stores review runs and findings for authorized users in the dashboard. If the pull request head changes during processing, the backend avoids posting feedback against the stale commit.",
        "Developers can inspect findings, use supported fix suggestions and copyable prompts, and review repository history and analytics. Suggestions do not automatically change or merge code."
      ] },
      { id: "limits", title: "AI bug detection still needs human review", paragraphs: [
        "AI can miss defects or suggest changes that are unsuitable for the codebase. Check the cited lines, surrounding implementation, and tests before accepting a finding. Business requirements and architectural tradeoffs remain part of manual review.",
        "Reviews depend on GitHub access, available patches, backend processing, and the configured AI provider. No completion time or complete vulnerability coverage is guaranteed."
      ] },
    ],
    related: ["/how-it-works", "/features/security-analysis", "/faq"],
  },
  {
    path: "/features/github-integration",
    title: "GitHub App Integration for Automated Code Review",
    description: "Connect the Kodeistry GitHub App, choose repository access, and understand how GitHub sign-in, installation, and pull request reviews work.",
    summary: "Kodeistry connects through a GitHub App. GitHub sign-in identifies you; installing the app separately grants access to the repositories you authorize.",
    sections: [
      { id: "install", title: "How to install the Kodeistry GitHub App", paragraphs: [
        "Begin in Kodeistry so the installation can be associated with your signed-in account and workspace. GitHub controls which account or organization can install the app and which repositories it can access."
      ], steps: [
        "Create a Kodeistry account or sign in, using GitHub sign-in when prompted.",
        "Follow GitHub onboarding, or open Settings → Integrations → GitHub after signing in.",
        "Start the app installation and choose All repositories or Only select repositories in GitHub.",
        "Return to Kodeistry, allow repository synchronization to finish, and check the Repositories page."
      ] },
      { id: "permissions", title: "Repository permissions and private repositories", paragraphs: [
        "The documented app setup uses read access to repository metadata and contents, plus read and write access to pull requests for review comments. Read access to email addresses supports verified identity during GitHub sign-in.",
        "Private repositories are supported when the installation grants access and the signed-in user has the required Kodeistry repository permissions. Organization approval or restrictions may affect installation. Repository access is not made public by installing the app.",
        "GitHub lets an installation cover all repositories or selected repositories. Review that choice in GitHub before granting access."
      ] },
      { id: "events", title: "Events that trigger automated GitHub code review", paragraphs: [
        "The backend handles pull_request events with opened, synchronize, and reopened actions. Synchronize is the event GitHub sends when a pull request's head branch receives new commits.",
        "Webhook signatures are checked before processing. The backend resolves the connected repository for the installation before reviewing it. GitHub installation changes can synchronize or deactivate connected repositories."
      ] },
      { id: "troubleshooting", title: "If a repository or review is missing", paragraphs: [
        "Check GitHub sign-in, the app installation, selected repository access, and any organization approval requirements. Then synchronize repositories from GitHub settings in Kodeistry.",
        "For a missing review, confirm that the repository is connected and a supported pull request event occurred. Inspect the Reviews page for the run status. A failed run can require the service operator to inspect backend or provider errors."
      ] },
    ],
    related: ["/docs", "/how-it-works", "/faq"],
    sources: [{ label: "GitHub: Installing a GitHub App", href: "https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party" }],
  },
  {
    path: "/features/security-analysis",
    title: "GitHub Code Security Analysis and Findings",
    description: "Understand Kodeistry's AI security findings, severity labels, developer verification workflow, and the limits of pull request security analysis.",
    summary: "Kodeistry can flag potential security problems in changed GitHub code, alongside bug and code quality findings. Developers must verify each result before treating it as a confirmed vulnerability.",
    sections: [
      { id: "scope", title: "Security analysis of changed code", paragraphs: [
        "The AI review prompt requests potential security vulnerabilities and dangerous patterns, alongside bugs and code quality issues in the supplied changed lines. Findings may include explanations and suggested remediation.",
        "The review pipeline works from added lines in available pull request patches. It does not provide complete repository context, a penetration test, or a guarantee that code is secure."
      ] },
      { id: "triage", title: "How to assess an AI security finding", paragraphs: [
        "Use the severity and category to prioritize your review. Then inspect the file and line in the pull request, trace relevant inputs and permissions, and decide whether the reported behavior is reachable."
      ], steps: [
        "Read the explanation and any suggested approach or verification steps.",
        "Check surrounding code, authorization boundaries, and the current pull request commit.",
        "Reproduce the concern safely in your own development or test environment.",
        "Review the proposed fix, add appropriate tests, and confirm the resulting behavior."
      ] },
      { id: "privacy", title: "Repository content and AI processing", paragraphs: [
        "Review input includes filenames and changed code sent to configured AI service providers. Review results are stored for authorized users and may be posted to the associated GitHub pull request.",
        "Confirm that this processing fits your organization's source-code policies before connecting repositories. The Privacy Policy describes the service's handling of account, repository, and review information."
      ] },
      { id: "availability", title: "Current security feature availability", paragraphs: [
        "Security findings are part of the AI pull request review flow. The separate on-demand Secret Scanner is marked Coming Soon in the current dashboard and is not presented here as an available scanning feature.",
        "Kodeistry is not a replacement for dependency scanning, dedicated security testing, human review, or your organization's release controls. A review with no findings is not a security certification."
      ] },
    ],
    related: ["/features/ai-code-review", "/privacy", "/faq"],
  },
  {
    path: "/how-it-works",
    title: "How Automated GitHub Pull Request Review Works",
    description: "Follow a Kodeistry review from GitHub App installation through pull request events, AI analysis, inline feedback, and developer verification.",
    summary: "Kodeistry automates the first pass of GitHub pull request review: connect an authorized repository, open or update a pull request, and inspect the AI-generated findings.",
    sections: [
      { id: "connect", title: "1. Connect GitHub and choose repositories", paragraphs: [
        "Sign in to Kodeistry and complete GitHub onboarding. A personal workspace is created automatically. The GitHub App installation gives access to the repositories selected in GitHub; OAuth sign-in alone does not grant installation access."
      ] },
      { id: "trigger", title: "2. Open, update, or reopen a pull request", paragraphs: [
        "GitHub delivers the supported pull request event to the backend. Kodeistry verifies the webhook signature, identifies the connected repository, and records a review run for the pull request's head commit.",
        "The backend checks for an already running or completed review of that repository, pull request, and commit to avoid processing the same commit again."
      ] },
      { id: "analyze", title: "3. Analyze the changed lines", paragraphs: [
        "Kodeistry fetches the changed-file patches and extracts added lines with filenames and line numbers. The configured AI service returns structured findings, which are validated against the review response format.",
        "Missing patches, provider failures, or GitHub API errors can limit or prevent processing. A review result does not imply that every file or execution path was inspected."
      ] },
      { id: "review", title: "4. Read feedback and decide what to change", paragraphs: [
        "Successful reviews can publish inline comments on GitHub when the pull request head still matches the reviewed commit. Authorized users can view review runs and findings in Kodeistry, along with history, analytics, and CSV reports.",
        "Inspect the evidence, verify suggestions, and use supported fix prompts as a starting point. Developers remain responsible for code changes, tests, approvals, and merging."
      ] },
      { id: "manual-review", title: "How this complements manual code review", paragraphs: [
        "Automated review provides an additional pass over changed code and organizes possible issues for inspection. Human reviewers supply project knowledge, assess requirements, and decide whether a finding matters.",
        "When evaluating a CodeRabbit alternative or another automated PR review tool, test it on representative changes and compare the findings, permissions, and workflow your team needs. This guide makes no unverified feature or performance claims about competing products."
      ] },
    ],
    related: ["/features/github-integration", "/features/ai-code-review", "/docs"],
  },
  {
    path: "/docs",
    title: "Kodeistry Documentation and Getting Started",
    description: "Set up Kodeistry, connect GitHub repositories, find pull request review results, and troubleshoot access or review problems with public documentation.",
    summary: "Use these public docs to set up Kodeistry and understand its automated GitHub code review workflow. Account-specific repositories, findings, and analytics require sign-in and authorization.",
    sections: [
      { id: "getting-started", title: "Get started with your first review", paragraphs: [
        "Create an account and complete email verification, or use GitHub sign-in. Follow onboarding to authorize your GitHub identity and install the GitHub App. Your personal workspace is created automatically."
      ], steps: [
        "Choose which repositories the GitHub App may access.",
        "Return to Kodeistry and wait for repository synchronization.",
        "Open, update, or reopen a pull request in a connected repository.",
        "Inspect the Reviews page and the GitHub pull request for results."
      ] },
      { id: "results", title: "Where to find results", paragraphs: [
        "Repositories lists connected repositories available to you. Reviews lists review runs, and each review detail page shows findings associated with that run. Findings provides a view of issues across permitted repositories.",
        "Analytics summarizes review activity; Analytics → Reports supports CSV downloads. Supported finding workflows offer suggestions and copyable fix prompts. Review and test these suggestions before changing code."
      ] },
      { id: "access", title: "Manage access and installation", paragraphs: [
        "Use Settings → Integrations → GitHub to install or manage the app and synchronize repositories. Repository visibility depends on the GitHub installation and Kodeistry authorization.",
        "If a repository disappears, confirm installation access in GitHub and synchronize again. Organization policies and Kodeistry repository assignments can also affect what a user can see."
      ] },
      { id: "limitations", title: "Availability and limitations", paragraphs: [
        "The current review pipeline sends added lines from available GitHub patches to configured AI services. It is not a full-repository security audit. AI responses can contain errors, and external service failures can prevent completion.",
        "The standalone Secret Scanner remains Coming Soon in the dashboard. Kody provides general product guidance; it cannot inspect an account, view private repositories, or perform actions for a visitor.",
        "Public documentation does not expose installation identifiers, repository findings, account details, or credentials. See the Privacy Policy before sending repository content for processing."
      ] },
      { id: "help", title: "Troubleshoot a missing review", paragraphs: [
        "Confirm that the app can access the repository, repository synchronization completed, and a supported pull request event occurred. Check the Reviews page for processing status and inspect the associated GitHub pull request.",
        "If the problem persists, contact the service operator with a general description and review timing. Do not send API tokens, credentials, or private source code in a public support message."
      ] },
    ],
    related: ["/features/github-integration", "/features/ai-code-review", "/features/security-analysis", "/how-it-works", "/faq", "/privacy"],
  },
];

export const faqs = [
  { question: "What is Kodeistry?", answer: "Kodeistry is an AI-powered GitHub code review platform. It analyzes added lines from pull request diffs and presents potential bugs, security risks, performance issues, and code quality findings for developers to inspect." },
  { question: "How does Kodeistry review GitHub pull requests?", answer: "A supported GitHub pull request webhook starts the review pipeline for a connected repository. Kodeistry fetches changed-file patches, extracts added lines, sends them to the configured AI service, and stores structured findings. Successful processing can publish inline GitHub comments." },
  { question: "How do I install the Kodeistry GitHub App?", answer: "Sign in to Kodeistry and follow GitHub onboarding, or open Settings → Integrations → GitHub. Start installation, choose repository access in GitHub, and return to Kodeistry to synchronize repositories. GitHub sign-in and app installation are separate steps." },
  { question: "Can Kodeistry detect security vulnerabilities?", answer: "Kodeistry can flag potential security issues in supplied changed code, but findings need developer verification. AI can miss vulnerabilities or produce false positives. It does not replace a security audit or dedicated security testing." },
  { question: "How does automated pull request review work?", answer: "Once a repository is connected, opening, updating, or reopening a pull request can trigger review without a separate manual review request. The backend processes opened, synchronize, and reopened events. Completion depends on GitHub access, available patches, and the configured AI service." },
  { question: "Does Kodeistry support private repositories?", answer: "Yes, when the GitHub App installation grants access and the signed-in user has the required Kodeistry repository permissions. GitHub organization policies may require approval. Relevant code is sent to configured AI providers for review, so check your organization's source-code policy first." },
  { question: "How can developers review AI-generated findings?", answer: "Read inline feedback on the GitHub pull request or open the review and findings pages after signing in to Kodeistry. Inspect the cited code, severity, explanation, and any suggested approach or verification steps. Test changes before accepting a suggestion." },
  { question: "What makes Kodeistry different from manual code review?", answer: "Kodeistry provides an automated pass over changed lines and organizes potential issues. Manual reviewers contribute project context, architectural judgment, and knowledge of requirements. The two approaches complement each other; AI output does not replace human approval." },
  { question: "How can I automate code reviews in GitHub?", answer: "Connect a review tool such as Kodeistry through its GitHub App, authorize repository access, and complete repository synchronization. Supported pull request events can then trigger reviews automatically. Confirm the resulting feedback on a representative pull request before relying on the workflow." },
  { question: "Does Kodeistry automatically fix or merge my code?", answer: "No. Supported finding workflows provide suggestions and copyable fix prompts for developers to review. Developers remain responsible for making code changes, running tests, approving pull requests, and merging." },
  { question: "Is the standalone Secret Scanner available?", answer: "The separate Secret Scanner page is currently marked Coming Soon in the dashboard. Security findings within AI pull request reviews are a separate feature and do not imply that on-demand secret scanning is available." },
  { question: "Can Kody see my repositories or account?", answer: "No. Kody provides general guidance about Kodeistry and GitHub setup. It cannot inspect your account, access your private repositories, or take actions on your behalf." },
];

export const faqPage = {
  path: "/faq", title: "Kodeistry FAQ: GitHub AI Code Review",
  description: "Answers about Kodeistry setup, private repositories, automated pull request reviews, security findings, AI limitations, and developer review workflows.",
};
export const publicPages = [
  { path: "/", title: "Home" },
  ...guides.map(({ path, title }) => ({ path, title })),
  { path: "/faq", title: "FAQ" },
  { path: "/privacy", title: "Privacy Policy" },
  { path: "/terms", title: "Terms & Conditions" },
];

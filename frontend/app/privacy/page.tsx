import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | Kodeistry",
  description: "Learn how Kodeistry collects, uses, and protects your information.",
};

const sections = [
  {
    id: "information-we-collect",
    title: "Information we collect",
    content: (
      <>
        <p>We collect information needed to provide and secure Kodeistry, including:</p>
        <ul>
          <li><strong>Account information:</strong> your name, verified email address, GitHub username, avatar, and authentication identifiers.</li>
          <li><strong>Workspace and repository information:</strong> organization details, repository names and metadata, pull request metadata, changed files, and code diffs you authorize Kodeistry to access.</li>
          <li><strong>Review information:</strong> review runs, findings, suggested fixes, status changes, and related activity.</li>
          <li><strong>Technical information:</strong> session data, security tokens, IP address, browser information, logs, and diagnostic events.</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    title: "How we use information",
    content: (
      <>
        <p>We use information to authenticate users, connect authorized repositories, analyze pull requests, generate and deliver review findings, operate dashboards and analytics, troubleshoot failures, prevent abuse, and improve the Service.</p>
        <p>We do not sell your personal information or repository content.</p>
      </>
    ),
  },
  {
    id: "code-and-ai-processing",
    title: "Code and AI processing",
    content: (
      <p>To generate code-review results, relevant pull request content may be processed by configured AI service providers. We limit the content sent to what is reasonably necessary for the review. Your use of Kodeistry should comply with your organization&apos;s policies concerning source code and third-party processing.</p>
    ),
  },
  {
    id: "sharing",
    title: "How information is shared",
    content: (
      <>
        <p>We may share information with service providers that help operate Kodeistry, such as hosting, database, authentication, monitoring, GitHub, and AI-processing providers. They receive information only as needed to perform services for us.</p>
        <p>We may also disclose information when required by law, to protect users or the Service, or as part of a business transfer. Review results may be posted back to GitHub when enabled.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and sessions",
    content: (
      <p>Kodeistry uses essential cookies and similar storage to maintain authenticated sessions, protect requests against cross-site attacks, remember appearance preferences, and keep the Service functioning. We do not use these essential technologies for third-party advertising.</p>
    ),
  },
  {
    id: "retention-security",
    title: "Retention and security",
    content: (
      <>
        <p>We retain information for as long as needed to provide the Service, meet legal obligations, resolve disputes, and maintain security. Retention may vary by data type and workspace configuration.</p>
        <p>We use reasonable administrative, technical, and organizational safeguards. No online service can guarantee absolute security, so workspace owners should grant only the repository access required.</p>
      </>
    ),
  },
  {
    id: "choices",
    title: "Your choices and rights",
    content: (
      <p>You may update available profile settings, disconnect a GitHub installation, restrict repository access through GitHub, or request access, correction, export, or deletion of personal information. Some information may be retained where legally required or necessary for security.</p>
    ),
  },
  {
    id: "changes-contact",
    title: "Changes and contact",
    content: (
      <p>We may update this policy as Kodeistry evolves. We will post the revised version here and update the date above. Questions or privacy requests can be submitted through the support channel provided within the Service.</p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="This policy explains what information Kodeistry processes, why we use it, and the choices available to you when using our AI-assisted code-review service."
      lastUpdated="October 4, 2026"
      sections={sections}
    />
  );
}

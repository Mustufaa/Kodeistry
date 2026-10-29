import { publicMetadata } from "@/lib/seo";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata = publicMetadata("/terms", "Terms & Conditions", "Terms and conditions governing use of the Kodeistry service.");

const sections = [
  {
    id: "acceptance",
    title: "Acceptance of these terms",
    content: (
      <p>By accessing or using Kodeistry, you agree to these Terms &amp; Conditions and our <Link href="/privacy">Privacy Policy</Link>. If you use the Service for an organization, you confirm that you have authority to accept these terms on its behalf.</p>
    ),
  },
  {
    id: "service",
    title: "The Service",
    content: (
      <p>Kodeistry connects to authorized GitHub repositories and uses automated systems to analyze pull requests, identify potential issues, and provide suggested improvements, review history, and analytics. Features may change as the Service develops.</p>
    ),
  },
  {
    id: "accounts-access",
    title: "Accounts and repository access",
    content: (
      <>
        <p>You are responsible for your account, the activity performed through it, and keeping access credentials secure. You must provide accurate information and promptly report suspected unauthorized access.</p>
        <p>You may connect only repositories and GitHub installations you are authorized to access. Workspace owners are responsible for membership, repository selection, and permissions granted to Kodeistry.</p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>You may not use Kodeistry to:</p>
        <ul>
          <li>violate applicable law or another person&apos;s rights;</li>
          <li>access source code, accounts, or systems without authorization;</li>
          <li>introduce malware, disrupt the Service, or bypass security controls;</li>
          <li>probe or reverse engineer the Service except where law expressly permits it; or</li>
          <li>resell or misuse the Service in a way that harms Kodeistry or other users.</li>
        </ul>
      </>
    ),
  },
  {
    id: "customer-content",
    title: "Your content",
    content: (
      <p>You retain ownership of your source code and other content. You grant Kodeistry a limited right to access, process, transmit, and display that content solely to operate, secure, and improve the Service. You represent that you have the rights needed to provide the content and authorize this processing.</p>
    ),
  },
  {
    id: "ai-results",
    title: "AI-generated results",
    content: (
      <p>Automated findings and suggested fixes may be incomplete, inaccurate, or unsuitable for your codebase. They are decision-support tools, not a substitute for human review, testing, security assessment, or professional advice. You are responsible for evaluating and testing changes before merging or deploying them.</p>
    ),
  },
  {
    id: "availability",
    title: "Availability and third-party services",
    content: (
      <p>The Service may depend on GitHub, AI providers, hosting platforms, and other third parties. We do not control their availability or terms. We may modify, suspend, or discontinue features and may limit access when reasonably necessary for maintenance, security, legal compliance, or abuse prevention.</p>
    ),
  },
  {
    id: "disclaimers-liability",
    title: "Disclaimers and liability",
    content: (
      <p>To the maximum extent permitted by law, Kodeistry is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of uninterrupted operation, error-free results, or fitness for a particular purpose. Kodeistry is not responsible for decisions made solely from automated review results or for indirect, incidental, special, consequential, or punitive damages.</p>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    content: (
      <p>You may stop using the Service and disconnect GitHub at any time. We may suspend or terminate access if you materially breach these terms, create security or legal risk, or misuse the Service. Provisions that by their nature should survive termination will remain in effect.</p>
    ),
  },
  {
    id: "changes-contact",
    title: "Changes and contact",
    content: (
      <p>We may revise these terms from time to time. The updated version becomes effective when posted, unless otherwise stated. Continued use after an update means you accept the revised terms. Questions can be submitted through the support channel provided within the Service.</p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      description="These terms govern your access to and use of Kodeistry, including its GitHub integration and AI-assisted code-review features."
      lastUpdated="October 4, 2026"
      sections={sections}
    />
  );
}

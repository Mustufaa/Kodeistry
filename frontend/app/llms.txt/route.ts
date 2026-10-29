import { publicPages } from "@/lib/public-content";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";
export function GET() {
  const text = [
    "# Kodeistry",
    "",
    "> Kodeistry is an AI-powered GitHub pull request review platform.",
    "",
    "## Product facts",
    "- The GitHub App grants repository access; GitHub sign-in identifies the user.",
    "- Connected repositories can be reviewed on pull request opened, synchronize, and reopened events.",
    "- The review pipeline analyzes added lines from available GitHub patches.",
    "- Findings may cover security, bugs, performance, quality, style, and testing.",
    "- Successful processing can publish inline GitHub comments; authorized users can inspect review history, findings, analytics, and CSV reports.",
    "- Suggestions and copyable fix prompts require developer review; Kodeistry does not automatically change or merge code.",
    "- Private repositories require installation access and Kodeistry authorization. Relevant changed code is processed by configured AI providers.",
    "- AI can miss issues or produce false positives. This is not a complete repository security audit.",
    "- The standalone Secret Scanner is Coming Soon in the current dashboard.",
    "- Kody provides general guidance and cannot inspect accounts or act on a visitor's behalf.",
    "",
    "## Public documentation",
    ...publicPages.map(({ path, title }) => "- [" + title + "](" + absoluteUrl(path) + ")"),
    "",
    "## Scope",
    "This file contains public product information only. It does not grant access to private data or guarantee AI indexing, citations, or recommendations.",
    "",
  ].join("\n");
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

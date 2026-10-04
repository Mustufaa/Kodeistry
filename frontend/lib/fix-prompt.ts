import type { AnalyticsFinding } from "@/types/analytics";

export function historicalWhy(finding: Pick<AnalyticsFinding, "category">) {
  const values: Record<string, string> = {
    security: "If reachable, this can weaken a security boundary or expose data. Confirm the exact trust boundary and exploit path before changing code.",
    bug: "This can produce incorrect behavior for the affected input or execution path.",
    performance: "This may increase latency or resource usage on the affected path. Measure the current behavior before optimizing.",
    testing: "Missing coverage can allow this behavior to regress without detection.",
    quality: "This makes the implementation harder to change safely and can hide future defects.",
    style: "This conflicts with the project convention and may reduce readability or tooling consistency.",
  };
  return values[finding.category] ?? "Confirm the affected behavior and impact in the surrounding implementation.";
}

export function historicalApproach(finding: Pick<AnalyticsFinding, "filename" | "line" | "suggestion">) {
  return finding.suggestion
    ? "Validate the proposed change against the surrounding implementation and its callers, then apply the smallest compatible correction."
    : `Inspect the data flow and callers around ${finding.filename}:${finding.line}, reproduce the behavior, and make the smallest change that corrects it.`;
}

export function verificationFor(finding: Pick<AnalyticsFinding, "category">) {
  const checks: Record<string, string> = {
    security: "Add a regression test for the unsafe input or permission boundary, run the relevant security checks, and re-run the Kodeistry review.",
    bug: "Reproduce the failing case, add a regression test plus a nearby edge case, run the relevant test suite, and re-run the Kodeistry review.",
    performance: "Run a focused benchmark or profile before and after the change, verify output is unchanged, and re-run the Kodeistry review.",
    testing: "Run the new test in isolation and with the related suite, then re-run the Kodeistry review.",
    quality: "Run the related tests, type-checking and linting, then re-run the Kodeistry review.",
    style: "Run the repository formatter and linter, then re-run the Kodeistry review.",
  };
  return checks[finding.category] ?? "Run the relevant tests and static checks, verify the affected behavior, and re-run the Kodeistry review.";
}

export function buildFixPrompt(finding: AnalyticsFinding) {
  const why = finding.why_it_matters || historicalWhy(finding);
  const approach = finding.recommended_approach || historicalApproach(finding);
  return `You are fixing an issue identified by Kodeistry.

Repository:
${finding.repository_name}

Pull Request:
#${finding.pull_request_number}

File:
${finding.filename}

Line:
${finding.line}

Severity:
${finding.severity}

Category:
${finding.category}

Issue:
${finding.message}

Why this matters:
${why}

Recommended approach:
${approach}

Suggested change:
${finding.suggestion || "No exact patch was provided. Derive the smallest safe change from the surrounding implementation."}

Your task:

1. Inspect the surrounding implementation before making changes.
2. Confirm the finding is valid.
3. Identify related callers/dependencies that may be affected.
4. Implement the smallest safe fix.
5. Preserve existing behavior outside the affected area.
6. Add or update tests for the bug.
7. Handle relevant edge cases.
8. Do not change unrelated code.
9. Run relevant tests/type-checking/linting.
10. Explain what you changed and why.

Important:

Do not blindly apply the suggested change.

First inspect the repository and verify that the proposed fix is compatible with the existing architecture.`;
}

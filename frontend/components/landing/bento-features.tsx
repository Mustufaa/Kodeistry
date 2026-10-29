import {
  BarChart3,
  Code2,
  GitPullRequest,
  History,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { MacWindow } from "./mac-window";
import styles from "./bento-features.module.css";

function FeatureCard({
  icon: Icon,
  title,
  description,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <article data-bug-card className={`${styles.card} ${className}`}>
      <div className={styles.cardTop}>
        <span className={styles.icon}><Icon size={18} aria-hidden="true" /></span>
        <span className={styles.available}>Available</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className={styles.preview}>{children}</div>
    </article>
  );
}

export function BentoFeatures() {
  return (
    <>
      <div className={styles.frame}>
        <div className={styles.grid}>
          <FeatureCard icon={Code2} title="AI pull request reviews" description="Analyze changed code and surface actionable context before merge." className={styles.wide}>
            <MacWindow title="pull-request.ts">
              <div className={styles.fileMeta}><span>src/auth/session.ts</span><span>+18 −4</span></div>
              <pre><code>{`38  export async function loadSession(token: string) {
39    const session = await lookup(token);
40    if (!session) throw new Error("Unauthorized");
41    return session.user;
42  }`}</code></pre>
              <div className={styles.reviewNote}><Sparkles size={13} aria-hidden="true" /> Review checks added lines from the pull request diff.</div>
            </MacWindow>
          </FeatureCard>

          <FeatureCard icon={ShieldCheck} title="Security and bug findings" description="Prioritized findings identify risky patterns, logic gaps, and regressions." className={styles.narrow}>
            <MacWindow title="AI Review">
              <div className={styles.finding}><span className={styles.high}>High</span><span>Missing authorization check</span></div>
              <div className={styles.finding}><span className={styles.medium}>Medium</span><span>Null state may skip retry</span></div>
              <div className={styles.finding}><span className={styles.low}>Low</span><span>Repeated lookup in loop</span></div>
            </MacWindow>
          </FeatureCard>

          <FeatureCard icon={GitPullRequest} title="Inline GitHub feedback" description="Review comments point developers to the affected lines in their pull request." className={styles.narrow}>
            <MacWindow title="GitHub review">
              <div className={styles.commentPath}>src/api/permissions.ts · line 42</div>
              <div className={styles.comment}>
                <span className={styles.high}>High</span>
                <p>Verify repository access before returning this result to the caller.</p>
              </div>
              <div className={styles.commentFoot}>Kodeistry review comment</div>
            </MacWindow>
          </FeatureCard>

          <FeatureCard icon={History} title="Review history" description="Trace completed reviews and findings across pull requests and repositories." className={styles.wide}>
            <MacWindow title="Review History">
              <div className={styles.historyRow}><span>PR #42 · tighten session checks</span><span className={styles.done}>Complete</span></div>
              <div className={styles.historyRow}><span>PR #38 · retry failed jobs</span><span className={styles.done}>Complete</span></div>
              <div className={styles.historyRow}><span>PR #35 · update API routes</span><span className={styles.done}>Complete</span></div>
            </MacWindow>
          </FeatureCard>

          <FeatureCard icon={BarChart3} title="Analytics and CSV reports" description="Explore review trends, then export findings and reports for your team." className={styles.half}>
            <MacWindow title="analytics.csv">
              <div className={styles.bars} aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
              <pre><code>{`category,findings
security,[count]
bug,[count]
quality,[count]`}</code></pre>
            </MacWindow>
          </FeatureCard>

          <FeatureCard icon={Sparkles} title="Fix suggestions and prompts" description="Review suggested fixes and copy a source-aware prompt to continue the work." className={styles.half}>
            <MacWindow title="Fix suggestion">
              <div className={styles.suggestion}><span className={styles.suggestionLabel}>Suggested fix</span><p>Guard the permission boundary before the repository query.</p></div>
              <pre><code>{`if (!canReadRepo(user, repo)) {
  throw new ForbiddenError();
}`}</code></pre>
              <div className={styles.commentFoot}>Copyable fix prompt in the dashboard</div>
            </MacWindow>
          </FeatureCard>
        </div>
      </div>
    </>
  );
}
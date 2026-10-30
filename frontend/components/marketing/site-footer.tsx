import Link from "next/link";
import { Mail } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { GitHubMark } from "@/components/icons/github-mark";
import styles from "./site-footer.module.css";

export const projectUrl = "https://github.com/Mustufaa/Kodeistry";
const email = "mailto:mohammadmustufa72@gmail.com";
const groups = [
  { title: "Platform", links: [["Features", "#features"], ["How It Works", "#how-it-works"], ["Security", "#security"]] },
  { title: "Resources", links: [["GitHub App", "#github"], ["FAQ", "/faq"], ["Support", email]] },
  { title: "Legal", links: [["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["Contact", email]] },
];

export function SiteFooter() {
  return (
    <footer className={"dark " + styles.footer} aria-label="Kodeistry footer">
      <div className={styles.inner}>
        <div className={styles.grid}>
          <div className={styles.brand}>
            <BrandLogo href="/" ariaLabel="Kodeistry home" className={styles.logo} />
            <p>Confident reviews. Better code.<br />AI-assisted pull request reviews, built for your GitHub workflow.</p>
            <div className={styles.socials}>
              <a href={projectUrl} target="_blank" rel="noopener noreferrer" aria-label="Kodeistry on GitHub (opens in a new tab)"><GitHubMark /></a>
              <a href="https://www.linkedin.com/in/mohdmustufa" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn (opens in a new tab)"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 2H3.55C2.69 2 2 2.68 2 3.52v16.96c0 .84.69 1.52 1.55 1.52h16.9c.86 0 1.55-.68 1.55-1.52V3.52c0-.84-.69-1.52-1.55-1.52ZM7.93 18.75H4.98V9.2h2.95v9.55ZM6.45 7.9a1.71 1.71 0 1 1 0-3.42 1.71 1.71 0 0 1 0 3.42Zm12.3 10.85H15.8V14.1c0-1.11-.02-2.54-1.55-2.54-1.55 0-1.79 1.21-1.79 2.46v4.73H9.51V9.2h2.83v1.3h.04c.39-.74 1.36-1.52 2.79-1.52 2.98 0 3.58 1.96 3.58 4.51v5.26Z" /></svg></a>
              <a href={email} aria-label="Email Kodeistry"><Mail aria-hidden="true" /></a>
            </div>
          </div>
          {groups.map(({ title, links }) => (
            <nav key={title} aria-label={"Footer " + title} className={styles.group}>
              <h2>{title}</h2>
              <ul>
                {links.map(([label, href]) => <li key={label}><Link href={href}>{label}</Link></li>)}
              </ul>
            </nav>
          ))}
        </div>
        <div className={styles.bottom}>
          <p>&copy; {new Date().getFullYear()} Kodeistry. All rights reserved.</p>
          <span className={styles.signature}>Built for the next pull request.</span>
        </div>
      </div>
    </footer>
  );
}

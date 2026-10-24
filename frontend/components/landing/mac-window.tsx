import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import styles from "./mac-window.module.css";

export function MacWindow({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(styles.window, className)}>
      <div className={styles.titlebar}>
        <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
        <span className={styles.title}>{title}</span>
        <span className={styles.example}>Example</span>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
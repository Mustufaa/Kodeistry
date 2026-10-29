import styles from "./robotic-bug.module.css";

/** Motion-free fallback while the original WebGL robot loads or is unavailable. */
export function RoboticBugIcon() {
  return <svg viewBox="0 0 260 260" className={styles.fallbackIcon} aria-hidden="true" focusable="false">
    <g fill="none" stroke="#a4a8b1" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M106 91 75 71 48 89M99 125 58 120 34 145M107 157 70 179 55 211M154 91 185 71 212 89M161 125 202 120 226 145M153 157 190 179 205 211" />
      <path d="m116 78-10-29-15-12m53 41 10-29 15-12" strokeWidth="3" />
    </g>
    <g fill="#e4e6eb" stroke="#626976" strokeWidth="2">
      <circle cx="75" cy="71" r="6" /><circle cx="58" cy="120" r="6" /><circle cx="70" cy="179" r="6" />
      <circle cx="185" cy="71" r="6" /><circle cx="202" cy="120" r="6" /><circle cx="190" cy="179" r="6" />
      <ellipse cx="130" cy="142" rx="43" ry="67" />
      <path d="M130 79v129M92 115q38 17 76 0M88 140q42 17 84 0M94 168q36 14 72 0" fill="none" stroke="#a4a8b1" />
      <path d="M108 79q22-24 44 0l-4 23q-18 12-36 0Z" fill="#1c2028" />
      <path d="M111 115q-13 30-2 56" fill="none" stroke="white" strokeWidth="5" />
      <circle cx="118" cy="84" r="4" fill="#c9bcff" /><circle cx="142" cy="84" r="4" fill="#c9bcff" />
    </g>
  </svg>;
}

export function StaticRoboticBug({ motion = "pending" }: { motion?: "pending" | "reduced" }) {
  return <div className={styles.overlay} aria-hidden="true" data-robotic-bug data-motion={motion} data-renderer="static">
    <div className={styles.staticRobot} data-bug-body><RoboticBugIcon /></div>
  </div>;
}

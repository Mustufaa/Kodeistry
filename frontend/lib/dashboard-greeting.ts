export type GreetingUser = { full_name?: string | null; github_login?: string | null };

export function firstName(user: GreetingUser): string {
  // OAuth stores the GitHub profile name in full_name. Never fall back to email.
  const name = [user.full_name, user.github_login].find(value => value?.trim() && !value.includes("@"));
  return name?.trim().split(/\s+/u)[0] || "Developer";
}

export function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return { title: "Good Morning", emoji: "☀️", subtitle: "Ready to build better code today? Let's get started." };
  if (hour >= 12 && hour < 17) return { title: "Good Afternoon", emoji: "🌤️", subtitle: "Keep up the momentum! Here's your latest code activity." };
  if (hour >= 17 && hour < 21) return { title: "Good Evening", emoji: "🌆", subtitle: "Great work today! Let's review your progress." };
  return { title: "Good Night", emoji: "🌙", subtitle: "Wrapping up? Here's how your repositories are doing." };
}

// Stable snapshots within each minute; SSR never guesses the browser's time zone.
export const localMinute = () => Math.floor(Date.now() / 60_000);
export const serverMinute = () => null;

export function subscribeToLocalMinute(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  function refresh() {
    clearTimeout(timer);
    onChange();
    // Align with the next minute, including each greeting boundary and midnight.
    timer = setTimeout(refresh, 60_000 - Date.now() % 60_000);
  }
  function resume() { if (!document.hidden) refresh(); }
  refresh();
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", resume);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", resume);
  };
}

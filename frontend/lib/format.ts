export function shortSha(value: string) {
  return value ? value.slice(0, 7) : "unknown";
}

export function formatDate(value?: string | null) {
  if (!value) return "Not completed";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

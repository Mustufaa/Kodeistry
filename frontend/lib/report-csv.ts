import type { AnalyticsResponse } from "@/types/analytics";

function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export function downloadReportCsv(data: AnalyticsResponse, filename: string) {
  const s = data.summary;
  const rows: unknown[][] = [
    ["Kodeistry code review report"], ["Period", `${data.start_date} to ${data.end_date}`], [],
    ["Metric", "Value"], ["Reviews", s.reviews], ["Pull requests reviewed", s.pull_requests], ["Repositories reviewed", s.repositories],
    ["Total findings", s.findings], ["Critical findings", s.critical], ["High findings", s.high], ["Medium findings", s.medium], ["Low findings", s.low],
    ["Security findings", s.security], ["Bug findings", s.bugs], ["Performance findings", s.performance], ["Quality findings", s.quality],
    ["Resolved findings", s.resolved], ["Open findings", s.open], ["Dismissed findings", s.dismissed], ["Resolution rate", s.resolution_rate == null ? "" : `${s.resolution_rate}%`],
    ["Average findings per review", s.average_findings_per_review ?? ""], ["Most affected repository", s.most_affected_repository ?? ""], ["Most common category", s.most_common_category ?? ""],
    [], ["Findings by severity", "Count"], ...data.severity.map((item) => [item.name, item.count]),
    [], ["Top categories", "Count"], ...data.categories.map((item) => [item.name, item.count]),
    [], ["Repositories with most findings", "Count"], ...data.repositories.map((item) => [item.name, item.count]),
  ];
  const content = `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

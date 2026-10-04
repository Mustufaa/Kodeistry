export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>;
}

export function StatSkeleton() {
  return <div className="h-24 animate-pulse rounded-lg border bg-muted" />;
}

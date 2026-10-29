"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { TableSkeleton } from "@/components/dashboard/skeletons";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { getRepositories, getRepositoryReviews } from "@/lib/api/repositories";
import { formatDate, shortSha } from "@/lib/format";

export default function RepositoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const repositoryId = Number(id);
  const { tenantId } = useCurrentTenant();
  const reposQuery = useQuery({ queryKey: ["repositories", tenantId], queryFn: () => getRepositories(tenantId!), enabled: !!tenantId });
  const reviewsQuery = useQuery({ queryKey: ["repository-reviews", tenantId, repositoryId], queryFn: () => getRepositoryReviews(tenantId!, repositoryId), enabled: !!tenantId && !!repositoryId });
  const repo = reposQuery.data?.find((item) => item.id === repositoryId);
  if (!reposQuery.isLoading && !repo) notFound();

  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="break-words [overflow-wrap:anywhere] text-2xl sm:text-3xl font-semibold tracking-tight">{repo?.full_name ?? "Repository"}</h1><p className="text-sm text-muted-foreground">Repository details, pull requests, review history, and findings summary.</p></div><Button asChild variant="outline"><Link href="/repositories">Back</Link></Button></div>{reposQuery.isLoading ? <TableSkeleton rows={3} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card><CardHeader><CardTitle>Owner</CardTitle></CardHeader><CardContent>{repo?.owner}</CardContent></Card><Card><CardHeader><CardTitle>Visibility</CardTitle></CardHeader><CardContent>{repo?.private ? "Private" : "Public"}</CardContent></Card><Card><CardHeader><CardTitle>Default branch</CardTitle></CardHeader><CardContent className="font-mono text-sm">{repo?.default_branch}</CardContent></Card><Card><CardHeader><CardTitle>GitHub ID</CardTitle></CardHeader><CardContent>{repo?.github_repository_id}</CardContent></Card></div>}<Card><CardHeader><CardTitle>Review history</CardTitle></CardHeader><CardContent>{reviewsQuery.isLoading ? <TableSkeleton /> : (reviewsQuery.data ?? []).length === 0 ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No reviews for this repository yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><tbody>{reviewsQuery.data?.map((review) => <tr key={review.id} className="border-b last:border-0"><td className="py-3"><Link className="font-medium hover:underline" href={`/reviews/${review.id}`}>PR #{review.pull_request_number}</Link></td><td><StatusBadge value={review.status} /></td><td>{review.findings_count} findings</td><td className="font-mono text-xs">{shortSha(review.commit_sha)}</td><td className="text-muted-foreground">{formatDate(review.created_at)}</td></tr>)}</tbody></table></div>}</CardContent></Card></div>;
}

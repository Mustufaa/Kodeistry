import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function SecretScannerPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Security"
        title="Secret Scanner"
        actions={
          <span className="inline-flex items-center rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
            Coming Soon
          </span>
        }
      />

      <Card className="overflow-hidden">
        <CardContent className="subtle-grid flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center sm:min-h-[440px] sm:px-10">
          <div className="mb-6 grid size-14 place-items-center rounded-2xl border border-violet-500/20 bg-violet-500/10">
            <ShieldCheck aria-hidden="true" className="size-6 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
            Scan your connected repositories for accidentally exposed API keys, tokens, and credentials. On-demand secret scanning is coming soon.
          </p>
          <Button asChild variant="outline" className="mt-8">
            <Link href="/dashboard">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
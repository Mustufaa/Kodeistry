import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/kodeistry-icon.png"
      alt=""
      width={36}
      height={36}
      aria-hidden="true"
      unoptimized
      className={cn("size-9 shrink-0 object-contain", className)}
    />
  );
}

export function BrandLogo({
  compact = false,
  className,
  href = "/dashboard",
  ariaLabel = "Kodeistry dashboard",
}: {
  compact?: boolean;
  className?: string;
  href?: string;
  ariaLabel?: string;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-3", className)} aria-label={ariaLabel}>
      <BrandMark />
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">Kodeistry</span>}
    </Link>
  );
}
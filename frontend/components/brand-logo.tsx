import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

// Both variants stay mounted so a theme change swaps pixels in the same frame.
export function KodeistryLogo({ className }: { className?: string }) {
  return (
    <span className={cn("relative block h-9 aspect-[878/996] shrink-0", className)}>
      <Image
        src="/brand/kodeistry-black.png"
        alt="Kodeistry logo"
        width={878}
        height={996}
        sizes="48px"
        loading="eager"
        className="absolute inset-0 h-full w-full object-contain dark:hidden"
      />
      <Image
        src="/brand/kodeistry-white.png"
        alt="Kodeistry logo"
        width={878}
        height={996}
        sizes="48px"
        loading="eager"
        className="absolute inset-0 hidden h-full w-full object-contain dark:block"
      />
    </span>
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
      <KodeistryLogo />
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">Kodeistry</span>}
    </Link>
  );
}

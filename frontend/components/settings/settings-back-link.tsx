"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SettingsBackLink() {
  const home = usePathname() === "/settings";
  return <Button asChild variant="ghost" size="sm"><Link href={home ? "/dashboard" : "/settings"}><ArrowLeft className="size-4" aria-hidden="true" />{home ? "Back to dashboard" : "Back to settings"}</Link></Button>;
}

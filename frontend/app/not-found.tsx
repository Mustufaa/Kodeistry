import Link from "next/link";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Page not found");
export default function NotFound() {
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-5 px-6">
    <p className="text-sm text-muted-foreground">404</p>
    <h1 className="text-4xl font-semibold tracking-tight">Page not found</h1>
    <p className="text-muted-foreground">This address does not match a Kodeistry page.</p>
    <nav aria-label="Recovery links" className="flex gap-6"><Link href="/" className="underline underline-offset-4">Back to home</Link><Link href="/docs" className="underline underline-offset-4">Read the docs</Link></nav>
  </main>;
}

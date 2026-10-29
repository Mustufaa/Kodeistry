import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeFavicon, ThemeProvider } from "@/components/layout/theme-provider";
import { Providers } from "@/app/providers";
import { KodyAssistant } from "@/components/kody/kody-assistant";
import { homeTitle, siteDescription, siteUrl } from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  display: "swap",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: homeTitle, template: "%s | Kodeistry" },
  description: siteDescription,
  // New routes stay excluded until explicitly given public metadata.
  robots: { index: false, follow: false },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || "CqN2gwHGWHeE4RALPIOS-Nz5qW3SIQSvrTkRwctwRws",
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  icons: {
    icon: [
      { url: "/brand/kodeistry-black.png", media: "(prefers-color-scheme: light)" },
      { url: "/brand/kodeistry-white.png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/brand/kodeistry-black.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ThemeFavicon />
          <Providers>{children}<KodyAssistant /></Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}

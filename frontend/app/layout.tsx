import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeFavicon, ThemeProvider } from "@/components/layout/theme-provider";
import { Providers } from "@/app/providers";
import { KodyAssistant } from "@/components/kody/kody-assistant";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kodeistry — AI-Powered GitHub Code Review",
  description:
    "AI-powered code reviews for GitHub pull requests, security findings, and code-quality insights.",
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

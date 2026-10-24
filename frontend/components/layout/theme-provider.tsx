"use client";

import { useEffect } from "react";

import {
  ThemeProvider as NextThemeProvider,
  useTheme,
  type ThemeProviderProps,
} from "next-themes";

export type Theme = "light" | "dark" | "system";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemeProvider storageKey="kodeistry_theme" {...props}>
      {children}
    </NextThemeProvider>
  );
}

export { useTheme };

export function ThemeFavicon() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    let icon = document.querySelector<HTMLLinkElement>('link[data-kodeistry-theme-icon]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      icon.dataset.kodeistryThemeIcon = "";
      document.head.appendChild(icon);
    }
    icon.href = resolvedTheme === "dark"
      ? "/brand/kodeistry-white.png"
      : "/brand/kodeistry-black.png";
  }, [resolvedTheme]);

  return null;
}

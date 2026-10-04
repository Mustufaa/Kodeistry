"use client";
import { createContext, useContext, useEffect, useState } from "react";
export type Theme = "light" | "dark" | "system";
const Context = createContext<{ theme: Theme; setTheme: (theme: Theme) => void; resolvedTheme: "light" | "dark" }>({ theme: "system", setTheme: () => undefined, resolvedTheme: "light" });
export function ThemeProvider({ children, defaultTheme = "system" }: { children: React.ReactNode; attribute?: string; defaultTheme?: Theme; enableSystem?: boolean; disableTransitionOnChange?: boolean }) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const saved = localStorage.getItem("kodeistry_theme") as Theme | null;
    const initial = saved === "light" || saved === "dark" || saved === "system" ? saved : defaultTheme;
    const resolved = initial === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : initial;
    queueMicrotask(() => { setTheme(initial); setResolvedTheme(resolved); document.documentElement.classList.toggle("dark", resolved === "dark"); });
  }, [defaultTheme]);
  function changeTheme(value: Theme) {
    setTheme(value); localStorage.setItem("kodeistry_theme", value);
    const resolved = value === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : value;
    setResolvedTheme(resolved); document.documentElement.classList.toggle("dark", resolved === "dark");
  }
  return <Context.Provider value={{ theme, setTheme: changeTheme, resolvedTheme }}>{children}</Context.Provider>;
}
export function useTheme() { return useContext(Context); }

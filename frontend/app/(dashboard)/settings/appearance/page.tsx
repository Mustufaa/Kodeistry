"use client";

import { useTheme, type Theme } from "@/components/layout/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const themes: Theme[] = ["light", "dark", "system"];

export default function AppearanceSettingsPage() {
  const { setTheme, theme } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-sm text-muted-foreground">Choose how Kodeistry follows your display preference.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {themes.map((item) => (
            <Button key={item} variant={theme === item ? "default" : "outline"} onClick={() => setTheme(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
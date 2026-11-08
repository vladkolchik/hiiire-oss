"use client";

import { useEffect, useMemo, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "system", label: "Системная", icon: Laptop },
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Темная", icon: Moon },
] as const;

type ThemeValue = (typeof THEMES)[number]["value"];

export function ThemeSettingsField({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = useMemo<ThemeValue>(() => {
    if (theme === "light" || theme === "dark" || theme === "system") {
      return theme;
    }
    return "system";
  }, [theme]);

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor="theme-interface">Тема интерфейса</Label>
      <Select value={mounted ? currentTheme : "system"} onValueChange={(value) => setTheme(value as ThemeValue)}>
        <SelectTrigger id="theme-interface">
          <SelectValue placeholder="Системная" />
        </SelectTrigger>
        <SelectContent>
          {THEMES.map((item) => {
            const Icon = item.icon;

            return (
              <SelectItem key={item.value} value={item.value}>
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Системная тема повторяет настройки вашего устройства.</p>
    </div>
  );
}

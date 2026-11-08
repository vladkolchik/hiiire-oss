"use client";

import { useEffect, useMemo, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "system", label: "Системная", icon: Laptop },
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Темная", icon: Moon },
] as const;

type ThemeValue = (typeof THEMES)[number]["value"];

export function ThemeToggle({ className }: { className?: string }) {
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

  const selectedTheme = mounted ? currentTheme : "system";
  const current = THEMES.find((item) => item.value === selectedTheme) ?? THEMES[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("w-full justify-start gap-2", className)}
          aria-label={`Тема интерфейса: ${current.label}`}
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="truncate">{current.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Тема</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={selectedTheme} onValueChange={(value) => setTheme(value as ThemeValue)}>
          {THEMES.map((item) => {
            const Icon = item.icon;

            return (
              <DropdownMenuRadioItem key={item.value} value={item.value}>
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

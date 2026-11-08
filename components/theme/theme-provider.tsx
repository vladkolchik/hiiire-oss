"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";

const MARKETING_PATHS = new Set([
  "/",
  "/about",
  "/contact",
  "/privacy",
  "/refund",
  "/request-access",
  "/terms",
]);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const forcedTheme = MARKETING_PATHS.has(pathname) ? "light" : undefined;

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      forcedTheme={forcedTheme}
    >
      {children}
    </NextThemesProvider>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LandingSectionLink } from "@/components/landing/landing-section-link";
import { Menu } from "lucide-react";
import { getLandingHeaderAuthView } from "@/lib/landing/header-auth";
import { landingNavigationLinks } from "@/lib/landing-navigation-links";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Navigation() {
  const [isMounted, setIsMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [authenticatedUserEmail, setAuthenticatedUserEmail] = useState<string | null>(null);
  const authView = getLandingHeaderAuthView(authenticatedUserEmail);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAuthenticatedEmail = async () => {
      const response = await fetch("/api/auth/session", { method: "GET", cache: "no-store" }).catch(() => null);
      const payload = response?.ok
        ? ((await response.json().catch(() => null)) as { user?: { email?: unknown } | null } | null)
        : null;
      const email = typeof payload?.user?.email === "string" ? payload.user.email : null;

      if (!cancelled) {
        setAuthenticatedUserEmail(email);
      }
    };

    void loadAuthenticatedEmail();

    return () => {
      cancelled = true;
    };
  }, []);

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className="fixed top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between sm:h-16 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center space-x-2">
          <div className="flex items-center">
            <span className="text-xl font-bold sm:text-2xl">hiiire</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex md:items-center md:gap-6 lg:gap-8">
          {landingNavigationLinks.map((item) => (
            <LandingSectionLink
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground lg:text-base"
            >
              {item.label}
            </LandingSectionLink>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden md:flex md:items-center md:gap-2">
            {authView.kind === "authenticated" ? (
              <>
                <span
                  className="min-w-0 max-w-[220px] truncate text-sm text-muted-foreground lg:max-w-[280px] lg:text-base"
                  title={authView.email}
                >
                  {authView.email}
                </span>
                <Button asChild className="h-9 sm:h-10">
                  <Link href={authView.dashboardHref} className="text-sm lg:text-base">В кабинет</Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild className="h-9 sm:h-10">
                  <Link href={authView.loginHref} className="text-sm lg:text-base">Войти</Link>
                </Button>
                <Button asChild className="h-9 sm:h-10">
                  <Link href={authView.signupHref} className="text-sm lg:text-base">Попробовать бесплатно</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Navigation */}
          {isMounted ? (
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Открыть меню</span>
                </Button>
              </SheetTrigger>
              <SheetContent className="flex w-[280px] flex-col overflow-hidden pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:w-[350px]">
                <div className="flex min-h-0 flex-1 flex-col gap-4 pt-10">
                  <Link
                    href="/"
                    onClick={closeMobileMenu}
                    className="flex items-center space-x-2"
                  >
                    <div className="flex items-center">
                      <span className="text-xl font-bold sm:text-2xl">hiiire</span>
                    </div>
                  </Link>
                  {landingNavigationLinks.map((item) => (
                    <LandingSectionLink
                      key={item.href}
                      href={item.href}
                      onClick={closeMobileMenu}
                      className="text-base font-medium py-2 sm:text-lg"
                    >
                      {item.label}
                    </LandingSectionLink>
                  ))}
                  <div className="mt-auto flex flex-col gap-3 pt-4">
                    {authView.kind === "authenticated" ? (
                      <>
                        <div className="min-w-0 rounded-md border bg-muted/40 px-3 py-2">
                          <p className="truncate text-sm font-medium" title={authView.email}>
                            {authView.email}
                          </p>
                        </div>
                        <Button asChild className="w-full h-11">
                          <Link href={authView.dashboardHref} onClick={closeMobileMenu}>В кабинет</Link>
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" asChild className="w-full h-11">
                          <Link href={authView.loginHref} onClick={closeMobileMenu}>Войти</Link>
                        </Button>
                        <Button asChild className="w-full h-11">
                          <Link href={authView.signupHref} onClick={closeMobileMenu}>Попробовать бесплатно</Link>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 sm:h-10 sm:w-10 md:hidden"
              disabled
              aria-hidden="true"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Открыть меню</span>
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}

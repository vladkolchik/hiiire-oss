"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { TrialBanner } from "@/components/dashboard/trial-banner";
import { WelcomeDialog } from "@/components/dashboard/welcome-dialog";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Загрузка…</span>
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-muted/40 md:sticky md:top-0 md:block md:h-screen">
        <Sidebar />
      </div>
      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="flex h-14 min-w-0 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6 md:hidden">
          <MobileNav />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">hiiire</h1>
          </div>
          <ThemeToggle className="w-auto px-3" />
        </header>
        <TrialBanner />
        <WelcomeDialog />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardContent>{children}</DashboardContent>
    </AuthProvider>
  );
}

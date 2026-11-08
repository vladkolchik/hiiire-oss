import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminNotAuthorized } from "@/components/admin/not-authorized";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { adminLogoutAction } from "../logout/actions";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isPlatformAdmin } = await requirePlatformAdmin();

  if (!isPlatformAdmin) {
    return (
      <div className="container py-10">
        <AdminNotAuthorized />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[260px_1fr]">
      <div className="hidden border-r bg-muted/40 md:block">
        <AdminSidebar />
      </div>
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
          <div className="flex-1 truncate text-sm text-muted-foreground">
            Platform admin: <span className="font-medium text-foreground">{user.email}</span>
          </div>
          <ThemeToggle className="hidden w-auto px-3 sm:inline-flex" />
          <form action={adminLogoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Выйти
            </Button>
          </form>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">{children}</main>
      </div>
    </div>
  );
}


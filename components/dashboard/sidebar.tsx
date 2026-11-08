"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { dashboardNavItems } from "@/components/dashboard/nav-items";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Вы вышли из системы");
      router.push("/");
    } catch {
      toast.error("Ошибка при выходе");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="text-xl">hiiire</span>
        </Link>
      </div>
      
      <div className="min-h-0 flex-1 overflow-auto py-2">
        <nav className="grid gap-1 px-2 text-sm font-medium lg:px-4">
          {dashboardNavItems.map((item) => {
            const Icon = item.icon;
            const isRoot = item.href === "/dashboard";
            const isActive = item.external
              ? false
              : isRoot
                ? pathname === item.href
                : pathname === item.href || pathname?.startsWith(item.href + "/");
            
            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary",
                  isActive
                    ? "bg-muted text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      
      <div className="mt-auto p-4 border-t">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
            {user?.name?.charAt(0) ?? "?"}
          </div>
          <div className="flex flex-col">
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.company}</p>
          </div>
        </div>
        <ThemeToggle className="mb-3" />
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full" 
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Выйти
        </Button>
      </div>
    </div>
  );
}

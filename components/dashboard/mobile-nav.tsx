"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { dashboardNavItems } from "@/components/dashboard/nav-items";
import { LogOut, Menu } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function MobileNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Вы вышли из системы");
      router.push("/");
      setOpen(false);
    } catch {
      toast.error("Ошибка при выходе");
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 md:hidden"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Открыть навигацию</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-0 p-0">
        <div className="flex h-14 shrink-0 items-center border-b px-4">
          <Link 
            href="/dashboard" 
            className="flex items-center gap-2 font-semibold"
            onClick={() => setOpen(false)}
          >
            <span className="text-xl">hiiire</span>
          </Link>
        </div>
        
        <nav className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto px-3 py-3 text-sm font-medium">
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
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary",
                  isActive
                    ? "bg-muted text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0 truncate">{item.title}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="mt-auto shrink-0 border-t p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
              {user?.name?.charAt(0) ?? "?"}
            </div>
            <div className="flex min-w-0 flex-col">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.company}</p>
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
      </SheetContent>
    </Sheet>
  );
}

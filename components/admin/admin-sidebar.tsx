"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, CreditCard, FileText, LayoutDashboard, Megaphone, MessageSquareText, MousePointerClick, ReceiptText, ScrollText, Users } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { title: "Обзор", href: "/admin", icon: LayoutDashboard },
  { title: "Компании", href: "/admin/companies", icon: Building2 },
  { title: "Пользователи", href: "/admin/users", icon: Users },
  { title: "Enterprise Billing", href: "/admin/billing", icon: ReceiptText },
  { title: "Enterprise заявки", href: "/admin/tariff-requests", icon: ScrollText },
  { title: "Маркетинг", href: "/admin/marketing", icon: MousePointerClick },
  { title: "Рассылка", href: "/admin/broadcast", icon: Megaphone },
  { title: "Контент", href: "/admin/content", icon: FileText },
  { title: "Обратная связь", href: "/admin/feedback", icon: MessageSquareText },
  { title: "Credits", href: "/admin/credits", icon: CreditCard },
  { title: "Аналитика", href: "/admin/metrics", icon: BarChart3 },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <span className="text-xl">hiiire</span>
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">admin</span>
        </Link>
      </div>

      <div className="flex-1 overflow-auto py-2">
        <nav className="grid gap-1 px-2 text-sm font-medium lg:px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isRoot = item.href === "/admin";
            const isActive = isRoot ? pathname === item.href : pathname === item.href || pathname?.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary",
                  isActive ? "bg-muted text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

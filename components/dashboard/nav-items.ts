import {
  Activity,
  BarChart3,
  BookOpenText,
  Bot,
  Briefcase,
  Calendar,
  FileText,
  Home,
  MessageSquareText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type DashboardNavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

export const dashboardNavItems: DashboardNavItem[] = [
  {
    title: "Главная",
    href: "/dashboard",
    icon: Home,
  },
  {
    title: "Вакансии",
    href: "/dashboard/vacancies",
    icon: Briefcase,
  },
  {
    title: "Кандидаты",
    href: "/dashboard/candidates",
    icon: Users,
  },
  {
    title: "Календарь",
    href: "/dashboard/calendar",
    icon: Calendar,
  },
  {
    title: "HR-ассистент",
    href: "/dashboard/hr-assistant",
    icon: Bot,
  },
  {
    title: "Статистика",
    href: "/dashboard/stats",
    icon: BarChart3,
  },
  {
    title: "Активность",
    href: "/dashboard/activity",
    icon: Activity,
  },
  {
    title: "PDF-инструменты",
    href: "https://pdf.hiiire.com",
    icon: FileText,
    external: true,
  },
  {
    title: "Обратная связь",
    href: "/dashboard/feedback",
    icon: MessageSquareText,
  },
  {
    title: "База знаний",
    href: "/knowledge-base",
    icon: BookOpenText,
  },
  {
    title: "Настройки",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

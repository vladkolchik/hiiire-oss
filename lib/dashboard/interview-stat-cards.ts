import type { DashboardStats } from "@/types";

export type DashboardInterviewStatCard = {
  key: "interviews-own" | "interviews-employees";
  title: "Собеседования";
  value: number | string;
  description: string;
};

export function buildDashboardInterviewStatCards(stats: DashboardStats | null): DashboardInterviewStatCard[] {
  if (!stats) {
    return [{
      key: "interviews-own",
      title: "Собеседования",
      value: "—",
      description: "Статистика недоступна",
    }];
  }

  const own = stats.ownInterviewsUntilWeekEnd ?? 0;
  const employees = stats.employeeInterviewsUntilWeekEnd ?? 0;

  if (stats.role !== "admin") {
    return [{
      key: "interviews-own",
      title: "Собеседования",
      value: own,
      description: "У вас будет до конца недели",
    }];
  }

  if (own > 0 && employees > 0) {
    return [
      {
        key: "interviews-employees",
        title: "Собеседования",
        value: employees,
        description: "Будет у сотрудников до конца недели",
      },
      {
        key: "interviews-own",
        title: "Собеседования",
        value: own,
        description: "У вас будет до конца недели",
      },
    ];
  }

  if (employees > 0) {
    return [{
      key: "interviews-employees",
      title: "Собеседования",
      value: employees,
      description: "Будет у сотрудников до конца недели",
    }];
  }

  return [{
    key: "interviews-own",
    title: "Собеседования",
    value: own,
    description: "У вас будет до конца недели",
  }];
}

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardSegmentLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Загрузка…</span>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-full sm:w-44" />
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-[180px]" />
          <Skeleton className="h-10 w-[220px]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      {/* Grid/Table placeholder */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Card key={idx} className="overflow-hidden">
            <CardHeader className="space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-5/6" />
              <div className="pt-2">
                <Skeleton className="h-9 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}


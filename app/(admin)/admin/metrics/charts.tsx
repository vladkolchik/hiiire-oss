"use client";

import * as React from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type DailyPoint = {
  day: string; // yyyy-mm-dd
  signups: number;
  analyses: number;
  candidates: number;
  vacancies: number;
};

export type HourlyQueuePoint = {
  hour: string; // ISO timestamptz from Postgres
  enqueued: number;
  done: number;
  failed: number;
};

export function MetricsCharts({ data }: { data: DailyPoint[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Signups & Usage (30d)</CardTitle>
          <CardDescription>Динамика регистраций и активности по дням.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            className="aspect-[16/8]"
            config={{
              signups: { label: "Signups", color: "hsl(var(--primary))" },
              analyses: { label: "Запросы к ИИ", color: "hsl(var(--chart-2))" },
            }}
          >
            <LineChart data={data} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <Line type="monotone" dataKey="signups" stroke="var(--color-signups)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="analyses" stroke="var(--color-analyses)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pipeline activity (30d)</CardTitle>
          <CardDescription>Создание вакансий и кандидатов (proxy активности).</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            className="aspect-[16/8]"
            config={{
              candidates: { label: "Кандидаты", color: "hsl(var(--chart-1))" },
              vacancies: { label: "Вакансии", color: "hsl(var(--chart-3))" },
            }}
          >
            <LineChart data={data} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <Line type="monotone" dataKey="candidates" stroke="var(--color-candidates)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="vacancies" stroke="var(--color-vacancies)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

export function AiQueueCharts({ data }: { data: HourlyQueuePoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI очередь (по часам)</CardTitle>
        <CardDescription>Поступления и завершения задач. Помогает видеть пики и отставание.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="aspect-[16/6]"
          config={{
            enqueued: { label: "Enqueued", color: "hsl(var(--primary))" },
            done: { label: "Done", color: "hsl(var(--chart-2))" },
            failed: { label: "Failed", color: "hsl(var(--destructive))" },
          }}
        >
          <LineChart data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="hour"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(v) => {
                const d = new Date(String(v));
                if (Number.isNaN(d.getTime())) return String(v);
                return d.toLocaleString("ru-RU", { month: "2-digit", day: "2-digit", hour: "2-digit" });
              }}
            />
            <YAxis tickLine={false} axisLine={false} width={32} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
            <Line type="monotone" dataKey="enqueued" stroke="var(--color-enqueued)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="done" stroke="var(--color-done)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="failed" stroke="var(--color-failed)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}


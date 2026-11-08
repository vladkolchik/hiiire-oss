import {
  Ban,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HrAssistantActionCardState =
  | "auto"
  | "pending"
  | "approved"
  | "rejected"
  | "blocked"
  | "failed";

type ActionCardProps = {
  title: string;
  description: string;
  state: HrAssistantActionCardState;
  detail?: string;
  isBusy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
};

const stateConfig = {
  auto: {
    label: "Выполнено автоматически",
    icon: CheckCircle2,
    badge: "secondary",
  },
  pending: {
    label: "Нужно подтверждение",
    icon: Clock3,
    badge: "outline",
  },
  approved: {
    label: "Выполнено",
    icon: CheckCircle2,
    badge: "secondary",
  },
  rejected: {
    label: "Отклонено",
    icon: XCircle,
    badge: "outline",
  },
  blocked: {
    label: "Пока недоступно",
    icon: Ban,
    badge: "outline",
  },
  failed: {
    label: "Не удалось выполнить",
    icon: ShieldAlert,
    badge: "destructive",
  },
} as const;

export function ActionCard({
  title,
  description,
  state,
  detail,
  isBusy,
  onApprove,
  onReject,
}: ActionCardProps) {
  const config = stateConfig[state];
  const Icon = config.icon;
  const showActions = state === "pending" && !isBusy;

  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md border",
            state === "failed" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {state === "pending" ? (
            <LoaderCircle className="size-4" aria-hidden="true" />
          ) : (
            <Icon className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 break-words text-sm font-medium">{title}</h3>
            <Badge
              className="max-w-full shrink-0 truncate"
              variant={config.badge}
            >
              {config.label}
            </Badge>
          </div>
          <p className="break-words text-sm text-muted-foreground">{description}</p>
          {detail ? (
            <p className="break-words text-xs text-muted-foreground">{detail}</p>
          ) : null}
          {showActions ? (
            <div className="flex min-w-0 flex-wrap gap-2 pt-1">
              <Button className="shrink-0" size="sm" onClick={onApprove} disabled={isBusy}>
                Подтвердить
              </Button>
              <Button
                className="shrink-0"
                size="sm"
                variant="outline"
                onClick={onReject}
                disabled={isBusy}
              >
                Отклонить
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

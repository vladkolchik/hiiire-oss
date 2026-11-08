"use client";

import * as React from "react";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateUserRoleAction } from "./actions";

export function RoleCell({
  userId,
  value,
}: {
  userId: string;
  value: "admin" | "hr" | "recruiter";
}) {
  const [current, setCurrent] = React.useState(value);
  const [pending, setPending] = React.useState(false);

  const onChange = async (next: "admin" | "hr" | "recruiter") => {
    if (next === current) return;
    setPending(true);
    setCurrent(next);
    const res = await updateUserRoleAction(userId, next);
    setPending(false);
    if (res.status === "error") toast.error(res.message);
    else toast.success(res.message);
  };

  return (
    <Select value={current} onValueChange={(v) => onChange(v as "admin" | "hr" | "recruiter")} disabled={pending}>
      <SelectTrigger className="h-8 w-[130px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">admin</SelectItem>
        <SelectItem value="hr">hr</SelectItem>
        <SelectItem value="recruiter">recruiter</SelectItem>
      </SelectContent>
    </Select>
  );
}


"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteUserAction } from "./actions";

export function DeleteUserButton({ userId }: { userId: string }) {
  const [pending, setPending] = React.useState(false);

  const onDelete = async () => {
    const ok = confirm("Удалить пользователя? Это действие необратимо.");
    if (!ok) return;
    setPending(true);
    const res = await deleteUserAction(userId);
    setPending(false);
    if (res.status === "error") toast.error(res.message);
    else toast.success(res.message);
  };

  return (
    <Button variant="outline" size="sm" onClick={onDelete} disabled={pending}>
      <Trash2 className="mr-2 h-4 w-4" />
      Удалить
    </Button>
  );
}


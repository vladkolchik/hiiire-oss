"use client";

import * as React from "react";

import { useActionState } from "react";
import { Loader2, Shield } from "lucide-react";

import { adminLoginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "@/components/ui/password-input";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminLoginAction, {});

  return (
    <Card className="w-full max-w-md overflow-hidden">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Админка hiiire</CardTitle>
            <CardDescription>Доступ только для platform admin</CardDescription>
          </div>
        </div>
      </CardHeader>
      <form action={action} className="space-y-6">
        <CardContent className="space-y-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@hiiire.com"
              autoComplete="email"
              required
              disabled={pending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={pending}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Войти
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

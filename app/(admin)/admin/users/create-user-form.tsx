"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, ChevronsUpDown, Copy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createUserInCompanyAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CompanyOption = { id: string; name: string };

function generatePassword(length = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

function isUuidExact(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f-]+$/i.test(value) && value.includes("-");
}

export function CreateUserForm({ companies }: { companies: CompanyOption[] }) {
  const [state, action, pending] = useActionState(createUserInCompanyAction, { status: "idle" as const });
  const [password, setPassword] = React.useState(() => (typeof window !== "undefined" ? generatePassword() : ""));
  const [role, setRole] = React.useState<"hr" | "recruiter" | "admin">("recruiter");
  const [selectedCompanyId, setSelectedCompanyId] = React.useState("");
  const [companyPickerOpen, setCompanyPickerOpen] = React.useState(false);
  const [companyQuery, setCompanyQuery] = React.useState("");

  const selectedCompany = React.useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId]
  );

  const filteredCompanies = React.useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    if (isUuidLike(q)) return isUuidExact(q) ? companies.filter((company) => company.id.toLowerCase() === q) : [];
    return companies.filter((company) => company.name.toLowerCase().includes(q));
  }, [companies, companyQuery]);

  React.useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Пароль скопирован");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">Добавить пользователя в компанию</CardTitle>
        <CardDescription>Создаёт нового user в Supabase Auth и привязывает к существующей компании.</CardDescription>
      </CardHeader>
      <form
        action={(formData) => {
          formData.set("password", password);
          formData.set("role", role);
          return action(formData);
        }}
      >
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Компания</Label>
            <Popover
              open={companyPickerOpen}
              onOpenChange={(open) => {
                setCompanyPickerOpen(open);
                if (!open) setCompanyQuery("");
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={companyPickerOpen}
                  className="w-full justify-between px-3 font-normal"
                  disabled={pending}
                >
                  {selectedCompany ? (
                    <span className="flex min-w-0 flex-1 flex-col items-start text-left">
                      <span className="truncate">{selectedCompany.name}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{selectedCompany.id}</span>
                    </span>
                  ) : (
                    "Выберите компанию"
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Поиск: название или точный company_id"
                    value={companyQuery}
                    onValueChange={setCompanyQuery}
                  />
                  <CommandList>
                    <CommandEmpty>Компании не найдены.</CommandEmpty>
                    <CommandGroup>
                      {filteredCompanies.map((company) => (
                        <CommandItem
                          key={company.id}
                          value={company.id}
                          onSelect={() => {
                            setSelectedCompanyId(company.id);
                            setCompanyPickerOpen(false);
                            setCompanyQuery("");
                          }}
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{company.name}</span>
                            <span className="truncate font-mono text-xs text-muted-foreground">{company.id}</span>
                          </div>
                          <Check
                            className={cn("h-4 w-4", selectedCompanyId === company.id ? "opacity-100" : "opacity-0")}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <input id="companyId" name="companyId" type="hidden" value={selectedCompanyId} readOnly />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Имя</Label>
            <Input id="name" name="name" placeholder="Михаил Петров" disabled={pending} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="recruiter@company.com" required disabled={pending} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Роль</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "hr" | "recruiter")} disabled={pending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recruiter">recruiter</SelectItem>
                <SelectItem value="hr">hr</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Это роль внутри компании (не platform admin).
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Временный пароль</Label>
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} />
              <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())} disabled={pending}>
                <Plus className="mr-2 h-4 w-4" />
                Новый
              </Button>
              <Button type="button" variant="outline" onClick={copyPassword} disabled={pending}>
                <Copy className="mr-2 h-4 w-4" />
                Копировать
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Создать пользователя
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

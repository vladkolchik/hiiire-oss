"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { EnterpriseAgreementsTable, type EnterpriseAgreementTableRow } from "./enterprise-agreements-table";
import { ManualInvoicesTable, type ManualInvoiceTableRow } from "./manual-invoices-table";
import { PlanChangeRequestsTable, type PlanChangeRequestAdminRow } from "./plan-change-requests-table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type EnterpriseLeadRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  company: string;
  company_size: string | null;
  message: string | null;
  requested_plan: "starter" | "professional" | "enterprise";
  status: "new" | "contacted" | "qualified" | "rejected";
  created_at: string;
  handled_at: string | null;
  handled_by: string | null;
  decision_note: string | null;
};

type Props = {
  enterpriseLeads: EnterpriseLeadRow[];
  planChangeRequests: PlanChangeRequestAdminRow[];
  enterpriseAgreements: EnterpriseAgreementTableRow[];
  activeEnterpriseAgreements: EnterpriseAgreementTableRow[];
  manualInvoices: ManualInvoiceTableRow[];
  loadError: string | null;
};

const leadStatusLabel: Record<EnterpriseLeadRow["status"], string> = {
  new: "Новая",
  contacted: "В работе",
  qualified: "Квалифицирована",
  rejected: "Отклонена",
};

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ru-RU");
}

function includesSearch(parts: Array<string | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return parts.some((part) => String(part ?? "").toLowerCase().includes(normalized));
}

function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="relative w-full sm:w-[320px]">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={120}
        className="h-9 pl-9"
      />
    </div>
  );
}

function EnterpriseLeadsTable({ rows, emptyMessage = "Enterprise leads пока нет." }: { rows: EnterpriseLeadRow[]; emptyMessage?: string }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Создано</TableHead>
            <TableHead>Контакт</TableHead>
            <TableHead>Компания</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Сообщение</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateLabel(row.created_at)}</TableCell>
                <TableCell className="min-w-[220px]">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{row.full_name}</span>
                    <span className="text-xs text-muted-foreground">{row.email}</span>
                    <span className="text-xs text-muted-foreground">{row.phone}</span>
                  </div>
                </TableCell>
                <TableCell className="min-w-[220px]">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{row.company}</span>
                    <span className="text-xs text-muted-foreground">{row.company_size ?? "Размер не указан"}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={row.status === "rejected" ? "destructive" : "outline"}>{leadStatusLabel[row.status]}</Badge>
                </TableCell>
                <TableCell className="min-w-[240px] max-w-[360px] text-sm text-muted-foreground">
                  <span className="line-clamp-3">{row.message ?? row.decision_note ?? "-"}</span>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-sm text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function EnterpriseAgreementsGuide() {
  return (
    <Accordion type="single" collapsible className="rounded-md border px-4">
      <AccordionItem value="enterprise-guide" className="border-0">
        <AccordionTrigger className="hover:no-underline">Как подключить или отключить Enterprise</AccordionTrigger>
        <AccordionContent className="space-y-4 text-sm text-muted-foreground">
          <div className="space-y-2">
            <p className="font-medium text-foreground">Чтобы подключить Enterprise</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Откройте Plan Change Requests, нажмите «Управлять» и одобрите заявку клиента на Enterprise.</li>
              <li>
                На этапе «Условия Enterprise» заполните дату начала, дату окончания или отметьте «Бессрочно», укажите лимит
                credits и коротко опишите условия.
              </li>
              <li>Нажмите «Создать условия Enterprise». После этого запись появится в Enterprise Agreements.</li>
              <li>
                При необходимости проверьте или поправьте условия и нажмите «Сохранить». Эта кнопка только сохраняет
                изменения в условиях Enterprise.
              </li>
              <li>
                Если по заявке не нужно продолжать подключение, нажмите «Отменить договорённость». После этого заявку можно
                закрыть или отклонить в Plan Change Requests.
              </li>
              <li>
                Если нужно отправить клиенту счёт, заполните сумму, email и описание, затем нажмите «Выставить счёт».
              </li>
              <li>
                Нажмите «Активировать», когда счёт оплачен и условия готовы. После этого Enterprise включится для компании.
              </li>
              <li>
                Если счёт истёк, отменён или ушёл на проверку, верните условия Enterprise в черновик и выставьте новый счёт.
              </li>
            </ol>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-foreground">Чтобы отключить Enterprise</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>В Plan Change Requests создайте заявку на выход для компании с активным Enterprise.</li>
              <li>Выберите тариф, на который нужно перевести компанию, и одобрите заявку.</li>
              <li>
                Нажмите «Завершить Enterprise по заявке». Эта кнопка отключает Enterprise и применяет выбранный тариф.
              </li>
            </ol>
          </div>
          <p>
            «Создать новые условия Enterprise» используется, когда клиент остаётся на Enterprise, но меняются срок, credits или
            другие условия.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function BillingAdminTabs({
  enterpriseLeads,
  planChangeRequests,
  enterpriseAgreements,
  activeEnterpriseAgreements,
  manualInvoices,
  loadError,
}: Props) {
  const [leadSearch, setLeadSearch] = React.useState("");
  const filteredEnterpriseLeads = React.useMemo(
    () =>
      enterpriseLeads.filter((row) =>
        includesSearch([row.full_name, row.email, row.phone, row.company, row.company_size, row.message, row.decision_note, row.id], leadSearch),
      ),
    [enterpriseLeads, leadSearch],
  );

  return (
    <Tabs defaultValue="plan-change-requests" className="space-y-4">
      {loadError ? <div className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">{loadError}</div> : null}

      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="enterprise-leads">Enterprise Leads</TabsTrigger>
        <TabsTrigger value="plan-change-requests">Plan Change Requests</TabsTrigger>
        <TabsTrigger value="enterprise-agreements">Enterprise Agreements</TabsTrigger>
        <TabsTrigger value="manual-invoices">Manual Invoices</TabsTrigger>
      </TabsList>

      <TabsContent value="enterprise-leads" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Enterprise Leads</h2>
            <span className="text-sm text-muted-foreground">{filteredEnterpriseLeads.length} из {enterpriseLeads.length}</span>
          </div>
          <SearchField
            value={leadSearch}
            onChange={setLeadSearch}
            placeholder="Поиск по контакту или компании"
            ariaLabel="Поиск по Enterprise leads"
          />
        </div>
        <EnterpriseLeadsTable
          rows={filteredEnterpriseLeads}
          emptyMessage={filteredEnterpriseLeads.length === 0 && enterpriseLeads.length > 0 ? "Поиск ничего не нашёл." : undefined}
        />
      </TabsContent>

      <TabsContent value="plan-change-requests" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Plan Change Requests</h2>
          <span className="text-sm text-muted-foreground">{planChangeRequests.length} последних</span>
        </div>
        <PlanChangeRequestsTable
          initialRows={planChangeRequests}
          enterpriseAgreements={enterpriseAgreements}
          activeEnterpriseAgreements={activeEnterpriseAgreements}
        />
      </TabsContent>

      <TabsContent value="enterprise-agreements" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Enterprise Agreements</h2>
            <span className="text-sm text-muted-foreground">{enterpriseAgreements.length} последних</span>
          </div>
        </div>
        <EnterpriseAgreementsGuide />
        <EnterpriseAgreementsTable rows={enterpriseAgreements} />
      </TabsContent>

      <TabsContent value="manual-invoices" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Manual Invoices</h2>
          <span className="text-sm text-muted-foreground">{manualInvoices.length} последних</span>
        </div>
        <ManualInvoicesTable rows={manualInvoices} />
      </TabsContent>
    </Tabs>
  );
}

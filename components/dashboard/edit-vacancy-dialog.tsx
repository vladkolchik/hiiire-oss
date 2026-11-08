"use client";

import { useMemo, useState, type ClipboardEvent, type FormEvent, type ReactNode } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Info } from "lucide-react";

import { CurrencyCombobox } from "@/components/dashboard/currency-combobox";
import { EmploymentFormsMultiSelect } from "@/components/dashboard/employment-forms-multi-select";
import { getRhfErrorMessage } from "@/lib/forms/get-rhf-error-message";
import { currencyCodeSchema, DEFAULT_CURRENCY_CODE, getCurrencyOption } from "@/lib/currency";
import {
  addVacancySalaryIssues,
  formatVacancySalaryInput,
  limitVacancySalaryInput,
  parseVacancySalaryValue,
  VACANCY_SALARY_MAX_DIGITS_MESSAGE,
  VACANCY_SALARY_MAX_INPUT_LENGTH,
} from "@/lib/vacancies/salary";
import { EMPLOYMENT_FORM_VALUES } from "@/lib/vacancies/employment-forms";
import { parseVacancyListText, VACANCY_LIST_FIELD_DESCRIPTION, vacancyListTextSchema } from "@/lib/vacancies/lists";
import type { Vacancy } from "@/types";
import { updateVacancy } from "@/services/data/vacancies";

const EmploymentFormSchema = z.enum(EMPLOYMENT_FORM_VALUES);

const Schema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Введите название вакансии")
      .max(120, "Название вакансии не должно быть длиннее 120 символов"),
    location: z.string().trim().min(2, "Укажите локацию").max(120, "Локация не должна быть длиннее 120 символов"),
    employmentType: z.enum(["full-time", "part-time", "contract", "internship"]),
    experienceLevel: z.enum(["trainee", "junior", "middle", "senior", "lead"]),
    status: z.enum(["draft", "active", "paused", "closed"]),

    // Real-world hiring fields (optional)
    department: z.string().trim().max(120, "Отдел не должен быть длиннее 120 символов").optional(),
    hiringManager: z.string().trim().max(120, "Ответственный не должен быть длиннее 120 символов").optional(),
    headcount: z.union([z.string().trim(), z.number()]).optional(),
    workSchedule: z.string().trim().max(80, "График не должен быть длиннее 80 символов").optional(),
    employmentForms: z.array(EmploymentFormSchema).optional(),
    salaryPeriod: z.enum(["month", "hour", "shift"]),
    salaryTax: z.enum(["gross", "net"]).nullable().optional(),
    bonus: z.string().trim().max(5000, "Бонусы не должны быть длиннее 5000 символов").optional(),
    benefits: z.string().trim().max(5000, "Условия не должны быть длиннее 5000 символов").optional(),
    probationMonths: z.union([z.string().trim(), z.number()]).optional(),
    travelPercent: z.union([z.string().trim(), z.number()]).optional(),
    mandatoryRequirements: z
      .string()
      .trim()
      .max(10_000, "Обязательные требования не должны быть длиннее 10000 символов")
      .optional(),
    hiringProcess: z
      .string()
      .trim()
      .max(10_000, "Этапы отбора не должны быть длиннее 10000 символов")
      .optional(),

    description: z
      .string()
      .trim()
      .min(20, "Описание вакансии должно быть не короче 20 символов")
      .max(20_000, "Описание вакансии не должно быть длиннее 20000 символов"),
    requirementsText: vacancyListTextSchema(),
    responsibilitiesText: vacancyListTextSchema(),

    salaryMin: z.union([z.string().trim(), z.number()]).optional(),
    salaryMax: z.union([z.string().trim(), z.number()]).optional(),
    salaryCurrency: currencyCodeSchema(),
  })
  .superRefine((val, ctx) => {
    addVacancySalaryIssues(val, ctx);

    const headcount = typeof val.headcount === "number" ? val.headcount : Number(val.headcount ?? "");
    if (val.headcount !== undefined && val.headcount !== "" && !Number.isFinite(headcount)) {
      ctx.addIssue({ code: "custom", message: "Укажите число", path: ["headcount"] });
    }
    if (Number.isFinite(headcount) && (!Number.isInteger(headcount) || headcount < 1 || headcount > 1000)) {
      ctx.addIssue({ code: "custom", message: "План найма: 1–1000", path: ["headcount"] });
    }

    const probation = typeof val.probationMonths === "number" ? val.probationMonths : Number(val.probationMonths ?? "");
    if (val.probationMonths !== undefined && val.probationMonths !== "" && !Number.isFinite(probation)) {
      ctx.addIssue({ code: "custom", message: "Укажите число", path: ["probationMonths"] });
    }
    if (Number.isFinite(probation) && (!Number.isInteger(probation) || probation < 0 || probation > 24)) {
      ctx.addIssue({ code: "custom", message: "Испытательный срок: 0–24", path: ["probationMonths"] });
    }

    const travel = typeof val.travelPercent === "number" ? val.travelPercent : Number(val.travelPercent ?? "");
    if (val.travelPercent !== undefined && val.travelPercent !== "" && !Number.isFinite(travel)) {
      ctx.addIssue({ code: "custom", message: "Укажите число", path: ["travelPercent"] });
    }
    if (Number.isFinite(travel) && (!Number.isInteger(travel) || travel < 0 || travel > 100)) {
      ctx.addIssue({ code: "custom", message: "Командировки: 0–100%", path: ["travelPercent"] });
    }
  });

type FormData = z.infer<typeof Schema>;

const VACANCY_TEXT_LIMIT_MESSAGES = {
  title: "Название вакансии не должно быть длиннее 120 символов",
  location: "Локация не должна быть длиннее 120 символов",
  description: "Описание вакансии не должно быть длиннее 20000 символов",
  workSchedule: "График не должен быть длиннее 80 символов",
} as const;

type LimitedTextField = keyof typeof VACANCY_TEXT_LIMIT_MESSAGES;

const VACANCY_TEXT_MAX_LENGTHS: Record<LimitedTextField, number> = {
  title: 120,
  location: 120,
  description: 20_000,
  workSchedule: 80,
};

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&_option]:bg-background [&_option]:text-foreground";

function listToText(items: string[] | undefined): string {
  return (items ?? []).filter(Boolean).join("\n");
}

export function EditVacancyDialog(props: {
  vacancy: Vacancy;
  trigger?: ReactNode;
  onUpdated?: (vacancy: Vacancy) => void;
}) {
  const { vacancy, trigger, onUpdated } = props;
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      title: vacancy.title ?? "",
      location: vacancy.location ?? "Удаленно",
      employmentType: vacancy.employmentType ?? "full-time",
      experienceLevel: vacancy.experienceLevel ?? "middle",
      status: vacancy.status ?? "draft",
      department: vacancy.department ?? "",
      hiringManager: vacancy.hiringManager ?? "",
      headcount: (vacancy.headcount ?? 1).toString(),
      workSchedule: vacancy.workSchedule ?? "",
      employmentForms: vacancy.employmentForms ?? [],
      salaryPeriod: vacancy.salaryPeriod ?? "month",
      salaryTax: vacancy.salaryTax ?? null,
      bonus: vacancy.bonus ?? "",
      benefits: vacancy.benefits ?? "",
      probationMonths: typeof vacancy.probationMonths === "number" ? String(vacancy.probationMonths) : "",
      travelPercent: typeof vacancy.travelPercent === "number" ? String(vacancy.travelPercent) : "",
      mandatoryRequirements: vacancy.mandatoryRequirements ?? "",
      hiringProcess: vacancy.hiringProcess ?? "",
      description: vacancy.description ?? "",
      requirementsText: listToText(vacancy.requirements),
      responsibilitiesText: listToText(vacancy.responsibilities),
      salaryMin: vacancy.salary?.min?.toString?.() ?? "",
      salaryMax: vacancy.salary?.max?.toString?.() ?? "",
      salaryCurrency: vacancy.salary?.currency ?? DEFAULT_CURRENCY_CODE,
    },
  });

  const statusValue = useWatch({
    control: form.control,
    name: "status",
  });
  const statusHint = useMemo(() => {
    if (statusValue === "draft") return "Черновик виден в системе, но не считается активной вакансией.";
    if (statusValue === "active") return "Активная вакансия будет доступна при добавлении кандидатов.";
    if (statusValue === "paused") return "На паузе — можно временно скрыть из активного потока.";
    return "Закрытая вакансия — для истории. Обычно кандидатов на неё не добавляют.";
  }, [statusValue]);

  const advancedValues = useWatch({
    control: form.control,
    name: [
      "department",
      "hiringManager",
      "headcount",
      "workSchedule",
      "employmentForms",
      "probationMonths",
      "travelPercent",
      "benefits",
      "bonus",
      "mandatoryRequirements",
      "hiringProcess",
      "requirementsText",
      "responsibilitiesText",
      "salaryPeriod",
      "salaryTax",
    ],
  });
  const salaryCurrencyValue = useWatch({
    control: form.control,
    name: "salaryCurrency",
  });
  const hasUnsupportedSalaryCurrency =
    typeof salaryCurrencyValue === "string" &&
    salaryCurrencyValue.trim().length > 0 &&
    !getCurrencyOption(salaryCurrencyValue);

  function clearFieldErrorIfMessage(name: keyof FormData, message: string) {
    if (getRhfErrorMessage(form.formState.errors[name]) === message) {
      form.clearErrors(name);
    }
  }

  function showTextLimitError(name: LimitedTextField) {
    form.setError(name, { type: "maxLength", message: VACANCY_TEXT_LIMIT_MESSAGES[name] });
  }

  function wouldExceedTextLimit(
    target: HTMLInputElement | HTMLTextAreaElement,
    insertedText: string,
    maxLength: number
  ) {
    const selectionStart = target.selectionStart ?? target.value.length;
    const selectionEnd = target.selectionEnd ?? target.value.length;
    const selectedLength = Math.max(selectionEnd - selectionStart, 0);

    return target.value.length - selectedLength + insertedText.length > maxLength;
  }

  function handleTextInputChange(name: LimitedTextField, onChange: (value: string) => void, value: string) {
    onChange(value);
    if (value.length < VACANCY_TEXT_MAX_LENGTHS[name]) {
      clearFieldErrorIfMessage(name, VACANCY_TEXT_LIMIT_MESSAGES[name]);
    }
  }

  function handleTextLimitBeforeInput(
    name: LimitedTextField,
    maxLength: number,
    event: FormEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const inputEvent = event.nativeEvent as InputEvent;
    if (typeof inputEvent.data !== "string") return;
    if (wouldExceedTextLimit(event.currentTarget, inputEvent.data, maxLength)) {
      showTextLimitError(name);
    }
  }

  function handleTextLimitPaste(
    name: LimitedTextField,
    maxLength: number,
    event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const text = event.clipboardData.getData("text");
    if (text && wouldExceedTextLimit(event.currentTarget, text, maxLength)) {
      showTextLimitError(name);
    }
  }

  function handleSalaryInputChange(name: "salaryMin" | "salaryMax", onChange: (value: string) => void, value: string) {
    const result = limitVacancySalaryInput(value);
    onChange(result.value);

    if (result.exceeded) {
      form.setError(name, { type: "maxLength", message: VACANCY_SALARY_MAX_DIGITS_MESSAGE });
      return;
    }

    clearFieldErrorIfMessage(name, VACANCY_SALARY_MAX_DIGITS_MESSAGE);
  }

  const advancedFilledCount = useMemo(() => {
    const [
      department,
      hiringManager,
      headcount,
      workSchedule,
      employmentForms,
      probationMonths,
      travelPercent,
      benefits,
      bonus,
      mandatoryRequirements,
      hiringProcess,
      requirementsText,
      responsibilitiesText,
      salaryPeriod,
      salaryTax,
    ] = advancedValues;

    const countText = (v: unknown) => (typeof v === "string" ? v.trim().length > 0 : Boolean(v));

    const headcountNum = typeof headcount === "number" ? headcount : Number(String(headcount ?? "").trim());
    const hasHeadcount = Number.isFinite(headcountNum) && headcountNum !== 1;

    const probationNum =
      typeof probationMonths === "number" ? probationMonths : Number(String(probationMonths ?? "").trim());
    const hasProbation = Number.isFinite(probationNum) && probationNum > 0;

    const travelNum = typeof travelPercent === "number" ? travelPercent : Number(String(travelPercent ?? "").trim());
    const hasTravel = Number.isFinite(travelNum) && travelNum > 0;

    const hasSalaryPeriod = typeof salaryPeriod === "string" && salaryPeriod !== "month";
    const hasSalaryTax = salaryTax === "gross" || salaryTax === "net";

    return [
      countText(department),
      countText(hiringManager),
      hasHeadcount,
      countText(workSchedule),
      Array.isArray(employmentForms) && employmentForms.length > 0,
      hasProbation,
      hasTravel,
      countText(benefits),
      countText(bonus),
      countText(mandatoryRequirements),
      countText(hiringProcess),
      countText(requirementsText),
      countText(responsibilitiesText),
      hasSalaryPeriod,
      hasSalaryTax,
    ].filter(Boolean).length;
  }, [advancedValues]);

  async function onSubmit(values: FormData) {
    try {
      setSubmitting(true);
      toast.loading("Сохраняю вакансию…", { description: undefined, id: `edit-vacancy-${vacancy.id}` });

      const requirements = parseVacancyListText(values.requirementsText);
      const responsibilities = parseVacancyListText(values.responsibilitiesText);

      const min = parseVacancySalaryValue(values.salaryMin);
      const max = parseVacancySalaryValue(values.salaryMax);
      const headcount = typeof values.headcount === "number" ? values.headcount : Number(values.headcount ?? "");
      const probation = typeof values.probationMonths === "number" ? values.probationMonths : Number(values.probationMonths ?? "");
      const travel = typeof values.travelPercent === "number" ? values.travelPercent : Number(values.travelPercent ?? "");

      const next = await updateVacancy(vacancy.id, {
        title: values.title.trim(),
        description: values.description.trim(),
        requirements,
        responsibilities,
        salaryMin: Number.isFinite(min) ? min : null,
        salaryMax: Number.isFinite(max) ? max : null,
        salaryCurrency: values.salaryCurrency,
        location: values.location.trim(),
        employmentType: values.employmentType,
        experienceLevel: values.experienceLevel,
        status: values.status,
        department: values.department?.trim() || undefined,
        hiringManager: values.hiringManager?.trim() || undefined,
        headcount: Number.isFinite(headcount) ? headcount : undefined,
        workSchedule: values.workSchedule?.trim() || undefined,
        employmentForms: values.employmentForms ?? [],
        salaryPeriod: values.salaryPeriod,
        salaryTax: values.salaryTax ?? null,
        bonus: values.bonus?.trim() || undefined,
        benefits: values.benefits?.trim() || undefined,
        probationMonths: Number.isFinite(probation) ? probation : null,
        travelPercent: Number.isFinite(travel) ? travel : null,
        mandatoryRequirements: values.mandatoryRequirements?.trim() || undefined,
        hiringProcess: values.hiringProcess?.trim() || undefined,
      });

      toast.success("Вакансия сохранена", { description: undefined, id: `edit-vacancy-${vacancy.id}` });
      onUpdated?.(next);
      setOpen(false);
    } catch (e) {
      toast.error("Не удалось сохранить вакансию", {
        id: `edit-vacancy-${vacancy.id}`,
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function onInvalid(errors: FieldErrors<FormData>) {
    const salaryField =
      getRhfErrorMessage(errors.salaryMin) ? "salaryMin" : getRhfErrorMessage(errors.salaryMax) ? "salaryMax" : null;
    const message =
      (salaryField ? getRhfErrorMessage(errors[salaryField]) : null) ??
      Object.values(errors).map(getRhfErrorMessage).find(Boolean) ??
      "Проверьте корректность заполнения.";

    toast.error("Проверьте поля формы", {
      id: `edit-vacancy-${vacancy.id}`,
      description: message,
    });

    try {
      if (salaryField) {
        form.setFocus(salaryField);
        return;
      }

      const firstField = Object.keys(errors)[0] as keyof FormData | undefined;
      if (firstField) form.setFocus(firstField);
    } catch {
      // ignore focus failures
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          form.reset({
            title: vacancy.title ?? "",
            location: vacancy.location ?? "Удаленно",
            employmentType: vacancy.employmentType ?? "full-time",
            experienceLevel: vacancy.experienceLevel ?? "middle",
            status: vacancy.status ?? "draft",
            department: vacancy.department ?? "",
            hiringManager: vacancy.hiringManager ?? "",
            headcount: (vacancy.headcount ?? 1).toString(),
            workSchedule: vacancy.workSchedule ?? "",
            employmentForms: vacancy.employmentForms ?? [],
            salaryPeriod: vacancy.salaryPeriod ?? "month",
            salaryTax: vacancy.salaryTax ?? null,
            bonus: vacancy.bonus ?? "",
            benefits: vacancy.benefits ?? "",
            probationMonths: typeof vacancy.probationMonths === "number" ? String(vacancy.probationMonths) : "",
            travelPercent: typeof vacancy.travelPercent === "number" ? String(vacancy.travelPercent) : "",
            mandatoryRequirements: vacancy.mandatoryRequirements ?? "",
            hiringProcess: vacancy.hiringProcess ?? "",
            description: vacancy.description ?? "",
            requirementsText: listToText(vacancy.requirements),
            responsibilitiesText: listToText(vacancy.responsibilities),
            salaryMin: vacancy.salary?.min?.toString?.() ?? "",
            salaryMax: vacancy.salary?.max?.toString?.() ?? "",
            salaryCurrency: vacancy.salary?.currency ?? DEFAULT_CURRENCY_CODE,
          });
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            Редактировать
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-2xl max-h-[min(90dvh,calc(100dvh-2rem))] overflow-visible flex flex-col"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Редактировать вакансию</DialogTitle>
          <DialogDescription>Изменения сохраняются сразу и влияют на AI анализ.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="min-h-0 flex flex-col gap-6">
            <ScrollArea className="h-[calc(90dvh-11.5rem)] max-h-[calc(100dvh-13.5rem)] min-h-[12rem] pr-3">
              <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Например: Frontend разработчик"
                        {...field}
                        maxLength={120}
                        disabled={submitting}
                        onChange={(event) => handleTextInputChange("title", field.onChange, event.target.value)}
                        onBeforeInput={(event) => handleTextLimitBeforeInput("title", 120, event)}
                        onPaste={(event) => handleTextLimitPaste("title", 120, event)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Локация *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Удаленно / Москва"
                        {...field}
                        maxLength={120}
                        disabled={submitting}
                        onChange={(event) => handleTextInputChange("location", field.onChange, event.target.value)}
                        onBeforeInput={(event) => handleTextLimitBeforeInput("location", 120, event)}
                        onPaste={(event) => handleTextLimitPaste("location", 120, event)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="employmentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="h-6 flex items-center leading-none">Занятость *</FormLabel>
                    <FormControl>
                      <select
                        className={selectClassName}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        disabled={submitting}
                      >
                        <option value="full-time">Полная занятость</option>
                        <option value="part-time">Частичная занятость</option>
                        <option value="contract">Проект / контракт</option>
                        <option value="internship">Стажировка</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="experienceLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="h-6 flex items-center leading-none">Уровень *</FormLabel>
                    <FormControl>
                      <select
                        className={selectClassName}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        disabled={submitting}
                      >
                        <option value="trainee">Стажер (Trainee)</option>
                        <option value="junior">Начальный (Junior)</option>
                        <option value="middle">Средний (Middle)</option>
                        <option value="senior">Высокий (Senior)</option>
                        <option value="lead">Ведущий (Lead)</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="h-6 flex items-center gap-2 leading-none">
                      Статус вакансии *
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label="Подсказка по статусам"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72">
                          <div className="space-y-2">
                            <div className="text-sm font-medium">Подсказка</div>
                            <div className="text-sm text-muted-foreground">{statusHint}</div>
                            <Separator />
                            <div className="text-xs text-muted-foreground">
                              Для добавления кандидатов подходят статусы{" "}
                              <Badge variant="secondary">Черновик</Badge> и <Badge variant="secondary">Активна</Badge>.
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </FormLabel>
                    <FormControl>
                      <select
                        className={selectClassName}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        disabled={submitting}
                      >
                        <option value="draft">Черновик</option>
                        <option value="active">Активна</option>
                        <option value="paused">На паузе</option>
                        <option value="closed">Закрыта</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Описание *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Кратко опишите роль, цели, команду, стек, формат работы…"
                      rows={6}
                      {...field}
                      maxLength={20000}
                      disabled={submitting}
                      onChange={(event) => handleTextInputChange("description", field.onChange, event.target.value)}
                      onBeforeInput={(event) => handleTextLimitBeforeInput("description", 20000, event)}
                      onPaste={(event) => handleTextLimitPaste("description", 20000, event)}
                    />
                  </FormControl>
                  <FormDescription>
                    Обычно достаточно полного описания вакансии. Требования и обязанности — опционально для
                    структурирования.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="salaryMin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Зарплата от</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="Напр. 150 000"
                        {...field}
                        maxLength={VACANCY_SALARY_MAX_INPUT_LENGTH}
                        disabled={submitting}
                        onChange={(event) => handleSalaryInputChange("salaryMin", field.onChange, event.target.value)}
                        onBlur={(event) => {
                          field.onBlur();
                          field.onChange(formatVacancySalaryInput(event.target.value));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salaryMax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Зарплата до</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="Напр. 250 000"
                        {...field}
                        maxLength={VACANCY_SALARY_MAX_INPUT_LENGTH}
                        disabled={submitting}
                        onChange={(event) => handleSalaryInputChange("salaryMax", field.onChange, event.target.value)}
                        onBlur={(event) => {
                          field.onBlur();
                          field.onChange(formatVacancySalaryInput(event.target.value));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salaryCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Валюта</FormLabel>
                    <FormControl>
                      <CurrencyCombobox value={field.value} onChange={field.onChange} disabled={submitting} />
                    </FormControl>
                    <FormDescription>
                      {hasUnsupportedSalaryCurrency
                        ? `Текущее значение "${salaryCurrencyValue?.trim()}" не поддерживается. Выберите валюту из списка.`
                        : "Выберите код валюты из списка."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="advanced" className="border rounded-md px-4">
                <AccordionTrigger className="no-underline hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">Дополнительно</span>
                    {advancedFilledCount > 0 ? (
                      <Badge variant="secondary" className="h-5 px-2 text-[11px]">
                        {advancedFilledCount}
                      </Badge>
                    ) : null}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-1 pt-2">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <div className="text-sm font-medium">Условия и процесс</div>
                        <div className="text-sm text-muted-foreground">
                          Эти поля не обязательны — заполняйте, только если хотите указать дополнительную информацию
                          для себя. Для ИИ-анализа достаточно подробно заполненного поля «Описание».
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm font-medium">Структурирование вакансии</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="requirementsText"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Требования</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Каждую строку — отдельным пунктом"
                                    rows={5}
                                    {...field}
                                    maxLength={2000}
                                    disabled={submitting}
                                  />
                                </FormControl>
                                <FormDescription>{VACANCY_LIST_FIELD_DESCRIPTION}</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="responsibilitiesText"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Обязанности</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Каждую строку — отдельным пунктом"
                                    rows={5}
                                    {...field}
                                    maxLength={2000}
                                    disabled={submitting}
                                  />
                                </FormControl>
                                <FormDescription>{VACANCY_LIST_FIELD_DESCRIPTION}</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <FormField
                          control={form.control}
                          name="department"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Подразделение</FormLabel>
                              <FormControl>
                                <Input placeholder="Напр.: Склад / Продажи" {...field} maxLength={120} disabled={submitting} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="hiringManager"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Руководитель</FormLabel>
                              <FormControl>
                                <Input placeholder="Кто принимает решение" {...field} maxLength={120} disabled={submitting} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="headcount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>План найма</FormLabel>
                              <FormControl>
                                <Input inputMode="numeric" placeholder="1" {...field} disabled={submitting} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="workSchedule"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>График</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="5/2, 2/2, сменный, гибкий…"
                                  {...field}
                                  maxLength={80}
                                  disabled={submitting}
                                  onChange={(event) =>
                                    handleTextInputChange("workSchedule", field.onChange, event.target.value)
                                  }
                                  onBeforeInput={(event) => handleTextLimitBeforeInput("workSchedule", 80, event)}
                                  onPaste={(event) => handleTextLimitPaste("workSchedule", 80, event)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="employmentForms"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Оформление</FormLabel>
                              <FormControl>
                                <EmploymentFormsMultiSelect
                                  value={field.value}
                                  onChange={field.onChange}
                                  disabled={submitting}
                                />
                              </FormControl>
                              <FormDescription>Можно выбрать несколько вариантов.</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="probationMonths"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Испытательный срок (мес.)</FormLabel>
                              <FormControl>
                                <Input inputMode="numeric" placeholder="Напр. 3" {...field} disabled={submitting} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="travelPercent"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Командировки (%)</FormLabel>
                              <FormControl>
                                <Input inputMode="numeric" placeholder="0" {...field} disabled={submitting} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="benefits"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Льготы / бонусы</FormLabel>
                              <FormControl>
                                <Textarea placeholder="ДМС, питание, проезд, премии…" rows={4} {...field} maxLength={5000} disabled={submitting} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="bonus"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Оплата переменной части</FormLabel>
                              <FormControl>
                                <Textarea placeholder="KPI, % от продаж, доплаты…" rows={4} {...field} maxLength={5000} disabled={submitting} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="mandatoryRequirements"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Обязательные требования</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Медкнижка, допуски, права категории, физ.нагрузка…"
                                rows={4}
                                {...field}
                                maxLength={10000}
                                disabled={submitting}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="hiringProcess"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Процесс найма</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Этапы, SLA, кто согласует, контакты…"
                                rows={4}
                                {...field}
                                maxLength={10000}
                                disabled={submitting}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <div className="text-sm font-medium">Зарплата (детали)</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="salaryPeriod"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Период</FormLabel>
                              <FormControl>
                                <select
                                  className={selectClassName}
                                  value={field.value}
                                  onChange={(e) => field.onChange(e.target.value)}
                                  disabled={submitting}
                                >
                                  <option value="month">В месяц</option>
                                  <option value="hour">В час</option>
                                  <option value="shift">За смену</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="salaryTax"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Налоги</FormLabel>
                              <FormControl>
                                <select
                                  className={selectClassName}
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value ? e.target.value : null)}
                                  disabled={submitting}
                                >
                                  <option value="">Не указано</option>
                                  <option value="gross">Gross</option>
                                  <option value="net">Net</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

              </div>
            </ScrollArea>

            <div className="shrink-0 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                Отмена
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Сохраняю…" : "Сохранить"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

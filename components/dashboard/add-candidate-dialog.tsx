"use client";

import { useEffect, useMemo, useRef, useState, type BaseSyntheticEvent, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Upload, FileText, X } from "lucide-react";
import { validateResumeFile } from "@/lib/resume-file-validation";
import type { Vacancy } from "@/types";
import { listVacancies } from "@/services/data/vacancies";
import { createCandidateAndQueueAnalysis, retryCandidateAnalysis } from "@/services/data/candidates";
import { getJobStatus, type JobStatus } from "@/services/data/jobs";
import { CreateVacancyDialog } from "@/components/dashboard/create-vacancy-dialog";
import { formatCountRu } from "@/lib/i18n/ru";
import {
  clearCandidateBatchToast,
  getCandidateBatchToastId,
  showCandidateBatchAcceptedToast,
  showCandidateBatchFailureToast,
  showCandidateBatchSuccessToast,
} from "@/lib/candidate-batch-toast";
import { createSingleFlightRunner } from "@/lib/async/single-flight";
import { buildCandidateCreateIdempotencyKey } from "@/lib/idempotency/candidate-create";
import { getCandidateInputLocks } from "@/lib/candidates/add-candidate-input-locks";

const MAX_CANDIDATE_DESCRIPTION_CHARS = 5000;

// Form validation schema
const formSchema = z
  .object({
    vacancyId: z.string().min(1, "Выберите вакансию"),
    method: z.enum(["pdf", "text"]),
    resumeFiles: z.custom<FileList>().optional(),
    textDescriptions: z
      .array(
        z.object({
          value: z.string().max(MAX_CANDIDATE_DESCRIPTION_CHARS, `Максимум ${MAX_CANDIDATE_DESCRIPTION_CHARS} символов`),
        })
      )
      .default([{ value: "" }]),
    saveResumeFile: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.method === "pdf") {
      const n = data.resumeFiles?.length ?? 0;
      if (n <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resumeFiles"],
          message: "Загрузите хотя бы один файл (PDF/DOC/DOCX/TXT)",
        });
      }
    }

    if (data.method === "text") {
      const trimmed = (data.textDescriptions ?? []).map((x) => x.value.trim());
      const nonEmpty = trimmed.filter((t) => t.length > 0);
      if (nonEmpty.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["textDescriptions"],
          message: "Введите хотя бы одно описание кандидата",
        });
        return;
      }

      const tooShort = nonEmpty.filter((t) => t.length < 20);
      if (tooShort.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["textDescriptions"],
          message: "Описание кандидата слишком короткое (минимум 20 символов)",
        });
      }
    }
  });

// NOTE: zodResolver works with schema *input* type (defaults make fields optional in input).
type FormData = z.input<typeof formSchema>;

interface AddCandidateDialogProps {
  vacancies?: Vacancy[];
  onCandidatesAdded?: () => void | Promise<void>;
  trigger?: ReactElement;
  openSignal?: number;
}

type JobItem = {
  label: string;
  candidateId?: string;
  jobId?: string;
  status: JobStatus | "skipped";
  failureKind: "create" | "analysis" | null;
  retryable: boolean;
  error?: string | null;
};

type SubmissionUiSession = {
  items: JobItem[];
  accepted: boolean;
};

type SetSessionItems = (
  session: SubmissionUiSession,
  sessionId: number,
  next: JobItem[] | ((prev: JobItem[]) => JobItem[])
) => void;

type SetSessionProgress = (sessionId: number, next: { current: number; total: number }) => void;

const RETRYABLE_ANALYSIS_FAILURE_MESSAGE = "AI-анализ не завершился. Можно повторить.";
const GENERIC_JOB_ITEM_FAILURE_MESSAGE = "Не удалось обработать файл. Попробуйте ещё раз.";
const SAFE_USER_FACING_UPPERCASE_TERMS = new Set(["PDF", "DOC", "DOCX", "TXT", "UTF"]);

function createCandidateDraftKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  const safeLimit = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: safeLimit }, async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= items.length) return;
        await worker(items[i], i);
      }
    })
  );
}

async function pollCandidateAnalysisUntilFinished({
  sessionId,
  session,
  total,
  setSessionItems,
  setSessionProgress,
}: {
  sessionId: number;
  session: SubmissionUiSession;
  total: number;
  setSessionItems: SetSessionItems;
  setSessionProgress: SetSessionProgress;
}) {
  const startedAt = Date.now();
  const MAX_POLL_MS = 10 * 60 * 1000;
  while (true) {
    if (Date.now() - startedAt > MAX_POLL_MS) {
      throw new Error("Превышено время ожидания AI анализа. Обновите страницу или попробуйте позже.");
    }

    const items = session.items;
    const active = items.filter((it) => it.jobId && (it.status === "queued" || it.status === "processing"));
    if (active.length === 0) return;

    // Be resilient: a single status fetch failure should not abort the entire batch.
    // Also cap concurrent status checks to avoid request spikes.
    await runWithConcurrency(active, Math.min(4, active.length), async (it) => {
      try {
        const s = await getJobStatus(String(it.jobId));
        const status = s.status;
        const failedForCredits = status === "failed" && isInsufficientCreditsError(s.lastError ?? s.error);
        setSessionItems(session, sessionId, (prev) =>
          prev.map((x) =>
            x.jobId === it.jobId
              ? {
                  ...x,
                  status: failedForCredits ? "skipped" : status,
                  failureKind: failedForCredits ? null : status === "failed" ? "analysis" : null,
                  retryable: failedForCredits ? false : status === "failed" ? Boolean(x.candidateId) : false,
                  error: failedForCredits ? null : status === "failed" ? s.lastError ?? s.error ?? null : null,
                }
              : x
          )
        );
      } catch (e) {
        // Keep previous status, but surface polling error (best-effort).
        const msg = e instanceof Error ? e.message : "Не удалось обновить статус";
        setSessionItems(session, sessionId, (prev) =>
          prev.map((x) => (x.jobId === it.jobId ? { ...x, error: msg } : x))
        );
      }
    });

    // Update progress.
    const after = session.items;
    setSessionProgress(sessionId, {
      current: after.filter((i) => i.status === "done" || i.status === "failed" || i.status === "skipped").length,
      total,
    });

    // Avoid tight loop.
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function getSafeRetryAnalysisFailureToastDescription(error: unknown): string {
  const fallback = "Не удалось запустить повторный анализ. Попробуйте ещё раз.";
  const message = error instanceof Error ? error.message.trim() : "";
  const hasUserFacingRussianText = /[А-Яа-яЁё]/.test(message);
  if (!message || !hasUserFacingRussianText || hasUnsafeDisplayedErrorDetails(message)) {
    return fallback;
  }

  return getSafeDisplayedBackendErrorMessage(message, fallback);
}

function getDefaultFormValues(): FormData {
  return {
    vacancyId: "",
    method: "pdf",
    textDescriptions: [{ value: "" }],
    saveResumeFile: false,
    resumeFiles: undefined,
  };
}

function isInsufficientCreditsError(text: string | null | undefined): boolean {
  const normalized = String(text ?? "").toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("insufficient credits") ||
    (normalized.includes("insufficient") && normalized.includes("credit")) ||
    (normalized.includes("недостат") && normalized.includes("кредит")) ||
    (normalized.includes("законч") && normalized.includes("кредит")) ||
    normalized.includes("23514")
  );
}

function hasUnsafeDisplayedErrorDetails(message: string): boolean {
  const unsafeCodeMatches = message.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];

  return (
    message.includes("AI_ANALYSIS_FAILED") ||
    unsafeCodeMatches.some((token) => !SAFE_USER_FACING_UPPERCASE_TERMS.has(token)) ||
    /tika|parser|provider|internal|request(?:[_ -]?id)?|stack(?: trace)?/i.test(message)
  );
}

function getSafeDisplayedBackendErrorMessage(message: string, fallback: string): string {
  if (!message || hasUnsafeDisplayedErrorDetails(message)) {
    return fallback;
  }

  return message;
}

function getUnsafeJobItemErrorFallback(item: JobItem): string {
  return item.failureKind === "analysis" ? RETRYABLE_ANALYSIS_FAILURE_MESSAGE : GENERIC_JOB_ITEM_FAILURE_MESSAGE;
}

function getJobItemErrorText(item: JobItem): string {
  const message = String(item.error ?? "").trim();
  if (!message) return "Неизвестная ошибка.";

  return getSafeDisplayedBackendErrorMessage(message, getUnsafeJobItemErrorFallback(item));
}

function getFailedJobItemErrorDisplay(item: JobItem): { inlineLabel: string; detail: string } {
  const detail = getJobItemErrorText(item);

  if (item.failureKind === "analysis") {
    return {
      inlineLabel: "Кандидат добавлен, однако анализ не был завершен из-за ошибки обработки.",
      detail,
    };
  }

  const normalized = detail.toLowerCase();

  if (isInsufficientCreditsError(detail)) {
    return { inlineLabel: "Не добавлен: нет кредитов", detail };
  }

  if (
    normalized.includes("слишком длин") ||
    normalized.includes("слишком много текста") ||
    (normalized.includes("текст") &&
      (normalized.includes("максимум") || normalized.includes("символ") || normalized.includes("слов")))
  ) {
    return { inlineLabel: "Не добавлен: слишком много текста", detail };
  }

  if (normalized.includes("формат") || normalized.includes("неподдерживаем")) {
    return { inlineLabel: "Не добавлен: неподдерживаемый формат", detail };
  }

  if (normalized.includes("слишком большой") || normalized.includes("5mb")) {
    return { inlineLabel: "Не добавлен: файл слишком большой", detail };
  }

  if (
    normalized.includes("не удалось прочитать") ||
    normalized.includes("не похож") ||
    normalized.includes("поврежден") ||
    normalized.includes("повреждён") ||
    normalized.includes("парол") ||
    normalized.includes("почти нет текста") ||
    normalized.includes("обрабатывался слишком долго")
  ) {
    return { inlineLabel: "Не добавлен: файл не прочитан", detail };
  }

  return { inlineLabel: "Не добавлен: проверьте файл", detail };
}

function formatFailedItemMessage(item: JobItem): string {
  return `${item.label}: ${getJobItemErrorText(item)}`;
}

function summarizeFailedItemMessages(items: JobItem[], maxVisible = 3): string {
  const messages = items.map(formatFailedItemMessage);
  const visible = messages.slice(0, maxVisible);
  const restCount = messages.length - visible.length;
  const base = visible.join(" ");
  if (restCount <= 0) return base;
  return `${base} Ещё ${formatCountRu(restCount, ["ошибка", "ошибки", "ошибок"])}.`;
}

function getBatchFailureToastContent(failedItems: JobItem[]): {
  title: string;
  description: string;
  showTariffAction: boolean;
} {
  const firstFailedItem = failedItems[0];
  const creditItems = failedItems.filter((item) => isInsufficientCreditsError(item.error));
  const nonCreditItems = failedItems.filter((item) => !isInsufficientCreditsError(item.error));
  const hasCreateFailures = failedItems.some((item) => item.failureKind === "create");
  const hasAnalysisFailures = failedItems.some((item) => item.failureKind === "analysis");
  const hasRetryableFailures = failedItems.some((item) => item.retryable);

  if (failedItems.length === 1 && firstFailedItem && !firstFailedItem.retryable && creditItems.length === 0) {
    return {
      title: "Не удалось обработать файл",
      description: formatFailedItemMessage(firstFailedItem),
      showTariffAction: false,
    };
  }

  const parts: string[] = [];
  if (creditItems.length > 0) {
    parts.push("Закончились кредиты: пополните баланс или обновите тариф, затем повторите анализ.");
  }
  if (nonCreditItems.length > 0) {
    parts.push(summarizeFailedItemMessages(nonCreditItems));
  }
  if (hasRetryableFailures && creditItems.length === 0) {
    parts.push("Для созданных кандидатов можно нажать «Повторить».");
  }

  let title = "Есть ошибки при добавлении кандидатов";
  if (hasAnalysisFailures && !hasCreateFailures) title = "Часть анализов завершилась ошибкой";
  if (hasCreateFailures && !hasAnalysisFailures) title = "Не все файлы удалось обработать";

  return {
    title,
    description: parts.join(" "),
    showTariffAction: creditItems.length > 0,
  };
}

export function AddCandidateDialog({ vacancies: vacanciesProp, onCandidatesAdded, trigger, openSignal }: AddCandidateDialogProps) {
  const MAX_RESUME_FILES = 10;
  const CREATE_CONCURRENCY = 3;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [canCloseWithoutDiscardConfirm, setCanCloseWithoutDiscardConfirm] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>(vacanciesProp ?? []);
  const [jobItems, setJobItems] = useState<JobItem[]>([]);
  const jobItemsRef = useRef<JobItem[]>([]);
  const visibleSubmissionSessionIdRef = useRef<number | null>(null);
  const submissionSessionCounterRef = useRef(0);
  const candidatesAddedInFlightRef = useRef(false);
  const candidatesAddedRefreshPendingRef = useRef(false);
  const pdfDropzoneRef = useRef<HTMLDivElement | null>(null);
  const textTabRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflight, setPreflight] = useState<null | { total: number; balance: number; allowed: number }>(null);
  const pendingDataRef = useRef<FormData | null>(null);

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  const runSubmitSingleFlight = useMemo(() => createSingleFlightRunner<void>(), []);
  const draftKeyRef = useRef<string>(createCandidateDraftKey());

  useEffect(() => {
    jobItemsRef.current = jobItems;
  }, [jobItems]);

  function setJobItemsSafe(next: JobItem[] | ((prev: JobItem[]) => JobItem[])) {
    setJobItems((prev) => {
      const resolved = typeof next === "function" ? (next as (p: JobItem[]) => JobItem[])(prev) : next;
      jobItemsRef.current = resolved;
      return resolved;
    });
  }

  async function flushCandidatesAdded() {
    if (!onCandidatesAdded) return;
    if (candidatesAddedInFlightRef.current) {
      candidatesAddedRefreshPendingRef.current = true;
      return;
    }

    candidatesAddedInFlightRef.current = true;
    try {
      do {
        candidatesAddedRefreshPendingRef.current = false;
        await onCandidatesAdded();
      } while (candidatesAddedRefreshPendingRef.current);
    } catch {
      // Parent refresh is best-effort; ignore errors here.
    } finally {
      candidatesAddedInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (vacanciesProp && vacanciesProp.length) setVacancies(vacanciesProp);
  }, [vacanciesProp]);

  useEffect(() => {
    if (!open) return;
    if (vacancies.length) return;
    let mounted = true;
    const load = async () => {
      try {
        const data = await listVacancies();
        if (mounted) setVacancies(data);
      } catch (e) {
        console.error("Failed to load vacancies:", e);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [open, vacancies.length]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultFormValues(),
  });

  const watchedVacancyId = useWatch({ control: form.control, name: "vacancyId" });
  const watchedMethod = useWatch({ control: form.control, name: "method" });
  const watchedTextDescriptions = useWatch({ control: form.control, name: "textDescriptions" });
  const watchedSaveResumeFile = useWatch({ control: form.control, name: "saveResumeFile" });
  const isSubmitPending = form.formState.isSubmitting;
  const isBusy = isProcessing || isSubmitPending;
  const inputLocks = getCandidateInputLocks({
    method: watchedMethod,
    selectedFilesCount: selectedFiles.length,
    textDescriptions: watchedTextDescriptions,
    isBusy,
  });
  const methodLockHint = inputLocks.isPdfLockedByCandidateDescriptions
    ? "Чтобы загрузить файл, очистите введённые описания."
    : inputLocks.isTextLockedByResumeFiles
      ? "Чтобы ввести описание, удалите выбранные файлы."
      : null;

  const isDraftDirty = useMemo(() => {
    const hasVacancy = watchedVacancyId.trim().length > 0;
    const changedMethod = watchedMethod !== "pdf";
    const hasSelectedFiles = selectedFiles.length > 0;
    const shouldSaveResumeFile = Boolean(watchedSaveResumeFile);
    const descriptions = watchedTextDescriptions ?? [];
    const hasMultipleDescriptionFields = descriptions.length > 1;
    const hasFilledDescription = descriptions.some((item) => item?.value?.trim().length > 0);

    return (
      hasVacancy ||
      changedMethod ||
      hasSelectedFiles ||
      shouldSaveResumeFile ||
      hasMultipleDescriptionFields ||
      hasFilledDescription
    );
  }, [selectedFiles.length, watchedMethod, watchedSaveResumeFile, watchedTextDescriptions, watchedVacancyId]);

  function isVisibleSubmissionSession(sessionId: number): boolean {
    return visibleSubmissionSessionIdRef.current === sessionId;
  }

  function beginVisibleSubmissionSession(): number {
    const sessionId = ++submissionSessionCounterRef.current;
    visibleSubmissionSessionIdRef.current = sessionId;
    setCanCloseWithoutDiscardConfirm(false);
    setJobItemsSafe([]);
    setProgress({ current: 0, total: 0 });
    setIsProcessing(true);
    return sessionId;
  }

  function setSessionItems(
    session: SubmissionUiSession,
    sessionId: number,
    next: JobItem[] | ((prev: JobItem[]) => JobItem[])
  ) {
    session.items = typeof next === "function" ? next(session.items) : next;
    if (isVisibleSubmissionSession(sessionId)) {
      setJobItemsSafe(session.items);
    }
  }

  function setSessionProgress(sessionId: number, next: { current: number; total: number }) {
    if (isVisibleSubmissionSession(sessionId)) {
      setProgress(next);
    }
  }

  function setSessionProcessing(sessionId: number, next: boolean) {
    if (isVisibleSubmissionSession(sessionId)) {
      setIsProcessing(next);
    }
  }

  function markSessionAccepted(session: SubmissionUiSession, sessionId: number) {
    if (session.accepted) return;
    session.accepted = true;
    if (isVisibleSubmissionSession(sessionId)) {
      setCanCloseWithoutDiscardConfirm(true);
    }
  }

  function resetDraftState() {
    form.reset(getDefaultFormValues());
    setSelectedFiles([]);
    setPreflightOpen(false);
    setPreflight(null);
    pendingDataRef.current = null;
    draftKeyRef.current = createCandidateDraftKey();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearVisibleSubmissionState() {
    visibleSubmissionSessionIdRef.current = null;
    setCanCloseWithoutDiscardConfirm(false);
    setJobItemsSafe([]);
    setProgress({ current: 0, total: 0 });
    setIsProcessing(false);
  }

  function resetVisibleBatchStatusAfterResumeFilesEdit() {
    if (jobItemsRef.current.length === 0) return;
    // Selected files changed after a batch result; old per-file rows are stale batch status now.
    clearVisibleSubmissionState();
  }

  function discardDraftAndClose() {
    setDiscardConfirmOpen(false);
    resetDraftState();
    clearVisibleSubmissionState();
    setOpen(false);
  }

  function closeAfterSubmit() {
    setDiscardConfirmOpen(false);
    resetDraftState();
    clearVisibleSubmissionState();
    setOpen(false);
  }

  function requestCloseDialog() {
    if (canCloseWithoutDiscardConfirm) {
      closeAfterSubmit();
      return;
    }

    if (isDraftDirty) {
      setDiscardConfirmOpen(true);
      return;
    }

    discardDraftAndClose();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true);
      return;
    }

    requestCloseDialog();
  }

  function fileKey(file: File) {
    return `${file.name}::${file.size}::${file.lastModified}`;
  }

  function toFileList(files: File[]): FileList {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    return dt.files;
  }

  function syncResumeFilesToForm(files: File[]) {
    form.setValue("resumeFiles", toFileList(files), { shouldDirty: true, shouldValidate: true });
    if (files.length > 0) form.clearErrors("resumeFiles");
  }

  function addResumeFiles(files: FileList | File[]) {
    if (isBusy) return;
    if (inputLocks.hasCandidateDescriptions && watchedMethod !== "pdf") {
      toast.message("Сначала очистите описания кандидатов", {
        description: "После этого можно будет загрузить файл резюме.",
      });
      return;
    }

    const incoming = Array.from(files ?? []);
    if (incoming.length === 0) return;

    const existingKeys = new Set(selectedFiles.map(fileKey));
    const next: File[] = [...selectedFiles];

    let skippedDuplicates = 0;
    let skippedOverflow = 0;
    let skippedInvalid = 0;

    for (const f of incoming) {
      if (next.length >= MAX_RESUME_FILES) {
        skippedOverflow++;
        continue;
      }

      const k = fileKey(f);
      if (existingKeys.has(k)) {
        skippedDuplicates++;
        continue;
      }

      const validation = validateResumeFile(f);
      if (!validation.valid) {
        skippedInvalid++;
        toast.error(`${f.name}: ${validation.error ?? "Некорректный файл"}`);
        continue;
      }

      existingKeys.add(k);
      next.push(f);
    }

    if (skippedOverflow > 0 || skippedDuplicates > 0) {
      const parts = [
        skippedOverflow > 0 ? `лишние: ${skippedOverflow}` : null,
        skippedDuplicates > 0 ? `дубликаты: ${skippedDuplicates}` : null,
      ].filter(Boolean);

      toast.message("Некоторые файлы не добавлены", {
        description: parts.join(", "),
      });
    }

    if (next.length !== selectedFiles.length) {
      resetVisibleBatchStatusAfterResumeFilesEdit();
    }

    setSelectedFiles(next);
    syncResumeFilesToForm(next);
  }

  const textDescriptions = useFieldArray({
    control: form.control,
    name: "textDescriptions",
  });

  const selectableVacancies = useMemo(
    () => vacancies.filter((v) => v.status === "active" || v.status === "draft"),
    [vacancies]
  );

  async function handleVacancyCreated(vacancyId: string) {
    try {
      const data = await listVacancies();
      setVacancies(data);
      form.setValue("vacancyId", vacancyId, { shouldValidate: true, shouldDirty: true });
      toast.success("Вакансия создана — можно добавлять кандидатов");
    } catch (e) {
      console.error("Failed to reload vacancies:", e);
    }
  }

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    addResumeFiles(files);
    // Allow selecting same file again later.
    e.target.value = "";
  };

  // Remove file
  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    if (newFiles.length === selectedFiles.length) return;

    resetVisibleBatchStatusAfterResumeFilesEdit();
    setSelectedFiles(newFiles);
    syncResumeFilesToForm(newFiles);
  };

  // Submit handler
  const onSubmit = async (data: FormData, opts?: { limitTo?: number; skipAnalysis?: boolean }) => {
    const sessionId = beginVisibleSubmissionSession();
    const session: SubmissionUiSession = { items: [], accepted: false };

    try {
      type FileTask = { label: string; file: File; idempotencyKey: string };
      type TextTask = { label: string; text: string; idempotencyKey: string };
      const draftKey = draftKeyRef.current;
      const tasks: Array<FileTask | TextTask> =
        data.method === "pdf"
          ? Array.from(data.resumeFiles ?? []).map((f, idx) => ({
              label: f.name,
              file: f,
              idempotencyKey: buildCandidateCreateIdempotencyKey({
                draftKey,
                vacancyId: data.vacancyId,
                source: "manual",
                saveResumeFile: Boolean(data.saveResumeFile),
                skipAiAnalysis: Boolean(opts?.skipAnalysis),
                task: {
                  kind: "file",
                  name: f.name,
                  size: f.size,
                  lastModified: f.lastModified,
                  index: idx,
                },
              }),
            }))
          : (data.textDescriptions ?? []).map((t, idx) => ({
              label: `Описание ${idx + 1}`,
              text: t.value.trim(),
              idempotencyKey: buildCandidateCreateIdempotencyKey({
                draftKey,
                vacancyId: data.vacancyId,
                source: "manual",
                saveResumeFile: Boolean(data.saveResumeFile),
                skipAiAnalysis: Boolean(opts?.skipAnalysis),
                task: {
                  kind: "text",
                  text: t.value.trim(),
                  index: idx,
                },
              }),
            }));

      const tasksLimited = typeof opts?.limitTo === "number" ? tasks.slice(0, Math.max(0, opts.limitTo)) : tasks;

      setSessionProgress(sessionId, { current: 0, total: tasksLimited.length });
      showCandidateBatchAcceptedToast(toast, {
        sessionId,
        total: tasksLimited.length,
        skipAnalysis: Boolean(opts?.skipAnalysis),
      });

      const initialItems: JobItem[] = tasksLimited.map((t) => ({
        label: t.label,
        status: "queued",
        failureKind: null,
        retryable: false,
        error: null,
      }));
      setSessionItems(session, sessionId, initialItems);

      const createdCandidateIds: string[] = [];

      // Create candidates + queue jobs (parallel with a safe concurrency cap)
      await runWithConcurrency(tasksLimited, CREATE_CONCURRENCY, async (task, i) => {
        try {
          const { candidateId, jobId } = await createCandidateAndQueueAnalysis({
            vacancyId: data.vacancyId,
            resumeText: "file" in task ? undefined : task.text,
            source: "manual",
            resumeFile: "file" in task ? task.file : undefined,
            saveResumeFile: data.saveResumeFile,
            skipAiAnalysis: Boolean(opts?.skipAnalysis),
            idempotencyKey: task.idempotencyKey,
          });

          createdCandidateIds.push(candidateId);

          setSessionItems(session, sessionId, (prev) =>
            prev.map((it, idx) =>
              idx === i
                ? {
                    ...it,
                    candidateId,
                    jobId: jobId ?? undefined,
                    status: jobId ? "queued" : "skipped",
                    failureKind: null,
                    retryable: false,
                    error: null,
                  }
                : it
            )
          );
          markSessionAccepted(session, sessionId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Не удалось создать кандидата";
          setSessionItems(session, sessionId, (prev) =>
            prev.map((it, idx) =>
              idx === i
                ? {
                    ...it,
                    status: "failed",
                    failureKind: "create",
                    retryable: false,
                    error: msg,
                  }
                : it
            )
          );
        }
      });

      // Ensure the candidates list is refreshed at least once right after the create/queue phase.
      await flushCandidatesAdded();

      const hasQueuedAnalysis = session.items.some((i) => i.jobId && i.status === "queued");
      if (hasQueuedAnalysis) {
        // Start AI polling in the background so a closed dialog does not block the next manual batch.
        void finishCandidateBatchAnalysisInBackground(sessionId, session, tasksLimited.length, createdCandidateIds);
        return;
      }

      // No polling needed.
      setSessionProgress(sessionId, { current: tasksLimited.length, total: tasksLimited.length });

      const failedItems = session.items.filter((i) => i.status === "failed");
      if (failedItems.length > 0) {
        const failureToast = getBatchFailureToastContent(failedItems);
        showCandidateBatchFailureToast(toast, {
          sessionId,
          title: failureToast.title,
          description: failureToast.description,
          action: failureToast.showTariffAction
            ? {
                label: "Тариф",
                onClick: () => router.push("/dashboard/settings?tab=plan"),
              }
            : undefined,
        });
        setSessionProcessing(sessionId, false);
        return;
      }

      showCandidateBatchSuccessToast(toast, {
        sessionId,
        createdCandidateCount: createdCandidateIds.length,
        skipAnalysis: true,
        action: {
          label: "Открыть тариф",
          onClick: () => router.push("/dashboard/settings?tab=plan"),
        },
      });

      // Final refresh so the main list catches up quickly (scores, job statuses).
      await flushCandidatesAdded();

      // Close dialog and reset state
      if (isVisibleSubmissionSession(sessionId)) {
        closeAfterSubmit();
      }
    } catch (error) {
      console.error("Error adding candidates:", error);
      const msg = error instanceof Error ? error.message : "Попробуйте еще раз";
      const canSuggestText =
        typeof msg === "string" &&
        (msg.toLowerCase().includes("скан") ||
          msg.toLowerCase().includes("почти нет текста") ||
          msg.toLowerCase().includes("в виде текста"));

      showCandidateBatchFailureToast(toast, {
        sessionId,
        title: "Ошибка при добавлении кандидатов",
        description: msg,
        action: canSuggestText
          ? {
              label: "Ввести описание",
              onClick: () => {
                form.setValue("method", "text", { shouldDirty: true, shouldValidate: true });
                setTimeout(() => textTabRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
              },
            }
          : undefined,
      });
      setSessionProcessing(sessionId, false);
    }
  };

  async function finishCandidateBatchAnalysisInBackground(
    sessionId: number,
    session: SubmissionUiSession,
    total: number,
    createdCandidateIds: string[]
  ) {
    try {
      await pollCandidateAnalysisUntilFinished({
        sessionId,
        session,
        total,
        setSessionItems,
        setSessionProgress,
      });

      const failedItems = session.items.filter((i) => i.status === "failed");
      if (failedItems.length > 0) {
        const failureToast = getBatchFailureToastContent(failedItems);
        showCandidateBatchFailureToast(toast, {
          sessionId,
          title: failureToast.title,
          description: failureToast.description,
          action: failureToast.showTariffAction
            ? {
                label: "Тариф",
                onClick: () => router.push("/dashboard/settings?tab=plan"),
              }
            : undefined,
        });
        setSessionProcessing(sessionId, false);
        return;
      }

      const skippedItems = session.items.filter((i) => i.status === "skipped");
      showCandidateBatchSuccessToast(toast, {
        sessionId,
        createdCandidateCount: createdCandidateIds.length,
        skipAnalysis: skippedItems.length > 0,
        noAnalysisCount: skippedItems.length,
        action: skippedItems.length > 0
          ? {
              label: "Открыть тариф",
              onClick: () => router.push("/dashboard/settings?tab=plan"),
            }
          : undefined,
      });

      // Final refresh so the main list catches up quickly (scores, job statuses).
      await flushCandidatesAdded();

      // Close dialog and reset state if the user kept this batch visible.
      if (isVisibleSubmissionSession(sessionId)) {
        closeAfterSubmit();
      }
    } catch (error) {
      console.error("Error polling candidate analysis:", error);
      const rawMessage = error instanceof Error ? error.message : "";
      showCandidateBatchFailureToast(toast, {
        sessionId,
        title: "Не удалось обновить статус AI-анализа",
        description: getSafeDisplayedBackendErrorMessage(rawMessage, "Обновите список кандидатов через несколько минут."),
      });
      setSessionProcessing(sessionId, false);
    }
  }

  async function getCreditsAvailable(): Promise<number | null> {
    try {
      const res = await fetch("/api/credits/balance", { method: "GET" });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) return null;
      const available =
        json && typeof json === "object" && "available" in json && typeof (json as { available?: unknown }).available === "number"
          ? (json as { available: number }).available
          : null;
      if (typeof available === "number") return available;
      const balance =
        json && typeof json === "object" && "balance" in json && typeof (json as { balance?: unknown }).balance === "number"
          ? (json as { balance: number }).balance
          : null;
      return typeof balance === "number" ? balance : null;
    } catch {
      return null;
    }
  }

  const onInvalid = (errors: FieldErrors<FormData>) => {
    // react-hook-form doesn't guarantee ordering; we just pick the first visible error.
    const first = Object.entries(errors)[0];
    if (!first) {
      toast.error("Проверьте поля формы", { description: "Не удалось отправить форму." });
      return;
    }

    const [name, err] = first;
    const msg = getRhfErrorMessage(err) ?? "Проверьте корректность заполнения.";

    toast.error("Форма заполнена не полностью", { description: msg });

    // Best-effort focus.
    try {
      if (name === "resumeFiles") {
        pdfDropzoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (name === "textDescriptions") {
        textTabRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      const values = form.getValues();
      if (name in values) {
        form.setFocus(name as keyof FormData);
      }
    } catch {
      // ignore
    }
  };

  function submitForm(event?: BaseSyntheticEvent) {
    void form.handleSubmit(
      async (data) => {
        if (isProcessing) return;

        return runSubmitSingleFlight(async () => {
          // Preflight credits for better batch UX (Supabase mode).
          const tasksCount =
            data.method === "pdf"
              ? selectedFiles.length
              : (data.textDescriptions ?? []).map((x) => x.value.trim()).filter((t) => t.length > 0).length;

          // Nothing to do (should be prevented by validation).
          if (tasksCount <= 0) return;

          const available = await getCreditsAvailable();
          if (typeof available === "number") {
            if (available <= 0) {
              pendingDataRef.current = data;
              setPreflight({ total: tasksCount, balance: available, allowed: 0 });
              setPreflightOpen(true);
              return;
            }

            if (available < tasksCount) {
              pendingDataRef.current = data;
              setPreflight({ total: tasksCount, balance: available, allowed: Math.max(0, available) });
              setPreflightOpen(true);
              return;
            }
          }

          await onSubmit(data);
        });
      },
      onInvalid
    )(event);
  }

  const submitHint = useMemo(() => {
    if (isBusy) return null;
    if (selectableVacancies.length === 0) return "Сначала создайте вакансию (можно «Черновик»).";

    const method = form.getValues("method");
    if (method === "pdf") {
      const n = form.getValues("resumeFiles")?.length ?? 0;
      if (n === 0) return "Загрузите хотя бы один файл (PDF/DOC/DOCX/TXT).";
      return null;
    }

    const texts = (form.getValues("textDescriptions") ?? []).map((x) => x.value.trim());
    const nonEmpty = texts.filter((t) => t.length > 0);
    if (nonEmpty.length === 0) return "Введите хотя бы одно описание кандидата.";
    const tooShort = nonEmpty.some((t) => t.length < 20);
    if (tooShort) return "Описание слишком короткое — нужно минимум 20 символов.";
    return null;
  }, [form, isBusy, selectableVacancies.length]);

  const completedCount = useMemo(
    () => jobItems.filter((i) => i.status === "done" || i.status === "failed" || i.status === "skipped").length,
    [jobItems]
  );
  const preflightEffectiveAllowed = preflight ? Math.min(Math.max(0, preflight.allowed), preflight.total) : 0;
  const preflightZeroCredits = preflight ? preflight.balance <= 0 || preflightEffectiveAllowed <= 0 : false;

  async function handleRetry(index: number) {
    const item = jobItemsRef.current[index];
    const sessionId = visibleSubmissionSessionIdRef.current;
    if (!item?.candidateId) return;
    if (!sessionId) return;

    const session: SubmissionUiSession = {
      items: jobItemsRef.current,
      accepted: true,
    };

    try {
      setSessionProcessing(sessionId, true);
      toast.loading("AI анализ идёт в фоне…", { description: undefined, id: getCandidateBatchToastId(sessionId) });
      setSessionItems(session, sessionId, (prev) =>
        prev.map((x, i) =>
          i === index ? { ...x, status: "queued", failureKind: null, retryable: false, error: null } : x
        )
      );

      const { jobId } = await retryCandidateAnalysis(item.candidateId);
      markSessionAccepted(session, sessionId);
      setSessionItems(session, sessionId, (prev) =>
        prev.map((x, i) =>
          i === index ? { ...x, jobId, status: "queued", failureKind: null, retryable: false, error: null } : x
        )
      );

      await pollCandidateAnalysisUntilFinished({
        sessionId,
        session,
        total: progress.total || session.items.length,
        setSessionItems,
        setSessionProgress,
      });

      const failed = session.items.filter((i) => i.status === "failed");
      const skipped = session.items.some((i) => i.status === "skipped");
      if (skipped) {
        clearCandidateBatchToast(toast, sessionId);
        toast.message("AI-анализ сейчас недоступен", {
          description: "После оплаты или пополнения баланса запустите анализ из списка кандидатов.",
          action: {
            label: "Открыть тариф",
            onClick: () => router.push("/dashboard/settings?tab=plan"),
          },
        });
        return;
      }

      if (failed.length === 0) {
        clearCandidateBatchToast(toast, sessionId);
        toast.success("AI анализ завершён");
      }
    } catch (e) {
      clearCandidateBatchToast(toast, sessionId);
      toast.error("Не удалось повторить анализ", {
        description: getSafeRetryAnalysisFailureToastDescription(e),
      });
    } finally {
      setSessionProcessing(sessionId, false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Добавить кандидата</span>
            <span className="sm:hidden">Добавить</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl h-[min(90dvh,calc(100dvh-2rem))] max-h-[min(90dvh,calc(100dvh-2rem))] overflow-visible flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Добавить кандидатов</DialogTitle>
          <DialogDescription>
            Загрузите файлы резюме (до 10 файлов) или введите описание кандидатов (до 5 полей)
          </DialogDescription>
        </DialogHeader>

        <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Закрыть форму?</AlertDialogTitle>
              <AlertDialogDescription>
                Введённые данные очистятся.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Продолжить заполнение</AlertDialogCancel>
              <AlertDialogAction onClick={discardDraftAndClose}>
                Закрыть и очистить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={preflightOpen}
          onOpenChange={(nextOpen) => {
            setPreflightOpen(nextOpen);
            if (!nextOpen) {
              pendingDataRef.current = null;
              setPreflight(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {preflightZeroCredits ? "Недостаточно кредитов для AI-анализа" : "Не хватает кредитов для всех кандидатов"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {!preflight
                  ? "Не удалось проверить баланс."
                  : preflightZeroCredits
                    ? "У вас сейчас нет кредитов. Добавьте кандидатов без анализа или перейдите в тариф, чтобы пополнить баланс."
                    : `Сейчас у вас ${formatCountRu(preflight.balance, ["кредит", "кредита", "кредитов"])}. Можно запустить AI-анализ для ${preflightEffectiveAllowed} из ${formatCountRu(
                        preflight.total,
                        ["кандидат", "кандидата", "кандидатов"]
                      )}.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {preflight ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {!preflightZeroCredits ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    onClick={async () => {
                      const data = pendingDataRef.current;
                      setPreflightOpen(false);
                      if (!data) return;
                      pendingDataRef.current = null;
                      setPreflight(null);
                      await runSubmitSingleFlight(async () => {
                        await onSubmit(data, { skipAnalysis: true });
                      });
                    }}
                    disabled={isBusy}
                  >
                    Добавить без анализа
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => {
                    setPreflightOpen(false);
                    pendingDataRef.current = null;
                    setPreflight(null);
                    router.push("/dashboard/settings?tab=plan");
                  }}
                  disabled={isBusy}
                >
                  Перейти в тариф
                </Button>
              </div>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  pendingDataRef.current = null;
                  setPreflight(null);
                }}
                disabled={isBusy}
              >
                Позже
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const data = pendingDataRef.current;
                  const allowed = preflightEffectiveAllowed;
                  setPreflightOpen(false);
                  if (!data) return;
                  pendingDataRef.current = null;
                  setPreflight(null);
                  if (preflightZeroCredits) {
                    await runSubmitSingleFlight(async () => {
                      await onSubmit(data, { skipAnalysis: true });
                    });
                    return;
                  }
                  if (allowed <= 0) return;
                  await runSubmitSingleFlight(async () => {
                    await onSubmit(data, { limitTo: allowed });
                  });
                }}
                disabled={isBusy}
              >
                {preflightZeroCredits ? "Добавить без анализа" : `Продолжить (${preflight ? preflightEffectiveAllowed : "—"})`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Form {...form}>
          <form
            onSubmit={submitForm}
            className="min-h-0 flex flex-1 flex-col gap-6"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (e.shiftKey) return;
              if (isBusy) return;

              const target = e.target as HTMLElement | null;
              const tag = target?.tagName?.toLowerCase();
              if (tag === "textarea") return;

              // Radix Select uses a button trigger; don't hijack Enter there.
              if (tag === "button" && target?.getAttribute("aria-haspopup") === "listbox") return;

              // Don't hijack file picker interactions.
              if (tag === "input" && (target as HTMLInputElement).type === "file") return;

              e.preventDefault();
              submitForm();
            }}
          >
            <ScrollArea className="min-h-0 flex-1 pr-3">
              <div className="space-y-6">
            {/* Vacancy Selection */}
            <FormField
              control={form.control}
              name="vacancyId"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel>Вакансия *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isBusy || selectableVacancies.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger className="min-w-0">
                        <SelectValue placeholder="Выберите вакансию" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {selectableVacancies.map((vacancy) => (
                        <SelectItem key={vacancy.id} value={vacancy.id}>
                          {vacancy.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Выберите вакансию, на которую добавляются кандидаты
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectableVacancies.length === 0 && (
              <Alert>
                <AlertTitle>Сначала создайте вакансию</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    Кандидат обязательно привязан к вакансии. Создайте вакансию (можно{" "}
                    <strong>Черновик</strong>) и сразу продолжайте добавление кандидатов.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <CreateVacancyDialog
                      trigger={<Button className="w-full sm:w-auto">Создать вакансию</Button>}
                      defaultStatus="draft"
                      onCreated={handleVacancyCreated}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        void (async () => {
                          const data = await listVacancies();
                          setVacancies(data);
                        })();
                      }}
                      disabled={isBusy}
                    >
                      Обновить список
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Method Selection */}
            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <Tabs
                    value={field.value}
                    onValueChange={(nextMethod) => {
                      if (nextMethod === "pdf" && inputLocks.isPdfTabDisabled) return;
                      if (nextMethod === "text" && inputLocks.isTextTabDisabled) return;
                      field.onChange(nextMethod);
                    }}
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger
                        value="pdf"
                        disabled={inputLocks.isPdfTabDisabled}
                        title={
                          inputLocks.isPdfLockedByCandidateDescriptions
                            ? "Очистите описания кандидатов, чтобы загрузить файл"
                            : undefined
                        }
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Загрузить файл
                      </TabsTrigger>
                      <TabsTrigger
                        value="text"
                        disabled={inputLocks.isTextTabDisabled}
                        title={
                          inputLocks.isTextLockedByResumeFiles
                            ? "Удалите выбранные файлы, чтобы ввести описание"
                            : undefined
                        }
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Ввести описание
                      </TabsTrigger>
                    </TabsList>
                    {methodLockHint ? (
                      <FormDescription className="mt-2">
                        {methodLockHint}
                      </FormDescription>
                    ) : null}

                    {/* File Upload Tab */}
                    <TabsContent value="pdf" className="space-y-4">
                      <div
                        ref={pdfDropzoneRef}
                        role="button"
                        tabIndex={isBusy ? -1 : 0}
                        aria-label="Загрузить файл резюме (PDF/DOC/DOCX/TXT)"
                        aria-disabled={isBusy}
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          isDragging ? "border-primary bg-primary/5" : "border-border"
                        } ${isBusy ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                        onClick={() => {
                          if (isBusy) return;
                          fileInputRef.current?.click();
                        }}
                        onKeyDown={(e) => {
                          if (isBusy) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            fileInputRef.current?.click();
                          }
                        }}
                        onDragEnter={(e) => {
                          if (isBusy) return;
                          e.preventDefault();
                          e.stopPropagation();
                          dragCounterRef.current += 1;
                          setIsDragging(true);
                        }}
                        onDragOver={(e) => {
                          if (isBusy) return;
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDragLeave={(e) => {
                          if (isBusy) return;
                          e.preventDefault();
                          e.stopPropagation();
                          dragCounterRef.current -= 1;
                          if (dragCounterRef.current <= 0) {
                            dragCounterRef.current = 0;
                            setIsDragging(false);
                          }
                        }}
                        onDrop={(e) => {
                          if (isBusy) return;
                          e.preventDefault();
                          e.stopPropagation();
                          dragCounterRef.current = 0;
                          setIsDragging(false);
                          const files = e.dataTransfer?.files;
                          if (!files || files.length === 0) return;
                          addResumeFiles(files);
                        }}
                      >
                        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <label
                          htmlFor="resume-upload"
                          className="cursor-pointer"
                          onClick={(e) => {
                            // Prevent bubbling into the dropzone onClick to avoid double-opening the picker.
                            e.stopPropagation();
                          }}
                        >
                          <span className="text-sm text-muted-foreground">
                            Нажмите для загрузки или перетащите файлы
                          </span>
                          <input
                            id="resume-upload"
                            type="file"
                            accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                            multiple
                            className="hidden"
                            onChange={handleFileChange}
                            disabled={isBusy}
                            ref={fileInputRef}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </label>
                        <p className="text-xs text-muted-foreground mt-2">
                          PDF/DOC/DOCX/TXT до 5MB каждый, максимум 10 файлов
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Если файл содержит только скан или картинку, текст может не извлечься. В этом случае загрузите другой файл или используйте вкладку «Ввести описание».
                        </p>
                      </div>

                      {form.formState.errors.resumeFiles ? (
                        <p className="text-[0.8rem] font-medium text-destructive">
                          {String(form.formState.errors.resumeFiles.message ?? "Загрузите хотя бы один файл")}
                        </p>
                      ) : null}

                      {/* Save file option */}
                      <TooltipProvider>
                        <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
                          <FormField
                            control={form.control}
                            name="saveResumeFile"
                            render={({ field }) => (
                              <FormItem className="flex items-start gap-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={(v) => field.onChange(Boolean(v))}
                                    disabled={isBusy}
                                    aria-label="Сохранить файл резюме"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <FormLabel className="cursor-help">
                                        Сохранить файл резюме
                                      </FormLabel>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-sm">
                                      Если включить — файл (PDF/DOC/DOCX/TXT) будет сохранён, и его можно будет скачать из карточки кандидата.
                                      Если выключить — сохранится только информация о кандидате и извлечённый текст, скачать файл будет нельзя.
                                    </TooltipContent>
                                  </Tooltip>
                                  <FormDescription>
                                    По умолчанию выключено (только текст для AI анализа).
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      </TooltipProvider>

                      {/* Selected Files */}
                      {selectedFiles.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">
                            Выбрано файлов: {selectedFiles.length}
                          </p>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {selectedFiles.map((file, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-2 bg-muted rounded text-sm"
                              >
                                <span className="truncate flex-1">{file.name}</span>
                                <span className="text-xs text-muted-foreground mx-2">
                                  {(file.size / 1024).toFixed(1)} KB
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFile(index)}
                                  disabled={isBusy}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* Text Input Tab */}
                    <TabsContent value="text" className="space-y-4">
                      <div ref={textTabRef} />
                      {textDescriptions.fields.map((field, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <FormLabel>
                              Описание кандидата {index + 1}
                            </FormLabel>
                            {textDescriptions.fields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => textDescriptions.remove(index)}
                                disabled={isBusy}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Textarea
                            placeholder="Введите описание кандидата (опыт, навыки, образование...)"
                            {...form.register(`textDescriptions.${index}.value`)}
                            maxLength={MAX_CANDIDATE_DESCRIPTION_CHARS}
                            rows={4}
                            disabled={isBusy}
                          />
                          <p className="text-xs text-muted-foreground text-right">
                            {(watchedTextDescriptions?.[index]?.value ?? "").length} / {MAX_CANDIDATE_DESCRIPTION_CHARS}
                          </p>
                        </div>
                      ))}

                      {textDescriptions.fields.length < 5 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => textDescriptions.append({ value: "" })}
                          disabled={isBusy}
                          className="w-full"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Добавить поле ({textDescriptions.fields.length}/5)
                        </Button>
                      )}

                      {form.formState.errors.textDescriptions ? (
                        <p className="text-[0.8rem] font-medium text-destructive">
                          {String(form.formState.errors.textDescriptions.message ?? "Проверьте описание кандидата")}
                        </p>
                      ) : null}
                    </TabsContent>
                  </Tabs>
                </FormItem>
              )}
            />

            {/* Progress Bar */}
            {isProcessing && progress.total > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Обработка {progress.current} из {progress.total}...
                  </span>
                  <span className="font-medium">
                    {Math.round((progress.current / progress.total) * 100)}%
                  </span>
                </div>
                <Progress value={(progress.current / progress.total) * 100} />
              </div>
            )}

            {/* Per-item statuses */}
            {jobItems.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  Статус: {completedCount}/{jobItems.length}
                </div>
                <TooltipProvider>
                  <div className="space-y-1 max-h-56 overflow-y-auto rounded-md border p-2">
                    {jobItems.map((item, idx) => {
                      const failedErrorDisplay =
                        item.status === "failed" && item.error
                          ? getFailedJobItemErrorDisplay(item)
                          : null;

                      return (
                        <div key={`${item.label}-${idx}`} className="rounded-sm px-1 py-1">
                          <div className="flex items-start justify-between gap-3 text-sm">
                            <div className="min-w-0 flex-1">
                              <span className="block truncate">{item.label}</span>
                              {failedErrorDisplay ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      tabIndex={0}
                                      className="mt-1 block max-w-full truncate text-xs text-destructive cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    >
                                      {failedErrorDisplay.inlineLabel}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="start" className="max-w-sm break-words">
                                    {failedErrorDisplay.detail}
                                  </TooltipContent>
                                </Tooltip>
                              ) : null}
                            </div>
                            <div className="flex min-w-[6.5rem] shrink-0 items-center justify-end gap-2">
                              {item.status === "queued" ? (
                                <Badge variant="secondary" className="shrink-0 whitespace-nowrap">В очереди</Badge>
                              ) : item.status === "processing" ? (
                                <Badge variant="secondary" className="shrink-0 whitespace-nowrap">Анализируем</Badge>
                              ) : item.status === "skipped" ? (
                                <Badge variant="outline" className="shrink-0 whitespace-nowrap">Без анализа</Badge>
                              ) : item.status === "done" ? (
                                <Badge className="shrink-0 whitespace-nowrap">Готово</Badge>
                              ) : item.status === "failed" ? (
                                <>
                                  <Badge variant="destructive" className="shrink-0 whitespace-nowrap">Ошибка</Badge>
                                  {item.retryable ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleRetry(idx)}
                                      disabled={isBusy || !item.candidateId}
                                      className="h-8 shrink-0 whitespace-nowrap px-2"
                                    >
                                      Повторить
                                    </Button>
                                  ) : null}
                                </>
                              ) : (
                                <Badge variant="outline" className="shrink-0 whitespace-nowrap">{item.status}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </div>
            )}

              </div>
            </ScrollArea>

            {/* Submit Button */}
            <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              {submitHint ? (
                <div className="max-w-[28rem] text-xs text-muted-foreground leading-snug sm:mr-auto">
                  {submitHint}
                </div>
              ) : null}

              {/*
                UX note:
                - While there are per-item results on screen, primary action becomes "Готово" (close),
                  so user doesn’t click "Добавить" again thinking candidates weren’t added.
              */}
              {(() => {
                const hasResults = canCloseWithoutDiscardConfirm && jobItems.length > 0 && !isProcessing;
                return (
                  <>
              <Button
                type="button"
                variant="outline"
                onClick={requestCloseDialog}
              >
                {hasResults ? "Закрыть" : "Отмена"}
              </Button>
              <Button
                type="button"
                onClick={() => (hasResults ? handleOpenChange(false) : submitForm())}
                disabled={isBusy || selectableVacancies.length === 0}
              >
                {isProcessing ? "Обработка..." : isSubmitPending ? "Проверяем..." : hasResults ? "Готово" : "Добавить"}
              </Button>
                  </>
                );
              })()}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function getRhfErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && msg.trim().length > 0 ? msg : null;
}

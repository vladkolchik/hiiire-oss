import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () => readFileSync("components/dashboard/add-candidate-dialog.tsx", "utf8");
const technicalLeakPattern =
  /Tika|parser|provider error|provider details|internal|request[_ -]?id|request|stack trace|stack|RESUME_|PDF_|DOCX_|TXT_|INVALID_BODY|Too big|Too small|expected string/i;

test("failed non-retryable upload rows render short text with full safe detail in a tooltip", () => {
  const dialog = source();

  assert.match(dialog, /function getFailedJobItemErrorDisplay\(item: JobItem\)/);
  assert.match(dialog, /inlineLabel: "Не добавлен: слишком много текста"/);
  assert.match(dialog, /inlineLabel: "Не добавлен: файл не прочитан"/);
  assert.match(dialog, /inlineLabel: "Не добавлен: проверьте файл"/);
  assert.match(dialog, /const detail = getJobItemErrorText\(item\)/);
  assert.match(dialog, /<Tooltip>/);
  assert.match(dialog, /<TooltipTrigger asChild>/);
  assert.match(dialog, /<TooltipContent[^>]*\bmax-w-sm\b[^>]*\bbreak-words\b/);
  assert.match(dialog, /failedErrorDisplay\.inlineLabel/);
  assert.match(dialog, /failedErrorDisplay\.detail/);
});

test("failed row layout keeps filename, error text, status, and retry action contained", () => {
  const dialog = source();

  assert.match(dialog, /className="[^"]*\bmin-w-0\b[^"]*\bflex-1\b/);
  assert.match(dialog, /className="[^"]*\btruncate\b/);
  assert.match(dialog, /className="[^"]*\bmax-w-full\b[^"]*\btruncate\b/);
  assert.match(dialog, /className="[^"]*\bmin-w-\[[^"]*\bshrink-0\b/);
  assert.match(dialog, /className="[^"]*\bshrink-0\b[^"]*\bwhitespace-nowrap\b/);
});

test("row-error detail path does not hardcode raw technical terms into user-facing copy", () => {
  const dialog = source();
  const helperStart = dialog.indexOf("function getFailedJobItemErrorDisplay(item: JobItem)");
  const renderStart = dialog.indexOf("{jobItems.map((item, idx) =>");

  assert.notEqual(helperStart, -1);
  assert.notEqual(renderStart, -1);

  const helper = dialog.slice(helperStart, dialog.indexOf("function formatFailedItemMessage", helperStart));
  const render = dialog.slice(renderStart, dialog.indexOf("{/* Submit Button */}", renderStart));

  assert.doesNotMatch(helper, technicalLeakPattern);
  assert.doesNotMatch(render, technicalLeakPattern);
});

test("source-level contract: failed create row says no candidate was added for that resume", () => {
  const dialog = source();

  const renderStart = dialog.indexOf("{jobItems.map((item, idx) =>");
  const helperStart = dialog.indexOf("function getFailedJobItemErrorDisplay(item: JobItem)");
  assert.notEqual(renderStart, -1);
  assert.notEqual(helperStart, -1);

  const render = dialog.slice(renderStart, dialog.indexOf("{/* Submit Button */}", renderStart));
  const helper = dialog.slice(helperStart, dialog.indexOf("function formatFailedItemMessage", helperStart));
  assert.match(render, /item\.status === "failed" && item\.error/);
  assert.doesNotMatch(render, /failedErrorDisplay\s*=\s*[\s\S]{0,120}!item\.retryable/);
  assert.match(helper, /inlineLabel: "Не добавлен:/);
});

test("source-level contract: failed analysis row says candidate was added and does not say not added", () => {
  const dialog = source();
  const helperStart = dialog.indexOf("function getFailedJobItemErrorDisplay(item: JobItem)");

  assert.notEqual(helperStart, -1);

  const helper = dialog.slice(helperStart, dialog.indexOf("function formatFailedItemMessage", helperStart));
  const analysisBranchMatch = helper.match(/if \(item\.failureKind === "analysis"\) \{[\s\S]*?\n  \}/);

  assert.ok(analysisBranchMatch);
  assert.match(
    analysisBranchMatch[0],
    /inlineLabel: "Кандидат добавлен, однако анализ не был завершен из-за ошибки обработки\."/
  );
  assert.doesNotMatch(analysisBranchMatch[0], /Не добавлен/);
  assert.match(analysisBranchMatch[0], /detail/);
});

test("source-level contract: created candidates without a job are shown as added without analysis", () => {
  const dialog = source();
  const submitHandlerStart = dialog.indexOf("// Submit handler");
  const pollStart = dialog.indexOf("async function pollCandidateAnalysisUntilFinished");
  const renderStart = dialog.indexOf("{jobItems.map((item, idx) =>");
  const completedCountStart = dialog.indexOf("const completedCount = useMemo(");

  assert.notEqual(submitHandlerStart, -1);
  assert.notEqual(pollStart, -1);
  assert.notEqual(renderStart, -1);
  assert.notEqual(completedCountStart, -1);

  const submitHandler = dialog.slice(
    submitHandlerStart,
    dialog.indexOf("async function finishCandidateBatchAnalysisInBackground", submitHandlerStart)
  );
  const poll = dialog.slice(pollStart, dialog.indexOf("function getSafeRetryAnalysisFailureToastDescription", pollStart));
  const render = dialog.slice(renderStart, dialog.indexOf("{/* Submit Button */}", renderStart));
  const completedCount = dialog.slice(completedCountStart, dialog.indexOf("const preflightEffectiveAllowed", completedCountStart));

  assert.match(submitHandler, /status:\s*jobId \? "queued" : "skipped"/);
  assert.match(submitHandler, /const hasQueuedAnalysis = session\.items\.some\(\(i\) => i\.jobId && i\.status === "queued"\)/);
  assert.match(submitHandler, /if \(hasQueuedAnalysis\)/);
  assert.match(poll, /i\.status === "done" \|\| i\.status === "failed" \|\| i\.status === "skipped"/);
  assert.match(render, /Badge variant="outline"[^>]*>Без анализа<\/Badge>/);
  assert.match(completedCount, /i\.status === "done" \|\| i\.status === "failed" \|\| i\.status === "skipped"/);
});

test("source-level contract: insufficient-credit failed jobs are shown as added without analysis", () => {
  const dialog = source();
  const pollStart = dialog.indexOf("async function pollCandidateAnalysisUntilFinished");

  assert.notEqual(pollStart, -1);

  const poll = dialog.slice(pollStart, dialog.indexOf("function getSafeRetryAnalysisFailureToastDescription", pollStart));

  assert.match(poll, /const failedForCredits = status === "failed" && isInsufficientCreditsError\(s\.lastError \?\? s\.error\)/);
  assert.match(poll, /status: failedForCredits \? "skipped" : status/);
  assert.match(poll, /failureKind: failedForCredits \? null : status === "failed" \? "analysis" : null/);
  assert.match(poll, /retryable: failedForCredits \? false : status === "failed" \? Boolean\(x\.candidateId\) : false/);
});

test("source-level contract: all-created skipped batch uses explicit no-analysis success copy", () => {
  const toast = readFileSync("lib/candidate-batch-toast.mjs", "utf8");

  assert.match(toast, /Кандидаты добавлены без AI-анализа/);
  assert.match(toast, /AI-анализ сейчас недоступен: подписка неактивна или не хватает кредитов\./);
  assert.match(toast, /После оплаты или пополнения баланса запустите анализ из списка кандидатов\./);
});

test("source-level contract: mixed analyzed and skipped batches keep billing guidance", () => {
  const dialog = source();
  const backgroundStart = dialog.indexOf("async function finishCandidateBatchAnalysisInBackground");

  assert.notEqual(backgroundStart, -1);

  const background = dialog.slice(backgroundStart, dialog.indexOf("function submitForm", backgroundStart));

  assert.match(background, /const skippedItems = session\.items\.filter\(\(i\) => i\.status === "skipped"\)/);
  assert.match(background, /skipAnalysis: skippedItems\.length > 0/);
  assert.match(background, /noAnalysisCount: skippedItems\.length/);
  assert.match(background, /label: "Открыть тариф"/);
});

test("source-level contract: stale submit guard test markers stay current", () => {
  const dialog = source();

  assert.doesNotMatch(dialog, /indexOf\("if \(!opts\?\.skipAnalysis\)"\)/);
});

test("source-level contract: editing selected resume files resets stale batch statuses", () => {
  const dialog = source();
  const addStart = dialog.indexOf("function addResumeFiles(files: FileList | File[])");
  const removeStart = dialog.indexOf("const removeFile = (index: number) => {");

  assert.notEqual(addStart, -1);
  assert.notEqual(removeStart, -1);
  assert.match(dialog, /function resetVisibleBatchStatusAfterResumeFilesEdit\(\)/);
  assert.match(dialog, /stale batch status/i);

  const addResumeFiles = dialog.slice(addStart, dialog.indexOf("async function runWithConcurrency", addStart));
  const removeFile = dialog.slice(removeStart, dialog.indexOf("// Submit handler", removeStart));

  assert.match(addResumeFiles, /resetVisibleBatchStatusAfterResumeFilesEdit\(\)/);
  assert.match(removeFile, /resetVisibleBatchStatusAfterResumeFilesEdit\(\)/);
});

test("source-level contract: unsafe job item errors use safe row and summary text for every failure kind", () => {
  const dialog = source();
  const getJobItemErrorTextStart = dialog.indexOf("function getJobItemErrorText(item: JobItem)");
  const formatFailedItemMessageStart = dialog.indexOf("function formatFailedItemMessage(item: JobItem)");
  const batchFailureStart = dialog.indexOf("function getBatchFailureToastContent(failedItems: JobItem[])");

  assert.notEqual(getJobItemErrorTextStart, -1);
  assert.notEqual(formatFailedItemMessageStart, -1);
  assert.notEqual(batchFailureStart, -1);
  assert.match(dialog, /const RETRYABLE_ANALYSIS_FAILURE_MESSAGE = "AI-анализ не завершился\. Можно повторить\."/);
  assert.match(dialog, /const GENERIC_JOB_ITEM_FAILURE_MESSAGE = "Не удалось обработать файл\. Попробуйте ещё раз\."/);

  const getJobItemErrorText = dialog.slice(
    getJobItemErrorTextStart,
    dialog.indexOf("function getFailedJobItemErrorDisplay", getJobItemErrorTextStart)
  );
  const safeDisplayedBackendErrorMessage = dialog.slice(
    dialog.indexOf("function getSafeDisplayedBackendErrorMessage(message: string, fallback: string)"),
    dialog.indexOf("function getUnsafeJobItemErrorFallback", dialog.indexOf("function getSafeDisplayedBackendErrorMessage"))
  );
  const formatFailedItemMessage = dialog.slice(
    formatFailedItemMessageStart,
    dialog.indexOf("function summarizeFailedItemMessages", formatFailedItemMessageStart)
  );
  const getBatchFailureToastContent = dialog.slice(
    batchFailureStart,
    dialog.indexOf("export function AddCandidateDialog", batchFailureStart)
  );

  assert.match(getJobItemErrorText, /getSafeDisplayedBackendErrorMessage\(message, getUnsafeJobItemErrorFallback\(item\)\)/);
  assert.match(getJobItemErrorText, /getUnsafeJobItemErrorFallback\(item\)/);
  assert.match(safeDisplayedBackendErrorMessage, /hasUnsafeDisplayedErrorDetails\(message\)/);
  assert.doesNotMatch(getJobItemErrorText, /if \(item\.failureKind === "analysis"\)/);
  assert.match(formatFailedItemMessage, /getJobItemErrorText\(item\)/);
  assert.match(getBatchFailureToastContent, /formatFailedItemMessage\(firstFailedItem\)/);
  assert.match(getBatchFailureToastContent, /summarizeFailedItemMessages\(nonCreditItems\)/);
  assert.doesNotMatch(formatFailedItemMessage, /AI_ANALYSIS_FAILED/);
  assert.doesNotMatch(formatFailedItemMessage, /FORBIDDEN|INTERNAL_ERROR/);
});

test("source-level contract: unsafe detail detector covers retry job codes and parser internals", () => {
  const dialog = source();
  const detectorStart = dialog.indexOf("function hasUnsafeDisplayedErrorDetails(message: string)");

  assert.notEqual(detectorStart, -1);

  const detector = dialog.slice(detectorStart, dialog.indexOf("function getSafeDisplayedBackendErrorMessage", detectorStart));

  assert.match(detector, /AI_ANALYSIS_FAILED/);
  assert.match(detector, /\\b\[A-Z\]\[A-Z0-9_\]\{2,\}\\b/);
  assert.match(detector, /tika/i);
  assert.match(detector, /parser/i);
  assert.match(detector, /provider/i);
  assert.match(detector, /internal/i);
  assert.match(detector, /request/i);
  assert.match(detector, /stack/i);
});

test("source-level contract: safe create-file format messages survive uppercase-code sanitization", () => {
  const dialog = source();
  const safeTermsStart = dialog.indexOf("const SAFE_USER_FACING_UPPERCASE_TERMS");
  const detectorStart = dialog.indexOf("function hasUnsafeDisplayedErrorDetails(message: string)");

  assert.notEqual(safeTermsStart, -1);
  assert.notEqual(detectorStart, -1);

  const safeTerms = dialog.slice(safeTermsStart, detectorStart);
  const detector = dialog.slice(detectorStart, dialog.indexOf("function getSafeDisplayedBackendErrorMessage", detectorStart));

  for (const token of ["PDF", "DOC", "DOCX", "TXT", "UTF"]) {
    assert.match(safeTerms, new RegExp(`"${token}"`));
  }

  assert.match(detector, /message\.match\(\/\\b\[A-Z\]\[A-Z0-9_\]\{2,\}\\b\/g\)/);
  assert.match(detector, /!SAFE_USER_FACING_UPPERCASE_TERMS\.has\(token\)/);
});

test("source-level contract: retryable failed rows keep retry action and safe tooltip detail", () => {
  const dialog = source();
  const renderStart = dialog.indexOf("{jobItems.map((item, idx) =>");

  assert.notEqual(renderStart, -1);

  const render = dialog.slice(renderStart, dialog.indexOf("{/* Submit Button */}", renderStart));
  assert.match(render, /failedErrorDisplay\s*=\s*[\s\S]*?item\.status === "failed" && item\.error/);
  assert.doesNotMatch(render, /failedErrorDisplay\s*=\s*[\s\S]{0,120}!item\.retryable/);
  assert.match(render, /failedErrorDisplay\.inlineLabel/);
  assert.match(render, /failedErrorDisplay\.detail/);
  assert.match(render, /item\.retryable \?/);
  assert.match(render, /Повторить/);
});

test("source-level contract: retry toast maps unsafe backend errors before display", () => {
  const dialog = source();
  const mapperStart = dialog.indexOf("function getSafeRetryAnalysisFailureToastDescription(error: unknown)");
  const retryStart = dialog.indexOf("async function handleRetry(index: number)");

  assert.notEqual(mapperStart, -1);
  assert.notEqual(retryStart, -1);

  const mapper = dialog.slice(mapperStart, dialog.indexOf("function getDefaultFormValues", mapperStart));
  const handleRetry = dialog.slice(retryStart, dialog.indexOf("async function pollUntilFinished", retryStart));

  assert.match(mapper, /hasUserFacingRussianText/);
  assert.match(mapper, /getSafeDisplayedBackendErrorMessage\(message, fallback\)/);
  assert.match(mapper, /hasUnsafeDisplayedErrorDetails\(message\)/);
  assert.doesNotMatch(mapper, /FORBIDDEN|INTERNAL_ERROR|AI_ANALYSIS_FAILED/);
  assert.match(handleRetry, /description: getSafeRetryAnalysisFailureToastDescription\(e\)/);
  assert.doesNotMatch(handleRetry, /description:\s*e instanceof Error \? e\.message/);
});

test("source-level contract: retry with insufficient credits does not say analysis completed", () => {
  const dialog = source();
  const retryStart = dialog.indexOf("async function handleRetry(index: number)");

  assert.notEqual(retryStart, -1);

  const handleRetry = dialog.slice(retryStart, dialog.indexOf("return (", retryStart));
  const skippedGuard = handleRetry.indexOf('if (skipped) {');
  const successToast = handleRetry.indexOf('toast.success("AI анализ завершён")');

  assert.match(handleRetry, /const skipped = session\.items\.some\(\(i\) => i\.status === "skipped"\)/);
  assert.match(handleRetry, /if \(skipped\) \{/);
  assert.match(handleRetry, /toast\.message\("AI-анализ сейчас недоступен"/);
  assert.match(handleRetry, /label: "Открыть тариф"/);
  assert.notEqual(skippedGuard, -1);
  assert.notEqual(successToast, -1);
  assert.ok(skippedGuard < successToast);
});

test("source-level contract: batch upload does not refresh parent list after every created file", () => {
  const dialog = source();
  const createPhaseStart = dialog.indexOf("// Create candidates + queue jobs");
  const createPhaseEnd = dialog.indexOf("// Ensure the candidates list is refreshed at least once right after the create/queue phase.", createPhaseStart);
  const afterCreateRefreshStart = dialog.indexOf("// Ensure the candidates list is refreshed at least once right after the create/queue phase.");
  const afterCreateRefreshEnd = dialog.indexOf("const hasQueuedAnalysis", afterCreateRefreshStart);
  const finalRefreshStart = dialog.indexOf("// Final refresh so the main list catches up quickly");

  assert.notEqual(createPhaseStart, -1);
  assert.notEqual(createPhaseEnd, -1);
  assert.notEqual(afterCreateRefreshStart, -1);
  assert.notEqual(afterCreateRefreshEnd, -1);
  assert.notEqual(finalRefreshStart, -1);

  const createPhase = dialog.slice(createPhaseStart, createPhaseEnd);
  const afterCreateRefresh = dialog.slice(afterCreateRefreshStart, afterCreateRefreshEnd);
  const finalRefresh = dialog.slice(finalRefreshStart, dialog.indexOf("// Close dialog and reset state", finalRefreshStart));

  assert.doesNotMatch(createPhase, /onCandidatesAdded|flushCandidatesAdded|scheduleCandidatesAdded/);
  assert.match(afterCreateRefresh, /await flushCandidatesAdded\(\)/);
  assert.match(finalRefresh, /await flushCandidatesAdded\(\)/);
});

test("source-level contract: manual batch submit does not wait for background AI polling", () => {
  const dialog = source();
  const submitHandlerStart = dialog.indexOf("// Submit handler");

  assert.notEqual(submitHandlerStart, -1);

  const submitHandler = dialog.slice(
    submitHandlerStart,
    dialog.indexOf("async function finishCandidateBatchAnalysisInBackground", submitHandlerStart)
  );

  assert.match(submitHandler, /void finishCandidateBatchAnalysisInBackground\(/);
  assert.doesNotMatch(submitHandler, /await pollUntilFinished\(/);
  assert.match(submitHandler, /\/\/ Start AI polling in the background/);
});

test("source-level contract: submit entrypoints are guarded while a visible batch is processing", () => {
  const dialog = source();
  const submitStart = dialog.indexOf("function submitForm(event?: BaseSyntheticEvent)");
  const formStart = dialog.indexOf("<form", submitStart);

  assert.notEqual(submitStart, -1);
  assert.notEqual(formStart, -1);

  const submitBlock = dialog.slice(submitStart, dialog.indexOf("const submitHint", submitStart));
  const formBlock = dialog.slice(formStart, dialog.indexOf("{/* Vacancy Selection */}", formStart));

  assert.match(submitBlock, /if \(isProcessing\) return;/);
  assert.match(submitBlock, /void form\.handleSubmit\(/);
  assert.match(formBlock, /if \(isBusy\) return;/);
});

test("source-level contract: candidate list refresh coalesces a trailing refresh instead of dropping overlap", () => {
  const dialog = source();
  const refsStart = dialog.indexOf("const candidatesAddedInFlightRef = useRef(false);");
  const flushStart = dialog.indexOf("async function flushCandidatesAdded()");

  assert.notEqual(refsStart, -1);
  assert.notEqual(flushStart, -1);

  const refsBlock = dialog.slice(refsStart, dialog.indexOf("const pdfDropzoneRef", refsStart));
  const flushBlock = dialog.slice(flushStart, dialog.indexOf("useEffect(() =>", flushStart));

  assert.match(refsBlock, /const candidatesAddedRefreshPendingRef = useRef\(false\);/);
  assert.match(flushBlock, /candidatesAddedRefreshPendingRef\.current = true;/);
  assert.match(flushBlock, /do \{/);
  assert.match(flushBlock, /while \(candidatesAddedRefreshPendingRef\.current\);/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("calendar page uses the shared interview UI instead of the MVP placeholder", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.doesNotMatch(source, /MvpPlaceholder/);
  assert.match(source, /FullCalendarInterviews/);
  assert.match(source, /InterviewFormDialog/);
  assert.match(source, /InterviewCard/);
  assert.match(source, /Новое собеседование/);
  assert.match(source, /Предстоящие/);
  assert.match(source, /Все собеседования/);
});

test("calendar interview list tabs have search, status filters, and pagination", () => {
  const page = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");
  const filters = readFileSync("components/dashboard/interviews-list-filters-bar.tsx", "utf8");
  const service = readFileSync("services/data/interviews.ts", "utf8");

  assert.match(page, /InterviewsListFiltersBar/);
  assert.match(page, /PaginationControls/);
  assert.match(page, /listInterviewsPage/);
  assert.match(page, /activeListScope/);
  assert.match(filters, /Поиск по собеседованиям/);
  assert.match(filters, /maxLength=\{120\}/);
  assert.match(filters, /Запланировано/);
  assert.match(filters, /Завершено/);
  assert.match(filters, /Отменено/);
  assert.match(service, /mode", "list"/);
});

test("calendar interview list avoids numbered pagination when total count is not exact", () => {
  const page = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");
  const controls = readFileSync("components/dashboard/pagination-controls.tsx", "utf8");

  assert.match(page, /listScanLimitReached/);
  assert.match(page, /listCanGoForward/);
  assert.match(page, /showListPagination/);
  assert.match(page, /hasExactTotal=\{listTotalIsExact\}/);
  assert.match(page, /hasNextPage=\{listCanGoForward\}/);
  assert.match(page, /Список слишком широкий для точного показа/);
  assert.match(page, /Дальше список не показываем/);
  assert.match(controls, /hasExactTotal = true/);
  assert.match(controls, /if \(!hasExactTotal\)/);
  assert.doesNotMatch(controls.match(/if \(!hasExactTotal\)[\s\S]*?return \(/)?.[0] ?? "", /Страница[\s\S]*из/);
});

test("calendar interview list tab, filters, and pagination are synced with URL params", () => {
  const page = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(page, /useRouter/);
  assert.match(page, /useSearchParams/);
  assert.match(page, /replaceQuery/);
  assert.match(page, /replaceListQuery/);
  assert.match(page, /scope/);
  assert.match(page, /q/);
  assert.match(page, /status/);
  assert.match(page, /pageSize/);
  assert.match(page, /normalizeInterviewSearch\(searchParams\.get\("q"\)\)/);
  assert.match(page, /parseInterviewListScope\(searchParams\.get\("scope"\)\)/);
  assert.match(page, /parseInterviewStatusFilter\(searchParams\.get\("status"\)\)/);
  assert.match(page, /page && page > 1 \? String\(page\) : null/);
  assert.match(page, /pageSize && pageSize !== 25 \? String\(pageSize\) : null/);
});

test("calendar page handles conflict confirmation without closing the dialog", () => {
  const source = [
    readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8"),
    readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8"),
  ].join("\n");

  assert.match(source, /InterviewConflictError/);
  assert.match(source, /setConflicts/);
  assert.match(source, /onClearConflicts/);
  assert.match(source, /allowConflicts/);
  assert.match(source, /Сохранить всё равно/);
});

test("calendar edit and status flows are guarded", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /updatedAtRaw/);
  assert.match(source, /expectedUpdatedAt/);
  assert.match(source, /cancelInterview/);
  assert.match(source, /completeInterview/);
  assert.match(source, /maxLength=\{2000\}/);
  assert.match(source, /Подтвердить/);
});

test("calendar edit form submits changed candidate and vacancy ids", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");
  const submitBlock = source.match(/async function handleFormSubmit\(input: InterviewFormSubmitInput\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(submitBlock, /candidateId:\s*input\.candidateId/);
  assert.match(submitBlock, /vacancyId:\s*input\.vacancyId/);
  assert.match(submitBlock, /updateInterview\(interviewToUpdate\.id,\s*updateInput\)/);
});

test("calendar cancel and complete status calls pass updated-at precondition", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(
    source,
    /cancelInterview\(action\.interview\.id,\s*\{\s*cancelNote:\s*statusNote\.trim\(\)\s*\|\|\s*undefined,\s*expectedUpdatedAt:\s*action\.interview\.updatedAtRaw,\s*\}\)/s
  );
  assert.match(
    source,
    /completeInterview\(action\.interview\.id,\s*\{\s*completionNote:\s*statusNote\.trim\(\)\s*\|\|\s*undefined,\s*expectedUpdatedAt:\s*action\.interview\.updatedAtRaw,\s*\}\)/s
  );
  assert.doesNotMatch(source, /cancelInterview\(action\.interview\.id,\s*statusNote\.trim\(\)\s*\|\|\s*undefined\)/);
  assert.doesNotMatch(source, /completeInterview\(action\.interview\.id,\s*statusNote\.trim\(\)\s*\|\|\s*undefined\)/);
});

test("calendar stores list version from the same interview response", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /listInterviewsWithVersion/);
  assert.doesNotMatch(source, /\blistInterviews\(/);
  assert.match(source, /currentVersion/);
  assert.match(source, /setCurrentVersion/);

  const loaderBlock = source.match(/const loadInterviewsForRange = useCallback\(async \(range: CalendarVisibleRange[\s\S]*?\n  \);/)?.[0] ?? "";
  assert.match(loaderBlock, /const result = await listInterviewsWithVersion\(range\)/);
  assert.match(loaderBlock, /setInterviews\(result\.interviews\)/);
  assert.match(loaderBlock, /setCurrentVersion\(result\.version\)/);
  assert.match(loaderBlock, /loadInterviewsSeqRef/);
  assert.match(loaderBlock, /currentRangeKeyRef/);
});

test("calendar shared current-range loader clears stale state after accepted refresh", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");
  const loaderBlock = source.match(/const loadInterviewsForRange = useCallback\(async \(range: CalendarVisibleRange[\s\S]*?\n  \);/)?.[0] ?? "";

  assert.match(loaderBlock, /if \(loadInterviewsSeqRef\.current !== requestId \|\| currentRangeKeyRef\.current !== requestRangeKey\) return null;/);
  assert.ok(
    loaderBlock.indexOf("clearStaleStateRef.current?.();") > loaderBlock.indexOf("if (loadInterviewsSeqRef.current !== requestId"),
    "stale state must clear only after the current-range response is accepted"
  );
  assert.ok(
    loaderBlock.indexOf("clearStaleStateRef.current?.();") < loaderBlock.indexOf("return result.version"),
    "stale state should clear on successful shared loader refresh"
  );
});

test("calendar handles stale interview mutations without generic retry copy", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /InterviewChangedError/);
  assert.match(source, /refreshInterviewsAfterStaleConflict/);
  assert.match(source, /Собеседование уже изменилось\. Обновите календарь и попробуйте ещё раз\./);
  assert.match(source, /Не удалось обновить календарь\. Попробуйте ещё раз\./);

  const staleRefreshBlock = source.match(/async function refreshInterviewsAfterStaleConflict\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(staleRefreshBlock, /await refreshInterviews\(\)/);
  assert.match(staleRefreshBlock, /activeTab !== "calendar"/);
  assert.match(staleRefreshBlock, /await loadInterviewListPage\(\{ preserveOnError: true \}\)/);

  const formCatch = source.match(/if \(error instanceof InterviewConflictError\)[\s\S]*?toast\.error\(isEditing[\s\S]*?return;/)?.[0] ?? "";
  assert.match(formCatch, /error instanceof InterviewChangedError/);
  assert.match(formCatch, /toast\.warning\(getInterviewChangedMessage\(error\)\)/);
  assert.match(formCatch, /setFormOpen\(false\)/);
  assert.match(formCatch, /setEditingInterview\(null\)/);
  assert.match(formCatch, /await refreshInterviewsAfterStaleConflict\(\)/);

  const statusCatch = source.match(/catch \(error\) \{[\s\S]*?Failed to change interview status[\s\S]*?return;\s*\} finally/)?.[0] ?? "";
  assert.match(statusCatch, /error instanceof InterviewChangedError/);
  assert.match(statusCatch, /toast\.warning\(getInterviewChangedMessage\(error\)\)/);
  assert.match(statusCatch, /setPendingStatusAction\(null\)/);
  assert.match(statusCatch, /setSelectedInterview\(null\)/);
  assert.match(statusCatch, /await refreshInterviewsAfterStaleConflict\(\)/);
});

test("calendar refresh failures after mutations do not masquerade as mutation failures", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /refreshInterviewsAfterAction/);
  assert.match(source, /Обновите календарь, чтобы увидеть свежие изменения/);
  assert.doesNotMatch(source, /description: error instanceof Error \? error\.message/);
});

test("calendar and candidate schedule forms map mutation errors through safe user-facing copy", () => {
  const calendarSource = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");
  const candidatesSource = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");

  assert.match(calendarSource, /readInterviewMutationErrorDescription/);
  assert.match(candidatesSource, /readInterviewMutationErrorDescription/);
  assert.doesNotMatch(calendarSource, /description: error instanceof Error \? error\.message/);
  assert.doesNotMatch(candidatesSource, /description: "Проверьте данные и попробуйте ещё раз\."/);
});

test("calendar ignores repeated FullCalendar range echoes", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /isInitialLoading/);
  assert.match(source, /handleVisibleRangeChange/);
  assert.match(source, /setVisibleRange\(\(current\) =>/);
  assert.match(source, /current\.from === range\.from && current\.to === range\.to/);
  assert.match(source, /return current/);
  assert.match(source, /onDatesChange=\{handleVisibleRangeChange\}/);
  assert.doesNotMatch(source, /onDatesChange=\{setVisibleRange\}/);
});

test("calendar range refresh keeps visible interviews with an explicit loading state", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /showCalendarRangeRefresh/);
  assert.match(source, /interviewsLoading && pageReady/);
  assert.match(source, /Обновляем календарь/);

  const calendarTab = source.match(/<TabsContent value="calendar"[\s\S]*?<\/TabsContent>/)?.[0] ?? "";
  assert.match(calendarTab, /showCalendarRangeRefresh/);
  assert.ok(
    calendarTab.indexOf("showCalendarRangeRefresh") < calendarTab.indexOf("<FullCalendarInterviews"),
    "range refresh loading state should render above the still-visible calendar"
  );
});

test("calendar range changes refresh only interviews, not static form options", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /hasLoadedInitialInterviews/);
  assert.match(source, /hasLoadedReferenceData/);
  assert.match(source, /loadCalendarReferenceData/);
  assert.match(source, /loadInterviewsForRange/);

  const interviewsEffect = source.match(/useEffect\(\(\) => \{[\s\S]*?loadInterviewsForRange\(visibleRange[\s\S]*?\}, \[loadInterviewsForRange, visibleRange\]\);/);
  assert.ok(interviewsEffect, "expected a visibleRange-scoped interviews effect");
  assert.doesNotMatch(interviewsEffect[0], /listVacancies|listCandidatesPage|listInterviewers/);

  const referenceEffect = source.match(/useEffect\(\(\) => \{[\s\S]*?loadCalendarReferenceData[\s\S]*?\}, \[\]\);/);
  assert.ok(referenceEffect, "expected a mount-only reference data effect");
  assert.match(referenceEffect[0], /listVacancies/);
  assert.match(referenceEffect[0], /listCandidates\(\)/);
  assert.doesNotMatch(referenceEffect[0], /listCandidatesPage\(\{\s*page:\s*1,\s*pageSize:\s*200/);
  assert.match(referenceEffect[0], /listInterviewers/);
});

test("calendar realtime hook uses polling instead of browser Supabase channels", () => {
  const source = readFileSync("hooks/use-calendar-realtime.ts", "utf8");

  assert.match(source, /export function useCalendarRealtime/);
  assert.match(source, /setFallbackMode\(Boolean\(companyId\)\)/);
  assert.match(source, /if \(!companyId \|\| !fallbackMode\) return;/);
  assert.match(source, /createFallbackRealtimeScheduler/);
  assert.match(source, /const version = await onCheckChangesRequestedRef\.current\(startedRange\);/);
  assert.match(source, /const acceptedVersion = await onRefreshRequestedRef\.current\(\);/);
  assert.match(source, /visibleRangeRef/);
  assert.doesNotMatch(source, /createSupabaseBrowserClient/);
  assert.doesNotMatch(source, /supabase\.realtime/);
  assert.doesNotMatch(source, /\.channel\(/);
  assert.doesNotMatch(source, /onAuthStateChange/);
  assert.doesNotMatch(source, /removeChannel/);
});

test("calendar realtime hook disposes coordinator and polling scheduler after cleanup", () => {
  const source = readFileSync("hooks/use-calendar-realtime.ts", "utf8");

  assert.match(source, /coordinatorRef\.current\?\.dispose\(\)/);
  assert.match(source, /disposed = true/);
  assert.match(source, /fallbackRef\.current = null/);
  assert.match(source, /fallback\.clear\(\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange", handleFallbackVisibilityChange\)/);
});

test("calendar realtime hook checks immediately after visibility returns and marks stale on refresh failure", () => {
  const source = readFileSync("hooks/use-calendar-realtime.ts", "utf8");

  assert.match(source, /fallbackRef/);
  const visibilityBlock = source.match(/function handleFallbackVisibilityChange\(\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
  assert.match(visibilityBlock, /document\.visibilityState === "visible"/);
  assert.match(visibilityBlock, /void runFallbackCheck\(\);/);
  assert.doesNotMatch(visibilityBlock, /resumeWhenVisible\(runFallbackCheck\)/);
  assert.match(source, /refreshFailedWithVersion/);
  assert.match(source, /const acceptedVersion = await onRefreshRequestedRef\.current\(\);/);
  assert.match(source, /dispatchStale\(\{\s*type:\s*"mark-stale",\s*range:\s*startedRange,\s*version:\s*refreshFailedWithVersion/s);
  assert.match(source, /if \(acceptedVersion && !disposed && startedRangeKey === rangeKey\(visibleRangeRef\.current\)\) \{\s*dispatchStale\(\{ type: "clear" \}\);/s);
  assert.doesNotMatch(source, /refreshedVersion\s*!==\s*version/);
});

test("calendar refreshNow and stale refresh UI only clear after accepted refresh", () => {
  const hookSource = readFileSync("hooks/use-calendar-realtime.ts", "utf8");
  const pageSource = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  const refreshNowBlock = hookSource.match(/const refreshNow = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[\]\);/)?.[0] ?? "";
  assert.match(refreshNowBlock, /if \(version && startedRangeKey === rangeKey\(visibleRangeRef\.current\)\)/);

  const staleRefreshBlock = pageSource.match(/async function handleRefreshStale\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(staleRefreshBlock, /const acceptedVersion = await refreshRealtimeNow\(\);/);
  assert.match(staleRefreshBlock, /if \(!acceptedVersion\) \{[\s\S]*toast\.warning\("Не удалось обновить календарь\. Попробуйте ещё раз\."\);[\s\S]*return;/);
  assert.ok(
    staleRefreshBlock.indexOf("clearStaleState();") > staleRefreshBlock.indexOf("if (!acceptedVersion)"),
    "page stale refresh must clear only after a non-null accepted refresh"
  );
});

test("calendar page integrates company scoped realtime and guarded fingerprint loaders", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /useAuth\(\)/);
  assert.match(source, /user\?\.companyId\s*\?\?\s*null/);
  assert.match(source, /useCalendarRealtime/);
  assert.match(source, /checkInterviewChanges/);
  assert.match(source, /loadInterviewsForRange/);
  assert.match(source, /loadInterviewsSeqRef/);
  assert.match(source, /checkCalendarSeqRef/);
  assert.match(source, /rangeKey\(range\)/);
  assert.match(source, /currentRangeKeyRef/);
  assert.match(source, /onRefreshRequested:\s*\(\)\s*=>\s*loadInterviewsForRange\(visibleRangeRef\.current/);
  assert.match(source, /onCheckChangesRequested:\s*checkCalendarChanges/);
  assert.match(source, /Календарь обновился\. Нажмите, чтобы загрузить изменения\./);
  assert.doesNotMatch(source, /Автообновление работает в резервном режиме\./);
  assert.doesNotMatch(source, /резервн(?:ом|ый|ого) режиме/i);
  assert.doesNotMatch(source, /"[^"\r\n]*(Supabase|WebSocket|polling|Realtime)[^"\r\n]*"/);
  assert.match(source, /role="status"|aria-live="polite"/);
});

test("calendar list search uses a draft value and debounces URL updates", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /listSearchDraft/);
  assert.match(source, /setListSearchDraft/);
  assert.match(source, /listSearchDebounceRef/);
  assert.match(source, /window\.setTimeout/);
  assert.match(source, /window\.clearTimeout/);
  assert.match(source, /limitInterviewSearchInput\(next\)/);
  assert.match(source, /normalizeInterviewSearch\(limited\)/);
  assert.match(source, /search=\{listSearchDraft\}/);

  const urlSyncEffect = source.match(/useEffect\(\(\) => \{[\s\S]*?normalizeInterviewSearch\(searchParams\.get\("q"\)\)[\s\S]*?\}, \[searchParams\]\);/)?.[0] ?? "";
  assert.match(urlSyncEffect, /setListSearch\(\(prev\)/);
  assert.match(urlSyncEffect, /setListSearchDraft\(\(prev\)/);
  assert.match(urlSyncEffect, /if \(listSearchDebounceRef\.current\) return prev;/);
});

test("calendar stale UI is rendered inline in form detail and status dialogs", () => {
  const pageSource = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");
  const formSource = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");

  assert.match(formSource, /staleAlert\?: React\.ReactNode/);
  assert.match(formSource, /isStale\?: boolean/);
  assert.match(formSource, /onRefreshStale\?: \(\) => void/);
  assert.match(formSource, /isStale && conflicts\.length > 0/);
  assert.match(formSource, /disabled=\{submitting \|\| isStale \|\| selectedVacancyHasNoCandidates\}/);
  assert.match(pageSource, /staleAlert=\{formStaleAlert\}/);
  assert.match(pageSource, /selectedInterviewStaleAlert/);
  assert.match(pageSource, /statusActionStaleAlert/);
  assert.match(pageSource, /Обновить/);
});

test("shared interview card shows meeting context but hides manage actions for limited rows", () => {
  const source = readFileSync("components/dashboard/interview-card.tsx", "utf8");
  const service = readFileSync("services/data/interviews.ts", "utf8");

  assert.match(source, /accessLevel === "manage"/);
  assert.match(source, /interviewer_only/);
  assert.match(source, /canViewMeetingContext/);
  assert.match(source, /interview\.meetingUrl/);
  assert.match(source, /interview\.location/);
  assert.match(source, /Изменить/);
  assert.match(source, /Отменить/);
  assert.match(source, /Завершить/);
  assert.doesNotMatch(service, /displayTitle:\s*"Собеседование"/);
  assert.match(service, /displayTitle:\s*raw\.displayTitle/);
  assert.match(service, /meetingUrl:\s*raw\.meetingUrl/);
});

test("shared interview card renders final status notes with safe wrapping", () => {
  const source = readFileSync("components/dashboard/interview-card.tsx", "utf8");

  assert.match(source, /completionNote/);
  assert.match(source, /cancelNote/);
  assert.match(source, /Итог собеседования/);
  assert.match(source, /Причина отмены/);
  assert.match(source, /break-words/);
});

test("shared interview form mirrors client-side limits and locked candidate context", () => {
  const source = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");

  assert.match(source, /lockCandidateAndVacancy/);
  assert.match(source, /initialCandidate/);
  assert.match(source, /initialVacancy/);
  assert.match(source, /durationMinutes/);
  assert.match(source, /min=\{5\}/);
  assert.match(source, /max=\{480\}/);
  assert.match(source, /step=\{5\}/);
  assert.match(source, /maxLength=\{500\}/);
  assert.match(source, /maxLength=\{250\}/);
  assert.match(source, /maxLength=\{2000\}/);
  assert.match(source, /Введите корректную ссылку/);
  assert.match(source, /Длительность должна быть от 5 до 480 минут/);
  assert.match(source, /Сохранить всё равно/);
  assert.match(source, /formatInterviewConflictMessage/);
  assert.match(source, /formatConflictTime\(conflict\.startsAt\)/);
  assert.doesNotMatch(source, /\{conflict\.message\}/);
});

test("calendar create flow defaults to a 30 minute interview slot", () => {
  const formSource = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");
  const calendarSource = readFileSync("components/dashboard/full-calendar-interviews.tsx", "utf8");

  assert.match(formSource, /const DEFAULT_INTERVIEW_DURATION_MINUTES = 30;/);
  assert.match(formSource, /useState\(String\(DEFAULT_INTERVIEW_DURATION_MINUTES\)\)/);
  assert.match(formSource, /: DEFAULT_INTERVIEW_DURATION_MINUTES/);
  assert.match(calendarSource, /slotDuration="00:30:00"/);
  assert.match(calendarSource, /snapDuration="00:30:00"/);
});

test("shared interview form keeps candidate and vacancy editable unless explicitly locked", () => {
  const source = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");

  assert.match(source, /lockCandidateAndVacancy = false/);
  assert.match(source, /disabled=\{lockCandidateAndVacancy\}/);
  assert.match(source, /disabled=\{lockCandidateAndVacancy \|\| !vacancyId\}/);
  assert.doesNotMatch(source, /disabled=\{mode === "edit"/);
  assert.doesNotMatch(source, /disabled=\{[^}]*interview[^}]*\}/);
});

test("calendar intentionally allows completing future interviews", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /completeInterview/);
  assert.doesNotMatch(source, /scheduledAt[^;\n]*(?:>|>=)[^;\n]*Date\.now/);
  assert.doesNotMatch(source, /Выберите прошедшее время/);
  assert.doesNotMatch(source, /Нельзя завершить будущее собеседование/);
});

test("shared interview form uses searchable bounded pickers for large option lists", () => {
  const source = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");

  assert.match(source, /CommandInput/);
  assert.match(source, /SearchableSinglePicker/);
  assert.match(source, /SearchableInterviewerPicker/);
  assert.match(source, /searchPlaceholder="Поиск по вакансии"/);
  assert.match(source, /searchPlaceholder="Поиск по кандидату"/);
  assert.match(source, /placeholder="Поиск по интервьюеру"/);
  assert.match(source, /listCandidatesPage/);
  assert.match(source, /CommandList className="max-h-\[260px\]/);
  assert.doesNotMatch(source, /<Select value=\{vacancyId\}[\s\S]*?<SelectContent>[\s\S]*?vacancies\.map/);
  assert.doesNotMatch(source, /<Select[\s\S]*value=\{candidateId\}[\s\S]*?<SelectContent>[\s\S]*?candidateOptions\.map/);
});

test("shared searchable picker empty state has readable horizontal padding", () => {
  const commandSource = readFileSync("components/ui/command.tsx", "utf8");

  assert.match(commandSource, /px-4 py-6 text-center text-sm/);
});

test("shared interview form lets candidate picker overlay escape the dialog crop", () => {
  const source = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");

  assert.match(source, /<DialogContent className="max-h-\[92dvh\] overflow-visible sm:max-w-2xl">/);
  assert.match(source, /<ScrollArea className="max-h-\[65dvh\] pr-3">/);
});

test("shared interview form keeps empty-vacancy candidate lists empty and blocks submit", () => {
  const source = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");
  const helperSource = readFileSync("lib/interviews/candidate-options.ts", "utf8");

  assert.match(source, /resolveInterviewCandidatesForVacancy/);
  assert.match(source, /vacancyCandidatesTotal === 0/);
  assert.match(source, /if \(selectedVacancyHasNoCandidates\) return null/);
  assert.match(source, /listCandidatesPage\(\{[\s\S]*vacancyId,[\s\S]*pageSize: 50/s);
  assert.doesNotMatch(source, /filtered\.length > 0 \? filtered : candidates/);
  assert.match(helperSource, /vacancyCandidatesFor === vacancyId && vacancyCandidatesTotal === 0\) return \[\]/);
  assert.match(helperSource, /filterInterviewCandidatesForVacancy/);
  assert.match(helperSource, /mergeInterviewCandidates/);
  assert.match(source, /selectedVacancyHasNoCandidates/);
  assert.match(source, /В этой вакансии пока нет кандидатов/);
  assert.match(source, /disabled=\{submitting \|\| isStale \|\| selectedVacancyHasNoCandidates\}/);
});

test("shared interview form shows a retryable error when vacancy candidates fail to load", () => {
  const source = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");

  assert.match(source, /vacancyCandidatesLoadError/);
  assert.match(source, /Не удалось загрузить кандидатов\. Попробуйте ещё раз\./);
  assert.match(source, /setVacancyCandidatesReloadKey/);
  assert.match(source, /Повторить/);
  assert.match(source, /emptyMessage=\{[\s\S]*vacancyCandidatesLoadError/);
});

test("calendar form mutation errors show the API user-facing message", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");
  const formCatch = source.match(/catch \(error\) \{[\s\S]*?toast\.error\(isEditing[\s\S]*?return;/)?.[0] ?? "";

  assert.match(formCatch, /readInterviewMutationErrorDescription\(error,\s*"Проверьте данные и попробуйте ещё раз\."\)/);
  assert.doesNotMatch(formCatch, /description: "Проверьте данные и попробуйте ещё раз\."/);
});

test("shared overlay pickers keep wheel scrolling inside dialogs", () => {
  const dialogSource = readFileSync("components/ui/dialog.tsx", "utf8");
  const popoverSource = readFileSync("components/ui/popover.tsx", "utf8");
  const selectSource = readFileSync("components/ui/select.tsx", "utf8");

  assert.match(dialogSource, /DialogContentElementContext/);
  assert.match(dialogSource, /useDialogContentElement/);
  assert.match(popoverSource, /useDialogContentElement/);
  assert.match(selectSource, /useDialogContentElement/);
  assert.match(popoverSource, /container=\{portalContainer \?\? dialogContentElement \?\? undefined\}/);
  assert.match(selectSource, /container=\{portalContainer \?\? dialogContentElement \?\? undefined\}/);
});

test("fullcalendar adapter uses standard plugins and compact mobile configuration", () => {
  const source = readFileSync("components/dashboard/full-calendar-interviews.tsx", "utf8");

  assert.match(source, /dayGridPlugin/);
  assert.match(source, /timeGridPlugin/);
  assert.match(source, /interactionPlugin/);
  assert.match(source, /listPlugin/);
  assert.match(source, /selectable/);
  assert.match(source, /datesSet/);
  assert.match(source, /eventClick/);
  assert.match(source, /listWeek/);
  assert.match(source, /window\.matchMedia/);
  assert.match(source, /slotMinTime="00:00:00"/);
  assert.match(source, /slotMaxTime="24:00:00"/);
  assert.match(source, /arg\.view\.type\.startsWith\("timeGrid"\)/);
  assert.match(source, /flex min-w-0 items-center/);
  assert.doesNotMatch(source, /@fullcalendar\/.+\/index\.css/);
  assert.doesNotMatch(source, /schedulerLicenseKey/);
});

test("fullcalendar event content renders candidate and vacancy text", () => {
  const source = readFileSync("components/dashboard/full-calendar-interviews.tsx", "utf8");

  assert.match(source, /extendedProps:\s*\{[\s\S]*subtitle:\s*interview\.displaySubtitle/);
  assert.match(source, /hiiire-fc-event-subtitle/);
  assert.match(source, /\{subtitle \? \(/);
  assert.match(source, /<span className="hiiire-fc-event-subtitle">\{subtitle\}<\/span>/);
});

test("calendar shows timezone context outside FullCalendar event slots", () => {
  const calendarSource = readFileSync("components/dashboard/full-calendar-interviews.tsx", "utf8");
  const formSource = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");
  const cardSource = readFileSync("components/dashboard/interview-card.tsx", "utf8");

  assert.match(formSource, /formatUserTimeZoneLabel/);
  assert.match(formSource, /Время указано в вашем часовом поясе/);
  assert.match(formSource, /formatUserTimeZoneLabel\(date\)/);
  assert.match(cardSource, /formatUserTimeZoneLabel/);
  assert.match(cardSource, /Ваш часовой пояс/);
  assert.match(cardSource, /formatUserTimeZoneLabel\(interview\.scheduledAt\)/);
  assert.doesNotMatch(calendarSource, /formatUserTimeZoneLabel/);
  assert.doesNotMatch(calendarSource, /часов(?:ом|ой) пояс/);
});

test("fullcalendar renders consistent minute time text and non-overlapping week events", () => {
  const source = readFileSync("components/dashboard/full-calendar-interviews.tsx", "utf8");

  assert.match(source, /eventTimeFormat=\{\{/);
  assert.match(source, /hour:\s*"2-digit"/);
  assert.match(source, /minute:\s*"2-digit"/);
  assert.match(source, /hour12:\s*false/);
  assert.match(source, /slotEventOverlap=\{false\}/);
  assert.match(source, /eventMinHeight=\{48\}/);
  assert.match(source, /eventShortHeight=\{48\}/);
  assert.match(source, /hiiire-fc-event-content/);
});

test("fullcalendar gives short week events enough height for title and subtitle", () => {
  const source = readFileSync("components/dashboard/full-calendar-interviews.tsx", "utf8");
  const styles = readFileSync("app/globals.css", "utf8");

  assert.match(source, /hiiire-fc-event-subtitle/);
  assert.match(source, /eventMinHeight=\{48\}/);
  assert.match(source, /eventShortHeight=\{48\}/);
  assert.match(styles, /\.fc \.fc-timegrid-event-short \.hiiire-fc-event-content \{[\s\S]*min-height:\s*2\.5rem/);
});

test("calendar keeps a draft slot highlight while the create form is open", () => {
  const calendarSource = readFileSync("components/dashboard/full-calendar-interviews.tsx", "utf8");
  const pageSource = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");
  const formSource = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");
  const styles = readFileSync("app/globals.css", "utf8");

  assert.match(calendarSource, /draftSelection\?:\s*CalendarSlotSelection\s*\|\s*null/);
  assert.match(calendarSource, /hiiire-full-calendar/);
  assert.match(calendarSource, /display:\s*"background"/);
  assert.match(calendarSource, /hiiire-fc-draft-selection/);
  assert.match(calendarSource, /arg\.view\.calendar\.unselect\(\)/);
  assert.match(calendarSource, /selectMirror=\{false\}/);
  assert.match(calendarSource, /eventDidMount=\{adjustDraftSelectionHeight\}/);
  assert.match(pageSource, /selectedSlot/);
  assert.match(pageSource, /draftSlot/);
  assert.match(pageSource, /draftSelection=\{draftSlot && !editingInterview \? draftSlot : null\}/);
  assert.match(pageSource, /onDraftSlotChange=\{setDraftSlot\}/);
  assert.match(formSource, /onDraftSlotChange\?:\s*\(slot:\s*CalendarSlotSelection\s*\|\s*null\)\s*=>\s*void/);
  assert.match(formSource, /notifyDraftSlotChange\(event\.target\.value,\s*durationMinutes\)/);
  assert.match(formSource, /notifyDraftSlotChange\(scheduledAt,\s*event\.target\.value\)/);
  assert.match(
    styles,
    /\.fc \.fc-bg-event\.hiiire-fc-draft-selection \{[\s\S]*background:\s*var\(--fc-highlight-color\);[\s\S]*opacity:\s*1;/
  );
  assert.match(styles, /\.hiiire-full-calendar \.fc-highlight,[\s\S]*\.hiiire-full-calendar \.fc-event-mirror \{[\s\S]*display:\s*none;/);
});

test("calendar draft highlight height uses the draft duration instead of event min height", () => {
  const source = readFileSync("components/dashboard/full-calendar-interviews.tsx", "utf8");

  assert.match(source, /const DRAFT_SELECTION_EVENT_ID = "hiiire-draft-selection";/);
  assert.match(source, /function formatDraftSelectionEventId\(selection: CalendarSlotSelection\)/);
  assert.match(source, /selection\.start\.getTime\(\)/);
  assert.match(source, /selection\.end\.getTime\(\)/);
  assert.match(source, /function adjustDraftSelectionHeight\(arg: EventMountArg\)/);
  assert.match(source, /!arg\.event\.id\.startsWith\(DRAFT_SELECTION_EVENT_ID\)/);
  assert.match(source, /id:\s*formatDraftSelectionEventId\(draftSelection\)/);
  assert.match(source, /\.fc-timegrid-bg-harness/);
  assert.match(source, /\.fc-timegrid-slot\[data-time\]/);
  assert.match(source, /durationMs \/ 60_000 \/ SLOT_DURATION_MINUTES/);
  assert.match(source, /harness\.style\.bottom = "auto"/);
  assert.match(source, /harness\.style\.height = `\$\{Math\.max\(1, height\)\}px`/);
});

test("calendar draft highlight updates do not reset the create form initial slot", () => {
  const pageSource = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");
  const formSource = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");

  assert.match(pageSource, /setSelectedSlot\(slot\);\s*setDraftSlot\(slot\);/);
  assert.match(pageSource, /initialSlot=\{selectedSlot \?\? undefined\}/);
  assert.match(pageSource, /onDraftSlotChange=\{setDraftSlot\}/);
  assert.doesNotMatch(pageSource, /onDraftSlotChange=\{setSelectedSlot\}/);

  const resetEffect = formSource.match(/useEffect\(\(\) => \{[\s\S]*?setVacancyCandidatesReloadKey\(0\);\s*\}, \[[^\]]+\]\);/)?.[0] ?? "";
  assert.match(resetEffect, /\[open, interview, initialSlot, initialCandidate, initialVacancy\]/);
});

test("calendar draft highlight disappears instead of lying for invalid duration input", () => {
  const formSource = readFileSync("components/dashboard/interview-form-dialog.tsx", "utf8");
  const resolver = formSource.match(/function resolveDraftSlot\(scheduledAt: string, durationMinutes: string\): CalendarSlotSelection \| null \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(resolver, /duration < 5\s*\|\|\s*duration > 480/);
  assert.match(resolver, /!Number\.isInteger\(duration\)/);
  assert.doesNotMatch(resolver, /Math\.min\(480,\s*Math\.max\(5/);
});

test("fullcalendar CSS overrides live in project globals", () => {
  const source = readFileSync("app/globals.css", "utf8");

  assert.match(source, /\.fc/);
  assert.match(source, /hiiire-fc-event-scheduled/);
  assert.match(source, /hiiire-fc-event-completed/);
  assert.match(source, /hiiire-fc-event-cancelled/);
});

test("fullcalendar CSS keeps list view and short events readable across themes", () => {
  const source = readFileSync("app/globals.css", "utf8");

  assert.match(source, /--fc-list-event-hover-bg-color:\s*hsl\(var\(--accent\)\)/);
  assert.match(source, /\.fc \.fc-list-event td/);
  assert.match(source, /\.fc \.fc-list-day-cushion/);
  assert.match(source, /\.fc \.fc-timegrid-event-short \.hiiire-fc-event-content/);
  assert.match(source, /min-height:\s*2\.5rem/);
  assert.match(source, /overflow:\s*visible/);
});

test("dashboard shell lets calendar content shrink on narrow mobile widths", () => {
  const source = readFileSync("app/(dashboard)/dashboard-shell.tsx", "utf8");

  assert.match(source, /className="[^"]*\bflex\b[^"]*\bmin-w-0\b[^"]*\bflex-col\b/);
  assert.match(source, /className="[^"]*\bflex\b[^"]*\bmin-h-0\b[^"]*\bmin-w-0\b[^"]*\bflex-1\b[^"]*\bflex-col\b/);
});

test("calendar tabs start at the left edge when they overflow on mobile", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");

  assert.match(source, /<TabsList className="max-w-full justify-start overflow-x-auto">/);
});

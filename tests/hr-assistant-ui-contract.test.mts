import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hrAssistantClient = readFileSync(
  "components/dashboard/hr-assistant/hr-assistant-client.tsx",
  "utf8"
);
const threadList = readFileSync(
  "components/dashboard/hr-assistant/thread-list.tsx",
  "utf8"
);
const assistantThread = readFileSync("components/assistant-ui/thread.tsx", "utf8");
const dashboardShell = readFileSync("app/(dashboard)/dashboard-shell.tsx", "utf8");

test("HR assistant client wires assistant runtime and layout panels", () => {
  assert.match(hrAssistantClient, /ThreadList/);
  assert.match(hrAssistantClient, /ContextPanel/);
  assert.match(hrAssistantClient, /AssistantRuntimeProvider/);
  assert.match(hrAssistantClient, /AssistantChatTransport/);
  assert.match(hrAssistantClient, /<Thread\b/);
});

test("action card exposes safe user-facing approval states", () => {
  const actionCard = readFileSync(
    "components/dashboard/hr-assistant/action-card.tsx",
    "utf8"
  );

  for (const copy of [
    "Выполнено автоматически",
    "Нужно подтверждение",
    "Подтвердить",
    "Отклонить",
    "Пока недоступно",
  ]) {
    assert.match(actionCard, new RegExp(copy));
  }

  assert.match(actionCard, /isBusy\?:\s*boolean/);
  assert.match(actionCard, /disabled=\{isBusy\}/);
});

test("assistant thread renders approval action cards from tool results", () => {
  assert.match(assistantThread, /useMessage/);
  assert.match(assistantThread, /PersistedActionCards/);
  assert.match(assistantThread, /ActionCard/);
  assert.match(assistantThread, /toolName/);
  assert.match(assistantThread, /toolRunId/);
  assert.match(assistantThread, /approvalRequired/);
  assert.match(assistantThread, /\/api\/hr-assistant\/approvals\/\$\{toolRunId\}/);
  assert.match(assistantThread, /JSON\.stringify\(\{ decision \}\)/);
  assert.match(assistantThread, /getHrAssistantUserFacingErrorMessage/);
  assert.match(assistantThread, /propose_candidate_status_change/);
  assert.match(assistantThread, /propose_candidate_note_update/);
  assert.match(assistantThread, /start_candidate_ai_analysis/);
});

test("assistant thread renders text parts as safe GFM markdown", () => {
  assert.match(assistantThread, /ReactMarkdown/);
  assert.match(assistantThread, /remarkGfm/);
  assert.match(assistantThread, /target="_blank"/);
  assert.match(assistantThread, /rel="noopener noreferrer"/);
  assert.match(
    assistantThread,
    /<MessagePrimitive\.Parts>[\s\S]+part\.type === "text"[\s\S]+<MarkdownTextPart text=\{part\.text\}/
  );
  assert.match(assistantThread, /overflow-x-auto/);
  assert.match(assistantThread, /prose-table/);
  assert.doesNotMatch(assistantThread, /dangerouslySetInnerHTML/);
});

test("HR assistant client protects constrained chat layout from overflow", () => {
  for (const className of ["min-w-0", "overflow-hidden", "break-words"]) {
    assert.match(hrAssistantClient, new RegExp(className));
  }
});

test("dashboard shell gives full-height tools a shrinkable content region", () => {
  assert.match(
    dashboardShell,
    /<div className="flex min-h-screen min-w-0 flex-col">/
  );
  assert.match(
    dashboardShell,
    /<main className="[^"]*\bmin-h-0\b[^"]*\bflex-1\b/
  );
});

test("HR assistant page fills the dashboard content region instead of hard-coding viewport math", () => {
  const rootMatch = hrAssistantClient.match(
    /return \(\s*<div className="(?<className>[^"]+)">/
  );
  assert.ok(rootMatch?.groups?.className, "HR assistant root class was not found");
  const rootClassName = rootMatch.groups.className;

  assert.match(rootClassName, /\bflex-1\b/);
  assert.match(rootClassName, /\bmin-h-0\b/);
  assert.match(rootClassName, /\boverflow-hidden\b/);
  assert.doesNotMatch(rootClassName, /h-\[calc\(100dvh_/);
  assert.doesNotMatch(hrAssistantClient, /min-h-\[calc\(100vh-8rem\)\]/);
  assert.doesNotMatch(hrAssistantClient, /min-h-\[36rem\]/);
  assert.doesNotMatch(hrAssistantClient, /min-h-\[32rem\]/);
  assert.match(assistantThread, /ThreadPrimitive\.Viewport[\s\S]+overflow-y-auto/);
});

test("HR assistant message history scrolls inside the chat pane instead of growing the page", () => {
  assert.match(
    hrAssistantClient,
    /<div className="min-h-0 min-w-0 flex-1 overflow-hidden">\s*<HrAssistantRuntimeShell/
  );
  assert.match(
    assistantThread,
    /ThreadPrimitive\.Root className="[^"]*\bh-full\b[^"]*\bmin-h-0\b[^"]*\boverflow-hidden\b/
  );
  assert.match(
    assistantThread,
    /ThreadPrimitive\.Viewport[\s\S]+className="[^"]*\bmin-h-0\b[^"]*\bflex-1\b[^"]*\boverflow-y-auto\b/
  );
  assert.match(
    assistantThread,
    /ThreadPrimitive\.ViewportFooter className="[^"]*\bsticky\b[^"]*\bbottom-0\b/
  );
});

test("HR assistant switches to a single-pane chat flow on mobile", () => {
  assert.match(hrAssistantClient, /ArrowLeft/);
  assert.match(hrAssistantClient, /Вернуться к списку чатов/);
  assert.match(
    hrAssistantClient,
    /const \[mobileChatOpen,\s*setMobileChatOpen\] = useState\(false\)/
  );
  assert.match(
    hrAssistantClient,
    /const shouldShowMobileMain = mobileChatOpen \|\| Boolean\(loadError\)/
  );
  assert.match(hrAssistantClient, /className=\{shouldShowMobileMain \? "hidden md:flex" : "flex"\}/);
  assert.match(hrAssistantClient, /shouldShowMobileMain \? "flex" : "hidden md:flex"/);
  assert.match(hrAssistantClient, /onClick=\{\(\) => setMobileChatOpen\(false\)\}/);
  assert.doesNotMatch(hrAssistantClient, /onClick=\{\(\) => setActiveThreadId\(null\)\}/);
  assert.match(hrAssistantClient, /setMobileChatOpen\(true\)/);
  assert.match(threadList, /className\?:\s*string/);
  assert.match(threadList, /isLoading\?:\s*boolean/);
  assert.match(threadList, /Загружаем чаты\.\.\./);
  assert.match(threadList, /cn\([\s\S]*className[\s\S]*\)/);
});

test("HR assistant transport sends the strict chat route body with client calendar time context", () => {
  assert.doesNotMatch(hrAssistantClient, /PLACEHOLDER_THREAD_ID/);
  assert.match(hrAssistantClient, /prepareSendMessagesRequest/);
  assert.match(
    hrAssistantClient,
    /body:\s*\{\s*threadId:\s*activeThreadId,\s*messages,\s*clientTimeZone:\s*getClientTimeZone\(\)\s*\}/
  );
  assert.doesNotMatch(hrAssistantClient, /clientNowIso/);
  assert.doesNotMatch(
    hrAssistantClient,
    /^\s*body:\s*\{\s*threadId:\s*activeThreadId\s*\},/m
  );
});

test("HR assistant runtime is remounted when the selected thread changes", () => {
  const runtimeShellMatch = hrAssistantClient.match(
    /function HrAssistantRuntimeShell\([\s\S]*?\nexport function HrAssistantClient/
  );
  assert.ok(runtimeShellMatch?.[0], "HrAssistantRuntimeShell was not found");
  assert.match(runtimeShellMatch[0], /new AssistantChatTransport/);
  assert.match(runtimeShellMatch[0], /useChatRuntime\(\{/);
  assert.match(runtimeShellMatch[0], /messages:\s*initialMessages/);
  assert.match(runtimeShellMatch[0], /AssistantRuntimeProvider/);
  assert.match(
    runtimeShellMatch[0],
    /body:\s*\{\s*threadId:\s*activeThreadId,\s*messages,\s*clientTimeZone:\s*getClientTimeZone\(\)\s*\}/
  );

  assert.match(
    hrAssistantClient,
    /<HrAssistantRuntimeShell\s+key=\{activeThreadId\s*\?\?\s*["']no-thread["']\}/
  );
});

test("HR assistant runtime mounts only after active thread messages are loaded", () => {
  assert.match(
    hrAssistantClient,
    /const \[loadedMessagesThreadId,\s*setLoadedMessagesThreadId\] = useState<string \| null>\(null\)/
  );
  assert.match(
    hrAssistantClient,
    /const isActiveThreadReady =\s*activeThreadId !== null &&\s*loadedMessagesThreadId === activeThreadId &&\s*!isLoadingMessages;/
  );
  assert.match(
    hrAssistantClient,
    /const shouldShowThreadLoading =\s*activeThreadId !== null && isLoadingMessages;/
  );
  assert.match(
    hrAssistantClient,
    /isActiveThreadReady \? \(\s*<div className="min-h-0 min-w-0 flex-1 overflow-hidden">\s*<HrAssistantRuntimeShell/
  );
  assert.match(
    hrAssistantClient,
    /setInitialMessages\(messages\);\s*setLoadedMessagesThreadId\(activeThreadId\);/
  );
});

test("HR assistant client caps hydrated history before creating runtime state", () => {
  assert.match(hrAssistantClient, /const MAX_HYDRATED_MESSAGES = 60;/);
  assert.match(
    hrAssistantClient,
    /rows\.slice\(-MAX_HYDRATED_MESSAGES\)\.map/
  );
});

test("HR assistant client shows retryable message-load errors without mounting runtime", () => {
  assert.match(
    hrAssistantClient,
    /const \[messageLoadError,\s*setMessageLoadError\] = useState<string \| null>\(null\)/
  );
  assert.match(
    hrAssistantClient,
    /const \[messageLoadErrorThreadId,\s*setMessageLoadErrorThreadId\] = useState<string \| null>\(null\)/
  );
  assert.match(
    hrAssistantClient,
    /const \[messageLoadRetryKey,\s*setMessageLoadRetryKey\] = useState\(0\)/
  );
  assert.match(
    hrAssistantClient,
    /const shouldShowMessageLoadError =\s*activeThreadId !== null &&\s*!isLoadingMessages &&\s*messageLoadErrorThreadId === activeThreadId &&\s*loadedMessagesThreadId !== activeThreadId;/
  );
  assert.match(
    hrAssistantClient,
    /const handleRetryThreadMessages = useCallback\(\(\) => \{[\s\S]*?setMessageLoadRetryKey\(\(value\) => value \+ 1\);[\s\S]*?\}, \[activeThreadId\]\);/
  );
  assert.match(hrAssistantClient, /Не удалось загрузить историю чата\./);
  assert.match(hrAssistantClient, />\s*Повторить\s*</);
  assert.match(hrAssistantClient, /onClick=\{handleRetryThreadMessages\}/);
  assert.match(
    hrAssistantClient,
    /shouldShowMessageLoadError \? \([\s\S]*?messageLoadError[\s\S]*?<Button[\s\S]*?Повторить[\s\S]*?\) : null/
  );
});

test("HR assistant client loads persisted threads and messages", () => {
  assert.match(hrAssistantClient, /fetch\(\s*["']\/api\/hr-assistant\/threads["']/);
  assert.match(
    hrAssistantClient,
    /fetch\(\s*`\/api\/hr-assistant\/threads\/\$\{threadId\}\/messages`/
  );
  assert.match(hrAssistantClient, /cache:\s*["']no-store["']/);
  assert.match(hrAssistantClient, /setThreads\(loaded\)/);
  assert.match(hrAssistantClient, /setActiveThreadId/);
  assert.match(hrAssistantClient, /setInitialMessages/);
  assert.match(hrAssistantClient, /metadata:\s*\{\s*createdAt:\s*row\.created_at\s*\}/);
});

test("HR assistant client creates company-scoped general threads", () => {
  assert.match(hrAssistantClient, /method:\s*["']POST["']/);
  assert.match(hrAssistantClient, /title:\s*["']Новый чат["']/);
  assert.match(hrAssistantClient, /scopeType:\s*["']company["']/);
  assert.match(hrAssistantClient, /mode:\s*["']general["']/);
  assert.match(hrAssistantClient, /JSON\.stringify/);
});

test("HR assistant client exposes search, archive filter, archive actions, and pin actions", () => {
  assert.match(hrAssistantClient, /searchQuery/);
  assert.match(hrAssistantClient, /showArchived/);
  assert.match(hrAssistantClient, /URLSearchParams/);
  assert.match(hrAssistantClient, /includeArchived/);
  assert.match(hrAssistantClient, /handleArchiveThread/);
  assert.match(hrAssistantClient, /handlePinThread/);
  assert.match(hrAssistantClient, /setThreads\(loaded\)/);

  assert.match(threadList, /Search/);
  assert.match(threadList, /Archive/);
  assert.match(threadList, /ArchiveRestore/);
  assert.match(threadList, /Pin/);
  assert.match(threadList, /PinOff/);
  assert.match(threadList, /messageSnippet/);
  assert.match(threadList, /searchMatchType/);
  assert.match(threadList, /archived_at/);
  assert.match(threadList, /pinned_at/);
  assert.match(threadList, /Показать архив/);
  assert.match(threadList, /Скрыть архив/);
  assert.match(threadList, /minLength=\{2\}/);
  assert.match(threadList, /Введите минимум 2 символа для поиска\./);
  assert.match(threadList, /Архив/);
  assert.match(threadList, /Закрепить/);
});

test("HR assistant client avoids one-character search requests and refreshes titles after chat responses", () => {
  assert.match(hrAssistantClient, /const isSearchTooShort = searchQuery\.trim\(\)\.length === 1/);
  assert.match(hrAssistantClient, /if \(isSearchTooShort\)[\s\S]+setIsLoadingThreads\(false\)/);
  assert.match(hrAssistantClient, /const effectiveSearch = trimmedSearch\.length >= 2 \? trimmedSearch : ""/);
  assert.match(hrAssistantClient, /res\.clone\(\)\.text\(\)\.catch\(\(\) => undefined\)\.finally\(onChatResponseSettled\)/);
  assert.match(hrAssistantClient, /const handleChatResponseSettled = useCallback/);
  assert.match(hrAssistantClient, /threads=\{isSearchTooShort \? \[\] : threads\}/);
  assert.match(hrAssistantClient, /searchTooShort=\{isSearchTooShort\}/);
  assert.match(hrAssistantClient, /onChatResponseSettled=\{handleChatResponseSettled\}/);
});

test("HR assistant client falls back to the default thread list when chat search is cleared", () => {
  const loadThreadsMatch = hrAssistantClient.match(
    /const loadThreads = useCallback\(async \(nextActiveThreadId\?: string(?:,[\s\S]*?)?\) => \{[\s\S]*?\n  \}, \[searchQuery, showArchived\]\);/
  );
  assert.ok(loadThreadsMatch?.[0], "loadThreads block was not found");

  assert.match(loadThreadsMatch[0], /const requestSearchQuery = options\.searchQuery \?\? searchQuery;/);
  assert.match(loadThreadsMatch[0], /const trimmedSearch = requestSearchQuery\.trim\(\);/);
  assert.match(loadThreadsMatch[0], /const effectiveSearch = trimmedSearch\.length >= 2 \? trimmedSearch : "";/);
  assert.match(loadThreadsMatch[0], /if \(effectiveSearch\) params\.set\("search", effectiveSearch\);/);
  assert.match(loadThreadsMatch[0], /if \(showArchived\) params\.set\("includeArchived", "true"\);/);
  assert.match(loadThreadsMatch[0], /if \(effectiveSearch && !showArchived\) params\.set\("includeArchived", "false"\);/);
  assert.match(loadThreadsMatch[0], /const queryString = params\.toString\(\);/);
  assert.match(
    loadThreadsMatch[0],
    /fetch\("\/api\/hr-assistant\/threads" \+ \(queryString \? `\?\$\{queryString\}` : ""\), \{ cache: "no-store" \}\)/
  );
});

test("HR assistant chat search keeps archived threads hidden until the archive toggle is enabled", () => {
  const loadThreadsMatch = hrAssistantClient.match(
    /const loadThreads = useCallback\(async \(nextActiveThreadId\?: string(?:,[\s\S]*?)?\) => \{[\s\S]*?\n  \}, \[searchQuery, showArchived\]\);/
  );
  assert.ok(loadThreadsMatch?.[0], "loadThreads block was not found");

  assert.match(loadThreadsMatch[0], /if \(showArchived\) params\.set\("includeArchived", "true"\);/);
  assert.match(loadThreadsMatch[0], /if \(effectiveSearch && !showArchived\) params\.set\("includeArchived", "false"\);/);
  assert.doesNotMatch(loadThreadsMatch[0], /if \(showArchived \|\| effectiveSearch\) params\.set\("includeArchived", "true"\);/);
});

test("HR assistant new thread clears chat search before reloading the thread list", () => {
  const createThreadMatch = hrAssistantClient.match(
    /const createThread = useCallback\([\s\S]*?\n  \}, \[isCreatingThread, loadThreads\]\);/
  );
  assert.ok(createThreadMatch?.[0], "createThread block was not found");

  assert.match(createThreadMatch[0], /setSearchQuery\(""\);/);
  assert.match(createThreadMatch[0], /await loadThreads\(createdThreadId \?\? undefined,\s*\{\s*searchQuery:\s*""\s*\}\);/);
});

test("HR assistant ignores stale thread list responses from superseded searches", () => {
  assert.match(hrAssistantClient, /const threadListRequestSeq = useRef\(0\);/);

  const loadThreadsMatch = hrAssistantClient.match(
    /const loadThreads = useCallback\(async \(nextActiveThreadId\?: string(?:,[\s\S]*?)?\) => \{[\s\S]*?\n  \}, \[searchQuery, showArchived\]\);/
  );
  assert.ok(loadThreadsMatch?.[0], "loadThreads block was not found");
  assert.match(loadThreadsMatch[0], /const requestSeq = \+\+threadListRequestSeq\.current;/);
  assert.match(loadThreadsMatch[0], /if \(requestSeq !== threadListRequestSeq\.current\) return null;/);
  assert.match(hrAssistantClient, /if \(isSearchTooShort\) \{\s*threadListRequestSeq\.current \+= 1;/);
});

test("HR assistant client clears visible messages before switching chats", () => {
  const createThreadMatch = hrAssistantClient.match(
    /const createThread = useCallback\([\s\S]*?\n  \}, \[isCreatingThread, loadThreads\]\);/
  );
  assert.ok(createThreadMatch?.[0], "createThread block was not found");
  assert.match(
    createThreadMatch[0],
    /createdThreadId = readCreatedThreadId\(json\);\s*if\s*\(createdThreadId\)\s*\{\s*setInitialMessages\(\[\]\);\s*setLoadedMessagesThreadId\(null\);\s*setMessageLoadError\(null\);\s*setMessageLoadErrorThreadId\(null\);\s*\}\s*setSearchQuery\(""\);\s*await loadThreads\(createdThreadId \?\? undefined,\s*\{\s*searchQuery:\s*""\s*\}\);\s*if\s*\(createdThreadId\)\s*\{\s*setActiveThreadId\(createdThreadId\);\s*setMobileChatOpen\(true\);\s*\}/
  );
  assert.match(
    createThreadMatch[0],
    /catch \(error\) \{\s*if\s*\(createdThreadId\)\s*\{\s*setActiveThreadId\(null\);\s*setMobileChatOpen\(false\);/
  );

  const handleSelectThreadMatch = hrAssistantClient.match(
    /const handleSelectThread = useCallback\([\s\S]*?\n  \}, \[activeThreadId\]\);/
  );
  assert.ok(handleSelectThreadMatch?.[0], "handleSelectThread block was not found");
  assert.match(
    handleSelectThreadMatch[0],
    /if \(threadId === activeThreadId\) \{\s*setMobileChatOpen\(true\);\s*return;\s*\}[\s\S]*setInitialMessages\(\[\]\);\s*setLoadedMessagesThreadId\(null\);\s*setMessageLoadError\(null\);\s*setMessageLoadErrorThreadId\(null\);\s*setActiveThreadId\(threadId\);\s*setMobileChatOpen\(true\);/
  );
});

test("HR assistant client clears loaded message ownership when active thread is reset", () => {
  assert.match(
    hrAssistantClient,
    /if\s*\(!activeThreadId\)\s*\{\s*setInitialMessages\(\[\]\);\s*setLoadedMessagesThreadId\(null\);\s*setMessageLoadError\(null\);\s*setMessageLoadErrorThreadId\(null\);\s*setIsLoadingMessages\(false\);/
  );
  assert.match(
    hrAssistantClient,
    /setInitialMessages\(\[\]\);\s*setLoadedMessagesThreadId\(null\);\s*setMessageLoadError\(null\);\s*setMessageLoadErrorThreadId\(null\);\s*setIsLoadingMessages\(true\);/
  );
});

test("HR assistant runtime is keyed and hydrated from selected thread", () => {
  assert.match(hrAssistantClient, /id:\s*activeThreadId\s*\?\?\s*["']no-thread["']/);
  assert.match(hrAssistantClient, /messages:\s*initialMessages/);
  assert.match(
    hrAssistantClient,
    /<HrAssistantRuntimeShell\s+key=\{activeThreadId\s*\?\?\s*["']no-thread["']\}/
  );
});

test("thread list renders persisted threads with selection callbacks", () => {
  assert.match(threadList, /type\s+ThreadListItem\s*=/);
  assert.match(threadList, /threads:\s*ThreadListItem\[\]/);
  assert.match(threadList, /activeThreadId:\s*string\s*\|\s*null/);
  assert.match(threadList, /onSelectThread:\s*\(threadId:\s*string\)\s*=>\s*void/);
  assert.match(threadList, /isNewThreadDisabled\?:\s*boolean/);
  assert.match(threadList, /newThreadLabel\?:\s*string/);
  assert.match(threadList, /threads\.map/);
  assert.match(threadList, /onClick=\{\(\)\s*=>\s*onSelectThread\(thread\.id\)\}/);
  assert.match(threadList, /disabled=\{isNewThreadDisabled\}/);
  assert.match(hrAssistantClient, /isNewThreadDisabled=\{isCreatingThread\s*\|\|\s*isLoadingThreads\}/);
  assert.match(hrAssistantClient, /newThreadLabel=\{isCreatingThread\s*\?\s*["']Создаем\.\.\.["']\s*:\s*["']Новый["']\}/);
  assert.match(threadList, /type="button"/);
  assert.match(threadList, /truncate/);
  assert.match(threadList, /min-w-0/);
});

test("assistant thread send button does not submit the composer form twice", () => {
  assert.match(assistantThread, /type="button"/);
  assert.doesNotMatch(assistantThread, /type="submit"/);
});

test("assistant-ui runtime options stay compatible with AI SDK ChatInit", () => {
  const useChatRuntimeTypes = readFileSync(
    "node_modules/@assistant-ui/react-ai-sdk/dist/ui/use-chat/useChatRuntime.d.ts",
    "utf8"
  );
  const aiSdkTypes = readFileSync("node_modules/ai/dist/index.d.ts", "utf8");

  assert.match(useChatRuntimeTypes, /import\s+type\s+\{\s*ChatInit\s*\}\s+from\s+"ai"/);
  assert.match(
    useChatRuntimeTypes,
    /type\s+UseChatRuntimeOptions<[^>]+>\s*=\s*ChatInit<[^>]+>\s*&\s*\{/
  );

  const chatInitMatch = aiSdkTypes.match(
    /interface\s+ChatInit<[^>]+>\s*\{(?<body>[\s\S]*?)\n\}/
  );
  assert.ok(chatInitMatch?.groups?.body, "AI SDK ChatInit interface was not found");

  const chatInitBody = chatInitMatch.groups.body;
  for (const property of ["id", "messages", "transport"]) {
    assert.match(chatInitBody, new RegExp(`\\b${property}\\?:`));
  }
});

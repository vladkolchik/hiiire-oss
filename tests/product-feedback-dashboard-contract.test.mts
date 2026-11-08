import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const feedbackPagePath = "app/(dashboard)/dashboard/feedback/page.tsx";
const feedbackFormPath = "app/(dashboard)/dashboard/feedback/feedback-form.tsx";
const omnideskWidgetPath = "app/(dashboard)/dashboard/feedback/omnidesk-support-widget.tsx";
const sidebarSource = readFileSync("components/dashboard/sidebar.tsx", "utf8");
const mobileNavSource = readFileSync("components/dashboard/mobile-nav.tsx", "utf8");
const navItemsSource = readFileSync("components/dashboard/nav-items.ts", "utf8");
const statsSource = readFileSync("app/(dashboard)/dashboard/stats/page.tsx", "utf8");

function readRequiredSource(path: string): string {
  assert.equal(existsSync(path), true, `${path} must exist`);
  return readFileSync(path, "utf8");
}

test("dashboard navigation exposes product feedback in desktop and mobile menus", () => {
  assert.match(sidebarSource, /dashboardNavItems\.map/, "sidebar must render shared dashboard nav items");
  assert.match(mobileNavSource, /dashboardNavItems\.map/, "mobile nav must render shared dashboard nav items");
  assert.match(navItemsSource, /MessageSquareText/, "shared nav items must use a lucide feedback icon");
  assert.match(navItemsSource, /title:\s*"Обратная связь"/, "shared nav items must label the feedback item");
  assert.match(navItemsSource, /href:\s*"\/dashboard\/feedback"/, "shared nav items must link to feedback page");
});

test("feedback dashboard page owns the feedback flow", () => {
  const source = readRequiredSource(feedbackPagePath);

  assert.match(source, /<h1[^>]*>\s*Обратная связь\s*<\/h1>/, "page must render the feedback heading");
  assert.match(source, /<FeedbackForm\s*\/>/, "page must render the product feedback form");
  assert.doesNotMatch(source, /Что помогает быстрее разобраться/, "page must not add a busy helper sidebar outside the flow");
});

test("feedback form uses shared options, validates before submit, and calls submitFeedback", () => {
  const source = readRequiredSource(feedbackFormPath);

  assert.match(source, /"use client"/, "form must be a client component");
  assert.match(source, /FEEDBACK_TYPE_OPTIONS/, "form must use shared type options");
  assert.match(source, /FEEDBACK_SECTION_OPTIONS/, "form must use shared section options");
  assert.match(source, /FEEDBACK_MESSAGE_MAX_LENGTH/, "form must use shared message limit");
  assert.match(source, /submitFeedback/, "form must call the shared submit helper");
  assert.match(source, /maxLength=\{FEEDBACK_MESSAGE_MAX_LENGTH\}/, "textarea must mirror the server message limit");
  assert.match(source, /Выберите хотя бы один раздел/, "missing sections toast must be user-facing");
  assert.match(source, /Напишите сообщение/, "missing message toast must be user-facing");
  assert.match(source, /toast\.error/, "validation failures must surface through toast");
  assert.match(source, /FEEDBACK_TYPE_OPTIONS\.map/, "type options must be rendered from shared constants");
  assert.match(source, /FEEDBACK_SECTION_OPTIONS\.map/, "section options must be rendered from shared constants");
});

test("feedback form mirrors critical limits before submit", () => {
  const source = readRequiredSource(feedbackFormPath);

  assert.match(source, /maxLength=\{FEEDBACK_MESSAGE_MAX_LENGTH\}/, "textarea must expose the message limit to the browser");
  assert.match(
    source,
    /event\.target\.value\.slice\(0,\s*FEEDBACK_MESSAGE_MAX_LENGTH\)/,
    "textarea change handler must keep local state within the server message limit"
  );
  assert.match(source, /disabled=\{sections\.length === 0 \|\| isSubmitting\}/, "sections step must block progress until a section is selected");
});

test("feedback form starts with two path tiles and an Omnidesk support path", () => {
  const source = readRequiredSource(feedbackFormPath);

  assert.match(source, /type FeedbackFlow = "idea" \| "support"/, "form must model the two UI paths");
  assert.match(source, /Поделиться идеей/, "form must expose the idea path tile");
  assert.match(source, /Что-то не работает/, "form must expose the support path tile");
  assert.match(source, /setFlow\("idea"\)/, "idea tile must open the idea flow");
  assert.match(source, /setFlow\("support"\)/, "support tile must open the support path");
  assert.match(source, /<OmnideskSupportWidget\s*\/>/, "support path must render the Omnidesk integration");
  assert.doesNotMatch(source, /Пока не добавили этот раздел/, "support path must not show the old placeholder");
  assert.doesNotMatch(source, /Скоро добавим/, "support path must not tell users the section is unavailable");
});

test("feedback support path opens Omnidesk through a custom right-side flow", () => {
  const source = readRequiredSource(omnideskWidgetPath);

  assert.match(source, /"use client"/, "Omnidesk widget must run only on the client");
  assert.match(source, /OMNIDESK_WIDGET_ID\s*=\s*"16299-a2n9kvek"/, "widget id must match the provided Omnidesk widget");
  assert.match(source, /hiiire\.omnidesk\.ru\/bundles\/acmesite\/js\/cwidget0\.2\.min\.js/, "widget must load from the hiiire Omnidesk account");
  assert.match(source, /display_button:\s*false/, "standard floating Omnidesk button must stay hidden");
  assert.doesNotMatch(source, /omni-email-widget/, "custom support CTA must not rely on Omnidesk's implicit class click handler");
  assert.match(source, /OmniWidgetApi\?\.call\("open_widget\.16299"\)/, "CTA must open the email request form through one explicit API call");
  assert.match(source, /useAuth/, "widget must use the authenticated dashboard user for safe prefill context");
  assert.match(source, /user_email:\s*user\?\.email/, "widget must pass user email to Omnidesk identify");
  assert.match(source, /company_name:\s*user\?\.company/, "widget must pass company context through Omnidesk's system field");
  assert.match(source, /entry\.widget\s*=\s*\{\s*ready\(\)/, "advanced Omnidesk fields must use the documented widget ready hook");
  assert.match(source, /entry\.widget\.identify\s*=\s*identifyPayload/, "identify payload must use documented widget identify object");
  assert.match(source, /entry\.widget\.hide\s*=\s*\["user_email",\s*"user_full_name",\s*"subject"\]/, "prefilled fields must use documented widget hide array");
  assert.match(source, /source_url:\s*getCurrentPageUrl\(\)/, "support context must send a sanitized page URL");
  assert.match(source, /window\.location\.origin.*window\.location\.pathname/s, "sanitized page URL must omit query strings and hash fragments");
  assert.doesNotMatch(source, /window\.location\.href/, "support context must not send full URLs with query strings or hash fragments");
  assert.doesNotMatch(source, /company_id/, "support context must not send internal company ids to Omnidesk");
  assert.doesNotMatch(source, /user_info:\s*true/, "support widget must not send implicit Omnidesk user/device metadata");
  assert.doesNotMatch(source, /email_widget\?\.identify/, "advanced identify must not use undocumented email_widget identify calls");
  assert.match(source, /Не удалось открыть форму поддержки\. Попробуйте ещё раз\./, "load errors must stay user-facing");
  assert.match(source, /failedScript\.remove\(\)/, "failed widget script loads must be removed so retry can reload Omnidesk");
  assert.match(source, /ensureOmnideskScript\(\{\s*onError/, "CTA retry must attempt to load the script before waiting for Omnidesk API");
  assert.match(source, /OmniWidgetApi\?\.call\("close_widget\.16299"\)/, "unmount must close the Omnidesk request form");
  assert.match(source, /OmniWidgetApi\?\.call\("reset\.16299"\)/, "unmount must reset Omnidesk email form fields");
  assert.match(source, /delete entry\.widget\.identify/, "unmount must clear the global identify payload");
  assert.match(source, /delete entry\.widget\.ready/, "unmount must clear the ready callback that closes over identify payload");
  assert.match(source, /OmniWidgetApi\?\.call\("hide_btn\.16299"\)/, "unmount must keep the default Omnidesk launcher hidden after route changes");
  assert.match(source, /openRequestRef\.current/, "CTA must synchronously guard against duplicate open requests");
  assert.match(source, /requestIdRef\.current/, "async Omnidesk opens must be scoped to the latest request");
  assert.match(source, /if \(!isCurrentOpenRequest\(requestId\)\) return/, "CTA must not open Omnidesk after unmount or stale async resolution");
  assert.match(source, /setIsOpening\(false\).*openRequestRef\.current = false/s, "script load errors must immediately re-enable retry");
  assert.match(source, /existingScript\.onerror\s*=/, "existing loading script must use the current component's error handler after remount");
  assert.match(source, /React\.useEffect\(\(\) => \{\s*mountedRef\.current = true/s, "mount lifecycle must be independent from auth user changes");
  assert.match(source, /\}, \[handleOmnideskLoadError\]\);/, "mount cleanup must not run just because the auth user object changes");
  assert.match(source, /React\.useEffect\(\(\) => \{\s*configureOmnidesk\(user\);/s, "auth user changes must only refresh Omnidesk context");
  assert.match(source, /removeOmnideskScript\(\)/, "API readiness timeout must remove a stale script so retry can reload Omnidesk");
});

test("feedback idea path is a lightweight step-by-step flow", () => {
  const source = readRequiredSource(feedbackFormPath);

  assert.doesNotMatch(source, /SelectTrigger/, "feedback type should be shown as direct choices, not a dropdown");
  assert.doesNotMatch(source, /Checkbox/, "sections should be compact toggle chips, not a grid of checkbox cards");
  assert.doesNotMatch(source, /<Card(?:\s|>)/, "feedback form should avoid nested Card chrome");
  assert.match(source, /type FeedbackStep = "type" \| "sections" \| "message"/, "idea flow must have explicit steps");
  assert.match(source, /setStep\("sections"\)/, "type step must advance to sections");
  assert.match(source, /setStep\("message"\)/, "sections step must advance to message");
  assert.match(source, /disabled=\{sections\.length === 0 \|\| isSubmitting\}/, "sections step must require at least one section");
  assert.match(source, /Назад/, "wizard must let users go back");
  assert.match(source, /Далее/, "wizard must use a simple next action");
  assert.match(source, /aria-pressed=\{type === option\.value\}/, "type choices must expose pressed state");
  assert.match(source, /aria-pressed=\{checked\}/, "section choices must expose pressed state");
  assert.match(source, /type="button"/, "choice chips must not submit the form");
});

test("production stats page no longer owns product feedback submission", () => {
  assert.doesNotMatch(statsSource, /submitFeedback/, "stats page must not import or call submitFeedback");
  assert.match(statsSource, /AnalyticsDashboard/, "stats page must render the production analytics dashboard");
  assert.doesNotMatch(statsSource, /href="\/dashboard\/feedback"/, "stats page is no longer a feedback placeholder");
});

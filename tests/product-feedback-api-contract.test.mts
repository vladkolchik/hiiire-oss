import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const feedbackRoute = readFileSync(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8");
const feedbackService = readFileSync(new URL("../services/data/feedback.ts", import.meta.url), "utf8");

test("feedback API validates product feedback and inserts author snapshot with admin client", () => {
  assert.match(feedbackRoute, /requireSameOriginRequest/);
  assert.match(feedbackRoute, /const csrfRes = requireSameOriginRequest\(req\)/);
  assert.match(feedbackRoute, /if \(!csrfRes\.ok\) return csrfRes\.response/);
  assert.match(feedbackRoute, /FeedbackSubmissionSchema/);
  assert.match(feedbackRoute, /mapFeedbackValidationIssues/);
  assert.match(feedbackRoute, /createSupabaseServerClient/);
  assert.match(feedbackRoute, /getConfirmedServerUser/);
  assert.match(feedbackRoute, /getSupabaseAdminClient/);
  assert.match(feedbackRoute, /normalizeFeedbackSourceUrl/);
  assert.match(feedbackRoute, /\.select\("company_id,name,email,role"\)/);

  for (const field of [
    /company_id:\s*profile\.company_id/,
    /user_id:\s*authRes\.user\.id/,
    /author_name:\s*profile\.name/,
    /author_email:\s*profile\.email/,
    /author_role:\s*profile\.role/,
    /type:\s*parsed\.data\.type/,
    /sections:\s*parsed\.data\.sections/,
    /message:\s*parsed\.data\.message/,
    /source_url:\s*sourceUrl/,
    /user_agent:/,
  ]) {
    assert.match(feedbackRoute, field);
  }

  assert.doesNotMatch(feedbackRoute, /page:\s*parsed\.data\.page/);
  assert.doesNotMatch(feedbackRoute, /const\s+\{\s*page\s*,/);
  assert.doesNotMatch(feedbackRoute, /supabase\.from\("feedback"\)\.insert/);
});

test("feedback API returns safe Russian messages for auth, validation, and insert failures", () => {
  assert.match(feedbackRoute, /"Войдите, чтобы отправить сообщение\."/);
  assert.match(feedbackRoute, /"Подтвердите email, чтобы отправить сообщение\."/);
  assert.match(feedbackRoute, /issues\[0\]\?\.message/);
  assert.match(feedbackRoute, /"Не удалось отправить сообщение\. Попробуйте ещё раз\."/);
  assert.doesNotMatch(feedbackRoute, /NextResponse\.json\(\{\s*error:\s*"INVALID_BODY"\s*\}/);
});

test("feedback service posts product feedback payload and reads safe API messages", () => {
  assert.match(feedbackService, /type:\s*FeedbackType/);
  assert.match(feedbackService, /sections:\s*FeedbackSection\[\]/);
  assert.match(feedbackService, /sourceUrl\?:\s*string\s*\|\s*null/);
  assert.match(feedbackService, /readFeedbackApiErrorMessage/);
  assert.match(feedbackService, /type:\s*input\.type/);
  assert.match(feedbackService, /sections:\s*input\.sections/);
  assert.match(feedbackService, /sourceUrl:\s*input\.sourceUrl\s*\?\?\s*null/);

  assert.doesNotMatch(feedbackService, /page:\s*"stats"/);
  assert.doesNotMatch(feedbackService, /page:\s*input\.page/);
  assert.doesNotMatch(feedbackService, /throw new Error\(typeof err === "string"/);
  assert.doesNotMatch(feedbackService, /INVALID_BODY/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const businessEventsSource = () => readFileSync("lib/analytics/business-events.ts", "utf8");
const candidateRouteSource = () => readFileSync("app/api/candidates/route.ts", "utf8");

function captureBusinessEventCalls(source: string): string {
  return Array.from(source.matchAll(/captureBusinessEvent\(\{[\s\S]*?\n\s*\}\);/g), (match) => match[0]).join(
    "\n---capture---\n",
  );
}

test("business event taxonomy allowlists resume extraction events and safe properties", () => {
  const source = businessEventsSource();

  for (const event of ["resume_extraction_completed", "resume_extraction_failed"]) {
    assert.match(source, new RegExp(`"${event}"`));
  }

  for (const property of [
    "file_kind",
    "file_size_bytes",
    "duration_ms",
    "result_code",
    "error_kind",
    "request_id",
  ]) {
    assert.match(source, new RegExp(`"${property}"`));
  }
});

test("resume extraction telemetry capture sites do not include sensitive resume fields nearby", () => {
  const routeCalls = captureBusinessEventCalls(candidateRouteSource());
  const businessEventCalls = captureBusinessEventCalls(businessEventsSource());

  assert.doesNotMatch(`${routeCalls}\n${businessEventCalls}`, /resumeText|resume_file_name|fileName/);
});

test("candidate create route correlates completed and failed extraction telemetry with a safe request id", () => {
  const source = candidateRouteSource();

  assert.match(source, /const\s+extractionRequestId\s*=\s*randomUUID\(\)/);
  assert.match(
    source,
    /event:\s*"resume_extraction_completed"[\s\S]*request_id:\s*extractionRequestId/,
  );
  assert.match(
    source,
    /event:\s*"resume_extraction_failed"[\s\S]*request_id:\s*extractionRequestId/,
  );
});

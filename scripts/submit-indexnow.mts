import { submitIndexNowUrls } from "../lib/content/indexnow.ts";

const result = await submitIndexNowUrls();

console.log(
  JSON.stringify(
    {
      endpoint: result.endpoint,
      status: result.status,
      ok: result.ok,
      submittedUrlCount: result.submittedUrls.length,
      submittedUrls: result.submittedUrls,
      body: result.body,
    },
    null,
    2,
  ),
);

if (!result.ok) {
  process.exitCode = 1;
}

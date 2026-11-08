import { getContentQualityWarnings } from "../lib/content/quality.ts";

const warnings = getContentQualityWarnings();

if (warnings.length === 0) {
  console.log("Content quality warnings: none");
  process.exit(0);
}

console.warn(`Content quality warnings: ${warnings.length}`);
for (const warning of warnings) {
  console.warn(
    `- ${warning.contentType}/${warning.slug} ${warning.field}: ${warning.message}`,
  );
}

if (process.env.CONTENT_QUALITY_STRICT === "true") {
  process.exitCode = 1;
}

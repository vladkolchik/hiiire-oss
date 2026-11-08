import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("production Supabase store uses the expected Telegram tables and service-role client", () => {
  const source = readFileSync("src/supabase.ts", "utf8");

  assert.match(source, /createClient/);
  assert.match(source, /telegram_connect_tokens/);
  assert.match(source, /telegram_user_links/);
  assert.match(source, /onConflict:\s*"user_id"/);
  assert.match(source, /expires_at/);
  assert.match(source, /used_at/);
  assert.match(source, /\.is\("used_at", null\)/);
  assert.match(source, /\.gt\("expires_at", usedAt\)/);
  assert.match(source, /last_seen_at/);
});

test("production Supabase store provides WebSocket transport for Node 20 runtime", () => {
  const source = readFileSync("src/supabase.ts", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
  };

  assert.ok(packageJson.dependencies?.ws);
  assert.match(source, /from "ws"/);
  assert.match(source, /realtime:\s*\{[\s\S]*transport:\s*WebSocket/);
});

test("telegram relay Dockerfile builds and starts only the relay app", () => {
  const source = readFileSync("Dockerfile", "utf8");

  assert.match(source, /npm ci/);
  assert.match(source, /npm run build/);
  assert.match(source, /ENV PORT=8080/);
  assert.match(source, /EXPOSE 8080/);
  assert.match(source, /RUN apk add --no-cache curl/);
  assert.match(source, /HEALTHCHECK[\s\S]*curl -fsS http:\/\/127\.0\.0\.1:8080\/health \|\| exit 1/);
  assert.doesNotMatch(source, /node -e/);
  assert.match(source, /node dist\/src\/index\.js/);
  assert.doesNotMatch(source, /next start/);
  assert.doesNotMatch(source, /docker-compose/);
});

test("telegram relay package does not depend on the root web app", () => {
  const packageJson = readFileSync("package.json", "utf8");
  const packageLock = readFileSync("package-lock.json", "utf8");

  assert.doesNotMatch(packageJson, /"hiiire"\s*:\s*"file:\.\."/);
  assert.doesNotMatch(packageLock, /"hiiire"\s*:\s*"file:\.\."/);
  assert.doesNotMatch(packageLock, /node_modules\/hiiire/);
});

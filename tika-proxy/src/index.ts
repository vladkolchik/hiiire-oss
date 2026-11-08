import { loadConfig } from "./config.js";
import { logJson } from "./logger.js";
import { createTelemetry } from "./posthog.js";
import { buildServer } from "./server.js";

const config = loadConfig();
const telemetry = createTelemetry(config);
const server = buildServer({ config, telemetry });

async function shutdown(signal: string): Promise<void> {
  logJson("info", "tika_proxy_shutdown_started", {
    service: config.posthogServiceName,
    signal,
  });

  try {
    await server.close();
    await telemetry.shutdown();
    logJson("info", "tika_proxy_shutdown_completed", {
      service: config.posthogServiceName,
      signal,
    });
    process.exit(0);
  } catch (error) {
    logJson("error", "tika_proxy_shutdown_failed", {
      service: config.posthogServiceName,
      signal,
      error_kind: error instanceof Error && error.name ? error.name : "unknown",
    });
    process.exit(1);
  }
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

try {
  await server.listen({
    host: "0.0.0.0",
    port: config.port,
  });

  logJson("info", "tika_proxy_started", {
    service: config.posthogServiceName,
    port: config.port,
  });
} catch (error) {
  logJson("error", "tika_proxy_start_failed", {
    service: config.posthogServiceName,
    error_kind: error instanceof Error && error.name ? error.name : "unknown",
  });
  await telemetry.shutdown();
  process.exit(1);
}

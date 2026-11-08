import { PostHog } from "posthog-node";

import type { ProxyConfig } from "./config.js";
import { logJson, type SafeFields } from "./logger.js";

export type TikaProxyEventName =
  | "tika_proxy_request_completed"
  | "tika_proxy_request_failed"
  | "tika_proxy_request_rejected"
  | "tika_proxy_upstream_unavailable";

export type SafeTelemetryFields = SafeFields;

export type Telemetry = {
  capture(event: TikaProxyEventName, properties: SafeTelemetryFields): void;
  shutdown(): Promise<void>;
};

type PostHogClientWithShutdown = PostHog & {
  shutdown?: (shutdownTimeoutMs?: number) => void | Promise<void>;
  _shutdown?: (shutdownTimeoutMs?: number) => Promise<void>;
};

const POSTHOG_SHUTDOWN_TIMEOUT_MS = 2_000;

function getErrorKind(error: unknown): string {
  if (error instanceof TypeError) {
    return "type_error";
  }

  if (error instanceof Error && error.name) {
    return error.name;
  }

  return "unknown";
}

export function createTelemetry(config: ProxyConfig): Telemetry {
  if (!config.posthogKey) {
    return {
      capture: () => {},
      shutdown: async () => {},
    };
  }

  const client: PostHogClientWithShutdown = new PostHog(config.posthogKey, {
    host: config.posthogHost,
    enableExceptionAutocapture: false,
    flushAt: 1,
    flushInterval: 1_000,
    persistence: "memory",
    disableGeoip: true,
    disableSurveys: true,
  });

  return {
    capture(event, properties) {
      try {
        client.capture({
          distinctId: config.posthogServiceName,
          event,
          properties: {
            service: config.posthogServiceName,
            environment: config.nodeEnv,
            $process_person_profile: false,
            ...properties,
          },
        });
      } catch (error) {
        logJson("warn", "posthog_capture_failed", {
          error_kind: getErrorKind(error),
        });
      }
    },
    async shutdown() {
      try {
        if (typeof client.shutdown === "function") {
          await Promise.resolve(client.shutdown(POSTHOG_SHUTDOWN_TIMEOUT_MS));
          return;
        }

        if (typeof client._shutdown === "function") {
          await client._shutdown(POSTHOG_SHUTDOWN_TIMEOUT_MS);
        }
      } catch (error) {
        logJson("warn", "posthog_shutdown_failed", {
          error_kind: getErrorKind(error),
        });
      }
    },
  };
}

import { PostHog } from "posthog-node";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const serverDistinctId = "hiiire-server";

let posthogClient: PostHog | null | undefined;

type PostHogProperties = Record<string, unknown>;

export type ServerAnalyticsEvent = {
  event: string;
  distinctId?: string;
  properties?: PostHogProperties;
  groups?: Record<string, string>;
};

function getPostHogClient() {
  if (!posthogKey) {
    return null;
  }

  if (posthogClient === undefined) {
    posthogClient = new PostHog(posthogKey, {
      host: posthogHost,
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogClient;
}

function withServerDefaults(properties: PostHogProperties = {}) {
  return {
    "$process_person_profile": false,
    app: "hiiire",
    runtime: "server",
    environment: process.env.NODE_ENV ?? "unknown",
    ...properties,
  };
}

export async function captureServerEvent({
  event,
  distinctId = serverDistinctId,
  properties,
  groups,
}: ServerAnalyticsEvent) {
  const client = getPostHogClient();

  if (!client) {
    return;
  }

  await client.captureImmediate({
    distinctId,
    event,
    properties: withServerDefaults(properties),
    groups,
  });
}

export async function identifyServerGroup(input: {
  groupType?: "company";
  groupKey: string;
  distinctId?: string;
  properties?: PostHogProperties;
}) {
  const client = getPostHogClient();

  if (!client) {
    return;
  }

  client.groupIdentify({
    groupType: "company",
    groupKey: input.groupKey,
    distinctId: input.distinctId,
    properties: withServerDefaults(input.properties),
  });
}

export async function captureServerError(
  error: unknown,
  properties: PostHogProperties = {},
  distinctId = serverDistinctId,
) {
  const client = getPostHogClient();

  if (!client) {
    return;
  }

  await client.captureExceptionImmediate(
    error,
    distinctId,
    withServerDefaults({
      event_source: "next_on_request_error",
      ...properties,
    }),
  );
}

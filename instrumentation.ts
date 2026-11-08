import type { Instrumentation } from "next";

function getErrorDigest(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof error.digest === "string"
  ) {
    return error.digest;
  }

  return undefined;
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { captureServerError } = await import("@/lib/analytics/posthog-server");

  await captureServerError(error, {
    digest: getErrorDigest(error),
    method: request.method,
    path: request.path,
    router_kind: context.routerKind,
    route_path: context.routePath,
    route_type: context.routeType,
    render_source: context.renderSource,
    revalidate_reason: context.revalidateReason,
  });
};
